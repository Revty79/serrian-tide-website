import "server-only";
import {createHash} from "node:crypto";
import {and,eq,sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db";
import {worldTerrainRefinement} from "@/db/world-terrain-refinement-schema";
import {terrainMapContext} from "./terrain-map-context";
import {regionContainsFrame} from "./terrain-regions";
import {terrainGeometry,type TerrainGeometry,type TerrainTile} from "./terrain";
import {rootFrame,type TerrainFrame} from "./terrain-refinement";
import {hydroLayerSchema,EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {advancedProvenanceSchema,ADVANCED_TERRAIN_LIMITS,type AdvancedProvenance} from "./terrain-advanced-spec";
import {prepareAdvancedTerrainAsync,type AdvancedTerrainContext,type AuthoredVolcano} from "./terrain-advanced";
import {isProtected,type TerrainSource} from "./terrain-source";
import {readTerrainTile,type TerrainObject} from "./terrain-storage";
import {worldReadAccess,WorldError} from "./world-service";

type Connection=Pick<typeof db,"select"|"execute">;
type Reference=TerrainObject&{x:number;y:number;mask:string};
export type AdvancedContextPacket={
  pin:string;context:AdvancedTerrainContext;sourceId:string|null;sourceRevision:number;
  rootRevision:number;canEdit:boolean;
};
export async function advancedContextInTransaction(tx:Connection,worldId:string,mapId:string,sourceId?:string):Promise<AdvancedContextPacket>{
  const indexes=(await tx.execute<{root:string|null;detail:string|null}>(sql`select to_regclass('world_terrain_advanced_volcano_idx')::text as root,to_regclass('world_refinement_advanced_volcano_idx')::text as detail`)).rows[0];
  if(!indexes?.root||!indexes.detail)throw new WorldError("Advanced terrain tools require additive migration 0157. Existing terrain tools remain available.",409);
  const resolved=await terrainMapContext(tx,worldId,mapId),root=resolved.terrain,
    rootShape=terrainGeometry({gridWidth:root.gridWidth,gridHeight:root.gridHeight,widthKm:root.widthMetres/1000,heightKm:root.heightMetres/1000,wrap:root.wrap,minElevation:root.minElevation,maxElevation:root.maxElevation});
  let frame:TerrainFrame=rootFrame(rootShape),sourceRevision=root.revision;
  if(sourceId){
    z.uuid().parse(sourceId);
    const [surface]=await tx.select().from(worldTerrainRefinement).where(and(eq(worldTerrainRefinement.id,sourceId),eq(worldTerrainRefinement.terrainId,root.id),eq(worldTerrainRefinement.worldId,worldId)));
    if(!surface)throw new WorldError("This accepted terrain source is unavailable.",404);
    frame={x:surface.x,y:surface.y,width:surface.width,height:surface.height};sourceRevision=surface.revision;
    if(resolved.region&&!regionContainsFrame(resolved.region,frame,rootShape))throw new WorldError("Choose a numerical source wholly inside this region's accepted outline.",409);
  }else if(resolved.region)throw new WorldError("Regional numerical operations use an eligible finer source. Open Terrain detail or the parent World.",409);
  const waterRow=(await tx.execute<{revision:number;layer:unknown}>(sql`select revision,layer from world_hydrology where world_id=${worldId} and map_id=${resolved.sourceMapId}`)).rows[0],
    water=hydroLayerSchema.parse(waterRow?.layer??EMPTY_HYDROLOGY),
    sites=(await tx.execute<{id:string;x:number;y:number}>(sql`select p.id,p.x_metres as x,p.y_metres as y from world_map_place p where p.world_id=${worldId} and p.map_id=${resolved.sourceMapId} and p.removed_at is null order by p.id limit 8193`)).rows,
    rows=(await tx.execute<{id:string;revision:number;source_id:string|null;source:TerrainSource}>(sql`
      select id,revision,source_id,source from (
        select request_id id,revision,null::text source_id,source,created_at from world_terrain_version
          where terrain_id=${root.id} and world_id=${worldId} and source #>> '{advanced,operation,kind}'='volcano'
        union all
        select request_id id,revision,refinement_id source_id,source,created_at from world_terrain_refinement_version
          where terrain_id=${root.id} and world_id=${worldId} and source #>> '{advanced,operation,kind}'='volcano'
      ) v order by created_at desc,id limit ${ADVANCED_TERRAIN_LIMITS.volcanoes}
    `)).rows;
  const volcanoes:AuthoredVolcano[]=[];
  for(const r of rows)if(r.source.kind==="manual"&&r.source.advanced?.operation.kind==="volcano")volcanoes.push({
    id:r.id,revision:r.revision,sourceId:r.source_id,operation:r.source.advanced.operation,
  });
  const context:AdvancedTerrainContext={frame,world:{width:root.widthMetres,height:root.heightMetres,wrap:root.wrap},seaLevel:root.seaLevel,water,sites,volcanoes};
  const pin=createHash("sha256").update(JSON.stringify({terrain:root.id,frame,waterRevision:waterRow?.revision??0,sites,volcanoes})).digest("hex");
  return {pin,context,sourceId:sourceId??null,sourceRevision,rootRevision:root.revision,canEdit:true};
}
export async function getAdvancedTerrainContext(userId:string,worldId:string,mapId:string,sourceId?:string,options:{ordinary?:boolean;review?:boolean}={}){
  z.uuid().parse(mapId);const access=await worldReadAccess(userId,worldId,!!options.review);
  if(options.ordinary)throw new WorldError("This numerical authoring context is private.",404);
  return db.transaction(async tx=>({...await advancedContextInTransaction(tx,worldId,mapId,sourceId),canEdit:access.ownerId===userId&&!access.archivedAt&&!options.review}),{accessMode:"read only",isolationLevel:"repeatable read"});
}

/** Recompute under the existing owned-World write lock, before staging files.
 * Native revisions, regional guards and exact request receipts stay authoritative. */
export async function validateAdvancedAcceptance(
  tx:Connection,worldId:string,mapId:string,sourceId:string|undefined,provenance:AdvancedProvenance,
  shape:TerrainGeometry,baseElevation:number,references:Reference[],tiles:TerrainTile[],blocked?:Uint8Array|null,
){
  const intent=advancedProvenanceSchema.parse(provenance),packet=await advancedContextInTransaction(tx,worldId,mapId,sourceId);
  return validateAdvancedTerrainTiles(packet,intent,shape,baseElevation,references,tiles,blocked);
}
export async function validateAdvancedTerrainTiles(packet:AdvancedContextPacket,intent:AdvancedProvenance,shape:TerrainGeometry,baseElevation:number,references:Reference[],tiles:TerrainTile[],blocked?:Uint8Array|null){
  if(packet.pin!==intent.contextPin)throw new WorldError("Water, settlement supports or authored volcano context changed. Keep the proposal and preview against saved geography again.",409);
  const base=new Int16Array(shape.width*shape.height).fill(baseElevation),manual=new Uint8Array(base.length);
  for(let offset=0;offset<references.length;offset+=16)await Promise.all(references.slice(offset,offset+16).map(async ref=>{
    const values=await readTerrainTile(ref);
    for(let k=0;k<1024;k++){const i=(ref.y*32+(k>>5))*shape.width+ref.x*32+(k&31);base[i]=values[k];if(isProtected(ref.mask,k))manual[i]=1;}
  }));
  let result;
  try{result=await prepareAdvancedTerrainAsync(base,shape,intent.operation,packet.context,blocked??undefined,manual);}
  catch(error){throw new WorldError(error instanceof Error?error.message:"The numerical proposal is invalid.",400);}
  if(intent.effect.changed!==result.metrics.changed||intent.effect.affected.footprint||JSON.stringify(intent.effect.affected.frame)!==JSON.stringify(result.metrics.affected))throw new WorldError("The retained effect summary does not match this numerical proposal.",400);
  if(!result.metrics.changed)throw new WorldError("This proposal makes no eligible numerical changes. Revise it; nothing was accepted.",400);
  const submitted=new Set(tiles.map(t=>t.y*(shape.width/32)+t.x));
  for(const i of result.patch.indices)if(!submitted.has(Math.floor(i/shape.width/32)*(shape.width/32)+Math.floor(i%shape.width/32)))throw new WorldError("The submitted tiles omit part of this numerical proposal.",400);
  for(const tile of tiles)for(let k=0;k<1024;k++){
    const i=(tile.y*32+(k>>5))*shape.width+tile.x*32+(k&31);
    if(tile.samples[k]!==result.grid[i])throw new WorldError("The terrain tiles do not match the exact accepted advanced-operation parameters and saved sources.",400);
  }
  return result.metrics;
}

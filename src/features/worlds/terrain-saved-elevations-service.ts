import "server-only";
import {createHash} from "node:crypto";
import {and,desc,eq,sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db";
import {worldTerrainVersion} from "@/db/world-terrain-schema";
import {worldTerrainRefinement,worldTerrainRefinementVersion} from "@/db/world-terrain-refinement-schema";
import {terrainGeometry} from "./terrain";
import {overviewLevels,type RefinementMeta} from "./terrain-refinement";
import {refinementGeometryAtRevision} from "./terrain-refinement-geometry";
import {retainedRefinementPlacement} from "./terrain-refinement-expansion";
import {TERRAIN_REFINEMENT_LIMIT} from "./terrain-source-limits";
import {worldReadAccess,WorldError} from "./world-service";
import {worldContentEditor} from "./world-access-service";
import {terrainMapContext} from "./terrain-map-context";
import {terrainSourceState} from "./terrain-regions";
import {terrainRevisionHeads} from "./terrain-revisions-service";
import {readTerrainTile,type TerrainObject} from "./terrain-storage";
import {SAVED_ELEVATION_TILE_LIMIT,savedElevationListSchema,savedElevationPreviewSchema} from "./terrain-saved-elevations";

const unavailable=()=>new WorldError("Saved World elevations are unavailable in this view.",404);
type Ref=TerrainObject&{x:number;y:number};
/** Owner-only native recovery data. This service is read-only and can never
 * advance a source, restore a database or rewrite retained terrain history. */
export async function getSavedTerrainElevations(userId:string,worldId:string,mapId:string,targetRevision?:number,options:{ordinary?:boolean;review?:boolean;refinementId?:string}={}){
 z.uuid().parse(mapId);if(targetRevision!==undefined)z.number().int().positive().parse(targetRevision);
 if(options.refinementId!==undefined)z.uuid().parse(options.refinementId);
 if(options.ordinary||options.review)throw unavailable();
 const parent=await worldReadAccess(userId,worldId,false,"atlas");
 if(parent.ownerId!==userId||parent.archivedAt||!worldContentEditor(parent,userId))throw unavailable();
 return db.transaction(async tx=>{
  const context=await terrainMapContext(tx,worldId,mapId);if(context.region)throw unavailable();
  const t=context.terrain,
   fine=(await tx.execute<{id:string;revision:number}>(sql`select id,revision from world_terrain_refinement where terrain_id=${t.id} and world_id=${worldId} order by id limit ${TERRAIN_REFINEMENT_LIMIT+1}`)).rows;
  if(fine.length>TERRAIN_REFINEMENT_LIMIT)throw unavailable();
  const [surface]=options.refinementId?await tx.select().from(worldTerrainRefinement).where(and(eq(worldTerrainRefinement.id,options.refinementId),eq(worldTerrainRefinement.terrainId,t.id),eq(worldTerrainRefinement.worldId,worldId))):[];
  if(options.refinementId&&!surface)throw unavailable();
  const meta:RefinementMeta|undefined=surface?{id:surface.id,worldId,terrainId:t.id,mapId,name:surface.name,parentId:surface.parentId,parentRevision:surface.parentRevision,level:surface.level,revision:surface.revision,frame:{x:surface.x,y:surface.y,width:surface.width,height:surface.height},gridWidth:surface.gridWidth,gridHeight:surface.gridHeight,overviewLevels:overviewLevels(surface.gridWidth,surface.gridHeight),updatedAt:surface.updatedAt.toISOString()}:undefined,
   heads=await terrainRevisionHeads(tx,worldId,mapId),identity={worldId,mapId,terrainId:t.id,...meta?{refinementId:meta.id}:{},headRevision:meta?.revision??t.revision,sourceState:terrainSourceState(t.revision,fine),waterRevision:heads.water,width:meta?.gridWidth??t.gridWidth,height:meta?.gridHeight??t.gridHeight};
  if(targetRevision===undefined){
   const rows=meta?await tx.select({revision:worldTerrainRefinementVersion.revision,previousRevision:worldTerrainRefinementVersion.previousRevision,createdAt:worldTerrainRefinementVersion.createdAt,source:worldTerrainRefinementVersion.source}).from(worldTerrainRefinementVersion).where(and(eq(worldTerrainRefinementVersion.refinementId,meta.id),eq(worldTerrainRefinementVersion.terrainId,t.id),eq(worldTerrainRefinementVersion.worldId,worldId))).orderBy(desc(worldTerrainRefinementVersion.revision)).limit(50):await tx.select({revision:worldTerrainVersion.revision,previousRevision:worldTerrainVersion.previousRevision,createdAt:worldTerrainVersion.createdAt,source:worldTerrainVersion.source}).from(worldTerrainVersion).where(and(eq(worldTerrainVersion.terrainId,t.id),eq(worldTerrainVersion.worldId,worldId))).orderBy(desc(worldTerrainVersion.revision)).limit(50);
   return savedElevationListSchema.parse({...identity,versions:rows.map(v=>({revision:v.revision,previousRevision:v.previousRevision,createdAt:v.createdAt.toISOString(),kind:v.source.kind}))});
  }
  if(targetRevision>identity.headRevision)throw unavailable();
  const [target]=meta?await tx.select({revision:worldTerrainRefinementVersion.revision}).from(worldTerrainRefinementVersion).where(and(eq(worldTerrainRefinementVersion.refinementId,meta.id),eq(worldTerrainRefinementVersion.terrainId,t.id),eq(worldTerrainRefinementVersion.worldId,worldId),eq(worldTerrainRefinementVersion.revision,targetRevision))):await tx.select({revision:worldTerrainVersion.revision}).from(worldTerrainVersion).where(and(eq(worldTerrainVersion.terrainId,t.id),eq(worldTerrainVersion.worldId,worldId),eq(worldTerrainVersion.revision,targetRevision)));if(!target)throw unavailable();
  const refs=async(revision:number)=>meta?(await tx.execute<Ref>(sql`select distinct on(tile_y,tile_x) tile_x x,tile_y y,sha256,bytes,encoding from world_terrain_refinement_tile where refinement_id=${meta.id} and terrain_id=${t.id} and world_id=${worldId} and revision<=${revision} and lod=0 order by tile_y,tile_x,revision desc`)).rows:(await tx.execute<Ref>(sql`select distinct on(tile_y,tile_x) tile_x x,tile_y y,sha256,bytes,encoding from world_terrain_tile where terrain_id=${t.id} and world_id=${worldId} and revision<=${revision} and detail_level=0 order by tile_y,tile_x,revision desc`)).rows;
  const currentRefs=await refs(identity.headRevision),targetRefs=await refs(targetRevision),current=new Map(currentRefs.map(r=>[r.x+":"+r.y,r])),prior=new Map(targetRefs.map(r=>[r.x+":"+r.y,r])),blank=Buffer.alloc(2048);for(let i=0;i<1024;i++)blank.writeInt16LE(t.baseElevation,i*2);
  if(meta){
   const old=await refinementGeometryAtRevision(tx,meta,targetRevision),world=terrainGeometry({gridWidth:t.gridWidth,gridHeight:t.gridHeight,widthKm:t.widthMetres/1000,heightKm:t.heightMetres/1000,wrap:t.wrap,minElevation:t.minElevation,maxElevation:t.maxElevation}),offset=retainedRefinementPlacement(meta,old,world);
   if(offset.x%32||offset.y%32)throw new WorldError("Saved terrain coverage must align to retained native tiles. Nothing was restored.",400);
   const complete=(rows:Ref[],width:number,height:number)=>rows.length===width*height/1024&&new Set(rows.map(r=>r.x+":"+r.y)).size===rows.length&&rows.every(r=>Number.isInteger(r.x)&&Number.isInteger(r.y)&&r.x>=0&&r.y>=0&&r.x<width/32&&r.y<height/32);
   if(!complete(currentRefs,meta.gridWidth,meta.gridHeight)||!complete(targetRefs,old.gridWidth,old.gridHeight))throw new WorldError("Accepted terrain detail is incomplete. The current map and saved history are retained.",500);
   // Added coverage remains current; the existing retained-placement rule
   // positions only the complete older lattice inside the accepted extent.
   prior.clear();for(const[key,value]of current)prior.set(key,value);
   for(const ref of targetRefs){const x=ref.x+offset.x/32,y=ref.y+offset.y/32;prior.set(x+":"+y,{...ref,x,y});}
  }
  const blankHash=createHash("sha256").update(blank).digest("hex"),keys=[...new Set([...current.keys(),...prior.keys()])].filter(key=>(current.get(key)?.sha256??blankHash)!==(prior.get(key)?.sha256??blankHash));
  if(keys.length>SAVED_ELEVATION_TILE_LIMIT)throw new WorldError("That saved revision differs over too much terrain for one bounded comparison. Choose a more recent revision. The current World and all saved history are retained.",400);
  const tiles:{x:number;y:number;before:number[];after:number[]}[]=[];let changed=0;
  for(let offset=0;offset<keys.length;offset+=8){
   const batch=await Promise.all(keys.slice(offset,offset+8).map(async key=>{
    const now=current.get(key),old=prior.get(key),[x,y]=key.split(":").map(Number);
    if(x<0||y<0||x>=identity.width/32||y>=identity.height/32)throw unavailable();
    const [before,after]=await Promise.all([now?readTerrainTile(now):Promise.resolve(new Array<number>(1024).fill(t.baseElevation)),old?readTerrainTile(old):Promise.resolve(new Array<number>(1024).fill(t.baseElevation))]);
    return {x,y,before,after};
   }));
   for(const tile of batch){for(let i=0;i<1024;i++)if(tile.before[i]!==tile.after[i])changed++;tiles.push(tile);}
  }
  return savedElevationPreviewSchema.parse({...identity,targetRevision,changed,tiles});
 },{accessMode:"read only",isolationLevel:"repeatable read"});
}

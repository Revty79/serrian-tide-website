import "server-only";
import {and,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldAtlasMap} from "@/db/world-atlas-schema";
import {worldMapCanvas,worldTerrain} from "@/db/world-terrain-schema";
import {worldMapRegion} from "@/db/world-map-region-schema";
import {WorldError} from "./world-service";
import {validateRegionFrame,type TerrainRegion} from "./terrain-regions";

type Connection=Pick<typeof db,"select"|"execute">;
const unavailable=()=>new WorldError("This terrain map is unavailable.",404);
export async function regionsAvailable(tx:Connection){return !!(await tx.execute<{present:boolean}>(sql`select to_regclass('public.world_map_region') is not null as present`)).rows[0].present;}
/** Resolve from accepted database identities. Call only inside an authorized World transaction. */
export async function terrainMapContext(tx:Connection,worldId:string,mapId:string){
  const [row]=await tx.select({map:worldAtlasMap,canvas:worldMapCanvas,terrain:worldTerrain}).from(worldMapCanvas)
    .innerJoin(worldAtlasMap,and(eq(worldAtlasMap.id,worldMapCanvas.mapId),eq(worldAtlasMap.worldId,worldMapCanvas.worldId)))
    .innerJoin(worldTerrain,and(eq(worldTerrain.id,worldMapCanvas.terrainId),eq(worldTerrain.worldId,worldMapCanvas.worldId)))
    .where(and(eq(worldMapCanvas.worldId,worldId),eq(worldMapCanvas.mapId,mapId)));
  if(!row||row.map.archivedAt)throw unavailable();
  if(row.canvas.purpose==="world")return {...row,sourceMapId:mapId,region:undefined as TerrainRegion|undefined};
  if(row.canvas.purpose!=="regional"||!await regionsAvailable(tx))throw new WorldError("MIGRATION 0147 REQUIRED to open linked regional maps. Saved geography and drafts are retained.",409);
  const [link]=await tx.select().from(worldMapRegion).where(and(eq(worldMapRegion.mapId,mapId),eq(worldMapRegion.worldId,worldId)));
  if(!link||link.terrainId!==row.terrain.id)throw unavailable();
  const [parent]=await tx.select({map:worldAtlasMap,canvas:worldMapCanvas}).from(worldMapCanvas).innerJoin(worldAtlasMap,and(eq(worldAtlasMap.id,worldMapCanvas.mapId),eq(worldAtlasMap.worldId,worldMapCanvas.worldId))).where(and(eq(worldMapCanvas.mapId,link.parentMapId),eq(worldMapCanvas.worldId,worldId)));
  if(!parent||parent.map.archivedAt)throw new WorldError("The parent World map is archived or unavailable. Restore or open its accepted source before reopening this region. Your regional identity and drafts are retained.",409);
  if(parent.canvas.purpose!=="world"||parent.canvas.terrainId!==row.terrain.id||parent.map.scope!=="world"||parent.map.mapKind!=="generic"||row.map.scope!=="regional"||row.map.mapKind!=="generic")throw unavailable();
  const frame={x:link.x,y:link.y,width:link.width,height:link.height};validateRegionFrame(frame,{displayWidth:row.terrain.widthMetres,displayHeight:row.terrain.heightMetres,wrap:row.terrain.wrap});
  const region:TerrainRegion={version:1,revision:link.revision,mapId,parentMapId:link.parentMapId,parentName:parent.map.name,terrainId:link.terrainId,frame,initialSourceRevision:link.initialSourceRevision,initialSourceState:link.initialSourceState,initialParentRevision:link.initialParentRevision,sourceRevision:row.terrain.revision,parentRevision:parent.map.revision,createdAt:link.createdAt.toISOString(),createdBy:link.createdBy};
  return {...row,sourceMapId:link.parentMapId,region};
}
export async function geographicSourceMap(tx:Connection,worldId:string,mapId:string){return (await terrainMapContext(tx,worldId,mapId)).sourceMapId;}
export async function requireWorldGeographyWrite(tx:Connection,worldId:string,mapId:string){
  const context=await terrainMapContext(tx,worldId,mapId);
  if(context.region)throw new WorldError("This regional view inherits its geographic layers. Edit terrain base, water, environment, materials, artwork, labels and Town placements on its parent World map. Regional numerical detail uses Terrain detail; appearance saves remain local to this map.",409);
  return context;
}

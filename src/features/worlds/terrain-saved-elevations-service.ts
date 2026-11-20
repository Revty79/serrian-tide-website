import "server-only";
import {createHash} from "node:crypto";
import {and,desc,eq,sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db";
import {worldTerrainVersion} from "@/db/world-terrain-schema";
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
export async function getSavedTerrainElevations(userId:string,worldId:string,mapId:string,targetRevision?:number,options:{ordinary?:boolean;review?:boolean}={}){
 z.uuid().parse(mapId);if(targetRevision!==undefined)z.number().int().positive().parse(targetRevision);
 if(options.ordinary||options.review)throw unavailable();
 const parent=await worldReadAccess(userId,worldId,false,"atlas");
 if(parent.ownerId!==userId||parent.archivedAt||!worldContentEditor(parent,userId))throw unavailable();
 return db.transaction(async tx=>{
  const context=await terrainMapContext(tx,worldId,mapId);if(context.region)throw unavailable();
  const t=context.terrain,
   fine=(await tx.execute<{id:string;revision:number}>(sql`select id,revision from world_terrain_refinement where terrain_id=${t.id} and world_id=${worldId} order by id`)).rows,
   heads=await terrainRevisionHeads(tx,worldId,mapId),identity={worldId,mapId,terrainId:t.id,headRevision:t.revision,sourceState:terrainSourceState(t.revision,fine),waterRevision:heads.water,width:t.gridWidth,height:t.gridHeight};
  if(targetRevision===undefined){
   const rows=await tx.select({revision:worldTerrainVersion.revision,previousRevision:worldTerrainVersion.previousRevision,createdAt:worldTerrainVersion.createdAt,source:worldTerrainVersion.source}).from(worldTerrainVersion).where(and(eq(worldTerrainVersion.terrainId,t.id),eq(worldTerrainVersion.worldId,worldId))).orderBy(desc(worldTerrainVersion.revision)).limit(50);
   return savedElevationListSchema.parse({...identity,versions:rows.map(v=>({revision:v.revision,previousRevision:v.previousRevision,createdAt:v.createdAt.toISOString(),kind:v.source.kind}))});
  }
  if(targetRevision>t.revision)throw unavailable();
  const [target]=await tx.select({revision:worldTerrainVersion.revision}).from(worldTerrainVersion).where(and(eq(worldTerrainVersion.terrainId,t.id),eq(worldTerrainVersion.worldId,worldId),eq(worldTerrainVersion.revision,targetRevision)));if(!target)throw unavailable();
  const refs=async(revision:number)=>(await tx.execute<Ref>(sql`select distinct on(tile_y,tile_x) tile_x x,tile_y y,sha256,bytes,encoding from world_terrain_tile where terrain_id=${t.id} and world_id=${worldId} and revision<=${revision} and detail_level=0 order by tile_y,tile_x,revision desc`)).rows;
  const currentRefs=await refs(t.revision),targetRefs=await refs(targetRevision),current=new Map(currentRefs.map(r=>[r.x+":"+r.y,r])),prior=new Map(targetRefs.map(r=>[r.x+":"+r.y,r])),blank=Buffer.alloc(2048);for(let i=0;i<1024;i++)blank.writeInt16LE(t.baseElevation,i*2);
  const blankHash=createHash("sha256").update(blank).digest("hex"),keys=[...new Set([...current.keys(),...prior.keys()])].filter(key=>(current.get(key)?.sha256??blankHash)!==(prior.get(key)?.sha256??blankHash));
  if(keys.length>SAVED_ELEVATION_TILE_LIMIT)throw new WorldError("That saved revision differs over too much terrain for one bounded comparison. Choose a more recent revision. The current World and all saved history are retained.",400);
  const tiles:{x:number;y:number;before:number[];after:number[]}[]=[];let changed=0;
  for(let offset=0;offset<keys.length;offset+=8){
   const batch=await Promise.all(keys.slice(offset,offset+8).map(async key=>{
    const now=current.get(key),old=prior.get(key),[x,y]=key.split(":").map(Number);
    if(x<0||y<0||x>=t.gridWidth/32||y>=t.gridHeight/32)throw unavailable();
    const [before,after]=await Promise.all([now?readTerrainTile(now):Promise.resolve(new Array<number>(1024).fill(t.baseElevation)),old?readTerrainTile(old):Promise.resolve(new Array<number>(1024).fill(t.baseElevation))]);
    return {x,y,before,after};
   }));
   for(const tile of batch){for(let i=0;i<1024;i++)if(tile.before[i]!==tile.after[i])changed++;tiles.push(tile);}
  }
  return savedElevationPreviewSchema.parse({...identity,targetRevision,changed,tiles});
 },{accessMode:"read only",isolationLevel:"repeatable read"});
}

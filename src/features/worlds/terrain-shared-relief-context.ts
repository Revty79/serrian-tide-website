import "server-only";
import {createHash} from "node:crypto";
import {and,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldTerrainRefinement as details} from "@/db/world-terrain-refinement-schema";
import {terrainGeometry} from "./terrain";
import {advancedContextInTransaction} from "./terrain-advanced-service";
import {requireWorldGeographyWrite} from "./terrain-map-context";
import {frameContains,frameGeometry,overviewLevels,rootFrame,REFINEMENT_LIMIT,type RefinementMeta} from "./terrain-refinement";
import {refinementGeometryAtRevision} from "./terrain-refinement-geometry";
import {samplePinnedTerrainPoint,type NumericalSampleSource} from "./terrain-numerical-sampling";
import {readTerrainTile,type TerrainObject} from "./terrain-storage";
import {createTerrainTileReferenceCache} from "./terrain-tile-reference-cache";
import {isProtected} from "./terrain-source";
import {sharedReliefSnapshotSchema,type SharedReliefSnapshot} from "./terrain-shared-relief-spec";
import type {SharedReliefPlan} from "./terrain-shared-relief";
import type {SharedCoastSource} from "./terrain-shared-relief-coast";
import {WorldError} from "./world-errors";

export type SharedReliefConnection=Pick<typeof db,"select"|"execute">;
export type SharedReliefReference=TerrainObject&{x:number;y:number;mask:string};
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value;}
export const sharedReliefHash=(value:unknown)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const unavailable=()=>new WorldError("The retained numerical source is unavailable. Keep the draft and restore its paired terrain backup.",409);
function lruSet<K,V>(map:Map<K,V>,key:K,value:V,limit:number){map.delete(key);map.set(key,value);while(map.size>limit)map.delete(map.keys().next().value!);return value;}

/** Private, immutable accepted inputs. Numerical tiles are verified lazily in
 * bounded caches; this never constructs a whole high-resolution source grid. */
export async function sharedReliefContext(tx:SharedReliefConnection,worldId:string,mapId:string){
 const capability=(await tx.execute<{available:boolean}>(sql`select to_regprocedure('public.world_native_shared_relief_schema()') is not null as available`)).rows[0];
 if(!capability?.available)throw new WorldError("Shared relief requires additive migration 0165. Saved geography and ordinary tools remain available.",409);
 const root=await requireWorldGeographyWrite(tx,worldId,mapId),t=root.terrain,
  shape=terrainGeometry({gridWidth:t.gridWidth,gridHeight:t.gridHeight,widthKm:t.widthMetres/1000,heightKm:t.heightMetres/1000,wrap:t.wrap,minElevation:t.minElevation,maxElevation:t.maxElevation}),
  rows=await tx.select().from(details).where(and(eq(details.terrainId,t.id),eq(details.worldId,worldId))).limit(REFINEMENT_LIMIT+1);
 if(rows.length>REFINEMENT_LIMIT)throw new WorldError("The accepted terrain-source index exceeds its supported bound.",409);
 rows.sort((a,b)=>a.level-b.level||a.id.localeCompare(b.id));
 const metas=new Map(rows.map(s=>[s.id,{id:s.id,terrainId:t.id,worldId,mapId,name:s.name,parentId:s.parentId,parentRevision:s.parentRevision,level:s.level,revision:s.revision,
  frame:{x:s.x,y:s.y,width:s.width,height:s.height},gridWidth:s.gridWidth,gridHeight:s.gridHeight,overviewLevels:overviewLevels(s.gridWidth,s.gridHeight),updatedAt:s.updatedAt.toISOString()} satisfies RefinementMeta]));
 const hashes=(await tx.execute<{id:string;content_hash:string}>(sql`
  select v.terrain_id id,v.content_hash from world_terrain_version v where v.terrain_id=${t.id} and v.world_id=${worldId} and v.revision=${t.revision}
  union all select v.refinement_id id,v.content_hash from world_terrain_refinement_version v join world_terrain_refinement s on s.id=v.refinement_id and s.terrain_id=v.terrain_id and s.world_id=v.world_id and s.revision=v.revision where s.terrain_id=${t.id} and s.world_id=${worldId}
 `)).rows,hashById=new Map(hashes.map(h=>[h.id,h.content_hash]));
 const snapshots:SharedReliefSnapshot[]=[{id:t.id,revision:t.revision,parentId:null,parentRevision:null,level:0,frame:rootFrame(shape),columns:shape.width,rows:shape.height,contentHash:hashById.get(t.id)!},
  ...[...metas.values()].map(m=>({id:m.id,revision:m.revision,parentId:m.parentId,parentRevision:m.parentRevision,level:m.level,frame:m.frame,columns:m.gridWidth,rows:m.gridHeight,contentHash:hashById.get(m.id)!}))].map(s=>sharedReliefSnapshotSchema.parse(s));
 const sources:SharedCoastSource[]=[{id:null,revision:t.revision,level:0,shape,frame:rootFrame(shape)},...[...metas.values()].map(m=>({id:m.id,revision:m.revision,level:m.level,shape:frameGeometry(m,shape),frame:m.frame}))],
  advanced=await advancedContextInTransaction(tx,worldId,mapId),pinForSnapshots=(state:SharedReliefSnapshot[])=>sharedReliefHash({terrainId:t.id,shape,seaLevel:t.seaLevel,baseElevation:t.baseElevation,snapshots:state,advancedPin:advanced.pin}),pin=pinForSnapshots(snapshots);
 const decoded=new Map<string,Int16Array>();
 let queryTail:Promise<unknown>=Promise.resolve();
 const serialQuery=<T>(run:()=>Promise<T>):Promise<T>=>{const result=queryTail.then(run);queryTail=result.catch(()=>{});return result;};
 const read=async(ref:TerrainObject)=>{const hit=decoded.get(ref.sha256);if(hit){lruSet(decoded,ref.sha256,hit,128);return hit;}return lruSet(decoded,ref.sha256,Int16Array.from(await readTerrainTile(ref)),128);};
 const cachedReference=createTerrainTileReferenceCache<SharedReliefReference>((id,revision,x,y,size)=>serialQuery(async()=>id===t.id?
  (await tx.execute<SharedReliefReference>(sql`select distinct on(tile_y,tile_x) tile_x x,tile_y y,sha256,bytes,encoding,manual_protection mask from world_terrain_tile where terrain_id=${t.id} and world_id=${worldId} and revision<=${revision} and detail_level=0 and tile_x>=${x} and tile_x<${x+size} and tile_y>=${y} and tile_y<${y+size} order by tile_y,tile_x,revision desc`)).rows:
  (await tx.execute<SharedReliefReference>(sql`select distinct on(tile_y,tile_x) tile_x x,tile_y y,sha256,bytes,encoding,manual_protection mask from world_terrain_refinement_tile where terrain_id=${t.id} and world_id=${worldId} and refinement_id=${id} and revision<=${revision} and lod=0 and tile_x>=${x} and tile_x<${x+size} and tile_y>=${y} and tile_y<${y+size} order by tile_y,tile_x,revision desc`)).rows));
 const reference=async(id:string,revision:number,x:number,y:number)=>{const result=await cachedReference(id,revision,x,y);if(!result&&id!==t.id)throw unavailable();return result;};
 const numerical=new Map<string,Promise<NumericalSampleSource>>();
 const load=(id:string,revision:number):Promise<NumericalSampleSource>=>{
  const key=`${id}:${revision}`;let pending=numerical.get(key);if(pending)return pending;
  pending=(async()=>{
   if(id===t.id){const exists=(await tx.execute<{present:boolean}>(sql`select exists(select 1 from world_terrain_version where terrain_id=${t.id} and world_id=${worldId} and revision=${revision}) present`)).rows[0];if(!exists.present)throw unavailable();}
   const current=id===t.id?undefined:metas.get(id);if(id!==t.id&&!current)throw unavailable();
   if(current&&(revision<1||revision>current.revision))throw unavailable();
   const m=current?await refinementGeometryAtRevision(tx,current,revision):undefined,geometry=m?frameGeometry(m,shape):shape;
   return {id,revision,parentId:m?m.parentId??t.id:null,parentRevision:m?.parentRevision??null,shape:geometry,frame:m?.frame??rootFrame(shape),at:async(x:number,y:number)=>{
    if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=geometry.width||y>=geometry.height)throw unavailable();
    const ref=await reference(id,revision,Math.floor(x/32),Math.floor(y/32));return ref?(await read(ref))[y%32*32+x%32]:t.baseElevation;
   }};
  })();numerical.set(key,pending);return pending;
 };
 const sample=async(point:{x:number;y:number})=>{
  const source=[...sources].reverse().find(s=>s.id!==null&&frameContains(s.frame,point,shape.displayWidth,shape.wrap))??sources[0];
  return samplePinnedTerrainPoint(point,source.id??t.id,source.revision,shape,load);
 };
 const readWindow=async(plan:SharedReliefPlan)=>{
  const w=plan.window,base=new Int16Array(w.width*w.height).fill(t.baseElevation),manual=new Uint8Array(base.length),refs:SharedReliefReference[]=[];
  for(let y=w.y/32;y<(w.y+w.height)/32;y++)for(let x=w.x/32;x<(w.x+w.width)/32;x++){
   const ref=await reference(plan.source.id??t.id,plan.source.revision,x,y);if(!ref)continue;refs.push(ref);const values=await read(ref);
   for(let n=0;n<1024;n++){const i=(y*32+Math.floor(n/32)-w.y)*w.width+x*32+n%32-w.x;base[i]=values[n];if(isProtected(ref.mask,n))manual[i]=1;}
  }
  return {base,manual,refs};
 };
 return {root,shape,metas,sources,snapshots,pin,pinForSnapshots,context:advanced.context,load,read,reference,readWindow,sample};
}
export type SharedReliefContext=Awaited<ReturnType<typeof sharedReliefContext>>;

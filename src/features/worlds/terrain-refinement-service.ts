import "server-only";
import {createHash} from "node:crypto";
import {and,desc,eq,sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db";
import {worldAtlasMap} from "@/db/world-atlas-schema";
import {worldMapCanvas,worldTerrain,worldTerrainVersion} from "@/db/world-terrain-schema";
import {worldTerrainRefinement as surfaces,worldTerrainRefinementVersion as versions,worldTerrainRefinementTile as tileRows} from "@/db/world-terrain-refinement-schema";
import {WorldError,worldReadAccess,worldWriteTransaction} from "./world-service";
import {terrainCommandSchema,terrainGeometry,type TerrainGeometry,type TerrainTile} from "./terrain";
import {EMPTY_PROTECTION,isProtected,protectSamples,type TerrainSource} from "./terrain-source";
import {validateGenerationAcceptance} from "./terrain-generation-acceptance";
import {readTerrainTile,stageTerrainTiles,type TerrainObject} from "./terrain-storage";
import {REFINEMENT_DEPTH,REFINEMENT_LIMIT,frameContains,frameLocalPoint,frameGeometry,framesOverlap,gridTile,initializeRefinement,isRefinementBoundary,lodGeometry,normalizeTerrainX,overviewLevels,overviewTile,refinementCreateSchema,rootFrame,terrainEditMask,validateRefinement,type RefinementMeta,type TerrainFrame} from "./terrain-refinement";

type Tx=Parameters<Parameters<typeof worldWriteTransaction>[2]>[0];
type Connection=Pick<typeof db,"select"|"execute">;
type Surface=typeof surfaces.$inferSelect;
type TileReference=TerrainObject&{x:number;y:number;lod:number;mask:string};
type Root=Awaited<ReturnType<typeof rootContext>>;
const unavailable=()=>new WorldError("This terrain detail is unavailable.",404);
const stale=()=>new WorldError("A newer terrain detail was accepted. Your draft is retained; load the accepted version to compare before retrying.",409);
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const gridHash=(g:Int16Array)=>{const bytes=Buffer.alloc(g.length*2);for(let i=0;i<g.length;i++)bytes.writeInt16LE(g[i],i*2);return createHash("sha256").update(bytes).digest("hex");};
const coordinate=(x:number,y:number)=>`${x}:${y}`;

export async function refinementSchemaAvailable(tx:Connection){return !!(await tx.execute<{available:boolean}>(sql`SELECT to_regclass('public.world_terrain_refinement') IS NOT NULL AS available`)).rows[0].available;}
async function rootContext(tx:Connection,worldId:string,mapId:string){
 const [row]=await tx.select({terrain:worldTerrain,map:worldAtlasMap}).from(worldMapCanvas).innerJoin(worldTerrain,and(eq(worldTerrain.id,worldMapCanvas.terrainId),eq(worldTerrain.worldId,worldMapCanvas.worldId))).innerJoin(worldAtlasMap,and(eq(worldAtlasMap.id,worldMapCanvas.mapId),eq(worldAtlasMap.worldId,worldMapCanvas.worldId))).where(and(eq(worldMapCanvas.worldId,worldId),eq(worldMapCanvas.mapId,mapId)));
 if(!row||row.map.archivedAt)throw unavailable();
 const t=row.terrain,settings={gridWidth:t.gridWidth,gridHeight:t.gridHeight,widthKm:t.widthMetres/1000,heightKm:t.heightMetres/1000,wrap:t.wrap,minElevation:t.minElevation,maxElevation:t.maxElevation};
 return {...row,settings,shape:terrainGeometry(settings)};
}
const metadata=(s:Surface,mapId:string):RefinementMeta=>({id:s.id,worldId:s.worldId,terrainId:s.terrainId,mapId,name:s.name,parentId:s.parentId,parentRevision:s.parentRevision,level:s.level,revision:s.revision,frame:{x:s.x,y:s.y,width:s.width,height:s.height},gridWidth:s.gridWidth,gridHeight:s.gridHeight,overviewLevels:overviewLevels(s.gridWidth,s.gridHeight),updatedAt:s.updatedAt.toISOString()});
async function references(tx:Connection,terrainId:string,id:string|null,revision:number,lod=0):Promise<TileReference[]>{
 return id?(await tx.execute<TileReference>(sql`SELECT DISTINCT ON (lod,tile_x,tile_y) lod,tile_x AS x,tile_y AS y,sha256,bytes,encoding,manual_protection AS mask FROM world_terrain_refinement_tile WHERE refinement_id=${id} AND terrain_id=${terrainId} AND revision<=${revision} AND lod=${lod} ORDER BY lod,tile_x,tile_y,revision DESC`)).rows:
 (await tx.execute<TileReference>(sql`SELECT DISTINCT ON (tile_x,tile_y) 0 AS lod,tile_x AS x,tile_y AS y,sha256,bytes,encoding,manual_protection AS mask FROM world_terrain_tile WHERE terrain_id=${terrainId} AND revision<=${revision} AND detail_level=0 ORDER BY tile_x,tile_y,revision DESC`)).rows;
}
function tileReader(){const cache=new Map<string,Promise<number[]>>();return (ref:TerrainObject)=>{let value=cache.get(ref.sha256);if(!value){value=readTerrainTile(ref);cache.set(ref.sha256,value);}return value;};}
async function readGrid(tx:Connection,root:Root,surface:Surface|null,revision:number){
 const shape=surface?frameGeometry(metadata(surface,root.map.id),root.shape):root.shape,grid=new Int16Array(shape.width*shape.height).fill(root.terrain.baseElevation),refs=await references(tx,root.terrain.id,surface?.id??null,revision),read=tileReader();
 if(surface&&refs.length!==shape.width*shape.height/1024)throw new WorldError("Accepted terrain detail is incomplete. Retain your draft and restore its paired database/tile backup.",500);
 for(let offset=0;offset<refs.length;offset+=16)await Promise.all(refs.slice(offset,offset+16).map(async ref=>{const samples=await read(ref);for(let y=0;y<32;y++)grid.set(samples.slice(y*32,y*32+32),(ref.y*32+y)*shape.width+ref.x*32);}));
 return {grid,shape,frame:surface?metadata(surface,root.map.id).frame:rootFrame(root.shape)};
}
async function surfaceOf(tx:Connection,root:Root,id:string){const [surface]=await tx.select().from(surfaces).where(and(eq(surfaces.id,id),eq(surfaces.terrainId,root.terrain.id),eq(surfaces.worldId,root.terrain.worldId)));if(!surface)throw unavailable();return surface;}

export async function getRefinementEditMask(tx:Connection,terrainId:string,shape:TerrainGeometry,frame:TerrainFrame,world:TerrainGeometry,parentId:string|null=null){
 if(!await refinementSchemaAvailable(tx))return null;
 const children=await tx.select().from(surfaces).where(and(eq(surfaces.terrainId,terrainId),parentId===null?sql`${surfaces.parentId} IS NULL`:eq(surfaces.parentId,parentId)));
 return children.length||parentId?terrainEditMask(shape,frame,children.map(s=>metadata(s,"")),world,!!parentId):null;
}

/** Metadata only: numerical objects are always fetched in bounded, pinned batches. */
export async function getRefinements(userId:string,worldId:string,mapId:string,options:{review?:boolean;ordinary?:boolean}={}){
 z.uuid().parse(mapId);const access=await worldReadAccess(userId,worldId,!!options.review);if(options.ordinary)throw unavailable();
 return db.transaction(async tx=>{const root=await rootContext(tx,worldId,mapId),available=await refinementSchemaAvailable(tx),rows=available?await tx.select().from(surfaces).where(eq(surfaces.terrainId,root.terrain.id)).limit(REFINEMENT_LIMIT+1):[];if(rows.length>REFINEMENT_LIMIT)throw new WorldError("Terrain detail exceeds the supported index bound.",500);return {available,refinements:rows.map(s=>metadata(s,mapId)),rootRevision:root.terrain.revision,seaLevel:root.terrain.seaLevel,canEdit:access.ownerId===userId&&!access.archivedAt&&!options.review};},{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function getRefinementTiles(userId:string,worldId:string,mapId:string,id:string,raw:{revision?:number;historical?:boolean;lod:number;keys:number[]},options:{review?:boolean;ordinary?:boolean}={}){
 z.uuid().parse(id);z.uuid().parse(mapId);const request=z.object({historical:z.boolean().optional(),revision:z.number().int().positive().optional(),lod:z.number().int().min(0).max(5),keys:z.array(z.number().int().min(0).max(1023)).min(1).max(64).refine(a=>new Set(a).size===a.length)}).strict().parse(raw),access=await worldReadAccess(userId,worldId,!!options.review);if(options.ordinary)throw unavailable();
 return db.transaction(async tx=>{const root=await rootContext(tx,worldId,mapId),surface=await surfaceOf(tx,root,id),meta=metadata(surface,mapId),revision=request.revision??meta.revision;if(revision>meta.revision||request.lod>meta.overviewLevels)throw unavailable();const shape=lodGeometry(frameGeometry(meta,root.shape),request.lod),columns=shape.width/32;if(request.keys.some(k=>k>=shape.width*shape.height/1024))throw new WorldError("Choose tiles inside this terrain detail level.",400);
  const [version]=await tx.select().from(versions).where(and(eq(versions.refinementId,id),eq(versions.revision,revision)));if(!version)throw unavailable();const refs=new Map((await references(tx,root.terrain.id,id,revision,request.lod)).map(r=>[r.y*columns+r.x,r])),read=tileReader(),tiles=[];
  for(let offset=0;offset<request.keys.length;offset+=8)tiles.push(...await Promise.all(request.keys.slice(offset,offset+8).map(async key=>{const ref=refs.get(key);if(!ref)throw new WorldError("An accepted numerical tile is missing. Restore the paired terrain backup.",500);return {x:ref.x,y:ref.y,samples:await read(ref),sha256:ref.sha256,mask:ref.mask};})));
  const [historicalRoot]=request.historical?await tx.select({seaLevel:worldTerrainVersion.seaLevel}).from(worldTerrainVersion).where(and(eq(worldTerrainVersion.terrainId,root.terrain.id),eq(worldTerrainVersion.revision,version.rootRevision))):[];
  return {refinement:{...meta,revision},headRevision:meta.revision,tiles,lod:request.lod,source:version.source,acceptedRequestId:version.requestId,rootRevision:root.terrain.revision,seaLevel:historicalRoot?.seaLevel??root.terrain.seaLevel,rootRevisionAtSave:version.rootRevision,canEdit:!request.historical&&request.lod===0&&revision===meta.revision&&access.ownerId===userId&&!access.archivedAt&&!options.review};
 },{isolationLevel:"repeatable read",accessMode:"read only"});
}

/** Only modified tiles and their numerical overview ancestors are published. */
async function publishPyramid(tx:Tx,root:Root,meta:RefinementMeta,requestId:string,revision:number,tiles:TerrainTile[],masks:Map<string,string>,previousRevision:number){
 const pending:{lod:number;tile:TerrainTile;mask:string}[]=[],read=tileReader();let changed=new Map(tiles.map(t=>[coordinate(t.x,t.y),t]));
 for(let lod=0;lod<=meta.overviewLevels;lod++){
  for(const tile of changed.values())pending.push({lod,tile,mask:lod===0?masks.get(coordinate(tile.x,tile.y))??EMPTY_PROTECTION:EMPTY_PROTECTION});
  if(lod===meta.overviewLevels)break;
  const previous=new Map((previousRevision?await references(tx,root.terrain.id,meta.id,previousRevision,lod):[]).map(r=>[coordinate(r.x,r.y),r])),parents=new Set([...changed.values()].map(t=>coordinate(Math.floor(t.x/2),Math.floor(t.y/2)))),next=new Map<string,TerrainTile>();
  for(const parent of parents){const [x,y]=parent.split(":").map(Number),children=new Map<string,number[]>();await Promise.all([0,1,2,3].map(async n=>{const key=coordinate(x*2+n%2,y*2+Math.floor(n/2)),tile=changed.get(key),ref=previous.get(key);if(!tile&&!ref)throw new WorldError("The overview's accepted source tile is missing.",500);children.set(key,tile?.samples??await read(ref!));}));next.set(parent,overviewTile(x,y,children));}changed=next;
 }
 const objects=await stageTerrainTiles(requestId,root.terrain.worldId,meta.id,pending.map(p=>p.tile));
 for(let offset=0;offset<objects.length;offset+=128)await tx.insert(tileRows).values(objects.slice(offset,offset+128).map((object,n)=>({refinementId:meta.id,terrainId:root.terrain.id,worldId:root.terrain.worldId,revision,...object,lod:pending[offset+n].lod,manualProtection:pending[offset+n].mask})));
}

export async function createRefinement(userId:string,worldId:string,raw:unknown){
 const command=refinementCreateSchema.parse(raw),contentHash=hash(command);
 return worldWriteTransaction(userId,worldId,async tx=>{const root=await rootContext(tx,worldId,command.mapId);if(!await refinementSchemaAvailable(tx))throw new WorldError("Terrain detail is awaiting a database upgrade.",503);
  const [retry]=await tx.select().from(versions).where(eq(versions.requestId,command.requestId));if(retry){if(retry.contentHash!==contentHash||retry.terrainId!==root.terrain.id||retry.worldId!==worldId)throw stale();return {id:command.mapId,refinementId:retry.refinementId,revision:retry.revision};}
  const all=await tx.select().from(surfaces).where(eq(surfaces.terrainId,root.terrain.id));if(all.length>=REFINEMENT_LIMIT)throw new WorldError("This terrain has reached its supported 128 refined areas.",400);const parent=command.parentId?await surfaceOf(tx,root,command.parentId):null,parentRevision=parent?.revision??root.terrain.revision;if(parentRevision!==command.parentRevision)throw stale();if((parent?.level??0)>=REFINEMENT_DEPTH)throw new WorldError("This terrain has reached the supported nesting depth of eight.",400);
  const inherited=await readGrid(tx,root,parent,command.parentRevision);try{validateRefinement(command.frame,command.gridWidth,command.gridHeight,inherited.shape,inherited.frame,root.shape);}catch(e){throw new WorldError(e instanceof Error?e.message:"Check the refinement bounds.",400);}
  if(all.some(s=>s.parentId===command.parentId&&framesOverlap(metadata(s,command.mapId).frame,command.frame,root.shape.displayWidth,root.shape.wrap)))throw new WorldError("This coverage overlaps another area at the same level. Select that area as parent for finer detail, or choose adjacent coverage.",409);
  const grid=initializeRefinement(inherited.grid,inherited.shape,inherited.frame,command.frame,command.gridWidth,command.gridHeight,root.shape);if(gridHash(grid)!==command.previewHash)throw new WorldError("The accepted parent no longer matches this preview. Retain the boundaries and prepare the preview again.",409);
  const frame=command.frame,[surface]=await tx.insert(surfaces).values({id:command.requestId,worldId,terrainId:root.terrain.id,parentId:command.parentId,parentRevision:command.parentRevision,level:(parent?.level??0)+1,name:command.name,x:frame.x,y:frame.y,width:frame.width,height:frame.height,gridWidth:command.gridWidth,gridHeight:command.gridHeight,creationHash:contentHash}).returning(),meta=metadata(surface,command.mapId),tiles:TerrainTile[]=[],masks=new Map<string,string>();
  await tx.insert(versions).values({refinementId:meta.id,terrainId:root.terrain.id,worldId,revision:1,previousRevision:null,parentRevision:command.parentRevision,rootRevision:root.terrain.revision,requestId:command.requestId,contentHash,source:{kind:"manual"},authorId:userId});
  for(let y=0;y<command.gridHeight/32;y++)for(let x=0;x<command.gridWidth/32;x++){tiles.push(gridTile(grid,command.gridWidth,x,y));const boundary:number[]=[];for(let n=0;n<1024;n++)if(isRefinementBoundary(x*32+n%32,y*32+Math.floor(n/32),command.gridWidth,command.gridHeight))boundary.push(n);masks.set(coordinate(x,y),protectSamples(EMPTY_PROTECTION,boundary));}
  await publishPyramid(tx,root,meta,command.requestId,1,tiles,masks,0);return {id:command.mapId,refinementId:meta.id,revision:1};
 });
}

export async function saveRefinement(userId:string,worldId:string,id:string,raw:unknown){
 z.uuid().parse(id);const command=terrainCommandSchema.parse(raw);if(command.action!=="save")throw new WorldError("Accept a refinement through its preview workflow.",400);
 return worldWriteTransaction(userId,worldId,async tx=>{const root=await rootContext(tx,worldId,command.mapId),surface=await surfaceOf(tx,root,id),meta=metadata(surface,command.mapId),tiles=[...command.tiles].sort((a,b)=>a.y-b.y||a.x-b.x),contentHash=hash({refinementId:id,...command,tiles}),[retry]=await tx.select().from(versions).where(eq(versions.requestId,command.requestId));if(retry){if(retry.refinementId!==id||retry.contentHash!==contentHash||retry.worldId!==worldId)throw stale();return {id:command.mapId,refinementId:id,revision:retry.revision};}if(surface.revision!==command.revision)throw stale();
  if(command.seaLevel!==root.terrain.seaLevel)throw new WorldError("Sea level belongs to the whole World. Reload its current setting before saving this retained detail draft.",409);
  const shape=frameGeometry(meta,root.shape),mask=await getRefinementEditMask(tx,root.terrain.id,shape,meta.frame,root.shape,id),source:TerrainSource=command.source??{kind:"manual"},before=new Map((await references(tx,root.terrain.id,id,surface.revision)).map(r=>[coordinate(r.x,r.y),r])),read=tileReader(),masks=new Map<string,string>();let changed=0;
  try{validateGenerationAcceptance(shape,source,command.seaLevel,{x:meta.frame.x,y:meta.frame.y,periodX:root.shape.wrap?root.shape.displayWidth:null});}catch(e){throw new WorldError(e instanceof Error?e.message:"Check the physical generation proposal.",400);}
  if(source.kind==="regenerated"&&(source.area.x+source.area.width>shape.width||source.area.y+source.area.height>shape.height))throw new WorldError("Keep selected regeneration inside the active detail grid.",400);
  for(const tile of tiles){if(tile.x>=shape.width/32||tile.y>=shape.height/32||tile.samples.some(z=>z<shape.min||z>shape.max))throw new WorldError("This edit is outside the active refinement's numerical grid or height range.",400);const ref=before.get(coordinate(tile.x,tile.y));if(!ref)throw unavailable();const old=await read(ref),indices:number[]=[];
   for(let n=0;n<1024;n++)if(tile.samples[n]!==old[n]){const x=tile.x*32+n%32,y=tile.y*32+Math.floor(n/32);if(mask?.[y*shape.width+x])throw new WorldError("The inherited boundary and finer child coverage are protected. Sculpt inside this area's collar or edit the finer source; the retained draft was not accepted.",409);if(source.kind==="regenerated"){const a=source.area;if(x<a.x||x>=a.x+a.width||y<a.y||y>=a.y+a.height||source.preserveManual&&isProtected(ref.mask,n))throw new WorldError("This proposal changes samples outside its selected area or replaces protected manual detail.",400);}indices.push(n);}
   changed+=indices.length;masks.set(coordinate(tile.x,tile.y),source.kind==="manual"?protectSamples(ref.mask,indices):ref.mask);
  }
  if(!changed)throw new WorldError("This edit makes no numerical change. Nothing was accepted.",400);
  const revision=surface.revision+1;await tx.execute(sql`SELECT set_config('serrian.refinement_guard',${id},true)`);await tx.insert(versions).values({refinementId:id,terrainId:root.terrain.id,worldId,revision,previousRevision:surface.revision,parentRevision:surface.parentRevision,rootRevision:root.terrain.revision,requestId:command.requestId,contentHash,source,authorId:userId});await publishPyramid(tx,root,meta,command.requestId,revision,tiles,masks,surface.revision);await tx.update(surfaces).set({revision,updatedAt:new Date()}).where(eq(surfaces.id,id));return {id:command.mapId,refinementId:id,revision};
 });
}

export async function getRefinementHistory(userId:string,worldId:string,mapId:string,id:string,options:{review?:boolean;ordinary?:boolean;before?:number}={}){
 z.uuid().parse(id);z.uuid().parse(mapId);const before=z.number().int().positive().optional().parse(options.before);await worldReadAccess(userId,worldId,!!options.review);if(options.ordinary)throw unavailable();
 return db.transaction(async tx=>{const root=await rootContext(tx,worldId,mapId),surface=await surfaceOf(tx,root,id),rows=await tx.select({revision:versions.revision,parentRevision:versions.parentRevision,rootRevision:versions.rootRevision,source:versions.source,createdAt:versions.createdAt,restoredFrom:versions.restoredFromRevision}).from(versions).where(and(eq(versions.refinementId,id),sql`${versions.revision}<${before??surface.revision+1}`)).orderBy(desc(versions.revision)).limit(50);return {refinement:metadata(surface,mapId),versions:rows,nextBefore:rows.length===50?rows.at(-1)!.revision:null};},{isolationLevel:"repeatable read",accessMode:"read only"});
}

/** Stable numerical query for future geography services, independent of Canvas2D. */
export async function sampleWorldTerrain(userId:string,worldId:string,mapId:string,raw:unknown,options:{review?:boolean;ordinary?:boolean}={}){
 z.uuid().parse(mapId);const points=z.array(z.object({x:z.number().finite().min(0).max(1e9),y:z.number().finite().min(0).max(1e9)}).strict()).min(1).max(64).parse(raw);await worldReadAccess(userId,worldId,!!options.review);if(options.ordinary)throw unavailable();
 return db.transaction(async tx=>{const root=await rootContext(tx,worldId,mapId),all=await refinementSchemaAvailable(tx)?await tx.select().from(surfaces).where(eq(surfaces.terrainId,root.terrain.id)).limit(REFINEMENT_LIMIT):[],byId=new Map(all.map(s=>[s.id,s])),refCache=new Map<string,Map<string,TileReference>>(),read=tileReader();
  async function sample(surface:Surface|null,revision:number,point:{x:number;y:number}):Promise<number>{
   const meta=surface?metadata(surface,mapId):null,shape=meta?frameGeometry(meta,root.shape):root.shape,frame=meta?.frame??rootFrame(root.shape),local=frameLocalPoint(point,frame,root.shape.displayWidth,root.shape.wrap),gx=local.x/shape.displayWidth*shape.width,gy=local.y/shape.displayHeight*shape.height,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy,key=`${surface?.id??"root"}:${revision}`;
   let refs=refCache.get(key);if(!refs){refs=new Map((await references(tx,root.terrain.id,surface?.id??null,revision)).map(r=>[coordinate(r.x,r.y),r]));refCache.set(key,refs);}
   const at=async(x:number,y:number):Promise<number>=>{if(surface&&(x<0||x>=shape.width||y<0||y>=shape.height)){const parent=surface.parentId?byId.get(surface.parentId):null;if(surface.parentId&&!parent)throw unavailable();return sample(parent??null,surface.parentRevision,{x:root.shape.wrap?normalizeTerrainX(frame.x+x/shape.width*frame.width,root.shape.displayWidth):Math.max(0,Math.min(root.shape.displayWidth,frame.x+x/shape.width*frame.width)),y:Math.max(0,Math.min(root.shape.displayHeight,frame.y+y/shape.height*frame.height))});}const column=root.shape.wrap&&!surface?((x%shape.width)+shape.width)%shape.width:Math.max(0,Math.min(shape.width-1,x)),row=Math.max(0,Math.min(shape.height-1,y)),ref=refs!.get(coordinate(Math.floor(column/32),Math.floor(row/32)));if(!ref){if(surface)throw unavailable();return root.terrain.baseElevation;}return (await read(ref))[row%32*32+column%32];};
   const [a,b,c,d]=await Promise.all([at(ix,iy),at(ix+1,iy),at(ix,iy+1),at(ix+1,iy+1)]);return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;
  }
  const result=[];for(const point of points){if(point.y>root.shape.displayHeight||!root.shape.wrap&&point.x>root.shape.displayWidth)throw new WorldError("Choose points inside this World.",400);const p={...point,x:root.shape.wrap?normalizeTerrainX(point.x,root.shape.displayWidth):point.x},surface=all.filter(s=>frameContains(metadata(s,mapId).frame,p,root.shape.displayWidth,root.shape.wrap)).sort((a,b)=>b.level-a.level)[0]??null,shape=surface?frameGeometry(metadata(surface,mapId),root.shape):root.shape;result.push({...p,elevation:await sample(surface,surface?.revision??root.terrain.revision,p),interpolated:true,sourceId:surface?.id??null,revision:surface?.revision??root.terrain.revision,level:surface?.level??0,spacingX:shape.displayWidth/shape.width,spacingY:shape.displayHeight/shape.height});}return {points:result};
 },{isolationLevel:"repeatable read",accessMode:"read only"});
}

export async function restoreRefinement(userId:string,worldId:string,id:string,raw:unknown){
 z.uuid().parse(id);const command=z.object({action:z.literal("restore"),mapId:z.uuid(),requestId:z.uuid(),revision:z.number().int().positive(),targetRevision:z.number().int().positive()}).strict().parse(raw),contentHash=hash({refinementId:id,...command});
 return worldWriteTransaction(userId,worldId,async tx=>{const root=await rootContext(tx,worldId,command.mapId),surface=await surfaceOf(tx,root,id),meta=metadata(surface,command.mapId),[retry]=await tx.select().from(versions).where(eq(versions.requestId,command.requestId));if(retry){if(retry.refinementId!==id||retry.worldId!==worldId||retry.contentHash!==contentHash)throw stale();return {id:command.mapId,refinementId:id,revision:retry.revision};}if(command.revision!==surface.revision)throw stale();if(command.targetRevision>=surface.revision)throw new WorldError("Choose an older accepted detail revision.",400);
  const [target]=await tx.select().from(versions).where(and(eq(versions.refinementId,id),eq(versions.revision,command.targetRevision)));if(!target)throw unavailable();const old=await readGrid(tx,root,surface,command.targetRevision),current=await readGrid(tx,root,surface,surface.revision),blocked=await getRefinementEditMask(tx,root.terrain.id,old.shape,meta.frame,root.shape,id),refs=new Map((await references(tx,root.terrain.id,id,surface.revision)).map(r=>[coordinate(r.x,r.y),r])),tiles:TerrainTile[]=[],masks=new Map<string,string>();
  for(let y=0;y<old.shape.height/32;y++)for(let x=0;x<old.shape.width/32;x++){const changes:number[]=[];for(let n=0;n<1024;n++){const index=(y*32+Math.floor(n/32))*old.shape.width+x*32+n%32;if(old.grid[index]!==current.grid[index]){if(blocked?.[index])throw new WorldError("Restoring this revision would replace a protected boundary or finer child context. Keep the accepted detail and edit the finer source instead.",409);changes.push(n);}}if(changes.length){tiles.push(gridTile(old.grid,old.shape.width,x,y));masks.set(coordinate(x,y),protectSamples(refs.get(coordinate(x,y))!.mask,changes));}}
  if(!tiles.length)throw new WorldError("These accepted heights already match the current detail.",400);const revision=surface.revision+1;await tx.execute(sql`SELECT set_config('serrian.refinement_guard',${id},true)`);await tx.insert(versions).values({refinementId:id,terrainId:root.terrain.id,worldId,revision,previousRevision:surface.revision,parentRevision:surface.parentRevision,rootRevision:root.terrain.revision,restoredFromRevision:command.targetRevision,requestId:command.requestId,contentHash,source:{kind:"manual"},authorId:userId});await publishPyramid(tx,root,meta,command.requestId,revision,tiles,masks,surface.revision);await tx.update(surfaces).set({revision,updatedAt:new Date()}).where(eq(surfaces.id,id));return {id:command.mapId,refinementId:id,revision};
 });
}

import "server-only";
import {createHash} from "node:crypto";
import {and,eq,sql} from "drizzle-orm";
import {db} from "@/db";
import {worldTerrain,worldTerrainTile,worldTerrainVersion} from "@/db/world-terrain-schema";
import {worldTerrainRefinement as details,worldTerrainRefinementVersion as detailVersions,worldTerrainRefinementGeometry as geometry} from "@/db/world-terrain-refinement-schema";
import {worldTerrainReliefGroup as groups} from "@/db/world-terrain-shared-relief-schema";
import {worldReadAccess,worldWriteTransaction,WorldError} from "./world-service";
import {worldContentEditor} from "./world-access-service";
import {sharedReliefCommandSchema,type SharedReliefCommand,type SharedReliefSnapshot} from "./terrain-shared-relief-spec";
import {sharedReliefHash,sharedReliefContext} from "./terrain-shared-relief-context";
import {prepareSharedRelief,type PreparedSharedRelief} from "./terrain-shared-relief-prepare";
import {encodeSharedReliefPreview} from "./terrain-shared-relief-packet";
import {prepareSharedReliefRestore} from "./terrain-shared-relief-restore";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import {withTerrainNumericalWorkspace} from "./terrain-resource-budget";
import {assertTerrainTransferRequest} from "./terrain-transfer-authority";
import {EMPTY_PROTECTION,protectSamples,type TerrainSource} from "./terrain-source";
import {stageTerrainTiles} from "./terrain-storage";
import {publishRefinementPyramid} from "./terrain-refinement-service";
import {refinementGeometryRecord} from "./terrain-refinement-geometry";
import type {TerrainTile} from "./terrain";
import type {RefinementMeta} from "./terrain-refinement";

type Tx=Parameters<Parameters<typeof worldWriteTransaction>[2]>[0];
type Publication=Omit<Extract<SharedReliefCommand,{action:"accept"}>,"action">&{action:"apply"|"undo"|"redo";targetId:string|null};
const stale=()=>new WorldError("Accepted terrain or its water/site context changed. Your native operation and original request are retained; preview the saved geography again.",409);
function sourceRequestId(groupId:string,sourceId:string){const h=createHash("sha256").update(groupId+":"+sourceId).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;}
function accepted(group:typeof groups.$inferSelect){return {id:group.mapId,groupId:group.id,revision:group.afterState[0].revision,action:group.action,effects:group.effects};}

export async function previewSharedRelief(userId:string,worldId:string,raw:unknown,signal?:AbortSignal){
 const c=sharedReliefCommandSchema.parse(raw);if(c.action!=="preview")throw new WorldError("Choose a native relief preview.",400);
 const access=await worldReadAccess(userId,worldId,false,"atlas");if(!worldContentEditor(access,userId)||access.archivedAt)throw new WorldError("This native authoring context is unavailable.",404);
 return withTerrainNumericalWorkspace(ADVANCED_TERRAIN_LIMITS.workingBytes,()=>db.transaction(async tx=>encodeSharedReliefPreview((await prepareSharedRelief(tx,worldId,c.mapId,c.operation,c.workArea,signal)).preview),{isolationLevel:"repeatable read",accessMode:"read only"}));
}

function changedTiles(prepared:PreparedSharedRelief,id:string){
 const r=prepared.results.get(id),p=prepared.budget.plans.find(p=>(p.source.id??prepared.context.root.terrain.id)===id);if(!r||!p)return [];
 const w=p.window,columns=p.source.shape.width/32,keys=new Set<number>();for(const index of r.patch.indices)keys.add(Math.floor(index/p.source.shape.width/32)*columns+Math.floor(index%p.source.shape.width/32));
 const tiles:TerrainTile[]=[];
 for(const key of [...keys].sort((a,b)=>a-b)){
  const x=key%columns,y=Math.floor(key/columns),samples:number[]=[];for(let n=0;n<1024;n++)samples.push(r.grid[(y*32+Math.floor(n/32)-w.y)*w.width+x*32+n%32-w.x]);tiles.push({x,y,samples});
 }
 return tiles;
}
async function publishPreparedRelief(tx:Tx,userId:string,worldId:string,command:Publication,prepared:PreparedSharedRelief,contentHash:string){
 const {context,rebase}=prepared,t=context.root.terrain,groupId=command.requestId,
  after:SharedReliefSnapshot[]=rebase.heads.map(s=>rebase.active.has(s.id)?{...s,contentHash:sharedReliefHash({groupId,sourceId:s.id,contentHash,previous:context.snapshots.find(b=>b.id===s.id),parentRevision:s.parentRevision,previewHash:command.previewHash})}:s),
  effects=prepared.preview.header.effects.map(e=>({id:e.id,changed:e.changed,maxLoweringM:prepared.results.get(e.id)?.metrics.maxLoweringM??0,maxRaisingM:prepared.results.get(e.id)?.metrics.maxRaisingM??0}));
 await tx.execute(sql`select set_config('serrian.shared_relief_group',${groupId},true)`);
 const [group]=await tx.insert(groups).values({id:groupId,worldId,terrainId:t.id,mapId:command.mapId,action:command.action,targetId:command.targetId,contentHash,contextPin:command.contextPin,previewHash:command.previewHash,seaLevel:t.seaLevel,operation:command.operation,workArea:command.workArea,beforeState:context.snapshots,afterState:after,effects,authorId:userId}).returning();
 for(const state of after){
  if(!rebase.active.has(state.id))continue;
  const prior=context.snapshots.find(b=>b.id===state.id)!,tiles=changedTiles(prepared,state.id),masks=new Map<string,string>(),source:TerrainSource={kind:"manual",sharedRelief:{version:1,groupId,changed:prepared.results.get(state.id)?.metrics.changed??0}};
  for(const tile of tiles){
   const old=await context.reference(state.id,prior.revision,tile.x,tile.y),before=old?await context.read(old):new Int16Array(1024).fill(t.baseElevation),indices:number[]=[];
   for(let n=0;n<1024;n++)if(before[n]!==tile.samples[n])indices.push(n);masks.set(tile.x+":"+tile.y,protectSamples(old?.mask??EMPTY_PROTECTION,indices));
  }
  await tx.execute(sql`select set_config('serrian.refinement_guard',${state.id},true)`);
  if(state.id===t.id){
   const objects=await stageTerrainTiles(groupId,worldId,t.id,tiles);
   await tx.insert(worldTerrainVersion).values({terrainId:t.id,worldId,revision:state.revision,previousRevision:prior.revision,source,requestId:groupId,contentHash:state.contentHash,seaLevel:t.seaLevel,authorId:userId});
   for(let start=0;start<objects.length;start+=128)await tx.insert(worldTerrainTile).values(objects.slice(start,start+128).map(o=>({terrainId:t.id,worldId,revision:state.revision,...o,manualProtection:masks.get(o.x+":"+o.y)!})));
   await tx.update(worldTerrain).set({revision:state.revision,updatedAt:new Date()}).where(and(eq(worldTerrain.id,t.id),eq(worldTerrain.worldId,worldId)));
  }else{
   const meta=context.metas.get(state.id)!,next:RefinementMeta={...meta,revision:state.revision,parentRevision:state.parentRevision!},requestId=sourceRequestId(groupId,state.id);
   if(state.parentRevision!==meta.parentRevision){
    await tx.execute(sql`select set_config('serrian.refinement_expand',${state.id},true)`);
    const [baseline]=await tx.select({revision:geometry.fromRevision}).from(geometry).where(and(eq(geometry.refinementId,state.id),eq(geometry.fromRevision,1)));
    if(!baseline)await tx.insert(geometry).values(refinementGeometryRecord(meta,1));
    await tx.insert(geometry).values(refinementGeometryRecord(next,state.revision));
   }
   // The unchanged pinned-parent version trigger runs after this checked head
   // transition. Deferred complete-head / group triggers certify the commit.
   await tx.update(details).set({revision:state.revision,parentRevision:state.parentRevision!,updatedAt:new Date()}).where(and(eq(details.id,state.id),eq(details.terrainId,t.id),eq(details.worldId,worldId)));
   await tx.insert(detailVersions).values({refinementId:state.id,terrainId:t.id,worldId,revision:state.revision,previousRevision:prior.revision,parentRevision:state.parentRevision!,rootRevision:after[0].revision,requestId,contentHash:state.contentHash,source,authorId:userId});
   await publishRefinementPyramid(tx,context.root,next,requestId,state.revision,tiles,masks,prior.revision);
  }
 }
 return accepted(group);
}

export async function changeSharedRelief(userId:string,worldId:string,raw:unknown){
 const command=sharedReliefCommandSchema.parse(raw);if(command.action==="preview")throw new WorldError("Prepare the native preview before accepting it.",400);
 const contentHash=sharedReliefHash(command);
 return withTerrainNumericalWorkspace(ADVANCED_TERRAIN_LIMITS.workingBytes,()=>worldWriteTransaction(userId,worldId,async tx=>{
  await assertTerrainTransferRequest(tx,userId,worldId,command.requestId);
  const [retry]=await tx.select().from(groups).where(eq(groups.id,command.requestId));
  if(retry){if(retry.worldId!==worldId||retry.mapId!==command.mapId||retry.authorId!==userId||retry.contentHash!==contentHash)throw stale();return accepted(retry);}
  if(command.action!=="accept"){
   const [target]=await tx.select().from(groups).where(and(eq(groups.id,command.groupId),eq(groups.worldId,worldId),eq(groups.mapId,command.mapId)));
   if(!target||command.action==="undo"&&target.action==="undo"||command.action==="redo"&&target.action!=="undo")throw new WorldError("Choose the current native relief group for this history action.",409);
   const prepared=await prepareSharedReliefRestore(tx,worldId,command.mapId,target);
   return publishPreparedRelief(tx,userId,worldId,{...command,targetId:target.id,operation:target.operation,workArea:target.workArea,contextPin:prepared.context.pin,previewHash:prepared.preview.header.previewHash},prepared,contentHash);
  }
  const prepared=await prepareSharedRelief(tx,worldId,command.mapId,command.operation,command.workArea);
  if(prepared.context.pin!==command.contextPin||prepared.preview.header.previewHash!==command.previewHash)throw stale();
  return publishPreparedRelief(tx,userId,worldId,{...command,action:"apply",targetId:null},prepared,contentHash);
 },"atlas"));
}

export async function getSharedReliefHistory(userId:string,worldId:string,mapId:string){
 const access=await worldReadAccess(userId,worldId,false,"atlas");if(!worldContentEditor(access,userId)||access.archivedAt)throw new WorldError("This native authoring history is unavailable.",404);
 return db.transaction(async tx=>{
  const capability=(await tx.execute<{available:boolean}>(sql`select to_regprocedure('public.world_native_shared_relief_schema()') is not null available`)).rows[0];if(!capability.available)return {available:false,current:null};
  const context=await sharedReliefContext(tx,worldId,mapId),[group]=await tx.select().from(groups).where(and(eq(groups.terrainId,context.root.terrain.id),eq(groups.worldId,worldId),eq(groups.mapId,mapId),sql`(${groups.afterState}->0->>'revision')::integer=${context.root.terrain.revision}`));
  if(!group)return {available:true,erosionAvailable:context.erosionAvailable,current:null};
  const current=sharedReliefHash(context.snapshots)===sharedReliefHash(group.afterState)&&context.pinForSnapshots(group.beforeState)===group.contextPin;
  return {available:true,erosionAvailable:context.erosionAvailable,current:{groupId:group.id,action:group.action,revision:group.afterState[0].revision,canUndo:current&&group.action!=="undo",canRedo:current&&group.action==="undo",effects:group.effects},...!current?{unavailableReason:"Later terrain, water or settlement work is preserved. Shared relief history cannot overwrite it."}:{}};
 },{isolationLevel:"repeatable read",accessMode:"read only"});
}

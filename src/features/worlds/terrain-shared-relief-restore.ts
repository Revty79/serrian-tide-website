import "server-only";
import {createHash} from "node:crypto";
import {numericalBytes} from "./terrain-refinement-cache";
import {worldTerrainReliefGroup} from "@/db/world-terrain-shared-relief-schema";
import type {AdvancedResult} from "./terrain-advanced";
import {planSharedRelief} from "./terrain-shared-relief";
import {sharedReliefContext,sharedReliefHash,type SharedReliefConnection} from "./terrain-shared-relief-context";
import type {PreparedSharedRelief} from "./terrain-shared-relief-prepare";
import {WorldError} from "./world-errors";

/** History inversion reads only this immutable, same-World group. Whole source
 * vectors prevent restoration over intervening work. Heights and original
 * pinned-parent context are restored exactly into new accepted revisions. */
export async function prepareSharedReliefRestore(tx:SharedReliefConnection,worldId:string,mapId:string,target:typeof worldTerrainReliefGroup.$inferSelect):Promise<PreparedSharedRelief>{
 const context=await sharedReliefContext(tx,worldId,mapId);
 if(context.root.terrain.id!==target.terrainId||target.worldId!==worldId||target.mapId!==mapId||sharedReliefHash(context.snapshots)!==sharedReliefHash(target.afterState)||context.pinForSnapshots(target.beforeState)!==target.contextPin)throw new WorldError("Terrain, water or settlement context changed after this relief group. Later work is preserved; group history cannot overwrite it.",409);
 const budget=planSharedRelief(context.sources,target.operation,target.workArea,context.context),windows:PreparedSharedRelief["preview"]["windows"]=[],results=new Map<string,AdvancedResult>(),active=new Set(target.effects.map(e=>e.id)),
  desired=new Map(target.beforeState.map(s=>[s.id,s])),heads=context.snapshots.map(s=>active.has(s.id)?{...s,revision:s.revision+1,parentRevision:desired.get(s.id)!.parentRevision}:s);
 for(const plan of budget.plans){
  const id=plan.source.id??context.root.terrain.id,before=(await context.readWindow(plan)).base,old=desired.get(id)!;
  if(sharedReliefHash(old.frame)!==sharedReliefHash(plan.source.frame)||old.columns!==plan.source.shape.width||old.rows!==plan.source.shape.height)throw new WorldError("This retained relief group no longer has the same native coverage. Current geometry is preserved.",409);
  const after=(await context.readWindow({...plan,source:{...plan.source,revision:old.revision}})).base,indices:number[]=[],a:number[]=[],b:number[]=[];let lowering=0,raising=0,min=30000,max=-30000;
  for(let i=0;i<after.length;i++){
   min=Math.min(min,after[i]);max=Math.max(max,after[i]);if(before[i]===after[i])continue;
   if(!active.has(id))throw new WorldError("The retained relief history includes an unexpected source change. Nothing was restored.",409);
   indices.push((Math.floor(i/plan.window.width)+plan.window.y)*plan.source.shape.width+i%plan.window.width+plan.window.x);a.push(before[i]);b.push(after[i]);lowering=Math.max(lowering,before[i]-after[i]);raising=Math.max(raising,after[i]-before[i]);
  }
  results.set(id,{grid:after,window:plan.window,patch:{indices:Uint32Array.from(indices),before:Int16Array.from(a),after:Int16Array.from(b)},metrics:{changed:indices.length,minimum:min,maximum:max,maxLoweringM:lowering,maxRaisingM:raising,removedM3:0,addedM3:0,eligible:indices.length,protected:0,waterProtected:0,siteProtected:0,visited:after.length,workingBytes:budget.workingBytes,affected:indices.length?target.workArea:null,notices:[]}});
  windows.push({before,after});
 }
 const previewHash=sharedReliefHash({targetId:target.id,contextPin:context.pin,restore:target.beforeState}),header:PreparedSharedRelief["preview"]["header"]={version:1,worldId,mapId,terrainId:context.root.terrain.id,rootRevision:context.root.terrain.revision,contextPin:context.pin,previewHash,refinements:[...context.metas.values()],
  windows:budget.plans.map((p,i)=>{const id=p.source.id??context.root.terrain.id,r=results.get(id)!;return {id,sourceId:p.source.id,name:context.metas.get(id)?.name??context.root.map.name,level:context.sources.find(s=>s.id===p.source.id)!.level,revision:p.source.revision,frame:p.source.frame,sourceWidth:p.source.shape.width,sourceHeight:p.source.shape.height,x:p.window.x,y:p.window.y,width:p.window.width,height:p.window.height,beforeHash:createHash("sha256").update(numericalBytes(windows[i].before)).digest("hex"),afterHash:createHash("sha256").update(numericalBytes(windows[i].after)).digest("hex"),changed:r.metrics.changed,maxLoweringM:r.metrics.maxLoweringM,maxRaisingM:r.metrics.maxRaisingM};}),
  effects:heads.filter(s=>active.has(s.id)).map(s=>({id:s.id,name:context.metas.get(s.id)?.name??context.root.map.name,revision:s.revision,parentRevision:s.parentRevision,changed:results.get(s.id)?.metrics.changed??0})),
  cells:budget.cells,sampleSteps:budget.sampleSteps,workingBytes:budget.workingBytes,contextChanges:0,maxContextChangeM:0,elapsedMs:0,protected:0,waterProtected:0,siteProtected:0};
 return {context,budget,results,rebase:{heads,active,contextChanges:0,maxContextChangeM:0,steps:0,nextLoad:context.load},preview:{header,windows}};
}

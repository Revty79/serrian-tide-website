import "server-only";
import {createHash} from "node:crypto";
import type {AdvancedResult} from "./terrain-advanced";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import {frameLocalPoint} from "./terrain-refinement";
import {numericalBytes} from "./terrain-refinement-cache";
import {planSharedRelief,prepareSharedReliefSource,type SharedReliefOperation} from "./terrain-shared-relief";
import type {TerrainFrame} from "./terrain-refinement";
import {sharedReliefCoastGuards} from "./terrain-shared-relief-coast";
import {certifySharedReliefRebase} from "./terrain-shared-relief-rebase";
import {sharedReliefContext,type SharedReliefConnection} from "./terrain-shared-relief-context";
import {sharedReliefPreviewHeaderSchema,type SharedReliefPreview} from "./terrain-shared-relief-packet";
import {WorldError} from "./world-errors";
import {sharedReliefJoinReviewDataSchema} from "./terrain-shared-relief-join-review";

/** Both preview and the atomic acceptance independently execute this path. */
export async function prepareSharedRelief(tx:SharedReliefConnection,worldId:string,mapId:string,operation:SharedReliefOperation,workArea:TerrainFrame,signal?:AbortSignal){
 const started=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ADVANCED_TERRAIN_LIMITS.workerMs),job=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 try{
  const context=await sharedReliefContext(tx,worldId,mapId);
  if(operation.kind==="erosion"&&!context.erosionAvailable)throw new WorldError("Joined erosion requires additive migration 0166. Your settings and saved geography are unchanged; single-source erosion and joined profiles remain available.",409);
  const {root,shape}=context,budget=planSharedRelief(context.sources,operation,workArea,context.context),
   coast=await sharedReliefCoastGuards(budget.plans,context.sources,shape,root.terrain.seaLevel,(point,source,outside)=>{
    if(outside)return context.sample(point);
    const p=frameLocalPoint(point,source.frame,shape.displayWidth,shape.wrap),x=Math.round(p.x/source.frame.width*source.shape.width),y=Math.round(p.y/source.frame.height*source.shape.height);
    const loaded=context.load(source.id??root.terrain.id,source.revision);return loaded instanceof Promise?loaded.then(s=>s.at(x,y)):loaded.at(x,y);
   },job),windows:SharedReliefPreview["windows"]=[],results=new Map<string,AdvancedResult>();
  let protectedCount=0,waterProtected=0,siteProtected=0,geometryWork=0,changed=0,bankSupportConflicts=0,maxBankSupportStepM=0;
  for(const plan of budget.plans){
   if(job.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");
   const input=await context.readWindow(plan),result=await prepareSharedReliefSource(plan,input.base,input.manual,operation,context.context,undefined,job,coast.masks.get(plan.source.id));
   windows.push({before:input.base,after:result.grid});results.set(plan.source.id??root.terrain.id,result);
   protectedCount+=result.metrics.protected;waterProtected+=result.metrics.waterProtected;siteProtected+=result.metrics.siteProtected;geometryWork+=result.metrics.geometryWork??0;changed+=result.metrics.changed;
   bankSupportConflicts+=result.metrics.bankSupportConflicts??0;maxBankSupportStepM=Math.max(maxBankSupportStepM,result.metrics.maxBankSupportStepM??0);
  }
  coast.masks.clear();
  if(!changed)throw new WorldError("This native work area makes no eligible relief changes. Keep the operation and choose another area or revise its profile.",400);
  const rebase=await certifySharedReliefRebase(context.snapshots,results,shape,operation.selection,workArea,root.terrain.seaLevel,context.load,job,operation.reviewDryBorderJoins?{context:context.context,preserveManual:operation.preserveManual,nativeCells:budget.cells,workingBytes:budget.workingBytes}:undefined),
   work=budget.sampleSteps+geometryWork+coast.visited+rebase.steps;
  if(work>ADVANCED_TERRAIN_LIMITS.work)throw new WorldError("Choose a smaller native work area. The combined profile and preservation audit exceed 8,388,608 steps.",400);
  if(job.aborted||performance.now()-started>ADVANCED_TERRAIN_LIMITS.workerMs)throw new WorldError("The native relief preview reached its 30-second bound. Your accepted geography is unchanged; choose a smaller work area.",400);
  const reviewData=rebase.joinReview?sharedReliefJoinReviewDataSchema.parse(rebase.joinReview):undefined,joinReview=reviewData?{...reviewData,reviewHash:createHash("sha256").update(JSON.stringify(reviewData)).digest("hex")}:undefined,
   bankData=operation.kind==="erosion"&&operation.bankReinforcementM!==undefined?{conflictingSupports:bankSupportConflicts,maximumStepM:maxBankSupportStepM}:undefined,
   bankReinforcement=bankData?{...bankData,reviewHash:createHash("sha256").update(JSON.stringify(bankData)).digest("hex")}:undefined,
   hash=createHash("sha256").update(JSON.stringify({contextPin:context.pin,operation,workArea,heads:rebase.heads,...bankReinforcement?{bankReinforcement}:{},...joinReview?{joinReview}:{}}));for(const w of windows){hash.update(numericalBytes(w.before));hash.update(numericalBytes(w.after));}
  const previewHash=hash.digest("hex"),header=sharedReliefPreviewHeaderSchema.parse({version:1,worldId,mapId,terrainId:root.terrain.id,rootRevision:root.terrain.revision,contextPin:context.pin,previewHash,refinements:[...context.metas.values()],
   windows:budget.plans.map((p,i)=>({id:p.source.id??root.terrain.id,sourceId:p.source.id,name:p.source.id?context.metas.get(p.source.id)!.name:root.map.name,level:context.sources.find(s=>s.id===p.source.id)!.level,revision:p.source.revision,frame:p.source.frame,sourceWidth:p.source.shape.width,sourceHeight:p.source.shape.height,x:p.window.x,y:p.window.y,width:p.window.width,height:p.window.height,beforeHash:createHash("sha256").update(numericalBytes(windows[i].before)).digest("hex"),afterHash:createHash("sha256").update(numericalBytes(windows[i].after)).digest("hex"),changed:results.get(p.source.id??root.terrain.id)!.metrics.changed,maxLoweringM:results.get(p.source.id??root.terrain.id)!.metrics.maxLoweringM,maxRaisingM:results.get(p.source.id??root.terrain.id)!.metrics.maxRaisingM})),
   effects:rebase.heads.filter(s=>rebase.active.has(s.id)).map(s=>({id:s.id,name:context.metas.get(s.id)?.name??root.map.name,revision:s.revision,parentRevision:s.parentRevision,changed:results.get(s.id)?.metrics.changed??0})),
   cells:budget.cells+(rebase.joinReviewSamples??0),sampleSteps:work,workingBytes:budget.workingBytes+(rebase.joinReviewBytes??0),contextChanges:rebase.contextChanges,maxContextChangeM:rebase.maxContextChangeM,elapsedMs:performance.now()-started,protected:protectedCount,waterProtected,siteProtected,...bankReinforcement?{bankReinforcement}:{},...joinReview?{joinReview}:{}});
  return {context,budget,results,rebase,preview:{header,windows} satisfies SharedReliefPreview};
 }catch(error){if(error instanceof WorldError)throw error;throw new WorldError(error instanceof Error?error.message:"The native shared relief could not be prepared.",400);}finally{clearTimeout(timer);}
}
export type PreparedSharedRelief=Awaited<ReturnType<typeof prepareSharedRelief>>;

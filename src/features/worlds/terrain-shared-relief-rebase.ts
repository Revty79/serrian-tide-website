import type {TerrainGeometry} from "./terrain";
import {normalizeTerrainX,framesOverlap,type TerrainFrame} from "./terrain-refinement";
import {profileWorkArea} from "./terrain-profile-work-area";
import {samplePinnedTerrainPointReady,type NumericalSampleSource,type NumericalSampleLoader} from "./terrain-numerical-sampling";
import type {SharedReliefSnapshot} from "./terrain-shared-relief-spec";
import type {AdvancedResult} from "./terrain-advanced";
import {ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import type {SharedProfile} from "./terrain-shared-relief";
import {regionAreaContainsPoint} from "./terrain-region-geometry";
import {profileWindowLocalIndex} from "./terrain-profile-window";
import {createSelectedDryJoinReview,type SelectedDryJoinOptions,type SelectedReconstructionReview} from "./terrain-shared-relief-join-review";
import {selectedNativeReconstruction} from "./terrain-selected-reconstruction";

/** Certify a native same-frame context transition. A stale parent pin is never
 * silently replaced: every changed fallback support must lie inside the
 * selected work area and remain dry. Old revisions continue using old pins. */
export async function certifySharedReliefRebase(snapshots:SharedReliefSnapshot[],results:Map<string,AdvancedResult>,world:TerrainGeometry,
 selection:SharedProfile["selection"],workArea:TerrainFrame,seaLevel:number,load:NumericalSampleLoader,signal?:AbortSignal,selectedDryJoins?:Omit<SelectedDryJoinOptions,"work"|"selection"|"workArea">){
 if(signal?.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");
 const root=snapshots[0],before=new Map(snapshots.map(s=>[s.id,s])),heads=new Map<string,SharedReliefSnapshot>(),active=new Set<string>([root.id]),
  dimensions={width:world.displayWidth,height:world.displayHeight,wrap:world.wrap},area=profileWorkArea(selection.frame,workArea,dimensions),
  contains=(point:{x:number;y:number})=>area.containsX(point.x)&&area.containsY(point.y)&&regionAreaContainsPoint(selection,point,dimensions);
 let steps=0,contextChanges=0,maxContextChangeM=0,lastYield=performance.now();
 const reviewWork=(count:number)=>{steps+=count;if(steps>ADVANCED_TERRAIN_LIMITS.work)throw Error("Choose a smaller work area. Its complete border review exceeds 8,388,608 steps.");if(signal?.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");},
  reviewer=selectedDryJoins?createSelectedDryJoinReview({...selectedDryJoins,selection,workArea,work:reviewWork}):undefined;
 const nextLoad:NumericalSampleLoader=(id,revision)=>{
  const head=heads.get(id),prior=before.get(id);if(!head||!prior||revision!==head.revision||!active.has(id))return load(id,revision);
  const loaded=load(id,prior.revision),result=results.get(id);
  const proposed=(original:NumericalSampleSource):NumericalSampleSource=>({...original,revision:head.revision,parentRevision:head.parentRevision,at:(x,y)=>{
   const index=y*original.shape.width+x,local=result?.window?profileWindowLocalIndex(result.window,index):index;
   return result&&local!==undefined?result.grid[local]:original.at(x,y);
  }});return loaded instanceof Promise?loaded.then(proposed):proposed(loaded);
 };
 heads.set(root.id,{...root,revision:root.revision+1});
 for(const source of snapshots.slice(1)){
  const parentId=source.parentId??root.id,parentBefore=before.get(parentId),parentAfter=heads.get(parentId);
  if(!parentBefore||!parentAfter||source.parentRevision===null)throw Error("The complete accepted native parent hierarchy is required.");
  const oldParent=source.parentRevision,newParent=parentAfter.revision;
  let advance=!!results.get(source.id)?.patch.indices.length;
  const touchesFallback=[{x:source.frame.x+source.frame.width,y:source.frame.y,width:0,height:source.frame.height},{x:source.frame.x,y:source.frame.y+source.frame.height,width:source.frame.width,height:0}].some(edge=>framesOverlap(edge,workArea,world.displayWidth,world.wrap,1e-6));
  const sample=(point:{x:number;y:number},revision:number,next:boolean)=>samplePinnedTerrainPointReady(point,parentId,revision,world,next?nextLoad:load);
  // The pinned numerical reader only leaves the source through its final east
  // column / south row. These exact native nodes certify the entire bilinear
  // fallback strip, including the common corner and wrapped World seam.
  const points=function*(){
   for(let y=0;y<=source.rows;y++)yield {x:source.frame.x+source.frame.width,y:source.frame.y+y/source.rows*source.frame.height,edge:"east" as const,index:y};
   for(let x=0;x<source.columns;x++)yield {x:source.frame.x+x/source.columns*source.frame.width,y:source.frame.y+source.frame.height,edge:"south" as const,index:x};
  };
  if(!advance&&active.has(parentId)&&touchesFallback)for(const raw of points()){
   if(signal?.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");
   if(performance.now()-lastYield>4){await new Promise<void>(r=>setTimeout(r,0));lastYield=performance.now();}
   const point={x:world.wrap?normalizeTerrainX(raw.x,world.displayWidth):Math.min(world.displayWidth,raw.x),y:Math.min(world.displayHeight,raw.y)};
   if(!contains(point))continue;
   const oldValue=sample(point,parentBefore.revision,false),a=typeof oldValue==="number"?oldValue:await oldValue,
    newValue=sample(point,newParent,true),b=typeof newValue==="number"?newValue:await newValue;
   if(a!==b){advance=true;break;}
  }
  if(!advance){heads.set(source.id,source);continue;}
  if(oldParent!==newParent)for(const raw of points()){
   if(++steps>ADVANCED_TERRAIN_LIMITS.work)throw Error("Choose a smaller work area. Its native context audit exceeds 8,388,608 steps.");
   if(signal?.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");
   if(performance.now()-lastYield>4){await new Promise<void>(r=>setTimeout(r,0));lastYield=performance.now();}
   const point={x:world.wrap?normalizeTerrainX(raw.x,world.displayWidth):Math.min(world.displayWidth,raw.x),y:Math.min(world.displayHeight,raw.y)},
    oldValue=sample(point,oldParent,false),a=typeof oldValue==="number"?oldValue:await oldValue,
    newValue=sample(point,newParent,true),b=typeof newValue==="number"?newValue:await newValue;
   if(a===b)continue;
   if(!contains(point)&&!reviewer)throw Error("Reconnecting this source would change an older pinned boundary outside the selected native work area. Keep the proposal and review a work area containing the whole affected join.");
   if(a<=seaLevel||b<=seaLevel)throw Error("Reconnecting this source would change a retained sea support. Its pinned coastline is preserved; revise the relief work area.");
   if(reviewer){
    const original=load(source.id,source.revision),result=results.get(source.id),proposed=(value:NumericalSampleSource):NumericalSampleSource=>({...value,revision:source.revision+1,parentRevision:newParent,at:(x,y)=>{const i=y*value.shape.width+x,local=result?.window?profileWindowLocalIndex(result.window,i):i;return result&&local!==undefined?result.grid[local]:value.at(x,y);}}),
     afterLoad:NumericalSampleLoader=(id,revision)=>id===source.id&&revision===source.revision+1?(original instanceof Promise?original.then(proposed):proposed(original)):nextLoad(id,revision),
     counted=(reader:NumericalSampleLoader):NumericalSampleLoader=>(id,revision)=>{const value=reader(id,revision),wrap=(s:NumericalSampleSource):NumericalSampleSource=>({...s,at:(x,y)=>{reviewWork(1);return s.at(x,y);}});return value instanceof Promise?value.then(wrap):wrap(value);};
    let reconstruction:SelectedReconstructionReview|undefined;
    if(selectedDryJoins?.allowReconstruction&&!regionAreaContainsPoint(selection,point,dimensions)){
     const supports=await selectedNativeReconstruction(point,parentId,oldParent,newParent,world,selection,seaLevel,load,nextLoad,{before:a,after:b},reviewWork);
     reconstruction={supports,read:async node=>{
      reviewWork(1);const native=await load(node.sourceId,node.beforeRevision);
      return {frame:native.frame,columns:native.shape.width,rows:native.shape.height,sample:(p,next)=>samplePinnedTerrainPointReady(p,node.sourceId,next?node.afterRevision:node.beforeRevision,world,counted(next?nextLoad:load))};
     }};
    }
    await reviewer.add(source,point,{edge:raw.edge,index:raw.index,before:a,after:b,outsideWorkArea:!contains(point)},oldParent,newParent,(point,next)=>samplePinnedTerrainPointReady(point,source.id,source.revision+(next?1:0),world,counted(next?afterLoad:load)),reconstruction);
   }
   contextChanges++;maxContextChangeM=Math.max(maxContextChangeM,Math.abs(a-b));
  }
  active.add(source.id);heads.set(source.id,{...source,revision:source.revision+1,parentRevision:newParent});
 }
 const joinReview=reviewer?.review();
 return {heads:[...heads.values()],active,contextChanges,maxContextChangeM,steps,nextLoad,...reviewer?{joinReview,joinReviewSamples:reviewer.samples(),joinReviewBytes:reviewer.workingBytes()}: {}};
}

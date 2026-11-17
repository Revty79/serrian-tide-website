import type {TerrainGeometry} from "./terrain";
import {frameGeometry,frameLocalPoint,framesOverlap,initializeRefinementAsync,rootFrame,sampleTerrainGrid,REFINEMENT_LIMIT,type RefinementMeta,type TerrainFrame} from "./terrain-refinement";
import type {RefinementInheritance} from "./terrain-refinement-inheritance-spec";
import {crossingRefinementLevel} from "./terrain-refinement-crossing";

export const ACCEPTED_REFINEMENT_NOTICE="This preview interpolates the saved numerical heights of the existing accepted areas, using the Whole World base elsewhere. It adds samples, not new geographic detail. The new area takes precedence inside its bounds; the original sources and their history stay saved. Inspect the complete preview before accepting. Accept permanently adds coverage; Undo/Redo applies to later sculpting.";

export function acceptedRefinementSources(frame:TerrainFrame,index:RefinementMeta[],world:TerrainGeometry){
 if(index.length>REFINEMENT_LIMIT||new Set(index.map(meta=>meta.id)).size!==index.length)throw Error("The accepted terrain index is incomplete. Refresh before preparing this source.");
 return index.filter(meta=>framesOverlap(frame,meta.frame,world.displayWidth,world.wrap)).sort((a,b)=>a.level-b.level||a.id.localeCompare(b.id));
}
export function refinementInheritance(rootRevision:number,sourceState:string,sources:RefinementMeta[]):RefinementInheritance{
 return {version:1,rootRevision,sourceState,sources:sources.map(({id,revision,parentId,parentRevision,level,frame,gridWidth,gridHeight})=>({id,revision,parentId,parentRevision,level,frame:{...frame},gridWidth,gridHeight}))};
}
function cancelled(signal?:AbortSignal){if(signal?.aborted)throw new DOMException("Numerical preview canceled before acceptance.","AbortError");}

/** The existing node-based bilinear convention. Read one pinned source at a
 * time; no external surface, presentation pixels, or new sampling engine. */
export async function initializeAcceptedRefinement(root:Int16Array,world:TerrainGeometry,frame:TerrainFrame,width:number,height:number,sources:RefinementMeta[],load:(meta:RefinementMeta,signal?:AbortSignal)=>Promise<Int16Array>,progress:(value:number)=>void=()=>{},signal?:AbortSignal){
 cancelled(signal);
 let lastProgress=0;const report=(value:number)=>{lastProgress=Math.max(lastProgress,value);progress(lastProgress);};
 const ordered=acceptedRefinementSources(frame,sources,world);crossingRefinementLevel(frame,width,height,world,ordered);
 const grid=await initializeRefinementAsync(root,world,rootFrame(world),frame,width,height,world,value=>report(value*.5),signal);
 for(let index=0;index<ordered.length;index++){
  cancelled(signal);const meta=ordered[index],input=await load(meta,signal);cancelled(signal);
  if(input.length!==meta.gridWidth*meta.gridHeight)throw Error("An inherited accepted source is incomplete. Nothing was accepted.");
  const shape=frameGeometry(meta,world),top=Math.max(0,Math.ceil((meta.frame.y-frame.y)/frame.height*height)),bottom=Math.min(height,Math.ceil((meta.frame.y+meta.frame.height-frame.y)/frame.height*height));
  for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){
   const left=Math.max(0,Math.ceil((meta.frame.x+offset-frame.x)/frame.width*width)),right=Math.min(width,Math.ceil((meta.frame.x+offset+meta.frame.width-frame.x)/frame.width*width));
   if(right<=left||bottom<=top)continue;
   for(let first=top;first<bottom;first+=8){
    cancelled(signal);
    for(let y=first;y<Math.min(bottom,first+8);y++)for(let x=left;x<right;x++){
     const point=frameLocalPoint({x:frame.x+x/width*frame.width,y:frame.y+y/height*frame.height},meta.frame,world.displayWidth,world.wrap);
     grid[y*width+x]=Math.round(sampleTerrainGrid(input,shape,point.x,point.y));
    }
    report(.5+.5*(index+(Math.min(bottom,first+8)-top)/Math.max(1,bottom-top))/Math.max(1,ordered.length));
    await new Promise<void>(resolve=>setTimeout(resolve,0));
   }
  }
 }
 cancelled(signal);report(1);return grid;
}

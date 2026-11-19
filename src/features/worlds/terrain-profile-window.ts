import type {TerrainGeometry, TerrainTile} from "./terrain";
import type {TerrainFrame, RefinementMeta} from "./terrain-refinement";
import {regionCanonicalX} from "./terrain-region-geometry";
import {ADVANCED_TERRAIN_LIMITS, advancedOperationSchema, type AdvancedOperation} from "./terrain-advanced-spec";
import {prepareAdvancedTerrainAsync, type AdvancedTerrainContext, type AdvancedResult} from "./terrain-advanced";
import {profileWorkArea} from "./terrain-profile-work-area";

/** Transient numerical workspace, never a new saved source or authoring input. */
export type ProfileWindow = {
  x:number;y:number;width:number;height:number;
  sourceWidth:number;sourceHeight:number;sourceFrame:TerrainFrame;
  /** Derived only by the native shared-relief planner. */
  shared?:true;sourceWrap?:boolean;processingArea?:TerrainFrame;nativeCells?:number;
};
const LARGE_SOURCE = 4_194_304;
export const needsProfileWindow=(shape:TerrainGeometry,op:Pick<AdvancedOperation,"kind">)=>
  op.kind==="landform-profile" && shape.width*shape.height>LARGE_SOURCE && !shape.wrap;

/** Derive the workspace from accepted geometry and the original native selection.
 * Keep complete native tiles and a reconstruction/shore-support halo. Powers of
 * two reuse the existing preview LOD renderer without resampling any heights. */
export function planProfileWindow(shape:TerrainGeometry,raw:AdvancedOperation,context:AdvancedTerrainContext,options?:{shared:true;processingArea:TerrainFrame}):ProfileWindow|null {
  if(!options&&!needsProfileWindow(shape,raw))return null;
  const op=advancedOperationSchema.parse(raw);
  if(op.kind!=="landform-profile")throw Error("Choose a landform profile.");
  const {frame,world}=context,sx=frame.width/shape.width,sy=frame.height/shape.height;
  if(![sx,sy,world.width,world.height].every(v=>Number.isFinite(v)&&v>0))throw Error("The accepted physical terrain frame is invalid.");
  if(options){const a=options.processingArea;if(![a.x,a.y,a.width,a.height].every(Number.isFinite)||a.x<0||a.x>=world.width||a.y<0||a.width<=0||a.width>world.width||a.height<=0||a.y+a.height>world.height||!world.wrap&&a.x+a.width>world.width)throw Error("Keep the native work area inside this World.");}
  const xs:number[]=[],ys:number[]=[],s=op.selection.frame,workArea=options?profileWorkArea(s,options.processingArea,world):undefined;
  for(let x=0;x<shape.width;x++){
    const wx=regionCanonicalX(frame.x+x*sx,world),offset=world.wrap?((wx-s.x)%world.width+world.width)%world.width:wx-s.x;
    if(offset>=-1e-6&&offset<=s.width+1e-6&&(!workArea||workArea.containsX(wx)))xs.push(x);
  }
  for(let y=0;y<shape.height;y++){const wy=frame.y+y*sy;if(wy>=s.y-1e-6&&wy<=s.y+s.height+1e-6&&(!workArea||workArea.containsY(wy)))ys.push(y);}
  const cells=xs.length*ys.length;
  if(!cells){if(options)return null;throw Error("This selection has no native samples in the active terrain source.");}
  if(cells>ADVANCED_TERRAIN_LIMITS.cells||cells*(op.points.length-1)>ADVANCED_TERRAIN_LIMITS.work)
    throw Error("Choose a smaller area or fewer profile points. The limit is 262,144 samples and 8,388,608 sample-steps; fidelity is unchanged.");
  const axis=(indices:number[],size:number)=>{
    const first=Math.max(0,Math.floor(indices[0]/32)*32-32),last=Math.min(size,Math.ceil((indices[indices.length-1]+1)/32)*32+32),
      count=Math.min(size,2**Math.ceil(Math.log2(Math.max(32,last-first)))),start=Math.min(first,size-count);
    return {start,count};
  };
  const seam=shape.wrap&&(xs[0]<32||xs[xs.length-1]>=shape.width-32),x=seam?{start:0,count:shape.width}:axis(xs,shape.width),y=axis(ys,shape.height),n=x.count*y.count,
    bytes=n*7+cells*64+(x.count+y.count)*Int32Array.BYTES_PER_ELEMENT;
  if(bytes>ADVANCED_TERRAIN_LIMITS.workingBytes)throw Error("This native profile window exceeds the 32 MiB numerical working-buffer budget. Choose a smaller area or one side of the wrapped seam; fidelity is unchanged.");
  return {x:x.start,y:y.start,width:x.count,height:y.count,sourceWidth:shape.width,sourceHeight:shape.height,sourceFrame:{...frame},...options?{shared:true as const,sourceWrap:shape.wrap,processingArea:{...options.processingArea},nativeCells:cells}:{}};
}
export function profileWindowFrame(w:ProfileWindow):TerrainFrame {
  const sx=w.sourceFrame.width/w.sourceWidth,sy=w.sourceFrame.height/w.sourceHeight;
  return {x:w.sourceFrame.x+w.x*sx,y:w.sourceFrame.y+w.y*sy,width:w.width*sx,height:w.height*sy};
}
export function profileWindowGeometry(w:ProfileWindow,shape:TerrainGeometry):TerrainGeometry {
  const frame=profileWindowFrame(w);
  return {...shape,width:w.width,height:w.height,displayWidth:frame.width,displayHeight:frame.height,wrap:!!w.sourceWrap&&w.x===0&&w.width===w.sourceWidth};
}
export function profileWindowLocalIndex(w:ProfileWindow,index:number):number|undefined {
  const x=index%w.sourceWidth-w.x,y=Math.floor(index/w.sourceWidth)-w.y;
  return x>=0&&x<w.width&&y>=0&&y<w.height?y*w.width+x:undefined;
}
export function copyProfileWindow<T extends Int16Array|Uint8Array>(base:T,w:ProfileWindow):T {
  if(base.length!==w.sourceWidth*w.sourceHeight)throw Error("The accepted source buffer is incomplete.");
  const result=(base instanceof Int16Array?new Int16Array(w.width*w.height):new Uint8Array(w.width*w.height)) as T;
  for(let y=0;y<w.height;y++)result.set(base.subarray((w.y+y)*w.sourceWidth+w.x,(w.y+y)*w.sourceWidth+w.x+w.width),y*w.width);
  return result;
}
export async function prepareWindowedProfile(base:Int16Array,shape:TerrainGeometry,op:AdvancedOperation,context:AdvancedTerrainContext,w:ProfileWindow,
  blocked?:Uint8Array,manual?:Uint8Array,progress?:(value:number)=>void,signal?:AbortSignal):Promise<AdvancedResult> {
  // Workers and the server independently derive the same window. It is not a
  // client-attested frame and is never added to immutable native provenance.
  if(JSON.stringify(planProfileWindow(shape,op,context,w.shared&&w.processingArea?{shared:true,processingArea:w.processingArea}:undefined))!==JSON.stringify(w))throw Error("The numerical profile window does not match the accepted source and selection.");
  const localContext:AdvancedTerrainContext={...context,frame:profileWindowFrame(w),nativeLattice:{frame:w.sourceFrame,width:w.sourceWidth,height:w.sourceHeight,x:w.x,y:w.y},...w.processingArea?{processingArea:w.processingArea}:{}},
    result=await prepareAdvancedTerrainAsync(base,profileWindowGeometry(w,shape),op,localContext,blocked,manual,progress,signal);
  for(let k=0;k<result.patch.indices.length;k++){
    const i=result.patch.indices[k];result.patch.indices[k]=(Math.floor(i/w.width)+w.y)*w.sourceWidth+i%w.width+w.x;
  }
  return {...result,window:w};
}
export function advancedResultSample(result:AdvancedResult,index:number,unchanged:number):number {
  if(!result.window)return result.grid[index];
  const local=profileWindowLocalIndex(result.window,index);
  return local===undefined?unchanged:result.grid[local];
}
export function advancedResultTile(result:AdvancedResult,accepted:Int16Array,key:number,shape:TerrainGeometry):TerrainTile {
  const columns=shape.width/32,x=key%columns,y=Math.floor(key/columns),samples:number[]=[];
  for(let row=0;row<32;row++)for(let col=0;col<32;col++){
    const i=(y*32+row)*shape.width+x*32+col;samples.push(advancedResultSample(result,i,accepted[i]));
  }
  return {x,y,samples};
}
export function profilePreviewMeta(meta:RefinementMeta,w:ProfileWindow):RefinementMeta {
  return {...meta,id:meta.id+":profile-preview",parentId:meta.id,parentRevision:meta.revision,level:meta.level+1,
    frame:profileWindowFrame(w),gridWidth:w.width,gridHeight:w.height,overviewLevels:Math.log2(Math.min(w.width,w.height)/32)};
}

import type {TerrainGeometry} from "./terrain";
import {frameLocalPoint,normalizeTerrainX} from "./terrain-refinement";
import type {NumericalSampleLoader} from "./terrain-numerical-sampling";
import {regionAreaContainsPoint} from "./terrain-region-geometry";
import type {SharedProfile} from "./terrain-shared-relief";

export const SELECTED_RECONSTRUCTION_LIMIT=64;
// Reserve both bounded trace maps, their four-corner stacks and temporary proof.
export const SELECTED_RECONSTRUCTION_TRACE_BYTES=65536;
type Point={x:number;y:number};
type Node={sourceId:string;revision:number;x:number;y:number;weight:number;value:number;geometry:string};
export type SelectedReconstructionSupport={sourceId:string;beforeRevision:number;afterRevision:number;x:number;y:number;weight:number;before:number;after:number};

/** Read the established native bilinear reconstruction and retain only terminal
 * samples with a nonzero contribution. This is proof, never terrain input. The
 * ordinary hot sampler is unchanged. Every read/allocation is bounded/charged. */
async function trace(point:Point,id:string,revision:number,world:TerrainGeometry,load:NumericalSampleLoader,work:(n:number)=>void){
 const nodes=new Map<string,Node>();let lastYield=performance.now();
 async function read(point:Point,id:string,revision:number,weight:number,depth:number):Promise<number>{
  work(1);if(depth>8)throw Error("The reconstruction exceeds the native parent-depth bound.");
  if(performance.now()-lastYield>4){await new Promise<void>(resolve=>setTimeout(resolve,0));lastYield=performance.now();}
  const source=await load(id,revision),{shape,frame}=source;
  if(source.id!==id||source.revision!==revision||shape.displayWidth!==frame.width||shape.displayHeight!==frame.height)throw Error("The accepted reconstruction source geometry is incomplete.");
  const local=frameLocalPoint(point,frame,world.displayWidth,world.wrap),gx=local.x/shape.displayWidth*shape.width,gy=local.y/shape.displayHeight*shape.height,
   ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
  async function at(x:number,y:number,part:number){
   work(1);
   if(source.parentId&&(x<0||x>=shape.width||y<0||y>=shape.height)){
    if(source.parentRevision===null)throw Error("The retained numerical parent revision is missing.");
    return read({x:world.wrap?normalizeTerrainX(frame.x+x/shape.width*frame.width,world.displayWidth):Math.max(0,Math.min(world.displayWidth,frame.x+x/shape.width*frame.width)),y:Math.max(0,Math.min(world.displayHeight,frame.y+y/shape.height*frame.height))},source.parentId,source.parentRevision,part,depth+1);
   }
   const column=world.wrap&&!source.parentId?((x%shape.width)+shape.width)%shape.width:Math.max(0,Math.min(shape.width-1,x)),row=Math.max(0,Math.min(shape.height-1,y)),value=await source.at(column,row);
   if(!Number.isInteger(value)||value<shape.min||value>shape.max)throw Error("The accepted native reconstruction sample is invalid.");
   if(part>0){
    const key=id+":"+column+":"+row,prior=nodes.get(key),position={x:world.wrap?normalizeTerrainX(frame.x+column/shape.width*frame.width,world.displayWidth):Math.max(0,Math.min(world.displayWidth,frame.x+column/shape.width*frame.width)),y:Math.max(0,Math.min(world.displayHeight,frame.y+row/shape.height*frame.height))},geometry=JSON.stringify([frame.x,frame.y,frame.width,frame.height,shape.width,shape.height,shape.wrap]);
    if(!prior&&nodes.size>=SELECTED_RECONSTRUCTION_LIMIT)throw Error("Choose a simpler native join. Its reconstruction exceeds 64 contributing samples.");
    if(prior&&(prior.value!==value||prior.revision!==revision||prior.geometry!==geometry))throw Error("The immutable native reconstruction changed during review.");
    nodes.set(key,{sourceId:id,revision,x:position.x,y:position.y,value,geometry,weight:(prior?.weight??0)+part});
   }
   return value;
  }
  // Keep the reader's arithmetic and corner order exact, including zero-weight
  // reads. Only the proof omits samples which cannot influence this point.
  const a=await at(ix,iy,weight*(1-fx)*(1-fy)),b=await at(ix+1,iy,weight*fx*(1-fy)),c=await at(ix,iy+1,weight*(1-fx)*fy),d=await at(ix+1,iy+1,weight*fx*fy);
  return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy;
 }
 const value=await read(point,id,revision,1,0);return {value,nodes};
}

/** Certify the actual changed basis of an inherited point just outside an
 * outline. All changed contributing native samples must remain selected/dry;
 * no independent context change or invented halo height is authorized. */
export async function selectedNativeReconstruction(point:Point,id:string,beforeRevision:number,afterRevision:number,world:TerrainGeometry,
 selection:SharedProfile["selection"],seaLevel:number,beforeLoad:NumericalSampleLoader,afterLoad:NumericalSampleLoader,expected:{before:number;after:number},work:(n:number)=>void):Promise<SelectedReconstructionSupport[]>{
 const before=await trace(point,id,beforeRevision,world,beforeLoad,work),after=await trace(point,id,afterRevision,world,afterLoad,work);
 if(before.value!==expected.before||after.value!==expected.after||before.nodes.size!==after.nodes.size)throw Error("The selected reconstruction does not match its immutable native reader.");
 const result:SelectedReconstructionSupport[]=[],dimensions={width:world.displayWidth,height:world.displayHeight,wrap:world.wrap};
 for(const[key,a]of before.nodes){
  work(1);const b=after.nodes.get(key);
  if(!b||a.x!==b.x||a.y!==b.y||a.weight!==b.weight||a.geometry!==b.geometry)throw Error("The selected reconstruction requires unchanged native source frames and sample weights.");
  if(a.value===b.value)continue;
  work(selection.footprint?1+selection.footprint.parts.length+3*selection.footprint.parts.reduce((n,p)=>n+p.length,0):1);
  if(!regionAreaContainsPoint(selection,a,dimensions))throw Error("A changed contributing native sample lies outside the original selected outline. Keep its parent context.");
  if(a.value<=seaLevel||b.value<=seaLevel)throw Error("A selected reconstruction cannot change saved sea supports.");
  result.push({sourceId:a.sourceId,beforeRevision:a.revision,afterRevision:b.revision,x:a.x,y:a.y,weight:a.weight,before:a.value,after:b.value});
 }
 if(!result.length)throw Error("The changed border has no selected native reconstruction evidence.");
 return result;
}

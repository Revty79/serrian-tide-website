import {EMPTY_HYDROLOGY,hydroIdentity,hydroLayerSchema,type HydroAnalysis,type HydroCatchment,type HydroLake,type HydroLayer,type HydroPoint} from "./terrain-hydrology";
import type {HydroFlow} from "./terrain-hydrology-flow";
import {waterContours} from "./terrain-water-contours";
import {nearestWaterShore} from "./terrain-water-geometry";

export type WaterFlood={levels:Float64Array;parent:Int32Array;bytes:number;ms:number};
/** Priority-Flood: minimum maximum-height escape paths on the existing mesh.
 * Heights and 3A receivers remain immutable; parent pointers are only proposals. */
export function priorityWaterFlood(flow:HydroFlow,progress:(stage:string,value:number)=>void=()=>{}):WaterFlood{
  const start=performance.now(),{mesh}=flow,n=mesh.count,levels=new Float64Array(n),parent=new Int32Array(n).fill(-1),seen=new Uint8Array(n),heap=new Int32Array(n);let size=0,processed=0;
  const less=(a:number,b:number)=>levels[a]<levels[b]||levels[a]===levels[b]&&a<b;
  const push=(id:number)=>{let i=size++;while(i){const p=(i-1)>>1;if(!less(id,heap[p]))break;heap[i]=heap[p];i=p;}heap[i]=id;};
  const pop=()=>{const id=heap[0],last=heap[--size];let i=0;while(i*2+1<size){let child=i*2+1;if(child+1<size&&less(heap[child+1],heap[child]))child++;if(!less(heap[child],last))break;heap[i]=heap[child];i=child;}if(size)heap[i]=last;return id;};
  for(let id=0;id<n;id++)if(mesh.boundary(id)||mesh.heights[id]<=flow.seaLevel){seen[id]=1;levels[id]=mesh.heights[id];push(id);}
  while(size){const id=pop();for(let j=mesh.offsets[id];j<mesh.offsets[id+1];j++){const next=mesh.neighbors[j];if(seen[next])continue;seen[next]=1;levels[next]=Math.max(mesh.heights[next],levels[id]);parent[next]=id;push(next);}if(++processed%32768===0)progress("Reviewing potential lake spills",processed/n);}
  if(processed!==n)throw Error("A terrain component is missing an external drainage context.");
  return {levels,parent,bytes:levels.byteLength+parent.byteLength+seen.byteLength+heap.byteLength,ms:performance.now()-start};
}
export function suggestedLakes(flow:HydroFlow,flood:WaterFlood,analysis:HydroAnalysis){
  const {mesh}=flow,n=mesh.count,seen=new Uint8Array(n),queue=new Int32Array(n),lakes:HydroLake[]=[];
  for(let start=0;start<n;start++)if(!seen[start]&&flood.levels[start]>mesh.heights[start]+1e-5&&mesh.heights[start]>flow.seaLevel){
    let head=0,tail=1,seed=start,area=0;queue[0]=start;seen[start]=1;const level=flood.levels[start];
    while(head<tail){const id=queue[head++];area+=mesh.cellArea(id);if(mesh.heights[id]<mesh.heights[seed]||mesh.heights[id]===mesh.heights[seed]&&id<seed)seed=id;for(let j=mesh.offsets[id];j<mesh.offsets[id+1];j++){const next=mesh.neighbors[j];if(!seen[next]&&Math.abs(flood.levels[next]-level)<1e-5&&mesh.heights[next]<level-1e-5&&mesh.heights[next]>flow.seaLevel){seen[next]=1;queue[tail++]=next;}}}
    const p=mesh.point(seed),f=analysis.focus,dx=mesh.world.wrap?((p.x-f.x)%mesh.world.width+mesh.world.width)%mesh.world.width:p.x-f.x;
    if(dx<0||dx>=f.width||p.y<f.y||p.y>=f.y+f.height||area<(analysis.lakeMinimumAreaM2??analysis.minimumAreaM2)||level-mesh.heights[seed]<(analysis.lakeMinimumDepthM??2))continue;
    if(lakes.length>=64)throw Error("More than 64 potential lakes need review. Choose a smaller geography or larger minimum lake area.");
    const levelM=mesh.heights[seed]+(level-mesh.heights[seed])*.9,ids=Array.from(queue.subarray(0,tail)),contour=waterContours(mesh,ids,levelM,p),sourceIds=[...new Set(ids.map(id=>mesh.patches[mesh.sourceIds[id]].source.id))];
    lakes.push({id:hydroIdentity("lake",mesh.patches[mesh.sourceIds[seed]].source.id+"/"+p.x+"/"+p.y),name:`Potential lake ${lakes.length+1}`,rings:contour.rings,levelM,seed:p,spillM:level,condition:"potential",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"derived",exceptionReason:"",protected:false,analysisId:analysis.id,sourceIds,review:false});
  }
  return lakes;
}
export function reviewLakeLevel(flow:HydroFlow,flood:WaterFlood,lake:HydroLake,levelM:number,spillOutlet:boolean,analysis:HydroAnalysis):HydroLayer{
  const {mesh}=flow,seed=mesh.locate(lake.seed);if(seed<0)throw Error("This lake has no accepted numerical coverage.");const spill=flood.levels[seed];if(levelM>spill+1e-5)throw Error("This level exceeds the computed spill. Use an explicit authored shoreline and exception for a dam or magical waterbody.");if(spillOutlet&&Math.abs(levelM-spill)>1e-5)throw Error("A natural spill outlet requires the proposed spill water level.");
  const seen=new Uint8Array(mesh.count),queue=new Int32Array(mesh.count);let head=0,tail=1;queue[0]=seed;seen[seed]=1;
  while(head<tail){const id=queue[head++];for(let j=mesh.offsets[id];j<mesh.offsets[id+1];j++){const next=mesh.neighbors[j];if(!seen[next]&&mesh.heights[next]<levelM-1e-6&&flood.levels[next]>=levelM-1e-5){seen[next]=1;queue[tail++]=next;}}}
  const ids=Array.from(queue.subarray(0,tail)),contour=waterContours(mesh,ids,levelM,lake.seed),updated:HydroLake={...lake,rings:contour.rings,levelM,spillM:spill,mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"derived",analysisId:analysis.id,sourceIds:[...new Set(ids.map(id=>mesh.patches[mesh.sourceIds[id]].source.id))],review:false};
  const layer:HydroLayer={...EMPTY_HYDROLOGY,systemVersion:2,lakes:[updated],catchments:[],analyses:[analysis],nodes:[],edges:[]};
  if(!spillOutlet)return layer;
  let current=seed;const path:number[]=[];while(current>=0&&seen[current])current=flood.parent[current];
  if(current<0)throw Error("No external spill route was resolved. Keep this lake closed or define an explicit outlet.");
  while(current>=0){path.push(current);if(path.length>8192)throw Error("This outlet exceeds its bounded path budget.");if(flood.levels[current]>mesh.heights[current]+.01)throw Error("This spill enters another potential impoundment. Review that lake or connect the waterbodies deliberately.");if(mesh.heights[current]<=flow.seaLevel||mesh.boundary(current))break;current=flood.parent[current];}
  if(path.length<2)throw Error("The outlet has no resolved downstream channel.");
  const shore=nearestWaterShore(mesh.point(path[0]),updated.rings,mesh.world).point,outletId=hydroIdentity("lake-outlet",lake.id),last=path.at(-1)!,destinationId=hydroIdentity("spill-destination",lake.id+"/"+mesh.point(last).x+"/"+mesh.point(last).y);
  updated.mode="outlet";updated.outletNodeId=outletId;layer.nodes=[{id:outletId,point:shore,kind:"lake-outlet",elevationM:levelM,drainageM2:flow.area[seed],spillM:spill,lakeId:lake.id},{id:destinationId,point:mesh.point(last),kind:mesh.heights[last]<=flow.seaLevel?"sea-outlet":"boundary-outlet",elevationM:mesh.heights[last],drainageM2:flow.area[seed],spillM:null}];
  const points=[shore,...path.map(id=>mesh.point(id))];if(points.length>512)throw Error("This outlet needs more than 512 control points. Use a shorter authored connection or review a smaller drainage network.");
  layer.edges=[{id:hydroIdentity("lake-channel",lake.id),from:outletId,to:destinationId,name:`${lake.name} outlet`,points,drainageM2:flow.area[seed],flowKind:"derived",exceptionReason:"",protected:false,analysisId:analysis.id,sourceIds:updated.sourceIds}];return hydroLayerSchema.parse(layer);
}
export function traceWatershed(flow:HydroFlow,analysis:HydroAnalysis,point:HydroPoint):HydroCatchment{
  const {mesh}=flow,start=mesh.locate(point);if(start<0)throw Error("Choose a drainage destination inside the map.");
  const selected=new Uint8Array(mesh.count),reverse=new Int32Array(mesh.count).fill(-1),next=new Int32Array(mesh.count).fill(-1),queue=new Int32Array(mesh.count);for(let i=0;i<mesh.count;i++){const to=flow.receiver[i];if(to>=0){next[i]=reverse[to];reverse[to]=i;}}
  let head=0,tail=1,area=0;queue[0]=start;selected[start]=1;while(head<tail){const id=queue[head++];if(mesh.heights[id]>flow.seaLevel)area+=mesh.cellArea(id);for(let i=reverse[id];i>=0;i=next[i])if(!selected[i]){selected[i]=1;queue[tail++]=i;}}
  if(area<=0)throw Error("This point has no upstream land contributing to it.");const ids=Array.from(queue.subarray(0,tail)),terminal=flow.outlet[start],kind=terminal!==start?"tributary":mesh.heights[terminal]<=flow.seaLevel?"coastal":mesh.boundary(terminal)?"fixed-edge":"inland",contour=waterContours(mesh,ids,null,mesh.point(start)),identity=(id:number)=>hydroIdentity("watershed",mesh.patches[mesh.sourceIds[id]].source.id+"/"+mesh.point(id).x+"/"+mesh.point(id).y);
  return {...contour.frameMode?{frameMode:contour.frameMode}:{},id:identity(start),name:kind==="tributary"?"Tributary catchment":"Terminal drainage basin",rings:contour.rings,outlet:mesh.point(start),terminal:mesh.point(terminal),kind,areaM2:area,analysisId:analysis.id,sourceIds:[...new Set(ids.map(id=>mesh.patches[mesh.sourceIds[id]].source.id))],parentId:terminal===start?null:identity(terminal),samplingM:contour.samplingM};
}

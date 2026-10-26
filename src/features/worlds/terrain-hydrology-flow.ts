import {EMPTY_HYDROLOGY,HYDROLOGY_LIMITS,hydroIdentity,hydroLayerSchema,type HydroAnalysis,type HydroLayer,type HydroNode,type HydroPoint,type HydroSources} from "./terrain-hydrology";
import {HydroMesh,type HydroPatch} from "./terrain-hydrology-mesh";
import type {TerrainFrame} from "./terrain-refinement";

const EPS=1e-8;
export type HydroFlow={mesh:HydroMesh;receiver:Int32Array;area:Float64Array;outlet:Int32Array;spill:Float64Array;seaLevel:number;metrics:{nodes:number;landAreaM2:number;seaOutlets:number;closedBasins:number;boundaryOutlets:number;workingBytes:number;analysisMs:number}};
export type HydroRequest={sources:HydroSources;patches:HydroPatch[];focus:TerrainFrame;minimumAreaM2:number};
function distance(mesh:HydroMesh,a:number,b:number){const aa=a*4,bb=b*4;let x=(mesh.bounds[aa]+mesh.bounds[aa+2]-mesh.bounds[bb]-mesh.bounds[bb+2])/2;if(mesh.world.wrap)x-=Math.round(x/mesh.world.width)*mesh.world.width;const y=(mesh.bounds[aa+1]+mesh.bounds[aa+3]-mesh.bounds[bb+1]-mesh.bounds[bb+3])/2;return Math.hypot(x,y);}

/** Steepest physical descent, breadth-first flat routing and retained closed
 * sinks. No depression filling, terrain carving or precipitation is implied. */
export function calculateHydroFlow(input:HydroRequest,progress:(stage:string,value:number)=>void=()=>{}):HydroFlow{
  const started=performance.now(),mesh=new HydroMesh(input.sources.world,input.patches,progress),n=mesh.count,receiver=new Int32Array(n).fill(-2),area=new Float64Array(n),queue=new Int32Array(n),outlet=new Int32Array(n),spill=new Float64Array(n).fill(Infinity),sea=input.sources.seaLevel;
  let head=0,tail=0,landArea=0;
  for(let id=0;id<n;id++){
    const z=mesh.heights[id];if(z<=sea){receiver[id]=-1;continue;}area[id]=mesh.cellArea(id);landArea+=area[id];let best=-1,slope=0;
    for(let j=mesh.offsets[id];j<mesh.offsets[id+1];j++){const other=mesh.neighbors[j],drop=z-mesh.heights[other];if(drop<=EPS)continue;const grade=drop/Math.max(1e-9,distance(mesh,id,other));if(grade>slope+1e-14||Math.abs(grade-slope)<=1e-14&&(best<0||other<best)){slope=grade;best=other;}}
    if(best>=0)receiver[id]=best;else if(mesh.boundary(id))receiver[id]=-1;
    if(receiver[id]!==-2)queue[tail++]=id;
    if(id%32768===0)progress("Following downhill terrain",.75+id/n*.07);
  }
  // Equal-height components drain toward known lower exits. Stable node order
  // resolves ties; each new receiver points to an already resolved flat cell.
  while(head<tail){const id=queue[head++];for(let j=mesh.offsets[id];j<mesh.offsets[id+1];j++){const other=mesh.neighbors[j];if(receiver[other]===-2&&Math.abs(mesh.heights[other]-mesh.heights[id])<=EPS){receiver[other]=id;queue[tail++]=other;}}}
  for(let start=0;start<n;start++)if(receiver[start]===-2){head=0;tail=1;queue[0]=start;receiver[start]=-1;while(head<tail){const id=queue[head++];for(let j=mesh.offsets[id];j<mesh.offsets[id+1];j++){const other=mesh.neighbors[j];if(receiver[other]===-2&&Math.abs(mesh.heights[other]-mesh.heights[id])<=EPS){receiver[other]=id;queue[tail++]=other;}}}}
  const incoming=new Int32Array(n),order=new Int32Array(n);for(let id=0;id<n;id++)if(receiver[id]>=0)incoming[receiver[id]]++;
  head=0;tail=0;for(let id=0;id<n;id++)if(!incoming[id])queue[tail++]=id;
  let count=0;while(head<tail){const id=queue[head++];order[count++]=id;const to=receiver[id];if(to>=0){area[to]+=area[id];if(--incoming[to]===0)queue[tail++]=to;}}
  if(count!==n)throw Error("Drainage routing produced a flow loop; the suggestion was discarded.");
  for(let i=n-1;i>=0;i--){const id=order[i];outlet[id]=receiver[id]<0?id:outlet[receiver[id]];}
  let seaOutlets=0,closedBasins=0,boundaryOutlets=0;
  for(let id=0;id<n;id++)if(receiver[id]<0&&area[id]>0){if(mesh.heights[id]<=sea)seaOutlets++;else if(mesh.boundary(id))boundaryOutlets++;else closedBasins++;}
  // Diagnostic potential spill level only. Accepted elevations and receivers
  // remain unchanged; closed basins are not silently forced through their rims.
  for(let id=0;id<n;id++){const sink=outlet[id];if(mesh.heights[sink]<=sea||mesh.boundary(sink))continue;if(mesh.boundary(id))spill[sink]=Math.min(spill[sink],mesh.heights[id]);for(let j=mesh.offsets[id];j<mesh.offsets[id+1];j++){const other=mesh.neighbors[j];if(outlet[other]!==sink)spill[sink]=Math.min(spill[sink],Math.max(mesh.heights[id],mesh.heights[other]));}}
  progress("Reviewing connected drainage",1);
  return {mesh,receiver,area,outlet,spill,seaLevel:sea,metrics:{nodes:n,landAreaM2:landArea,seaOutlets,closedBasins,boundaryOutlets,workingBytes:mesh.bytes+receiver.byteLength+area.byteLength+outlet.byteLength+spill.byteLength+queue.byteLength+incoming.byteLength+order.byteLength,analysisMs:performance.now()-started}};
}

function inFocus(p:HydroPoint,focus:TerrainFrame,width:number,wrap:boolean){const x=wrap?((p.x-focus.x)%width+width)%width:p.x-focus.x;return x>=0&&x<focus.width&&p.y>=focus.y&&p.y<focus.y+focus.height;}
function collinear(mesh:HydroMesh,a:number,b:number,c:number){const aa=mesh.point(a),bb=mesh.point(b),cc=mesh.point(c);let x=bb.x-aa.x,xx=cc.x-bb.x;if(mesh.world.wrap){x-=Math.round(x/mesh.world.width)*mesh.world.width;xx-=Math.round(xx/mesh.world.width)*mesh.world.width;}const y=bb.y-aa.y,yy=cc.y-bb.y;return x*xx+y*yy>=0&&Math.abs(x*yy-y*xx)<=1e-10*Math.max(1,Math.hypot(x,y)*Math.hypot(xx,yy));}

export function hydroSuggestions(flow:HydroFlow,analysis:HydroAnalysis,sourcePoint?:HydroPoint):HydroLayer{
  const {mesh,receiver,area}=flow,n=mesh.count,selected=new Uint8Array(n),incoming=new Int32Array(n);
  const mark=(start:number)=>{let id=start;while(id>=0&&!selected[id]){selected[id]=1;id=receiver[id];}};
  if(sourcePoint){const source=mesh.locate(sourcePoint);if(source<0||mesh.heights[source]<=flow.seaLevel)throw Error("Place a river source on saved land. Water already below sea level is not a river source.");mark(source);}
  else for(let id=0;id<n;id++)if(mesh.heights[id]>flow.seaLevel&&area[id]>=Math.max(analysis.minimumAreaM2,mesh.cellArea(id)*4)&&inFocus(mesh.point(id),analysis.focus,mesh.world.width,mesh.world.wrap))mark(id);
  for(let id=0;id<n;id++)if(selected[id]&&receiver[id]>=0)incoming[receiver[id]]++;
  const globalIncoming=new Int32Array(n);for(let id=0;id<n;id++)if(receiver[id]>=0&&area[id]>0)globalIncoming[receiver[id]]++;
  const junction=(id:number)=>incoming[id]!==1||globalIncoming[id]>1||receiver[id]<0;
  const starts:number[]=[];for(let id=0;id<n;id++)if(selected[id]&&junction(id))starts.push(id);
  const nodes=new Map<number,HydroNode>(),edges:HydroLayer["edges"]=[],done=new Set<number>();let points=0;
  const node=(id:number)=>{
    if(nodes.has(id))return nodes.get(id)!;const point=mesh.point(id),source=mesh.patches[mesh.sourceIds[id]].source,offset=id*4;
    const kind:HydroNode["kind"]=receiver[id]<0?mesh.heights[id]<=flow.seaLevel?"sea-outlet":mesh.boundary(id)?"boundary-outlet":"closed-sink":incoming[id]===0?"source":incoming[id]>1?"confluence":"channel";
    const value:HydroNode={id:hydroIdentity("node",source.id+"/"+Array.from(mesh.bounds.subarray(offset,offset+4)).map(n=>n.toPrecision(17)).join("/")),point,kind,elevationM:mesh.heights[id],drainageM2:area[id],spillM:Number.isFinite(flow.spill[id])?flow.spill[id]:null};nodes.set(id,value);return value;
  };
  for(let index=0;index<starts.length;index++){
    const start=starts[index];if(done.has(start)||receiver[start]<0)continue;done.add(start);const path=[start];let cursor=receiver[start];
    while(cursor>=0){if(path.length>=2&&collinear(mesh,path[path.length-2],path.at(-1)!,cursor))path.pop();path.push(cursor);if(junction(cursor))break;if(path.length>=512){starts.push(cursor);break;}cursor=receiver[cursor];}
    if(path.length<2)continue;const from=node(start),to=node(path.at(-1)!);points+=path.length;
    edges.push({id:hydroIdentity("channel",from.id+"/"+to.id),from:from.id,to:to.id,name:`Waterway ${edges.length+1}`,points:path.map(id=>mesh.point(id)),drainageM2:area[start],flowKind:"derived",exceptionReason:"",protected:false,analysisId:analysis.id});
    if(edges.length>HYDROLOGY_LIMITS.edges||nodes.size>HYDROLOGY_LIMITS.nodes||points>HYDROLOGY_LIMITS.points)throw Error("Too many waterways for one review. Increase the minimum drainage area or analyse the current view. Saved waterways are retained.");
  }
  return hydroLayerSchema.parse({...EMPTY_HYDROLOGY,analyses:edges.length?[analysis]:[],nodes:[...nodes.values()],edges});
}

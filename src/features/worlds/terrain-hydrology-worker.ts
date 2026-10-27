import {naturalWaterSuggestions} from "./terrain-water-natural";
import {suggestWaterFeatures} from "./terrain-water-feature-analysis";
import {averageHydroGrid} from "./terrain-hydrology-mesh";
import {calculateHydroFlow,hydroSuggestions,type HydroFlow,type HydroRequest} from "./terrain-hydrology-flow";
import {EMPTY_HYDROLOGY,type HydroAnalysis,type HydroCatchment,type HydroLake,type HydroLayer,type HydroPoint} from "./terrain-hydrology";
import {priorityWaterFlood,suggestedLakes,reviewLakeLevel,traceWatershed,type WaterFlood} from "./terrain-water-basins";
import {WATER_CONTOUR_MAX_BYTES} from "./terrain-water-contours";
import {riversIntoLakes} from "./terrain-water-network";
export type HydroWorkerRequest={type:"analyse";input:HydroRequest;analysis:HydroAnalysis;prepareOnly?:boolean}|{type:"suggest";analysis:HydroAnalysis;point?:HydroPoint}|{type:"watershed";analysis:HydroAnalysis;point:HydroPoint}|{type:"lake-level";analysis:HydroAnalysis;lake:HydroLake;levelM:number;spillOutlet:boolean}|{type:"features";analysis:HydroAnalysis;layer:HydroLayer}|{type:"review";layer:HydroLayer};
type Metrics=HydroFlow["metrics"];
export type HydroWorkerReply={type:"progress";stage:string;value:number}|{type:"result";layer:HydroLayer;metrics:Metrics}|{type:"watershed";catchment:HydroCatchment;analysis:HydroAnalysis;metrics:Metrics}|{type:"lake-review";layer:HydroLayer;metrics:Metrics}|{type:"review";issues:{id:string;message:string}[]}|{type:"features";layer:HydroLayer;metrics:{samples:number;elapsedMs:number;estimatedWorkingBytes:number;omittedContours:string[]}}|{type:"error";message:string};
const endpoint=globalThis as unknown as {onmessage:((event:MessageEvent<HydroWorkerRequest>)=>void)|null;postMessage:(value:HydroWorkerReply)=>void};
let flow:HydroFlow|undefined,flood:WaterFlood|undefined;
endpoint.onmessage=event=>{try{
 const request=event.data;
 if(request.type==="analyse"){const patches=request.input.patches.map(p=>p.source.level===0&&p.lod>0?{...p,grid:averageHydroGrid(p.grid,p.source.gridWidth,p.source.gridHeight,p.lod)}:p);flow=calculateHydroFlow({...request.input,patches},(stage,value)=>endpoint.postMessage({type:"progress",stage,value}));flood=undefined;}
 if(!flow)throw Error("Suggest rivers first to prepare this map's accepted drainage.");
 const getFlood=()=>flood??=priorityWaterFlood(flow!,(stage,value)=>endpoint.postMessage({type:"progress",stage,value}));
 if(request.type==="review"){
  const issues:{id:string;message:string}[]=[];
  for(const edge of request.layer.edges){for(let i=1;i<edge.points.length;i++){const a=flow.mesh.sampleAt(edge.points[i-1]),b=flow.mesh.sampleAt(edge.points[i]);if(b>a+2){issues.push({id:edge.id,message:"This path climbs the current sampled ground. Review it or retain a described creative exception."});break;}}const to=request.layer.nodes.find(n=>n.id===edge.to);if(to?.kind==="open-end")issues.push({id:edge.id,message:"This channel has an intentionally detached end; choose an outlet or reconnect it."});}
  for(const lake of request.layer.lakes??[]){const seed=flow.mesh.locate(lake.seed),currentSpill=seed>=0?getFlood().levels[seed]:null;if(lake.mode==="outlet"&&currentSpill!==null&&lake.levelM<currentSpill-.01&&lake.flowKind!=="exception")issues.push({id:lake.id,message:"Current terrain puts the natural spill above this water surface. Review the outlet or retain a described creative exception."});if(lake.rings.some(r=>r.some(p=>flow!.mesh.sampleAt(p)>lake.levelM+2)))issues.push({id:lake.id,message:"Some shoreline ground stands above this water level. Review the surface extent or describe an authored exception."});if(lake.mode==="outlet"&&lake.spillM!==null&&lake.levelM<lake.spillM-.01&&lake.flowKind!=="exception")issues.push({id:lake.id,message:"This surface lies below its natural spill. Review the outlet or describe a constructed/magical exception."});if(lake.review)issues.push({id:lake.id,message:"Shoreline or level changed; its connected river ports need review."});}
  endpoint.postMessage({type:"review",issues});return;
 }
 if(request.type==="features"){const result=suggestWaterFeatures(flow,request.analysis,request.layer);endpoint.postMessage({type:"features",layer:result.layer,metrics:{samples:result.samples,elapsedMs:result.elapsedMs,estimatedWorkingBytes:result.estimatedWorkingBytes,omittedContours:result.omittedContours}});return;}
 if(request.type==="watershed"){endpoint.postMessage({type:"watershed",catchment:traceWatershed(flow,request.analysis,request.point),analysis:request.analysis,metrics:flow.metrics});return;}
 if(request.type==="lake-level"){const f=getFlood();endpoint.postMessage({type:"lake-review",layer:reviewLakeLevel(flow,f,request.lake,request.levelM,request.spillOutlet,request.analysis),metrics:{...flow.metrics,analysisMs:flow.metrics.analysisMs+f.ms,workingBytes:flow.metrics.workingBytes+f.bytes+flow.mesh.count*5+WATER_CONTOUR_MAX_BYTES}});return;}
 if(request.type==="analyse"&&request.prepareOnly){endpoint.postMessage({type:"result",layer:EMPTY_HYDROLOGY,metrics:flow.metrics});return;}
 const natural=request.analysis.method==="terrain-natural-v3"&&!(request.type==="suggest"&&request.point)?naturalWaterSuggestions(flow,request.analysis):undefined;
 let layer=natural?.layer??hydroSuggestions(flow,request.analysis,request.type==="suggest"?request.point:undefined),metrics=natural?{...flow.metrics,naturalSelection:natural.diagnostics,workingBytes:flow.metrics.workingBytes+natural.diagnostics.bytes}:flow.metrics;
 if(request.analysis.method!=="terrain-drainage-v1"&&!(request.type==="suggest"&&request.point)){const f=getFlood(),lakes=suggestedLakes(flow,f,request.analysis);layer=riversIntoLakes({...layer,analyses:lakes.length&&!layer.analyses.some(a=>a.id===request.analysis.id)?[...layer.analyses,request.analysis]:layer.analyses},lakes,flow.mesh.world);metrics={...metrics,analysisMs:metrics.analysisMs+f.ms,workingBytes:metrics.workingBytes+f.bytes+flow.mesh.count*5+WATER_CONTOUR_MAX_BYTES};}
 endpoint.postMessage({type:"result",layer,metrics});
}catch(e){endpoint.postMessage({type:"error",message:e instanceof Error?e.message:"Drainage analysis could not finish."});}};

import {averageHydroGrid} from "./terrain-hydrology-mesh";
import {calculateHydroFlow,hydroSuggestions,type HydroFlow,type HydroRequest} from "./terrain-hydrology-flow";
import type {HydroAnalysis,HydroPoint} from "./terrain-hydrology";

export type HydroWorkerRequest={type:"analyse";input:HydroRequest;analysis:HydroAnalysis}|{type:"suggest";analysis:HydroAnalysis;point?:HydroPoint};
export type HydroWorkerReply={type:"progress";stage:string;value:number}|{type:"result";layer:ReturnType<typeof hydroSuggestions>;metrics:HydroFlow["metrics"]}|{type:"error";message:string};
const endpoint=globalThis as unknown as {onmessage:((event:MessageEvent<HydroWorkerRequest>)=>void)|null;postMessage:(value:HydroWorkerReply)=>void};
let flow:HydroFlow|undefined;
endpoint.onmessage=event=>{try{const request=event.data;if(request.type==="analyse"){
  const patches=request.input.patches.map(p=>p.source.level===0&&p.lod>0?{...p,grid:averageHydroGrid(p.grid,p.source.gridWidth,p.source.gridHeight,p.lod)}:p);
  flow=calculateHydroFlow({...request.input,patches},(stage,value)=>endpoint.postMessage({type:"progress",stage,value}));
}if(!flow)throw Error("Suggest rivers first to prepare this map's accepted drainage.");endpoint.postMessage({type:"result",layer:hydroSuggestions(flow,request.analysis,request.type==="suggest"?request.point:undefined),metrics:flow.metrics});}catch(e){endpoint.postMessage({type:"error",message:e instanceof Error?e.message:"Drainage analysis could not finish."});}};

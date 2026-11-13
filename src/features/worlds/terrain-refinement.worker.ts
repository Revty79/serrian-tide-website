import {initializeRefinementAsync,type TerrainFrame} from "./terrain-refinement";
import type {TerrainGeometry} from "./terrain";
import type {RefinementMeta} from "./terrain-refinement";
import {initializeExpandedRefinement,type RefinementExpansionDimensions} from "./terrain-refinement-expansion";
type Job={base:ArrayBuffer;parent:TerrainGeometry;parentFrame:TerrainFrame;frame:TerrainFrame;width:number;height:number;world:TerrainGeometry;expansion?:{grid:ArrayBuffer;meta:RefinementMeta;dimensions:RefinementExpansionDimensions}};
const scope=self as unknown as {onmessage:(e:MessageEvent<Job>)=>void;postMessage:(v:unknown,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{try{const progress=(value:number)=>{if(Math.round(value*100)%5===0)scope.postMessage({progress:value});};const grid=data.expansion?(await initializeExpandedRefinement(new Int16Array(data.expansion.grid),data.expansion.meta,new Int16Array(data.base),data.parent,data.parentFrame,data.world,data.expansion.dimensions,progress)).grid:await initializeRefinementAsync(new Int16Array(data.base),data.parent,data.parentFrame,data.frame,data.width,data.height,data.world,progress);scope.postMessage({grid:grid.buffer},[grid.buffer]);}catch(e){scope.postMessage({error:e instanceof Error?e.message:"The inherited terrain could not be prepared."});}};

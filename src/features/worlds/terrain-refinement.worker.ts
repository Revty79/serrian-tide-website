import {initializeRefinement,type TerrainFrame} from "./terrain-refinement";
import type {TerrainGeometry} from "./terrain";
type Job={base:ArrayBuffer;parent:TerrainGeometry;parentFrame:TerrainFrame;frame:TerrainFrame;width:number;height:number;world:TerrainGeometry};
const scope=self as unknown as {onmessage:(e:MessageEvent<Job>)=>void;postMessage:(v:unknown,transfer?:Transferable[])=>void};
scope.onmessage=({data})=>{try{const grid=initializeRefinement(new Int16Array(data.base),data.parent,data.parentFrame,data.frame,data.width,data.height,data.world);scope.postMessage({grid:grid.buffer},[grid.buffer]);}catch(e){scope.postMessage({error:e instanceof Error?e.message:"The inherited terrain could not be prepared."});}};

import {prepareTerrainOperationJob} from "./terrain-operation-engine";
import type {TerrainOperationJob,TerrainOperationReply} from "./terrain-operation-job";
const scope=self as unknown as {onmessage:(event:MessageEvent<TerrainOperationJob>)=>void;postMessage:(data:TerrainOperationReply,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{try{const result=await prepareTerrainOperationJob(data,progress=>scope.postMessage({type:"progress",progress}));scope.postMessage(result,[result.grid,result.indices,result.before,result.after]);}catch(error){scope.postMessage({type:"error",message:error instanceof Error?error.message:"The terrain operation could not be prepared."});}};

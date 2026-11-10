import {prepareTerrainPreview} from "./terrain-preview-engine";
import type {TerrainPreviewJob,TerrainPreviewReply} from "./terrain-preview-job";
const scope=self as unknown as {onmessage:(event:MessageEvent<TerrainPreviewJob>)=>void;postMessage:(message:TerrainPreviewReply,transfer?:Transferable[])=>void};
scope.onmessage=async({data})=>{try{const result=await prepareTerrainPreview(data,progress=>scope.postMessage({type:"progress",progress}));scope.postMessage(result,[result.grid]);}catch(error){scope.postMessage({type:"error",message:error instanceof Error?error.message:"The terrain preview could not be prepared."});}};

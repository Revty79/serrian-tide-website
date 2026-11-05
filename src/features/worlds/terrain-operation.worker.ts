import {prepareTerrainOperation} from "./terrain-operations";
import {prepareAdvancedTerrainAsync} from "./terrain-advanced";
import type {TerrainOperationJob,TerrainOperationReply} from "./terrain-operation-job";
const scope=self as unknown as {
  onmessage:(event:MessageEvent<TerrainOperationJob>)=>void;
  postMessage:(data:TerrainOperationReply,transfer?:Transferable[])=>void;
};
scope.onmessage=async({data})=>{
  try{
    const started=performance.now(),base=new Int16Array(data.base),
      blocked=data.blocked?new Uint8Array(data.blocked):undefined,
      progress=(progress:number)=>scope.postMessage({type:"progress",progress});
    if("selection" in data.operation){
      if(!data.context)throw Error("The advanced proposal has no accepted geographic context.");
      const r=await prepareAdvancedTerrainAsync(base,data.shape,data.operation,data.context,blocked,data.manual?new Uint8Array(data.manual):undefined,progress),
        grid=r.grid.buffer as ArrayBuffer,indices=r.patch.indices.buffer as ArrayBuffer,
        before=r.patch.before.buffer as ArrayBuffer,after=r.patch.after.buffer as ArrayBuffer;
      scope.postMessage({type:"ready",grid,indices,before,after,...r.metrics,advancedMetrics:r.metrics,elapsedMs:performance.now()-started},[grid,indices,before,after]);
    }else{
      const r=prepareTerrainOperation(base,data.shape,data.operation,progress,blocked),grid=r.grid.buffer as ArrayBuffer,
        indices=Uint32Array.from(r.patch.indices).buffer,before=Int16Array.from(r.patch.before).buffer,after=Int16Array.from(r.patch.after).buffer;
      scope.postMessage({type:"ready",grid,indices,before,after,changed:r.changed,minimum:r.minimum,maximum:r.maximum,elapsedMs:performance.now()-started},[grid,indices,before,after]);
    }
  }catch(e){scope.postMessage({type:"error",message:e instanceof Error?e.message:"The terrain operation could not be prepared."});}
};

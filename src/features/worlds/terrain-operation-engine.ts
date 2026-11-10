import {prepareTerrainOperationAsync} from "./terrain-operations";
import {prepareAdvancedTerrainAsync} from "./terrain-advanced";
import type {TerrainOperationJob,TerrainOperationReply} from "./terrain-operation-job";
export async function prepareTerrainOperationJob(data:TerrainOperationJob,progress:(n:number)=>void=()=>{},signal?:AbortSignal):Promise<Extract<TerrainOperationReply,{type:"ready"}>>{
    const started=performance.now(),base=new Int16Array(data.base),
      blocked=data.blocked?new Uint8Array(data.blocked):undefined,
      report=(value:number)=>progress(value);
    if("selection" in data.operation){
      if(!data.context)throw Error("The advanced proposal has no accepted geographic context.");
      const r=await prepareAdvancedTerrainAsync(base,data.shape,data.operation,data.context,blocked,data.manual?new Uint8Array(data.manual):undefined,report,signal),
        grid=r.grid.buffer as ArrayBuffer,indices=r.patch.indices.buffer as ArrayBuffer,
        before=r.patch.before.buffer as ArrayBuffer,after=r.patch.after.buffer as ArrayBuffer;
      return {type:"ready",grid,indices,before,after,...r.metrics,advancedMetrics:r.metrics,elapsedMs:performance.now()-started};
    }else{
      const r=await prepareTerrainOperationAsync(base,data.shape,data.operation,report,blocked,undefined,undefined,signal),grid=r.grid.buffer as ArrayBuffer,
        indices=Uint32Array.from(r.patch.indices).buffer,before=Int16Array.from(r.patch.before).buffer,after=Int16Array.from(r.patch.after).buffer;
      return {type:"ready",grid,indices,before,after,changed:r.changed,minimum:r.minimum,maximum:r.maximum,elapsedMs:performance.now()-started};
    }

}

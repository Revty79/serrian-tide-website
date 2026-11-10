import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import {getHeapStatistics} from "node:v8";
import {WorldError} from "./world-errors";
const allocation=new AsyncLocalStorage<boolean>();let largeTask=false;
/** One large numerical acceptance per process; nested native writers share it. */
export async function withTerrainResourceBudget<T>(samples:number,run:()=>Promise<T>):Promise<T>{
 if(samples<=1048576||allocation.getStore())return run();
 if(largeTask)throw new WorldError("Another high-detail terrain operation is being accepted. Your settings and original save are retained; retry shortly.",429);
 const heap=getHeapStatistics(),workingAllowance=samples*32+64*1024*1024;
 if(heap.heap_size_limit-heap.used_heap_size<workingAllowance)throw new WorldError("The server has insufficient numerical working memory for this operation right now. Your accepted geography is unchanged. Retry later or prepare a smaller source; no existing map was reduced.",503);
 largeTask=true;try{return await allocation.run(true,run);}finally{largeTask=false;}
}

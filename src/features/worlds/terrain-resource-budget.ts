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
/** Bounded native multi-source work shares the existing process admission gate.
 * Bytes describe its actual workspace reserve rather than a fictitious grid. */
export async function withTerrainNumericalWorkspace<T>(bytes:number,run:()=>Promise<T>):Promise<T>{
 if(!Number.isFinite(bytes)||bytes<=0||bytes>32*1048576)throw new WorldError("The numerical workspace exceeds its existing 32 MiB bound.",400);
 if(allocation.getStore())return run();
 if(largeTask)throw new WorldError("Another high-detail terrain operation is being prepared. Your settings and original save are retained; retry shortly.",429);
 const heap=getHeapStatistics();if(heap.heap_size_limit-heap.used_heap_size<bytes+64*1048576)throw new WorldError("The server has insufficient numerical working memory right now. Your accepted geography is unchanged; retry later.",503);
 largeTask=true;try{return await allocation.run(true,run);}finally{largeTask=false;}
}

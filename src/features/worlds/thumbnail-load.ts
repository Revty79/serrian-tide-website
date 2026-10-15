type Job={run:()=>Promise<unknown>;resolve:(value:unknown)=>void;reject:(error:unknown)=>void;signal:AbortSignal;cancel:()=>void};
const queue:Job[]=[];let active=0;
function drain(){while(active<2&&queue.length){const job=queue.shift()!;job.signal.removeEventListener("abort",job.cancel);if(job.signal.aborted){job.reject(new DOMException("Preview cancelled","AbortError"));continue;}active++;void job.run().then(job.resolve,job.reject).finally(()=>{active--;drain();});}}
/** Per-page queue, no result cache and no data shared between viewing contexts. */
export function scheduleThumbnail<T>(run:()=>Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise<T>((resolve,reject)=>{const job:Job={run,resolve:value=>resolve(value as T),reject,signal,cancel:()=>{const i=queue.indexOf(job);if(i>=0)queue.splice(i,1);reject(new DOMException("Preview cancelled","AbortError"));}};if(signal.aborted){job.cancel();return;}signal.addEventListener("abort",job.cancel,{once:true});queue.push(job);drain();});
}

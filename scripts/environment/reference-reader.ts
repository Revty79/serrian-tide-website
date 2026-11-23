/** Fixed I/O bound for complete immutable-reference verification. No profile override. */
export async function verifyReferenceGroups<T>(references:readonly T[],verify:(reference:T)=>Promise<unknown>,signal?:AbortSignal){
  signal?.throwIfAborted();
  for(let offset=0;offset<references.length;offset+=16){
    // Drain every started read before callers restore their process-local roots.
    // Discard decoded values rather than retaining them across groups.
    const checked=await Promise.allSettled(references.slice(offset,offset+16).map(async reference=>{await verify(reference);}));
    const failed=checked.find(result=>result.status==="rejected");
    if(failed)throw failed.reason;
    signal?.throwIfAborted();
  }
}

/** Request-local metadata only. The query remains bound to its authorized World,
 * terrain and transaction; no height arrays or references survive that request.
 * A block contains at most 64 latest-at-or-before references, including misses. */
export function createTerrainTileReferenceCache<T extends {x:number;y:number}>(
 query:(id:string,revision:number,x:number,y:number,size:number)=>Promise<T[]>,
){
 const capacity=1024,size=8,cache=new Map<string,T|null>(),pending=new Map<string,Promise<Map<string,T|null>>>(),
  key=(id:string,revision:number,x:number,y:number)=>`${id}:${revision}:${x}:${y}`,
  retain=(k:string,value:T|null)=>{cache.delete(k);cache.set(k,value);if(cache.size>capacity)cache.delete(cache.keys().next().value!);return value;};
 const lookup=async(id:string,revision:number,x:number,y:number):Promise<T|null>=>{
  const k=key(id,revision,x,y);if(cache.has(k))return retain(k,cache.get(k)!);
  const bx=Math.floor(x/size)*size,by=Math.floor(y/size)*size,bk=key(id,revision,bx,by);
  let work=pending.get(bk);
  if(!work){
   work=(async()=>{const rows=await query(id,revision,bx,by,size),values=new Map<string,T|null>();
    for(let yy=by;yy<by+size;yy++)for(let xx=bx;xx<bx+size;xx++)values.set(key(id,revision,xx,yy),null);
    for(const row of rows){if(!Number.isInteger(row.x)||!Number.isInteger(row.y)||row.x<bx||row.x>=bx+size||row.y<by||row.y>=by+size)throw Error("The accepted terrain reference block is invalid.");const rk=key(id,revision,row.x,row.y);if(values.get(rk)!==null)throw Error("The accepted terrain reference block repeats a tile.");values.set(rk,row);}
    for(const [rk,value]of values)retain(rk,value);return values;
   })().finally(()=>pending.delete(bk));pending.set(bk,work);
  }
  const values=await work;return retain(k,values.get(k)??null);
 };
 // Undefined means not cached; null remains an authoritative cached miss.
 // Peeking shares the original request-local capacity and LRU order.
 return Object.assign(lookup,{peek:(id:string,revision:number,x:number,y:number):T|null|undefined=>{
  const k=key(id,revision,x,y);return cache.has(k)?retain(k,cache.get(k)!):undefined;
 }});
}

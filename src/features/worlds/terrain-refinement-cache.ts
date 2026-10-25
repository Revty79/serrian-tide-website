import type {TerrainSource} from "./terrain-source";
import type {RefinementMeta} from "./terrain-refinement";

export type DetailTile={x:number;y:number;samples:number[];mask:string;sha256:string};
export type DetailBatch={refinement:RefinementMeta;headRevision:number;lod:number;tiles:DetailTile[];source:TerrainSource;acceptedRequestId:string;rootRevision:number;seaLevel:number;canEdit:boolean};
export type DetailPlan={meta:RefinementMeta;lod:number;keys:number[]};
export type CachedDetailTile={surfaceId:string;revision:number;lod:number;key:number;samples:Int16Array;mask:string;sha256:string};
export type DetailFetcher=(plan:DetailPlan,signal:AbortSignal)=>Promise<DetailBatch>;
export const detailTileKey=(id:string,revision:number,lod:number,key:number)=>`${id}/${revision}/${lod}/${key}`;

export function numericalBytes(samples:ArrayLike<number>){const bytes=new Uint8Array(samples.length*2),view=new DataView(bytes.buffer);for(let i=0;i<samples.length;i++)view.setInt16(i*2,samples[i],true);return bytes;}
export async function numericalChecksum(samples:ArrayLike<number>){const digest=await crypto.subtle.digest("SHA-256",numericalBytes(samples));return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");}

/** Bounded immutable numerical tile LRU, two viewport requests at a time. */
export class TerrainDetailCache {
 private entries=new Map<string,CachedDetailTile>();
 private queue:DetailPlan[]=[];
 private running=new Map<AbortController,{plan:DetailPlan;keys:string[]}>();
 private wanted=new Set<string>();
 private listeners=new Set<()=>void>();
 private stopped=false;
 private lastPlan:DetailPlan[]=[];
 error="";
 readonly metrics={requests:0,cancelled:0,cacheHits:0,loadedTiles:0,maxEntries:0,maxConcurrent:0};
 constructor(private fetcher:DetailFetcher,readonly limit=2048,readonly concurrency=2){}
 subscribe(listener:()=>void){this.stopped=false;this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
 private notify(){for(const listener of this.listeners)listener();}
 peek(id:string,revision:number,lod:number,key:number){return this.entries.get(detailTileKey(id,revision,lod,key));}
 get size(){return this.entries.size;}
 get loading(){return this.running.size+this.queue.length;}
 values(){return this.entries.values();}
 async accept(plan:DetailPlan,batch:DetailBatch){
  if(batch.refinement.id!==plan.meta.id||batch.refinement.revision!==plan.meta.revision||batch.lod!==plan.lod||batch.refinement.gridWidth!==plan.meta.gridWidth||batch.refinement.gridHeight!==plan.meta.gridHeight||batch.refinement.parentId!==plan.meta.parentId||batch.refinement.level!==plan.meta.level||["x","y","width","height"].some(k=>batch.refinement.frame[k as keyof typeof batch.refinement.frame]!==plan.meta.frame[k as keyof typeof plan.meta.frame]))throw Error("Terrain detail response does not match its pinned source.");
  const columns=plan.meta.gridWidth/2**plan.lod/32,rows=plan.meta.gridHeight/2**plan.lod/32,requested=new Set(plan.keys);if(plan.keys.length>64||batch.tiles.length!==requested.size)throw Error("The numerical tile batch is incomplete.");
  const converted=await Promise.all(batch.tiles.map(async tile=>{
   const key=tile.y*columns+tile.x;if(!Number.isInteger(tile.x)||!Number.isInteger(tile.y)||tile.x<0||tile.y<0||tile.x>=columns||tile.y>=rows||!requested.delete(key)||tile.samples.length!==1024||tile.samples.some(n=>!Number.isInteger(n)||n< -30000||n>30000)||!/^[a-f0-9]{256}$/.test(tile.mask)||!/^[a-f0-9]{64}$/.test(tile.sha256)||await numericalChecksum(tile.samples)!==tile.sha256)throw Error("A numerical detail tile failed validation. The coarse surface remains available.");
   return {surfaceId:plan.meta.id,revision:plan.meta.revision,lod:plan.lod,key,samples:Int16Array.from(tile.samples),mask:tile.mask,sha256:tile.sha256};
  }));
  if(this.stopped)return;
  for(const tile of converted){const key=detailTileKey(tile.surfaceId,tile.revision,tile.lod,tile.key);this.entries.delete(key);this.entries.set(key,tile);while(this.entries.size>this.limit)this.entries.delete(this.entries.keys().next().value!);}
  this.metrics.loadedTiles+=converted.length;this.metrics.maxEntries=Math.max(this.metrics.maxEntries,this.entries.size);
 }
 schedule(plans:DetailPlan[]){
  if(this.stopped)return;this.lastPlan=plans;this.wanted=new Set(plans.flatMap(p=>p.keys.map(k=>detailTileKey(p.meta.id,p.meta.revision,p.lod,k))));
  const pending=new Set<string>();for(const [controller,job] of this.running){if(job.keys.every(k=>!this.wanted.has(k))){controller.abort();this.metrics.cancelled++;}else for(const key of job.keys)pending.add(key);}
  this.queue=[];
  for(const plan of plans){const missing:number[]=[];for(const key of plan.keys){const id=detailTileKey(plan.meta.id,plan.meta.revision,plan.lod,key),hit=this.entries.get(id);if(hit){this.entries.delete(id);this.entries.set(id,hit);this.metrics.cacheHits++;}else if(!pending.has(id))missing.push(key);}for(let i=0;i<missing.length;i+=64)this.queue.push({...plan,keys:missing.slice(i,i+64)});}
  this.pump();this.notify();
 }
 private pump(){
  while(!this.stopped&&this.running.size<this.concurrency&&this.queue.length){const plan=this.queue.shift()!,controller=new AbortController(),keys=plan.keys.map(k=>detailTileKey(plan.meta.id,plan.meta.revision,plan.lod,k));this.running.set(controller,{plan,keys});this.metrics.requests++;this.metrics.maxConcurrent=Math.max(this.metrics.maxConcurrent,this.running.size);
   void this.fetcher(plan,controller.signal).then(async batch=>{if(!controller.signal.aborted&&!this.stopped&&keys.some(k=>this.wanted.has(k)))await this.accept(plan,batch);}).catch(error=>{if(!controller.signal.aborted)this.error=error instanceof Error?error.message:"Terrain detail could not load.";}).finally(()=>{this.running.delete(controller);this.pump();this.notify();});
  }
 }
 retry(){this.error="";this.schedule(this.lastPlan);}
 dispose(){this.stopped=true;for(const controller of this.running.keys())controller.abort();this.queue=[];this.entries.clear();this.listeners.clear();}
}

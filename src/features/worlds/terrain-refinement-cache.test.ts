import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {TerrainDetailCache,numericalChecksum,type DetailPlan,type DetailBatch} from "./terrain-refinement-cache";
import type {RefinementMeta} from "./terrain-refinement";
const meta:RefinementMeta={id:randomUUID(),worldId:randomUUID(),terrainId:randomUUID(),mapId:randomUUID(),name:"Known frame",parentId:null,parentRevision:1,level:1,revision:2,frame:{x:593739223,y:582799089,width:20000,height:20000},gridWidth:1024,gridHeight:1024,overviewLevels:5,updatedAt:new Date().toISOString()};
async function batch(plan:DetailPlan):Promise<DetailBatch>{const samples=Array(1024).fill(17),sha256=await numericalChecksum(samples),columns=plan.meta.gridWidth/2**plan.lod/32;return {refinement:plan.meta,headRevision:2,lod:plan.lod,tiles:plan.keys.map(key=>({x:key%columns,y:Math.floor(key/columns),samples:[...samples],sha256,mask:"0".repeat(256)})),source:{kind:"manual"},acceptedRequestId:randomUUID(),rootRevision:1,seaLevel:0,canEdit:true};}
const settle=async()=>{await new Promise<void>(r=>setTimeout(r,0));};
test("numerical cache rejects corrupted, missing, relocated or wrong-source responses atomically",async()=>{
 const cache=new TerrainDetailCache(async p=>batch(p)),plan={meta,lod:0,keys:[0,1]},valid=await batch(plan);
 const corrupted=structuredClone(valid);corrupted.tiles[1].samples[0]++;await assert.rejects(cache.accept(plan,corrupted),/validation/);assert.equal(cache.size,0);
 await assert.rejects(cache.accept(plan,{...valid,tiles:valid.tiles.slice(1)}),/incomplete/);await assert.rejects(cache.accept(plan,{...valid,refinement:{...meta,id:randomUUID()}}),/pinned/);
 await assert.rejects(cache.accept(plan,{...valid,refinement:{...meta,frame:{...meta.frame,x:10}}}),/pinned/);
 await cache.accept(plan,valid);assert.equal(cache.size,2);assert.equal(cache.peek(meta.id,2,0,1)?.samples[0],17);
});
test("tile LRU and request concurrency stay bounded and view changes cancel obsolete work",async()=>{
 const jobs:{plan:DetailPlan;signal:AbortSignal;resolve:(b:DetailBatch)=>void}[]=[],cache=new TerrainDetailCache((plan,signal)=>new Promise(resolve=>jobs.push({plan,signal,resolve})),8,2);
 cache.schedule([{meta,lod:0,keys:Array.from({length:200},(_,i)=>i)}]);assert.equal(jobs.length,2);assert.equal(cache.metrics.maxConcurrent,2);
 const target={meta,lod:0,keys:[500,501]};cache.schedule([target]);assert.ok(jobs.every(j=>j.signal.aborted));
 for(const job of jobs.slice())job.resolve(await batch(job.plan));await settle();assert.equal(jobs.length,3);assert.deepEqual(jobs[2].plan.keys,[500,501]);jobs[2].resolve(await batch(jobs[2].plan));await settle();await settle();assert.equal(cache.size,2);assert.equal(cache.metrics.cancelled,2);assert.ok(cache.peek(meta.id,2,0,500));
 await cache.accept({meta,lod:0,keys:[1,2,3,4,5,6,7,8]},await batch({meta,lod:0,keys:[1,2,3,4,5,6,7,8]}));assert.equal(cache.size,8);assert.equal(cache.peek(meta.id,2,0,500),undefined);assert.equal(cache.metrics.maxEntries,8);cache.dispose();assert.equal(cache.size,0);
});
test("immutable cache hits avoid requests and Strict Mode effect replay can resubscribe",async()=>{
 let calls=0;const cache=new TerrainDetailCache(async p=>{calls++;return batch(p);}),plan={meta,lod:0,keys:[0]};
 await cache.accept(plan,await batch(plan));cache.schedule([plan]);assert.equal(calls,0);assert.equal(cache.metrics.cacheHits,1);
 cache.dispose();const unsubscribe=cache.subscribe(()=>{});cache.schedule([plan]);await settle();await settle();assert.equal(calls,1);assert.equal(cache.size,1);unsubscribe();cache.dispose();
});

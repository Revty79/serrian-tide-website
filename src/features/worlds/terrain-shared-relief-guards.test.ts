import test from "node:test";
import assert from "node:assert/strict";
import {sharedReliefCoastGuards,type SharedCoastSource} from "./terrain-shared-relief-coast";
import {planSharedRelief,prepareSharedReliefSource,type SharedProfile} from "./terrain-shared-relief";
import {certifySharedReliefRebase} from "./terrain-shared-relief-rebase";
import {samplePinnedTerrainPoint,type NumericalSampleSource} from "./terrain-numerical-sampling";
import type {SharedReliefSnapshot} from "./terrain-shared-relief-spec";
import type {AdvancedResult} from "./terrain-advanced";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
const world={width:64,height:64,tileSize:32,displayWidth:6400,displayHeight:6400,min:-10000,max:10000,wrap:false},
 context={world:{width:6400,height:6400,wrap:false},seaLevel:0,water:EMPTY_HYDROLOGY,sites:[],volcanoes:[]},
 sources:SharedCoastSource[]=[{id:null,revision:2,level:0,shape:world,frame:{x:0,y:0,width:6400,height:6400}},{id:"fine",revision:1,level:1,shape:{...world,displayWidth:3200,displayHeight:3200},frame:{x:1600,y:1600,width:3200,height:3200}}],
 operation:SharedProfile={kind:"landform-profile",mode:"shape",selection:{frame:{x:1000,y:1000,width:4500,height:4500}},points:[{x:1800,y:1800,elevationM:3000,widthM:6000},{x:4500,y:4500,elevationM:3000,widthM:6000}],preserveManual:false,strength:100,hardness:0,endBlendM:0,featherM:0};
test("outside fine-source sea protects the fine collar and its coarser dry reconstruction supports",async()=>{
 const budget=planSharedRelief(sources,operation,operation.selection.frame,context),guard=await sharedReliefCoastGuards(budget.plans,sources,world,0,async(p,_s,outside)=>outside&&p.x<1600&&p.y>2800&&p.y<3600?-500:500);
 const grids=new Map<string|null,Int16Array>();
 for(const plan of budget.plans){const base=new Int16Array(plan.window.width*plan.window.height).fill(500),result=await prepareSharedReliefSource(plan,base,new Uint8Array(base.length),operation,context,undefined,undefined,guard.masks.get(plan.source.id));grids.set(plan.source.id,result.grid);}
 const fine=grids.get("fine")!,root=grids.get(null)!;assert.equal(fine[32*64],500);assert.equal(root[32*64+16],500);assert(fine[32*64+20]>500);assert(root[32*64+25]>500);assert(guard.visited>0);
 const abort=new AbortController();abort.abort();await assert.rejects(sharedReliefCoastGuards(budget.plans,sources,world,0,async()=>500,abort.signal),/cancel/i);
});
const snapshots:SharedReliefSnapshot[]=[{id:"root",revision:2,parentId:null,parentRevision:null,level:0,frame:sources[0].frame,columns:64,rows:64,contentHash:"a".repeat(64)},{id:"fine",revision:1,parentId:null,parentRevision:1,level:1,frame:sources[1].frame,columns:64,rows:64,contentHash:"b".repeat(64)}];
function inputs(stale=false,sea=false){
 const root=new Int16Array(4096).fill(500),fine=new Int16Array(4096).fill(500);if(stale)root[20*64+48]=900;
 const nextRoot=root.slice(),nextFine=fine.slice();nextRoot[32*64+48]=sea?-500:3000;nextFine[32*64+63]=1800;
 const make=(grid:Int16Array,index:number):AdvancedResult=>({grid,patch:{indices:Uint32Array.of(index),before:Int16Array.of(500),after:Int16Array.of(grid[index])},metrics:{} as AdvancedResult["metrics"]});
 const results=new Map([["root",make(nextRoot,32*64+48)],["fine",make(nextFine,32*64+63)]]),
  load=async(id:string,revision:number):Promise<NumericalSampleSource>=>({id,revision,parentId:id==="fine"?"root":null,parentRevision:id==="fine"?1:null,shape:id==="fine"?sources[1].shape:world,frame:id==="fine"?sources[1].frame:sources[0].frame,at:async(x,y)=>id==="fine"?fine[y*64+x]:revision===1?500:root[y*64+x]});
 return {results,load,root,fine};
}
const area={x:4400,y:2800,width:800,height:800};
test("native group reconnection pins the new parent while old numerical readers retain the exact prior edge",async()=>{
 const {results,load}=inputs(),r=await certifySharedReliefRebase(snapshots,results,world,operation.selection,area,0,load);
 assert.equal(r.heads[0].revision,3);assert.equal(r.heads[1].revision,2);assert.equal(r.heads[1].parentRevision,3);assert(r.contextChanges>0);
 const point={x:4775,y:3200};assert.equal(await samplePinnedTerrainPoint(point,"fine",1,world,load),500);assert.equal(await samplePinnedTerrainPoint(point,"fine",2,world,r.nextLoad),2400);
 assert.equal(snapshots[1].parentRevision,1);assert.equal(snapshots[1].revision,1);
});
test("reconnection refuses pre-existing stale boundary changes beyond the selected area and any sea support change",async()=>{
 const stale=inputs(true);await assert.rejects(certifySharedReliefRebase(snapshots,stale.results,world,operation.selection,area,0,stale.load),/outside the selected/);
 const sea=inputs(false,true);await assert.rejects(certifySharedReliefRebase(snapshots,sea.results,world,operation.selection,area,0,sea.load),/sea support/);
 const abort=new AbortController();abort.abort();const a=inputs();await assert.rejects(certifySharedReliefRebase(snapshots,a.results,world,operation.selection,area,0,a.load,abort.signal),/cancel/i);
});
test("unrelated accepted sources retain their complete state and cancellation also applies to skipped audits",async()=>{
 const plan=planSharedRelief(sources.slice(0,1),operation,{x:1000,y:1000,width:200,height:200},context),rootOnly=[snapshots[0]],abort=new AbortController();abort.abort();
 await assert.rejects(sharedReliefCoastGuards(plan.plans,sources.slice(0,1),world,0,async()=>500,abort.signal),/cancel/i);
 const a=inputs();await assert.rejects(certifySharedReliefRebase(rootOnly,new Map(),world,operation.selection,area,0,a.load,abort.signal),/cancel/i);
 const distant=Array.from({length:128},(_,i)=>({...snapshots[1],id:"retained-"+i,frame:{x:1000+(i%16)*100,y:1000+Math.floor(i/16)*100,width:100,height:100}})),all=[snapshots[0],...distant],certified=await certifySharedReliefRebase(all,new Map(),world,operation.selection,area,0,a.load);
 assert.equal(certified.heads.length,129);assert.deepEqual(certified.heads.slice(1),distant);assert.deepEqual([...certified.active],["root"]);
});

test("explicit selected dry review reconnects the complete stale border without changing native inputs",async()=>{
 const rootId="20000000-0000-4000-8000-000000000001",fineId="20000000-0000-4000-8000-000000000002",input=inputs(true),beforeRoot=input.root.slice(),beforeFine=input.fine.slice(),
  state=snapshots.map(s=>({...s,id:s.id==="root"?rootId:fineId})),results=new Map([...input.results].map(([id,r])=>[id==="root"?rootId:fineId,r])),
  load=async(id:string,revision:number)=>{const value=await input.load(id===rootId?"root":"fine",revision);return {...value,id,parentId:value.parentId?rootId:null};},
  result=await certifySharedReliefRebase(state,results,world,operation.selection,area,0,load,undefined,{context,preserveManual:false,nativeCells:2,workingBytes:3*1048576});
 assert.equal(result.heads[1].parentRevision,3);assert.equal(result.heads[1].revision,2);assert(result.joinReview);assert(result.joinReviewSamples!>0);assert(result.joinReviewBytes!>0);
 assert(result.joinReview.sources[0].supports.some(p=>p.outsideWorkArea&&p.before===500&&p.after===900));
 assert(result.joinReview.sources[0].supports.some(p=>!p.outsideWorkArea));assert.equal(result.joinReview.sources[0].sourceId,fineId);
 assert.deepEqual(input.root,beforeRoot);assert.deepEqual(input.fine,beforeFine);assert.equal(state[1].parentRevision,1);
 await assert.rejects(certifySharedReliefRebase(state,results,world,operation.selection,area,0,load),/outside the selected/);
});

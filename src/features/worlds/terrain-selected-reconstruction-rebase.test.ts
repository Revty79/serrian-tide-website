import test from "node:test";
import assert from "node:assert/strict";
import {certifySharedReliefRebase} from "./terrain-shared-relief-rebase";
import {samplePinnedTerrainPointReady,type NumericalSampleLoader} from "./terrain-numerical-sampling";
import type {AdvancedResult} from "./terrain-advanced";
import type {SharedReliefSnapshot} from "./terrain-shared-relief-spec";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";

const rootId="60000000-0000-4000-8000-000000000001",fineId="60000000-0000-4000-8000-000000000002",world={width:32,height:32,tileSize:32,displayWidth:3200,displayHeight:3200,min:-12000,max:12000,wrap:false},frame={x:975,y:1000,width:1000,height:1000},selection={frame:{x:0,y:0,width:1950,height:3200}},area={x:1800,y:1400,width:200,height:200},
 state:SharedReliefSnapshot[]=[{id:rootId,revision:2,parentId:null,parentRevision:null,level:0,frame:{x:0,y:0,width:3200,height:3200},columns:32,rows:32,contentHash:"a".repeat(64)},{id:fineId,revision:2,parentId:null,parentRevision:1,level:1,frame,columns:32,rows:32,contentHash:"b".repeat(64)}],context={world:{width:3200,height:3200,wrap:false},seaLevel:0,water:EMPTY_HYDROLOGY,sites:[],volcanoes:[]};
function input(stale=false){
 const root=new Int16Array(1024).fill(200),fine=root.slice(),nextRoot=root.slice(),nextFine=fine.slice(),rootIndex=15*32+19,fineIndex=16*32+31;
 if(stale){root[15*32+20]=400;nextRoot[15*32+20]=400;}nextRoot[rootIndex]=300;nextFine[fineIndex]=201;
 const make=(grid:Int16Array,i:number):AdvancedResult=>({grid,patch:{indices:Uint32Array.of(i),before:Int16Array.of(200),after:Int16Array.of(grid[i])},metrics:{} as AdvancedResult["metrics"]}),results=new Map([[rootId,make(nextRoot,rootIndex)],[fineId,make(nextFine,fineIndex)]]),
  load:NumericalSampleLoader=(id,r)=>({id,revision:r,parentId:id===fineId?rootId:null,parentRevision:id===fineId?1:null,shape:id===rootId?world:{...world,displayWidth:1000,displayHeight:1000},frame:id===rootId?state[0].frame:frame,at:(x,y)=>id===fineId?fine[y*32+x]:r===1?200:root[y*32+x]});
 return {root,fine,results,load};
}
test("complete native rebase proves a polygon-edge reconstruction while the unqualified mode still refuses",async()=>{
 const q=input(),root=q.root.slice(),fine=q.fine.slice(),before=structuredClone(state),options={context,preserveManual:false,nativeCells:2,workingBytes:3*1048576};
 await assert.rejects(certifySharedReliefRebase(state,q.results,world,selection,area,0,q.load,undefined,options),/original selected outline/);
 const result=await certifySharedReliefRebase(state,q.results,world,selection,area,0,q.load,undefined,{...options,allowReconstruction:true});
 assert(result.joinReview?.reconstructionSupports);assert(result.joinReview.sources[0].supports.every(s=>s.reconstruction?.every(n=>n.x<=1950)));assert.equal(result.heads[1].parentRevision,3);assert.equal(await samplePinnedTerrainPointReady({x:1975,y:1500},fineId,2,world,q.load),200);assert.equal(await samplePinnedTerrainPointReady({x:1975,y:1500},fineId,3,world,result.nextLoad),225);
 assert.deepEqual(q.root,root);assert.deepEqual(q.fine,fine);assert.deepEqual(state,before);
});
test("the new mode refuses an older independent parent change outside selected native supports",async()=>{
 const q=input(true),original=structuredClone(state);await assert.rejects(certifySharedReliefRebase(state,q.results,world,selection,area,0,q.load,undefined,{context,preserveManual:false,nativeCells:2,workingBytes:3*1048576,allowReconstruction:true}),/outside the original selected outline/);assert.deepEqual(state,original);
});

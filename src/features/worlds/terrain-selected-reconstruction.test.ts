import assert from "node:assert/strict";
import test from "node:test";
import {selectedNativeReconstruction} from "./terrain-selected-reconstruction";
import {samplePinnedTerrainPointReady,type NumericalSampleLoader,type NumericalSampleSource} from "./terrain-numerical-sampling";
import type {TerrainGeometry} from "./terrain";

const rootId="00000000-0000-4000-8000-000000000001",fineId="00000000-0000-4000-8000-000000000002",
 world:TerrainGeometry={width:32,height:32,tileSize:32,displayWidth:3200,displayHeight:3200,min:-12000,max:12000,wrap:false},
 selection={frame:{x:0,y:0,width:1950,height:3200}},point={x:1975,y:1500};
function root(revision:number,at:(x:number,y:number,r:number)=>number,wrap=false):NumericalSampleSource{return {id:rootId,revision,parentId:null,parentRevision:null,shape:{...world,wrap},frame:{x:0,y:0,width:3200,height:3200},at:(x,y)=>at(x,y,revision)};}
const changed=(x:number,y:number,r:number)=>r===2&&x===19&&y===15?300:200;
async function proof(load:NumericalSampleLoader,settings={world,selection,point,id:rootId,before:1,after:2},work:(n:number)=>void=()=>{}){
 const before=await samplePinnedTerrainPointReady(settings.point,settings.id,settings.before,settings.world,load),after=await samplePinnedTerrainPointReady(settings.point,settings.id,settings.after,settings.world,load);
 return selectedNativeReconstruction(settings.point,settings.id,settings.before,settings.after,settings.world,settings.selection,0,load,load,{before,after},work);
}
test("native reconstruction proves selected contributing heights beyond an outline without changing inputs",async()=>{
 const load:NumericalSampleLoader=(_id,r)=>root(r,changed);let work=0;const original=structuredClone(selection),nodes=await proof(load,undefined,n=>{work+=n;});
 assert.deepEqual(nodes,[{sourceId:rootId,beforeRevision:1,afterRevision:2,x:1900,y:1500,weight:.25,before:200,after:300}]);assert(work>0);assert.deepEqual(selection,original);
});
test("changed unselected positive-weight supports refuse; zero-weight reads cannot authorize or obstruct a join",async()=>{
 const zero:NumericalSampleLoader=(_id,r)=>root(r,(x,y,r)=>r===2&&x===20&&y===16?1100:changed(x,y,r));assert.equal((await proof(zero)).length,1);
 const outside:NumericalSampleLoader=(_id,r)=>root(r,(x,y,r)=>r===2&&x===20&&y===15?400:changed(x,y,r));await assert.rejects(proof(outside),/outside the original selected outline/);
});
test("nested fallback evidence retains the original parent revisions and exact interpolation",async()=>{
 const load:NumericalSampleLoader=(id,r)=>id===rootId?root(r,changed):{id:fineId,revision:r,parentId:rootId,parentRevision:r,shape:{...world,displayWidth:1000,displayHeight:1000},frame:{x:975,y:1000,width:1000,height:1000},at:()=>200};
 const nodes=await proof(load,{world,selection,point,id:fineId,before:1,after:2});assert.equal(nodes.length,1);assert.equal(nodes[0].sourceId,rootId);assert.equal(nodes[0].weight,.25);
});
test("wrapping proof retains canonical native supports across the seam",async()=>{
 const wrapped={...world,wrap:true},load:NumericalSampleLoader=(_id,r)=>root(r,(x,y,r)=>r===2&&x===0&&y===15?300:200,true),nodes=await proof(load,{world:wrapped,selection:{frame:{x:3150,y:0,width:100,height:3200}},point:{x:75,y:1500},id:rootId,before:1,after:2});assert.equal(nodes.length,1);assert.equal(nodes[0].x,0);assert.equal(nodes[0].weight,.25);
});
test("a dry interpolated point cannot authorize a changed wet contributing sample",async()=>{
 const load:NumericalSampleLoader=(_id,r)=>root(r,(x,y,r)=>x===19&&y===15?(r===1?100:300):200),before=await samplePinnedTerrainPointReady(point,rootId,1,world,load),after=await samplePinnedTerrainPointReady(point,rootId,2,world,load);assert(before>150&&after>150);
 await assert.rejects(selectedNativeReconstruction(point,rootId,1,2,world,selection,150,load,load,{before,after},()=>{}),/saved sea supports/);
});
test("work cancellation, unavailable reads and mismatched evidence refuse without native mutations",async()=>{
 let reads=0;const load:NumericalSampleLoader=(_id,r)=>{reads++;return root(r,changed);};await assert.rejects(selectedNativeReconstruction(point,rootId,1,2,world,selection,0,load,load,{before:200,after:225},()=>{throw Error("Canceled bounded proof");}),/Canceled bounded proof/);assert.equal(reads,0);
 const unavailable:NumericalSampleLoader=()=>{throw Error("Unavailable immutable source");};await assert.rejects(proof(unavailable),/Unavailable immutable source/);
 await assert.rejects(selectedNativeReconstruction(point,rootId,1,2,world,selection,0,load,load,{before:200,after:226},()=>{}),/does not match/);
});

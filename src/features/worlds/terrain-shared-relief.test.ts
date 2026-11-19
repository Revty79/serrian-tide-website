import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {planSharedRelief,prepareSharedReliefSource,type SharedProfile,type SharedReliefSource} from "./terrain-shared-relief";
import {prepareAdvancedTerrain,type AdvancedTerrainContext} from "./terrain-advanced";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {terrainEditMask} from "./terrain-refinement";
const hash=(a:Int16Array)=>createHash("sha256").update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest("hex");
const shape={width:128,height:128,tileSize:32,displayWidth:12800,displayHeight:12800,min:-12000,max:12000,wrap:false};
const context=():Omit<AdvancedTerrainContext,"frame">=>({world:{width:12800,height:12800,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]});
const sources=():SharedReliefSource[]=>[
 {id:null,revision:3,shape,frame:{x:0,y:0,width:12800,height:12800}},
 {id:"fine",revision:5,shape:{...shape,width:256,height:256,displayWidth:6400,displayHeight:6400},frame:{x:3200,y:3200,width:6400,height:6400}},
 {id:"child",revision:7,shape:{...shape,displayWidth:1600,displayHeight:1600},frame:{x:4800,y:4800,width:1600,height:1600}},
];
const operation=():SharedProfile=>({kind:"landform-profile",selection:{frame:{x:2000,y:2000,width:8000,height:8000}},points:[{x:3000,y:3500,elevationM:3200,widthM:6000},{x:9000,y:8500,elevationM:4700,widthM:6000}],mode:"shape",preserveManual:false,strength:67,hardness:.2,endBlendM:1000,featherM:0});
function copyWindow(base:Int16Array,w:{x:number;y:number;width:number;height:number;sourceWidth:number}){const a=new Int16Array(w.width*w.height);for(let y=0;y<w.height;y++)a.set(base.subarray((w.y+y)*w.sourceWidth+w.x,(w.y+y)*w.sourceWidth+w.x+w.width),y*w.width);return a;}
test("one physical profile gives exact continuous native heights in the World, parent detail and child collar",async()=>{
 const c=context(),op=operation(),s=sources(),plan=planSharedRelief(s,op,op.selection.frame,c),results=new Map<string|null,Int16Array>();
 assert.equal(plan.plans.length,3);assert(plan.cells<262144);assert(plan.workingBytes<=32*1048576);
 for(const p of plan.plans){const base=new Int16Array(p.source.shape.width*p.source.shape.height).fill(500),before=hash(base),actual=await prepareSharedReliefSource(p,copyWindow(base,p.window),new Uint8Array(p.window.width*p.window.height),op,c),expected=prepareAdvancedTerrain(base,p.source.shape,op,{...c,frame:p.source.frame}),grid=base.slice();
  for(let k=0;k<actual.patch.indices.length;k++)grid[actual.patch.indices[k]]=actual.patch.after[k];assert.deepEqual(grid,expected.grid);assert.equal(hash(base),before);results.set(p.source.id,grid);
 }
 const root=results.get(null)!,fine=results.get("fine")!,child=results.get("child")!;
 for(let y=32;y<96;y++)for(let x=32;x<96;x++)assert.equal(root[y*128+x],fine[(y-32)*4*256+(x-32)*4]);
 for(let y=0;y<128;y+=8)for(let x=0;x<128;x+=8)assert.equal(child[y*128+x],fine[(64+y/2)*256+64+x/2]);
 assert(fine[100*256]>500,"the native join can raise an interior inherited collar");
 const m={id:"fine",worldId:"w",terrainId:"t",mapId:"m",name:"Retained detail",parentId:null,parentRevision:1,level:1,revision:5,frame:s[1].frame,gridWidth:256,gridHeight:256,overviewLevels:3,updatedAt:"same"},ordinaryMask=terrainEditMask(shape,s[0].frame,[m],shape),ordinary=prepareAdvancedTerrain(new Int16Array(128*128).fill(500),shape,op,{...c,frame:s[0].frame},ordinaryMask);
 assert.equal(ordinary.grid[57*128+32],500);assert(root[57*128+32]>500);
});
test("successive native work areas equal one complete operation without duplicated blends or omitted final boundary samples",async()=>{
 const c=context(),op=operation(),s=sources(),areas=[{x:2000,y:2000,width:4000,height:4000},{x:6000,y:2000,width:4000,height:4000},{x:2000,y:6000,width:4000,height:4000},{x:6000,y:6000,width:4000,height:4000}],grids=new Map(s.map(v=>[v.id,new Int16Array(v.shape.width*v.shape.height).fill(500)]));
 for(const area of areas){for(const p of planSharedRelief(s,op,area,c).plans){const base=grids.get(p.source.id)!,r=await prepareSharedReliefSource(p,copyWindow(base,p.window),new Uint8Array(p.window.width*p.window.height),op,c);for(let k=0;k<r.patch.indices.length;k++)base[r.patch.indices[k]]=r.patch.after[k];}}
 for(const source of s){const expected=prepareAdvancedTerrain(new Int16Array(source.shape.width*source.shape.height).fill(500),source.shape,op,{...c,frame:source.frame});assert.deepEqual(grids.get(source.id),expected.grid);}
});
test("wrapped work areas retain opposite-seam sea supports and never double-apply the World east endpoint",async()=>{
 const c=context();c.world.wrap=true;const s=[{...sources()[0],shape:{...shape,wrap:true}}],op:SharedProfile={...operation(),selection:{frame:{x:0,y:0,width:12800,height:12800}},points:[{x:12000,y:5000,elevationM:3000,widthM:4000},{x:1000,y:8000,elevationM:4000,widthM:4000}],endBlendM:0},base=new Int16Array(128*128).fill(500);base[60*128+127]=-500;
 const expected=prepareAdvancedTerrain(base,s[0].shape,op,{...c,frame:s[0].frame}),actual=base.slice();for(const area of [{x:0,y:0,width:6400,height:12800},{x:6400,y:0,width:6400,height:12800}])for(const p of planSharedRelief(s,op,area,c).plans){const r=await prepareSharedReliefSource(p,copyWindow(actual,p.window),new Uint8Array(p.window.width*p.window.height),op,c);for(let k=0;k<r.patch.indices.length;k++)actual[r.patch.indices[k]]=r.patch.after[k];}
 assert.deepEqual(actual,expected.grid);assert.equal(actual[60*128],500);assert.equal(actual[60*128+127],-500);
});
test("combined native admission counts every source instead of resetting cell, work or memory limits",()=>{
 const c=context(),op=operation(),s=sources();assert.throws(()=>planSharedRelief([s[0],s[0]],op,op.selection.frame,c),/complete accepted/);assert.throws(()=>planSharedRelief(s.slice(1),op,op.selection.frame,c),/complete accepted/);
 const dense=s.map(v=>({...v,shape:{...v.shape,width:512,height:512}}));assert.throws(()=>planSharedRelief(dense,op,op.selection.frame,c),/262,144/);
 assert.throws(()=>planSharedRelief(s,op,{...op.selection.frame,width:-1},c));assert.throws(()=>planSharedRelief(s,op,{x:0,y:0,width:20000,height:1000},c),/inside this World/);
 const many={...op,points:Array.from({length:128},(_,i)=>({x:3000+i*40,y:5000+i*20,widthM:3000,elevationM:2000}))};assert.throws(()=>planSharedRelief(s,many,op.selection.frame,c),/sample-steps/);
});
test("shared relief keeps standing-water, sea, site and selected manual samples exact",async()=>{
 const c=context(),s=sources().slice(0,1),op={...operation(),preserveManual:true},plan=planSharedRelief(s,op,op.selection.frame,c).plans[0],base=new Int16Array(128*128).fill(500),manual=new Uint8Array(base.length);base[50*128+50]=-500;manual[60*128+60]=1;c.sites=[{id:"town",x:7000,y:7000}];
 c.water.lakes=[{id:"lake",name:"Retained standing lake",rings:[[{x:7400,y:5500},{x:8400,y:5500},{x:8400,y:6500},{x:7400,y:6500}]],levelM:3810,seed:{x:7900,y:6000},spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
 const b=copyWindow(base,plan.window),m=new Uint8Array(plan.window.width*plan.window.height);for(let y=0;y<plan.window.height;y++)m.set(manual.subarray((plan.window.y+y)*128+plan.window.x,(plan.window.y+y)*128+plan.window.x+plan.window.width),y*plan.window.width);
 const result=await prepareSharedReliefSource(plan,b,m,op,c),grid=base.slice();for(let k=0;k<result.patch.indices.length;k++)grid[result.patch.indices[k]]=result.patch.after[k];for(const i of [50*128+50,50*128+49,51*128+51,60*128+60,70*128+70,69*128+69,60*128+79])assert.equal(grid[i],base[i]);assert(result.metrics.changed>0);
 const abort=new AbortController();abort.abort();await assert.rejects(prepareSharedReliefSource(plan,b,m,op,c,undefined,abort.signal),/cancel/i);assert.deepEqual(b,copyWindow(base,plan.window));
});

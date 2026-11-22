import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import type {TerrainGeometry} from "./terrain";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import {prepareAdvancedTerrain,type AdvancedTerrainContext} from "./terrain-advanced";
import {ADVANCED_TERRAIN_LIMITS,advancedTerrainSampleSteps,advancedTerrainShoreSteps,type AdvancedOperation,type VolcanoOperation} from "./terrain-advanced-spec";
import {planProfileWindow,copyProfileWindow,prepareWindowedProfile,advancedResultSample,advancedResultTile} from "./terrain-profile-window";
import {prepareTerrainOperationJob} from "./terrain-operation-engine";

const hash=(v:Int16Array|Uint8Array)=>createHash("sha256").update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).digest("hex");
const sx=123.456789012345,sy=178.987654321098,frame={x:12345.678901234,y:54321.987654321,width:4096*sx,height:4096*sy};
const point=(x:number,y:number)=>({x:frame.x+x*sx,y:frame.y+y*sy});
const shape:TerrainGeometry={width:4096,height:4096,tileSize:32,displayWidth:frame.width,displayHeight:frame.height,min:-12000,max:12000,wrap:false};
const selection={frame:{...point(800,800),width:100*sx,height:100*sy}};
const volcano:VolcanoOperation={kind:"volcano",selection,preserveManual:true,strength:83,centre:point(850.5,850.5),form:"cone",radiusM:11000,heightM:1800,craterDiameterM:1800,craterDepthM:600,profile:1.2,blendM:4000,summitEastM:300,summitSouthM:-150};
function fixture(){
 const context:AdvancedTerrainContext={frame:{...frame},world:{width:2000000,height:2000000,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[{id:"town",...point(845.499999,845)}],volcanoes:[{id:"de132f42-d461-40cf-8974-5e8771e8049a",revision:7,sourceId:"retained",operation:volcano}]},
  base=new Int16Array(shape.width*shape.height),blocked=new Uint8Array(base.length),manual=new Uint8Array(base.length);
 for(let y=0;y<4096;y++)for(let x=0;x<4096;x++)base[y*4096+x]=2400-Math.floor(y/4)+(x%8);
 base[820*4096+820]=-500;blocked[830*4096+830]=1;manual[840*4096+840]=1;
 const rings=[[point(860,860),point(870,860),point(870,870),point(860,870)]];
 context.water.lakes=[{id:"lake",name:"Retained lake",rings,levelM:2200,seed:point(865,865),spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
 context.water.edges.push({id:"saved-river",name:"Original river",from:"source",to:"sink",points:[point(850,780),point(850,920)],drainageM2:100000,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null});
 const smallShape={...shape,width:2048,height:2048,displayWidth:frame.width/2,displayHeight:frame.height/2},smallContext={...context,frame:{...frame,width:frame.width/2,height:frame.height/2}},
  small=new Int16Array(2048*2048),smallBlocked=new Uint8Array(small.length),smallManual=new Uint8Array(small.length);
 for(let y=0;y<2048;y++){small.set(base.subarray(y*4096,y*4096+2048),y*2048);smallBlocked.set(blocked.subarray(y*4096,y*4096+2048),y*2048);smallManual.set(manual.subarray(y*4096,y*4096+2048),y*2048);}
 return {base,blocked,manual,context,small,smallBlocked,smallManual,smallShape,smallContext};
}
async function compare(op:AdvancedOperation,f=fixture()){
 const before=[hash(f.base),hash(f.blocked),hash(f.manual),JSON.stringify(f.context)],w=planProfileWindow(shape,op,f.context)!;
 assert(w);assert(w.width*w.height<4096*4096/8);
 const actual=await prepareWindowedProfile(copyProfileWindow(f.base,w),shape,op,f.context,w,copyProfileWindow(f.blocked,w),copyProfileWindow(f.manual,w)),
  expected=prepareAdvancedTerrain(f.small,f.smallShape,op,f.smallContext,f.smallBlocked,f.smallManual);
 assert(actual.metrics.changed>0);assert.equal(actual.metrics.changed,expected.metrics.changed);
 assert.deepEqual(actual.patch.before,expected.patch.before);assert.deepEqual(actual.patch.after,expected.patch.after);
 assert.deepEqual([...actual.patch.indices],[...expected.patch.indices].map(i=>Math.floor(i/2048)*4096+i%2048));
 assert.deepEqual(actual.metrics.affected,expected.metrics.affected);assert.deepEqual(actual.metrics.notices,expected.metrics.notices);
 for(const k of ["maxLoweringM","maxRaisingM","removedM3","addedM3","eligible","protected","waterProtected","siteProtected"] as const)assert.equal(actual.metrics[k],expected.metrics[k],k);
 assert(actual.metrics.workingBytes<=ADVANCED_TERRAIN_LIMITS.workingBytes);
 const patch=new Set(actual.patch.indices);
 for(let y=w.y;y<w.y+w.height;y++)for(let x=w.x;x<w.x+w.width;x++){
  const i=y*4096+x;assert.equal(advancedResultSample(actual,i,f.base[i]),expected.grid[y*2048+x]);
  if(!patch.has(i))assert.equal(advancedResultSample(actual,i,f.base[i]),f.base[i]);
 }
 assert.equal(advancedResultSample(actual,0,f.base[0]),f.base[0]);
 const i=actual.patch.indices[0],key=Math.floor(i/4096/32)*128+Math.floor(i%4096/32),tile=advancedResultTile(actual,f.base,key,shape);
 for(let k=0;k<1024;k++){const x=tile.x*32+(k&31),y=tile.y*32+(k>>5);assert.equal(tile.samples[k],expected.grid[y*2048+x]);}
 assert.deepEqual([hash(f.base),hash(f.blocked),hash(f.manual),JSON.stringify(f.context)],before);
 return {w,actual};
}

for(const form of ["cone","shield","composite","cratered","caldera"] as const)test(`4096 native ${form} window exactly matches the original kernel, guards and source tiles`,async()=>{await compare({...volcano,form});});
test("a selected volcano flank retains its centre check outside the selected outline",async()=>{
 const op={...volcano,centre:point(750.5,850.5),radiusM:22000,blendM:10000},f=fixture();await compare(op,f);
 // Cover both sides of the deliberately fractional nearest-sample tie. The
 // independent whole-source kernel must reject before testing the window.
 for(const y of [850,851])for(const x of [750,751]){f.base[y*4096+x]=-500;f.small[y*2048+x]=-500;}
 assert.throws(()=>prepareAdvancedTerrain(f.small,f.smallShape,op,f.smallContext),/centre on saved land/);
 const w=planProfileWindow(shape,op,f.context)!;
 await assert.rejects(prepareWindowedProfile(copyProfileWindow(f.base,w),shape,op,f.context,w),/centre on saved land/);
});
test("river validation reads complete saved routes outside the selection and rejects uphill ground there",async()=>{
 const op:AdvancedOperation={kind:"river-channel",selection,preserveManual:true,strength:100,riverId:"saved-river",course:"segment",first:0,last:null,widthM:500,depthM:40,bankSoftness:.7,smoothing:.5},f=fixture();await compare(op,f);
 f.base[790*4096+850]=4000;const w=planProfileWindow(shape,op,f.context)!;
 await assert.rejects(prepareWindowedProfile(copyProfileWindow(f.base,w),shape,op,f.context,w),/uphill terrain/);
});
for(const effect of ["collapse","lava"] as const)test(`4096 native ${effect} retains exact accepted volcano and flow arithmetic`,async()=>{
 await compare({kind:"eruption",selection,preserveManual:true,strength:75,volcanoId:"de132f42-d461-40cf-8974-5e8771e8049a",effect,source:point(850,850),extentM:20000,widthM:500,magnitudeM:300,steps:64});
});
test("bounded native jobs use the existing protocol; cancellation and forged windows retain accepted inputs",async()=>{
 const f=fixture(),w=planProfileWindow(shape,volcano,f.context)!,before=hash(f.base),input=copyProfileWindow(f.base,w),r=await prepareTerrainOperationJob({shape,operation:volcano,context:f.context,window:w,base:input.buffer as ArrayBuffer});
 assert(r.changed>0);assert.equal(r.grid.byteLength,w.width*w.height*2);assert(r.advancedMetrics!.workingBytes<=ADVANCED_TERRAIN_LIMITS.workingBytes);
 const abort=new AbortController();abort.abort();await assert.rejects(prepareWindowedProfile(copyProfileWindow(f.base,w),shape,volcano,f.context,w,undefined,undefined,undefined,abort.signal),/cancel/i);
 await assert.rejects(prepareWindowedProfile(copyProfileWindow(f.base,w),shape,volcano,f.context,{...w,x:w.x+32}),/does not match/);
 assert.throws(()=>planProfileWindow(shape,{...volcano,selection:{frame:f.context.frame}},f.context),/262,144/);
 assert.throws(()=>planProfileWindow(shape,{...volcano,centre:point(3000,3000)},f.context),/32 MiB/);
 assert.equal(planProfileWindow({...shape,width:2048,height:2048},volcano,f.context),null);assert.equal(planProfileWindow({...shape,wrap:true},volcano,f.context),null);
 assert.equal(hash(f.base),before);
});

for(const kind of ["volcano","river-channel","collapse","lava"] as const)test(`optional ${kind} shoreline guard retains complete sea supports and exact absent/false behavior`,()=>{
 const s={...shape,width:64,height:64,displayWidth:6400,displayHeight:6400},base=Int16Array.from({length:4096},(_,i)=>i%64<16?-500:2000+(i%64-16)*5+Math.floor(i/64)*2),selection={frame:{x:0,y:0,width:6400,height:6400}},cone:VolcanoOperation={...volcano,selection,centre:{x:3200,y:3200},radiusM:2200,blendM:300,craterDiameterM:0,craterDepthM:0,summitEastM:0,summitSouthM:0},
  c:AdvancedTerrainContext={frame:selection.frame,world:{width:6400,height:6400,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[{id:"de132f42-d461-40cf-8974-5e8771e8049a",revision:7,sourceId:null,operation:cone}]};
 c.water.edges.push({id:"river",name:"Retained course",from:"source",to:"outlet",points:[{x:3000,y:3200},{x:1000,y:3200}],drainageM2:1000,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null});
 const op:AdvancedOperation=kind==="volcano"?cone:kind==="river-channel"?{kind:"river-channel",selection,preserveManual:false,strength:100,riverId:"river",course:"segment",first:0,last:null,widthM:400,depthM:40,bankSoftness:.5,smoothing:.5}:{kind:"eruption",selection,preserveManual:false,strength:100,volcanoId:c.volcanoes[0].id,effect:kind,source:{x:2500,y:3200},extentM:2500,widthM:400,magnitudeM:35,steps:64},
  before=hash(base),legacy=prepareAdvancedTerrain(base,s,op,c),explicitFalse=prepareAdvancedTerrain(base,s,{...op,preserveShoreline:false},c),guarded=prepareAdvancedTerrain(base,s,{...op,preserveShoreline:true},c);assert.deepEqual(legacy,explicitFalse);
 let legacyShoreChanges=0,shore=0;
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=y*64+x;if(base[i]<=0){assert.equal(guarded.grid[i],base[i]);continue;}let support=false;for(let ey=-1;ey<=1;ey++)for(let ex=-1;ex<=1;ex++){const xx=x+ex,yy=y+ey;if(xx>=0&&xx<64&&yy>=0&&yy<64&&base[yy*64+xx]<=0)support=true;}if(support){shore++;assert.equal(guarded.grid[i],base[i]);if(legacy.grid[i]!==base[i])legacyShoreChanges++;}}
 assert(shore>0&&legacyShoreChanges>0);assert(guarded.metrics.changed>0);assert.equal(hash(base),before);assert.equal(advancedTerrainShoreSteps({...op,preserveShoreline:true},4096),4096*8);assert.equal(advancedTerrainSampleSteps({...op,preserveShoreline:true},4096),4096*9);
});
test("4096 coastal previews retain guarded nearest supports through native windows",async()=>{await compare({...volcano,preserveShoreline:true});});

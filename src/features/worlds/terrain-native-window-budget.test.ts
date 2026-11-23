import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {prepareAdvancedTerrain,prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "./terrain-advanced";
import {ADVANCED_TERRAIN_LIMITS,type AdvancedOperation} from "./terrain-advanced-spec";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import type {TerrainGeometry} from "./terrain";
import {needsProfileWindow,planProfileWindow,copyProfileWindow,prepareWindowedProfile,advancedResultSample} from "./terrain-profile-window";
import {prepareTerrainOperationJob} from "./terrain-operation-engine";

const hash=(v:Int16Array|Uint8Array)=>createHash("sha256").update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).digest("hex");
type Profile=Extract<AdvancedOperation,{kind:"landform-profile"}>;

test("dense sources use a native window when selected work exceeds whole-source memory",async()=>{
 const s:TerrainGeometry={width:2048,height:2048,tileSize:32,displayWidth:20000,displayHeight:14000,min:-12000,max:12000,wrap:false},
  c:AdvancedTerrainContext={frame:{x:12345.67890123,y:43210.98765432,width:s.displayWidth,height:s.displayHeight},world:{width:2000000,height:2000000,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]},
  sx=s.displayWidth/s.width,sy=s.displayHeight/s.height,point=(x:number,y:number)=>({x:c.frame.x+x*sx,y:c.frame.y+y*sy}),
  op:Profile={kind:"landform-profile",mode:"minimum",preserveManual:true,strength:100,hardness:1,endBlendM:0,featherM:0,
   selection:{frame:{...point(500.1,500.1),width:511.5*sx,height:255.5*sy}},points:[{...point(520,550),elevationM:2000,widthM:20000},{...point(980,700),elevationM:2000,widthM:20000}]},
  base=new Int16Array(s.width*s.height).fill(500),blocked=new Uint8Array(base.length),manual=new Uint8Array(base.length),index=(x:number,y:number)=>y*s.width+x;
 blocked[index(600,625)]=1;manual[index(610,625)]=1;base[index(620,625)]=-500;
 c.sites.push({id:"retained-town",...point(750,625)});
 const origin=point(700,600);
 c.water.lakes=[{id:"retained-lake",name:"Accepted bed",rings:[[{...origin},{x:origin.x+30*sx,y:origin.y},{x:origin.x+30*sx,y:origin.y+20*sy},{x:origin.x,y:origin.y+20*sy}]],levelM:1300,seed:point(715,610),spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
 const original=[hash(base),hash(blocked),hash(manual),JSON.stringify(c)];
 assert(needsProfileWindow(s,op));
 assert.throws(()=>prepareAdvancedTerrain(base,s,op,c,blocked,manual),/32 MiB/);
 const w=planProfileWindow(s,op,c)!;assert(w);assert(w.width*w.height<base.length/2);
 const actual=await prepareWindowedProfile(copyProfileWindow(base,w),s,op,c,w,copyProfileWindow(blocked,w),copyProfileWindow(manual,w));
 assert(actual.metrics.changed>100000);assert(actual.metrics.workingBytes<=ADVANCED_TERRAIN_LIMITS.workingBytes);
 assert.equal(advancedResultSample(actual,index(650,650),500),2000);
 for(const i of [index(600,625),index(610,625),index(620,625),index(621,625),index(750,625),index(710,610)])assert.equal(advancedResultSample(actual,i,base[i]),base[i],"Retained manual, child, shore, settlement and lake supports");
 assert.equal(advancedResultSample(actual,0,base[0]),base[0]);
 for(const i of actual.patch.indices){assert(i%s.width>=500&&i%s.width<=1013);assert(Math.floor(i/s.width)>=500&&Math.floor(i/s.width)<=757);}
 const worker=await prepareTerrainOperationJob({shape:s,operation:op,context:c,window:w,base:copyProfileWindow(base,w).buffer as ArrayBuffer,blocked:copyProfileWindow(blocked,w).buffer as ArrayBuffer,manual:copyProfileWindow(manual,w).buffer as ArrayBuffer});
 assert.deepEqual(new Uint32Array(worker.indices),actual.patch.indices);assert.deepEqual(new Int16Array(worker.before),actual.patch.before);assert.deepEqual(new Int16Array(worker.after),actual.patch.after);assert.deepEqual(new Int16Array(worker.grid),actual.grid);
 const abort=new AbortController();abort.abort();await assert.rejects(prepareWindowedProfile(copyProfileWindow(base,w),s,op,c,w,undefined,undefined,undefined,abort.signal),/cancel/i);
 assert.deepEqual([hash(base),hash(blocked),hash(manual),JSON.stringify(c)],original);
});

test("ordinary work keeps its whole-source path and optional erosion buffers remain charged",async()=>{
 const s:TerrainGeometry={width:2048,height:1024,tileSize:32,displayWidth:204800,displayHeight:102400,min:-12000,max:12000,wrap:false},
  c:AdvancedTerrainContext={frame:{x:0,y:0,width:s.displayWidth,height:s.displayHeight},world:{width:s.displayWidth,height:s.displayHeight,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]},
  op:Extract<AdvancedOperation,{kind:"erosion"}>={kind:"erosion",model:"thermal",iterations:1,direction:0,directionInfluence:0,deposition:false,maxDepthM:25,reposeDegrees:30,featherM:0,selection:{frame:{x:40000,y:20000,width:51100,height:51100}},preserveManual:false,strength:100,preserveShoreline:true,bankReinforcementM:120};
 assert(needsProfileWindow(s,op));assert(planProfileWindow(s,op,c));
 assert.equal(planProfileWindow(s,{...op,preserveShoreline:false,bankReinforcementM:undefined},c),null,"Previously admitted whole-source arithmetic stays the default");
 const base=Int16Array.from({length:s.width*s.height},(_,i)=>i%2?1500:1000),blocked=new Uint8Array(base.length),manual=new Uint8Array(base.length);
 base[350*s.width+600]=-500;blocked[400*s.width+650]=1;manual[450*s.width+700]=1;
 const original=[hash(base),hash(blocked),hash(manual)],w=planProfileWindow(s,op,c)!;
 assert.throws(()=>prepareAdvancedTerrain(base,s,op,c,blocked,manual),/32 MiB/);
 await assert.rejects(prepareWindowedProfile(copyProfileWindow(base,w),s,op,c,w,copyProfileWindow(blocked,w),copyProfileWindow(manual,w)),/bank reinforcement exceeds its chosen maximum/);
 await assert.rejects(prepareWindowedProfile(copyProfileWindow(base,w),s,{...op,bankReinforcementM:600},c,w,copyProfileWindow(blocked,w),copyProfileWindow(manual,w)),/cannot finish a safe join/);
 // Allocation is independent of whether a safe proposal needs any erosion.
 // A flat bank must remain exact while all optional buffers are still charged.
 const flat=new Int16Array(base.length).fill(1000);flat[350*s.width+600]=-500;const flatHash=hash(flat);
 const actual=await prepareWindowedProfile(copyProfileWindow(flat,w),s,op,c,w,copyProfileWindow(blocked,w),copyProfileWindow(manual,w));
 assert.equal(actual.metrics.changed,0);assert(actual.metrics.workingBytes<=ADVANCED_TERRAIN_LIMITS.workingBytes);assert.equal(hash(flat),flatHash);
 for(const i of [350*s.width+600,350*s.width+601,400*s.width+650])assert.equal(advancedResultSample(actual,i,flat[i]),flat[i]);
 const ordinary={...op,preserveShoreline:false,bankReinforcementM:undefined},fallback=await prepareAdvancedTerrainAsync(base,s,ordinary,c,blocked,manual);
 assert(fallback.metrics.changed>0);assert.equal(fallback.window,undefined);
 assert.deepEqual([hash(base),hash(blocked),hash(manual)],original,"Borrowed whole-source cooperative input remains immutable");
 assert.equal(needsProfileWindow({...s,width:640,height:384},op),false);assert.equal(planProfileWindow({...s,wrap:true},op,c),null);
 const dense={...s,height:2048,displayHeight:204800},small:Profile={kind:"landform-profile",mode:"shape",preserveManual:false,strength:100,hardness:0,endBlendM:0,featherM:0,selection:{frame:{x:10000,y:10000,width:1000,height:1000}},points:[{x:10000,y:10000,elevationM:600,widthM:1000},{x:11000,y:11000,elevationM:700,widthM:1000}]};
 assert.equal(planProfileWindow(dense,small,{...c,frame:{...c.frame,height:dense.displayHeight},world:{...c.world,height:dense.displayHeight}}),null);
 assert.equal(ADVANCED_TERRAIN_LIMITS.cells,262144);assert.equal(ADVANCED_TERRAIN_LIMITS.work,8388608);assert.equal(ADVANCED_TERRAIN_LIMITS.workingBytes,33554432);assert.equal(ADVANCED_TERRAIN_LIMITS.workerMs,30000);
});

test("automatic windows refuse oversized selections and padded seam work before copying",()=>{
 const s:TerrainGeometry={width:2048,height:1024,tileSize:32,displayWidth:204800,displayHeight:102400,min:-12000,max:12000,wrap:false},
  c:AdvancedTerrainContext={frame:{x:0,y:0,width:s.displayWidth,height:s.displayHeight},world:{width:s.displayWidth,height:s.displayHeight,wrap:true},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]},
  op:Extract<AdvancedOperation,{kind:"erosion"}>={kind:"erosion",model:"thermal",iterations:1,direction:0,directionInfluence:0,deposition:false,maxDepthM:25,reposeDegrees:30,featherM:0,selection:{frame:{x:193000,y:100,width:24500,height:99900}},preserveManual:false,strength:100,preserveShoreline:true,bankReinforcementM:120};
 assert.throws(()=>planProfileWindow(s,op,c),/32 MiB/);
 assert.throws(()=>planProfileWindow(s,{...op,selection:{frame:{x:0,y:0,width:204800,height:102400}}},c),/262,144/);
});

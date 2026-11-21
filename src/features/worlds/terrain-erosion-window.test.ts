import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {prepareAdvancedTerrain,prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "./terrain-advanced";
import {ADVANCED_TERRAIN_LIMITS,erosionOperationSchema,type AdvancedOperation} from "./terrain-advanced-spec";
import {planProfileWindow,copyProfileWindow,prepareWindowedProfile} from "./terrain-profile-window";
import {planSharedRelief,prepareSharedReliefSource,type SharedReliefSource} from "./terrain-shared-relief";
import {sharedReliefCommandSchema} from "./terrain-shared-relief-spec";
import {parseSharedReliefDraft,sharedReliefStorageKey} from "./terrain-shared-relief-recovery";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import type {TerrainGeometry} from "./terrain";
type Erosion=Extract<AdvancedOperation,{kind:"erosion"}>;
const hash=(v:Int16Array)=>createHash("sha256").update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).digest("hex");
function fixture(width=192,height=128){
 const shape:TerrainGeometry={width,height,tileSize:32,displayWidth:width*176.65,displayHeight:height*168.22,min:-30000,max:30000,wrap:false};
 const context:AdvancedTerrainContext={frame:{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight},world:{width:1000000,height:1000000,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]};
 const base=new Int16Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)base[y*width+x]=x<20?-500:x===20?200:2000;
 const operation:Erosion={kind:"erosion",selection:{frame:{...context.frame}},preserveManual:false,strength:100,model:"thermal",iterations:40,direction:0,directionInfluence:0,deposition:false,maxDepthM:3000,reposeDegrees:30,featherM:0,preserveShoreline:true};
 return {shape,context,base,operation};
}
test("thermal outflow lowers the artificial coastal wall while every original sea and shoreline support remains exact",()=>{
 const {shape,context,base,operation}=fixture(),before=hash(base),r=prepareAdvancedTerrain(base,shape,operation,context);let max=0;
 for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++){
  const i=y*shape.width+x;if(x<=20)assert.equal(r.grid[i],base[i]);else if(x===21)max=Math.max(max,r.grid[i]-r.grid[i-1]);
  assert(r.grid[i]<=base[i]);if(base[i]>0)assert(r.grid[i]>0);
 }
 assert(max<180,"40 bounded iterations must remove most of the original1800m coastal wall");assert.equal(r.metrics.addedM3,0);assert(r.metrics.removedM3>0);assert.equal(hash(base),before);
});
test("deposits never enter fixed shore supports and absent/false flags retain identical legacy numerics",()=>{
 const {shape,context,base,operation}=fixture();
 const withDeposits=prepareAdvancedTerrain(base,shape,{...operation,deposition:true},context);
 for(let y=0;y<shape.height;y++)assert.equal(withDeposits.grid[y*shape.width+20],200);
 const {preserveShoreline:unused,...legacy}=operation;void unused;
 assert.deepEqual(prepareAdvancedTerrain(base,shape,legacy,context),prepareAdvancedTerrain(base,shape,{...legacy,preserveShoreline:false},context));
});
test("explicit faster outflow settles the whole coastal transition within unchanged step and wear limits",()=>{
 const {shape,context,base,operation}=fixture(),r=prepareAdvancedTerrain(base,shape,{...operation,outflowRate:4},context);let max=0;
 for(let y=4;y<shape.height-4;y++)for(let x=20;x<shape.width-4;x++)max=Math.max(max,Math.abs(r.grid[y*shape.width+x+1]-r.grid[y*shape.width+x]));
 assert(max<shape.displayWidth/shape.width,"The complete transition, including its inland front, stays below45degrees");
 for(let y=0;y<shape.height;y++)for(let x=0;x<=20;x++)assert.equal(r.grid[y*shape.width+x],base[y*shape.width+x]);
 const capped=prepareAdvancedTerrain(base,shape,{...operation,outflowRate:4,maxDepthM:100},context);assert(capped.metrics.maxLoweringM<=100);assert.equal(capped.metrics.maxRaisingM,0);
 assert.deepEqual(prepareAdvancedTerrain(base,shape,operation,context),prepareAdvancedTerrain(base,shape,{...operation,outflowRate:1},context));
 for(const outflowRate of [0,4.01,Infinity,NaN])assert.equal(erosionOperationSchema.safeParse({...operation,outflowRate}).success,false);
 assert.equal(erosionOperationSchema.safeParse({...operation,outflowRate:4,deposition:true}).success,false);
});
test("site, manual and finer protection cannot become fixed outflow receivers",()=>{
 const {shape,context,base,operation}=fixture(64,64),i=30*64+20,near=i+1,blocked=new Uint8Array(base.length),manual=new Uint8Array(base.length);
 // Isolate a single high node and a coast support; all other land is protected.
 blocked.fill(1);blocked[near]=0;const guard=blocked.slice();guard.fill(0);guard[i]=1;context.shoreSupports=guard;
 const free=prepareAdvancedTerrain(base,shape,operation,context,blocked);assert(free.grid[near]<2000);
 context.sites=[{id:"site",x:20*176.65,y:30*168.22}];assert.equal(prepareAdvancedTerrain(base,shape,operation,context,blocked).grid[near],2000);
 context.sites=[];manual[i]=1;assert.equal(prepareAdvancedTerrain(base,shape,{...operation,preserveManual:true},context,blocked,manual).grid[near],2000);
 context.shoreSupports=undefined;assert.equal(prepareAdvancedTerrain(base,shape,operation,context,blocked).grid[near],2000);
 context.shoreSupports=guard;context.water.lakes=[{id:"wet",name:"Fixed coastal bed",rings:[[{x:19.5*176.65,y:29.5*168.22},{x:20.5*176.65,y:29.5*168.22},{x:20.5*176.65,y:30.5*168.22},{x:19.5*176.65,y:30.5*168.22}]],levelM:3810,seed:{x:20*176.65,y:30*168.22},spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
 assert.equal(prepareAdvancedTerrain(base,shape,operation,context,blocked).grid[near],2000);
});
test("saved shore supports stay exact on both filter sides at nonzero sea levels and a wrapping seam",()=>{
 for(const shift of [-1100,1100]){
  const f=fixture(64,64);f.shape.wrap=true;f.context.world={width:f.shape.displayWidth,height:f.shape.displayHeight,wrap:true};f.context.seaLevel=shift;
  f.base=Int16Array.from(f.base,z=>z+shift);const r=prepareAdvancedTerrain(f.base,f.shape,{...f.operation,outflowRate:4},f.context);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
   const i=y*64+x,z=f.base[i];let shore=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=y+dy;if(yy>=0&&yy<64&&(f.base[yy*64+(x+dx+64)%64]>shift)!==(z>shift))shore=true;}
   if(shore||z<=shift)assert.equal(r.grid[i],z);if(z>shift)assert(r.grid[i]>shift);
  }
 }
});
test("windowed erosion is exact against the unchanged whole-source physical lattice",async()=>{
 const f=fixture(512,512),large={...f.shape,width:4096,height:4096,displayWidth:4096*176.65,displayHeight:4096*168.22},c={...f.context,frame:{...f.context.frame,width:large.displayWidth,height:large.displayHeight},world:{width:2000000,height:2000000,wrap:false}},base=new Int16Array(4096*4096).fill(2000);
 for(let y=0;y<512;y++)base.set(f.base.subarray(y*512,(y+1)*512),y*4096);
 for(const preserveShoreline of [false,true])for(const deposition of [false,true]){
  const op={...f.operation,iterations:12,preserveShoreline,deposition,selection:{frame:{x:10*176.65,y:100*168.22,width:80*176.65,height:80*168.22}}},w=planProfileWindow(large,op,c)!;
  assert(w);const actual=await prepareWindowedProfile(copyProfileWindow(base,w),large,op,c,w),expected=prepareAdvancedTerrain(f.base,f.shape,op,f.context);
  assert.deepEqual(actual.patch.before,expected.patch.before);assert.deepEqual(actual.patch.after,expected.patch.after);
  assert.deepEqual([...actual.patch.indices],[...expected.patch.indices].map(i=>Math.floor(i/512)*4096+i%512));
  assert(actual.metrics.workingBytes<=ADVANCED_TERRAIN_LIMITS.workingBytes);assert.deepEqual(actual.metrics.affected,expected.metrics.affected);
 }
});
test("shared erosion counts combined iterations and preserves coast guards at each source resolution",async()=>{
 const f=fixture(128,128),source:SharedReliefSource={id:null,revision:1,shape:f.shape,frame:f.context.frame},op={...f.operation,iterations:20},budget=planSharedRelief([source],op,f.context.frame,f.context);
 assert.equal(budget.sampleSteps,budget.cells*20);const plan=budget.plans[0],guard=new Uint8Array(plan.window.width*plan.window.height),b=copyProfileWindow(f.base,plan.window);
 const r=await prepareSharedReliefSource(plan,b,new Uint8Array(b.length),op,f.context,undefined,undefined,guard);assert(r.metrics.changed>0);
 for(let y=0;y<128;y++)for(let x=0;x<=20;x++)assert.equal(r.grid[y*128+x],f.base[y*128+x]);
 const many=Array.from({length:20},(_,i)=>({...source,id:i?String(i):null}));assert.throws(()=>planSharedRelief(many,op,f.context.frame,f.context),/262,144|8,388,608/);
});
test("bounded windows refuse excess work, cancellation retains accepted inputs and shared recovery does not replace the original profile key",async()=>{
 const f=fixture(),abort=new AbortController();abort.abort();const before=hash(f.base);
 await assert.rejects(prepareAdvancedTerrainAsync(f.base,f.shape,f.operation,f.context,undefined,undefined,undefined,abort.signal),/cancel/i);assert.equal(hash(f.base),before);
 const world="11111111-1111-4111-8111-111111111111",map="22222222-2222-4222-8222-222222222222",key=`st:terrain-shared-relief:v1:${world}:${map}`;
 assert.equal(sharedReliefStorageKey(world,map,"landform-profile"),key);assert.notEqual(sharedReliefStorageKey(world,map,"erosion"),key);
 const draft={version:1,worldId:world,mapId:map,operation:f.operation,workArea:f.context.frame},raw=JSON.stringify(draft);
 assert.equal(parseSharedReliefDraft(raw,world,map,"erosion").operation.kind,"erosion");assert.throws(()=>parseSharedReliefDraft(raw,world,map,"landform-profile"),/another/);
 assert(sharedReliefCommandSchema.safeParse({action:"preview",mapId:map,operation:f.operation,workArea:f.context.frame}).success);
 assert.throws(()=>planSharedRelief([{id:null,revision:1,shape:{...f.shape,width:4096,height:4096},frame:f.context.frame}],f.operation,f.context.frame,f.context),/262,144/);
});

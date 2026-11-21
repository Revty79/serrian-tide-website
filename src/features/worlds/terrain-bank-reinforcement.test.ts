import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {prepareAdvancedTerrain,prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "./terrain-advanced";
import {erosionOperationSchema,ADVANCED_TERRAIN_LIMITS,type AdvancedOperation} from "./terrain-advanced-spec";
import {EMPTY_HYDROLOGY} from "./terrain-hydrology";
import type {TerrainGeometry} from "./terrain";
import {planSharedRelief} from "./terrain-shared-relief";
import {planProfileWindow,copyProfileWindow,prepareWindowedProfile} from "./terrain-profile-window";
type Erosion=Extract<AdvancedOperation,{kind:"erosion"}>;
const hash=(v:Int16Array)=>createHash("sha256").update(new Uint8Array(v.buffer)).digest("hex");
function fixture(){
 const shape:TerrainGeometry={width:64,height:64,tileSize:32,displayWidth:64*51.64,displayHeight:64*54.26,min:-30000,max:30000,wrap:false};
 const context:AdvancedTerrainContext={frame:{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight},world:{width:100000,height:100000,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]};
 const base=new Int16Array(4096).fill(200);for(let y=0;y<64;y++)for(let x=0;x<=20;x++)base[y*64+x]=x<20?-500:y%4<2?200:1;
 const operation:Erosion={kind:"erosion",selection:{frame:{...context.frame}},preserveManual:false,strength:100,model:"thermal",iterations:40,direction:90,directionInfluence:.6,deposition:false,maxDepthM:2000,reposeDegrees:30,featherM:0,preserveShoreline:true,outflowRate:4};
 return {shape,context,base,operation};
}
function newSteep(before:Int16Array,after:Int16Array,shape:TerrainGeometry){let count=0;for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++)for(const[dx,dy,spacing]of [[1,0,shape.displayWidth/shape.width],[0,1,shape.displayHeight/shape.height]]){if(x+dx>=shape.width||y+dy>=shape.height)continue;const i=y*shape.width+x,j=(y+dy)*shape.width+x+dx;if(before[i]>0&&before[j]>0&&after[i]>0&&after[j]>0&&Math.abs(before[i]-before[j])<=spacing&&Math.abs(after[i]-after[j])>spacing)count++;}return count;}
function savedSupportsExact(before:Int16Array,after:Int16Array){for(let y=0;y<64;y++)for(let x=0;x<=20;x++)assert.equal(after[y*64+x],before[y*64+x]);}
test("retained legacy mixed-bank erosion reproduces inward cliffs without changing its fixed shores",()=>{
 const f=fixture(),before=hash(f.base),r=prepareAdvancedTerrain(f.base,f.shape,f.operation,f.context);savedSupportsExact(f.base,r.grid);assert(newSteep(f.base,r.grid,f.shape)>0);assert.equal(hash(f.base),before);
});
test("explicit reinforcement prevents mixed protected banks from acquiring new inward cliffs",()=>{
 const f=fixture(),r=prepareAdvancedTerrain(f.base,f.shape,{...f.operation,bankReinforcementM:200},f.context);savedSupportsExact(f.base,r.grid);assert.equal(newSteep(f.base,r.grid,f.shape),0);assert(r.metrics.changed>0);assert.equal(r.metrics.maxRaisingM,0);assert(r.metrics.maxLoweringM<100);
});
test("reinforcement repairs already lowered ground while retaining every protected coast sample",()=>{
 const f=fixture(),damaged=prepareAdvancedTerrain(f.base,f.shape,f.operation,f.context).grid,before=hash(damaged),r=prepareAdvancedTerrain(damaged,f.shape,{...f.operation,bankReinforcementM:200},f.context);savedSupportsExact(f.base,r.grid);assert.equal(newSteep(f.base,r.grid,f.shape),0);assert(r.metrics.maxRaisingM>0);assert(r.metrics.maxRaisingM<=200);assert(r.metrics.addedM3>0);assert.equal(hash(damaged),before);assert(r.metrics.notices.some(n=>n.includes("not conserved")));
});
test("conflicting fixed shore heights remain exact and their reinstated sharp shoulders are reported",()=>{
 const f=fixture(),damaged=prepareAdvancedTerrain(f.base,f.shape,f.operation,f.context).grid,r=prepareAdvancedTerrain(damaged,f.shape,{...f.operation,bankReinforcementM:200},f.context);assert((r.metrics.bankSupportConflicts??0)>0);assert((r.metrics.maxBankSupportStepM??0)>100);assert(r.metrics.notices.some(n=>n.includes("Conflicting protected heights")));savedSupportsExact(f.base,r.grid);
});
test("an insufficient explicit fill cap refuses without modifying the accepted input",()=>{
 const f=fixture(),damaged=prepareAdvancedTerrain(f.base,f.shape,f.operation,f.context).grid,before=hash(damaged);assert.throws(()=>prepareAdvancedTerrain(damaged,f.shape,{...f.operation,bankReinforcementM:1},f.context),/chosen maximum/);assert.equal(hash(damaged),before);
});
test("reinforcement settings require thermal transport, fixed shores and non-depositing material semantics",()=>{
 const f=fixture();assert(erosionOperationSchema.safeParse({...f.operation,bankReinforcementM:200}).success);for(const bankReinforcementM of [0,-1,1.5,3001,Infinity,NaN])assert.equal(erosionOperationSchema.safeParse({...f.operation,bankReinforcementM}).success,false);for(const change of [{model:"runoff"},{deposition:true,outflowRate:1},{preserveShoreline:false}])assert.equal(erosionOperationSchema.safeParse({...f.operation,bankReinforcementM:200,...change}).success,false);
});
test("manual, finer, settlement, lake and wetland supports stay exact under reinforced transport",()=>{
 const f=fixture(),manual=new Uint8Array(4096),blocked=new Uint8Array(4096),sx=f.shape.displayWidth/64,sy=f.shape.displayHeight/64;manual[25*64+24]=1;blocked[27*64+24]=1;f.context.sites.push({id:"native-site",x:26*sx,y:30*sy});
 const ring=(x:number,y:number)=>[{x:(x-.2)*sx,y:(y-.2)*sy},{x:(x+1.2)*sx,y:(y-.2)*sy},{x:(x+1.2)*sx,y:(y+1.2)*sy},{x:(x-.2)*sx,y:(y+1.2)*sy}];
 f.context.water.lakes=[{id:"native-lake",name:"Protected lake",rings:[ring(24,35)],levelM:3810,seed:{x:24*sx,y:35*sy},spillM:null,condition:"standing",mode:"closed",inletNodeIds:[],outletNodeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
 f.context.water.features=[{id:"native-wetland",name:"Protected wetland",description:"",kind:"wetland",rings:[ring(24,40)],classification:"wetland",riverId:null,lakeId:null,flowKind:"manual",exceptionReason:"",protected:true,analysisId:null,sourceIds:[],review:false}];
 const water=structuredClone(f.context.water),r=prepareAdvancedTerrain(f.base,f.shape,{...f.operation,preserveManual:true,bankReinforcementM:200},f.context,blocked,manual);savedSupportsExact(f.base,r.grid);for(const i of [25*64+24,27*64+24,35*64+24,36*64+25,40*64+24,41*64+25])assert.equal(r.grid[i],f.base[i]);for(let y=29;y<=31;y++)for(let x=25;x<=27;x++)assert.equal(r.grid[y*64+x],f.base[y*64+x]);assert.deepEqual(f.context.water,water);assert(r.metrics.protected>=2);assert(r.metrics.siteProtected>=9);
});
test("unfinished reinforced joins refuse at short duration without changing the accepted ground",()=>{
 const f=fixture(),damaged=f.base.slice();for(let y=0;y<64;y++)for(let x=21;x<40;x++)damaged[y*64+x]=36;const before=hash(damaged);assert.throws(()=>prepareAdvancedTerrain(damaged,f.shape,{...f.operation,iterations:1,bankReinforcementM:200},f.context),/safe join/);assert.equal(hash(damaged),before);
});
test("native shared and window planners charge reinforcement work within the unchanged limits",()=>{
 const f=fixture(),shape={...f.shape,width:512,height:384,displayWidth:512*51.64,displayHeight:384*54.26},context={...f.context,frame:{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight}},op={...f.operation,selection:{frame:context.frame}},sources=[{id:null,revision:1,level:0,shape,frame:context.frame}];
 assert.equal(planSharedRelief(sources,op,context.frame,context).sampleSteps,512*384*40);assert.throws(()=>planSharedRelief(sources,{...op,bankReinforcementM:200},context.frame,context),/smaller|8,388,608/);assert.throws(()=>planProfileWindow(shape,{...op,bankReinforcementM:200},context,{shared:true,processingArea:context.frame}),/smaller|8,388,608/);assert.equal(ADVANCED_TERRAIN_LIMITS.work,8388608);assert.equal(ADVANCED_TERRAIN_LIMITS.workingBytes,33554432);assert.equal(ADVANCED_TERRAIN_LIMITS.workerMs,30000);
});
test("reinforced 4096-square native windows equal the same regional physical samples",async()=>{
 const f=fixture(),sx=f.shape.displayWidth/64,sy=f.shape.displayHeight/64,frame={x:100000,y:200000,width:4096*sx,height:4096*sy},world={width:1000000,height:1000000,wrap:false},large={...f.shape,width:4096,height:4096,displayWidth:frame.width,displayHeight:frame.height},area={x:frame.x+18*sx,y:frame.y+16*sy,width:25*sx,height:20*sy},op={...f.operation,selection:{frame},bankReinforcementM:200},base=new Int16Array(4096*4096).fill(200);for(let y=0;y<4096;y++)for(let x=0;x<=20;x++)base[y*4096+x]=x<20?-500:y%4<2?200:1;
 const regionalContext={...f.context,frame:{...frame,width:f.shape.displayWidth,height:f.shape.displayHeight},world,processingArea:area},expected=prepareAdvancedTerrain(f.base,f.shape,op,regionalContext),context={...f.context,frame,world},window=planProfileWindow(large,op,context,{shared:true,processingArea:area})!,actual=await prepareWindowedProfile(copyProfileWindow(base,window),large,op,context,window);
 assert.deepEqual(actual.patch.before,expected.patch.before);assert.deepEqual(actual.patch.after,expected.patch.after);assert.deepEqual([...actual.patch.indices],[...expected.patch.indices].map(i=>Math.floor(i/64)*4096+i%64));assert(actual.metrics.workingBytes<=33554432);
});
test("cooperative reinforced cancellation preserves accepted terrain",async()=>{
 const f=fixture(),shape={...f.shape,width:192,height:192,displayWidth:192*51.64,displayHeight:192*54.26},context={...f.context,frame:{x:0,y:0,width:shape.displayWidth,height:shape.displayHeight}},base=new Int16Array(192*192).fill(200);for(let y=0;y<192;y++)for(let x=0;x<=20;x++)base[y*192+x]=x<20?-500:y%4<2?200:1;const before=hash(base),controller=new AbortController(),run=prepareAdvancedTerrainAsync(base,shape,{...f.operation,selection:{frame:context.frame},bankReinforcementM:200},context,undefined,undefined,undefined,controller.signal);setTimeout(()=>controller.abort(),1);await assert.rejects(run,/cancel/i);assert.equal(hash(base),before);
});
test("nonzero sea levels and wrapping seams retain exact reinforced native heights under rotation",()=>{
 for(const seaLevel of [-1100,1100]){
  const f=fixture(),shape={...f.shape,wrap:true},context={...f.context,world:{width:f.shape.displayWidth,height:f.shape.displayHeight,wrap:true},seaLevel},base=Int16Array.from(f.base,v=>v+seaLevel),operation={...f.operation,bankReinforcementM:200},a=prepareAdvancedTerrain(base,shape,operation,context),rotate=(g:Int16Array)=>{const result=g.slice();for(let y=0;y<64;y++)for(let x=0;x<64;x++)result[y*64+(x+11)%64]=g[y*64+x];return result;},rotated=prepareAdvancedTerrain(rotate(base),shape,operation,context);assert.deepEqual(rotated.grid,rotate(a.grid));for(let i=0;i<base.length;i++)assert.equal(a.grid[i]>seaLevel,base[i]>seaLevel);
 }
});
test("omitted bank reinforcement keeps exact legacy results while partial strength remains explicit",()=>{
 const f=fixture(),legacy=prepareAdvancedTerrain(f.base,f.shape,f.operation,f.context);assert.deepEqual(prepareAdvancedTerrain(f.base,f.shape,{...f.operation,bankReinforcementM:undefined},f.context),legacy);const damaged=legacy.grid,full=prepareAdvancedTerrain(damaged,f.shape,{...f.operation,bankReinforcementM:200},f.context),partial=prepareAdvancedTerrain(damaged,f.shape,{...f.operation,bankReinforcementM:200,strength:50},f.context);assert(partial.metrics.maxRaisingM>0);assert(partial.metrics.maxRaisingM<full.metrics.maxRaisingM);savedSupportsExact(f.base,partial.grid);
});

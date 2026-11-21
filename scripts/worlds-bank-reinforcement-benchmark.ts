/** Synthetic numerical qualification only. No owner environment or geography. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {prepareAdvancedTerrainAsync} from "../src/features/worlds/terrain-advanced";
import {ADVANCED_TERRAIN_LIMITS,type AdvancedOperation} from "../src/features/worlds/terrain-advanced-spec";
import {EMPTY_HYDROLOGY} from "../src/features/worlds/terrain-hydrology";
import type {TerrainGeometry} from "../src/features/worlds/terrain";

async function main(){
 const label=process.argv[2]??`bank-reinforcement-${Date.now()}`;
 assert(/^[a-z0-9-]+$/.test(label));
 const out=path.resolve("artifacts/collaboration-s7b-bank-reinforcement-benchmark");await mkdir(out,{recursive:true});
 const sx=51.64,sy=54.26,shape:TerrainGeometry={width:512,height:512,tileSize:32,displayWidth:512*sx,displayHeight:512*sy,min:-30000,max:30000,wrap:false},base=new Int16Array(512*512).fill(200);
 for(let y=0;y<512;y++)for(let x=0;x<40;x++)base[y*512+x]=x<20?-500:x===20?(y%4<2?200:1):36;
 const hash=(v:Int16Array)=>createHash("sha256").update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).digest("hex"),before=hash(base),frame={x:0,y:0,width:shape.displayWidth,height:shape.displayHeight},
  context={frame,world:{width:shape.displayWidth,height:shape.displayHeight,wrap:false},seaLevel:0,water:structuredClone(EMPTY_HYDROLOGY),sites:[],volcanoes:[]},
  operation:AdvancedOperation={kind:"erosion",selection:{frame:{...frame,height:340.5*sy}},preserveManual:false,strength:100,model:"thermal",iterations:40,direction:90,directionInfluence:.6,deposition:false,maxDepthM:2000,reposeDegrees:30,featherM:0,preserveShoreline:true,outflowRate:4,bankReinforcementM:200};
 let last=performance.now(),maxTimerDelayMs=0;
 const interval=setInterval(()=>{const now=performance.now();maxTimerDelayMs=Math.max(maxTimerDelayMs,now-last-5);last=now;},5),started=performance.now();
 try{
  const result=await prepareAdvancedTerrainAsync(base,shape,operation,context),elapsedMs=performance.now()-started;
  assert.equal(hash(base),before);
  assert(result.metrics.workingBytes<=ADVANCED_TERRAIN_LIMITS.workingBytes);
  assert(result.metrics.visited<=ADVANCED_TERRAIN_LIMITS.work);
  assert(elapsedMs<ADVANCED_TERRAIN_LIMITS.workerMs);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
   const i=y*512+x;assert.equal(result.grid[i]>0,base[i]>0);
   if(x<=20||y>340)assert.equal(result.grid[i],base[i]);
  }
  assert(result.metrics.maxRaisingM>0&&result.metrics.maxRaisingM<=200);
  const {affected,...metrics}=result.metrics;void affected;
  const receipt={passed:true,at:new Date().toISOString(),syntheticOnly:true,ownerEnvironmentOrGeographyLoaded:false,nativeCells:512*341,chargedSampleSteps:512*341*48,unchangedLimits:ADVANCED_TERRAIN_LIMITS,elapsedMs,maxTimerDelayMs,metrics,inputSha256:before,outputSha256:hash(result.grid),inputAndOriginalShoreSupportsExact:true,allSamplesOutsideSelectionExact:true};
  await writeFile(path.join(out,label+".json"),JSON.stringify(receipt,null,2),{flag:"wx"});console.log(JSON.stringify(receipt));
 }finally{clearInterval(interval);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

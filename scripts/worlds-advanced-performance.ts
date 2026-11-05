/** Bounded numerical stress check. No database, environment file or browser service. */
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {prepareAdvancedTerrainAsync,type AdvancedTerrainContext} from "../src/features/worlds/terrain-advanced";
import {ADVANCED_TERRAIN_LIMITS,type AdvancedOperation} from "../src/features/worlds/terrain-advanced-spec";
import {terrainGeometry} from "../src/features/worlds/terrain";
import {EMPTY_HYDROLOGY} from "../src/features/worlds/terrain-hydrology";
async function main(){
 const iterations=Number(process.env.SERRIAN_ADVANCED_PERFORMANCE_STEPS??32);assert.ok(Number.isInteger(iterations)&&iterations>=1&&iterations<=32);
 const out=path.resolve(process.env.SERRIAN_ADVANCED_PERFORMANCE_OUT??"artifacts/terrain-s6d-numerical-performance-1");
 assert.ok(out.startsWith(path.resolve("artifacts/terrain-s6d-")));await mkdir(out,{recursive:true});
 const shape=terrainGeometry({gridWidth:1024,gridHeight:1024,widthKm:64,heightKm:64,wrap:false,minElevation:-1000,maxElevation:5000}),
  base=Int16Array.from({length:1048576},(_,i)=>Math.round(3000+600*Math.sin(i%1024/17)*Math.sin(Math.floor(i/1024)/21))),
  context:AdvancedTerrainContext={frame:{x:0,y:0,width:64000,height:64000},world:{width:64000,height:64000,wrap:false},seaLevel:0,water:EMPTY_HYDROLOGY,sites:[],volcanoes:[]},
  operation:AdvancedOperation={kind:"erosion",selection:{frame:{x:16000,y:16000,width:31937.5,height:31937.5}},preserveManual:true,strength:90,model:"runoff",iterations,direction:180,directionInfluence:.5,deposition:true,maxDepthM:80,reposeDegrees:20,featherM:500},
  latencies:number[]=[],rssBefore=process.memoryUsage().rss;let next=performance.now()+8,peakRss=rssBefore;
 const timer=setInterval(()=>{const now=performance.now();latencies.push(Math.max(0,now-next));next=now+8;peakRss=Math.max(peakRss,process.memoryUsage().rss);},8),started=performance.now();
 let result;
 try{result=await prepareAdvancedTerrainAsync(base,shape,operation,context);}
 catch(error){await writeFile(path.join(out,"results.json"),JSON.stringify({passed:false,rootSamples:base.length,selectedSamples:262144,iterations,sampleSteps:262144*iterations,elapsedMs:performance.now()-started,maximumEventLoopLagMs:Math.max(0,...latencies),timerTurns:latencies.length,processRssBefore:rssBefore,processRssPeakObserved:Math.max(peakRss,process.memoryUsage().rss),error:(error as Error).message,pureNumericalProbe:true,noDatabaseOrSaveAttempt:true},null,2));throw error;}
 finally{clearInterval(timer);}
 const elapsedMs=performance.now()-started;peakRss=Math.max(peakRss,process.memoryUsage().rss);
 assert.ok(result.metrics.changed>0);assert.ok(result.metrics.workingBytes<=ADVANCED_TERRAIN_LIMITS.workingBytes);
 assert.ok(elapsedMs<30000);assert.ok(latencies.length>0);assert.ok(Math.max(...latencies)<100,"Unchanged 100ms responsiveness gate");
 for(let i=0;i<base.length;i++){const x=i%1024,y=Math.floor(i/1024);if(x<256||x>767||y<256||y>767)assert.equal(result.grid[i],base[i]);}
 const receipt={passed:true,rootSamples:base.length,selectedSamples:262144,iterations,sampleSteps:262144*iterations,elapsedMs,maximumEventLoopLagMs:Math.max(...latencies),timerTurns:latencies.length,numericalWorkingBytes:result.metrics.workingBytes,processRssBefore:rssBefore,processRssPeakObserved:peakRss,rssIsSeparateFromArrayBudget:true,changedSamples:result.metrics.changed,outsideSamplesExact:true,downsampling:false};
 await writeFile(path.join(out,"results.json"),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

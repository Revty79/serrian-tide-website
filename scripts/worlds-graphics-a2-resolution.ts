/** Feasibility only. Unsupported arrays/object-codec pages never become Atlas records.
 * Current schemas/DDL/consumption limits are deliberately not widened here. */
import assert from "node:assert/strict";
import {execFileSync,spawn} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {access,mkdir,readFile,writeFile,stat} from "node:fs/promises";
import path from "node:path";
import {Worker} from "node:worker_threads";
import {terrainSettingsSchema,tileSchema,readTile,applyPatch,type TerrainGeometry,type Brush} from "../src/features/worlds/terrain";
import {initializeRefinement,rootFrame,sampleTerrainGrid,terrainEditMask,refinementGridSize,refinementLogicalBytes,overviewTile} from "../src/features/worlds/terrain-refinement";
import {generateTerrain} from "../src/features/worlds/terrain-generation";
import {presetRecipe} from "../src/features/worlds/terrain-source";
import {TerrainStroke} from "../src/features/worlds/terrain-stroke";
import {keyboardWorldPoint,stepKeyboardPoint} from "../src/features/worlds/terrain-keyboard";
import {paintTerrainWindow} from "../src/features/worlds/terrain-renderer";
import {CLASSIC_RELIEF,type TerrainRelief} from "../src/features/worlds/terrain-relief";

const digest=(grid:Int16Array)=>createHash("sha256").update(new Uint8Array(grid.buffer,grid.byteOffset,grid.byteLength)).digest("hex");
const gc=()=>{(globalThis as unknown as {gc?:()=>void}).gc?.();};
const timed=<T>(work:()=>T)=>{const cpu=process.cpuUsage(),start=performance.now(),value=work(),elapsed=process.cpuUsage(cpu);return {value,wallMs:performance.now()-start,cpuMs:(elapsed.user+elapsed.system)/1000};};
const memory=()=>{const m=process.memoryUsage();return {rss:m.rss,heapUsed:m.heapUsed,arrayBuffers:m.arrayBuffers,external:m.external};};
async function nativeWorker(size:number,parent:Int16Array,parentShape:TerrainGeometry,frame:{x:number;y:number;width:number;height:number},cancel=false){
 const w=new Worker(path.resolve("scripts/worlds-graphics-a2-native-worker.mjs"));
 try{
  await new Promise<void>((resolve,reject)=>{w.once("error",reject);w.once("message",message=>{assert.equal(message.ready,true);resolve();});});
  const job={base:parent.slice().buffer,parent:parentShape,parentFrame:rootFrame(parentShape),frame,width:size,height:size,world:parentShape},start=performance.now();
  if(cancel){w.postMessage(job,[job.base]);await w.terminate();return {cancelled:true,wallMs:performance.now()-start};}
  const reply=await new Promise<{grid?:ArrayBuffer;error?:string}>((resolve,reject)=>{w.once("message",resolve);w.once("error",reject);w.postMessage(job,[job.base]);});
  return {cancelled:false,wallMs:performance.now()-start,supported:!!reply.grid,error:reply.error??null,hash:reply.grid?digest(new Int16Array(reply.grid)):null};
 }finally{await w.terminate();}
}
function analyticGrid(shape:TerrainGeometry){
 const g=new Int16Array(shape.width*shape.height);for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++){
  const u=x/shape.width,v=y/shape.height,broad=2200*Math.sin(u*Math.PI*2)*Math.cos(v*Math.PI*2),ridge=350*Math.sin((u+v)*Math.PI*18)*Math.sin(v*Math.PI*10);
  g[y*shape.width+x]=Math.round(-250+broad+ridge);
 }return g;
}
async function one(){
 const caseStarted=performance.now(),caseCpu=process.cpuUsage();
 const size=Number(process.env.SERRIAN_A2_RESOLUTION_SIZE),kind=process.env.SERRIAN_A2_RESOLUTION_KIND;assert([1024,2048,4096].includes(size));assert(kind==="world"||kind==="local");
 const out=path.resolve(process.env.SERRIAN_A2_RESOLUTION_CASE_OUT!);assert(out.startsWith(path.resolve("artifacts/atlas-graphics-a2")+path.sep));await mkdir(out,{recursive:false});
 const shape:TerrainGeometry={width:size,height:size,tileSize:32,displayWidth:kind==="world"?40000000:64000,displayHeight:kind==="world"?20000000:64000,min:-12000,max:12000,wrap:kind==="world"};
 process.env.DATABASE_URL="postgresql://inert:unused@127.0.0.1:1/no_implicit_database";process.env.SERRIAN_TERRAIN_ROOT=path.join(out,"codec-only-cas");
 execFileSync("git",["check-ignore","-q","--",process.env.SERRIAN_TERRAIN_ROOT],{windowsHide:true});gc();const initialMemory=memory();
 const currentRootAccepted=terrainSettingsSchema.safeParse({gridWidth:size,gridHeight:size,widthKm:shape.displayWidth/1000,heightKm:shape.displayHeight/1000}).success,currentRefinementAccepted=refinementGridSize.safeParse(size).success;
 assert.equal(currentRootAccepted,size===1024);assert.equal(currentRefinementAccepted,size===1024);assert.equal(tileSchema.safeParse({x:size/32-1,y:0,samples:Array(1024).fill(0)}).success,size===1024);
 console.log("RESOLUTION",kind,size,"native generator");
 const recipe={...presetRecipe("continents","Atlas A2 original feasibility"),...kind==="local"?{geographicScale:"custom" as const,continentWidthKm:32,islandWidthKm:1,landmassSpacingKm:8,clusterSpacingKm:4,coastScaleKm:1,mountainLengthKm:24,mountainWidthKm:2,mountainSpacingKm:12,mountainHeightM:1500,oceanDepthM:2000,lowlandHeightM:60,highlandHeightM:400,coastalPlainKm:1}:{}};
 let generator:Record<string,unknown>;try{const t=timed(()=>generateTerrain(shape,recipe,0));generator={status:"kernel-completed",wallMs:t.wallMs,cpuMs:t.cpuMs,hash:digest(t.value.grid),memory:memory(),nativeMapSupported:currentRootAccepted};}catch(e){generator={status:"kernel-refused",error:e instanceof Error?e.message:String(e),nativeMapSupported:currentRootAccepted};}gc();
 const generated=timed(()=>analyticGrid(shape)),grid=generated.value,sourceHash=digest(grid),baseMemory=memory(),maskResult=timed(()=>terrainEditMask(shape,rootFrame(shape),[],shape,kind==="local")),blocked=maskResult.value;
 let target={x:Math.floor(size/2),y:Math.floor(size/2)},best=Infinity;for(let y=4;y<size-4;y++)for(let x=4;x<size-4;x++){const z=Math.abs(grid[y*size+x]);if(z<best){best=z;target={x,y};if(z===0)break;}if(best===0)break;}
 blocked[target.y*size+Math.min(size-1,target.x+1)]=1;const protectedIndex=target.y*size+Math.min(size-1,target.x+1),protectedValue=grid[protectedIndex],strokes:unknown[]=[];
 for(const tool of ["raise","lower","smooth","level","coast-land","coast-water","coast-smooth"] as const){
  const brush:Brush={tool,precision:"fine",radius:32,radiusMetres:kind==="world"?150000:200,strength:80,target:350,seaLevel:0,coastHeight:150,coastBand:5000};
  const start=performance.now(),stroke=new TerrainStroke(grid,shape,brush,target,blocked);stroke.enqueue({x:target.x+4,y:target.y+3});let peakBatchMs=0,batches=0;
  while(stroke.pending){const at=performance.now();stroke.advance(5);peakBatchMs=Math.max(peakBatchMs,performance.now()-at);assert(++batches<20000);}const patch=stroke.finish(),wallMs=performance.now()-start,after=digest(grid);assert.equal(grid[protectedIndex],protectedValue);
  const undo=timed(()=>applyPatch(grid,patch,"before",shape));assert.equal(digest(grid),sourceHash);const redo=timed(()=>applyPatch(grid,patch,"after",shape));assert.equal(digest(grid),after);applyPatch(grid,patch,"before",shape);
  const cancelled=new TerrainStroke(grid,shape,brush,target,blocked);while(cancelled.pending)cancelled.advance(5);cancelled.cancel();assert.equal(digest(grid),sourceHash);
  strokes.push({tool,wallMs,peakBatchMs,batches,changed:patch.indices.length,historyBytes:patch.indices.byteLength+patch.before.byteLength+patch.after.byteLength,undoMs:undo.wallMs,redoMs:redo.wallMs,exactUndoRedoCancel:true});
 }
 const single=new TerrainStroke(grid,shape,{tool:"raise",precision:"single",radius:1,strength:100},target,blocked);while(single.pending)single.advance(5);const stamp=single.finish();assert.equal(stamp.indices.length,1);applyPatch(grid,stamp,"before",shape);assert.equal(digest(grid),sourceHash);
 const origin=keyboardWorldPoint(target,shape,undefined,shape),next=keyboardWorldPoint(stepKeyboardPoint(target,"right",1,shape),shape,undefined,shape);assert(Math.abs((next.x-origin.x)-shape.displayWidth/size)<1e-7);const sampleStep={eastM:shape.displayWidth/size,southM:shape.displayHeight/size};
 // Same native read-only pixel kernel, not browser/Atlas support for a larger source.
 globalThis.ImageData=class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}} as unknown as typeof ImageData;
 const rendering=[];for(const zoom of [1,16,256])for(const relief of [CLASSIC_RELIEF,{mode:"physical",exaggeration:20}] as TerrainRelief[]){
  const span=size/32/zoom,work=paintTerrainWindow((x,y)=>grid[y*size+x],Math.floor(size/2),Math.floor(size/2),shape,0,relief,{x:0,y:0,width:span,height:span,pixelsX:256,pixelsY:256});
  const t=timed(()=>{for(;;){const r=work.next();if(r.done)return r.value;}});rendering.push({zoom,mode:relief.mode,wallMs:t.wallMs,cpuMs:t.cpuMs,outputBytes:t.value.data.byteLength,hash:createHash("sha256").update(t.value.data).digest("hex"),kernelOnly:true});
 }
 const narrowWidth=kind==="world"?20000:40,physicalCenter=shape.displayWidth*.5003,transect=Array.from({length:size},(_,x)=>Math.round(1500*Math.exp(-(((x*sampleStep.eastM-physicalCenter)/narrowWidth)**2)))),representedCrest=Math.max(...transect);
 const numericalDetail={physicalFeatureWidthM:narrowWidth*2,representedCrestM:representedCrest,idealCrestM:1500,samplesAboveHalfHeight:transect.filter(z=>z>=750).length,minimumTwoSampleSeparationM:sampleStep.eastM*2,oneStampFootprintM:sampleStep,unsupportedPotentialOnly:size>1024};
 console.log("RESOLUTION",kind,size,"inheritance/worker");
 const parentShape={...shape,width:512,height:512,displayWidth:shape.displayWidth*2,displayHeight:shape.displayHeight*2},parent=analyticGrid(parentShape),frame={x:parentShape.displayWidth/4,y:parentShape.displayHeight/4,width:shape.displayWidth,height:shape.displayHeight};
 let nativeInitialization:Record<string,unknown>;try{const t=timed(()=>initializeRefinement(parent,parentShape,rootFrame(parentShape),frame,size,size,parentShape));nativeInitialization={supported:true,wallMs:t.wallMs,cpuMs:t.cpuMs,hash:digest(t.value)};assert.equal(size,1024);}catch(e){assert.notEqual(size,1024);nativeInitialization={supported:false,error:e instanceof Error?e.message:String(e)};}
 const sampling=timed(()=>{let sum=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++)sum+=Math.round(sampleTerrainGrid(parent,parentShape,frame.x+x/size*frame.width,frame.y+y/size*frame.height));return sum;});
 const worker=await nativeWorker(size,parent,parentShape,frame);assert.equal(worker.supported,size===1024);if(size===1024)assert.equal(worker.hash,nativeInitialization.hash);const workerCancellation=size===1024?await nativeWorker(size,parent,parentShape,frame,true):null;
 console.log("RESOLUTION",kind,size,"native object-codec pages (NOT an Atlas save)");
 const {stageTerrainTiles,readTerrainTile,terrainObjectPath}=await import("../src/features/worlds/terrain-storage");const references:{sha256:string;bytes:number;encoding:string}[]=[],metrics={writtenObjects:0,writtenBytes:0,reusedObjects:0,reusedBytes:0,duplicateReferences:0},stageStart=performance.now();let current=grid,currentShape=shape,lod=0,fullBaseJsonBytes=0,overviewMs=0;
 while(true){
  const count=current.length/1024,columns=currentShape.width/32;
  for(let offset=0;offset<count;offset+=1024){const tiles=Array.from({length:Math.min(1024,count-offset)},(_,i)=>{const tile=readTile(current,offset+i,currentShape);if(lod===0)fullBaseJsonBytes+=Buffer.byteLength(JSON.stringify(tile))+1;return tileSchema.parse({...tile,x:i%32,y:Math.floor(i/32)});});
   // Legal current tile coordinates in independent diagnostic pages. No larger
   // geometry/manifest is submitted to a service, database or consumption API.
   const refs=await stageTerrainTiles(randomUUID(),randomUUID(),randomUUID(),tiles,metrics);references.push(...refs);
   for(let i=0;i<refs.length;i++){const samples=await readTerrainTile(refs[i]),tile=readTile(current,offset+i,currentShape);assert.deepEqual(samples,tile.samples);}
  }
  if(currentShape.width===32)break;const begun=performance.now(),w=currentShape.width/2,nextGrid=new Int16Array(w*w);
  for(let y=0;y<w/32;y++)for(let x=0;x<w/32;x++){const children=new Map<string,number[]>();for(let j=0;j<2;j++)for(let i=0;i<2;i++){const tx=x*2+i,ty=y*2+j;children.set(`${tx}:${ty}`,readTile(current,ty*columns+tx,currentShape).samples);}const tile=overviewTile(x,y,children);for(let row=0;row<32;row++)nextGrid.set(tile.samples.slice(row*32,row*32+32),(y*32+row)*w+x*32);}
  overviewMs+=performance.now()-begun;current=nextGrid;currentShape={...currentShape,width:w,height:w};lod++;
 }
 const codecMs=performance.now()-stageStart,cas=process.env.SERRIAN_TERRAIN_ROOT!,archive=path.join(out,"diagnostic-codec-only.tar.gz"),restored=path.join(out,"restored-codec-only");await mkdir(restored);
 const archiveStart=performance.now();execFileSync("tar.exe",["-czf",archive,"-C",cas,"."],{windowsHide:true,stdio:"pipe"});const archiveMs=performance.now()-archiveStart,restoreStart=performance.now();execFileSync("tar.exe",["-xzf",archive,"-C",restored],{windowsHide:true,stdio:"pipe"});const restoreMs=performance.now()-restoreStart;
 process.env.SERRIAN_TERRAIN_ROOT=restored;for(const ref of new Map(references.map(r=>[r.sha256,r])).values())await readTerrainTile(ref);
 const first=references[0],file=terrainObjectPath(restored,first.sha256),bytes=await readFile(file);bytes[0]^=1;await writeFile(file,bytes);await assert.rejects(readTerrainTile(first));process.env.SERRIAN_TERRAIN_ROOT=cas;await readTerrainTile(first);assert.equal(digest(grid),sourceHash);
 const peakWorkingSetBytes=process.platform==="win32"?Number(execFileSync("powershell.exe",["-NoProfile","-Command",`(Get-Process -Id ${process.pid}).PeakWorkingSet64`],{encoding:"utf8",windowsHide:true}).trim()):null;
 const result={passed:true,kind,size,nativeMapSupported:currentRootAccepted,nativeRefinementSupported:currentRefinementAccepted,noAtlasRecordsCreated:true,diagnosticOnly:size>1024,sampleStep,numericalDetail,rendering,sourceHash,commonSamples:Array.from({length:32},(_,i)=>grid[(Math.floor(i*997/32)%1024)*(size/1024)*size+(Math.floor(i*541/32)%1024)*(size/1024)]),initialMemory,baseMemory,finalMemory:memory(),peakWorkingSetBytes,analyticGeneration:{wallMs:generated.wallMs,cpuMs:generated.cpuMs},nativeGenerator:generator,protection:{wallMs:maskResult.wallMs,bytes:blocked.byteLength},strokes,singleStampSamples:stamp.indices.length,nativeInitialization,readOnlySampling:{wallMs:sampling.wallMs,cpuMs:sampling.cpuMs,sum:sampling.value,notAnAcceptedInitialization:size>1024},worker,workerCancellation,baseBytes:grid.byteLength,allOverviewLogicalBytes:refinementLogicalBytes(size,size),overviewLevels:lod,totalTileReferences:references.length,codecDiagnostic:{wallMs:codecMs,overviewMs,...metrics,allObjectsReopened:true,archiveBytes:(await stat(archive)).size,archiveMs,restoreMs,restoredObjectsVerified:true,corruptionRejected:true,isNativeWorldBackup:false},futureFullBaseTileJsonBytes:fullBaseJsonBytes+256,currentRequestBodyLimit:8000000};
 const used=process.cpuUsage(caseCpu);await writeFile(path.join(out,"results.json"),JSON.stringify({...result,caseWallMs:performance.now()-caseStarted,caseProcessCpuMs:(used.user+used.system)/1000,archiveChildCpuIncluded:false},null,2));console.log(JSON.stringify({passed:true,kind,size,nativeSupported:currentRootAccepted,peakWorkingSetBytes}));
}
async function main(){
 if(process.env.SERRIAN_A2_RESOLUTION_CASE==="1"){await one();return;}
 const out=path.resolve(process.env.SERRIAN_A2_RESOLUTION_OUT??"artifacts/atlas-graphics-a2/resolution-1");assert(out.startsWith(path.resolve("artifacts/atlas-graphics-a2")+path.sep));await mkdir(out,{recursive:true});assert.equal(await access(path.join(out,"results.json")).then(()=>true,()=>false),false);
 const records:unknown[]=[];for(const kind of ["world","local"])for(const size of [1024,2048,4096]){
  const target=path.join(out,kind+"-"+size);await new Promise<void>((resolve,reject)=>{const p=spawn(process.execPath,["--expose-gc","--conditions=react-server","--import","tsx",path.resolve("scripts/worlds-graphics-a2-resolution.ts")],{env:{...process.env,SERRIAN_A2_RESOLUTION_CASE:"1",SERRIAN_A2_RESOLUTION_KIND:kind,SERRIAN_A2_RESOLUTION_SIZE:String(size),SERRIAN_A2_RESOLUTION_CASE_OUT:target},windowsHide:true,stdio:"inherit"});p.once("error",reject);p.once("exit",code=>code===0?resolve():reject(Error(`Resolution case ${kind}/${size} failed: ${code}`)));});records.push(JSON.parse(await readFile(path.join(target,"results.json"),"utf8")));await writeFile(path.join(out,"progress.json"),JSON.stringify({records},null,2));
 }
 const data=records as {kind:string;commonSamples:number[]}[];for(const kind of ["world","local"]){const group=data.filter(r=>r.kind===kind);assert.deepEqual(group[0].commonSamples,group[1].commonSamples);assert.deepEqual(group[0].commonSamples,group[2].commonSamples);}
 await writeFile(path.join(out,"results.json"),JSON.stringify({passed:true,nativeLimitsUnchanged:true,noMigration:true,noAtlasRecordsCreated:true,records},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

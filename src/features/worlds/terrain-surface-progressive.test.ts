import test from "node:test";
import assert from "node:assert/strict";
import {TerrainSurfacePainter} from "./terrain-surface-painter";
import type {SurfaceWorkerRequest} from "./terrain-surface-worker-protocol";
import {TerrainDetailCache} from "./terrain-refinement-cache";
import {frameGeometry,type RefinementMeta} from "./terrain-refinement";
import {TerrainEnvironmentPainter} from "./terrain-environment-painter";
import {EMPTY_ENVIRONMENT} from "./terrain-environment";

const world={width:64,height:64,tileSize:32,displayWidth:1000000,displayHeight:1000000,min:-12000,max:12000,wrap:false},view={left:250000,right:750000,top:250000,bottom:750000,width:800,height:800,scale:.0016};
async function canvasEnvironment(run:()=>Promise<void>){
 const names=["document","ImageData","window","Worker","OffscreenCanvas"] as const,old=names.map(name=>Object.getOwnPropertyDescriptor(globalThis,name));
 const install=(name:typeof names[number],value:unknown)=>Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 install("window",{location:{search:""}});install("Worker",undefined);install("OffscreenCanvas",undefined);install("ImageData",class{data:Uint8ClampedArray;width:number;height:number;constructor(a:number|Uint8ClampedArray,b:number,c?:number){this.width=typeof a==="number"?a:b;this.height=typeof a==="number"?b:c!;this.data=typeof a==="number"?new Uint8ClampedArray(a*b*4):a;}});
 install("document",{createElement:()=>{const canvas={width:0,height:0,getContext:()=>({putImageData:()=>{}})};return canvas;}});
 try{await run();}finally{for(let i=0;i<names.length;i++){if(old[i])Object.defineProperty(globalThis,names[i],old[i]!);else Reflect.deleteProperty(globalThis,names[i]);}}
}
test("resolution transitions retain only valid imagery and never cover completed current tiles",()=>canvasEnvironment(async()=>{
 const painter=new TerrainSurfacePainter(),root=new Int16Array(4096).fill(-100),before=root.slice(),drawImages=new Map<unknown,number>();let draws=0;
 const ctx={canvas:{width:800,height:800},getTransform:()=>({a:1}),save:()=>{},restore:()=>{},beginPath:()=>{},rect:()=>{},clip:()=>{},drawImage:(image:unknown)=>{draws++;drawImages.set(image,(drawImages.get(image)??0)+1);}} as unknown as CanvasRenderingContext2D;
 const finish=()=>{let batches=0;while(painter.pending){painter.paint(4);assert(++batches<5000);}};
 try{
  painter.sync(root,world,undefined,view,0,20);finish();painter.draw(ctx,{x:-400,y:-400,scale:view.scale});assert(draws>0);
  const closer={...view,left:300000,right:700000,top:300000,bottom:700000,scale:.002};painter.sync(root,world,undefined,closer,0,20);assert(painter.pending>0);draws=0;painter.draw(ctx,{x:-600,y:-600,scale:.002});assert(painter.metrics.progressiveImages>0);assert(draws>0,"A changed raster footprint retains completed accepted-source pictures");
  const painted=painter.metrics.painted;let batches=0;while(painter.metrics.painted===painted){painter.paint(1);assert(++batches<5000);}assert(painter.pending>0);drawImages.clear();painter.draw(ctx,{x:-600,y:-600,scale:.002});assert([...drawImages.values()].every(n=>n===1),"A completed current tile must not also be submitted to the clipped fallback pass");
  finish();painter.draw(ctx,{x:-600,y:-600,scale:.002});assert.equal(painter.metrics.progressiveImages,0,"Completed imagery is drawn without an older LOD on top");assert(painter.bytes<=64*1048576);
  painter.sync(root,world,undefined,closer,200,20);draws=0;painter.draw(ctx,{x:-600,y:-600,scale:.002});assert.equal(draws,0,"A different sea/style basis cannot borrow old pictures");
  finish();painter.sync(root.slice(),world,undefined,closer,200,20);draws=0;painter.draw(ctx,{x:-600,y:-600,scale:.002});assert.equal(draws,0,"A replaced source cannot expose pictures from the previous source");assert.deepEqual(root,before);
 }finally{painter.dispose();}
}));
test("late worker images and replaced working grids cannot overwrite newer source jobs",()=>canvasEnvironment(async()=>{
 const workers:ControlledWorker[]=[];
 class ControlledWorker{onmessage:((event:MessageEvent)=>void)|null=null;onerror:((event:ErrorEvent)=>void)|null=null;messages:SurfaceWorkerRequest[]=[];constructor(){workers.push(this);}postMessage(value:SurfaceWorkerRequest){this.messages.push(value);}terminate(){}}
 Object.defineProperty(globalThis,"Worker",{configurable:true,writable:true,value:ControlledWorker});Object.defineProperty(globalThis,"OffscreenCanvas",{configurable:true,writable:true,value:class{}});
 const cache=new TerrainDetailCache(async()=>{throw Error("Working grid does not fetch");}),meta:RefinementMeta={id:"fine",worldId:"world",terrainId:"terrain",mapId:"map",name:"fine",parentId:null,parentRevision:1,level:1,revision:2,frame:{x:100000,y:100000,width:800000,height:800000},gridWidth:64,gridHeight:64,overviewLevels:1,updatedAt:"fixed"},root=new Int16Array(4096).fill(-100),grid=new Int16Array(4096).fill(1000),replacement=new Int16Array(4096).fill(2000),scene={cache,tick:0,plans:[{meta,lod:0,keys:[0,1,2,3]}],active:{meta,shape:frameGeometry(meta,world),grid}},painter=new TerrainSurfacePainter();
 try{
  painter.sync(root,world,scene,view,0,20);painter.paint();const worker=workers[0],old=worker.messages.find(m=>m.type==="paint")!;assert.equal(old.type,"paint");
  painter.sync(root,world,{...scene,tick:1,active:{...scene.active,grid:replacement}},view,0,20);
  worker.onmessage?.({data:{type:"image",key:old.key,width:2,height:2,pixels:new ArrayBuffer(16),ms:1,profile:null}} as MessageEvent);
  assert.equal(painter.bytes,0);assert.equal(painter.metrics.painted,0,"The old exact job key was retired before its reply arrived");
  const sources=worker.messages.filter((m):m is Extract<SurfaceWorkerRequest,{type:"source"}>=>m.type==="source");assert.equal(sources.at(-1)!.source.active!.grid,replacement);const latest=worker.messages.at(-1)!;assert.equal(latest.type,"paint");if(latest.type==="paint")assert.notEqual(latest.key,old.key);
  assert(grid.every(z=>z===1000));assert(replacement.every(z=>z===2000));
 }finally{painter.dispose();cache.dispose();}
}));

test("unchanged environmental frames keep pending work without repeating numerical dependency scans",()=>canvasEnvironment(async()=>{
 const cache=new TerrainDetailCache(async()=>{throw Error("Read-only renderer must not fetch");}),peek=cache.peek.bind(cache);let reads=0;cache.peek=(...args)=>{reads++;return peek(...args);};
 const meta:RefinementMeta={id:"fine",worldId:"world",terrainId:"terrain",mapId:"map",name:"fine",parentId:null,parentRevision:1,level:1,revision:2,frame:{x:100000,y:100000,width:800000,height:800000},gridWidth:64,gridHeight:64,overviewLevels:1,updatedAt:"fixed"},root=new Int16Array(4096).fill(1000),scene={cache,tick:0,plans:[{meta,lod:0,keys:[0,1,2,3]}]},overlay={layer:{...EMPTY_ENVIRONMENT,regions:[{id:"a2000000-0000-4000-8000-000000000003",name:"Original synthetic forest",kind:"vegetation" as const,shape:"brush" as const,points:[{x:500000,y:500000}],radiusM:100000,strength:1,biome:"grassland" as const,vegetation:"conifer" as const,density:.8,scaleM:8,clustering:.65,protected:false}]}},painter=new TerrainEnvironmentPainter(()=>{});
 try{
  painter.sync(root,world,scene,view,0,"realistic-terrain",overlay);const initial=reads,pending=painter.pending;assert(initial>0&&pending>0);
  for(let i=0;i<100;i++)painter.sync(root,world,scene,{...view},0,"realistic-terrain",overlay);
  assert.equal(reads,initial,"Drawing another frame must not re-scan unchanged numerical source dependencies");assert.equal(painter.pending,pending);
  painter.sync(root,world,{...scene,tick:1},view,0,"realistic-terrain",overlay);assert(reads>initial,"A changed numerical snapshot must be observed");let previous=reads;
  painter.invalidate([{x:400000,y:400000,width:1000,height:1000}]);painter.sync(root,world,scene,view,0,"realistic-terrain",overlay);assert(reads>previous,"An in-place accepted edit must invalidate the plan");previous=reads;
  painter.sync(root,world,scene,{...view,left:view.left+100,right:view.right+100},0,"realistic-terrain",overlay);assert(reads>previous,"Navigation must update wanted footprints");previous=reads;
  painter.sync(root,world,scene,view,50,"realistic-terrain",overlay);assert(reads>previous,"Sea-level changes must not reuse prior presentation work");assert(root.every(z=>z===1000));
 }finally{painter.dispose();cache.dispose();}
}));

import {TerrainSurfaceProfile} from "./terrain-surface-profile";
import type {SurfaceWorkerRequest,SurfaceWorkerReply,SurfaceWorkerSource} from "./terrain-surface-worker-protocol";
import type {TerrainGeometry,TerrainView} from "./terrain";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import type {TerrainFrame,TerrainViewport} from "./terrain-refinement";
import {terrainSurfaceSampler,surfaceFieldWork} from "./terrain-surface-field";
import {surfacePixel,surfacePixelWork} from "./terrain-surface-art";
import {MEAN_SURFACE_TEXTURES} from "./terrain-surface-textures";
import {cachedSurfaceTextures,loadSurfaceTextures} from "./terrain-surface-texture-client";
import {EMPTY_TERRAIN_MATERIALS,type MaterialStroke} from "./terrain-materials";

type Image={canvas:HTMLCanvasElement;frame:TerrainFrame;baseKey:string};
type Job={key:string;baseKey:string;frame:TerrainFrame;row:number;col:number;pixels?:ImageData;resolution:number;height:number;step:number;originX:number;originY:number;pixelX:number;pixelY:number;strokes:MaterialStroke[]};
let activeSurfaceWorkers=0;
/** Artwork tiles are independent of numerical tiles. At each visual LOD one
 * raster pixel covers at most one device pixel. The one-pixel halo filters joins. */
export class TerrainSurfacePainter{
 private images=new Map<string,Image>();private fallback=new Map<string,string>();private jobs:Job[]=[];private wanted:{key:string;baseKey:string;frame:TerrainFrame}[]=[];
 private root?:Int16Array;private scene?:TerrainDetailScene;private stamp=0;private signature="";private sample?:ReturnType<typeof terrainSurfaceSampler>;private sampleStamp=-1;
 private fieldWork=surfaceFieldWork();private pixelWork=surfacePixelWork();private world?:TerrainGeometry;private sea=0;private relief=20;private layer=EMPTY_TERRAIN_MATERIALS;
 readonly profile=new TerrainSurfaceProfile(typeof window!=="undefined"&&new URLSearchParams(window.location.search).has("terrainProfile"));
 readonly metrics={painted:0,hits:0,maxBatchMs:0,maxTextures:0,visualMetres:0,workerTiles:0,workerMaxMs:0,workerSourceBytes:0};
 private worker?:Worker;private workerUnavailable=false;private workerBusy?:string;private workerDesired="";private workerSent="";private workerSource?:SurfaceWorkerSource;private workerAssetBytes=0;private workerProfile?:unknown;private watchdog?:ReturnType<typeof setTimeout>;
 private textures=cachedSurfaceTextures()??MEAN_SURFACE_TEXTURES;private disposed=false;private fineArtwork=false;
 assetState:"unloaded"|"loading"|"ready"|"error"=cachedSurfaceTextures()?"ready":"unloaded";
 constructor(private readonly onArtworkChange:()=>void=()=>{},readonly limit=1024){}
 get background(){return !!this.worker;}
 get needsFrame(){return this.jobs.length>0&&!this.workerBusy;}
 profileSnapshot(){return {...this.profile.snapshot(),worker:this.workerProfile};}
 private stopWorker(){if(this.worker){this.worker.onmessage=null;this.worker.onerror=null;this.worker.terminate();activeSurfaceWorkers--;}this.worker=undefined;this.workerBusy=undefined;this.workerSource=undefined;this.workerSent="";this.workerDesired="";this.workerAssetBytes=0;clearTimeout(this.watchdog);}
 private workerFailure(){this.stopWorker();this.workerUnavailable=true;this.assetState=cachedSurfaceTextures()?"ready":"unloaded";this.textures=cachedSurfaceTextures()??MEAN_SURFACE_TEXTURES;this.signature="";this.onArtworkChange();}
 private ensureWorker(){
  if(this.worker||this.workerUnavailable||this.disposed)return;
  if(typeof Worker==="undefined"||typeof OffscreenCanvas==="undefined"||activeSurfaceWorkers>=2||new URLSearchParams(window.location.search).get("terrainWorker")==="off"){this.workerUnavailable=true;return;}
  try{const worker=new Worker(new URL("./terrain-surface-worker.ts",import.meta.url),{type:"module"});this.worker=worker;activeSurfaceWorkers++;this.assetState="unloaded";
   worker.onerror=event=>{event.preventDefault();if(this.worker===worker)this.workerFailure();};
   worker.onmessage=(event:MessageEvent<SurfaceWorkerReply>)=>{if(this.worker!==worker||this.disposed)return;const reply=event.data;
    if(reply.type==="failed"){this.workerFailure();return;}
    if(reply.type==="assets"){this.assetState=reply.state;this.workerAssetBytes=reply.bytes;this.onArtworkChange();return;}
    if(reply.key!==this.workerBusy)return;clearTimeout(this.watchdog);this.workerBusy=undefined;this.workerProfile=reply.profile;this.metrics.workerMaxMs=Math.max(this.metrics.workerMaxMs,reply.ms);this.metrics.workerTiles++;
    const index=this.jobs.findIndex(job=>job.key===reply.key);if(index>=0){const job=this.jobs[index],started=performance.now(),canvas=document.createElement("canvas");canvas.width=reply.width;canvas.height=reply.height;canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(reply.pixels),reply.width,reply.height),0,0);this.images.set(job.key,{canvas,frame:job.frame,baseKey:job.baseKey});this.fallback.set(job.baseKey,job.key);this.jobs.splice(index,1);this.metrics.painted++;
     while(this.images.size>this.limit||this.bytes>64*1024*1024){const key=this.images.keys().next().value!,old=this.images.get(key)!;this.images.delete(key);if(this.profile.enabled)this.profile.evictions++;if(this.fallback.get(old.baseKey)===key)this.fallback.delete(old.baseKey);}this.metrics.maxTextures=Math.max(this.metrics.maxTextures,this.images.size);this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-started);if(this.profile.enabled){this.profile.allocations++;this.profile.record("upload",performance.now()-started);}
    }this.onArtworkChange();
   };
  }catch{this.workerFailure();}
 }
 private dispatchWorker(){
  if(!this.worker||this.workerBusy||!this.jobs.length||!this.workerSource)return;
  const job=this.jobs[0],send=(message:SurfaceWorkerRequest)=>this.worker!.postMessage(message);
  try{if(this.workerSent!==this.workerDesired){send({type:"source",source:this.workerSource,profile:this.profile.enabled});this.workerSent=this.workerDesired;}this.workerBusy=job.key;
   send({type:"paint",key:job.key,frame:job.frame,resolution:job.resolution,height:job.height,step:job.step,originX:job.originX,originY:job.originY,pixelX:job.pixelX,pixelY:job.pixelY,sea:this.sea,relief:this.relief,layer:{visible:this.layer.visible,opacity:this.layer.opacity,automatic:this.layer.automatic},strokes:job.strokes,fine:this.fineArtwork});this.watchdog=setTimeout(()=>{if(this.workerBusy===job.key)this.workerFailure();},45000);
  }catch{this.workerFailure();}
 }
 get waitingForAssets(){return this.fineArtwork&&this.assetState==="loading";}
 get artworkBytes(){return this.worker?this.workerAssetBytes:this.textures.bytes;}
 private requestArtwork(){if(this.assetState==="ready"||this.assetState==="loading"||this.disposed)return;this.assetState="loading";if(this.worker)return;void loadSurfaceTextures().then(textures=>{if(this.disposed)return;this.textures=textures;this.assetState="ready";this.invalidate();this.onArtworkChange();}).catch(()=>{if(this.disposed)return;this.assetState="error";this.onArtworkChange();});}
 retryArtwork(){this.assetState="unloaded";if(this.worker){this.worker.postMessage({type:"retry"} satisfies SurfaceWorkerRequest);this.invalidate();}this.requestArtwork();this.onArtworkChange();}
 invalidate(){this.stamp++;this.signature="";}
 get pending(){return this.jobs.length;}
 get bytes(){let n=0;for(const i of this.images.values())n+=i.canvas.width*i.canvas.height*4;return n;}
 sync(root:Int16Array,world:TerrainGeometry,scene:TerrainDetailScene|undefined,view:TerrainViewport,sea:number,relief:number,layer=EMPTY_TERRAIN_MATERIALS,dpr=1){
  this.ensureWorker();
  if(root!==this.root){this.root=root;this.invalidate();}
  const level=Math.max(0,Math.min(48,Math.floor(Math.log2(world.displayWidth*view.scale*dpr/128)))),size=world.displayWidth/2**level;
  const resolution=Math.max(32,Math.min(256,Math.ceil(size*view.scale*dpr))),left=Math.max(world.wrap?-(2**level):0,Math.floor(view.left/size)),right=Math.min(world.wrap?2*2**level-1:2**level-1,Math.floor(view.right/size)),top=Math.max(0,Math.floor(view.top/size)),bottom=Math.min(Math.ceil(world.displayHeight/size)-1,Math.floor(view.bottom/size));
  this.fineArtwork=size/resolution<32;if(this.fineArtwork&&this.assetState==="unloaded")this.requestArtwork();
  const pixelStep=size/resolution,signature=[left,right,top,bottom,Math.floor(view.left/pixelStep),Math.ceil(view.right/pixelStep),Math.floor(view.top/pixelStep),Math.ceil(view.bottom/pixelStep),level,resolution,sea,relief,this.stamp,layer===this.layer?"retained":"changed"].join("/");if(signature===this.signature&&scene===this.scene&&layer===this.layer)return;this.signature=signature;
  if(!this.sample||scene!==this.scene||world!==this.world||this.sampleStamp!==this.stamp){this.sample=terrainSurfaceSampler(root,world,scene);this.sampleStamp=this.stamp;}this.scene=scene;
  this.world=world;this.sea=sea;this.relief=relief;this.layer=layer;this.metrics.visualMetres=size/resolution;
  if(this.worker){const sourceKey=this.stamp+"/"+surfaceDependencies({x:view.left,y:view.top,width:view.right-view.left,height:view.bottom-view.top},world,scene);if(sourceKey!==this.workerDesired){const wanted=new Map((scene?.plans??[]).map(p=>[`${p.meta.id}/${p.meta.revision}/${p.lod}`,new Set(p.keys)])),tiles=[...(scene?.cache.values()??[])].filter(t=>t.surfaceId!==scene?.active?.meta.id&&t.surfaceId!==scene?.preview?.meta.id&&wanted.get(`${t.surfaceId}/${t.revision}/${t.lod}`)?.has(t.key)).map(t=>({id:t.surfaceId,revision:t.revision,lod:t.lod,key:t.key,samples:t.samples}));this.workerSource={root,world,plans:scene?.plans??[],tiles,active:scene?.active,preview:scene?.preview};this.workerDesired=sourceKey;this.metrics.workerSourceBytes=root.byteLength+(scene?.active?.grid.byteLength??0)+(scene?.preview?.grid.byteLength??0)+tiles.reduce((n,t)=>n+t.samples.byteLength,0);}}
  const old=new Map(this.jobs.map(j=>[j.key,j])),jobs:Job[]=[],wanted:{key:string;baseKey:string;frame:TerrainFrame}[]=[],seen=new Set<string>(),period=world.wrap?world.displayWidth:null;
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const xx=world.wrap?((x%2**level)+2**level)%2**level:x;if(!world.wrap&&(xx<0||xx>=2**level))continue;
   const original={x:xx*size,y:y*size,width:size,height:size},pixelX=Math.max(0,Math.floor((view.left-x*size)/pixelStep)),pixelY=Math.max(0,Math.floor((view.top-y*size)/pixelStep)),rightPixel=Math.min(resolution,Math.ceil((Math.min(view.right,world.wrap?Infinity:world.displayWidth)-x*size)/pixelStep)),bottomPixel=Math.min(resolution,Math.ceil((Math.min(view.bottom,world.displayHeight)-y*size)/pixelStep)),columns=rightPixel-pixelX,rows=bottomPixel-pixelY;if(columns<=0||rows<=0)continue;
   const frame={x:original.x+pixelX*pixelStep,y:original.y+pixelY*pixelStep,width:columns*pixelStep,height:rows*pixelStep},strokes=layer.strokes.filter(s=>intersects(s,original,period));
   const baseKey=[level,resolution,xx,y,pixelX,pixelY,columns,rows,this.stamp,surfaceDependencies(original,world,scene),sea,relief,layer.visible,layer.opacity,layer.automatic].join("/"),key=[baseKey,...strokes.map(s=>s.id+":"+fingerprint(JSON.stringify(s)))].join("/");
   wanted.push({key,baseKey,frame:{...frame,x:x*size+pixelX*pixelStep}});if(seen.has(key))continue;seen.add(key);
   if(this.images.has(key)){const image=this.images.get(key)!;this.images.delete(key);this.images.set(key,image);this.fallback.set(baseKey,key);this.metrics.hits++;continue;}
   jobs.push(old.get(key)??{key,baseKey,frame,row:0,col:0,resolution:columns,height:rows,step:pixelStep,originX:original.x,originY:original.y,pixelX,pixelY,strokes});
  }
  const focusX=(view.left+view.right)/2,focusY=(view.top+view.bottom)/2,distance=(j:Job)=>{let x=j.frame.x+j.frame.width/2-focusX;if(period)x-=Math.round(x/period)*period;return x*x+(j.frame.y+j.frame.height/2-focusY)**2;};jobs.sort((a,b)=>distance(a)-distance(b));
  // Only the viewport gets work; cancelled jobs and their pixel arrays are released.
  for(const job of jobs.slice(1))if(job.pixels){job.pixels=undefined;job.row=0;job.col=0;}this.wanted=wanted;this.jobs=jobs;
 }
 paint(budget=4){const start=performance.now();if(this.worker){this.dispatchWorker();this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);return;}if(!this.sample||!this.world)return;while(this.jobs.length){const j=this.jobs[0],edge=j.resolution+2,edgeY=j.height+2,pixels=j.pixels??(j.pixels=new ImageData(edge,edgeY)),step=j.step,period=this.world.wrap?this.world.displayWidth:null;
   while(j.row<edgeY){const row=j.row;while(j.col<edge){const col=j.col++;let x=j.originX+(col+j.pixelX-.5)*step;const y=j.originY+(row+j.pixelY-.5)*step;if(period)x=((x%period)+period)%period;const measured=this.profile.beginPixel(),started=measured?performance.now():0,fieldStart=started,field=this.sample(x,y,this.profile,this.fieldWork);if(measured)this.profile.record("field",performance.now()-fieldStart);const rgb=surfacePixel(field,x,y,step,this.sea,this.relief,this.layer,j.strokes,period,this.textures,this.profile,this.pixelWork),i=(row*edge+col)*4;pixels.data[i]=rgb[0];pixels.data[i+1]=rgb[1];pixels.data[i+2]=rgb[2];pixels.data[i+3]=255;if(measured)this.profile.record("pixels",performance.now()-started);if(j.col%8===0&&performance.now()-start>=budget){this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);return;}}j.row++;j.col=0;if(performance.now()-start>=budget){this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);return;}}
   const uploadStart=this.profile.enabled?performance.now():0,canvas=document.createElement("canvas");canvas.width=edge;canvas.height=edgeY;canvas.getContext("2d")!.putImageData(pixels,0,0);this.images.set(j.key,{canvas,frame:j.frame,baseKey:j.baseKey});this.fallback.set(j.baseKey,j.key);this.jobs.shift();this.metrics.painted++;if(this.profile.enabled){this.profile.allocations++;this.profile.record("upload",performance.now()-uploadStart);}const evictionStart=this.profile.enabled?performance.now():0;
   while(this.images.size>this.limit||this.bytes>64*1024*1024){const key=this.images.keys().next().value!,old=this.images.get(key)!;this.images.delete(key);if(this.profile.enabled)this.profile.evictions++;if(this.fallback.get(old.baseKey)===key)this.fallback.delete(old.baseKey);}if(this.profile.enabled)this.profile.record("cache",performance.now()-evictionStart);this.metrics.maxTextures=Math.max(this.metrics.maxTextures,this.images.size);if(performance.now()-start>=budget)break;
  }this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);}
 draw(ctx:CanvasRenderingContext2D,view:TerrainView){const world=this.world;if(!world)return;const started=this.profile.enabled?performance.now():0;ctx.save();ctx.beginPath();ctx.rect(world.wrap?0:view.x,view.y,world.wrap?ctx.canvas.width:view.scale*world.displayWidth,view.scale*world.displayHeight);ctx.clip();ctx.imageSmoothingEnabled=true;
  for(const {key,baseKey,frame} of this.wanted){const image=this.images.get(key)??this.images.get(this.fallback.get(baseKey)??"");if(image)ctx.drawImage(image.canvas,1,1,image.canvas.width-2,image.canvas.height-2,view.x+frame.x*view.scale,view.y+frame.y*view.scale,frame.width*view.scale+.02,frame.height*view.scale+.02);}ctx.restore();if(this.profile.enabled)this.profile.record("composition",performance.now()-started);
 }
 clear(){this.stopWorker();this.workerUnavailable=false;this.images.clear();this.fallback.clear();this.jobs=[];this.wanted=[];this.signature="";this.sample=undefined;}
 dispose(){this.disposed=true;this.clear();}
}
function intersects(s:MaterialStroke,f:TerrainFrame,period:number|null){for(let i=0;i<s.points.length;i++){const a=s.points[i],b=s.points[Math.min(i+1,s.points.length-1)];let dx=b.x-a.x;if(period)dx-=Math.round(dx/period)*period;for(const offset of period?[-period,0,period]:[0]){const x=a.x+offset;if(Math.min(x,x+dx)-s.radiusM<=f.x+f.width&&Math.max(x,x+dx)+s.radiusM>=f.x&&Math.min(a.y,b.y)-s.radiusM<=f.y+f.height&&Math.max(a.y,b.y)+s.radiusM>=f.y)return true;}}return false;}
function fingerprint(text:string){let a=2166136261,b=3339675911;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),2246822519);}return (a>>>0).toString(16)+(b>>>0).toString(16)+":"+text.length;}
/** Dependency signatures describe this artwork tile's numerical neighborhood,
 * not viewport request identities. Returning to unchanged coverage reuses art. */
function surfaceDependencies(f:TerrainFrame,world:TerrainGeometry,scene?:TerrainDetailScene){const parts:string[]=[];for(const plan of scene?.plans??[]){const active=[scene?.preview,scene?.active].find(a=>a?.meta.id===plan.meta.id),shape=active?.shape??{width:plan.meta.gridWidth/2**plan.lod,height:plan.meta.gridHeight/2**plan.lod},cols=shape.width/32,rows=shape.height/32,frame=plan.meta.frame;
 for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){const x=f.x+offset-frame.x,y=f.y-frame.y;if(x>=frame.width||x+f.width<=0||y>=frame.height||y+f.height<=0)continue;parts.push(plan.meta.id,active?"working":plan.meta.revision+"/"+plan.lod);if(active)continue;const left=Math.max(0,Math.floor(Math.max(0,x)/frame.width*cols)-1),right=Math.min(cols-1,Math.floor(Math.min(frame.width,x+f.width)/frame.width*cols)+1),top=Math.max(0,Math.floor(Math.max(0,y)/frame.height*rows)-1),bottom=Math.min(rows-1,Math.floor(Math.min(frame.height,y+f.height)/frame.height*rows)+1);for(let j=top;j<=bottom;j++)for(let i=left;i<=right;i++)parts.push(scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,j*cols+i)?.sha256??"missing");}
 }return fingerprint(parts.join("/"));}

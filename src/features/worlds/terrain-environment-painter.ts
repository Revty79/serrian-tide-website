import type {TerrainGeometry,TerrainView} from "./terrain";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import type {TerrainViewport,TerrainFrame} from "./terrain-refinement";
import type {EnvironmentLayer} from "./terrain-environment";
import {environmentTilePlan,ENVIRONMENT_TILE_PIXELS} from "./terrain-environment-plan";
import {ENVIRONMENT_LIMITS} from "./terrain-environment";
import {EMPTY_HYDROLOGY,type HydroLayer} from "./terrain-hydrology";
import {EMPTY_TERRAIN_MATERIALS,type TerrainMaterials} from "./terrain-materials";
import {surfaceDependencies} from "./terrain-surface-painter";
import {environmentRasterSource,environmentRasterPixel} from "./terrain-environment-raster";
import type {EnvironmentArtSource,EnvironmentArtJob,EnvironmentWorkerReply} from "./terrain-environment-worker-protocol";
export type EnvironmentOverlay={layer:EnvironmentLayer;drawing?:{x:number;y:number}[];selected?:import("./terrain-environment").EnvironmentRegion};
type Job=EnvironmentArtJob&{frame:TerrainFrame;row:number;col:number;pixels?:ImageData};
type Image={canvas:HTMLCanvasElement;frame:TerrainFrame};
/** Supplementary artwork; the original terrain/cartographic painters remain
 * unchanged. Stable physical tiles are retained through ordinary navigation. */
export class TerrainEnvironmentPainter{
  private images=new Map<string,Image>();private jobs:Job[]=[];private wanted:{key:string;frame:TerrainFrame}[]=[];private worker?:Worker;private unavailable=false;private busy="";private sent="";private desired="";private watchdog?:ReturnType<typeof setTimeout>;private source?:EnvironmentArtSource;private raster?:ReturnType<typeof environmentRasterSource>;
  private root?:Int16Array;private layer?:EnvironmentLayer;private water?:HydroLayer;private materials?:TerrainMaterials;private style="";private stamp=0;private world?:TerrainGeometry;
  readonly metrics={plannedEntries:0,painted:0,hits:0,sourceBytes:0,maxBatchMs:0,workerMaxMs:0,visualMetres:0,evictions:0};
  constructor(private readonly changed:()=>void){}
  get bytes(){let bytes=0;for(const image of this.images.values())bytes+=image.canvas.width*image.canvas.height*4;return bytes;}
  get pending(){return this.jobs.length;}
  get background(){return !!this.worker;}
  get needsFrame(){return !!this.jobs.length&&!this.busy;}
  invalidate(){this.stamp++;this.desired="";this.raster=undefined;}
  private stop(){this.worker?.terminate();this.worker=undefined;this.busy="";this.sent="";clearTimeout(this.watchdog);}
  private failure(){this.stop();this.unavailable=true;this.raster=this.source?environmentRasterSource(this.source):undefined;for(const job of this.jobs){job.row=job.col=0;job.pixels=undefined;}this.changed();}
  private ensureWorker(){if(this.worker||this.unavailable)return;if(typeof Worker==="undefined"||new URLSearchParams(window.location.search).get("terrainWorker")==="off"){this.unavailable=true;return;}try{const worker=new Worker(new URL("./terrain-environment-worker.ts",import.meta.url),{type:"module"});this.worker=worker;worker.onerror=event=>{event.preventDefault();if(this.worker===worker)this.failure();};worker.onmessage=(event:MessageEvent<EnvironmentWorkerReply>)=>{if(this.worker!==worker)return;const reply=event.data;if(reply.type==="failed"){this.failure();return;}if(reply.type!=="image"||reply.key!==this.busy)return;this.busy="";clearTimeout(this.watchdog);this.metrics.workerMaxMs=Math.max(this.metrics.workerMaxMs,reply.ms);const index=this.jobs.findIndex(j=>j.key===reply.key);if(index>=0){const job=this.jobs[index];this.upload(job,new ImageData(new Uint8ClampedArray(reply.pixels),reply.width,reply.height));this.jobs.splice(index,1);}this.changed();};}catch{this.unavailable=true;}}
  private upload(job:Job,pixels:ImageData){const canvas=document.createElement("canvas");canvas.width=pixels.width;canvas.height=pixels.height;canvas.getContext("2d")!.putImageData(pixels,0,0);this.images.set(job.key,{canvas,frame:job.frame});this.metrics.painted++;while(this.bytes>ENVIRONMENT_LIMITS.artBytes){this.images.delete(this.images.keys().next().value!);this.metrics.evictions++;}}
  sync(root:Int16Array,world:TerrainGeometry,scene:TerrainDetailScene|undefined,view:TerrainViewport,sea:number,style:string,overlay?:EnvironmentOverlay,water:HydroLayer=EMPTY_HYDROLOGY,materials:TerrainMaterials=EMPTY_TERRAIN_MATERIALS,dpr=1){
    const layer=overlay?.layer;if(!layer?.visible||!layer.opacity||!layer.fields.length&&!layer.regions.length){this.metrics.plannedEntries=0;if(this.wanted.length||this.worker)this.clear();return;}
    if(root!==this.root||layer!==this.layer||water!==this.water||materials!==this.materials||style!==this.style){this.invalidate();this.root=root;this.layer=layer;this.water=water;this.materials=materials;this.style=style;}
    this.world=world;const plan=environmentTilePlan(world,view,dpr);if(!plan){this.metrics.plannedEntries=0;this.clear();return;}this.metrics.plannedEntries=(plan.right-plan.left+1)*(plan.bottom-plan.top+1);this.ensureWorker();const {level,size,step,left,right,top,bottom}=plan,sourceKey=this.stamp+"/"+sea+"/"+surfaceDependencies({x:view.left,y:view.top,width:view.right-view.left,height:view.bottom-view.top},world,scene);
    this.metrics.visualMetres=step;
    if(sourceKey!==this.desired){const wanted=new Map((scene?.plans??[]).map(p=>[`${p.meta.id}/${p.meta.revision}/${p.lod}`,new Set(p.keys)])),tiles=[...(scene?.cache.values()??[])].filter(t=>t.surfaceId!==scene?.active?.meta.id&&t.surfaceId!==scene?.preview?.meta.id&&wanted.get(`${t.surfaceId}/${t.revision}/${t.lod}`)?.has(t.key)).map(t=>({id:t.surfaceId,revision:t.revision,lod:t.lod,key:t.key,samples:t.samples}));this.source={terrain:{root,world,plans:scene?.plans??[],tiles,active:scene?.active,preview:scene?.preview},layer,water,materials,style,sea};this.desired=sourceKey;this.raster=this.worker?undefined:environmentRasterSource(this.source);this.metrics.sourceBytes=root.byteLength+(scene?.active?.grid.byteLength??0)+(scene?.preview?.grid.byteLength??0)+tiles.reduce((n,t)=>n+t.samples.byteLength,0)+layer.fields.reduce((n,f)=>n+f.data.length*.75+f.width*f.height*32,0);}
    const old=new Map(this.jobs.map(j=>[j.key,j])),jobs:Job[]=[],wanted:{key:string;frame:TerrainFrame}[]=[],seen=new Set<string>();
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const xx=world.wrap?((x%2**level)+2**level)%2**level:x;if(xx<0||xx>=2**level)continue;const frame={x:xx*size,y:y*size,width:size,height:size},key=[this.stamp,sea,level,xx,y,surfaceDependencies(frame,world,scene)].join("/");wanted.push({key,frame:{...frame,x:x*size}});if(seen.has(key))continue;seen.add(key);const image=this.images.get(key);if(image){this.images.delete(key);this.images.set(key,image);this.metrics.hits++;continue;}jobs.push(old.get(key)??{key,x:frame.x,y:frame.y,step,size:ENVIRONMENT_TILE_PIXELS,frame,row:0,col:0});}
    const cx=(view.left+view.right)/2,cy=(view.top+view.bottom)/2,distance=(j:Job)=>{let x=j.frame.x+j.frame.width/2-cx;if(world.wrap)x-=Math.round(x/world.displayWidth)*world.displayWidth;return x*x+(j.frame.y+j.frame.height/2-cy)**2;};jobs.sort((a,b)=>distance(a)-distance(b));for(const job of jobs.slice(1))if(job.pixels){job.pixels=undefined;job.row=job.col=0;}this.jobs=jobs;this.wanted=wanted;
  }
  paint(budget=4){const started=performance.now();if(!this.source||!this.world||!this.jobs.length)return;if(this.worker){if(!this.busy){if(this.sent!==this.desired){this.worker.postMessage({type:"source",source:this.source});this.sent=this.desired;}const job=this.jobs[0];this.busy=job.key;this.worker.postMessage({type:"paint",job:{key:job.key,x:job.x,y:job.y,step:job.step,size:job.size}});this.watchdog=setTimeout(()=>{if(this.busy===job.key)this.failure();},45000);}return;}
    this.raster??=environmentRasterSource(this.source);while(this.jobs.length){const job=this.jobs[0],edge=job.size+2,pixels=job.pixels??(job.pixels=new ImageData(edge,edge));while(job.row<edge){while(job.col<edge){const col=job.col++,rgba=environmentRasterPixel(this.raster,job,col,job.row,this.world.displayWidth,this.world.wrap),offset=(job.row*edge+col)*4;for(let c=0;c<4;c++)pixels.data[offset+c]=rgba[c];if(job.col%8===0&&performance.now()-started>=budget){this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-started);return;}}job.row++;job.col=0;}this.upload(job,pixels);this.jobs.shift();if(performance.now()-started>=budget)break;}this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-started);
  }
  draw(ctx:CanvasRenderingContext2D,view:TerrainView){if(!this.world)return;ctx.save();ctx.beginPath();ctx.rect(this.world.wrap?0:view.x,view.y,this.world.wrap?ctx.canvas.width:this.world.displayWidth*view.scale,this.world.displayHeight*view.scale);ctx.clip();ctx.imageSmoothingEnabled=true;for(const {key,frame} of this.wanted){const image=this.images.get(key);if(image)ctx.drawImage(image.canvas,1,1,ENVIRONMENT_TILE_PIXELS,ENVIRONMENT_TILE_PIXELS,view.x+frame.x*view.scale,view.y+frame.y*view.scale,frame.width*view.scale+.02,frame.height*view.scale+.02);}ctx.restore();}
  clear(){this.stop();this.images.clear();this.jobs=[];this.wanted=[];this.desired="";this.raster=undefined;}
  dispose(){this.clear();this.source=undefined;}
}

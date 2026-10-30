import {terrainRasterFrame} from "./terrain-raster-frame";
import {cartographicWindows,type CartographicWindow} from "./terrain-cartography-window";
import type {TerrainGeometry,TerrainView} from "./terrain";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import {frameGeometry,lodGeometry,tileKeysForView,type TerrainFrame,type TerrainViewport} from "./terrain-refinement";
import {drawCartographicTile,cartographicWorkBytes,type HeightSampler,type CartographicColorWork} from "./terrain-cartography";
import {viewContourInterval,type MapAppearance} from "./terrain-appearance";

type Image={canvas:HTMLCanvasElement;frame:TerrainFrame;shape:TerrainGeometry;key:number;level:number;window?:CartographicWindow;authority?:string;appearance?:string};
type Job={id:string;image:Omit<Image,"canvas">;sample:HeightSampler;row:number;halo?:Float64Array;baseId?:string;colors?:CartographicColorWork};
export function rootCartographyLodLimit(shape:TerrainGeometry){let width=shape.width,height=shape.height,lod=0;while(width%64===0&&height%64===0){width/=2;height/=2;lod++;}return lod;}
export function overviewSampler(grid:Int16Array,source:TerrainGeometry,lod:number):HeightSampler{
 const factor=2**lod,width=source.width/factor,height=source.height/factor,memo=new Map<number,number>();
 const average=(x:number,y:number,n:number):number=>!n?grid[y*source.width+x]:Math.round((average(x,y,n-1)+average(x+2**(n-1),y,n-1)+average(x,y+2**(n-1),n-1)+average(x+2**(n-1),y+2**(n-1),n-1))/4);
 return (x,y)=>{x=source.wrap?((x%width)+width)%width:Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));const key=y*width+x;let value=memo.get(key);if(value===undefined){value=average(x*factor,y*factor,lod);memo.set(key,value);}return value;};
}
/** A bounded, CPU-only visible-tile presentation cache. Never owns numerical terrain. */
export class TerrainCartographyPainter{
 private colors=new Map<string,CartographicColorWork>();private cache=new Map<string,Image>();private jobs:Job[]=[];private wanted:string[]=[];private wantedAuthorities=new Set<string>();
 private versions=new Map<string,number>();private last="";private scene?:TerrainDetailScene;private root?:Int16Array;
 private activeGrids=new Map<string,Int16Array>();
 private periodX:number|null=null;private usedBytes=0;private baseSpacing=0;private spec?:MapAppearance;private interval=500;private scale=1;private sea=0;
 readonly metrics={painted:0,hits:0,maxTextures:0,maxBatchMs:0,maxQueued:0};
 constructor(readonly limit=2304){}
 get pending(){return this.jobs.length;}
 invalidate(id:string,keys:Iterable<number>|undefined,shape:TerrainGeometry){
  if(!keys){for(const [key,value]of this.colors)if(key.includes(`|${id}/`)){value.value=undefined;this.colors.delete(key);}for(const key of this.cache.keys())if(key.includes(`|${id}/`)){const image=this.cache.get(key)!;this.usedBytes-=image.canvas.width*image.canvas.height*4;this.cache.delete(key);}}
  else for(const fine of keys)for(let lod=0;lod<=rootCartographyLodLimit(shape);lod++){
   const cols=shape.width/32/2**lod,rows=shape.height/32/2**lod,x=Math.floor(fine%(shape.width/32)/2**lod),y=Math.floor(Math.floor(fine/(shape.width/32))/2**lod);
   for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const xx=shape.wrap?((x+i)%cols+cols)%cols:x+i;if(xx<0||xx>=cols||y+j<0||y+j>=rows)continue;const key=`${id}/${lod}/${(y+j)*cols+xx}`;this.versions.set(key,(this.versions.get(key)??0)+1);}
  }this.last="";
 }
 sync(root:Int16Array,world:TerrainGeometry,scene:TerrainDetailScene|undefined,view:TerrainViewport,sea:number,spec:MapAppearance,dpr=1){
  if(this.root!==root){this.invalidate("root",undefined,world);this.root=root;}
  const activeGrids=new Map<string,Int16Array>();for(const active of [scene?.active,scene?.preview])if(active){if(this.activeGrids.get(active.meta.id)!==active.grid)this.invalidate(active.meta.id,undefined,active.shape);activeGrids.set(active.meta.id,active.grid);}this.activeGrids=activeGrids;
  const rasterScale=2**(Math.ceil(Math.log2(view.scale*dpr)*4)/4);const interval=viewContourInterval(spec,view.width/view.scale),scale=2**Math.floor(Math.log2(view.scale)),style=JSON.stringify(spec)+"/"+interval+"/"+scale+"/"+sea+"/"+rasterScale;
  const signature=[style,view.left,view.top,view.right,view.bottom].join("/");if(signature===this.last&&scene===this.scene)return;
  this.periodX=world.wrap?world.displayWidth:null;this.last=signature;this.scene=scene;this.spec=spec;this.interval=interval;this.scale=scale;this.sea=sea;
  const previous=new Map(this.jobs.map(j=>[j.id,j])),jobs:Job[]=[],wanted:string[]=[];this.wantedAuthorities.clear();
  const add=(id:string,image:Omit<Image,"canvas">,sample:()=>HeightSampler)=>{
   const cols=image.shape.width/32,tw=image.frame.width/cols,th=image.frame.height/(image.shape.height/32),x=image.frame.x+image.key%cols*tw,y=image.frame.y+Math.floor(image.key/cols)*th;
   if(y>=view.bottom||y+th<=view.top||!(world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]).some(offset=>x+offset<view.right&&x+offset+tw>view.left))return;
   const authority=id.slice(id.indexOf("|")+1);this.wantedAuthorities.add(authority);const windows=cartographicWindows(image.frame,image.shape,image.key,{...view,scale:rasterScale},world),parts=windows.length?windows:[undefined];let sampler:HeightSampler|undefined;const colors=this.colors.get(id)??{};this.colors.delete(id);this.colors.set(id,colors);
   for(const window of parts){const cacheId=window?`${id}/window/${window.x}/${window.y}/${window.width}/${window.height}`:id;wanted.push(cacheId);const cached=this.cache.get(cacheId);if(cached){this.cache.delete(cacheId);this.cache.set(cacheId,cached);this.metrics.hits++;continue;}sampler??=sample();jobs.push(previous.get(cacheId)??{id:cacheId,image:{...image,window,authority,appearance:JSON.stringify(spec)},sample:sampler,row:0,baseId:id,colors});}
  };
  const frame={x:0,y:0,width:world.displayWidth,height:world.displayHeight},maxLod=rootCartographyLodLimit(world);let lod=Math.max(0,Math.min(maxLod,Math.floor(Math.log2(1.5/(Math.max(world.displayWidth/world.width,world.displayHeight/world.height)*view.scale))))),shape=lodGeometry(world,lod),keys=[...tileKeysForView(frame,shape,view,world)];
  while(keys.length>256&&lod<maxLod){lod++;shape=lodGeometry(world,lod);keys=[...tileKeysForView(frame,shape,view,world)];}
  this.baseSpacing=Math.max(shape.displayWidth/shape.width,shape.displayHeight/shape.height);
  for(const key of keys){const id=`${style}|root/${lod}/${key}/${this.versions.get(`root/${lod}/${key}`)??0}`;add(id,{frame,shape,key,level:-1},()=>overviewSampler(root,world,lod));}
  for(const plan of scene?.plans??[]){
   const shape=lodGeometry(frameGeometry(plan.meta,world),plan.lod),cols=shape.width/32,active=[scene?.preview,scene?.active].find(a=>a?.meta.id===plan.meta.id);
   for(const key of plan.keys){
    const center=scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,key);if(!active&&!center)continue;
    const x=key%cols,y=Math.floor(key/cols),halo:string[]=[];for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)halo.push(scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,(y+j)*cols+x+i)?.sha256??"missing");
    const version=active?`active/${this.versions.get(`${plan.meta.id}/${plan.lod}/${key}`)??0}`:halo.join(":"),id=`${style}|${plan.meta.id}/${active?"working":"snapshot"}/${plan.lod}/${key}/${version}`;
    add(id,{frame:plan.meta.frame,shape,key,level:plan.meta.level},()=>active?overviewSampler(active.grid,active.shape,plan.lod):(px,py)=>{px=Math.max(0,Math.min(shape.width-1,px));py=Math.max(0,Math.min(shape.height-1,py));return scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,Math.floor(py/32)*cols+Math.floor(px/32))?.samples[py%32*32+px%32]??center!.samples[Math.max(0,Math.min(31,py-y*32))*32+Math.max(0,Math.min(31,px-x*32))];});
   }
  }
  for(const job of jobs.slice(1))if(job.halo){job.halo=undefined;job.row=0;}
  this.wanted=wanted;this.jobs=jobs;this.metrics.maxQueued=Math.max(this.metrics.maxQueued,jobs.length);
 }
 paint(budget=4){
  if(!this.spec)return;const start=performance.now();
  while(this.jobs.length){const j=this.jobs[0],{shape,key}=j.image,x0=key%(shape.width/32)*32,y0=Math.floor(key/(shape.width/32))*32,halo=j.halo??(j.halo=new Float64Array(64*64));
   while(j.row<64){const y=j.row++;for(let x=0;x<64;x++)halo[y*64+x]=j.sample(x0+x-16,y0+y-16);if(performance.now()-start>=budget){this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);return;}}
   const canvas=document.createElement("canvas"),sample:HeightSampler=(x,y)=>halo[(Math.max(-16,Math.min(47,y-y0))+16)*64+Math.max(-16,Math.min(47,x-x0))+16];
   drawCartographicTile(canvas,sample,x0,y0,shape,this.sea,this.spec,this.interval,j.image.frame,this.scale,Math.max(64,Math.min(256,2**Math.ceil(Math.log2(32*Math.max(shape.displayWidth/shape.width,shape.displayHeight/shape.height)*this.scale)))),this.periodX,j.image.window,j.colors);if(j.baseId&&j.colors){this.colors.delete(j.baseId);this.colors.set(j.baseId,j.colors);}while(this.colors.size>32||[...this.colors.values()].reduce((n,v)=>n+cartographicWorkBytes(v),0)>16*1048576){const first=this.colors.keys().next().value!;this.colors.get(first)!.value=undefined;this.colors.delete(first);}this.jobs.shift();this.cache.set(j.id,{canvas,...j.image});this.usedBytes+=canvas.width*canvas.height*4;this.metrics.painted++;
   while(this.cache.size>this.limit||this.bytes>64*1024*1024){const key=this.cache.keys().next().value!,image=this.cache.get(key)!;this.usedBytes-=image.canvas.width*image.canvas.height*4;this.cache.delete(key);}this.metrics.maxTextures=Math.max(this.metrics.maxTextures,this.cache.size);
   if(performance.now()-start>=budget)break;
  }this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);
 }
 draw(ctx:CanvasRenderingContext2D,view:TerrainView,world:TerrainGeometry){
  const ready=this.wanted.map(k=>this.cache.get(k)).filter((v):v is Image=>!!v),current=new Set(ready),appearance=JSON.stringify(this.spec),retained=this.pending?[...this.cache.values()].filter(image=>!current.has(image)&&image.authority&&this.wantedAuthorities.has(image.authority)&&image.appearance===appearance):[],images=[...retained,...ready].sort((a,b)=>a.level-b.level||Number(current.has(a))-Number(current.has(b)));ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";const dpr=Math.abs(ctx.getTransform().a)||1;
  for(const {canvas,frame,shape,key,window} of images){const cols=shape.width/32,w=frame.width/cols,h=frame.height/(shape.height/32),wx=(window?.x??0)/32*w,wy=(window?.y??0)/32*h,ww=(window?.width??32)/32*w,hh=(window?.height??32)/32*h;for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){const q=terrainRasterFrame(view,{x:frame.x+offset+key%cols*w+wx,y:frame.y+Math.floor(key/cols)*h+wy,width:ww,height:hh},dpr);ctx.drawImage(canvas,q.x,q.y,q.width,q.height);}}
 }
 clear(){for(const value of this.colors.values())value.value=undefined;this.colors.clear();this.usedBytes=0;this.cache.clear();this.activeGrids.clear();this.jobs=[];this.wanted=[];this.wantedAuthorities.clear();this.versions.clear();this.last="";}
 get bytes(){let colorBytes=0;for(const work of this.colors.values())colorBytes+=cartographicWorkBytes(work);return this.usedBytes+colorBytes;}
 get rootSpacing(){return this.baseSpacing;}
 get contourInterval(){return this.interval;}
}

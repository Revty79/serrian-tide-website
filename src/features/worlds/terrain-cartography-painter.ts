import type {TerrainGeometry,TerrainView} from "./terrain";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import {frameGeometry,lodGeometry,tileKeysForView,type TerrainFrame,type TerrainViewport} from "./terrain-refinement";
import {drawCartographicTile,type HeightSampler} from "./terrain-cartography";
import {viewContourInterval,type MapAppearance} from "./terrain-appearance";

type Image={canvas:HTMLCanvasElement;frame:TerrainFrame;shape:TerrainGeometry;key:number;level:number};
type Job={id:string;image:Omit<Image,"canvas">;sample:HeightSampler;row:number;halo?:Float64Array};
export function rootCartographyLodLimit(shape:TerrainGeometry){let width=shape.width,height=shape.height,lod=0;while(width%64===0&&height%64===0){width/=2;height/=2;lod++;}return lod;}
export function overviewSampler(grid:Int16Array,source:TerrainGeometry,lod:number):HeightSampler{
 const factor=2**lod,width=source.width/factor,height=source.height/factor,memo=new Map<number,number>();
 const average=(x:number,y:number,n:number):number=>!n?grid[y*source.width+x]:Math.round((average(x,y,n-1)+average(x+2**(n-1),y,n-1)+average(x,y+2**(n-1),n-1)+average(x+2**(n-1),y+2**(n-1),n-1))/4);
 return (x,y)=>{x=source.wrap?((x%width)+width)%width:Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));const key=y*width+x;let value=memo.get(key);if(value===undefined){value=average(x*factor,y*factor,lod);memo.set(key,value);}return value;};
}
/** A bounded, CPU-only visible-tile presentation cache. Never owns numerical terrain. */
export class TerrainCartographyPainter{
 private cache=new Map<string,Image>();private jobs:Job[]=[];private wanted:string[]=[];
 private versions=new Map<string,number>();private last="";private scene?:TerrainDetailScene;private root?:Int16Array;
 private activeGrids=new Map<string,Int16Array>();
 private periodX:number|null=null;private usedBytes=0;private baseSpacing=0;private spec?:MapAppearance;private interval=500;private scale=1;private sea=0;
 readonly metrics={painted:0,hits:0,maxTextures:0,maxBatchMs:0,maxQueued:0};
 constructor(readonly limit=2304){}
 get pending(){return this.jobs.length;}
 invalidate(id:string,keys:Iterable<number>|undefined,shape:TerrainGeometry){
  if(!keys){for(const key of this.cache.keys())if(key.includes(`|${id}/`)){const image=this.cache.get(key)!;this.usedBytes-=image.canvas.width*image.canvas.height*4;this.cache.delete(key);}}
  else for(const fine of keys)for(let lod=0;lod<=rootCartographyLodLimit(shape);lod++){
   const cols=shape.width/32/2**lod,rows=shape.height/32/2**lod,x=Math.floor(fine%(shape.width/32)/2**lod),y=Math.floor(Math.floor(fine/(shape.width/32))/2**lod);
   for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const xx=shape.wrap?((x+i)%cols+cols)%cols:x+i;if(xx<0||xx>=cols||y+j<0||y+j>=rows)continue;const key=`${id}/${lod}/${(y+j)*cols+xx}`;this.versions.set(key,(this.versions.get(key)??0)+1);}
  }this.last="";
 }
 sync(root:Int16Array,world:TerrainGeometry,scene:TerrainDetailScene|undefined,view:TerrainViewport,sea:number,spec:MapAppearance){
  if(this.root!==root){this.invalidate("root",undefined,world);this.root=root;}
  const activeGrids=new Map<string,Int16Array>();for(const active of [scene?.active,scene?.preview])if(active){if(this.activeGrids.get(active.meta.id)!==active.grid)this.invalidate(active.meta.id,undefined,active.shape);activeGrids.set(active.meta.id,active.grid);}this.activeGrids=activeGrids;
  const interval=viewContourInterval(spec,view.width/view.scale),scale=2**Math.floor(Math.log2(view.scale)),style=JSON.stringify(spec)+"/"+interval+"/"+scale+"/"+sea;
  const signature=[style,view.left,view.top,view.right,view.bottom].join("/");if(signature===this.last&&scene===this.scene)return;
  this.periodX=world.wrap?world.displayWidth:null;this.last=signature;this.scene=scene;this.spec=spec;this.interval=interval;this.scale=scale;this.sea=sea;
  const previous=new Map(this.jobs.map(j=>[j.id,j])),jobs:Job[]=[],wanted:string[]=[];
  const add=(id:string,image:Omit<Image,"canvas">,sample:()=>HeightSampler)=>{
   wanted.push(id);const cached=this.cache.get(id);if(cached){this.cache.delete(id);this.cache.set(id,cached);this.metrics.hits++;return;}jobs.push(previous.get(id)??{id,image,sample:sample(),row:0});
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
   drawCartographicTile(canvas,sample,x0,y0,shape,this.sea,this.spec,this.interval,j.image.frame,this.scale,Math.max(64,Math.min(256,2**Math.ceil(Math.log2(32*Math.max(shape.displayWidth/shape.width,shape.displayHeight/shape.height)*this.scale)))),this.periodX);this.jobs.shift();this.cache.set(j.id,{canvas,...j.image});this.usedBytes+=canvas.width*canvas.height*4;this.metrics.painted++;
   while(this.cache.size>this.limit||this.usedBytes>64*1024*1024){const key=this.cache.keys().next().value!,image=this.cache.get(key)!;this.usedBytes-=image.canvas.width*image.canvas.height*4;this.cache.delete(key);}this.metrics.maxTextures=Math.max(this.metrics.maxTextures,this.cache.size);
   if(performance.now()-start>=budget)break;
  }this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);
 }
 draw(ctx:CanvasRenderingContext2D,view:TerrainView,world:TerrainGeometry){
  const images=this.wanted.map(k=>this.cache.get(k)).filter((v):v is Image=>!!v).sort((a,b)=>a.level-b.level);ctx.imageSmoothingEnabled=true;
  for(const {canvas,frame,shape,key} of images){const cols=shape.width/32,w=frame.width/cols,h=frame.height/(shape.height/32);for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0])ctx.drawImage(canvas,view.x+(frame.x+offset+key%cols*w)*view.scale,view.y+(frame.y+Math.floor(key/cols)*h)*view.scale,w*view.scale+.03,h*view.scale+.03);}
 }
 clear(){this.usedBytes=0;this.cache.clear();this.activeGrids.clear();this.jobs=[];this.wanted=[];this.versions.clear();this.last="";}
 get bytes(){return this.usedBytes;}
 get rootSpacing(){return this.baseSpacing;}
 get contourInterval(){return this.interval;}
}

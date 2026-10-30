import {terrainRasterFrame} from "./terrain-raster-frame";
import type {TerrainGeometry,TerrainView} from "./terrain";
import {cartographicWindows,type CartographicWindow} from "./terrain-cartography-window";
import {paintTerrainTile,paintTerrainWindow} from "./terrain-renderer";
import type {TerrainRelief} from "./terrain-relief";
import {frameGeometry,lodGeometry,tileKeysForView,type TerrainViewport,type TerrainFrame,type RefinementMeta} from "./terrain-refinement";
import type {DetailPlan,TerrainDetailCache} from "./terrain-refinement-cache";

export type TerrainDetailScene={
 cache:TerrainDetailCache;plans:DetailPlan[];tick:number;
 active?:{meta:RefinementMeta;grid:Int16Array;shape:TerrainGeometry};
 preview?:{meta:RefinementMeta;grid:Int16Array;shape:TerrainGeometry};
};
type Source={id:string;shape:TerrainGeometry;frame:TerrainFrame;level:number;key:number;authority:string;sample:(x:number,y:number)=>number;prepareRows:number};
type TileImage=Omit<Source,"sample"|"prepareRows">&{canvas:HTMLCanvasElement;window?:CartographicWindow};
type PaintJob={id:string;source:Source;window?:CartographicWindow;work?:Generator<void,ImageData>};
/** Existing numerical-tile painter, with visible visual windows for both scalar
 * appearances. The original 2048 images / 8 MiB payload budget is retained. */
export class TerrainDetailPainter{
 private images=new Map<string,TileImage>();private jobs:PaintJob[]=[];private wanted:string[]=[];private authorities=new Set<string>();private versions=new Map<string,number>();private scene?:TerrainDetailScene;private root?:Int16Array;private viewportKey="";private sea=NaN;private style="";
 readonly metrics={painted:0,maxTextures:0,maxBatchMs:0,visualDpr:1,generalized:false};
 constructor(readonly limit=2048){}
 get pending(){return this.jobs.length;}
 get bytes(){let bytes=0;for(const v of this.images.values())bytes+=v.canvas.width*v.canvas.height*4;return bytes;}
 invalidate(id:string,keys:Iterable<number>|undefined,shape:TerrainGeometry){
  if(!keys){for(const [key,value]of this.images)if(value.id===id)this.images.delete(key);this.jobs=this.jobs.filter(job=>job.source.id!==id);}
  else for(const fine of keys)for(let lod=0;lod<=Math.log2(Math.min(shape.width,shape.height)/32);lod++){
   const columns=shape.width/32/2**lod,x=Math.floor(fine%(shape.width/32)/2**lod),y=Math.floor(Math.floor(fine/(shape.width/32))/2**lod);
   for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const xx=shape.wrap?((x+i)%columns+columns)%columns:x+i,key=(y+j)*columns+xx;if(xx>=0&&xx<columns&&y+j>=0&&y+j<shape.height/32/2**lod){const versionKey=`${id}/${lod}/${key}`;this.versions.set(versionKey,(this.versions.get(versionKey)??0)+1);}}
  }this.scene=undefined;this.viewportKey="";
 }
 sync(scene:TerrainDetailScene|undefined,world:TerrainGeometry,sea:number,relief:TerrainRelief|undefined,view?:TerrainViewport,root?:Int16Array,dpr=1){
  if(root!==this.root){this.invalidate("root",undefined,world);this.root=root;}
  const style=JSON.stringify(relief),viewportKey=view?[view.left,view.right,view.top,view.bottom,view.scale,dpr].join("/"):"";if(scene===this.scene&&sea===this.sea&&style===this.style&&viewportKey===this.viewportKey)return;
  if(sea!==this.sea||style!==this.style){this.images.clear();this.jobs=[];}this.scene=scene;this.sea=sea;this.style=style;this.viewportKey=viewportKey;const sources:Source[]=[];
  const covered=view&&(scene?.plans??[]).some(plan=>{const f=plan.meta.frame,ready=scene?.active?.meta.id===plan.meta.id||scene?.preview?.meta.id===plan.meta.id||plan.keys.every(key=>scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,key));return ready&&[-world.displayWidth,0,world.displayWidth].some(offset=>(offset===0||world.wrap)&&view.left>=f.x+offset&&view.right<=f.x+offset+f.width&&view.top>=f.y&&view.bottom<=f.y+f.height);});
  if(view&&root&&!covered&&Math.max(world.displayWidth/world.width,world.displayHeight/world.height)*view.scale*dpr>1.5){const frame={x:0,y:0,width:world.displayWidth,height:world.displayHeight};for(const key of tileKeysForView(frame,world,view,world)){const version=this.versions.get(`root/0/${key}`)??0;sources.push({id:"root",shape:world,frame,level:-1,key,authority:`root/0/${key}/${version}`,prepareRows:34,sample:(x,y)=>root[(Math.max(0,Math.min(world.height-1,y)))*world.width+(world.wrap?(x%world.width+world.width)%world.width:Math.max(0,Math.min(world.width-1,x)))]});}}
  for(const plan of scene?.plans??[]){
   const shape=lodGeometry(frameGeometry(plan.meta,world),plan.lod),columns=shape.width/32,active=[scene?.preview,scene?.active].find(v=>v?.meta.id===plan.meta.id);
   for(const key of plan.keys){const center=scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,key);if(!active&&!center)continue;
    let signature:string,sample:(x:number,y:number)=>number;
    if(active){
     signature=`active/${this.versions.get(`${plan.meta.id}/${plan.lod}/${key}`)??0}`;
     const memo=new Map<number,number>(),factor=2**plan.lod;
     sample=(x,y)=>{x=Math.max(0,Math.min(shape.width-1,x));y=Math.max(0,Math.min(shape.height-1,y));const cell=y*shape.width+x,hit=memo.get(cell);if(hit!==undefined)return hit;
      // Match recursive rounded 2x2 numerical overviews exactly.
      const average=(px:number,py:number,level:number):number=>{if(!level)return active.grid[py*active.shape.width+px];return Math.round((average(px,py,level-1)+average(px+2**(level-1),py,level-1)+average(px,py+2**(level-1),level-1)+average(px+2**(level-1),py+2**(level-1),level-1))/4);};
      const value=average(x*factor,y*factor,plan.lod);memo.set(cell,value);return value;};
    }else{
     const x=key%columns,y=Math.floor(key/columns),halo:string[]=[];
     for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)halo.push(scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,(y+j)*columns+x+i)?.sha256??"missing");
     signature=halo.join(":");sample=(px,py)=>{px=Math.max(0,Math.min(shape.width-1,px));py=Math.max(0,Math.min(shape.height-1,py));return scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,Math.floor(py/32)*columns+Math.floor(px/32))?.samples[py%32*32+px%32]??center!.samples[Math.max(0,Math.min(31,py-y*32))*32+Math.max(0,Math.min(31,px-x*32))];};
    }
    sources.push({id:plan.meta.id,shape,frame:plan.meta.frame,level:plan.meta.level,key,authority:`${plan.meta.id}/${plan.meta.revision}/${plan.lod}/${key}/${signature}`,sample,prepareRows:active&&plan.lod>=3?0:34});
   }
  }
  const rasterScale=view?2**(Math.ceil(Math.log2(view.scale*dpr)*4)/4):1;
  let ratio=1,parts:{source:Source;window?:CartographicWindow}[]=[];
  for(let attempt=0;attempt<12;attempt++){parts=[];let pixels=0;for(const source of sources){if(view){const cols=source.shape.width/32,tw=source.frame.width/cols,th=source.frame.height/(source.shape.height/32),x=source.frame.x+source.key%cols*tw,y=source.frame.y+Math.floor(source.key/cols)*th;if(y>=view.bottom||y+th<=view.top||!(world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]).some(offset=>x+offset<view.right&&x+offset+tw>view.left))continue;}let windows:(CartographicWindow|undefined)[]=[undefined];if(view){const scale=rasterScale*ratio,tw=source.frame.width/source.shape.width*32,th=source.frame.height/source.shape.height*32;if(Math.max(tw,th)*scale>48){windows=cartographicWindows(source.frame,source.shape,source.key,{...view,scale},world);if(!windows.length)windows=[{x:0,y:0,width:32,height:32,pixelsX:Math.max(1,Math.min(256,Math.ceil(tw*scale))),pixelsY:Math.max(1,Math.min(256,Math.ceil(th*scale)))}];}}for(const window of windows){parts.push({source,window});pixels+=window?window.pixelsX*window.pixelsY:1024;}}
   if(pixels<=1.75*1048576)break;ratio*=Math.min(.8,Math.sqrt(1.7*1048576/pixels));}
  this.metrics.visualDpr=dpr*ratio;this.metrics.generalized=ratio<1;
  const previous=new Map(this.jobs.map(j=>[j.id,j]));this.jobs=[];this.wanted=[];this.authorities.clear();
  for(const part of parts){const {source,window}=part,id=source.authority+(window?`/window/${window.x}/${window.y}/${window.width}/${window.height}/${window.pixelsX}/${window.pixelsY}`:"");this.wanted.push(id);this.authorities.add(source.authority);const image=this.images.get(id);if(image){this.images.delete(id);this.images.set(id,image);}else this.jobs.push(previous.get(id)??{id,...part});}
  for(const job of this.jobs.slice(1))job.work=undefined;
 }
 paint(world:TerrainGeometry,sea:number,relief:TerrainRelief|undefined,budget=6){
  const started=performance.now();while(this.jobs.length){const job=this.jobs[0],source=job.source,{shape,key,sample}=source,x0=key%(shape.width/32)*32,y0=Math.floor(key/(shape.width/32))*32;
   while(source.prepareRows<34){const row=source.prepareRows++;for(let x=-1;x<=32;x++)sample(x0+x,y0+row-1);if(performance.now()-started>=budget){this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-started);return this.jobs.length;}}
   let pixels:ImageData;if(job.window){job.work??=paintTerrainWindow(sample,x0,y0,shape,sea,relief??{mode:"classic",exaggeration:1},job.window);const result=job.work.next();if(!result.done){if(performance.now()-started>=budget)break;continue;}pixels=result.value;}else pixels=paintTerrainTile(new Int16Array(0),sea,key,shape,relief,sample);
   const canvas=document.createElement("canvas");canvas.width=pixels.width;canvas.height=pixels.height;canvas.getContext("2d")!.putImageData(pixels,0,0);this.jobs.shift();const {sample:_sample,prepareRows:_rows,...image}=source;void _sample;void _rows;this.images.set(job.id,{...image,canvas,window:job.window});this.metrics.painted++;
   while(this.images.size>this.limit||this.bytes>8*1048576)this.images.delete(this.images.keys().next().value!);this.metrics.maxTextures=Math.max(this.metrics.maxTextures,this.images.size);if(performance.now()-started>=budget)break;
  }this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-started);return this.jobs.length;
 }
 draw(ctx:CanvasRenderingContext2D,view:TerrainView,world:TerrainGeometry,_scene:TerrainDetailScene|undefined){
  void _scene;const dpr=Math.abs(ctx.getTransform().a)||1;const ready=this.wanted.map(k=>this.images.get(k)).filter((v):v is TileImage=>!!v),current=new Set(ready),retained=this.pending?[...this.images.values()].filter(v=>!current.has(v)&&this.authorities.has(v.authority)):[];
  for(const image of [...retained,...ready].sort((a,b)=>a.level-b.level||Number(current.has(a))-Number(current.has(b)))){const {frame,shape,key,canvas,window}=image,columns=shape.width/32,tw=frame.width/columns,th=frame.height/(shape.height/32),wx=(window?.x??0)/32*tw,wy=(window?.y??0)/32*th,w=(window?.width??32)/32*tw,h=(window?.height??32)/32*th;
   ctx.imageSmoothingEnabled=!!window||Math.max(tw/32,th/32)*view.scale<2;ctx.imageSmoothingQuality="high";for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){const q=terrainRasterFrame(view,{x:frame.x+offset+key%columns*tw+wx,y:frame.y+Math.floor(key/columns)*th+wy,width:w,height:h},dpr);ctx.drawImage(canvas,q.x,q.y,q.width,q.height);}
  }
 }
 clear(){this.images.clear();this.jobs=[];this.wanted=[];this.authorities.clear();this.versions.clear();this.scene=undefined;this.root=undefined;this.viewportKey="";}
}

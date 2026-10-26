import type {TerrainGeometry,TerrainView} from "./terrain";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import type {TerrainFrame,TerrainViewport} from "./terrain-refinement";
import {terrainSurfaceSampler} from "./terrain-surface-field";
import {surfacePixel} from "./terrain-surface-art";
import {EMPTY_TERRAIN_MATERIALS,type MaterialStroke} from "./terrain-materials";

type Image={canvas:HTMLCanvasElement;frame:TerrainFrame;baseKey:string};
type Job={key:string;baseKey:string;frame:TerrainFrame;row:number;col:number;pixels?:ImageData;resolution:number;strokes:MaterialStroke[]};
/** Artwork tiles are independent of numerical tiles. At each visual LOD one
 * raster pixel covers at most one device pixel. The one-pixel halo filters joins. */
export class TerrainSurfacePainter{
 private images=new Map<string,Image>();private fallback=new Map<string,string>();private jobs:Job[]=[];private wanted:{key:string;baseKey:string;frame:TerrainFrame}[]=[];
 private root?:Int16Array;private scene?:TerrainDetailScene;private stamp=0;private signature="";private sample?:ReturnType<typeof terrainSurfaceSampler>;
 private world?:TerrainGeometry;private sea=0;private relief=20;private layer=EMPTY_TERRAIN_MATERIALS;
 readonly metrics={painted:0,hits:0,maxBatchMs:0,maxTextures:0,visualMetres:0};
 constructor(readonly limit=1024){}
 invalidate(){this.stamp++;this.signature="";}
 get pending(){return this.jobs.length;}
 get bytes(){let n=0;for(const i of this.images.values())n+=i.canvas.width*i.canvas.height*4;return n;}
 sync(root:Int16Array,world:TerrainGeometry,scene:TerrainDetailScene|undefined,view:TerrainViewport,sea:number,relief:number,layer=EMPTY_TERRAIN_MATERIALS,dpr=1){
  if(root!==this.root){this.root=root;this.invalidate();}
  const level=Math.max(0,Math.min(48,Math.floor(Math.log2(world.displayWidth*view.scale*dpr/128)))),size=world.displayWidth/2**level;
  const resolution=Math.max(32,Math.min(256,Math.ceil(size*view.scale*dpr))),left=Math.max(world.wrap?-(2**level):0,Math.floor(view.left/size)),right=Math.min(world.wrap?2*2**level-1:2**level-1,Math.floor(view.right/size)),top=Math.max(0,Math.floor(view.top/size)),bottom=Math.min(Math.ceil(world.displayHeight/size)-1,Math.floor(view.bottom/size));
  const signature=[left,right,top,bottom,level,resolution,sea,relief,this.stamp,layer===this.layer?"retained":"changed"].join("/");if(signature===this.signature&&scene===this.scene&&layer===this.layer)return;this.signature=signature;this.scene=scene;
  this.world=world;this.sea=sea;this.relief=relief;this.layer=layer;this.sample=terrainSurfaceSampler(root,world,scene);this.metrics.visualMetres=size/resolution;
  const old=new Map(this.jobs.map(j=>[j.key,j])),jobs:Job[]=[],wanted:{key:string;baseKey:string;frame:TerrainFrame}[]=[],seen=new Set<string>(),period=world.wrap?world.displayWidth:null;
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const xx=world.wrap?((x%2**level)+2**level)%2**level:x;if(!world.wrap&&(xx<0||xx>=2**level))continue;
   const frame={x:xx*size,y:y*size,width:size,height:size},strokes=layer.strokes.filter(s=>intersects(s,frame,period));
   const baseKey=[level,resolution,xx,y,this.stamp,surfaceDependencies(frame,world,scene),sea,relief,layer.visible,layer.opacity,layer.automatic].join("/"),key=[baseKey,...strokes.map(s=>s.id+":"+fingerprint(JSON.stringify(s)))].join("/");
   wanted.push({key,baseKey,frame:{...frame,x:x*size}});if(seen.has(key))continue;seen.add(key);
   if(this.images.has(key)){const image=this.images.get(key)!;this.images.delete(key);this.images.set(key,image);this.fallback.set(baseKey,key);this.metrics.hits++;continue;}
   jobs.push(old.get(key)??{key,baseKey,frame,row:0,col:0,resolution,strokes});
  }
  // Only the viewport gets work; cancelled jobs and their pixel arrays are released.
  for(const job of jobs.slice(1))if(job.pixels){job.pixels=undefined;job.row=0;job.col=0;}this.wanted=wanted;this.jobs=jobs;
 }
 paint(budget=4){const start=performance.now();if(!this.sample||!this.world)return;while(this.jobs.length){const j=this.jobs[0],edge=j.resolution+2,pixels=j.pixels??(j.pixels=new ImageData(edge,edge)),step=j.frame.width/j.resolution,period=this.world.wrap?this.world.displayWidth:null;
   while(j.row<edge){const row=j.row;while(j.col<edge){const col=j.col++;let x=j.frame.x+(col-.5)*step;const y=j.frame.y+(row-.5)*step;if(period)x=((x%period)+period)%period;const field=this.sample(x,y),rgb=surfacePixel(field,x,y,step,this.sea,this.relief,this.layer,j.strokes,period),i=(row*edge+col)*4;pixels.data[i]=rgb[0];pixels.data[i+1]=rgb[1];pixels.data[i+2]=rgb[2];pixels.data[i+3]=255;if(j.col%8===0&&performance.now()-start>=budget){this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);return;}}j.row++;j.col=0;if(performance.now()-start>=budget){this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);return;}}
   const canvas=document.createElement("canvas");canvas.width=canvas.height=edge;canvas.getContext("2d")!.putImageData(pixels,0,0);this.images.set(j.key,{canvas,frame:j.frame,baseKey:j.baseKey});this.fallback.set(j.baseKey,j.key);this.jobs.shift();this.metrics.painted++;
   while(this.images.size>this.limit||this.bytes>64*1024*1024){const key=this.images.keys().next().value!,old=this.images.get(key)!;this.images.delete(key);if(this.fallback.get(old.baseKey)===key)this.fallback.delete(old.baseKey);}this.metrics.maxTextures=Math.max(this.metrics.maxTextures,this.images.size);if(performance.now()-start>=budget)break;
  }this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-start);}
 draw(ctx:CanvasRenderingContext2D,view:TerrainView){const world=this.world;if(!world)return;ctx.save();ctx.beginPath();ctx.rect(world.wrap?0:view.x,view.y,world.wrap?ctx.canvas.width:view.scale*world.displayWidth,view.scale*world.displayHeight);ctx.clip();ctx.imageSmoothingEnabled=true;
  for(const {key,baseKey,frame} of this.wanted){const image=this.images.get(key)??this.images.get(this.fallback.get(baseKey)??"");if(image)ctx.drawImage(image.canvas,1,1,image.canvas.width-2,image.canvas.height-2,view.x+frame.x*view.scale,view.y+frame.y*view.scale,frame.width*view.scale+.02,frame.height*view.scale+.02);}ctx.restore();
 }
 clear(){this.images.clear();this.fallback.clear();this.jobs=[];this.wanted=[];this.signature="";this.sample=undefined;}
}
function intersects(s:MaterialStroke,f:TerrainFrame,period:number|null){for(let i=0;i<s.points.length;i++){const a=s.points[i],b=s.points[Math.min(i+1,s.points.length-1)];let dx=b.x-a.x;if(period)dx-=Math.round(dx/period)*period;for(const offset of period?[-period,0,period]:[0]){const x=a.x+offset;if(Math.min(x,x+dx)-s.radiusM<=f.x+f.width&&Math.max(x,x+dx)+s.radiusM>=f.x&&Math.min(a.y,b.y)-s.radiusM<=f.y+f.height&&Math.max(a.y,b.y)+s.radiusM>=f.y)return true;}}return false;}
function fingerprint(text:string){let a=2166136261,b=3339675911;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),2246822519);}return (a>>>0).toString(16)+(b>>>0).toString(16)+":"+text.length;}
/** Dependency signatures describe this artwork tile's numerical neighborhood,
 * not viewport request identities. Returning to unchanged coverage reuses art. */
function surfaceDependencies(f:TerrainFrame,world:TerrainGeometry,scene?:TerrainDetailScene){const parts:string[]=[];for(const plan of scene?.plans??[]){const active=[scene?.preview,scene?.active].find(a=>a?.meta.id===plan.meta.id),shape=active?.shape??{width:plan.meta.gridWidth/2**plan.lod,height:plan.meta.gridHeight/2**plan.lod},cols=shape.width/32,rows=shape.height/32,frame=plan.meta.frame;
 for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){const x=f.x+offset-frame.x,y=f.y-frame.y;if(x>=frame.width||x+f.width<=0||y>=frame.height||y+f.height<=0)continue;parts.push(plan.meta.id,active?"working":plan.meta.revision+"/"+plan.lod);if(active)continue;const left=Math.max(0,Math.floor(Math.max(0,x)/frame.width*cols)-1),right=Math.min(cols-1,Math.floor(Math.min(frame.width,x+f.width)/frame.width*cols)+1),top=Math.max(0,Math.floor(Math.max(0,y)/frame.height*rows)-1),bottom=Math.min(rows-1,Math.floor(Math.min(frame.height,y+f.height)/frame.height*rows)+1);for(let j=top;j<=bottom;j++)for(let i=left;i<=right;i++)parts.push(scene!.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,j*cols+i)?.sha256??"missing");}
 }return fingerprint(parts.join("/"));}

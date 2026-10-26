import type {TerrainGeometry,TerrainView} from "./terrain";
import {paintTerrainTile} from "./terrain-renderer";
import type {TerrainRelief} from "./terrain-relief";
import {frameGeometry,lodGeometry,type TerrainFrame,type RefinementMeta} from "./terrain-refinement";
import type {DetailPlan,TerrainDetailCache} from "./terrain-refinement-cache";

export type TerrainDetailScene={
 cache:TerrainDetailCache;plans:DetailPlan[];tick:number;
 active?:{meta:RefinementMeta;grid:Int16Array;shape:TerrainGeometry};
 preview?:{meta:RefinementMeta;grid:Int16Array;shape:TerrainGeometry};
};
type TileImage={signature:string;canvas:HTMLCanvasElement;id:string;lod:number;key:number};
type PaintJob={plan:DetailPlan;key:number;signature:string;sample:(x:number,y:number)=>number;prepareRows:number};

/** Only visible numerical tiles become textures. Both caches have explicit budgets. */
export class TerrainDetailPainter{
 private images=new Map<string,TileImage>();
 private jobs:PaintJob[]=[];
 private versions=new Map<string,number>();
 private scene?:TerrainDetailScene;
 private sea=NaN;
 private style="";
 readonly metrics={painted:0,maxTextures:0,maxBatchMs:0};
 constructor(readonly limit=2048){}
 get pending(){return this.jobs.length;}
 invalidate(id:string,keys:Iterable<number>|undefined,shape:TerrainGeometry){
  if(!keys){for(const [key,value] of this.images)if(value.id===id)this.images.delete(key);}
  else for(const fine of keys)for(let lod=0;lod<=Math.log2(Math.min(shape.width,shape.height)/32);lod++){
   const columns=shape.width/32/2**lod,x=Math.floor(fine%(shape.width/32)/2**lod),y=Math.floor(Math.floor(fine/(shape.width/32))/2**lod);
   for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const key=(y+j)*columns+x+i;if(x+i>=0&&x+i<columns&&y+j>=0&&y+j<shape.height/32/2**lod){const versionKey=`${id}/${lod}/${key}`;this.versions.set(versionKey,(this.versions.get(versionKey)??0)+1);}}
  }
  this.scene=undefined;
 }
 sync(scene:TerrainDetailScene|undefined,world:TerrainGeometry,sea:number,relief:TerrainRelief|undefined){
  const style=JSON.stringify(relief);if(scene===this.scene&&sea===this.sea&&style===this.style)return;
  if(sea!==this.sea||style!==this.style)this.images.clear();this.scene=scene;this.sea=sea;this.style=style;this.jobs=[];
  if(!scene)return;
  for(const plan of scene.plans){
   const shape=lodGeometry(frameGeometry(plan.meta,world),plan.lod),columns=shape.width/32;
   const active=[scene.preview,scene.active].find(v=>v?.meta.id===plan.meta.id);
   for(const key of plan.keys){
    const id=`${plan.meta.id}/${plan.meta.revision}/${plan.lod}/${key}`,center=scene.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,key);
    if(!active&&!center)continue;
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
     for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)halo.push(scene.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,(y+j)*columns+x+i)?.sha256??"missing");
     signature=halo.join(":");sample=(px,py)=>{px=Math.max(0,Math.min(shape.width-1,px));py=Math.max(0,Math.min(shape.height-1,py));return scene.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,Math.floor(py/32)*columns+Math.floor(px/32))?.samples[py%32*32+px%32]??center!.samples[Math.max(0,Math.min(31,py-y*32))*32+Math.max(0,Math.min(31,px-x*32))];};
    }
    const existing=this.images.get(id);if(existing?.signature===signature){this.images.delete(id);this.images.set(id,existing);}else this.jobs.push({plan,key,signature,sample,prepareRows:active&&plan.lod>=3?0:34});
   }
  }
 }
 paint(world:TerrainGeometry,sea:number,relief:TerrainRelief|undefined,budget=6){
  const started=performance.now();while(this.jobs.length){const job=this.jobs[0],{plan,key,signature,sample}=job,shape=lodGeometry(frameGeometry(plan.meta,world),plan.lod),x0=key%(shape.width/32)*32,y0=Math.floor(key/(shape.width/32))*32;
   while(job.prepareRows<34){const row=job.prepareRows++;for(let x=-1;x<=32;x++)sample(x0+x,y0+row-1);if(performance.now()-started>=budget){this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-started);return this.jobs.length;}}
   this.jobs.shift();const canvas=document.createElement("canvas");canvas.width=32;canvas.height=32;
   canvas.getContext("2d")!.putImageData(paintTerrainTile(new Int16Array(0),sea,key,shape,relief,sample),0,0);
   const id=`${plan.meta.id}/${plan.meta.revision}/${plan.lod}/${key}`;this.images.delete(id);this.images.set(id,{signature,canvas,id:plan.meta.id,lod:plan.lod,key});this.metrics.painted++;
   while(this.images.size>this.limit)this.images.delete(this.images.keys().next().value!);this.metrics.maxTextures=Math.max(this.metrics.maxTextures,this.images.size);if(performance.now()-started>=budget)break;
  }this.metrics.maxBatchMs=Math.max(this.metrics.maxBatchMs,performance.now()-started);return this.jobs.length;
 }
 draw(ctx:CanvasRenderingContext2D,view:TerrainView,world:TerrainGeometry,scene:TerrainDetailScene|undefined){
  if(!scene)return;
  for(const plan of [...scene.plans].sort((a,b)=>a.meta.level-b.meta.level)){
   const frame:TerrainFrame=plan.meta.frame,shape=lodGeometry(frameGeometry(plan.meta,world),plan.lod),columns=shape.width/32,tw=frame.width/columns,th=frame.height/(shape.height/32);
   ctx.imageSmoothingEnabled=Math.max(tw/32,th/32)*view.scale<2;
   for(const key of plan.keys){const image=this.images.get(`${plan.meta.id}/${plan.meta.revision}/${plan.lod}/${key}`);if(!image)continue;
    for(const offset of world.wrap?[-world.displayWidth,0,world.displayWidth]:[0]){const x=view.x+(frame.x+offset+key%columns*tw)*view.scale,y=view.y+(frame.y+Math.floor(key/columns)*th)*view.scale;ctx.drawImage(image.canvas,x,y,tw*view.scale+.05,th*view.scale+.05);}
   }
  }
 }
 clear(){this.images.clear();this.jobs=[];this.versions.clear();this.scene=undefined;}
}

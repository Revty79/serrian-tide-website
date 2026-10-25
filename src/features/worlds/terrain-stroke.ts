import {brushRadius,sculpt,tileKey,type Brush,type SculptWorkspace,type TerrainGeometry} from "./terrain";
import {physicalBrushGeometry} from "./terrain-physical-brush";
import type {TerrainPathPoint} from "./terrain-operations";
/** Queued numerical dabs are processed in bounded animation-frame batches. */
export class TerrainStroke{
 readonly before=new Map<number,number>();
 private targets:TerrainPathPoint[]=[];
 private position:TerrainPathPoint;
 private touched=new Set<number>();
 private workspace:SculptWorkspace={halo:new Int16Array(0)};
 readonly spacing:number;
 private metric:{x:number;y:number}|null;
 constructor(private grid:Int16Array,private shape:TerrainGeometry,private brush:Brush,start:TerrainPathPoint,blocked?:Uint8Array){this.workspace.blocked=blocked;if(brush.radiusMetres!==undefined&&!physicalBrushGeometry(shape,brush.radiusMetres))throw Error("Choose a supported physical brush radius before starting a stroke.");this.position={...start};this.metric=brush.radiusMetres===undefined?null:{x:shape.displayWidth/shape.width,y:shape.displayHeight/shape.height};this.spacing=this.metric?Math.max(Math.min(this.metric.x,this.metric.y)/4,brush.radiusMetres!/3):Math.max(1,brushRadius(shape,brush.radius)/3);this.targets.push({...start});}
 get blockedCount(){return this.workspace.blockedHits??0;}
 get pending(){return this.targets.length>0;}
 enqueue(point:TerrainPathPoint){
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
  const previous=this.targets.at(-1)??this.position,x=this.shape.wrap?point.x+Math.round((previous.x-point.x)/this.shape.width)*this.shape.width:point.x;
  if(Math.hypot(x-previous.x,point.y-previous.y)>Math.hypot(this.shape.width,this.shape.height)*2)return;
  const next={x,y:point.y};if(this.targets.length&&next.x===previous.x&&next.y===previous.y)return;
  this.targets.push(next);
 }
 advance(budgetMs=5){
  this.touched.clear();const started=performance.now();let dabs=0;
  while(this.targets.length&&dabs<64){
   const target=this.targets[0],dx=target.x-this.position.x,dy=target.y-this.position.y,distance=this.metric?Math.hypot(dx*this.metric.x,dy*this.metric.y):Math.hypot(dx,dy);
   if(distance>this.spacing){const t=this.spacing/distance;this.position.x+=dx*t;this.position.y+=dy*t;}else{this.position.x=target.x;this.position.y=target.y;this.targets.shift();}
   sculpt(this.grid,this.position.x,this.position.y,this.brush,this.before,this.shape,this.workspace,this.touched);dabs++;
   if(performance.now()-started>=budgetMs)break;
  }
  return this.touched;
 }
 finish(){if(this.pending)throw Error("Finish queued brush samples before recording the gesture.");let count=0;this.before.forEach((value,index)=>{if(this.grid[index]!==value)count++;});const indices=new Uint32Array(count),before=new Int16Array(count),after=new Int16Array(count);let n=0;this.before.forEach((value,index)=>{if(this.grid[index]!==value){indices[n]=index;before[n]=value;after[n]=this.grid[index];n++;}});this.before.clear();return {indices,before,after};}
 cancel(){this.targets=[];this.touched.clear();for(const [i,value] of this.before){this.grid[i]=value;this.touched.add(tileKey(Math.floor(i%this.shape.width/32),Math.floor(i/this.shape.width/32),this.shape));}this.before.clear();return this.touched;}
}

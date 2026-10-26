import type {TerrainGeometry} from "./terrain";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import {frameGeometry,lodGeometry} from "./terrain-refinement";

export type SurfaceField={height:number;waterHeight:number;gx:number;gy:number;rough:number;spacing:number;coastLow?:number;coastHigh?:number};
const cubic=(a:number,b:number,c:number,d:number,t:number)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
const derivative=(a:number,b:number,c:number,d:number,t:number)=>.5*(c-a+2*t*(2*a-5*b+4*c-d)+3*t*t*(3*(b-c)+d-a));
type SurfaceCell={block:number[][];min:number;max:number;curvature:number[];lows:number[];highs:number[]};
function surfaceCell(read:(x:number,y:number)=>number,ix:number,iy:number):SurfaceCell{
 const block:number[][]=[];let min=Infinity,max=-Infinity;
 for(let j=-1;j<=2;j++){const row=[-1,0,1,2].map(i=>read(ix+i,iy+j));block.push(row);for(const z of row){min=Math.min(min,z);max=Math.max(max,z);}}
 const lows:number[]=[],highs:number[]=[],curvature:number[]=[];
 for(let j=1;j<=2;j++)for(let i=1;i<=2;i++){curvature.push(Math.abs(block[j][i-1]-2*block[j][i]+block[j][i+1])+Math.abs(block[j-1][i]-2*block[j][i]+block[j+1][i]));let low=Infinity,high=-Infinity;for(let y=j-1;y<=j+1;y++)for(let x=i-1;x<=i+1;x++){low=Math.min(low,block[y][x]);high=Math.max(high,block[y][x]);}lows.push(low);highs.push(high);}
 return {block,min,max,curvature,lows,highs};
}
function evaluateCell(cell:SurfaceCell,tx:number,ty:number,dx:number,dy:number):SurfaceField{
 const {block,min,max,curvature,lows,highs}=cell,rows:number[]=[],slopes:number[]=[];
 for(const v of block){rows.push(cubic(v[0],v[1],v[2],v[3],tx));slopes.push(derivative(v[0],v[1],v[2],v[3],tx));}
 const mix=(v:number[])=>(v[0]+(v[1]-v[0])*tx)*(1-ty)+(v[2]+(v[3]-v[2])*tx)*ty;
 return {height:Math.max(min,Math.min(max,cubic(rows[0],rows[1],rows[2],rows[3],ty))),waterHeight:mix([block[1][1],block[1][2],block[2][1],block[2][2]]),gx:cubic(slopes[0],slopes[1],slopes[2],slopes[3],ty)/dx,gy:derivative(rows[0],rows[1],rows[2],rows[3],ty)/dy,rough:mix(curvature)/Math.max(dx,dy),spacing:Math.max(dx,dy),coastLow:mix(lows),coastHigh:mix(highs)};
}
/** Smooth presentation reconstruction only. No sample is created, edited or saved. */
export function reconstructSurface(read:(x:number,y:number)=>number,x:number,y:number,dx:number,dy:number):SurfaceField{
 const ix=Math.floor(x),iy=Math.floor(y);return evaluateCell(surfaceCell(read,ix,iy),x-ix,y-iy,dx,dy);
}
/** Each painter synchronization creates a fresh sampler. Reuse its immutable
 * numerical neighborhoods during artwork generation; never retain across edits. */
export function cachedSurfaceReconstructor(read:(x:number,y:number)=>number|undefined,dx:number,dy:number,limit=4096){
 const cells=new Map<string,SurfaceCell>();
 return (x:number,y:number):SurfaceField|undefined=>{const ix=Math.floor(x),iy=Math.floor(y),key=ix+"/"+iy;let cell=cells.get(key);if(!cell){let present=true;cell=surfaceCell((i,j)=>{const value=read(i,j);if(value===undefined)present=false;return value??0;},ix,iy);if(!present)return;cells.set(key,cell);if(cells.size>limit)cells.delete(cells.keys().next().value!);}return evaluateCell(cell,x-ix,y-iy,dx,dy);};
}
export function terrainSurfaceSampler(root:Int16Array,world:TerrainGeometry,scene?:TerrainDetailScene){
 const rootRead=(x:number,y:number)=>root[Math.max(0,Math.min(world.height-1,y))*world.width+(world.wrap?((x%world.width)+world.width)%world.width:Math.max(0,Math.min(world.width-1,x)))];
 const cellLimit=Math.max(1,Math.floor(8192/((scene?.plans.length??0)+1))),rootSample=cachedSurfaceReconstructor(rootRead,world.displayWidth/world.width,world.displayHeight/world.height,cellLimit);
 const plans=[...(scene?.plans??[])].sort((a,b)=>a.meta.level-b.meta.level).map(plan=>{const active=[scene?.preview,scene?.active].find(a=>a?.meta.id===plan.meta.id),shape=active?.shape??lodGeometry(frameGeometry(plan.meta,world),plan.lod),cols=shape.width/32;
  const read=(x:number,y:number)=>{x=Math.max(0,Math.min(shape.width-1,x));y=Math.max(0,Math.min(shape.height-1,y));return active?active.grid[y*shape.width+x]:scene?.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,Math.floor(y/32)*cols+Math.floor(x/32))?.samples[y%32*32+x%32];};return {plan,shape,sample:cachedSurfaceReconstructor(read,plan.meta.frame.width/shape.width,plan.meta.frame.height/shape.height,cellLimit)};
 });
 return (east:number,south:number):SurfaceField=>{
  const x=world.wrap?((east%world.displayWidth)+world.displayWidth)%world.displayWidth:Math.max(0,Math.min(world.displayWidth,east)),y=Math.max(0,Math.min(world.displayHeight,south));
  const value=rootSample(x/world.displayWidth*world.width,y/world.displayHeight*world.height)!;
  for(const {plan,shape,sample} of plans){const f=plan.meta.frame,px=world.wrap?((x-f.x)%world.displayWidth+world.displayWidth)%world.displayWidth:x-f.x,py=y-f.y;if(px<0||px>=f.width||py<0||py>=f.height)continue;const dx=f.width/shape.width,dy=f.height/shape.height,gx=px/dx,gy=py/dy;
   // Complete numerical neighborhood required. Missing streamed tiles retain
   // the known parent rather than fabricating a fine surface.
   const fine=sample(gx,gy);if(!fine)continue;const edge=Math.min(px/dx,py/dy,(f.width-px)/dx,(f.height-py)/dy)/2,t=Math.max(0,Math.min(1,edge)),mix=t*t*(3-2*t);for(const k of ["height","waterHeight","gx","gy","rough"] as const)value[k]+=(fine[k]-value[k])*mix;value.spacing=fine.spacing;if(mix>.5){value.coastLow=fine.coastLow;value.coastHigh=fine.coastHigh;}
  }return value;
 };
}

import type {TerrainGeometry} from "./terrain";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import {frameGeometry,lodGeometry} from "./terrain-refinement";

export type SurfaceField={height:number;waterHeight:number;gx:number;gy:number;rough:number;spacing:number;coastLow?:number;coastHigh?:number};
const cubic=(a:number,b:number,c:number,d:number,t:number)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
const derivative=(a:number,b:number,c:number,d:number,t:number)=>.5*(c-a+2*t*(2*a-5*b+4*c-d)+3*t*t*(3*(b-c)+d-a));
/** Smooth presentation reconstruction only. No sample is created, edited or saved. */
export function reconstructSurface(read:(x:number,y:number)=>number,x:number,y:number,dx:number,dy:number):SurfaceField{
 const ix=Math.floor(x),iy=Math.floor(y),tx=x-ix,ty=y-iy,rows:number[]=[],slopes:number[]=[],block:number[][]=[];let min=Infinity,max=-Infinity;
 for(let j=-1;j<=2;j++){const v=[-1,0,1,2].map(i=>read(ix+i,iy+j));block.push(v);for(const z of v){min=Math.min(min,z);max=Math.max(max,z);}rows.push(cubic(v[0],v[1],v[2],v[3],tx));slopes.push(derivative(v[0],v[1],v[2],v[3],tx));}
 const a=block[1][1],b=block[1][2],c=block[2][1],d=block[2][2],waterHeight=(a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
 const mix=(a:number,b:number,c:number,d:number)=>(a+(b-a)*tx)*(1-ty)+(c+(d-c)*tx)*ty;
 const curvature=(x:number,y:number)=>Math.abs(block[y][x-1]-2*block[y][x]+block[y][x+1])+Math.abs(block[y-1][x]-2*block[y][x]+block[y+1][x]);
 const lows:number[]=[],highs:number[]=[];for(let j=1;j<=2;j++)for(let i=1;i<=2;i++){let low=Infinity,high=-Infinity;for(let yy=j-1;yy<=j+1;yy++)for(let xx=i-1;xx<=i+1;xx++){low=Math.min(low,block[yy][xx]);high=Math.max(high,block[yy][xx]);}lows.push(low);highs.push(high);}
 return {height:Math.max(min,Math.min(max,cubic(rows[0],rows[1],rows[2],rows[3],ty))),waterHeight,gx:cubic(slopes[0],slopes[1],slopes[2],slopes[3],ty)/dx,gy:derivative(rows[0],rows[1],rows[2],rows[3],ty)/dy,rough:mix(curvature(1,1),curvature(2,1),curvature(1,2),curvature(2,2))/Math.max(dx,dy),spacing:Math.max(dx,dy),coastLow:mix(...lows as [number,number,number,number]),coastHigh:mix(...highs as [number,number,number,number])};
}
export function terrainSurfaceSampler(root:Int16Array,world:TerrainGeometry,scene?:TerrainDetailScene){
 const rootRead=(x:number,y:number)=>root[Math.max(0,Math.min(world.height-1,y))*world.width+(world.wrap?((x%world.width)+world.width)%world.width:Math.max(0,Math.min(world.width-1,x)))];
 const plans=[...(scene?.plans??[])].sort((a,b)=>a.meta.level-b.meta.level).map(plan=>{const active=[scene?.preview,scene?.active].find(a=>a?.meta.id===plan.meta.id),shape=active?.shape??lodGeometry(frameGeometry(plan.meta,world),plan.lod),cols=shape.width/32;
  return {plan,shape,active,read:(x:number,y:number)=>{x=Math.max(0,Math.min(shape.width-1,x));y=Math.max(0,Math.min(shape.height-1,y));return active?active.grid[y*shape.width+x]:scene?.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,Math.floor(y/32)*cols+Math.floor(x/32))?.samples[y%32*32+x%32];}};
 });
 return (east:number,south:number):SurfaceField=>{
  const x=world.wrap?((east%world.displayWidth)+world.displayWidth)%world.displayWidth:Math.max(0,Math.min(world.displayWidth,east)),y=Math.max(0,Math.min(world.displayHeight,south));
  const value=reconstructSurface(rootRead,x/world.displayWidth*world.width,y/world.displayHeight*world.height,world.displayWidth/world.width,world.displayHeight/world.height);
  for(const {plan,shape,read} of plans){const f=plan.meta.frame,px=world.wrap?((x-f.x)%world.displayWidth+world.displayWidth)%world.displayWidth:x-f.x,py=y-f.y;if(px<0||px>=f.width||py<0||py>=f.height)continue;const dx=f.width/shape.width,dy=f.height/shape.height,gx=px/dx,gy=py/dy;
   // Complete numerical neighborhood required. Missing streamed tiles retain
   // the known parent rather than fabricating a fine surface.
   let present=true;for(let j=-1;j<=2;j++)for(let i=-1;i<=2;i++)if(read(Math.floor(gx)+i,Math.floor(gy)+j)===undefined)present=false;if(!present)continue;
   const fine=reconstructSurface((i,j)=>read(i,j)!,gx,gy,dx,dy),edge=Math.min(px/dx,py/dy,(f.width-px)/dx,(f.height-py)/dy)/2,t=Math.max(0,Math.min(1,edge)),mix=t*t*(3-2*t);for(const k of ["height","waterHeight","gx","gy","rough"] as const)value[k]+=(fine[k]-value[k])*mix;value.spacing=fine.spacing;if(mix>.5){value.coastLow=fine.coastLow;value.coastHigh=fine.coastHigh;}
  }return value;
 };
}

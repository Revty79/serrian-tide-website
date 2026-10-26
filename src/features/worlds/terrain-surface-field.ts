import type {TerrainSurfaceProfile} from "./terrain-surface-profile";
import type {TerrainGeometry} from "./terrain";
import type {TerrainDetailScene} from "./terrain-detail-renderer";
import {frameGeometry,lodGeometry} from "./terrain-refinement";

export type SurfaceField={height:number;waterHeight:number;gx:number;gy:number;rough:number;spacing:number;coastLow?:number;coastHigh?:number};
type SurfaceCell={coeff:number[];water:number[];min:number;max:number;curvature:number[];lows:number[];highs:number[]};
const coefficients=(a:number,b:number,c:number,d:number)=>[b,.5*(c-a),a-2.5*b+2*c-.5*d,.5*(3*(b-c)+d-a)];
const interpolate=(v:number[],x:number,y:number)=>(v[0]+(v[1]-v[0])*x)*(1-y)+(v[2]+(v[3]-v[2])*x)*y;
export const surfaceFieldWork=():SurfaceField=>({height:0,waterHeight:0,gx:0,gy:0,rough:0,spacing:0,coastLow:Infinity,coastHigh:-Infinity});
function surfaceCell(read:(x:number,y:number)=>number,ix:number,iy:number):SurfaceCell{
 const block:number[][]=[],rows:number[][]=[],coeff:number[]=[];let min=Infinity,max=-Infinity;
 for(let j=-1;j<=2;j++){const row=[-1,0,1,2].map(i=>read(ix+i,iy+j));block.push(row);rows.push(coefficients(row[0],row[1],row[2],row[3]));for(const z of row){min=Math.min(min,z);max=Math.max(max,z);}}
 for(let i=0;i<4;i++){const column=coefficients(rows[0][i],rows[1][i],rows[2][i],rows[3][i]);for(let j=0;j<4;j++)coeff[j*4+i]=column[j];}
 const lows:number[]=[],highs:number[]=[],curvature:number[]=[];
 for(let j=1;j<=2;j++)for(let i=1;i<=2;i++){curvature.push(Math.abs(block[j][i-1]-2*block[j][i]+block[j][i+1])+Math.abs(block[j-1][i]-2*block[j][i]+block[j+1][i]));let low=Infinity,high=-Infinity;for(let y=j-1;y<=j+1;y++)for(let x=i-1;x<=i+1;x++){low=Math.min(low,block[y][x]);high=Math.max(high,block[y][x]);}lows.push(low);highs.push(high);}
 return {coeff,water:[block[1][1],block[1][2],block[2][1],block[2][2]],min,max,curvature,lows,highs};
}
function evaluateCell(cell:SurfaceCell,x:number,y:number,dx:number,dy:number,out:SurfaceField=surfaceFieldWork()):SurfaceField{
 const c=cell.coeff,a=((c[3]*x+c[2])*x+c[1])*x+c[0],b=((c[7]*x+c[6])*x+c[5])*x+c[4],d=((c[11]*x+c[10])*x+c[9])*x+c[8],e=((c[15]*x+c[14])*x+c[13])*x+c[12];
 const ax=(3*c[3]*x+2*c[2])*x+c[1],bx=(3*c[7]*x+2*c[6])*x+c[5],dxv=(3*c[11]*x+2*c[10])*x+c[9],ex=(3*c[15]*x+2*c[14])*x+c[13];
 out.height=Math.max(cell.min,Math.min(cell.max,((e*y+d)*y+b)*y+a));out.waterHeight=interpolate(cell.water,x,y);out.gx=(((ex*y+dxv)*y+bx)*y+ax)/dx;out.gy=((3*e*y+2*d)*y+b)/dy;out.rough=interpolate(cell.curvature,x,y)/Math.max(dx,dy);out.spacing=Math.max(dx,dy);out.coastLow=interpolate(cell.lows,x,y);out.coastHigh=interpolate(cell.highs,x,y);return out;
}
/** Smooth presentation reconstruction only. No sample is created, edited or saved. */
export function reconstructSurface(read:(x:number,y:number)=>number,x:number,y:number,dx:number,dy:number):SurfaceField{
 const ix=Math.floor(x),iy=Math.floor(y);return evaluateCell(surfaceCell(read,ix,iy),x-ix,y-iy,dx,dy);
}
/** Each painter synchronization creates a fresh sampler. Reuse its immutable
 * numerical neighborhoods during artwork generation; never retain across edits. */
export function cachedSurfaceReconstructor(read:(x:number,y:number)=>number|undefined,dx:number,dy:number,limit=4096,keyStride?:number){
 const cells=new Map<string|number,SurfaceCell>();
 return (x:number,y:number,profile?:TerrainSurfaceProfile,out?:SurfaceField):SurfaceField|undefined=>{const timed=profile?.sampling,start=timed?performance.now():0,ix=Math.floor(x),iy=Math.floor(y),key=keyStride===undefined?ix+"/"+iy:iy*keyStride+ix;let cell=cells.get(key);if(profile?.enabled){if(cell)profile.hits++;else profile.misses++;}if(!cell){let present=true;cell=surfaceCell((i,j)=>{const value=read(i,j);if(value===undefined)present=false;return value??0;},ix,iy);if(timed)profile!.record("numerical-read",performance.now()-start);if(!present)return;cells.set(key,cell);if(cells.size>limit)cells.delete(cells.keys().next().value!);}const begin=timed?performance.now():0,result=evaluateCell(cell,x-ix,y-iy,dx,dy,out);if(timed)profile!.record("neighborhood",performance.now()-begin);return result;};
}
export type SurfaceScene=Omit<TerrainDetailScene,"cache">&{cache:{peek:(id:string,revision:number,lod:number,key:number)=>{samples:Int16Array}|undefined}};
export function terrainSurfaceSampler(root:Int16Array,world:TerrainGeometry,scene?:SurfaceScene){
 const rootRead=(x:number,y:number)=>root[Math.max(0,Math.min(world.height-1,y))*world.width+(world.wrap?((x%world.width)+world.width)%world.width:Math.max(0,Math.min(world.width-1,x)))];
 const cellLimit=Math.max(1,Math.floor(8192/((scene?.plans.length??0)+1))),rootSample=cachedSurfaceReconstructor(rootRead,world.displayWidth/world.width,world.displayHeight/world.height,cellLimit,world.width+2);
 const plans=[...(scene?.plans??[])].sort((a,b)=>a.meta.level-b.meta.level).map(plan=>{const active=[scene?.preview,scene?.active].find(a=>a?.meta.id===plan.meta.id),shape=active?.shape??lodGeometry(frameGeometry(plan.meta,world),plan.lod),cols=shape.width/32;
  const read=(x:number,y:number)=>{x=Math.max(0,Math.min(shape.width-1,x));y=Math.max(0,Math.min(shape.height-1,y));return active?active.grid[y*shape.width+x]:scene?.cache.peek(plan.meta.id,plan.meta.revision,plan.lod,Math.floor(y/32)*cols+Math.floor(x/32))?.samples[y%32*32+x%32];};return {plan,shape,sample:cachedSurfaceReconstructor(read,plan.meta.frame.width/shape.width,plan.meta.frame.height/shape.height,cellLimit,shape.width+2),work:surfaceFieldWork()};
 });
 return (east:number,south:number,profile?:TerrainSurfaceProfile,out:SurfaceField=surfaceFieldWork()):SurfaceField=>{
  const x=world.wrap?((east%world.displayWidth)+world.displayWidth)%world.displayWidth:Math.max(0,Math.min(world.displayWidth,east)),y=Math.max(0,Math.min(world.displayHeight,south));
  let base:SurfaceField|undefined,edges:{fine:SurfaceField;mix:number}[]|undefined;
  // A complete interior of finer accepted coverage replaces its parent exactly.
  // Only coverage-edge blends need both fields; avoid reconstructing hidden parents.
  for(let index=plans.length-1;index>=0;index--){const {plan,shape,sample,work}=plans[index],f=plan.meta.frame,px=world.wrap?((x-f.x)%world.displayWidth+world.displayWidth)%world.displayWidth:x-f.x,py=y-f.y;if(px<0||px>=f.width||py<0||py>=f.height)continue;
   const dx=f.width/shape.width,dy=f.height/shape.height,fine=sample(px/dx,py/dy,profile,work);if(!fine)continue;const edge=Math.min(px/dx,py/dy,(f.width-px)/dx,(f.height-py)/dy)/2,t=Math.max(0,Math.min(1,edge)),mix=t*t*(3-2*t);
   if(mix===1){base=fine;break;}(edges??=[]).push({fine,mix});
  }
  if(base)Object.assign(out,base);else rootSample(x/world.displayWidth*world.width,y/world.displayHeight*world.height,profile,out);
  if(edges)for(let i=edges.length-1;i>=0;i--){const {fine,mix}=edges[i];out.height+=(fine.height-out.height)*mix;out.waterHeight+=(fine.waterHeight-out.waterHeight)*mix;out.gx+=(fine.gx-out.gx)*mix;out.gy+=(fine.gy-out.gy)*mix;out.rough+=(fine.rough-out.rough)*mix;out.spacing=fine.spacing;if(mix>.5){out.coastLow=fine.coastLow;out.coastHigh=fine.coastHigh;}}
  return out;
 };
}

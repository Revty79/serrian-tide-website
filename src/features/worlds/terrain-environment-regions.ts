import type {EnvironmentRegion} from "./terrain-environment";
import type {HydroGeometry} from "./terrain-hydrology";
import {materialCoverage} from "./terrain-materials";
import {unwrapWaterRing,waterDx} from "./terrain-water-geometry";
/** Immutable spatial bins and pre-unwrapped paths. Rendering never allocates
 * polygon coordinates or scans unrelated regions for each artwork pixel. */
export function environmentRegionIndex(regions:EnvironmentRegion[],world:HydroGeometry){
 const entries=regions.map(r=>{const points=unwrapWaterRing(r.points,world),anchor=points[0].x,padding=r.shape==="brush"?r.radiusM:0,left=Math.min(...points.map(p=>p.x))-padding,right=Math.max(...points.map(p=>p.x))+padding,top=Math.min(...points.map(p=>p.y))-padding,bottom=Math.max(...points.map(p=>p.y))+padding;
  const wideBrush=r.shape==="brush"&&world.wrap&&right-left>world.width*.5;const coverage=(x:number,y:number)=>{const qx=anchor+waterDx(anchor,x,world);if((!wideBrush&&(qx<left||qx>right))||y<top||y>bottom)return 0;if(r.shape==="brush")return materialCoverage({id:r.id,material:"automatic",radiusM:r.radiusM,strength:r.strength,points:r.points},x,y,world.wrap?world.width:null);let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j],cross=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(qx-a.x);if(Math.abs(cross)<=1e-7*Math.max(1,Math.hypot(b.x-a.x,b.y-a.y))&&qx>=Math.min(a.x,b.x)-1e-7&&qx<=Math.max(a.x,b.x)+1e-7&&y>=Math.min(a.y,b.y)-1e-7&&y<=Math.max(a.y,b.y)+1e-7)return r.strength;if((a.y>y)!==(b.y>y)&&qx<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside?r.strength:0;};return {r,coverage,left:wideBrush?-world.width:left,right:wideBrush?world.width*2:right,top,bottom};});
 const bins=new Map<number,typeof entries>(),bx=(x:number)=>Math.max(0,Math.min(31,Math.floor(x/world.width*32))),by=(y:number)=>Math.max(0,Math.min(31,Math.floor(y/world.height*32))),empty:typeof entries=[];
 for(const entry of entries)for(const shift of world.wrap?[-world.width,0,world.width]:[0]){const l=entry.left+shift,r=entry.right+shift;if(r<0||l>world.width)continue;for(let y=by(entry.top);y<=by(entry.bottom);y++)for(let x=bx(l);x<=bx(r);x++){const key=y*32+x,list=bins.get(key)??[];if(!list.includes(entry))list.push(entry);bins.set(key,list);}}
 return (x:number,y:number)=>bins.get(by(y)*32+bx(world.wrap?((x%world.width)+world.width)%world.width:x))??empty;
}

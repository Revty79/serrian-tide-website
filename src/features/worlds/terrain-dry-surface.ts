import type {HydroLayer,HydroGeometry,HydroPoint} from "./terrain-hydrology";
import {unwrapWaterRing,waterDx} from "./terrain-water-geometry";

export const hasExplicitDrySurface=(layer:HydroLayer)=>layer.visible&&layer.opacity>0&&(layer.lakes??[]).some(l=>l.condition==="dry"||l.condition==="standing"&&l.rings.length>1);

/** Presentation authority from deliberate dry basins and standing-lake islands.
 * It never edits heights or calculates ocean connectivity. Compile per snapshot. */
export function explicitDrySurfaceIndex(layer:HydroLayer,world:HydroGeometry){
 if(!hasExplicitDrySurface(layer))return {has:false,at:()=>false};
 type Edge={a:HydroPoint;b:HydroPoint};
 type Entry={rows:Edge[][];kind:"water"|"dry"|"island";level:number;left:number;right:number;top:number;bottom:number;anchor:number};
 const polygons:Entry[]=[];
 function add(raw:HydroPoint[][],kind:Entry["kind"],level:number){
  let anchor:number|undefined,left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  const rings=raw.map(r=>{const ring=unwrapWaterRing(r,world);anchor??=ring[0].x;const shift=world.wrap?Math.round((anchor-ring[0].x)/world.width)*world.width:0;return ring.map(p=>{const x=p.x+shift;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);return {x,y:p.y};});});
  const rows:Edge[][]=Array.from({length:64},()=>[]),row=(y:number)=>Math.max(0,Math.min(63,Math.floor((y-top)/(bottom-top)*64)));
  for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if(a.y===b.y)continue;const edge={a,b};for(let y=row(Math.min(a.y,b.y));y<=row(Math.max(a.y,b.y));y++)rows[y].push(edge);}
  polygons.push({rows,kind,level,left,right,top,bottom,anchor:anchor!});
 }
 for(const lake of layer.lakes??[]){if(lake.condition==="dry")add(lake.rings,"dry",lake.levelM);else if(lake.condition==="standing"){add(lake.rings,"water",lake.levelM);for(const island of lake.rings.slice(1))add([island],"island",lake.levelM);}}
 const bins=new Map<number,Entry[]>(),bx=(x:number)=>Math.max(0,Math.min(31,Math.floor(x/world.width*32))),by=(y:number)=>Math.max(0,Math.min(31,Math.floor(y/world.height*32)));
 for(const p of polygons)for(const offset of world.wrap?[-world.width,0,world.width]:[0]){const left=p.left+offset,right=p.right+offset;if(right<0||left>world.width)continue;for(let y=by(p.top);y<=by(p.bottom);y++)for(let x=bx(left);x<=bx(right);x++){const key=y*32+x,list=bins.get(key)??[];if(!list.includes(p))list.push(p);bins.set(key,list);}}
 return {has:true,at:(x:number,y:number,elevation:number)=>{
  x=world.wrap?((x%world.width)+world.width)%world.width:x;let dry=false;
  for(const p of bins.get(by(y)*32+bx(x))??[]){const qx=p.anchor+waterDx(p.anchor,x,world);if(qx<p.left||qx>p.right||y<p.top||y>p.bottom)continue;let inside=false;
   const row=Math.max(0,Math.min(63,Math.floor((y-p.top)/(p.bottom-p.top)*64)));
   for(const {a,b} of p.rows[row])if((a.y>y)!==(b.y>y)&&qx<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
   if(inside){if(p.kind==="water"&&elevation<=p.level)return false;if(p.kind==="dry"||p.kind==="island"&&elevation>p.level)dry=true;}
  }
  return dry;
 }};
}

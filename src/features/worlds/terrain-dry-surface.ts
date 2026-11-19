import type {HydroLayer,HydroGeometry,HydroPoint} from "./terrain-hydrology";
import {unwrapWaterRing,waterDx} from "./terrain-water-geometry";

export const hasExplicitDrySurface=(layer:HydroLayer)=>layer.visible&&layer.opacity>0&&(layer.lakes??[]).some(l=>l.condition==="dry"||l.condition==="standing"&&l.rings.length>1);
type SurfaceIndex={maximumStandingLevelAt:(x:number,y:number)=>number;standingWaterLevel:(x:number,y:number)=>number|null;has:boolean;at:(x:number,y:number,elevation:number)=>boolean;unresolvedIslandLevel:(x:number,y:number,elevation:number,margin?:number)=>number|null};
const empty:SurfaceIndex={maximumStandingLevelAt:()=>-Infinity,standingWaterLevel:()=>null,has:false,at:()=>false,unresolvedIslandLevel:()=>null};
// Like native water artwork, this cache is scoped to immutable layer snapshots.
const cache=new WeakMap<HydroLayer,{width:number;height:number;wrap:boolean;index:SurfaceIndex}>();

/** Presentation authority from deliberate dry basins and standing-lake islands.
 * It never edits heights or calculates ocean connectivity. Compile per snapshot. */
export function explicitDrySurfaceIndex(layer:HydroLayer,world:HydroGeometry):SurfaceIndex{
 if(!layer.visible||layer.opacity<=0||!(layer.lakes??[]).some(l=>l.condition==="dry"||l.condition==="standing"))return empty;
 const cached=cache.get(layer);if(cached&&cached.width===world.width&&cached.height===world.height&&cached.wrap===world.wrap)return cached.index;
 type Edge={a:HydroPoint;b:HydroPoint};
 type Entry={id:number;rows:Edge[][];edges:Edge[];parent?:Entry;kind:"water"|"dry"|"island";level:number;left:number;right:number;top:number;bottom:number;anchor:number};
 const polygons:Entry[]=[];
 function add(raw:HydroPoint[][],kind:Entry["kind"],level:number,parent?:Entry){
  let anchor:number|undefined,left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  const rings=raw.map(r=>{const ring=unwrapWaterRing(r,world);anchor??=ring[0].x;const shift=world.wrap?Math.round((anchor-ring[0].x)/world.width)*world.width:0;return ring.map(p=>{const x=p.x+shift;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y);return {x,y:p.y};});});
  const rows:Edge[][]=Array.from({length:64},()=>[]),edges:Edge[]=[],row=(y:number)=>Math.max(0,Math.min(63,Math.floor((y-top)/(bottom-top)*64)));
  for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],edge={a,b};if(kind==="island")edges.push(edge);if(a.y===b.y)continue;for(let y=row(Math.min(a.y,b.y));y<=row(Math.max(a.y,b.y));y++)rows[y].push(edge);}
  const entry={id:polygons.length,rows,edges,parent,kind,level,left,right,top,bottom,anchor:anchor!};polygons.push(entry);return entry;
 }
 for(const lake of layer.lakes??[]){if(lake.condition==="dry")add(lake.rings,"dry",lake.levelM);else if(lake.condition==="standing"){const parent=add(lake.rings,"water",lake.levelM);for(const island of lake.rings.slice(1))add([island],"island",lake.levelM,parent);}}
 const bins=new Map<number,Entry[]>(),bx=(x:number)=>Math.max(0,Math.min(31,Math.floor(x/world.width*32))),by=(y:number)=>Math.max(0,Math.min(31,Math.floor(y/world.height*32)));
 for(const p of polygons)for(const offset of world.wrap?[-world.width,0,world.width]:[0]){const left=p.left+offset,right=p.right+offset;if(right<0||left>world.width)continue;for(let y=by(p.top);y<=by(p.bottom);y++)for(let x=bx(left);x<=bx(right);x++){const key=y*32+x,list=bins.get(key)??[];if(!list.includes(p))list.push(p);bins.set(key,list);}}
 const ceilings=new Map<number,number>();for(const [key,entries] of bins)for(const p of entries)if(p.kind==="water")ceilings.set(key,Math.max(ceilings.get(key)??-Infinity,p.level));
 const inside=(p:Entry,x:number,y:number)=>{
  const qx=p.anchor+waterDx(p.anchor,x,world);if(qx<p.left||qx>p.right||y<p.top||y>p.bottom)return false;let result=false;
  const row=Math.max(0,Math.min(63,Math.floor((y-p.top)/(p.bottom-p.top)*64)));
  for(const {a,b} of p.rows[row])if((a.y>y)!==(b.y>y)&&qx<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)result=!result;
  return result;
 };
 const seen=new Uint32Array(polygons.length),maximumIslandLevel=polygons.reduce((n,p)=>p.kind==="island"?Math.max(n,p.level):n,-Infinity);let serial=0;
 const index:SurfaceIndex={has:hasExplicitDrySurface(layer),maximumStandingLevelAt:(x,y)=>{x=world.wrap?((x%world.width)+world.width)%world.width:x;return ceilings.get(by(y)*32+bx(x))??-Infinity;},standingWaterLevel:(x,y)=>{x=world.wrap?((x%world.width)+world.width)%world.width:x;let level:number|null=null;for(const p of bins.get(by(y)*32+bx(x))??[])if(p.kind==="water"&&inside(p,x,y))level=level===null?p.level:Math.max(level,p.level);return level;},at:(x:number,y:number,elevation:number)=>{
  x=world.wrap?((x%world.width)+world.width)%world.width:x;let dry=false;
  for(const p of bins.get(by(y)*32+bx(x))??[]){const qx=p.anchor+waterDx(p.anchor,x,world);if(qx<p.left||qx>p.right||y<p.top||y>p.bottom)continue;let inside=false;
   const row=Math.max(0,Math.min(63,Math.floor((y-p.top)/(p.bottom-p.top)*64)));
   for(const {a,b} of p.rows[row])if((a.y>y)!==(b.y>y)&&qx<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
   if(inside){if(p.kind==="water"&&elevation<=p.level)return false;if(p.kind==="dry"||p.kind==="island"&&elevation>p.level)dry=true;}
  }
  return dry;
 },unresolvedIslandLevel:(x,y,elevation,margin=0)=>{
  if(elevation>maximumIslandLevel)return null;
  x=world.wrap?((x%world.width)+world.width)%world.width:x;const pad=Number.isFinite(margin)?Math.max(0,margin):0;
  const first=Math.floor((x-pad)/world.width*32),last=Math.floor((x+pad)/world.width*32),start=world.wrap?last-first>=31?0:first:Math.max(0,first),end=world.wrap?last-first>=31?31:last:Math.min(31,last);
  serial=(serial+1)>>>0;if(!serial){seen.fill(0);serial=1;}
  for(let row=by(y-pad);row<=by(y+pad);row++)for(let column=start;column<=end;column++)for(const p of bins.get(row*32+((column%32)+32)%32)??[]){
   if(p.kind!=="island"||elevation>p.level||seen[p.id]===serial)continue;seen[p.id]=serial;
   const qx=p.anchor+waterDx(p.anchor,x,world);if(qx<p.left-pad||qx>p.right+pad||y<p.top-pad||y>p.bottom+pad)continue;
   if(inside(p,x,y))return p.level;
   // A small underlay margin prevents the submerged grid colour bleeding
   // through the vector shoreline's antialiasing. It creates no new land.
   if(!pad||!p.parent||!inside(p.parent,x,y))continue;
   for(const {a,b} of p.edges){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((qx-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));if((qx-a.x-t*dx)**2+(y-a.y-t*dy)**2<=pad*pad)return p.level;}
  }
  return null;
 }};
 cache.set(layer,{width:world.width,height:world.height,wrap:world.wrap,index});return index;
}

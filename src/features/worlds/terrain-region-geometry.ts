import {z} from "zod";
import type {TerrainFrame} from "./terrain-refinement";

export type RegionPoint={x:number;y:number};
export type RegionWorld={width:number;height:number;wrap:boolean};
export const REGION_VERTICES=1024,REGION_PARTS=8,REGION_RAW_POINTS=8192;
const pointSchema=z.object({x:z.number().finite().min(0).max(1e9),y:z.number().finite().min(0).max(1e9)}).strict();
export const regionFootprintSchema=z.object({version:z.literal(1),kind:z.literal("polygon"),parts:z.array(z.array(pointSchema).min(3).max(REGION_VERTICES)).min(1).max(REGION_PARTS)}).strict().superRefine((value,ctx)=>{if(value.parts.reduce((n,p)=>n+p.length,0)>REGION_VERTICES)ctx.addIssue({code:"custom",message:`Keep the complete outline within ${REGION_VERTICES} vertices. Increase simplification deliberately or revise a part; no points were discarded.`});});
export type RegionFootprint=z.infer<typeof regionFootprintSchema>;
export type RegionArea={frame:TerrainFrame;footprint?:RegionFootprint};
type Edge={a:RegionPoint;b:RegionPoint;minX:number;minY:number;maxX:number;maxY:number};
type Prepared={parts:RegionPoint[][];edges:Edge[];epsilon:number;world:RegionWorld;area:RegionArea};
const cache=new WeakMap<RegionFootprint,{key:string;value:Prepared}>();
const displayCache=new WeakMap<RegionFootprint,{key:string;parts:RegionPoint[][]}>();
export const regionCanonicalX=(x:number,world:RegionWorld)=>world.wrap?(x%world.width+world.width)%world.width:x;
const deltaX=(a:number,b:number,w:RegionWorld)=>{let dx=b-a;if(w.wrap)dx-=Math.round(dx/w.width)*w.width;return dx;};
const epsilon=(w:RegionWorld)=>Math.max(1e-7,Math.max(w.width,w.height)*Number.EPSILON*32);
const cross=(a:RegionPoint,b:RegionPoint,c:RegionPoint)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const distance2=(a:RegionPoint,b:RegionPoint)=>(a.x-b.x)**2+(a.y-b.y)**2;
function pointSegment2(p:RegionPoint,a:RegionPoint,b:RegionPoint){const length=distance2(a,b),t=length?Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/length)):0;return distance2(p,{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)});}
function edges(points:readonly RegionPoint[],closed=true):Edge[]{return points.slice(0,closed?points.length:-1).map((a,i)=>{const b=points[(i+1)%points.length];return {a,b,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};});}
function orientation(a:RegionPoint,b:RegionPoint,c:RegionPoint,e:number){const value=cross(a,b,c),tolerance=e*Math.max(1,Math.hypot(b.x-a.x,b.y-a.y),Math.hypot(c.x-a.x,c.y-a.y));return value>tolerance?1:value< -tolerance?-1:0;}
function touches(a:Edge,b:Edge,e:number){
 if(a.maxX+e<b.minX||b.maxX+e<a.minX||a.maxY+e<b.minY||b.maxY+e<a.minY)return false;
 const p=orientation(a.a,a.b,b.a,e),q=orientation(a.a,a.b,b.b,e),r=orientation(b.a,b.b,a.a,e),s=orientation(b.a,b.b,a.b,e);
 return p*q<0&&r*s<0||!p&&pointSegment2(b.a,a.a,a.b)<=e*e||!q&&pointSegment2(b.b,a.a,a.b)<=e*e||!r&&pointSegment2(a.a,b.a,b.b)<=e*e||!s&&pointSegment2(a.b,b.a,b.b)<=e*e;
}
function inRing(p:RegionPoint,ring:readonly RegionPoint[],e:number){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if(pointSegment2(p,a,b)<=e*e)return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
function localPoint(p:RegionPoint,area:RegionArea,w:RegionWorld){const dx=p.x-area.frame.x;return {x:w.wrap?(dx%w.width+w.width)%w.width:dx,y:p.y-area.frame.y};}
function localRing(points:readonly RegionPoint[],area:RegionArea,w:RegionWorld){const result:RegionPoint[]=[];for(const [i,p]of points.entries()){const x=i?result[i-1].x+deltaX(points[i-1].x,p.x,w):localPoint(p,area,w).x;result.push({x,y:p.y-area.frame.y});}return result;}
function prepared(area:RegionArea,w:RegionWorld):Prepared{
 const geometry=area.footprint!;const key=[area.frame.x,area.frame.y,area.frame.width,area.frame.height,w.width,w.height,w.wrap].join(":"),old=cache.get(geometry);if(old?.key===key)return old.value;
 const parts=geometry.parts.map(ring=>localRing(ring,area,w)),value={area,world:w,parts,epsilon:epsilon(w),edges:parts.flatMap(part=>edges(part)).sort((a,b)=>a.minY-b.minY)};cache.set(geometry,{key,value});return value;
}
function nearby(p:Prepared,minX:number,minY:number,maxX:number,maxY:number){const result:Edge[]=[];for(const edge of p.edges){if(edge.minY>maxY+p.epsilon)break;if(edge.maxY+p.epsilon>=minY&&edge.maxX+p.epsilon>=minX&&edge.minX<=maxX+p.epsilon)result.push(edge);}return result;}
function inside(p:RegionPoint,g:Prepared){return g.parts.some(part=>inRing(p,part,g.epsilon));}

/** The minimum circular X envelope supports seam-crossing parts without joining them. */
export function regionFootprintFrame(raw:RegionFootprint,world:RegionWorld):TerrainFrame{
 const geometry=regionFootprintSchema.parse(raw),points=geometry.parts.flat();let x=Math.min(...points.map(p=>p.x)),width=Math.max(...points.map(p=>p.x))-x;
 if(world.wrap){const xs=points.map(p=>p.x).sort((a,b)=>a-b);let largest=-1;for(let i=0;i<xs.length;i++){const gap=(i+1<xs.length?xs[i+1]:xs[0]+world.width)-xs[i];if(gap>largest){largest=gap;x=xs[(i+1)%xs.length];}}width=world.width-largest;}
 const y=Math.min(...points.map(p=>p.y)),height=Math.max(...points.map(p=>p.y))-y;return {x,y,width,height};
}
export function validateRegionFootprint(footprint:RegionFootprint,world:RegionWorld,expectedFrame?:TerrainFrame){
 regionFootprintSchema.parse(footprint);const frame=regionFootprintFrame(footprint,world),e=epsilon(world);
 if(frame.width<1||frame.height<1||frame.width>world.width||frame.y+frame.height>world.height)throw Error("An outline needs at least 1 square metre and bounds at least 1 metre wide/high inside this World.");
 if(expectedFrame&&(["x","y","width","height"] as const).some(key=>Math.abs(frame[key]-expectedFrame[key])>e))throw Error("The outline and its derived bounds disagree. Preview the retained outline again.");
 const area={frame,footprint},parts=footprint.parts.map(ring=>localRing(ring,area,world));
 for(const [partIndex,ring]of parts.entries()){
  const original=footprint.parts[partIndex];
  for(const [i,p]of original.entries()){
   if(p.x<0||(world.wrap?p.x>=world.width:p.x>world.width)||p.y<0||p.y>world.height)throw Error("Keep every boundary point within canonical World coordinates.");
   if(ring[i].x< -e||ring[i].x>frame.width+e)throw Error("This outline winds around the World or has an ambiguous seam. Add boundary points along the intended route.");
   if(world.wrap&&Math.abs(Math.abs(p.x-original[(i+1)%original.length].x)-world.width/2)<=e)throw Error("Add another point to make this half-World edge's direction unambiguous.");
   for(let j=0;j<i;j++)if(distance2(ring[i],ring[j])<=e*e)throw Error("Remove duplicate or near-duplicate boundary points. Your outline is retained.");
  }
  if(Math.abs(ring.at(-1)!.x+deltaX(original.at(-1)!.x,original[0].x,world)-ring[0].x)>e)throw Error("Close the boundary without winding around the World; use Rectangle for full-width coverage.");
  const lines=edges(ring),origin=ring[0];let twiceArea=0;for(let i=1;i+1<ring.length;i++)twiceArea+=cross(origin,ring[i],ring[i+1]);if(Math.abs(twiceArea)<2)throw Error("This outline has less than 1 square metre of usable area. Widen or correct it.");
  for(let i=0;i<lines.length;i++){
   const a=lines[i],next=lines[(i+1)%lines.length];if(!orientation(a.a,a.b,next.b,e)&&(a.b.x-a.a.x)*(next.b.x-next.a.x)+(a.b.y-a.a.y)*(next.b.y-next.a.y)<0)throw Error("A boundary edge doubles back on itself. Move or remove the overlapping point.");
   for(let j=i+1;j<lines.length;j++)if(j!==i+1&&!(i===0&&j===lines.length-1)&&touches(a,lines[j],e))throw Error("This outline crosses or touches itself. Move the crossing points before accepting it.");
  }
  for(let earlier=0;earlier<partIndex;earlier++)if(ring.some(p=>inRing(p,parts[earlier],e))||parts[earlier].some(p=>inRing(p,ring,e))||lines.some(a=>edges(parts[earlier]).some(b=>touches(a,b,e))))throw Error("Separate areas must not overlap, touch or nest. Holes are not supported; revise these parts.");
 }
 return frame;
}
export function regionAreaContainsPoint(area:RegionArea,point:RegionPoint,world:RegionWorld){
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||(world.wrap?point.x>=world.width:point.x>world.width)||point.y<0||point.y>world.height)return false;
 const p=localPoint(point,area,world),e=epsilon(world);if(p.x< -e||p.x>area.frame.width+e||p.y< -e||p.y>area.frame.height+e)return false;return !area.footprint||inside(p,prepared(area,world));
}
/** Cached unwrapped paths for Canvas clipping, outlines and parent coverage. */
export function regionDisplayParts(area:RegionArea,worldWidth:number,wrap:boolean){
 if(!area.footprint)return [[{x:area.frame.x,y:area.frame.y},{x:area.frame.x+area.frame.width,y:area.frame.y},{x:area.frame.x+area.frame.width,y:area.frame.y+area.frame.height},{x:area.frame.x,y:area.frame.y+area.frame.height}]];
 const key=[area.frame.x,area.frame.y,worldWidth,wrap].join(":"),old=displayCache.get(area.footprint);if(old?.key===key)return old.parts;
 const parts=area.footprint.parts.map(ring=>localRing(ring,area,{width:worldWidth,height:1e9,wrap}).map(p=>({x:p.x+area.frame.x,y:p.y+area.frame.y})));displayCache.set(area.footprint,{key,parts});return parts;
}
/** Split at every boundary crossing: endpoints alone cannot authorize a concave bay. */
function segmentInside(a:RegionPoint,b:RegionPoint,g:Prepared,radius:number){
 if(!inside(a,g)||!inside(b,g))return false;const cuts=[0,1],dx=b.x-a.x,dy=b.y-a.y,length=distance2(a,b),line={a,b,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)};
 for(const edge of nearby(g,line.minX-radius,line.minY-radius,line.maxX+radius,line.maxY+radius)){
  const sx=edge.b.x-edge.a.x,sy=edge.b.y-edge.a.y,denominator=dx*sy-dy*sx;
  if(touches(line,edge,g.epsilon)){
   if(radius>g.epsilon)return false;
   if(Math.abs(denominator)>g.epsilon*Math.max(1,Math.hypot(dx,dy),Math.hypot(sx,sy))){const t=((edge.a.x-a.x)*sy-(edge.a.y-a.y)*sx)/denominator;if(t>=0&&t<=1)cuts.push(t);}
   else if(length)for(const p of [edge.a,edge.b])cuts.push(Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)));
  }
  if(radius>g.epsilon&&Math.min(pointSegment2(a,edge.a,edge.b),pointSegment2(b,edge.a,edge.b),pointSegment2(edge.a,a,b),pointSegment2(edge.b,a,b))<(radius-g.epsilon)**2)return false;
 }
 cuts.sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){const t=(cuts[i]+cuts[i-1])/2;if(!inside({x:a.x+dx*t,y:a.y+dy*t},g))return false;}return true;
}
export function regionAreaContainsPath(area:RegionArea,points:readonly RegionPoint[],world:RegionWorld,radius=0,closed=false){
 if(!points.length||!Number.isFinite(radius)||radius<0)return false;
 const local=localRing(points,area,world),e=epsilon(world),fullWidth=world.wrap&&area.frame.width===world.width;
 for(const [i,p]of points.entries())if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||(world.wrap?p.x>=world.width:p.x>world.width)||p.y<0||p.y>world.height||!fullWidth&&(local[i].x-radius< -e||local[i].x+radius>area.frame.width+e)||local[i].y-radius< -e||local[i].y+radius>area.frame.height+e)return false;
 if(!area.footprint)return true;const g=prepared(area,world);if(local.length===1)return segmentInside(local[0],local[0],g,radius);for(let i=1;i<local.length;i++)if(!segmentInside(local[i-1],local[i],g,radius))return false;return !closed||segmentInside(local.at(-1)!,local[0],g,radius);
}
export function regionFrameBoundary(frame:TerrainFrame,world:RegionWorld){
 const points:RegionPoint[]=[],n=world.wrap?Math.max(1,Math.ceil(frame.width/(world.width/3))):1;
 for(let i=0;i<n;i++)points.push({x:regionCanonicalX(frame.x+frame.width*i/n,world),y:frame.y});points.push({x:regionCanonicalX(frame.x+frame.width,world),y:frame.y});
 for(let i=n;i>0;i--)points.push({x:regionCanonicalX(frame.x+frame.width*i/n,world),y:frame.y+frame.height});points.push({x:regionCanonicalX(frame.x,world),y:frame.y+frame.height});return points;
}
export function regionAreaContainsFrame(area:RegionArea,frame:TerrainFrame,world:RegionWorld){if(![frame.x,frame.y,frame.width,frame.height].every(Number.isFinite)||frame.width<=0||frame.height<=0||frame.width>world.width)return false;return regionAreaContainsPath(area,regionFrameBoundary(frame,world),world,0,true);}
export function regionAreaOverlaps(area:RegionArea,other:RegionArea,world:RegionWorld){
 if(!area.footprint&&!other.footprint){const dy=area.frame.y<other.frame.y+other.frame.height&&other.frame.y<area.frame.y+area.frame.height;return dy&&(world.wrap?[-world.width,0,world.width]:[0]).some(offset=>area.frame.x<other.frame.x+offset+other.frame.width&&other.frame.x+offset<area.frame.x+area.frame.width);}
 const rings=area.footprint?.parts??[regionFrameBoundary(area.frame,world)],others=other.footprint?.parts??[regionFrameBoundary(other.frame,world)];if(rings.some(r=>r.some(p=>regionAreaContainsPoint(other,p,world)))||others.some(r=>r.some(p=>regionAreaContainsPoint(area,p,world))))return true;
 for(const ring of rings)for(const part of others){const a=localRing(ring,area,world),b=localRing(part,area,world);for(const offset of world.wrap?[-world.width,0,world.width]:[0])if(edges(a).some(x=>edges(b.map(p=>({x:p.x+offset,y:p.y}))).some(y=>touches(x,y,epsilon(world)))))return true;}return false;
}
/** Iterative RDP has a physical maximum error; it never raises tolerance to fit a cap. */
export function simplifyRegionOutline(points:readonly RegionPoint[],tolerance:number,world:RegionWorld){
 if(points.length<3||tolerance<=0)return points.map(p=>({...p}));const area={frame:{x:points[0].x,y:points[0].y,width:world.width,height:world.height}},local=localRing(points,area,world),keep=new Uint8Array(points.length),stack=[[0,points.length-1]];keep[0]=keep[points.length-1]=1;
 while(stack.length){const [first,last]=stack.pop()!;let maximum=tolerance*tolerance,index=-1;for(let i=first+1;i<last;i++){const value=pointSegment2(local[i],local[first],local[last]);if(value>maximum){maximum=value;index=i;}}if(index>=0){keep[index]=1;stack.push([first,index],[index,last]);}}
 return points.filter((_,i)=>keep[i]).map(p=>({...p}));
}

import { geoBounds } from "d3-geo";
import { SPHERICAL_SOURCE_EPSILON,sphericalCopy,sphericalDisplayPoint } from "./geographic-projection";
import { coordinateCount, geometryParts, surfaceBounds, visitCoordinates, type Coordinate, type GeographicBounds, type SourceGeometry, type SpatialReference } from "./geographic";

const same=(a:Coordinate,b:Coordinate)=>a[0]===b[0]&&a[1]===b[1];
function unwrap(points:Coordinate[],sphere:boolean){if(!sphere)return points;const result:Coordinate[]=[];for(const p of points){let x=p[0];const last=result.at(-1)?.[0];if(last!==undefined){while(x-last>180)x-=360;while(x-last< -180)x+=360;}result.push([x,p[1]]);}return result;}
const cross=(a:Coordinate,b:Coordinate,c:Coordinate)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function onSegment(a:Coordinate,b:Coordinate,p:Coordinate){const magnitude=Math.abs((b[0]-a[0])*(p[1]-a[1]))+Math.abs((b[1]-a[1])*(p[0]-a[0]));return Math.abs(cross(a,b,p))<=Number.EPSILON*8*magnitude&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);}
function intersects(a:Coordinate,b:Coordinate,c:Coordinate,d:Coordinate){const ac=cross(a,b,c),ad=cross(a,b,d),ca=cross(c,d,a),cb=cross(c,d,b);return ac*ad<0&&ca*cb<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
function ringsIntersect(a:Coordinate[],b:Coordinate[],self=false,proper=false){
  // Sweep only live segment bounds. Repeatedly scanning all earlier longitude
  // segments makes a long but valid coastline quadratic even without clashes.
  const segments=(r:Coordinate[],group:number)=>r.slice(0,-1).map((p,i)=>({p,q:r[i+1],i,group,min:Math.min(p[0],r[i+1][0]),max:Math.max(p[0],r[i+1][0]),south:Math.min(p[1],r[i+1][1]),north:Math.max(p[1],r[i+1][1])}));
  const events=[...segments(a,0),...(self?[]:segments(b,1))].sort((a,b)=>a.min-b.min);
  let active:typeof events=[];
  let checks=0;
  for(const s of events){active=active.filter(t=>t.max>=s.min);for(const t of active){if(t.north<s.south||t.south>s.north||!self&&s.group===t.group||self&&(Math.abs(s.i-t.i)===1||Math.abs(s.i-t.i)===a.length-2))continue;if(++checks>2_000_000)throw new Error("This geometry needs smaller validated source components before importing.");if(proper){if(cross(s.p,s.q,t.p)*cross(s.p,s.q,t.q)<0&&cross(t.p,t.q,s.p)*cross(t.p,t.q,s.q)<0)return true;
    // Endpoint contacts can describe source-backed lobes. Retraced edges and
    // positive-length collinear overlap are still invalid.
    if(self&&cross(s.p,s.q,t.p)===0&&cross(s.p,s.q,t.q)===0){const axis=s.p[0]===s.q[0]?1:0;if(Math.min(Math.max(s.p[axis],s.q[axis]),Math.max(t.p[axis],t.q[axis]))>Math.max(Math.min(s.p[axis],s.q[axis]),Math.min(t.p[axis],t.q[axis])))return true;}
  }else if(intersects(s.p,s.q,t.p,t.q))return true;}active.push(s);}return false;
}
function polarPole(coordinates:Coordinate[][]){const outer=unwrap(coordinates[0].map(sphericalDisplayPoint),true);return Math.abs(outer[0][0]-outer.at(-1)![0])>180||coordinates[0].some(p=>Math.abs(p[1])>=90-SPHERICAL_SOURCE_EPSILON)?coordinates[0].reduce((sum,p)=>sum+p[1],0)>=0?1:-1:undefined;}
function topologyRings(coordinates:Coordinate[][],sphere:boolean,commonPole?:number){
  if(!sphere)return coordinates;
  const normalized=coordinates.map(r=>r.map(sphericalDisplayPoint));
  const pole=commonPole??polarPole(coordinates),polar=pole!==undefined;
  if(polar&&normalized.flat().some(p=>p[1]*pole!<=0))throw new Error("A supported polar cap must stay in one hemisphere.");
  return normalized.map(r=>{
    const mapped=polar?r.map(([x,y])=>{const radius=Math.tan((90-pole!*y)*Math.PI/360),angle=x*Math.PI/180;return [radius*Math.cos(angle),radius*Math.sin(angle)] as Coordinate;}):unwrap(r,true);
    const result:Coordinate[]=[];for(const p of mapped){const previous=result.at(-1);if(!previous||Math.hypot(p[0]-previous[0],p[1]-previous[1])>(polar?1e-14:SPHERICAL_SOURCE_EPSILON))result.push(p);}
    if(result.length&&Math.hypot(result[0][0]-result.at(-1)![0],result[0][1]-result.at(-1)![1])<(polar?1e-14:SPHERICAL_SOURCE_EPSILON))result[result.length-1]=result[0];
    return result;
  });
}
function inside(point:Coordinate,ring:Coordinate[]){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(onSegment(a,b,point))return false;if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
export function validateSourceGeometry(geometry:SourceGeometry,reference:SpatialReference){
  const count=coordinateCount(geometry);if(count>131_072)throw new Error("One source feature supports at most 131,072 coordinates. Partition a larger dataset between complete source components.");
  if(Buffer.byteLength(JSON.stringify(geometry))+2*count+20*geometryParts(geometry).length>4_000_000)throw new Error("Partition the source between complete components to fit the four-megabyte stored geometry limit.");
  const bounds=surfaceBounds(reference),epsilon=reference.kind==="sphere"?SPHERICAL_SOURCE_EPSILON:0;visitCoordinates(geometry,p=>{if(!p.every(Number.isFinite)||p[0]<bounds[0]-epsilon||p[0]>bounds[2]+epsilon||p[1]<bounds[1]-epsilon||p[1]>bounds[3]+epsilon)throw new Error("Source coordinates must be finite and inside the declared surface domain.");});
  const parts=geometryParts(geometry),commonPole=reference.kind==="sphere"?parts.filter(p=>p.type==="Polygon").map(p=>polarPole(p.coordinates)).find(p=>p!==undefined):undefined;
  for(const part of parts){
    if(part.type==="LineString"&&part.coordinates.every(p=>same(p,part.coordinates[0])))throw new Error("A line needs two distinct coordinates.");
    if(part.type!=="Polygon")continue;
    for(const raw of part.coordinates){if(!same(raw[0],raw.at(-1)!))throw new Error("Close every polygon ring with its original first coordinate.");if(new Set(raw.slice(0,-1).map(p=>p.join(','))).size<3||raw.slice(1).some((p,i)=>same(p,raw[i])))throw new Error("A polygon needs distinct vertices without repeated consecutive coordinates.");}
    const rings=topologyRings(part.coordinates,reference.kind==="sphere",commonPole);
    for(const r of rings){if(r.length<4||!same(r[0],r.at(-1)!))throw new Error("Close every polygon ring with its original first coordinate.");if(Math.abs(r.slice(0,-1).reduce((sum,p,i)=>sum+p[0]*r[i+1][1]-r[i+1][0]*p[1],0))<1e-12||ringsIntersect(r,r,true,true))throw new Error("Polygon rings must have area and must not cross themselves or retrace edges.");}
    for(let i=1;i<rings.length;i++){const hole=rings[i];const shift=reference.kind==="sphere"?360*Math.round((rings[0][0][0]-hole[0][0])/360):0;const aligned=hole.map(p=>[p[0]+shift,p[1]] as Coordinate);if(!inside(aligned[0],rings[0])||ringsIntersect(aligned,rings[0]))throw new Error("Each hole must stay wholly inside its outer polygon.");for(let j=1;j<i;j++)if(ringsIntersect(aligned,rings[j])||inside(aligned[0],rings[j])||inside(rings[j][0],aligned))throw new Error("Polygon holes must be separate and must not overlap.");rings[i]=aligned;}
  }
  const polygons=parts.filter(p=>p.type==="Polygon").map(p=>topologyRings(p.coordinates,reference.kind==="sphere",commonPole));
  for(let i=0;i<polygons.length;i++)for(let j=0;j<i;j++){
    const a=polygons[i],raw=polygons[j],shift=reference.kind==="sphere"?360*Math.round((a[0][0][0]-raw[0][0][0])/360):0,b=raw.map(r=>r.map(p=>[p[0]+shift,p[1]] as Coordinate));
    const range=(r:Coordinate[])=>[Math.min(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[0])),Math.max(...r.map(p=>p[1]))],ab=range(a[0]),bb=range(b[0]);
    if(ab[2]<=bb[0]||bb[2]<=ab[0]||ab[3]<=bb[1]||bb[3]<=ab[1])continue;
    const contains=(p:Coordinate,rings:Coordinate[][])=>inside(p,rings[0])&&!rings.slice(1).some(r=>inside(p,r));
    const signature=(r:Coordinate[])=>r.slice(0,-1).map(p=>p.join(',')).sort().join(';');
    if(signature(a[0])===signature(b[0])||a[0].some(p=>contains(p,b))||b[0].some(p=>contains(p,a)))throw new Error("Multipolygon components must not overlap; preserve disconnected islands as separate components.");
    if(ringsIntersect(a[0],b[0],false,true))throw new Error("Multipolygon component boundaries must not cross.");
  }
}
export function partBounds(part:SourceGeometry,reference:SpatialReference):GeographicBounds[]{
  if(reference.kind==="sphere"){const [[west,south],[east,north]]=geoBounds(sphericalCopy(part));return west>east?[[west,south,180,north],[-180,south,east,north]]:[[west,south,east,north]];}
  const points:Coordinate[]=[];visitCoordinates(part,p=>points.push(p));const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return [[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]];
}
export function geometryBounds(geometry:SourceGeometry,reference:SpatialReference):GeographicBounds {
  if(reference.kind==="sphere"){const [[w,s],[e,n]]=geoBounds(sphericalCopy(geometry));return [w,s,e,n];}
  const boxes=geometryParts(geometry).flatMap(p=>partBounds(p,reference));return [Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))];
}
function distance(point:Coordinate,a:Coordinate,b:Coordinate){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);}
function simplifyLine(points:Coordinate[],tolerance:number){const keep=new Set([0,points.length-1]),stack:[[number,number]]|[number,number][]=[[0,points.length-1]];while(stack.length){const [a,b]=stack.pop()!;let best=tolerance,index=-1;for(let i=a+1;i<b;i++){const d=distance(points[i],points[a],points[b]);if(d>best){best=d;index=i;}}if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}}return points.filter((_,i)=>keep.has(i));}
export function simplifySource(part:SourceGeometry,reference:SpatialReference,lod:"overview"|"regional"|"detail"):SourceGeometry{
  if(lod==="detail"||part.type==="Point")return structuredClone(part);
  const domain=surfaceBounds(reference),tolerance=(domain[2]-domain[0])*(lod==="overview"?.0007:.00007);
  // Crossing geometry stays exact: simplification must not invent a world-spanning edge.
  if(partBounds(part,reference).length>1)return structuredClone(part);
  let result:SourceGeometry=part;
  if(part.type==="LineString")result={type:"LineString",coordinates:simplifyLine(part.coordinates,tolerance)};
  if(part.type==="Polygon")result={type:"Polygon",coordinates:part.coordinates.map(r=>simplifyLine(r,tolerance))};
  try{validateSourceGeometry(result,reference);return result;}catch{return structuredClone(part);}
}

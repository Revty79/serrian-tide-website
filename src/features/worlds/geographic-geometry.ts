import { geoBounds } from "d3-geo";
import { sphericalCopy } from "./geographic-projection";
import { coordinateCount, geometryParts, surfaceBounds, visitCoordinates, type Coordinate, type GeographicBounds, type SourceGeometry, type SpatialReference } from "./geographic";

const same=(a:Coordinate,b:Coordinate)=>a[0]===b[0]&&a[1]===b[1];
function unwrap(points:Coordinate[],sphere:boolean){if(!sphere)return points;const result:Coordinate[]=[];for(const p of points){let x=p[0];const last=result.at(-1)?.[0];if(last!==undefined){while(x-last>180)x-=360;while(x-last< -180)x+=360;}result.push([x,p[1]]);}return result;}
const cross=(a:Coordinate,b:Coordinate,c:Coordinate)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function onSegment(a:Coordinate,b:Coordinate,p:Coordinate){return Math.abs(cross(a,b,p))<1e-10&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);}
function intersects(a:Coordinate,b:Coordinate,c:Coordinate,d:Coordinate){const ac=cross(a,b,c),ad=cross(a,b,d),ca=cross(c,d,a),cb=cross(c,d,b);return ac*ad<0&&ca*cb<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
function ringsIntersect(a:Coordinate[],b:Coordinate[],self=false,proper=false){
  // Sort segment bounds to avoid an unbounded all-pairs scan of coastline vertices.
  const segments=a.slice(0,-1).map((p,i)=>({p,q:a[i+1],i,min:Math.min(p[0],a[i+1][0]),max:Math.max(p[0],a[i+1][0])})).sort((a,b)=>a.min-b.min);
  const other=self?segments:b.slice(0,-1).map((p,i)=>({p,q:b[i+1],i,min:Math.min(p[0],b[i+1][0]),max:Math.max(p[0],b[i+1][0])})).sort((a,b)=>a.min-b.min);
  let checks=0;
  for(const s of segments)for(const t of other){if(t.min>s.max)break;if(t.max<s.min||self&&(s.i>=t.i||Math.abs(s.i-t.i)===1||Math.abs(s.i-t.i)===a.length-2))continue;if(++checks>2_000_000)throw new Error("This geometry needs smaller validated source components before importing.");if(proper?cross(s.p,s.q,t.p)*cross(s.p,s.q,t.q)<0&&cross(t.p,t.q,s.p)*cross(t.p,t.q,s.q)<0:intersects(s.p,s.q,t.p,t.q))return true;}return false;
}
function inside(point:Coordinate,ring:Coordinate[]){let result=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(onSegment(a,b,point))return false;if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
export function validateSourceGeometry(geometry:SourceGeometry,reference:SpatialReference){
  if(coordinateCount(geometry)>32_768)throw new Error("One source feature supports at most 32,768 coordinates. Partition a larger dataset into independently named features.");
  const bounds=surfaceBounds(reference);visitCoordinates(geometry,p=>{if(!p.every(Number.isFinite)||p[0]<bounds[0]||p[0]>bounds[2]||p[1]<bounds[1]||p[1]>bounds[3])throw new Error("Source coordinates must be finite and inside the declared surface domain.");});
  for(const part of geometryParts(geometry)){
    if(part.type==="LineString"&&part.coordinates.every(p=>same(p,part.coordinates[0])))throw new Error("A line needs two distinct coordinates.");
    if(part.type!=="Polygon")continue;
    const rings=part.coordinates.map(r=>unwrap(r,reference.kind==="sphere"));
    for(const r of rings){if(!same(r[0],r.at(-1)!))throw new Error("Close every polygon ring with its original first coordinate; a pole-spanning ring needs a later polar source adapter.");if(new Set(r.slice(0,-1).map(p=>p.join(','))).size<3||r.slice(1).some((p,i)=>same(p,r[i])))throw new Error("A polygon needs distinct vertices without repeated consecutive coordinates.");if(Math.abs(r.slice(0,-1).reduce((sum,p,i)=>sum+p[0]*r[i+1][1]-r[i+1][0]*p[1],0))<1e-12||ringsIntersect(r,r,true))throw new Error("Polygon rings must have area and must not cross themselves.");}
    for(let i=1;i<rings.length;i++){const hole=rings[i];const shift=reference.kind==="sphere"?360*Math.round((rings[0][0][0]-hole[0][0])/360):0;const aligned=hole.map(p=>[p[0]+shift,p[1]] as Coordinate);if(!inside(aligned[0],rings[0])||ringsIntersect(aligned,rings[0]))throw new Error("Each hole must stay wholly inside its outer polygon.");for(let j=1;j<i;j++)if(ringsIntersect(aligned,rings[j])||inside(aligned[0],rings[j])||inside(rings[j][0],aligned))throw new Error("Polygon holes must be separate and must not overlap.");rings[i]=aligned;}
  }
  const polygons=geometryParts(geometry).filter(p=>p.type==="Polygon").map(p=>p.coordinates.map(r=>unwrap(r,reference.kind==="sphere")));
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

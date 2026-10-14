import { geoPath,geoStream,type GeoStream } from "d3-geo";
import { type Coordinate,type GeographicBounds,type SourceGeometry,type SpatialReference } from "./geographic";
import { geographicProjection,sphericalCopy,type ProjectionKind } from "./geographic-projection";

// Presentation only: simplify AFTER winding, antimeridian/polar clipping and
// projection. Tolerance is measured in the 1000 x 600 display, never in source
// degrees or fictional units. No source rings, caches or revisions are edited.
export const DISPLAY_PATH_BUDGET=64_000;
export const DISPLAY_TOLERANCE=.35;
type DisplayLine={points:Coordinate[];closed:boolean};
function distanceSquared(p:Coordinate,a:Coordinate,b:Coordinate){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;}
function simplify(points:Coordinate[],tolerance:number){
  const keep=new Set([0,points.length-1]),stack:[number,number][]=[[0,points.length-1]];
  while(stack.length){const [a,b]=stack.pop()!;let best=tolerance*tolerance,index=-1;for(let i=a+1;i<b;i++){const d=distanceSquared(points[i],points[a],points[b]);if(d>best){best=d;index=i;}}if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}}
  return points.filter((_,i)=>keep.has(i));
}
function displayRing(points:Coordinate[],tolerance:number){
  if(points.length<=3)return points;
  let anchor=1;for(let i=2;i<points.length;i++)if(distanceSquared(points[i],points[0],points[0])>distanceSquared(points[anchor],points[0],points[0]))anchor=i;
  const a=simplify(points.slice(0,anchor+1),tolerance),b=simplify([...points.slice(anchor),points[0]],tolerance),result=[...a.slice(0,-1),...b.slice(0,-1)];
  // A subpixel polygon or hole still needs its own closed display component.
  // Keep a third original vertex rather than deleting the component.
  if(result.length<3){let corner=1;for(let i=2;i<points.length;i++)if(distanceSquared(points[i],points[0],points[anchor])>distanceSquared(points[corner],points[0],points[anchor]))corner=i;return [0,anchor,corner].sort((x,y)=>x-y).map(i=>points[i]);}
  return result;
}
export function boundedSourceDisplay(geometry:SourceGeometry,reference:SpatialReference,bounds:GeographicBounds,kind:ProjectionKind,radius=4){
  const projection=geographicProjection(reference,bounds,kind),source=reference.kind==="sphere"?sphericalCopy(geometry):geometry;
  // Points keep their exact projected location and existing source marker.
  if(source.type==="Point")return {path:geoPath(projection).pointRadius(radius)(source)??"",tolerance:0};
  const lines:DisplayLine[]=[];let current:Coordinate[]|null=null,closed=false;
  const sink:GeoStream={point(x,y){current?.push([x,y]);},lineStart(){current=[];},lineEnd(){if(current?.length)lines.push({points:current,closed});current=null;},polygonStart(){closed=true;},polygonEnd(){closed=false;},sphere(){}};
  geoStream(source,projection.stream(sink));
  const number=(v:number)=>String(Math.round(v*1000)/1000);
  for(let tolerance=DISPLAY_TOLERANCE;tolerance<=1433.6;tolerance*=2){
    let length=0;const paths:string[]=[];
    for(const line of lines){const points=line.closed?displayRing(line.points,tolerance):simplify(line.points,tolerance),path=points.map(([x,y],i)=>`${i?"L":"M"}${number(x)},${number(y)}`).join("")+(line.closed?"Z":"");length+=path.length;paths.push(path);}
    if(length<=DISPLAY_PATH_BUDGET)return {path:paths.join(""),tolerance};
  }
  // Valid stored parts are bounded. An unexpected pathological presentation is
  // reported explicitly; the viewer retains prior pages and offers recovery.
  throw new Error("This source exceeds the bounded display budget. Zoom closer or retry another extent; its original coordinates are retained.");
}

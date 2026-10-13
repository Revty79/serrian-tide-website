import { geoEquirectangular, geoIdentity, geoMercator, geoPath } from "d3-geo";
import { surfaceBounds, wrapLongitude, type Coordinate, type GeographicBounds, type SourceGeometry, type SpatialReference } from "./geographic";

export const GEOGRAPHIC_VIEW_WIDTH=1000,GEOGRAPHIC_VIEW_HEIGHT=600;
export type ProjectionKind="equirectangular"|"mercator"|"planar";
function clockwise(ring:Coordinate[]){let area=0,last=ring[0][0];const points=ring.map((p,i)=>{let x=p[0];if(i){while(x-last>180)x-=360;while(x-last< -180)x+=360;}last=x;return [x,p[1]];});for(let i=0;i<points.length-1;i++)area+=points[i][0]*points[i+1][1]-points[i+1][0]*points[i][1];return area<0;}
export function sphericalCopy(geometry:SourceGeometry):SourceGeometry{
  const result=structuredClone(geometry);
  const polygons=result.type==="Polygon"?[result.coordinates]:result.type==="MultiPolygon"?result.coordinates:[];
  for(const polygon of polygons)polygon.forEach((ring,i)=>{if(clockwise(ring)!==(i===0))ring.reverse();});
  return result;
}
export function geographicProjection(reference:SpatialReference,bounds:GeographicBounds,kind:ProjectionKind){
  const width=GEOGRAPHIC_VIEW_WIDTH,height=GEOGRAPHIC_VIEW_HEIGHT;
  if(reference.kind==="plane"){
    if(kind!=="planar")throw new Error("Choose the planar display for an authored planar surface.");
    const scale=Math.min(width/(bounds[2]-bounds[0]),height/(bounds[3]-bounds[1]));
    return geoIdentity().reflectY(true).scale(scale).translate([width/2-scale*(bounds[0]+bounds[2])/2,height/2+scale*(bounds[1]+bounds[3])/2]).clipExtent([[0,0],[width,height]]);
  }
  if(kind==="planar")throw new Error("Choose a spherical display for longitude/latitude coordinates.");
  const span=bounds[0]>bounds[2]?360-bounds[0]+bounds[2]:bounds[2]-bounds[0],center=wrapLongitude(bounds[0]+span/2);
  if(kind==="equirectangular")return geoEquirectangular().rotate([-center,0]).center([0,(bounds[1]+bounds[3])/2]).scale(Math.min(width/(span*Math.PI/180),height/((bounds[3]-bounds[1])*Math.PI/180))).translate([width/2,height/2]).clipExtent([[0,0],[width,height]]).precision(.5);
  const mercatorY=(latitude:number)=>Math.log(Math.tan(Math.PI/4+Math.max(-85.05112878,Math.min(85.05112878,latitude))*Math.PI/360));
  const south=mercatorY(bounds[1]),north=mercatorY(bounds[3]);if(north-south<1e-10)throw new Error("Mercator cannot display a viewport wholly beyond its polar limit. Use equirectangular.");
  const scale=Math.min(width/(span*Math.PI/180),height/(north-south));
  return geoMercator().rotate([-center,0]).scale(scale).translate([width/2,height/2+scale*(south+north)/2]).clipExtent([[0,0],[width,height]]).precision(.5);
}
export function projectedSourcePath(geometry:SourceGeometry,reference:SpatialReference,bounds=surfaceBounds(reference),kind:ProjectionKind=reference.kind==="plane"?"planar":"equirectangular"){
  return geoPath(geographicProjection(reference,bounds,kind)).pointRadius(4)(reference.kind==="sphere"?sphericalCopy(geometry):geometry)??"";
}

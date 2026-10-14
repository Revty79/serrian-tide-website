import { geoArea, geoEquirectangular, geoIdentity, geoMercator, geoPath } from "d3-geo";
import { surfaceBounds, wrapLongitude, type Coordinate, type GeographicBounds, type SourceGeometry, type SpatialReference } from "./geographic";

export const GEOGRAPHIC_VIEW_WIDTH=1000,GEOGRAPHIC_VIEW_HEIGHT=600;
export type ProjectionKind="equirectangular"|"mercator"|"planar";
export const SPHERICAL_SOURCE_EPSILON=1e-9;
export function sphericalDisplayPoint([x,y]:Coordinate):Coordinate{return [Math.max(-180,Math.min(180,x)),Math.max(-90,Math.min(90,y))];}
export function sphericalCopy(geometry:SourceGeometry):SourceGeometry{
  const result=structuredClone(geometry);
  // Shapefile seam noise is retained in the source, never wrapped to the other
  // side of the planet. Winding uses spherical area, including polar caps.
  const walk=(value:unknown):void=>{if(Array.isArray(value)){if(typeof value[0]==="number"){const [x,y]=sphericalDisplayPoint(value as Coordinate);value[0]=x;value[1]=y;}else value.forEach(walk);}};walk(result.coordinates);
  const polygons=result.type==="Polygon"?[result.coordinates]:result.type==="MultiPolygon"?result.coordinates:[];
  for(const polygon of polygons)polygon.forEach((ring,i)=>{const small=geoArea({type:"Polygon",coordinates:[ring]})<=2*Math.PI;if(small!==(i===0))ring.reverse();});
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

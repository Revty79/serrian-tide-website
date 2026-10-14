import { geographicProjection,type ProjectionKind } from "./geographic-projection";
import type { GeographicBounds,SpatialReference } from "./geographic";
import { rasterPixel,type RasterGrid,type RasterLevel } from "./raster";
import {surfaceBounds,wrapLongitude} from "./geographic";

/** Fit-to-panel projections can show a wider area than the requested extent.
 * Select imagery for that full visible footprint, including aspect-ratio padding. */
export function rasterDisplayBounds(reference:SpatialReference,bounds:GeographicBounds,kind:ProjectionKind):GeographicBounds{
  const projection=geographicProjection(reference,bounds,kind),inverse=projection.invert!.bind(projection),domain=surfaceBounds(reference);
  if(reference.kind==="plane"){const a=inverse([0,600])!,b=inverse([1000,0])!;return [Math.max(domain[0],a[0]),Math.max(domain[1],a[1]),Math.min(domain[2],b[0]),Math.min(domain[3],b[1])];}
  const span=Math.min(360,1000/projection.scale()*180/Math.PI),center=inverse([500,300])![0],south=inverse([500,600])![1],north=inverse([500,0])![1],limit=kind==="mercator"?85.05112878:90;return [span>=360-1e-8?-180:wrapLongitude(center-span/2),Math.max(-limit,south),span>=360-1e-8?180:wrapLongitude(center+span/2),Math.min(limit,north)];
}

/** The same inverse projection as vector paths; no terrain or datum conversion. */
export function rasterScreenIndices(grid:RasterGrid,level:RasterLevel,reference:SpatialReference,bounds:GeographicBounds,kind:ProjectionKind,width=1000,height=600){
  const projection=geographicProjection(reference,bounds,kind),inverse=projection.invert!.bind(projection),columns=new Int32Array(width).fill(-1),rows=new Int32Array(height).fill(-1);
  for(let x=0;x<width;x++){const screenX=(x+.5)/width*1000,p=inverse([screenX,300]),projected=p?projection(p):null;if(p&&projected&&Math.abs(projected[0]-screenX)<1e-5){const cell=rasterPixel(grid,p[0],(grid.bounds[1]+grid.bounds[3])/2);if(cell)columns[x]=Math.floor(cell.column/level.factor);}}
  for(let y=0;y<height;y++){const p=inverse([500,(y+.5)/height*600]);if(p&&p[1]>=grid.bounds[1]&&p[1]<=grid.bounds[3]&&(kind!=="mercator"||Math.abs(p[1])<=85.05112878+1e-8)){const cell=rasterPixel(grid,(grid.bounds[0]+grid.bounds[2])/2,p[1]);if(cell)rows[y]=Math.floor(cell.row/level.factor);}}
  return {columns,rows};
}

import {elevationColor} from "./raster";
import {physicalReliefShade} from "./terrain-relief";
import {cartographicColor} from "./terrain-cartography";
import {DEFAULT_MAP_APPEARANCE,type MapAppearance} from "./terrain-appearance";
import {engravingPalette,engravingStyle} from "./terrain-engraving";
import {surfacePixel,surfacePixelWork} from "./terrain-surface-art";
import type {SurfaceField} from "./terrain-surface-field";
import type {TerrainMaterials} from "./terrain-materials";
import {terrainStyle,styleColor,type TerrainStyle} from "./terrain-style";

/** Opaque ground under an explicit dry surface. Actual negative height and
 * gradients remain untouched; only the global sea-colour assumption is replaced. */
export function drySurfaceArtist(style:string,sea:number,relief:number,materials:TerrainMaterials,period:number|null,art?:TerrainStyle,appearance?:MapAppearance){
 const activeStyle=appearance?.style??style;
 const spec=appearance??{...DEFAULT_MAP_APPEARANCE,style:style as MapAppearance["style"]},work=surfacePixelWork(),styleSpec=terrainStyle(art),engraving=engravingPalette(engravingStyle(spec.engraving));
 return (field:SurfaceField,x:number,y:number,footprint:number,out:number[])=>{
  let rgb:readonly number[];
  if(activeStyle==="realistic-terrain")rgb=surfacePixel(field,x,y,footprint,sea,relief,materials,materials.strokes,period,undefined,undefined,work,art,true);
  else if(activeStyle==="engraved-fantasy")rgb=[1,3,5].map(i=>parseInt(engraving.paper.slice(i,i+2),16));
  else{
   rgb=activeStyle==="topographic"||activeStyle==="illustrated-fantasy"?cartographicColor(Math.max(1,field.height-sea),spec):elevationColor(Math.max(1,Math.round(field.height)));
   const shade=physicalReliefShade(field.gx,field.gy,activeStyle==="classic-elevation"?1:relief);rgb=rgb.map(c=>c*shade);if(art)rgb=styleColor([...rgb],false,styleSpec);
  }
  for(let c=0;c<3;c++)out[c]=Math.max(0,Math.min(255,rgb[c]));out[3]=255;
  // Negative land contours use the real elevation, independently of sea depth.
  if((activeStyle==="topographic"||activeStyle==="illustrated-fantasy")&&spec.contours&&spec.intervalM>0){const slope=Math.hypot(field.gx,field.gy),interval=spec.intervalM;if(slope>1e-9){const nearest=Math.round(field.height/interval),distance=Math.abs(field.height-nearest*interval)/slope,major=nearest%5===0,ink=Math.max(0,1-distance/Math.max(1,footprint*(major?.8:.45)));for(let c=0;c<3;c++)out[c]=out[c]*(1-ink*.55)+(c===0?106:c===1?98:78)*ink*.55;}}
  return out;
 };
}

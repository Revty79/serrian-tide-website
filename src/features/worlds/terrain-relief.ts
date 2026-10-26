import type {TerrainGeometry} from "./terrain";
import {mapAppearanceSchema,type MapAppearance} from "./terrain-appearance";
export type TerrainRelief={mode:"classic"|"physical";exaggeration:number;appearance?:MapAppearance};
export const CLASSIC_RELIEF:TerrainRelief={mode:"classic",exaggeration:1};
export const ENHANCED_RELIEF:TerrainRelief={mode:"physical",exaggeration:20};
export function parseTerrainRelief(value:unknown):TerrainRelief|null{
 if(!value||typeof value!=="object")return null;const r=value as TerrainRelief;
 if((r.mode!=="classic"&&r.mode!=="physical")||!Number.isFinite(r.exaggeration)||r.exaggeration<1||r.exaggeration>1000)return null;
 const appearance=r.appearance?mapAppearanceSchema.safeParse(r.appearance):null;if(appearance&&!appearance.success)return null;
 return {mode:r.mode,exaggeration:r.exaggeration,...appearance?.success?{appearance:appearance.data}:{}};
}
/** Metres / metres, with centered interior and one-sided fixed-edge gradients.
 * A wrapped seam has two real neighbors, rather than a duplicated edge sample. */
export function physicalGradient(west:number,east:number,north:number,south:number,x:number,y:number,shape:TerrainGeometry){
 const dx=shape.displayWidth/shape.width,dy=shape.displayHeight/shape.height;
 return {x:(east-west)/(dx*(shape.wrap||x>0&&x<shape.width-1?2:1)),y:(south-north)/(dy*(y>0&&y<shape.height-1?2:1))};
}
export function physicalReliefShade(gradientX:number,gradientY:number,exaggeration:number){
 const x=gradientX*exaggeration,y=gradientY*exaggeration;
 // Same stable illumination direction as Classic. A flat surface stays at 1.
 const dot=(Math.SQRT1_2-.5*x-.5*y)/Math.hypot(x,y,1);
 return Math.max(.6,Math.min(1.25,.35+.65*dot/Math.SQRT1_2));
}

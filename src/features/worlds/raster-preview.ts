import {rasterTilePlan,type RasterGrid,type RasterLevel} from "./raster";
import type {GeographicBounds} from "./geographic";
/** Existing coarsest derived assets only; a thumbnail never falls back to finer tiles. */
export function rasterThumbnailPlan<L extends Pick<RasterLevel,"factor"|"width"|"height">>(grid:Pick<RasterGrid,"bounds"|"width"|"height">,levels:L[],extent:GeographicBounds,style:"shaded"|"tint"|"classification"){
 const level=[...levels].sort((a,b)=>b.factor-a.factor)[0];
 if(!level)throw new Error("No coarse raster preview is available.");
 let plan:ReturnType<typeof rasterTilePlan<L>>;try{plan=rasterTilePlan(grid,[level],extent,style);}catch{throw new Error("This raster has no sufficiently small preview. Open the map to view its source.");}
 if(plan.tiles.length>16)throw new Error("This raster has no sufficiently small preview. Open the map to view its source.");
 return plan;
}

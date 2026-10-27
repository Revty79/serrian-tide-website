import type {TerrainGeometry} from "./terrain";
import type {TerrainViewport} from "./terrain-refinement";
import {ENVIRONMENT_LIMITS} from "./terrain-environment";
export const ENVIRONMENT_TILE_PIXELS=64;
/** Use the original painter's three canonical wrapped copies. Descend visual
 * LOD until all unique visible bitmaps fit; never allocate an unbounded plan. */
export function environmentTilePlan(world:TerrainGeometry,view:TerrainViewport,dpr=1){
 if(!Number.isFinite(view.scale)||view.scale<=0||!Number.isFinite(dpr)||dpr<=0)return null;
 const requested=Math.max(0,Math.min(48,Math.ceil(Math.log2(world.displayWidth*view.scale*dpr/128)))),budget=Math.min(1024,Math.floor(ENVIRONMENT_LIMITS.artBytes/((ENVIRONMENT_TILE_PIXELS+2)**2*4)));
 for(let level=requested;level>=0;level--){const count=2**level,size=world.displayWidth/count,left=Math.max(world.wrap?-count:0,Math.floor(view.left/size)),right=Math.min(world.wrap?2*count-1:count-1,Math.floor(view.right/size)),top=Math.max(0,Math.floor(view.top/size)),bottom=Math.min(Math.ceil(world.displayHeight/size)-1,Math.floor(view.bottom/size));if(![left,right,top,bottom].every(Number.isSafeInteger)||left>right||top>bottom)return null;const unique=Math.min(count,right-left+1)*(bottom-top+1);if(unique<=budget)return {level,size,step:size/ENVIRONMENT_TILE_PIXELS,left,right,top,bottom,unique,generalized:level<requested};}
 return null;
}

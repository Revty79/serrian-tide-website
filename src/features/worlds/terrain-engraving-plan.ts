import type {TerrainGeometry} from "./terrain";
import type {TerrainViewport} from "./terrain-refinement";
import {ENGRAVING_LIMITS} from "./terrain-engraving";
/** A canonical geographic lattice, with a bounded halo and cache at every scale. */
export function engravingTilePlan(world:TerrainGeometry,view:TerrainViewport,dpr=1,intermediate=false){
 if(!Number.isFinite(view.scale)||view.scale<=0||!Number.isFinite(dpr)||dpr<=0)return null;
 const pixels=ENGRAVING_LIMITS.tilePixels,edge=pixels+2*ENGRAVING_LIMITS.halo,budget=Math.min(ENGRAVING_LIMITS.tiles,Math.floor(ENGRAVING_LIMITS.bitmapBytes/(edge*edge*4))),requested=Math.max(0,Math.min(44,Math.ceil(Math.log2(world.displayWidth*view.scale*Math.min(2,dpr)/pixels))));
 // Detailed/Maximum may use intermediate integer lattices rather than dropping
 // a whole octave. Fast/Balanced retain the accepted CPU workload when
 // the next power of two exceeds the bitmap budget.
 for(let octave=requested;octave>=0;octave--)for(const count of intermediate&&octave>=2?[2**octave,3*2**(octave-2)]:[2**octave]){const level=Math.log2(count),size=world.displayWidth/count,left=Math.max(world.wrap?-count:0,Math.floor(view.left/size)),right=Math.min(world.wrap?2*count-1:count-1,Math.floor(view.right/size)),top=Math.max(0,Math.floor(view.top/size)),bottom=Math.min(Math.ceil(world.displayHeight/size)-1,Math.floor(view.bottom/size));if(![left,right,top,bottom].every(Number.isSafeInteger)||left>right||top>bottom)return null;const unique=Math.min(count,right-left+1)*(bottom-top+1);if(unique<=budget)return {level,count,size,step:size/pixels,left,right,top,bottom,unique,generalized:level<requested};}return null;
}

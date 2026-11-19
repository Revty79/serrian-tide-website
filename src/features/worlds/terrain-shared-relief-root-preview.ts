import type {TerrainGeometry} from "./terrain";
import type {SharedReliefPreview} from "./terrain-shared-relief-packet";
/** Use the original World renderer and its wrap/edge convention for a Root
 * proposal. A cropped fake refinement would clamp a wrapped World seam. The
 * optional whole-Root copy is included in native workspace admission. */
export function sharedReliefRootPreview(base:Int16Array,shape:TerrainGeometry,proposal:SharedReliefPreview|undefined,before:boolean){
 if(!proposal||before)return base;
 const slot=proposal.header.windows.findIndex(w=>w.sourceId===null);if(slot<0)return base;
 const w=proposal.header.windows[slot],after=proposal.windows[slot].after;
 if(base.length!==shape.width*shape.height||w.sourceWidth!==shape.width||w.sourceHeight!==shape.height)throw Error("The native Root preview does not match the accepted World grid.");
 if(w.width===shape.width&&w.height===shape.height&&w.x===0&&w.y===0)return after;
 const grid=base.slice();for(let y=0;y<w.height;y++)grid.set(after.subarray(y*w.width,(y+1)*w.width),(w.y+y)*shape.width+w.x);return grid;
}

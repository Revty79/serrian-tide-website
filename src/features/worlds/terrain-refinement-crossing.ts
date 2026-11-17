import type {TerrainGeometry} from "./terrain";
import {frameGeometry,frameInside,framesOverlap,REFINEMENT_DEPTH,validateRefinement,rootFrame,type RefinementMeta,type TerrainFrame} from "./terrain-refinement";

export const CROSSING_REFINEMENT_NOTICE="This preview starts from the saved Whole World base, including its coarse land and water. It does not combine existing finer surfaces. The new area takes precedence inside its bounds; the existing sources and their history remain saved underneath. Inspect the complete preview before accepting. Accept permanently adds coverage; Undo/Redo applies to later sculpting.";
export const isCrossingRefinement=(meta:Pick<RefinementMeta,"parentId"|"level">)=>meta.parentId===null&&meta.level>1;

/** Root inheritance remains explicit and pinned. Level controls precedence;
 * it does not replace the existing numerical parent or sampling convention. */
export function crossingRefinementLevel(frame:TerrainFrame,width:number,height:number,world:TerrainGeometry,index:RefinementMeta[],existing?:RefinementMeta){
 validateRefinement(frame,width,height,world,rootFrame(world),world);
 const overlaps=index.filter(r=>r.id!==existing?.id&&framesOverlap(r.frame,frame,world.displayWidth,world.wrap));
 if(!existing&&!overlaps.length)throw Error("These bounds do not cross existing coverage. Use the ordinary refinement control here.");
 const level=existing?.level??Math.max(0,...overlaps.map(r=>r.level))+1;
 if(level>REFINEMENT_DEPTH)throw Error("This terrain has reached the supported nesting depth of eight.");
 for(const source of overlaps){
  // A retained finer child inside the old area stays above its parent during
  // an extension. It does not become a new inheritance source.
  if(existing&&source.level>level&&frameInside(source.frame,existing.frame,world.displayWidth,world.wrap))continue;
  if(source.level>=level)throw Error("The proposed coverage overlaps another area at the same or a finer level. Keep the accepted areas and choose different bounds.");
  const shape=frameGeometry(source,world);
  if(frame.width/width>shape.displayWidth/shape.width/2||frame.height/height>shape.displayHeight/shape.height/2)
   throw Error("Crossing coverage needs at least twice the numerical detail of every area it overlaps, on both axes.");
 }
 return level;
}

/** All higher-priority surfaces protect the accepted terrain underneath,
 * including a Root-backed surface crossing an unrelated parent's boundary. */
export function refinementOccluders(index:RefinementMeta[],id:string|null){
 const level=id?index.find(r=>r.id===id)?.level:0;
 if(level===undefined)return []; // The client index may still be loading.
 return index.filter(r=>r.id!==id&&r.level>level);
}

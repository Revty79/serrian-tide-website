import {z} from "zod";
import type {TerrainGeometry} from "./terrain";
import {frameInside,initializeRefinementAsync,normalizeTerrainX,REFINEMENT_COLLAR,refinementGridSize,validateRefinement,type RefinementMeta,type TerrainFrame} from "./terrain-refinement";

const tileOffset=z.number().int().min(0).max(4096).refine(n=>n%32===0,"Move the retained grid by complete 32-sample tiles.");
const fields={gridWidth:refinementGridSize,gridHeight:refinementGridSize,columnsToWest:tileOffset,rowsToNorth:tileOffset,advancedConfirmed:z.literal(true).optional()};
const confirmed=(v:{gridWidth:number;gridHeight:number;advancedConfirmed?:true})=>v.gridWidth<=2048&&v.gridHeight<=2048||v.advancedConfirmed===true;
const dimensions=z.object(fields).strict().refine(confirmed,"Confirm the advanced terrain requirements before extending to a 4096-axis grid.");
export const refinementExpansionSchema=z.object({action:z.literal("expand"),requestId:z.uuid(),mapId:z.uuid(),refinementId:z.uuid(),revision:z.number().int().positive(),parentRevision:z.number().int().positive(),sourceState:z.string().max(8192).optional(),previewHash:z.string().regex(/^[a-f0-9]{64}$/),...fields}).strict().refine(confirmed,"Confirm the advanced terrain requirements before extending to a 4096-axis grid.");
export type RefinementExpansion=z.infer<typeof refinementExpansionSchema>;
export type RefinementExpansionDimensions=z.infer<typeof dimensions>;

function retainedDimensions(current:RefinementMeta,raw:RefinementExpansionDimensions){
 const c=dimensions.parse(raw);
 if(c.gridWidth<current.gridWidth||c.gridHeight<current.gridHeight||c.gridWidth===current.gridWidth&&c.gridHeight===current.gridHeight)throw Error("Choose a larger supported grid without reducing either existing axis.");
 if(c.columnsToWest+current.gridWidth>c.gridWidth||c.rowsToNorth+current.gridHeight>c.gridHeight)throw Error("Keep the complete accepted grid inside the extended coverage.");
 return c;
}

/** Coverage grows around the accepted grid, retaining its spacing and sample positions. */
export function refinementExpansionFrame(current:RefinementMeta,raw:RefinementExpansionDimensions,parent:TerrainGeometry,parentFrame:TerrainFrame,world:TerrainGeometry):TerrainFrame{
 const c=retainedDimensions(current,raw);
 const dx=current.frame.width/current.gridWidth,dy=current.frame.height/current.gridHeight,x=current.frame.x-c.columnsToWest*dx;
 const frame={x:world.wrap&&(x<0||x>=world.displayWidth)?normalizeTerrainX(x,world.displayWidth):x,y:current.frame.y-c.rowsToNorth*dy,width:c.gridWidth*dx,height:c.gridHeight*dy};
 if(frame.y<0||frame.y+frame.height>world.displayHeight||!world.wrap&&(frame.x<0||frame.x+frame.width>world.displayWidth))throw Error("Keep the extended coverage inside the fixed World edges.");
 validateRefinement(frame,c.gridWidth,c.gridHeight,parent,parentFrame,world);
 if(!frameInside(current.frame,frame,world.displayWidth,world.wrap))throw Error("The extended coverage must retain the complete accepted area.");
 return frame;
}

/** Uses the existing parent interpolation; accepted fine samples are copied exactly. */
export async function initializeExpandedRefinement(oldGrid:Int16Array,current:RefinementMeta,parentGrid:Int16Array,parent:TerrainGeometry,parentFrame:TerrainFrame,world:TerrainGeometry,c:RefinementExpansionDimensions,progress?:(v:number)=>void,signal?:AbortSignal){
 if(oldGrid.length!==current.gridWidth*current.gridHeight||parentGrid.length!==parent.width*parent.height)throw Error("The complete accepted source and parent grids are required.");
 const frame=refinementExpansionFrame(current,c,parent,parentFrame,world);
 const grid=await initializeRefinementAsync(parentGrid,parent,parentFrame,frame,c.gridWidth,c.gridHeight,world,v=>progress?.(v*.9),signal);
 for(let row=0;row<current.gridHeight;row++){
  signal?.throwIfAborted();
  grid.set(oldGrid.subarray(row*current.gridWidth,(row+1)*current.gridWidth),(row+c.rowsToNorth)*c.gridWidth+c.columnsToWest);
 }
 progress?.(1);return {grid,frame};
}

/** Keeps every accepted manual-protection bit and locks the new inherited collar. */
export function expandedRefinementProtection(previous:Uint8Array,current:RefinementMeta,c:RefinementExpansionDimensions){
 if(previous.length!==current.gridWidth*current.gridHeight)throw Error("The complete accepted protection grid is required.");
 retainedDimensions(current,c);
 const result=new Uint8Array(c.gridWidth*c.gridHeight);
 for(let row=0;row<current.gridHeight;row++)result.set(previous.subarray(row*current.gridWidth,(row+1)*current.gridWidth),(row+c.rowsToNorth)*c.gridWidth+c.columnsToWest);
 for(let y=0;y<c.gridHeight;y++)for(let x=0;x<REFINEMENT_COLLAR;x++){result[y*c.gridWidth+x]=1;result[(y+1)*c.gridWidth-1-x]=1;}
 for(let y=0;y<REFINEMENT_COLLAR;y++){result.fill(1,y*c.gridWidth,(y+1)*c.gridWidth);result.fill(1,(c.gridHeight-1-y)*c.gridWidth,(c.gridHeight-y)*c.gridWidth);}
 return result;
}

/** Restore an older retained area while preserving subsequently added coverage. */
export function restoreRetainedRefinement(currentGrid:Int16Array,current:RefinementMeta,oldGrid:Int16Array,old:RefinementMeta,world:TerrainGeometry){
 if(currentGrid.length!==current.gridWidth*current.gridHeight||oldGrid.length!==old.gridWidth*old.gridHeight)throw Error("Both complete accepted grids are required to restore retained coverage.");
 const dx=current.frame.width/current.gridWidth,dy=current.frame.height/current.gridHeight;
 if(Math.abs(old.frame.width/old.gridWidth-dx)>dx*1e-10||Math.abs(old.frame.height/old.gridHeight-dy)>dy*1e-10)throw Error("The retained revision has incompatible numerical spacing.");
 const rawX=(world.wrap?normalizeTerrainX(old.frame.x-current.frame.x,world.displayWidth):old.frame.x-current.frame.x)/dx,rawY=(old.frame.y-current.frame.y)/dy,x=Math.round(rawX),y=Math.round(rawY);
 if(Math.abs(rawX-x)>1e-6||Math.abs(rawY-y)>1e-6||x<0||y<0||x+old.gridWidth>current.gridWidth||y+old.gridHeight>current.gridHeight)throw Error("The complete older coverage must remain aligned inside the current detail.");
 if(x===0&&y===0&&old.gridWidth===current.gridWidth&&old.gridHeight===current.gridHeight)return oldGrid;
 const grid=currentGrid.slice();
 for(let row=0;row<old.gridHeight;row++)grid.set(oldGrid.subarray(row*old.gridWidth,(row+1)*old.gridWidth),(row+y)*current.gridWidth+x);
 return grid;
}

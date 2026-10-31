import {z} from "zod";
import {frameContains,frameInside,framesOverlap,type TerrainFrame} from "./terrain-refinement";
import type {TerrainGeometry} from "./terrain";
import {regionFootprintSchema,regionAreaContainsPoint,regionAreaContainsFrame,regionAreaOverlaps,type RegionFootprint,type RegionArea} from "./terrain-region-geometry";

/** Map coverage is a view in existing World metres, never a numerical surface. */
export const regionFrameSchema=z.object({
  x:z.number().finite().min(0).max(1e9),y:z.number().finite().min(0).max(1e9),
  width:z.number().finite().min(1).max(1e9),height:z.number().finite().min(1).max(1e9),
}).strict();
/** Recovery retains invalid editable bounds for correction; acceptance stays strict. */
export const regionDraftSchema=z.object({name:z.string().max(160),frame:z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().finite(),height:z.number().finite()}).strict()}).strict();
export const regionCreateSchema=z.object({
  action:z.literal("create-region"),requestId:z.uuid(),parentMapId:z.uuid(),terrainId:z.uuid(),
  parentRevision:z.number().int().positive(),sourceRevision:z.number().int().positive(),sourceState:z.string().min(2).max(8192),
  geographyState:z.string().min(2).max(8192).optional(),name:z.string().trim().min(1).max(160),frame:regionFrameSchema,footprint:regionFootprintSchema.optional(),
}).strict();
export type RegionCreate=z.infer<typeof regionCreateSchema>;
export type TerrainRegion={
  version:1;revision:number;mapId:string;parentMapId:string;parentName:string;terrainId:string;
  frame:TerrainFrame;footprint?:RegionFootprint;initialSourceRevision:number;initialSourceState:string;initialParentRevision:number;
  sourceRevision:number;parentRevision:number;createdAt:string;createdBy:string;
};
type World=Pick<TerrainGeometry,"displayWidth"|"displayHeight"|"wrap">;
export function validateRegionFrame(frame:TerrainFrame,world:World){
  regionFrameSchema.parse(frame);
  if(frame.x>=world.displayWidth||frame.width>world.displayWidth||frame.y+frame.height>world.displayHeight||!world.wrap&&frame.x+frame.width>world.displayWidth)
    throw Error("Keep the requested region inside the fixed World edges. A wrapped region may cross the east/west seam, but cannot exceed one World width. Bounds were not changed.");
}
const area=(value:TerrainFrame|RegionArea):RegionArea=>"frame" in value?value:{frame:value};
const physicalWorld=(w:World)=>({width:w.displayWidth,height:w.displayHeight,wrap:w.wrap});
export const regionContainsPoint=(region:TerrainFrame|RegionArea,point:{x:number;y:number},world:World)=>{const value=area(region);return value.footprint?regionAreaContainsPoint(value,point,physicalWorld(world)):frameContains(value.frame,point,world.displayWidth,world.wrap);};
export const regionContainsFrame=(region:TerrainFrame|RegionArea,detail:TerrainFrame,world:World)=>{const value=area(region);return frameInside(detail,value.frame,world.displayWidth,world.wrap)&&(!value.footprint||regionAreaContainsFrame(value,detail,physicalWorld(world)));};
export const regionOverlaps=(region:TerrainFrame|RegionArea,detail:TerrainFrame,world:World)=>{const value=area(region);return framesOverlap(value.frame,detail,world.displayWidth,world.wrap)&&(!value.footprint||regionAreaOverlaps(value,{frame:detail},physicalWorld(world)));};

/** Bounded revision vector pins every accepted numerical source for retained regional edits. */
export function terrainSourceState(rootRevision:number,details:readonly {id:string;revision:number}[]){
  return `${rootRevision};${[...details].sort((a,b)=>a.id.localeCompare(b.id)).map(s=>`${s.id}:${s.revision}`).join(";")}`;
}
export function advanceTerrainSourceState(state:string|undefined,id:string|null,revision:number){
  return state?.split(";").map((part,index)=>id===null?(index===0?String(revision):part):part.startsWith(id+":")?id+":"+revision:part).join(";");
}

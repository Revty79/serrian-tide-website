import { z } from "zod";
import { interiorShapeSchema, interiorEntitySchema, interiorStateSchema, floorDraftSchema, interiorLinkSchema, validateInterior, duplicateInteriorSource, transformInterior, interiorCenter, type InteriorEntity, type InteriorShape } from "./interior";
import { boundedPoint, rounded } from "./atlas-coordinates";
import type { Point } from "./atlas";

export const dungeonKinds = ["room", "cavern", "corridor", "wall", "opening", "window", "transition", "furnishing", "landmark", "terrain", "trap", "hazard", "annotation"] as const;
export const dungeonLayers = ["flooring", ...dungeonKinds, "labels", "grid"] as const;
export const passageAppearances = ["constructed", "natural", "water", "chasm", "rubble", "cliff", "surface"] as const;
export const dungeonEntitySchema = interiorEntitySchema.extend({kind:z.enum(dungeonKinds),visibility:z.enum(["ordinary","secret","god-only"]),privateNotes:z.string().max(12000)}).strict();
const passageSchema = z.object({version:z.literal(1),id:z.string().uuid(),entityId:z.string().uuid(),archived:z.boolean(),variant:z.literal("passage"),points:z.array(z.object({id:z.string().uuid(),x:z.number().finite(),y:z.number().finite()}).strict()).min(2).max(256),width:z.number().min(4).max(500),appearance:z.enum(passageAppearances)}).strict();
export const dungeonShapeSchema = z.union([interiorShapeSchema,passageSchema]);
const layer = z.object({visible:z.boolean(),locked:z.boolean()}).strict();
export const gridSchema = z.object({kind:z.enum(["none","square","hex"]),visible:z.boolean(),size:z.number().min(12).max(240),offsetX:z.number().min(-2000).max(2000),offsetY:z.number().min(-1200).max(1200),orientation:z.enum(["pointy","flat"]),snap:z.boolean(),opacity:z.number().min(.05).max(.8),scale:z.string().max(160)}).strict();
export const dungeonStateSchema = interiorStateSchema.extend({layers:z.object(Object.fromEntries(dungeonLayers.map(k=>[k,layer])) as Record<typeof dungeonLayers[number],typeof layer>).strict(),grid:gridSchema}).strict();
export const dungeonLevelDraftSchema = floorDraftSchema;
export const dungeonSiteDraftSchema = z.object({name:z.string().trim().min(1).max(160),description:z.string().max(12000),classification:z.string().max(160),parentId:z.string().uuid().nullable()}).strict();
export type DungeonEntity = z.infer<typeof dungeonEntitySchema>;
export type DungeonShape = z.infer<typeof dungeonShapeSchema>;
export type DungeonState = z.infer<typeof dungeonStateSchema>;
export type DungeonGrid = z.infer<typeof gridSchema>;
export type DungeonSite = z.infer<typeof dungeonSiteDraftSchema> & {id:string;revision:number;geographyRevision:number;archived:boolean};
export type DungeonLevel = z.infer<typeof dungeonLevelDraftSchema> & {id:string;siteId:string;revision:number;geographyRevision:number;archived:boolean};
export type PlanShape = InteriorShape | DungeonShape;
export type PlanEntity = InteriorEntity | DungeonEntity;
export const defaultDungeonState = ():DungeonState=>({version:1,flooring:"plain",layers:Object.fromEntries(dungeonLayers.map(k=>[k,{visible:true,locked:false}])) as DungeonState["layers"],grid:{kind:"none",visible:true,size:60,offsetX:0,offsetY:0,orientation:"pointy",snap:false,opacity:.3,scale:""}});
export const geographicDungeon = (kind:string)=>["room","cavern","corridor","transition","landmark","trap","hazard"].includes(kind);
export const planBaseShapes = (shapes:PlanShape[])=>shapes.filter((s):s is InteriorShape=>s.variant!=="passage");
export function planCenter(s:PlanShape,shapes:PlanShape[]):Point {return s.variant==="passage"?{x:s.points.reduce((n,p)=>n+p.x,0)/s.points.length,y:s.points.reduce((n,p)=>n+p.y,0)/s.points.length}:interiorCenter(s,planBaseShapes(shapes));}
export function transformPlan<T extends PlanShape>(s:T,shapes:PlanShape[],dx=0,dy=0,scale=1,rotation=0):T {
 if(s.variant!=="passage")return transformInterior(s,planBaseShapes(shapes),dx,dy,scale,rotation) as T;
 const moved=transformInterior({...s,variant:"wall"},[],dx,dy,scale,rotation);
 return {...s,...("points" in moved?{points:moved.points}:{}),width:rounded(Math.max(4,Math.min(500,s.width*scale)))} as T;
}
export function duplicatePlanSource<T extends PlanShape>(shapes:T[],newId:()=>string):T[] {
 // The shared copier remaps representation, vertex and attached wall identities.
 const normalized:InteriorShape[]=shapes.map(s=>s.variant==="passage"?{...s,variant:"wall" as const}:s) as InteriorShape[];
 return duplicateInteriorSource(normalized,newId).map((s,i)=>{const original=shapes[i];return {...s,...(original.variant==="passage"?{variant:"passage",appearance:original.appearance}:{})};}) as T[];
}
export function validateDungeon(shapes:DungeonShape[],entities:DungeonEntity[],links:z.infer<typeof interiorLinkSchema>[]=[]){
 if(shapes.length>4000||entities.length>4000||new Set(shapes.map(s=>s.id)).size!==shapes.length||new Set(entities.map(e=>e.id)).size!==entities.length)throw new Error("A dungeon map supports 4,000 distinct retained drawings and entities.");
 if(shapes.reduce((n,s)=>n+("points" in s?s.points.length:1),0)>64000)throw new Error("A dungeon map supports up to 64,000 editable points.");
 const byId=new Map(entities.map(e=>[e.id,e]));
 for(const e of entities)if(geographicDungeon(e.kind)?e.geographyId!==e.id:e.geographyId!==null)throw new Error("Meaningful dungeon places retain their geography identity; local objects use a stable lightweight identity.");
 const adapted:InteriorShape[]=shapes.map(s=>s.variant==="passage"?{...s,variant:"wall",width:Math.min(s.width,100)}:s);
 const adaptedEntities:InteriorEntity[]=entities.map(e=>({...e,kind:shapes.find(s=>s.entityId===e.id)?.variant==="passage"?"wall":e.kind==="cavern"?"room":e.kind==="corridor"?"wall":["terrain","trap","hazard","annotation"].includes(e.kind)?(shapes.find(s=>s.entityId===e.id)?.variant==="area"?"room":"landmark"):e.kind,geographyId:null} as InteriorEntity)).map(e=>({...e,geographyId:["room","transition","landmark"].includes(e.kind)?e.id:null}));
 validateInterior(adapted,adaptedEntities,links);
 for(const s of shapes){const e=byId.get(s.entityId);if(!e)throw new Error("Retain the entity for each dungeon drawing.");if(s.variant==="passage"&&!['corridor','terrain'].includes(e.kind))throw new Error("Passage source represents a corridor or environmental feature.");if(s.variant==="area"&&!['room','cavern','terrain'].includes(e.kind))throw new Error("Area source represents a chamber, cavern or surface.");if(s.variant==="object"&&!['transition','furnishing','landmark','trap','hazard','annotation','terrain'].includes(e.kind))throw new Error("Choose an appropriate dungeon feature symbol.");}
}
export function snapDungeonPoint(point:Point,grid:DungeonGrid):Point {
 if(!grid.snap||grid.kind==="none")return boundedPoint(point);
 const x=point.x-grid.offsetX,y=point.y-grid.offsetY,s=grid.size;
 if(grid.kind==="square")return boundedPoint({x:rounded(Math.round(x/s)*s+grid.offsetX),y:rounded(Math.round(y/s)*s+grid.offsetY)});
 let q=grid.orientation==="pointy"?(Math.sqrt(3)/3*x-y/3)/s:2*x/(3*s),r=grid.orientation==="pointy"?2*y/(3*s):(-x/3+Math.sqrt(3)/3*y)/s;
 const cy=-q-r;let a=Math.round(q),b=Math.round(cy),c=Math.round(r);const dx=Math.abs(a-q),dy=Math.abs(b-cy),dz=Math.abs(c-r);if(dx>dy&&dx>dz)a=-b-c;else if(dy>dz)b=-a-c;else c=-a-b;q=a;r=c;
 return boundedPoint({x:rounded((grid.orientation==="pointy"?s*Math.sqrt(3)*(q+r/2):s*1.5*q)+grid.offsetX),y:rounded((grid.orientation==="pointy"?s*1.5*r:s*Math.sqrt(3)*(r+q/2))+grid.offsetY)});
}

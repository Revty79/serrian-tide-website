import {z} from "zod";
import {terrainStyleSchema} from "./terrain-style";
import type {TerrainRelief} from "./terrain-relief";

export const mapAppearanceSchema=z.object({
 version:z.union([z.literal(1),z.literal(2)]),style:z.enum(["classic-elevation","physical-relief","topographic","illustrated-fantasy","realistic-terrain"]),
 relief:z.number().finite().min(1).max(1000),contours:z.boolean(),intervalM:z.number().finite().min(0).max(30000),
 coastline:z.number().finite().min(0).max(2),decoration:z.number().finite().min(0).max(1),
 bathymetry:z.boolean(),contrast:z.number().finite().min(.5).max(1.5),paper:z.enum(["ivory","parchment"]),art:terrainStyleSchema.optional(),
}).strict().refine(v=>v.style!=="realistic-terrain"||v.version===2,{message:"Realistic Terrain requires appearance version 2."});
export type MapAppearance=z.infer<typeof mapAppearanceSchema>;
export const DEFAULT_MAP_APPEARANCE:MapAppearance={version:1,style:"physical-relief",relief:20,contours:true,intervalM:0,coastline:1,decoration:.7,bathymetry:true,contrast:1,paper:"ivory"};
export const mapAppearanceNames={"classic-elevation":"Classic Elevation","physical-relief":"Physical Relief",topographic:"Topographic","illustrated-fantasy":"Illustrated Fantasy","realistic-terrain":"Realistic Terrain"};
export function visualAppearance(value:TerrainRelief|undefined):MapAppearance{return value?.appearance??{...DEFAULT_MAP_APPEARANCE,style:value?.mode==="physical"?"physical-relief":"classic-elevation",relief:value?.exaggeration??1};}
export function appearanceRelief(spec:MapAppearance):TerrainRelief{return {mode:spec.style==="classic-elevation"?"classic":"physical",exaggeration:spec.relief,appearance:spec};}
export const cartographic=(value:TerrainRelief|undefined)=>value?.appearance?.style==="topographic"||value?.appearance?.style==="illustrated-fantasy";
export function niceContour(value:number){const power=10**Math.floor(Math.log10(Math.max(1,value))),n=value/power;return (n<=1?1:n<=2?2:n<=5?5:10)*power;}
/** One interval for the complete viewport, including every refinement. Always metres. */
export function viewContourInterval(spec:MapAppearance,visibleWidthM:number){return spec.intervalM||niceContour(Math.sqrt(Math.max(.001,visibleWidthM/1000))*8);}
export const appearanceSaveSchema=z.object({mapId:z.string().uuid(),revision:z.number().int().min(0),requestId:z.string().uuid(),spec:mapAppearanceSchema}).strict();

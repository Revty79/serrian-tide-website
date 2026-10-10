import { signedArea, validateGeometry } from "./atlas-geometry";
export { signedArea, validateGeometry } from "./atlas-geometry";
import { settlementEntitySchema, settlementShapeSchema, settlementStateSchema, validateSettlement, type SettlementEntity, type SettlementShape, type SettlementState } from "./settlement";
import { z } from "zod";
import type { GenerationProvenance } from "./generation-spec";

import { MAP_WIDTH, MAP_HEIGHT, rounded } from "./atlas-coordinates";
import { defaultPresentation, drawingsSchema, presentationSchema, validateDrawings, type MapDrawing, type MapPresentation } from "./cartography";
export { MAP_WIDTH, MAP_HEIGHT, boundedPoint, rounded } from "./atlas-coordinates";
export const atlasId = z.string().uuid();
const revision = z.number().int().positive();
const name = z.string().trim().min(1, "Give this record a name.").max(160);
export const locationContexts = ["place", "region", "local area", "settlement", "building site", "interior"] as const;
export const geographyDraftSchema = z.object({id: atlasId, revision: revision.nullable(), name, description: z.string().max(12000), kind: z.enum(["continent", "island", "location"]), context: z.enum(locationContexts).optional(), parentId: atlasId.nullable()}).strict();
const coordinate = z.number().finite();
const xy = z.object({x: coordinate, y: coordinate}).strict();
const vertex = xy.extend({id: atlasId});
export const geometrySchema = z.discriminatedUnion("type", [
  z.object({version: z.literal(1), type: z.literal("polygon"), points: z.array(vertex).min(3).max(256)}).strict(),
  z.object({version: z.literal(1), type: z.literal("point"), point: xy}).strict(),
]);
export const featureSchema = z.object({id: atlasId, geographyId: atlasId, geometry: geometrySchema, archived: z.boolean()}).strict();
export const mapDraftSchema = z.object({name, description: z.string().max(12000), scope: z.enum(["world", "continent", "regional", "local"]), features: z.array(featureSchema).max(128), drawings: drawingsSchema.optional(), presentation: presentationSchema.optional(), settlementShapes:z.array(settlementShapeSchema).max(4000).optional(), settlementEntities:z.array(settlementEntitySchema).max(4000).optional(), settlementState:settlementStateSchema.optional(), geographies: z.array(geographyDraftSchema).max(4128)}).strict();
export type Point = z.infer<typeof xy>;
export type Vertex = z.infer<typeof vertex>;
export type Geometry = z.infer<typeof geometrySchema>;
export type AtlasFeature = z.infer<typeof featureSchema>;
export type GeographyDraft = z.infer<typeof geographyDraftSchema>;
export type MapDraft = z.infer<typeof mapDraftSchema>;
export type GeographyRecord = Omit<GeographyDraft, "revision"> & {revision: number; archived: boolean};
export type AtlasMap = {id: string; name: string; description: string; scope: MapDraft["scope"]; mapKind?:"generic"|"settlement"; settlementShapes?:SettlementShape[]; settlementEntities?:SettlementEntity[]; settlementState?:SettlementState; geographyId?: string|null; width: number; height: number; revision: number; archived: boolean; features: AtlasFeature[]; drawings?: MapDrawing[]; presentation?: MapPresentation; generation?: GenerationProvenance|null};
export type AtlasConnection = {id: string; sourceMapId: string; geographyId: string; destinationMapId: string; revision: number};
export type AtlasBundle = {maps: AtlasMap[]; geographies: GeographyRecord[]; connections?: AtlasConnection[]; canEdit: boolean};
export type Viewport = {x: number; y: number; width: number; height: number};
export const fitViewport = (): Viewport => ({x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT});
export function validateMapDraft(draft: MapDraft) {
  if (new Set(draft.features.map(f=>f.id)).size !== draft.features.length || new Set(draft.geographies.map(g=>g.id)).size !== draft.geographies.length) throw new Error("Map and geography identities must not be repeated.");
  if (draft.features.reduce((sum,f)=>sum+(f.geometry.type === "polygon" ? f.geometry.points.length : 1),0) > 8192) throw new Error("A map supports at most 8,192 total points.");
  validateSettlement(draft.settlementShapes??[],draft.settlementEntities??[]);
  draft.features.forEach(f=>validateGeometry(f.geometry));
  validateDrawings(draft.drawings??[]);
}
export function validateParents(records: {id: string; parentId: string|null}[]) {
  const parents = new Map(records.map(g=>[g.id,g.parentId]));
  for (const record of records) {const seen = new Set<string>(); let current: string|null = record.id; while (current) {if (seen.has(current)) throw new Error("Geography cannot contain itself, directly or through its parents."); seen.add(current); if (!parents.has(current)) throw new Error("Choose a parent geography from this World."); current = parents.get(current)!;}}
}
export function draftOf(map: AtlasMap, geographies: GeographyRecord[]): MapDraft {
  const ids = new Set([...map.features.map(f=>f.geographyId),...(map.drawings??[]).flatMap(d=>d.geographyId?[d.geographyId]:[]),...(map.settlementEntities??[]).map(e=>e.geographyId)]);
  return {...(map.mapKind==="settlement"?{settlementShapes:structuredClone(map.settlementShapes??[]),settlementEntities:structuredClone(map.settlementEntities??[]),settlementState:structuredClone(map.settlementState)}:{}),name: map.name, description: map.description, scope: map.scope, features: structuredClone(map.features), drawings: structuredClone(map.drawings??[]), presentation: structuredClone(map.presentation??defaultPresentation()), geographies: geographies.filter(g=>ids.has(g.id)).map(g=>({id:g.id,revision:g.revision,name:g.name,description:g.description,kind:g.kind,context:g.context,parentId:g.parentId}))};
}
export function moveGeometry(geometry: Geometry, dx: number, dy: number): Geometry {
  const points = geometry.type === "polygon" ? geometry.points : [geometry.point];
  const x=rounded(Math.max(-Math.min(...points.map(p=>p.x)),Math.min(dx,MAP_WIDTH-Math.max(...points.map(p=>p.x)))));
  const y=rounded(Math.max(-Math.min(...points.map(p=>p.y)),Math.min(dy,MAP_HEIGHT-Math.max(...points.map(p=>p.y)))));
  return geometry.type === "polygon" ? {...geometry, points: geometry.points.map(p=>({...p,x:rounded(p.x+x),y:rounded(p.y+y)}))} : {...geometry,point:{x:rounded(geometry.point.x+x),y:rounded(geometry.point.y+y)}};
}
export function zoomViewport(view: Viewport, factor: number): Viewport {const width=Math.max(MAP_WIDTH/8,Math.min(MAP_WIDTH*4,view.width/factor)),height=width*MAP_HEIGHT/MAP_WIDTH; return {x:view.x+(view.width-width)/2,y:view.y+(view.height-height)/2,width,height};}
export type EditingHistory = {past: MapDraft[]; present: MapDraft; future: MapDraft[]};
export function commitAction(history: EditingHistory, next: MapDraft): EditingHistory {if(JSON.stringify(next)===JSON.stringify(history.present))return history;return {past:[...history.past,history.present].slice(-50),present:next,future:[]};}
export function undoAction(history: EditingHistory): EditingHistory {const previous=history.past.at(-1);return previous?{past:history.past.slice(0,-1),present:previous,future:[history.present,...history.future]}:history;}
export function redoAction(history: EditingHistory): EditingHistory {const next=history.future[0];return next?{past:[...history.past,history.present],present:next,future:history.future.slice(1)}:history;}
export function acceptSavedHistory(history: EditingHistory, saved: MapDraft): EditingHistory {
  const revisions=new Map(saved.geographies.map(g=>[g.id,g.revision]));
  const retain=(draft:MapDraft):MapDraft=>({...draft,
    drawings:[...(draft.drawings??[]),...(saved.drawings??[]).filter(d=>!draft.drawings?.some(old=>old.id===d.id)).map(d=>({...d,archived:true}))],
    features:[...draft.features,...saved.features.filter(f=>!draft.features.some(old=>old.id===f.id)).map(f=>({...f,archived:true}))],
    ...(saved.settlementShapes?{settlementShapes:[...(draft.settlementShapes??[]),...saved.settlementShapes.filter(s=>!draft.settlementShapes?.some(old=>old.id===s.id)).map(s=>({...s,archived:true}))],settlementEntities:[...(draft.settlementEntities??[]).map(e=>({...e,revision:saved.settlementEntities?.find(n=>n.geographyId===e.geographyId)?.revision??e.revision})),...(saved.settlementEntities??[]).filter(e=>!draft.settlementEntities?.some(n=>n.geographyId===e.geographyId))]}:{}),
    geographies:[...draft.geographies.map(g=>({...g,revision:revisions.get(g.id)??g.revision})),...saved.geographies.filter(g=>!draft.geographies.some(old=>old.id===g.id))],
  });
  return {past:history.past.map(retain),present:saved,future:history.future.map(retain)};
}
export function polygonCenter(points:Point[]):Point {
  const area=signedArea(points);if(Math.abs(area)<1)return points[0];
  const sum=points.reduce((result,p,i)=>{const q=points[(i+1)%points.length],cross=p.x*q.y-q.x*p.y;return {x:result.x+(p.x+q.x)*cross,y:result.y+(p.y+q.y)*cross};},{x:0,y:0});
  return {x:sum.x/(6*area),y:sum.y/(6*area)};
}
// Reading labels may shift with zoom; they never change saved geometry.
export function mapLabels(features: AtlasFeature[], names: Map<string,string>, unitsPerPixel: number) {
  const occupied:{x:number;y:number;width:number;height:number}[]=features.flatMap(f=>f.geometry.type==="point"?[{x:f.geometry.point.x-25*unitsPerPixel,y:f.geometry.point.y-30*unitsPerPixel,width:50*unitsPerPixel,height:60*unitsPerPixel}]:[]),labels=new Map<string,{x:number;y:number;text:string}>();
  for(const f of [...features].sort((a,b)=>Number(a.geometry.type==="point")-Number(b.geometry.type==="point"))) {
    const text=(names.get(f.geographyId)??"Unnamed geography").slice(0,36),width=Math.min(MAP_WIDTH,text.length*7*unitsPerPixel),height=18*unitsPerPixel;
    const center=f.geometry.type==="point"?f.geometry.point:polygonCenter(f.geometry.points);
    let chosen={x:center.x,y:center.y},best=Infinity;
    for(const offset of [0,26,-26,52,-52,78,-78,104,-104]) {
      const x=Math.max(width/2,Math.min(MAP_WIDTH-width/2,center.x)),y=Math.max(height,Math.min(MAP_HEIGHT-height/2,center.y+(offset+(f.geometry.type==="point"?48:0))*unitsPerPixel)),box={x:x-width/2,y:y-height,width,height};
      const overlaps=occupied.filter(b=>box.x<b.x+b.width&&box.x+box.width>b.x&&box.y<b.y+b.height&&box.y+box.height>b.y).length;
      if(overlaps<best){chosen={x,y};best=overlaps;}if(overlaps===0)break;
    }
    occupied.push({x:chosen.x-width/2,y:chosen.y-height,width,height});labels.set(f.id,{...chosen,text:(names.get(f.geographyId)?.length??0)>36?`${text.slice(0,35)}…`:text});
  }return labels;
}

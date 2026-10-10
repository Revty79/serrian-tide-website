import { z } from "zod";

import { MAP_WIDTH, MAP_HEIGHT, rounded } from "./atlas-coordinates";
import { defaultPresentation, drawingsSchema, presentationSchema, validateDrawings, type MapDrawing, type MapPresentation } from "./cartography";
export { MAP_WIDTH, MAP_HEIGHT, boundedPoint, rounded } from "./atlas-coordinates";
export const atlasId = z.string().uuid();
const revision = z.number().int().positive();
const name = z.string().trim().min(1, "Give this record a name.").max(160);
export const geographyDraftSchema = z.object({id: atlasId, revision: revision.nullable(), name, description: z.string().max(12000), kind: z.enum(["continent", "island", "location"]), parentId: atlasId.nullable()}).strict();
const coordinate = z.number().finite();
const xy = z.object({x: coordinate, y: coordinate}).strict();
const vertex = xy.extend({id: atlasId});
export const geometrySchema = z.discriminatedUnion("type", [
  z.object({version: z.literal(1), type: z.literal("polygon"), points: z.array(vertex).min(3).max(256)}).strict(),
  z.object({version: z.literal(1), type: z.literal("point"), point: xy}).strict(),
]);
export const featureSchema = z.object({id: atlasId, geographyId: atlasId, geometry: geometrySchema, archived: z.boolean()}).strict();
export const mapDraftSchema = z.object({name, description: z.string().max(12000), scope: z.enum(["world", "continent", "regional", "local"]), features: z.array(featureSchema).max(128), drawings: drawingsSchema.optional(), presentation: presentationSchema.optional(), geographies: z.array(geographyDraftSchema).max(128)}).strict();
export type Point = z.infer<typeof xy>;
export type Vertex = z.infer<typeof vertex>;
export type Geometry = z.infer<typeof geometrySchema>;
export type AtlasFeature = z.infer<typeof featureSchema>;
export type GeographyDraft = z.infer<typeof geographyDraftSchema>;
export type MapDraft = z.infer<typeof mapDraftSchema>;
export type GeographyRecord = Omit<GeographyDraft, "revision"> & {revision: number; archived: boolean};
export type AtlasMap = {id: string; name: string; description: string; scope: MapDraft["scope"]; width: number; height: number; revision: number; archived: boolean; features: AtlasFeature[]; drawings?: MapDrawing[]; presentation?: MapPresentation};
export type AtlasBundle = {maps: AtlasMap[]; geographies: GeographyRecord[]; canEdit: boolean};
export type Viewport = {x: number; y: number; width: number; height: number};
export const fitViewport = (): Viewport => ({x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT});
export function signedArea(points: Point[]) {return points.reduce((sum, p, i) => {const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y;}, 0) / 2;}
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const on = (p: Point, q: Point, r: Point) => Math.abs(cross(p,q,r)) < 1e-8 && r.x >= Math.min(p.x,q.x) && r.x <= Math.max(p.x,q.x) && r.y >= Math.min(p.y,q.y) && r.y <= Math.max(p.y,q.y);
  return (cross(a,b,c) * cross(a,b,d) < 0 && cross(c,d,a) * cross(c,d,b) < 0) || on(a,b,c) || on(a,b,d) || on(c,d,a) || on(c,d,b);
}
export function validateGeometry(geometry: Geometry, width = MAP_WIDTH, height = MAP_HEIGHT) {
  const points = geometry.type === "polygon" ? geometry.points : [geometry.point];
  if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > width || p.y > height || Math.abs(p.x-rounded(p.x)) > 1e-8 || Math.abs(p.y-rounded(p.y)) > 1e-8)) throw new Error("Points must be inside the map, with at most two decimal places.");
  if (geometry.type === "point") return;
  if (points.length < 3 || points.length > 256 || Math.abs(signedArea(points)) < 1) throw new Error("An outline needs 3 to 256 points and a visible area of at least one square map unit.");
  if (new Set(geometry.points.map(p => p.id)).size !== points.length || new Set(points.map(p => `${p.x}:${p.y}`)).size !== points.length) throw new Error("Every boundary point must have a distinct identity and position.");
  for (let i=0; i<points.length; i++) {
    const a=points[i], b=points[(i+1)%points.length], prev=points[(i+points.length-1)%points.length];
    if (Math.abs(cross(prev,a,b)) < 1e-8 && (a.x-prev.x)*(b.x-a.x)+(a.y-prev.y)*(b.y-a.y) <= 0) throw new Error("The outline must not double back along an edge.");
    for (let j=i+1; j<points.length; j++) {if (j === i+1 || (i === 0 && j === points.length-1)) continue; if (intersects(a,b,points[j],points[(j+1)%points.length])) throw new Error("The outline must not cross or touch itself. Move the conflicting points before saving.");}
  }
}
export function validateMapDraft(draft: MapDraft) {
  if (new Set(draft.features.map(f=>f.id)).size !== draft.features.length || new Set(draft.geographies.map(g=>g.id)).size !== draft.geographies.length) throw new Error("Map and geography identities must not be repeated.");
  if (draft.features.reduce((sum,f)=>sum+(f.geometry.type === "polygon" ? f.geometry.points.length : 1),0) > 8192) throw new Error("A map supports at most 8,192 total points.");
  draft.features.forEach(f=>validateGeometry(f.geometry));
  validateDrawings(draft.drawings??[]);
}
export function validateParents(records: {id: string; parentId: string|null}[]) {
  const parents = new Map(records.map(g=>[g.id,g.parentId]));
  for (const record of records) {const seen = new Set<string>(); let current: string|null = record.id; while (current) {if (seen.has(current)) throw new Error("Geography cannot contain itself, directly or through its parents."); seen.add(current); if (!parents.has(current)) throw new Error("Choose a parent geography from this World."); current = parents.get(current)!;}}
}
export function draftOf(map: AtlasMap, geographies: GeographyRecord[]): MapDraft {
  const ids = new Set([...map.features.map(f=>f.geographyId),...(map.drawings??[]).flatMap(d=>d.geographyId?[d.geographyId]:[])]);
  return {name: map.name, description: map.description, scope: map.scope, features: structuredClone(map.features), drawings: structuredClone(map.drawings??[]), presentation: structuredClone(map.presentation??defaultPresentation()), geographies: geographies.filter(g=>ids.has(g.id)).map(g=>({id:g.id,revision:g.revision,name:g.name,description:g.description,kind:g.kind,parentId:g.parentId}))};
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

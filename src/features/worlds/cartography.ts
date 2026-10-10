import { z } from "zod";
import { MAP_HEIGHT, MAP_WIDTH, boundedPoint, rounded, type MapPoint } from "./atlas-coordinates";

export const layers = ["land", "terrain", "waterways", "paths", "symbols", "labels"] as const;
export type MapLayer = typeof layers[number];
export const terrainKinds = ["mountains", "hills", "valleys", "forest", "grassland", "desert", "wetland", "snow", "lake"] as const;
export const symbolKinds = ["mountain", "pine", "village", "city", "castle", "tower", "ruin", "port"] as const;
const id = z.string().uuid();
const scalar = z.number().finite();
const point = z.object({ x: scalar.min(0).max(MAP_WIDTH), y: scalar.min(0).max(MAP_HEIGHT) }).strict();
const vertex = point.extend({ id });
const common = { version: z.literal(1), id, name: z.string().trim().min(1).max(160), archived: z.boolean(), geographyId: id.nullable() };
export const drawingSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("terrain"), kind: z.enum(terrainKinds), points: z.array(vertex).min(1).max(128), radius: scalar.min(12).max(160), spacing: scalar.min(12).max(100), density: z.number().int().min(1).max(3), seed: z.number().int().min(1).max(2147483647) }).strict(),
  z.object({ ...common, type: z.literal("path"), kind: z.enum(["river", "stream", "road", "trail"]), points: z.array(vertex).min(2).max(128), width: scalar.min(1).max(24), curve: scalar.min(0).max(1) }).strict(),
  z.object({ ...common, type: z.literal("symbol"), kind: z.enum(symbolKinds), point, scale: scalar.min(.4).max(4), rotation: scalar.min(-180).max(180), style: z.enum(["colored", "ink"]) }).strict(),
  z.object({ ...common, type: z.literal("label"), text: z.string().trim().min(1).max(160), point, size: scalar.min(12).max(80), rotation: scalar.min(-180).max(180), style: z.enum(["place", "region", "water"]) }).strict(),
]);
export type MapDrawing = z.infer<typeof drawingSchema>;
export type TerrainDrawing = Extract<MapDrawing, {type: "terrain"}>;
export type PathDrawing = Extract<MapDrawing, {type: "path"}>;
const layerState = z.object({ visible: z.boolean(), locked: z.boolean() }).strict();
export const presentationSchema = z.object({ version: z.literal(1), style: z.enum(["parchment", "illuminated", "night"]), grid: z.boolean(), layers: z.object({ land: layerState, terrain: layerState, waterways: layerState, paths: layerState, symbols: layerState, labels: layerState }).strict() }).strict();
export type MapPresentation = z.infer<typeof presentationSchema>;
export const defaultPresentation = (): MapPresentation => ({ version: 1, style: "parchment", grid: false, layers: Object.fromEntries(layers.map(l => [l, {visible: true, locked: false}])) as MapPresentation["layers"] });
export const drawingsSchema = z.array(drawingSchema).max(512);
export function drawingLayer(d: MapDrawing): MapLayer { return d.type === "path" ? (d.kind === "river" || d.kind === "stream" ? "waterways" : "paths") : d.type === "symbol" ? "symbols" : d.type === "label" ? "labels" : "terrain"; }
export function drawingPoints(d: MapDrawing) { return d.type === "terrain" || d.type === "path" ? d.points : [d.point]; }

// Versioned source strokes, not a bitmap or thousands of database rows.
export function validateDrawings(drawings: MapDrawing[]) {
  if (new Set(drawings.map(d => d.id)).size !== drawings.length) throw new Error("Drawing identities must not be repeated.");
  let total = 0, stamps = 0;
  drawingsSchema.parse(drawings);
  for (const d of drawings) {
    const points = drawingPoints(d); total += points.length;
    if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > MAP_WIDTH || p.y < 0 || p.y > MAP_HEIGHT || Math.abs(p.x - rounded(p.x)) > 1e-8 || Math.abs(p.y - rounded(p.y)) > 1e-8)) throw new Error("Drawing points must be inside the map with at most two decimal places.");
    if (d.type === "terrain" || d.type === "path") {
      if (new Set(d.points.map(p => p.id)).size !== points.length) throw new Error("Each stroke or path point needs a distinct identity.");
      if (points.some((p, i) => i > 0 && p.x === points[i-1].x && p.y === points[i-1].y)) throw new Error("Consecutive drawing points must differ.");
      if (d.type === "path" && Math.hypot(points.at(-1)!.x - points[0].x, points.at(-1)!.y - points[0].y) < 1) throw new Error("A path needs distinct endpoints.");
    }
    if (d.type === "terrain") { const count = strokeSamples(d.points, d.spacing).length * d.density; if (count > 600) throw new Error("This terrain stroke is too dense. Increase spacing or paint a shorter stroke."); stamps += count; }
  }
  if (total > 16384 || stamps > 6000) throw new Error("A map supports 16,384 drawing points and 6,000 terrain marks. Archive retains these limits; adjust spacing or reuse existing strokes.");
}
export function strokeSamples(points: MapPoint[], spacing: number): MapPoint[] {
  if(!Number.isFinite(spacing)||spacing<=0)throw new Error("Choose a positive mark spacing.");
  if(!points.length)return [];
  const result: MapPoint[] = [points[0]]; let remainder = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i], length = Math.hypot(b.x-a.x, b.y-a.y);
    for (let distance = spacing - remainder; distance <= length; distance += spacing) {
      result.push({x: a.x + (b.x-a.x)*distance/length, y: a.y + (b.y-a.y)*distance/length});
      if (result.length > 601) return result;
    }
    remainder = (remainder + length) % spacing;
  }
  return result;
}
export function terrainMarks(d: TerrainDrawing) {
  let state = d.seed >>> 0;
  const random = () => {state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296;};
  return strokeSamples(d.points, d.spacing).flatMap((p, i) => Array.from({length: d.density}, (_, j) => ({
    key: `${i}:${j}`, x: p.x + (random()-.5)*d.radius*1.35, y: p.y + (random()-.5)*d.radius,
    scale: (d.radius/55)*(.65+random()*.5), variant: Math.floor(random()*3),
  }))).sort((a,b) => a.y - b.y);
}
export function curvedPath(points: MapPoint[], curve = .75): string {
  if (!points.length) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i=0; i<points.length-1; i++) {
    const before=points[Math.max(0,i-1)], a=points[i], b=points[i+1], after=points[Math.min(points.length-1,i+2)];
    d += ` C ${a.x+(b.x-before.x)*curve/6} ${a.y+(b.y-before.y)*curve/6} ${b.x-(after.x-a.x)*curve/6} ${b.y-(after.y-a.y)*curve/6} ${b.x} ${b.y}`;
  }
  return d;
}
export function moveDrawing(d: MapDrawing, dx: number, dy: number): MapDrawing {
  const points=drawingPoints(d), x=rounded(Math.max(-Math.min(...points.map(p=>p.x)),Math.min(dx,MAP_WIDTH-Math.max(...points.map(p=>p.x))))), y=rounded(Math.max(-Math.min(...points.map(p=>p.y)),Math.min(dy,MAP_HEIGHT-Math.max(...points.map(p=>p.y)))));
  const shift = <T extends MapPoint>(p:T):T => ({...p,...boundedPoint({x:p.x+x,y:p.y+y})});
  return d.type === "path" || d.type === "terrain" ? {...d,points:d.points.map(shift)} : {...d,point:shift(d.point)};
}

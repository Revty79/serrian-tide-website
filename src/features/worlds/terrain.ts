import type {RefinementMeta} from "./terrain-refinement";
import {terrainSourceSchema,type TerrainSource,type ProtectedTile} from "./terrain-source";
import { z } from "zod";
import {physicalBrushGeometry} from "./terrain-physical-brush";

// Terrain samples and physical coordinates are independent. The active editor
// always supplies the saved geometry; defaults support small pure calculations.
export type TerrainGeometry = { width: number; height: number; tileSize: number; displayWidth: number; displayHeight: number; min: number; max: number; wrap: boolean };
export const TERRAIN = { wrap: false, width: 640, height: 384, tileSize: 32, displayWidth: 20000000, displayHeight: 12000000, min: -12000, max: 12000 } as const;
export const TILE_COLUMNS = TERRAIN.width / TERRAIN.tileSize;
export const TILE_ROWS = TERRAIN.height / TERRAIN.tileSize;
export const MAX_TILE_COUNT = 1024;
export const TILE_COUNT = TILE_COLUMNS * TILE_ROWS;
export type TerrainTile = { x: number; y: number; samples: number[] };
export const terrainSettingsSchema = z.object({
  gridWidth: z.number().int().min(32).max(1024).multipleOf(32).default(640), gridHeight: z.number().int().min(32).max(1024).multipleOf(32).default(384),
  widthKm: z.number().min(.1).max(1000000).default(20000), heightKm: z.number().min(.1).max(1000000).default(12000),
  wrap: z.boolean().default(false), minElevation: z.number().int().min(-30000).max(-1).default(-12000), maxElevation: z.number().int().min(1).max(30000).default(12000),
}).strict();
export type TerrainSettings = z.infer<typeof terrainSettingsSchema>;
export function terrainGeometry(s: TerrainSettings): TerrainGeometry { return { width: s.gridWidth, height: s.gridHeight, tileSize: 32, displayWidth: s.widthKm * 1000, displayHeight: s.heightKm * 1000, min: s.minElevation, max: s.maxElevation, wrap: s.wrap }; }
export type TerrainSummary = { id: string; name: string; revision: number; seaLevel: number; updatedAt: string };
export type TerrainDocument = TerrainSummary & { refinement?:RefinementMeta; terrainId: string; settings: TerrainSettings; worldId: string; format: 1; width: number; height: number; tileSize: number; baseElevation: number; tiles: TerrainTile[]; canEdit: boolean; acceptedRequestId: string;protection?:ProtectedTile[];source?:TerrainSource;origin?:TerrainSource };
export const elevationSchema = z.number().int().min(-30000).max(30000);
export const tileSchema = z.object({ x: z.number().int().min(0).max(31), y: z.number().int().min(0).max(31), samples: z.array(elevationSchema).length(TERRAIN.tileSize ** 2) }).strict();
export const terrainCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), requestId: z.uuid(), name: z.string().trim().min(1).max(160), initial: z.enum(["ocean", "land","generated","imported"]),seaLevel:elevationSchema.optional(),source:terrainSourceSchema.optional(),tiles:z.array(tileSchema).max(MAX_TILE_COUNT).optional(), settings: terrainSettingsSchema.default(() => terrainSettingsSchema.parse({})) }).strict().superRefine((v,ctx)=>{const generated=v.initial==="generated"||v.initial==="imported";if(generated&&(!v.source||v.source.kind!==v.initial))ctx.addIssue({code:"custom",message:"The numerical source must match this starting option."});if(!generated&&(v.tiles?.length||v.source&&(v.source.kind!=="blank"||v.source.surface!==v.initial)))ctx.addIssue({code:"custom",message:"A blank surface cannot contain an unrelated numerical source."});if(generated&&(!v.tiles||v.tiles.length!==(v.settings.gridWidth/32)*(v.settings.gridHeight/32)||new Set(v.tiles.map(t=>`${t.x}:${t.y}`)).size!==v.tiles.length))ctx.addIssue({code:"custom",message:"Accept the complete preview grid exactly once, without missing or repeated tiles."});}),
  z.object({ action: z.literal("save"), requestId: z.uuid(), mapId: z.uuid(), revision: z.number().int().positive(), seaLevel: elevationSchema,source:terrainSourceSchema.optional(), tiles: z.array(tileSchema).max(MAX_TILE_COUNT) }).strict().superRefine((v, ctx) => {
    if(v.source&&v.source.kind!=="manual"&&v.source.kind!=="regenerated")ctx.addIssue({code:"custom",message:"Existing terrain accepts manual edits or an explicitly selected regeneration."});
    if (new Set(v.tiles.map(t => `${t.x}:${t.y}`)).size !== v.tiles.length) ctx.addIssue({ code: "custom", message: "A terrain tile was submitted more than once." });
  }),
]);
export function tileKey(x: number, y: number, shape: TerrainGeometry = TERRAIN) { return y * (shape.width / shape.tileSize) + x; }
export function createGrid(baseElevation: number, tiles: TerrainTile[] = [], shape: TerrainGeometry = TERRAIN) {
  const grid = new Int16Array(shape.width * shape.height).fill(elevationSchema.parse(baseElevation));
  for (const raw of tiles) {
    const t = tileSchema.parse(raw); if (t.x >= shape.width / shape.tileSize || t.y >= shape.height / shape.tileSize || t.samples.some(v => v < shape.min || v > shape.max)) throw new Error("A tile is outside this terrain grid or elevation range.");
    for (let row = 0; row < shape.tileSize; row++) grid.set(t.samples.slice(row * shape.tileSize, (row + 1) * shape.tileSize), (t.y * shape.tileSize + row) * shape.width + t.x * shape.tileSize);
  }
  return grid;
}
export function readTile(grid: Int16Array, key: number, shape: TerrainGeometry = TERRAIN): TerrainTile {
  const columns = shape.width / shape.tileSize, x = key % columns, y = Math.floor(key / columns), samples: number[] = [];
  for (let row = 0; row < shape.tileSize; row++) samples.push(...grid.subarray((y * shape.tileSize + row) * shape.width + x * shape.tileSize, (y * shape.tileSize + row) * shape.width + (x + 1) * shape.tileSize));
  return { x, y, samples };
}
export type BrushTool = "raise" | "lower" | "smooth" | "level" | "coast-land" | "coast-water" | "coast-smooth";
export type TerrainPatch = { indices: number[] | Uint32Array; before: number[] | Int16Array; after: number[] | Int16Array };
export type Brush = { radiusMetres?:number; tool: BrushTool; radius: number; strength: number; hardness?:number; target?:number; seaLevel?:number; coastHeight?:number; coastBand?:number };
export type SculptWorkspace={halo:Int16Array};
export const brushRadius=(shape:TerrainGeometry,radius:number)=>Math.max(1,Math.min(64,shape.width/2,radius));
export function brushWeight(distance:number,hardness=0){if(distance>=1)return 0;if(hardness===0)return (1-distance*distance)**2;const firm=Math.max(0,Math.min(1,hardness));if(distance<=firm)return 1;const edge=(distance-firm)/(1-firm);return (1-edge*edge)**2;}
/** Only the brush rectangle is visited. Smoothing reads a stable one-cell halo. */
export function sculpt(grid: Int16Array, cx: number, cy: number, brush: Brush, before: Map<number, number>, shape: TerrainGeometry = TERRAIN, workspace?:SculptWorkspace, touched=new Set<number>()) {
  if(!Number.isFinite(brush.radius)||!Number.isFinite(brush.strength)||!Number.isFinite(brush.hardness??0)||(brush.tool==="level"&&!Number.isFinite(brush.target??0))||(brush.tool.startsWith("coast-")&&![brush.seaLevel??0,brush.coastHeight??150,brush.coastBand??500].every(Number.isFinite)))return touched;
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || cy < 0 || cy >= shape.height || (!shape.wrap && (cx < 0 || cx >= shape.width))) return touched;
  if (shape.wrap) cx = (cx % shape.width + shape.width) % shape.width;
  const physical=brush.radiusMetres===undefined?null:physicalBrushGeometry(shape,brush.radiusMetres);if(brush.radiusMetres!==undefined&&!physical)return touched;
  const radius = physical?.x??brushRadius(shape,brush.radius),radiusY=physical?.y??radius, strength = Math.max(1, Math.min(1000, brush.strength));
  const left = shape.wrap ? Math.floor(cx - radius) : Math.max(0, Math.floor(cx - radius)), right = shape.wrap ? Math.ceil(cx + radius) : Math.min(shape.width - 1, Math.ceil(cx + radius));
  const top = Math.max(0, Math.floor(cy - radiusY)), bottom = Math.min(shape.height - 1, Math.ceil(cy + radiusY)), haloWidth = right - left + 3;
  const smoothing=brush.tool==="smooth"||brush.tool==="coast-smooth",needed=haloWidth*(bottom-top+3);
  if(smoothing&&workspace&&workspace.halo.length<needed)workspace.halo=new Int16Array(needed);
  const source=smoothing?(workspace?.halo??new Int16Array(needed)):null;
  const indexOf = (x: number, y: number) => Math.max(0, Math.min(shape.height - 1, y)) * shape.width + (shape.wrap ? (x % shape.width + shape.width) % shape.width : Math.max(0, Math.min(shape.width - 1, x)));
  if (source) for (let y = top - 1; y <= bottom + 1; y++) for (let x = left - 1; x <= right + 1; x++) source[(y - top + 1) * haloWidth + x - left + 1] = grid[indexOf(x, y)];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const distance = physical?Math.hypot((x-cx)*physical.spacing.x,(y-cy)*physical.spacing.y)/physical.metres:Math.hypot(x - cx, y - cy) / radius; if (distance >= 1) continue;
    const index = indexOf(x, y), value = grid[index], weight = brushWeight(distance,brush.hardness);
    let next = value + (brush.tool === "lower" ? -strength : strength) * weight;
    if(brush.tool==="level")next=value+((brush.target??0)-value)*weight*Math.min(1,strength/250);
    if(brush.tool==="coast-land"||brush.tool==="coast-water"){const sea=brush.seaLevel??0,height=Math.max(1,brush.coastHeight??150),target=brush.tool==="coast-land"?Math.min(shape.max,sea+height):Math.max(shape.min,sea-height);next=value+(brush.tool==="coast-land"?Math.max(0,target-value):Math.min(0,target-value))*weight*Math.min(1,strength/250);}
    if (source) { let sum = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += source[(y - top + 1 + j) * haloWidth + x - left + 1 + i]; const nearCoast=brush.tool==="coast-smooth"?Math.max(0,1-Math.abs(value-(brush.seaLevel??0))/Math.max(1,brush.coastBand??500)):1;next = value + (sum / 9 - value) * weight * Math.min(1, strength / 250)*nearCoast; }
    next = Math.round(Math.max(shape.min, Math.min(shape.max, next))); if (next === value) continue;
    if (!before.has(index)) before.set(index, value); grid[index] = next;
    touched.add(tileKey(Math.floor(index % shape.width / shape.tileSize), Math.floor(y / shape.tileSize), shape));
  }
  return touched;
}
export function finishPatch(grid: Int16Array, before: Map<number, number>): TerrainPatch {
  const indices = [...before.keys()].filter(i => grid[i] !== before.get(i));
  return { indices, before: indices.map(i => before.get(i)!), after: indices.map(i => grid[i]) };
}
export function applyPatch(grid: Int16Array, patch: TerrainPatch, direction: "before" | "after", shape: TerrainGeometry = TERRAIN) {
  const touched = new Set<number>();
  patch.indices.forEach((index, i) => { grid[index] = patch[direction][i]; touched.add(tileKey(Math.floor(index % shape.width / shape.tileSize), Math.floor(index / shape.width / shape.tileSize), shape)); });
  return touched;
}
export type TerrainView = { x: number; y: number; scale: number };
export function fitTerrain(width: number, height: number, shape: TerrainGeometry = TERRAIN): TerrainView { const scale = Math.min(width / shape.displayWidth, height / shape.displayHeight) * .94; return { x: (width - shape.displayWidth * scale) / 2, y: (height - shape.displayHeight * scale) / 2, scale }; }
export function zoomTerrain(view: TerrainView, x: number, y: number, factor: number): TerrainView {
  const scale = Math.max(1e-9, Math.min(100, view.scale * factor)), ratio = scale / view.scale;
  return { x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio, scale };
}
export function terrainPoint(view: TerrainView, x: number, y: number, shape: TerrainGeometry = TERRAIN) { return { x: (x - view.x) / view.scale / shape.displayWidth * shape.width, y: (y - view.y) / view.scale / shape.displayHeight * shape.height }; }

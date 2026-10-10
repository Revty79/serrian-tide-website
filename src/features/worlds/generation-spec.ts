import { z } from "zod";

export const GENERATOR_VERSION = "serrian-atlas-v1" as const;
export const regions = ["center", "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"] as const;
export type Region = typeof regions[number];
export const directions = ["automatic", "north", "south", "east", "west"] as const;
const percentage = z.number().int().min(0).max(100);
export const generationSettingsSchema = z.object({
  mapType: z.enum(["world", "continent"]),
  continents: z.number().int().min(0).max(6),
  landCoverage: z.number().int().min(10).max(55),
  islands: z.number().int().min(0).max(32),
  ruggedness: percentage,
  size: z.enum(["small", "medium", "large", "varied"]),
  shape: z.enum(["balanced", "elongated", "crescent", "varied"]),
  mountains: percentage,
  forest: percentage,
  rivers: z.number().int().min(0).max(12),
  lakes: z.number().int().min(0).max(10),
  biome: z.enum(["temperate", "northern", "arid", "tropical", "mixed"]),
  style: z.enum(["parchment", "illuminated", "night"]),
}).strict().superRefine((s, ctx) => {
  if (s.mapType === "continent" && s.continents !== 1) ctx.addIssue({code: "custom", message: "A continent map needs exactly one major continent.", path: ["continents"]});
  if (!s.continents && !s.islands) ctx.addIssue({code: "custom", message: "Choose at least one continent or island.", path: ["continents"]});
});
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;
export const generationPlanSchema = z.object({
  landPosition: z.enum(regions),
  islandPosition: z.enum(["scattered", ...regions]),
  ruggedCoast: z.enum(["all", "north", "south", "east", "west"]),
  baySide: z.enum(["all", "north", "south", "east", "west"]),
  additionalBaySide: z.enum(["none", "north", "south", "east", "west"]),
  bays: z.number().int().min(0).max(4),
  bayDepth: z.number().int().min(1).max(3),
  mountainRegion: z.enum(regions),
  mountainOrientation: z.enum(["north-south", "east-west", "northeast-southwest", "northwest-southeast", "varied"]),
  mountainRanges: z.number().int().min(1).max(3),
  forestRegion: z.enum(["automatic", ...regions]),
  riverDirection: z.enum(directions),
  lakeRegion: z.enum(["automatic", ...regions]),
  desertRegion: z.enum(["automatic", ...regions]),
  grasslandRegion: z.enum(["automatic", ...regions]),
  wetlandRegion: z.enum(["automatic", ...regions]),
  snowRegion: z.enum(["automatic", ...regions]),
  extraTerrain: z.array(z.enum(["hills", "valleys", "desert", "grassland", "wetland", "snow"])).max(6),
}).strict();
export type GenerationPlan = z.infer<typeof generationPlanSchema>;
export const defaultPlan = (): GenerationPlan => ({landPosition: "center", islandPosition: "scattered", ruggedCoast: "all", baySide: "all", additionalBaySide: "none", bays: 2, bayDepth: 2, mountainRegion: "center", mountainOrientation: "varied", mountainRanges: 1, forestRegion: "automatic", riverDirection: "automatic", lakeRegion: "automatic", desertRegion: "automatic", grasslandRegion: "automatic", wetlandRegion: "automatic", snowRegion: "automatic", extraTerrain: []});
export const generationSpecSchema = z.object({
  version: z.literal(1), algorithm: z.literal(GENERATOR_VERSION), seed: z.string().trim().min(1).max(64),
  settings: generationSettingsSchema, plan: generationPlanSchema,
  description: z.string().trim().min(1).max(4000).nullable(),
  interpretation: z.object({version: z.literal(1), understood: z.array(z.string().max(300)).max(48), warnings: z.array(z.string().max(500)).max(48)}).strict().nullable(),
}).strict().superRefine((s, ctx) => {
  if (s.settings.continents !== 1 && s.plan.landPosition !== "center") ctx.addIssue({code: "custom", message: "Directional continent placement supports one major continent. Use center for a world of several landmasses.", path: ["plan", "landPosition"]});
  if ((s.description === null) !== (s.interpretation === null)) ctx.addIssue({code: "custom", message: "A written description needs its reviewed interpretation.", path: ["interpretation"]});
});
export type GenerationSpec = z.infer<typeof generationSpecSchema>;
export const generationProvenanceSchema = z.object({
  version: z.literal(1), kind: z.enum(["generated", "duplicate"]), requestId: z.string().uuid(),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdBy: z.string().min(1).max(200), createdAt: z.iso.datetime(),
  sourceMapId: z.string().uuid().nullable(), sourceRevision: z.number().int().positive().nullable(),
  spec: generationSpecSchema.nullable(),
}).strict().superRefine((p, ctx) => {
  if (p.kind === "generated" && !p.spec) ctx.addIssue({code: "custom", message: "Generated maps retain their recipe.", path: ["spec"]});
  if ((p.sourceMapId === null) !== (p.sourceRevision === null) || (p.kind === "duplicate" && !p.sourceMapId)) ctx.addIssue({code: "custom", message: "A source map needs its recorded revision.", path: ["sourceMapId"]});
});
export type GenerationProvenance = z.infer<typeof generationProvenanceSchema>;
export const presets = {
  continental: {label: "Continental world", settings: {mapType: "world", continents: 3, landCoverage: 48, islands: 8, ruggedness: 62, size: "varied", shape: "varied", mountains: 58, forest: 65, rivers: 6, lakes: 3, biome: "mixed", style: "illuminated"}},
  northern: {label: "Northern continent", settings: {mapType: "continent", continents: 1, landCoverage: 45, islands: 5, ruggedness: 82, size: "large", shape: "elongated", mountains: 75, forest: 70, rivers: 3, lakes: 2, biome: "northern", style: "parchment"}},
  islands: {label: "Island world", settings: {mapType: "world", continents: 1, landCoverage: 23, islands: 20, ruggedness: 65, size: "small", shape: "balanced", mountains: 40, forest: 70, rivers: 3, lakes: 2, biome: "tropical", style: "illuminated"}},
  archipelago: {label: "Archipelago", settings: {mapType: "world", continents: 0, landCoverage: 20, islands: 28, ruggedness: 68, size: "varied", shape: "varied", mountains: 42, forest: 65, rivers: 4, lakes: 2, biome: "tropical", style: "illuminated"}},
  rugged: {label: "Rugged fantasy world", settings: {mapType: "world", continents: 4, landCoverage: 50, islands: 7, ruggedness: 92, size: "varied", shape: "varied", mountains: 88, forest: 68, rivers: 8, lakes: 5, biome: "mixed", style: "parchment"}},
} satisfies Record<string, {label: string; settings: GenerationSettings}>;
export type Preset = keyof typeof presets;
export function presetSpec(preset: Preset, seed: string): GenerationSpec {
  const plan = defaultPlan();
  if (preset === "northern") {plan.landPosition = "north"; plan.ruggedCoast = "west"; plan.baySide = "east"; plan.mountainOrientation = "north-south"; plan.forestRegion = "south"; plan.riverDirection = "east";}
  return {version: 1, algorithm: GENERATOR_VERSION, seed, settings: {...presets[preset].settings}, plan, description: null, interpretation: null};
}

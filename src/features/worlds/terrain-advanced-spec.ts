import {z} from "zod";
import {regionFootprintSchema} from "./terrain-region-geometry";

export const ADVANCED_TERRAIN_LIMITS={
  cells:262144,work:8388608,iterations:40,pathSamples:8192,riverEdges:64,
  volcanoes:64,workingBytes:32*1024*1024,workerMs:30000,packetCharacters:250000,
} as const;
const metres=z.number().finite().positive().max(1e9);
export const advancedPointSchema=z.object({x:z.number().finite().min(0).max(1e9),y:z.number().finite().min(0).max(1e9)}).strict();
export const advancedAreaSchema=z.object({
  frame:z.object({x:z.number().finite().min(0),y:z.number().finite().min(0),width:metres,height:metres}).strict(),
  footprint:regionFootprintSchema.optional(),
}).strict().superRefine((v,c)=>{
  if(v.footprint&&v.footprint.parts.reduce((n,p)=>n+p.length,0)>128)c.addIssue({code:"custom",message:"Advanced operations support 128 selected boundary points. Simplify deliberately or choose a smaller area."});
});
const common={selection:advancedAreaSchema,preserveManual:z.boolean(),strength:z.number().finite().min(1).max(100)};
export const volcanoOperationSchema=z.object({
  ...common,kind:z.literal("volcano"),centre:advancedPointSchema,
  form:z.enum(["cone","shield","composite","cratered","caldera"]),
  radiusM:metres,heightM:z.number().finite().min(1).max(20000),
  craterDiameterM:z.number().finite().min(0).max(1e9),craterDepthM:z.number().finite().min(0).max(20000),
  profile:z.number().finite().min(.5).max(4),blendM:z.number().finite().min(0).max(1e9),
  summitEastM:z.number().finite().min(-1e9).max(1e9),summitSouthM:z.number().finite().min(-1e9).max(1e9),
}).strict().superRefine((v,c)=>{
  if(v.craterDiameterM>v.radiusM*1.5)c.addIssue({code:"custom",message:"Keep the crater diameter within three quarters of the volcano's overall diameter."});
  if(Math.hypot(v.summitEastM,v.summitSouthM)>v.radiusM*.4)c.addIssue({code:"custom",message:"Keep the summit within 40% of the volcano radius."});
  if(v.blendM>v.radiusM)c.addIssue({code:"custom",message:"Keep the transition distance within the volcano radius."});
});
export const advancedOperationOptions=[
  z.object({...common,kind:z.literal("river-channel"),riverId:z.string().min(1).max(180),
    course:z.enum(["segment","downstream"]),first:z.number().int().min(0).max(510),last:z.number().int().min(1).max(511).nullable(),
    widthM:metres,depthM:z.number().finite().min(1).max(3000),bankSoftness:z.number().finite().min(0).max(1),
    smoothing:z.number().finite().min(0).max(1),
  }).strict(),
  z.object({...common,kind:z.literal("erosion"),model:z.enum(["runoff","thermal"]),
    iterations:z.number().int().min(1).max(ADVANCED_TERRAIN_LIMITS.iterations),
    direction:z.number().finite().min(0).max(360),directionInfluence:z.number().finite().min(0).max(1),
    deposition:z.boolean(),maxDepthM:z.number().finite().min(1).max(3000),
    reposeDegrees:z.number().finite().min(1).max(70),featherM:z.number().finite().min(0).max(1e9),
  }).strict(),
  volcanoOperationSchema,
  z.object({...common,kind:z.literal("eruption"),volcanoId:z.uuid(),
    effect:z.enum(["collapse","lava"]),source:advancedPointSchema,
    extentM:metres,widthM:metres,magnitudeM:z.number().finite().min(1).max(3000),
    steps:z.number().int().min(1).max(2048),
  }).strict(),
] as const;
export const advancedOperationSchema=z.discriminatedUnion("kind",advancedOperationOptions);
export type AdvancedOperation=z.infer<typeof advancedOperationSchema>;
export type VolcanoOperation=z.infer<typeof volcanoOperationSchema>;
export type AdvancedKind=AdvancedOperation["kind"];
export const advancedProvenanceSchema=z.object({
  version:z.literal(1),contextPin:z.string().regex(/^[a-f0-9]{64}$/),operation:advancedOperationSchema,
  effect:z.object({changed:z.number().int().positive().max(ADVANCED_TERRAIN_LIMITS.cells),affected:advancedAreaSchema}).strict(),
}).strict();
export type AdvancedProvenance=z.infer<typeof advancedProvenanceSchema>;
export const advancedNames:Record<AdvancedKind,string>={
  "river-channel":"Carve River Channel",erosion:"Erode Selected Area",volcano:"Create Volcano",eruption:"Preview Eruption",
};

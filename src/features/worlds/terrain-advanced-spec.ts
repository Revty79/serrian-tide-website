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
export const landformProfileSchema=z.object({
  ...common,kind:z.literal("landform-profile"),
  points:z.array(advancedPointSchema.extend({elevationM:z.number().int().min(-30000).max(30000),widthM:metres})).min(2).max(128),
  mode:z.enum(["shape","minimum","maximum","upper-envelope"]),
  envelopeBaseM:z.number().int().min(-30000).max(30000).optional(),
  reviewDryBorderJoins:z.boolean().optional(),
  reviewDryReconstructionSupports:z.boolean().optional(),
  hardness:z.number().finite().min(0).max(1),
  endBlendM:z.number().finite().min(0).max(1e9),featherM:z.number().finite().min(0).max(1e9),
  continuousEndBlend:z.boolean().optional(),
  preserveGradualJoins:z.boolean().optional(),
}).strict().superRefine((v,c)=>{
  if(v.preserveGradualJoins&&v.mode==="shape")c.addIssue({code:"custom",path:["preserveGradualJoins"],message:"Gradual joins require a one-way profile elevation bound or an upper envelope."});
  if(v.reviewDryReconstructionSupports&&!v.reviewDryBorderJoins)c.addIssue({code:"custom",path:["reviewDryReconstructionSupports"],message:"Selected reconstruction supports require complete dry border review."});
  if(v.mode==="upper-envelope"&&v.envelopeBaseM===undefined)c.addIssue({code:"custom",path:["envelopeBaseM"],message:"Choose an explicit base elevation for the profile envelope."});
  if(v.mode!=="upper-envelope"&&v.envelopeBaseM!==undefined)c.addIssue({code:"custom",path:["envelopeBaseM"],message:"An envelope base belongs only to the upper-envelope mode."});
});
export const volcanoOperationSchema=z.object({
  ...common,kind:z.literal("volcano"),centre:advancedPointSchema,preserveShoreline:z.boolean().optional(),
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
export const erosionOperationSchema=z.object({...common,kind:z.literal("erosion"),model:z.enum(["runoff","thermal"]),
  iterations:z.number().int().min(1).max(ADVANCED_TERRAIN_LIMITS.iterations),
  direction:z.number().finite().min(0).max(360),directionInfluence:z.number().finite().min(0).max(1),
  deposition:z.boolean(),maxDepthM:z.number().finite().min(1).max(3000),
  reposeDegrees:z.number().finite().min(1).max(70),featherM:z.number().finite().min(0).max(1e9),
  preserveShoreline:z.boolean().optional(),
  reviewDryBorderJoins:z.boolean().optional(),
  reviewDryReconstructionSupports:z.boolean().optional(),
  outflowRate:z.number().finite().min(1).max(4).optional(),
  bankReinforcementM:z.number().int().min(1).max(3000).optional(),
}).strict().superRefine((v,c)=>{
  if(v.reviewDryReconstructionSupports&&!v.reviewDryBorderJoins)c.addIssue({code:"custom",path:["reviewDryReconstructionSupports"],message:"Selected reconstruction supports require complete dry border review."});
  if(v.deposition&&v.outflowRate!==undefined&&v.outflowRate!==1)c.addIssue({code:"custom",path:["outflowRate"],message:"Faster outflow requires deposits to be off. Depositing transport keeps its original bounded response."});
  if(v.bankReinforcementM!==undefined&&(v.model!=="thermal"||!v.preserveShoreline||v.deposition))c.addIssue({code:"custom",path:["bankReinforcementM"],message:"Bank reinforcement requires gravity / talus transport, saved shoreline supports and deposits off."});
});
export const sharedReliefOperationSchema=z.discriminatedUnion("kind",[landformProfileSchema,erosionOperationSchema]);
export const advancedOperationOptions=[
  landformProfileSchema,
  z.object({...common,kind:z.literal("river-channel"),riverId:z.string().min(1).max(180),preserveShoreline:z.boolean().optional(),
    course:z.enum(["segment","downstream"]),first:z.number().int().min(0).max(510),last:z.number().int().min(1).max(511).nullable(),
    widthM:metres,depthM:z.number().finite().min(1).max(3000),bankSoftness:z.number().finite().min(0).max(1),
    smoothing:z.number().finite().min(0).max(1),
  }).strict(),
  erosionOperationSchema,
  volcanoOperationSchema,
  z.object({...common,kind:z.literal("eruption"),volcanoId:z.uuid(),preserveShoreline:z.boolean().optional(),
    effect:z.enum(["collapse","lava"]),source:advancedPointSchema,
    extentM:metres,widthM:metres,magnitudeM:z.number().finite().min(1).max(3000),
    steps:z.number().int().min(1).max(2048),
  }).strict(),
] as const;
export const advancedOperationSchema=z.discriminatedUnion("kind",advancedOperationOptions);
export type AdvancedOperation=z.infer<typeof advancedOperationSchema>;
export type VolcanoOperation=z.infer<typeof volcanoOperationSchema>;
export type AdvancedKind=AdvancedOperation["kind"];
/** Reinforcement keeps two bounded floor buffers and audits eight native
 * neighbours after transport. It never enlarges the existing resource limits. */
const BASE_CELL_BYTES=64,EROSION_SHORE_BYTES=1,BANK_BUFFER_BYTES=16,PROFILE_JOIN_BYTES=8;
export function advancedTerrainCellBytes(op:AdvancedOperation){return BASE_CELL_BYTES+(op.kind==="erosion"&&op.preserveShoreline?EROSION_SHORE_BYTES:0)+(op.kind==="erosion"&&op.bankReinforcementM!==undefined?BANK_BUFFER_BYTES:0)+(op.kind==="landform-profile"&&op.preserveGradualJoins?PROFILE_JOIN_BYTES:0);}
/** Eligibility may reserve optional buffers; admission charges only the actual operation. */
export function advancedTerrainMaximumCellBytes(kind:AdvancedKind){return BASE_CELL_BYTES+(kind==="erosion"?EROSION_SHORE_BYTES+BANK_BUFFER_BYTES:kind==="landform-profile"?PROFILE_JOIN_BYTES:0);}
/** The unchanged numerical-buffer accounting used by whole sources and native windows. */
export function advancedTerrainWorkingBytes(width:number,height:number,cells:number,cellBytes:number){return width*height*7+cells*cellBytes+(width+height)*Int32Array.BYTES_PER_ELEMENT;}
/** New optional coastal guards reserve all eight native neighbours. Legacy
 * absent/false operations retain their original admission and arithmetic. */
export function advancedTerrainShoreSteps(op:AdvancedOperation,cells:number){return cells*(op.kind!=="landform-profile"&&op.kind!=="erosion"&&op.preserveShoreline?8:0);}
export function advancedTerrainSampleSteps(op:AdvancedOperation,cells:number){return cells*(op.kind==="erosion"?op.iterations+(op.bankReinforcementM!==undefined?8:0):op.kind==="landform-profile"?op.points.length-1+(op.preserveGradualJoins?26:0):1)+advancedTerrainShoreSteps(op,cells);}
export const advancedProvenanceSchema=z.object({
  version:z.literal(1),contextPin:z.string().regex(/^[a-f0-9]{64}$/),operation:advancedOperationSchema,
  effect:z.object({changed:z.number().int().positive().max(ADVANCED_TERRAIN_LIMITS.cells),affected:advancedAreaSchema}).strict(),
}).strict();
export type AdvancedProvenance=z.infer<typeof advancedProvenanceSchema>;
export const advancedNames:Record<AdvancedKind,string>={
  "landform-profile":"Shape Landform Profile",
  "river-channel":"Carve River Channel",erosion:"Erode Selected Area",volcano:"Create Volcano",eruption:"Preview Eruption",
};

import {z} from "zod";

const id=z.string().min(1).max(160).regex(/^[a-zA-Z0-9:._-]+$/);
const point=z.object({x:z.number().finite().min(0).max(1e9),y:z.number().finite().min(0).max(1e9)}).strict();
const pin=z.object({id:z.string().uuid(),revision:z.number().int().positive(),lod:z.number().int().min(0).max(5),contentHash:z.string().regex(/^[a-f0-9]{64}$/),spacingX:z.number().finite().positive(),spacingY:z.number().finite().positive()}).strict();
export const naturalDetailSchema=z.enum(["sparse","balanced","fine"]);
export type NaturalDetail=z.infer<typeof naturalDetailSchema>;
export const courseKindSchema=z.enum(["automatic","river","tributary","stream","intermittent","artificial","fictional"]);
export const lakeArtworkSchema=z.object({tone:z.enum(["natural","blue","turquoise","muted"]),shore:z.enum(["soft","crisp"])}).strict();
export const waterPresentationSchema=z.object({detail:z.enum(["major","balanced","all"]),banks:z.boolean(),symbols:z.boolean()}).strict();
export type WaterPresentation=z.infer<typeof waterPresentationSchema>;
const evidence=z.object({spacingM:z.number().finite().positive(),distanceM:z.number().finite().positive(),dropM:z.number().finite().min(0),slope:z.number().finite().min(0),confidence:z.enum(["potential","coarse"]),reason:z.string().min(1).max(1000)}).strict();
const common={id,name:z.string().max(120),description:z.string().max(2000),flowKind:z.enum(["derived","manual","exception"]),exceptionReason:z.string().max(1000),protected:z.boolean(),analysisId:id.nullable(),sourceIds:z.array(z.string().uuid()).max(129),authoredPins:z.array(pin).max(129).optional(),review:z.boolean(),evidence:evidence.optional()};
export const waterFeatureSchema=z.discriminatedUnion("kind",[
  z.object({...common,kind:z.literal("spring"),point,riverId:id.nullable()}).strict(),
  z.object({...common,kind:z.enum(["waterfall","rapids"]),point,riverId:id.nullable()}).strict(),
  z.object({...common,kind:z.literal("wetland"),rings:z.array(z.array(point).min(3).max(8192)).min(1).max(32),classification:z.enum(["potential","wetland","marsh","swamp","bog","intermittent"]),riverId:id.nullable(),lakeId:id.nullable()}).strict(),
]);
export type WaterFeature=z.infer<typeof waterFeatureSchema>;

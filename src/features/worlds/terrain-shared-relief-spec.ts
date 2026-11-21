import {z} from "zod";
import {sharedReliefOperationSchema,ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
const hash=z.string().regex(/^[a-f0-9]{64}$/),revision=z.number().int().positive(),
 frame=z.object({x:z.number().finite().min(0),y:z.number().finite().min(0),width:z.number().finite().positive(),height:z.number().finite().positive()}).strict();
export const sharedReliefReceiptSchema=z.object({version:z.literal(1),groupId:z.uuid(),changed:z.number().int().min(0).max(ADVANCED_TERRAIN_LIMITS.cells)}).strict();
export type SharedReliefReceipt=z.infer<typeof sharedReliefReceiptSchema>;
export const sharedReliefSnapshotSchema=z.object({
 id:z.uuid(),revision,parentId:z.uuid().nullable(),parentRevision:revision.nullable(),level:z.number().int().min(0).max(8),
 frame,columns:z.number().int().min(32).max(4096).multipleOf(32),rows:z.number().int().min(32).max(4096).multipleOf(32),contentHash:hash,
}).strict();
export type SharedReliefSnapshot=z.infer<typeof sharedReliefSnapshotSchema>;
export const sharedReliefCommandSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("preview"),mapId:z.uuid(),operation:sharedReliefOperationSchema,workArea:frame}).strict(),
 z.object({action:z.literal("accept"),mapId:z.uuid(),requestId:z.uuid(),operation:sharedReliefOperationSchema,workArea:frame,contextPin:hash,previewHash:hash}).strict(),
 z.object({action:z.enum(["undo","redo"]),mapId:z.uuid(),requestId:z.uuid(),groupId:z.uuid()}).strict(),
]);
export type SharedReliefCommand=z.infer<typeof sharedReliefCommandSchema>;
export const sharedReliefEffectSchema=z.object({
 id:z.uuid(),changed:z.number().int().min(0).max(ADVANCED_TERRAIN_LIMITS.cells),
 maxLoweringM:z.number().int().min(0).max(60000),maxRaisingM:z.number().int().min(0).max(60000),
}).strict();
export type SharedReliefEffect=z.infer<typeof sharedReliefEffectSchema>;

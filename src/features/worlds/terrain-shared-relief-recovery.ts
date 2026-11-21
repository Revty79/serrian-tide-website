import {z} from "zod";
import {sharedReliefOperationSchema,ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import {sharedReliefCommandSchema} from "./terrain-shared-relief-spec";
import {sharedReliefWorkAreaSchema} from "./terrain-shared-relief";
export const sharedReliefDraftSchema=z.object({version:z.literal(1),worldId:z.uuid(),mapId:z.uuid(),operation:sharedReliefOperationSchema,workArea:sharedReliefWorkAreaSchema,pending:sharedReliefCommandSchema.optional()}).strict().superRefine((v,c)=>{if(v.pending&&(v.pending.action==="preview"||v.pending.mapId!==v.mapId||v.pending.action==="accept"&&v.pending.operation.kind!==v.operation.kind))c.addIssue({code:"custom",message:"Retain the original acceptance request for this same native map and operation."});});
export type SharedReliefDraft=z.infer<typeof sharedReliefDraftSchema>;
export function sharedReliefStorageKey(worldId:string,mapId:string,kind:SharedReliefDraft["operation"]["kind"]){return `st:terrain-shared-relief:v1:${worldId}:${mapId}${kind==="erosion"?":erosion":""}`;}
export function parseSharedReliefDraft(raw:string,worldId:string,mapId:string,kind?:SharedReliefDraft["operation"]["kind"]){if(raw.length>ADVANCED_TERRAIN_LIMITS.packetCharacters)throw Error("The retained shared relief exceeds its existing recovery bound.");const v=sharedReliefDraftSchema.parse(JSON.parse(raw));if(v.worldId!==worldId||v.mapId!==mapId||kind&&v.operation.kind!==kind)throw Error("These native settings belong to another World, map or operation.");return v;}

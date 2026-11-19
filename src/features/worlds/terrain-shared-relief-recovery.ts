import {z} from "zod";
import {landformProfileSchema,ADVANCED_TERRAIN_LIMITS} from "./terrain-advanced-spec";
import {sharedReliefCommandSchema} from "./terrain-shared-relief-spec";
import {sharedReliefWorkAreaSchema} from "./terrain-shared-relief";
export const sharedReliefDraftSchema=z.object({version:z.literal(1),worldId:z.uuid(),mapId:z.uuid(),operation:landformProfileSchema,workArea:sharedReliefWorkAreaSchema,pending:sharedReliefCommandSchema.optional()}).strict().superRefine((v,c)=>{if(v.pending&&(v.pending.action==="preview"||v.pending.mapId!==v.mapId))c.addIssue({code:"custom",message:"Retain the original acceptance request for this same native map."});});
export type SharedReliefDraft=z.infer<typeof sharedReliefDraftSchema>;
export function parseSharedReliefDraft(raw:string,worldId:string,mapId:string){if(raw.length>ADVANCED_TERRAIN_LIMITS.packetCharacters)throw Error("The retained shared relief exceeds its existing recovery bound.");const v=sharedReliefDraftSchema.parse(JSON.parse(raw));if(v.worldId!==worldId||v.mapId!==mapId)throw Error("These native settings belong to another World or map.");return v;}

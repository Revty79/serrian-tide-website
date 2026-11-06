import {z} from "zod";
import {atlasId} from "./atlas";
import {historicalConnectionDraftSchema} from "./historical-connections";
import {undergroundEndpointSchema} from "./underground";

const connection=z.object({id:atlasId,name:z.string().min(1).max(160),source:undergroundEndpointSchema,destination:undergroundEndpointSchema,twoWay:z.boolean(),revision:z.number().int().positive(),archived:z.boolean()}).strict();
const source=z.object({sourceVersionId:atlasId,destinationVersionId:atlasId,sourceGeographyVersionId:atlasId.optional(),destinationGeographyVersionId:atlasId.optional(),connection}).strict();
/** A connection account is an immutable child of the existing map-state
 * authority. Both endpoint heads retain the same component; no second timeline
 * or current-day connection writer participates. The original source survives
 * every later account revision, as in existing historical connection accounts. */
export const nativeConnectionAccountSchema=z.object({
  version:z.literal(1),revision:z.number().int().positive(),connection,
  draft:historicalConnectionDraftSchema,source,original:source,
}).strict().refine(v=>v.connection.revision===v.revision&&v.connection.id===v.original.connection.id,"Retain the same explicit connection identity and revision.");
export type NativeConnectionAccount=z.infer<typeof nativeConnectionAccountSchema>;
export const nativeConnectionEditSchema=z.object({action:z.literal("historical-account"),requestId:atlasId,id:atlasId,revision:z.number().int().positive(),draft:historicalConnectionDraftSchema,refreshSources:z.boolean()}).strict();
export type NativeConnectionEdit=z.infer<typeof nativeConnectionEditSchema>;
export const nativeCraftConnectionEditSchema=nativeConnectionEditSchema.extend({craftId:atlasId});

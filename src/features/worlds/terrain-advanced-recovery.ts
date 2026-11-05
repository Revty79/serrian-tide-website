import {z} from "zod";
import {advancedOperationOptions,advancedPointSchema,ADVANCED_TERRAIN_LIMITS,type AdvancedOperation} from "./terrain-advanced-spec";
/** Draft numbers may be unfinished or outside acceptance bounds. Structure,
 * enums, strings, byte size and finite values remain guarded; only the strict
 * numerical-operation schema can authorize a preview or save. */
function draftFields(schema:z.ZodType):z.ZodType{
  if(schema instanceof z.ZodNumber)return z.number().finite();
  if(schema instanceof z.ZodObject)return z.object(Object.fromEntries(Object.entries(schema.shape).map(([key,value])=>[key,draftFields(value as z.ZodType)]))).strict();
  if(schema instanceof z.ZodArray)return z.array(draftFields(schema.element as z.ZodType)).max(8192);
  if(schema instanceof z.ZodOptional)return draftFields(schema.unwrap() as z.ZodType).optional();
  return schema;
}
const draftOperation=z.union(advancedOperationOptions.map(draftFields)) as z.ZodType<AdvancedOperation>;
export const advancedDraftSchema=z.object({
  version:z.literal(1),mapId:z.uuid(),sourceId:z.uuid().nullable(),revision:z.number().int().positive(),
  operation:draftOperation,visualOnly:z.boolean(),outline:z.array(advancedPointSchema).max(8192).optional(),
  areaMode:z.enum(["rectangle","points","freehand"]).optional(),drawing:z.boolean().optional(),
  simplificationM:z.number().finite().nonnegative().optional(),
}).strict();
export type AdvancedDraft=z.infer<typeof advancedDraftSchema>;
export function parseAdvancedDraft(raw:string,mapId:string,sourceId:string|null){
  if(raw.length>ADVANCED_TERRAIN_LIMITS.packetCharacters)throw Error("The retained operation settings exceed their 250,000-character recovery budget.");
  const value=advancedDraftSchema.parse(JSON.parse(raw));
  if(value.mapId!==mapId||value.sourceId!==sourceId)throw Error("These settings belong to another terrain source.");
  return value;
}
export function retireAdvancedDraft(storage:Pick<Storage,"getItem"|"removeItem">,key:string,raw:string){
  if(storage.getItem(key)===raw)storage.removeItem(key);
}

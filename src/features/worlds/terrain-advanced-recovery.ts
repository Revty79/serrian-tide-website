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
export type AdvancedDraftChoice={key:string;raw:string;info?:{kind:AdvancedOperation["kind"];revision:number;points?:number}};
export function parseAdvancedDraft(raw:string,mapId:string,sourceId:string|null){
  if(raw.length>ADVANCED_TERRAIN_LIMITS.packetCharacters)throw Error("The retained operation settings exceed their 250,000-character recovery budget.");
  const value=advancedDraftSchema.parse(JSON.parse(raw));
  if(value.mapId!==mapId||value.sourceId!==sourceId)throw Error("These settings belong to another terrain source.");
  return value;
}
/** Enumerate this exact native recovery scope without rewriting any packet.
 * Unreadable originals remain available for explicit export or discard. */
export function listAdvancedDrafts(storage:Pick<Storage,"length"|"key"|"getItem">,prefix:string,currentKey:string,mapId:string,sourceId:string|null):AdvancedDraftChoice[]{
  const choices:AdvancedDraftChoice[]=[],seen=new Set<string>();
  for(let n=0;n<storage.length;n++){
    const key=storage.key(n);if(!key?.startsWith(prefix)||key===currentKey||seen.has(key))continue;seen.add(key);
    const raw=storage.getItem(key);if(raw===null)continue;const choice:AdvancedDraftChoice={key,raw};
    try{const value=parseAdvancedDraft(raw,mapId,sourceId);choice.info={kind:value.operation.kind,revision:value.revision,...(value.operation.kind==="landform-profile"?{points:value.operation.points.length}:{})};}catch{/* Keep the exact original for export; numerical admission remains separate. */}
    choices.push(choice);
  }
  return choices;
}
/** Choosing or recovering an old list entry must not replace a newer tab's work. */
export function readUnchangedAdvancedDraft(storage:Pick<Storage,"getItem">,choice:{key:string;raw:string}){
  if(storage.getItem(choice.key)!==choice.raw)throw Error("These retained settings changed in another tab. Export the selected original if needed, then close and reopen the editor to load the latest drafts.");
  return choice;
}
/** Prefer the requested tool without discarding older or unreadable packets. */
export function findAdvancedDraft(storage:Pick<Storage,"length"|"key"|"getItem">,prefix:string,currentKey:string,mapId:string,sourceId:string|null,kind:AdvancedOperation["kind"]){
  let first:{key:string;raw:string}|undefined;
  for(let n=0;n<storage.length;n++){
    const key=storage.key(n);if(!key?.startsWith(prefix)||key===currentKey)continue;
    const raw=storage.getItem(key);if(raw===null)continue;
    const candidate={key,raw};first??=candidate;
    try{if(parseAdvancedDraft(raw,mapId,sourceId).operation.kind===kind)return candidate;}catch{/* Retain unreadable original bytes for explicit export and recovery. */}
  }
  return first;
}
export function retireAdvancedDraft(storage:Pick<Storage,"getItem"|"removeItem">,key:string,raw:string){
  if(storage.getItem(key)===raw)storage.removeItem(key);
}

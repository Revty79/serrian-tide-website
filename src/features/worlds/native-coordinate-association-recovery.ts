import {z} from "zod";
import {geographicAuthoringCommand} from "./geographic-authoring";

export const ASSOCIATION_RECOVERY_CHARACTERS=8192;
export type AssociationContext={actorId:string;worldId:string;timelineId:string};
const choice=z.uuid().or(z.literal(""));
const schema=z.object({
  format:z.literal("serrian-native-coordinate-association"),version:z.literal(1),
  actorId:z.string().min(1).max(200),worldId:z.uuid(),timelineId:z.uuid(),
  requestId:z.uuid(),mapId:choice,surfaceId:choice,attempted:z.boolean(),
}).strict().superRefine((value,context)=>{
  if(value.attempted&&(!value.mapId||!value.surfaceId))context.addIssue({code:"custom",message:"An attempted association must retain its exact map and surface."});
});
export type AssociationDraft=z.infer<typeof schema>;
export type AssociationStore=Pick<Storage,"getItem"|"setItem"|"removeItem">;
export function associationRecoveryKey(context:AssociationContext){return `st:native-coordinate-association:v1:${encodeURIComponent(context.actorId)}:${context.worldId}:${context.timelineId}`;}
export function parseAssociationDraft(raw:string,context:AssociationContext):AssociationDraft{
  if(raw.length>ASSOCIATION_RECOVERY_CHARACTERS)throw Error("This retained coordinate selection exceeds its recovery bound. Export its original bytes before choosing another selection.");
  const value=schema.parse(JSON.parse(raw));
  if(value.actorId!==context.actorId||value.worldId!==context.worldId||value.timelineId!==context.timelineId)throw Error("This coordinate selection belongs to another account, World or timeline. Its original bytes remain retained.");
  return value;
}
export function encodeAssociationDraft(value:AssociationDraft,context:AssociationContext){const raw=JSON.stringify(value);parseAssociationDraft(raw,context);return raw;}
export function readAssociationDraft(store:AssociationStore,key:string,context:AssociationContext){
  const raw=store.getItem(key);if(raw===null)return;
  try{return {raw,value:parseAssociationDraft(raw,context),error:undefined};}
  catch(error){return {raw,value:undefined,error:error instanceof Error?error.message:"This retained selection could not be read."};}
}
/** Compare exact original bytes: another tab's newer packet is never overwritten. */
export function writeAssociationDraft(store:AssociationStore,key:string,expected:string|null,value:AssociationDraft,context:AssociationContext){
  const raw=encodeAssociationDraft(value,context);
  if(store.getItem(key)!==expected)throw Error("Another tab changed this retained coordinate selection. Export your visible selection before reloading recovery.");
  if(expected!==null){
    const previous=parseAssociationDraft(expected,context);
    if(previous.attempted){
      if(!value.attempted||previous.requestId!==value.requestId||previous.mapId!==value.mapId||previous.surfaceId!==value.surfaceId)throw Error("Retain the exact attempted coordinate association until its original request is acknowledged.");
      return expected;
    }
  }
  store.setItem(key,raw);return raw;
}
export function clearAssociationDraft(store:AssociationStore,key:string,expected:string){
  if(store.getItem(key)!==expected)throw Error("Another tab changed this retained coordinate selection. Its newer bytes remain retained.");
  store.removeItem(key);
}
export function associationCommand(draft:AssociationDraft){
  const value=geographicAuthoringCommand.parse({action:"attach",mapId:draft.mapId,surfaceId:draft.surfaceId,timelineId:draft.timelineId,requestId:draft.requestId});
  if(value.action!=="attach")throw Error("Choose an existing map and coordinate surface.");
  return value;
}

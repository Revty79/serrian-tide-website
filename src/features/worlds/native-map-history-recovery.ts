import { z } from "zod";
import { nativeHistoryCommandSchema, nativeTargetKey, NATIVE_HISTORY_LIMITS, type NativeMapTarget } from "./native-map-history";

export const nativeHistoryDetailsDraftSchema = z.object({ name: z.string().max(160), startYear: z.string().max(32), endYear: z.string().max(32), account: z.string().max(12_000), protected: z.boolean(), source: z.union([z.literal("baseline"), z.uuid()]), editing: z.object({stateId:z.uuid(),revision:z.number().int().positive()}).strict().optional() }).strict();
export type NativeHistoryDetailsDraft = z.infer<typeof nativeHistoryDetailsDraftSchema>;
export const emptyNativeHistoryDetails = (year?: number): NativeHistoryDetailsDraft => ({ name: "", startYear: year?.toString() ?? "", endYear: year?.toString() ?? "", account: "", protected: true, source: "baseline" });
const packetSchema = z.object({ version: z.literal(1).default(1), draft: nativeHistoryDetailsDraftSchema.optional(), pending: nativeHistoryCommandSchema.optional() }).strict();
export type NativeHistoryDetailsPacket = z.infer<typeof packetSchema>;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export function nativeDetailsPrefix(worldId: string, timelineId: string, target: NativeMapTarget) { return `st:native-map-history-details:v1:${worldId}:${timelineId}:${nativeTargetKey(target)}:`; }
export function parseNativeDetails(raw: string, timelineId: string, target: NativeMapTarget) {
  if (raw.length > NATIVE_HISTORY_LIMITS.recoveryCharacters) throw Error("These retained historical details exceed the local recovery bound. Export the original bytes before choosing new details.");
  const value = packetSchema.parse(JSON.parse(raw));
  if (value.pending && (value.pending.timelineId !== timelineId || nativeTargetKey(value.pending.target) !== nativeTargetKey(target))) throw Error("This historical request belongs to a different map or timeline. Its original bytes remain retained.");
  return value;
}
export function readNativeDetails(store: Store, prefix: string, ownKey: string, timelineId: string, target: NativeMapTarget) {
  const keys = [ownKey];
  for (let i = 0; i < store.length; i++) { const key = store.key(i); if (key && key !== ownKey && key.startsWith(prefix) && z.uuid().safeParse(key.slice(prefix.length)).success) keys.push(key); }
  for (const key of keys) {
    const raw = store.getItem(key); if (!raw) continue;
    try { return { key, raw, value: parseNativeDetails(raw, timelineId, target), error: undefined as string | undefined }; }
    catch (error) { return { key, raw, value: undefined, error: error instanceof Error ? error.message : "Retained historical details need review." }; }
  }
}
export type NativeDetailsCandidate = NonNullable<ReturnType<typeof readNativeDetails>>;
export function retireNativeDetails(store: Store, ownKey: string, candidate: Pick<NativeDetailsCandidate, "key" | "raw">, retainedKey: string) {
  if (store.getItem(candidate.key) !== candidate.raw) throw Error("Another tab changed those historical details. Its newer bytes remain retained; reload recovery before retiring a packet.");
  store.setItem(retainedKey, candidate.raw);
  if (store.getItem(retainedKey) !== candidate.raw) throw Error("The original historical packet could not be retained. Keep this page open and export it.");
  if (candidate.key === ownKey && store.getItem(ownKey) === candidate.raw) store.removeItem(ownKey);
}

/** A reloaded or duplicated tab must never overwrite newer bytes implicitly. */
export function writeNativeDetails(store:Store,key:string,expected:string|null,raw:string){
  if(store.getItem(key)!==expected)throw Error("Another tab changed these historical details. Its newer bytes remain retained. Export your visible draft before reloading recovery.");
  store.setItem(key,raw); return raw;
}
export function listRetainedNativeDetails(store:Store,prefix:string,timelineId:string,target:NativeMapTarget):NativeDetailsCandidate[]{
  const values:NativeDetailsCandidate[]=[];
  for(let i=0;i<store.length;i++){const key=store.key(i);if(!key?.startsWith(prefix+"retained:"))continue;const raw=store.getItem(key);if(!raw)continue;try{values.push({key,raw,value:parseNativeDetails(raw,timelineId,target),error:undefined});}catch(e){values.push({key,raw,value:undefined,error:e instanceof Error?e.message:"Unreadable retained details"});}}
  return values;
}

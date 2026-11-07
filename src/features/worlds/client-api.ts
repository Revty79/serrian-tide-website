import type { EntryDraft, EntryRecord, EraDraft, EraRecord, WorldDraft, WorldRecord } from "./history";
import {notifyWorldGeography} from "./terrain-geography-notifications";
import {nativeRequestGeographyContext} from "./native-map-history";
import {worldClientUrl,worldEditorHeaders,worldRequestActor,acceptWorldResponse} from "./world-editor-credentials";
export class SaveError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function worldApi<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  url=worldClientUrl(url);const editingHeaders=worldEditorHeaders(url),actor=worldRequestActor(url);
  const townPreview=method==="POST"&&/\/town-maps$/.test(new URL(url,"https://atlas.invalid").pathname)&&!!body&&typeof body==="object"&&"action"in body&&body.action==="preview";
  if(typeof window!=="undefined"&&method==="POST"&&!townPreview&&new URL(url,location.href).searchParams.has("historicalAtlas")){
    try{return await(await import("./native-map-history-transport-client")).sendOriginalNativeRequest<T>(url,method,body,signal,(u,m,b,s)=>rawWorldApi(u,m,b,s,editingHeaders,actor));}
    catch(error){if(error instanceof SaveError)throw error;throw new SaveError(error instanceof Error?error.message:"Original-request recovery is unavailable. Your draft remains retained.",409);}
  }
  return rawWorldApi<T>(url,method,body,signal,editingHeaders,actor);
}
async function rawWorldApi<T>(url:string,method="GET",body?:unknown,signal?:AbortSignal,editingHeaders:Record<string,string>={},actor?:string):Promise<T>{
  let response: Response;
  try { response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", signal,headers:{...editingHeaders,...(actor?{"X-World-Actor":actor}:{}),...(body?{"Content-Type":"application/json"}:{})}, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new SaveError("The connection failed. Your draft is still here; try again when connected.", 0); }
  const data = await response.json().catch(() => ({ error: "The server response could not be read. Your draft is still here." }));
  if (!response.ok || data?.error) throw new SaveError(data?.error ?? "The request failed. Your draft is still here.", response.status);
  if(actor){if(response.headers.get("X-World-Actor")!==actor)throw new SaveError("World access or the signed-in account changed. Your draft remains retained.",409);try{acceptWorldResponse(url,actor,data,editingHeaders["X-World-Editor"]?JSON.parse(editingHeaders["X-World-Editor"]).fence:undefined);}catch(error){throw new SaveError((error as Error).message,409);}}
  const geography=method!=="GET"&&url.match(/\/api\/worlds\/([^/?]+)\/(?:terrain(?:\?|$|\/(?:refinements|hydrology|environment|materials|artwork|labels)(?:\?|$))|towns(?:\?|$)|atlas-history\/conditions(?:\?|$))/);
  if(geography)notifyWorldGeography(geography[1],nativeRequestGeographyContext(url));
  return data as T;
}
export function worldDraftOf(world?: WorldRecord): WorldDraft { return { name: world?.name ?? "", description: world?.description ?? "", introduction: world?.introduction ?? "", historicalOverview: world?.historicalOverview ?? "", tone: world?.tone ?? "primary", tagIds: world?.tagIds ?? [] }; }
export function eraDraftOf(era?: EraRecord): EraDraft { return { name: era?.name ?? "", description: era?.description ?? "", startYear: era?.startYear ?? null, endYear: era?.endYear ?? null, tone: era?.tone ?? "primary",...(era?.datingSystemId ? {datingSystemId:era.datingSystemId,datingSystemRevision:era.datingSystemRevision} : {}) }; }
export function entryDraftOf(entry?: EntryRecord): EntryDraft { return { title: entry?.title ?? "", account: entry?.account ?? "", notes: entry?.notes ?? "", ...(entry?.eventType ? {eventType:entry.eventType} : {}), ...(entry?.prominence ? {prominence:entry.prominence} : {}), ...(entry?.visibility ? {visibility:entry.visibility} : {}), time: entry?.time ?? { version: 1, scale: "world-year", kind: "undated" }, accuracy: entry?.accuracy ?? "established", narrative: entry?.narrative ?? "recorded", eraIds: entry?.eraIds ?? [],...(entry?.datingSystemId ? {datingSystemId:entry.datingSystemId,datingSystemRevision:entry.datingSystemRevision} : {}) }; }

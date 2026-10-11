import type { EntryDraft, EntryRecord, EraDraft, EraRecord, WorldDraft, WorldRecord } from "./history";
export class SaveError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function worldApi<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) }); }
  catch { throw new SaveError("The connection failed. Your draft is still here; try again when connected.", 0); }
  const data = await response.json().catch(() => ({ error: "The server response could not be read. Your draft is still here." }));
  if (!response.ok || data.error) throw new SaveError(data.error ?? "The request failed. Your draft is still here.", response.status);
  return data as T;
}
export function worldDraftOf(world?: WorldRecord): WorldDraft { return { name: world?.name ?? "", description: world?.description ?? "", introduction: world?.introduction ?? "", historicalOverview: world?.historicalOverview ?? "", tone: world?.tone ?? "primary", tagIds: world?.tagIds ?? [] }; }
export function eraDraftOf(era?: EraRecord): EraDraft { return { name: era?.name ?? "", description: era?.description ?? "", startYear: era?.startYear ?? null, endYear: era?.endYear ?? null, tone: era?.tone ?? "primary",...(era?.datingSystemId ? {datingSystemId:era.datingSystemId,datingSystemRevision:era.datingSystemRevision} : {}) }; }
export function entryDraftOf(entry?: EntryRecord): EntryDraft { return { title: entry?.title ?? "", account: entry?.account ?? "", notes: entry?.notes ?? "", ...(entry?.visibility ? {visibility:entry.visibility} : {}), time: entry?.time ?? { version: 1, scale: "world-year", kind: "undated" }, accuracy: entry?.accuracy ?? "established", narrative: entry?.narrative ?? "recorded", eraIds: entry?.eraIds ?? [],...(entry?.datingSystemId ? {datingSystemId:entry.datingSystemId,datingSystemRevision:entry.datingSystemRevision} : {}) }; }

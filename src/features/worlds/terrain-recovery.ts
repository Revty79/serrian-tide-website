import { z } from "zod";
import { tileSchema, elevationSchema, MAX_TILE_COUNT, type TerrainTile } from "./terrain";
export type TerrainRecovery = { key: string; revision: number; seaLevel: number; tiles: TerrainTile[]; savedAt: string; pending?: { requestId: string; revision: number; seaLevel: number; tiles: TerrainTile[] } };
const tiles = z.array(tileSchema).max(MAX_TILE_COUNT).refine(v => new Set(v.map(t => `${t.x}:${t.y}`)).size === v.length, "The recovered draft contains duplicate tiles.");
const recoverySchema = z.object({ key: z.string(), revision: z.number().int().positive(), seaLevel: elevationSchema, tiles, savedAt: z.iso.datetime(), pending: z.object({ requestId: z.uuid(), revision: z.number().int().positive(), seaLevel: elevationSchema, tiles }).strict().optional() }).strict();
export function parseTerrainRecovery(value: unknown, key: string): TerrainRecovery { const parsed = recoverySchema.parse(value); if (parsed.key !== key) throw new Error("This recovery belongs to another map."); return parsed; }
// IndexedDB avoids the small synchronous localStorage quota and keeps drafts out
// of shared server records. A recovery is never silently accepted on the server.
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("serrian-world-terrain-v1", 1); r.onupgradeneeded = () => r.result.createObjectStore("drafts", { keyPath: "key" }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
export async function terrainRecovery(action: "read" | "write" | "delete", key: string, value?: TerrainRecovery): Promise<TerrainRecovery | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const tx = db.transaction("drafts", action === "read" ? "readonly" : "readwrite"), store = tx.objectStore("drafts"), r = action === "read" ? store.get(key) : action === "write" ? store.put(parseTerrainRecovery(value, key)) : store.delete(key); tx.oncomplete = () => { try { resolve(action === "read" && r.result ? parseTerrainRecovery(r.result, key) : undefined); } catch (error) { reject(error); } }; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error("Recovery storage was interrupted.")); }); } finally { db.close(); }
}

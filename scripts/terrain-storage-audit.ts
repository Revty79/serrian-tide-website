/** Read-only integrity and abandoned-stage audit. Never removes files. */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db, pool } from "../src/db";
import { worldTerrainTile, worldTerrainVersion } from "../src/db/world-terrain-schema";
import { readTerrainTile, terrainRoot } from "../src/features/worlds/terrain-storage";
export async function auditTerrainStorage() {
  const refs = await db.select().from(worldTerrainTile), requests = new Set((await db.select({ requestId: worldTerrainVersion.requestId }).from(worldTerrainVersion)).map(r => r.requestId));
  const objects = new Map(refs.map(r => [r.sha256, r])); for (const ref of objects.values()) await readTerrainTile(ref);
  const root = terrainRoot(), stages: { requestId: string; state: string; partialFiles: number }[] = [], unreferenced: string[] = [];
  for (const directory of await readdir(path.join(root, "staging"), { withFileTypes: true }).catch(e => { if (e.code === "ENOENT") return []; throw e; })) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) continue;
    const files = await readdir(path.join(root, "staging", directory.name));
    const manifest = await readFile(path.join(root, "staging", directory.name, "manifest.json"), "utf8").then(JSON.parse).catch(() => null);
    stages.push({ requestId: directory.name, state: requests.has(directory.name) ? "committed" : manifest ? "abandoned-or-in-flight" : "incomplete-stage", partialFiles: files.filter(f => f.endsWith(".partial")).length });
  }
  for (const prefix of await readdir(path.join(root, "objects"), { withFileTypes: true }).catch(e => { if (e.code === "ENOENT") return []; throw e; })) {
    if (!prefix.isDirectory() || prefix.isSymbolicLink()) continue;
    for (const file of await readdir(path.join(root, "objects", prefix.name))) if (/^[a-f0-9]{64}\.i16$/.test(file) && !objects.has(file.slice(0, 64))) unreferenced.push(file.slice(0, 64));
  }
  return { checkedObjects: objects.size, historicalReferences: refs.length, stages, unreferencedObjects: unreferenced, removesFiles: false };
}
if (process.argv[1]?.endsWith("terrain-storage-audit.ts")) auditTerrainStorage().then(value => console.log(JSON.stringify(value, null, 2))).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());

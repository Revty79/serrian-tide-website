import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { publishRasterFile } from "./raster-storage";
import type { TerrainTile } from "./terrain";
export type TerrainObject = { sha256: string; bytes: number; encoding: string };
export const terrainRoot = () => path.resolve(/* turbopackIgnore: true */ process.env.SERRIAN_TERRAIN_ROOT?.trim() || "storage/world-terrain");
export function terrainObjectPath(root: string, sha256: string) { if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("Invalid terrain object checksum."); return path.join(root, "objects", sha256.slice(0, 2), `${sha256}.i16`); }
async function privateDirectory(directory: string, root: string) { await mkdir(directory, { recursive: true }); const [actual, anchor] = await Promise.all([realpath(directory), realpath(root)]); if (actual !== anchor && !actual.startsWith(anchor + path.sep)) throw new Error("Terrain storage cannot traverse a link outside its private root."); }
export async function stageTerrainTiles(requestId: string, worldId: string, terrainId: string, tiles: TerrainTile[]) {
  if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw new Error("Invalid terrain save identity.");
  const root = terrainRoot(), staging = path.join(root, "staging", requestId); await mkdir(root, { recursive: true }); await privateDirectory(staging, root);
  const objects: (TerrainObject & { x: number; y: number })[] = [];
  const staged = new Map<string, Promise<void>>();
  // Bounded I/O concurrency avoids serial fsync latency without flooding an
  // ordinary computer with a whole map's open files.
  for (let offset = 0; offset < tiles.length; offset += 8) {
    const batch = await Promise.all(tiles.slice(offset, offset + 8).map(async tile => {
    const bytes = Buffer.alloc(2048); tile.samples.forEach((v, i) => bytes.writeInt16LE(v, i * 2));
    const sha256 = createHash("sha256").update(bytes).digest("hex"), target = terrainObjectPath(root, sha256), temporary = path.join(staging, `${sha256}.${randomUUID()}.partial`);
    let published = staged.get(sha256);
    if (!published) { published = (async () => {
    await privateDirectory(path.dirname(target), root);
    // Identical retries reuse an already verified immutable object. Fsync the
    // authored bytes before linking them into their content-addressed location.
    const file = await open(temporary, "wx"); try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    await publishRasterFile(temporary, target, sha256, bytes.length);
    await unlink(temporary);
    })(); staged.set(sha256, published); }
    await published;
    return { x: tile.x, y: tile.y, sha256, bytes: bytes.length, encoding: "i16le-v1" };
    }));
    objects.push(...batch);
  }
  // Manifests are diagnostic staging records, not authority. The database
  // request ID distinguishes committed saves from abandoned stages after a crash.
  await writeFile(path.join(staging, "manifest.json"), JSON.stringify({ format: 1, requestId, worldId, terrainId, stagedAt: new Date().toISOString(), objects }) + "\n");
  return objects;
}
export async function readTerrainTile(object: TerrainObject): Promise<number[]> {
  const root = await realpath(terrainRoot()), candidate = terrainObjectPath(root, object.sha256), file = await realpath(/* turbopackIgnore: true */ candidate);
  if (!file.startsWith(root + path.sep) || object.bytes !== 2048 || object.encoding !== "i16le-v1" || (await stat(file)).size !== object.bytes) throw new Error("The accepted terrain tile is unavailable. Restore its paired database and terrain backup.");
  const bytes = await readFile(file); if (createHash("sha256").update(bytes).digest("hex") !== object.sha256) throw new Error("The accepted terrain tile failed its checksum. Restore its paired database and terrain backup.");
  return Array.from({ length: 1024 }, (_, i) => bytes.readInt16LE(i * 2));
}

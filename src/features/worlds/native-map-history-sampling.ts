import "server-only";
import { z } from "zod";
import { samplePinnedTerrainPoint, type NumericalSampleSource } from "./terrain-numerical-sampling";
import { frameContains, frameGeometry, normalizeTerrainX, rootFrame } from "./terrain-refinement";
import { regionContainsPoint } from "./terrain-regions";
import { readTerrainTile } from "./terrain-storage";
import type { NativeNumericPin } from "./native-map-history-capture";
import { nativeResource, type NativeContentContext } from "./native-map-history-context";
import { nativeAllRefinementIndex, nativeTerrainSource, type NativeRefinementPayload, type NativeTerrainPayload } from "./native-map-history-terrain-read";
import { nativeSavedResource } from "./native-map-history-resources";
import type { NativeHistoryTx } from "./native-map-history-store";
import { WorldError } from "./world-service";
import type {TerrainDocument,TerrainGeometry} from "./terrain";
import type {RefinementIndex} from "./terrain-refinement-client";

export async function nativeNumericPin(tx: NativeHistoryTx, context: NativeContentContext, id: string, revision: number): Promise<NativeNumericPin> {
  const key = `source:${id}:${revision}`;
  if (context.manifest.resources.some(r => r.key === key)) return structuredClone((await nativeResource(tx, context, key)).payload) as unknown as NativeNumericPin;
  const root = await nativeTerrainSource(tx, context);
  if (id === root.document.terrainId) {
    const value = await nativeSavedResource<NativeTerrainPayload>(tx, context, "terrain", revision);
    return { id, revision, parentId: null, parentRevision: null, shape: root.shape, frame: rootFrame(root.shape), baseElevation: value.bundle.document.baseElevation, tileObjects: value.tileObjects };
  }
  const value = await nativeSavedResource<NativeRefinementPayload>(tx, context, "refinement:" + id, revision);
  if (value.meta.id !== id || value.meta.worldId !== context.worldId || value.meta.terrainId !== root.document.terrainId) throw new WorldError("This dated numerical parent has an incompatible identity.", 409);
  return { id, revision, parentId: value.meta.parentId ?? root.document.terrainId, parentRevision: value.meta.parentRevision, shape: frameGeometry(value.meta, root.shape), frame: value.meta.frame, baseElevation: root.document.baseElevation, tileObjects: value.tileObjects.filter(r => (r.lod ?? 0) === 0) };
}
export async function sampleNativeTerrain(tx: NativeHistoryTx, context: NativeContentContext, raw: unknown) {
  return sampleNativeTerrainPack(await nativeTerrainSource(tx,context),await nativeAllRefinementIndex(tx,context),(id,revision)=>nativeNumericPin(tx,context,id,revision),raw);
}
/** Both retained and explicitly reviewed baseline packs use this same sampler. */
export async function sampleNativeTerrainPack(root:{document:TerrainDocument;shape:TerrainGeometry},index:RefinementIndex,pin:(id:string,revision:number)=>Promise<NativeNumericPin>,raw:unknown){
  const points = z.array(z.object({ x: z.number().finite().min(0).max(1e9), y: z.number().finite().min(0).max(1e9) }).strict()).min(1).max(64).parse(raw);
  const sources = new Map<string, Promise<NumericalSampleSource>>(), objects = new Map<string, Promise<number[]>>();
  const load = (id: string, revision: number) => {
    const key = `${id}:${revision}`;
    let pending = sources.get(key);
    if (!pending) {
      pending = pin(id, revision).then(source => {
        const refs = new Map(source.tileObjects.map(r => [`${r.x}:${r.y}`, r]));
        return { ...source, at: async (column: number, row: number) => {
          const ref = refs.get(`${Math.floor(column / 32)}:${Math.floor(row / 32)}`);
          if (!ref) { if (source.parentId) throw new WorldError("An exact historical interpolation object is missing. Restore its paired terrain backup.", 409); return source.baseElevation; }
          let values = objects.get(ref.sha256); if (!values) { values = readTerrainTile(ref); objects.set(ref.sha256, values); }
          return (await values)[row % 32 * 32 + column % 32];
        } };
      });
      sources.set(key, pending);
    }
    return pending;
  };
  const result = [];
  for (const point of points) {
    if (root.document.region && !regionContainsPoint(root.document.region, point, root.shape)) throw new WorldError("Choose sample positions inside this dated regional outline.", 400);
    if (point.y > root.shape.displayHeight || !root.shape.wrap && point.x > root.shape.displayWidth) throw new WorldError("Choose numerical samples inside this World.", 400);
    const p = { ...point, x: root.shape.wrap ? normalizeTerrainX(point.x, root.shape.displayWidth) : point.x };
    const meta = index.refinements.filter(r => frameContains(r.frame, p, root.shape.displayWidth, root.shape.wrap)).sort((a, b) => b.level - a.level)[0];
    const shape = meta ? frameGeometry(meta, root.shape) : root.shape;
    result.push({ ...p, elevation: await samplePinnedTerrainPoint(p, meta?.id ?? root.document.terrainId, meta?.revision ?? root.document.revision, root.shape, load), interpolated: true, sourceId: meta?.id ?? null, revision: meta?.revision ?? root.document.revision, level: meta?.level ?? 0, spacingX: shape.displayWidth / shape.width, spacingY: shape.displayHeight / shape.height });
  }
  return { points: result };
}

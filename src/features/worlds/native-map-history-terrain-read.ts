import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { readTerrainTile } from "./terrain-storage";
import { terrainGeometry, type TerrainDocument, type TerrainSummary } from "./terrain";
import { frameGeometry, lodGeometry, rootFrame, type RefinementMeta } from "./terrain-refinement";
import { regionContainsFrame, regionOverlaps, terrainSourceState } from "./terrain-regions";
import type { HydroSources, HydroSource } from "./terrain-hydrology";
import type { RefinementIndex } from "./terrain-refinement-client";
import type { NativeTileObject } from "./native-map-history-capture";
import { nativeResource, type NativeContentContext } from "./native-map-history-context";
import type { NativeHistoryTx } from "./native-map-history-store";
import { WorldError } from "./world-service";
import { nativeSavedResource } from "./native-map-history-resources";

export type NativeTerrainPayload = {
  bundle: { maps: TerrainSummary[]; document: TerrainDocument; canEdit: boolean };
  tileObjects: NativeTileObject[]; baselineRevision: number; sourceHash: string;
};
export type NativeRefinementPayload = {
  meta: RefinementMeta; baselineRevision: number; tileObjects: NativeTileObject[];
  version: { revision: number; requestId: string; rootRevision: number; parentRevision: number; contentHash: string; source: TerrainDocument["source"] };
};
export async function nativeTerrainSource(tx: NativeHistoryTx, context: NativeContentContext) {
  const component = await nativeResource(tx, context, "terrain");
  let value = component.payload as unknown as NativeTerrainPayload;
  if (context.authority) {
    const projection = (await nativeResource(tx, context, "terrain-view")).payload.document as unknown as NativeTerrainPayload["bundle"]["document"];
    value = { ...value, bundle: { ...value.bundle, document: { ...value.bundle.document, ...projection } } };
    if (!value.bundle.maps.some(m => m.id === context.scope.target.id)) value = { ...value, bundle: { ...value.bundle, maps: [...value.bundle.maps, { id: projection.id, name: projection.name, revision: value.bundle.document.revision, seaLevel: value.bundle.document.seaLevel, updatedAt: value.bundle.document.updatedAt, mapRevision: projection.mapRevision, purpose: "regional", parentMapId: projection.region!.parentMapId, frame: projection.region!.frame }] } };
  }
  if (!value.bundle?.document || value.bundle.document.id !== context.scope.target.id || value.bundle.document.worldId !== context.worldId)
    throw new WorldError("The retained historical terrain does not match this exact map identity. No baseline was substituted.", 409);
  return { component, value, document: value.bundle.document, shape: terrainGeometry(value.bundle.document.settings) };
}
export async function readNativeTerrain(tx: NativeHistoryTx, context: NativeContentContext) {
  const source = await nativeTerrainSource(tx, context), tiles = [];
  if (source.value.tileObjects.length > source.shape.width * source.shape.height / 1024) throw new WorldError("The historical terrain reference set exceeds its accepted grid.", 409);
  const seen = new Set<string>();
  for (const ref of source.value.tileObjects) {
    if (!Number.isInteger(ref.x) || !Number.isInteger(ref.y) || ref.x < 0 || ref.y < 0 || ref.x >= source.shape.width / 32 || ref.y >= source.shape.height / 32 || seen.has(`${ref.x}:${ref.y}`)) throw new WorldError("The historical terrain reference coordinates are invalid.", 409);
    seen.add(`${ref.x}:${ref.y}`);
  }
  for (let offset = 0; offset < source.value.tileObjects.length; offset += 16)
    tiles.push(...await Promise.all(source.value.tileObjects.slice(offset, offset + 16).map(async ref => ({ x: ref.x, y: ref.y, samples: await readTerrainTile(ref) }))));
  return { ...structuredClone(source.value.bundle), canEdit: context.canEdit,
    document: { ...structuredClone(source.document), tiles, tilesUnchanged: false, canEdit: context.canEdit && !source.document.region,
      historicalSource: { stateId: context.scope.stateId, timelineId: context.scope.timelineId, versionId: context.version.id, componentId: source.component.id } } };
}
export async function nativeAllRefinementIndex(tx: NativeHistoryTx, context: NativeContentContext): Promise<RefinementIndex> {
  const root = await nativeTerrainSource(tx, context);
  const component = await nativeResource(tx, context, "refinements"), stored = (component.payload as unknown as { index: RefinementIndex }).index;
  if (!stored || !Array.isArray(stored.refinements)) throw new WorldError("The retained finer-source index is unavailable.", 409);
  const value = structuredClone(stored);
  value.refinements = value.refinements.map(meta => ({ ...meta, mapId: context.scope.target.id }));
  value.rootRevision = root.document.revision; value.seaLevel = root.document.seaLevel;
  value.sourceState = terrainSourceState(root.document.revision, value.refinements); value.canEdit = context.canEdit;
  return value;
}
export async function nativeRefinementIndex(tx: NativeHistoryTx, context: NativeContentContext): Promise<RefinementIndex> {
  const value = await nativeAllRefinementIndex(tx, context), root = await nativeTerrainSource(tx, context);
  if (root.document.region) value.refinements = value.refinements.filter(meta => regionOverlaps(root.document.region!, meta.frame, root.shape));
  return value;
}
export async function readNativeRefinement(tx: NativeHistoryTx, context: NativeContentContext, id: string, input: { lod: number; keys: number[]; revision?: number; historical?: boolean }) {
  const request = z.object({ lod: z.number().int().min(0).max(5), keys: z.array(z.number().int().min(0).max(1023)).min(1).max(64).refine(v => new Set(v).size === v.length), revision: z.number().int().positive().optional(), historical: z.boolean().optional() }).strict().parse(input);
  const root = await nativeTerrainSource(tx, context), index = await nativeAllRefinementIndex(tx, context);
  const head = index.refinements.find(r => r.id === id);
  if (!head) throw new WorldError("This finer source is not retained by the selected historical appearance.", 404);
  const stored = await nativeSavedResource<NativeRefinementPayload>(tx, context, "refinement:" + id, request.revision), meta = stored.meta;
  if (stored.meta?.id !== id || stored.meta.terrainId !== root.document.terrainId || stored.meta.worldId !== context.worldId) throw new WorldError("The retained finer source has an incompatible identity.", 409);
  if (request.lod > meta.overviewLevels) throw new WorldError("This historical finer source has no such numerical overview.", 400);
  const shape = lodGeometry(frameGeometry(meta, root.shape), request.lod), columns = shape.width / 32;
  if (request.keys.some(key => key >= shape.width * shape.height / 1024)) throw new WorldError("Choose tiles inside the retained numerical source.", 400);
  const references = new Map(stored.tileObjects.filter(ref => (ref.lod ?? 0) === request.lod).map(ref => [ref.y * columns + ref.x, ref]));
  const tiles = [];
  for (let offset = 0; offset < request.keys.length; offset += 8) tiles.push(...await Promise.all(request.keys.slice(offset, offset + 8).map(async key => {
    const reference = references.get(key); if (!reference) throw new WorldError("An accepted historical numerical object is missing. Restore the paired database and terrain backup.", 409);
    return { x: reference.x, y: reference.y, samples: await readTerrainTile(reference), sha256: reference.sha256, mask: reference.mask };
  })));
  return { refinement: meta, headRevision: head.revision, tiles, lod: request.lod, source: stored.version.source, acceptedRequestId: stored.version.requestId,
    rootRevision: root.document.revision, seaLevel: root.document.seaLevel, rootRevisionAtSave: stored.version.rootRevision,
    canEdit: context.canEdit && meta.revision === head.revision && !request.historical && request.lod === 0 && (!root.document.region || regionContainsFrame(root.document.region, meta.frame, root.shape)) };
}
export async function nativeHydrologySources(tx: NativeHistoryTx, context: NativeContentContext): Promise<HydroSources> {
  const root = await nativeTerrainSource(tx, context), index = await nativeAllRefinementIndex(tx, context);
  const hashes = (await nativeResource(tx, context, "refinements")).payload.sourceHashes as Record<string, string> | undefined;
  const sources: HydroSource[] = [{ id: root.document.terrainId, parentId: null, level: 0, revision: root.document.revision,
    gridWidth: root.shape.width, gridHeight: root.shape.height, frame: rootFrame(root.shape), contentHash: root.value.sourceHash }];
  for (const meta of index.refinements) {
    const contentHash = hashes?.[meta.id];
    if (!contentHash) throw new WorldError("The pinned historical finer-source hash is missing. No current-day source was substituted.", 409);
    sources.push({ id: meta.id, parentId: meta.parentId, level: meta.level, revision: meta.revision,
      gridWidth: meta.gridWidth, gridHeight: meta.gridHeight, frame: meta.frame, contentHash });
  }
  sources.sort((a, b) => a.level - b.level || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const value = { rootRevision: root.document.revision, seaLevel: root.document.seaLevel,
    world: { width: root.shape.displayWidth, height: root.shape.displayHeight, wrap: root.shape.wrap }, sources };
  return { fingerprint: createHash("sha256").update(JSON.stringify(value)).digest("hex"), ...value };
}

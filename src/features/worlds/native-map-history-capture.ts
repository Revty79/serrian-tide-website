import { withWorldRetainedSourceRead } from "./world-retained-source-authority";
import { nativeWorldScope } from "./world-permissions";
import { worldReadAccess } from "./world-service";
import { worldProtectedContent } from "./world-access-service";
import { worldUndergroundLevel } from "@/db/world-underground-schema";
import { redactUnderground } from "./underground";
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { worldTerrainRefinementVersion } from "@/db/world-terrain-refinement-schema";
import { worldTerrainVersion } from "@/db/world-terrain-schema";
import {worldCraftPlacement} from "@/db/world-craft-schema";
import { getTerrain } from "./terrain-service";
import { getRefinements } from "./terrain-refinement-service";
import { getTerrainHydrology } from "./terrain-hydrology-service";
import { getTerrainEnvironment } from "./terrain-environment-service";
import { getTerrainMaterials } from "./terrain-material-service";
import { getMapAppearance } from "./terrain-appearance-service";
import { getMapStyles } from "./terrain-style-service";
import { getTerrainArtwork } from "./terrain-artwork-service";
import { getTerrainLabels } from "./terrain-labels-service";
import { getAdvancedTerrainContext } from "./terrain-advanced-service";
import { getWorldTowns } from "./world-town-service";
import { getTownMaps, townBackdrop } from "./town-map-service";
import { getBuildingFloors } from "./building-floor-service";
import { getUnderground } from "./underground-service";
import { getCrafts } from "./craft-service";
import { getAssetComposition } from "./atlas-asset-service";
import { terrainMapContext } from "./terrain-map-context";
import { nativeContentHash, nativeHistoryMissing, storeNativeComponent, type NativeHistoryTx } from "./native-map-history-store";
import { NATIVE_HISTORY_LIMITS, nativeManifestSchema, type NativeManifest, type NativeResource } from "./native-map-history";
import type { NativeTargetInfo } from "./native-map-history-target";
import { WorldError } from "./world-service";
import type { TerrainObject } from "./terrain-storage";
import { terrainGeometry, type TerrainGeometry } from "./terrain";
import { frameGeometry, rootFrame, type TerrainFrame } from "./terrain-refinement";

export type NativeTileObject = TerrainObject & { x: number; y: number; mask: string; lod?: number };
export type NativeNumericPin = { id: string; revision: number; parentId: string | null; parentRevision: number | null; shape: TerrainGeometry; frame: TerrainFrame; baseElevation: number; tileObjects: NativeTileObject[] };
export type CapturedNativeResource = { key: string; kind: NativeResource["kind"]; payload: Record<string, unknown> };
export type CapturedNativeSource = {
  resources: CapturedNativeResource[]; dependencies: NativeManifest["dependencies"];
  pin: string; summary: { label: string; revision: number; resources: number; terrainSamples: number };
};
const object = (input: unknown) => JSON.parse(JSON.stringify(input)) as Record<string, unknown>;

/** Call while the existing owned-World lock is held. All native map writers use
 * that same lock, so these established read services observe one accepted source.
 * No baseline writer, asset binary copy or numerical materialization is used. */
export async function captureNativeBaseline(tx: NativeHistoryTx, authorId: string, worldId: string, info: NativeTargetInfo,options:{review?:boolean}={}): Promise<CapturedNativeSource> {
 const access=await worldReadAccess(authorId,worldId,!!options.review,["history","appearances",nativeWorldScope(info.target.kind)]);
 return withWorldRetainedSourceRead(access,()=>captureRetainedNativeBaseline(tx,authorId,worldId,info));
}
async function captureRetainedNativeBaseline(tx: NativeHistoryTx, authorId: string, worldId: string, info: NativeTargetInfo): Promise<CapturedNativeSource> {
  const resources: CapturedNativeResource[] = [];
  let captureBytes = 0;
  const add = (key: string, kind: NativeResource["kind"], value: unknown) => {
    const payload = object(value), bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
    captureBytes += bytes;
    if (bytes > NATIVE_HISTORY_LIMITS.componentBytes || captureBytes > NATIVE_HISTORY_LIMITS.captureBytes)
      throw new WorldError("This source exceeds the bounded historical capture size. No source was reduced or saved.", 413);
    resources.push({ key, kind, payload });
  };
  let terrainSamples = 0;
  if (info.target.kind === "terrain") {
    const context = await terrainMapContext(tx, worldId, info.target.id);
    const bundle = await getTerrain(authorId, worldId, { mapId: info.target.id, knownTerrainId: context.terrain.id, knownRevision: context.terrain.revision });
    if (!bundle.document) throw nativeHistoryMissing();
    const tileObjects = (await tx.execute<NativeTileObject>(sql`select distinct on(tile_x,tile_y) tile_x x,tile_y y,sha256,bytes,encoding,manual_protection mask
      from world_terrain_tile where terrain_id=${context.terrain.id} and world_id=${worldId} and revision<=${context.terrain.revision} and detail_level=0
      order by tile_x,tile_y,revision desc`)).rows;
    const [accepted] = await tx.select({ contentHash: worldTerrainVersion.contentHash }).from(worldTerrainVersion).where(and(eq(worldTerrainVersion.terrainId, context.terrain.id), eq(worldTerrainVersion.revision, context.terrain.revision), eq(worldTerrainVersion.worldId, worldId)));
    if (!accepted) throw nativeHistoryMissing();
    add("terrain", "terrain", { bundle: { ...bundle, document: { ...bundle.document, tiles: [], tilesUnchanged: false } }, tileObjects, baselineRevision: context.terrain.revision, sourceHash: accepted.contentHash });
    terrainSamples = context.terrain.gridWidth * context.terrain.gridHeight;
    // Retain the complete accepted numerical source pack for hydrology and
    // protection; the regional UI still projects only intersecting metadata.
    const index = await getRefinements(authorId, worldId, info.anchorMapId);
    index.refinements.sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
    const sourceHashes: Record<string, string> = {};
    for (const meta of index.refinements) {
      const [version] = await tx.select().from(worldTerrainRefinementVersion).where(and(eq(worldTerrainRefinementVersion.refinementId, meta.id), eq(worldTerrainRefinementVersion.worldId, worldId), eq(worldTerrainRefinementVersion.revision, meta.revision)));
      if (!version) throw nativeHistoryMissing();
      sourceHashes[meta.id] = version.contentHash;
      const objects = (await tx.execute<NativeTileObject>(sql`select distinct on(lod,tile_x,tile_y) lod,tile_x x,tile_y y,sha256,bytes,encoding,manual_protection mask
        from world_terrain_refinement_tile where refinement_id=${meta.id} and terrain_id=${context.terrain.id} and world_id=${worldId} and revision<=${meta.revision}
        order by lod,tile_x,tile_y,revision desc`)).rows;
      add("refinement:" + meta.id, "refinement", { meta, version, tileObjects: objects, baselineRevision: meta.revision });
    }
    add("refinements", "refinement", { index, sourceHashes });
    // Existing interpolation collars can refer to a parent older than its
    // current head. Retain those exact objects, not a later parent's samples.
    const rootShape = terrainGeometry(bundle.document.settings);
    const queue = index.refinements.map(meta => ({ id: meta.parentId ?? context.terrain.id, revision: meta.parentRevision })), seen = new Set<string>();
    while (queue.length) {
      const pin = queue.shift()!, key = `${pin.id}:${pin.revision}`;
      if (seen.has(key)) continue; seen.add(key);
      const meta = index.refinements.find(r => r.id === pin.id);
      if (pin.id === context.terrain.id && pin.revision === context.terrain.revision || meta?.revision === pin.revision) continue;
      if (!meta && pin.id !== context.terrain.id) throw nativeHistoryMissing();
      const objects = (await tx.execute<NativeTileObject>(meta ? sql`select distinct on(tile_x,tile_y) tile_x x,tile_y y,sha256,bytes,encoding,manual_protection mask from world_terrain_refinement_tile where refinement_id=${meta.id} and terrain_id=${context.terrain.id} and world_id=${worldId} and revision<=${pin.revision} and lod=0 order by tile_x,tile_y,revision desc`
        : sql`select distinct on(tile_x,tile_y) tile_x x,tile_y y,sha256,bytes,encoding,manual_protection mask from world_terrain_tile where terrain_id=${context.terrain.id} and world_id=${worldId} and revision<=${pin.revision} and detail_level=0 order by tile_x,tile_y,revision desc`)).rows;
      const [version] = meta ? await tx.select().from(worldTerrainRefinementVersion).where(and(eq(worldTerrainRefinementVersion.refinementId, meta.id), eq(worldTerrainRefinementVersion.worldId, worldId), eq(worldTerrainRefinementVersion.revision, pin.revision)))
        : await tx.select().from(worldTerrainVersion).where(and(eq(worldTerrainVersion.terrainId, context.terrain.id), eq(worldTerrainVersion.worldId, worldId), eq(worldTerrainVersion.revision, pin.revision)));
      if (!version) throw nativeHistoryMissing();
      const parentRevision = "parentRevision" in version ? version.parentRevision : null;
      const value: NativeNumericPin = { ...pin, parentId: meta ? meta.parentId ?? context.terrain.id : null, parentRevision,
        shape: meta ? frameGeometry(meta, rootShape) : rootShape, frame: meta?.frame ?? rootFrame(rootShape), baseElevation: context.terrain.baseElevation, tileObjects: objects };
      add("source:" + key, meta ? "refinement" : "terrain", value);
      if (value.parentId && parentRevision !== null) queue.push({ id: value.parentId, revision: parentRevision });
    }
    // The root identities are unchanged; each returned native layer retains its
    // accepted revision and manual/source information, rather than a screenshot.
    add("hydrology", "hydrology", await getTerrainHydrology(authorId, worldId, info.target.id));
    add("environment", "environment", await getTerrainEnvironment(authorId, worldId, info.target.id));
    add("materials", "materials", await getTerrainMaterials(authorId, worldId, info.target.id));
    add("appearance", "appearance", await getMapAppearance(authorId, worldId, info.target.id));
    add("styles", "appearance", await getMapStyles(authorId, worldId, info.target.id));
    add("artwork", "artwork", await getTerrainArtwork(authorId, worldId, info.target.id));
    add("labels", "labels", await getTerrainLabels(authorId, worldId, info.target.id));
    add("advanced", "terrain", await getAdvancedTerrainContext(authorId, worldId, info.anchorMapId));
    add("places", "places", await getWorldTowns(authorId, worldId, { mapId: info.target.id }));
    const craftPositions=await getCrafts(authorId,worldId,{mapId:info.target.id});
    while(craftPositions.next!==null){const page=await getCrafts(authorId,worldId,{mapId:info.target.id,offset:craftPositions.next});craftPositions.crafts.push(...page.crafts);craftPositions.next=page.next;if(craftPositions.crafts.length>512)throw new WorldError("This source exceeds the retained craft inventory allowance.",413);}
    const positions=await tx.select().from(worldCraftPlacement).where(and(eq(worldCraftPlacement.worldId,worldId),eq(worldCraftPlacement.terrainId,context.terrain.id)));
    craftPositions.crafts=craftPositions.crafts.map(craft=>({...craft,placed:craftPositions.markers.some(marker=>marker.id===craft.id)}));
    add("craft-positions", "placement", {...craftPositions,positions});
    add("connections", "connections", await getUnderground(authorId, worldId, { map: { kind: "world", atlasMapId: info.target.id } }));
  } else if (info.target.kind === "town") {
    const bundle = await getTownMaps(authorId, worldId, { mapId: info.target.id });
    if (!bundle.document) throw nativeHistoryMissing();
    add("town", "town", { bundle });
    add("backdrop", "terrain", await townBackdrop(authorId, worldId, bundle.document.sourceMapId, bundle.document.frame));
    add("connections", "connections", await getUnderground(authorId, worldId, { map: { kind: "town", townMapId: info.target.id } }));
  } else if (info.target.kind === "floor") {
    if (!info.townMapId || !info.featureId) throw nativeHistoryMissing();
    const bundle = await getBuildingFloors(authorId, worldId, { townMapId: info.townMapId, featureId: info.featureId, floorId: info.target.id });
    if (!bundle.document) throw nativeHistoryMissing();
    add("floor", "floor", { bundle });
    add("connections", "connections", await getUnderground(authorId, worldId, { map: { kind: "interior", floorId: info.target.id } }));
  } else if (info.target.kind === "underground") {
    const bundle = await getUnderground(authorId, worldId, { levelId: info.target.id });
    if (!bundle.document) throw nativeHistoryMissing();
    const [retained]=await tx.select({design:worldUndergroundLevel.design}).from(worldUndergroundLevel).where(and(eq(worldUndergroundLevel.worldId,worldId),eq(worldUndergroundLevel.id,info.target.id)));
    if(!retained)throw nativeHistoryMissing();
    if(!worldProtectedContent(worldId)&&JSON.stringify(redactUnderground(retained.design).features)!==JSON.stringify(retained.design.features))throw new WorldError("This source includes hidden underground details. Ask its owner for protected-content permission before copying the whole source.",403);
    // The accepted copy retains original creator notes. Only the read projection
    // is redacted; an invited author never replaces source bytes with a preview.
    bundle.document.design=retained.design;
    add("underground", "underground", { bundle });
  } else {
    if (!info.craftId) throw nativeHistoryMissing();
    const bundle = await getCrafts(authorId, worldId, { craftId: info.craftId, surface: info.target.kind === "deck" ? info.target.id : "exterior" });
    if (!bundle.craft || info.target.kind === "deck" && !bundle.deck) throw nativeHistoryMissing();
    if (info.target.kind === "deck") {
      add("craft-context", "craft", { bundle: { ...bundle, deck: null, history: [] } });
      add("deck", "deck", { deck: bundle.deck, history: bundle.history });
    } else add("craft", "craft", { bundle });
  }
  const compositionKind = info.target.kind === "deck" ? "craft-deck" : info.target.kind;
  add("composition", "composition", await getAssetComposition(authorId, worldId, { kind: compositionKind, id: info.target.id }));
  add("conditions", "conditions", { values: [] });
  if (resources.length > NATIVE_HISTORY_LIMITS.components) throw new WorldError("This historical source has too many independent components. Select a smaller accepted map source; no detail was reduced.", 413);
  const summary = { label: info.name, revision: info.revision, resources: resources.length, terrainSamples };
  return { resources, dependencies: [], pin: nativeContentHash({ target: info.target, anchorMapId: info.anchorMapId, resources }), summary };
}

export async function retainCapturedNativeSource(tx: NativeHistoryTx, authorId: string, worldId: string, info: NativeTargetInfo, captured: CapturedNativeSource) {
  const resources: NativeResource[] = [];
  for (const resource of captured.resources) {
    const componentId = await storeNativeComponent(tx, worldId, authorId, resource.kind, resource.payload);
    resources.push({ key: resource.key, kind: resource.kind, componentId });
  }
  return nativeManifestSchema.parse({ version: 1, target: info.target, resources, dependencies: captured.dependencies });
}

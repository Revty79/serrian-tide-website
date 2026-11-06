import "server-only";
import { sql } from "drizzle-orm";
import { nativeTargetKey, resolveNativeHistory, type NativeManifest, type NativeResource } from "./native-map-history";
import { nativeChoices, loadNativeVersion, nativeManifestOf, storeNativeComponent, type NativeHistoryTx } from "./native-map-history-store";
import type { NativeTerrainPayload } from "./native-map-history-terrain-read";
import { WorldError } from "./world-service";

export const nativeGeographicResource = (key: string) => ["terrain", "refinements", "hydrology", "environment", "materials", "artwork", "labels", "advanced", "places", "craft-positions", "conditions","territories"].includes(key) || key.startsWith("refinement:") || key.startsWith("source:");
/** A Region owns its projection/presentation. Numerical and geographic layers
 * share the selected dated World authority; no independent regional grid. */
export async function bindNativeRegion(tx: NativeHistoryTx, worldId: string, authorId: string, timelineId: string, year: number, manifest: NativeManifest, expectedVersionId?: string | null) {
  if (manifest.target.kind !== "terrain") return manifest;
  let view = manifest.resources.find(r => r.key === "terrain-view");
  if (!view) {
    const terrain = manifest.resources.find(r => r.key === "terrain");
    if (!terrain) return manifest;
    const rows = (await tx.execute<{ payload: NativeTerrainPayload }>(sql`select payload from world_map_state_component where id=${terrain.componentId} and world_id=${worldId}`)).rows;
    const document = rows[0]?.payload?.bundle?.document;
    if (!document?.region) return manifest;
    const projection = { id: document.id, name: document.name, mapRevision: document.mapRevision, purpose: document.purpose, region: document.region, sourceMapId: document.sourceMapId };
    view = { key: "terrain-view", kind: "terrain", componentId: await storeNativeComponent(tx, worldId, authorId, "terrain", { document: projection }) };
  }
  const row = (await tx.execute<{ payload: { document: NativeTerrainPayload["bundle"]["document"] } }>(sql`select payload from world_map_state_component where id=${view.componentId} and world_id=${worldId}`)).rows[0];
  const rootId = row?.payload.document.region?.parentMapId;
  if (!rootId) throw new WorldError("The retained regional projection has no established World identity.", 409);
  const target = { kind: "terrain" as const, id: rootId }, root = resolveNativeHistory(await nativeChoices(tx, worldId, timelineId, target), target, year);
  if (!root) throw new WorldError("Create or explicitly retain the dated parent World appearance for this year before authoring this Region. Current World geography was not substituted.", 409);
  if (!expectedVersionId || root.versionId !== expectedVersionId) throw new WorldError("The dated parent World source changed or was not explicitly reviewed. Retain the original packet and review its exact source before starting a new regional appearance request.", 409);
  const source = await loadNativeVersion(tx, worldId, root.versionId, target), geographic = nativeManifestOf(source).resources.filter(r => nativeGeographicResource(r.key));
  const local = manifest.resources.filter(r => !nativeGeographicResource(r.key) && r.key !== "terrain-view");
  if (!local.some(r => r.key === "label-view")) {
    const labels = manifest.resources.find(r => r.key === "labels");
    const saved = labels ? (await tx.execute<{ payload: { layer: { visible: boolean; suggestions: boolean; composition: unknown } } }>(sql`select payload from world_map_state_component where id=${labels.componentId} and world_id=${worldId}`)).rows[0]?.payload.layer : undefined;
    if (saved) local.push({ key: "label-view", kind: "labels", componentId: await storeNativeComponent(tx, worldId, authorId, "labels", { revision: 0, visible: saved.visible, suggestions: saved.suggestions, composition: saved.composition }) });
  }
  const resources: NativeResource[] = [...local, view, ...geographic];
  return { ...manifest, resources, dependencies: [...manifest.dependencies.filter(d => nativeTargetKey(d.target) !== nativeTargetKey(target)), { target, versionId: source.id }] };
}

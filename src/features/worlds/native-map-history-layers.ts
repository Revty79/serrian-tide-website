import "server-only";
import type { z } from "zod";
import { materialSaveSchema, validateMaterialFrame } from "./terrain-materials";
import { hydroSaveSchema, validateHydroFrame, type HydroLayer } from "./terrain-hydrology";
import { environmentSaveSchema, validateEnvironmentFrame, type EnvironmentLayer } from "./terrain-environment";
import { artworkSaveSchema, validateArtworkFrame } from "./terrain-artwork";
import { labelsSaveSchema, validateLabelsFrame, labelSourceKey,type LabelsLayer } from "./terrain-labels";
import {nativeLabelSourceCatalog} from "./native-map-history-label-sources";
import { appearanceSaveSchema } from "./terrain-appearance";
import { checkProvenance } from "./terrain-hydrology-service";
import { provenance } from "./terrain-environment-service";
import { regionalArtwork, regionalEnvironment, regionalHydrology, regionalLabels, regionalMaterials } from "./terrain-regional-layers";
import { nativeAllRefinementIndex, nativeHydrologySources, nativeTerrainSource } from "./native-map-history-terrain-read";
import { nativeResource, type NativeContentContext } from "./native-map-history-context";
import { assertNativeRevision, assertNativeTarget, nativeSavedResource } from "./native-map-history-resources";
import { nativeContentHash, type NativeHistoryTx } from "./native-map-history-store";
import type { NativeWriteResult } from "./native-map-history-write";
import { WorldError } from "./world-service";

export const nativeLayerSchemas = {
  materials: materialSaveSchema, hydrology: hydroSaveSchema, environment: environmentSaveSchema,
  artwork: artworkSaveSchema, labels: labelsSaveSchema, appearance: appearanceSaveSchema,
};
export type NativeLayerKey = keyof typeof nativeLayerSchemas;
type LayerCommand = z.infer<(typeof nativeLayerSchemas)[Exclude<NativeLayerKey, "appearance">]>;
type LayerSaved = { revision: number; headRevision?: number; layer: LayerCommand["layer"]; regional?: LayerCommand["regional"] };

export async function saveNativeLayer(tx: NativeHistoryTx, context: NativeContentContext, key: NativeLayerKey, raw: unknown): Promise<NativeWriteResult> {
  const command = nativeLayerSchemas[key].parse(raw);
  assertNativeTarget(context, command.mapId, "terrain");
  const stored = await nativeResource(tx, context, key), previous = structuredClone(stored.payload);
  assertNativeRevision(stored.revision, command.revision);
  const root = await nativeTerrainSource(tx, context);
  const world = { width: root.shape.displayWidth, height: root.shape.displayHeight, wrap: root.shape.wrap };
  if (key === "appearance" && "spec" in command) {
    const revision = command.revision + 1;
    return { updates: [{ key, kind: "appearance", payload: { ...previous, revision, spec: command.spec } }], result: { revision } };
  }
  if (!("layer" in command)) throw new WorldError("Choose a native map layer.", 400);
  const old = previous as unknown as LayerSaved;
  const regional = "regional" in command ? command.regional : undefined;
  const region = root.document.region;
  if (!!region !== !!regional) throw new WorldError("Retain the exact regional source binding before saving this historical layer.", 409);
  if (region && regional) {
    const index = await nativeAllRefinementIndex(tx, context);
    if (regional.regionMapId !== context.scope.target.id || regional.parentMapId !== region.parentMapId || regional.terrainId !== root.document.terrainId || regional.regionRevision !== region.revision) throw new WorldError("The historical regional identity or projection changed. Keep the exact draft and review its saved source.", 409);
    if (regional.sourceState !== index.sourceState) throw new WorldError("Historical numerical sources changed. Refresh the dated source before accepting this regional draft.", 409);
    const scope = { frame: region.frame, footprint: region.footprint, world };
    try {
      switch (key) {
        case "materials": command.layer = regionalMaterials(materialSaveSchema.shape.layer.parse(old.layer), materialSaveSchema.parse(command).layer, scope); break;
        case "hydrology": command.layer = regionalHydrology(hydroSaveSchema.shape.layer.parse(old.layer), hydroSaveSchema.parse(command).layer, scope); break;
        case "environment": command.layer = regionalEnvironment(environmentSaveSchema.shape.layer.parse(old.layer), environmentSaveSchema.parse(command).layer, scope); break;
        case "artwork": command.layer = regionalArtwork(artworkSaveSchema.shape.layer.parse(old.layer), artworkSaveSchema.parse(command).layer, scope); break;
        case "labels": { const incoming = labelsSaveSchema.parse(command).layer; command.layer = { ...regionalLabels(labelsSaveSchema.shape.layer.parse(old.layer), incoming, scope), visible: incoming.visible, suggestions: incoming.suggestions, composition: incoming.composition }; break; }
      }
    } catch (error) { throw new WorldError((error as Error).message, 400); }
  }
  const restoreRevision = "restoreRevision" in command ? command.restoreRevision : undefined;
  if (restoreRevision !== undefined) {
    const restored = await nativeSavedResource<LayerSaved>(tx, context, key, restoreRevision);
    if (nativeContentHash(restored.layer) !== nativeContentHash(command.layer)) throw new WorldError("Restore the exact retained historical layer before making further changes.", 400);
  } else {
    try {
      switch (key) {
        case "materials": validateMaterialFrame(materialSaveSchema.parse(command).layer, root.shape); break;
        case "hydrology": {
          const layer = hydroSaveSchema.parse(command).layer;
          validateHydroFrame(layer, world);
          if ((layer.systemVersion ?? 1) < ((old.layer as HydroLayer).systemVersion ?? 1)) throw new WorldError("Reload this dated map before editing its newer water relationships.", 409);
          checkProvenance(layer, old.layer as HydroLayer, await nativeHydrologySources(tx, context)); break;
        }
        case "environment": {
          const layer = environmentSaveSchema.parse(command).layer;
          validateEnvironmentFrame(layer, world);
          const water = await nativeResource(tx, context, "hydrology");
          provenance(layer, old.layer as EnvironmentLayer, await nativeHydrologySources(tx, context), water.revision); break;
        }
        case "artwork": validateArtworkFrame(artworkSaveSchema.parse(command).layer, world); break;
        case "labels": {
          const layer = labelsSaveSchema.parse(command).layer;
          validateLabelsFrame(layer, world);
          const original = new Map((old.layer as LabelsLayer).labels.map(label => [label.id, label]));
          const catalog=await nativeLabelSourceCatalog(tx,context);
          for (const label of layer.labels) if (label.source && nativeContentHash(label.source) !== nativeContentHash(original.get(label.id)?.source ?? null)){
            const source=catalog.get(labelSourceKey(label.source));
            if(!source||nativeContentHash(source.source)!==nativeContentHash(label.source))throw new WorldError("This dated label source changed or is unavailable. Retain the draft and refresh the dated suggestions before accepting that association.",409);
          }
          break;
        }
      }
    } catch (error) { if (error instanceof WorldError) throw error; throw new WorldError((error as Error).message, 400); }
  }
  const revision = command.revision + 1;
  const payload = { ...previous, revision, headRevision: revision, layer: command.layer, history: [], ...regional ? { regional } : {} };
  return { updates: [{ key, kind: key, payload }], result: { revision } };
}

import {worldScopeAllowed} from "./world-access-service";
import "server-only";
import { buildTownBackdrop, townBackdropPoints, type TownBackdropSample } from "./town-backdrop";
import { townFrameSchema, validateTownFrame, type TownMapBundle, type TownBackdrop, type TownFrame } from "./town-map";
import { nativeContentContext, nativeRelatedContext, nativeResource, type NativeContentContext } from "./native-map-history-context";
import { nativeHydrologySources } from "./native-map-history-terrain-read";
import { sampleNativeTerrain } from "./native-map-history-sampling";
import { nativeChoices, nativeContentHash, loadNativeVersion,nativeVersionReachable, storeNativeComponent, type NativeHistoryTx } from "./native-map-history-store";
import { nativeObjectPresent,nativeTargetKey, resolveNativeHistory, type NativeManifest } from "./native-map-history";
import {nativeConditions} from "./native-map-history-conditions";
import { WorldError } from "./world-service";
import { boundedRegionalLayer } from "./terrain-regional-authoring-service";

export type UnknownNativeBackdrop = { available: false; reason: string };
export async function sampleNativeTownBackdrop(tx: NativeHistoryTx, context: NativeContentContext, frame: TownFrame): Promise<TownBackdrop> {
  townFrameSchema.parse(frame);
  const sources = await nativeHydrologySources(tx, context), water = await nativeResource(tx, context, "hydrology");
  boundedRegionalLayer(() => validateTownFrame(frame, sources.world));
  const points = townBackdropPoints(frame, sources.world), samples: TownBackdropSample[] = [];
  for (let index = 0; index < points.length; index += 64) samples.push(...(await sampleNativeTerrain(tx, context, points.slice(index, index + 64))).points);
  return buildTownBackdrop(frame, { sources, layer: water.payload.layer as import("./terrain-hydrology").HydroLayer }, samples, nativeContentHash({ terrain: sources.fingerprint, water: water.revision, sourceVersionId: context.version.id }));
}
const unknown = (): UnknownNativeBackdrop => ({ available: false, reason: "World ground and water coverage is unknown at this year in this timeline. The Town drawing remains available; current-day terrain was not substituted." });
export async function readNativeTownBackdrop(tx: NativeHistoryTx, context: NativeContentContext): Promise<TownBackdrop | UnknownNativeBackdrop> {
  if(!worldScopeAllowed(context.worldId,"atlas"))return unknown();
  try{return await readableNativeTownBackdrop(tx,context);}catch(error){if(error instanceof WorldError&&error.status===404)return unknown();throw error;}
}
async function readableNativeTownBackdrop(tx: NativeHistoryTx, context: NativeContentContext): Promise<TownBackdrop | UnknownNativeBackdrop> {
  const town = ((await nativeResource(tx, context, "town")).payload as unknown as { bundle: TownMapBundle }).bundle.document!;
  if (context.scope.versionId) {
    const saved = (await nativeResource(tx, context, "backdrop")).payload as unknown as TownBackdrop | UnknownNativeBackdrop;
    const pin = context.manifest.dependencies.find(dependency => dependency.target.kind === "terrain" && dependency.target.id === town.sourceMapId);
    if (!pin) return unknown();
    const source = await loadNativeVersion(tx, context.worldId, pin.versionId, pin.target);
    if (source.archived || source.startYear! > context.scope.year || source.endYear! < context.scope.year||!await nativeVersionReachable(tx,context.worldId,context.scope.timelineId,pin.target,pin.versionId)) return unknown();
    const sourceContext=await nativeRelatedContext(tx,context,pin.target);
    if(!nativeObjectPresent((await nativeConditions(tx,sourceContext)).values,pin.target.id))return unknown();
    return structuredClone(saved);
  }
  const target = { kind: "terrain" as const, id: town.sourceMapId }, source = resolveNativeHistory(await nativeChoices(tx, context.worldId, context.scope.timelineId, target), target, context.scope.year);
  if (!source) return unknown();
  const sourceContext=await nativeRelatedContext(tx,context,target);
  return nativeObjectPresent((await nativeConditions(tx,sourceContext)).values,target.id)?sampleNativeTownBackdrop(tx,sourceContext,town.frame):unknown();
}
/** Pin exact accepted World geography without creating a second terrain grid.
 * A Town plan may be established while its ground coverage remains unknown. */
export async function bindNativeTownBackdrop(tx: NativeHistoryTx, worldId: string, userId: string, timelineId: string, year: number, manifest: NativeManifest, expectedVersionId?: string | null, requireReview = false) {
  if (manifest.target.kind !== "town") return manifest;
  const ref = manifest.resources.find(resource => resource.key === "town");
  if (!ref) throw new WorldError("The retained Town source is incomplete.", 409);
  const { worldMapStateComponent } = await import("@/db/world-native-map-state-schema");
  const { and, eq } = await import("drizzle-orm");
  const [component] = await tx.select().from(worldMapStateComponent).where(and(eq(worldMapStateComponent.id, ref.componentId), eq(worldMapStateComponent.worldId, worldId)));
  const town = (component?.payload as unknown as { bundle: TownMapBundle } | undefined)?.bundle.document;
  if (!town) throw new WorldError("The retained Town source has no drawing identity.", 409);
  const target = { kind: "terrain" as const, id: town.sourceMapId }, selected = resolveNativeHistory(await nativeChoices(tx, worldId, timelineId, target), target, year);
  if (requireReview && (selected?.versionId ?? null) !== (expectedVersionId ?? null)) throw new WorldError("The dated World source changed after review. Keep the Town draft and review its exact ground source before retrying a new intent.", 409);
  let payload: TownBackdrop | UnknownNativeBackdrop = unknown();
  if (selected) {
    const source = await nativeContentContext(tx, userId, worldId, { target, stateId: selected.id, versionId: selected.versionId, timelineId, year, edit: false }, { ownerId: userId, archived: false, review: true, ordinary: false });
    if(nativeObjectPresent((await nativeConditions(tx,source)).values,target.id))payload = await sampleNativeTownBackdrop(tx, source, town.frame);
  }
  const componentId = await storeNativeComponent(tx, worldId, userId, "terrain", payload as unknown as Record<string, unknown>), key = nativeTargetKey(target);
  return { ...manifest, resources: [...manifest.resources.filter(resource => resource.key !== "backdrop"), { key: "backdrop", kind: "terrain" as const, componentId }], dependencies: [...manifest.dependencies.filter(dependency => nativeTargetKey(dependency.target) !== key), ...selected ? [{ target, versionId: selected.versionId }] : []] };
}

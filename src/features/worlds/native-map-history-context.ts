import { worldRequestAuthority } from "./world-authorization-context";
import { requireWorldNativeFamily } from "./world-resource-permissions";
import { nativeWorldScope } from "./world-permissions";
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { worldMapStateComponent } from "@/db/world-native-map-state-schema";
import { selectedTimeline } from "./history-version-service";
import { worldReadAccess, WorldError } from "./world-service";
import { nativeGeographicResource } from "./native-map-history-geography";
import type { NativeTerrainPayload } from "./native-map-history-terrain-read";
import type { LabelsLayer } from "./terrain-labels";
import { nativeHistoryScopeSchema, nativeTargetKey, resolveNativeHistory, type NativeMapTarget, type NativeHistoryScope, type NativeManifest, type NativeStateChoice } from "./native-map-history";
import { loadNativeVersion, nativeChoices, nativeHistoryAvailable, nativeHistoryMissing, nativeManifestOf, nativeVersionReachable, type NativeHistoryTx, type NativeVersion } from "./native-map-history-store";

export type NativeContentContext = {
  worldId: string; userId: string; scope: NativeHistoryScope; selected: NativeStateChoice;
  version: NativeVersion; manifest: NativeManifest; canEdit: boolean;
  components: Map<string, typeof worldMapStateComponent.$inferSelect>;
  authority?: NativeContentContext;
  related?:Map<string,NativeContentContext>;
};
export async function nativeContentContext(tx: NativeHistoryTx, userId: string, worldId: string, raw: NativeHistoryScope, permissions: { ownerId: string; archived: boolean; review: boolean; ordinary: boolean }): Promise<NativeContentContext> {
  const scope = nativeHistoryScopeSchema.parse(raw);
  requireWorldNativeFamily(worldId,scope.target.kind);
  if (permissions.ordinary) throw nativeHistoryMissing();
  if (!await nativeHistoryAvailable(tx)) throw new WorldError("Migration 0158 is required for historical map content. Baseline maps and drafts remain intact.", 409);
  const timeline = await selectedTimeline(tx, worldId, scope.timelineId);
  const selected = (await nativeChoices(tx, worldId, scope.timelineId, scope.target)).find(s => s.id === scope.stateId);
  if (!selected) throw nativeHistoryMissing();
  if (scope.versionId && !await nativeVersionReachable(tx, worldId, scope.timelineId, scope.target, scope.versionId)) throw nativeHistoryMissing();
  const version = await loadNativeVersion(tx, worldId, scope.versionId ?? selected.versionId, scope.target);
  if (version.stateId !== selected.id) throw nativeHistoryMissing();
  const covered = !version.archived && version.startYear! <= scope.year && version.endYear! >= scope.year;
  if (!covered && !scope.versionId) throw new WorldError("This appearance does not establish active coverage for the selected year. Choose an explicit retained source or another year; baseline content was not substituted.", 409);
  const canEdit = scope.edit && !scope.versionId && covered && (worldRequestAuthority()?.reads.get(worldId)?.permission.canEdit ?? permissions.ownerId === userId) && !permissions.archived && !permissions.review && !timeline.archivedAt;
  const context: NativeContentContext = { worldId, userId, scope, selected, version, manifest: nativeManifestOf(version), canEdit, components: new Map() };
  if(!context.manifest.resources.some(r=>r.key==="terrain-view")&&(scope.geographyStateId||scope.geographyVersionId))throw new WorldError("Only a dated Region selects separate parent World geography.",400);
  if (context.manifest.resources.some(r => r.key === "terrain-view")) {
    const projection = (await nativeResource(tx, context, "terrain-view")).payload.document as unknown as NativeTerrainPayload["bundle"]["document"];
    const target = { kind: "terrain" as const, id: projection.region!.parentMapId };
    const states = await nativeChoices(tx, worldId, scope.timelineId, target);
    const pinnedId = scope.geographyVersionId ?? (scope.versionId ? context.manifest.dependencies.find(d => nativeTargetKey(d.target) === nativeTargetKey(target))?.versionId : undefined);
    const pinned = pinnedId ? await loadNativeVersion(tx, worldId, pinnedId, target) : undefined;
    const root = pinned ? states.find(s => s.id === pinned.stateId) : resolveNativeHistory(states, target, scope.year);
    if (!root || pinned && !scope.versionId && (pinned.startYear! > scope.year || pinned.endYear! < scope.year)) throw new WorldError("Historical World geography is unknown for this Region and year. Create or explicitly retain its parent World appearance; no baseline was substituted.", 409);
    if (scope.geographyStateId && scope.geographyStateId !== root.id || scope.edit && !scope.geographyStateId) throw new WorldError("The dated parent World binding changed. Reload the historical source before editing this Region; your draft is retained.", 409);
    context.authority = await nativeContentContext(tx, userId, worldId, { ...scope, target, stateId: root.id, versionId: pinned?.id, geographyStateId: undefined, geographyVersionId: undefined, edit: canEdit && !pinned }, permissions);
    if (context.authority.manifest.resources.some(r => r.key === "terrain-view")) throw new WorldError("A dated Region must retain a direct World source.", 409);
  }
  return context;
}
export async function nativeResource(tx: NativeHistoryTx, context: NativeContentContext, key: string): Promise<typeof worldMapStateComponent.$inferSelect> {
  const cached = context.components.get(key); if (cached) return cached;
  if (context.authority && nativeGeographicResource(key)) {
    let row = await nativeResource(tx, context.authority, key);
    if (key === "labels" && context.manifest.resources.some(r => r.key === "label-view")) {
      const local = (await nativeResource(tx, context, "label-view")).payload;
      row = { ...row, payload: { ...row.payload, layer: { ...row.payload.layer as LabelsLayer, visible: local.visible, suggestions: local.suggestions, composition: local.composition } } };
    }
    context.components.set(key, row); return row;
  }
  const reference = context.manifest.resources.find(r => r.key === key);
  if (!reference) throw new WorldError("This appearance has no retained source for that map layer. No current-day layer was substituted.", 409);
  const [component] = await tx.select().from(worldMapStateComponent).where(and(eq(worldMapStateComponent.id, reference.componentId), eq(worldMapStateComponent.worldId, context.worldId), eq(worldMapStateComponent.kind, reference.kind)));
  if (!component) throw nativeHistoryMissing();
  context.components.set(key, component); return component;
}
export async function nativeRelatedContext(tx: NativeHistoryTx, context: NativeContentContext, target: NativeMapTarget) {
  if (nativeTargetKey(context.scope.target) === nativeTargetKey(target)) return context;
  const cacheKey=nativeTargetKey(target),cached=context.related?.get(cacheKey);if(cached)return cached;
  const pinned = context.scope.versionId ? context.manifest.dependencies.find(d => nativeTargetKey(d.target) === nativeTargetKey(target)) : undefined;
  const states=await nativeChoices(tx,context.worldId,context.scope.timelineId,target);
  const version=pinned?await loadNativeVersion(tx,context.worldId,pinned.versionId,target):undefined;
  const selected=version?states.find(v=>v.id===version.stateId):resolveNativeHistory(states,target,context.scope.year);
  if (!selected || context.scope.versionId && !pinned) throw new WorldError("This connected map has no retained appearance in this historical context. Its coverage is unknown; current-map content was not substituted.", 409);
  const related=await nativeContentContext(tx, context.userId, context.worldId, { ...context.scope, target, stateId: selected.id, edit: false, versionId: pinned?.versionId,geographyStateId:undefined,geographyVersionId:undefined }, { ownerId: "", archived: false, review: true, ordinary: false });
  context.related??=new Map();context.related.set(cacheKey,related);return related;
}
export async function withNativeHistoryRead<T>(userId: string, worldId: string, scope: NativeHistoryScope, options: { review?: boolean; ordinary?: boolean }, run: (tx: NativeHistoryTx, context: NativeContentContext) => Promise<T>) {
  const access = await worldReadAccess(userId, worldId, !!options.review,["history","appearances",nativeWorldScope(scope.target.kind)]);
  if (options.ordinary) throw nativeHistoryMissing();
  return db.transaction(async tx => run(tx, await nativeContentContext(tx, userId, worldId, scope, { ownerId: access.ownerId, archived: !!access.archivedAt, review: !!options.review, ordinary: !!options.ordinary })), { isolationLevel: "repeatable read", accessMode: "read only" });
}

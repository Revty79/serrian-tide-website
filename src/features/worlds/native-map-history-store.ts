import { worldProtectedContent } from "./world-access-service";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { worldMapStateVersion as versions, worldMapStateHead as heads, worldMapStateGeography } from "@/db/world-map-state-schema";
import { worldMapStateComponent as components, worldMapStateComponentRef as refs, worldMapStateNativeDependency as dependencies, worldMapStateAssetPin as assetPins } from "@/db/world-native-map-state-schema";
import { atlasAsset, atlasAssetVersion } from "@/db/world-asset-schema";
import { worldAtlasMap, worldGeography } from "@/db/world-atlas-schema";
import { defaultPresentation } from "./cartography";
import type { MapDraft } from "./atlas";
import type { MapStateDetails } from "./map-states";
import { NATIVE_HISTORY_LIMITS, nativeManifestSchema, nativeTargetKey, type NativeManifest, type NativeMapTarget, type NativeResource, type NativeStateChoice } from "./native-map-history";
import { WorldError } from "./world-service";
import {assertCraftBudget} from "./craft-budget";

export type NativeHistoryTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type NativeVersion = typeof versions.$inferSelect;
export const nativeHistoryMissing = () => new WorldError("This retained historical source is unavailable in the selected World and timeline.", 404);
export const nativeHistoryConflict = () => new WorldError("A newer historical appearance was saved in another tab. Your draft and exact request are retained; load the saved appearance to compare.", 409);
export function nativeCanonicalJson(input: unknown) {
  return JSON.stringify(input, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}
export const nativeContentHash = (input: unknown) => createHash("sha256").update(nativeCanonicalJson(input)).digest("hex");
export function nativeComponentRevision(payload: Record<string, unknown>) {
  for (const path of [["revision"], ["bundle", "document", "revision"], ["meta", "revision"], ["bundle", "craft", "revision"], ["deck", "revision"], ["placement", "revision"]]) {
    let value: unknown = payload;
    for (const key of path) value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
    if (value !== undefined && value !== null) {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 2_147_483_647) throw new WorldError("A historical component requires a bounded native revision.", 400);
      return value;
    }
  }
  return 0;
}
export async function nativeHistoryAvailable(tx: Pick<NativeHistoryTx, "execute">) {
  return !!(await tx.execute<{ ok: boolean }>(sql`select to_regclass('public.world_map_state_component') is not null and to_regclass('public.world_map_state_native_request') is not null ok`)).rows[0].ok;
}
export function nativeManifestOf(version: Pick<NativeVersion, "payload">) {
  return nativeManifestSchema.parse((version.payload as MapDraft & { nativeAtlas?: unknown }).nativeAtlas);
}
export async function loadNativeVersion(tx: NativeHistoryTx, worldId: string, id: string, target?: NativeMapTarget) {
  const [version] = await tx.select().from(versions).where(and(eq(versions.id, id), eq(versions.worldId, worldId)));
  if (!version || version.protected&&!worldProtectedContent(worldId) || !("nativeAtlas" in version.payload)) throw nativeHistoryMissing();
  const manifest = nativeManifestOf(version);
  if (target && nativeTargetKey(manifest.target) !== nativeTargetKey(target)) throw nativeHistoryMissing();
  return version;
}
export function nativeChoice(version: NativeVersion, head: typeof heads.$inferSelect): NativeStateChoice {
  return { id: head.stateId, versionId: version.id, revision: head.revision, mode: head.mode,
    name: version.name, startYear: version.startYear!, endYear: version.endYear!, account: version.account,
    protected: version.protected, archived: version.archived, authorId: version.authorId, authoredAt: version.createdAt.toISOString(),
    sourceVersionId: version.sourceVersionId, baselineRevision: version.baselineRevision, target: nativeManifestOf(version).target };
}
export async function nativeChoices(tx: NativeHistoryTx, worldId: string, timelineId: string, target: NativeMapTarget) {
  const rows = await tx.select({ version: versions, head: heads }).from(heads).innerJoin(versions, eq(versions.id, heads.versionId))
    .where(and(eq(heads.worldId, worldId), eq(heads.timelineId, timelineId), sql`${versions.payload} ? 'nativeAtlas'`,
      sql`${versions.payload}->'nativeAtlas'->'target'->>'kind'=${target.kind} and ${versions.payload}->'nativeAtlas'->'target'->>'id'=${target.id}`))
    .orderBy(versions.startYear, versions.createdAt, versions.id).limit(NATIVE_HISTORY_LIMITS.appearances + 1);
  if (rows.length > NATIVE_HISTORY_LIMITS.appearances) throw new WorldError("This target exceeds the supported 128-appearance index. Accepted sources remain retained.", 409);
  return rows.map(row => nativeChoice(row.version, row.head));
}
export async function nativeVersionReachable(tx: NativeHistoryTx, worldId: string, timelineId: string, target: NativeMapTarget, id: string) {
  const direct = await tx.execute<{ id: string }>(sql`select v.id from world_map_state_version v join world_map_state_head h
    on h.world_id=v.world_id and h.state_id=v.state_id and h.timeline_id=${timelineId}
    where v.id=${id} and v.world_id=${worldId} and (h.version_id=v.id or v.timeline_id=${timelineId})
    and v.payload->'nativeAtlas'->'target'->>'kind'=${target.kind} and v.payload->'nativeAtlas'->'target'->>'id'=${target.id} limit 1`);
  if (direct.rows.length) return true;
  const result = await tx.execute<{ id: string }>(sql`with recursive sources(id) as (
    select h.version_id from world_map_state_head h join world_map_state_version v on v.id=h.version_id
      where h.world_id=${worldId} and h.timeline_id=${timelineId} and v.payload->'nativeAtlas'->'target'->>'kind'=${target.kind} and v.payload->'nativeAtlas'->'target'->>'id'=${target.id}
    union select next.id from sources s join world_map_state_version v on v.id=s.id and v.world_id=${worldId}
      cross join lateral(select v.source_version_id id union select v.previous_version_id) next where next.id is not null
  ) select id from sources limit ${NATIVE_HISTORY_LIMITS.sourceNodes + 1}`);
  if (result.rows.length > NATIVE_HISTORY_LIMITS.sourceNodes) throw new WorldError("This appearance's source graph exceeds the bounded lookup. Accepted sources remain retained; select a more recent exact source.", 413);
  return result.rows.some(row => row.id === id);
}
export async function nativeRevisionChoices(tx: NativeHistoryTx, worldId: string, selected: NativeStateChoice) {
  const rows = await tx.execute<{ id: string }>(sql`with recursive sources(id) as (
    select ${selected.versionId}::text union select next.id from sources s join world_map_state_version v on v.id=s.id and v.world_id=${worldId} and v.state_id=${selected.id}
      cross join lateral(select v.source_version_id id union select v.previous_version_id) next where next.id is not null
  ), bounded as materialized(select id from sources limit ${NATIVE_HISTORY_LIMITS.sourceNodes + 1})
  select v.id,(select count(*)::int from bounded) source_count from bounded s join world_map_state_version v on v.id=s.id where v.state_id=${selected.id} and v.world_id=${worldId}
    order by v.created_at desc,v.id limit ${NATIVE_HISTORY_LIMITS.revisions}`);
  if (Number((rows.rows[0] as { source_count?: number } | undefined)?.source_count ?? 0) > NATIVE_HISTORY_LIMITS.sourceNodes) throw new WorldError("This appearance's source graph exceeds the bounded revision lookup. Its immutable records remain retained.", 413);
  if (!rows.rows.length) return [];
  const found = await tx.select().from(versions).where(and(eq(versions.worldId, worldId), inArray(versions.id, rows.rows.map(r => r.id)))).orderBy(desc(versions.createdAt), versions.id);
  return found.map(version => nativeChoice(version, { timelineId: version.timelineId, worldId, mapId: version.mapId, stateId: selected.id, versionId: version.id, revision: selected.revision, mode: selected.mode }));
}
export async function loadNativeComponents(tx: NativeHistoryTx, worldId: string, manifest: NativeManifest) {
  const ids = [...new Set(manifest.resources.map(r => r.componentId))];
  const rows = await tx.select().from(components).where(and(eq(components.worldId, worldId), inArray(components.id, ids)));
  const byId = new Map(rows.map(row => [row.id, row]));
  const result = new Map<string, typeof components.$inferSelect>();
  for (const resource of manifest.resources) {
    const row = byId.get(resource.componentId);
    if (!row || row.kind !== resource.kind) throw nativeHistoryMissing();
    result.set(resource.key, row);
  }
  return result;
}
export async function storeNativeComponent(tx: NativeHistoryTx, worldId: string, authorId: string, kind: NativeResource["kind"], input: Record<string, unknown>) {
  const serialized = nativeCanonicalJson(input);
  if (Buffer.byteLength(serialized, "utf8") > NATIVE_HISTORY_LIMITS.componentBytes) throw new WorldError("This historical component exceeds 12 MiB. Accepted sources remain intact.", 413);
  const payload = JSON.parse(serialized) as Record<string, unknown>, contentHash = nativeContentHash(payload);
  const [retained] = await tx.select().from(components).where(and(eq(components.worldId, worldId), eq(components.kind, kind), eq(components.contentHash, contentHash)));
  if (retained) return retained.id;
  const id = randomUUID();
  await tx.insert(components).values({ id, worldId, authorId, kind, contentHash, revision: nativeComponentRevision(payload), payload });
  if (kind === "composition") {
    const placements = (payload.layer as { placements?: { assetId: string; version: number }[] } | undefined)?.placements ?? [];
    const privatePins = [...new Map(placements.filter(p => /^[a-f0-9-]{36}$/.test(p.assetId)).map(p => [p.assetId + ":" + p.version, p])).values()];
    for (const pin of privatePins) {
      const [asset] = await tx.select({ ownerId: atlasAsset.ownerId }).from(atlasAsset).innerJoin(atlasAssetVersion, and(eq(atlasAssetVersion.assetId, atlasAsset.id), eq(atlasAssetVersion.version, pin.version))).where(eq(atlasAsset.id, pin.assetId));
      if (!asset || asset.ownerId !== authorId) throw nativeHistoryMissing();
      await tx.insert(assetPins).values({ componentId: id, worldId, assetId: pin.assetId, assetVersion: pin.version });
    }
  }
  return id;
}
async function nativeEnvelope(tx: NativeHistoryTx, worldId: string, anchorMapId: string): Promise<MapDraft> {
  const [map] = await tx.select().from(worldAtlasMap).where(and(eq(worldAtlasMap.id, anchorMapId), eq(worldAtlasMap.worldId, worldId)));
  if (!map || map.mapKind !== "generic") throw nativeHistoryMissing();
  const places: MapDraft["geographies"] = []; let id = map.geographyId;
  while (id) {
    if (places.length >= 64 || places.some(p => p.id === id)) throw new WorldError("The geographic ancestry is incomplete or cyclic.", 409);
    const [place] = await tx.select().from(worldGeography).where(and(eq(worldGeography.id, id), eq(worldGeography.worldId, worldId)));
    if (!place) throw nativeHistoryMissing();
    places.push({ id: place.id, revision: place.revision, name: place.name, description: place.description, kind: place.kind as "continent" | "island" | "location", parentId: place.parentId });
    id = place.parentId;
  }
  return { name: map.name, description: map.description, scope: map.scope as MapDraft["scope"], features: [], drawings: [], geographies: places, presentation: map.presentation ?? defaultPresentation() };
}
export async function appendNativeVersion(tx: NativeHistoryTx, input: {
  worldId: string; anchorMapId: string; timelineId: string; authorId: string; stateId: string | null;
  source?: NativeVersion; details?: MapStateDetails; archived?: boolean; manifest: NativeManifest; baselineRevision: number;
  sourceAccount?:string;
}) {
  const { worldId, anchorMapId, timelineId, authorId, stateId, source, details } = input;
  const manifest = nativeManifestSchema.parse(input.manifest), id = randomUUID();
  if(stateId&&(manifest.target.kind==="craft"||manifest.target.kind==="deck")){
    const count=(await tx.execute<{n:number}>(sql`select ((select count(*) from world_map_state_version where world_id=${worldId} and state_id is not null and payload->'nativeAtlas'->'target'->>'kind'=${manifest.target.kind} and payload->'nativeAtlas'->'target'->>'id'=${manifest.target.id})+(case when ${manifest.target.kind}='craft' then(select count(*) from world_craft_version where world_id=${worldId} and craft_id=${manifest.target.id}) else(select count(*) from world_craft_deck_version where world_id=${worldId} and deck_id=${manifest.target.id}) end))::int n`)).rows[0].n;
    if(count>=512)throw new WorldError("This craft surface has reached 512 retained historical revisions across its appearances. Accepted sources remain intact.",413);
  }
  if (source && (source.worldId !== worldId || source.mapId !== anchorMapId || nativeTargetKey(nativeManifestOf(source).target) !== nativeTargetKey(manifest.target))) throw nativeHistoryMissing();
  const payload = { ...(source?.payload ?? await nativeEnvelope(tx, worldId, anchorMapId)), nativeAtlas: manifest };
  const [version] = await tx.insert(versions).values({ id, worldId, mapId: anchorMapId, stateId, timelineId,
    sourceVersionId: source ? source.stateId === stateId && source.timelineId === timelineId ? source.sourceVersionId : source.id : null,
    previousVersionId: stateId && source?.stateId === stateId ? source.id : null,
    baselineRevision: source?.baselineRevision ?? input.baselineRevision,
    name: details?.name ?? payload.name, startYear: details?.startYear ?? null, endYear: details?.endYear ?? null,
    account: details?.account ?? input.sourceAccount ?? "Exact accepted native baseline source; no historical coverage is asserted.",
    protected: details?.protected ?? false, archived: input.archived ?? false, payload, authorId,
  }).returning();
  await tx.insert(refs).values(manifest.resources.map(resource => ({ versionId: id, worldId, mapId: anchorMapId, key: resource.key, componentId: resource.componentId })));
  const political=manifest.resources.find(resource=>resource.key==="territories");
  if(political){const [component]=await tx.select().from(components).where(and(eq(components.id,political.componentId),eq(components.worldId,worldId)));if(!component)throw nativeHistoryMissing();const {nativeTerritorySavedSchema}=await import("./native-map-history-territories"),{appendTerritoryReferences}=await import("./territory-service");await appendTerritoryReferences(tx,worldId,anchorMapId,id,nativeTerritorySavedSchema.parse(component.payload).territories);}
  if (payload.geographies.length) await tx.insert(worldMapStateGeography).values(payload.geographies.map(g => ({ versionId: id, worldId, mapId: anchorMapId, geographyId: g.id })));
  for (const dependency of manifest.dependencies) {
    const retained = await loadNativeVersion(tx, worldId, dependency.versionId, dependency.target);
    await tx.insert(dependencies).values({ versionId: id, worldId, mapId: anchorMapId, sourceVersionId: retained.id, sourceMapId: retained.mapId });
  }
  if(manifest.target.kind==="craft"||manifest.target.kind==="deck")await assertCraftBudget(tx,worldId);
  return version;
}

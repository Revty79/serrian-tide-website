import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { world, worldTimeline } from "./world-schema";
import { worldMapStateVersion } from "./world-map-state-schema";
import { atlasAssetVersion } from "./world-asset-schema";
import type { NativeResource,NativeHistoryScope } from "@/features/worlds/native-map-history";

// Storage components belong to the existing historical version/head model.
// They do not select periods, own map identities or create another timeline.
export const worldMapStateComponent = pgTable("world_map_state_component", {
  id: text("id").primaryKey(), worldId: text("world_id").notNull().references(() => world.id, { onDelete: "restrict" }),
  kind: text("kind").$type<NativeResource["kind"]>().notNull(), contentHash: text("content_hash").notNull(),
  revision: integer("revision").notNull().default(0),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, t => [
  unique("map_state_component_world_uq").on(t.id, t.worldId),
  unique("map_state_component_content_uq").on(t.worldId, t.kind, t.contentHash),
  check("map_state_component_revision_valid", sql`${t.revision}>=0`),
  check("map_state_component_valid", sql`${t.contentHash} ~ '^[a-f0-9]{64}$' AND jsonb_typeof(${t.payload})='object' AND octet_length(${t.payload}::text)<=12582912 AND ${t.kind} IN ('terrain','refinement','materials','hydrology','environment','appearance','artwork','labels','town','floor','underground','craft','deck','placement','composition','connections','conditions','places')`),
]);

export const worldMapStateComponentRef = pgTable("world_map_state_component_ref", {
  versionId: text("version_id").notNull(), worldId: text("world_id").notNull(), mapId: text("map_id").notNull(),
  key: text("key").notNull(), componentId: text("component_id").notNull(),
}, t => [
  primaryKey({ columns: [t.versionId, t.key] }),
  foreignKey({ name: "map_state_component_ref_version_fk", columns: [t.versionId, t.worldId, t.mapId], foreignColumns: [worldMapStateVersion.id, worldMapStateVersion.worldId, worldMapStateVersion.mapId] }).onDelete("restrict"),
  foreignKey({ name: "map_state_component_ref_content_fk", columns: [t.componentId, t.worldId], foreignColumns: [worldMapStateComponent.id, worldMapStateComponent.worldId] }).onDelete("restrict"),
  index("map_state_component_ref_content_idx").on(t.componentId),
  check("map_state_component_ref_key_valid", sql`length(${t.key}) BETWEEN 1 AND 160 AND ${t.key} ~ '^[a-z0-9:-]+$'`),
]);

export const worldMapStateNativeRequest = pgTable("world_map_state_native_request", {
  requestId: text("request_id").primaryKey(), worldId: text("world_id").notNull().references(() => world.id, { onDelete: "restrict" }),
  timelineId: text("timeline_id").notNull(), targetKey: text("target_key").notNull(), inputHash: text("input_hash").notNull(),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  originalScope:jsonb("original_scope").$type<NativeHistoryScope>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, t => [
  index("map_state_native_request_target_idx").on(t.worldId, t.timelineId, t.targetKey, t.createdAt),
  foreignKey({ name: "map_state_native_request_timeline_fk", columns: [t.timelineId, t.worldId], foreignColumns: [worldTimeline.id, worldTimeline.worldId] }).onDelete("restrict"),
  check("map_state_native_request_valid", sql`${t.inputHash} ~ '^[a-f0-9]{64}$' AND ${t.targetKey} ~ '^(terrain|town|floor|underground|craft|deck):[a-f0-9-]{36}$' AND jsonb_typeof(${t.result})='object' AND octet_length(${t.result}::text)<=8192`),
  check("map_state_native_request_scope_valid",sql`${t.originalScope} IS NULL OR coalesce(jsonb_typeof(${t.originalScope})='object' AND octet_length(${t.originalScope}::text)<=4096 AND ${t.originalScope}->>'timelineId'=${t.timelineId} AND concat(${t.originalScope}->'target'->>'kind',':',${t.originalScope}->'target'->>'id')=${t.targetKey} AND ${t.originalScope}->>'stateId' ~ '^[a-f0-9-]{36}$' AND jsonb_typeof(${t.originalScope}->'year')='number' AND abs((${t.originalScope}->>'year')::numeric)<=1000000000000 AND trunc((${t.originalScope}->>'year')::numeric)=(${t.originalScope}->>'year')::numeric AND ${t.originalScope}->>'edit'='true' AND NOT (${t.originalScope} ?| ARRAY['versionId','geographyVersionId','connectionSourceVersionId','connectionSourceId']),false)`),
]);

export const worldMapStateNativeDependency = pgTable("world_map_state_native_dependency", {
  versionId: text("version_id").notNull(), worldId: text("world_id").notNull(), mapId: text("map_id").notNull(),
  sourceVersionId: text("source_version_id").notNull(), sourceMapId: text("source_map_id").notNull(),
}, t => [
  primaryKey({ columns: [t.versionId, t.sourceVersionId] }),
  foreignKey({ name: "map_state_native_dependency_target_fk", columns: [t.versionId, t.worldId, t.mapId], foreignColumns: [worldMapStateVersion.id, worldMapStateVersion.worldId, worldMapStateVersion.mapId] }).onDelete("restrict"),
  foreignKey({ name: "map_state_native_dependency_source_fk", columns: [t.sourceVersionId, t.worldId, t.sourceMapId], foreignColumns: [worldMapStateVersion.id, worldMapStateVersion.worldId, worldMapStateVersion.mapId] }).onDelete("restrict"),
  index("map_state_native_dependency_source_idx").on(t.sourceVersionId),
  check("map_state_native_dependency_distinct", sql`${t.versionId}<>${t.sourceVersionId}`),
]);

export const worldMapStateAssetPin = pgTable("world_map_state_asset_pin", {
  componentId: text("component_id").notNull(), worldId: text("world_id").notNull(),
  assetId: text("asset_id").notNull(), assetVersion: integer("asset_version").notNull(),
}, t => [
  primaryKey({ columns: [t.componentId, t.assetId, t.assetVersion] }),
  foreignKey({ name: "map_state_asset_pin_component_fk", columns: [t.componentId, t.worldId], foreignColumns: [worldMapStateComponent.id, worldMapStateComponent.worldId] }).onDelete("restrict"),
  foreignKey({ name: "map_state_asset_pin_version_fk", columns: [t.assetId, t.assetVersion], foreignColumns: [atlasAssetVersion.assetId, atlasAssetVersion.version] }).onDelete("restrict"),
  index("map_state_asset_pin_asset_idx").on(t.assetId, t.assetVersion),
  check("map_state_asset_pin_version_valid", sql`${t.assetVersion}>0`),
]);

import { sql } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { worldTimeline } from "./world-schema";
import { worldAtlasMap, worldGeography } from "./world-atlas-schema";
import type { MapDraft } from "@/features/worlds/atlas";
import type { GenerationProvenance } from "@/features/worlds/generation-spec";
import { worldLoreVersion } from "./world-peoples-schema";
import { worldHistoryVersion } from "./world-timeline-schema";

export const worldMapState = pgTable("world_map_state", {
  id:text("id").primaryKey(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),originTimelineId:text("origin_timeline_id").notNull(),
},t=>[unique("map_state_identity_uq").on(t.id,t.worldId,t.mapId),
  foreignKey({name:"map_state_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldAtlasMap.id,worldAtlasMap.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_state_origin_fk",columns:[t.originTimelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict")]);
export const worldMapStateVersion = pgTable("world_map_state_version", {
  id:text("id").primaryKey(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),stateId:text("state_id"),timelineId:text("timeline_id").notNull(),
  sourceVersionId:text("source_version_id"),previousVersionId:text("previous_version_id"),baselineRevision:integer("baseline_revision").notNull(),
  name:text("name").notNull(),startYear:bigint("start_year",{mode:"number"}),endYear:bigint("end_year",{mode:"number"}),account:text("account").notNull(),
  protected:boolean("protected").notNull(),archived:boolean("archived").notNull(),payload:jsonb("payload").$type<MapDraft>().notNull(),generation:jsonb("generation").$type<GenerationProvenance>(),
  authorId:text("author_id").notNull(),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[unique("map_state_version_map_uq").on(t.id,t.worldId,t.mapId),unique("map_state_version_state_uq").on(t.id,t.worldId,t.mapId,t.stateId),
  foreignKey({name:"map_state_version_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldAtlasMap.id,worldAtlasMap.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_state_version_state_fk",columns:[t.stateId,t.worldId,t.mapId],foreignColumns:[worldMapState.id,worldMapState.worldId,worldMapState.mapId]}).onDelete("restrict"),
  foreignKey({name:"map_state_version_timeline_fk",columns:[t.timelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_state_version_source_fk",columns:[t.sourceVersionId,t.worldId,t.mapId],foreignColumns:[t.id,t.worldId,t.mapId]}).onDelete("restrict"),
  foreignKey({name:"map_state_version_previous_fk",columns:[t.previousVersionId,t.worldId,t.mapId,t.stateId],foreignColumns:[t.id,t.worldId,t.mapId,t.stateId]}).onDelete("restrict"),
  index("map_state_version_state_idx").on(t.worldId,t.mapId,t.stateId,t.createdAt),
  check("map_state_version_valid",sql`length(trim(${t.name})) BETWEEN 1 AND 160 AND length(${t.account})<=12000 AND length(${t.authorId})>0 AND ${t.baselineRevision}>0 AND (${t.sourceVersionId} IS NULL OR ${t.sourceVersionId}<>${t.id}) AND ((${t.stateId} IS NULL AND ${t.startYear} IS NULL AND ${t.endYear} IS NULL AND ${t.sourceVersionId} IS NULL AND NOT ${t.archived}) OR (${t.stateId} IS NOT NULL AND ${t.startYear} IS NOT NULL AND ${t.endYear} IS NOT NULL AND abs(${t.startYear})<=1000000000000 AND abs(${t.endYear})<=1000000000000 AND ${t.startYear}<=${t.endYear} AND ${t.sourceVersionId} IS NOT NULL))`),
  check("map_state_payload_valid",sql`world_map_state_payload_valid(${t.payload}) IS TRUE`)]);
export const worldMapStateHead = pgTable("world_map_state_head", {
  timelineId:text("timeline_id").notNull(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),stateId:text("state_id").notNull(),versionId:text("version_id").notNull(),
  revision:integer("revision").notNull(),mode:text("mode").$type<"authored"|"retained"|"interpretation">().notNull(),
},t=>[primaryKey({columns:[t.timelineId,t.stateId]}),index("map_state_head_map_idx").on(t.worldId,t.timelineId,t.mapId),
  foreignKey({name:"map_state_head_timeline_fk",columns:[t.timelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_state_head_version_fk",columns:[t.versionId,t.worldId,t.mapId,t.stateId],foreignColumns:[worldMapStateVersion.id,worldMapStateVersion.worldId,worldMapStateVersion.mapId,worldMapStateVersion.stateId]}).onDelete("restrict"),
  check("map_state_head_valid",sql`${t.revision}>0 AND ${t.mode} IN ('authored','retained','interpretation')`)]);
// Includes objects first drawn in a historical state, without placing them on the shared map.
export const worldMapStateObject = pgTable("world_map_state_object", {
  id:text("id").primaryKey(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),kind:text("kind").notNull(),geographyId:text("geography_id"),
},t=>[foreignKey({name:"map_state_object_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldAtlasMap.id,worldAtlasMap.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_state_object_geography_fk",columns:[t.geographyId,t.worldId],foreignColumns:[worldGeography.id,worldGeography.worldId]}).onDelete("restrict"),check("map_state_object_valid",sql`${t.kind} IN ('feature','terrain','path','symbol','label','settlement-area','settlement-line','settlement-marker') AND (${t.kind} NOT IN ('feature','settlement-area','settlement-line','settlement-marker') OR ${t.geographyId} IS NOT NULL)`)]);
export const worldMapStateGeography = pgTable("world_map_state_geography", {
  versionId:text("version_id").notNull(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),geographyId:text("geography_id").notNull(),
},t=>[primaryKey({columns:[t.versionId,t.geographyId]}),
  foreignKey({name:"map_state_geography_version_fk",columns:[t.versionId,t.worldId,t.mapId],foreignColumns:[worldMapStateVersion.id,worldMapStateVersion.worldId,worldMapStateVersion.mapId]}).onDelete("restrict"),
  foreignKey({name:"map_state_geography_place_fk",columns:[t.geographyId,t.worldId],foreignColumns:[worldGeography.id,worldGeography.worldId]}).onDelete("restrict")]);

// Political geometry is never a replacement for World geography or a political identity.
export const worldMapTerritory = pgTable("world_map_territory", {
  id:text("id").primaryKey(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),originTimelineId:text("origin_timeline_id").notNull(),
},t=>[unique("map_territory_map_uq").on(t.id,t.worldId,t.mapId),
  foreignKey({name:"map_territory_map_fk",columns:[t.mapId,t.worldId],foreignColumns:[worldAtlasMap.id,worldAtlasMap.worldId]}).onDelete("restrict"),
  foreignKey({name:"map_territory_origin_fk",columns:[t.originTimelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict")]);
export const worldMapTerritoryBoundary = pgTable("world_map_territory_boundary", {
  id:text("id").primaryKey(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),territoryId:text("territory_id").notNull(),parentId:text("parent_id"),
},t=>[foreignKey({name:"territory_boundary_subject_fk",columns:[t.territoryId,t.worldId,t.mapId],foreignColumns:[worldMapTerritory.id,worldMapTerritory.worldId,worldMapTerritory.mapId]}).onDelete("restrict")]);
export const worldMapTerritoryLore = pgTable("world_map_territory_lore", {
  versionId:text("version_id").notNull(),territoryId:text("territory_id").notNull(),id:text("id").notNull(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),entityId:text("entity_id").notNull(),loreVersionId:text("lore_version_id").notNull(),
},t=>[primaryKey({columns:[t.versionId,t.id]}),
  foreignKey({name:"territory_lore_appearance_fk",columns:[t.versionId,t.worldId,t.mapId],foreignColumns:[worldMapStateVersion.id,worldMapStateVersion.worldId,worldMapStateVersion.mapId]}).onDelete("restrict"),
  foreignKey({name:"territory_lore_subject_fk",columns:[t.territoryId,t.worldId,t.mapId],foreignColumns:[worldMapTerritory.id,worldMapTerritory.worldId,worldMapTerritory.mapId]}).onDelete("restrict"),
  foreignKey({name:"territory_lore_pin_fk",columns:[t.loreVersionId,t.worldId,t.entityId],foreignColumns:[worldLoreVersion.id,worldLoreVersion.worldId,worldLoreVersion.entityId]}).onDelete("restrict"),index("territory_lore_entity_idx").on(t.worldId,t.entityId,t.versionId)]);
export const worldMapTerritoryHistory = pgTable("world_map_territory_history", {
  versionId:text("version_id").notNull(),territoryId:text("territory_id").notNull(),worldId:text("world_id").notNull(),mapId:text("map_id").notNull(),entityId:text("entity_id").notNull(),historyVersionId:text("history_version_id").notNull(),
},t=>[primaryKey({columns:[t.versionId,t.territoryId,t.entityId]}),
  foreignKey({name:"territory_history_appearance_fk",columns:[t.versionId,t.worldId,t.mapId],foreignColumns:[worldMapStateVersion.id,worldMapStateVersion.worldId,worldMapStateVersion.mapId]}).onDelete("restrict"),
  foreignKey({name:"territory_history_subject_fk",columns:[t.territoryId,t.worldId,t.mapId],foreignColumns:[worldMapTerritory.id,worldMapTerritory.worldId,worldMapTerritory.mapId]}).onDelete("restrict"),
  foreignKey({name:"territory_history_pin_fk",columns:[t.historyVersionId,t.worldId,t.entityId],foreignColumns:[worldHistoryVersion.id,worldHistoryVersion.worldId,worldHistoryVersion.entityId]}).onDelete("restrict")]);

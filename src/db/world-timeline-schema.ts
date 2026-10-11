import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { worldEra, worldEntry, worldTimeline, worldDatingSystem } from "./world-schema";
import { worldCalendarAnchor } from "./world-calendar-history-schema";
import type { HistoricalSnapshot, InheritanceMode } from "@/features/worlds/branching-history";

export const worldHistoryVersion = pgTable("world_history_version", {
  id:text("id").primaryKey(), worldId:text("world_id").notNull(),entityId:text("entity_id").notNull(),
  entryId:text("entry_id"),eraId:text("era_id"), timelineId:text("timeline_id").notNull(),
  payload:jsonb("payload").$type<HistoricalSnapshot>().notNull(), datingSystemId:text("dating_system_id"),
  startVersionId:text("start_version_id"),endVersionId:text("end_version_id"),createdAt:timestamp("created_at").notNull().defaultNow(),
},t=>[unique("world_history_version_identity_uq").on(t.id,t.worldId,t.entityId),
  foreignKey({name:"history_version_timeline_fk",columns:[t.timelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict"),
  foreignKey({name:"history_version_entry_fk",columns:[t.entryId,t.worldId],foreignColumns:[worldEntry.id,worldEntry.worldId]}).onDelete("restrict"),
  foreignKey({name:"history_version_era_fk",columns:[t.eraId,t.worldId],foreignColumns:[worldEra.id,worldEra.worldId]}).onDelete("restrict"),
  foreignKey({name:"history_version_dating_fk",columns:[t.datingSystemId,t.worldId],foreignColumns:[worldDatingSystem.id,worldDatingSystem.worldId]}).onDelete("restrict"),
  foreignKey({name:"history_version_start_fk",columns:[t.startVersionId,t.worldId],foreignColumns:[worldCalendarAnchor.versionId,worldCalendarAnchor.worldId]}).onDelete("restrict"),
  foreignKey({name:"history_version_end_fk",columns:[t.endVersionId,t.worldId],foreignColumns:[worldCalendarAnchor.versionId,worldCalendarAnchor.worldId]}).onDelete("restrict"),
  index("world_history_version_entity_idx").on(t.worldId,t.entityId,t.createdAt),
  index("history_search_text_idx").using("gin",sql`to_tsvector('simple', coalesce(${t.payload}->>'title','') || ' ' || coalesce(${t.payload}->>'account','') || ' ' || coalesce(${t.payload}->>'notes',''))`),
  check("history_prominence_valid",sql`coalesce(${t.payload}->>'prominence','standard') in ('featured','standard','index-only')`),
  check("world_history_version_valid",sql`((${t.entryId}=${t.entityId} and ${t.eraId} is null) or (${t.eraId}=${t.entityId} and ${t.entryId} is null)) and coalesce(${t.payload}->>'id'=${t.entityId} and ${t.payload}->>'worldId'=${t.worldId} and (${t.payload}->>'revision')::integer>0 and jsonb_typeof(${t.payload})='object',false)`)]);
export const worldHistoryHead = pgTable("world_history_head", {
  timelineId:text("timeline_id").notNull(),worldId:text("world_id").notNull(),entityId:text("entity_id").notNull(),
  versionId:text("version_id").notNull(),mode:text("mode").$type<InheritanceMode>().notNull(),revision:integer("revision").notNull(),
  sourceTimelineId:text("source_timeline_id"),sourceVersionId:text("source_version_id"),sourceRevision:integer("source_revision"),
  coveredUntil:bigint("covered_until",{mode:"number"}),
},t=>[primaryKey({columns:[t.timelineId,t.entityId]}),index("world_history_head_world_idx").on(t.worldId,t.timelineId),
  foreignKey({name:"history_head_timeline_fk",columns:[t.timelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict"),
  foreignKey({name:"history_head_version_fk",columns:[t.versionId,t.worldId,t.entityId],foreignColumns:[worldHistoryVersion.id,worldHistoryVersion.worldId,worldHistoryVersion.entityId]}).onDelete("restrict"),
  foreignKey({name:"history_head_source_timeline_fk",columns:[t.sourceTimelineId,t.worldId],foreignColumns:[worldTimeline.id,worldTimeline.worldId]}).onDelete("restrict"),
  foreignKey({name:"history_head_source_version_fk",columns:[t.sourceVersionId,t.worldId,t.entityId],foreignColumns:[worldHistoryVersion.id,worldHistoryVersion.worldId,worldHistoryVersion.entityId]}).onDelete("restrict"),
  check("world_history_head_valid",sql`${t.revision}>0 and ${t.mode} in ('authored','inherited','partial','pending','excluded','interpretation') and ((${t.sourceTimelineId} is null and ${t.sourceVersionId} is null and ${t.sourceRevision} is null and ${t.mode}='authored') or (${t.sourceTimelineId} is not null and ${t.sourceVersionId} is not null and ${t.sourceRevision}>0)) and (${t.coveredUntil} is null or abs(${t.coveredUntil})<=1000000000000)`)]);
export const worldHistoryVersionEra = pgTable("world_history_version_era", {
  versionId:text("version_id").notNull(),worldId:text("world_id").notNull(),entryId:text("entry_id").notNull(),eraId:text("era_id").notNull(),
},t=>[primaryKey({columns:[t.versionId,t.eraId]}),foreignKey({name:"history_version_link_fk",columns:[t.versionId,t.worldId,t.entryId],foreignColumns:[worldHistoryVersion.id,worldHistoryVersion.worldId,worldHistoryVersion.entityId]}).onDelete("restrict"),foreignKey({name:"history_version_link_era_fk",columns:[t.eraId,t.worldId],foreignColumns:[worldEra.id,worldEra.worldId]}).onDelete("restrict")]);

import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { worldLoreVersion } from "./world-peoples-schema";
import { worldDatingSystem } from "./world-schema";
import { worldCalendarVersion } from "./world-calendar-schema";
import type { HistoricalTime } from "@/features/worlds/history";
import type { SourceDating } from "@/features/worlds/chronology";
import type { CalendarSource } from "@/features/worlds/calendar-dates";
export const worldStoryContext = pgTable("world_story_context", {
  versionId: text("version_id").primaryKey(), worldId: text("world_id").notNull(), family: text("family").notNull().default("story"),
  time: jsonb("alleged_time").$type<HistoricalTime>().notNull(), protected: boolean("protected").notNull().default(false),
  datingSystemId: text("dating_system_id"), sourceDating: jsonb("source_dating").$type<SourceDating>(),
  calendarSource: jsonb("calendar_source").$type<CalendarSource>(), startVersionId: text("start_version_id"), endVersionId: text("end_version_id"),
}, t => [
  foreignKey({ name: "story_context_source_fk", columns: [t.versionId,t.worldId,t.family], foreignColumns: [worldLoreVersion.id,worldLoreVersion.worldId,worldLoreVersion.family] }).onDelete("restrict"),
  foreignKey({ name: "story_context_dating_fk", columns: [t.datingSystemId,t.worldId], foreignColumns: [worldDatingSystem.id,worldDatingSystem.worldId] }).onDelete("restrict"),
  foreignKey({ name: "story_context_start_fk", columns: [t.startVersionId,t.worldId], foreignColumns: [worldCalendarVersion.id,worldCalendarVersion.worldId] }).onDelete("restrict"),
  foreignKey({ name: "story_context_end_fk", columns: [t.endVersionId,t.worldId], foreignColumns: [worldCalendarVersion.id,worldCalendarVersion.worldId] }).onDelete("restrict"),
  check("story_context_valid", sql`${t.family}='story' and world_lore_time_valid(${t.time}) and ((${t.datingSystemId} is null)=(${t.sourceDating} is null)) and (${t.sourceDating} is null or coalesce(${t.sourceDating}->>'systemId'=${t.datingSystemId} and ${t.sourceDating}->>'version'='1',false)) and ((${t.calendarSource} is null and ${t.startVersionId} is null and ${t.endVersionId} is null) or coalesce(${t.calendarSource}->>'version'='1' and ${t.calendarSource}->'start'->>'versionId'=${t.startVersionId} and ${t.calendarSource}->'start'->>'elapsedDay' ~ '^(0|-?[1-9][0-9]{0,19})$' and case ${t.calendarSource}->>'kind' when 'known' then ${t.endVersionId} is null and not (${t.calendarSource} ? 'end') when 'approximate' then ${t.endVersionId} is null and not (${t.calendarSource} ? 'end') when 'window' then ${t.endVersionId}=${t.calendarSource}->'end'->>'versionId' and (${t.calendarSource}->'end'->>'elapsedDay')::numeric>=(${t.calendarSource}->'start'->>'elapsedDay')::numeric when 'duration' then ${t.endVersionId}=${t.calendarSource}->'end'->>'versionId' and (${t.calendarSource}->'end'->>'elapsedDay')::numeric>=(${t.calendarSource}->'start'->>'elapsedDay')::numeric else false end,false))`),
]);
export const worldStorySource = pgTable("world_story_source", {
  versionId: text("version_id").notNull(), worldId: text("world_id").notNull(), family: text("family").notNull().default("story"),
  id: text("id").notNull(), position: integer("position").notNull(), entityId: text("entity_id").notNull(),
  sourceVersionId: text("source_version_id").notNull(), sourceRevision: integer("source_revision").notNull(),
  relationshipType: text("relationship_type").notNull(), account: text("account").notNull().default(""), protected: boolean("protected").notNull().default(false),
}, t => [
  primaryKey({columns:[t.versionId,t.id]}),
  foreignKey({name:"story_source_owner_fk",columns:[t.versionId,t.worldId,t.family],foreignColumns:[worldLoreVersion.id,worldLoreVersion.worldId,worldLoreVersion.family]}).onDelete("restrict"),
  foreignKey({name:"story_source_original_fk",columns:[t.sourceVersionId,t.worldId,t.entityId],foreignColumns:[worldLoreVersion.id,worldLoreVersion.worldId,worldLoreVersion.entityId]}).onDelete("restrict"),
  foreignKey({name:"story_source_family_fk",columns:[t.sourceVersionId,t.worldId,t.family],foreignColumns:[worldLoreVersion.id,worldLoreVersion.worldId,worldLoreVersion.family]}).onDelete("restrict"),
  index("story_source_original_idx").on(t.worldId,t.entityId),
  check("story_source_valid",sql`${t.family}='story' and ${t.position} between 0 and 39 and ${t.sourceRevision}>0 and ${t.sourceVersionId}<>${t.versionId} and length(trim(${t.relationshipType})) between 1 and 160`),
]);

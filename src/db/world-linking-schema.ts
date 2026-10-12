import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { world, worldTimeline, worldDatingSystem } from "./world-schema";
import { worldLoreIdentity, worldLoreVersion } from "./world-peoples-schema";
import { worldAtlasMap } from "./world-atlas-schema";
import { worldCalendar, worldCalendarVersion } from "./world-calendar-schema";
import { worldCalendarAdoption } from "./world-calendar-history-schema";
import type { LinkDraft, LinkSource, WorldLink } from "@/features/worlds/linking";
export const worldLinkIdentity = pgTable("world_link_identity", {
  id: text("id").primaryKey(), worldId: text("world_id").notNull().references(() => world.id, { onDelete: "restrict" }), kind: text("kind").$type<LinkDraft["kind"]>().notNull(), originTimelineId: text("origin_timeline_id").notNull(), creatorId: text("creator_id").notNull().references(() => user.id, { onDelete: "restrict" }), createdAt: timestamp("created_at").notNull().defaultNow(),
}, t => [unique("world_link_identity_world_uq").on(t.id, t.worldId), foreignKey({ name: "world_link_origin_fk", columns: [t.originTimelineId, t.worldId], foreignColumns: [worldTimeline.id, worldTimeline.worldId] }).onDelete("restrict"), check("world_link_kind_valid", sql`${t.kind} in ('realm-map','society-time')`)]);
export const worldLinkVersion = pgTable("world_link_version", {
  id: text("id").primaryKey(), worldId: text("world_id").notNull(), linkId: text("link_id").notNull(), timelineId: text("timeline_id").notNull(), authorId: text("author_id").notNull().references(() => user.id, { onDelete: "restrict" }), createdAt: timestamp("created_at").notNull().defaultNow(), loreId: text("lore_id").notNull(), loreVersionId: text("lore_version_id").notNull(), mapId: text("map_id"), calendarId: text("calendar_id"), calendarVersionId: text("calendar_version_id"), datingSystemId: text("dating_system_id"), adoptionId: text("adoption_id"), archived: boolean("archived").notNull().default(false), draft: jsonb("draft").$type<LinkDraft>().notNull(), source: jsonb("source").$type<LinkSource>().notNull(),
}, t => [unique("world_link_version_identity_uq").on(t.id, t.worldId, t.linkId),
  foreignKey({ name: "world_link_version_identity_fk", columns: [t.linkId, t.worldId], foreignColumns: [worldLinkIdentity.id, worldLinkIdentity.worldId] }).onDelete("restrict"),
  foreignKey({ name: "world_link_version_timeline_fk", columns: [t.timelineId, t.worldId], foreignColumns: [worldTimeline.id, worldTimeline.worldId] }).onDelete("restrict"),
  foreignKey({ name: "world_link_lore_identity_fk", columns: [t.loreId, t.worldId], foreignColumns: [worldLoreIdentity.id, worldLoreIdentity.worldId] }).onDelete("restrict"),
  foreignKey({ name: "world_link_lore_source_fk", columns: [t.loreVersionId, t.worldId, t.loreId], foreignColumns: [worldLoreVersion.id, worldLoreVersion.worldId, worldLoreVersion.entityId] }).onDelete("restrict"),
  foreignKey({ name: "world_link_map_fk", columns: [t.mapId, t.worldId], foreignColumns: [worldAtlasMap.id, worldAtlasMap.worldId] }).onDelete("restrict"),
  foreignKey({ name: "world_link_calendar_fk", columns: [t.calendarId, t.worldId], foreignColumns: [worldCalendar.id, worldCalendar.worldId] }).onDelete("restrict"),
  foreignKey({ name: "world_link_calendar_version_fk", columns: [t.calendarVersionId, t.worldId], foreignColumns: [worldCalendarVersion.id, worldCalendarVersion.worldId] }).onDelete("restrict"),
  foreignKey({ name: "world_link_dating_fk", columns: [t.datingSystemId, t.worldId], foreignColumns: [worldDatingSystem.id, worldDatingSystem.worldId] }).onDelete("restrict"),
  foreignKey({ name: "world_link_adoption_fk", columns: [t.adoptionId, t.worldId], foreignColumns: [worldCalendarAdoption.id, worldCalendarAdoption.worldId] }).onDelete("restrict"),
  index("world_link_version_lore_idx").on(t.worldId, t.loreId), index("world_link_version_map_idx").on(t.worldId, t.mapId), check("world_link_version_valid", sql`world_link_content_valid(${t.draft},${t.source},${t.loreId},${t.loreVersionId},${t.mapId},${t.calendarId},${t.calendarVersionId},${t.datingSystemId},${t.adoptionId})`)]);
export const worldLinkHead = pgTable("world_link_head", {
  worldId: text("world_id").notNull(), timelineId: text("timeline_id").notNull(), linkId: text("link_id").notNull(), versionId: text("version_id").notNull(), revision: integer("revision").notNull(), mode: text("mode").$type<WorldLink["mode"]>().notNull(),
}, t => [primaryKey({ columns: [t.timelineId, t.linkId] }), foreignKey({ name: "world_link_head_timeline_fk", columns: [t.timelineId, t.worldId], foreignColumns: [worldTimeline.id, worldTimeline.worldId] }).onDelete("restrict"), foreignKey({ name: "world_link_head_version_fk", columns: [t.versionId, t.worldId, t.linkId], foreignColumns: [worldLinkVersion.id, worldLinkVersion.worldId, worldLinkVersion.linkId] }).onDelete("restrict"), index("world_link_head_world_idx").on(t.worldId, t.timelineId), check("world_link_head_valid", sql`${t.revision}>0 and ${t.mode} in ('authored','inherited','interpretation','excluded')`)]);

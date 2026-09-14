import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { campaignCharacter } from "./realm-schema";
import { campaignSession, campaignSessionRoster, campaignSessionScene } from "./tabletop-operations-schema";
import type { SourceUseResult, SourceUseSnapshot, TabletopSourceUse } from "@/features/tabletop-operations/source-use";

export const tabletopSourceUseStatus = pgEnum("tabletop_source_use_status", ["pending", "approved", "rejected", "cancelled", "completed"]);

export const tabletopSourceUseRequest = pgTable("tabletop_source_use_request", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  sessionId: integer("session_id").notNull(),
  sceneId: integer("scene_id"),
  characterId: integer("character_id").notNull(),
  requestedByUserId: text("requested_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  idempotencyKey: text("idempotency_key").notNull(),
  sourceJson: jsonb("source_json").$type<TabletopSourceUse>().notNull(),
  snapshotJson: jsonb("snapshot_json").$type<SourceUseSnapshot>().notNull(),
  intent: text("intent").notNull(),
  status: tabletopSourceUseStatus("status").default("pending").notNull(),
  ruling: text("ruling").default("").notNull(),
  ruledByUserId: text("ruled_by_user_id").references(() => user.id, { onDelete: "restrict" }),
  ruledAt: timestamp("ruled_at"),
  resultJson: jsonb("result_json").$type<SourceUseResult>(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  foreignKey({ columns: [table.sessionId, table.campaignId], foreignColumns: [campaignSession.id, campaignSession.campaignId], name: "tabletop_source_use_session_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.sceneId, table.sessionId, table.campaignId], foreignColumns: [campaignSessionScene.id, campaignSessionScene.sessionId, campaignSessionScene.campaignId], name: "tabletop_source_use_scene_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.characterId, table.campaignId], foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId], name: "tabletop_source_use_character_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.sessionId, table.characterId], foreignColumns: [campaignSessionRoster.sessionId, campaignSessionRoster.characterId], name: "tabletop_source_use_roster_fk" }).onDelete("restrict"),
  uniqueIndex("tabletop_source_use_retry_uq").on(table.requestedByUserId, table.idempotencyKey),
  index("tabletop_source_use_session_status_idx").on(table.sessionId, table.status, table.id),
  index("tabletop_source_use_character_idx").on(table.characterId, table.id),
  check("tabletop_source_use_text_valid", sql`length(trim(${table.intent})) BETWEEN 1 AND 2000 AND length(trim(${table.idempotencyKey})) BETWEEN 1 AND 100 AND length(${table.ruling}) <= 4000`),
  check("tabletop_source_use_json_valid", sql`jsonb_typeof(${table.sourceJson}) = 'object' AND ${table.sourceJson}->>'kind' IN ('spell','item') AND jsonb_typeof(${table.snapshotJson}) = 'object' AND (${table.resultJson} IS NULL OR jsonb_typeof(${table.resultJson}) = 'object')`),
  check("tabletop_source_use_ruling_valid", sql`(${table.ruledAt} IS NULL AND ${table.ruledByUserId} IS NULL AND ${table.ruling} = '' AND ${table.status} IN ('pending','cancelled')) OR (${table.ruledAt} IS NOT NULL AND ${table.ruledByUserId} IS NOT NULL AND length(trim(${table.ruling})) > 0 AND ${table.status} IN ('approved','rejected','cancelled','completed'))`),
  check("tabletop_source_use_completion_valid", sql`(${table.status} = 'completed' AND ${table.resultJson} IS NOT NULL AND ${table.completedAt} IS NOT NULL) OR (${table.status} <> 'completed' AND ${table.resultJson} IS NULL AND ${table.completedAt} IS NULL)`),
]);

export const tabletopSourceUseEvent = pgTable("tabletop_source_use_event", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => tabletopSourceUseRequest.id, { onDelete: "restrict" }),
  status: tabletopSourceUseStatus("status").notNull(),
  note: text("note").notNull(),
  actorUserId: text("actor_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  actorKind: text("actor_kind").$type<"player" | "god">().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("tabletop_source_use_event_history_idx").on(table.requestId, table.id),
  check("tabletop_source_use_event_valid", sql`${table.actorKind} IN ('player','god') AND length(trim(${table.note})) BETWEEN 1 AND 4000`),
]);

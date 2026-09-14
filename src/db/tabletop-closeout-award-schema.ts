import { sql } from "drizzle-orm";
import { check, doublePrecision, foreignKey, index, integer, pgTable, serial, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { campaignCharacter } from "./realm-schema";
import { campaignSession, campaignSessionScene } from "./tabletop-operations-schema";

export const tabletopCloseoutAwardDecision = pgTable("tabletop_closeout_award_decision", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  sessionId: integer("session_id").notNull(),
  sceneId: integer("scene_id"),
  awardedByUserId: text("awarded_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  awardedByName: text("awarded_by_name").notNull(),
  note: text("note").default("").notNull(),
  awardedAt: timestamp("awarded_at").defaultNow().notNull(),
}, (table) => [
  foreignKey({ columns: [table.sessionId, table.campaignId], foreignColumns: [campaignSession.id, campaignSession.campaignId], name: "closeout_award_session_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.sceneId, table.sessionId, table.campaignId], foreignColumns: [campaignSessionScene.id, campaignSessionScene.sessionId, campaignSessionScene.campaignId], name: "closeout_award_scene_fk" }).onDelete("restrict"),
  unique("closeout_award_decision_campaign_uq").on(table.id, table.campaignId),
  uniqueIndex("closeout_award_session_once_uq").on(table.sessionId).where(sql`${table.sceneId} IS NULL`),
  uniqueIndex("closeout_award_scene_once_uq").on(table.sceneId).where(sql`${table.sceneId} IS NOT NULL`),
  check("closeout_award_note_valid", sql`length(${table.note}) <= 2000`),
]);

export const tabletopCloseoutAward = pgTable("tabletop_closeout_award", {
  id: serial("id").primaryKey(),
  decisionId: integer("decision_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  characterId: integer("character_id").notNull(),
  characterName: text("character_name").notNull(),
  experience: doublePrecision("experience").notNull(),
  fame: doublePrecision("fame").notNull(),
  quintessence: doublePrecision("quintessence").notNull(),
}, (table) => [
  foreignKey({ columns: [table.decisionId, table.campaignId], foreignColumns: [tabletopCloseoutAwardDecision.id, tabletopCloseoutAwardDecision.campaignId], name: "closeout_award_decision_fk" }).onDelete("restrict"),
  foreignKey({ columns: [table.characterId, table.campaignId], foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId], name: "closeout_award_character_fk" }).onDelete("restrict"),
  uniqueIndex("closeout_award_recipient_uq").on(table.decisionId, table.characterId),
  index("closeout_award_character_idx").on(table.characterId, table.id),
  check("closeout_award_amounts_valid", sql`${table.experience} BETWEEN 0 AND 9007199254740991 AND ${table.fame} BETWEEN 0 AND 9007199254740991 AND ${table.quintessence} BETWEEN 0 AND 9007199254740991`),
]);

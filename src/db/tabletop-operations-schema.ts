import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { campaign } from "./campaign-schema";
import { campaignCharacter } from "./realm-schema";

export const campaignSessionStatus = pgEnum("campaign_session_status", [
  "planned",
  "active",
  "completed",
]);

export const campaignSessionSceneStatus = pgEnum("campaign_session_scene_status", [
  "planned",
  "active",
  "completed",
]);

export const campaignSession = pgTable(
  "campaign_session",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    status: campaignSessionStatus("status").default("planned").notNull(),
    plannedFor: date("planned_for", { mode: "string" }),
    godNotes: text("god_notes").default("").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("campaign_session_campaign_id_idx").on(table.campaignId),
    uniqueIndex("campaign_session_id_campaign_uq").on(table.id, table.campaignId),
    index("campaign_session_campaign_status_idx").on(table.campaignId, table.status),
    uniqueIndex("campaign_session_campaign_sequence_uq").on(
      table.campaignId,
      table.sequenceNumber,
    ),
    uniqueIndex("campaign_session_one_active_per_campaign_uq")
      .on(table.campaignId)
      .where(sql`${table.status} = 'active'`),
    check("campaign_session_title_nonblank", sql`length(trim(${table.title})) > 0`),
    check("campaign_session_sequence_positive", sql`${table.sequenceNumber} > 0`),
    check(
      "campaign_session_lifecycle_timestamps_valid",
      sql`(
        (${table.status} = 'planned' AND ${table.startedAt} IS NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'active' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'completed' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const campaignSessionRoster = pgTable(
  "campaign_session_roster",
  {
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    prepNotes: text("prep_notes").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.characterId] }),
    foreignKey({
      columns: [table.sessionId, table.campaignId],
      foreignColumns: [campaignSession.id, campaignSession.campaignId],
      name: "campaign_session_roster_session_campaign_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.characterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_session_roster_character_campaign_fk",
    }).onDelete("cascade"),
    index("campaign_session_roster_session_order_idx").on(table.sessionId, table.sortOrder),
    index("campaign_session_roster_character_idx").on(table.characterId, table.campaignId),
    check("campaign_session_roster_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignSessionScene = pgTable(
  "campaign_session_scene",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    title: text("title").notNull(),
    status: campaignSessionSceneStatus("status").default("planned").notNull(),
    locationLabel: text("location_label").default("").notNull(),
    description: text("description").default("").notNull(),
    godNotes: text("god_notes").default("").notNull(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.campaignId],
      foreignColumns: [campaignSession.id, campaignSession.campaignId],
      name: "campaign_session_scene_session_campaign_fk",
    }).onDelete("cascade"),
    uniqueIndex("campaign_session_scene_id_session_campaign_uq").on(
      table.id,
      table.sessionId,
      table.campaignId,
    ),
    uniqueIndex("campaign_session_scene_session_sequence_uq").on(
      table.sessionId,
      table.sequenceNumber,
    ),
    uniqueIndex("campaign_session_scene_one_active_per_session_uq")
      .on(table.sessionId)
      .where(sql`${table.status} = 'active'`),
    index("campaign_session_scene_session_status_idx").on(table.sessionId, table.status),
    index("campaign_session_scene_session_order_idx").on(table.sessionId, table.sequenceNumber),
    check("campaign_session_scene_title_nonblank", sql`length(trim(${table.title})) > 0`),
    check("campaign_session_scene_sequence_positive", sql`${table.sequenceNumber} > 0`),
    check(
      "campaign_session_scene_lifecycle_timestamps_valid",
      sql`(
        (${table.status} = 'planned' AND ${table.startedAt} IS NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'active' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NULL)
        OR (${table.status} = 'completed' AND ${table.startedAt} IS NOT NULL AND ${table.completedAt} IS NOT NULL)
      )`,
    ),
  ],
);

export const campaignSessionSceneMember = pgTable(
  "campaign_session_scene_member",
  {
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sceneId, table.characterId] }),
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionScene.id,
        campaignSessionScene.sessionId,
        campaignSessionScene.campaignId,
      ],
      name: "campaign_session_scene_member_scene_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sessionId, table.characterId],
      foreignColumns: [campaignSessionRoster.sessionId, campaignSessionRoster.characterId],
      name: "campaign_session_scene_member_roster_fk",
    }).onDelete("restrict"),
    index("campaign_session_scene_member_scene_order_idx").on(table.sceneId, table.sortOrder),
    index("campaign_session_scene_member_roster_idx").on(table.sessionId, table.characterId),
    check("campaign_session_scene_member_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignSessionRelations = relations(campaignSession, ({ one, many }) => ({
  campaign: one(campaign, {
    fields: [campaignSession.campaignId],
    references: [campaign.id],
  }),
  roster: many(campaignSessionRoster),
  scenes: many(campaignSessionScene),
}));

export const campaignSessionRosterRelations = relations(campaignSessionRoster, ({ one, many }) => ({
  session: one(campaignSession, {
    fields: [campaignSessionRoster.sessionId],
    references: [campaignSession.id],
  }),
  character: one(campaignCharacter, {
    fields: [campaignSessionRoster.characterId],
    references: [campaignCharacter.id],
  }),
  sceneMemberships: many(campaignSessionSceneMember),
}));

export const campaignSessionSceneRelations = relations(campaignSessionScene, ({ one, many }) => ({
  session: one(campaignSession, {
    fields: [campaignSessionScene.sessionId],
    references: [campaignSession.id],
  }),
  members: many(campaignSessionSceneMember),
}));

export const campaignSessionSceneMemberRelations = relations(campaignSessionSceneMember, ({ one }) => ({
  scene: one(campaignSessionScene, {
    fields: [campaignSessionSceneMember.sceneId],
    references: [campaignSessionScene.id],
  }),
  roster: one(campaignSessionRoster, {
    fields: [campaignSessionSceneMember.sessionId, campaignSessionSceneMember.characterId],
    references: [campaignSessionRoster.sessionId, campaignSessionRoster.characterId],
  }),
}));

export type CampaignSessionStatus = (typeof campaignSessionStatus.enumValues)[number];
export type CampaignSessionSceneStatus = (typeof campaignSessionSceneStatus.enumValues)[number];

import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { campaign } from "./campaign-schema";

export const campaignSessionStatus = pgEnum("campaign_session_status", [
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

export const campaignSessionRelations = relations(campaignSession, ({ one }) => ({
  campaign: one(campaign, {
    fields: [campaignSession.campaignId],
    references: [campaign.id],
  }),
}));

export type CampaignSessionStatus = (typeof campaignSessionStatus.enumValues)[number];


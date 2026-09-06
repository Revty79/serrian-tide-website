import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { campaignCharacter } from "./realm-schema";
import { shop } from "./shop-schema";
import { campaignSessionScene } from "./tabletop-operations-schema";
import { town } from "./town-schema";

export const shopVisitPlacementKind = pgEnum("shop_visit_placement_kind", [
  "town",
  "independent",
]);

export const shopVisitMode = pgEnum("shop_visit_mode", [
  "roleplay",
  "shopping",
]);

export const shopVisitStatus = pgEnum("shop_visit_status", [
  "active",
  "ended",
]);

export const shopVisitMemberStatus = pgEnum("shop_visit_member_status", [
  "active",
  "ended",
]);

export const shopVisitMemberExitKind = pgEnum("shop_visit_member_exit_kind", [
  "player-left",
  "god-removed",
  "visit-ended",
  "lifecycle-ended",
  "permission-lost",
]);

/**
 * Shop visits deliberately retain their placement source as historical data.
 * The Scene, Campaign, Shop, and optional Town remain real constrained records;
 * the mutable placement row is validated and locked by the service at entry.
 */
export const campaignSessionSceneShopVisit = pgTable(
  "campaign_session_scene_shop_visit",
  {
    id: serial("id").primaryKey(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    shopId: integer("shop_id").notNull(),
    placementKind: shopVisitPlacementKind("placement_kind").notNull(),
    townId: integer("town_id"),
    mode: shopVisitMode("mode").default("shopping").notNull(),
    status: shopVisitStatus("status").default("active").notNull(),
    closedShopOverride: boolean("closed_shop_override").default(false).notNull(),
    closedShopOverrideReason: text("closed_shop_override_reason").default("").notNull(),
    startedByUserId: text("started_by_user_id").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedByUserId: text("ended_by_user_id"),
    endedAt: timestamp("ended_at"),
    endReason: text("end_reason").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionScene.id,
        campaignSessionScene.sessionId,
        campaignSessionScene.campaignId,
      ],
      name: "campaign_session_scene_shop_visit_scene_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.shopId, table.campaignId],
      foreignColumns: [shop.id, shop.campaignId],
      name: "campaign_session_scene_shop_visit_shop_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.townId, table.campaignId],
      foreignColumns: [town.id, town.campaignId],
      name: "campaign_session_scene_shop_visit_town_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.startedByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_scene_shop_visit_started_by_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.endedByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_scene_shop_visit_ended_by_fk",
    }).onDelete("restrict"),
    unique("campaign_session_scene_shop_visit_hierarchy_uq").on(
      table.id,
      table.sceneId,
      table.sessionId,
      table.campaignId,
    ),
    uniqueIndex("campaign_session_scene_shop_visit_one_active_shop_uq")
      .on(table.sceneId, table.shopId)
      .where(sql`${table.status} = 'active'`),
    index("campaign_session_scene_shop_visit_scene_status_idx").on(
      table.sceneId,
      table.status,
      table.startedAt,
      table.id,
    ),
    index("campaign_session_scene_shop_visit_shop_history_idx").on(
      table.shopId,
      table.startedAt,
      table.id,
    ),
    check(
      "campaign_session_scene_shop_visit_placement_valid",
      sql`(
        (${table.placementKind} = 'town' AND ${table.townId} IS NOT NULL)
        OR (${table.placementKind} = 'independent' AND ${table.townId} IS NULL)
      )`,
    ),
    check(
      "campaign_session_scene_shop_visit_override_valid",
      sql`(
        (${table.closedShopOverride} = false AND ${table.closedShopOverrideReason} = '')
        OR (${table.closedShopOverride} = true AND length(trim(${table.closedShopOverrideReason})) > 0)
      )`,
    ),
    check(
      "campaign_session_scene_shop_visit_state_valid",
      sql`(
        (${table.status} = 'active' AND ${table.endedAt} IS NULL AND ${table.endedByUserId} IS NULL AND ${table.endReason} = '')
        OR (${table.status} = 'ended' AND ${table.endedAt} IS NOT NULL AND ${table.endedByUserId} IS NOT NULL AND length(trim(${table.endReason})) > 0)
      )`,
    ),
    check(
      "campaign_session_scene_shop_visit_reason_lengths_valid",
      sql`length(${table.closedShopOverrideReason}) <= 1000 AND length(${table.endReason}) <= 1000`,
    ),
  ],
);

export const campaignSessionSceneShopVisitMember = pgTable(
  "campaign_session_scene_shop_visit_member",
  {
    id: serial("id").primaryKey(),
    visitId: integer("visit_id").notNull(),
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    characterId: integer("character_id").notNull(),
    status: shopVisitMemberStatus("status").default("active").notNull(),
    enteredByUserId: text("entered_by_user_id").notNull(),
    enteredAt: timestamp("entered_at").defaultNow().notNull(),
    exitedByUserId: text("exited_by_user_id"),
    exitedAt: timestamp("exited_at"),
    exitKind: shopVisitMemberExitKind("exit_kind"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.visitId, table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionSceneShopVisit.id,
        campaignSessionSceneShopVisit.sceneId,
        campaignSessionSceneShopVisit.sessionId,
        campaignSessionSceneShopVisit.campaignId,
      ],
      name: "campaign_session_scene_shop_visit_member_visit_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.characterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_session_scene_shop_visit_member_character_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.enteredByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_scene_shop_visit_member_entered_by_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.exitedByUserId],
      foreignColumns: [user.id],
      name: "campaign_session_scene_shop_visit_member_exited_by_fk",
    }).onDelete("restrict"),
    uniqueIndex("campaign_session_scene_shop_visit_member_one_active_character_uq")
      .on(table.characterId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("campaign_session_scene_shop_visit_member_one_active_visit_character_uq")
      .on(table.visitId, table.characterId)
      .where(sql`${table.status} = 'active'`),
    index("campaign_session_scene_shop_visit_member_visit_status_idx").on(
      table.visitId,
      table.status,
      table.enteredAt,
      table.id,
    ),
    index("campaign_session_scene_shop_visit_member_character_history_idx").on(
      table.characterId,
      table.enteredAt,
      table.id,
    ),
    check(
      "campaign_session_scene_shop_visit_member_state_valid",
      sql`(
        (${table.status} = 'active' AND ${table.exitedAt} IS NULL AND ${table.exitedByUserId} IS NULL AND ${table.exitKind} IS NULL)
        OR (${table.status} = 'ended' AND ${table.exitedAt} IS NOT NULL AND ${table.exitedByUserId} IS NOT NULL AND ${table.exitKind} IS NOT NULL)
      )`,
    ),
  ],
);

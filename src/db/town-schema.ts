import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";
import { campaignCharacter } from "./realm-schema";
import { shop } from "./shop-schema";

export const town = pgTable(
  "town",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    overview: text("overview").default("").notNull(),
    locationNotes: text("location_notes").default("").notNull(),
    godNotes: text("god_notes").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
    archivedByUserId: text("archived_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    archiveReason: text("archive_reason").default("").notNull(),
  },
  (table) => [
    unique("town_id_campaign_uq").on(table.id, table.campaignId),
    index("town_campaign_archive_idx").on(table.campaignId, table.archivedAt, table.name, table.id),
    index("town_archived_by_user_id_idx").on(table.archivedByUserId),
    check("town_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("town_name_length_valid", sql`length(${table.name}) <= 120`),
    check("town_category_nonblank", sql`length(trim(${table.category})) > 0`),
    check("town_category_length_valid", sql`length(${table.category}) <= 120`),
    check("town_overview_length_valid", sql`length(${table.overview}) <= 5000`),
    check("town_location_notes_length_valid", sql`length(${table.locationNotes}) <= 1000`),
    check("town_god_notes_length_valid", sql`length(${table.godNotes}) <= 5000`),
    check(
      "town_archive_state_valid",
      sql`(
        (${table.archivedAt} IS NULL AND ${table.archivedByUserId} IS NULL AND ${table.archiveReason} = '')
        OR ${table.archivedAt} IS NOT NULL
      )`,
    ),
    check("town_archive_reason_length_valid", sql`length(${table.archiveReason}) <= 1000`),
  ],
);

export const townShopMembership = pgTable(
  "town_shop_membership",
  {
    id: serial("id").primaryKey(),
    townId: integer("town_id").notNull(),
    shopId: integer("shop_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.townId, table.campaignId],
      foreignColumns: [town.id, town.campaignId],
      name: "town_shop_membership_town_campaign_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.shopId, table.campaignId],
      foreignColumns: [shop.id, shop.campaignId],
      name: "town_shop_membership_shop_campaign_fk",
    }).onDelete("restrict"),
    unique("town_shop_membership_town_shop_uq").on(table.townId, table.shopId),
    unique("town_shop_membership_shop_uq").on(table.shopId),
    index("town_shop_membership_town_order_idx").on(table.townId, table.sortOrder, table.id),
    index("town_shop_membership_campaign_idx").on(table.campaignId, table.shopId),
    check("town_shop_membership_sort_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const townNpcAssociation = pgTable(
  "town_npc_association",
  {
    id: serial("id").primaryKey(),
    townId: integer("town_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    npcCharacterId: integer("npc_character_id").notNull(),
    relationshipLabel: text("relationship_label").default("").notNull(),
    townNote: text("town_note").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.townId, table.campaignId],
      foreignColumns: [town.id, town.campaignId],
      name: "town_npc_association_town_campaign_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.npcCharacterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "town_npc_association_npc_campaign_fk",
    }).onDelete("restrict"),
    unique("town_npc_association_town_npc_uq").on(table.townId, table.npcCharacterId),
    index("town_npc_association_town_order_idx").on(table.townId, table.sortOrder, table.id),
    index("town_npc_association_npc_idx").on(table.npcCharacterId, table.townId),
    check("town_npc_association_relationship_length_valid", sql`length(${table.relationshipLabel}) <= 160`),
    check("town_npc_association_note_length_valid", sql`length(${table.townNote}) <= 1000`),
    check("town_npc_association_sort_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const townPlace = pgTable(
  "town_place",
  {
    id: serial("id").primaryKey(),
    townId: integer("town_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    name: text("name").notNull(),
    category: text("category").default("").notNull(),
    description: text("description").default("").notNull(),
    locationNotes: text("location_notes").default("").notNull(),
    godNotes: text("god_notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
    archivedByUserId: text("archived_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    archiveReason: text("archive_reason").default("").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.townId, table.campaignId],
      foreignColumns: [town.id, town.campaignId],
      name: "town_place_town_campaign_fk",
    }).onDelete("cascade"),
    index("town_place_town_archive_order_idx").on(table.townId, table.archivedAt, table.sortOrder, table.id),
    index("town_place_campaign_idx").on(table.campaignId, table.townId),
    index("town_place_archived_by_user_id_idx").on(table.archivedByUserId),
    check("town_place_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("town_place_name_length_valid", sql`length(${table.name}) <= 120`),
    check("town_place_category_length_valid", sql`length(${table.category}) <= 120`),
    check("town_place_description_length_valid", sql`length(${table.description}) <= 5000`),
    check("town_place_location_notes_length_valid", sql`length(${table.locationNotes}) <= 1000`),
    check("town_place_god_notes_length_valid", sql`length(${table.godNotes}) <= 5000`),
    check("town_place_sort_order_valid", sql`${table.sortOrder} >= 0`),
    check(
      "town_place_archive_state_valid",
      sql`(
        (${table.archivedAt} IS NULL AND ${table.archivedByUserId} IS NULL AND ${table.archiveReason} = '')
        OR ${table.archivedAt} IS NOT NULL
      )`,
    ),
    check("town_place_archive_reason_length_valid", sql`length(${table.archiveReason}) <= 1000`),
  ],
);

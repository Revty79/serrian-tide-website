import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";
import { item } from "./item-schema";
import { campaignCharacter } from "./realm-schema";

export const shop = pgTable(
  "shop",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description").default("").notNull(),
    locationNotes: text("location_notes").default("").notNull(),
    balanceCredits: doublePrecision("balance_credits").default(0).notNull(),
    storefrontState: text("storefront_state").default("closed").notNull(),
    characterPurchaseMode: text("character_purchase_mode")
      .default("god-approval-required")
      .notNull(),
    soldItemHandling: text("sold_item_handling")
      .default("add-to-shop-stock")
      .notNull(),
    changedSaleConfirmationMode: text("changed_sale_confirmation_mode")
      .default("character-owner-accepts")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
    archivedByUserId: text("archived_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    archiveReason: text("archive_reason").default("").notNull(),
  },
  (table) => [
    unique("shop_id_campaign_uq").on(table.id, table.campaignId),
    index("shop_campaign_archive_idx").on(
      table.campaignId,
      table.archivedAt,
      table.name,
      table.id,
    ),
    index("shop_archived_by_user_id_idx").on(table.archivedByUserId),
    check("shop_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("shop_name_length_valid", sql`length(${table.name}) <= 120`),
    check("shop_category_nonblank", sql`length(trim(${table.category})) > 0`),
    check("shop_category_length_valid", sql`length(${table.category}) <= 120`),
    check("shop_description_length_valid", sql`length(${table.description}) <= 5000`),
    check("shop_location_notes_length_valid", sql`length(${table.locationNotes}) <= 1000`),
    check("shop_balance_valid", sql`${table.balanceCredits} >= 0`),
    check("shop_storefront_state_valid", sql`${table.storefrontState} IN ('open','closed')`),
    check(
      "shop_character_purchase_mode_valid",
      sql`${table.characterPurchaseMode} IN ('immediate','god-approval-required')`,
    ),
    check(
      "shop_sold_item_handling_valid",
      sql`${table.soldItemHandling} IN ('add-to-shop-stock','remove-from-active-play')`,
    ),
    check(
      "shop_changed_sale_confirmation_mode_valid",
      sql`${table.changedSaleConfirmationMode} IN ('character-owner-accepts','god-approval-finalizes')`,
    ),
    check(
      "shop_archive_state_valid",
      sql`(
        (${table.archivedAt} IS NULL AND ${table.archivedByUserId} IS NULL AND ${table.archiveReason} = '')
        OR ${table.archivedAt} IS NOT NULL
      )`,
    ),
    check("shop_archive_reason_length_valid", sql`length(${table.archiveReason}) <= 1000`),
  ],
);

export const shopStaffAssignment = pgTable(
  "shop_staff_assignment",
  {
    id: serial("id").primaryKey(),
    shopId: integer("shop_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    npcCharacterId: integer("npc_character_id").notNull(),
    responsibilityLabel: text("responsibility_label").default("").notNull(),
    isPrimaryContact: boolean("is_primary_contact").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.shopId, table.campaignId],
      foreignColumns: [shop.id, shop.campaignId],
      name: "shop_staff_assignment_shop_campaign_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.npcCharacterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "shop_staff_assignment_npc_campaign_fk",
    }).onDelete("restrict"),
    unique("shop_staff_assignment_shop_npc_uq").on(table.shopId, table.npcCharacterId),
    uniqueIndex("shop_staff_assignment_one_primary_uq")
      .on(table.shopId)
      .where(sql`${table.isPrimaryContact} = true`),
    index("shop_staff_assignment_shop_order_idx").on(table.shopId, table.sortOrder, table.id),
    index("shop_staff_assignment_npc_idx").on(table.npcCharacterId, table.shopId),
    check(
      "shop_staff_assignment_responsibility_length_valid",
      sql`length(${table.responsibilityLabel}) <= 160`,
    ),
    check("shop_staff_assignment_sort_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const shopOffering = pgTable(
  "shop_offering",
  {
    id: serial("id").primaryKey(),
    shopId: integer("shop_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    fulfillmentKind: text("fulfillment_kind").default("inventory-transfer").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    unlimitedStock: boolean("unlimited_stock").default(true).notNull(),
    limitedQuantity: integer("limited_quantity"),
    sellingPriceOverrideCredits: doublePrecision("selling_price_override_credits"),
    buyingPriceOverrideCredits: doublePrecision("buying_price_override_credits"),
    sortOrder: integer("sort_order").default(0).notNull(),
    shopNote: text("shop_note").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.shopId, table.campaignId],
      foreignColumns: [shop.id, shop.campaignId],
      name: "shop_offering_shop_campaign_fk",
    }).onDelete("cascade"),
    unique("shop_offering_shop_item_uq").on(table.shopId, table.itemId),
    index("shop_offering_shop_order_idx").on(table.shopId, table.sortOrder, table.id),
    index("shop_offering_item_idx").on(table.itemId, table.shopId),
    index("shop_offering_campaign_enabled_idx").on(
      table.campaignId,
      table.itemId,
      table.enabled,
    ),
    check(
      "shop_offering_fulfillment_kind_valid",
      sql`${table.fulfillmentKind} IN ('inventory-transfer','service-narrative')`,
    ),
    check(
      "shop_offering_stock_valid",
      sql`(
        (${table.unlimitedStock} = true AND ${table.limitedQuantity} IS NULL)
        OR (${table.unlimitedStock} = false AND ${table.limitedQuantity} >= 0)
      )`,
    ),
    check(
      "shop_offering_selling_price_valid",
      sql`${table.sellingPriceOverrideCredits} IS NULL OR ${table.sellingPriceOverrideCredits} >= 0`,
    ),
    check(
      "shop_offering_buying_price_valid",
      sql`${table.buyingPriceOverrideCredits} IS NULL OR ${table.buyingPriceOverrideCredits} >= 0`,
    ),
    check("shop_offering_sort_order_valid", sql`${table.sortOrder} >= 0`),
    check("shop_offering_note_length_valid", sql`length(${table.shopNote}) <= 1000`),
  ],
);

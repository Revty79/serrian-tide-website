import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { campaignCharacter } from "./realm-schema";
import { shop } from "./shop-schema";
import {
  campaignSession,
  campaignSessionScene,
} from "./tabletop-operations-schema";
import { town, townPlace } from "./town-schema";

export const campaignSessionPreparedTown = pgTable(
  "campaign_session_prepared_town",
  {
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    townId: integer("town_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.townId] }),
    foreignKey({
      columns: [table.sessionId, table.campaignId],
      foreignColumns: [campaignSession.id, campaignSession.campaignId],
      name: "campaign_session_prepared_town_session_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.townId, table.campaignId],
      foreignColumns: [town.id, town.campaignId],
      name: "campaign_session_prepared_town_town_fk",
    }).onDelete("restrict"),
    unique("campaign_session_prepared_town_hierarchy_uq").on(
      table.sessionId,
      table.campaignId,
      table.townId,
    ),
    index("campaign_session_prepared_town_order_idx").on(
      table.sessionId,
      table.sortOrder,
      table.townId,
    ),
    index("campaign_session_prepared_town_source_idx").on(table.townId, table.sessionId),
    check("campaign_session_prepared_town_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignSessionPreparedShop = pgTable(
  "campaign_session_prepared_shop",
  {
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    shopId: integer("shop_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.shopId] }),
    foreignKey({
      columns: [table.sessionId, table.campaignId],
      foreignColumns: [campaignSession.id, campaignSession.campaignId],
      name: "campaign_session_prepared_shop_session_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.shopId, table.campaignId],
      foreignColumns: [shop.id, shop.campaignId],
      name: "campaign_session_prepared_shop_shop_fk",
    }).onDelete("restrict"),
    unique("campaign_session_prepared_shop_hierarchy_uq").on(
      table.sessionId,
      table.campaignId,
      table.shopId,
    ),
    index("campaign_session_prepared_shop_order_idx").on(
      table.sessionId,
      table.sortOrder,
      table.shopId,
    ),
    index("campaign_session_prepared_shop_source_idx").on(table.shopId, table.sessionId),
    check("campaign_session_prepared_shop_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignSessionSceneTown = pgTable(
  "campaign_session_scene_town",
  {
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    townId: integer("town_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    revealed: boolean("revealed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sceneId, table.townId] }),
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionScene.id,
        campaignSessionScene.sessionId,
        campaignSessionScene.campaignId,
      ],
      name: "campaign_session_scene_town_scene_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sessionId, table.campaignId, table.townId],
      foreignColumns: [
        campaignSessionPreparedTown.sessionId,
        campaignSessionPreparedTown.campaignId,
        campaignSessionPreparedTown.townId,
      ],
      name: "campaign_session_scene_town_prepared_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.townId, table.campaignId],
      foreignColumns: [town.id, town.campaignId],
      name: "campaign_session_scene_town_source_fk",
    }).onDelete("restrict"),
    unique("campaign_session_scene_town_hierarchy_uq").on(
      table.sceneId,
      table.sessionId,
      table.campaignId,
      table.townId,
    ),
    index("campaign_session_scene_town_order_idx").on(
      table.sceneId,
      table.sortOrder,
      table.townId,
    ),
    index("campaign_session_scene_town_source_idx").on(table.townId, table.sceneId),
    check("campaign_session_scene_town_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignSessionSceneTownShop = pgTable(
  "campaign_session_scene_town_shop",
  {
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    townId: integer("town_id").notNull(),
    shopId: integer("shop_id").notNull(),
    included: boolean("included").default(true).notNull(),
    revealed: boolean("revealed").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sceneId, table.townId, table.shopId] }),
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId, table.townId],
      foreignColumns: [
        campaignSessionSceneTown.sceneId,
        campaignSessionSceneTown.sessionId,
        campaignSessionSceneTown.campaignId,
        campaignSessionSceneTown.townId,
      ],
      name: "campaign_session_scene_town_shop_placement_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.shopId, table.campaignId],
      foreignColumns: [shop.id, shop.campaignId],
      name: "campaign_session_scene_town_shop_source_fk",
    }).onDelete("restrict"),
    index("campaign_session_scene_town_shop_order_idx").on(
      table.sceneId,
      table.townId,
      table.sortOrder,
      table.shopId,
    ),
    index("campaign_session_scene_town_shop_source_idx").on(table.shopId, table.sceneId),
    check("campaign_session_scene_town_shop_order_valid", sql`${table.sortOrder} >= 0`),
    check(
      "campaign_session_scene_town_shop_reveal_valid",
      sql`${table.included} = true OR ${table.revealed} = false`,
    ),
  ],
);

export const campaignSessionSceneTownPlace = pgTable(
  "campaign_session_scene_town_place",
  {
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    townId: integer("town_id").notNull(),
    placeId: integer("place_id").notNull(),
    included: boolean("included").default(true).notNull(),
    revealed: boolean("revealed").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sceneId, table.townId, table.placeId] }),
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId, table.townId],
      foreignColumns: [
        campaignSessionSceneTown.sceneId,
        campaignSessionSceneTown.sessionId,
        campaignSessionSceneTown.campaignId,
        campaignSessionSceneTown.townId,
      ],
      name: "campaign_session_scene_town_place_placement_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.placeId, table.townId, table.campaignId],
      foreignColumns: [townPlace.id, townPlace.townId, townPlace.campaignId],
      name: "campaign_session_scene_town_place_source_fk",
    }).onDelete("restrict"),
    index("campaign_session_scene_town_place_order_idx").on(
      table.sceneId,
      table.townId,
      table.sortOrder,
      table.placeId,
    ),
    index("campaign_session_scene_town_place_source_idx").on(table.placeId, table.sceneId),
    check("campaign_session_scene_town_place_order_valid", sql`${table.sortOrder} >= 0`),
    check(
      "campaign_session_scene_town_place_reveal_valid",
      sql`${table.included} = true OR ${table.revealed} = false`,
    ),
  ],
);

export const campaignSessionSceneTownNpc = pgTable(
  "campaign_session_scene_town_npc",
  {
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    townId: integer("town_id").notNull(),
    npcCharacterId: integer("npc_character_id").notNull(),
    included: boolean("included").default(true).notNull(),
    revealed: boolean("revealed").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sceneId, table.townId, table.npcCharacterId] }),
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId, table.townId],
      foreignColumns: [
        campaignSessionSceneTown.sceneId,
        campaignSessionSceneTown.sessionId,
        campaignSessionSceneTown.campaignId,
        campaignSessionSceneTown.townId,
      ],
      name: "campaign_session_scene_town_npc_placement_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.npcCharacterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_session_scene_town_npc_source_fk",
    }).onDelete("restrict"),
    index("campaign_session_scene_town_npc_order_idx").on(
      table.sceneId,
      table.townId,
      table.sortOrder,
      table.npcCharacterId,
    ),
    index("campaign_session_scene_town_npc_source_idx").on(table.npcCharacterId, table.sceneId),
    check("campaign_session_scene_town_npc_order_valid", sql`${table.sortOrder} >= 0`),
    check(
      "campaign_session_scene_town_npc_reveal_valid",
      sql`${table.included} = true OR ${table.revealed} = false`,
    ),
  ],
);

export const campaignSessionSceneShop = pgTable(
  "campaign_session_scene_shop",
  {
    sceneId: integer("scene_id").notNull(),
    sessionId: integer("session_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    shopId: integer("shop_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    revealed: boolean("revealed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sceneId, table.shopId] }),
    foreignKey({
      columns: [table.sceneId, table.sessionId, table.campaignId],
      foreignColumns: [
        campaignSessionScene.id,
        campaignSessionScene.sessionId,
        campaignSessionScene.campaignId,
      ],
      name: "campaign_session_scene_shop_scene_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sessionId, table.campaignId, table.shopId],
      foreignColumns: [
        campaignSessionPreparedShop.sessionId,
        campaignSessionPreparedShop.campaignId,
        campaignSessionPreparedShop.shopId,
      ],
      name: "campaign_session_scene_shop_prepared_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.shopId, table.campaignId],
      foreignColumns: [shop.id, shop.campaignId],
      name: "campaign_session_scene_shop_source_fk",
    }).onDelete("restrict"),
    index("campaign_session_scene_shop_order_idx").on(
      table.sceneId,
      table.sortOrder,
      table.shopId,
    ),
    index("campaign_session_scene_shop_source_idx").on(table.shopId, table.sceneId),
    check("campaign_session_scene_shop_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignSessionPreparedTownRelations = relations(
  campaignSessionPreparedTown,
  ({ one, many }) => ({
    session: one(campaignSession, {
      fields: [campaignSessionPreparedTown.sessionId],
      references: [campaignSession.id],
    }),
    town: one(town, {
      fields: [campaignSessionPreparedTown.townId],
      references: [town.id],
    }),
    scenePlacements: many(campaignSessionSceneTown),
  }),
);

export const campaignSessionPreparedShopRelations = relations(
  campaignSessionPreparedShop,
  ({ one, many }) => ({
    session: one(campaignSession, {
      fields: [campaignSessionPreparedShop.sessionId],
      references: [campaignSession.id],
    }),
    shop: one(shop, {
      fields: [campaignSessionPreparedShop.shopId],
      references: [shop.id],
    }),
    scenePlacements: many(campaignSessionSceneShop),
  }),
);

export const campaignSessionSceneTownRelations = relations(
  campaignSessionSceneTown,
  ({ one, many }) => ({
    scene: one(campaignSessionScene, {
      fields: [campaignSessionSceneTown.sceneId],
      references: [campaignSessionScene.id],
    }),
    preparedTown: one(campaignSessionPreparedTown, {
      fields: [campaignSessionSceneTown.sessionId, campaignSessionSceneTown.townId],
      references: [campaignSessionPreparedTown.sessionId, campaignSessionPreparedTown.townId],
    }),
    town: one(town, {
      fields: [campaignSessionSceneTown.townId],
      references: [town.id],
    }),
    shops: many(campaignSessionSceneTownShop),
    places: many(campaignSessionSceneTownPlace),
    npcs: many(campaignSessionSceneTownNpc),
  }),
);

export const campaignSessionSceneShopRelations = relations(
  campaignSessionSceneShop,
  ({ one }) => ({
    scene: one(campaignSessionScene, {
      fields: [campaignSessionSceneShop.sceneId],
      references: [campaignSessionScene.id],
    }),
    preparedShop: one(campaignSessionPreparedShop, {
      fields: [campaignSessionSceneShop.sessionId, campaignSessionSceneShop.shopId],
      references: [campaignSessionPreparedShop.sessionId, campaignSessionPreparedShop.shopId],
    }),
    shop: one(shop, {
      fields: [campaignSessionSceneShop.shopId],
      references: [shop.id],
    }),
  }),
);

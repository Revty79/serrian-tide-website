import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";

export const derivedAbility = pgTable(
  "derived_ability",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    mechanicalEffect: text("mechanical_effect").default("").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceSystem: text("source_system"),
    sourceExternalId: text("source_external_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("derived_ability_name_nonblank", sql`length(trim(${table.name})) > 0`),
    index("derived_ability_name_idx").on(table.name, table.id),
    index("derived_ability_created_by_user_idx").on(table.createdByUserId),
    uniqueIndex("derived_ability_source_identity_uq")
      .on(table.sourceSystem, table.sourceExternalId)
      .where(sql`${table.sourceSystem} IS NOT NULL AND ${table.sourceExternalId} IS NOT NULL`),
  ],
);

export const derivedAbilityTrigger = pgTable(
  "derived_ability_trigger",
  {
    id: serial("id").primaryKey(),
    derivedAbilityId: integer("derived_ability_id")
      .notNull()
      .references(() => derivedAbility.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").notNull(),
    attributeKey: text("attribute_key"),
    minimumScore: integer("minimum_score"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("derived_ability_trigger_ability_idx").on(
      table.derivedAbilityId,
      table.sortOrder,
      table.id,
    ),
    uniqueIndex("derived_ability_trigger_order_uq").on(
      table.derivedAbilityId,
      table.sortOrder,
    ),
    check("derived_ability_trigger_type_v1", sql`${table.triggerType} = 'attribute'`),
    check(
      "derived_ability_trigger_attribute_key_v1",
      sql`${table.attributeKey} IS NOT NULL AND ${table.attributeKey} IN ('STR', 'DEX', 'CON', 'INT', 'WIS', 'CHR')`,
    ),
    check(
      "derived_ability_trigger_minimum_score_v1",
      sql`${table.minimumScore} IS NOT NULL AND ${table.minimumScore} >= 0`,
    ),
    check("derived_ability_trigger_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignAllowedDerivedAbility = pgTable(
  "campaign_allowed_derived_ability",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    derivedAbilityId: integer("derived_ability_id")
      .notNull()
      .references(() => derivedAbility.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.derivedAbilityId] }),
    uniqueIndex("campaign_allowed_derived_ability_order_uq").on(
      table.campaignId,
      table.sortOrder,
    ),
    index("campaign_allowed_derived_ability_ability_idx").on(
      table.derivedAbilityId,
      table.campaignId,
    ),
    check("campaign_allowed_derived_ability_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const derivedAbilityRelations = relations(derivedAbility, ({ many }) => ({
  triggers: many(derivedAbilityTrigger),
  campaignAssignments: many(campaignAllowedDerivedAbility),
}));

export const derivedAbilityTriggerRelations = relations(
  derivedAbilityTrigger,
  ({ one }) => ({
    derivedAbility: one(derivedAbility, {
      fields: [derivedAbilityTrigger.derivedAbilityId],
      references: [derivedAbility.id],
    }),
  }),
);

export const campaignAllowedDerivedAbilityRelations = relations(
  campaignAllowedDerivedAbility,
  ({ one }) => ({
    campaign: one(campaign, {
      fields: [campaignAllowedDerivedAbility.campaignId],
      references: [campaign.id],
    }),
    derivedAbility: one(derivedAbility, {
      fields: [campaignAllowedDerivedAbility.derivedAbilityId],
      references: [derivedAbility.id],
    }),
  }),
);

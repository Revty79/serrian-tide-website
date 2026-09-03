import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const campaignCurrencySystem = pgEnum(
  "campaign_currency_system",
  ["Credits", "Derived Currency"],
);

export const campaignFatePointMethod = pgEnum(
  "campaign_fate_point_method",
  ["Assigned", "Rolled"],
);

export const campaignSystem = pgEnum(
  "campaign_system",
  [
    "Tier 1",
    "Tier 2",
    "Tier 3",
    "Spellcraft",
    "Talismanism",
    "Faith",
    "Psyonics",
    "Special Abilities",
    "Bardic Resonance",
    "Derived Abilities",
  ],
);

export const campaign = pgTable(
  "campaign",
  {
    id: serial("id").primaryKey(),

    name: text("name").notNull(),

    overview: text("overview")
      .default("")
      .notNull(),

    attributePoints: doublePrecision("attribute_points").notNull(),
    skillPoints: doublePrecision("skill_points").notNull(),

    maxStartingSkill: doublePrecision("max_starting_skill").notNull(),

    pointsToUnlockNextTier: doublePrecision(
      "points_to_unlock_next_tier",
    ).notNull(),

    maxPointsInSkill: doublePrecision(
      "max_points_in_skill",
    ).notNull(),

    startingCreditAmount: doublePrecision(
      "starting_credit_amount",
    ).notNull(),

    currencySystem: campaignCurrencySystem(
      "currency_system",
    ).notNull(),

    fatePointMethod: campaignFatePointMethod(
      "fate_point_method",
    ).notNull(),

    assignedFatePoints: integer("assigned_fate_points"),

    legacyDerivedAbilityCompatibilityResolved: boolean(
      "legacy_derived_ability_compatibility_resolved",
    )
      .default(false)
      .notNull(),

    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("campaign_created_by_user_id_idx").on(
      table.createdByUserId,
    ),
  ],
);

export const campaignDerivedCurrency = pgTable(
  "campaign_derived_currency",
  {
    id: serial("id").primaryKey(),

    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, {
        onDelete: "cascade",
      }),

    name: text("name").notNull(),

    description: text("description").notNull(),

    creditsPerUnit: doublePrecision(
      "credits_per_unit",
    ).notNull(),

    sortOrder: integer("sort_order")
      .default(0)
      .notNull(),
  },
  (table) => [
    index("campaign_derived_currency_campaign_id_idx").on(
      table.campaignId,
    ),
  ],
);

export const campaignAllowedSystem = pgTable(
  "campaign_allowed_system",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, {
        onDelete: "cascade",
      }),

    system: campaignSystem("system").notNull(),

    sortOrder: integer("sort_order")
      .default(0)
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.campaignId,
        table.system,
      ],
    }),

    index("campaign_allowed_system_campaign_id_idx").on(
      table.campaignId,
    ),
  ],
);

export const campaignPlayer = pgTable(
  "campaign_player",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, {
        onDelete: "cascade",
      }),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "cascade",
      }),

    isNpcController: boolean("is_npc_controller")
      .default(false)
      .notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.campaignId,
        table.userId,
      ],
    }),

    index("campaign_player_user_id_idx").on(
      table.userId,
    ),
  ],
);

export const campaignRelations = relations(
  campaign,
  ({ one, many }) => ({
    creator: one(user, {
      fields: [campaign.createdByUserId],
      references: [user.id],
    }),

    derivedCurrencies: many(
      campaignDerivedCurrency,
    ),

    allowedSystems: many(
      campaignAllowedSystem,
    ),

    players: many(campaignPlayer),
  }),
);

export const campaignDerivedCurrencyRelations =
  relations(
    campaignDerivedCurrency,
    ({ one }) => ({
      campaign: one(campaign, {
        fields: [
          campaignDerivedCurrency.campaignId,
        ],
        references: [campaign.id],
      }),
    }),
  );

export const campaignAllowedSystemRelations =
  relations(
    campaignAllowedSystem,
    ({ one }) => ({
      campaign: one(campaign, {
        fields: [
          campaignAllowedSystem.campaignId,
        ],
        references: [campaign.id],
      }),
    }),
  );

export const campaignPlayerRelations = relations(
  campaignPlayer,
  ({ one }) => ({
    campaign: one(campaign, {
      fields: [campaignPlayer.campaignId],
      references: [campaign.id],
    }),

    user: one(user, {
      fields: [campaignPlayer.userId],
      references: [user.id],
    }),
  }),
);

export type CampaignSystem =
  (typeof campaignSystem.enumValues)[number];

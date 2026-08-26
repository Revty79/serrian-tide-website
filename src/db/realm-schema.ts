import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  doublePrecision,
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
import { campaign, campaignDerivedCurrency } from "./campaign-schema";
import { creature } from "./creature-schema";
import { item, itemTagCatalog } from "./item-schema";
import { race } from "./race-schema";
import { skill } from "./skill-schema";

export const CHARACTER_ATTRIBUTE_KEYS = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHR",
] as const;

export type CharacterAttributeKey = (typeof CHARACTER_ATTRIBUTE_KEYS)[number];

export const campaignAllowedRace = pgTable(
  "campaign_allowed_race",
  {
    campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
    raceId: integer("race_id").notNull().references(() => race.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.raceId] }),
    uniqueIndex("campaign_allowed_race_order_uq").on(table.campaignId, table.sortOrder),
  ],
);

export const campaignInventoryItem = pgTable(
  "campaign_inventory_item",
  {
    campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.itemId] }),
    uniqueIndex("campaign_inventory_item_order_uq").on(table.campaignId, table.sortOrder),
  ],
);

export const campaignInventoryTag = pgTable(
  "campaign_inventory_tag",
  {
    campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => itemTagCatalog.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.tagId] }),
    uniqueIndex("campaign_inventory_tag_order_uq").on(table.campaignId, table.sortOrder),
  ],
);

export const campaignCharacter = pgTable(
  "campaign_character",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
    playerUserId: text("player_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").default("New Character").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    isNpc: boolean("is_npc").default(false).notNull(),
    npcKind: text("npc_kind").default("race").notNull(),
  },
  (table) => [
    index("campaign_character_campaign_id_idx").on(table.campaignId),
    index("campaign_character_player_user_id_idx").on(table.playerUserId),
    check("campaign_character_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("campaign_character_npc_kind_valid", sql`${table.npcKind} IN ('race', 'creature')`),
  ],
);

export const campaignCharacterProfile = pgTable(
  "campaign_character_profile",
  {
    characterId: integer("character_id").primaryKey().references(() => campaignCharacter.id, { onDelete: "cascade" }),
    raceId: integer("race_id").references(() => race.id, { onDelete: "restrict" }),
    age: integer("age"),
    sex: text("sex").default("").notNull(),
    height: doublePrecision("height"),
    weight: doublePrecision("weight"),
    skinColor: text("skin_color").default("").notNull(),
    eyeColor: text("eye_color").default("").notNull(),
    hairColor: text("hair_color").default("").notNull(),
    deity: text("deity").default("").notNull(),
    definingMarks: text("defining_marks").default("").notNull(),
    personality: text("personality").default("").notNull(),
    goals: text("goals").default("").notNull(),
    secrets: text("secrets").default("").notNull(),
    backstory: text("backstory").default("").notNull(),
    motivations: text("motivations").default("").notNull(),
    fame: doublePrecision("fame").default(0).notNull(),
    experience: doublePrecision("experience").default(0).notNull(),
    totalExperience: doublePrecision("total_experience").default(0).notNull(),
    quintessence: doublePrecision("quintessence").default(0).notNull(),
    totalQuintessence: doublePrecision("total_quintessence").default(0).notNull(),
    creditsRemaining: doublePrecision("credits_remaining").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    creationCompletedAt: timestamp("creation_completed_at"),
    heightFeet: integer("height_feet"),
    heightInches: integer("height_inches"),
    fatePoints: integer("fate_points"),
  },
  (table) => [
    check("campaign_character_profile_age_valid", sql`${table.age} IS NULL OR ${table.age} >= 0`),
    check("campaign_character_profile_height_valid", sql`${table.height} IS NULL OR ${table.height} >= 0`),
    check("campaign_character_profile_weight_valid", sql`${table.weight} IS NULL OR ${table.weight} >= 0`),
    check("campaign_character_profile_credits_valid", sql`${table.creditsRemaining} >= 0`),
    check("campaign_character_profile_fate_valid", sql`${table.fatePoints} IS NULL OR ${table.fatePoints} >= 0`),
  ],
);

export const campaignCharacterAttribute = pgTable(
  "campaign_character_attribute",
  {
    characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "cascade" }),
    attributeKey: text("attribute_key").notNull(),
    value: doublePrecision("value").default(25).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.attributeKey] }),
    check("campaign_character_attribute_key_valid", sql`${table.attributeKey} IN ('STR','DEX','CON','INT','WIS','CHR')`),
    check("campaign_character_attribute_value_valid", sql`${table.value} >= 0`),
  ],
);

export const campaignCharacterSkillAllocation = pgTable(
  "campaign_character_skill_allocation",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "cascade" }),
    skillId: integer("skill_id").notNull().references(() => skill.id, { onDelete: "restrict" }),
    parentAllocationId: integer("parent_allocation_id").references(
      (): AnyPgColumn => campaignCharacterSkillAllocation.id,
      { onDelete: "cascade" },
    ),
    points: doublePrecision("points").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("campaign_character_skill_allocation_character_idx").on(table.characterId),
    index("campaign_character_skill_allocation_skill_idx").on(table.skillId),
    check("campaign_character_skill_allocation_points_valid", sql`${table.points} >= 0`),
  ],
);

export const campaignCharacterCurrencyHolding = pgTable(
  "campaign_character_currency_holding",
  {
    characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "cascade" }),
    currencyId: integer("currency_id").notNull().references(() => campaignDerivedCurrency.id, { onDelete: "restrict" }),
    quantity: integer("quantity").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.currencyId] }),
    check("campaign_character_currency_quantity_valid", sql`${table.quantity} >= 0`),
  ],
);

export const campaignCharacterItem = pgTable(
  "campaign_character_item",
  {
    characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitCostCredits: doublePrecision("unit_cost_credits").notNull(),
    acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.itemId] }),
    check("campaign_character_item_quantity_valid", sql`${table.quantity} > 0`),
    check("campaign_character_item_cost_valid", sql`${table.unitCostCredits} >= 0`),
  ],
);

export const campaignCharacterSpellDocument = pgTable(
  "campaign_character_spell_document",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "cascade" }),
    documentId: text("document_id").notNull(),
    name: text("name").default("").notNull(),
    tradition: text("tradition").notNull(),
    documentJson: text("document_json").notNull(),
    inSpellbook: boolean("in_spellbook").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("campaign_character_spell_document_identity_uq").on(table.characterId, table.documentId),
    index("campaign_character_spell_document_character_idx").on(table.characterId),
    check("campaign_character_spell_document_id_nonblank", sql`length(trim(${table.documentId})) > 0`),
  ],
);

export const campaignCreatureNpcProfile = pgTable(
  "campaign_creature_npc_profile",
  {
    characterId: integer("character_id").primaryKey().references(() => campaignCharacter.id, { onDelete: "cascade" }),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "restrict" }),
    personality: text("personality").default("").notNull(),
    instanceNotes: text("instance_notes").default("").notNull(),
    hpAdjustment: doublePrecision("hp_adjustment").default(0).notNull(),
    baselineSnapshotJson: text("baseline_snapshot_json").notNull(),
    currentSnapshotJson: text("current_snapshot_json").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("campaign_creature_npc_profile_creature_idx").on(table.creatureId),
  ],
);

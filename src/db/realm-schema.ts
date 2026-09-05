import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { campaign, campaignDerivedCurrency, campaignPlayer } from "./campaign-schema";
import { creature } from "./creature-schema";
import {
  item,
  itemTagCatalog,
  weaponFiringMode,
  weaponProfile,
} from "./item-schema";
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
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    raceId: integer("race_id")
      .notNull()
      .references(() => race.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.raceId] }),
    uniqueIndex("campaign_allowed_race_order_uq").on(
      table.campaignId,
      table.sortOrder,
    ),
    index("campaign_allowed_race_race_idx").on(table.raceId, table.campaignId),
    check("campaign_allowed_race_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignInventoryItem = pgTable(
  "campaign_inventory_item",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.itemId] }),
    uniqueIndex("campaign_inventory_item_order_uq").on(
      table.campaignId,
      table.sortOrder,
    ),
    index("campaign_inventory_item_item_idx").on(table.itemId, table.campaignId),
    check("campaign_inventory_item_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignInventoryTag = pgTable(
  "campaign_inventory_tag",
  {
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => itemTagCatalog.id, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.tagId] }),
    uniqueIndex("campaign_inventory_tag_order_uq").on(
      table.campaignId,
      table.sortOrder,
    ),
    index("campaign_inventory_tag_tag_idx").on(table.tagId, table.campaignId),
    check("campaign_inventory_tag_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const campaignCharacter = pgTable(
  "campaign_character",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    playerUserId: text("player_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").default("New Character").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    isNpc: boolean("is_npc").default(false).notNull(),
    npcKind: text("npc_kind").default("race").notNull(),
    npcBuildMode: text("npc_build_mode"),
    npcRoleLabel: text("npc_role_label").default("").notNull(),
    archivedAt: timestamp("archived_at"),
    archivedByUserId: text("archived_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    archiveReason: text("archive_reason").default("").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.campaignId, table.playerUserId],
      foreignColumns: [campaignPlayer.campaignId, campaignPlayer.userId],
      name: "campaign_character_campaign_player_fk",
    }).onDelete("cascade"),
    index("campaign_character_campaign_id_idx").on(table.campaignId),
    uniqueIndex("campaign_character_id_campaign_uq").on(table.id, table.campaignId),
    index("campaign_character_player_user_id_idx").on(table.playerUserId),
    index("campaign_character_player_campaign_idx").on(
      table.playerUserId,
      table.campaignId,
      table.isNpc,
    ),
    index("campaign_character_campaign_archive_idx").on(
      table.campaignId,
      table.isNpc,
      table.archivedAt,
      table.name,
      table.id,
    ),
    check(
      "campaign_character_name_nonblank",
      sql`length(trim(${table.name})) > 0`,
    ),
    check(
      "campaign_character_npc_kind_valid",
      sql`${table.npcKind} IN ('race', 'creature')`,
    ),
    check(
      "campaign_character_npc_build_mode_valid",
      sql`${table.npcBuildMode} IS NULL OR ${table.npcBuildMode} IN ('simple', 'detailed')`,
    ),
    check(
      "campaign_character_npc_build_mode_presence",
      sql`(
        (${table.isNpc} = true AND ${table.npcBuildMode} IS NOT NULL)
        OR (${table.isNpc} = false AND ${table.npcBuildMode} IS NULL)
      )`,
    ),
    check(
      "campaign_character_archive_state_valid",
      sql`(
        (${table.archivedAt} IS NULL AND ${table.archivedByUserId} IS NULL AND ${table.archiveReason} = '')
        OR ${table.archivedAt} IS NOT NULL
      )`,
    ),
  ],
);

export const campaignCharacterProfile = pgTable(
  "campaign_character_profile",
  {
    characterId: integer("character_id")
      .primaryKey()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    raceId: integer("race_id").references(() => race.id, {
      onDelete: "restrict",
    }),
    age: integer("age"),
    sex: text("sex").default("").notNull(),
    // Preserved for compatibility with the pre-0020 archive. New UI uses feet/inches.
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
    hpMultiplierSteps: integer("hp_multiplier_steps").default(0).notNull(),
    baseMovementSteps: integer("base_movement_steps").default(0).notNull(),
    baseMagicSteps: integer("base_magic_steps").default(0).notNull(),
  },
  (table) => [
    index("campaign_character_profile_race_idx").on(table.raceId, table.characterId),
    check(
      "campaign_character_profile_age_valid",
      sql`${table.age} IS NULL OR ${table.age} >= 0`,
    ),
    check(
      "campaign_character_profile_height_valid",
      sql`${table.height} IS NULL OR ${table.height} >= 0`,
    ),
    check(
      "campaign_character_profile_height_feet_valid",
      sql`${table.heightFeet} IS NULL OR ${table.heightFeet} >= 0`,
    ),
    check(
      "campaign_character_profile_height_inches_valid",
      sql`${table.heightInches} IS NULL OR (${table.heightInches} >= 0 AND ${table.heightInches} <= 11)`,
    ),
    check(
      "campaign_character_profile_weight_valid",
      sql`${table.weight} IS NULL OR ${table.weight} >= 0`,
    ),
    check(
      "campaign_character_profile_progress_valid",
      sql`${table.fame} >= 0 AND ${table.experience} >= 0 AND ${table.totalExperience} >= 0 AND ${table.quintessence} >= 0 AND ${table.totalQuintessence} >= 0`,
    ),
    check(
      "campaign_character_profile_credits_valid",
      sql`${table.creditsRemaining} >= 0`,
    ),
    check(
      "campaign_character_profile_fate_valid",
      sql`${table.fatePoints} IS NULL OR ${table.fatePoints} >= 0`,
    ),
    check(
      "campaign_character_profile_hp_multiplier_steps_valid",
      sql`${table.hpMultiplierSteps} >= 0`,
    ),
    check(
      "campaign_character_profile_base_movement_steps_valid",
      sql`${table.baseMovementSteps} >= 0`,
    ),
    check(
      "campaign_character_profile_base_magic_steps_valid",
      sql`${table.baseMagicSteps} >= 0`,
    ),
  ],
);

export const campaignCharacterAttribute = pgTable(
  "campaign_character_attribute",
  {
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    attributeKey: text("attribute_key").notNull(),
    value: doublePrecision("value").default(25).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.attributeKey] }),
    check(
      "campaign_character_attribute_key_valid",
      sql`${table.attributeKey} IN ('STR','DEX','CON','INT','WIS','CHR')`,
    ),
    check(
      "campaign_character_attribute_value_valid",
      sql`${table.value} >= 0`,
    ),
  ],
);

export const campaignCharacterSkillAllocation = pgTable(
  "campaign_character_skill_allocation",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skill.id, { onDelete: "restrict" }),
    parentAllocationId: integer("parent_allocation_id"),
    // Zero is intentionally valid: racial grants can require structural parent anchors.
    points: doublePrecision("points").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("campaign_character_skill_allocation_character_uq").on(
      table.id,
      table.characterId,
    ),
    foreignKey({
      columns: [table.parentAllocationId, table.characterId],
      foreignColumns: [table.id, table.characterId],
      name: "campaign_character_skill_allocation_parent_fk",
    }).onDelete("cascade"),
    uniqueIndex("campaign_character_skill_root_uq")
      .on(table.characterId, table.skillId)
      .where(sql`${table.parentAllocationId} IS NULL`),
    uniqueIndex("campaign_character_skill_branch_uq")
      .on(table.characterId, table.skillId, table.parentAllocationId)
      .where(sql`${table.parentAllocationId} IS NOT NULL`),
    index("campaign_character_skill_allocation_character_idx").on(
      table.characterId,
      table.parentAllocationId,
      table.skillId,
    ),
    index("campaign_character_skill_allocation_skill_idx").on(
      table.skillId,
      table.characterId,
    ),
    check(
      "campaign_character_skill_allocation_points_valid",
      sql`${table.points} >= 0`,
    ),
    check(
      "campaign_character_skill_allocation_not_self",
      sql`${table.parentAllocationId} IS NULL OR ${table.parentAllocationId} <> ${table.id}`,
    ),
  ],
);

export const campaignCharacterCurrencyHolding = pgTable(
  "campaign_character_currency_holding",
  {
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    currencyId: integer("currency_id")
      .notNull()
      .references(() => campaignDerivedCurrency.id, { onDelete: "restrict" }),
    quantity: integer("quantity").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.currencyId] }),
    index("campaign_character_currency_currency_idx").on(
      table.currencyId,
      table.characterId,
    ),
    check(
      "campaign_character_currency_quantity_valid",
      sql`${table.quantity} >= 0`,
    ),
  ],
);

export const campaignCharacterItem = pgTable(
  "campaign_character_item",
  {
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitCostCredits: doublePrecision("unit_cost_credits").notNull(),
    acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.itemId] }),
    index("campaign_character_item_catalog_idx").on(table.itemId, table.characterId),
    check(
      "campaign_character_item_quantity_valid",
      sql`${table.quantity} > 0`,
    ),
    check(
      "campaign_character_item_cost_valid",
      sql`${table.unitCostCredits} >= 0`,
    ),
  ],
);

export const campaignCharacterWeaponOverride = pgTable(
  "campaign_character_weapon_override",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    weaponProfileId: integer("weapon_profile_id").notNull(),
    firingModeId: integer("firing_mode_id"),
    skillAllocationId: integer("skill_allocation_id"),
    attributeKey: text("attribute_key"),
    reason: text("reason").notNull(),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.characterId, table.campaignId],
      foreignColumns: [campaignCharacter.id, campaignCharacter.campaignId],
      name: "campaign_character_weapon_override_character_campaign_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.weaponProfileId, table.itemId],
      foreignColumns: [weaponProfile.id, weaponProfile.itemId],
      name: "campaign_character_weapon_override_profile_item_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.firingModeId, table.weaponProfileId],
      foreignColumns: [weaponFiringMode.id, weaponFiringMode.weaponProfileId],
      name: "campaign_character_weapon_override_mode_profile_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.skillAllocationId, table.characterId],
      foreignColumns: [
        campaignCharacterSkillAllocation.id,
        campaignCharacterSkillAllocation.characterId,
      ],
      name: "campaign_character_weapon_override_allocation_character_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.characterId, table.attributeKey],
      foreignColumns: [
        campaignCharacterAttribute.characterId,
        campaignCharacterAttribute.attributeKey,
      ],
      name: "campaign_character_weapon_override_attribute_character_fk",
    }).onDelete("restrict"),
    uniqueIndex("campaign_character_weapon_override_weapon_scope_uq")
      .on(table.campaignId, table.characterId, table.weaponProfileId)
      .where(sql`${table.firingModeId} IS NULL`),
    uniqueIndex("campaign_character_weapon_override_mode_scope_uq")
      .on(
        table.campaignId,
        table.characterId,
        table.weaponProfileId,
        table.firingModeId,
      )
      .where(sql`${table.firingModeId} IS NOT NULL`),
    index("campaign_character_weapon_override_lookup_idx").on(
      table.campaignId,
      table.characterId,
      table.weaponProfileId,
      table.firingModeId,
    ),
    check(
      "campaign_character_weapon_override_one_source",
      sql`(
        (${table.skillAllocationId} IS NOT NULL AND ${table.attributeKey} IS NULL)
        OR
        (${table.skillAllocationId} IS NULL AND ${table.attributeKey} IS NOT NULL)
      )`,
    ),
    check(
      "campaign_character_weapon_override_attribute_valid",
      sql`${table.attributeKey} IS NULL OR ${table.attributeKey} IN ('STR','DEX','CON','INT','WIS','CHR')`,
    ),
    check(
      "campaign_character_weapon_override_reason_valid",
      sql`length(trim(${table.reason})) > 0 AND length(${table.reason}) <= 1000`,
    ),
  ],
);

export const campaignCharacterItemEquipmentState = pgTable(
  "campaign_character_item_equipment_state",
  {
    characterId: integer("character_id")
      .notNull(),
    itemId: integer("item_id")
      .notNull(),
    state: text("state").notNull(),
    quantity: integer("quantity").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.itemId, table.state] }),
    foreignKey({
      columns: [table.characterId, table.itemId],
      foreignColumns: [campaignCharacterItem.characterId, campaignCharacterItem.itemId],
      name: "campaign_character_item_equipment_state_ownership_fk",
    }).onDelete("cascade"),
    index("campaign_character_item_equipment_state_item_idx").on(table.itemId, table.characterId),
    check("campaign_character_item_equipment_state_state_valid", sql`${table.state} IN ('equipped','worn','wielded')`),
    check("campaign_character_item_equipment_state_quantity_valid", sql`${table.quantity} > 0`),
  ],
);

export const campaignCharacterItemInstance = pgTable(
  "campaign_character_item_instance",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => item.id, { onDelete: "restrict" }),
    currentCharges: integer("current_charges").notNull(),
    equipmentState: text("equipment_state").default("inactive").notNull(),
    unitCostCredits: doublePrecision("unit_cost_credits").notNull(),
    acquiredAt: timestamp("acquired_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("campaign_character_item_instance_exact_identity_uq").on(
      table.id,
      table.characterId,
      table.itemId,
    ),
    index("campaign_character_item_instance_character_idx").on(
      table.characterId,
      table.itemId,
    ),
    index("campaign_character_item_instance_catalog_idx").on(
      table.itemId,
      table.characterId,
    ),
    check(
      "campaign_character_item_instance_charges_valid",
      sql`${table.currentCharges} >= 0`,
    ),
    check(
      "campaign_character_item_instance_equipment_state_valid",
      sql`${table.equipmentState} IN ('inactive','equipped','worn','wielded')`,
    ),
    check(
      "campaign_character_item_instance_cost_valid",
      sql`${table.unitCostCredits} >= 0`,
    ),
  ],
);

export const campaignCharacterSpellDocument = pgTable(
  "campaign_character_spell_document",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    documentId: text("document_id").notNull(),
    name: text("name").default("").notNull(),
    tradition: text("tradition").notNull(),
    documentJson: text("document_json").notNull(),
    inSpellbook: boolean("in_spellbook").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("campaign_character_spell_document_identity_uq").on(
      table.characterId,
      table.documentId,
    ),
    index("campaign_character_spell_document_character_idx").on(table.characterId),
    check(
      "campaign_character_spell_document_id_nonblank",
      sql`length(trim(${table.documentId})) > 0`,
    ),
    check(
      "campaign_character_spell_document_tradition_valid",
      sql`${table.tradition} IN ('Spellcraft/Talismanism/Faith', 'Psionics', 'Bardic Resonance')`,
    ),
    check(
      "campaign_character_spell_document_json_nonblank",
      sql`length(trim(${table.documentJson})) > 0`,
    ),
    check(
      "campaign_character_spell_document_json_valid",
      sql`${table.documentJson}::jsonb IS NOT NULL`,
    ),
  ],
);

export const campaignCreatureNpcProfile = pgTable(
  "campaign_creature_npc_profile",
  {
    characterId: integer("character_id")
      .primaryKey()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    creatureId: integer("creature_id")
      .notNull()
      .references(() => creature.id, { onDelete: "restrict" }),
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
    check(
      "campaign_creature_npc_baseline_nonblank",
      sql`length(trim(${table.baselineSnapshotJson})) > 0`,
    ),
    check(
      "campaign_creature_npc_current_nonblank",
      sql`length(trim(${table.currentSnapshotJson})) > 0`,
    ),
    check(
      "campaign_creature_npc_baseline_json_valid",
      sql`${table.baselineSnapshotJson}::jsonb IS NOT NULL`,
    ),
    check(
      "campaign_creature_npc_current_json_valid",
      sql`${table.currentSnapshotJson}::jsonb IS NOT NULL`,
    ),
  ],
);

export const campaignCharacterActiveHealth = pgTable(
  "campaign_character_active_health",
  {
    characterId: integer("character_id")
      .primaryKey(),
    totalDamage: doublePrecision("total_damage").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [campaignCharacter.id],
      name: "campaign_character_active_health_character_fk",
    }).onDelete("cascade"),
    check(
      "campaign_character_active_health_total_damage_valid",
      sql`${table.totalDamage} >= 0`,
    ),
  ],
);

export const campaignCharacterActiveMana = pgTable(
  "campaign_character_active_mana",
  {
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    system: text("system").notNull(),
    manaSpent: doublePrecision("mana_spent").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.system] }),
    index("campaign_character_active_mana_system_idx").on(
      table.system,
      table.characterId,
    ),
    check(
      "campaign_character_active_mana_system_valid",
      sql`${table.system} IN ('Spellcraft', 'Talismanism', 'Faith', 'Psyonics', 'Bardic Resonance')`,
    ),
    check(
      "campaign_character_active_mana_spent_valid",
      sql`${table.manaSpent} >= 0`,
    ),
  ],
);

export const campaignCharacterActiveCondition = pgTable(
  "campaign_character_active_condition",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceEffectKey: text("source_effect_key"),
    durationKind: text("duration_kind").notNull(),
    durationValue: integer("duration_value"),
    durationLabel: text("duration_label").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    resolutionNote: text("resolution_note").default("").notNull(),
  },
  (table) => [
    uniqueIndex("campaign_character_active_condition_id_character_uq").on(
      table.id,
      table.characterId,
    ),
    index("campaign_character_active_condition_state_idx").on(
      table.characterId,
      table.resolvedAt,
      table.createdAt,
    ),
    check("campaign_character_active_condition_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("campaign_character_active_condition_source_kind_valid", sql`${table.sourceKind} IN ('item','spell','creature-ability','derived-ability','god','system')`),
    check("campaign_character_active_condition_source_nonblank", sql`length(trim(${table.sourceId})) > 0 AND length(trim(${table.sourceName})) > 0`),
    check("campaign_character_active_condition_duration_kind_valid", sql`${table.durationKind} IN ('until-removed','combat-steps','combat-rounds','scene')`),
    check("campaign_character_active_condition_duration_valid", sql`(${table.durationKind} IN ('combat-steps','combat-rounds') AND ${table.durationValue} > 0) OR (${table.durationKind} IN ('until-removed','scene') AND ${table.durationValue} IS NULL)`),
    check("campaign_character_active_condition_duration_label_nonblank", sql`length(trim(${table.durationLabel})) > 0`),
  ],
);

export const campaignCharacterActiveModifier = pgTable(
  "campaign_character_active_modifier",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id")
      .notNull()
      .references(() => campaignCharacter.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    modifierChannel: text("modifier_channel").notNull(),
    targetKey: text("target_key").notNull(),
    amount: integer("amount").notNull(),
    sourceKind: text("source_kind").notNull(),
    sourceId: text("source_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceEffectKey: text("source_effect_key"),
    durationKind: text("duration_kind").notNull(),
    durationValue: integer("duration_value"),
    durationLabel: text("duration_label").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    endNote: text("end_note").default("").notNull(),
  },
  (table) => [
    uniqueIndex("campaign_character_active_modifier_id_character_uq").on(
      table.id,
      table.characterId,
    ),
    index("campaign_character_active_modifier_state_idx").on(
      table.characterId,
      table.endedAt,
      table.modifierChannel,
      table.targetKey,
    ),
    check("campaign_character_active_modifier_label_nonblank", sql`length(trim(${table.label})) > 0`),
    check("campaign_character_active_modifier_channel_valid", sql`${table.modifierChannel} IN ('attribute','skill','movement','initiative','soak','damage')`),
    check("campaign_character_active_modifier_target_nonblank", sql`length(trim(${table.targetKey})) > 0`),
    check("campaign_character_active_modifier_amount_nonzero", sql`${table.amount} <> 0`),
    check("campaign_character_active_modifier_source_kind_valid", sql`${table.sourceKind} IN ('item','spell','creature-ability','derived-ability','god','system')`),
    check("campaign_character_active_modifier_source_nonblank", sql`length(trim(${table.sourceId})) > 0 AND length(trim(${table.sourceName})) > 0`),
    check("campaign_character_active_modifier_duration_kind_valid", sql`${table.durationKind} IN ('until-removed','combat-steps','combat-rounds','scene')`),
    check("campaign_character_active_modifier_duration_valid", sql`(${table.durationKind} IN ('combat-steps','combat-rounds') AND ${table.durationValue} > 0) OR (${table.durationKind} IN ('until-removed','scene') AND ${table.durationValue} IS NULL)`),
    check("campaign_character_active_modifier_duration_label_nonblank", sql`length(trim(${table.durationLabel})) > 0`),
  ],
);

export const campaignCharacterActiveHealthPool = pgTable(
  "campaign_character_active_health_pool",
  {
    characterId: integer("character_id")
      .notNull(),
    poolKey: text("pool_key").notNull(),
    poolNameSnapshot: text("pool_name_snapshot").notNull(),
    damage: doublePrecision("damage").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.characterId, table.poolKey] }),
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [campaignCharacterActiveHealth.characterId],
      name: "campaign_character_active_health_pool_health_fk",
    }).onDelete("cascade"),
    index("campaign_character_active_health_pool_damage_idx")
      .on(table.characterId, table.damage),
    check(
      "campaign_character_active_health_pool_key_nonblank",
      sql`length(trim(${table.poolKey})) > 0`,
    ),
    check(
      "campaign_character_active_health_pool_name_nonblank",
      sql`length(trim(${table.poolNameSnapshot})) > 0`,
    ),
    check(
      "campaign_character_active_health_pool_damage_valid",
      sql`${table.damage} >= 0`,
    ),
  ],
);

export const campaignCharacterInjury = pgTable(
  "campaign_character_injury",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id")
      .notNull(),
    poolKey: text("pool_key").notNull(),
    poolNameSnapshot: text("pool_name_snapshot").notNull(),
    hitLocationNumber: integer("hit_location_number"),
    hitLocationNameSnapshot: text("hit_location_name_snapshot"),
    name: text("name").notNull(),
    notes: text("notes").default("").notNull(),
    damageAmount: doublePrecision("damage_amount"),
    resolved: boolean("resolved").default(false).notNull(),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.characterId],
      foreignColumns: [campaignCharacterActiveHealth.characterId],
      name: "campaign_character_injury_health_fk",
    }).onDelete("cascade"),
    index("campaign_character_injury_state_idx").on(
      table.characterId,
      table.resolved,
      table.createdAt,
    ),
    index("campaign_character_injury_pool_idx").on(
      table.characterId,
      table.poolKey,
    ),
    check(
      "campaign_character_injury_pool_key_nonblank",
      sql`length(trim(${table.poolKey})) > 0`,
    ),
    check(
      "campaign_character_injury_pool_name_nonblank",
      sql`length(trim(${table.poolNameSnapshot})) > 0`,
    ),
    check(
      "campaign_character_injury_name_nonblank",
      sql`length(trim(${table.name})) > 0`,
    ),
    check(
      "campaign_character_injury_location_valid",
      sql`${table.hitLocationNumber} IS NULL OR ${table.hitLocationNumber} BETWEEN 0 AND 9`,
    ),
    check(
      "campaign_character_injury_damage_valid",
      sql`${table.damageAmount} IS NULL OR ${table.damageAmount} >= 0`,
    ),
    check(
      "campaign_character_injury_resolution_valid",
      sql`(${table.resolved} = false AND ${table.resolvedAt} IS NULL) OR (${table.resolved} = true AND ${table.resolvedAt} IS NOT NULL)`,
    ),
  ],
);

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { skill } from "./skill-schema";

export const CREATURE_SIZE_OPTIONS = [
  "Minuscule",
  "Tiny",
  "Small",
  "Medium",
  "Large",
  "Huge",
  "Gargantuan",
  "Colossal",
] as const;

export const CREATURE_CR_IMPACTS = [
  "None",
  "Minor",
  "Moderate",
  "Major",
  "Extreme",
] as const;

export type CreatureSize = (typeof CREATURE_SIZE_OPTIONS)[number];
export type CreatureCrImpact = (typeof CREATURE_CR_IMPACTS)[number];

export const challengeRatingReference = pgTable(
  "challenge_rating_reference",
  {
    challengeRating: integer("challenge_rating").primaryKey(),
    threatBand: text("threat_band").default("").notNull(),
    attackTargetGuidance: text("attack_target_guidance").default("").notNull(),
    damageGuidance: text("damage_guidance").default("").notNull(),
    initiativeGuidance: text("initiative_guidance").default("").notNull(),
    soakGuidance: text("soak_guidance").default("").notNull(),
    hpToughnessGuidance: text("hp_toughness_guidance").default("").notNull(),
    killXp: integer("kill_xp"),
    currentCreatureExample: text("current_creature_example").default("").notNull(),
    exampleNotes: text("example_notes").default("").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("challenge_rating_reference_range", sql`${table.challengeRating} BETWEEN 1 AND 50`),
    check("challenge_rating_reference_xp", sql`${table.killXp} IS NULL OR ${table.killXp} >= 0`),
  ],
);

export const creature = pgTable(
  "creatures",
  {
    id: serial("id").primaryKey(),
    canonicalId: text("canonical_id")
      .notNull()
      .unique("creatures_canonical_id_uq"),
    canonicalName: text("canonical_name").notNull(),
    family: text("family").default("").notNull(),
    creatureType: text("creature_type").default("").notNull(),
    size: text("size").notNull(),
    challengeRating: integer("challenge_rating").references(
      () => challengeRatingReference.challengeRating,
    ),
    killXp: integer("kill_xp"),
    description: text("description").default("").notNull(),
    typicalBehavior: text("typical_behavior").default("").notNull(),
    habitatEcology: text("habitat_ecology").default("").notNull(),
    notes: text("notes").default("").notNull(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceSystem: text("source_system"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    parentCreatureId: integer("parent_creature_id").references(
      (): AnyPgColumn => creature.id,
      { onDelete: "restrict" },
    ),
    calculatedChallengeRating: integer("calculated_challenge_rating"),
    challengeRatingAdjustment: integer("challenge_rating_adjustment").default(0).notNull(),
    challengeRatingAdjustmentReason: text("challenge_rating_adjustment_reason").default("").notNull(),
  },
  (table) => [
    index("creatures_name_idx").on(table.canonicalName),
    index("creatures_family_idx").on(table.family),
    index("creatures_type_idx").on(table.creatureType),
    index("creatures_size_idx").on(table.size),
    check("creatures_canonical_id_nonblank", sql`length(trim(${table.canonicalId})) > 0`),
    check("creatures_canonical_id_uppercase", sql`${table.canonicalId} = upper(${table.canonicalId})`),
    check("creatures_name_nonblank", sql`length(trim(${table.canonicalName})) > 0`),
    check("creatures_size_valid", sql`${table.size} IN ('Minuscule','Tiny','Small','Medium','Large','Huge','Gargantuan','Colossal')`),
    check("creatures_parent_not_self", sql`${table.parentCreatureId} IS NULL OR ${table.parentCreatureId} <> ${table.id}`),
    check("creatures_cr_valid", sql`${table.challengeRating} IS NULL OR ${table.challengeRating} BETWEEN 1 AND 50`),
    check("creatures_calculated_cr_valid", sql`${table.calculatedChallengeRating} IS NULL OR ${table.calculatedChallengeRating} BETWEEN 1 AND 50`),
    check("creatures_xp_valid", sql`${table.killXp} IS NULL OR ${table.killXp} >= 0`),
    check("creatures_adjustment_valid", sql`${table.challengeRatingAdjustment} BETWEEN -49 AND 49`),
  ],
);

export const creatureVariant = pgTable(
  "creature_variants",
  {
    id: serial("id").primaryKey(),
    canonicalId: text("canonical_id").notNull(),
    creatureId: integer("creature_id")
      .notNull()
      .references(() => creature.id, { onDelete: "cascade" }),
    variantName: text("variant_name").notNull(),
    variantType: text("variant_type").default("").notNull(),
    sizeOverride: text("size_override"),
    challengeRatingOverride: integer("challenge_rating_override").references(
      () => challengeRatingReference.challengeRating,
    ),
    killXpOverride: integer("kill_xp_override"),
    description: text("description").default("").notNull(),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("creature_variants_canonical_id_uq").on(table.canonicalId),
    unique("creature_variants_id_creature_uq").on(table.id, table.creatureId),
    uniqueIndex("creature_variants_name_uq").on(table.creatureId, table.variantName),
    index("creature_variants_creature_id_idx").on(table.creatureId),
    check("creature_variants_canonical_id_uppercase", sql`${table.canonicalId} = upper(${table.canonicalId})`),
    check("creature_variants_canonical_id_nonblank", sql`length(trim(${table.canonicalId})) > 0`),
    check("creature_variants_name_nonblank", sql`length(trim(${table.variantName})) > 0`),
    check("creature_variants_size_valid", sql`${table.sizeOverride} IS NULL OR ${table.sizeOverride} IN ('Minuscule','Tiny','Small','Medium','Large','Huge','Gargantuan','Colossal')`),
    check("creature_variants_cr_valid", sql`${table.challengeRatingOverride} IS NULL OR ${table.challengeRatingOverride} BETWEEN 1 AND 50`),
    check("creature_variants_xp_valid", sql`${table.killXpOverride} IS NULL OR ${table.killXpOverride} >= 0`),
  ],
);

export const creatureAttribute = pgTable(
  "creature_attributes",
  {
    id: serial("id").primaryKey(),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    attributeKey: text("attribute_key").notNull(),
    value: doublePrecision("value"),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.variantId, table.creatureId],
      foreignColumns: [creatureVariant.id, creatureVariant.creatureId],
      name: "creature_attributes_variant_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("creature_attributes_base_uq")
      .on(table.creatureId, table.attributeKey)
      .where(sql`${table.variantId} IS NULL`),
    uniqueIndex("creature_attributes_variant_uq")
      .on(table.variantId, table.attributeKey)
      .where(sql`${table.variantId} IS NOT NULL`),
    index("creature_attributes_creature_id_idx").on(table.creatureId),
    check("creature_attributes_key_valid", sql`${table.attributeKey} IN ('Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma')`),
  ],
);

export const creatureMovement = pgTable(
  "creature_movement",
  {
    id: serial("id").primaryKey(),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    movementMode: text("movement_mode").notNull(),
    movementValue: doublePrecision("movement_value"),
    initiative: doublePrecision("initiative"),
    requirements: text("requirements").default("").notNull(),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.variantId, table.creatureId],
      foreignColumns: [creatureVariant.id, creatureVariant.creatureId],
      name: "creature_movement_variant_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("creature_movement_base_uq")
      .on(table.creatureId, table.movementMode)
      .where(sql`${table.variantId} IS NULL`),
    uniqueIndex("creature_movement_variant_uq")
      .on(table.variantId, table.movementMode)
      .where(sql`${table.variantId} IS NOT NULL`),
    index("creature_movement_creature_id_idx").on(table.creatureId),
    check("creature_movement_mode_nonblank", sql`length(trim(${table.movementMode})) > 0`),
  ],
);

export const creatureHpPool = pgTable(
  "creature_hp_pools",
  {
    id: serial("id").primaryKey(),
    canonicalId: text("canonical_id").notNull(),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    poolName: text("pool_name").notNull(),
    hpPercentage: doublePrecision("hp_percentage"),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("creature_hp_pools_canonical_id_uq").on(table.canonicalId),
    unique("creature_hp_pools_id_creature_uq").on(table.id, table.creatureId),
    unique("creature_hp_pools_id_variant_uq").on(table.id, table.variantId),
    foreignKey({
      columns: [table.variantId, table.creatureId],
      foreignColumns: [creatureVariant.id, creatureVariant.creatureId],
      name: "creature_hp_pools_variant_owner_fk",
    }).onDelete("cascade"),
    index("creature_hp_pools_creature_id_idx").on(table.creatureId),
    check("creature_hp_pools_canonical_id_uppercase", sql`${table.canonicalId} = upper(${table.canonicalId})`),
    check("creature_hp_pools_canonical_id_nonblank", sql`length(trim(${table.canonicalId})) > 0`),
    check("creature_hp_pools_name_nonblank", sql`length(trim(${table.poolName})) > 0`),
  ],
);

export const creatureHitLocation = pgTable(
  "creature_hit_locations",
  {
    id: serial("id").primaryKey(),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    hitLocationNumber: integer("hit_location_number").notNull(),
    locationName: text("location_name").default("").notNull(),
    bodyPartsIncluded: text("body_parts_included").default("").notNull(),
    hpPoolId: integer("hp_pool_id"),
    naturalArmor: doublePrecision("natural_armor"),
    soak: doublePrecision("soak"),
    locationEffect: text("location_effect").default("").notNull(),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.variantId, table.creatureId],
      foreignColumns: [creatureVariant.id, creatureVariant.creatureId],
      name: "creature_hit_locations_variant_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.hpPoolId, table.creatureId],
      foreignColumns: [creatureHpPool.id, creatureHpPool.creatureId],
      name: "creature_hit_locations_hp_pool_owner_fk",
    }).onDelete("restrict"),
    uniqueIndex("creature_hit_locations_base_uq")
      .on(table.creatureId, table.hitLocationNumber)
      .where(sql`${table.variantId} IS NULL`),
    uniqueIndex("creature_hit_locations_variant_uq")
      .on(table.variantId, table.hitLocationNumber)
      .where(sql`${table.variantId} IS NOT NULL`),
    foreignKey({
      columns: [table.hpPoolId, table.variantId],
      foreignColumns: [creatureHpPool.id, creatureHpPool.variantId],
      name: "creature_hit_locations_hp_pool_variant_fk",
    }).onDelete("restrict"),
    index("creature_hit_locations_creature_id_idx").on(table.creatureId),
    check("creature_hit_locations_number_valid", sql`${table.hitLocationNumber} BETWEEN 0 AND 9`),
  ],
);

export const creatureAttack = pgTable(
  "creature_attacks",
  {
    id: serial("id").primaryKey(),
    canonicalId: text("canonical_id").notNull(),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    attackName: text("attack_name").notNull(),
    attackPercentage: doublePrecision("attack_percentage"),
    damage: text("damage"),
    damageType: text("damage_type").default("").notNull(),
    rangeReach: text("range_reach").default("").notNull(),
    requiredAnatomy: text("required_anatomy").default("").notNull(),
    requirements: text("requirements").default("").notNull(),
    usesRecharge: text("uses_recharge").default("").notNull(),
    specialEffect: text("special_effect").default("").notNull(),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("creature_attacks_canonical_id_uq").on(table.canonicalId),
    foreignKey({
      columns: [table.variantId, table.creatureId],
      foreignColumns: [creatureVariant.id, creatureVariant.creatureId],
      name: "creature_attacks_variant_owner_fk",
    }).onDelete("cascade"),
    index("creature_attacks_creature_id_idx").on(table.creatureId),
    check("creature_attacks_canonical_id_uppercase", sql`${table.canonicalId} = upper(${table.canonicalId})`),
    check("creature_attacks_canonical_id_nonblank", sql`length(trim(${table.canonicalId})) > 0`),
    check("creature_attacks_name_nonblank", sql`length(trim(${table.attackName})) > 0`),
  ],
);

export const creatureSkillLink = pgTable(
  "creature_skill_links",
  {
    id: serial("id").primaryKey(),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    skillId: integer("skill_id").notNull().references(() => skill.id, { onDelete: "restrict" }),
    rank: text("rank"),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.variantId, table.creatureId],
      foreignColumns: [creatureVariant.id, creatureVariant.creatureId],
      name: "creature_skill_links_variant_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("creature_skill_links_base_uq")
      .on(table.creatureId, table.skillId)
      .where(sql`${table.variantId} IS NULL`),
    uniqueIndex("creature_skill_links_variant_uq")
      .on(table.variantId, table.skillId)
      .where(sql`${table.variantId} IS NOT NULL`),
    index("creature_skill_links_creature_id_idx").on(table.creatureId),
    index("creature_skill_links_skill_id_idx").on(table.skillId),
  ],
);

export const creatureAbility = pgTable(
  "creature_abilities",
  {
    id: serial("id").primaryKey(),
    canonicalId: text("canonical_id").notNull(),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    abilityName: text("ability_name").notNull(),
    abilityType: text("ability_type").default("").notNull(),
    activation: text("activation").default("").notNull(),
    requirements: text("requirements").default("").notNull(),
    usesRecharge: text("uses_recharge").default("").notNull(),
    description: text("description").default("").notNull(),
    mechanicalEffect: text("mechanical_effect").default("").notNull(),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    crImpact: text("cr_impact").default("None").notNull(),
  },
  (table) => [
    unique("creature_abilities_canonical_id_uq").on(table.canonicalId),
    foreignKey({
      columns: [table.variantId, table.creatureId],
      foreignColumns: [creatureVariant.id, creatureVariant.creatureId],
      name: "creature_abilities_variant_owner_fk",
    }).onDelete("cascade"),
    index("creature_abilities_creature_id_idx").on(table.creatureId),
    check("creature_abilities_canonical_id_uppercase", sql`${table.canonicalId} = upper(${table.canonicalId})`),
    check("creature_abilities_canonical_id_nonblank", sql`length(trim(${table.canonicalId})) > 0`),
    check("creature_abilities_name_nonblank", sql`length(trim(${table.abilityName})) > 0`),
    check("creature_abilities_cr_impact_valid", sql`${table.crImpact} IN ('None','Minor','Moderate','Major','Extreme')`),
  ],
);

export const creatureAbilityEffect = pgTable(
  "creature_ability_effects",
  {
    id: serial("id").primaryKey(),
    abilityId: integer("ability_id").notNull().references(() => creatureAbility.id, { onDelete: "cascade" }),
    effectKey: text("effect_key").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    effectJson: jsonb("effect_json").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("creature_ability_effects_ability_key_uq").on(table.abilityId, table.effectKey),
    unique("creature_ability_effects_ability_order_uq").on(table.abilityId, table.sortOrder),
    index("creature_ability_effects_ability_id_idx").on(table.abilityId),
    check("creature_ability_effects_key_nonblank", sql`length(trim(${table.effectKey})) > 0`),
    check("creature_ability_effects_schema_version_positive", sql`${table.schemaVersion} > 0`),
    check("creature_ability_effects_sort_order_nonnegative", sql`${table.sortOrder} >= 0`),
  ],
);

export const creatureDefense = pgTable(
  "creature_defenses",
  {
    id: serial("id").primaryKey(),
    seedIdentity: text("seed_identity"),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    defenseType: text("defense_type").notNull(),
    against: text("against").default("").notNull(),
    value: text("value"),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    crImpact: text("cr_impact").default("None").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.variantId, table.creatureId],
      foreignColumns: [creatureVariant.id, creatureVariant.creatureId],
      name: "creature_defenses_variant_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("creature_defenses_seed_identity_uq").on(table.seedIdentity).where(sql`${table.seedIdentity} IS NOT NULL`),
    index("creature_defenses_creature_id_idx").on(table.creatureId),
    check("creature_defenses_type_nonblank", sql`length(trim(${table.defenseType})) > 0`),
    check("creature_defenses_cr_impact_valid", sql`${table.crImpact} IN ('None','Minor','Moderate','Major','Extreme')`),
  ],
);

export const creatureUse = pgTable(
  "creature_uses",
  {
    id: serial("id").primaryKey(),
    seedIdentity: text("seed_identity"),
    creatureId: integer("creature_id").notNull().references(() => creature.id, { onDelete: "cascade" }),
    variantId: integer("variant_id"),
    useName: text("use_name").notNull(),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.variantId, table.creatureId],
      foreignColumns: [creatureVariant.id, creatureVariant.creatureId],
      name: "creature_uses_variant_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("creature_uses_seed_identity_uq").on(table.seedIdentity).where(sql`${table.seedIdentity} IS NOT NULL`),
    index("creature_uses_creature_id_idx").on(table.creatureId),
    check("creature_uses_name_nonblank", sql`length(trim(${table.useName})) > 0`),
  ],
);

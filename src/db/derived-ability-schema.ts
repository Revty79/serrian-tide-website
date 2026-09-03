import { relations, sql } from "drizzle-orm";
import {
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { campaign } from "./campaign-schema";
import { skill } from "./skill-schema";

export const derivedAbilityAcquisitionType = pgEnum(
  "derived_ability_acquisition_type",
  ["automatic", "learned", "awarded"],
);

export const derivedAbilityActivationType = pgEnum(
  "derived_ability_activation_type",
  ["passive", "activated", "reaction", "triggered"],
);

export const derivedAbilityRequirementScope = pgEnum(
  "derived_ability_requirement_scope",
  ["acquisition", "live"],
);

export const derivedAbility = pgTable(
  "derived_ability",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").default("").notNull(),
    mechanicalEffect: text("mechanical_effect").default("").notNull(),
    acquisitionType: derivedAbilityAcquisitionType("acquisition_type")
      .default("automatic")
      .notNull(),
    activationType: derivedAbilityActivationType("activation_type")
      .default("passive")
      .notNull(),
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

export const derivedAbilityRequirement = pgTable(
  "derived_ability_requirement",
  {
    id: serial("id").primaryKey(),
    derivedAbilityId: integer("derived_ability_id")
      .notNull()
      .references(() => derivedAbility.id, { onDelete: "cascade" }),
    requirementScope: derivedAbilityRequirementScope("requirement_scope").notNull(),
    requirementType: text("requirement_type").notNull(),
    groupNumber: integer("group_number").default(0).notNull(),
    attributeKey: text("attribute_key"),
    skillId: integer("skill_id").references(() => skill.id, {
      onDelete: "restrict",
    }),
    requiredDerivedAbilityId: integer("required_derived_ability_id").references(
      () => derivedAbility.id,
      { onDelete: "restrict" },
    ),
    operator: text("operator"),
    requiredValue: doublePrecision("required_value"),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("derived_ability_requirement_ability_idx").on(
      table.derivedAbilityId,
      table.requirementScope,
      table.groupNumber,
      table.sortOrder,
      table.id,
    ),
    index("derived_ability_requirement_skill_idx").on(
      table.skillId,
      table.derivedAbilityId,
    ),
    index("derived_ability_requirement_prerequisite_idx").on(
      table.requiredDerivedAbilityId,
      table.derivedAbilityId,
    ),
    uniqueIndex("derived_ability_requirement_order_uq").on(
      table.derivedAbilityId,
      table.requirementScope,
      table.groupNumber,
      table.sortOrder,
    ),
    check(
      "derived_ability_requirement_type_nonblank",
      sql`length(trim(${table.requirementType})) > 0`,
    ),
    check(
      "derived_ability_requirement_group_valid",
      sql`${table.groupNumber} >= 0`,
    ),
    check(
      "derived_ability_requirement_attribute_nonblank",
      sql`${table.attributeKey} IS NULL OR length(trim(${table.attributeKey})) > 0`,
    ),
    check(
      "derived_ability_requirement_operator_nonblank",
      sql`${table.operator} IS NULL OR length(trim(${table.operator})) > 0`,
    ),
    check(
      "derived_ability_requirement_not_self",
      sql`${table.requiredDerivedAbilityId} IS NULL OR ${table.requiredDerivedAbilityId} <> ${table.derivedAbilityId}`,
    ),
    check(
      "derived_ability_requirement_order_valid",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const derivedAbilityUseCondition = pgTable(
  "derived_ability_use_condition",
  {
    id: serial("id").primaryKey(),
    derivedAbilityId: integer("derived_ability_id")
      .notNull()
      .references(() => derivedAbility.id, { onDelete: "cascade" }),
    conditionType: text("condition_type").notNull(),
    conditionKey: text("condition_key"),
    operator: text("operator"),
    numericValue: doublePrecision("numeric_value"),
    textValue: text("text_value"),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("derived_ability_use_condition_ability_idx").on(
      table.derivedAbilityId,
      table.sortOrder,
      table.id,
    ),
    uniqueIndex("derived_ability_use_condition_order_uq").on(
      table.derivedAbilityId,
      table.sortOrder,
    ),
    check(
      "derived_ability_use_condition_type_nonblank",
      sql`length(trim(${table.conditionType})) > 0`,
    ),
    check(
      "derived_ability_use_condition_key_nonblank",
      sql`${table.conditionKey} IS NULL OR length(trim(${table.conditionKey})) > 0`,
    ),
    check(
      "derived_ability_use_condition_operator_nonblank",
      sql`${table.operator} IS NULL OR length(trim(${table.operator})) > 0`,
    ),
    check(
      "derived_ability_use_condition_text_value_nonblank",
      sql`${table.textValue} IS NULL OR length(trim(${table.textValue})) > 0`,
    ),
    check(
      "derived_ability_use_condition_order_valid",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const derivedAbilityCost = pgTable(
  "derived_ability_cost",
  {
    id: serial("id").primaryKey(),
    derivedAbilityId: integer("derived_ability_id")
      .notNull()
      .references(() => derivedAbility.id, { onDelete: "cascade" }),
    costType: text("cost_type").notNull(),
    amount: doublePrecision("amount").notNull(),
    resourceKey: text("resource_key"),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("derived_ability_cost_ability_idx").on(
      table.derivedAbilityId,
      table.sortOrder,
      table.id,
    ),
    uniqueIndex("derived_ability_cost_order_uq").on(
      table.derivedAbilityId,
      table.sortOrder,
    ),
    check(
      "derived_ability_cost_type_nonblank",
      sql`length(trim(${table.costType})) > 0`,
    ),
    check(
      "derived_ability_cost_amount_positive",
      sql`${table.amount} > 0`,
    ),
    check(
      "derived_ability_cost_resource_key_nonblank",
      sql`${table.resourceKey} IS NULL OR length(trim(${table.resourceKey})) > 0`,
    ),
    check("derived_ability_cost_order_valid", sql`${table.sortOrder} >= 0`),
  ],
);

export const derivedAbilityUseLimit = pgTable(
  "derived_ability_use_limit",
  {
    id: serial("id").primaryKey(),
    derivedAbilityId: integer("derived_ability_id")
      .notNull()
      .references(() => derivedAbility.id, { onDelete: "cascade" }),
    maximumUses: integer("maximum_uses").notNull(),
    refreshScope: text("refresh_scope").notNull(),
    refreshKey: text("refresh_key"),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("derived_ability_use_limit_ability_idx").on(
      table.derivedAbilityId,
      table.sortOrder,
      table.id,
    ),
    uniqueIndex("derived_ability_use_limit_order_uq").on(
      table.derivedAbilityId,
      table.sortOrder,
    ),
    check(
      "derived_ability_use_limit_maximum_positive",
      sql`${table.maximumUses} > 0`,
    ),
    check(
      "derived_ability_use_limit_refresh_scope_nonblank",
      sql`length(trim(${table.refreshScope})) > 0`,
    ),
    check(
      "derived_ability_use_limit_refresh_key_nonblank",
      sql`${table.refreshKey} IS NULL OR length(trim(${table.refreshKey})) > 0`,
    ),
    check(
      "derived_ability_use_limit_order_valid",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const derivedAbilityEffect = pgTable(
  "derived_ability_effect",
  {
    id: serial("id").primaryKey(),
    derivedAbilityId: integer("derived_ability_id")
      .notNull()
      .references(() => derivedAbility.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").notNull(),
    effectJson: jsonb("effect_json").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("derived_ability_effect_order_uq").on(
      table.derivedAbilityId,
      table.sortOrder,
    ),
    index("derived_ability_effect_ability_idx").on(table.derivedAbilityId),
    check(
      "derived_ability_effect_schema_version_valid",
      sql`${table.schemaVersion} > 0`,
    ),
    check(
      "derived_ability_effect_sort_order_valid",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "derived_ability_effect_json_object",
      sql`jsonb_typeof(${table.effectJson}) = 'object'`,
    ),
  ],
);

// Legacy V1 compatibility storage remains authoritative only when an ability
// has no generalized requirements. The generalized editor keeps a mirror only
// for clean V1-compatible definitions and removes stale mirrors from a complex
// definition when that specific record is deliberately saved.
// TODO: Remove only after unmigrated/malformed legacy content and the expanded
// editor/runtime transition have been proven through a controlled migration.
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

// Legacy campaign-level allowlisting retained for persisted-data compatibility.
// Gameplay governance uses campaign_allowed_system as of Derived Abilities Pass 1.
// TODO: Remove this table and the compatibility marker only after a controlled
// migration confirms that every existing Campaign has been reconciled.
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
  requirements: many(derivedAbilityRequirement, {
    relationName: "derivedAbilityRequirements",
  }),
  prerequisiteForRequirements: many(derivedAbilityRequirement, {
    relationName: "derivedAbilityPrerequisiteRequirements",
  }),
  useConditions: many(derivedAbilityUseCondition),
  costs: many(derivedAbilityCost),
  useLimits: many(derivedAbilityUseLimit),
  effects: many(derivedAbilityEffect),
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

export const derivedAbilityRequirementRelations = relations(
  derivedAbilityRequirement,
  ({ one }) => ({
    derivedAbility: one(derivedAbility, {
      fields: [derivedAbilityRequirement.derivedAbilityId],
      references: [derivedAbility.id],
      relationName: "derivedAbilityRequirements",
    }),
    skill: one(skill, {
      fields: [derivedAbilityRequirement.skillId],
      references: [skill.id],
    }),
    requiredDerivedAbility: one(derivedAbility, {
      fields: [derivedAbilityRequirement.requiredDerivedAbilityId],
      references: [derivedAbility.id],
      relationName: "derivedAbilityPrerequisiteRequirements",
    }),
  }),
);

export const derivedAbilityUseConditionRelations = relations(
  derivedAbilityUseCondition,
  ({ one }) => ({
    derivedAbility: one(derivedAbility, {
      fields: [derivedAbilityUseCondition.derivedAbilityId],
      references: [derivedAbility.id],
    }),
  }),
);

export const derivedAbilityCostRelations = relations(
  derivedAbilityCost,
  ({ one }) => ({
    derivedAbility: one(derivedAbility, {
      fields: [derivedAbilityCost.derivedAbilityId],
      references: [derivedAbility.id],
    }),
  }),
);

export const derivedAbilityUseLimitRelations = relations(
  derivedAbilityUseLimit,
  ({ one }) => ({
    derivedAbility: one(derivedAbility, {
      fields: [derivedAbilityUseLimit.derivedAbilityId],
      references: [derivedAbility.id],
    }),
  }),
);

export const derivedAbilityEffectRelations = relations(
  derivedAbilityEffect,
  ({ one }) => ({
    derivedAbility: one(derivedAbility, {
      fields: [derivedAbilityEffect.derivedAbilityId],
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

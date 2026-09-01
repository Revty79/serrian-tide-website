import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { creature } from "./creature-schema";

export const ITEM_CATALOG_SCOPES = ["equipment", "inventory"] as const;
export const EQUIPMENT_GROUPS = ["weapon", "armor", "general"] as const;

export type ItemCatalogScope = (typeof ITEM_CATALOG_SCOPES)[number];
export type EquipmentCatalogGroup = (typeof EQUIPMENT_GROUPS)[number];

export const item = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    canonicalId: text("canonical_id")
      .notNull()
      .unique("items_canonical_id_uq"),
    name: text("name").notNull(),
    catalogScope: text("catalog_scope").notNull(),
    equipmentGroup: text("equipment_group"),
    recordType: text("record_type").notNull(),
    family: text("family").notNull(),
    category: text("category").notNull(),
    subtype: text("subtype").default("").notNull(),
    description: text("description").default("").notNull(),
    weight: doublePrecision("weight"),
    weightUnit: text("weight_unit").default("").notNull(),
    size: text("size").default("").notNull(),
    durability: doublePrecision("durability"),
    credits: doublePrecision("credits"),
    priceBasis: text("price_basis").notNull(),
    isMagical: boolean("is_magical").default(false).notNull(),
    parentItemId: integer("parent_item_id").references(
      (): AnyPgColumn => item.id,
      { onDelete: "restrict" },
    ),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    sourceSystem: text("source_system"),
    sourceExternalId: text("source_external_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("items_source_identity_uq")
      .on(table.sourceSystem, table.sourceExternalId)
      .where(sql`${table.sourceSystem} IS NOT NULL AND ${table.sourceExternalId} IS NOT NULL`),
    index("items_name_idx").on(table.name),
    index("items_catalog_scope_idx").on(table.catalogScope),
    index("items_equipment_group_idx").on(table.equipmentGroup),
    index("items_record_type_idx").on(table.recordType),
    index("items_category_idx").on(table.category),
    check("items_canonical_id_nonblank", sql`length(trim(${table.canonicalId})) > 0`),
    check("items_canonical_id_uppercase", sql`${table.canonicalId} = upper(${table.canonicalId})`),
    check("items_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("items_scope_valid", sql`${table.catalogScope} IN ('equipment', 'inventory')`),
    check("items_equipment_group_valid", sql`${table.equipmentGroup} IS NULL OR ${table.equipmentGroup} IN ('weapon', 'armor', 'general')`),
    check("items_scope_group_valid", sql`(${table.catalogScope} = 'inventory' AND ${table.equipmentGroup} IS NULL) OR (${table.catalogScope} = 'equipment' AND ${table.equipmentGroup} IN ('weapon', 'armor', 'general'))`),
    check("items_weight_valid", sql`${table.weight} IS NULL OR ${table.weight} >= 0`),
    check("items_weight_unit_valid", sql`(${table.weight} IS NULL AND length(trim(${table.weightUnit})) = 0) OR (${table.weight} IS NOT NULL AND length(trim(${table.weightUnit})) > 0)`),
    check("items_durability_valid", sql`${table.durability} IS NULL OR ${table.durability} >= 0`),
    check("items_credits_valid", sql`${table.credits} IS NULL OR ${table.credits} >= 0`),
    check("items_parent_not_self", sql`${table.parentItemId} IS NULL OR ${table.parentItemId} <> ${table.id}`),
  ],
);

export const itemRuntimeProfile = pgTable(
  "item_runtime_profiles",
  {
    itemId: integer("item_id").primaryKey().references(() => item.id, { onDelete: "cascade" }),
    useMode: text("use_mode").default("none").notNull(),
    quantityPerUse: integer("quantity_per_use"),
    maximumCharges: integer("maximum_charges"),
    chargesPerUse: integer("charges_per_use"),
    rechargeNotes: text("recharge_notes").default("").notNull(),
    activationLabel: text("activation_label").default("Use").notNull(),
    useNotes: text("use_notes").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("item_runtime_profiles_mode_valid", sql`${table.useMode} IN ('none', 'consume-item', 'charges', 'unlimited')`),
    check("item_runtime_profiles_activation_label_nonblank", sql`length(trim(${table.activationLabel})) > 0`),
    check(
      "item_runtime_profiles_fields_valid",
      sql`(
        (${table.useMode} IN ('none', 'unlimited') AND ${table.quantityPerUse} IS NULL AND ${table.maximumCharges} IS NULL AND ${table.chargesPerUse} IS NULL)
        OR (${table.useMode} = 'consume-item' AND ${table.quantityPerUse} > 0 AND ${table.maximumCharges} IS NULL AND ${table.chargesPerUse} IS NULL)
        OR (${table.useMode} = 'charges' AND ${table.quantityPerUse} IS NULL AND ${table.maximumCharges} > 0 AND ${table.chargesPerUse} > 0 AND ${table.chargesPerUse} <= ${table.maximumCharges})
      )`,
    ),
  ],
);

export const itemEffect = pgTable(
  "item_effects",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").notNull(),
    effectJson: jsonb("effect_json").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("item_effects_order_uq").on(table.itemId, table.sortOrder),
    index("item_effects_item_id_idx").on(table.itemId),
    check("item_effects_schema_version_valid", sql`${table.schemaVersion} > 0`),
    check("item_effects_sort_order_valid", sql`${table.sortOrder} >= 0`),
    check("item_effects_json_object", sql`jsonb_typeof(${table.effectJson}) = 'object'`),
  ],
);

export const itemPassiveEffect = pgTable(
  "item_passive_effects",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    requiredEquipmentState: text("required_equipment_state").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    effectJson: jsonb("effect_json").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("item_passive_effects_item_order_idx").on(table.itemId, table.sortOrder, table.id),
    check("item_passive_effects_required_state_valid", sql`${table.requiredEquipmentState} IN ('equipped','worn','wielded')`),
    check("item_passive_effects_schema_version_valid", sql`${table.schemaVersion} > 0`),
    check("item_passive_effects_sort_order_valid", sql`${table.sortOrder} >= 0`),
    check("item_passive_effects_json_object", sql`jsonb_typeof(${table.effectJson}) = 'object'`),
  ],
);

export const weaponProfile = pgTable(
  "weapon_profiles",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    profileRecordType: text("profile_record_type").default("").notNull(),
    weaponType: text("weapon_type").default("").notNull(),
    handedness: text("handedness").default("").notNull(),
    damageSource: text("damage_source").default("").notNull(),
    damage: text("damage").default("").notNull(),
    initiativeCost: integer("initiative_cost"),
    damageType: text("damage_type").default("").notNull(),
    rangeText: text("range_text").default("").notNull(),
    reachText: text("reach_text").default("").notNull(),
    ammunitionItemId: integer("ammunition_item_id").references(() => item.id, { onDelete: "restrict" }),
    compatibility: text("compatibility").default("").notNull(),
    capacity: text("capacity").default("").notNull(),
    fireModes: text("fire_modes").default("[]").notNull(),
    rateOfFire: text("rate_of_fire").default("").notNull(),
    reloadInitiative: text("reload_initiative").default("").notNull(),
    rulesText: text("rules_text").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("weapon_profiles_item_id_uq").on(table.itemId),
    index("weapon_profiles_ammunition_item_id_idx").on(table.ammunitionItemId),
    check("weapon_profiles_fire_modes_json_valid", sql`${table.fireModes}::jsonb IS NOT NULL AND jsonb_typeof(${table.fireModes}::jsonb) = 'array'`),
    check("weapon_profiles_ammo_not_self", sql`${table.ammunitionItemId} IS NULL OR ${table.ammunitionItemId} <> ${table.itemId}`),
    check("weapon_profiles_initiative_cost_valid", sql`${table.initiativeCost} IS NULL OR ${table.initiativeCost} > 0`),
  ],
);

export const armorProfile = pgTable(
  "armor_profiles",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    armorType: text("armor_type").default("").notNull(),
    coverage: text("coverage").default("").notNull(),
    baseSoak: doublePrecision("base_soak"),
    damageModifiersSourceText: text("damage_modifiers_source_text").default("").notNull(),
    rulesText: text("rules_text").default("").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("armor_profiles_item_id_uq").on(table.itemId),
    check("armor_profiles_soak_valid", sql`${table.baseSoak} IS NULL OR ${table.baseSoak} >= 0`),
  ],
);

export const itemArmorDamageModifier = pgTable(
  "item_armor_damage_modifiers",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    modifierText: text("modifier_text").default("").notNull(),
    damageType: text("damage_type").notNull(),
    modifier: text("modifier").notNull(),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("item_armor_damage_modifiers_order_uq").on(table.itemId, table.sortOrder),
    index("item_armor_damage_modifiers_item_id_idx").on(table.itemId),
    check("item_armor_damage_modifiers_type_nonblank", sql`length(trim(${table.damageType})) > 0`),
    check("item_armor_damage_modifiers_modifier_nonblank", sql`length(trim(${table.modifier})) > 0`),
  ],
);

export const armorLocationReference = pgTable(
  "armor_location_reference",
  {
    locationCode: text("location_code").primaryKey(),
    locationName: text("location_name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    notes: text("notes").default("").notNull(),
  },
  (table) => [
    uniqueIndex("armor_location_reference_name_uq").on(table.locationName),
    uniqueIndex("armor_location_reference_order_uq").on(table.sortOrder),
  ],
);

export const armorLocation = pgTable(
  "armor_locations",
  {
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    locationCode: text("location_code").notNull().references(() => armorLocationReference.locationCode, { onDelete: "restrict" }),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.locationCode] }),
    uniqueIndex("armor_locations_order_uq").on(table.itemId, table.sortOrder),
  ],
);

export const itemProperty = pgTable(
  "item_properties",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    propertyName: text("property_name").notNull(),
    value: text("value").default("").notNull(),
    unit: text("unit").default("").notNull(),
    relatedItemId: integer("related_item_id").references(() => item.id, { onDelete: "restrict" }),
    relatedCreatureCanonicalId: text("related_creature_canonical_id").references(() => creature.canonicalId, { onDelete: "restrict" }),
    quantity: doublePrecision("quantity"),
    notes: text("notes").default("").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("item_properties_order_uq").on(table.itemId, table.sortOrder),
    index("item_properties_item_id_idx").on(table.itemId),
    check("item_properties_name_nonblank", sql`length(trim(${table.propertyName})) > 0`),
    check("item_properties_quantity_valid", sql`${table.quantity} IS NULL OR ${table.quantity} > 0`),
    check("item_properties_one_relation", sql`${table.relatedItemId} IS NULL OR ${table.relatedCreatureCanonicalId} IS NULL`),
    check("item_properties_creature_id_uppercase", sql`${table.relatedCreatureCanonicalId} IS NULL OR ${table.relatedCreatureCanonicalId} = upper(${table.relatedCreatureCanonicalId})`),
  ],
);

export const itemTagCatalog = pgTable(
  "item_tags_catalog",
  {
    id: serial("id").primaryKey(),
    canonicalId: text("canonical_id").notNull(),
    name: text("name").notNull(),
    tagGroup: text("tag_group").notNull(),
    description: text("description").notNull(),
  },
  (table) => [
    unique("item_tags_catalog_canonical_id_uq").on(table.canonicalId),
    uniqueIndex("item_tags_catalog_name_uq").on(table.name),
    check("item_tags_catalog_canonical_id_uppercase", sql`${table.canonicalId} = upper(${table.canonicalId})`),
    check("item_tags_catalog_canonical_id_nonblank", sql`length(trim(${table.canonicalId})) > 0`),
    check("item_tags_catalog_name_nonblank", sql`length(trim(${table.name})) > 0`),
    check("item_tags_catalog_group_nonblank", sql`length(trim(${table.tagGroup})) > 0`),
    check("item_tags_catalog_description_nonblank", sql`length(trim(${table.description})) > 0`),
  ],
);

export const itemTagLink = pgTable(
  "item_tag_links",
  {
    itemId: integer("item_id").notNull().references(() => item.id, { onDelete: "cascade" }),
    tagId: integer("tag_id").notNull().references(() => itemTagCatalog.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.tagId] }),
    index("item_tag_links_tag_id_idx").on(table.tagId),
  ],
);

export const itemRule = pgTable(
  "item_rules",
  {
    id: serial("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    ruleName: text("rule_name").notNull(),
    ruleText: text("rule_text").notNull(),
    implementationGuidance: text("implementation_guidance").notNull(),
    status: text("status").notNull(),
  },
  (table) => [
    unique("item_rules_rule_id_uq").on(table.ruleId),
    check("item_rules_rule_id_uppercase", sql`${table.ruleId} = upper(${table.ruleId})`),
    check("item_rules_rule_id_nonblank", sql`length(trim(${table.ruleId})) > 0`),
    check("item_rules_name_nonblank", sql`length(trim(${table.ruleName})) > 0`),
    check("item_rules_text_nonblank", sql`length(trim(${table.ruleText})) > 0`),
    check("item_rules_guidance_nonblank", sql`length(trim(${table.implementationGuidance})) > 0`),
    check("item_rules_status_nonblank", sql`length(trim(${table.status})) > 0`),
  ],
);

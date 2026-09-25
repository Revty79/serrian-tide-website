import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, foreignKey, index, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import type { ContainerSource, Substance } from "@/features/items/container-rules";
import { item } from "./item-schema";
import { campaignCharacterItem, campaignCharacterItemInstance } from "./realm-schema";

/** Ordinary physical limits; null means this particular limit is not authored. */
export const containerProfile = pgTable("container_profiles", {
  itemId: integer("item_id").primaryKey().references(() => item.id, { onDelete: "cascade" }),
  classification: text("classification").notNull().default("generic"),
  maxWeightLb: doublePrecision("max_weight_lb"),
  volumeCapacityL: doublePrecision("volume_capacity_l"),
  maxItemDimensionCm: doublePrecision("max_item_dimension_cm"),
  allowsNestedContainers: boolean("allows_nested_containers").notNull().default(true),
  liquidOnly: boolean("liquid_only").notNull().default(false),
  allowedCategories: text("allowed_categories").array().notNull().default(sql`'{}'::text[]`),
  allowedRecordTypes: text("allowed_record_types").array().notNull().default(sql`'{}'::text[]`),
  containedWeightBehavior: text("contained_weight_behavior").notNull().default("normal"),
  weightCapacityMode: text("weight_capacity_mode").notNull().default("normal"),
  volumeCapacityMode: text("volume_capacity_mode").notNull().default("normal"),
  fixedLoadedWeightLb: doublePrecision("fixed_loaded_weight_lb"),
  magicalContentRestriction: text("magical_content_restriction").notNull().default("any"),
  timeBehavior: text("time_behavior").notNull().default("normal"),
  timeMultiplier: doublePrecision("time_multiplier"),
  timeAppliesTo: text("time_applies_to").notNull().default("all"),
  timeCategories: text("time_categories").array().notNull().default(sql`'{}'::text[]`),
  timeRecordTypes: text("time_record_types").array().notNull().default(sql`'{}'::text[]`),
  livingContentsAllowed: boolean("living_contents_allowed").notNull().default(false),
  source: jsonb("source").$type<ContainerSource>(),
  closureMode: text("closure_mode").notNull().default("always-accessible"),
  retrieveInitiativeCost: doublePrecision("retrieve_initiative_cost"),
  stowInitiativeCost: doublePrecision("stow_initiative_cost"),
  openInitiativeCost: doublePrecision("open_initiative_cost"),
  closeInitiativeCost: doublePrecision("close_initiative_cost"),
}, (t) => [
  check("container_closure_mode_valid", sql`${t.closureMode} in ('always-accessible','open-close')`),
  ...[t.retrieveInitiativeCost, t.stowInitiativeCost, t.openInitiativeCost, t.closeInitiativeCost].map((column, index) => check(`container_access_cost_${index}_valid`, sql`${column} is null or (${column} >= 0 and ${column} < 'Infinity'::float8)`)),
  check("container_weight_behavior_valid", sql`${t.containedWeightBehavior} in ('normal','contents-weightless','fixed')`),
  check("container_capacity_modes_valid", sql`${t.weightCapacityMode} in ('normal','unlimited') and ${t.volumeCapacityMode} in ('normal','unlimited')`),
  check("container_fixed_weight_valid", sql`(${t.fixedLoadedWeightLb} is null or (${t.fixedLoadedWeightLb} >= 0 and ${t.fixedLoadedWeightLb} < 'Infinity'::float8)) and (${t.containedWeightBehavior} <> 'fixed' or ${t.fixedLoadedWeightLb} is not null)`),
  check("container_magic_restriction_valid", sql`${t.magicalContentRestriction} in ('any','mundane-only','magical-only')`),
  check("container_time_valid", sql`${t.timeBehavior} in ('normal','suspended','slowed','accelerated') and (${t.timeBehavior} not in ('slowed','accelerated') or (${t.timeMultiplier} is not null and ${t.timeMultiplier} > 0 and ${t.timeMultiplier} < 'Infinity'::float8 and ((${t.timeBehavior} = 'slowed' and ${t.timeMultiplier} < 1) or (${t.timeBehavior} = 'accelerated' and ${t.timeMultiplier} > 1))))`),
  check("container_time_scope_valid", sql`${t.timeAppliesTo} in ('all','perishables','living','categories-types')`),
  check("container_source_valid", sql`${t.source} is null or (jsonb_typeof(${t.source}) = 'object' and ${t.source}->>'mode' in ('finite','infinite') and length(${t.source}->'substance'->>'id') > 0 and length(${t.source}->'substance'->>'name') > 0 and (${t.source}->>'mode' <> 'infinite' or ${t.containedWeightBehavior} <> 'normal'))`),
  check("container_classification_valid", sql`${t.classification} in ('pocket','pouch','backpack','quiver','sheath','holster','case','chest','crate','bottle','flask','generic')`),
  check("container_weight_finite", sql`${t.maxWeightLb} is null or (${t.maxWeightLb} >= 0 and ${t.maxWeightLb} < 'Infinity'::float8)`),
  check("container_volume_finite", sql`${t.volumeCapacityL} is null or (${t.volumeCapacityL} >= 0 and ${t.volumeCapacityL} < 'Infinity'::float8)`),
  check("container_dimension_finite", sql`${t.maxItemDimensionCm} is null or (${t.maxItemDimensionCm} >= 0 and ${t.maxItemDimensionCm} < 'Infinity'::float8)`),
]);

/** Finite bulk contents only. Infinite sources have no fake quantity or mutable counter. */
export const inventoryContainerSubstance = pgTable("inventory_container_substance", {
  instanceId: integer("instance_id").primaryKey(),
  characterId: integer("character_id").notNull(),
  itemId: integer("item_id").notNull().references(() => containerProfile.itemId, { onDelete: "restrict" }),
  substance: jsonb("substance").$type<Substance>().notNull(),
  quantity: doublePrecision("quantity").notNull(),
}, t => [
  foreignKey({ name: "container_substance_owned_fk", columns: [t.instanceId, t.characterId, t.itemId],
    foreignColumns: [campaignCharacterItemInstance.id, campaignCharacterItemInstance.characterId, campaignCharacterItemInstance.itemId] }).onDelete("restrict"),
  check("container_substance_quantity_valid", sql`${t.quantity} > 0 and ${t.quantity} < 'Infinity'::float8`),
  index("container_substance_character_idx").on(t.characterId),
]);

/** Only contained copies have rows; ownership and acquisition costs stay in the instance table. */
export const inventoryInstanceLocation = pgTable("inventory_instance_location", {
  instanceId: integer("instance_id").primaryKey(),
  characterId: integer("character_id").notNull(),
  itemId: integer("item_id").notNull(),
  containerInstanceId: integer("container_instance_id").notNull(),
  containerItemId: integer("container_item_id").notNull().references(() => containerProfile.itemId, { onDelete: "restrict" }),
}, (t) => [
  foreignKey({ name: "instance_location_owned_fk", columns: [t.instanceId, t.characterId, t.itemId],
    foreignColumns: [campaignCharacterItemInstance.id, campaignCharacterItemInstance.characterId, campaignCharacterItemInstance.itemId] }).onDelete("restrict"),
  foreignKey({ name: "instance_location_container_fk", columns: [t.containerInstanceId, t.characterId, t.containerItemId],
    foreignColumns: [campaignCharacterItemInstance.id, campaignCharacterItemInstance.characterId, campaignCharacterItemInstance.itemId] }).onDelete("restrict"),
  check("instance_location_not_self", sql`${t.instanceId} <> ${t.containerInstanceId}`),
  index("instance_location_contents_idx").on(t.characterId, t.containerInstanceId),
]);

/** The unallocated remainder of campaign_character_item.quantity is loose. */
export const inventoryStackLocation = pgTable("inventory_stack_location", {
  characterId: integer("character_id").notNull(),
  itemId: integer("item_id").notNull(),
  containerInstanceId: integer("container_instance_id").notNull(),
  containerItemId: integer("container_item_id").notNull().references(() => containerProfile.itemId, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
}, (t) => [
  primaryKey({ columns: [t.characterId, t.itemId, t.containerInstanceId] }),
  foreignKey({ name: "stack_location_owned_fk", columns: [t.characterId, t.itemId],
    foreignColumns: [campaignCharacterItem.characterId, campaignCharacterItem.itemId] }).onDelete("restrict"),
  foreignKey({ name: "stack_location_container_fk", columns: [t.containerInstanceId, t.characterId, t.containerItemId],
    foreignColumns: [campaignCharacterItemInstance.id, campaignCharacterItemInstance.characterId, campaignCharacterItemInstance.itemId] }).onDelete("restrict"),
  check("stack_location_quantity_positive", sql`${t.quantity} > 0`),
  index("stack_location_contents_idx").on(t.characterId, t.containerInstanceId),
]);

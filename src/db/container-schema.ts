import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, foreignKey, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
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
}, (t) => [
  check("container_weight_behavior_valid", sql`${t.containedWeightBehavior} = 'normal'`),
  check("container_classification_valid", sql`${t.classification} in ('pocket','pouch','backpack','quiver','sheath','holster','case','chest','crate','bottle','flask','generic')`),
  check("container_weight_finite", sql`${t.maxWeightLb} is null or (${t.maxWeightLb} >= 0 and ${t.maxWeightLb} < 'Infinity'::float8)`),
  check("container_volume_finite", sql`${t.volumeCapacityL} is null or (${t.volumeCapacityL} >= 0 and ${t.volumeCapacityL} < 'Infinity'::float8)`),
  check("container_dimension_finite", sql`${t.maxItemDimensionCm} is null or (${t.maxItemDimensionCm} >= 0 and ${t.maxItemDimensionCm} < 'Infinity'::float8)`),
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

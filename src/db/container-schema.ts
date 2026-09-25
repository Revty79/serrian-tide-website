import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, primaryKey } from "drizzle-orm/pg-core";
import { item } from "./item-schema";
import { campaignCharacterItem, campaignCharacterItemInstance } from "./realm-schema";

/** Presence identifies a container model. Later passes can extend this profile. */
export const containerProfile = pgTable("container_profiles", {
  itemId: integer("item_id").primaryKey().references(() => item.id, { onDelete: "cascade" }),
});

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

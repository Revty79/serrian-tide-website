import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { campaignCharacter, campaignCharacterItem, campaignCharacterItemInstance } from "./realm-schema";
import { campaignSession, campaignSessionScene } from "./tabletop-operations-schema";
import { containerProfile } from "./container-schema";

const context = () => ({
  sessionId: integer("session_id").references(() => campaignSession.id, { onDelete: "set null" }),
  sceneId: integer("scene_id").references(() => campaignSessionScene.id, { onDelete: "set null" }),
  contextLabel: text("context_label").notNull().default(""),
  note: text("note").notNull().default(""), reason: text("reason").notNull().default(""),
  actorUserId: text("actor_user_id").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const inventoryInstanceCustody = pgTable("inventory_instance_custody", {
  instanceId: integer("instance_id").primaryKey(), characterId: integer("character_id").notNull(), itemId: integer("item_id").notNull(),
  status: text("status").notNull(), ...context(),
}, t => [
  foreignKey({ name: "instance_custody_owned_fk", columns: [t.instanceId, t.characterId, t.itemId], foreignColumns: [campaignCharacterItemInstance.id, campaignCharacterItemInstance.characterId, campaignCharacterItemInstance.itemId] }).onDelete("restrict"),
  check("instance_custody_status_valid", sql`${t.status} in ('dropped','stolen','lost')`), index("instance_custody_character_idx").on(t.characterId),
]);
export const inventoryStackCustody = pgTable("inventory_stack_custody", {
  id: serial("id").primaryKey(), characterId: integer("character_id").notNull(), itemId: integer("item_id").notNull(),
  quantity: integer("quantity").notNull(), status: text("status").notNull(), ...context(),
}, t => [
  foreignKey({ name: "stack_custody_owned_fk", columns: [t.characterId, t.itemId], foreignColumns: [campaignCharacterItem.characterId, campaignCharacterItem.itemId] }).onDelete("restrict"),
  check("stack_custody_quantity_valid", sql`${t.quantity} > 0`), check("stack_custody_status_valid", sql`${t.status} in ('dropped','stolen','lost')`), index("stack_custody_character_idx").on(t.characterId),
]);
export const inventoryContainerAccess = pgTable("inventory_container_access", {
  instanceId: integer("instance_id").primaryKey(), characterId: integer("character_id").notNull(),
  itemId: integer("item_id").notNull().references(() => containerProfile.itemId, { onDelete: "restrict" }),
  state: text("state").notNull(), actorUserId: text("actor_user_id").notNull(), reason: text("reason").notNull().default(""), updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t => [
  foreignKey({ name: "container_access_owned_fk", columns: [t.instanceId, t.characterId, t.itemId], foreignColumns: [campaignCharacterItemInstance.id, campaignCharacterItemInstance.characterId, campaignCharacterItemInstance.itemId] }).onDelete("cascade"),
  check("container_access_state_valid", sql`${t.state} in ('open','closed','locked','sealed')`), index("container_access_character_idx").on(t.characterId),
]);
/** An event history, not ownership. Exact identities survive retirement in JSON evidence. */
export const inventoryCustodyEvent = pgTable("inventory_custody_event", {
  id: serial("id").primaryKey(), characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull(), instanceId: integer("instance_id"), quantity: integer("quantity").notNull(),
  operation: text("operation").notNull(), previousStatus: text("previous_status").notNull(), newStatus: text("new_status").notNull(),
  requestKey: text("request_key").notNull(), evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(), ...context(),
}, t => [uniqueIndex("custody_event_request_uq").on(t.characterId, t.requestKey), index("custody_event_character_idx").on(t.characterId)]);

import { sql } from "drizzle-orm";
import { pgTable, integer, text, jsonb, timestamp, serial, primaryKey, unique, check } from "drizzle-orm/pg-core";
import { item, weaponProfile } from "./item-schema";
import { campaignCharacter } from "./realm-schema";
import { user } from "./auth-schema";

export const magazineProfile = pgTable("magazine_profiles", {
  itemId: integer("item_id").primaryKey().references(() => item.id, { onDelete: "cascade" }),
  capacityRounds: integer("capacity_rounds").notNull(),
}, (t) => [check("magazine_capacity_positive", sql`${t.capacityRounds} > 0`)]);

export const magazineAmmunition = pgTable("magazine_ammunition", {
  magazineItemId: integer("magazine_item_id").notNull().references(() => magazineProfile.itemId, { onDelete: "cascade" }),
  ammunitionItemId: integer("ammunition_item_id").notNull().references(() => item.id, { onDelete: "restrict" }),
}, (t) => [primaryKey({ columns: [t.magazineItemId, t.ammunitionItemId] }), check("magazine_ammo_not_self", sql`${t.magazineItemId} <> ${t.ammunitionItemId}`)]);

export const weaponMagazine = pgTable("weapon_magazines", {
  weaponProfileId: integer("weapon_profile_id").notNull().references(() => weaponProfile.id, { onDelete: "cascade" }),
  magazineItemId: integer("magazine_item_id").notNull().references(() => magazineProfile.itemId, { onDelete: "restrict" }),
}, (t) => [primaryKey({ columns: [t.weaponProfileId, t.magazineItemId] })]);

export const magazineInventoryOperation = pgTable("magazine_inventory_operation", {
  id: serial("id").primaryKey(),
  characterId: integer("character_id").notNull().references(() => campaignCharacter.id, { onDelete: "cascade" }),
  instanceId: integer("instance_id").notNull(),
  requestKey: text("request_key").notNull(),
  actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
  request: jsonb("request").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique("magazine_inventory_retry_uq").on(t.characterId, t.requestKey)]);

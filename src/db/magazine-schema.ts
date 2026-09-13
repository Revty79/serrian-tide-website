import { sql } from "drizzle-orm";
import { pgTable, doublePrecision, integer, text, jsonb, timestamp, serial, primaryKey, unique, check, foreignKey } from "drizzle-orm/pg-core";
import { item, weaponProfile } from "./item-schema";
import { campaignCharacter, campaignCharacterItemInstance } from "./realm-schema";
import { campaignCharacterFirearmState } from "./tabletop-operations-schema";
import { user } from "./auth-schema";

export const magazineProfile = pgTable("magazine_profiles", {
  itemId: integer("item_id").primaryKey().references(() => item.id, { onDelete: "cascade" }),
  capacityRounds: integer("capacity_rounds").notNull(),
  fillInitiativeCostPerRound: doublePrecision("fill_initiative_cost_per_round"),
}, (t) => [check("magazine_capacity_positive", sql`${t.capacityRounds} > 0`),
  check("magazine_fill_cost_nonnegative", sql`${t.fillInitiativeCostPerRound} IS NULL OR ${t.fillInitiativeCostPerRound} >= 0`)]);

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

export const firearmMagazineAttachment = pgTable("firearm_magazine_attachment", {
  weaponInstanceId: integer("weapon_instance_id").primaryKey(),
  magazineInstanceId: integer("magazine_instance_id").notNull().unique(),
  characterId: integer("character_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  weaponItemId: integer("weapon_item_id").notNull(),
  weaponProfileId: integer("weapon_profile_id").notNull(),
  magazineItemId: integer("magazine_item_id").notNull(),
}, (t) => [
  foreignKey({ name: "firearm_magazine_weapon_identity_fk", columns: [t.weaponInstanceId, t.campaignId, t.characterId, t.weaponItemId, t.weaponProfileId],
    foreignColumns: [campaignCharacterFirearmState.itemInstanceId, campaignCharacterFirearmState.campaignId, campaignCharacterFirearmState.characterId, campaignCharacterFirearmState.itemId, campaignCharacterFirearmState.weaponProfileId] }).onDelete("restrict"),
  foreignKey({ name: "firearm_magazine_copy_identity_fk", columns: [t.magazineInstanceId, t.characterId, t.magazineItemId],
    foreignColumns: [campaignCharacterItemInstance.id, campaignCharacterItemInstance.characterId, campaignCharacterItemInstance.itemId] }).onDelete("restrict"),
  foreignKey({ name: "firearm_magazine_physical_fit_fk", columns: [t.weaponProfileId, t.magazineItemId],
    foreignColumns: [weaponMagazine.weaponProfileId, weaponMagazine.magazineItemId] }).onDelete("restrict"),
  check("firearm_magazine_distinct_copies", sql`${t.weaponInstanceId} <> ${t.magazineInstanceId}`),
]);

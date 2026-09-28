import { sql } from "drizzle-orm";
import { check, foreignKey, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { CatalogKey, CatalogVisibilityMode } from "@/features/catalog-visibility/catalog-visibility";
import { user } from "./auth-schema";

const visibility = (name: string) => text(name).$type<CatalogVisibilityMode>().default("canon-and-mine").notNull();

// Preserve the original Pass 3 classification evidence independently of activation.
export const catalogVisibilityActivation = pgTable("catalog_visibility_activation", {
  manifestHash: text("manifest_hash").primaryKey(),
  classifiedAt: timestamp("classified_at").defaultNow().notNull(),
});

// Presence means active. Only the current database is affected. Legacy receipts
// did not record an actor; manual activation always requires one.
export const catalogVisibilityScopeActivation = pgTable("catalog_visibility_scope_activation", {
  catalogKey: text("catalog_key").$type<CatalogKey>().primaryKey(),
  activatedAt: timestamp("activated_at").defaultNow().notNull(),
  activatedByUserId: text("activated_by_user_id"),
  activationMethod: text("activation_method").$type<"classified-manifest" | "manual">().notNull(),
  manifestHash: text("manifest_hash"),
}, (table) => [
  foreignKey({ name: "catalog_scope_activation_actor_fk", columns: [table.activatedByUserId], foreignColumns: [user.id] }).onDelete("restrict"),
  check("catalog_scope_activation_key_valid", sql`${table.catalogKey} IN ('race', 'creature', 'skill', 'derivedAbility', 'equipment', 'inventory')`),
  check("catalog_scope_activation_method_valid", sql`(${table.activationMethod} = 'manual' AND ${table.activatedByUserId} IS NOT NULL AND ${table.manifestHash} IS NULL) OR (${table.activationMethod} = 'classified-manifest' AND ${table.manifestHash} IS NOT NULL AND ${table.catalogKey} IN ('race', 'creature', 'skill', 'derivedAbility'))`),
]);

export const userCatalogPreferences = pgTable("user_catalog_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  raceVisibility: visibility("race_visibility"),
  creatureVisibility: visibility("creature_visibility"),
  skillVisibility: visibility("skill_visibility"),
  derivedAbilityVisibility: visibility("derived_ability_visibility"),
  equipmentVisibility: visibility("equipment_visibility"),
  inventoryVisibility: visibility("inventory_visibility"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  check("user_catalog_preferences_race_valid", sql`${table.raceVisibility} IN ('canon', 'canon-and-mine', 'mine')`),
  check("user_catalog_preferences_creature_valid", sql`${table.creatureVisibility} IN ('canon', 'canon-and-mine', 'mine')`),
  check("user_catalog_preferences_skill_valid", sql`${table.skillVisibility} IN ('canon', 'canon-and-mine', 'mine')`),
  check("user_catalog_preferences_derived_ability_valid", sql`${table.derivedAbilityVisibility} IN ('canon', 'canon-and-mine', 'mine')`),
  check("user_catalog_preferences_equipment_valid", sql`${table.equipmentVisibility} IN ('canon', 'canon-and-mine', 'mine')`),
  check("user_catalog_preferences_inventory_valid", sql`${table.inventoryVisibility} IN ('canon', 'canon-and-mine', 'mine')`),
]);

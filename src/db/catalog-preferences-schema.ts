import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { CatalogVisibilityMode } from "@/features/catalog-visibility/catalog-visibility";
import { user } from "./auth-schema";

const visibility = (name: string) => text(name).$type<CatalogVisibilityMode>().default("canon-and-mine").notNull();

// A receipt is written only by the guarded, transactional classifier. Preferences
// remain inert until this environment has completed the exact reviewed manifest.
export const catalogVisibilityActivation = pgTable("catalog_visibility_activation", {
  manifestHash: text("manifest_hash").primaryKey(),
  classifiedAt: timestamp("classified_at").defaultNow().notNull(),
});

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

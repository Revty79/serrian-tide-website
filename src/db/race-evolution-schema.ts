import { sql } from "drizzle-orm";
import { check, doublePrecision, index, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { race } from "./race-schema";
import { skill } from "./skill-schema";
import { item } from "./item-schema";
import { derivedAbility } from "./derived-ability-schema";
import type { EvolutionRequirementMode, EvolutionManualCategory, EvolutionRequirementOperator, EvolutionRequirementType } from "@/features/evolutions/evolution-requirements";

export const raceEvolutionPath = pgTable("race_evolution_paths", {
  id: serial("id").primaryKey(),
  sourceRaceId: integer("source_race_id").notNull().references(() => race.id, { onDelete: "cascade" }),
  destinationRaceId: integer("destination_race_id").notNull().references(() => race.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  notes: text("notes").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  requirementMode: text("requirement_mode").$type<EvolutionRequirementMode>().notNull().default("unrestricted"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, table => [
  index("race_evolution_source_order").on(table.sourceRaceId, table.sortOrder, table.id),
  index("race_evolution_destination").on(table.destinationRaceId),
  check("race_evolution_not_self", sql`${table.sourceRaceId} <> ${table.destinationRaceId}`),
  check("race_evolution_name", sql`length(trim(${table.name})) > 0`),
  check("race_evolution_order", sql`${table.sortOrder} >= 0`),
  check("race_evolution_version", sql`${table.version} > 0`),
  check("race_evolution_requirement_mode", sql`${table.requirementMode} IN ('unrestricted','requirements')`),
]);

export const raceEvolutionRequirement = pgTable("race_evolution_requirements", {
  id: serial("id").primaryKey(),
  pathId: integer("path_id").notNull().references(() => raceEvolutionPath.id, { onDelete: "cascade" }),
  key: text("requirement_key").notNull(),
  groupNumber: integer("group_number").notNull(),
  sortOrder: integer("sort_order").notNull(),
  requirementType: text("requirement_type").$type<EvolutionRequirementType>().notNull(),
  operator: text("operator").$type<EvolutionRequirementOperator>(),
  requiredValue: doublePrecision("required_value"),
  skillId: integer("skill_id").references(() => skill.id, { onDelete: "restrict" }),
  itemId: integer("item_id").references(() => item.id, { onDelete: "restrict" }),
  itemHolder: text("item_holder").$type<"character">(),
  // Portable, scoped to the path's exact source. Authoring validates removal and cloning.
  derivedAbilityId: integer("derived_ability_id").references(() => derivedAbility.id, { onDelete: "restrict" }),
  raceFormKey: text("race_form_key"),
  conditionName: text("condition_name"),
  manualCategory: text("manual_category").$type<EvolutionManualCategory>(),
  notes: text("notes").notNull().default(""),
}, table => [
  unique("race_evolution_requirement_key").on(table.pathId, table.key),
  index("race_evolution_requirement_order").on(table.pathId, table.groupNumber, table.sortOrder),
  index("race_evolution_requirement_skill").on(table.skillId),
  index("race_evolution_requirement_item").on(table.itemId),
  index("race_evolution_requirement_ability").on(table.derivedAbilityId),
  check("race_evolution_requirement_identity", sql`length(trim(${table.key})) > 0 AND ${table.groupNumber} >= 0 AND ${table.sortOrder} >= 0`),
  check("race_evolution_requirement_type", sql`${table.requirementType} IN ('age','current-experience','total-experience','skill','derived-ability','item','condition','form-access','manual')`),
  check("race_evolution_requirement_value", sql`${table.requiredValue} IS NULL OR (${table.requiredValue} >= 0 AND ${table.requiredValue} < 'Infinity'::float8)`),
  check("race_evolution_requirement_shape", sql`coalesce(
    (${table.requirementType} IN ('age','current-experience','total-experience') AND ${table.operator} IN ('gte','gt','lte','lt','eq','neq') AND ${table.requiredValue} IS NOT NULL)
    OR (${table.requirementType} = 'skill' AND ${table.skillId} IS NOT NULL AND ((${table.operator} IN ('possessed','not-possessed') AND ${table.requiredValue} IS NULL) OR (${table.operator} IN ('gte','gt','lte','lt','eq','neq') AND ${table.requiredValue} IS NOT NULL)))
    OR (${table.requirementType} = 'derived-ability' AND ${table.derivedAbilityId} IS NOT NULL AND ${table.operator} IN ('possessed','not-possessed') AND ${table.requiredValue} IS NULL)
    OR (${table.requirementType} = 'item' AND ${table.itemId} IS NOT NULL AND ${table.itemHolder} = 'character' AND ${table.operator} = 'possessed' AND ${table.requiredValue} IS NULL)
    OR (${table.requirementType} = 'condition' AND length(trim(${table.conditionName})) > 0 AND ${table.operator} IN ('possessed','not-possessed') AND ${table.requiredValue} IS NULL)
    OR (${table.requirementType} = 'form-access' AND length(trim(${table.raceFormKey})) > 0 AND ${table.operator} = 'possessed' AND ${table.requiredValue} IS NULL)
    OR (${table.requirementType} = 'manual' AND ${table.manualCategory} IN ('god-approval','story-event','milestone','environment','current-form','custom') AND length(trim(${table.notes})) > 0 AND ${table.operator} IS NULL AND ${table.requiredValue} IS NULL), false)`),
]);

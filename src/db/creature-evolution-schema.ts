import { sql } from "drizzle-orm";
import { check, doublePrecision, index, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import { creatureEvolutionPath } from "./creature-schema";
import { skill } from "./skill-schema";
import { item } from "./item-schema";
import type { EvolutionManualCategory, EvolutionRequirementOperator, EvolutionRequirementType } from "@/features/creatures/evolution-requirements";

export const creatureEvolutionRequirement = pgTable("creature_evolution_requirements", {
  id: serial("id").primaryKey(),
  pathId: integer("path_id").notNull().references(() => creatureEvolutionPath.id, { onDelete: "cascade" }),
  key: text("requirement_key").notNull(),
  groupNumber: integer("group_number").notNull(),
  sortOrder: integer("sort_order").notNull(),
  requirementType: text("requirement_type").$type<EvolutionRequirementType>().notNull(),
  operator: text("operator").$type<EvolutionRequirementOperator>(),
  requiredValue: doublePrecision("required_value"),
  skillId: integer("skill_id").references(() => skill.id, { onDelete: "restrict" }),
  itemId: integer("item_id").references(() => item.id, { onDelete: "restrict" }),
  itemHolder: text("item_holder").$type<"creature" | "owner">(),
  // Portable, scoped to the path's exact source. Authoring validates removal and cloning.
  creatureAbilityCanonicalId: text("creature_ability_canonical_id"),
  creatureFormKey: text("creature_form_key"),
  conditionName: text("condition_name"),
  manualCategory: text("manual_category").$type<EvolutionManualCategory>(),
  notes: text("notes").notNull().default(""),
}, table => [
  unique("creature_evolution_requirement_key").on(table.pathId, table.key),
  index("creature_evolution_requirement_order").on(table.pathId, table.groupNumber, table.sortOrder),
  index("creature_evolution_requirement_skill").on(table.skillId),
  index("creature_evolution_requirement_item").on(table.itemId),
  check("creature_evolution_requirement_identity", sql`length(trim(${table.key})) > 0 AND ${table.groupNumber} >= 0 AND ${table.sortOrder} >= 0`),
  check("creature_evolution_requirement_type", sql`${table.requirementType} IN ('age','current-experience','total-experience','skill','creature-ability','item','condition','form-access','manual')`),
  check("creature_evolution_requirement_value", sql`${table.requiredValue} IS NULL OR (${table.requiredValue} >= 0 AND ${table.requiredValue} < 'Infinity'::float8)`),
  check("creature_evolution_requirement_shape", sql`coalesce(
    (${table.requirementType} IN ('age','current-experience','total-experience') AND ${table.operator} IN ('gte','gt','lte','lt','eq','neq') AND ${table.requiredValue} IS NOT NULL)
    OR (${table.requirementType} = 'skill' AND ${table.skillId} IS NOT NULL AND ${table.operator} IN ('possessed','not-possessed') AND ${table.requiredValue} IS NULL)
    OR (${table.requirementType} = 'creature-ability' AND length(trim(${table.creatureAbilityCanonicalId})) > 0 AND ${table.operator} IN ('possessed','not-possessed') AND ${table.requiredValue} IS NULL)
    OR (${table.requirementType} = 'item' AND ${table.itemId} IS NOT NULL AND ${table.itemHolder} IN ('creature','owner') AND ${table.operator} = 'possessed' AND ${table.requiredValue} IS NULL)
    OR (${table.requirementType} = 'condition' AND length(trim(${table.conditionName})) > 0 AND ${table.operator} IN ('possessed','not-possessed') AND ${table.requiredValue} IS NULL)
    OR (${table.requirementType} = 'form-access' AND length(trim(${table.creatureFormKey})) > 0 AND ${table.operator} = 'possessed' AND ${table.requiredValue} IS NULL)
    OR (${table.requirementType} = 'manual' AND ${table.manualCategory} IN ('god-approval','story-event','milestone','environment','current-form','custom') AND length(trim(${table.notes})) > 0 AND ${table.operator} IS NULL AND ${table.requiredValue} IS NULL), false)`),
]);

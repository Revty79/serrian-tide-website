import { sql } from "drizzle-orm";
import { check, doublePrecision, index, integer, pgTable, serial, text, unique, type AnyPgColumn } from "drizzle-orm/pg-core";
import { raceForm } from "./race-schema";
import { creatureForm } from "./creature-schema";
import { skill } from "./skill-schema";
import { derivedAbility } from "./derived-ability-schema";
import type { FormAccessOperator, FormAccessType } from "@/features/forms/form-access";
import type { CharacterAttributeKey } from "@/features/characters/models";

function columns(owner: () => AnyPgColumn) {
  return {
    id: serial("id").primaryKey(),
    formId: integer("form_id").notNull().references(owner, { onDelete: "cascade" }),
    key: text("requirement_key").notNull(),
    groupNumber: integer("group_number").notNull(),
    requirementType: text("requirement_type").$type<FormAccessType>().notNull(),
    attributeKey: text("attribute_key").$type<CharacterAttributeKey>(),
    skillId: integer("skill_id").references(() => skill.id, { onDelete: "restrict" }),
    requiredDerivedAbilityId: integer("required_derived_ability_id").references(() => derivedAbility.id, { onDelete: "restrict" }),
    // Portable Normal ability identity. The service validates ownership against the
    // final Creature definition and remaps IDs during independent Creature cloning.
    requiredCreatureAbilityCanonicalId: text("required_creature_ability_canonical_id"),
    operator: text("operator").$type<FormAccessOperator>(),
    requiredValue: doublePrecision("required_value"),
    notes: text("notes").notNull().default(""),
    sortOrder: integer("sort_order").notNull(),
  };
}
export const raceFormAccessRequirement = pgTable("race_form_access_requirements", columns(() => raceForm.id), table => accessConstraints(table, "race_form_access", "race"));
export const creatureFormAccessRequirement = pgTable("creature_form_access_requirements", columns(() => creatureForm.id), table => accessConstraints(table, "creature_form_access", "creature"));

function accessConstraints(table: { [K in keyof ReturnType<typeof columns>]: AnyPgColumn }, prefix: string, owner: "race" | "creature") {
  return [
    unique(`${prefix}_key`).on(table.formId, table.key),
    unique(`${prefix}_position`).on(table.formId, table.groupNumber, table.sortOrder),
    index(`${prefix}_skill`).on(table.skillId),
    index(`${prefix}_derived_ability`).on(table.requiredDerivedAbilityId),
    check(`${prefix}_order`, sql`length(trim(${table.key})) > 0 AND ${table.groupNumber} >= 0 AND ${table.sortOrder} >= 0`),
    check(`${prefix}_shape`, sql`coalesce((
      (${table.requirementType} = 'manual' AND ${table.attributeKey} IS NULL AND ${table.skillId} IS NULL AND ${table.requiredDerivedAbilityId} IS NULL AND ${table.requiredCreatureAbilityCanonicalId} IS NULL AND ${table.operator} IS NULL AND ${table.requiredValue} IS NULL AND length(trim(${table.notes})) > 0)
      OR (${table.requirementType} = 'attribute' AND ${table.attributeKey} IN ('STR','DEX','CON','INT','WIS','CHR') AND ${table.skillId} IS NULL AND ${table.requiredDerivedAbilityId} IS NULL AND ${table.requiredCreatureAbilityCanonicalId} IS NULL AND ${table.operator} IN ('gte','gt','lte','lt','eq','neq') AND ${table.requiredValue} IS NOT NULL)
      OR (${table.requirementType} = 'skill' AND ${table.attributeKey} IS NULL AND ${table.skillId} IS NOT NULL AND ${table.requiredDerivedAbilityId} IS NULL AND ${table.requiredCreatureAbilityCanonicalId} IS NULL AND ((${table.operator} IN ('possessed','not-possessed') AND ${table.requiredValue} IS NULL) OR (${sql.raw(owner === "race" ? "true" : "false")} AND ${table.operator} IN ('gte','gt','lte','lt','eq','neq') AND ${table.requiredValue} IS NOT NULL)))
      OR (${sql.raw(owner === "race" ? "true" : "false")} AND ${table.requirementType} = 'derived-ability' AND ${table.attributeKey} IS NULL AND ${table.skillId} IS NULL AND ${table.requiredDerivedAbilityId} IS NOT NULL AND ${table.requiredCreatureAbilityCanonicalId} IS NULL AND ${table.operator} IN ('possessed','not-possessed') AND ${table.requiredValue} IS NULL)
      OR (${sql.raw(owner === "creature" ? "true" : "false")} AND ${table.requirementType} = 'creature-ability' AND ${table.attributeKey} IS NULL AND ${table.skillId} IS NULL AND ${table.requiredDerivedAbilityId} IS NULL AND length(trim(${table.requiredCreatureAbilityCanonicalId})) > 0 AND ${table.operator} IN ('possessed','not-possessed') AND ${table.requiredValue} IS NULL)
    ) AND (${table.requiredValue} IS NULL OR (${table.requiredValue} > '-Infinity'::float8 AND ${table.requiredValue} < 'Infinity'::float8)), false)`),
  ];
}

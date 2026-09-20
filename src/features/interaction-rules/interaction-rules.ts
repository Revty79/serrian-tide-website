import { CREATURE_CR_IMPACTS, type CreatureCrImpact } from "@/db/creature-schema";
import type { MechanicalEffect } from "@/features/mechanical-effects/models";
import { ACTION_EFFECT_SOURCE_KINDS, type ActionEffectSourceKind } from "@/features/tabletop-operations/action-effect-bridge";

// Authoring and preservation only. No matching or consequence execution belongs here.
export const INTERACTION_RULE_TYPES = ["requirement", "immunity", "resistance", "vulnerability", "absorption"] as const;
export const INTERACTION_SCOPES = ["damage", "condition", "mechanical-effect"] as const;
export const INTERACTION_CONDITION_KINDS = ["damage-type", "magical", "source-kind", "item-property", "item-tag", "mechanical-effect-kind", "condition-name"] as const;
export const INTERACTION_SOURCE_KINDS = ACTION_EFFECT_SOURCE_KINDS;
export const INTERACTION_EFFECT_LABELS = {
  "health.damage": "Health damage",
  "health.heal": "Health healing",
  "condition.apply": "Apply condition",
  "modifier.apply": "Apply modifier",
  manual: "Manual effect",
} satisfies Record<MechanicalEffect["kind"], string>;

export type InteractionRuleType = typeof INTERACTION_RULE_TYPES[number];
export type InteractionRuleOwner = "creature" | "race";
export type InteractionCondition = { key: string } & (
  | { kind: "damage-type"; damageType: string }
  | { kind: "magical"; magical: boolean }
  | { kind: "source-kind"; sourceKind: ActionEffectSourceKind; weaponFamily?: "firearm" | null }
  | { kind: "item-property"; propertyName: string; value: string | null; relatedCreatureCanonicalId?: string | null }
  | { kind: "item-tag"; tagCanonicalId: string }
  | { kind: "mechanical-effect-kind"; effectKind: MechanicalEffect["kind"] }
  | { kind: "condition-name"; conditionName: string }
);
export type InteractionRule = {
  key: string;
  name: string;
  ruleType: InteractionRuleType;
  scope: typeof INTERACTION_SCOPES[number];
  match: "ANY" | "ALL";
  conditions: InteractionCondition[];
  percentage: number | null;
  notes: string;
  sortOrder: number;
  crImpact?: CreatureCrImpact;
};
export type InteractionRuleProfile = { schemaVersion: 1; rules: InteractionRule[] };

export function usesInteractionPercentage(type: InteractionRuleType) {
  return type === "resistance" || type === "vulnerability" || type === "absorption";
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, required = true): string {
  if (typeof value !== "string" || (required && !value.trim())) throw new Error(`${label} ${required ? "is required" : "must be text"}.`);
  return value.trim();
}
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}
function unique(keys: string[], label: string) {
  if (new Set(keys).size !== keys.length) throw new Error(`${label} must be unique.`);
}

function normalizeCondition(value: unknown): InteractionCondition {
  const row = record(value, "Interaction condition");
  const key = text(row.key, "Condition key");
  const kind = choice(row.kind, INTERACTION_CONDITION_KINDS, "Condition type");
  switch (kind) {
    case "damage-type": return { key, kind, damageType: text(row.damageType, "Damage Type") };
    case "magical": {
      if (typeof row.magical !== "boolean") throw new Error("Magical must explicitly be Yes or No.");
      return { key, kind, magical: row.magical };
    }
    case "source-kind": {
      const sourceKind = choice(row.sourceKind, INTERACTION_SOURCE_KINDS, "Source Kind");
      const weaponFamily = row.weaponFamily == null ? null : choice(row.weaponFamily, ["firearm"], "Weapon family");
      if (weaponFamily && sourceKind !== "weapon") throw new Error("Firearm restriction requires Weapon Source Kind.");
      return { key, kind, sourceKind, ...(row.weaponFamily === undefined ? {} : { weaponFamily }) };
    }
    case "item-property": return {
      key, kind, propertyName: text(row.propertyName, "Property Name"),
      value: row.value == null ? null : text(row.value, "Property Value", false) || null,
      ...(row.relatedCreatureCanonicalId === undefined ? {} : {
        relatedCreatureCanonicalId: row.relatedCreatureCanonicalId === null ? null : text(row.relatedCreatureCanonicalId, "Related Creature").toUpperCase(),
      }),
    };
    case "item-tag": return { key, kind, tagCanonicalId: text(row.tagCanonicalId, "Item Tag").toUpperCase() };
    case "mechanical-effect-kind": return { key, kind, effectKind: choice(row.effectKind, Object.keys(INTERACTION_EFFECT_LABELS) as MechanicalEffect["kind"][], "Mechanical Effect Kind") };
    case "condition-name": return { key, kind, conditionName: text(row.conditionName, "Condition Name") };
  }
}

/** Both owners use exactly this contract. Absent legacy profiles remain un-authored. */
export function normalizeInteractionRuleProfile(value: unknown, owner: InteractionRuleOwner): InteractionRuleProfile | null {
  if (value == null) return null;
  const profile = record(value, "Interaction Rule profile");
  if (profile.schemaVersion !== 1 || !Array.isArray(profile.rules)) throw new Error("Interaction Rule profile must use schemaVersion 1 and a rules array.");
  const rules = profile.rules.map((value): InteractionRule => {
    const row = record(value, "Interaction Rule");
    const key = text(row.key, "Rule key"), name = text(row.name, "Rule Name");
    const ruleType = choice(row.ruleType, INTERACTION_RULE_TYPES, `${name}: Rule Type`);
    const scope = choice(row.scope, INTERACTION_SCOPES, `${name}: Applies To`);
    const match = choice(row.match, ["ANY", "ALL"], `${name}: Match`);
    if (!Array.isArray(row.conditions) || !row.conditions.length) throw new Error(`${name} needs at least one condition.`);
    const conditions = row.conditions.map(normalizeCondition);
    unique(conditions.map((condition) => condition.key), `${name}: Condition keys`);
    let percentage: number | null = null;
    if (usesInteractionPercentage(ruleType)) {
      if (typeof row.percentage !== "number" || !Number.isFinite(row.percentage) || row.percentage <= 0) throw new Error(`${name}: Percentage must be finite and greater than zero.`);
      if (scope !== "damage") throw new Error(`${name}: Percentage rules apply to Damage only.`);
      percentage = row.percentage;
    } else if (row.percentage != null) throw new Error(`${name}: Requirement and Immunity do not use a percentage.`);
    if (typeof row.sortOrder !== "number" || !Number.isSafeInteger(row.sortOrder) || row.sortOrder < 0) throw new Error(`${name}: Sort order must be a non-negative whole number.`);
    if (owner === "race" && row.crImpact !== undefined) throw new Error("Race rules do not use Creature CR Impact.");
    return { key, name, ruleType, scope, match, conditions, percentage, notes: text(row.notes, `${name}: Notes`, false), sortOrder: row.sortOrder,
      ...(owner === "creature" ? { crImpact: choice(row.crImpact, CREATURE_CR_IMPACTS, `${name}: CR Impact`) } : {}),
    };
  });
  unique(rules.map((rule) => rule.key), "Interaction Rule keys");
  unique(rules.map((rule) => String(rule.sortOrder)), "Interaction Rule sort orders");
  return { schemaVersion: 1, rules: rules.sort((a, b) => a.sortOrder - b.sortOrder) };
}

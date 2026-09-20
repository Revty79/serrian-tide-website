import {
  DERIVED_ABILITY_ACTIVATION_TYPES,
  type DerivedAbilityActivationType,
  type DerivedAbilityCostDefinition,
  type DerivedAbilityUseConditionDefinition,
  type DerivedAbilityUseLimitDefinition,
} from "@/features/derived-abilities/models";
import {
  normalizeDerivedAbilityCosts,
  normalizeDerivedAbilityUseConditions,
  normalizeDerivedAbilityUseLimits,
} from "@/features/derived-abilities/derived-ability-domain";
import { validateStructuredWeaponRange, type StructuredWeaponRange } from "@/features/items/weapon-range";
import { parseSpellDocument } from "@/features/spell-construction/spellDocumentCodec";
import type { SpellDocument } from "@/features/spell-construction/models/spell";
import { normalizeCreatureEffects, type CreatureEffectDefinition } from "./creature-effects";

// Authoring metadata only. Combat execution deliberately continues to use its existing contract.
export const CREATURE_ATTACK_MODES = ["melee", "ranged", "hybrid", "aoe"] as const;
export const CREATURE_ABILITY_ORIGINS = ["Natural", "Supernatural", "Elemental", "Construct"] as const;
export const CREATURE_RESOLUTION_MODES = ["automatic", "fixed-roll", "manual"] as const;
export type CreatureMagicConstruction = { document: SpellDocument };
export type CreatureAttackAuthoring = {
  schemaVersion: 1;
  initiativeCost: number | null;
  mode: typeof CREATURE_ATTACK_MODES[number] | null;
  range: Omit<StructuredWeaponRange, "mode">;
  magical: boolean | null;
  onHitEffects: CreatureEffectDefinition[];
  magic: CreatureMagicConstruction | null;
};
export type CreatureAbilityAuthoring = {
  schemaVersion: 1;
  activationType: DerivedAbilityActivationType | null;
  initiativeCost: number | null;
  resolutionMode: typeof CREATURE_RESOLUTION_MODES[number];
  fixedRollTarget: number | null;
  targeting: string;
  costs: DerivedAbilityCostDefinition[];
  useConditions: DerivedAbilityUseConditionDefinition[];
  useLimits: DerivedAbilityUseLimitDefinition[];
  magical: boolean | null;
  magic: CreatureMagicConstruction | null;
};

export function emptyCreatureAttackAuthoring(): CreatureAttackAuthoring {
  return { schemaVersion: 1, initiativeCost: null, mode: null, range: { unit: null, reach: null, short: null, medium: null, long: null }, magical: null, onHitEffects: [], magic: null };
}
export function emptyCreatureAbilityAuthoring(): CreatureAbilityAuthoring {
  return { schemaVersion: 1, activationType: null, initiativeCost: null, resolutionMode: "automatic", fixedRollTarget: null, targeting: "", costs: [], useConditions: [], useLimits: [], magical: null, magic: null };
}
function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object.`);
  return input as Record<string, unknown>;
}
function version(input: Record<string, unknown>) {
  if (input.schemaVersion !== 1) throw new Error("Unsupported Creature authoring schema version.");
}
function number(input: unknown, label: string): number | null {
  if (input == null) return null;
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) throw new Error(`${label} must be a nonnegative number.`);
  return input;
}
function magical(input: unknown): boolean | null {
  if (input == null) return null;
  if (typeof input !== "boolean") throw new Error("Magical qualifier must be Yes, No, or Unspecified.");
  return input;
}
function magic(input: unknown): CreatureMagicConstruction | null {
  if (input == null) return null;
  const construction = record(input, "Creature Magic");
  // Preserve authoring drafts. The shared editor/calculator reports incomplete or manual effects;
  // adding a construction never grants a new casting or execution path.
  return { document: parseSpellDocument(JSON.stringify(construction.document)) };
}
function list(input: unknown, label: string): Record<string, unknown>[] {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new Error(`${label} must be an ordered list.`);
  return input.map((row) => record(row, label));
}
function text(input: unknown): string { return typeof input === "string" ? input : ""; }
function optionalText(input: unknown): string | null { return text(input).trim() || null; }

export function normalizeCreatureAttackAuthoring(input: unknown): CreatureAttackAuthoring | null {
  if (input == null) return null;
  const row = record(input, "Attack authoring");
  version(row);
  if (row.mode != null && !CREATURE_ATTACK_MODES.includes(row.mode as CreatureAttackAuthoring["mode"] & string)) throw new Error("Choose a supported Creature Attack Mode.");
  const mode = row.mode as CreatureAttackAuthoring["mode"] ?? null;
  const range = record(row.range, "Attack range");
  const normalizedRange = validateStructuredWeaponRange({
    mode: mode === "aoe" ? "ranged" : mode,
    unit: optionalText(range.unit), reach: number(range.reach, "Reach"),
    short: number(range.short, "Short range"), medium: number(range.medium, "Medium range"), long: number(range.long, "Long range"),
  });
  if (normalizedRange.short !== null && normalizedRange.long !== null && normalizedRange.short > normalizedRange.long) throw new Error("Short range cannot exceed Long range.");
  const construction = magic(row.magic);
  const qualifier = magical(row.magical);
  if (construction && qualifier === false) throw new Error("A Spell Construction cannot be explicitly nonmagical.");
  return {
    schemaVersion: 1, initiativeCost: number(row.initiativeCost, "Attack Initiative"), mode,
    range: { unit: normalizedRange.unit, reach: normalizedRange.reach, short: normalizedRange.short, medium: normalizedRange.medium, long: normalizedRange.long },
    magical: qualifier, onHitEffects: normalizeCreatureEffects(row.onHitEffects), magic: construction,
  };
}

export function normalizeCreatureAbilityAuthoring(input: unknown): CreatureAbilityAuthoring | null {
  if (input == null) return null;
  const row = record(input, "Ability authoring");
  version(row);
  if (row.activationType != null && !DERIVED_ABILITY_ACTIVATION_TYPES.includes(row.activationType as DerivedAbilityActivationType)) throw new Error("Choose a supported Creature Ability Activation Type.");
  if (!CREATURE_RESOLUTION_MODES.includes(row.resolutionMode as CreatureAbilityAuthoring["resolutionMode"])) throw new Error("Choose a supported Creature Ability Resolution Mode.");
  const initiativeCost = number(row.initiativeCost, "Ability Initiative");
  const fixedRollTarget = number(row.fixedRollTarget, "Fixed Roll Target");
  if (fixedRollTarget !== null && fixedRollTarget > 100) throw new Error("Fixed Roll Target cannot exceed 100%.");
  const costs = normalizeDerivedAbilityCosts(list(row.costs, "Resource costs").map((cost, sortOrder) => ({
    costType: cost.costType as DerivedAbilityCostDefinition["costType"], amount: cost.amount as number,
    resourceKey: optionalText(cost.resourceKey), notes: text(cost.notes), sortOrder,
  })));
  if (costs.some((cost) => cost.costType === "initiative")) throw new Error("Use the Ability Initiative field for Initiative costs.");
  if (row.activationType === "passive" && (initiativeCost !== null || costs.length || row.resolutionMode === "fixed-roll" || fixedRollTarget !== null)) throw new Error("Passive traits have no activation costs or activation roll.");
  if (row.resolutionMode === "fixed-roll" && fixedRollTarget === null) throw new Error("Fixed-roll resolution requires a target percentage.");
  const construction = magic(row.magic);
  const qualifier = magical(row.magical);
  if (construction && qualifier === false) throw new Error("A Spell Construction cannot be explicitly nonmagical.");
  return {
    schemaVersion: 1, activationType: row.activationType as DerivedAbilityActivationType ?? null,
    initiativeCost, resolutionMode: row.resolutionMode as CreatureAbilityAuthoring["resolutionMode"], fixedRollTarget,
    targeting: text(row.targeting), costs,
    useConditions: normalizeDerivedAbilityUseConditions(list(row.useConditions, "Use Conditions").map((condition, sortOrder) => ({
      conditionType: condition.conditionType as DerivedAbilityUseConditionDefinition["conditionType"],
      conditionKey: optionalText(condition.conditionKey), operator: condition.operator as DerivedAbilityUseConditionDefinition["operator"] ?? null,
      numericValue: condition.numericValue == null ? null : condition.numericValue as number, textValue: optionalText(condition.textValue), notes: text(condition.notes), sortOrder,
    }))),
    useLimits: normalizeDerivedAbilityUseLimits(list(row.useLimits, "Use Limits").map((limit, sortOrder) => ({
      maximumUses: limit.maximumUses as number, refreshScope: limit.refreshScope as DerivedAbilityUseLimitDefinition["refreshScope"],
      refreshKey: optionalText(limit.refreshKey), notes: text(limit.notes), sortOrder,
    }))),
    magical: qualifier, magic: construction,
  };
}

export function creatureSourceIsMagical(authoring: { magical: boolean | null; magic: CreatureMagicConstruction | null } | null | undefined): boolean {
  return authoring?.magical === true || Boolean(authoring?.magic);
}

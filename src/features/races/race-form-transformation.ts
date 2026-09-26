import type { DerivedAbilityCostDefinition, DerivedAbilityUseConditionDefinition, DerivedAbilityUseLimitDefinition } from "@/features/derived-abilities/models";
import { normalizeDerivedAbilityCosts, normalizeDerivedAbilityUseConditions, normalizeDerivedAbilityUseLimits } from "@/features/derived-abilities/derived-ability-domain";

export const FORM_ENTRY_METHODS = ["voluntary", "involuntary", "either", "custom"] as const;
export const FORM_TIMING_MODES = ["initiative", "time", "instant", "custom"] as const;
export const FORM_DURATION_MODES = ["voluntary-end", "fixed", "condition-end", "scene", "encounter", "persistent", "custom"] as const;
export const FORM_EXIT_METHODS = ["voluntary", "duration-end", "condition-end", "resource-depletion", "action", "custom"] as const;
export type FormTiming = { mode: typeof FORM_TIMING_MODES[number] | null; initiativeCost: number | null; time: string; notes: string };
export type FormCosts = { mode: "unspecified" | "none" | "costs"; costs: DerivedAbilityCostDefinition[] };
/** Definitions only. No evaluator, spending, refresh tracking, or Character state. */
export type RaceFormTransformation = {
  schemaVersion: 1;
  entryMethod: typeof FORM_ENTRY_METHODS[number] | null;
  entryNotes: string;
  entryTiming: FormTiming;
  entryCosts: FormCosts;
  requirements: DerivedAbilityUseConditionDefinition[];
  involuntaryTriggers: DerivedAbilityUseConditionDefinition[];
  duration: { mode: typeof FORM_DURATION_MODES[number] | null; description: string };
  exitMethods: Array<typeof FORM_EXIT_METHODS[number]>;
  exitNotes: string;
  exitTiming: FormTiming;
  exitCosts: FormCosts;
  limitMode: "unspecified" | "unlimited" | "limited" | "custom";
  useLimits: DerivedAbilityUseLimitDefinition[];
  cooldown: string;
  equipmentEntryNotes: string;
  equipmentExitNotes: string;
  notes: string;
};
export function emptyRaceFormTransformation(): RaceFormTransformation {
  const timing = (): FormTiming => ({ mode: null, initiativeCost: null, time: "", notes: "" });
  return { schemaVersion: 1, entryMethod: null, entryNotes: "", entryTiming: timing(), entryCosts: { mode: "unspecified", costs: [] }, requirements: [], involuntaryTriggers: [], duration: { mode: null, description: "" }, exitMethods: [], exitNotes: "", exitTiming: timing(), exitCosts: { mode: "unspecified", costs: [] }, limitMode: "unspecified", useLimits: [], cooldown: "", equipmentEntryNotes: "", equipmentExitNotes: "", notes: "" };
}
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Transformation definitions must be objects.");
  return input as Record<string, unknown>;
}
function list(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new Error("Transformation definitions require ordered lists.");
  return input;
}
function text(input: unknown): string {
  if (typeof input !== "string") throw new Error("Transformation descriptions must be text.");
  return input.trim();
}
function choice<T extends string>(input: unknown, choices: readonly T[]): T {
  if (!choices.includes(input as T)) throw new Error("Choose a supported transformation setting.");
  return input as T;
}
function nullableChoice<T extends string>(input: unknown, choices: readonly T[]): T | null { return input == null ? null : choice(input, choices); }
function timing(input: unknown): FormTiming {
  const row = record(input), mode = nullableChoice(row.mode, FORM_TIMING_MODES);
  const initiativeCost = row.initiativeCost == null ? null : row.initiativeCost;
  if (initiativeCost !== null && (typeof initiativeCost !== "number" || !Number.isFinite(initiativeCost) || initiativeCost <= 0)) throw new Error("Transformation Initiative must be greater than zero. Choose Instant for an explicitly instant change.");
  if (mode === "initiative" && initiativeCost === null) throw new Error("Initiative timing requires an authored Initiative cost.");
  if (mode !== "initiative" && initiativeCost !== null) throw new Error("Choose Initiative timing to author an Initiative cost.");
  const time = text(row.time), notes = text(row.notes);
  if (mode === "time" && !time) throw new Error("Describe the transformation time.");
  if (mode === "custom" && !notes) throw new Error("Describe the custom timing ruling.");
  return { mode, initiativeCost: initiativeCost as number | null, time, notes };
}
function costs(input: unknown): FormCosts {
  const row = record(input), mode = choice(row.mode, ["unspecified", "none", "costs"] as const);
  const costs = normalizeDerivedAbilityCosts(list(row.costs).map((input, sortOrder) => {
    const row = record(input);
    return { costType: row.costType as DerivedAbilityCostDefinition["costType"], amount: row.amount as number, resourceKey: row.resourceKey == null ? null : text(row.resourceKey), notes: text(row.notes), sortOrder };
  }));
  if (costs.some(cost => cost.costType === "initiative")) throw new Error("Author Initiative in the separate entry or exit timing field.");
  if (mode !== "costs" && costs.length) throw new Error("Choose Authored costs to retain resource costs.");
  if (mode === "costs" && !costs.length) throw new Error("Add a resource cost or choose No cost.");
  if (costs.some(cost => cost.costType === "resource" && !cost.resourceKey)) throw new Error("A named resource cost needs its resource name, for example Quintessence.");
  return { mode, costs };
}
function conditions(input: unknown) {
  return normalizeDerivedAbilityUseConditions(list(input).map((input, sortOrder) => {
    const row = record(input);
    return { conditionType: row.conditionType as DerivedAbilityUseConditionDefinition["conditionType"], conditionKey: row.conditionKey == null ? null : text(row.conditionKey), operator: row.operator as DerivedAbilityUseConditionDefinition["operator"] ?? null, numericValue: row.numericValue as number | null ?? null, textValue: row.textValue == null ? null : text(row.textValue), notes: text(row.notes), sortOrder };
  }));
}
export function normalizeRaceFormTransformation(input: unknown): RaceFormTransformation | null {
  if (input == null) return null;
  const row = record(input);
  if (row.schemaVersion !== 1) throw new Error("Unsupported Form transformation version.");
  const duration = record(row.duration);
  const durationMode = nullableChoice(duration.mode, FORM_DURATION_MODES), description = text(duration.description);
  if (["fixed", "condition-end", "custom"].includes(durationMode ?? "") && !description) throw new Error("Describe the Form duration or its ending condition.");
  const limitMode = choice(row.limitMode, ["unspecified", "unlimited", "limited", "custom"] as const);
  const useLimits = normalizeDerivedAbilityUseLimits(list(row.useLimits).map((input, sortOrder) => {
    const row = record(input);
    return { maximumUses: row.maximumUses as number, refreshScope: row.refreshScope as DerivedAbilityUseLimitDefinition["refreshScope"], refreshKey: row.refreshKey == null ? null : text(row.refreshKey), notes: text(row.notes), sortOrder };
  }));
  if (limitMode !== "limited" && useLimits.length) throw new Error("Choose Authored limits to retain use limits.");
  if (limitMode === "limited" && !useLimits.length) throw new Error("Add a use limit or choose Unlimited.");
  return {
    schemaVersion: 1, entryMethod: nullableChoice(row.entryMethod, FORM_ENTRY_METHODS), entryNotes: text(row.entryNotes), entryTiming: timing(row.entryTiming), entryCosts: costs(row.entryCosts), requirements: conditions(row.requirements), involuntaryTriggers: conditions(row.involuntaryTriggers), duration: { mode: durationMode, description },
    exitMethods: [...new Set(list(row.exitMethods).map(method => choice(method, FORM_EXIT_METHODS)))], exitNotes: text(row.exitNotes), exitTiming: timing(row.exitTiming), exitCosts: costs(row.exitCosts), limitMode, useLimits, cooldown: text(row.cooldown), equipmentEntryNotes: text(row.equipmentEntryNotes), equipmentExitNotes: text(row.equipmentExitNotes), notes: text(row.notes),
  };
}

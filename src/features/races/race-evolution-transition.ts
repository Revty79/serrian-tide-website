import { CHARACTER_ATTRIBUTE_KEYS, type CharacterAttributeKey } from "@/features/characters/models";

export type PermanentEvolutionAdjustment = { operation: "add" | "set"; value: number };
export type RaceEvolutionTransition = {
  schemaVersion: 1;
  attributes: Array<PermanentEvolutionAdjustment & { key: CharacterAttributeKey }>;
  hpMultiplierSteps: PermanentEvolutionAdjustment | null;
  baseMovementSteps: PermanentEvolutionAdjustment | null;
  baseMagicSteps: PermanentEvolutionAdjustment | null;
};
export const RACE_EVOLUTION_STEP_FIELDS = ["hpMultiplierSteps", "baseMovementSteps", "baseMagicSteps"] as const;
export type RaceEvolutionIndividualMechanics = {
  attributes: Array<{ attributeKey: string; value: number }>;
  hpMultiplierSteps: number; baseMovementSteps: number; baseMagicSteps: number;
};
export type AppliedRaceEvolutionAdjustments = {
  attributeAdjustments: Partial<Record<CharacterAttributeKey, number>>;
  hpMultiplierStepsAdjustment: number;
  baseMovementStepsAdjustment: number;
  baseMagicStepsAdjustment: number;
};

/** Snapshot actual saved-value differences, including the delta of an authored Set.
 * Historical callers use only the event's own before/after values, never today's path.
 */
export function appliedRaceEvolutionAdjustments(before: RaceEvolutionIndividualMechanics, after: RaceEvolutionIndividualMechanics): AppliedRaceEvolutionAdjustments {
  if (!before || !after || !Array.isArray(before.attributes) || !Array.isArray(after.attributes)) throw new Error("The recorded Race Evolution mechanics are incomplete.");
  for (const state of [before, after]) {
    if (state.attributes.some(row => !row || !Number.isFinite(row.value) || row.value < 0)
      || new Set(state.attributes.map(row => row.attributeKey)).size !== state.attributes.length
      || RACE_EVOLUTION_STEP_FIELDS.some(key => !Number.isSafeInteger(state[key]) || state[key] < 0))
      throw new Error("The recorded Race Evolution mechanics contain invalid values.");
  }
  const attributeAdjustments: AppliedRaceEvolutionAdjustments["attributeAdjustments"] = {};
  for (const key of CHARACTER_ATTRIBUTE_KEYS) {
    const previous = before.attributes.find(row => row.attributeKey === key);
    const next = after.attributes.find(row => row.attributeKey === key);
    if (!previous && !next) continue;
    if (!previous || !next) throw new Error(`Missing recorded ${key} value for permanent Evolution adjustments.`);
    attributeAdjustments[key] = next.value - previous.value;
  }
  return { attributeAdjustments,
    hpMultiplierStepsAdjustment: after.hpMultiplierSteps - before.hpMultiplierSteps,
    baseMovementStepsAdjustment: after.baseMovementSteps - before.baseMovementSteps,
    baseMagicStepsAdjustment: after.baseMagicSteps - before.baseMagicSteps };
}
export function emptyRaceEvolutionTransition(): RaceEvolutionTransition {
  return { schemaVersion: 1, attributes: [], hpMultiplierSteps: null, baseMovementSteps: null, baseMagicSteps: null };
}

/** Remove only the recorded contribution; later individual advancement survives. */
export function removeRaceEvolutionAdjustments(current: RaceEvolutionIndividualMechanics, applied: AppliedRaceEvolutionAdjustments): RaceEvolutionIndividualMechanics {
  const result = structuredClone(current);
  if (!applied || !applied.attributeAdjustments || typeof applied.attributeAdjustments !== "object" || Array.isArray(applied.attributeAdjustments) || Object.keys(applied.attributeAdjustments).some(key => !CHARACTER_ATTRIBUTE_KEYS.includes(key as CharacterAttributeKey)))
    throw new Error("The recorded Evolution Attribute adjustments are invalid.");
  const subtract = (value: number, delta: number, label: string, integer = false) => {
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(delta) || (integer && (!Number.isSafeInteger(value) || !Number.isSafeInteger(delta))))
      throw new Error(`Return requires valid saved and recorded ${label} values.`);
    const next = value - delta;
    if (!Number.isFinite(next) || next < 0 || (integer && !Number.isSafeInteger(next)))
      throw new Error(`Return would leave ${label} at ${next}. It must be nonnegative${integer ? " and a whole number" : ""}; nothing will be clamped.`);
    return next;
  };
  for (const key of CHARACTER_ATTRIBUTE_KEYS) {
    const rows = result.attributes.filter(row => row.attributeKey === key);
    if (rows.length !== 1) throw new Error(`Return requires one saved ${key} value.`);
    rows[0].value = subtract(rows[0].value, Object.hasOwn(applied.attributeAdjustments, key) ? applied.attributeAdjustments[key]! : 0, key);
  }
  for (const key of RACE_EVOLUTION_STEP_FIELDS)
    result[key] = subtract(result[key], applied[`${key}Adjustment`], key, true);
  return result;
}
function adjustment(input: PermanentEvolutionAdjustment, integer: boolean): PermanentEvolutionAdjustment {
  if (!input || !["add", "set"].includes(input.operation) || !Number.isFinite(input.value)
    || (integer && !Number.isSafeInteger(input.value)) || (input.operation === "set" && input.value < 0))
    throw new Error("Permanent adjustments need Add or Set and a finite value. Step values must be whole numbers; Set cannot be negative.");
  if (Object.keys(input).some(key => !["operation", "value", "key"].includes(key))) throw new Error("Unknown permanent adjustment field.");
  return { operation: input.operation, value: input.value };
}
export function normalizeRaceEvolutionTransition(input: RaceEvolutionTransition | null | undefined): RaceEvolutionTransition {
  if (input == null) return emptyRaceEvolutionTransition();
  if (input.schemaVersion !== 1 || !Array.isArray(input.attributes)
    || Object.keys(input).some(key => !["schemaVersion", "attributes", ...RACE_EVOLUTION_STEP_FIELDS].includes(key))) throw new Error("Invalid permanent Race Evolution transition.");
  const seen = new Set<string>();
  const attributes = input.attributes.map(row => {
    if (!row || !CHARACTER_ATTRIBUTE_KEYS.includes(row.key) || seen.has(row.key)) throw new Error("Choose each valid Attribute at most once.");
    seen.add(row.key);
    return { key: row.key, ...adjustment(row, false) };
  }).sort((a, b) => CHARACTER_ATTRIBUTE_KEYS.indexOf(a.key) - CHARACTER_ATTRIBUTE_KEYS.indexOf(b.key));
  return { schemaVersion: 1, attributes,
    hpMultiplierSteps: input.hpMultiplierSteps == null ? null : adjustment(input.hpMultiplierSteps, true),
    baseMovementSteps: input.baseMovementSteps == null ? null : adjustment(input.baseMovementSteps, true),
    baseMagicSteps: input.baseMagicSteps == null ? null : adjustment(input.baseMagicSteps, true) };
}
export function applyRaceEvolutionTransition(input: RaceEvolutionTransition | null, before: RaceEvolutionIndividualMechanics): RaceEvolutionIndividualMechanics {
  const transition = normalizeRaceEvolutionTransition(input), after = structuredClone(before);
  function apply(current: number, rule: PermanentEvolutionAdjustment, label: string) {
    if (!Number.isFinite(current) || current < 0) throw new Error(`Correct the saved ${label} before Evolution.`);
    const result = rule.operation === "add" ? current + rule.value : rule.value;
    if (!Number.isFinite(result) || result < 0) throw new Error(`The authored Evolution would produce an invalid ${label} (${result}). Nothing will be clamped.`);
    return result;
  }
  for (const row of transition.attributes) {
    const target = after.attributes.find(attribute => attribute.attributeKey === row.key);
    if (!target) throw new Error(`Record ${row.key} before applying its Evolution adjustment.`);
    target.value = apply(target.value, row, row.key);
  }
  for (const key of RACE_EVOLUTION_STEP_FIELDS) if (transition[key]) {
    after[key] = apply(before[key], transition[key], key);
    if (!Number.isSafeInteger(after[key])) throw new Error("Evolution must leave permanent steps as valid whole numbers.");
  }
  return after;
}

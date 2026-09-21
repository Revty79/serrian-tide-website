import type { DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";

export type AbilityFact = {
  key: string; label: string; category: "event" | "equipment" | "state";
  source: string; explanation: string;
} & ({ type: "boolean"; value: boolean } | { type: "number"; value: number } | { type: "text"; value: string });
export type AbilityFacts = ReadonlyMap<string, AbilityFact>;
export type AbilityFactDefinition = Pick<AbilityFact, "key" | "label" | "category" | "type"> & { producer: string };

/** Every registered event is produced by an existing, pending response window.
 * A client key, historical log entry or text description is never an event. */
export const ABILITY_EVENT_FACTS: readonly AbilityFactDefinition[] = [
  { key: "combat.action-declared", label: "An action opens a response window", category: "event", type: "boolean", producer: "Action Declaration: pending Responder Opportunity" },
  { key: "combat.attack-declared", label: "An attack opens a response window", category: "event", type: "boolean", producer: "Action Declaration: pending opportunity for a Weapon or Creature Attack" },
  { key: "combat.attack-targeted", label: "An attack targets this combatant", category: "event", type: "boolean", producer: "Action Declaration: pending opportunity and exact locked target membership" },
];
export const ABILITY_FACT_DEFINITIONS: readonly AbilityFactDefinition[] = [
  ...ABILITY_EVENT_FACTS,
  { key: "equipment.armor-worn", label: "Wearing armor", category: "equipment", type: "boolean", producer: "Current Worn armor profiles" },
  { key: "equipment.weapon-wielded", label: "Wielding a weapon", category: "equipment", type: "boolean", producer: "Current Wielded weapon profiles" },
  { key: "state.current-hp", label: "Current total HP", category: "state", type: "number", producer: "Active Health" },
  { key: "state.maximum-hp", label: "Maximum total HP", category: "state", type: "number", producer: "Active Health anatomy" },
  { key: "state.hp-percent", label: "Current HP percentage", category: "state", type: "number", producer: "Active Health total / maximum" },
  { key: "state.initiative", label: "Current Initiative", category: "state", type: "number", producer: "Encounter Initiative participant" },
  { key: "state.round", label: "Current round", category: "state", type: "number", producer: "Encounter Initiative runtime" },
  { key: "state.movement-mode", label: "Current movement mode", category: "state", type: "text", producer: "Stored Encounter Initiative movement mode" },
  { key: "state.dead", label: "Dead", category: "state", type: "boolean", producer: "Authoritative combat condition state" },
  { key: "state.incapacitated", label: "Incapacitated", category: "state", type: "boolean", producer: "Authoritative combat condition state" },
];

export function evaluateAbilityUseCondition(condition: DerivedAbilityUseConditionDefinition, facts: AbilityFacts): "satisfied" | "unsatisfied" | "manual" {
  if (condition.conditionType === "manual" || !condition.conditionKey?.trim()) return "manual";
  const fact = facts.get(condition.conditionKey.trim());
  if (!fact || fact.category !== condition.conditionType) return "manual";
  const result = (value: boolean) => value ? "satisfied" as const : "unsatisfied" as const;
  if (condition.conditionType === "event" && condition.operator == null) return fact.type === "boolean" ? result(fact.value) : "manual";
  const op = condition.operator;
  if (op === "possessed" || op === "not-possessed") return fact.type === "boolean" ? result(op === "possessed" ? fact.value : !fact.value) : "manual";
  const hasNumber = typeof condition.numericValue === "number" && Number.isFinite(condition.numericValue);
  const hasText = condition.textValue != null && condition.textValue !== "";
  if (op === "eq" || op === "neq") {
    if (hasNumber === hasText) return "manual";
    if (hasNumber && fact.type === "number") return result(op === "eq" ? fact.value === condition.numericValue : fact.value !== condition.numericValue);
    if (hasText && fact.type === "text") return result(op === "eq" ? fact.value === condition.textValue : fact.value !== condition.textValue);
    return "manual";
  }
  if (!hasNumber || hasText || fact.type !== "number") return "manual";
  const expected = condition.numericValue!;
  if (op === "gte") return result(fact.value >= expected);
  if (op === "gt") return result(fact.value > expected);
  if (op === "lte") return result(fact.value <= expected);
  if (op === "lt") return result(fact.value < expected);
  return "manual";
}

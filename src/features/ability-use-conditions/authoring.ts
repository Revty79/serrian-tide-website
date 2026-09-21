import type { DerivedAbilityRequirementOperator, DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";
import { ABILITY_FACT_DEFINITIONS, type AbilityFact } from "./facts";

export const ABILITY_CONDITION_OPERATOR_LABELS: Record<DerivedAbilityRequirementOperator, string> = {
  gte: "Greater than or equal to", gt: "Greater than", lte: "Less than or equal to", lt: "Less than",
  eq: "Equal to", neq: "Not equal to", possessed: "Present", "not-possessed": "Not present",
};

/** Presentation metadata only. A recognized key does not manufacture a runtime fact. */
export function abilityConditionFactType(condition: Pick<DerivedAbilityUseConditionDefinition, "conditionType" | "conditionKey">): AbilityFact["type"] | null {
  const key = condition.conditionKey ?? "";
  const known = ABILITY_FACT_DEFINITIONS.find((fact) => fact.category === condition.conditionType && fact.key === key);
  if (known) return known.type;
  if (condition.conditionType === "equipment" && /^equipment\.item:.+:(owned|worn|wielded|equipped)$/.test(key)) return "boolean";
  if (condition.conditionType === "state" && key.startsWith("state.condition:") && key.slice("state.condition:".length).trim()) return "boolean";
  return null;
}

export const ABILITY_COMPARISON_OPERATORS: Record<AbilityFact["type"], readonly DerivedAbilityRequirementOperator[]> = {
  boolean: ["possessed", "not-possessed"], number: ["gte", "gt", "lte", "lt", "eq", "neq"], text: ["eq", "neq"],
};

export const NUMERIC_REQUIREMENT_OPERATORS = ["gte", "gt", "lte", "lt", "eq", "neq"] as const;
export const POSSESSION_REQUIREMENT_OPERATORS = ["possessed", "not-possessed"] as const;

export function nonnegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }
  return value;
}

export function positiveInteger(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return value as number;
}

export function finiteNumber(value: number | null | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

export function absent(value: unknown, label: string): void {
  if (value !== null && value !== undefined) {
    throw new Error(`${label} does not apply to this requirement type.`);
  }
}

export function evaluateNumericComparison(
  currentValue: number | undefined,
  operator: string,
  requiredValue: number,
): RequirementResult {
  if (currentValue === undefined || !Number.isFinite(currentValue)) {
    return "unsatisfied";
  }
  if (operator === "gte") return currentValue >= requiredValue ? "satisfied" : "unsatisfied";
  if (operator === "gt") return currentValue > requiredValue ? "satisfied" : "unsatisfied";
  if (operator === "lte") return currentValue <= requiredValue ? "satisfied" : "unsatisfied";
  if (operator === "lt") return currentValue < requiredValue ? "satisfied" : "unsatisfied";
  if (operator === "eq") return currentValue === requiredValue ? "satisfied" : "unsatisfied";
  if (operator === "neq") return currentValue !== requiredValue ? "satisfied" : "unsatisfied";
  return "unsatisfied";
}

export type RequirementResult = "satisfied" | "unsatisfied" | "manual";

/** AND: a failed automatic prerequisite dominates an unresolved manual one. */
export function allRequirements(results: readonly RequirementResult[]): RequirementResult {
  if (results.includes("unsatisfied")) return "unsatisfied";
  return results.includes("manual") ? "manual" : "satisfied";
}

/** OR: a passing alternative dominates manual review. Empty means unrestricted. */
export function anyRequirementGroup(results: readonly RequirementResult[]): RequirementResult {
  if (!results.length || results.includes("satisfied")) return "satisfied";
  return results.includes("manual") ? "manual" : "unsatisfied";
}

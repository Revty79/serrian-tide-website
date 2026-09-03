import {
  DERIVED_ABILITY_ACQUISITION_TYPES,
  DERIVED_ABILITY_ACTIVATION_TYPES,
  DERIVED_ABILITY_ATTRIBUTE_KEYS,
  DERIVED_ABILITY_COST_TYPES,
  DERIVED_ABILITY_REFRESH_SCOPES,
  DERIVED_ABILITY_REQUIREMENT_OPERATORS,
  DERIVED_ABILITY_REQUIREMENT_SCOPES,
  DERIVED_ABILITY_REQUIREMENT_TYPES,
  DERIVED_ABILITY_USE_CONDITION_TYPES,
  type DerivedAbilityAcquisitionType,
  type DerivedAbilityActivationType,
  type DerivedAbilityAttributeKey,
  type DerivedAbilityCostDefinition,
  type DerivedAbilityCostType,
  type DerivedAbilityRefreshScope,
  type DerivedAbilityRequirementDefinition,
  type DerivedAbilityRequirementOperator,
  type DerivedAbilityRequirementScope,
  type DerivedAbilityRequirementType,
  type DerivedAbilityUseConditionDefinition,
  type DerivedAbilityUseConditionType,
  type DerivedAbilityUseLimitDefinition,
} from "./models";

const NUMERIC_REQUIREMENT_OPERATORS = ["gte", "gt", "lte", "lt", "eq", "neq"] as const;
const POSSESSION_REQUIREMENT_OPERATORS = ["possessed", "not-possessed"] as const;

function includes<const Values extends readonly string[]>(
  values: Values,
  value: string,
): value is Values[number] {
  return values.includes(value as Values[number]);
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function requiredText(value: string | null | undefined, label: string): string {
  const normalized = optionalText(value);
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function nonnegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }
  return value;
}

function positiveInteger(value: number | null | undefined, label: string): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return value as number;
}

function finiteNumber(value: number | null | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function absent(value: unknown, label: string): void {
  if (value !== null && value !== undefined) {
    throw new Error(`${label} does not apply to this requirement type.`);
  }
}

function normalizeOrderedDefinitions<T extends { id?: number; sortOrder: number }>(
  inputs: readonly T[],
  normalize: (input: T) => T,
  label: string,
): T[] {
  const normalized = inputs.map(normalize).sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER),
  );
  const positions = new Set<number>();
  for (const definition of normalized) {
    if (positions.has(definition.sortOrder)) {
      throw new Error(`${label} sort positions must be unique for one Derived Ability.`);
    }
    positions.add(definition.sortOrder);
  }
  return normalized;
}

export function normalizeDerivedAbilityAcquisitionType(
  value: string,
): DerivedAbilityAcquisitionType {
  if (!includes(DERIVED_ABILITY_ACQUISITION_TYPES, value)) {
    throw new Error("Unsupported Derived Ability acquisition type.");
  }
  return value;
}

export function normalizeDerivedAbilityActivationType(
  value: string,
): DerivedAbilityActivationType {
  if (!includes(DERIVED_ABILITY_ACTIVATION_TYPES, value)) {
    throw new Error("Unsupported Derived Ability activation type.");
  }
  return value;
}

export function normalizeDerivedAbilityRequirement(
  input: DerivedAbilityRequirementDefinition,
  owningDerivedAbilityId = input.derivedAbilityId,
): DerivedAbilityRequirementDefinition {
  if (!includes(DERIVED_ABILITY_REQUIREMENT_SCOPES, input.requirementScope)) {
    throw new Error("Unsupported Derived Ability requirement scope.");
  }
  if (!includes(DERIVED_ABILITY_REQUIREMENT_TYPES, input.requirementType)) {
    throw new Error("Unsupported Derived Ability requirement type.");
  }

  const base = {
    ...input,
    groupNumber: nonnegativeInteger(input.groupNumber, "Requirement group number"),
    notes: input.notes.trim(),
    sortOrder: nonnegativeInteger(input.sortOrder, "Requirement sort order"),
  };

  if (input.requirementType === "attribute") {
    if (
      !input.attributeKey ||
      !includes(DERIVED_ABILITY_ATTRIBUTE_KEYS, input.attributeKey)
    ) {
      throw new Error("Attribute requirement must reference STR, DEX, CON, INT, WIS, or CHR.");
    }
    if (!input.operator || !includes(NUMERIC_REQUIREMENT_OPERATORS, input.operator)) {
      throw new Error("Attribute requirement must use a numeric comparison operator.");
    }
    absent(input.skillId, "Skill reference");
    absent(input.requiredDerivedAbilityId, "Derived Ability prerequisite");
    return {
      ...base,
      attributeKey: input.attributeKey as DerivedAbilityAttributeKey,
      skillId: null,
      requiredDerivedAbilityId: null,
      operator: input.operator,
      requiredValue: finiteNumber(input.requiredValue, "Attribute required value"),
    };
  }

  if (input.requirementType === "skill") {
    if (!input.operator || !includes(NUMERIC_REQUIREMENT_OPERATORS, input.operator)) {
      throw new Error("Skill requirement must use a numeric comparison operator.");
    }
    absent(input.attributeKey, "Attribute reference");
    absent(input.requiredDerivedAbilityId, "Derived Ability prerequisite");
    return {
      ...base,
      attributeKey: null,
      skillId: positiveInteger(input.skillId, "Skill reference"),
      requiredDerivedAbilityId: null,
      operator: input.operator,
      requiredValue: finiteNumber(input.requiredValue, "Skill required value"),
    };
  }

  if (input.requirementType === "derived-ability") {
    const requiredDerivedAbilityId = positiveInteger(
      input.requiredDerivedAbilityId,
      "Derived Ability prerequisite",
    );
    if (owningDerivedAbilityId !== undefined && requiredDerivedAbilityId === owningDerivedAbilityId) {
      throw new Error("A Derived Ability cannot require itself.");
    }
    if (!input.operator || !includes(POSSESSION_REQUIREMENT_OPERATORS, input.operator)) {
      throw new Error("Derived Ability prerequisite must use possessed or not-possessed.");
    }
    absent(input.attributeKey, "Attribute reference");
    absent(input.skillId, "Skill reference");
    absent(input.requiredValue, "Numeric threshold");
    return {
      ...base,
      attributeKey: null,
      skillId: null,
      requiredDerivedAbilityId,
      operator: input.operator,
      requiredValue: null,
    };
  }

  absent(input.attributeKey, "Attribute reference");
  absent(input.skillId, "Skill reference");
  absent(input.requiredDerivedAbilityId, "Derived Ability prerequisite");
  absent(input.operator, "Comparison operator");
  absent(input.requiredValue, "Numeric threshold");
  return {
    ...base,
    attributeKey: null,
    skillId: null,
    requiredDerivedAbilityId: null,
    operator: null,
    requiredValue: null,
    notes: requiredText(input.notes, "Manual requirement text"),
  };
}

export type DerivedAbilityRequirementGroup = {
  groupNumber: number;
  operator: "and";
  requirements: DerivedAbilityRequirementDefinition[];
};

export type DerivedAbilityRequirementGroups = {
  operator: "or";
  groups: DerivedAbilityRequirementGroup[];
};

/**
 * Within one scope, requirements in a numbered group are ANDed together,
 * while the numbered groups are OR alternatives. An empty result means that
 * the requested scope places no restriction. Ordering is group, sort, then id.
 */
export function groupDerivedAbilityRequirements(
  requirements: readonly DerivedAbilityRequirementDefinition[],
  scope: DerivedAbilityRequirementScope,
): DerivedAbilityRequirementGroups {
  const normalized = requirements
    .filter((requirement) => requirement.requirementScope === scope)
    .map((requirement) => normalizeDerivedAbilityRequirement(requirement))
    .sort(
      (left, right) =>
        left.groupNumber - right.groupNumber ||
        left.sortOrder - right.sortOrder ||
        (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER),
    );
  const seenPositions = new Set<string>();
  const groups = new Map<number, DerivedAbilityRequirementDefinition[]>();
  for (const requirement of normalized) {
    const position = `${requirement.groupNumber}:${requirement.sortOrder}`;
    if (seenPositions.has(position)) {
      throw new Error("Requirement sort positions must be unique within a scope and group.");
    }
    seenPositions.add(position);
    const group = groups.get(requirement.groupNumber) ?? [];
    group.push(requirement);
    groups.set(requirement.groupNumber, group);
  }
  return {
    operator: "or",
    groups: [...groups].map(([groupNumber, groupedRequirements]) => ({
      groupNumber,
      operator: "and",
      requirements: groupedRequirements,
    })),
  };
}

export function normalizeDerivedAbilityUseCondition(
  input: DerivedAbilityUseConditionDefinition,
): DerivedAbilityUseConditionDefinition {
  if (!includes(DERIVED_ABILITY_USE_CONDITION_TYPES, input.conditionType)) {
    throw new Error("Unsupported Derived Ability use condition type.");
  }
  if (
    input.operator !== null &&
    !includes(DERIVED_ABILITY_REQUIREMENT_OPERATORS, input.operator)
  ) {
    throw new Error("Unsupported Derived Ability use condition operator.");
  }
  if (input.conditionType !== "manual" && !optionalText(input.conditionKey)) {
    throw new Error("A non-manual use condition requires a condition key.");
  }
  if (input.conditionType === "manual" && !optionalText(input.notes)) {
    throw new Error("Manual use condition text is required.");
  }
  return {
    ...input,
    conditionKey: optionalText(input.conditionKey),
    numericValue:
      input.numericValue === null
        ? null
        : finiteNumber(input.numericValue, "Use condition numeric value"),
    textValue: optionalText(input.textValue),
    notes: input.notes.trim(),
    sortOrder: nonnegativeInteger(input.sortOrder, "Use condition sort order"),
  };
}

export function normalizeDerivedAbilityUseConditions(
  inputs: readonly DerivedAbilityUseConditionDefinition[],
): DerivedAbilityUseConditionDefinition[] {
  return normalizeOrderedDefinitions(
    inputs,
    normalizeDerivedAbilityUseCondition,
    "Use condition",
  );
}

export function normalizeDerivedAbilityCost(
  input: DerivedAbilityCostDefinition,
): DerivedAbilityCostDefinition {
  if (!includes(DERIVED_ABILITY_COST_TYPES, input.costType)) {
    throw new Error("Unsupported Derived Ability cost type.");
  }
  const amount = finiteNumber(input.amount, "Derived Ability cost amount");
  if (amount <= 0) {
    throw new Error("Derived Ability cost amount must be greater than zero; use zero rows for no cost.");
  }
  return {
    ...input,
    amount,
    resourceKey: optionalText(input.resourceKey),
    notes: input.notes.trim(),
    sortOrder: nonnegativeInteger(input.sortOrder, "Cost sort order"),
  };
}

export function normalizeDerivedAbilityCosts(
  inputs: readonly DerivedAbilityCostDefinition[],
): DerivedAbilityCostDefinition[] {
  return normalizeOrderedDefinitions(inputs, normalizeDerivedAbilityCost, "Cost");
}

export function normalizeDerivedAbilityUseLimit(
  input: DerivedAbilityUseLimitDefinition,
): DerivedAbilityUseLimitDefinition {
  if (!includes(DERIVED_ABILITY_REFRESH_SCOPES, input.refreshScope)) {
    throw new Error("Unsupported Derived Ability refresh scope.");
  }
  return {
    ...input,
    maximumUses: positiveInteger(input.maximumUses, "Maximum uses"),
    refreshKey: optionalText(input.refreshKey),
    notes: input.notes.trim(),
    sortOrder: nonnegativeInteger(input.sortOrder, "Use limit sort order"),
  };
}

export function normalizeDerivedAbilityUseLimits(
  inputs: readonly DerivedAbilityUseLimitDefinition[],
): DerivedAbilityUseLimitDefinition[] {
  return normalizeOrderedDefinitions(inputs, normalizeDerivedAbilityUseLimit, "Use limit");
}

// Keep these exports visible to callers that build definition forms dynamically.
export type {
  DerivedAbilityAcquisitionType,
  DerivedAbilityActivationType,
  DerivedAbilityCostType,
  DerivedAbilityRefreshScope,
  DerivedAbilityRequirementOperator,
  DerivedAbilityRequirementScope,
  DerivedAbilityRequirementType,
  DerivedAbilityUseConditionType,
};

import type { CampaignSystem } from "@/db/campaign-schema";

import {
  groupDerivedAbilityRequirements,
  normalizeDerivedAbilityRequirement,
} from "./derived-ability-domain";
import {
  DERIVED_ABILITY_ATTRIBUTE_KEYS,
  type DerivedAbilityAcquisitionType,
  type DerivedAbilityActivationType,
  type DerivedAbilityAttributeKey,
  type DerivedAbilityDefinition,
  type DerivedAbilityRequirementDefinition,
  type DerivedAbilityRequirementOperator,
  type DerivedAbilityRequirementResult,
  type DerivedAbilityRequirementScope,
  type DerivedAbilityTriggerDefinition,
} from "./models";

export type DerivedAbilityEvaluationContext = {
  attributes: Partial<Record<DerivedAbilityAttributeKey, number>>;
  skillPoints?: ReadonlyMap<number, number>;
  possessedDerivedAbilityIds?: ReadonlySet<number>;
};

export type DerivedAbilityQueryRow = {
  id: number;
  name: string;
  description: string;
  mechanicalEffect: string;
  acquisitionType: DerivedAbilityAcquisitionType;
  activationType: DerivedAbilityActivationType;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  triggerId: number;
  triggerType: string;
  attributeKey: string | null;
  minimumScore: number | null;
  triggerSortOrder: number;
};

export function groupDerivedAbilityRows(
  rows: readonly DerivedAbilityQueryRow[],
): DerivedAbilityDefinition[] {
  const definitions = new Map<number, DerivedAbilityDefinition>();
  for (const row of rows) {
    const definition = definitions.get(row.id) ?? {
      id: row.id,
      name: row.name,
      description: row.description,
      mechanicalEffect: row.mechanicalEffect,
      acquisitionType: row.acquisitionType,
      activationType: row.activationType,
      sourceSystem: row.sourceSystem,
      sourceExternalId: row.sourceExternalId,
      triggers: [],
      requirements: [],
      useConditions: [],
      costs: [],
      useLimits: [],
    };
    definition.triggers.push({
      id: row.triggerId,
      derivedAbilityId: row.id,
      triggerType: row.triggerType,
      attributeKey: row.attributeKey,
      minimumScore: row.minimumScore,
      sortOrder: row.triggerSortOrder,
    });
    definitions.set(row.id, definition);
  }
  return [...definitions.values()];
}

export function normalizeV1DerivedAbilityTrigger(
  trigger: DerivedAbilityTriggerDefinition,
): DerivedAbilityTriggerDefinition & {
  triggerType: "attribute";
  attributeKey: DerivedAbilityAttributeKey;
  minimumScore: number;
} {
  if (trigger.triggerType !== "attribute") {
    throw new Error("V1 Derived Abilities support only Attribute triggers.");
  }
  if (
    !trigger.attributeKey ||
    !DERIVED_ABILITY_ATTRIBUTE_KEYS.includes(
      trigger.attributeKey as DerivedAbilityAttributeKey,
    )
  ) {
    throw new Error("Derived Ability Attribute must be STR, DEX, CON, INT, WIS, or CHR.");
  }
  if (
    trigger.minimumScore === null ||
    !Number.isInteger(trigger.minimumScore) ||
    trigger.minimumScore < 0
  ) {
    throw new Error("Derived Ability Required Score must be a non-negative whole number.");
  }
  return {
    ...trigger,
    triggerType: "attribute",
    attributeKey: trigger.attributeKey as DerivedAbilityAttributeKey,
    minimumScore: trigger.minimumScore,
  };
}

export function buildV1MirrorRequirement(
  trigger: DerivedAbilityTriggerDefinition,
  derivedAbilityId?: number,
): DerivedAbilityRequirementDefinition {
  const normalized = normalizeV1DerivedAbilityTrigger(trigger);
  return {
    derivedAbilityId,
    requirementScope: "live",
    requirementType: "attribute",
    groupNumber: 0,
    attributeKey: normalized.attributeKey,
    skillId: null,
    requiredDerivedAbilityId: null,
    operator: "gte",
    requiredValue: normalized.minimumScore,
    notes: "",
    sortOrder: normalized.sortOrder,
  };
}

export function isV1MirrorRequirement(
  requirement: {
    requirementScope: string;
    requirementType: string;
    groupNumber: number;
    attributeKey: string | null;
    skillId: number | null;
    requiredDerivedAbilityId: number | null;
    operator: string | null;
    requiredValue: number | null;
    notes: string;
    sortOrder: number;
  },
): boolean {
  return (
    requirement.requirementScope === "live" &&
    requirement.requirementType === "attribute" &&
    requirement.groupNumber === 0 &&
    requirement.attributeKey !== null &&
    DERIVED_ABILITY_ATTRIBUTE_KEYS.includes(
      requirement.attributeKey as DerivedAbilityAttributeKey,
    ) &&
    requirement.skillId === null &&
    requirement.requiredDerivedAbilityId === null &&
    requirement.operator === "gte" &&
    requirement.requiredValue !== null &&
    Number.isInteger(requirement.requiredValue) &&
    requirement.requiredValue >= 0 &&
    requirement.notes.trim() === "" &&
    Number.isInteger(requirement.sortOrder) &&
    requirement.sortOrder >= 0
  );
}

export function canV1EditorSynchronizeRequirements(
  requirements: readonly Parameters<typeof isV1MirrorRequirement>[0][],
  triggers: readonly DerivedAbilityTriggerDefinition[],
): boolean {
  if (triggers.length !== 1 || requirements.length > 1) return false;
  let expectedMirror: DerivedAbilityRequirementDefinition;
  try {
    expectedMirror = buildV1MirrorRequirement(triggers[0]!);
  } catch {
    return false;
  }
  if (requirements.length === 0) return true;
  const existing = requirements[0]!;
  return (
    isV1MirrorRequirement(existing) &&
    existing.requirementScope === expectedMirror.requirementScope &&
    existing.requirementType === expectedMirror.requirementType &&
    existing.groupNumber === expectedMirror.groupNumber &&
    existing.attributeKey === expectedMirror.attributeKey &&
    existing.skillId === expectedMirror.skillId &&
    existing.requiredDerivedAbilityId === expectedMirror.requiredDerivedAbilityId &&
    existing.operator === expectedMirror.operator &&
    existing.requiredValue === expectedMirror.requiredValue &&
    existing.notes === expectedMirror.notes &&
    existing.sortOrder === expectedMirror.sortOrder
  );
}

export function getLegacyTriggerMirrorForDefinition(
  ability: Pick<
    DerivedAbilityDefinition,
    | "acquisitionType"
    | "activationType"
    | "requirements"
    | "useConditions"
    | "costs"
    | "useLimits"
  >,
): DerivedAbilityTriggerDefinition | null {
  if (
    ability.acquisitionType !== "automatic" ||
    ability.activationType !== "passive" ||
    ability.requirements.length !== 1 ||
    ability.useConditions.length > 0 ||
    ability.costs.length > 0 ||
    ability.useLimits.length > 0
  ) {
    return null;
  }
  const requirement = ability.requirements[0]!;
  if (!isV1MirrorRequirement(requirement)) return null;
  return {
    triggerType: "attribute",
    attributeKey: requirement.attributeKey,
    minimumScore: requirement.requiredValue,
    sortOrder: 0,
  };
}

export function evaluateDerivedAbilityTrigger(
  trigger: DerivedAbilityTriggerDefinition,
  context: DerivedAbilityEvaluationContext,
): boolean {
  if (trigger.triggerType !== "attribute") return false;
  const normalized = normalizeV1DerivedAbilityTrigger(trigger);
  const currentValue = context.attributes[normalized.attributeKey];
  return (
    typeof currentValue === "number" &&
    Number.isFinite(currentValue) &&
    currentValue >= normalized.minimumScore
  );
}

function evaluateNumericComparison(
  currentValue: number | undefined,
  operator: DerivedAbilityRequirementOperator,
  requiredValue: number,
): DerivedAbilityRequirementResult {
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

export function evaluateDerivedAbilityRequirement(
  requirement: DerivedAbilityRequirementDefinition,
  context: DerivedAbilityEvaluationContext,
): DerivedAbilityRequirementResult {
  let normalized: DerivedAbilityRequirementDefinition;
  try {
    normalized = normalizeDerivedAbilityRequirement(requirement);
  } catch {
    return "unsatisfied";
  }

  if (normalized.requirementType === "manual") return "manual";
  if (normalized.requirementType === "attribute") {
    return evaluateNumericComparison(
      context.attributes[normalized.attributeKey as DerivedAbilityAttributeKey],
      normalized.operator!,
      normalized.requiredValue!,
    );
  }
  if (normalized.requirementType === "skill") {
    return evaluateNumericComparison(
      context.skillPoints?.get(normalized.skillId!) ?? undefined,
      normalized.operator!,
      normalized.requiredValue!,
    );
  }

  const possessed = context.possessedDerivedAbilityIds?.has(
    normalized.requiredDerivedAbilityId!,
  ) ?? false;
  return (normalized.operator === "possessed") === possessed
    ? "satisfied"
    : "unsatisfied";
}

export function evaluateDerivedAbilityRequirementGroup(
  requirements: readonly DerivedAbilityRequirementDefinition[],
  context: DerivedAbilityEvaluationContext,
): DerivedAbilityRequirementResult {
  const results = requirements.map((requirement) =>
    evaluateDerivedAbilityRequirement(requirement, context),
  );
  if (results.includes("unsatisfied")) return "unsatisfied";
  if (results.includes("manual")) return "manual";
  return "satisfied";
}

export function evaluateDerivedAbilityRequirementScope(
  requirements: readonly DerivedAbilityRequirementDefinition[],
  scope: DerivedAbilityRequirementScope,
  context: DerivedAbilityEvaluationContext,
): DerivedAbilityRequirementResult {
  let groups;
  try {
    groups = groupDerivedAbilityRequirements(requirements, scope).groups;
  } catch {
    return "unsatisfied";
  }
  if (groups.length === 0) return "satisfied";
  const results = groups.map((group) =>
    evaluateDerivedAbilityRequirementGroup(group.requirements, context),
  );
  if (results.includes("satisfied")) return "satisfied";
  if (results.includes("manual")) return "manual";
  return "unsatisfied";
}

export function evaluateDerivedAbilityAcquisitionRequirements(
  ability: Pick<DerivedAbilityDefinition, "requirements">,
  context: DerivedAbilityEvaluationContext,
): DerivedAbilityRequirementResult {
  return evaluateDerivedAbilityRequirementScope(
    ability.requirements,
    "acquisition",
    context,
  );
}

export function evaluateDerivedAbilityLiveRequirements(
  ability: Pick<DerivedAbilityDefinition, "requirements">,
  context: DerivedAbilityEvaluationContext,
): DerivedAbilityRequirementResult {
  return evaluateDerivedAbilityRequirementScope(ability.requirements, "live", context);
}

function evaluateLegacyV1Fallback(
  ability: Pick<DerivedAbilityDefinition, "triggers">,
  context: DerivedAbilityEvaluationContext,
): boolean {
  if (ability.triggers.length !== 1) return false;
  try {
    return evaluateDerivedAbilityTrigger(ability.triggers[0]!, context);
  } catch {
    return false;
  }
}

export function getActiveDerivedAbilities(
  catalog: readonly DerivedAbilityDefinition[],
  context: DerivedAbilityEvaluationContext,
  allowedSystems: readonly CampaignSystem[],
): DerivedAbilityDefinition[] {
  if (!allowedSystems.includes("Derived Abilities")) return [];
  return catalog.filter((ability) => {
    if (ability.acquisitionType !== "automatic") return false;
    if (ability.requirements.length === 0) {
      return ability.triggers.length === 0
        ? true
        : evaluateLegacyV1Fallback(ability, context);
    }
    return evaluateDerivedAbilityLiveRequirements(ability, context) === "satisfied";
  });
}

export function getDerivedAbilityRequirementSummary(
  ability: Pick<DerivedAbilityDefinition, "triggers"> &
    Partial<Pick<DerivedAbilityDefinition, "requirements">>,
  references: {
    skillNames?: ReadonlyMap<number, string>;
    derivedAbilityNames?: ReadonlyMap<number, string>;
  } = {},
): string {
  const requirements = ability.requirements ?? [];
  const summarizeRequirement = (
    requirement: DerivedAbilityRequirementDefinition,
  ): string => {
    if (requirement.requirementType === "manual") {
      return `Manual: ${requirement.notes.trim() || "judgment required"}`;
    }
    if (requirement.requirementType === "derived-ability") {
      const id = requirement.requiredDerivedAbilityId;
      const name = id === null
        ? "ability"
        : references.derivedAbilityNames?.get(id) ?? `Ability ${id}`;
      return requirement.operator === "not-possessed"
        ? `Does not possess ${name}`
        : `Requires ${name}`;
    }
    const value = requirement.requiredValue;
    const operator = requirement.operator;
    const comparison = operator === "gte"
      ? `${value}+`
      : `${({ gt: ">", lte: "≤", lt: "<", eq: "=", neq: "≠" } as const)[
          operator as "gt" | "lte" | "lt" | "eq" | "neq"
        ] ?? operator ?? "?"} ${value}`;
    if (requirement.requirementType === "skill") {
      const id = requirement.skillId;
      const name = id === null
        ? "Skill"
        : references.skillNames?.get(id) ?? `Skill ${id}`;
      return `${name} # ${comparison}`;
    }
    return `${requirement.attributeKey ?? "Attribute"} ${comparison}`;
  };
  const summarizeScope = (scope: DerivedAbilityRequirementScope): string | null => {
    const scoped = requirements
      .filter((requirement) => requirement.requirementScope === scope)
      .sort(
        (left, right) =>
          left.groupNumber - right.groupNumber ||
          left.sortOrder - right.sortOrder ||
          (left.id ?? Number.MAX_SAFE_INTEGER) -
            (right.id ?? Number.MAX_SAFE_INTEGER),
      );
    if (scoped.length === 0) return null;
    const groups = new Map<number, DerivedAbilityRequirementDefinition[]>();
    for (const requirement of scoped) {
      const group = groups.get(requirement.groupNumber) ?? [];
      group.push(requirement);
      groups.set(requirement.groupNumber, group);
    }
    return [...groups.values()].map((group) => {
      const summary = group.map(summarizeRequirement).join(" AND ");
      return group.length > 1 ? `(${summary})` : summary;
    }).join(" OR ");
  };

  const acquisition = summarizeScope("acquisition");
  const live = summarizeScope("live");
  if (acquisition && live) return `Acquire: ${acquisition} · Live: ${live}`;
  if (acquisition) return `Acquire: ${acquisition}`;
  if (live) return live;

  if (ability.triggers.length === 1) {
    const trigger = ability.triggers[0]!;
    if (
      trigger.triggerType === "attribute" &&
      trigger.attributeKey &&
      trigger.minimumScore !== null
    ) {
      return `${trigger.attributeKey} ${trigger.minimumScore}+`;
    }
  }
  return "No requirements";
}

export function getDerivedAbilityRequirementOrigin(
  ability: Pick<DerivedAbilityDefinition, "requirements" | "triggers">,
): "ATTRIBUTE" | "SKILL" | "ABILITY" | "MANUAL" | "MIXED" | "NONE" {
  const types = new Set(ability.requirements.map(({ requirementType }) => requirementType));
  if (types.size === 0) {
    return ability.triggers.length === 1 ? "ATTRIBUTE" : "NONE";
  }
  if (types.size > 1) return "MIXED";
  const [type] = types;
  if (type === "attribute") return "ATTRIBUTE";
  if (type === "skill") return "SKILL";
  if (type === "derived-ability") return "ABILITY";
  return "MANUAL";
}

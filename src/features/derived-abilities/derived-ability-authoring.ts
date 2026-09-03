import {
  normalizeDerivedAbilityAcquisitionType,
  normalizeDerivedAbilityActivationType,
  normalizeDerivedAbilityCost,
  normalizeDerivedAbilityRequirement,
  normalizeDerivedAbilityUseCondition,
  normalizeDerivedAbilityUseLimit,
} from "./derived-ability-domain";
import {
  DERIVED_ABILITY_REQUIREMENT_SCOPES,
  type DerivedAbilityAcquisitionType,
  type DerivedAbilityActivationType,
  type DerivedAbilityCostDefinition,
  type DerivedAbilityDefinition,
  type DerivedAbilityRequirementDefinition,
  type DerivedAbilityRequirementScope,
  type DerivedAbilityTriggerDefinition,
  type DerivedAbilityUseConditionDefinition,
  type DerivedAbilityUseLimitDefinition,
} from "./models";

export type DerivedAbilityCoreDraft = {
  name: string;
  description: string;
  mechanicalEffect: string;
  sourceSystem: string | null;
  sourceExternalId: string | null;
};

export type DerivedAbilityAuthoringDraft = {
  id?: number;
  core: DerivedAbilityCoreDraft;
  acquisitionType: DerivedAbilityAcquisitionType;
  activationType: DerivedAbilityActivationType;
  requirements: DerivedAbilityRequirementDefinition[];
  useConditions: DerivedAbilityUseConditionDefinition[];
  costs: DerivedAbilityCostDefinition[];
  useLimits: DerivedAbilityUseLimitDefinition[];
  legacyTriggers: DerivedAbilityTriggerDefinition[];
};

export type DerivedAbilityAuthoringAggregate = DerivedAbilityAuthoringDraft & {
  id: number;
  createdAt: string;
  updatedAt: string;
  legacyCampaignReferenceCount: number;
};

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeRequirementPositions(
  inputs: readonly DerivedAbilityRequirementDefinition[],
  owningDerivedAbilityId?: number,
): DerivedAbilityRequirementDefinition[] {
  const normalized: DerivedAbilityRequirementDefinition[] = [];
  for (const scope of DERIVED_ABILITY_REQUIREMENT_SCOPES) {
    const scoped = inputs
      .filter((requirement) => requirement.requirementScope === scope)
      .sort(
        (left, right) =>
          left.groupNumber - right.groupNumber ||
          left.sortOrder - right.sortOrder ||
          (left.id ?? Number.MAX_SAFE_INTEGER) -
            (right.id ?? Number.MAX_SAFE_INTEGER),
      );
    const groupNumbers = [...new Set(scoped.map(({ groupNumber }) => groupNumber))]
      .sort((left, right) => left - right);
    for (const [groupNumber, persistedGroupNumber] of groupNumbers.entries()) {
      const group = scoped.filter(
        (requirement) => requirement.groupNumber === persistedGroupNumber,
      );
      for (const [sortOrder, requirement] of group.entries()) {
        normalized.push(normalizeDerivedAbilityRequirement({
          ...requirement,
          derivedAbilityId: owningDerivedAbilityId,
          requirementScope: scope as DerivedAbilityRequirementScope,
          groupNumber,
          sortOrder,
        }, owningDerivedAbilityId));
      }
    }
  }
  if (normalized.length !== inputs.length) {
    throw new Error("Unsupported Derived Ability requirement scope.");
  }
  return normalized;
}

function normalizeOrdered<T extends { id?: number; sortOrder: number }>(
  inputs: readonly T[],
  normalize: (input: T) => T,
): T[] {
  return [...inputs]
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        (left.id ?? Number.MAX_SAFE_INTEGER) -
          (right.id ?? Number.MAX_SAFE_INTEGER),
    )
    .map((input, sortOrder) => normalize({ ...input, sortOrder }));
}

/**
 * The full constructor's authoritative server normalization boundary. Child
 * positions are rebuilt deterministically before the Pass 2 normalizers run.
 */
export function normalizeDerivedAbilityAuthoringDraft(
  input: DerivedAbilityAuthoringDraft,
): DerivedAbilityAuthoringDraft {
  const name = clean(input.core.name);
  if (!name) throw new Error("Derived Ability name is required.");
  if (input.id !== undefined && (!Number.isInteger(input.id) || input.id <= 0)) {
    throw new Error("Derived Ability ID must be a positive whole number.");
  }
  return {
    id: input.id,
    core: {
      name,
      description: clean(input.core.description),
      mechanicalEffect: clean(input.core.mechanicalEffect),
      sourceSystem: clean(input.core.sourceSystem) || null,
      sourceExternalId: clean(input.core.sourceExternalId) || null,
    },
    acquisitionType: normalizeDerivedAbilityAcquisitionType(input.acquisitionType),
    activationType: normalizeDerivedAbilityActivationType(input.activationType),
    requirements: normalizeRequirementPositions(input.requirements, input.id),
    useConditions: normalizeOrdered(
      input.useConditions.map((entry) => ({
        ...entry,
        derivedAbilityId: input.id,
      })),
      normalizeDerivedAbilityUseCondition,
    ),
    costs: normalizeOrdered(
      input.costs.map((entry) => ({
        ...entry,
        derivedAbilityId: input.id,
      })),
      normalizeDerivedAbilityCost,
    ),
    useLimits: normalizeOrdered(
      input.useLimits.map((entry) => ({
        ...entry,
        derivedAbilityId: input.id,
      })),
      normalizeDerivedAbilityUseLimit,
    ),
    legacyTriggers: [...input.legacyTriggers]
      .sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

export function createDefaultDerivedAbilityDraft(): DerivedAbilityAuthoringDraft {
  return {
    core: {
      name: "",
      description: "",
      mechanicalEffect: "",
      sourceSystem: null,
      sourceExternalId: null,
    },
    acquisitionType: "automatic",
    activationType: "passive",
    requirements: [{
      requirementScope: "live",
      requirementType: "attribute",
      groupNumber: 0,
      attributeKey: "STR",
      skillId: null,
      requiredDerivedAbilityId: null,
      operator: "gte",
      requiredValue: 40,
      notes: "",
      sortOrder: 0,
    }],
    useConditions: [],
    costs: [],
    useLimits: [],
    legacyTriggers: [],
  };
}

export function definitionToDerivedAbilityDraft(
  definition: DerivedAbilityDefinition,
): DerivedAbilityAuthoringDraft {
  return {
    id: definition.id,
    core: {
      name: definition.name,
      description: definition.description,
      mechanicalEffect: definition.mechanicalEffect,
      sourceSystem: definition.sourceSystem,
      sourceExternalId: definition.sourceExternalId,
    },
    acquisitionType: definition.acquisitionType,
    activationType: definition.activationType,
    requirements: definition.requirements,
    useConditions: definition.useConditions,
    costs: definition.costs,
    useLimits: definition.useLimits,
    legacyTriggers: definition.triggers,
  };
}

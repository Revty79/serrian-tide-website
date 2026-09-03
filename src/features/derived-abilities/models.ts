export const DERIVED_ABILITY_ATTRIBUTE_KEYS = [
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHR",
] as const;

export type DerivedAbilityAttributeKey =
  (typeof DERIVED_ABILITY_ATTRIBUTE_KEYS)[number];

export const DERIVED_ABILITY_ACQUISITION_TYPES = [
  "automatic",
  "learned",
  "awarded",
] as const;

export type DerivedAbilityAcquisitionType =
  (typeof DERIVED_ABILITY_ACQUISITION_TYPES)[number];

export const DERIVED_ABILITY_ACTIVATION_TYPES = [
  "passive",
  "activated",
  "reaction",
  "triggered",
] as const;

export type DerivedAbilityActivationType =
  (typeof DERIVED_ABILITY_ACTIVATION_TYPES)[number];

export const DERIVED_ABILITY_REQUIREMENT_SCOPES = ["acquisition", "live"] as const;

export type DerivedAbilityRequirementScope =
  (typeof DERIVED_ABILITY_REQUIREMENT_SCOPES)[number];

export const DERIVED_ABILITY_REQUIREMENT_TYPES = [
  "attribute",
  "skill",
  "derived-ability",
  "manual",
] as const;

export type DerivedAbilityRequirementType =
  (typeof DERIVED_ABILITY_REQUIREMENT_TYPES)[number];

export const DERIVED_ABILITY_REQUIREMENT_OPERATORS = [
  "gte",
  "gt",
  "lte",
  "lt",
  "eq",
  "neq",
  "possessed",
  "not-possessed",
] as const;

export type DerivedAbilityRequirementOperator =
  (typeof DERIVED_ABILITY_REQUIREMENT_OPERATORS)[number];

export const DERIVED_ABILITY_USE_CONDITION_TYPES = [
  "equipment",
  "event",
  "state",
  "manual",
] as const;

export type DerivedAbilityUseConditionType =
  (typeof DERIVED_ABILITY_USE_CONDITION_TYPES)[number];

export const DERIVED_ABILITY_COST_TYPES = [
  "initiative",
  "mana",
  "health",
  "ammunition",
  "resource",
  "custom",
] as const;

export type DerivedAbilityCostType =
  (typeof DERIVED_ABILITY_COST_TYPES)[number];

export const DERIVED_ABILITY_REFRESH_SCOPES = [
  "round",
  "encounter",
  "scene",
  "manual",
  "never",
  "event",
] as const;

export type DerivedAbilityRefreshScope =
  (typeof DERIVED_ABILITY_REFRESH_SCOPES)[number];

export const DERIVED_ABILITY_REQUIREMENT_RESULTS = [
  "satisfied",
  "unsatisfied",
  "manual",
] as const;

export type DerivedAbilityRequirementResult =
  (typeof DERIVED_ABILITY_REQUIREMENT_RESULTS)[number];

export type DerivedAbilityTriggerDefinition = {
  id?: number;
  derivedAbilityId?: number;
  triggerType: string;
  attributeKey: string | null;
  minimumScore: number | null;
  sortOrder: number;
};

export type DerivedAbilityRequirementDefinition = {
  id?: number;
  derivedAbilityId?: number;
  requirementScope: DerivedAbilityRequirementScope;
  requirementType: DerivedAbilityRequirementType;
  groupNumber: number;
  attributeKey: string | null;
  skillId: number | null;
  requiredDerivedAbilityId: number | null;
  operator: DerivedAbilityRequirementOperator | null;
  requiredValue: number | null;
  notes: string;
  sortOrder: number;
};

export type DerivedAbilityUseConditionDefinition = {
  id?: number;
  derivedAbilityId?: number;
  conditionType: DerivedAbilityUseConditionType;
  conditionKey: string | null;
  operator: DerivedAbilityRequirementOperator | null;
  numericValue: number | null;
  textValue: string | null;
  notes: string;
  sortOrder: number;
};

export type DerivedAbilityCostDefinition = {
  id?: number;
  derivedAbilityId?: number;
  costType: DerivedAbilityCostType;
  amount: number;
  resourceKey: string | null;
  notes: string;
  sortOrder: number;
};

export type DerivedAbilityUseLimitDefinition = {
  id?: number;
  derivedAbilityId?: number;
  maximumUses: number;
  refreshScope: DerivedAbilityRefreshScope;
  refreshKey: string | null;
  notes: string;
  sortOrder: number;
};

export type DerivedAbilityDefinition = {
  id: number;
  name: string;
  description: string;
  mechanicalEffect: string;
  acquisitionType: DerivedAbilityAcquisitionType;
  activationType: DerivedAbilityActivationType;
  sourceSystem: string | null;
  sourceExternalId: string | null;
  triggers: DerivedAbilityTriggerDefinition[];
  requirements: DerivedAbilityRequirementDefinition[];
  useConditions: DerivedAbilityUseConditionDefinition[];
  costs: DerivedAbilityCostDefinition[];
  useLimits: DerivedAbilityUseLimitDefinition[];
};

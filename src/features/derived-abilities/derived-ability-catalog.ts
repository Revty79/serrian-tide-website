import {
  DERIVED_ABILITY_REQUIREMENT_SCOPES,
  type DerivedAbilityCostDefinition,
  type DerivedAbilityDefinition,
  type DerivedAbilityRequirementDefinition,
  type DerivedAbilityTriggerDefinition,
  type DerivedAbilityUseConditionDefinition,
  type DerivedAbilityUseLimitDefinition,
} from "./models";
import type { MechanicalEffect } from "../mechanical-effects";

export type DerivedAbilityCatalogDefinition = Omit<
  DerivedAbilityDefinition,
  | "triggers"
  | "requirements"
  | "useConditions"
  | "costs"
  | "useLimits"
  | "effects"
>;

type PersistedChild<T extends { derivedAbilityId?: number }> = T & {
  derivedAbilityId: number;
};

export type DerivedAbilityCatalogParts = {
  definitions: readonly DerivedAbilityCatalogDefinition[];
  triggers?: readonly PersistedChild<DerivedAbilityTriggerDefinition>[];
  requirements?: readonly PersistedChild<DerivedAbilityRequirementDefinition>[];
  useConditions?: readonly PersistedChild<DerivedAbilityUseConditionDefinition>[];
  costs?: readonly PersistedChild<DerivedAbilityCostDefinition>[];
  useLimits?: readonly PersistedChild<DerivedAbilityUseLimitDefinition>[];
  effects?: readonly {
    derivedAbilityId: number;
    id?: number;
    sortOrder: number;
    effect: MechanicalEffect;
  }[];
};

function groupByAbility<T extends { derivedAbilityId: number }>(
  rows: readonly T[],
  compare: (left: T, right: T) => number,
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const children = grouped.get(row.derivedAbilityId) ?? [];
    children.push(row);
    grouped.set(row.derivedAbilityId, children);
  }
  for (const children of grouped.values()) children.sort(compare);
  return grouped;
}

function bySortThenId(
  left: { id?: number; sortOrder: number },
  right: { id?: number; sortOrder: number },
): number {
  return (
    left.sortOrder - right.sortOrder ||
    (left.id ?? Number.MAX_SAFE_INTEGER) - (right.id ?? Number.MAX_SAFE_INTEGER)
  );
}

/**
 * Assembles independently queried definitions and child rows without a
 * multiplicative join. Definition order is preserved; every child collection
 * is deterministic and an ability does not need a legacy trigger to exist.
 */
export function assembleDerivedAbilityCatalog({
  definitions,
  triggers = [],
  requirements = [],
  useConditions = [],
  costs = [],
  useLimits = [],
  effects = [],
}: DerivedAbilityCatalogParts): DerivedAbilityDefinition[] {
  const triggerGroups = groupByAbility(triggers, bySortThenId);
  const requirementGroups = groupByAbility(requirements, (left, right) =>
    DERIVED_ABILITY_REQUIREMENT_SCOPES.indexOf(left.requirementScope) -
      DERIVED_ABILITY_REQUIREMENT_SCOPES.indexOf(right.requirementScope) ||
    left.groupNumber - right.groupNumber ||
    bySortThenId(left, right),
  );
  const conditionGroups = groupByAbility(useConditions, bySortThenId);
  const costGroups = groupByAbility(costs, bySortThenId);
  const limitGroups = groupByAbility(useLimits, bySortThenId);
  const effectGroups = groupByAbility(effects, bySortThenId);

  return definitions.map((definition) => ({
    ...definition,
    triggers: triggerGroups.get(definition.id) ?? [],
    requirements: requirementGroups.get(definition.id) ?? [],
    useConditions: conditionGroups.get(definition.id) ?? [],
    costs: costGroups.get(definition.id) ?? [],
    useLimits: limitGroups.get(definition.id) ?? [],
    effects: (effectGroups.get(definition.id) ?? []).map(({ effect }) => effect),
  }));
}

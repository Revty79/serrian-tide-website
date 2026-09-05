import type { CampaignSystem } from "@/db/campaign-schema";

import {
  evaluateDerivedAbilityAcquisitionRequirements,
  evaluateDerivedAbilityLiveAvailability,
  type DerivedAbilityEvaluationContext,
} from "./derived-ability-rules";
import type {
  CharacterDerivedAbilityOwnership,
  CharacterDerivedAbilityStatus,
  DerivedAbilityDefinition,
} from "./models";

export type CharacterDerivedAbilityResolution = {
  statuses: CharacterDerivedAbilityStatus[];
  effectiveDerivedAbilityIds: number[];
  dependencyOrder: number[];
};

function dependenciesFor(ability: DerivedAbilityDefinition): number[] {
  return [...new Set(ability.requirements.flatMap((requirement) =>
    requirement.requirementType === "derived-ability"
      && requirement.requiredDerivedAbilityId !== null
      ? [requirement.requiredDerivedAbilityId]
      : [],
  ))].sort((left, right) => left - right);
}

/**
 * Both possessed and not-possessed references are graph dependencies. The
 * dependency must resolve first so results never depend on database row order.
 */
export function getDerivedAbilityDependencyOrder(
  catalog: readonly DerivedAbilityDefinition[],
): number[] {
  const byId = new Map(catalog.map((ability) => [ability.id, ability]));
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const path: number[] = [];
  const ordered: number[] = [];

  const visit = (abilityId: number) => {
    if (visited.has(abilityId)) return;
    if (visiting.has(abilityId)) {
      const start = path.indexOf(abilityId);
      const cycle = [...path.slice(start), abilityId];
      throw new Error(`Derived Ability prerequisite cycle: ${cycle.join(" -> ")}.`);
    }
    const ability = byId.get(abilityId);
    if (!ability) {
      throw new Error(`Derived Ability prerequisite ${abilityId} is not in the catalog.`);
    }
    visiting.add(abilityId);
    path.push(abilityId);
    for (const dependencyId of dependenciesFor(ability)) visit(dependencyId);
    path.pop();
    visiting.delete(abilityId);
    visited.add(abilityId);
    ordered.push(abilityId);
  };

  for (const abilityId of [...byId.keys()].sort((left, right) => left - right)) {
    visit(abilityId);
  }
  return ordered;
}

export function assertAcyclicDerivedAbilityGraph(
  catalog: readonly DerivedAbilityDefinition[],
): void {
  getDerivedAbilityDependencyOrder(catalog);
}

function activeOwnerships(
  catalog: readonly DerivedAbilityDefinition[],
  ownerships: readonly CharacterDerivedAbilityOwnership[],
): Map<number, CharacterDerivedAbilityOwnership> {
  const definitions = new Map(catalog.map((ability) => [ability.id, ability]));
  const active = new Map<number, CharacterDerivedAbilityOwnership>();
  for (const ownership of ownerships) {
    if (ownership.revokedAt !== null) continue;
    const ability = definitions.get(ownership.derivedAbilityId);
    if (!ability || ability.acquisitionType === "automatic") continue;
    if (ability.acquisitionType !== ownership.acquisitionMethod) continue;
    const existing = active.get(ownership.derivedAbilityId);
    if (!existing || ownership.id < existing.id) {
      active.set(ownership.derivedAbilityId, ownership);
    }
  }
  return active;
}

/**
 * Resolves ownership, acquisition eligibility, live availability, and
 * prerequisite possession in one deterministic graph pass.
 */
export function resolveCharacterDerivedAbilities(input: {
  catalog: readonly DerivedAbilityDefinition[];
  ownerships: readonly CharacterDerivedAbilityOwnership[];
  attributes: DerivedAbilityEvaluationContext["attributes"];
  skillPoints?: ReadonlyMap<number, number>;
  allowedSystems: readonly CampaignSystem[];
}): CharacterDerivedAbilityResolution {
  const dependencyOrder = getDerivedAbilityDependencyOrder(input.catalog);
  const byId = new Map(input.catalog.map((ability) => [ability.id, ability]));
  const ownershipByAbility = activeOwnerships(input.catalog, input.ownerships);
  const possessed = new Set<number>(
    [...ownershipByAbility.keys()].filter((abilityId) => !byId.get(abilityId)?.archived),
  );
  const enabled = input.allowedSystems.includes("Derived Abilities");

  for (const abilityId of dependencyOrder) {
    const ability = byId.get(abilityId)!;
    if (ability.acquisitionType !== "automatic" || !enabled || ability.archived) continue;
    const live = evaluateDerivedAbilityLiveAvailability(ability, {
      attributes: input.attributes,
      skillPoints: input.skillPoints,
      possessedDerivedAbilityIds: possessed,
    });
    if (live === "satisfied") possessed.add(ability.id);
  }

  const statuses = input.catalog.map((ability): CharacterDerivedAbilityStatus => {
    const abilityEnabled = enabled && !ability.archived;
    const ownership = ownershipByAbility.get(ability.id) ?? null;
    const context: DerivedAbilityEvaluationContext = {
      attributes: input.attributes,
      skillPoints: input.skillPoints,
      possessedDerivedAbilityIds: possessed,
    };
    const acquisitionResult = evaluateDerivedAbilityAcquisitionRequirements(
      ability,
      context,
    );
    const liveResult = abilityEnabled
      ? evaluateDerivedAbilityLiveAvailability(ability, context)
      : "unsatisfied";

    if (ability.acquisitionType === "automatic") {
      const available = abilityEnabled && liveResult === "satisfied";
      return {
        abilityId: ability.id,
        status: available
          ? "automatic-active"
          : liveResult === "manual" && abilityEnabled
            ? "automatic-manual-review"
            : "automatic-inactive",
        ownershipId: null,
        acquisitionMethod: null,
        acquisitionResult,
        liveResult,
        possessed: available,
        available,
      };
    }

    if (ownership) {
      const available = abilityEnabled && liveResult === "satisfied";
      return {
        abilityId: ability.id,
        status: available
          ? "owned-available"
          : liveResult === "manual" && abilityEnabled
            ? "owned-manual-review"
            : "owned-unavailable",
        ownershipId: ownership.id,
        acquisitionMethod: ownership.acquisitionMethod,
        acquisitionResult,
        liveResult,
        possessed: !ability.archived,
        available,
      };
    }

    return {
      abilityId: ability.id,
      status: ability.acquisitionType === "awarded"
        ? "awarded-not-owned"
        : acquisitionResult === "satisfied" && abilityEnabled
          ? "eligible-to-learn"
          : acquisitionResult === "manual" && abilityEnabled
            ? "manual-review"
            : "not-eligible",
      ownershipId: null,
      acquisitionMethod: null,
      acquisitionResult,
      liveResult,
      possessed: false,
      available: false,
    };
  });

  return {
    statuses,
    effectiveDerivedAbilityIds: statuses
      .filter(({ possessed }) => possessed)
      .map(({ abilityId }) => abilityId)
      .sort((left, right) => left - right),
    dependencyOrder,
  };
}

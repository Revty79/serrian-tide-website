import {
  planMechanicalEffect,
  type MechanicalEffectApplication,
  type MechanicalEffectHealthContext,
  type MechanicalEffectPlan,
} from "@/features/mechanical-effects";

import { adaptDerivedAbilityToMechanicalEffects } from "./derived-ability-effects";
import type {
  CharacterDerivedAbilityStatus,
  DerivedAbilityCostDefinition,
  DerivedAbilityDefinition,
  DerivedAbilityRequirementResult,
  DerivedAbilityUseConditionDefinition,
  DerivedAbilityUseLimitDefinition,
} from "./models";

export type DerivedAbilityEventContext = {
  eventKey?: string | null;
  sessionId?: number | null;
  sceneId?: number | null;
  encounterId?: number | null;
  roundNumber?: number | null;
  currentInitiative?: number | null;
  equipmentConditions?: ReadonlyMap<string, boolean>;
  stateConditions?: ReadonlyMap<string, boolean>;
  manaPools?: ReadonlyMap<string, { current: number }>;
};

export type DerivedAbilityUseLedgerEntry = {
  id: number;
  characterId: number;
  derivedAbilityId: number;
  ownershipId: number | null;
  sessionId: number | null;
  sceneId: number | null;
  encounterId: number | null;
  roundNumber: number | null;
  eventKey: string | null;
  usedAt: string;
};

export type DerivedAbilityRechargeLedgerEntry = {
  id: number;
  characterId: number;
  derivedAbilityId: number;
  refreshScope: "manual" | "event";
  refreshKey: string | null;
  rechargedAt: string;
};

export type DerivedAbilityConditionPlan = {
  sortOrder: number;
  condition: DerivedAbilityUseConditionDefinition;
  result: DerivedAbilityRequirementResult;
  summary: string;
};

export type DerivedAbilityCostPlan = {
  sortOrder: number;
  cost: DerivedAbilityCostDefinition;
  status: "automatic" | "manual" | "insufficient";
  summary: string;
};

export type DerivedAbilityLimitPlan = {
  sortOrder: number;
  limit: DerivedAbilityUseLimitDefinition;
  status: "available" | "manual" | "exhausted";
  uses: number;
  remaining: number | null;
  summary: string;
};

export type DerivedAbilityEffectPlan = {
  sortOrder: number;
  plan: MechanicalEffectPlan;
  compatibilityFallback: boolean;
};

export const DERIVED_ABILITY_USE_PLAN_STATUSES = [
  "ready",
  "unavailable",
  "needs-selection",
  "manual",
  "exhausted",
  "insufficient-resources",
  "invalid",
] as const;

export type DerivedAbilityUsePlanStatus =
  (typeof DERIVED_ABILITY_USE_PLAN_STATUSES)[number];

export type DerivedAbilityUsePlan = {
  status: DerivedAbilityUsePlanStatus;
  characterId: number;
  abilityId: number;
  abilityName: string;
  possession: boolean;
  available: boolean;
  activationType: DerivedAbilityDefinition["activationType"];
  conditions: DerivedAbilityConditionPlan[];
  costs: DerivedAbilityCostPlan[];
  limits: DerivedAbilityLimitPlan[];
  effects: DerivedAbilityEffectPlan[];
  missingSelections: string[];
  manualSteps: string[];
  issues: string[];
};

export type PlanDerivedAbilityUseInput = {
  characterId: number;
  ability: DerivedAbilityDefinition;
  resolvedStatus: CharacterDerivedAbilityStatus;
  eventContext?: DerivedAbilityEventContext | null;
  uses?: readonly DerivedAbilityUseLedgerEntry[];
  recharges?: readonly DerivedAbilityRechargeLedgerEntry[];
  ownershipAcquiredAt?: string | null;
  effectApplications?: ReadonlyMap<number, MechanicalEffectApplication>;
  healthByCharacterId?: ReadonlyMap<number, MechanicalEffectHealthContext>;
  manualConfirmed?: boolean;
};

function conditionSummary(condition: DerivedAbilityUseConditionDefinition): string {
  const detail = condition.conditionKey ?? condition.textValue ?? condition.notes;
  return `${condition.conditionType}: ${detail || "table ruling required"}`;
}

export function evaluateDerivedAbilityUseCondition(
  condition: DerivedAbilityUseConditionDefinition,
  context: DerivedAbilityEventContext | null | undefined,
): DerivedAbilityRequirementResult {
  if (condition.conditionType === "manual") return "manual";
  const key = condition.conditionKey?.trim();
  if (!key) return "manual";
  if (condition.conditionType === "event") {
    return context?.eventKey === key ? "satisfied" : "unsatisfied";
  }
  const facts = condition.conditionType === "equipment"
    ? context?.equipmentConditions
    : context?.stateConditions;
  if (!facts?.has(key)) return "manual";
  const actual = facts.get(key) === true;
  if (condition.operator === "neq" || condition.operator === "not-possessed") {
    return actual ? "unsatisfied" : "satisfied";
  }
  return actual ? "satisfied" : "unsatisfied";
}

function planCost(
  cost: DerivedAbilityCostDefinition,
  context: DerivedAbilityEventContext | null | undefined,
): DerivedAbilityCostPlan {
  if (cost.costType === "initiative") {
    const current = context?.currentInitiative;
    if (typeof current !== "number" || context?.encounterId == null) {
      return { sortOrder: cost.sortOrder, cost, status: "manual", summary: `${cost.amount} Initiative requires an active encounter context.` };
    }
    return current >= cost.amount
      ? { sortOrder: cost.sortOrder, cost, status: "automatic", summary: `${cost.amount} Initiative is payable.` }
      : { sortOrder: cost.sortOrder, cost, status: "insufficient", summary: `Insufficient Initiative (${current}/${cost.amount}).` };
  }
  if (cost.costType === "mana") {
    const key = cost.resourceKey?.trim();
    const pool = key ? context?.manaPools?.get(key) : undefined;
    if (!key || !pool) {
      return { sortOrder: cost.sortOrder, cost, status: "manual", summary: `${cost.amount} Mana requires a canonical pool selection.` };
    }
    return pool.current >= cost.amount
      ? { sortOrder: cost.sortOrder, cost, status: "automatic", summary: `${cost.amount} ${key} Mana is payable.` }
      : { sortOrder: cost.sortOrder, cost, status: "insufficient", summary: `Insufficient ${key} Mana (${pool.current}/${cost.amount}).` };
  }
  const label = cost.costType === "health"
    ? "Health cost requires an explicit authoritative pool/location."
    : cost.costType === "ammunition"
      ? "Ammunition cost requires table confirmation and a stable owned-item context."
      : `${cost.costType === "custom" ? "Custom" : "Resource"} cost requires table confirmation.`;
  return { sortOrder: cost.sortOrder, cost, status: "manual", summary: label };
}

function after(value: string, boundary: string | null): boolean {
  return boundary === null || new Date(value).getTime() > new Date(boundary).getTime();
}

function planLimit(
  limit: DerivedAbilityUseLimitDefinition,
  uses: readonly DerivedAbilityUseLedgerEntry[],
  recharges: readonly DerivedAbilityRechargeLedgerEntry[],
  context: DerivedAbilityEventContext | null | undefined,
  ownershipAcquiredAt: string | null,
): DerivedAbilityLimitPlan {
  let applicable: readonly DerivedAbilityUseLedgerEntry[] | null = uses;
  if (limit.refreshScope === "round") {
    applicable = context?.encounterId != null && context.roundNumber != null
      ? uses.filter((use) => use.encounterId === context.encounterId && use.roundNumber === context.roundNumber)
      : null;
  } else if (limit.refreshScope === "encounter") {
    applicable = context?.encounterId != null
      ? uses.filter((use) => use.encounterId === context.encounterId)
      : null;
  } else if (limit.refreshScope === "scene") {
    applicable = context?.sceneId != null
      ? uses.filter((use) => use.sceneId === context.sceneId)
      : null;
  } else if (limit.refreshScope === "never") {
    applicable = uses.filter((use) => after(use.usedAt, ownershipAcquiredAt));
  } else {
    const resets = recharges.filter((recharge) =>
      recharge.refreshScope === limit.refreshScope
      && (limit.refreshScope !== "event" || recharge.refreshKey === limit.refreshKey),
    );
    const latest = resets.reduce<string | null>((value, reset) =>
      value === null || new Date(reset.rechargedAt) > new Date(value)
        ? reset.rechargedAt
        : value, null);
    applicable = uses.filter((use) => after(use.usedAt, latest));
  }
  if (applicable === null) {
    return {
      sortOrder: limit.sortOrder,
      limit,
      status: "manual",
      uses: 0,
      remaining: null,
      summary: `${limit.maximumUses} per ${limit.refreshScope} requires matching runtime context.`,
    };
  }
  const count = applicable.length;
  const remaining = Math.max(0, limit.maximumUses - count);
  return {
    sortOrder: limit.sortOrder,
    limit,
    status: remaining === 0 ? "exhausted" : "available",
    uses: count,
    remaining,
    summary: `${remaining}/${limit.maximumUses} uses remain for ${limit.refreshScope}${limit.refreshKey ? ` ${limit.refreshKey}` : ""}.`,
  };
}

export function planDerivedAbilityUse(
  input: PlanDerivedAbilityUseInput,
): DerivedAbilityUsePlan {
  const issues: string[] = [];
  if (!Number.isSafeInteger(input.characterId) || input.characterId <= 0) {
    issues.push("A saved Character is required.");
  }
  if (input.resolvedStatus.abilityId !== input.ability.id) {
    issues.push("Resolved Derived Ability status does not match the requested ability.");
  }

  const conditions = [...input.ability.useConditions]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((condition) => ({
      sortOrder: condition.sortOrder,
      condition,
      result: evaluateDerivedAbilityUseCondition(condition, input.eventContext),
      summary: conditionSummary(condition),
    }));
  let initiativeRemaining = input.eventContext?.currentInitiative ?? null;
  const manaRemaining = new Map(
    [...(input.eventContext?.manaPools ?? new Map())]
      .map(([key, pool]) => [key, pool.current]),
  );
  const costs = [...input.ability.costs]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((cost) => {
      const planned = planCost(cost, input.eventContext);
      if (planned.status !== "automatic") return planned;
      if (cost.costType === "initiative") {
        if (initiativeRemaining === null || initiativeRemaining < cost.amount) {
          return { ...planned, status: "insufficient" as const, summary: `Insufficient Initiative (${initiativeRemaining ?? 0}/${cost.amount}).` };
        }
        initiativeRemaining -= cost.amount;
      }
      if (cost.costType === "mana") {
        const key = cost.resourceKey!;
        const remaining = manaRemaining.get(key) ?? 0;
        if (remaining < cost.amount) {
          return { ...planned, status: "insufficient" as const, summary: `Insufficient ${key} Mana (${remaining}/${cost.amount}).` };
        }
        manaRemaining.set(key, remaining - cost.amount);
      }
      return planned;
    });
  const abilityUses = (input.uses ?? []).filter((use) =>
    use.characterId === input.characterId
    && use.derivedAbilityId === input.ability.id
    && (input.resolvedStatus.ownershipId === null
      ? use.ownershipId === null
      : use.ownershipId === input.resolvedStatus.ownershipId),
  );
  const abilityRecharges = (input.recharges ?? []).filter((recharge) =>
    recharge.characterId === input.characterId
    && recharge.derivedAbilityId === input.ability.id,
  );
  const limits = [...input.ability.useLimits]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((limit) => planLimit(
      limit,
      abilityUses,
      abilityRecharges,
      input.eventContext,
      input.ownershipAcquiredAt ?? null,
    ));
  const adapted = adaptDerivedAbilityToMechanicalEffects(input.ability);
  const currentHealth = new Map(input.healthByCharacterId ?? []);
  const effects: DerivedAbilityEffectPlan[] = [];
  for (const effect of adapted.effects) {
    const application = input.effectApplications?.get(effect.sortOrder) ?? {};
    const targetId = application.targetCharacterId;
    const health = targetId == null ? null : currentHealth.get(targetId) ?? null;
    const plan = planMechanicalEffect({
      effect: effect.definition.effect,
      source: effect.definition.source,
      application,
      health,
    });
    effects.push({
      sortOrder: effect.sortOrder,
      compatibilityFallback: effect.compatibilityFallback,
      plan,
    });
    if (targetId != null && health && plan.healthResult) {
      currentHealth.set(targetId, {
        anatomy: health.anatomy,
        state: plan.healthResult.nextState,
      });
    }
  }
  const missingSelections = effects.flatMap(({ sortOrder, plan }) =>
    plan.missingSelections.map((selection) => `Effect ${sortOrder + 1}: ${selection}`),
  );
  const manualSteps = [
    ...conditions.filter(({ result }) => result === "manual").map(({ summary }) => summary),
    ...costs.filter(({ status }) => status === "manual").map(({ summary }) => summary),
    ...limits.filter(({ status }) => status === "manual").map(({ summary }) => summary),
    ...effects.filter(({ plan }) => plan.status === "manual").map(({ plan }) => plan.summary),
  ];
  issues.push(...effects.flatMap(({ plan }) => plan.issues.map(({ message }) => message)));

  let status: DerivedAbilityUsePlanStatus = "ready";
  if (issues.length > 0) status = "invalid";
  else if (!input.resolvedStatus.possessed || !input.resolvedStatus.available) status = "unavailable";
  else if (input.ability.activationType === "passive") status = "unavailable";
  else if (
    (input.ability.activationType === "reaction" || input.ability.activationType === "triggered")
    && !input.eventContext?.eventKey
  ) status = "unavailable";
  else if (conditions.some(({ result }) => result === "unsatisfied")) status = "unavailable";
  else if (limits.some((limit) => limit.status === "exhausted")) status = "exhausted";
  else if (costs.some((cost) => cost.status === "insufficient")) status = "insufficient-resources";
  else if (missingSelections.length > 0) status = "needs-selection";
  else if (manualSteps.length > 0 && !input.manualConfirmed) status = "manual";

  return {
    status,
    characterId: input.characterId,
    abilityId: input.ability.id,
    abilityName: input.ability.name,
    possession: input.resolvedStatus.possessed,
    available: input.resolvedStatus.available,
    activationType: input.ability.activationType,
    conditions,
    costs,
    limits,
    effects,
    missingSelections,
    manualSteps,
    issues,
  };
}

export type DerivedAbilityOpportunity = {
  ability: DerivedAbilityDefinition;
  plan: DerivedAbilityUsePlan;
};

/** Pure hook for the separate combat-window/runtime integration. */
export function getDerivedAbilityOpportunities(
  character: {
    id: number;
    abilities: readonly DerivedAbilityDefinition[];
    statuses: readonly CharacterDerivedAbilityStatus[];
    uses?: readonly DerivedAbilityUseLedgerEntry[];
    recharges?: readonly DerivedAbilityRechargeLedgerEntry[];
  },
  eventContext: DerivedAbilityEventContext,
): DerivedAbilityOpportunity[] {
  if (!eventContext.eventKey) return [];
  const statuses = new Map(character.statuses.map((status) => [status.abilityId, status]));
  return character.abilities.flatMap((ability) => {
    if (ability.activationType !== "reaction" && ability.activationType !== "triggered") return [];
    const resolvedStatus = statuses.get(ability.id);
    if (!resolvedStatus) return [];
    const plan = planDerivedAbilityUse({
      characterId: character.id,
      ability,
      resolvedStatus,
      uses: character.uses,
      recharges: character.recharges,
      eventContext,
    });
    return plan.status === "unavailable" || plan.status === "invalid"
      ? []
      : [{ ability, plan }];
  }).sort((left, right) =>
    left.ability.name.localeCompare(right.ability.name)
    || left.ability.id - right.ability.id,
  );
}

import {
  type ActiveHealthAnatomy,
  type ActiveHealthState,
  type ActiveHealthView,
} from "@/features/active-state/models";
import { resolveActiveHealthView } from "@/features/active-state/health-rules";
import {
  planMechanicalEffect,
  type MechanicalEffectApplication,
  type MechanicalEffectPlan,
} from "@/features/mechanical-effects";

import {
  adaptCreatureAbilityToMechanicalEffects,
  type CreatureAbilityDefinition,
} from "./creature-ability";

export type CreatureAbilityEffectSelection = {
  poolKey?: string | null;
  hitLocationNumber?: number | null;
};

export type CreatureAbilityUseRequest = {
  sourceCharacterId: number;
  abilityCanonicalId: string;
  targetCharacterIds: number[];
  effectSelections: Record<string, CreatureAbilityEffectSelection>;
  previewFingerprint: string | null;
};

export type CreatureAbilityRuntimeTarget = {
  characterId: number;
  name: string;
  isNpc: boolean;
  npcKind: "race" | "creature";
  anatomy: ActiveHealthAnatomy;
  state: ActiveHealthState;
};

export type CreatureAbilityTargetPreview = Omit<CreatureAbilityRuntimeTarget, "state"> & {
  initialHealth: ActiveHealthView;
  finalHealth: ActiveHealthView;
};

export type PlannedCreatureAbilityApplication = {
  applicationKey: string;
  effectKey: string;
  targetCharacterId: number;
  targetName: string;
  plan: MechanicalEffectPlan;
};

export type PlannedCreatureAbilityManualEffect = {
  effectKey: string;
  title: string;
  description: string;
  compatibilityFallback: boolean;
};

export type CreatureAbilityUsePlanStatus = "ready" | "needs-selection" | "invalid";

export type CreatureAbilityUsePlan = {
  status: CreatureAbilityUsePlanStatus;
  ready: boolean;
  fingerprint: string;
  sourceCreature: { characterId: number; name: string };
  ability: CreatureAbilityDefinition;
  targets: CreatureAbilityTargetPreview[];
  automaticApplications: PlannedCreatureAbilityApplication[];
  manualEffects: PlannedCreatureAbilityManualEffect[];
  issues: string[];
};

export type CreatureAbilityUseResult = {
  success: true;
  sourceCreature: CreatureAbilityUsePlan["sourceCreature"];
  ability: CreatureAbilityDefinition;
  automaticEffects: Array<{
    applicationKey: string;
    effectKey: string;
    targetCharacterId: number;
    targetName: string;
    summary: string;
  }>;
  manualEffects: PlannedCreatureAbilityManualEffect[];
};

export function creatureAbilityApplicationKey(effectKey: string, targetCharacterId: number): string {
  return `${effectKey}:${targetCharacterId}`;
}

export function planCreatureAbilityUse(input: {
  sourceCreature: { characterId: number; name: string };
  ability: CreatureAbilityDefinition;
  fingerprint: string;
  targets: CreatureAbilityRuntimeTarget[];
  targetCharacterIds: readonly number[];
  effectSelections?: Readonly<Record<string, CreatureAbilityEffectSelection>>;
}): CreatureAbilityUsePlan {
  const issues: string[] = [];
  const adaptation = adaptCreatureAbilityToMechanicalEffects(input.ability);
  const duplicateTarget = input.targetCharacterIds.find(
    (targetId, index) => input.targetCharacterIds.indexOf(targetId) !== index,
  );
  if (duplicateTarget !== undefined) issues.push(`Target Character ${duplicateTarget} is duplicated.`);
  if (!adaptation.valid) issues.push(...adaptation.issues);
  const targetById = new Map(input.targets.map((target) => [target.characterId, target]));
  const orderedTargets = input.targetCharacterIds.flatMap((targetId) => {
    const target = targetById.get(targetId);
    if (!target) {
      issues.push(`Target Character ${targetId} is unavailable or unauthorized.`);
      return [];
    }
    return [target];
  });
  const effects = adaptation.valid ? adaptation.effects : [];
  const automaticEffects = effects.filter(({ definition }) => definition.effect.kind !== "manual");
  if (automaticEffects.length > 0 && orderedTargets.length === 0) {
    issues.push("Select at least one affected Campaign entity for this Ability's automatic effects.");
  }

  const currentStates = new Map(
    orderedTargets.map((target) => [target.characterId, structuredClone(target.state)]),
  );
  const automaticApplications: PlannedCreatureAbilityApplication[] = [];
  const manualEffects: PlannedCreatureAbilityManualEffect[] = [];
  let needsSelection = false;

  for (const adapted of effects) {
    const effect = adapted.definition.effect;
    if (effect.kind === "manual") {
      manualEffects.push({
        effectKey: adapted.effectKey,
        title: effect.title,
        description: effect.description,
        compatibilityFallback: adapted.compatibilityFallback,
      });
      continue;
    }
    for (const target of orderedTargets) {
      const applicationKey = creatureAbilityApplicationKey(adapted.effectKey, target.characterId);
      const selection = input.effectSelections?.[applicationKey] ?? {};
      const application: MechanicalEffectApplication = {
        targetCharacterId: target.characterId,
        poolKey: selection.poolKey,
        hitLocationNumber: selection.hitLocationNumber,
      };
      const state = currentStates.get(target.characterId)!;
      const plan = planMechanicalEffect({
        effect,
        source: adaptation.valid ? adaptation.source : null,
        application,
        health: { anatomy: target.anatomy, state },
      });
      if (plan.status === "invalid") {
        issues.push(...plan.issues.map(({ message }) => `${target.name}: ${message}`));
      }
      if (plan.status === "needs-selection") needsSelection = true;
      if (plan.healthResult) currentStates.set(target.characterId, plan.healthResult.nextState);
      automaticApplications.push({
        applicationKey,
        effectKey: adapted.effectKey,
        targetCharacterId: target.characterId,
        targetName: target.name,
        plan,
      });
    }
  }

  const targets = orderedTargets.map((target) => ({
    characterId: target.characterId,
    name: target.name,
    isNpc: target.isNpc,
    npcKind: target.npcKind,
    anatomy: target.anatomy,
    initialHealth: resolveActiveHealthView(target.anatomy, target.state),
    finalHealth: resolveActiveHealthView(
      target.anatomy,
      currentStates.get(target.characterId) ?? target.state,
    ),
  }));
  const invalid = issues.some((issue) => !issue.startsWith("Select at least one affected"));
  const status: CreatureAbilityUsePlanStatus = invalid
    ? "invalid"
    : needsSelection || (automaticEffects.length > 0 && orderedTargets.length === 0)
      ? "needs-selection"
      : "ready";
  return {
    status,
    ready: status === "ready",
    fingerprint: input.fingerprint,
    sourceCreature: input.sourceCreature,
    ability: input.ability,
    targets,
    automaticApplications,
    manualEffects,
    issues,
  };
}

export type CreatureAbilityUseExecutionOperations = {
  loadAndPlan: () => Promise<CreatureAbilityUsePlan>;
  applyAutomaticEffect: (application: PlannedCreatureAbilityApplication) => Promise<void>;
};

export type CreatureAbilityUseTransactionRunner = (
  operation: (
    operations: CreatureAbilityUseExecutionOperations,
  ) => Promise<CreatureAbilityUseResult>,
) => Promise<CreatureAbilityUseResult>;

export async function executeCreatureAbilityUseInTransaction(
  runTransaction: CreatureAbilityUseTransactionRunner,
  confirmed: boolean,
): Promise<CreatureAbilityUseResult> {
  if (!confirmed) throw new Error("Creature Ability use requires explicit confirmation.");
  return runTransaction(async (operations) => {
    const plan = await operations.loadAndPlan();
    if (!plan.ready || plan.status !== "ready") {
      throw new Error(plan.issues[0] ?? "Creature Ability use is not ready.");
    }
    const automaticEffects: CreatureAbilityUseResult["automaticEffects"] = [];
    for (const application of plan.automaticApplications) {
      if (application.plan.status !== "ready") {
        throw new Error(`Creature Ability application ${application.applicationKey} is no longer ready.`);
      }
      await operations.applyAutomaticEffect(application);
      automaticEffects.push({
        applicationKey: application.applicationKey,
        effectKey: application.effectKey,
        targetCharacterId: application.targetCharacterId,
        targetName: application.targetName,
        summary: application.plan.summary,
      });
    }
    return {
      success: true,
      sourceCreature: plan.sourceCreature,
      ability: plan.ability,
      automaticEffects,
      manualEffects: plan.manualEffects,
    };
  });
}

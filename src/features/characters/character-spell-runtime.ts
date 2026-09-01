import type { ActiveManaPool } from "@/features/active-state/active-mana";
import { resolveActiveHealthView } from "@/features/active-state/health-rules";
import type {
  ActiveHealthAnatomy,
  ActiveHealthState,
  ActiveHealthView,
} from "@/features/active-state/models";
import {
  formatMechanicalEffectSummary,
  planMechanicalEffect,
  type MechanicalEffectApplication,
  type MechanicalEffectPlan,
} from "@/features/mechanical-effects";
import type { RawCastingCircumstanceId } from "@/features/spell-construction/data/rawCastingRules";
import { rulesById } from "@/features/spell-construction/data/spellRules";
import { calculateCastingCircumstance } from "@/features/spell-construction/engine/calculateCastingCircumstance";
import { calculatePractitioner } from "@/features/spell-construction/engine/calculatePractitioner";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import {
  hasProgressiveSpellModifier,
  resolveProgressiveSpellForLevel,
} from "@/features/spell-construction/engine/progressiveSpell";
import { validateSpell } from "@/features/spell-construction/engine/validateSpell";
import {
  adaptSpellToMechanicalEffects,
  type AdaptedSpellMechanicalEffect,
} from "@/features/spell-construction/mechanical-effects-adapter";
import type { PractitionerLevel } from "@/features/spell-construction/models/rules";
import type {
  SpellCastingSystem,
  SpellContainer,
  SpellDocument,
} from "@/features/spell-construction/models/spell";

export type SpellCastSourceRequest =
  | { kind: "catalog"; allocationId: number }
  | { kind: "personal"; savedSpellId: number }
  | {
      kind: "raw-saved";
      savedSpellId: number;
      circumstance: RawCastingCircumstanceId;
    }
  | {
      kind: "raw-formula";
      document: unknown;
      circumstance: RawCastingCircumstanceId;
    };

export type LoadedSpellCastSource = {
  kind: SpellCastSourceRequest["kind"];
  identity: string;
  label: string;
  spell: SpellDocument;
  circumstance: RawCastingCircumstanceId;
};

export type SpellCastRuntimeSelections = {
  targetGroups: Record<string, number[]>;
  applications: Record<string, {
    poolKey?: string | null;
    hitLocationNumber?: number | null;
  }>;
};

export type SpellCastRequest = {
  casterCharacterId: number;
  source: SpellCastSourceRequest;
  selections: SpellCastRuntimeSelections;
};

export type SpellCastTargetContext = {
  characterId: number;
  campaignId: number;
  name: string;
  isNpc: boolean;
  npcKind: "race" | "creature";
  anatomy: ActiveHealthAnatomy;
  state: ActiveHealthState;
};

export type SpellCasterContext = {
  characterId: number;
  campaignId: number;
  name: string;
  system: SpellCastingSystem;
  practitionerLevel: PractitionerLevel;
  mana: ActiveManaPool;
};

export type SpellCastPlanStatus =
  | "ready"
  | "needs-selection"
  | "insufficient-mana"
  | "invalid";

export type SpellCastTargetGroup = {
  id: string;
  kind: "target" | "aoe";
  containerPath: readonly string[];
  label: string;
  rangeLabel: string | null;
  shapeLabel: string | null;
  capacity: number | null;
  selfTargeted: boolean;
  automaticEffectIds: string[];
  selectedTargetIds: number[];
  missingSelection: boolean;
};

export type PlannedSpellCastApplication = {
  applicationKey: string;
  spellEffectId: string;
  ruleId: string;
  targetGroupId: string;
  targetCharacterId: number;
  targetName: string;
  order: number;
  plan: MechanicalEffectPlan;
};

export type PlannedSpellAutomaticEffect = {
  spellEffectId: string;
  ruleId: string;
  targetGroupId: string | null;
  summary: string;
};

export type PlannedSpellManualEffect = {
  spellEffectId: string;
  ruleId: string;
  title: string;
  description: string;
};

export type SpellCastTargetResult = {
  characterId: number;
  name: string;
  anatomy: ActiveHealthAnatomy;
  initialHealth: ActiveHealthView;
  finalHealth: ActiveHealthView;
};

export type SpellCastPlan = {
  status: SpellCastPlanStatus;
  ready: boolean;
  source: Omit<LoadedSpellCastSource, "spell">;
  spell: { id: string; name: string; tradition: string };
  caster: Omit<SpellCasterContext, "mana">;
  castingCircumstance: RawCastingCircumstanceId;
  activeProgressiveTier: PractitionerLevel | null;
  currentMana: number;
  maximumMana: number;
  finalManaCost: number;
  manaAfterCast: number;
  finalInitiativeCost: number;
  finalOutOfCombatCastingTimeSeconds: number;
  warnings: string[];
  issues: string[];
  targetGroups: SpellCastTargetGroup[];
  automaticEffects: PlannedSpellAutomaticEffect[];
  automaticApplications: PlannedSpellCastApplication[];
  manualEffects: PlannedSpellManualEffect[];
  targetResults: SpellCastTargetResult[];
};

export type SpellCastAccessSubject = {
  userId: string;
  roles: readonly string[];
};

export type SpellCastAccessEntity = {
  characterId: number;
  campaignId: number;
  playerUserId: string;
  campaignOwnerUserId: string;
  isNpc: boolean;
  npcKind: "race" | "creature";
  isCampaignMember: boolean;
};

export function canInitiateSpellCast(
  subject: SpellCastAccessSubject,
  caster: SpellCastAccessEntity,
): boolean {
  if (
    subject.roles.includes("god") &&
    subject.userId === caster.campaignOwnerUserId
  ) {
    return caster.npcKind !== "creature";
  }
  return (
    subject.roles.includes("player") &&
    !caster.isNpc &&
    caster.isCampaignMember &&
    caster.playerUserId === subject.userId
  );
}

export function canTargetSpellCast(
  subject: SpellCastAccessSubject,
  caster: SpellCastAccessEntity,
  target: SpellCastAccessEntity,
): boolean {
  if (caster.campaignId !== target.campaignId) return false;
  if (
    subject.roles.includes("god") &&
    subject.userId === caster.campaignOwnerUserId &&
    subject.userId === target.campaignOwnerUserId
  ) {
    return true;
  }
  return (
    subject.roles.includes("player") &&
    caster.playerUserId === subject.userId &&
    caster.isCampaignMember &&
    !caster.isNpc &&
    !target.isNpc
  );
}

export function getSpellCastApplicationKey(
  spellEffectId: string,
  targetCharacterId: number,
): string {
  return `${spellEffectId}:${targetCharacterId}`;
}

type ContainerLocation = {
  container: SpellContainer;
  path: string[];
};

function locateContainers(containers: readonly SpellContainer[]): Map<string, ContainerLocation> {
  const locations = new Map<string, ContainerLocation>();
  const visit = (container: SpellContainer, ancestors: readonly string[]) => {
    const path = [...ancestors, container.id];
    locations.set(container.id, { container, path });
    container.children.forEach((child) => visit(child, path));
  };
  containers.forEach((container) => visit(container, []));
  return locations;
}

function targetContainerFor(
  effect: AdaptedSpellMechanicalEffect,
  locations: ReadonlyMap<string, ContainerLocation>,
): ContainerLocation | null {
  for (const containerId of [...effect.containerPath].reverse()) {
    const location = locations.get(containerId);
    if (
      location &&
      (location.container.containerRuleId === "target" ||
        location.container.containerRuleId === "aoe")
    ) {
      return location;
    }
  }
  return null;
}

function targetGroupFor(
  location: ContainerLocation,
  automaticEffectIds: string[],
  casterCharacterId: number,
  selectedTargetIds: readonly number[] | undefined,
): { group: SpellCastTargetGroup; issue: string | null } {
  const { container, path } = location;
  const kind = container.containerRuleId === "aoe" ? "aoe" : "target";
  const selfTargeted = kind === "target" && container.rangeRuleId === "self";
  const capacity = kind === "target"
    ? 1 + Math.max(0, container.multiTarget?.additionalTargets ?? 0)
    : null;
  const supplied = selectedTargetIds ?? [];
  const selected = selfTargeted ? [casterCharacterId] : [...supplied];
  const duplicate = new Set(selected).size !== selected.length;
  let issue: string | null = null;
  if (duplicate) issue = `Target group ${container.id} contains a duplicate Character target.`;
  if (!issue && selfTargeted && supplied.length > 0 && (
    supplied.length !== 1 || supplied[0] !== casterCharacterId
  )) {
    issue = `Self-range target group ${container.id} may only target the caster.`;
  }
  if (!issue && capacity !== null && selected.length > capacity) {
    issue = `Target group ${container.id} allows at most ${capacity} Character target${capacity === 1 ? "" : "s"}.`;
  }
  const rangeRule = container.rangeRuleId
    ? rulesById.ranges.get(container.rangeRuleId)
    : null;
  const shapeRule = container.shape
    ? rulesById.shapes.get(container.shape.ruleId)
    : null;
  return {
    group: {
      id: container.id,
      kind,
      containerPath: path,
      label: `${kind === "aoe" ? "AoE" : "Target"} container`,
      rangeLabel: rangeRule?.name ?? null,
      shapeLabel: shapeRule
        ? `${shapeRule.name}${container.shape && container.shape.quantity > 0
          ? ` +${container.shape.quantity}`
          : ""}`
        : null,
      capacity,
      selfTargeted,
      automaticEffectIds,
      selectedTargetIds: selected,
      missingSelection: selected.length === 0,
    },
    issue,
  };
}

function emptyPlan(input: {
  source: LoadedSpellCastSource;
  caster: SpellCasterContext;
  circumstance: RawCastingCircumstanceId;
  activeTier: PractitionerLevel | null;
  finalManaCost: number;
  finalInitiativeCost: number;
  finalOutOfCombatCastingTimeSeconds: number;
  warnings: string[];
  issues: string[];
}): SpellCastPlan {
  return {
    status: "invalid",
    ready: false,
    source: {
      kind: input.source.kind,
      identity: input.source.identity,
      label: input.source.label,
      circumstance: input.source.circumstance,
    },
    spell: {
      id: input.source.spell.id,
      name: input.source.spell.name,
      tradition: input.source.spell.tradition,
    },
    caster: {
      characterId: input.caster.characterId,
      campaignId: input.caster.campaignId,
      name: input.caster.name,
      system: input.caster.system,
      practitionerLevel: input.caster.practitionerLevel,
    },
    castingCircumstance: input.circumstance,
    activeProgressiveTier: input.activeTier,
    currentMana: input.caster.mana.currentMana,
    maximumMana: input.caster.mana.maximumMana,
    finalManaCost: input.finalManaCost,
    manaAfterCast: Math.max(0, input.caster.mana.currentMana - input.finalManaCost),
    finalInitiativeCost: input.finalInitiativeCost,
    finalOutOfCombatCastingTimeSeconds: input.finalOutOfCombatCastingTimeSeconds,
    warnings: input.warnings,
    issues: input.issues,
    targetGroups: [],
    automaticEffects: [],
    automaticApplications: [],
    manualEffects: [],
    targetResults: [],
  };
}

export function planSpellCast(input: {
  source: LoadedSpellCastSource;
  caster: SpellCasterContext;
  selections?: SpellCastRuntimeSelections;
  targets?: readonly SpellCastTargetContext[];
}): SpellCastPlan {
  const selections = input.selections ?? { targetGroups: {}, applications: {} };
  const progressive = hasProgressiveSpellModifier(input.source.spell)
    ? resolveProgressiveSpellForLevel(
        input.source.spell,
        input.caster.practitionerLevel,
      )
    : null;
  const effectiveSpell = progressive?.resolvedSpell ?? input.source.spell;
  const castingCalculation = progressive?.castingCalculation ?? calculateSpell(effectiveSpell);
  const validationCalculation = progressive?.resolvedConstructionCalculation
    ?? calculateSpell(effectiveSpell);
  const validation = validateSpell(effectiveSpell, undefined, validationCalculation);
  const practitioner = calculatePractitioner(
    castingCalculation,
    input.caster.practitionerLevel,
  ).calculation;
  const finalCast = calculateCastingCircumstance(
    practitioner,
    input.source.circumstance,
  );
  const warnings = validation.issues
    .filter(({ severity }) => severity === "WARNING")
    .map(({ message, explanation }) => `${message}: ${explanation}`);
  const validationErrors = validation.issues
    .filter(({ severity }) => severity === "ERROR")
    .map(({ message, explanation }) => `${message}: ${explanation}`);
  const base = {
    source: input.source,
    caster: input.caster,
    circumstance: input.source.circumstance,
    activeTier: progressive?.level ?? null,
    finalManaCost: finalCast.finalCastingMana,
    finalInitiativeCost: finalCast.finalCombatCastingTime,
    finalOutOfCombatCastingTimeSeconds: finalCast.finalOutOfCombatCastingTimeSeconds,
    warnings,
  };
  if (validationErrors.length) return emptyPlan({ ...base, issues: validationErrors });

  const adaptation = adaptSpellToMechanicalEffects(effectiveSpell);
  if (!adaptation.valid) {
    return emptyPlan({
      ...base,
      issues: adaptation.issues.map(({ message }) => message),
    });
  }

  const automaticEffects = adaptation.effects.filter(
    ({ definition }) => definition.effect.kind !== "manual",
  );
  const manualEffects: PlannedSpellManualEffect[] = adaptation.effects.flatMap((adapted) => {
    const effect = adapted.definition.effect;
    return effect.kind === "manual"
      ? [{
          spellEffectId: adapted.spellEffectId,
          ruleId: adapted.ruleId,
          title: effect.title,
          description: effect.description,
        }]
      : [];
  });
  const locations = locateContainers(effectiveSpell.containers);
  const effectsByGroup = new Map<string, string[]>();
  const groupLocations = new Map<string, ContainerLocation>();
  const issues: string[] = [];
  const groupIdByEffectId = new Map<string, string>();

  for (const effect of automaticEffects) {
    const location = targetContainerFor(effect, locations);
    if (!location) {
      issues.push(
        `${effect.spellEffectId} has no applicable Target or AoE container in its ancestry.`,
      );
      continue;
    }
    const groupId = location.container.id;
    groupIdByEffectId.set(effect.spellEffectId, groupId);
    groupLocations.set(groupId, location);
    effectsByGroup.set(groupId, [
      ...(effectsByGroup.get(groupId) ?? []),
      effect.spellEffectId,
    ]);
  }

  for (const suppliedGroupId of Object.keys(selections.targetGroups)) {
    if (!effectsByGroup.has(suppliedGroupId)) {
      issues.push(`Runtime target selection references unknown target group ${suppliedGroupId}.`);
    }
  }

  const targetGroups: SpellCastTargetGroup[] = [];
  for (const [groupId, effectIds] of effectsByGroup) {
    const location = groupLocations.get(groupId)!;
    const resolved = targetGroupFor(
      location,
      effectIds,
      input.caster.characterId,
      selections.targetGroups[groupId],
    );
    targetGroups.push(resolved.group);
    if (resolved.issue) issues.push(resolved.issue);
  }
  const plannedAutomaticEffects: PlannedSpellAutomaticEffect[] = automaticEffects.map(
    (adapted) => ({
      spellEffectId: adapted.spellEffectId,
      ruleId: adapted.ruleId,
      targetGroupId: groupIdByEffectId.get(adapted.spellEffectId) ?? null,
      summary: formatMechanicalEffectSummary(adapted.definition.effect),
    }),
  );

  const targetsById = new Map((input.targets ?? []).map((target) => [target.characterId, target]));
  const workingStates = new Map<number, ActiveHealthState>();
  const initialStates = new Map<number, ActiveHealthState>();
  const groupsById = new Map(targetGroups.map((group) => [group.id, group]));
  const automaticApplications: PlannedSpellCastApplication[] = [];
  let order = 0;

  for (const adapted of automaticEffects) {
    const groupId = groupIdByEffectId.get(adapted.spellEffectId);
    const group = groupId ? groupsById.get(groupId) : null;
    if (!group || group.missingSelection) continue;
    for (const targetCharacterId of group.selectedTargetIds) {
      const target = targetsById.get(targetCharacterId);
      if (!target) {
        issues.push(
          `Target Character ${targetCharacterId} was not loaded for target group ${group.id}.`,
        );
        continue;
      }
      if (target.campaignId !== input.caster.campaignId) {
        issues.push(`Target Character ${targetCharacterId} is outside the caster's Campaign.`);
        continue;
      }
      const applicationKey = getSpellCastApplicationKey(
        adapted.spellEffectId,
        targetCharacterId,
      );
      const selection = selections.applications[applicationKey] ?? {};
      const application: MechanicalEffectApplication = {
        targetCharacterId,
        poolKey: selection.poolKey,
        hitLocationNumber: selection.hitLocationNumber,
      };
      if (!initialStates.has(targetCharacterId)) {
        initialStates.set(targetCharacterId, target.state);
        workingStates.set(targetCharacterId, target.state);
      }
      const currentState = workingStates.get(targetCharacterId) ?? target.state;
      const plan = planMechanicalEffect({
        effect: adapted.definition.effect,
        source: adapted.definition.source,
        application,
        health: { anatomy: target.anatomy, state: currentState },
      });
      automaticApplications.push({
        applicationKey,
        spellEffectId: adapted.spellEffectId,
        ruleId: adapted.ruleId,
        targetGroupId: group.id,
        targetCharacterId,
        targetName: target.name,
        order,
        plan,
      });
      order += 1;
      if (plan.status === "invalid") {
        issues.push(...plan.issues.map(({ message }) => (
          `${adapted.spellEffectId} on ${target.name}: ${message}`
        )));
      } else if (plan.status === "ready" && plan.healthResult) {
        workingStates.set(targetCharacterId, plan.healthResult.nextState);
      }
    }
  }

  const expectedApplicationKeys = new Set(
    automaticApplications.map(({ applicationKey }) => applicationKey),
  );
  for (const suppliedApplicationKey of Object.keys(selections.applications)) {
    if (!expectedApplicationKeys.has(suppliedApplicationKey)) {
      issues.push(`Runtime application selection ${suppliedApplicationKey} is not part of this cast.`);
    }
  }

  const targetResults: SpellCastTargetResult[] = [];
  for (const [characterId, initialState] of initialStates) {
    const target = targetsById.get(characterId)!;
    targetResults.push({
      characterId,
      name: target.name,
      anatomy: target.anatomy,
      initialHealth: resolveActiveHealthView(target.anatomy, initialState),
      finalHealth: resolveActiveHealthView(
        target.anatomy,
        workingStates.get(characterId) ?? initialState,
      ),
    });
  }

  const missingSelection = targetGroups.some(({ missingSelection }) => missingSelection)
    || automaticApplications.some(({ plan }) => plan.status === "needs-selection");
  const insufficientMana = input.caster.mana.currentMana < finalCast.finalCastingMana;
  const status: SpellCastPlanStatus = issues.length
    ? "invalid"
    : insufficientMana
      ? "insufficient-mana"
      : missingSelection
        ? "needs-selection"
        : "ready";

  return {
    ...emptyPlan({ ...base, issues }),
    status,
    ready: status === "ready",
    issues: insufficientMana && !issues.length
      ? [
          `${input.caster.system} has ${input.caster.mana.currentMana} Current Mana but this cast costs ${finalCast.finalCastingMana}.`,
        ]
      : issues,
    targetGroups,
    automaticEffects: plannedAutomaticEffects,
    automaticApplications,
    manualEffects,
    targetResults,
  };
}

export type SpellCastExecutionResult = {
  success: true;
  spell: SpellCastPlan["spell"];
  caster: SpellCastPlan["caster"];
  source: SpellCastPlan["source"];
  castingCircumstance: RawCastingCircumstanceId;
  finalManaCost: number;
  finalMana: ActiveManaPool;
  automaticEffects: Array<{
    applicationKey: string;
    spellEffectId: string;
    targetCharacterId: number;
    targetName: string;
    summary: string;
  }>;
  manualEffects: PlannedSpellManualEffect[];
  targetResults: SpellCastTargetResult[];
};

export type SpellCastExecutionOperations = {
  loadAndPlan: () => Promise<SpellCastPlan>;
  spendMana: (plan: SpellCastPlan) => Promise<ActiveManaPool>;
  applyAutomaticEffect: (
    application: PlannedSpellCastApplication,
  ) => Promise<void>;
};

export type SpellCastTransactionRunner = (
  operation: (
    operations: SpellCastExecutionOperations,
  ) => Promise<SpellCastExecutionResult>,
) => Promise<SpellCastExecutionResult>;

export async function executeSpellCastInTransaction(
  runTransaction: SpellCastTransactionRunner,
  confirmed: boolean,
): Promise<SpellCastExecutionResult> {
  if (!confirmed) throw new Error("Spell casting requires explicit confirmation.");
  return runTransaction(async (operations) => {
    const plan = await operations.loadAndPlan();
    if (!plan.ready || plan.status !== "ready") {
      throw new Error(plan.issues[0] ?? (
        plan.status === "needs-selection"
          ? "Spell casting is missing one or more required runtime selections."
          : plan.status === "insufficient-mana"
            ? "The caster does not have enough Current Mana."
            : "The Spell cast is invalid."
      ));
    }
    const finalMana = await operations.spendMana(plan);
    const automaticEffects: SpellCastExecutionResult["automaticEffects"] = [];
    for (const application of plan.automaticApplications) {
      if (application.plan.status !== "ready") {
        throw new Error(
          `Automatic Spell application ${application.applicationKey} is no longer ready.`,
        );
      }
      await operations.applyAutomaticEffect(application);
      automaticEffects.push({
        applicationKey: application.applicationKey,
        spellEffectId: application.spellEffectId,
        targetCharacterId: application.targetCharacterId,
        targetName: application.targetName,
        summary: application.plan.summary,
      });
    }
    return {
      success: true,
      spell: plan.spell,
      caster: plan.caster,
      source: plan.source,
      castingCircumstance: plan.castingCircumstance,
      finalManaCost: plan.finalManaCost,
      finalMana,
      automaticEffects,
      manualEffects: plan.manualEffects,
      targetResults: plan.targetResults,
    };
  });
}

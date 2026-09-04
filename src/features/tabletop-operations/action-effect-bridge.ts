import type { MechanicalEffect } from "@/features/mechanical-effects";

import type {
  RollGoverningSourceRequest,
  RollGoverningSourceSnapshot,
  RollMechanicalSnapshot,
} from "./roll-mechanical-snapshot";

export const ACTION_EFFECT_SOURCE_KINDS = [
  "weapon",
  "item",
  "spell",
  "derived-ability",
  "skill",
  "attribute",
  "creature-attack",
  "creature-ability",
  "no-roll",
  "manual",
] as const;

export const ACTION_EFFECT_PLAN_STATUSES = [
  "calculated",
  "requires-god-ruling",
  "approved",
  "applied",
  "partially-applied",
  "declined",
  "cancelled",
  "superseded",
  "application-failed",
] as const;

export const ACTION_EFFECT_STATUSES = [
  "calculated",
  "requires-god-ruling",
  "approved",
  "applied",
  "declined",
  "manual-resolved",
  "application-failed",
] as const;

export type ActionEffectSourceKind = (typeof ACTION_EFFECT_SOURCE_KINDS)[number];
export type ActionEffectPlanStatus = (typeof ACTION_EFFECT_PLAN_STATUSES)[number];
export type ActionEffectStatus = (typeof ACTION_EFFECT_STATUSES)[number];

export type ActionSourceResolutionMode =
  | "automatic-no-roll"
  | "skill-roll"
  | "attribute-roll"
  | "opposed-roll"
  | "manual-god-ruling";

export type FrozenActionResourceCost = Readonly<{
  key: string;
  kind: "mana" | "item-quantity" | "item-charges" | "manual";
  amount: number | null;
  resourceKey: string | null;
  instruction: string;
  applicationSupported: boolean;
}>;

export type FrozenActionAuthoredEffect = Readonly<{
  key: string;
  effect: MechanicalEffect | null;
  instruction: Readonly<Record<string, unknown>>;
  applicationSupported: boolean;
  requiresGodReview: boolean;
  targetParticipantIds: readonly number[];
}>;

export type FrozenActionSourceSnapshot = Readonly<{
  schemaVersion: 1;
  kind: ActionEffectSourceKind;
  identity: string;
  sourceId: number | string | null;
  sourceInstanceId: number | null;
  ownerParticipantId: number;
  displayName: string;
  authoringHref: string | null;
  liveRevision: string | null;
  resolutionMode: ActionSourceResolutionMode;
  governingSource: RollGoverningSourceRequest | null;
  governingSnapshot: RollGoverningSourceSnapshot | null;
  authoredData: Readonly<Record<string, unknown>>;
  resourceCosts: readonly FrozenActionResourceCost[];
  effects: readonly FrozenActionAuthoredEffect[];
  warnings: readonly string[];
}>;

export type ActionEffectProposal = Readonly<{
  effectKey: string;
  effectType: string;
  targetParticipantId: number;
  authoredValue: unknown;
  calculatedValue: unknown;
  finalValue: unknown;
  unit: string;
  resource: string;
  applicationSupported: boolean;
  godReviewRequired: boolean;
  status: ActionEffectStatus;
  amendmentReason: string;
}>;

export type ActionEffectPlanProposal = Readonly<{
  status: Extract<ActionEffectPlanStatus, "calculated" | "requires-god-ruling">;
  effects: readonly ActionEffectProposal[];
  explanation: string;
}>;

export type ActionEffectPlanInput = Readonly<{
  source: FrozenActionSourceSnapshot;
  actorParticipantId: number;
  targetParticipantIds: readonly number[];
  governingRoll: RollMechanicalSnapshot | null;
  defenseResolution: Readonly<Record<string, unknown>> | null;
  initiativeComplete: boolean;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function participantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function requiredText(value: unknown, label: string, maximum = 500): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(`${label} is invalid.`);
  return normalized;
}

function effectType(effect: MechanicalEffect | null): string {
  return effect?.kind ?? "manual";
}

function effectAmount(effect: MechanicalEffect | null): unknown {
  if (!effect) return null;
  if (effect.kind === "health.damage" || effect.kind === "health.heal" || effect.kind === "modifier.apply") {
    return effect.amount;
  }
  return effect;
}

function effectUnit(effect: MechanicalEffect | null): string {
  if (!effect) return "instruction";
  if (effect.kind === "health.damage" || effect.kind === "health.heal") return "Health";
  if (effect.kind === "modifier.apply") return effect.channel;
  if (effect.kind === "condition.apply") return "Condition";
  return "instruction";
}

function defenseDisposition(value: Readonly<Record<string, unknown>> | null): string | null {
  return typeof value?.originalActionDisposition === "string" ? value.originalActionDisposition : null;
}

function actionWasStopped(value: Readonly<Record<string, unknown>> | null): boolean {
  const disposition = defenseDisposition(value);
  if (disposition === "stopped" || disposition === "cancel") return true;
  const objective = isRecord(value?.objective) ? value.objective : null;
  return objective?.attackStopped === true;
}

function defenseNeedsRuling(value: Readonly<Record<string, unknown>> | null): boolean {
  return defenseDisposition(value) === "awaiting-god-ruling";
}

function resolutionNeedsRoll(mode: ActionSourceResolutionMode): boolean {
  return mode === "skill-roll" || mode === "attribute-roll" || mode === "opposed-roll";
}

export function buildActionEffectPlanProposal(input: ActionEffectPlanInput): ActionEffectPlanProposal {
  if (!input.initiativeComplete) {
    throw new Error("Effects cannot be planned before the existing Initiative action reaches completion.");
  }
  participantKey(input.actorParticipantId, "Acting participant");
  if (input.source.ownerParticipantId !== input.actorParticipantId) {
    throw new Error("The frozen action source does not belong to the acting participant.");
  }
  const originalTargets = [...new Set(input.targetParticipantIds.map((id) => participantKey(id, "Target participant")))];
  const allowedTargets = new Set(originalTargets.length ? originalTargets : [input.actorParticipantId]);
  if (resolutionNeedsRoll(input.source.resolutionMode) && !input.governingRoll) {
    throw new Error("The immutable governing Roll is required before effects can be planned.");
  }

  const stopped = actionWasStopped(input.defenseResolution);
  const failedRoll = input.governingRoll?.resolution.succeeded === false;
  const unresolved = input.source.resolutionMode === "manual-god-ruling"
    || input.governingRoll?.resolution.requiresGodRuling === true
    || defenseNeedsRuling(input.defenseResolution);
  const proposals: ActionEffectProposal[] = [];

  for (const authored of input.source.effects) {
    const targets = authored.targetParticipantIds.length
      ? authored.targetParticipantIds
      : originalTargets.length ? originalTargets : [input.actorParticipantId];
    for (const targetParticipantId of targets) {
      participantKey(targetParticipantId, "Authored effect target");
      if (!allowedTargets.has(targetParticipantId)) {
        throw new Error("A frozen authored effect references a participant outside the original target set.");
      }
      const isManual = authored.effect === null || authored.effect.kind === "manual" || !authored.applicationSupported;
      const objectivelyPrevented = stopped || failedRoll;
      const status: ActionEffectStatus = objectivelyPrevented
        ? "declined"
        : isManual || authored.requiresGodReview || unresolved
          ? "requires-god-ruling"
          : "calculated";
      const authoredValue = { effect: authored.effect, instruction: authored.instruction };
      const calculatedValue = objectivelyPrevented ? null : effectAmount(authored.effect);
      proposals.push({
        effectKey: `${authored.key}:target:${targetParticipantId}`,
        effectType: effectType(authored.effect),
        targetParticipantId,
        authoredValue,
        calculatedValue,
        finalValue: objectivelyPrevented ? null : {
          effect: authored.effect,
          application: isRecord(authored.instruction.application) ? authored.instruction.application : {},
        },
        unit: effectUnit(authored.effect),
        resource: "",
        applicationSupported: !objectivelyPrevented && authored.applicationSupported && !isManual,
        godReviewRequired: !objectivelyPrevented && (isManual || authored.requiresGodReview || unresolved),
        status,
        amendmentReason: objectivelyPrevented
          ? stopped ? "The completed defense/intervention stage stopped the originating action." : "The immutable governing Roll failed."
          : "",
      });
    }
  }

  for (const cost of input.source.resourceCosts) {
    const supported = cost.applicationSupported
      && (cost.kind === "mana" || cost.kind === "item-quantity" || cost.kind === "item-charges")
      && cost.amount !== null;
    proposals.push({
      effectKey: `cost:${cost.key}`,
      effectType: `resource.${cost.kind}`,
      targetParticipantId: input.actorParticipantId,
      authoredValue: { amount: cost.amount, resourceKey: cost.resourceKey, instruction: cost.instruction },
      calculatedValue: cost.amount,
      finalValue: { amount: cost.amount, resourceKey: cost.resourceKey },
      unit: cost.kind === "mana" ? "Mana" : "resource",
      resource: cost.resourceKey ?? "",
      applicationSupported: supported,
      godReviewRequired: !supported,
      status: supported ? "calculated" : "requires-god-ruling",
      amendmentReason: "",
    });
  }

  const requiresGod = unresolved || proposals.some(({ status }) => status === "requires-god-ruling");
  const explanation = stopped
    ? "Defense/intervention stopped the action. Authored consequences remain visible but are not applicable."
    : failedRoll
      ? "The governing Roll failed. Authored consequences remain visible but are not applicable."
      : requiresGod
        ? "At least one consequence needs an explicit G.O.D. ruling or manual resolution."
        : proposals.length
          ? "Every proposal is derived from the frozen authored source and completed Roll/defense state."
          : "The exact source contains no structured executable consequence. No outcome was invented.";
  return { status: requiresGod ? "requires-god-ruling" : "calculated", effects: proposals, explanation };
}

export function assertFrozenActionSourceSnapshot(value: unknown): FrozenActionSourceSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1 || !ACTION_EFFECT_SOURCE_KINDS.includes(value.kind as ActionEffectSourceKind)) {
    throw new Error("The frozen authored action source snapshot is invalid.");
  }
  const ownerParticipantId = participantKey(Number(value.ownerParticipantId), "Frozen source owner");
  const identity = requiredText(value.identity, "Frozen source identity");
  const displayName = requiredText(value.displayName, "Frozen source display name");
  if (!Array.isArray(value.effects) || !Array.isArray(value.resourceCosts) || !Array.isArray(value.warnings) || !isRecord(value.authoredData)) {
    throw new Error("The frozen authored action source payload is invalid.");
  }
  return {
    ...(value as unknown as FrozenActionSourceSnapshot),
    identity,
    displayName,
    ownerParticipantId,
  };
}

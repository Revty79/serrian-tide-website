import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { db } from "@/db";
import { campaignCharacter, campaignCharacterItem } from "@/db/realm-schema";
import {
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterEffect,
  campaignSessionEncounterEffectPlan,
  campaignSessionEncounterEffectPlanEvent,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionEncounterResponderOpportunity,
  campaignSessionRoll,
} from "@/db/tabletop-operations-schema";
import { isCharacterMagicSystem } from "@/features/active-state/active-mana";
import { spendActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { lockActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { persistPlannedMechanicalEffectInTransaction } from "@/features/active-state/mechanical-effect-service";
import {
  planMechanicalEffect,
  type MechanicalEffect,
  type MechanicalEffectApplication,
  validateMechanicalEffect,
} from "@/features/mechanical-effects";
import {
  assertConsumableHasInactiveQuantityInTransaction,
  lockEquipmentStateCharacterInTransaction,
  reconcileItemPassiveEffectsInTransaction,
} from "@/features/items/equipment-state-service";
import {
  readItemChargeStateInTransaction,
  spendItemChargesInTransaction,
} from "@/features/items/item-charge-service";

import {
  assertFrozenActionSourceSnapshot,
  buildActionEffectPlanProposal,
  type ActionEffectPlanStatus,
  type ActionEffectSourceKind,
  type ActionEffectStatus,
  type FrozenActionSourceSnapshot,
} from "./action-effect-bridge";
import {
  parseActionDeclarationDraft,
  parseLockedActionDeclarationSnapshot,
} from "./action-declaration";
import {
  resolveActionDeclarationInTransaction,
  type ActionDeclarationActor,
} from "./action-declaration-service";
import { resolveLockedActionSourceInTransaction } from "./action-source-resolver-service";
import { bindPersistedEffectDurationInTransaction } from "./duration-lifecycle-service";
import {
  readEffectiveRollSnapshotInTransaction,
  type AuthorizedRollActor,
} from "./roll-runtime-service";
import type { RollMechanicalSnapshot } from "./roll-mechanical-snapshot";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";

export type ActionEffectPlanTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type GodActionEffectActor = Extract<ActionDeclarationActor, { authority: "god-owner" }>;

export type ActionEffectRowView = Readonly<{
  id: number;
  targetParticipantId: number;
  targetName: string;
  effectKey: string;
  effectType: string;
  authoredValue: unknown;
  calculatedValue: unknown;
  finalValue: unknown;
  unit: string;
  resource: string;
  applicationSupported: boolean;
  godReviewRequired: boolean;
  status: ActionEffectStatus;
  amendmentReason: string;
  appliedResult: unknown;
  appliedAt: string | null;
}>;

export type ActionEffectPlanView = Readonly<{
  id: number;
  declarationId: number;
  pendingActionId: number;
  actorParticipantId: number;
  sourceKind: ActionEffectSourceKind;
  sourceIdentity: string;
  actorName: string;
  status: ActionEffectPlanStatus;
  targetSnapshot: readonly Readonly<{ participantId: number; kind: string; name: string | null }>[];
  sourceSnapshot: FrozenActionSourceSnapshot;
  governingRollSnapshot: RollMechanicalSnapshot | null;
  defenseResolution: unknown;
  initiativeCommitment: unknown;
  resourceCosts: unknown;
  sourceDivergence: unknown;
  explanation: string;
  createdByUserId: string;
  reviewedByUserId: string | null;
  appliedByUserId: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  effects: readonly ActionEffectRowView[];
  events: readonly Readonly<{
    id: number;
    fromStatus: ActionEffectPlanStatus | null;
    toStatus: ActionEffectPlanStatus;
    eventKind: string;
    reason: string;
    metadata: unknown;
    actorUserId: string;
    createdAt: string;
  }>[];
}>;

export type ActionEffectWorkspaceView = Readonly<{
  plans: readonly ActionEffectPlanView[];
  eligibleDeclarations: readonly Readonly<{
    id: number;
    label: string;
    actorParticipantId: number;
    actorName: string;
    sourceKind: string;
    status: string;
    timingStatus: string;
  }>[];
  participants: readonly Readonly<{ id: number; name: string; kind: string }>[];
}>;

type LoadedPlan = typeof campaignSessionEncounterEffectPlan.$inferSelect;
type LoadedEffect = typeof campaignSessionEncounterEffect.$inferSelect;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function participantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function boundedReason(value: string, label: string, required = true): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > 1000) throw new Error(`${label} must be 1000 characters or fewer.`);
  return normalized;
}

function assertGod(context: OwnedEncounterRuntimeContext, actor: GodActionEffectActor): void {
  if (actor.authority !== "god-owner" || actor.userId !== context.ownerUserId) {
    throw new Error("Only the Campaign-owning G.O.D. may govern Action Effect Plans.");
  }
}

function rollActor(context: OwnedEncounterRuntimeContext, actor: GodActionEffectActor): AuthorizedRollActor {
  return {
    userId: actor.userId,
    campaignId: context.campaignId,
    readAs: "god-owner",
    canRecordGodOnly: true,
    characterId: null,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function recordEvent(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  planId: number,
  fromStatus: ActionEffectPlanStatus | null,
  toStatus: ActionEffectPlanStatus,
  eventKind: string,
  actorUserId: string,
  reason = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(campaignSessionEncounterEffectPlanEvent).values({
    planId,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    fromStatus,
    toStatus,
    eventKind,
    reason,
    metadata,
    actorUserId,
  });
}

async function lockPlan(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  planId: number,
): Promise<LoadedPlan> {
  const [row] = await tx.select().from(campaignSessionEncounterEffectPlan).where(and(
    eq(campaignSessionEncounterEffectPlan.id, positiveId(planId, "Action Effect Plan")),
    eq(campaignSessionEncounterEffectPlan.encounterId, context.encounterId),
    eq(campaignSessionEncounterEffectPlan.sceneId, context.sceneId),
    eq(campaignSessionEncounterEffectPlan.sessionId, context.sessionId),
    eq(campaignSessionEncounterEffectPlan.campaignId, context.campaignId),
  )).limit(1).for("update");
  if (!row) throw new Error("That Action Effect Plan does not belong to the selected Encounter.");
  return row;
}

async function lockEffect(
  tx: ActionEffectPlanTransaction,
  plan: LoadedPlan,
  effectId: number,
): Promise<LoadedEffect> {
  const [row] = await tx.select().from(campaignSessionEncounterEffect).where(and(
    eq(campaignSessionEncounterEffect.id, positiveId(effectId, "Action Effect")),
    eq(campaignSessionEncounterEffect.planId, plan.id),
    eq(campaignSessionEncounterEffect.encounterId, plan.encounterId),
  )).limit(1).for("update");
  if (!row) throw new Error("That effect does not belong to this Action Effect Plan.");
  return row;
}

async function effectiveActionRoll(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  pendingActionId: number,
): Promise<RollMechanicalSnapshot | null> {
  const rows = await tx.select({ id: campaignSessionRoll.id })
    .from(campaignSessionRoll)
    .where(and(
      eq(campaignSessionRoll.encounterId, context.encounterId),
      eq(campaignSessionRoll.pendingActionId, pendingActionId),
    ))
    .orderBy(desc(campaignSessionRoll.id));
  const effective: RollMechanicalSnapshot[] = [];
  for (const row of rows) {
    const result = await readEffectiveRollSnapshotInTransaction(tx, rollActor(context, actor), row.id);
    if (result.status === "recorded" && result.reactionId === null && result.mechanicalSnapshot) {
      effective.push(result.mechanicalSnapshot);
    }
  }
  if (effective.length > 1) throw new Error("More than one effective governing Roll is linked to this action; a G.O.D. must resolve the Roll history first.");
  return effective[0] ?? null;
}

function sourceNeedsRoll(source: FrozenActionSourceSnapshot): boolean {
  return source.resolutionMode === "skill-roll"
    || source.resolutionMode === "attribute-roll"
    || source.resolutionMode === "opposed-roll";
}

async function currentSourceDivergence(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  declarationId: number,
  draftJson: unknown,
  frozen: FrozenActionSourceSnapshot,
  weapon: ReturnType<typeof parseLockedActionDeclarationSnapshot>["weapon"],
  governing: ReturnType<typeof parseLockedActionDeclarationSnapshot>["governing"],
): Promise<Record<string, unknown> | null> {
  try {
    const current = await resolveLockedActionSourceInTransaction(
      tx,
      context,
      actor,
      declarationId,
      parseActionDeclarationDraft(draftJson),
      { weapon, governing },
    );
    if (sameJson(current.snapshot, frozen)) return null;
    return {
      status: "changed",
      frozenIdentity: frozen.identity,
      currentIdentity: current.snapshot.identity,
      frozenRevision: frozen.liveRevision,
      currentRevision: current.snapshot.liveRevision,
      currentSourceSnapshot: current.snapshot,
    };
  } catch (error) {
    return {
      status: "unavailable",
      frozenIdentity: frozen.identity,
      message: error instanceof Error ? error.message : "Current source could not be resolved.",
    };
  }
}

export async function generateActionEffectPlanInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  declarationIdInput: number,
): Promise<number> {
  assertGod(context, actor);
  const declarationId = positiveId(declarationIdInput, "Action declaration");
  const [declaration] = await tx.select().from(campaignSessionEncounterActionDeclaration).where(and(
    eq(campaignSessionEncounterActionDeclaration.id, declarationId),
    eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
    eq(campaignSessionEncounterActionDeclaration.sceneId, context.sceneId),
    eq(campaignSessionEncounterActionDeclaration.sessionId, context.sessionId),
    eq(campaignSessionEncounterActionDeclaration.campaignId, context.campaignId),
  )).limit(1).for("update");
  if (!declaration) throw new Error("That Action declaration does not belong to the selected Encounter.");
  const [existing] = await tx.select({ id: campaignSessionEncounterEffectPlan.id })
    .from(campaignSessionEncounterEffectPlan)
    .where(eq(campaignSessionEncounterEffectPlan.declarationId, declaration.id))
    .limit(1);
  if (existing) return existing.id;
  if (declaration.status === "cancelled" || declaration.status === "abandoned" || declaration.status === "interrupted") {
    throw new Error("A cancelled, abandoned, or interrupted declaration cannot generate consequences.");
  }
  if (declaration.pendingActionId === null || declaration.lockedSnapshotJson === null) {
    throw new Error("The declaration must be locked and committed before consequences can be generated.");
  }
  const locked = parseLockedActionDeclarationSnapshot(declaration.lockedSnapshotJson);
  const source = assertFrozenActionSourceSnapshot(locked.authoredSource);
  const [pending] = await tx.select().from(campaignSessionEncounterPendingAction).where(and(
    eq(campaignSessionEncounterPendingAction.id, declaration.pendingActionId),
    eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!pending || pending.status !== "completed" || pending.remainingInitiativeCost !== 0) {
    throw new Error("Consequences cannot be generated until the existing Initiative action is complete.");
  }
  const opportunities = await tx.select({
    status: campaignSessionEncounterResponderOpportunity.status,
    reactionId: campaignSessionEncounterResponderOpportunity.reactionId,
  }).from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, declaration.id));
  if (opportunities.some(({ status }) => status === "pending")) {
    throw new Error("Every response opportunity must be reconciled before consequences are generated.");
  }
  const reactionIds = opportunities.flatMap(({ reactionId }) => reactionId === null ? [] : [reactionId]);
  if (reactionIds.length) {
    const reactions = await tx.select({ status: campaignSessionEncounterReaction.status })
      .from(campaignSessionEncounterReaction)
      .where(inArray(campaignSessionEncounterReaction.id, reactionIds));
    if (reactions.some(({ status }) => status === "declared" || status === "needs-ruling")) {
      throw new Error("Every declared response must be resolved and reconciled before consequences are generated.");
    }
  }
  if ((source.kind === "weapon" || source.kind === "creature-attack") && declaration.defenseResolutionJson === null) {
    throw new Error("Attack consequences require the completed Pass 7 defense/intervention resolution.");
  }
  const governingRoll = await effectiveActionRoll(tx, context, actor, declaration.pendingActionId);
  if (sourceNeedsRoll(source) && !governingRoll) {
    throw new Error("The exact immutable governing Roll is required before consequences are generated.");
  }
  const targetIds = locked.targetCharacterIds.length ? locked.targetCharacterIds : [locked.actorCharacterId];
  const targets = await tx.select({
    id: campaignSessionEncounterParticipant.characterId,
    kind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    characterName: campaignCharacter.name,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      inArray(campaignSessionEncounterParticipant.characterId, targetIds),
    ));
  if (targets.length !== new Set(targetIds).size) throw new Error("A locked target no longer belongs to this exact Encounter.");
  const targetSnapshot = targets.map((target) => ({
    participantId: target.id,
    kind: target.kind,
    name: target.kind === "creature" ? target.displayLabel : target.characterName,
  })).sort((left, right) => targetIds.indexOf(left.participantId) - targetIds.indexOf(right.participantId));
  const defenseResolution = isRecord(declaration.defenseResolutionJson) ? declaration.defenseResolutionJson : null;
  const proposal = buildActionEffectPlanProposal({
    source,
    actorParticipantId: locked.actorCharacterId,
    targetParticipantIds: targetIds,
    governingRoll,
    defenseResolution,
    initiativeComplete: true,
  });
  const divergence = await currentSourceDivergence(
    tx,
    context,
    actor,
    declaration.id,
    declaration.draftJson,
    source,
    locked.weapon,
    locked.governing,
  );
  const [created] = await tx.insert(campaignSessionEncounterEffectPlan).values({
    declarationId: declaration.id,
    pendingActionId: declaration.pendingActionId,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    actorParticipantId: locked.actorCharacterId,
    sourceKind: source.kind,
    sourceIdentity: source.identity,
    sourceId: source.sourceId === null ? null : String(source.sourceId),
    sourceInstanceId: source.sourceInstanceId,
    status: proposal.status,
    targetSnapshotJson: targetSnapshot,
    sourceSnapshotJson: source,
    governingRollSnapshotJson: governingRoll,
    defenseResolutionJson: defenseResolution,
    initiativeCommitmentJson: {
      status: pending.status,
      originalInitiativeCost: pending.originalInitiativeCost,
      additionalInitiativeCost: pending.additionalInitiativeCost,
      initiativeSpent: pending.initiativeSpent,
      remainingInitiativeCost: pending.remainingInitiativeCost,
      startInitiative: pending.startInitiative,
      startTimelineInitiative: pending.startTimelineInitiative,
      expectedCompletionInitiative: pending.expectedCompletionInitiative,
      startedRound: pending.startedRound,
      completedRound: pending.completedRound,
    },
    resourceCostsJson: source.resourceCosts,
    sourceDivergenceJson: divergence,
    explanation: proposal.explanation,
    createdByUserId: actor.userId,
  }).returning({ id: campaignSessionEncounterEffectPlan.id });
  if (!created) throw new Error("The Action Effect Plan could not be saved.");
  if (proposal.effects.length) {
    await tx.insert(campaignSessionEncounterEffect).values(proposal.effects.map((effect) => ({
      planId: created.id,
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      targetParticipantId: effect.targetParticipantId,
      effectKey: effect.effectKey,
      effectType: effect.effectType,
      sourceKind: source.kind,
      sourceIdentity: source.identity,
      authoredValueJson: effect.authoredValue,
      calculatedValueJson: effect.calculatedValue,
      finalValueJson: effect.finalValue,
      unit: effect.unit,
      resource: effect.resource,
      applicationSupported: effect.applicationSupported,
      godReviewRequired: effect.godReviewRequired,
      status: effect.status,
      amendmentReason: effect.amendmentReason,
    })));
  }
  await recordEvent(tx, context, created.id, null, proposal.status, "effect-plan-generated", actor.userId, "", {
    declarationId: declaration.id,
    sourceIdentity: source.identity,
    effectCount: proposal.effects.length,
    divergence: divergence?.status ?? null,
  });
  return created.id;
}

export async function approveActionEffectPlanInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  reasonInput = "",
): Promise<void> {
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  if (plan.status === "approved" || plan.status === "applied" || plan.status === "partially-applied") return;
  if (!['calculated', 'requires-god-ruling'].includes(plan.status)) throw new Error("Only a calculated Action Effect Plan may be approved.");
  const reason = boundedReason(reasonInput, "Approval reason", false);
  const now = new Date();
  await tx.update(campaignSessionEncounterEffect).set({ status: "approved", updatedAt: now }).where(and(
    eq(campaignSessionEncounterEffect.planId, plan.id),
    inArray(campaignSessionEncounterEffect.status, ["calculated", "requires-god-ruling"]),
  ));
  await tx.update(campaignSessionEncounterEffectPlan).set({
    status: "approved",
    reviewedByUserId: actor.userId,
    reviewedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterEffectPlan.id, plan.id));
  await recordEvent(tx, context, plan.id, plan.status, "approved", "effect-plan-approved", actor.userId, reason);
}

export async function amendActionEffectAmountInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  effectId: number,
  amountInput: number,
  reasonInput: string,
): Promise<void> {
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  if (!["calculated", "requires-god-ruling", "approved", "application-failed"].includes(plan.status)) throw new Error("This plan no longer accepts amendments.");
  const effectRow = await lockEffect(tx, plan, effectId);
  if (effectRow.status === "applied" || effectRow.status === "manual-resolved" || effectRow.status === "declined") {
    throw new Error("A terminal effect cannot be amended.");
  }
  if (!Number.isFinite(amountInput)) throw new Error("Corrected effect amount must be finite.");
  const final = isRecord(effectRow.finalValueJson) ? structuredClone(effectRow.finalValueJson) : null;
  if (!final) throw new Error("Only an amount-bearing effect can be corrected.");
  let previousAmount: unknown;
  if (effectRow.effectType.startsWith("resource.")) {
    if (amountInput <= 0) throw new Error("Resource effect amounts must be greater than zero.");
    if ((effectRow.effectType === "resource.item-quantity" || effectRow.effectType === "resource.item-charges")
      && !Number.isSafeInteger(amountInput)) {
      throw new Error("Item resource effect amounts must be positive whole numbers.");
    }
    previousAmount = final.amount;
    final.amount = amountInput;
  } else {
    if (!isRecord(final.effect)) throw new Error("Only a structured amount-bearing Mechanical Effect can be corrected.");
    const kind = final.effect.kind;
    if (kind !== "health.damage" && kind !== "health.heal" && kind !== "modifier.apply") {
      throw new Error("This Mechanical Effect does not contain a correctable numeric amount.");
    }
    if ((kind === "health.damage" || kind === "health.heal") && amountInput <= 0) {
      throw new Error("Health effect amounts must be greater than zero.");
    }
    if (kind === "modifier.apply" && amountInput === 0) throw new Error("Modifier amount cannot be zero.");
    previousAmount = final.effect.amount;
    final.effect = { ...final.effect, amount: amountInput };
  }
  const reason = boundedReason(reasonInput, "Amendment reason");
  await tx.update(campaignSessionEncounterEffect).set({
    finalValueJson: final,
    status: plan.status === "approved" ? "approved" : plan.status === "application-failed" ? "application-failed" : "requires-god-ruling",
    godReviewRequired: true,
    amendmentReason: reason,
    amendedByUserId: actor.userId,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterEffect.id, effectRow.id));
  await recordEvent(tx, context, plan.id, plan.status, plan.status, "effect-amount-amended", actor.userId, reason, {
    effectId: effectRow.id,
    previousAmount,
    correctedAmount: amountInput,
  });
}

export async function declineActionEffectInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  effectId: number,
  reasonInput: string,
): Promise<void> {
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  if (!["calculated", "requires-god-ruling", "approved", "partially-applied", "application-failed"].includes(plan.status)) throw new Error("This plan no longer accepts effect rulings.");
  const effectRow = await lockEffect(tx, plan, effectId);
  if (effectRow.status === "declined") return;
  if (effectRow.status === "applied" || effectRow.status === "manual-resolved") throw new Error("An applied or manually resolved effect cannot be declined.");
  const reason = boundedReason(reasonInput, "Decline reason");
  await tx.update(campaignSessionEncounterEffect).set({
    status: "declined",
    amendmentReason: reason,
    amendedByUserId: actor.userId,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterEffect.id, effectRow.id));
  await recordEvent(tx, context, plan.id, plan.status, plan.status, "effect-declined", actor.userId, reason, { effectId: effectRow.id });
}

export async function addManualActionEffectInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  targetParticipantIdInput: number,
  instructionInput: string,
  reasonInput: string,
): Promise<number> {
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  if (!["calculated", "requires-god-ruling", "approved", "partially-applied"].includes(plan.status)) throw new Error("This plan no longer accepts manual effects.");
  const targetParticipantId = participantKey(targetParticipantIdInput, "Manual effect target");
  const lockedTargetIds = Array.isArray(plan.targetSnapshotJson)
    ? plan.targetSnapshotJson.flatMap((entry) => isRecord(entry) && Number.isSafeInteger(entry.participantId)
      ? [Number(entry.participantId)]
      : [])
    : [];
  if (!lockedTargetIds.includes(targetParticipantId)) {
    throw new Error("A manual effect must retain one of the originating action's exact locked targets.");
  }
  const [target] = await tx.select({ id: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.characterId, targetParticipantId),
    )).limit(1);
  if (!target) throw new Error("The manual effect target does not belong to this Encounter.");
  const instruction = boundedReason(instructionInput, "Manual effect instruction");
  const reason = boundedReason(reasonInput, "Manual effect reason");
  const prior = await tx.select({ id: campaignSessionEncounterEffect.id }).from(campaignSessionEncounterEffect)
    .where(eq(campaignSessionEncounterEffect.planId, plan.id));
  const key = `god-manual:${prior.length + 1}:target:${targetParticipantId}`;
  const [created] = await tx.insert(campaignSessionEncounterEffect).values({
    planId: plan.id,
    encounterId: plan.encounterId,
    sceneId: plan.sceneId,
    sessionId: plan.sessionId,
    campaignId: plan.campaignId,
    targetParticipantId,
    effectKey: key,
    effectType: "manual",
    sourceKind: plan.sourceKind,
    sourceIdentity: plan.sourceIdentity,
    authoredValueJson: { effect: null, instruction: { title: "G.O.D. manual effect", instruction } },
    calculatedValueJson: null,
    finalValueJson: { effect: null, instruction },
    unit: "instruction",
    applicationSupported: false,
    godReviewRequired: true,
    status: "requires-god-ruling",
    amendmentReason: reason,
    amendedByUserId: actor.userId,
  }).returning({ id: campaignSessionEncounterEffect.id });
  if (!created) throw new Error("The manual effect could not be saved.");
  if (plan.status === "calculated") {
    await tx.update(campaignSessionEncounterEffectPlan).set({ status: "requires-god-ruling", updatedAt: new Date() })
      .where(eq(campaignSessionEncounterEffectPlan.id, plan.id));
  }
  await recordEvent(tx, context, plan.id, plan.status, plan.status === "calculated" ? "requires-god-ruling" : plan.status, "manual-effect-added", actor.userId, reason, {
    effectId: created.id,
    targetParticipantId,
  });
  return created.id;
}

export async function resolveManualActionEffectInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  effectId: number,
  outcomeInput: string,
  reasonInput: string,
): Promise<void> {
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  if (!["calculated", "requires-god-ruling", "approved", "partially-applied"].includes(plan.status)) throw new Error("This plan no longer accepts manual resolutions.");
  const effectRow = await lockEffect(tx, plan, effectId);
  if (effectRow.status === "manual-resolved") return;
  if (effectRow.applicationSupported || effectRow.status === "applied" || effectRow.status === "declined") {
    throw new Error("Only an unresolved manual effect can receive a manual outcome.");
  }
  const outcome = boundedReason(outcomeInput, "Manual outcome");
  const reason = boundedReason(reasonInput, "Manual ruling reason");
  const now = new Date();
  await tx.update(campaignSessionEncounterEffect).set({
    status: "manual-resolved",
    finalValueJson: { manualOutcome: outcome },
    amendmentReason: reason,
    amendedByUserId: actor.userId,
    appliedResultJson: { kind: "manual-ruling", outcome },
    appliedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterEffect.id, effectRow.id));
  await recordEvent(tx, context, plan.id, plan.status, plan.status, "manual-effect-resolved", actor.userId, reason, { effectId: effectRow.id, outcome });
}

export async function declineActionEffectPlanInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  reasonInput: string,
): Promise<void> {
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  if (plan.status === "declined") return;
  if (["applied", "partially-applied", "cancelled", "superseded"].includes(plan.status)) throw new Error("This Action Effect Plan can no longer be declined.");
  const reason = boundedReason(reasonInput, "Plan decline reason");
  const now = new Date();
  await tx.update(campaignSessionEncounterEffect).set({
    status: "declined",
    amendmentReason: reason,
    amendedByUserId: actor.userId,
    updatedAt: now,
  }).where(and(
    eq(campaignSessionEncounterEffect.planId, plan.id),
    inArray(campaignSessionEncounterEffect.status, ["calculated", "requires-god-ruling", "approved", "application-failed"]),
  ));
  await tx.update(campaignSessionEncounterEffectPlan).set({
    status: "declined",
    reviewedByUserId: actor.userId,
    reviewedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterEffectPlan.id, plan.id));
  await recordEvent(tx, context, plan.id, plan.status, "declined", "effect-plan-declined", actor.userId, reason);
  await resolveActionDeclarationInTransaction(tx, context, actor, plan.declarationId, reason);
}

function finalMechanicalEffect(value: unknown): { effect: MechanicalEffect; application: MechanicalEffectApplication } {
  if (!isRecord(value) || !isRecord(value.effect)) throw new Error("The approved Mechanical Effect payload is invalid.");
  const validation = validateMechanicalEffect(value.effect);
  if (!validation.valid) throw new Error("The approved Mechanical Effect no longer passes the shared vocabulary validator.");
  const application = isRecord(value.application) ? value.application : {};
  return {
    effect: validation.effect,
    application: application as MechanicalEffectApplication,
  };
}

async function applyCharacterEffect(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  plan: LoadedPlan,
  effectRow: LoadedEffect,
): Promise<Record<string, unknown>> {
  const [target] = await tx.select({ id: campaignCharacter.id, npcKind: campaignCharacter.npcKind })
    .from(campaignCharacter)
    .where(and(
      eq(campaignCharacter.id, positiveId(effectRow.targetParticipantId, "Target Character")),
      eq(campaignCharacter.campaignId, context.campaignId),
    )).limit(1);
  if (!target) throw new Error("The persistent Character target no longer belongs to this Campaign.");
  if (effectRow.effectType.startsWith("resource.")) {
    if (!isRecord(effectRow.finalValueJson)) {
      throw new Error("This approved resource effect has no supported executor.");
    }
    const amount = Number(effectRow.finalValueJson.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("The frozen resource cost is invalid.");
    if (effectRow.effectType === "resource.mana") {
      const system = effectRow.finalValueJson.resourceKey;
      if (!isCharacterMagicSystem(system)) throw new Error("The frozen Mana cost is invalid.");
      const result = await spendActiveManaInTransaction(tx, { characterId: target.id, system, amount });
      return { kind: "mana-spent", system, amount, manaSpent: result.manaSpent, currentMana: result.currentMana };
    }
    const source = assertFrozenActionSourceSnapshot(plan.sourceSnapshotJson);
    if (source.kind !== "item" || target.id !== plan.actorParticipantId || typeof source.sourceId !== "number") {
      throw new Error("The frozen Item resource identity is invalid.");
    }
    const itemId = positiveId(source.sourceId, "Frozen Item");
    if (effectRow.effectType === "resource.item-quantity") {
      if (!Number.isSafeInteger(amount)) throw new Error("The frozen Item quantity cost is invalid.");
      await lockEquipmentStateCharacterInTransaction(tx, target.id);
      const [owned] = await tx.select({ quantity: campaignCharacterItem.quantity }).from(campaignCharacterItem).where(and(
        eq(campaignCharacterItem.characterId, target.id),
        eq(campaignCharacterItem.itemId, itemId),
      )).limit(1).for("update");
      if (!owned || owned.quantity < amount) throw new Error("The exact owned Item stack cannot pay the frozen quantity cost.");
      await assertConsumableHasInactiveQuantityInTransaction(tx, {
        characterId: target.id,
        itemId,
        ownedQuantity: owned.quantity,
        consumeQuantity: amount,
      });
      const after = owned.quantity - amount;
      if (after === 0) {
        const deleted = await tx.delete(campaignCharacterItem).where(and(
          eq(campaignCharacterItem.characterId, target.id),
          eq(campaignCharacterItem.itemId, itemId),
        )).returning({ itemId: campaignCharacterItem.itemId });
        if (!deleted.length) throw new Error("The exact owned Item stack changed before its cost could be applied.");
      } else {
        const updated = await tx.update(campaignCharacterItem).set({ quantity: after }).where(and(
          eq(campaignCharacterItem.characterId, target.id),
          eq(campaignCharacterItem.itemId, itemId),
        )).returning({ itemId: campaignCharacterItem.itemId });
        if (!updated.length) throw new Error("The exact owned Item stack changed before its cost could be applied.");
      }
      await reconcileItemPassiveEffectsInTransaction(tx, target.id, [itemId]);
      return { kind: "item-quantity-consumed", itemId, before: owned.quantity, after, amount };
    }
    if (effectRow.effectType === "resource.item-charges") {
      if (!Number.isSafeInteger(amount) || source.sourceInstanceId === null) throw new Error("The frozen Item Charge cost is invalid.");
      const identity = { characterId: target.id, itemId, instanceId: source.sourceInstanceId };
      const before = await readItemChargeStateInTransaction(tx, identity, true);
      const spent = await spendItemChargesInTransaction(tx, identity);
      if (before.currentCharges - spent.currentCharges !== amount) {
        throw new Error("The current Item Charge definition no longer matches the frozen action cost.");
      }
      return { kind: "item-charges-spent", itemId, instanceId: source.sourceInstanceId, before: before.currentCharges, after: spent.currentCharges, amount };
    }
    throw new Error("This approved resource effect has no supported executor.");
  }
  const final = finalMechanicalEffect(effectRow.finalValueJson);
  const health = final.effect.kind === "health.damage" || final.effect.kind === "health.heal"
    ? await lockActiveHealthInTransaction(tx, target.id, target.npcKind)
    : null;
  const planned = planMechanicalEffect({
    effect: final.effect,
    source: { kind: "system", id: `action-effect:${effectRow.id}`, name: plan.sourceIdentity },
    application: { ...final.application, targetCharacterId: target.id },
    health,
  });
  if (planned.status !== "ready") throw new Error(`The approved Mechanical Effect is not executable (${planned.status}).`);
  const persisted = await persistPlannedMechanicalEffectInTransaction(tx, {
    plan: planned,
    targetCharacterId: target.id,
    sourceEffectKey: `action-effect:${effectRow.id}`,
    targetAnatomy: health?.anatomy,
  });
  if (persisted) await bindPersistedEffectDurationInTransaction(tx, context, persisted);
  return {
    kind: final.effect.kind,
    summary: planned.summary,
    persistedIdentity: persisted ?? null,
    healthResult: planned.healthResult ?? null,
  };
}

function directCreatureHealth(localState: Record<string, unknown>): { totalDamage: number; poolDamage: Record<string, number> } {
  const health = isRecord(localState.health) ? localState.health : {};
  const totalDamage = typeof health.totalDamage === "number" && Number.isFinite(health.totalDamage) && health.totalDamage >= 0
    ? health.totalDamage
    : 0;
  const rawPools = isRecord(health.poolDamage) ? health.poolDamage : {};
  const poolDamage: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawPools)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) poolDamage[key] = value;
  }
  return { totalDamage, poolDamage };
}

function localApplication(value: unknown): Record<string, unknown> {
  return isRecord(value) && isRecord(value.application) ? value.application : {};
}

async function applyDirectCreatureEffect(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  effectRow: LoadedEffect,
): Promise<Record<string, unknown>> {
  if (effectRow.targetParticipantId >= 0) throw new Error("Direct Creature state requires its negative occurrence-local participant key.");
  const [participant] = await tx.select({
    kind: campaignSessionEncounterParticipant.participantKind,
    snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson,
    localState: campaignSessionEncounterParticipant.localStateJson,
  }).from(campaignSessionEncounterParticipant).where(and(
    eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
    eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
    eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
    eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
    eq(campaignSessionEncounterParticipant.characterId, effectRow.targetParticipantId),
  )).limit(1).for("update");
  if (!participant || participant.kind !== "creature" || !isRecord(participant.localState)) {
    throw new Error("The direct Creature occurrence-local state is missing or malformed.");
  }
  const final = finalMechanicalEffect(effectRow.finalValueJson);
  const next = structuredClone(participant.localState);
  const appliedAt = new Date().toISOString();
  if (final.effect.kind === "health.damage" || final.effect.kind === "health.heal") {
    const health = directCreatureHealth(next);
    const application = localApplication(effectRow.finalValueJson);
    if (final.effect.kind === "health.heal" && final.effect.scope === "full-body") {
      const before = health.totalDamage;
      health.totalDamage = Math.max(0, health.totalDamage - final.effect.amount);
      for (const key of Object.keys(health.poolDamage)) {
        health.poolDamage[key] = Math.max(0, health.poolDamage[key] - final.effect.amount);
      }
      next.health = health;
      await tx.update(campaignSessionEncounterParticipant).set({ localStateJson: next, updatedAt: new Date() }).where(and(
        eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
        eq(campaignSessionEncounterParticipant.characterId, effectRow.targetParticipantId),
      ));
      return { kind: final.effect.kind, scope: "full-body", before, after: health.totalDamage };
    }
    let poolKey = typeof application.poolKey === "string" && application.poolKey.trim() ? application.poolKey.trim() : null;
    if (!poolKey && Number.isSafeInteger(application.hitLocationNumber) && isRecord(participant.snapshot)) {
      const location = Array.isArray(participant.snapshot.hitLocations)
        ? participant.snapshot.hitLocations.find((entry) => isRecord(entry) && entry.hitLocationNumber === application.hitLocationNumber)
        : null;
      poolKey = isRecord(location) && typeof location.hpPoolCanonicalId === "string" ? location.hpPoolCanonicalId : null;
    }
    if (!poolKey) throw new Error("Direct Creature Health application requires the exact HP Pool or Hit Location selection.");
    const knownPool = isRecord(participant.snapshot) && Array.isArray(participant.snapshot.hpPools)
      ? participant.snapshot.hpPools.some((entry) => isRecord(entry) && entry.canonicalId === poolKey)
      : false;
    if (!knownPool) throw new Error("The selected HP Pool is not part of this direct Creature occurrence's frozen anatomy.");
    const prior = health.poolDamage[poolKey] ?? 0;
    const delta = final.effect.kind === "health.damage" ? final.effect.amount : -final.effect.amount;
    const after = Math.max(0, prior + delta);
    const totalAfter = final.effect.kind === "health.damage"
      ? health.totalDamage + (after - prior)
      : health.totalDamage;
    health.poolDamage[poolKey] = after;
    health.totalDamage = totalAfter;
    next.health = health;
    await tx.update(campaignSessionEncounterParticipant).set({ localStateJson: next, updatedAt: new Date() }).where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.characterId, effectRow.targetParticipantId),
    ));
    return { kind: final.effect.kind, poolKey, before: prior, after, totalDamage: totalAfter };
  }
  if (final.effect.kind === "condition.apply") {
    const conditions = Array.isArray(next.conditions) ? next.conditions : [];
    conditions.push({ effectPlanEffectId: effectRow.id, ...final.effect, sourceIdentity: effectRow.sourceIdentity, appliedAt });
    next.conditions = conditions;
  } else if (final.effect.kind === "modifier.apply") {
    const modifiers = Array.isArray(next.modifiers) ? next.modifiers : [];
    modifiers.push({ effectPlanEffectId: effectRow.id, ...final.effect, sourceIdentity: effectRow.sourceIdentity, appliedAt });
    next.modifiers = modifiers;
  } else {
    throw new Error("Manual Mechanical Effects require a recorded G.O.D. outcome.");
  }
  await tx.update(campaignSessionEncounterParticipant).set({ localStateJson: next, updatedAt: new Date() }).where(and(
    eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
    eq(campaignSessionEncounterParticipant.characterId, effectRow.targetParticipantId),
  ));
  return { kind: final.effect.kind, occurrenceLocal: true, effectPlanEffectId: effectRow.id };
}

async function applySupportedEffects(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  plan: LoadedPlan,
): Promise<number[]> {
  const effects = await tx.select().from(campaignSessionEncounterEffect)
    .where(eq(campaignSessionEncounterEffect.planId, plan.id))
    .orderBy(asc(campaignSessionEncounterEffect.id))
    .for("update");
  const applicable = effects.filter((effect) => effect.applicationSupported && (effect.status === "approved" || effect.status === "application-failed"));
  const appliedIds: number[] = [];
  for (const effectRow of applicable) {
    const result = effectRow.targetParticipantId < 0
      ? await applyDirectCreatureEffect(tx, context, effectRow)
      : await applyCharacterEffect(tx, context, plan, effectRow);
    await tx.update(campaignSessionEncounterEffect).set({
      status: "applied",
      appliedResultJson: result,
      appliedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(campaignSessionEncounterEffect.id, effectRow.id));
    appliedIds.push(effectRow.id);
  }
  return appliedIds;
}

export async function applyActionEffectPlanInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
): Promise<ActionEffectPlanStatus> {
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  if (plan.status === "applied") return "applied";
  if (!["approved", "partially-applied", "application-failed"].includes(plan.status)) {
    throw new Error("The Action Effect Plan must be approved before application.");
  }
  let appliedIds: number[] = [];
  try {
    await tx.transaction(async (applicationTx) => {
      appliedIds = await applySupportedEffects(applicationTx, context, plan);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action Effect application failed.";
    const now = new Date();
    await tx.update(campaignSessionEncounterEffect).set({ status: "application-failed", updatedAt: now }).where(and(
      eq(campaignSessionEncounterEffect.planId, plan.id),
      eq(campaignSessionEncounterEffect.applicationSupported, true),
      inArray(campaignSessionEncounterEffect.status, ["approved", "application-failed"]),
    ));
    await tx.update(campaignSessionEncounterEffectPlan).set({
      status: "application-failed",
      appliedByUserId: null,
      appliedAt: null,
      updatedAt: now,
    }).where(eq(campaignSessionEncounterEffectPlan.id, plan.id));
    await recordEvent(tx, context, plan.id, plan.status, "application-failed", "effect-plan-application-failed", actor.userId, message);
    return "application-failed";
  }
  const remaining = await tx.select({
    status: campaignSessionEncounterEffect.status,
  }).from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, plan.id));
  const unresolved = remaining.some(({ status }) => !["applied", "declined", "manual-resolved"].includes(status));
  const nextStatus: ActionEffectPlanStatus = unresolved ? "partially-applied" : "applied";
  const now = new Date();
  await tx.update(campaignSessionEncounterEffectPlan).set({
    status: nextStatus,
    appliedByUserId: actor.userId,
    appliedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterEffectPlan.id, plan.id));
  await recordEvent(tx, context, plan.id, plan.status, nextStatus, "effect-plan-applied", actor.userId, "", { appliedEffectIds: appliedIds });
  if (nextStatus === "applied") {
    await resolveActionDeclarationInTransaction(tx, context, actor, plan.declarationId, "Approved consequences were applied or explicitly resolved.");
  }
  return nextStatus;
}

export async function readActionEffectWorkspaceInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
): Promise<ActionEffectWorkspaceView> {
  const participants = await tx.select({
    id: campaignSessionEncounterParticipant.characterId,
    kind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    characterName: campaignCharacter.name,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .where(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId))
    .orderBy(asc(campaignSessionEncounterParticipant.sortOrder));
  const participantViews = participants.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.kind === "creature" ? row.displayLabel : row.characterName ?? `Character #${row.id}`,
  }));
  const nameById = new Map(participantViews.map((row) => [row.id, row.name]));
  const planRows = await tx.select().from(campaignSessionEncounterEffectPlan)
    .where(eq(campaignSessionEncounterEffectPlan.encounterId, context.encounterId))
    .orderBy(desc(campaignSessionEncounterEffectPlan.id));
  const effects = planRows.length
    ? await tx.select().from(campaignSessionEncounterEffect)
        .where(inArray(campaignSessionEncounterEffect.planId, planRows.map(({ id }) => id)))
        .orderBy(asc(campaignSessionEncounterEffect.id))
    : [];
  const events = planRows.length
    ? await tx.select().from(campaignSessionEncounterEffectPlanEvent)
        .where(inArray(campaignSessionEncounterEffectPlanEvent.planId, planRows.map(({ id }) => id)))
        .orderBy(asc(campaignSessionEncounterEffectPlanEvent.createdAt), asc(campaignSessionEncounterEffectPlanEvent.id))
    : [];
  const plans = planRows.map((plan): ActionEffectPlanView => ({
    id: plan.id,
    declarationId: plan.declarationId,
    pendingActionId: plan.pendingActionId,
    actorParticipantId: plan.actorParticipantId,
    actorName: nameById.get(plan.actorParticipantId) ?? `Participant ${plan.actorParticipantId}`,
    sourceKind: plan.sourceKind,
    sourceIdentity: plan.sourceIdentity,
    status: plan.status,
    targetSnapshot: (Array.isArray(plan.targetSnapshotJson) ? plan.targetSnapshotJson : []) as ActionEffectPlanView["targetSnapshot"],
    sourceSnapshot: assertFrozenActionSourceSnapshot(plan.sourceSnapshotJson),
    governingRollSnapshot: plan.governingRollSnapshotJson as RollMechanicalSnapshot | null,
    defenseResolution: plan.defenseResolutionJson,
    initiativeCommitment: plan.initiativeCommitmentJson,
    resourceCosts: plan.resourceCostsJson,
    sourceDivergence: plan.sourceDivergenceJson,
    explanation: plan.explanation,
    createdByUserId: plan.createdByUserId,
    reviewedByUserId: plan.reviewedByUserId,
    appliedByUserId: plan.appliedByUserId,
    reviewedAt: plan.reviewedAt?.toISOString() ?? null,
    appliedAt: plan.appliedAt?.toISOString() ?? null,
    createdAt: plan.createdAt.toISOString(),
    effects: effects.filter(({ planId }) => planId === plan.id).map((effect) => ({
      id: effect.id,
      targetParticipantId: effect.targetParticipantId,
      targetName: nameById.get(effect.targetParticipantId) ?? `Participant ${effect.targetParticipantId}`,
      effectKey: effect.effectKey,
      effectType: effect.effectType,
      authoredValue: effect.authoredValueJson,
      calculatedValue: effect.calculatedValueJson,
      finalValue: effect.finalValueJson,
      unit: effect.unit,
      resource: effect.resource,
      applicationSupported: effect.applicationSupported,
      godReviewRequired: effect.godReviewRequired,
      status: effect.status,
      amendmentReason: effect.amendmentReason,
      appliedResult: effect.appliedResultJson,
      appliedAt: effect.appliedAt?.toISOString() ?? null,
    })),
    events: events.filter(({ planId }) => planId === plan.id).map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      eventKind: event.eventKind,
      reason: event.reason,
      metadata: event.metadata,
      actorUserId: event.actorUserId,
      createdAt: event.createdAt.toISOString(),
    })),
  }));
  const declarationRows = await tx.select({
    id: campaignSessionEncounterActionDeclaration.id,
    label: campaignSessionEncounterPendingAction.label,
    actorParticipantId: campaignSessionEncounterActionDeclaration.actorCharacterId,
    status: campaignSessionEncounterActionDeclaration.status,
    timingStatus: campaignSessionEncounterPendingAction.status,
    lockedSnapshot: campaignSessionEncounterActionDeclaration.lockedSnapshotJson,
  }).from(campaignSessionEncounterActionDeclaration)
    .innerJoin(campaignSessionEncounterPendingAction, eq(campaignSessionEncounterPendingAction.id, campaignSessionEncounterActionDeclaration.pendingActionId))
    .where(and(
      eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
      eq(campaignSessionEncounterPendingAction.status, "completed"),
    ))
    .orderBy(desc(campaignSessionEncounterActionDeclaration.id));
  const planDeclarationIds = new Set(planRows.map(({ declarationId }) => declarationId));
  return {
    plans,
    eligibleDeclarations: declarationRows.filter((row) => !planDeclarationIds.has(row.id)).flatMap((row) => {
      try {
        const locked = parseLockedActionDeclarationSnapshot(row.lockedSnapshot);
        if (!locked.authoredSource) return [];
        return [{
          id: row.id,
          label: row.label,
          actorParticipantId: row.actorParticipantId,
          actorName: nameById.get(row.actorParticipantId) ?? `Participant ${row.actorParticipantId}`,
          sourceKind: locked.authoredSource.kind,
          status: row.status,
          timingStatus: row.timingStatus,
        }];
      } catch {
        return [];
      }
    }),
    participants: participantViews,
  };
}

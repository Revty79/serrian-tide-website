import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import "server-only";
import { assertExactInventoryAvailable, assertLooseStackAvailable } from "@/features/items/inventory-access-service";
import { assertNoOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { db } from "@/db";
import { campaignCharacter, campaignCharacterItem } from "@/db/realm-schema";
import {
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterActionDeclarationEvent,
  campaignSessionEncounterEffect,
  campaignSessionEncounterEffectPlan,
  campaignSessionEncounterEffectPlanEvent,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionEncounterResponderOpportunity,
  campaignSessionEncounterInitiative,
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
  spendExactItemPowerChargesInTransaction,
} from "@/features/items/item-charge-service";

import {
  assertFrozenActionSourceSnapshot,
  buildActionEffectPlanProposal,
  frozenAoeSelections,
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
  assertActionChoiceAuthority,
  type ActionDeclarationActor,
} from "./action-declaration-service";
import { resolveLockedActionSourceInTransaction } from "./action-source-resolver-service";
import { bindPersistedEffectDurationInTransaction } from "./duration-lifecycle-service";
import { bindPeriodicHealthEffectInTransaction } from "./duration-lifecycle-service";
import {
  readEffectiveRollSnapshotInTransaction,
  type AuthorizedRollActor,
} from "./roll-runtime-service";
import { parseRollMechanicalSnapshot, type RollMechanicalSnapshot } from "./roll-mechanical-snapshot";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";
import { buildOrdinaryAttackConsequenceProposalInTransaction, isSimpleAdditiveWeaponHitDamage, type OrdinaryAttackRuling } from "./ordinary-attack-consequence-service";
import { recordCombatDamageOutcomeInTransaction } from "./combat-damage-outcome-service";
import { resolveSpellHitLocationsInTransaction } from "./combat-spell-location-service";
import { resolveIncomingEffectPlanInTransaction } from "@/features/incoming-effects/effect-proposal-service";
import { storedIncomingResolution, recalculateFrozenIncoming, proposalFromEffectRow, incomingProposalFields, resolveIncomingEffectProposal } from "@/features/incoming-effects/effect-proposal";
import { applyDirectCreatureHealthInTransaction } from "./direct-creature-health-service";
import { availableWeaponHitSource, unavailableWeaponHitPowers } from "./weapon-hit-resource-service";

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

function rollActor(context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor): AuthorizedRollActor {
  return {
    userId: actor.userId,
    campaignId: context.campaignId,
    readAs: actor.authority === "god-owner" ? "god-owner" : "player",
    canRecordGodOnly: actor.authority === "god-owner",
    characterId: actor.authority === "player" ? actor.characterId : null,
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
  actor: ActionDeclarationActor,
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
    || source.resolutionMode === "opposed-roll"
    || source.resolutionMode === "fixed-roll";
}

async function currentSourceDivergence(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationId: number,
  draftJson: unknown,
  frozen: FrozenActionSourceSnapshot,
  weapon: ReturnType<typeof parseLockedActionDeclarationSnapshot>["weapon"],
  governing: ReturnType<typeof parseLockedActionDeclarationSnapshot>["governing"],
  aoeSelections: Readonly<Record<string, readonly number[]>> = {},
): Promise<Record<string, unknown> | null> {
  try {
    const draft = parseActionDeclarationDraft(draftJson);
    const payload: Record<string, unknown> = isRecord(draft.sourcePayload) ? structuredClone(draft.sourcePayload) : {};
    if (Object.keys(aoeSelections).length > 0) {
      const selections = isRecord(payload.selections) ? structuredClone(payload.selections) : {};
      const existingGroups = isRecord(selections.targetGroups) ? selections.targetGroups : {};
      selections.targetGroups = {
        ...existingGroups,
        ...Object.fromEntries(Object.entries(aoeSelections).map(([groupId, ids]) => [groupId, [...ids]])),
      };
      payload.selections = selections;
    }
    const current = await resolveLockedActionSourceInTransaction(
      tx,
      context,
      actor,
      declarationId,
      { ...draft, sourcePayload: payload },
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

async function generateActionEffectPlanInternal(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  declarationIdInput: number,
  ordinaryRuling?: OrdinaryAttackRuling,
  aoeSelections: Readonly<Record<string, readonly number[]>> = {},
): Promise<number> {
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
    .orderBy(desc(campaignSessionEncounterEffectPlan.firearmPortion))
    .limit(1);
  if (existing) return existing.id;
  if (declaration.status === "cancelled" || declaration.status === "abandoned" || declaration.status === "interrupted") {
    throw new Error("A cancelled, abandoned, or interrupted declaration cannot generate consequences.");
  }
  if (declaration.pendingActionId === null || declaration.lockedSnapshotJson === null) {
    throw new Error("The declaration must be locked and committed before consequences can be generated.");
  }
  const locked = parseLockedActionDeclarationSnapshot(declaration.lockedSnapshotJson);
  if (locked.actionKind.startsWith("firearm-attack:")) {
    throw new Error("Resolve this firearm through its exact firearm attack and bullet allocation before applying consequences.");
  }
  let source = assertFrozenActionSourceSnapshot(locked.authoredSource);
  const areaGroups = Array.isArray(source.authoredData.targetGroups) ? source.authoredData.targetGroups.filter((entry) => isRecord(entry) && entry.kind === "aoe") : [];
  if (areaGroups.some((entry) => !isRecord(entry) || typeof entry.id !== "string" || !Object.hasOwn(aoeSelections, entry.id))) {
    throw new Error("Confirm the affected participants for every area before resolving this action, including an explicitly empty area.");
  }
  if (Object.keys(aoeSelections).length > 0) {
    if (actor.authority !== "god-owner" || actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may choose AoE participants.");
    if (locked.source.kind !== "spell" && locked.source.kind !== "item") throw new Error("AoE selections require a Spell or Item Magic declaration.");
    const templates = source.authoredData.areaEffectTemplates;
    if (!Array.isArray(templates)) throw new Error("This historical area declaration lacks frozen effect templates. Keep its historical result or cancel and declare again; do not reread a changed source.");
    const selectedEffects = templates.flatMap((value) => {
      const template = value as FrozenActionSourceSnapshot["effects"][number];
      const groupId = String(template.instruction.targetGroupId);
      if (!areaGroups.some((group) => isRecord(group) && group.id === groupId)) throw new Error("Frozen area effect has an invalid target group.");
      const ids = aoeSelections[groupId] ?? [];
      if (ids.some((id) => !Number.isSafeInteger(id) || id === 0) || new Set(ids).size !== ids.length) throw new Error("Area participants must be unique exact runtime identities.");
      const applications = isRecord(template.instruction.applicationByTarget) ? template.instruction.applicationByTarget : {};
      return ids.map((id) => ({ ...template, targetParticipantIds: [id], instruction: { ...template.instruction, application: applications[id] ?? {} } }));
    });
    if (Object.keys(aoeSelections).some((id) => !areaGroups.some((group) => isRecord(group) && group.id === id))) throw new Error("Unknown frozen area target group.");
    source = { ...source, effects: [...source.effects.filter(({ instruction }) => instruction.targetGroupKind !== "aoe"), ...selectedEffects] };
  }
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
  const targetIds = [...new Set([
    ...locked.targetCharacterIds,
    ...source.effects.flatMap(({ targetParticipantIds }) => targetParticipantIds),
  ])];
  const targets = targetIds.length ? await tx.select({
    id: campaignSessionEncounterParticipant.characterId,
    kind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    characterName: campaignCharacter.name,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      inArray(campaignSessionEncounterParticipant.characterId, targetIds),
    )) : [];
  if (targets.length !== new Set(targetIds).size) throw new Error("A locked target no longer belongs to this exact Encounter.");
  const targetSnapshot = targets.map((target) => ({
    participantId: target.id,
    kind: target.kind,
    name: target.kind === "creature" ? target.displayLabel : target.characterName,
  })).sort((left, right) => targetIds.indexOf(left.participantId) - targetIds.indexOf(right.participantId));
  const defenseResolution = isRecord(declaration.defenseResolutionJson) ? declaration.defenseResolutionJson : null;
  const initialProposal = (source.kind === "weapon" || source.kind === "creature-attack") && locked.weapon?.firingModeId == null && governingRoll
    ? await buildOrdinaryAttackConsequenceProposalInTransaction(tx, context, locked, governingRoll, defenseResolution, ordinaryRuling)
    : buildActionEffectPlanProposal({
    source,
    actorParticipantId: locked.actorCharacterId,
    targetParticipantIds: targetIds,
    governingRoll,
    defenseResolution,
    initiativeComplete: true,
  });
  const locatedProposal = await resolveSpellHitLocationsInTransaction(tx, context.encounterId, source, governingRoll, initialProposal);
  const proposal = await resolveIncomingEffectPlanInTransaction(tx, context, source, locatedProposal);
  const divergence = await currentSourceDivergence(
    tx,
    context,
    actor,
    declaration.id,
    declaration.draftJson,
    source,
    locked.weapon,
    locked.governing,
    frozenAoeSelections(source),
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
  // A completed attack with only declined effects has nothing left to approve
  // or apply. Finish its plan now rather than requiring an empty Apply request.
  if (proposal.status === "calculated" && proposal.effects.length > 0 && proposal.effects.every(({ status }) => status === "declined")) {
    const now = new Date();
    await tx.update(campaignSessionEncounterEffectPlan).set({ status: "applied", appliedByUserId: actor.userId, appliedAt: now, updatedAt: now,
      explanation: "Every proposed consequence was already declined. This completed action applies no damage or resource changes." })
      .where(eq(campaignSessionEncounterEffectPlan.id, created.id));
    await recordEvent(tx, context, created.id, proposal.status, "applied", "no-applicable-consequences", actor.userId,
      "Every proposed consequence was already declined; no damage or resource change was applied.", { appliedEffectIds: [] });
    await resolveActionDeclarationInTransaction(tx, context, actor, declaration.id, "All consequences were declined; completed with no effects applied.");
  }
  return created.id;
}

export async function approveActionEffectPlanInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  reasonInput = "",
): Promise<void> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  if (plan.status === "approved" || plan.status === "applied") return;
  if (!['calculated', 'requires-god-ruling', 'partially-applied'].includes(plan.status)) throw new Error("Only a calculated Action Effect Plan may be approved.");
  const reason = boundedReason(reasonInput, "Approval reason", plan.status === "requires-god-ruling" || plan.status === "partially-applied");
  const status = plan.status === "partially-applied" ? "partially-applied" : "approved";
  const now = new Date();
  await tx.update(campaignSessionEncounterEffect).set({ status: "approved", updatedAt: now }).where(and(
    eq(campaignSessionEncounterEffect.planId, plan.id),
    inArray(campaignSessionEncounterEffect.status, ["calculated", "requires-god-ruling"]),
  ));
  await tx.update(campaignSessionEncounterEffectPlan).set({
    status,
    reviewedByUserId: actor.userId,
    reviewedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterEffectPlan.id, plan.id));
  await recordEvent(tx, context, plan.id, plan.status, status, "effect-plan-approved", actor.userId, reason);
}

/** Confirming the attack ruling also settles its narrative boundary, not just its damage. */
export async function confirmActionEffectRulingInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  reasonInput: string,
): Promise<ActionEffectPlanStatus> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  if (plan.status === "applied") return "applied";
  const reason = boundedReason(reasonInput, "Attack ruling");
  if (plan.sourceIdentity.startsWith("firearm-attack:")) {
    const boundaries = await tx.select().from(campaignSessionEncounterEffect).where(and(
      eq(campaignSessionEncounterEffect.planId, plan.id),
      eq(campaignSessionEncounterEffect.effectKey, "firearm-ruling-boundary"),
      eq(campaignSessionEncounterEffect.effectType, "manual"),
      eq(campaignSessionEncounterEffect.applicationSupported, false),
    ));
    for (const effect of boundaries) {
      if (["applied", "manual-resolved", "declined"].includes(effect.status)) continue;
      await resolveManualActionEffectInTransaction(tx, context, actor, plan.id, effect.id, reason, reason);
    }
  }
  if (plan.status !== "application-failed") await approveActionEffectPlanInTransaction(tx, context, actor, plan.id, reason);
  return applyActionEffectPlanInternal(tx, context, actor, plan.id);
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
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
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
    ...(storedIncomingResolution(effectRow.authoredValueJson) && isRecord(effectRow.authoredValueJson)
      && effectRow.authoredValueJson.incomingApplicationSupported === true ? { applicationSupported: true } : {}),
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

export async function ruleIncomingActionEffectInTransaction(tx: ActionEffectPlanTransaction, context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor, planId: number, effectId: number,
  input: { disposition: "damage" | "healing" | "allow" | "prevent" | "location"; amount?: number; hitLocationNumber?: number; reason: string; ordinaryRuling?: OrdinaryAttackRuling }) {
  await assertCombatWritableInTransaction(tx, context.encounterId);
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId), row = await lockEffect(tx, plan, effectId);
  if (!["damage", "healing", "allow", "prevent", "location"].includes(input.disposition)) throw new Error("Choose a supported incoming effect ruling.");
  if (!["calculated", "requires-god-ruling", "approved", "partially-applied", "application-failed"].includes(plan.status)
    || ["applied", "manual-resolved", "declined"].includes(row.status)) throw new Error("Only an unapplied incoming effect accepts a ruling.");
  const reason = boundedReason(input.reason, "Incoming effect ruling");
  const resolution = storedIncomingResolution(row.authoredValueJson);
  if (!resolution || !isRecord(row.authoredValueJson)) throw new Error("This historical effect has no frozen incoming calculation.");
  const original = row.authoredValueJson.incomingOriginalEffect as MechanicalEffect;
  const application = isRecord(row.authoredValueJson.incomingOriginalApplication) ? structuredClone(row.authoredValueJson.incomingOriginalApplication) : {};
  if (input.hitLocationNumber !== undefined) {
    const location = resolution.input.target.applicationLocations?.find(({ number }) => number === input.hitLocationNumber);
    if (!location?.poolKey) throw new Error("Choose a hit location with an exact HP pool from this frozen target.");
    application.hitLocationNumber = location.number; application.poolKey = location.poolKey;
  }
  if (input.ordinaryRuling) application.ordinaryAttack = { ...(isRecord(application.ordinaryAttack) ? application.ordinaryAttack : {}), ruling: input.ordinaryRuling };
  let proposed = { ...proposalFromEffectRow(row), status: "calculated" as const, applicationSupported: true, godReviewRequired: false,
    finalValue: { effect: original, application }, authoredValue: row.authoredValueJson } as import("./action-effect-bridge").ActionEffectProposal;
  if (input.disposition === "location") {
    proposed = resolveIncomingEffectProposal({ ...proposed, authoredValue: { ...row.authoredValueJson, incomingEffectResolution: undefined } },
      { ...assertFrozenActionSourceSnapshot(plan.sourceSnapshotJson), incomingSourceFacts: resolution.input.source }, resolution.input.target);
  } else if (input.disposition === "damage" || input.disposition === "healing") {
    if (original.kind !== "health.damage" || !Number.isFinite(input.amount) || input.amount! < 0) throw new Error("A damage/healing ruling requires an incoming damage effect and an explicit nonnegative amount.");
    if (input.disposition === "healing" && !application.poolKey) throw new Error("Absorption healing requires its exact frozen incoming HP pool.");
    const effect: MechanicalEffect = input.disposition === "healing" ? { kind: "health.heal", amount: input.amount!, scope: "area" }
      : { ...original, amount: input.amount! };
    if (effect.kind === "health.damage" && effect.application !== "full-body" && !application.poolKey) throw new Error("Localized damage requires its exact frozen HP pool.");
    proposed = { ...proposed, effectType: effect.kind, finalValue: input.amount === 0 ? null : { effect, application },
      applicationSupported: input.amount !== 0, status: input.amount === 0 ? "declined" : "calculated" };
  } else if (input.disposition === "prevent") proposed = { ...proposed, finalValue: null, applicationSupported: false, status: "declined" };
  else if (original.kind === "health.damage") throw new Error("Choose an explicit damage or healing amount for this incoming damage ruling.");
  await tx.update(campaignSessionEncounterEffect).set({ ...incomingProposalFields(proposed), authoredValueJson: row.authoredValueJson,
    finalValueJson: proposed.finalValue, amendmentReason: reason, amendedByUserId: actor.userId, updatedAt: new Date() }).where(eq(campaignSessionEncounterEffect.id, row.id));
  const remaining = await tx.select({ status: campaignSessionEncounterEffect.status }).from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, plan.id));
  // Retain the application ledger when a ruling repairs an unfinished target.
  // Previously applied effects and costs must never become a fresh plan.
  const status = plan.status === "partially-applied" ? "partially-applied"
    : remaining.some((effect) => effect.status === "requires-god-ruling") ? "requires-god-ruling" : "calculated";
  await tx.update(campaignSessionEncounterEffectPlan).set({ status,
    reviewedAt: null, reviewedByUserId: null, updatedAt: new Date() }).where(eq(campaignSessionEncounterEffectPlan.id, plan.id));
  await recordEvent(tx, context, plan.id, plan.status, status, "incoming-effect-ruling", actor.userId, reason,
    { effectId, ruling: input, originalResolution: resolution, finalValue: proposed.finalValue });
}

/** A last explicit ruling completes an already-applied result; no new effect is approved here. */
async function completeSettledRemainder(tx: ActionEffectPlanTransaction, context: OwnedEncounterRuntimeContext, actor: GodActionEffectActor, plan: LoadedPlan) {
  if (plan.status !== "partially-applied") return;
  const effects = await tx.select({ status: campaignSessionEncounterEffect.status }).from(campaignSessionEncounterEffect)
    .where(eq(campaignSessionEncounterEffect.planId, plan.id));
  if (effects.length && effects.every(({ status }) => ["applied", "manual-resolved", "declined"].includes(status))) {
    await applyActionEffectPlanInternal(tx, context, actor, plan.id);
  }
}

export async function declineActionEffectInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  effectId: number,
  reasonInput: string,
): Promise<void> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  const effectRow = await lockEffect(tx, plan, effectId);
  if (effectRow.status === "declined") return;
  if (!["calculated", "requires-god-ruling", "approved", "partially-applied", "application-failed"].includes(plan.status)) throw new Error("This plan no longer accepts effect rulings.");
  if (effectRow.status === "applied" || effectRow.status === "manual-resolved") throw new Error("An applied or manually resolved effect cannot be declined.");
  const reason = boundedReason(reasonInput, "Decline reason");
  await tx.update(campaignSessionEncounterEffect).set({
    status: "declined",
    amendmentReason: reason,
    amendedByUserId: actor.userId,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterEffect.id, effectRow.id));
  await recordEvent(tx, context, plan.id, plan.status, plan.status, "effect-declined", actor.userId, reason, { effectId: effectRow.id });
  await completeSettledRemainder(tx, context, actor, plan);
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
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
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
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  const effectRow = await lockEffect(tx, plan, effectId);
  if (effectRow.status === "manual-resolved") return;
  if (!["calculated", "requires-god-ruling", "approved", "partially-applied"].includes(plan.status)) throw new Error("This plan no longer accepts manual resolutions.");
  if (effectRow.applicationSupported || effectRow.status === "applied" || effectRow.status === "declined") {
    throw new Error("Only an unresolved manual effect can receive a manual outcome.");
  }
  const outcome = boundedReason(outcomeInput, "Manual outcome");
  const reason = boundedReason(reasonInput, "Manual ruling reason");
  const now = new Date();
  const authored = isRecord(effectRow.authoredValueJson) ? effectRow.authoredValueJson : null;
  const boundaryKey = typeof authored?.allocationBoundaryKey === "string" ? authored.allocationBoundaryKey : null;
  if (boundaryKey) {
    let selectedBulletIndexes: number[] = [];
    try {
      const parsed = JSON.parse(outcome);
      selectedBulletIndexes = Array.isArray(parsed?.bulletIndices) ? parsed.bulletIndices : [];
    } catch {
      selectedBulletIndexes = outcome.split(",").map((value) => Number(value.trim().replace(/^bullet:/i, ""))).filter(Number.isSafeInteger);
    }
    const eligible = authored && Array.isArray(authored.eligibleBullets) ? authored.eligibleBullets.flatMap((value) => isRecord(value) && Number.isSafeInteger(value.bulletIndex) ? [Number(value.bulletIndex)] : []) : [];
    selectedBulletIndexes = [...new Set(selectedBulletIndexes)];
    if (!selectedBulletIndexes.length || selectedBulletIndexes.some((index) => !eligible.includes(index))) {
      throw new Error("Weapon-Hit allocation must select one or more eligible bullet indexes.");
    }
    const candidates = await tx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, plan.id)).for("update");
    const selectedFirstBullet = Math.min(...selectedBulletIndexes);
    const promotedRiders = new Set<string>();
    const promotedResources = new Set<number>();
    for (const candidate of candidates) {
      if (candidate.id === effectRow.id) continue;
      const candidateAuthored = isRecord(candidate.authoredValueJson) ? candidate.authoredValueJson : null;
      if (candidateAuthored?.allocationBoundaryKey !== boundaryKey) continue;
      const bulletIndex = Number(candidateAuthored.bulletIndex);
      const allocationRole = candidateAuthored.allocationRole;
      const powerId = Number(candidateAuthored.powerId);
      if (!selectedBulletIndexes.includes(bulletIndex)) {
        await tx.update(campaignSessionEncounterEffect).set({ status: "declined", amendmentReason: `G.O.D. allocation assigned the Power elsewhere: ${outcome}`, amendedByUserId: actor.userId, updatedAt: now })
          .where(eq(campaignSessionEncounterEffect.id, candidate.id));
        continue;
      }
      if (allocationRole === "additive-damage") {
        const candidateEffect = isRecord(candidateAuthored.effect) ? candidateAuthored.effect as MechanicalEffect : null;
        if (!isSimpleAdditiveWeaponHitDamage(candidateEffect)) throw new Error("The firearm additive Weapon-Hit candidate is malformed.");
        const [bulletEffect] = await tx.select().from(campaignSessionEncounterEffect).where(and(
          eq(campaignSessionEncounterEffect.planId, plan.id),
          eq(campaignSessionEncounterEffect.effectKey, `firearm-bullet:${bulletIndex}`),
        )).limit(1).for("update");
        if (!bulletEffect) throw new Error("The selected firearm bullet damage effect no longer exists.");
        const bulletAuthored = isRecord(bulletEffect.authoredValueJson) ? bulletEffect.authoredValueJson : {};
        const baseGrossDamage = typeof bulletAuthored.baseGrossDamage === "number" ? bulletAuthored.baseGrossDamage : bulletAuthored.grossDamage;
        const armor = bulletAuthored.armor;
        const soak = bulletAuthored.soak;
        if (typeof baseGrossDamage !== "number" || !Number.isFinite(baseGrossDamage)
          || typeof armor !== "number" || !Number.isFinite(armor)
          || typeof soak !== "number" || !Number.isFinite(soak)) {
          throw new Error("The selected firearm bullet has no numeric frozen protection calculation for additive damage.");
        }
        const existingAdditiveDamage = typeof bulletAuthored.weaponHitAdditiveDamage === "number" ? bulletAuthored.weaponHitAdditiveDamage : 0;
        const totalAdditiveDamage = existingAdditiveDamage + candidateEffect.amount;
        const grossDamage = baseGrossDamage + totalAdditiveDamage;
        const netDamage = Math.max(0, grossDamage - armor - soak);
        const candidateValue = isRecord(candidate.finalValueJson) ? candidate.finalValueJson : {};
        const application = isRecord(candidateValue.application) ? candidateValue.application : {};
        const nextAuthored = { ...bulletAuthored, grossDamage, proposedNetDamage: netDamage, weaponHitAdditiveDamage: totalAdditiveDamage,
          weaponHitDamageContributions: [...(Array.isArray(bulletAuthored.weaponHitDamageContributions) ? bulletAuthored.weaponHitDamageContributions : []), { powerId, amount: candidateEffect.amount }] };
        const approvedStatus = plan.status === "approved" ? "approved" as const : "calculated" as const;
        const frozenRecalculation = recalculateFrozenIncoming({ ...proposalFromEffectRow(bulletEffect), authoredValue: nextAuthored }, grossDamage);
        await tx.update(campaignSessionEncounterEffect).set(frozenRecalculation ? {
          ...incomingProposalFields(frozenRecalculation), status: frozenRecalculation.status === "calculated" ? approvedStatus : frozenRecalculation.status,
          amendmentReason: "G.O.D. allocated additive Weapon-Hit damage; recalculated using the original frozen target.", updatedAt: now,
        } : netDamage > 0
          ? {
            effectType: "health.damage", authoredValueJson: nextAuthored, calculatedValueJson: netDamage,
            finalValueJson: { effect: { kind: "health.damage", amount: netDamage, application: "localized" }, application },
            unit: "Health", resource: typeof application.poolKey === "string" ? application.poolKey : bulletEffect.resource,
            applicationSupported: true, godReviewRequired: false, status: approvedStatus,
            amendmentReason: "Additive Weapon-Hit damage was merged into the selected bullet.", updatedAt: now,
          }
          : {
            effectType: "firearm.bullet-fully-absorbed", authoredValueJson: nextAuthored, calculatedValueJson: 0,
            finalValueJson: null, applicationSupported: false, godReviewRequired: false, status: "declined",
            amendmentReason: "The selected bullet remained fully absorbed after additive Weapon-Hit damage.", amendedByUserId: actor.userId, updatedAt: now,
          }).where(eq(campaignSessionEncounterEffect.id, bulletEffect.id));
        await tx.update(campaignSessionEncounterEffect).set({
          status: "manual-resolved", applicationSupported: false, godReviewRequired: false,
          appliedResultJson: { kind: "firearm-additive-damage-merged", bulletIndex, amount: candidateEffect.amount },
          appliedAt: now, amendmentReason: "The selected additive Weapon-Hit damage was merged into the bullet consequence.", amendedByUserId: actor.userId, updatedAt: now,
        }).where(eq(campaignSessionEncounterEffect.id, candidate.id));
        continue;
      }
      if (allocationRole === "resource") {
        if (promotedResources.has(powerId) || bulletIndex !== selectedFirstBullet) {
          await tx.update(campaignSessionEncounterEffect).set({ status: "declined", amendmentReason: `G.O.D. allocation spends this Power's Charges once: ${outcome}`, amendedByUserId: actor.userId, updatedAt: now })
            .where(eq(campaignSessionEncounterEffect.id, candidate.id));
        } else {
          promotedResources.add(powerId);
          await tx.update(campaignSessionEncounterEffect).set({ applicationSupported: true, godReviewRequired: false, status: "approved", updatedAt: now })
            .where(eq(campaignSessionEncounterEffect.id, candidate.id));
        }
        continue;
      }
      const effectId = String(candidateAuthored.powerEffectId ?? "");
      const riderKey = `${powerId}:${effectId}`;
      if (promotedRiders.has(riderKey) || bulletIndex !== selectedFirstBullet) {
        await tx.update(campaignSessionEncounterEffect).set({ status: "declined", amendmentReason: `G.O.D. allocation applies this Weapon-Hit rider once: ${outcome}`, amendedByUserId: actor.userId, updatedAt: now })
          .where(eq(campaignSessionEncounterEffect.id, candidate.id));
      } else {
        promotedRiders.add(riderKey);
        const resolution = storedIncomingResolution(candidate.authoredValueJson);
        await tx.update(campaignSessionEncounterEffect).set(resolution?.status === "requires-god-ruling"
          ? { applicationSupported: false, godReviewRequired: true, status: "requires-god-ruling", updatedAt: now }
          : resolution?.status === "prevented" ? { applicationSupported: false, godReviewRequired: false, status: "declined", updatedAt: now }
          : { applicationSupported: true, godReviewRequired: false, status: "approved", updatedAt: now })
          .where(eq(campaignSessionEncounterEffect.id, candidate.id));
      }
    }
  }
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
  await completeSettledRemainder(tx, context, actor, plan);
}

export async function declineActionEffectPlanInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor,
  planId: number,
  reasonInput: string,
): Promise<void> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
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
    const firearmItemPowerSource = source.kind === "weapon" && source.authoredData.itemPowerResourceSource === true;
    if ((!firearmItemPowerSource && source.kind !== "item") || target.id !== plan.actorParticipantId) {
      throw new Error("The frozen Item resource identity is invalid.");
    }
    const itemIdValue = firearmItemPowerSource ? source.authoredData.itemPowerItemId : source.sourceId;
    if (typeof itemIdValue !== "number") throw new Error("The frozen Item resource identity is invalid.");
    const itemId = positiveId(itemIdValue, "Frozen Item");
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
      if (source.identity.startsWith("item-power:") || firearmItemPowerSource) {
        const spent = await spendExactItemPowerChargesInTransaction(tx, identity, amount);
        return { kind: "item-power-charges-spent", itemId, instanceId: source.sourceInstanceId, before: spent.before, after: spent.after, amount };
      }
      const before = await readItemChargeStateInTransaction(tx, identity, true);
      const spent = await spendItemChargesInTransaction(tx, identity);
      if (before.currentCharges - spent.currentCharges !== amount) throw new Error("The current Item Charge definition no longer matches the frozen action cost.");
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
  if (planned.status === "ready" && (final.effect.kind === "health.heal" || final.effect.kind === "health.damage") && final.effect.timing?.mode === "over-time") {
    const source = assertFrozenActionSourceSnapshot(plan.sourceSnapshotJson);
    const [initiative] = await tx.select({ roundNumber: campaignSessionEncounterInitiative.roundNumber, stepNumber: campaignSessionEncounterInitiative.stepNumber }).from(campaignSessionEncounterInitiative).where(eq(campaignSessionEncounterInitiative.encounterId, context.encounterId)).limit(1);
    if (!initiative) throw new Error("The Encounter Initiative Runtime is unavailable for a periodic Health Effect.");
    const periodicId = await bindPeriodicHealthEffectInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId, roundNumber: initiative.roundNumber, stepNumber: initiative.stepNumber }, {
      characterId: target.id,
      sourceKind: source.kind,
      sourceId: `action-effect:${effectRow.id}`,
      applicationKey: `action-effect:${effectRow.id}`,
      effectKind: final.effect.kind,
      amount: final.effect.amount,
      application: final.effect.kind === "health.heal" ? final.effect.scope : final.effect.application,
      poolKey: final.application.poolKey ?? null,
      hitLocationNumber: final.application.hitLocationNumber ?? null,
      frequency: final.effect.timing.frequency!,
      applications: final.effect.timing.applications!,
      firstApplication: final.effect.timing.firstApplication!,
      npcKind: target.npcKind,
    });
    return { kind: "periodic-health-bound", periodicId, summary: planned.summary, persistedIdentity: null, healthResult: null };
  }
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
  if ((final.effect.kind === "health.damage" || final.effect.kind === "health.heal") && final.effect.timing?.mode === "over-time") {
    const [initiative] = await tx.select({ roundNumber: campaignSessionEncounterInitiative.roundNumber, stepNumber: campaignSessionEncounterInitiative.stepNumber }).from(campaignSessionEncounterInitiative).where(eq(campaignSessionEncounterInitiative.encounterId, context.encounterId)).limit(1);
    if (!initiative) throw new Error("The Encounter Initiative Runtime is unavailable for a periodic Health Effect.");
    const application = localApplication(effectRow.finalValueJson);
    const periodicId = await bindPeriodicHealthEffectInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId, roundNumber: initiative.roundNumber, stepNumber: initiative.stepNumber }, {
      characterId: effectRow.targetParticipantId, sourceKind: "action-effect", sourceId: `action-effect:${effectRow.id}`, applicationKey: `action-effect:${effectRow.id}`,
      effectKind: final.effect.kind, amount: final.effect.amount,
      application: final.effect.kind === "health.heal" ? final.effect.scope : final.effect.application,
      poolKey: application.poolKey as string | null | undefined, hitLocationNumber: application.hitLocationNumber as number | null | undefined,
      frequency: final.effect.timing.frequency!, applications: final.effect.timing.applications!, firstApplication: final.effect.timing.firstApplication!, npcKind: "creature",
    });
    return { kind: "periodic-health-bound", periodicId };
  }
  const { captureCombatModifierTimingInTransaction, reconcileCombatModifierTimingInTransaction } = await import("./combat-modifier-timing-service");
  const combatTiming = final.effect.kind === "modifier.apply"
    ? await captureCombatModifierTimingInTransaction(tx, effectRow.targetParticipantId, [final.effect]) : [];
  const next = structuredClone(participant.localState);
  const appliedAt = new Date().toISOString();
  if (final.effect.kind === "health.damage" || final.effect.kind === "health.heal") {
    const application = localApplication(effectRow.finalValueJson);
    return applyDirectCreatureHealthInTransaction(tx, {
      encounterId: context.encounterId, sceneId: context.sceneId, sessionId: context.sessionId, campaignId: context.campaignId,
      participantId: effectRow.targetParticipantId, effectKind: final.effect.kind, amount: final.effect.amount,
      application: final.effect.kind === "health.heal" ? final.effect.scope : final.effect.application === "full-body" ? "full-body" : "area",
      poolKey: application.poolKey as string | null | undefined, hitLocationNumber: application.hitLocationNumber as number | null | undefined,
    });
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
  await reconcileCombatModifierTimingInTransaction(tx, combatTiming);
  return { kind: final.effect.kind, occurrenceLocal: true, effectPlanEffectId: effectRow.id };
}

async function applySupportedEffects(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  plan: LoadedPlan,
): Promise<number[]> {
  let effects = await tx.select().from(campaignSessionEncounterEffect)
    .where(eq(campaignSessionEncounterEffect.planId, plan.id))
    .orderBy(asc(campaignSessionEncounterEffect.id))
    .for("update");
  // A receipt for a paid/applied effect permits retry after consuming the source.
  if (plan.sourceKind === "item" && !effects.some(row => row.status === "applied")) {
    const source = assertFrozenActionSourceSnapshot(plan.sourceSnapshotJson);
    if (source.sourceInstanceId !== null) await assertExactInventoryAvailable(tx, plan.actorParticipantId, source.sourceInstanceId);
    else await assertLooseStackAvailable(tx, plan.actorParticipantId, Number(source.sourceId), 1);
  }
  if (plan.sourceKind === "weapon" && plan.sourceIdentity.startsWith("firearm-attack:")) {
    const source = assertFrozenActionSourceSnapshot(plan.sourceSnapshotJson);
    const costs = effects.filter(({ effectType, status }) => effectType === "resource.item-charges" && ["approved", "application-failed"].includes(status))
      .map((entry) => ({ powerId: Number(isRecord(entry.authoredValueJson) ? entry.authoredValueJson.powerId : NaN),
        amount: isRecord(entry.finalValueJson) ? Number(entry.finalValueJson.amount) : null }));
    const skipped = await unavailableWeaponHitPowers(tx, { characterId: plan.actorParticipantId, itemId: Number(source.authoredData.itemPowerItemId), instanceId: source.sourceInstanceId }, costs);
    if (skipped.size) {
      for (const entry of effects.filter(({ status }) => ["approved", "application-failed"].includes(status))) {
        const authored = isRecord(entry.authoredValueJson) ? entry.authoredValueJson : {};
        const reason = skipped.get(Number(authored.powerId));
        if (reason) {
          await tx.update(campaignSessionEncounterEffect).set({ status: "declined", applicationSupported: false, finalValueJson: null, amendmentReason: reason, updatedAt: new Date() }).where(eq(campaignSessionEncounterEffect.id, entry.id));
        } else if (entry.effectKey.startsWith("firearm-bullet:") && Array.isArray(authored.weaponHitDamageContributions)) {
          const removed = authored.weaponHitDamageContributions.reduce((sum: number, value) => sum + (isRecord(value) && skipped.has(Number(value.powerId)) ? Number(value.amount) : 0), 0);
          if (removed && typeof authored.grossDamage === "number" && typeof authored.armor === "number" && typeof authored.soak === "number") {
            const gross = authored.grossDamage - removed;
            const revised = recalculateFrozenIncoming(proposalFromEffectRow(entry), gross);
            if (revised) {
              await tx.update(campaignSessionEncounterEffect).set({ ...incomingProposalFields(revised),
                status: revised.status === "calculated" ? "approved" : revised.status,
                amendmentReason: "Unavailable optional Weapon-Hit damage removed using the frozen target calculation.", updatedAt: new Date() }).where(eq(campaignSessionEncounterEffect.id, entry.id));
              continue;
            }
            const net = Math.max(0, gross - authored.armor - authored.soak);
            const previous = isRecord(entry.finalValueJson) ? entry.finalValueJson : {};
            await tx.update(campaignSessionEncounterEffect).set({ calculatedValueJson: net,
              finalValueJson: net > 0 ? { ...previous, effect: { kind: "health.damage", application: "localized", amount: net } } : null,
              status: net > 0 ? "approved" : "declined", applicationSupported: net > 0,
              authoredValueJson: { ...authored, appliedGrossDamage: gross, appliedNetDamage: net, skippedWeaponHitPowerIds: [...skipped.keys()] },
              amendmentReason: "Unavailable optional Weapon-Hit damage removed before applying the base bullet.", updatedAt: new Date() }).where(eq(campaignSessionEncounterEffect.id, entry.id));
          }
        }
      }
      effects = await tx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, plan.id)).orderBy(asc(campaignSessionEncounterEffect.id));
    }
  }
  if (plan.sourceKind === "weapon" && !plan.sourceIdentity.startsWith("firearm-attack:")) {
    const source = assertFrozenActionSourceSnapshot(plan.sourceSnapshotJson);
    const unpaid = effects.filter(({ effectType, status }) => effectType === "resource.item-charges" && ["approved", "application-failed"].includes(status));
    if (unpaid.length) {
      const { skipped } = await availableWeaponHitSource(tx, source);
      if (unpaid.some(({ effectKey }) => skipped.has(Number(/^cost:item-power:(\d+):/.exec(effectKey)?.[1])))) {
        const incomingBase = effects.find(({ effectKey, authoredValueJson }) => effectKey.startsWith("ordinary-attack:target:") && storedIncomingResolution(authoredValueJson));
        if (incomingBase) {
          const removed = source.effects.reduce((amount, entry) => skipped.has(Number(/^item-power:(\d+):/.exec(entry.key)?.[1])) && isSimpleAdditiveWeaponHitDamage(entry.effect)
            ? amount + entry.effect.amount : amount, 0);
          for (const entry of effects.filter(({ status }) => ["approved", "application-failed"].includes(status))) {
            const resolution = storedIncomingResolution(entry.authoredValueJson);
            if (entry.effectKey.startsWith("ordinary-attack:target:") && resolution && removed) {
              const next = recalculateFrozenIncoming(proposalFromEffectRow(entry), Math.max(0, (resolution.input.effect.amount ?? 0) - removed))!;
              await tx.update(campaignSessionEncounterEffect).set({ ...incomingProposalFields(next), status: next.status === "calculated" ? "approved" : next.status,
                amendmentReason: "Unavailable Weapon-Hit damage removed using the frozen target.", updatedAt: new Date() }).where(eq(campaignSessionEncounterEffect.id, entry.id));
            } else if (skipped.has(Number(/^(?:cost:)?item-power:(\d+):/.exec(entry.effectKey)?.[1]))) {
              await tx.update(campaignSessionEncounterEffect).set({ finalValueJson: null, applicationSupported: false, status: "declined",
                amendmentReason: "Optional Weapon-Hit Power no longer has its required Charges.", updatedAt: new Date() }).where(eq(campaignSessionEncounterEffect.id, entry.id));
            }
          }
        } else {
        const [declaration] = await tx.select().from(campaignSessionEncounterActionDeclaration).where(eq(campaignSessionEncounterActionDeclaration.id, plan.declarationId));
        const locked = parseLockedActionDeclarationSnapshot(declaration.lockedSnapshotJson);
        const base = effects.find(({ effectKey }) => effectKey.startsWith("ordinary-attack:target:"));
        const application = isRecord(base?.finalValueJson) && isRecord(base.finalValueJson.application) ? base.finalValueJson.application : {};
        const ordinary = isRecord(application.ordinaryAttack) ? application.ordinaryAttack : {};
        const roll = parseRollMechanicalSnapshot(plan.governingRollSnapshotJson);
        if (!roll) throw new Error("The ordinary attack lost its frozen Roll.");
        const rebuilt = await buildOrdinaryAttackConsequenceProposalInTransaction(tx, context, locked,
          roll, isRecord(plan.defenseResolutionJson) ? plan.defenseResolutionJson : null,
          isRecord(ordinary.ruling) ? ordinary.ruling as OrdinaryAttackRuling : undefined, false);
        for (const prior of effects.filter(({ status }) => ["approved", "application-failed"].includes(status))) {
          const next = rebuilt.effects.find(({ effectKey }) => effectKey === prior.effectKey);
          await tx.update(campaignSessionEncounterEffect).set({ finalValueJson: next?.finalValue ?? null,
            calculatedValueJson: next?.calculatedValue ?? null, applicationSupported: next?.applicationSupported ?? false,
            status: next?.status === "calculated" ? "approved" : "declined",
            amendmentReason: "Optional Weapon-Hit availability rechecked at application; unavailable riders skipped without blocking base damage.", updatedAt: new Date() })
            .where(eq(campaignSessionEncounterEffect.id, prior.id));
        }
        }
        effects = await tx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, plan.id)).orderBy(asc(campaignSessionEncounterEffect.id));
      }
    }
  }
  const applicable = effects.filter((effect) => effect.applicationSupported && (effect.status === "approved" || effect.status === "application-failed"));
  const appliedIds: number[] = [];
  for (const effectRow of applicable) {
    const areaReport = effectRow.effectType === "spell.area-report";
    if (areaReport && (plan.sourceKind !== "spell" || !isRecord(effectRow.finalValueJson) || !isRecord(effectRow.finalValueJson.areaReport))) {
      throw new Error("The area report must come from its frozen spell result.");
    }
    const result = areaReport ? { kind: "spell-area-report", report: effectRow.finalValueJson, combatantsAffected: false } : effectRow.targetParticipantId < 0
      ? await applyDirectCreatureEffect(tx, context, effectRow)
      : await applyCharacterEffect(tx, context, plan, effectRow);
    await tx.update(campaignSessionEncounterEffect).set({
      status: "applied",
      appliedResultJson: areaReport ? result : await recordCombatDamageOutcomeInTransaction(tx, context, effectRow, result),
      appliedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(campaignSessionEncounterEffect.id, effectRow.id));
    appliedIds.push(effectRow.id);
  }
  const { reconcileCombatRecoveryInTransaction } = await import("./combat-spell-recovery-service");
  for (const id of new Set(applicable.filter((effect) => effect.effectType !== "spell.area-report").map(({ targetParticipantId }) => targetParticipantId))) {
    await reconcileCombatRecoveryInTransaction(tx, context, id);
  }
  return appliedIds;
}

async function applyActionEffectPlanInternal(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor,
  planId: number,
  resolveDeclaration = true,
): Promise<ActionEffectPlanStatus> {
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
  if (nextStatus === "applied" && resolveDeclaration) {
    const [timing] = await tx.select({ status: campaignSessionEncounterPendingAction.status }).from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.id, plan.pendingActionId));
    if (plan.firearmPortion === 0 || timing?.status === "completed") {
      await resolveActionDeclarationInTransaction(tx, context, actor, plan.declarationId, "Approved consequences were applied or explicitly resolved.");
    }
  }
  return nextStatus;
}

export async function readActionEffectWorkspaceInTransaction(
  tx: ActionEffectPlanTransaction,
  context: OwnedEncounterRuntimeContext,
): Promise<ActionEffectWorkspaceView> {
  await assertNoOpenDeclarationCheckpoint(tx, context.encounterId);
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

export async function generateActionEffectPlanInTransaction(tx: ActionEffectPlanTransaction, context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor, declarationId: number, ruling?: OrdinaryAttackRuling, aoeSelections: Readonly<Record<string, readonly number[]>> = {}): Promise<number> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  assertGod(context, actor);
  return generateActionEffectPlanInternal(tx, context, actor, declarationId, ruling, aoeSelections);
}

export async function applyActionEffectPlanInTransaction(tx: ActionEffectPlanTransaction, context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor, planId: number): Promise<ActionEffectPlanStatus> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  assertGod(context, actor);
  return applyActionEffectPlanInternal(tx, context, actor, planId);
}

/** Explicit G.O.D. correction of approved Health outcomes retained after closeout.
 * Uses the normal effect receipts and Health services, never reopens combat or
 * replays a source's resource costs. Unsupported historical work stays a ruling.
 */
export async function completeRetainedCombatEffectPlanInTransaction(tx: ActionEffectPlanTransaction, encounterId: number,
  actor: ActionDeclarationActor, input: { planId: number; reason: string }) {
  return tx.transaction(async (recoveryTx) => {
    if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may complete retained combat consequences.");
    const { lockEncounterCloseoutContextInTransaction } = await import("./encounter-closeout-service");
    const context = await lockEncounterCloseoutContextInTransaction(recoveryTx, encounterId, actor.userId);
    await assertCombatWritableInTransaction(recoveryTx, encounterId);
    await assertNoOpenDeclarationCheckpoint(recoveryTx, encounterId);
    const reason = boundedReason(input.reason, "Historical completion ruling");
    if (context.encounterStatus !== "completed") throw new Error("Use ordinary consequence application for an active Encounter.");
    const plan = await lockPlan(recoveryTx, context, input.planId);
    if (plan.status === "applied" || plan.status === "declined") return { planId: plan.id, status: plan.status, reused: true };
    const [timing] = await recoveryTx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, plan.pendingActionId)).for("update");
    const [declaration] = await recoveryTx.select().from(campaignSessionEncounterActionDeclaration).where(eq(campaignSessionEncounterActionDeclaration.id, plan.declarationId)).for("update");
    if (!timing || timing.status !== "completed" || timing.remainingInitiativeCost !== 0 || !declaration) throw new Error("Historical completion requires the exact action's already-completed Initiative timing.");
    const { assertDeclarationCheckpointRevealed } = await import("./declaration-checkpoint-service");
    await assertDeclarationCheckpointRevealed(recoveryTx, declaration.checkpointId);
    const effects = await recoveryTx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, plan.id)).for("update");
    const allDeclined = effects.length > 0 && effects.every(({ status }) => status === "declined");
    let status: ActionEffectPlanStatus;
    if (allDeclined) {
      status = "declined";
      await recoveryTx.update(campaignSessionEncounterEffectPlan).set({ status, updatedAt: new Date() }).where(eq(campaignSessionEncounterEffectPlan.id, plan.id));
    } else {
      if (!["approved", "partially-applied", "application-failed"].includes(plan.status)) throw new Error("Only previously approved retained consequences may be completed.");
      const remaining = effects.filter(({ status }) => !["applied", "manual-resolved", "declined"].includes(status));
      if (remaining.some((effect) => effect.appliedAt !== null || !effect.applicationSupported || !["approved", "application-failed"].includes(effect.status)
        || !["health.damage", "health.heal"].includes(effect.effectType))) throw new Error("Historical automatic recovery supports approved Health consequences only; resource or duration changes require a separate explicit recovery ruling.");
      status = await applyActionEffectPlanInternal(recoveryTx, context, actor, plan.id, false);
      if (status !== "applied") throw new Error("The retained approved consequences could not be completed. No recovery changes were committed.");
    }
    const now = new Date();
    const relatedPlans = await recoveryTx.select({ status: campaignSessionEncounterEffectPlan.status }).from(campaignSessionEncounterEffectPlan)
      .where(eq(campaignSessionEncounterEffectPlan.declarationId, declaration.id));
    const allPlansSettled = relatedPlans.every(({ status }) => ["applied", "declined", "cancelled", "superseded"].includes(status));
    const correctedDeclarationStatus = allPlansSettled ? "resolved" as const : declaration.status;
    if (allPlansSettled) await recoveryTx.update(campaignSessionEncounterActionDeclaration).set({ status: correctedDeclarationStatus, rulingReason: reason,
      endedByUserId: actor.userId, endedAt: now, updatedAt: now }).where(eq(campaignSessionEncounterActionDeclaration.id, declaration.id));
    await recoveryTx.insert(campaignSessionEncounterActionDeclarationEvent).values({ declarationId: declaration.id, encounterId,
      sceneId: context.sceneId, sessionId: context.sessionId, campaignId: context.campaignId,
      fromStatus: declaration.status, toStatus: correctedDeclarationStatus, eventKind: "historical-consequences-completed", actorUserId: actor.userId, reason,
      metadata: { planId: plan.id, planStatus: status, allPlansSettled, timingReplayed: false, resourcesReplayed: false } });
    await recordEvent(recoveryTx, context, plan.id, plan.status, status, "historical-consequences-completed", actor.userId, reason,
      { originalDeclarationStatus: declaration.status, correctedDeclarationStatus, noNewResourceCosts: true });
    return { planId: plan.id, status, reused: false };
  });
}

/** Exact owner execution of objectively supported completed consequences, with actual caller attribution. */
export async function applyRoutineCombatConsequencesInTransaction(tx: ActionEffectPlanTransaction, context: OwnedEncounterRuntimeContext,
  actor: ActionDeclarationActor, declarationId: number, exactPlanId?: number): Promise<{ planId: number; status: ActionEffectPlanStatus }> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  const [declaration] = await tx.select().from(campaignSessionEncounterActionDeclaration).where(and(
    eq(campaignSessionEncounterActionDeclaration.id, declarationId), eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!declaration) throw new Error("That exact combat declaration no longer exists.");
  // Applying an already chosen, completed outcome is G.O.D. authority too;
  // it must not be confused with choosing a Player's declaration for them.
  if (actor.authority === "god-owner") assertGod(context, actor);
  else await assertActionChoiceAuthority(tx, context, actor, declaration.actorCharacterId);
  await assertNoOpenDeclarationCheckpoint(tx, context.encounterId);
  const planId = exactPlanId ?? await generateActionEffectPlanInternal(tx, context, actor, declarationId);
  const plan = await lockPlan(tx, context, planId);
  if (plan.declarationId !== declarationId) throw new Error("The consequence plan does not belong to this exact declaration.");
  if (plan.status === "applied") return { planId, status: "applied" };
  const effects = await tx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, planId));
  if (plan.status !== "calculated" || effects.some((effect) => effect.godReviewRequired
    || !["calculated", "declined"].includes(effect.status) || effect.status !== "declined" && !effect.applicationSupported)) {
    return { planId, status: plan.status };
  }
  const now = new Date();
  await tx.update(campaignSessionEncounterEffect).set({ status: "approved", updatedAt: now }).where(and(
    eq(campaignSessionEncounterEffect.planId, planId), eq(campaignSessionEncounterEffect.status, "calculated"),
  ));
  await tx.update(campaignSessionEncounterEffectPlan).set({ status: "approved", reviewedByUserId: actor.userId, reviewedAt: now, updatedAt: now })
    .where(eq(campaignSessionEncounterEffectPlan.id, planId));
  await recordEvent(tx, context, planId, "calculated", "approved", "routine-consequences-confirmed", actor.userId,
    "The action owner confirmed objectively supported consequences; no narrative ruling was inferred.");
  return { planId, status: await applyActionEffectPlanInternal(tx, context, actor, planId) };
}

export async function ruleOrdinaryAttackConsequenceInTransaction(tx: ActionEffectPlanTransaction, context: OwnedEncounterRuntimeContext,
  actor: GodActionEffectActor, planId: number, ruling: OrdinaryAttackRuling): Promise<void> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  assertGod(context, actor);
  const plan = await lockPlan(tx, context, planId);
  const [incoming] = await tx.select().from(campaignSessionEncounterEffect).where(and(eq(campaignSessionEncounterEffect.planId, planId),
    eq(campaignSessionEncounterEffect.effectKey, `ordinary-attack:target:${ruling.targetParticipantId}`))).limit(1);
  if (incoming && storedIncomingResolution(incoming.authoredValueJson)) {
    await ruleIncomingActionEffectInTransaction(tx, context, actor, planId, incoming.id, { disposition: ruling.finalDamage === undefined ? "location" : "damage",
      amount: ruling.finalDamage, hitLocationNumber: ruling.hitLocationNumber, reason: ruling.reason, ordinaryRuling: ruling });
    const related = await tx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, planId));
    const location = storedIncomingResolution(incoming.authoredValueJson)!.input.target.applicationLocations?.find(({ number }) => number === ruling.hitLocationNumber);
    for (const entry of related) {
      if (entry.id === incoming.id || ["declined", "applied", "manual-resolved"].includes(entry.status) || !entry.applicationSupported) continue;
      if (entry.targetParticipantId !== ruling.targetParticipantId && !entry.effectType.startsWith("resource.")) continue;
      const resolution = storedIncomingResolution(entry.authoredValueJson);
      if (resolution?.status === "requires-god-ruling") continue;
      const final = isRecord(entry.finalValueJson) ? entry.finalValueJson : {};
      const application = isRecord(final.application) ? final.application : {};
      let next = { ...proposalFromEffectRow(entry), status: "calculated" as const, godReviewRequired: false,
        finalValue: entry.effectType.startsWith("resource.") ? entry.finalValueJson : { ...final, application: { ...application, hitLocationNumber: ruling.hitLocationNumber, poolKey: location?.poolKey } } } as import("./action-effect-bridge").ActionEffectProposal;
      if (resolution && isRecord(entry.authoredValueJson)) {
        next = resolveIncomingEffectProposal({ ...next, authoredValue: { ...entry.authoredValueJson, incomingEffectResolution: undefined },
          finalValue: { effect: entry.authoredValueJson.incomingOriginalEffect, application: { ...application, hitLocationNumber: ruling.hitLocationNumber, poolKey: location?.poolKey } } },
          { ...assertFrozenActionSourceSnapshot(plan.sourceSnapshotJson), incomingSourceFacts: resolution.input.source }, resolution.input.target);
      }
      await tx.update(campaignSessionEncounterEffect).set({ ...incomingProposalFields(next), authoredValueJson: entry.authoredValueJson,
        amendmentReason: ruling.reason, amendedByUserId: actor.userId, updatedAt: new Date() }).where(eq(campaignSessionEncounterEffect.id, entry.id));
    }
    const remaining = await tx.select({ status: campaignSessionEncounterEffect.status }).from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, planId));
    await tx.update(campaignSessionEncounterEffectPlan).set({ status: remaining.some(({ status }) => status === "requires-god-ruling") ? "requires-god-ruling" : "calculated" }).where(eq(campaignSessionEncounterEffectPlan.id, planId));
    return;
  }
  if (!["calculated", "requires-god-ruling", "approved"].includes(plan.status)) throw new Error("Only unapplied ordinary consequences may receive a new ruling.");
  const [declaration] = await tx.select().from(campaignSessionEncounterActionDeclaration)
    .where(eq(campaignSessionEncounterActionDeclaration.id, plan.declarationId)).limit(1);
  if (!declaration) throw new Error("The originating declaration no longer exists.");
  const locked = parseLockedActionDeclarationSnapshot(declaration.lockedSnapshotJson);
  const roll = parseRollMechanicalSnapshot(plan.governingRollSnapshotJson);
  if (!roll) throw new Error("The original immutable attack Roll is required.");
  const proposals = await buildOrdinaryAttackConsequenceProposalInTransaction(tx, context, locked, roll,
    isRecord(plan.defenseResolutionJson) ? plan.defenseResolutionJson : null, ruling, false);
  const proposal = proposals.effects.find(({ targetParticipantId }) => targetParticipantId === ruling.targetParticipantId);
  if (!proposal) throw new Error("The ruling target is not in this ordinary attack.");
  const existingEffects = await tx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, planId)).for("update");
  const proposalByKey = new Map(proposals.effects.map((entry) => [entry.effectKey, entry]));
  const effect = existingEffects.find(({ effectKey }) => effectKey === proposal.effectKey);
  if (!effect || effect.status === "applied") throw new Error("The original target effect is missing or already applied.");
  for (const existing of existingEffects) {
    const updated = proposalByKey.get(existing.effectKey);
    if (!updated || existing.status === "applied") continue;
    await tx.update(campaignSessionEncounterEffect).set({ finalValueJson: updated.finalValue,
      applicationSupported: updated.applicationSupported, godReviewRequired: updated.godReviewRequired, status: updated.status,
      amendmentReason: ruling.reason, amendedByUserId: actor.userId, updatedAt: new Date() }).where(eq(campaignSessionEncounterEffect.id, existing.id));
  }
  const remaining = await tx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, planId));
  const status = remaining.some(({ status }) => status === "requires-god-ruling") ? "requires-god-ruling" : "calculated";
  await tx.update(campaignSessionEncounterEffectPlan).set({ status, reviewedByUserId: null, reviewedAt: null, updatedAt: new Date() })
    .where(eq(campaignSessionEncounterEffectPlan.id, planId));
  await recordEvent(tx, context, planId, plan.status, status, "ordinary-attack-ruling", actor.userId, ruling.reason,
    { effectId: effect.id, previousFinalValue: effect.finalValueJson, finalValue: proposal.finalValue });
}

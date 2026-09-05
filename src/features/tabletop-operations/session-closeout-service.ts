import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { assertOwnedRootManager } from "@/features/lifecycle/policy";
import type { LifecycleActor } from "@/features/lifecycle/types";
import {
  campaignCharacter,
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
} from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEffectDurationBinding,
  campaignSessionEncounter,
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterPendingActionSource,
  campaignSessionEncounterReaction,
  campaignSessionEncounterReward,
  campaignSessionCalledCheckBatch,
  campaignSessionCalledCheckRequest,
  campaignSessionHighLowRequest,
  campaignSessionRoll,
  campaignSessionRollAmendment,
  campaignSessionRoster,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";

import { assertCampaignSessionOwner, transitionSession } from "./session-foundation";
import {
  buildSessionCloseoutBlockers,
  buildSessionCloseoutWarnings,
  type SessionCloseoutBlocker,
  type SessionCloseoutWarning,
} from "./session-closeout";

export type SessionCloseoutTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SessionCloseoutContext = {
  sessionId: number;
  campaignId: number;
  title: string;
  sequenceNumber: number;
  status: "planned" | "active" | "completed";
  startedAt: Date | null;
  completedAt: Date | null;
  ownerUserId: string;
};

export type SessionCloseoutUnboundDuration = {
  effectKind: "condition" | "modifier";
  effectId: number;
  characterId: number;
  characterName: string;
  effectLabel: string;
  durationLabel: string;
};

export type SessionCloseoutView = {
  session: {
    id: number;
    campaignId: number;
    title: string;
    sequenceNumber: number;
    status: "planned" | "active" | "completed";
    completedAt: string | null;
  };
  scenes: {
    planned: number;
    active: number;
    completed: number;
    total: number;
  };
  encounters: {
    planned: number;
    active: number;
    completed: number;
    total: number;
  };
  activeContext: {
    sceneId: number | null;
    sceneTitle: string | null;
    encounterId: number | null;
    encounterTitle: string | null;
    initiative: { roundNumber: number; stepNumber: number } | null;
  };
  blockers: SessionCloseoutBlocker[];
  warnings: SessionCloseoutWarning[];
  unboundDurations: SessionCloseoutUnboundDuration[];
  rewards: {
    recipients: Array<{ characterId: number; characterName: string; amount: number }>;
    totalExperience: number;
    rewardRows: number;
  };
  rolls: {
    total: number;
    random: number;
    entered: number;
    tableVisible: number;
    private: number;
    godOnly: number;
    voided: number;
  };
  canFinalize: boolean;
};

function positiveId(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function statusCounts(rows: ReadonlyArray<{ status: "planned" | "active" | "completed" }>) {
  return {
    planned: rows.filter(({ status }) => status === "planned").length,
    active: rows.filter(({ status }) => status === "active").length,
    completed: rows.filter(({ status }) => status === "completed").length,
    total: rows.length,
  };
}

export async function lockSessionCloseoutContextInTransaction(
  tx: SessionCloseoutTransaction,
  sessionId: number,
  actor: string | LifecycleActor,
): Promise<SessionCloseoutContext> {
  const [context] = await tx.select({
    sessionId: campaignSession.id,
    campaignId: campaignSession.campaignId,
    title: campaignSession.title,
    sequenceNumber: campaignSession.sequenceNumber,
    status: campaignSession.status,
    startedAt: campaignSession.startedAt,
    completedAt: campaignSession.completedAt,
    ownerUserId: campaign.createdByUserId,
  }).from(campaignSession)
    .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
    .where(eq(campaignSession.id, positiveId(sessionId, "Session")))
    .limit(1)
    .for("update", { of: campaignSession });
  if (!context) throw new Error("That Session no longer exists.");
  if (typeof actor === "string") {
    assertCampaignSessionOwner(context.ownerUserId, actor);
  } else {
    assertOwnedRootManager(actor, context.ownerUserId, "Session");
  }
  return context;
}

export async function readSessionCloseoutInTransaction(
  tx: SessionCloseoutTransaction,
  context: SessionCloseoutContext,
): Promise<SessionCloseoutView> {
  const scenes = await tx.select({
    id: campaignSessionScene.id,
    title: campaignSessionScene.title,
    status: campaignSessionScene.status,
  }).from(campaignSessionScene)
    .where(and(
      eq(campaignSessionScene.sessionId, context.sessionId),
      eq(campaignSessionScene.campaignId, context.campaignId),
    )).orderBy(asc(campaignSessionScene.sequenceNumber), asc(campaignSessionScene.id));
  const encounters = await tx.select({
    id: campaignSessionEncounter.id,
    sceneId: campaignSessionEncounter.sceneId,
    title: campaignSessionEncounter.title,
    status: campaignSessionEncounter.status,
  }).from(campaignSessionEncounter)
    .where(and(
      eq(campaignSessionEncounter.sessionId, context.sessionId),
      eq(campaignSessionEncounter.campaignId, context.campaignId),
    )).orderBy(asc(campaignSessionEncounter.sceneId), asc(campaignSessionEncounter.sequenceNumber), asc(campaignSessionEncounter.id));
  const initiatives = await tx.select({
    encounterId: campaignSessionEncounterInitiative.encounterId,
    status: campaignSessionEncounterInitiative.status,
    roundNumber: campaignSessionEncounterInitiative.roundNumber,
    stepNumber: campaignSessionEncounterInitiative.stepNumber,
  }).from(campaignSessionEncounterInitiative)
    .where(and(
      eq(campaignSessionEncounterInitiative.sessionId, context.sessionId),
      eq(campaignSessionEncounterInitiative.campaignId, context.campaignId),
    )).orderBy(asc(campaignSessionEncounterInitiative.encounterId));
  const pendingActions = await tx.select({
    encounterId: campaignSessionEncounterPendingAction.encounterId,
    actorCharacterId: campaignSessionEncounterPendingAction.actorCharacterId,
    label: campaignSessionEncounterPendingAction.label,
    status: campaignSessionEncounterPendingAction.status,
  }).from(campaignSessionEncounterPendingAction)
    .where(and(
      eq(campaignSessionEncounterPendingAction.sessionId, context.sessionId),
      eq(campaignSessionEncounterPendingAction.campaignId, context.campaignId),
    )).orderBy(asc(campaignSessionEncounterPendingAction.id));
  const actionDeclarations = await tx.select({
    encounterId: campaignSessionEncounterActionDeclaration.encounterId,
    actorCharacterId: campaignSessionEncounterActionDeclaration.actorCharacterId,
    label: sql<string>`coalesce(${campaignSessionEncounterActionDeclaration.draftJson} ->> 'label', 'Action')`,
    status: campaignSessionEncounterActionDeclaration.status,
  }).from(campaignSessionEncounterActionDeclaration)
    .where(and(
      eq(campaignSessionEncounterActionDeclaration.sessionId, context.sessionId),
      eq(campaignSessionEncounterActionDeclaration.campaignId, context.campaignId),
    )).orderBy(asc(campaignSessionEncounterActionDeclaration.id));
  const authoredActions = await tx.select({
    encounterId: campaignSessionEncounterPendingActionSource.encounterId,
    sourceCharacterId: campaignSessionEncounterPendingActionSource.sourceCharacterId,
    label: campaignSessionEncounterPendingAction.label,
    resolutionStatus: campaignSessionEncounterPendingActionSource.resolutionStatus,
  }).from(campaignSessionEncounterPendingActionSource)
    .innerJoin(campaignSessionEncounterPendingAction, eq(
      campaignSessionEncounterPendingAction.id,
      campaignSessionEncounterPendingActionSource.pendingActionId,
    )).where(and(
      eq(campaignSessionEncounterPendingActionSource.sessionId, context.sessionId),
      eq(campaignSessionEncounterPendingActionSource.campaignId, context.campaignId),
    )).orderBy(asc(campaignSessionEncounterPendingActionSource.id));
  const reactions = await tx.select({
    encounterId: campaignSessionEncounterReaction.encounterId,
    reactorCharacterId: campaignSessionEncounterReaction.reactorCharacterId,
    reactionType: campaignSessionEncounterReaction.reactionType,
    status: campaignSessionEncounterReaction.status,
  }).from(campaignSessionEncounterReaction)
    .where(and(
      eq(campaignSessionEncounterReaction.sessionId, context.sessionId),
      eq(campaignSessionEncounterReaction.campaignId, context.campaignId),
    )).orderBy(asc(campaignSessionEncounterReaction.id));
  const calledChecks = await tx.select({
    sceneId: campaignSessionCalledCheckRequest.sceneId,
    encounterId: campaignSessionCalledCheckRequest.encounterId,
    recipientCharacterId: campaignSessionCalledCheckRequest.recipientCharacterId,
    recipientName: campaignCharacter.name,
    purpose: campaignSessionCalledCheckBatch.purpose,
    visibility: campaignSessionCalledCheckBatch.visibility,
    issuedAt: campaignSessionCalledCheckRequest.issuedAt,
  }).from(campaignSessionCalledCheckRequest)
    .innerJoin(campaignSessionCalledCheckBatch, eq(campaignSessionCalledCheckBatch.id, campaignSessionCalledCheckRequest.batchId))
    .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionCalledCheckRequest.recipientCharacterId))
    .where(and(
      eq(campaignSessionCalledCheckRequest.sessionId, context.sessionId),
      eq(campaignSessionCalledCheckRequest.campaignId, context.campaignId),
      inArray(campaignSessionCalledCheckRequest.status, ["pending", "requires-god-ruling"]),
    )).orderBy(asc(campaignSessionCalledCheckRequest.id));
  const highLow = await tx.select({
    sceneId: campaignSessionHighLowRequest.sceneId,
    encounterId: campaignSessionHighLowRequest.encounterId,
    participantCharacterId: campaignSessionHighLowRequest.participantCharacterId,
    participantName: campaignCharacter.name,
    purpose: campaignSessionHighLowRequest.purpose,
    visibility: campaignSessionHighLowRequest.visibility,
    createdAt: campaignSessionHighLowRequest.createdAt,
  }).from(campaignSessionHighLowRequest)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionHighLowRequest.participantCharacterId))
    .where(and(
      eq(campaignSessionHighLowRequest.sessionId, context.sessionId),
      eq(campaignSessionHighLowRequest.campaignId, context.campaignId),
      inArray(campaignSessionHighLowRequest.status, ["pending", "requires-god-ruling"]),
    )).orderBy(asc(campaignSessionHighLowRequest.id));
  const roster = await tx.select({
    characterId: campaignSessionRoster.characterId,
    characterName: campaignCharacter.name,
  }).from(campaignSessionRoster)
    .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionRoster.characterId))
    .where(and(
      eq(campaignSessionRoster.sessionId, context.sessionId),
      eq(campaignSessionRoster.campaignId, context.campaignId),
    )).orderBy(asc(campaignSessionRoster.sortOrder), asc(campaignSessionRoster.characterId));
  const rosterIds = roster.map(({ characterId }) => characterId);
  const conditionRows = rosterIds.length ? await tx.select({
    id: campaignCharacterActiveCondition.id,
    characterId: campaignCharacterActiveCondition.characterId,
    label: campaignCharacterActiveCondition.name,
    durationKind: campaignCharacterActiveCondition.durationKind,
    durationLabel: campaignCharacterActiveCondition.durationLabel,
  }).from(campaignCharacterActiveCondition).where(and(
    inArray(campaignCharacterActiveCondition.characterId, rosterIds),
    isNull(campaignCharacterActiveCondition.resolvedAt),
  )) : [];
  const modifierRows = rosterIds.length ? await tx.select({
    id: campaignCharacterActiveModifier.id,
    characterId: campaignCharacterActiveModifier.characterId,
    label: campaignCharacterActiveModifier.label,
    durationKind: campaignCharacterActiveModifier.durationKind,
    durationLabel: campaignCharacterActiveModifier.durationLabel,
  }).from(campaignCharacterActiveModifier).where(and(
    inArray(campaignCharacterActiveModifier.characterId, rosterIds),
    isNull(campaignCharacterActiveModifier.endedAt),
  )) : [];
  const activeBindings = rosterIds.length ? await tx.select({
    conditionId: campaignSessionEffectDurationBinding.conditionId,
    modifierId: campaignSessionEffectDurationBinding.modifierId,
  }).from(campaignSessionEffectDurationBinding).where(and(
    inArray(campaignSessionEffectDurationBinding.characterId, rosterIds),
    eq(campaignSessionEffectDurationBinding.status, "active"),
  )) : [];
  const boundKeys = new Set(activeBindings.flatMap((binding) => [
    binding.conditionId === null ? null : `condition:${binding.conditionId}`,
    binding.modifierId === null ? null : `modifier:${binding.modifierId}`,
  ]).filter((key): key is string => key !== null));
  const names = new Map(roster.map(({ characterId, characterName }) => [characterId, characterName]));
  const unboundDurations: SessionCloseoutUnboundDuration[] = [
    ...conditionRows.map((row) => ({ ...row, effectKind: "condition" as const })),
    ...modifierRows.map((row) => ({ ...row, effectKind: "modifier" as const })),
  ].flatMap((row) => {
    if (row.durationKind === "until-removed" || boundKeys.has(`${row.effectKind}:${row.id}`)) return [];
    return [{
      effectKind: row.effectKind,
      effectId: row.id,
      characterId: row.characterId,
      characterName: names.get(row.characterId) ?? `Character #${row.characterId}`,
      effectLabel: row.label,
      durationLabel: row.durationLabel,
    }];
  });
  const rewardRows = await tx.select({
    characterId: campaignSessionEncounterReward.characterId,
    characterName: campaignCharacter.name,
    amount: campaignSessionEncounterReward.amount,
  }).from(campaignSessionEncounterReward)
    .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterReward.characterId))
    .where(and(
      eq(campaignSessionEncounterReward.sessionId, context.sessionId),
      eq(campaignSessionEncounterReward.campaignId, context.campaignId),
    )).orderBy(asc(campaignSessionEncounterReward.characterId), asc(campaignSessionEncounterReward.id));
  const rewardByCharacter = new Map<number, { characterName: string; amount: number }>();
  for (const reward of rewardRows) {
    const current = rewardByCharacter.get(reward.characterId);
    rewardByCharacter.set(reward.characterId, {
      characterName: reward.characterName,
      amount: (current?.amount ?? 0) + reward.amount,
    });
  }
  const rollRows = await tx.select({
    id: campaignSessionRoll.id,
    method: campaignSessionRoll.method,
    visibility: campaignSessionRoll.visibility,
    status: campaignSessionRoll.status,
  }).from(campaignSessionRoll).where(and(
    eq(campaignSessionRoll.sessionId, context.sessionId),
    eq(campaignSessionRoll.campaignId, context.campaignId),
  ));
  const voidAmendmentRows = await tx.select({ rollId: campaignSessionRollAmendment.rollId })
    .from(campaignSessionRollAmendment)
    .where(and(
      eq(campaignSessionRollAmendment.sessionId, context.sessionId),
      eq(campaignSessionRollAmendment.campaignId, context.campaignId),
      eq(campaignSessionRollAmendment.kind, "void"),
    ));
  const appendOnlyVoidedRollIds = new Set(voidAmendmentRows.map(({ rollId }) => rollId));
  const blockers = buildSessionCloseoutBlockers({
    scenes,
    encounters,
    initiatives,
    actionDeclarations,
    pendingActions,
    authoredActions,
    reactions,
    calledChecks,
    highLow,
  });
  const sceneSummary = statusCounts(scenes);
  const encounterSummary = statusCounts(encounters);
  const warnings = buildSessionCloseoutWarnings({
    plannedSceneCount: sceneSummary.planned,
    plannedEncounterCount: encounterSummary.planned,
    unboundDurations,
  });
  const activeScene = scenes.find(({ status }) => status === "active") ?? null;
  const activeEncounter = encounters.find(({ status }) => status === "active") ?? null;
  const activeInitiative = activeEncounter === null ? null : initiatives.find(({ encounterId, status }) => (
    encounterId === activeEncounter.id && status === "active"
  )) ?? null;
  const rewards = [...rewardByCharacter.entries()].map(([characterId, reward]) => ({ characterId, ...reward }));
  return {
    session: {
      id: context.sessionId,
      campaignId: context.campaignId,
      title: context.title,
      sequenceNumber: context.sequenceNumber,
      status: context.status,
      completedAt: context.completedAt?.toISOString() ?? null,
    },
    scenes: sceneSummary,
    encounters: encounterSummary,
    activeContext: {
      sceneId: activeScene?.id ?? null,
      sceneTitle: activeScene?.title ?? null,
      encounterId: activeEncounter?.id ?? null,
      encounterTitle: activeEncounter?.title ?? null,
      initiative: activeInitiative ? {
        roundNumber: activeInitiative.roundNumber,
        stepNumber: activeInitiative.stepNumber,
      } : null,
    },
    blockers,
    warnings,
    unboundDurations,
    rewards: {
      recipients: rewards,
      totalExperience: rewards.reduce((total, reward) => total + reward.amount, 0),
      rewardRows: rewardRows.length,
    },
    rolls: {
      total: rollRows.length,
      random: rollRows.filter(({ method }) => method === "random").length,
      entered: rollRows.filter(({ method }) => method === "entered").length,
      tableVisible: rollRows.filter(({ visibility }) => visibility === "table").length,
      private: rollRows.filter(({ visibility }) => visibility === "private").length,
      godOnly: rollRows.filter(({ visibility }) => visibility === "god-only").length,
      voided: rollRows.filter(({ id, status }) => status === "voided" || appendOnlyVoidedRollIds.has(id)).length,
    },
    canFinalize: context.status === "active" && blockers.length === 0,
  };
}

export async function finalizeSessionCloseoutInTransaction(
  tx: SessionCloseoutTransaction,
  context: SessionCloseoutContext,
): Promise<SessionCloseoutView> {
  if (context.status === "completed") return readSessionCloseoutInTransaction(tx, context);
  if (context.status !== "active") throw new Error("Start this Session before finalizing it.");
  const current = await readSessionCloseoutInTransaction(tx, context);
  if (current.blockers.length) {
    throw new Error(`Session closeout is blocked: ${current.blockers.map(({ message }) => message).join(" ")}`);
  }
  const next = transitionSession({
    status: context.status,
    startedAt: context.startedAt,
    completedAt: context.completedAt,
  }, "complete");
  const [completed] = await tx.update(campaignSession).set({
    ...next,
    updatedAt: new Date(),
  }).where(and(
    eq(campaignSession.id, context.sessionId),
    eq(campaignSession.campaignId, context.campaignId),
    eq(campaignSession.status, "active"),
  )).returning({ id: campaignSession.id });
  if (!completed) throw new Error("The Session changed before closeout completed.");
  return readSessionCloseoutInTransaction(tx, {
    ...context,
    status: "completed",
    completedAt: next.completedAt,
  });
}

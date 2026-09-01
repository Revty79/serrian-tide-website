import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
  campaignCharacterProfile,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterPendingActionSource,
  campaignSessionEncounterReaction,
  campaignSessionEncounterReward,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";

import {
  assertParentsAllowLiveEncounter,
  transitionEncounter,
} from "./encounter-foundation";
import {
  buildEncounterCloseoutBlockers,
  normalizeExperienceAwards,
  parseCreatureKillXpSuggestion,
  type EncounterCloseoutBlocker,
  type ExperienceAwardInput,
} from "./encounter-closeout";
import {
  readCharacterDurationBindingsInTransaction,
  type TabletopDurationBindingView,
} from "./duration-lifecycle-service";
import { assertCampaignSessionOwner } from "./session-foundation";

export type EncounterCloseoutTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EncounterCloseoutContext = {
  encounterId: number;
  sceneId: number;
  sessionId: number;
  campaignId: number;
  encounterTitle: string;
  encounterStatus: "planned" | "active" | "completed";
  encounterStartedAt: Date | null;
  encounterCompletedAt: Date | null;
  sceneStatus: "planned" | "active" | "completed";
  sessionStatus: "planned" | "active" | "completed";
  ownerUserId: string;
};

export type EncounterCloseoutDurationWarning = {
  effectKind: "condition" | "modifier";
  effectId: number;
  characterId: number;
  characterName: string;
  effectLabel: string;
  durationKind: "combat-steps" | "combat-rounds" | "scene";
  durationLabel: string;
};

export type EncounterCloseoutView = {
  encounter: {
    id: number;
    title: string;
    status: "planned" | "active" | "completed";
    completedAt: string | null;
  };
  initiative: {
    status: "active" | "closed";
    roundNumber: number;
    stepNumber: number;
  } | null;
  blockers: EncounterCloseoutBlocker[];
  warnings: string[];
  durations: {
    bindings: TabletopDurationBindingView[];
    combatDurationsRemaining: number;
    sceneEffectsContinuing: number;
    unbound: EncounterCloseoutDurationWarning[];
  };
  creatureRewardReferences: Array<{
    characterId: number;
    name: string;
    suggestedXp: number | null;
  }>;
  recipients: Array<{
    characterId: number;
    name: string;
    kindLabel: string;
    currentExperience: number;
    totalExperience: number;
  }>;
  rewards: Array<{
    id: number;
    characterId: number;
    characterName: string;
    amount: number;
    note: string;
    awardedAt: string;
  }>;
  canFinalize: boolean;
  hasRewardHistory: boolean;
};

export type FinalizeEncounterCloseoutInput = {
  awards: readonly ExperienceAwardInput[];
  rewardNote?: string;
};

function positiveId(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

export async function lockEncounterCloseoutContextInTransaction(
  tx: EncounterCloseoutTransaction,
  encounterId: number,
  actingUserId: string,
): Promise<EncounterCloseoutContext> {
  const [row] = await tx.select({
    encounterId: campaignSessionEncounter.id,
    sceneId: campaignSessionEncounter.sceneId,
    sessionId: campaignSessionEncounter.sessionId,
    campaignId: campaignSessionEncounter.campaignId,
    encounterTitle: campaignSessionEncounter.title,
    encounterStatus: campaignSessionEncounter.status,
    encounterStartedAt: campaignSessionEncounter.startedAt,
    encounterCompletedAt: campaignSessionEncounter.completedAt,
    sceneStatus: campaignSessionScene.status,
    sessionStatus: campaignSession.status,
    ownerUserId: campaign.createdByUserId,
  }).from(campaignSessionEncounter)
    .innerJoin(campaignSessionScene, and(
      eq(campaignSessionScene.id, campaignSessionEncounter.sceneId),
      eq(campaignSessionScene.sessionId, campaignSessionEncounter.sessionId),
      eq(campaignSessionScene.campaignId, campaignSessionEncounter.campaignId),
    ))
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionEncounter.sessionId),
      eq(campaignSession.campaignId, campaignSessionEncounter.campaignId),
    ))
    .innerJoin(campaign, eq(campaign.id, campaignSessionEncounter.campaignId))
    .where(eq(campaignSessionEncounter.id, positiveId(encounterId, "Encounter")))
    .limit(1)
    .for("update", { of: campaignSessionEncounter });
  if (!row) throw new Error("That Encounter no longer exists.");
  assertCampaignSessionOwner(row.ownerUserId, actingUserId);
  return row;
}

function kindLabel(isNpc: boolean, npcKind: string): string {
  if (!isNpc) return "Player Character";
  return npcKind === "creature" ? "Creature NPC" : "Race NPC";
}

export async function readEncounterCloseoutInTransaction(
  tx: EncounterCloseoutTransaction,
  context: EncounterCloseoutContext,
): Promise<EncounterCloseoutView> {
  const initiativeRows = await tx.select({
      status: campaignSessionEncounterInitiative.status,
      roundNumber: campaignSessionEncounterInitiative.roundNumber,
      stepNumber: campaignSessionEncounterInitiative.stepNumber,
    }).from(campaignSessionEncounterInitiative)
      .where(eq(campaignSessionEncounterInitiative.encounterId, context.encounterId))
      .limit(1);
  const participantRows = await tx.select({
      characterId: campaignSessionEncounterParticipant.characterId,
      name: campaignCharacter.name,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      experience: campaignCharacterProfile.experience,
      totalExperience: campaignCharacterProfile.totalExperience,
      creatureSnapshot: campaignCreatureNpcProfile.currentSnapshotJson,
    }).from(campaignSessionEncounterParticipant)
      .innerJoin(campaignCharacter, and(
        eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId),
        eq(campaignCharacter.campaignId, campaignSessionEncounterParticipant.campaignId),
      ))
      .leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
      .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
      .where(and(
        eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
        eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
        eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
        eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      ))
      .orderBy(asc(campaignSessionEncounterParticipant.sortOrder), asc(campaignSessionEncounterParticipant.characterId));
  const pendingRows = await tx.select({
      status: campaignSessionEncounterPendingAction.status,
      label: campaignSessionEncounterPendingAction.label,
      actorCharacterId: campaignSessionEncounterPendingAction.actorCharacterId,
    }).from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId))
      .orderBy(asc(campaignSessionEncounterPendingAction.id));
  const authoredRows = await tx.select({
      resolutionStatus: campaignSessionEncounterPendingActionSource.resolutionStatus,
      label: campaignSessionEncounterPendingAction.label,
      sourceCharacterId: campaignSessionEncounterPendingActionSource.sourceCharacterId,
    }).from(campaignSessionEncounterPendingActionSource)
      .innerJoin(campaignSessionEncounterPendingAction, eq(
        campaignSessionEncounterPendingAction.id,
        campaignSessionEncounterPendingActionSource.pendingActionId,
      ))
      .where(eq(campaignSessionEncounterPendingActionSource.encounterId, context.encounterId))
      .orderBy(asc(campaignSessionEncounterPendingActionSource.id));
  const reactionRows = await tx.select({
      status: campaignSessionEncounterReaction.status,
      reactionType: campaignSessionEncounterReaction.reactionType,
      reactorCharacterId: campaignSessionEncounterReaction.reactorCharacterId,
    }).from(campaignSessionEncounterReaction)
      .where(eq(campaignSessionEncounterReaction.encounterId, context.encounterId))
      .orderBy(asc(campaignSessionEncounterReaction.id));
  const rewardRows = await tx.select({
      id: campaignSessionEncounterReward.id,
      characterId: campaignSessionEncounterReward.characterId,
      characterName: campaignCharacter.name,
      amount: campaignSessionEncounterReward.amount,
      note: campaignSessionEncounterReward.note,
      awardedAt: campaignSessionEncounterReward.awardedAt,
    }).from(campaignSessionEncounterReward)
      .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterReward.characterId))
      .where(eq(campaignSessionEncounterReward.encounterId, context.encounterId))
      .orderBy(asc(campaignSessionEncounterReward.awardedAt), asc(campaignSessionEncounterReward.id));

  const participantIds = participantRows.map(({ characterId }) => characterId);
  const allDurationBindings: TabletopDurationBindingView[] = [];
  for (const characterId of participantIds) {
    allDurationBindings.push(...await readCharacterDurationBindingsInTransaction(tx, characterId, true));
  }
  const durationBindings = allDurationBindings.filter((binding) => binding.durationKind === "scene"
    ? binding.sceneId === context.sceneId
    : binding.encounterId === context.encounterId);
  const activeBindingKeys = new Set(durationBindings
    .filter(({ status }) => status === "active")
    .map(({ effectKind, effectId }) => `${effectKind}:${effectId}`));
  const characterNames = new Map(participantRows.map(({ characterId, name }) => [characterId, name]));
  const conditionRows = participantIds.length ? await tx.select({
      id: campaignCharacterActiveCondition.id,
      characterId: campaignCharacterActiveCondition.characterId,
      label: campaignCharacterActiveCondition.name,
      durationKind: campaignCharacterActiveCondition.durationKind,
      durationLabel: campaignCharacterActiveCondition.durationLabel,
    }).from(campaignCharacterActiveCondition).where(and(
      inArray(campaignCharacterActiveCondition.characterId, participantIds),
      isNull(campaignCharacterActiveCondition.resolvedAt),
    )) : [];
  const modifierRows = participantIds.length ? await tx.select({
      id: campaignCharacterActiveModifier.id,
      characterId: campaignCharacterActiveModifier.characterId,
      label: campaignCharacterActiveModifier.label,
      durationKind: campaignCharacterActiveModifier.durationKind,
      durationLabel: campaignCharacterActiveModifier.durationLabel,
    }).from(campaignCharacterActiveModifier).where(and(
      inArray(campaignCharacterActiveModifier.characterId, participantIds),
      isNull(campaignCharacterActiveModifier.endedAt),
    )) : [];
  const unbound: EncounterCloseoutDurationWarning[] = [
    ...conditionRows.map((row) => ({ ...row, effectKind: "condition" as const })),
    ...modifierRows.map((row) => ({ ...row, effectKind: "modifier" as const })),
  ].flatMap((row): EncounterCloseoutDurationWarning[] => {
    if (row.durationKind === "until-removed" || activeBindingKeys.has(`${row.effectKind}:${row.id}`)) return [];
    return [{
      effectKind: row.effectKind,
      effectId: row.id,
      characterId: row.characterId,
      characterName: characterNames.get(row.characterId) ?? `Character #${row.characterId}`,
      effectLabel: row.label,
      durationKind: row.durationKind as EncounterCloseoutDurationWarning["durationKind"],
      durationLabel: row.durationLabel,
    }];
  });
  const initiative = initiativeRows[0] ?? null;
  const blockers = buildEncounterCloseoutBlockers({
    initiativeStatus: initiative?.status ?? null,
    pendingActions: pendingRows,
    authoredActions: authoredRows,
    reactions: reactionRows,
  });
  const warnings = unbound.map((entry) => (
    `${entry.characterName} has an unbound ${entry.durationLabel} effect, ${entry.effectLabel}. It will not auto-advance.`
  ));
  const activeBindings = durationBindings.filter(({ status }) => status === "active");
  const rewards = rewardRows.map((row) => ({ ...row, awardedAt: row.awardedAt.toISOString() }));
  return {
    encounter: {
      id: context.encounterId,
      title: context.encounterTitle,
      status: context.encounterStatus,
      completedAt: context.encounterCompletedAt?.toISOString() ?? null,
    },
    initiative,
    blockers,
    warnings,
    durations: {
      bindings: durationBindings,
      combatDurationsRemaining: activeBindings.filter((binding) => (
        binding.encounterId === context.encounterId
        && (binding.durationKind === "combat-steps" || binding.durationKind === "combat-rounds")
      )).length,
      sceneEffectsContinuing: activeBindings.filter((binding) => (
        binding.sceneId === context.sceneId && binding.durationKind === "scene"
      )).length,
      unbound,
    },
    creatureRewardReferences: participantRows.flatMap((participant) => participant.creatureSnapshot ? [{
      characterId: participant.characterId,
      name: participant.name,
      suggestedXp: parseCreatureKillXpSuggestion(participant.creatureSnapshot),
    }] : []),
    recipients: participantRows.flatMap((participant) => (
      participant.experience === null || participant.totalExperience === null
        ? []
        : [{
            characterId: participant.characterId,
            name: participant.name,
            kindLabel: kindLabel(participant.isNpc, participant.npcKind),
            currentExperience: participant.experience,
            totalExperience: participant.totalExperience,
          }]
    )),
    rewards,
    canFinalize: context.encounterStatus === "active" && blockers.length === 0,
    hasRewardHistory: rewards.length > 0,
  };
}

export async function finalizeEncounterCloseoutInTransaction(
  tx: EncounterCloseoutTransaction,
  context: EncounterCloseoutContext,
  input: FinalizeEncounterCloseoutInput,
): Promise<EncounterCloseoutView> {
  if (context.encounterStatus === "completed") {
    return readEncounterCloseoutInTransaction(tx, context);
  }
  if (context.encounterStatus !== "active") {
    throw new Error("Start this Encounter before finalizing it.");
  }
  assertParentsAllowLiveEncounter(context.sessionStatus, context.sceneStatus);
  const current = await readEncounterCloseoutInTransaction(tx, context);
  if (current.blockers.length) {
    throw new Error(`Encounter closeout is blocked: ${current.blockers.map(({ message }) => message).join(" ")}`);
  }
  const awards = normalizeExperienceAwards(input.awards);
  if (current.hasRewardHistory && awards.length) {
    throw new Error("This Encounter already has immutable XP reward history. Re-complete it without another award.");
  }
  const note = input.rewardNote?.trim() ?? "";
  if (!current.hasRewardHistory && awards.length) {
    const recipientIds = awards.map(({ characterId }) => characterId).sort((left, right) => left - right);
    const recipients = await tx.select({
      characterId: campaignCharacterProfile.characterId,
    }).from(campaignCharacterProfile)
      .innerJoin(campaignSessionEncounterParticipant, and(
        eq(campaignSessionEncounterParticipant.characterId, campaignCharacterProfile.characterId),
        eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
        eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
        eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
        eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      ))
      .where(inArray(campaignCharacterProfile.characterId, recipientIds))
      .orderBy(asc(campaignCharacterProfile.characterId))
      .for("update", { of: campaignCharacterProfile });
    const validRecipients = new Set(recipients.map(({ characterId }) => characterId));
    if (validRecipients.size !== recipientIds.length || recipientIds.some((id) => !validRecipients.has(id))) {
      throw new Error("Every XP recipient must be an exact Encounter Participant with an authoritative Character XP profile.");
    }
    for (const award of awards) {
      await tx.update(campaignCharacterProfile).set({
        experience: sql`${campaignCharacterProfile.experience} + ${award.amount}`,
        updatedAt: new Date(),
      }).where(eq(campaignCharacterProfile.characterId, award.characterId));
    }
    await tx.insert(campaignSessionEncounterReward).values(awards.map((award) => ({
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      characterId: award.characterId,
      rewardKind: "experience" as const,
      amount: award.amount,
      note,
    })));
  }
  const next = transitionEncounter({
    status: context.encounterStatus,
    startedAt: context.encounterStartedAt,
    completedAt: context.encounterCompletedAt,
  }, "complete");
  const [completed] = await tx.update(campaignSessionEncounter).set({
    ...next,
    updatedAt: new Date(),
  }).where(and(
    eq(campaignSessionEncounter.id, context.encounterId),
    eq(campaignSessionEncounter.status, "active"),
  )).returning({ id: campaignSessionEncounter.id });
  if (!completed) throw new Error("The Encounter changed before closeout completed.");
  return readEncounterCloseoutInTransaction(tx, {
    ...context,
    encounterStatus: "completed",
    encounterCompletedAt: next.completedAt,
  });
}

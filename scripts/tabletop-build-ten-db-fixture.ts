import assert from "node:assert/strict";

import type { db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterActiveHealth,
  campaignCharacterProfile,
} from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterPendingActionSource,
  campaignSessionEncounterReaction,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";

export type BuildTenDbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function insertBuildTenFixture(
  tx: BuildTenDbTransaction,
  label: string,
) {
  const suffix = crypto.randomUUID();
  const godId = `build10-${label}-${suffix}`;
  await tx.insert(user).values({
    id: godId,
    name: "Build 10 Test G.O.D.",
    email: `${godId}@example.invalid`,
    username: godId,
  });
  const [createdCampaign] = await tx.insert(campaign).values({
    name: `Build 10 ${label} ${suffix}`,
    overview: "Rollback-only Roll Runtime and Session Closeout fixture.",
    attributePoints: 0,
    skillPoints: 0,
    maxStartingSkill: 0,
    pointsToUnlockNextTier: 0,
    maxPointsInSkill: 100,
    startingCreditAmount: 0,
    currencySystem: "Credits",
    fatePointMethod: "Assigned",
    assignedFatePoints: 0,
    createdByUserId: godId,
  }).returning({ id: campaign.id });
  assert.ok(createdCampaign);
  await tx.insert(campaignPlayer).values({ campaignId: createdCampaign.id, userId: godId });
  const [hero, defender, rosterOnly] = await tx.insert(campaignCharacter).values([
    { campaignId: createdCampaign.id, playerUserId: godId, name: "Build 10 Hero" },
    { campaignId: createdCampaign.id, playerUserId: godId, name: "Build 10 Defender", isNpc: true, npcKind: "race", npcBuildMode: "detailed" },
    { campaignId: createdCampaign.id, playerUserId: godId, name: "Build 10 Roster Only", isNpc: true, npcKind: "race", npcBuildMode: "detailed" },
  ]).returning({ id: campaignCharacter.id });
  assert.ok(hero && defender && rosterOnly);
  await tx.insert(campaignCharacterProfile).values([
    { characterId: hero.id, experience: 12, totalExperience: 70 },
    { characterId: defender.id, experience: 8, totalExperience: 30 },
  ]);
  await tx.insert(campaignCharacterActiveHealth).values([
    { characterId: hero.id, totalDamage: 4 },
    { characterId: defender.id, totalDamage: 2 },
  ]);
  const [session] = await tx.insert(campaignSession).values({
    campaignId: createdCampaign.id,
    title: "Build 10 Session",
    sequenceNumber: 1,
    status: "active",
    startedAt: new Date("2026-09-01T18:00:00.000Z"),
  }).returning({ id: campaignSession.id });
  assert.ok(session);
  await tx.insert(campaignSessionRoster).values([
    { sessionId: session.id, campaignId: createdCampaign.id, characterId: hero.id, sortOrder: 0 },
    { sessionId: session.id, campaignId: createdCampaign.id, characterId: defender.id, sortOrder: 1 },
    { sessionId: session.id, campaignId: createdCampaign.id, characterId: rosterOnly.id, sortOrder: 2 },
  ]);
  const [scene] = await tx.insert(campaignSessionScene).values({
    sessionId: session.id,
    campaignId: createdCampaign.id,
    title: "Build 10 Scene",
    sequenceNumber: 1,
    status: "active",
    startedAt: new Date("2026-09-01T18:30:00.000Z"),
  }).returning({ id: campaignSessionScene.id });
  assert.ok(scene);
  await tx.insert(campaignSessionSceneMember).values([
    { sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: hero.id, sortOrder: 0 },
    { sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: defender.id, sortOrder: 1 },
  ]);
  const [encounter] = await tx.insert(campaignSessionEncounter).values({
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    title: "Build 10 Encounter",
    sequenceNumber: 1,
    encounterType: "combat",
    status: "active",
    startedAt: new Date("2026-09-01T19:00:00.000Z"),
  }).returning({ id: campaignSessionEncounter.id });
  assert.ok(encounter);
  await tx.insert(campaignSessionEncounterParticipant).values([
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: hero.id, sortOrder: 0 },
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: defender.id, sortOrder: 1 },
  ]);
  await tx.insert(campaignSessionEncounterInitiative).values({
    encounterId: encounter.id,
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    roundNumber: 3,
    stepNumber: 7,
    timelineInitiative: 18,
  });
  await tx.insert(campaignSessionEncounterInitiativeParticipant).values([
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: hero.id, normalTotalInitiative: 25, currentInitiative: 18 },
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: defender.id, normalTotalInitiative: 23, currentInitiative: 17 },
  ]);
  const [pendingAction] = await tx.insert(campaignSessionEncounterPendingAction).values({
    encounterId: encounter.id,
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    actorCharacterId: hero.id,
    label: "Longsword Attack",
    actionKind: "weapon",
    originalInitiativeCost: 5,
    initiativeSpent: 5,
    remainingInitiativeCost: 0,
    startInitiative: 23,
    startTimelineInitiative: 23,
    expectedCompletionInitiative: 18,
    status: "completed",
    startedRound: 3,
    completedRound: 3,
  }).returning({ id: campaignSessionEncounterPendingAction.id });
  assert.ok(pendingAction);
  await tx.insert(campaignSessionEncounterPendingActionSource).values({
    pendingActionId: pendingAction.id,
    encounterId: encounter.id,
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    sourceCharacterId: hero.id,
    sourceKind: "weapon",
    sourceRef: "test-longsword",
    payloadJson: JSON.stringify({
      sourceCharacterId: hero.id,
      targetCharacterId: defender.id,
      itemId: 1,
      instanceId: null,
      godSuppliedInitiativeCost: null,
    }),
  });
  const [reaction] = await tx.insert(campaignSessionEncounterReaction).values({
    encounterId: encounter.id,
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    pendingActionId: pendingAction.id,
    reactorCharacterId: defender.id,
    reactionType: "dodge",
    committedInitiativeCost: 1,
  }).returning({ id: campaignSessionEncounterReaction.id });
  assert.ok(reaction);
  return {
    godId,
    campaignId: createdCampaign.id,
    sessionId: session.id,
    sceneId: scene.id,
    encounterId: encounter.id,
    heroId: hero.id,
    defenderId: defender.id,
    rosterOnlyId: rosterOnly.id,
    pendingActionId: pendingAction.id,
    reactionId: reaction.id,
    actor: {
      userId: godId,
      campaignId: createdCampaign.id,
      readAs: "god-owner" as const,
      canRecordGodOnly: true,
    },
  };
}

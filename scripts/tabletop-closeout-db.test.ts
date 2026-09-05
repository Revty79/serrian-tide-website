import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterActiveCondition,
  campaignCharacterActiveModifier,
  campaignCharacterProfile,
} from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEffectDurationBinding,
  campaignSessionEncounter,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterReward,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  applyConditionInTransaction,
  applyModifierInTransaction,
} from "@/features/active-state/active-effects-service";
import {
  finalizeEncounterCloseoutInTransaction,
  lockEncounterCloseoutContextInTransaction,
} from "@/features/tabletop-operations/encounter-closeout-service";
import {
  applyInitiativeDurationTransitionInTransaction,
  bindExistingEffectDurationInTransaction,
  bindPersistedEffectDurationInTransaction,
  expireSceneDurationsInTransaction,
} from "@/features/tabletop-operations/duration-lifecycle-service";
import { resolveEncounterConditionInTransaction } from "@/features/tabletop-operations/runtime-integration-service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Build 9 PostgreSQL validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Build 9 tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Build 9 tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_TABLETOP_CLOSEOUT_TEST");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

after(async () => {
  await pool.end();
});

async function fixture(tx: Tx, label: string) {
  const suffix = crypto.randomUUID();
  const godId = `build9-${label}-${suffix}`;
  await tx.insert(user).values({
    id: godId,
    name: "Build 9 Test G.O.D.",
    email: `${godId}@example.invalid`,
    username: godId,
  });
  const [createdCampaign] = await tx.insert(campaign).values({
    name: `Build 9 ${label} ${suffix}`,
    overview: "Rollback-only duration and closeout fixture.",
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
  const [hero, ally] = await tx.insert(campaignCharacter).values([
    { campaignId: createdCampaign.id, playerUserId: godId, name: "Build 9 Hero" },
    { campaignId: createdCampaign.id, playerUserId: godId, name: "Build 9 Ally", isNpc: true, npcKind: "race", npcBuildMode: "detailed" },
  ]).returning({ id: campaignCharacter.id });
  assert.ok(hero && ally);
  await tx.insert(campaignCharacterProfile).values([
    { characterId: hero.id, experience: 10, totalExperience: 75 },
    { characterId: ally.id, experience: 4, totalExperience: 12 },
  ]);
  const [session] = await tx.insert(campaignSession).values({
    campaignId: createdCampaign.id,
    title: "Build 9 Session",
    sequenceNumber: 1,
    status: "active",
    startedAt: new Date(),
  }).returning({ id: campaignSession.id });
  assert.ok(session);
  await tx.insert(campaignSessionRoster).values([
    { sessionId: session.id, campaignId: createdCampaign.id, characterId: hero.id, sortOrder: 0 },
    { sessionId: session.id, campaignId: createdCampaign.id, characterId: ally.id, sortOrder: 1 },
  ]);
  const [scene] = await tx.insert(campaignSessionScene).values({
    sessionId: session.id,
    campaignId: createdCampaign.id,
    title: "Build 9 Scene",
    sequenceNumber: 1,
    status: "active",
    startedAt: new Date(),
  }).returning({ id: campaignSessionScene.id });
  assert.ok(scene);
  await tx.insert(campaignSessionSceneMember).values([
    { sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: hero.id, sortOrder: 0 },
    { sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: ally.id, sortOrder: 1 },
  ]);
  const [encounter] = await tx.insert(campaignSessionEncounter).values({
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    title: "Build 9 Encounter",
    sequenceNumber: 1,
    encounterType: "combat",
    status: "active",
    startedAt: new Date(),
  }).returning({ id: campaignSessionEncounter.id });
  assert.ok(encounter);
  await tx.insert(campaignSessionEncounterParticipant).values([
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: hero.id, sortOrder: 0 },
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: ally.id, sortOrder: 1 },
  ]);
  const context = {
    campaignId: createdCampaign.id,
    sessionId: session.id,
    sceneId: scene.id,
    encounterId: encounter.id,
    encounterStatus: "active" as const,
    sceneStatus: "active" as const,
    sessionStatus: "active" as const,
    ownerUserId: godId,
  };
  return {
    godId,
    campaignId: createdCampaign.id,
    sessionId: session.id,
    sceneId: scene.id,
    encounterId: encounter.id,
    heroId: hero.id,
    allyId: ally.id,
    context,
  };
}

test("Combat Step and Round bindings advance by actual deltas and expire through Active Effects", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Duration");
    const condition = await applyConditionInTransaction(tx, {
      characterId: data.heroId,
      effect: { kind: "condition.apply", name: "Staggered", description: "Build 9", duration: { kind: "combat-steps", value: 2 } },
      source: { kind: "god", id: data.godId, name: "Build 9 test" },
    });
    const modifier = await applyModifierInTransaction(tx, {
      characterId: data.heroId,
      effect: { kind: "modifier.apply", label: "Slowed", channel: "initiative", targetKey: "self", amount: -1, duration: { kind: "combat-rounds", value: 2 } },
      source: { kind: "god", id: data.godId, name: "Build 9 test" },
    });
    await bindPersistedEffectDurationInTransaction(tx, data.context, { kind: "condition", id: condition.id, characterId: data.heroId, duration: condition.duration });
    await bindPersistedEffectDurationInTransaction(tx, data.context, { kind: "modifier", id: modifier.id, characterId: data.heroId, duration: modifier.duration });

    await applyInitiativeDurationTransitionInTransaction(tx, data.context, {
      status: "active", roundNumber: 1, stepNumber: 4,
    }, {
      status: "active", roundNumber: 2, stepNumber: 5,
    });
    const active = await tx.select().from(campaignSessionEffectDurationBinding).where(and(
      eq(campaignSessionEffectDurationBinding.characterId, data.heroId),
      eq(campaignSessionEffectDurationBinding.status, "active"),
    ));
    assert.deepEqual(active.map(({ durationKind, remainingValue }) => [durationKind, remainingValue]).sort(), [
      ["combat-rounds", 1],
      ["combat-steps", 1],
    ]);

    await applyInitiativeDurationTransitionInTransaction(tx, data.context, {
      status: "active", roundNumber: 2, stepNumber: 5,
    }, {
      status: "active", roundNumber: 3, stepNumber: 6,
    });
    const [conditionAfter] = await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.id, condition.id));
    const [modifierAfter] = await tx.select().from(campaignCharacterActiveModifier).where(eq(campaignCharacterActiveModifier.id, modifier.id));
    assert.ok(conditionAfter?.resolvedAt);
    assert.ok(modifierAfter?.endedAt);
    const expired = await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.characterId, data.heroId));
    assert.ok(expired.every(({ status, remainingValue }) => status === "expired" && remainingValue === 0));
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("Initiative correction advances nothing and closing Initiative expires combat bindings", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Correction");
    const condition = await applyConditionInTransaction(tx, {
      characterId: data.heroId,
      effect: { kind: "condition.apply", name: "Correction proof", description: "Build 9", duration: { kind: "combat-steps", value: 3 } },
      source: { kind: "god", id: data.godId, name: "Build 9 test" },
    });
    await bindPersistedEffectDurationInTransaction(tx, data.context, { kind: "condition", id: condition.id, characterId: data.heroId, duration: condition.duration });
    await applyInitiativeDurationTransitionInTransaction(tx, data.context, {
      status: "active", roundNumber: 1, stepNumber: 2,
    }, {
      status: "active", roundNumber: 4, stepNumber: 8,
    }, "correction");
    const [unchanged] = await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.conditionId, condition.id));
    assert.equal(unchanged?.remainingValue, 3);
    await applyInitiativeDurationTransitionInTransaction(tx, data.context, {
      status: "active", roundNumber: 4, stepNumber: 8,
    }, {
      status: "closed", roundNumber: 4, stepNumber: 8,
    });
    const [closed] = await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.conditionId, condition.id));
    const [conditionAfter] = await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.id, condition.id));
    assert.equal(closed?.status, "expired");
    assert.match(closed?.closeReason ?? "", /Combat ended/);
    assert.ok(conditionAfter?.resolvedAt);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("legacy finite effects remain unbound until explicit binding and manual resolution closes lifecycle", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Legacy");
    const condition = await applyConditionInTransaction(tx, {
      characterId: data.heroId,
      effect: { kind: "condition.apply", name: "Legacy Slowed", description: "Created without Tabletop context.", duration: { kind: "combat-steps", value: 2 } },
      source: { kind: "god", id: data.godId, name: "Legacy source" },
    });
    await applyInitiativeDurationTransitionInTransaction(tx, data.context, {
      status: "active", roundNumber: 1, stepNumber: 1,
    }, {
      status: "active", roundNumber: 1, stepNumber: 2,
    });
    assert.equal((await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.conditionId, condition.id))).length, 0);
    const [effectBeforeBinding] = await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.id, condition.id));
    assert.equal(effectBeforeBinding?.resolvedAt, null);

    await bindExistingEffectDurationInTransaction(tx, data.context, {
      effectKind: "condition",
      effectId: condition.id,
      characterId: data.heroId,
    });
    await applyInitiativeDurationTransitionInTransaction(tx, data.context, {
      status: "active", roundNumber: 1, stepNumber: 2,
    }, {
      status: "active", roundNumber: 1, stepNumber: 3,
    });
    const [advanced] = await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.conditionId, condition.id));
    assert.equal(advanced?.remainingValue, 1);
    await resolveEncounterConditionInTransaction(tx, data.context, data.heroId, condition.id, "Manual Build 9 ruling.");
    const [manuallyClosed] = await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.conditionId, condition.id));
    assert.equal(manuallyClosed?.status, "closed");
    assert.match(manuallyClosed?.closeReason ?? "", /Manual Build 9 ruling/);
    await applyInitiativeDurationTransitionInTransaction(tx, data.context, {
      status: "active", roundNumber: 1, stepNumber: 3,
    }, {
      status: "active", roundNumber: 1, stepNumber: 4,
    });
    const [stillClosed] = await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.conditionId, condition.id));
    assert.equal(stillClosed?.status, "closed");
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("Scene binding survives Encounter completion and expires only at bound Scene completion", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Scene");
    const condition = await applyConditionInTransaction(tx, {
      characterId: data.heroId,
      effect: { kind: "condition.apply", name: "Blessed", description: "Build 9", duration: { kind: "scene", value: null } },
      source: { kind: "god", id: data.godId, name: "Build 9 test" },
    });
    await bindPersistedEffectDurationInTransaction(tx, data.context, { kind: "condition", id: condition.id, characterId: data.heroId, duration: condition.duration });
    const closeoutContext = await lockEncounterCloseoutContextInTransaction(tx, data.encounterId, data.godId);
    await finalizeEncounterCloseoutInTransaction(tx, closeoutContext, { awards: [] });
    const [stillActive] = await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.id, condition.id));
    assert.equal(stillActive?.resolvedAt, null);
    const [bindingBeforeSceneEnd] = await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.conditionId, condition.id));
    assert.equal(bindingBeforeSceneEnd?.status, "active");
    await expireSceneDurationsInTransaction(tx, data.sceneId, 1);
    const [expired] = await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.id, condition.id));
    const [bindingAfterSceneEnd] = await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.conditionId, condition.id));
    assert.ok(expired?.resolvedAt);
    assert.equal(bindingAfterSceneEnd?.status, "expired");
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("XP awards and Encounter completion commit atomically without changing Lifetime Experience", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Rewards");
    const closeoutContext = await lockEncounterCloseoutContextInTransaction(tx, data.encounterId, data.godId);
    const completed = await finalizeEncounterCloseoutInTransaction(tx, closeoutContext, {
      awards: [
        { characterId: data.heroId, amount: 35 },
        { characterId: data.allyId, amount: 15 },
      ],
      rewardNote: "Explicit Build 9 award.",
    });
    assert.equal(completed.encounter.status, "completed");
    const profiles = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, data.heroId));
    assert.equal(profiles[0]?.experience, 45);
    assert.equal(profiles[0]?.totalExperience, 75);
    const rewards = await tx.select().from(campaignSessionEncounterReward).where(eq(campaignSessionEncounterReward.encounterId, data.encounterId));
    assert.deepEqual(rewards.map(({ characterId, amount }) => [characterId, amount]).sort((left, right) => Number(left[0]) - Number(right[0])), [
      [data.heroId, 35],
      [data.allyId, 15],
    ]);

    const repeated = await finalizeEncounterCloseoutInTransaction(tx, {
      ...closeoutContext,
      encounterStatus: "completed",
      encounterCompletedAt: new Date(completed.encounter.completedAt!),
    }, { awards: [{ characterId: data.heroId, amount: 35 }] });
    assert.equal(repeated.rewards.length, 2);
    const [afterRepeat] = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, data.heroId));
    assert.equal(afterRepeat?.experience, 45);

    await tx.update(campaignSessionEncounter).set({ status: "active", completedAt: null }).where(eq(campaignSessionEncounter.id, data.encounterId));
    const reopenedContext = await lockEncounterCloseoutContextInTransaction(tx, data.encounterId, data.godId);
    await finalizeEncounterCloseoutInTransaction(tx, reopenedContext, { awards: [] });
    const [afterRecomplete] = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, data.heroId));
    assert.equal(afterRecomplete?.experience, 45);
    assert.equal((await tx.select().from(campaignSessionEncounterReward).where(eq(campaignSessionEncounterReward.encounterId, data.encounterId))).length, 2);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("one invalid reward recipient rolls back every award and leaves Encounter active", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "InvalidReward");
    const otherGod = `build9-other-${crypto.randomUUID()}`;
    await tx.insert(user).values({ id: otherGod, name: "Other", email: `${otherGod}@example.invalid`, username: otherGod });
    const [otherCampaign] = await tx.insert(campaign).values({
      name: `Other ${crypto.randomUUID()}`,
      attributePoints: 0,
      skillPoints: 0,
      maxStartingSkill: 0,
      pointsToUnlockNextTier: 0,
      maxPointsInSkill: 100,
      startingCreditAmount: 0,
      currencySystem: "Credits",
      fatePointMethod: "Assigned",
      assignedFatePoints: 0,
      createdByUserId: otherGod,
    }).returning({ id: campaign.id });
    assert.ok(otherCampaign);
    await tx.insert(campaignPlayer).values({ campaignId: otherCampaign.id, userId: otherGod });
    const [outsider] = await tx.insert(campaignCharacter).values({ campaignId: otherCampaign.id, playerUserId: otherGod, name: "Outsider" }).returning({ id: campaignCharacter.id });
    assert.ok(outsider);
    await tx.insert(campaignCharacterProfile).values({ characterId: outsider.id, experience: 99, totalExperience: 50 });
    const closeoutContext = await lockEncounterCloseoutContextInTransaction(tx, data.encounterId, data.godId);
    await assert.rejects(finalizeEncounterCloseoutInTransaction(tx, closeoutContext, {
      awards: [
        { characterId: data.heroId, amount: 35 },
        { characterId: outsider.id, amount: 100 },
      ],
    }), /exact Encounter Participant/);
    const [hero] = await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, data.heroId));
    const [encounter] = await tx.select().from(campaignSessionEncounter).where(eq(campaignSessionEncounter.id, data.encounterId));
    assert.equal(hero?.experience, 10);
    assert.equal(encounter?.status, "active");
    assert.equal((await tx.select().from(campaignSessionEncounterReward).where(eq(campaignSessionEncounterReward.encounterId, data.encounterId))).length, 0);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

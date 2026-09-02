import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, asc, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { item } from "@/db/item-schema";
import {
  campaignCharacterActiveCondition,
  campaignCharacterActiveHealth,
  campaignCharacterActiveMana,
  campaignCharacterActiveModifier,
  campaignCharacterInjury,
  campaignCharacterItem,
  campaignCharacterItemEquipmentState,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
} from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEffectDurationBinding,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterPendingActionSource,
  campaignSessionEncounterReaction,
  campaignSessionEncounterReward,
  campaignSessionRoll,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";
import {
  finalizeSessionCloseoutInTransaction,
  lockSessionCloseoutContextInTransaction,
  readSessionCloseoutInTransaction,
} from "@/features/tabletop-operations/session-closeout-service";
import { transitionSession } from "@/features/tabletop-operations/session-foundation";
import {
  readRollLedgerInTransaction,
  recordRollInTransaction,
} from "@/features/tabletop-operations/roll-runtime-service";

import { insertBuildTenFixture, type BuildTenDbTransaction } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Build 10 Session Closeout PostgreSQL validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Build 10 Session Closeout tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Build 10 Session Closeout tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_TABLETOP_SESSION_CLOSEOUT_TEST");

after(async () => {
  await pool.end();
});

async function closeRuntime(tx: BuildTenDbTransaction, data: Awaited<ReturnType<typeof insertBuildTenFixture>>) {
  const closedAt = new Date("2026-09-01T22:00:00.000Z");
  await tx.update(campaignSessionEncounterReaction).set({
    status: "resolved",
    outcome: "failure",
    resolvedAt: closedAt,
    updatedAt: closedAt,
  }).where(eq(campaignSessionEncounterReaction.id, data.reactionId));
  await tx.update(campaignSessionEncounterPendingActionSource).set({
    resolutionStatus: "resolved",
    resolvedAt: closedAt,
    resolutionSummary: "Explicit G.O.D. resolution.",
    updatedAt: closedAt,
  }).where(eq(campaignSessionEncounterPendingActionSource.pendingActionId, data.pendingActionId));
  await tx.update(campaignSessionEncounterInitiative).set({
    status: "closed",
    closedAt,
    updatedAt: closedAt,
  }).where(eq(campaignSessionEncounterInitiative.encounterId, data.encounterId));
  await tx.update(campaignSessionEncounter).set({
    status: "completed",
    completedAt: closedAt,
    updatedAt: closedAt,
  }).where(eq(campaignSessionEncounter.id, data.encounterId));
  await tx.update(campaignSessionScene).set({
    status: "completed",
    completedAt: closedAt,
    updatedAt: closedAt,
  }).where(eq(campaignSessionScene.id, data.sceneId));
}

test("Session Closeout defensively discovers every unresolved runtime blocker", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "blockers");
    const context = await lockSessionCloseoutContextInTransaction(tx, data.sessionId, data.godId);
    const initial = await readSessionCloseoutInTransaction(tx, context);
    assert.deepEqual(initial.blockers.map(({ code }) => code), [
      "scene-active",
      "encounter-active",
      "initiative-active",
      "authored-action-pending",
      "reaction-declared",
    ]);
    assert.equal(initial.canFinalize, false);

    await tx.update(campaignSessionEncounterPendingAction).set({ status: "active", completedRound: null }).where(eq(campaignSessionEncounterPendingAction.id, data.pendingActionId));
    const activePending = await readSessionCloseoutInTransaction(tx, context);
    assert.ok(activePending.blockers.some(({ code }) => code === "pending-action-active"));

    const ruledAt = new Date("2026-09-01T21:00:00.000Z");
    await tx.update(campaignSessionEncounterPendingAction).set({ status: "interrupted", updatedAt: ruledAt }).where(eq(campaignSessionEncounterPendingAction.id, data.pendingActionId));
    await tx.update(campaignSessionEncounterPendingActionSource).set({ resolutionStatus: "needs-ruling", resolvedAt: ruledAt, updatedAt: ruledAt }).where(eq(campaignSessionEncounterPendingActionSource.pendingActionId, data.pendingActionId));
    await tx.update(campaignSessionEncounterReaction).set({ status: "needs-ruling", resolvedAt: ruledAt, updatedAt: ruledAt }).where(eq(campaignSessionEncounterReaction.id, data.reactionId));
    const needsRuling = await readSessionCloseoutInTransaction(tx, context);
    assert.ok(needsRuling.blockers.some(({ code }) => code === "pending-action-interrupted"));
    assert.ok(needsRuling.blockers.some(({ code }) => code === "authored-action-needs-ruling"));
    assert.ok(needsRuling.blockers.some(({ code }) => code === "reaction-needs-ruling"));
    await assert.rejects(finalizeSessionCloseoutInTransaction(tx, context), /Session closeout is blocked/);
    const [unchanged] = await tx.select().from(campaignSession).where(eq(campaignSession.id, data.sessionId));
    assert.equal(unchanged?.status, "active");
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("unused preparation and unbound finite/Scene effects warn without becoming blockers", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "warnings");
    await closeRuntime(tx, data);
    const [plannedScene] = await tx.insert(campaignSessionScene).values({
      sessionId: data.sessionId,
      campaignId: data.campaignId,
      sequenceNumber: 2,
      title: "Unused Scene",
    }).returning({ id: campaignSessionScene.id });
    assert.ok(plannedScene);
    await tx.insert(campaignSessionEncounter).values({
      sceneId: plannedScene.id,
      sessionId: data.sessionId,
      campaignId: data.campaignId,
      sequenceNumber: 1,
      title: "Unused Encounter",
      encounterType: "other",
    });
    await tx.insert(campaignCharacterActiveCondition).values([
      {
        characterId: data.heroId,
        name: "Finite Unbound",
        sourceKind: "god",
        sourceId: data.godId,
        sourceName: "Build 10",
        durationKind: "combat-rounds",
        durationValue: 2,
        durationLabel: "2 Rounds",
      },
      {
        characterId: data.heroId,
        name: "Scene Unbound",
        sourceKind: "god",
        sourceId: data.godId,
        sourceName: "Build 10",
        durationKind: "scene",
        durationLabel: "Scene",
      },
      {
        characterId: data.heroId,
        name: "Until Removed",
        sourceKind: "god",
        sourceId: data.godId,
        sourceName: "Build 10",
        durationKind: "until-removed",
        durationLabel: "Until Removed",
      },
    ]);
    const context = await lockSessionCloseoutContextInTransaction(tx, data.sessionId, data.godId);
    const view = await readSessionCloseoutInTransaction(tx, context);
    assert.deepEqual(view.blockers, []);
    assert.deepEqual(view.warnings.map(({ code }) => code), [
      "planned-scenes",
      "planned-encounters",
      "unbound-duration",
      "unbound-duration",
    ]);
    assert.ok(view.warnings.some(({ message }) => message.includes("Finite Unbound")));
    assert.ok(view.warnings.some(({ message }) => message.includes("Scene Unbound")));
    assert.ok(!view.warnings.some(({ message }) => message.includes("Until Removed")));
    assert.equal(view.canFinalize, true);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("Session finalization and reopen preserve Character state, XP, rewards, Rolls, and deeper history", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "preservation");
    const recorded = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 73,
      label: "Preserved Roll",
    });
    await closeRuntime(tx, data);
    await tx.insert(campaignCharacterActiveMana).values({ characterId: data.heroId, system: "Spellcraft", manaSpent: 6 });
    const [condition] = await tx.insert(campaignCharacterActiveCondition).values({
      characterId: data.heroId,
      name: "Persistent Condition",
      sourceKind: "god",
      sourceId: data.godId,
      sourceName: "Build 10",
      durationKind: "until-removed",
      durationLabel: "Until Removed",
    }).returning({ id: campaignCharacterActiveCondition.id });
    const [modifier] = await tx.insert(campaignCharacterActiveModifier).values({
      characterId: data.heroId,
      label: "Persistent Modifier",
      modifierChannel: "initiative",
      targetKey: "self",
      amount: -1,
      sourceKind: "god",
      sourceId: data.godId,
      sourceName: "Build 10",
      durationKind: "until-removed",
      durationLabel: "Until Removed",
    }).returning({ id: campaignCharacterActiveModifier.id });
    assert.ok(condition && modifier);
    await tx.insert(campaignCharacterInjury).values({
      characterId: data.heroId,
      poolKey: "body",
      poolNameSnapshot: "Body",
      hitLocationNumber: 5,
      hitLocationNameSnapshot: "Torso",
      name: "Persistent Injury",
      damageAmount: 4,
    });
    const [catalogItem] = await tx.insert(item).values({
      canonicalId: `B10-${crypto.randomUUID()}`.toUpperCase(),
      name: "Build 10 Charged Tool",
      catalogScope: "equipment",
      equipmentGroup: "general",
      recordType: "test",
      family: "test",
      category: "test",
      priceBasis: "each",
      createdByUserId: data.godId,
    }).returning({ id: item.id });
    assert.ok(catalogItem);
    await tx.insert(campaignCharacterItem).values({ characterId: data.heroId, itemId: catalogItem.id, quantity: 2, unitCostCredits: 11 });
    await tx.insert(campaignCharacterItemEquipmentState).values({ characterId: data.heroId, itemId: catalogItem.id, state: "equipped", quantity: 1 });
    await tx.insert(campaignCharacterItemInstance).values({ characterId: data.heroId, itemId: catalogItem.id, currentCharges: 3, equipmentState: "wielded", unitCostCredits: 11 });
    await tx.insert(campaignSessionEncounterReward).values({
      encounterId: data.encounterId,
      sceneId: data.sceneId,
      sessionId: data.sessionId,
      campaignId: data.campaignId,
      characterId: data.heroId,
      amount: 25,
      note: "Preserved Encounter reward.",
    });
    const expiredAt = new Date("2026-09-01T21:30:00.000Z");
    const [expiredCondition] = await tx.insert(campaignCharacterActiveCondition).values({
      characterId: data.heroId,
      name: "Expired Scene Effect",
      sourceKind: "god",
      sourceId: data.godId,
      sourceName: "Build 10",
      durationKind: "scene",
      durationLabel: "Scene",
      resolvedAt: expiredAt,
      resolutionNote: "Expired before Session closeout.",
    }).returning({ id: campaignCharacterActiveCondition.id });
    assert.ok(expiredCondition);
    await tx.insert(campaignSessionEffectDurationBinding).values({
      campaignId: data.campaignId,
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      characterId: data.heroId,
      conditionId: expiredCondition.id,
      durationKind: "scene",
      status: "expired",
      closedAt: expiredAt,
      closeReason: "Scene completed.",
    });

    const before = {
      health: await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, data.heroId)),
      mana: await tx.select().from(campaignCharacterActiveMana).where(eq(campaignCharacterActiveMana.characterId, data.heroId)),
      conditions: await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.characterId, data.heroId)).orderBy(asc(campaignCharacterActiveCondition.id)),
      modifiers: await tx.select().from(campaignCharacterActiveModifier).where(eq(campaignCharacterActiveModifier.characterId, data.heroId)).orderBy(asc(campaignCharacterActiveModifier.id)),
      injuries: await tx.select().from(campaignCharacterInjury).where(eq(campaignCharacterInjury.characterId, data.heroId)),
      stack: await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, data.heroId)),
      equipment: await tx.select().from(campaignCharacterItemEquipmentState).where(eq(campaignCharacterItemEquipmentState.characterId, data.heroId)),
      instances: await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.characterId, data.heroId)),
      profile: await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, data.heroId)),
      rewards: await tx.select().from(campaignSessionEncounterReward).where(eq(campaignSessionEncounterReward.sessionId, data.sessionId)),
      rolls: await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.sessionId, data.sessionId)),
      durations: await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.sessionId, data.sessionId)),
      scene: await tx.select().from(campaignSessionScene).where(eq(campaignSessionScene.id, data.sceneId)),
      encounter: await tx.select().from(campaignSessionEncounter).where(eq(campaignSessionEncounter.id, data.encounterId)),
      initiative: await tx.select().from(campaignSessionEncounterInitiative).where(eq(campaignSessionEncounterInitiative.encounterId, data.encounterId)),
    };
    const context = await lockSessionCloseoutContextInTransaction(tx, data.sessionId, data.godId);
    const preview = await readSessionCloseoutInTransaction(tx, context);
    assert.equal(preview.canFinalize, true);
    assert.equal(preview.rolls.total, 1);
    assert.equal(preview.rewards.totalExperience, 25);
    const completed = await finalizeSessionCloseoutInTransaction(tx, context);
    assert.equal(completed.session.status, "completed");
    assert.ok(completed.session.completedAt);

    const afterCompletion = {
      health: await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, data.heroId)),
      mana: await tx.select().from(campaignCharacterActiveMana).where(eq(campaignCharacterActiveMana.characterId, data.heroId)),
      conditions: await tx.select().from(campaignCharacterActiveCondition).where(eq(campaignCharacterActiveCondition.characterId, data.heroId)).orderBy(asc(campaignCharacterActiveCondition.id)),
      modifiers: await tx.select().from(campaignCharacterActiveModifier).where(eq(campaignCharacterActiveModifier.characterId, data.heroId)).orderBy(asc(campaignCharacterActiveModifier.id)),
      injuries: await tx.select().from(campaignCharacterInjury).where(eq(campaignCharacterInjury.characterId, data.heroId)),
      stack: await tx.select().from(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, data.heroId)),
      equipment: await tx.select().from(campaignCharacterItemEquipmentState).where(eq(campaignCharacterItemEquipmentState.characterId, data.heroId)),
      instances: await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.characterId, data.heroId)),
      profile: await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, data.heroId)),
      rewards: await tx.select().from(campaignSessionEncounterReward).where(eq(campaignSessionEncounterReward.sessionId, data.sessionId)),
      rolls: await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.sessionId, data.sessionId)),
      durations: await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.sessionId, data.sessionId)),
      scene: await tx.select().from(campaignSessionScene).where(eq(campaignSessionScene.id, data.sceneId)),
      encounter: await tx.select().from(campaignSessionEncounter).where(eq(campaignSessionEncounter.id, data.encounterId)),
      initiative: await tx.select().from(campaignSessionEncounterInitiative).where(eq(campaignSessionEncounterInitiative.encounterId, data.encounterId)),
    };
    assert.deepEqual(afterCompletion, before);
    const historyWhileCompleted = await readRollLedgerInTransaction(tx, data.actor, data.sessionId, { limit: 10 });
    assert.deepEqual(historyWhileCompleted.rolls.map(({ id }) => id), [recorded.id]);
    await assert.rejects(recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 50,
    }), /completed Session/);

    const next = transitionSession({
      status: "completed",
      startedAt: context.startedAt,
      completedAt: new Date(completed.session.completedAt!),
    }, "reopen");
    await tx.update(campaignSession).set({ ...next, updatedAt: new Date() }).where(and(
      eq(campaignSession.id, data.sessionId),
      eq(campaignSession.status, "completed"),
    ));
    const afterReopen = {
      rewards: await tx.select().from(campaignSessionEncounterReward).where(eq(campaignSessionEncounterReward.sessionId, data.sessionId)),
      rolls: await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.sessionId, data.sessionId)),
      profile: await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, data.heroId)),
      durations: await tx.select().from(campaignSessionEffectDurationBinding).where(eq(campaignSessionEffectDurationBinding.sessionId, data.sessionId)),
      scene: await tx.select().from(campaignSessionScene).where(eq(campaignSessionScene.id, data.sceneId)),
      encounter: await tx.select().from(campaignSessionEncounter).where(eq(campaignSessionEncounter.id, data.encounterId)),
      initiative: await tx.select().from(campaignSessionEncounterInitiative).where(eq(campaignSessionEncounterInitiative.encounterId, data.encounterId)),
    };
    assert.deepEqual(afterReopen, {
      rewards: before.rewards,
      rolls: before.rolls,
      profile: before.profile,
      durations: before.durations,
      scene: before.scene,
      encounter: before.encounter,
      initiative: before.initiative,
    });
    assert.equal(afterReopen.durations[0]?.status, "expired");
    const newRoll = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 50,
    });
    assert.notEqual(newRoll.id, recorded.id);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.sessionId, data.sessionId))).length, 2);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

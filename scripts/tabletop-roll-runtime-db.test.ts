import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter, campaignCharacterActiveHealth } from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionRoll,
} from "@/db/tabletop-operations-schema";
import {
  readRollLedgerInTransaction,
  recordRollInTransaction,
  voidRollInTransaction,
} from "@/features/tabletop-operations/roll-runtime-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Build 10 Roll Runtime PostgreSQL validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Build 10 Roll tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Build 10 Roll tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_TABLETOP_ROLL_TEST");

after(async () => {
  await pool.end();
});

test("System Random and entered/physical Rolls share one distinguishable ledger with visibility policy", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "methods");
    const random = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.heroId,
      targetCharacterId: data.defenderId,
      method: "random",
      visibility: "table",
      purposeKind: "attack",
      label: "Random attack reference",
    }, () => 73);
    const entered = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "god-only",
      purposeKind: "free",
      enteredTotal: 73,
      label: "Physical Roll",
    });
    assert.equal(random.resultTotal, 73);
    assert.equal(random.method, "random");
    assert.equal(random.visibility, "table");
    assert.equal(random.roundNumber, 3);
    assert.equal(random.stepNumber, 7);
    assert.equal(entered.resultTotal, 73);
    assert.equal(entered.method, "entered");
    assert.equal(entered.visibility, "god-only");
    const ownerPage = await readRollLedgerInTransaction(tx, data.actor, data.sessionId, { limit: 10 });
    assert.deepEqual(ownerPage.rolls.map(({ id }) => id), [entered.id, random.id]);
    const playerPage = await readRollLedgerInTransaction(tx, {
      ...data.actor,
      readAs: "player",
      canRecordGodOnly: false,
    }, data.sessionId, { limit: 10 });
    assert.deepEqual(playerPage.rolls.map(({ id }) => id), [random.id]);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("Character hierarchy rejects Encounter nonparticipants and cross-Campaign Characters", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "characters");
    await assert.rejects(recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.rosterOnlyId,
      method: "entered",
      visibility: "table",
      purposeKind: "skill",
      enteredTotal: 40,
    }), /exact Encounter Participant/);

    const otherId = `build10-other-${crypto.randomUUID()}`;
    await tx.insert(user).values({ id: otherId, name: "Other", email: `${otherId}@example.invalid`, username: otherId });
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
      createdByUserId: otherId,
    }).returning({ id: campaign.id });
    assert.ok(otherCampaign);
    await tx.insert(campaignPlayer).values({ campaignId: otherCampaign.id, userId: otherId });
    const [outsider] = await tx.insert(campaignCharacter).values({ campaignId: otherCampaign.id, playerUserId: otherId, name: "Outsider" }).returning({ id: campaignCharacter.id });
    assert.ok(outsider);
    await assert.rejects(recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      rollerCharacterId: outsider.id,
      method: "entered",
      visibility: "table",
      purposeKind: "skill",
      enteredTotal: 40,
    }), /exact Session Roster member/);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.sessionId, data.sessionId))).length, 0);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("pending-action and Reaction links validate exact actor identity", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "links");
    await assert.rejects(recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.defenderId,
      pendingActionId: data.pendingActionId,
      method: "entered",
      visibility: "table",
      purposeKind: "attack",
      enteredTotal: 55,
    }), /action's actor Character/);
    await assert.rejects(recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.heroId,
      reactionId: data.reactionId,
      method: "entered",
      visibility: "table",
      purposeKind: "defense",
      enteredTotal: 65,
    }), /reacting Character/);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("linked action and Reaction Rolls change only Roll history", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "nonautomation");
    const beforeAction = (await tx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, data.pendingActionId)))[0]!;
    const beforeReaction = (await tx.select().from(campaignSessionEncounterReaction).where(eq(campaignSessionEncounterReaction.id, data.reactionId)))[0]!;
    const beforeInitiative = await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, data.encounterId));
    const beforeHealth = await tx.select().from(campaignCharacterActiveHealth).where(and(
      eq(campaignCharacterActiveHealth.characterId, data.heroId),
    ));
    await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.heroId,
      targetCharacterId: data.defenderId,
      pendingActionId: data.pendingActionId,
      method: "entered",
      visibility: "table",
      purposeKind: "attack",
      enteredTotal: 73,
    });
    await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.defenderId,
      reactionId: data.reactionId,
      method: "entered",
      visibility: "table",
      purposeKind: "defense",
      enteredTotal: 82,
    });
    const afterAction = (await tx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, data.pendingActionId)))[0]!;
    const afterReaction = (await tx.select().from(campaignSessionEncounterReaction).where(eq(campaignSessionEncounterReaction.id, data.reactionId)))[0]!;
    const afterInitiative = await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, data.encounterId));
    const afterHealth = await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, data.heroId));
    assert.equal(afterAction.status, beforeAction.status);
    assert.equal(afterAction.updatedAt.toISOString(), beforeAction.updatedAt.toISOString());
    assert.equal(afterReaction.status, beforeReaction.status);
    assert.equal(afterReaction.outcome, beforeReaction.outcome);
    assert.deepEqual(afterInitiative.map(({ characterId, currentInitiative, deferredInitiativeCost, lastSatisfiedStep }) => ({ characterId, currentInitiative, deferredInitiativeCost, lastSatisfiedStep })), beforeInitiative.map(({ characterId, currentInitiative, deferredInitiativeCost, lastSatisfiedStep }) => ({ characterId, currentInitiative, deferredInitiativeCost, lastSatisfiedStep })));
    assert.deepEqual(afterHealth.map(({ totalDamage }) => totalDamage), beforeHealth.map(({ totalDamage }) => totalDamage));
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.sessionId, data.sessionId))).length, 2);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("Void preserves original Roll context and rejects a second Void", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "void");
    const recorded = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.heroId,
      targetCharacterId: data.defenderId,
      pendingActionId: data.pendingActionId,
      method: "entered",
      visibility: "table",
      purposeKind: "attack",
      enteredTotal: 73,
      targetNumber: 55,
      label: "Longsword Attack",
    });
    const voided = await voidRollInTransaction(tx, data.actor, recorded.id, "wrong physical result");
    assert.equal(voided.status, "voided");
    assert.equal(voided.voidReason, "wrong physical result");
    for (const field of ["id", "resultTotal", "method", "visibility", "rollerCharacterId", "targetCharacterId", "pendingActionId", "targetNumber", "createdAt"] as const) {
      assert.equal(voided[field], recorded[field]);
    }
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.id, recorded.id))).length, 1);
    await assert.rejects(voidRollInTransaction(tx, data.actor, recorded.id, "again"), /already voided/);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("completed Encounter and completed Session reject new scoped Rolls without altering history", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "completed");
    const existing = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 100,
    });
    await tx.update(campaignSessionEncounter).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSessionEncounter.id, data.encounterId));
    await assert.rejects(recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 20,
    }), /completed Encounter/);
    await tx.update(campaignSession).set({ status: "completed", completedAt: new Date() }).where(eq(campaignSession.id, data.sessionId));
    await assert.rejects(recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 30,
    }), /completed Session/);
    const history = await readRollLedgerInTransaction(tx, data.actor, data.sessionId, { limit: 10 });
    assert.deepEqual(history.rolls.map(({ id }) => id), [existing.id]);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

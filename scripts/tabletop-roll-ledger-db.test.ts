import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { skill } from "@/db/skill-schema";
import {
  campaignCharacterAttribute,
  campaignCharacterActiveHealth,
  campaignCharacterSkillAllocation,
} from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionRoll,
  campaignSessionRollAmendment,
} from "@/db/tabletop-operations-schema";
import {
  correctRollInTransaction,
  readRollLedgerInTransaction,
  recordRollInTransaction,
  recordRollRulingInTransaction,
  voidRollInTransaction,
} from "@/features/tabletop-operations/roll-runtime-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Pass 2 Roll Ledger PostgreSQL validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Pass 2 Roll Ledger tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Pass 2 Roll Ledger tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_TABLETOP_ROLL_LEDGER_TEST");

function databaseErrorMatches(pattern: RegExp): (error: unknown) => boolean {
  return (error: unknown) => {
    const messages: string[] = [];
    let current = error;
    while (current instanceof Error) {
      messages.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    }
    return pattern.test(messages.join("\n"));
  };
}

after(async () => {
  await pool.end();
});

test("free, Attribute, Skill, and manual Rolls retain immutable server-produced snapshots", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "pass2-snapshots");
    await tx.insert(campaignCharacterAttribute).values({ characterId: data.heroId, attributeKey: "DEX", value: 37 });
    const [rootSkill, childSkill] = await tx.insert(skill).values([
      { name: `Pass 2 Seamanship ${crypto.randomUUID()}`, classification: "standard", tier: 1, createdByUserId: data.godId },
      { name: `Pass 2 Rigging ${crypto.randomUUID()}`, classification: "standard", tier: 2, createdByUserId: data.godId },
    ]).returning({ id: skill.id, name: skill.name });
    assert.ok(rootSkill && childSkill);
    const [rootAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: data.heroId,
      skillId: rootSkill.id,
      points: 4,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(rootAllocation);
    const [childAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({
      characterId: data.heroId,
      skillId: childSkill.id,
      parentAllocationId: rootAllocation.id,
      points: 7,
    }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(childAllocation);

    const free = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 73,
    });
    assert.equal(free.mechanicalSnapshot, null);

    const attributeRoll = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.heroId,
      method: "entered",
      visibility: "private",
      purposeKind: "attribute",
      enteredTotal: 73,
      mechanical: {
        governingSource: { kind: "attribute", characterId: data.heroId, attributeKey: "DEX" },
        modifiers: [{ kind: "bonus", label: "Prepared", magnitude: 10 }],
      },
    });
    assert.deepEqual(attributeRoll.mechanicalSnapshot?.governingSource, {
      kind: "attribute",
      characterId: data.heroId,
      attributeKey: "DEX",
      attributeDisplayName: "Dexterity",
      attributeValue: 37,
      originalTarget: 63,
    });
    assert.equal(attributeRoll.mechanicalSnapshot?.resolution.finalTarget, 53);

    const skillRoll = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.heroId,
      method: "entered",
      visibility: "private",
      purposeKind: "skill",
      enteredTotal: 73,
      mechanical: {
        governingSource: {
          kind: "skill",
          characterId: data.heroId,
          allocationId: childAllocation.id,
          calculatedPercentage: 48,
        },
      },
    });
    assert.equal(skillRoll.mechanicalSnapshot?.governingSource.kind, "skill");
    if (skillRoll.mechanicalSnapshot?.governingSource.kind !== "skill") throw new Error("Expected Skill snapshot.");
    assert.equal(skillRoll.mechanicalSnapshot.governingSource.allocationId, childAllocation.id);
    assert.equal(skillRoll.mechanicalSnapshot.governingSource.skillId, childSkill.id);
    assert.deepEqual(skillRoll.mechanicalSnapshot.governingSource.skillPath.map(({ skillName }) => skillName), [rootSkill.name, childSkill.name]);
    assert.equal(skillRoll.mechanicalSnapshot.governingSource.calculatedPercentage, 48);
    assert.equal(skillRoll.mechanicalSnapshot.governingSource.originalTarget, 48);

    const manualInput = {
      governingSource: { kind: "manual" as const, label: "G.O.D. storm target", originalTarget: 55 },
      modifiers: [
        { kind: "bonus" as const, label: "Secured line", magnitude: 10 },
        { kind: "penalty" as const, label: "Heavy wind", magnitude: 20 },
      ],
    };
    const physical = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "god-only",
      purposeKind: "other",
      enteredTotal: 73,
      mechanical: manualInput,
    });
    const website = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "random",
      visibility: "god-only",
      purposeKind: "other",
      mechanical: manualInput,
    }, () => 73);
    assert.deepEqual(website.mechanicalSnapshot, physical.mechanicalSnapshot);
    assert.equal(physical.mechanicalSnapshot?.resolution.originalTarget, 55);
    assert.equal(physical.mechanicalSnapshot?.resolution.finalTarget, 65);
    assert.equal(physical.targetNumber, 55);

    await tx.update(campaignCharacterAttribute).set({ value: 99 }).where(and(
      eq(campaignCharacterAttribute.characterId, data.heroId),
      eq(campaignCharacterAttribute.attributeKey, "DEX"),
    ));
    await tx.update(campaignCharacterSkillAllocation).set({ points: 99 }).where(eq(campaignCharacterSkillAllocation.id, childAllocation.id));
    await tx.update(skill).set({ name: "Renamed after Roll" }).where(eq(skill.id, childSkill.id));
    const history = await readRollLedgerInTransaction(tx, data.actor, data.sessionId, { limit: 20 });
    const reloadedAttribute = history.rolls.find(({ id }) => id === attributeRoll.id)!;
    const reloadedSkill = history.rolls.find(({ id }) => id === skillRoll.id)!;
    assert.deepEqual(reloadedAttribute.mechanicalSnapshot, attributeRoll.mechanicalSnapshot);
    assert.deepEqual(reloadedSkill.mechanicalSnapshot, skillRoll.mechanicalSnapshot);
    assert.equal(reloadedSkill.mechanicalSnapshot?.governingSource.kind === "skill" ? reloadedSkill.mechanicalSnapshot.governingSource.skillName : null, childSkill.name);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("private visibility is Character-contextual and foreign table mechanics are redacted", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "pass2-visibility");
    const tableNpc = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.defenderId,
      method: "entered",
      visibility: "table",
      purposeKind: "other",
      enteredTotal: 40,
      mechanical: { governingSource: { kind: "manual", label: "Hidden NPC basis", originalTarget: 45 } },
    });
    const ownPrivate = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.heroId,
      method: "entered",
      visibility: "private",
      purposeKind: "free",
      enteredTotal: 41,
    });
    await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      sceneId: data.sceneId,
      encounterId: data.encounterId,
      rollerCharacterId: data.defenderId,
      method: "entered",
      visibility: "private",
      purposeKind: "free",
      enteredTotal: 42,
    });
    await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "god-only",
      purposeKind: "free",
      enteredTotal: 43,
    });
    const ownerPage = await readRollLedgerInTransaction(tx, data.actor, data.sessionId, { limit: 20 });
    assert.equal(ownerPage.rolls.length, 4);
    assert.equal(ownerPage.rolls.find(({ id }) => id === tableNpc.id)?.mechanicalSnapshot !== null, true);
    const playerActor = { ...data.actor, readAs: "player" as const, canRecordGodOnly: false, characterId: data.heroId };
    const page = await readRollLedgerInTransaction(tx, playerActor, data.sessionId, { limit: 20 });
    assert.deepEqual(page.rolls.map(({ id }) => id).sort((a, b) => a - b), [tableNpc.id, ownPrivate.id].sort((a, b) => a - b));
    const redacted = page.rolls.find(({ id }) => id === tableNpc.id)!;
    assert.equal(redacted.mechanicalSnapshot, null);
    assert.equal(redacted.effectiveMechanicalSnapshot, null);
    assert.equal(redacted.targetNumber, null);
    assert.equal(redacted.mechanicsRedacted, true);
    const foreignFilter = await readRollLedgerInTransaction(tx, playerActor, data.sessionId, { characterId: data.defenderId, limit: 20 });
    assert.deepEqual(foreignFilter.rolls.map(({ id }) => id), [tableNpc.id]);
    await assert.rejects(
      readRollLedgerInTransaction(tx, playerActor, data.sessionId, { visibility: "god-only" }),
      /not readable/,
    );
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("corrections, rulings, and voids append a complete chain without changing Roll or combat state", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "pass2-amendments");
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
      mechanical: { governingSource: { kind: "manual", label: "Original target", originalTarget: 55 } },
    });
    const originalRow = (await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.id, recorded.id)))[0]!;
    const beforeAction = (await tx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, data.pendingActionId)))[0]!;
    const beforeReaction = await tx.select().from(campaignSessionEncounterReaction).where(eq(campaignSessionEncounterReaction.encounterId, data.encounterId));
    const beforeInitiative = await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, data.encounterId));
    const beforeHealth = await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, data.heroId));

    const first = await correctRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      rollId: recorded.id,
      reason: "The bonus was omitted",
      governingSource: { kind: "manual", label: "Corrected target", originalTarget: 55 },
      modifiers: [{ kind: "bonus", label: "Prepared", magnitude: 10 }],
    });
    assert.equal(first.resultTotal, 73);
    assert.equal(first.effectiveMechanicalSnapshot?.resolution.resultTotal, 73);
    assert.equal(first.effectiveMechanicalSnapshot?.resolution.finalTarget, 45);
    const second = await correctRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      rollId: recorded.id,
      reason: "Physical die was transcribed incorrectly",
      correctedResultTotal: 88,
      governingSource: { kind: "manual", label: "Corrected target", originalTarget: 55 },
      modifiers: [{ kind: "bonus", label: "Prepared", magnitude: 10 }],
      rulingText: "Use the corrected physical reading.",
    });
    assert.equal(second.resultTotal, 73);
    assert.equal(second.effectiveResultTotal, 88);
    assert.equal(second.effectiveMechanicalSnapshot?.rawResultSource, "corrected-result");
    const ruled = await recordRollRulingInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      rollId: recorded.id,
      reason: "Document the table decision",
      rulingText: "No narrative consequence is generated by the ledger.",
    });
    assert.equal(ruled.rulingText, "No narrative consequence is generated by the ledger.");
    const voided = await voidRollInTransaction(tx, data.actor, data.sessionId, recorded.id, "Recorded against the wrong action");
    assert.equal(voided.status, "voided");
    assert.equal(voided.voidReason, "Recorded against the wrong action");
    assert.deepEqual(voided.amendments.map(({ kind }) => kind), ["correction", "correction", "ruling", "void"]);
    assert.equal(voided.amendments[0]?.mechanicalSnapshot?.resolution.resultTotal, 73);
    assert.equal(voided.amendments[1]?.mechanicalSnapshot?.resolution.resultTotal, 88);
    assert.equal(voided.amendments[3]?.reason, "Recorded against the wrong action");
    assert.equal(voided.amendments[3]?.createdByUserId, data.godId);
    assert.equal(Number.isNaN(Date.parse(voided.amendments[3]!.createdAt)), false);
    assert.deepEqual(voided.amendments.map(({ previousAmendmentId }) => previousAmendmentId), [
      null,
      voided.amendments[0]!.id,
      voided.amendments[1]!.id,
      voided.amendments[2]!.id,
    ]);
    assert.deepEqual((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.id, recorded.id)))[0], originalRow);
    assert.deepEqual(await tx.select().from(campaignSessionEncounterReaction).where(eq(campaignSessionEncounterReaction.encounterId, data.encounterId)), beforeReaction);
    assert.deepEqual(await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, data.encounterId)), beforeInitiative);
    assert.deepEqual(await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, data.heroId)), beforeHealth);
    assert.deepEqual((await tx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, data.pendingActionId)))[0], beforeAction);
    const active = await readRollLedgerInTransaction(tx, data.actor, data.sessionId, { status: "recorded" });
    const voidHistory = await readRollLedgerInTransaction(tx, data.actor, data.sessionId, { status: "voided" });
    assert.equal(active.rolls.some(({ id }) => id === recorded.id), false);
    assert.equal(voidHistory.rolls.some(({ id }) => id === recorded.id), true);
    const paginationRoll = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 44,
    });
    const firstPage = await readRollLedgerInTransaction(tx, data.actor, data.sessionId, { limit: 1 });
    assert.equal(firstPage.rolls.length, 1);
    assert.equal(firstPage.rolls[0]?.id, paginationRoll.id);
    assert.notEqual(firstPage.nextBeforeId, null);
    const secondPage = await readRollLedgerInTransaction(tx, data.actor, data.sessionId, {
      beforeId: firstPage.nextBeforeId,
      limit: 1,
    });
    assert.equal(secondPage.rolls.length, 1);
    assert.equal(secondPage.rolls[0]?.id, recorded.id);
    await assert.rejects(correctRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      rollId: recorded.id,
      reason: "Too late",
      governingSource: { kind: "manual", label: "Target", originalTarget: 50 },
    }), /voided Roll/);

    const critical = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "god-only",
      purposeKind: "other",
      enteredTotal: 100,
      mechanical: { governingSource: { kind: "manual", label: "Impossible collision", originalTarget: 120 } },
    });
    const criticalSnapshot = critical.mechanicalSnapshot;
    const criticalRuled = await recordRollRulingInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      rollId: critical.id,
      reason: "Critical result requires interpretation",
      rulingText: "The G.O.D. records the decision; the ledger applies no consequence.",
    });
    assert.deepEqual(criticalRuled.mechanicalSnapshot, criticalSnapshot);
    assert.equal(criticalRuled.mechanicalSnapshot?.resolution.doubleOtt, true);
    assert.equal(criticalRuled.mechanicalSnapshot?.resolution.impossibleTarget, true);

    const [otherSession] = await tx.insert(campaignSession).values({
      campaignId: data.campaignId,
      title: "Wrong Session",
      sequenceNumber: 2,
      status: "planned",
    }).returning({ id: campaignSession.id });
    assert.ok(otherSession);
    await assert.rejects(voidRollInTransaction(tx, data.actor, otherSession.id, recorded.id, "Wrong session"), /Campaign and Session/);
    await assert.rejects(correctRollInTransaction(tx, data.actor, {
      sessionId: otherSession.id,
      rollId: recorded.id,
      reason: "Wrong session",
      governingSource: { kind: "manual", label: "Target", originalTarget: 50 },
    }), /Campaign and Session/);
    const otherCampaign = await insertBuildTenFixture(tx, "pass2-cross-campaign");
    const otherRoll = await recordRollInTransaction(tx, otherCampaign.actor, {
      sessionId: otherCampaign.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 30,
    });
    await assert.rejects(
      voidRollInTransaction(tx, data.actor, otherCampaign.sessionId, otherRoll.id, "Wrong Campaign"),
      /Campaign and Session/,
    );
    await assert.rejects(correctRollInTransaction(tx, data.actor, {
      sessionId: otherCampaign.sessionId,
      rollId: otherRoll.id,
      reason: "Wrong Campaign",
      governingSource: { kind: "manual", label: "Target", originalTarget: 50 },
    }), /Campaign and Session/);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("legacy mutated void metadata remains readable without a fabricated snapshot", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "pass2-legacy");
    const recorded = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 22,
      targetNumber: 60,
    });
    const legacyTime = new Date("2026-09-02T12:00:00.000Z");
    await tx.update(campaignSessionRoll).set({
      status: "voided",
      voidedAt: legacyTime,
      voidReason: "Legacy mutating void",
      voidedByUserId: data.godId,
    }).where(eq(campaignSessionRoll.id, recorded.id));
    const loaded = (await readRollLedgerInTransaction(tx, data.actor, data.sessionId)).rolls.find(({ id }) => id === recorded.id)!;
    assert.equal(loaded.mechanicalSnapshot, null);
    assert.equal(loaded.targetNumber, 60);
    assert.deepEqual(loaded.legacyVoid, {
      voidedAt: legacyTime.toISOString(),
      reason: "Legacy mutating void",
      voidedByUserId: data.godId,
      voidedByName: data.godId,
    });
    assert.equal(loaded.status, "voided");
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("database rejects amendment ownership that does not match the original Roll", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "pass2-bad-owner");
    const roll = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 20,
    });
    await tx.insert(campaignSessionRollAmendment).values({
      rollId: roll.id,
      campaignId: data.campaignId + 999_999,
      sessionId: data.sessionId,
      kind: "void",
      reason: "Invalid owner",
      createdByUserId: data.godId,
    });
  }), databaseErrorMatches(/campaign_session_roll_amendment_roll_fk/));
});

test("database rejects invalid amendment kind and missing required content", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "pass2-bad-kind");
    const roll = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 20,
    });
    await tx.insert(campaignSessionRollAmendment).values({
      rollId: roll.id,
      campaignId: data.campaignId,
      sessionId: data.sessionId,
      kind: "rewrite" as never,
      reason: "Invalid kind",
      createdByUserId: data.godId,
    });
  }), databaseErrorMatches(/invalid input value for enum campaign_session_roll_amendment_kind/));

  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "pass2-blank-reason");
    const roll = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 20,
    });
    await tx.insert(campaignSessionRollAmendment).values({
      rollId: roll.id,
      campaignId: data.campaignId,
      sessionId: data.sessionId,
      kind: "void",
      reason: "   ",
      createdByUserId: data.godId,
    });
  }), databaseErrorMatches(/campaign_session_roll_amendment_reason_valid/));
});

test("an amendment prevents deletion of its original Roll", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await insertBuildTenFixture(tx, "pass2-delete-restrict");
    const roll = await recordRollInTransaction(tx, data.actor, {
      sessionId: data.sessionId,
      method: "entered",
      visibility: "table",
      purposeKind: "free",
      enteredTotal: 20,
    });
    await voidRollInTransaction(tx, data.actor, data.sessionId, roll.id, "Preserve this history");
    await tx.delete(campaignSessionRoll).where(eq(campaignSessionRoll.id, roll.id));
  }), databaseErrorMatches(/campaign_session_roll_amendment_roll_fk/));
});

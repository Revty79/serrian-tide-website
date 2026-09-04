import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterSkillAllocation,
} from "@/db/realm-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import {
  campaignSession,
  campaignSessionCalledCheckEvent,
  campaignSessionCalledCheckRequest,
  campaignSessionHighLowEvent,
  campaignSessionHighLowRequest,
  campaignSessionRoll,
  campaignSessionRoster,
} from "@/db/tabletop-operations-schema";
import {
  answerCalledCheckInTransaction,
  answerHighLowInTransaction,
  callHighLowInTransaction,
  cancelCalledCheckInTransaction,
  cancelHighLowInTransaction,
  issueCalledCheckInTransaction,
  issueHighLowInTransaction,
  readGodCalledCheckWorkspaceInTransaction,
  readPlayerCalledCheckWorkspaceInTransaction,
  rerollCalledCheckInTransaction,
  rerollHighLowInTransaction,
  revealCalledCheckInTransaction,
  ruleHighLowInTransaction,
} from "@/features/tabletop-operations/called-check-service";
import {
  lockSessionCloseoutContextInTransaction,
  readSessionCloseoutInTransaction,
} from "@/features/tabletop-operations/session-closeout-service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Called Check validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Called Check tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Called Check tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_PASS_11_CALLED_CHECKS");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

after(async () => {
  await pool.end();
});

async function addUser(tx: Tx, label: string, roles: Array<"admin" | "god" | "player">): Promise<string> {
  const id = `pass11-${label}-${crypto.randomUUID()}`;
  await tx.insert(user).values({ id, name: `Pass 11 ${label}`, email: `${id}@example.invalid`, username: id });
  if (roles.length) await tx.insert(userRole).values(roles.map((role) => ({ userId: id, role })));
  return id;
}

async function addCampaign(tx: Tx, ownerUserId: string, label: string) {
  const [created] = await tx.insert(campaign).values({
    name: `Pass 11 ${label}`,
    overview: "Rollback-only Called Check fixture.",
    attributePoints: 0,
    skillPoints: 0,
    maxStartingSkill: 0,
    pointsToUnlockNextTier: 0,
    maxPointsInSkill: 100,
    startingCreditAmount: 0,
    currencySystem: "Credits",
    fatePointMethod: "Assigned",
    assignedFatePoints: 0,
    createdByUserId: ownerUserId,
  }).returning({ id: campaign.id });
  assert.ok(created);
  await tx.insert(campaignPlayer).values({ campaignId: created.id, userId: ownerUserId });
  return created.id;
}

test("guarded Called Checks and High/Low persist exact, idempotent, visibility-aware attempt history", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const godId = await addUser(tx, "god", ["god"]);
    const otherGodId = await addUser(tx, "other-god", ["god"]);
    const adminId = await addUser(tx, "admin", ["admin"]);
    const playerAId = await addUser(tx, "player-a", ["player"]);
    const playerBId = await addUser(tx, "player-b", ["player"]);
    const campaignId = await addCampaign(tx, godId, "Campaign");
    await tx.insert(campaignPlayer).values([
      { campaignId, userId: playerAId },
      { campaignId, userId: playerBId },
    ]);
    const characters = await tx.insert(campaignCharacter).values([
      { campaignId, playerUserId: playerAId, name: "Exact Player A" },
      { campaignId, playerUserId: playerBId, name: "Exact Player B" },
      { campaignId, playerUserId: godId, name: "Persistent G.O.D. NPC", isNpc: true, npcKind: "race" },
    ]).returning({ id: campaignCharacter.id });
    const [characterA, characterB, npc] = characters;
    assert.ok(characterA && characterB && npc);
    for (const character of characters) await tx.insert(campaignCharacterAttribute).values([
      { characterId: character.id, attributeKey: "DEX", value: 40 },
      { characterId: character.id, attributeKey: "WIS", value: 45 },
      { characterId: character.id, attributeKey: "INT", value: 35 },
      { characterId: character.id, attributeKey: "STR", value: 30 },
      { characterId: character.id, attributeKey: "CON", value: 25 },
      { characterId: character.id, attributeKey: "CHR", value: 20 },
    ]);
    const createdSkills = await tx.insert(skill).values([
      { name: `Precision Ranged ${crypto.randomUUID()}`, classification: "Skill", tier: 1, primaryAttribute: "DEX" },
      { name: `Firearm Mastery ${crypto.randomUUID()}`, classification: "Skill", tier: 2, primaryAttribute: "DEX" },
      { name: `Handgun Mastery ${crypto.randomUUID()}`, classification: "Skill", tier: 3, primaryAttribute: "DEX" },
      { name: `Rifle Mastery ${crypto.randomUUID()}`, classification: "Skill", tier: 3, primaryAttribute: "DEX" },
    ]).returning({ id: skill.id });
    const [rootSkill, firearmSkill, handgunSkill, rifleSkill] = createdSkills;
    assert.ok(rootSkill && firearmSkill && handgunSkill && rifleSkill);
    await tx.insert(skillRelationship).values([
      { skillId: firearmSkill.id, relatedSkillId: rootSkill.id, relationshipType: "parent" },
      { skillId: handgunSkill.id, relatedSkillId: firearmSkill.id, relationshipType: "parent" },
      { skillId: rifleSkill.id, relatedSkillId: firearmSkill.id, relationshipType: "parent" },
    ]);
    for (const character of [characterA, characterB]) {
      const [rootAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({ characterId: character.id, skillId: rootSkill.id, parentAllocationId: null, points: 20 }).returning({ id: campaignCharacterSkillAllocation.id });
      assert.ok(rootAllocation);
      const [firearmAllocation] = await tx.insert(campaignCharacterSkillAllocation).values({ characterId: character.id, skillId: firearmSkill.id, parentAllocationId: rootAllocation.id, points: 10 }).returning({ id: campaignCharacterSkillAllocation.id });
      assert.ok(firearmAllocation);
      await tx.insert(campaignCharacterSkillAllocation).values(character.id === characterA.id
        ? { characterId: character.id, skillId: handgunSkill.id, parentAllocationId: firearmAllocation.id, points: 5 }
        : { characterId: character.id, skillId: rifleSkill.id, parentAllocationId: firearmAllocation.id, points: 80 });
    }
    const [session] = await tx.insert(campaignSession).values({
      campaignId,
      title: "Pass 11 Active Session",
      sequenceNumber: 1,
      status: "active",
      startedAt: new Date(),
    }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values(characters.map((character, sortOrder) => ({ sessionId: session.id, campaignId, characterId: character.id, sortOrder })));

    await assert.rejects(issueCalledCheckInTransaction(tx, otherGodId, {
      sessionId: session.id,
      source: { kind: "attribute", attributeKey: "WIS" },
      purpose: "Unauthorized",
      recipientScope: "one",
      recipientCharacterIds: [characterA.id],
      visibility: "table",
      rollMethod: "random",
      idempotencyKey: "unauthorized-god",
    }), /Campaign-owning G\.O\.D\./);

    const adminCampaignId = await addCampaign(tx, adminId, "Admin-only Campaign");
    const [adminSession] = await tx.insert(campaignSession).values({ campaignId: adminCampaignId, title: "Admin Session", sequenceNumber: 1, status: "active", startedAt: new Date() }).returning({ id: campaignSession.id });
    assert.ok(adminSession);
    await assert.rejects(issueHighLowInTransaction(tx, adminId, { sessionId: adminSession.id, mode: "neutral", visibility: "table", rollMethod: "random", purpose: "Admin authority probe", idempotencyKey: "admin-only" }), /Campaign-owning G\.O\.D\./);

    await tx.update(campaignCharacterAttribute).set({ value: 35 }).where(and(
      eq(campaignCharacterAttribute.characterId, characterB.id),
      eq(campaignCharacterAttribute.attributeKey, "WIS"),
    ));
    const batchId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: session.id,
      source: { kind: "attribute", attributeKey: "WIS" },
      purpose: "Hear the hidden latch",
      instructions: "Roll independently.",
      recipientScope: "selected",
      recipientCharacterIds: [characterA.id, characterB.id],
      visibility: "table",
      rollMethod: "random",
      modifiers: [{ kind: "bonus", label: "Quiet room", magnitude: 5 }],
      idempotencyKey: "group-attribute",
    });
    assert.equal(await issueCalledCheckInTransaction(tx, godId, {
      sessionId: session.id,
      source: { kind: "attribute", attributeKey: "WIS" },
      purpose: "Ignored duplicate payload",
      recipientScope: "one",
      recipientCharacterIds: [characterA.id],
      visibility: "private",
      rollMethod: "entered",
      idempotencyKey: "group-attribute",
    }), batchId);
    let godView = await readGodCalledCheckWorkspaceInTransaction(tx, session.id, godId);
    const group = godView.batches.find(({ id }) => id === batchId)!;
    assert.equal(group.requests.length, 2);
    assert.deepEqual(group.requests.map(({ originalTarget, finalTarget }) => [originalTarget, finalTarget]), [[55, 50], [65, 60]]);
    assert.equal(group.summary.pending, 2);
    const requestA = group.requests.find(({ recipientCharacterId }) => recipientCharacterId === characterA.id)!;
    const requestB = group.requests.find(({ recipientCharacterId }) => recipientCharacterId === characterB.id)!;
    assert.notEqual(requestA.id, requestB.id);
    const playerAView = await readPlayerCalledCheckWorkspaceInTransaction(tx, characterA.id, playerAId);
    assert.equal(playerAView?.calledChecks.filter(({ batchId: id }) => id === batchId).length, 2);
    await tx.update(campaignCharacterAttribute).set({ value: 45 }).where(and(
      eq(campaignCharacterAttribute.characterId, characterB.id),
      eq(campaignCharacterAttribute.attributeKey, "WIS"),
    ));
    await assert.rejects(answerCalledCheckInTransaction(tx, { kind: "player", userId: playerBId, characterId: characterB.id }, { requestId: requestA.id, idempotencyKey: "wrong-player" }, () => 75), /own assigned Player Character|another Character/);
    await assert.rejects(answerCalledCheckInTransaction(tx, { kind: "god", userId: godId }, { requestId: requestA.id, idempotencyKey: "wrong-roller" }, () => 75), /must be rolled by its assigned Player/);
    await assert.rejects(answerCalledCheckInTransaction(tx, { kind: "player", userId: playerAId, characterId: characterA.id }, { requestId: requestA.id, enteredTotal: 99, idempotencyKey: "browser-random" }, () => 75), /cannot accept a browser-supplied result/);
    const rollA = await answerCalledCheckInTransaction(tx, { kind: "player", userId: playerAId, characterId: characterA.id }, { requestId: requestA.id, idempotencyKey: "answer-a" }, () => 75);
    assert.equal(await answerCalledCheckInTransaction(tx, { kind: "player", userId: playerAId, characterId: characterA.id }, { requestId: requestA.id, idempotencyKey: "answer-a" }, () => 5), rollA);
    await assert.rejects(answerCalledCheckInTransaction(tx, { kind: "player", userId: playerAId, characterId: characterA.id }, { requestId: requestA.id, idempotencyKey: "answer-a-again" }, () => 5), /no longer has an open Roll slot/);
    const groupRollB = await answerCalledCheckInTransaction(tx, { kind: "player", userId: playerBId, characterId: characterB.id }, { requestId: requestB.id, idempotencyKey: "answer-b-group" }, () => 65);
    assert.notEqual(groupRollB, rollA);
    godView = await readGodCalledCheckWorkspaceInTransaction(tx, session.id, godId);
    assert.equal(godView.batches.find(({ id }) => id === batchId)!.requests.every(({ rollId }) => rollId !== null), true);

    const physicalBatchId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: session.id,
      source: { kind: "attribute", attributeKey: "WIS" },
      purpose: "Physical parity",
      recipientScope: "one",
      recipientCharacterIds: [characterB.id],
      visibility: "private",
      rollMethod: "entered",
      modifiers: [{ kind: "bonus", label: "Quiet room", magnitude: 5 }],
      idempotencyKey: "physical-parity",
    });
    godView = await readGodCalledCheckWorkspaceInTransaction(tx, session.id, godId);
    const physicalRequest = godView.batches.find(({ id }) => id === physicalBatchId)!.requests[0]!;
    const rollB = await answerCalledCheckInTransaction(tx, { kind: "player", userId: playerBId, characterId: characterB.id }, { requestId: physicalRequest.id, enteredTotal: 75, idempotencyKey: "answer-b-physical" });
    const rollRows = await tx.select().from(campaignSessionRoll).where(and(eq(campaignSessionRoll.sessionId, session.id), eq(campaignSessionRoll.resultTotal, 75)));
    const website = rollRows.find(({ id }) => id === rollA)!;
    const physical = rollRows.find(({ id }) => id === rollB)!;
    assert.equal(website.method, "random");
    assert.equal(physical.method, "entered");
    assert.deepEqual(
      (website.mechanicalSnapshot as { resolution: unknown }).resolution,
      (physical.mechanicalSnapshot as { resolution: unknown }).resolution,
    );

    const rerolledId = await rerollCalledCheckInTransaction(tx, godId, requestA.id, "Die was obstructed");
    assert.equal(await rerollCalledCheckInTransaction(tx, godId, requestA.id, "Die was obstructed"), rerolledId);
    const [oldAttempt, newAttempt] = await Promise.all([
      tx.select().from(campaignSessionCalledCheckRequest).where(eq(campaignSessionCalledCheckRequest.id, requestA.id)).then((rows) => rows[0]),
      tx.select().from(campaignSessionCalledCheckRequest).where(eq(campaignSessionCalledCheckRequest.id, rerolledId)).then((rows) => rows[0]),
    ]);
    assert.equal(oldAttempt?.status, "superseded");
    assert.equal(oldAttempt?.rollId, rollA);
    assert.equal(newAttempt?.parentRequestId, requestA.id);
    await assert.rejects(cancelCalledCheckInTransaction(tx, godId, rerolledId, ""), /Cancellation reason/);
    await cancelCalledCheckInTransaction(tx, godId, rerolledId, "No longer applicable");
    await assert.rejects(rerollCalledCheckInTransaction(tx, godId, rerolledId, "Cannot revive cancellation"), /current state/);

    const privateBatchId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: session.id,
      source: { kind: "attribute", attributeKey: "DEX" },
      purpose: "Private prompt",
      recipientScope: "one",
      recipientCharacterIds: [characterA.id],
      visibility: "private",
      rollMethod: "entered",
      idempotencyKey: "private-check",
    });
    const playerBView = await readPlayerCalledCheckWorkspaceInTransaction(tx, characterB.id, playerBId);
    assert.equal(playerBView?.calledChecks.some(({ batchId: id }) => id === privateBatchId), false);

    const privateGroupId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: session.id,
      source: { kind: "attribute", attributeKey: "DEX" },
      purpose: "Private selected group",
      recipientScope: "selected",
      recipientCharacterIds: [characterA.id, characterB.id],
      visibility: "private",
      rollMethod: "entered",
      idempotencyKey: "private-group",
    });
    const privatePlayerAView = await readPlayerCalledCheckWorkspaceInTransaction(tx, characterA.id, playerAId);
    const privatePlayerBView = await readPlayerCalledCheckWorkspaceInTransaction(tx, characterB.id, playerBId);
    assert.deepEqual(privatePlayerAView?.calledChecks.filter(({ batchId: id }) => id === privateGroupId).map(({ recipientCharacterId }) => recipientCharacterId), [characterA.id]);
    assert.deepEqual(privatePlayerBView?.calledChecks.filter(({ batchId: id }) => id === privateGroupId).map(({ recipientCharacterId }) => recipientCharacterId), [characterB.id]);
    assert.equal(privatePlayerAView?.calledChecks.every(({ events }) => events.length === 0), true);

    const secretBatchId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: session.id,
      source: { kind: "attribute", attributeKey: "WIS" },
      purpose: "Secret frozen perception",
      recipientScope: "one",
      recipientCharacterIds: [characterA.id],
      visibility: "god-only",
      rollMethod: "random",
      idempotencyKey: "secret-check",
    });
    godView = await readGodCalledCheckWorkspaceInTransaction(tx, session.id, godId);
    const secretRequest = godView.batches.find(({ id }) => id === secretBatchId)!.requests[0]!;
    assert.equal((await readPlayerCalledCheckWorkspaceInTransaction(tx, characterA.id, playerAId))?.calledChecks.some(({ id }) => id === secretRequest.id), false);
    await tx.update(campaignCharacterAttribute).set({ value: 1 }).where(and(eq(campaignCharacterAttribute.characterId, characterA.id), eq(campaignCharacterAttribute.attributeKey, "WIS")));
    const secretRollId = await answerCalledCheckInTransaction(tx, { kind: "god", userId: godId }, { requestId: secretRequest.id, idempotencyKey: "secret-answer" }, () => 60);
    const [secretRoll] = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.id, secretRollId));
    assert.equal((secretRoll?.mechanicalSnapshot as { governingSource: { attributeValue: number; originalTarget: number } }).governingSource.attributeValue, 45);
    assert.equal((secretRoll?.mechanicalSnapshot as { governingSource: { attributeValue: number; originalTarget: number } }).governingSource.originalTarget, 55);
    await revealCalledCheckInTransaction(tx, godId, secretRequest.id, "private");
    const revealed = await readPlayerCalledCheckWorkspaceInTransaction(tx, characterA.id, playerAId);
    assert.equal(revealed?.calledChecks.some(({ id, resolution }) => id === secretRequest.id && resolution?.resultTotal === 60), true);

    const npcBatchId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: session.id,
      source: { kind: "attribute", attributeKey: "DEX" },
      purpose: "NPC acts independently",
      recipientScope: "one",
      recipientCharacterIds: [npc.id],
      visibility: "table",
      rollMethod: "entered",
      idempotencyKey: "npc-check",
    });
    godView = await readGodCalledCheckWorkspaceInTransaction(tx, session.id, godId);
    const npcRequest = godView.batches.find(({ id }) => id === npcBatchId)!.requests[0]!;
    await assert.rejects(answerCalledCheckInTransaction(tx, { kind: "player", userId: playerAId, characterId: characterA.id }, { requestId: npcRequest.id, enteredTotal: 70, idempotencyKey: "player-npc-probe" }), /assigned Player Character|another Character/);
    await answerCalledCheckInTransaction(tx, { kind: "god", userId: godId }, { requestId: npcRequest.id, enteredTotal: 70, idempotencyKey: "god-npc" });

    const allPcBatchId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: session.id,
      source: { kind: "attribute", attributeKey: "STR" },
      purpose: "Every eligible PC",
      recipientScope: "all-pcs",
      visibility: "table",
      rollMethod: "entered",
      idempotencyKey: "all-pcs",
    });
    godView = await readGodCalledCheckWorkspaceInTransaction(tx, session.id, godId);
    assert.deepEqual(godView.batches.find(({ id }) => id === allPcBatchId)!.requests.map(({ recipientCharacterId }) => recipientCharacterId).sort((a, b) => a - b), [characterA.id, characterB.id].sort((a, b) => a - b));

    const skillBatchId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: session.id,
      source: { kind: "skill", endpointSkillId: handgunSkill.id, rootToEndpointSkillIds: [rootSkill.id, firearmSkill.id, handgunSkill.id] },
      purpose: "Exact handgun route",
      recipientScope: "selected",
      recipientCharacterIds: [characterA.id, characterB.id],
      visibility: "table",
      rollMethod: "entered",
      idempotencyKey: "exact-skill",
    });
    godView = await readGodCalledCheckWorkspaceInTransaction(tx, session.id, godId);
    const skillRequests = godView.batches.find(({ id }) => id === skillBatchId)!.requests;
    assert.equal(skillRequests[0]!.governingSource?.kind, "skill");
    assert.equal(skillRequests[0]!.governingSource?.kind === "skill" ? skillRequests[0]!.governingSource.skillId : null, handgunSkill.id);
    assert.equal(skillRequests[1]!.governingSource?.kind, "skill");
    assert.equal(skillRequests[1]!.governingSource?.kind === "skill" ? skillRequests[1]!.governingSource.skillId : null, firearmSkill.id);
    assert.notEqual(skillRequests[1]!.governingSource?.kind === "skill" ? skillRequests[1]!.governingSource.skillId : null, rifleSkill.id);

    const neutralId = await issueHighLowInTransaction(tx, godId, { sessionId: session.id, mode: "neutral", visibility: "table", rollMethod: "entered", purpose: "Neutral direction", idempotencyKey: "neutral" });
    await answerHighLowInTransaction(tx, { kind: "god", userId: godId }, { requestId: neutralId, enteredTotal: 50, idempotencyKey: "neutral-answer" });
    const [neutral] = await tx.select().from(campaignSessionHighLowRequest).where(eq(campaignSessionHighLowRequest.id, neutralId));
    assert.deepEqual(neutral?.resultSnapshotJson, { resultTotal: 50, rolledSide: "low", calledSide: null, matchedCall: null, criticalFailure: false, criticalSuccess: false, doubleOtt: false, requiresGodRuling: false, rulingReasons: [] });

    const playerRollId = await issueHighLowInTransaction(tx, godId, { sessionId: session.id, mode: "player-calls-rolls", participantCharacterId: characterA.id, visibility: "private", rollMethod: "entered", purpose: "Player call and roll", idempotencyKey: "player-roll" });
    await callHighLowInTransaction(tx, playerAId, characterA.id, { requestId: playerRollId, side: "high", idempotencyKey: "lock-high" });
    await callHighLowInTransaction(tx, playerAId, characterA.id, { requestId: playerRollId, side: "high", idempotencyKey: "lock-high" });
    await assert.rejects(callHighLowInTransaction(tx, playerAId, characterA.id, { requestId: playerRollId, side: "low", idempotencyKey: "change-call" }), /already locked/);
    await assert.rejects(answerHighLowInTransaction(tx, { kind: "god", userId: godId }, { requestId: playerRollId, enteredTotal: 75, idempotencyKey: "god-wrong-mode" }), /belongs to the assigned Player/);
    await answerHighLowInTransaction(tx, { kind: "player", userId: playerAId, characterId: characterA.id }, { requestId: playerRollId, enteredTotal: 75, idempotencyKey: "player-high-roll" });
    const [playerHighLow] = await tx.select().from(campaignSessionHighLowRequest).where(eq(campaignSessionHighLowRequest.id, playerRollId));
    assert.equal((playerHighLow?.resultSnapshotJson as { matchedCall: boolean }).matchedCall, true);

    const godRollId = await issueHighLowInTransaction(tx, godId, { sessionId: session.id, mode: "player-calls-god-rolls", participantCharacterId: characterB.id, visibility: "table", rollMethod: "random", purpose: "Player call and G.O.D. roll", idempotencyKey: "god-roll" });
    await callHighLowInTransaction(tx, playerBId, characterB.id, { requestId: godRollId, side: "high", idempotencyKey: "player-b-high" });
    await assert.rejects(answerHighLowInTransaction(tx, { kind: "player", userId: playerBId, characterId: characterB.id }, { requestId: godRollId, idempotencyKey: "player-wrong-roller" }, () => 100), /player-called\/player-rolled/);
    await answerHighLowInTransaction(tx, { kind: "god", userId: godId }, { requestId: godRollId, idempotencyKey: "god-high-answer" }, () => 100);
    const [criticalHighLow] = await tx.select().from(campaignSessionHighLowRequest).where(eq(campaignSessionHighLowRequest.id, godRollId));
    assert.equal(criticalHighLow?.status, "requires-god-ruling");
    assert.equal(criticalHighLow?.resolvedAt, null);
    assert.equal((criticalHighLow?.resultSnapshotJson as { doubleOtt: boolean; resultTotal: number }).doubleOtt, true);
    assert.equal((criticalHighLow?.resultSnapshotJson as { resultTotal: number }).resultTotal, 100);
    await ruleHighLowInTransaction(tx, godId, godRollId, "G.O.D. preserves the facts and rules the table consequence.");
    const [ruledHighLow] = await tx.select().from(campaignSessionHighLowRequest).where(eq(campaignSessionHighLowRequest.id, godRollId));
    assert.ok(ruledHighLow?.resolvedAt);
    const highLowRerollId = await rerollHighLowInTransaction(tx, godId, godRollId, "Reroll explicitly ordered");
    assert.equal(await rerollHighLowInTransaction(tx, godId, godRollId, "Reroll explicitly ordered"), highLowRerollId);
    await assert.rejects(cancelHighLowInTransaction(tx, godId, highLowRerollId, ""), /Cancellation reason/);
    await cancelHighLowInTransaction(tx, godId, highLowRerollId, "Question withdrawn");
    await assert.rejects(rerollHighLowInTransaction(tx, godId, highLowRerollId, "Cannot revive cancellation"), /current state/);
    const highLowEvents = await tx.select().from(campaignSessionHighLowEvent).where(eq(campaignSessionHighLowEvent.requestId, godRollId));
    assert.ok(highLowEvents.some(({ eventKind }) => eventKind === "answered"));
    assert.ok(highLowEvents.some(({ eventKind }) => eventKind === "god-ruling"));
    assert.ok(highLowEvents.some(({ eventKind }) => eventKind === "reroll-ordered"));

    const closeoutContext = await lockSessionCloseoutContextInTransaction(tx, session.id, godId);
    const closeout = await readSessionCloseoutInTransaction(tx, closeoutContext);
    assert.ok(closeout.blockers.some(({ code }) => code === "called-check-pending"));
    assert.equal((await tx.select().from(campaignSessionCalledCheckEvent).where(eq(campaignSessionCalledCheckEvent.sessionId, session.id))).length > 0, true);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.sessionId, session.id))).length >= 6, true);
    assert.equal((await tx.select().from(campaignSessionCalledCheckRequest).where(eq(campaignSessionCalledCheckRequest.recipientCharacterId, npc.id))).every(({ recipientCharacterId }) => recipientCharacterId > 0), true);
    assert.equal((await tx.select().from(campaignSessionHighLowRequest).where(eq(campaignSessionHighLowRequest.sessionId, session.id))).every(({ participantCharacterId }) => participantCharacterId === null || participantCharacterId > 0), true);

    throw ROLLBACK;
  }), (error) => error === ROLLBACK);
});

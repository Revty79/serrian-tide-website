import assert from "node:assert/strict";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterProfile,
} from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  listPlayerTabletopCharactersInTransaction,
  recordPlayerTabletopFreeRollInTransaction,
  readPlayerTabletopRollContextInTransaction,
  readPlayerTabletopRuntimeInTransaction,
} from "@/features/tabletop-operations/player-tabletop-console-service";
import {
  answerCalledCheckInTransaction,
  issueCalledCheckInTransaction,
  readGodCalledCheckWorkspaceInTransaction,
} from "@/features/tabletop-operations/called-check-service";
import { recordRollInTransaction } from "@/features/tabletop-operations/roll-runtime-service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Player Tabletop validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Player Tabletop tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Player Tabletop tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_PASS_12_PLAYER_TABLETOP");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

after(async () => {
  await pool.end();
});

async function addCampaign(tx: Tx, ownerId: string, name: string): Promise<number> {
  const [created] = await tx.insert(campaign).values({
    name,
    overview: `${name} public overview`,
    attributePoints: 0,
    skillPoints: 0,
    maxStartingSkill: 0,
    pointsToUnlockNextTier: 0,
    maxPointsInSkill: 100,
    startingCreditAmount: 0,
    currencySystem: "Credits",
    fatePointMethod: "Assigned",
    assignedFatePoints: 0,
    createdByUserId: ownerId,
  }).returning({ id: campaign.id });
  assert.ok(created);
  return created.id;
}

async function addCharacter(tx: Tx, campaignId: number, playerId: string, name: string, isNpc = false): Promise<number> {
  const [created] = await tx.insert(campaignCharacter).values({
    campaignId,
    playerUserId: playerId,
    name,
    isNpc,
    npcKind: "race",
  }).returning({ id: campaignCharacter.id });
  assert.ok(created);
  await tx.insert(campaignCharacterProfile).values({ characterId: created.id, hpMultiplierSteps: 0, baseMagicSteps: 0 });
  await tx.insert(campaignCharacterAttribute).values([
    { characterId: created.id, attributeKey: "CON", value: 30 },
    { characterId: created.id, attributeKey: "DEX", value: 35 },
    { characterId: created.id, attributeKey: "WIS", value: 40 },
  ]);
  return created.id;
}

test("guarded Player Tabletop reads preserve exact identity, hierarchy, visibility, and Roll context", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const suffix = crypto.randomUUID();
    const godId = `pass12-god-${suffix}`;
    const playerId = `pass12-player-${suffix}`;
    const otherId = `pass12-other-${suffix}`;
    const adminId = `pass12-admin-${suffix}`;
    await tx.insert(user).values([
      { id: godId, name: "Pass 12 G.O.D.", email: `${godId}@example.invalid`, username: godId },
      { id: playerId, name: "Pass 12 Player", email: `${playerId}@example.invalid`, username: playerId },
      { id: otherId, name: "Pass 12 Other", email: `${otherId}@example.invalid`, username: otherId },
      { id: adminId, name: "Pass 12 Admin", email: `${adminId}@example.invalid`, username: adminId },
    ]);
    await tx.insert(userRole).values([
      { userId: godId, role: "god" },
      { userId: playerId, role: "player" },
      { userId: otherId, role: "player" },
      { userId: adminId, role: "admin" },
    ]);

    const activeCampaignId = await addCampaign(tx, godId, `Pass 12 Active ${suffix}`);
    const quietCampaignId = await addCampaign(tx, godId, `Pass 12 Quiet ${suffix}`);
    await tx.insert(campaignPlayer).values([
      { campaignId: activeCampaignId, userId: godId },
      { campaignId: activeCampaignId, userId: playerId },
      { campaignId: activeCampaignId, userId: otherId },
      { campaignId: quietCampaignId, userId: godId },
      { campaignId: quietCampaignId, userId: playerId },
    ]);
    const rosteredId = await addCharacter(tx, activeCampaignId, playerId, "Rostered Hero");
    const unrosteredId = await addCharacter(tx, activeCampaignId, playerId, "Unrostered Hero");
    const quietId = await addCharacter(tx, quietCampaignId, playerId, "Waiting Hero");
    const otherIdCharacter = await addCharacter(tx, activeCampaignId, otherId, "Other Player Hero");
    const privateNpcId = await addCharacter(tx, activeCampaignId, godId, "Hidden NPC", true);

    const selected = await listPlayerTabletopCharactersInTransaction(tx, playerId);
    assert.deepEqual(selected.map(({ characterId }) => characterId).sort((a, b) => a - b), [rosteredId, unrosteredId, quietId].sort((a, b) => a - b));
    assert.equal(selected.some(({ characterId }) => characterId === otherIdCharacter || characterId === privateNpcId), false);
    assert.deepEqual(await listPlayerTabletopCharactersInTransaction(tx, adminId), []);
    await assert.rejects(readPlayerTabletopRuntimeInTransaction(tx, otherIdCharacter, playerId), /not assigned/);
    await assert.rejects(readPlayerTabletopRuntimeInTransaction(tx, privateNpcId, godId), /not assigned/);

    const [session] = await tx.insert(campaignSession).values({
      campaignId: activeCampaignId,
      title: "Pass 12 Active Session",
      sequenceNumber: 1,
      status: "active",
      startedAt: new Date(),
    }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values([
      { sessionId: session.id, campaignId: activeCampaignId, characterId: rosteredId, sortOrder: 0 },
      { sessionId: session.id, campaignId: activeCampaignId, characterId: otherIdCharacter, sortOrder: 1 },
      { sessionId: session.id, campaignId: activeCampaignId, characterId: privateNpcId, sortOrder: 2, prepNotes: "secret ambush" },
    ]);
    const [scene] = await tx.insert(campaignSessionScene).values({
      sessionId: session.id,
      campaignId: activeCampaignId,
      sequenceNumber: 1,
      title: "Public Tideway",
      description: "A visible rain-soaked road.",
      status: "active",
      startedAt: new Date(),
      godNotes: "hidden scene plan",
    }).returning({ id: campaignSessionScene.id });
    assert.ok(scene);
    await tx.insert(campaignSessionSceneMember).values([
      { sceneId: scene.id, sessionId: session.id, campaignId: activeCampaignId, characterId: rosteredId, sortOrder: 0 },
      { sceneId: scene.id, sessionId: session.id, campaignId: activeCampaignId, characterId: privateNpcId, sortOrder: 1 },
    ]);
    const [encounter] = await tx.insert(campaignSessionEncounter).values({
      sceneId: scene.id,
      sessionId: session.id,
      campaignId: activeCampaignId,
      sequenceNumber: 1,
      title: "Bridge Standoff",
      description: "A visible standoff.",
      encounterType: "combat",
      status: "active",
      startedAt: new Date(),
      godNotes: "hidden Encounter plan",
    }).returning({ id: campaignSessionEncounter.id });
    assert.ok(encounter);
    await tx.insert(campaignSessionEncounterParticipant).values([
      { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: activeCampaignId, characterId: rosteredId, sortOrder: 0 },
      { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: activeCampaignId, characterId: privateNpcId, sortOrder: 1, prepNotes: "hidden tactic" },
    ]);
    await tx.insert(campaignSessionEncounterInitiative).values({
      encounterId: encounter.id,
      sceneId: scene.id,
      sessionId: session.id,
      campaignId: activeCampaignId,
      timelineInitiative: 20,
    });
    await tx.insert(campaignSessionEncounterInitiativeParticipant).values({
      encounterId: encounter.id,
      sceneId: scene.id,
      sessionId: session.id,
      campaignId: activeCampaignId,
      characterId: rosteredId,
      normalTotalInitiative: 18,
      currentInitiative: 17,
      movementMode: "Walk",
    });

    const actor = { userId: godId, campaignId: activeCampaignId, readAs: "god-owner" as const, canRecordGodOnly: true };
    await recordRollInTransaction(tx, actor, {
      sessionId: session.id,
      sceneId: scene.id,
      encounterId: encounter.id,
      rollerCharacterId: rosteredId,
      method: "entered",
      enteredTotal: 42,
      visibility: "table",
      purposeKind: "free",
      label: "Visible own Roll",
    });
    await recordRollInTransaction(tx, actor, {
      sessionId: session.id,
      rollerCharacterId: otherIdCharacter,
      method: "entered",
      enteredTotal: 43,
      visibility: "table",
      purposeKind: "free",
      label: "Unrelated table Roll",
    });
    await recordRollInTransaction(tx, actor, {
      sessionId: session.id,
      rollerCharacterId: privateNpcId,
      method: "entered",
      enteredTotal: 44,
      visibility: "god-only",
      purposeKind: "other",
      label: "Secret NPC Roll",
      notes: "hidden Roll mechanics",
    });

    const [completedSession] = await tx.insert(campaignSession).values({
      campaignId: quietCampaignId,
      title: "Completed Quiet Session",
      sequenceNumber: 1,
      status: "active",
      startedAt: new Date(Date.now() - 60_000),
    }).returning({ id: campaignSession.id });
    assert.ok(completedSession);
    await tx.insert(campaignSessionRoster).values({
      sessionId: completedSession.id,
      campaignId: quietCampaignId,
      characterId: quietId,
      sortOrder: 0,
    });
    const visibleBatchId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: completedSession.id,
      source: { kind: "attribute", attributeKey: "WIS" },
      purpose: "Remember the old tide",
      recipientScope: "one",
      recipientCharacterIds: [quietId],
      visibility: "table",
      rollMethod: "entered",
      idempotencyKey: "pass12-completed-visible",
    });
    const secretBatchId = await issueCalledCheckInTransaction(tx, godId, {
      sessionId: completedSession.id,
      source: { kind: "attribute", attributeKey: "WIS" },
      purpose: "COMPLETED SECRET MUST STAY ABSENT",
      recipientScope: "one",
      recipientCharacterIds: [quietId],
      visibility: "god-only",
      rollMethod: "random",
      idempotencyKey: "pass12-completed-secret",
    });
    const completedRequests = await readGodCalledCheckWorkspaceInTransaction(tx, completedSession.id, godId);
    const visibleRequest = completedRequests.batches.find(({ id }) => id === visibleBatchId)?.requests[0];
    const secretRequest = completedRequests.batches.find(({ id }) => id === secretBatchId)?.requests[0];
    assert.ok(visibleRequest && secretRequest);
    await answerCalledCheckInTransaction(tx, { kind: "player", userId: playerId, characterId: quietId }, {
      requestId: visibleRequest.id,
      enteredTotal: 37,
      idempotencyKey: "pass12-completed-visible-answer",
    });
    await answerCalledCheckInTransaction(tx, { kind: "god", userId: godId }, {
      requestId: secretRequest.id,
      idempotencyKey: "pass12-completed-secret-answer",
    }, () => 61);
    await tx.update(campaignSession).set({ status: "completed", completedAt: new Date() })
      .where(eq(campaignSession.id, completedSession.id));

    const waiting = await readPlayerTabletopRuntimeInTransaction(tx, quietId, playerId);
    assert.equal(waiting.hierarchy.session, null);
    assert.equal(waiting.hierarchy.scene, null);
    assert.ok((waiting.health.total.maximumHp ?? 0) > 0);
    assert.equal(waiting.health.total.damage, 0);
    assert.equal(waiting.calledCheckHistory.length, 1);
    assert.deepEqual(waiting.calledCheckHistory[0]?.calledChecks.map(({ purpose }) => purpose), ["Remember the old tide"]);
    assert.equal(JSON.stringify(waiting.calledCheckHistory).includes("COMPLETED SECRET MUST STAY ABSENT"), false);

    const unrostered = await readPlayerTabletopRuntimeInTransaction(tx, unrosteredId, playerId);
    assert.equal(unrostered.hierarchy.session?.title, "Pass 12 Active Session");
    assert.equal(unrostered.hierarchy.rostered, false);
    assert.equal(unrostered.hierarchy.scene, null);
    assert.equal(unrostered.calledChecks, null);
    await assert.rejects(readPlayerTabletopRollContextInTransaction(tx, unrosteredId, playerId), /not rostered/);

    const rostered = await readPlayerTabletopRuntimeInTransaction(tx, rosteredId, playerId);
    assert.equal(rostered.hierarchy.rostered, true);
    assert.equal(rostered.hierarchy.scene?.title, "Public Tideway");
    assert.equal(rostered.hierarchy.encounter?.title, "Bridge Standoff");
    assert.equal(rostered.hierarchy.encounter?.participating, true);
    assert.equal(rostered.hierarchy.encounter?.currentInitiative, 17);
    assert.deepEqual(rostered.rolls.map(({ resultTotal }) => resultTotal), [42]);
    const serialized = JSON.stringify(rostered);
    for (const forbidden of ["secret ambush", "hidden scene plan", "hidden Encounter plan", "hidden tactic", "Secret NPC Roll", "Unrelated table Roll"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
    assert.deepEqual(await readPlayerTabletopRollContextInTransaction(tx, rosteredId, playerId), {
      campaignId: activeCampaignId,
      sessionId: session.id,
      sceneId: scene.id,
      encounterId: encounter.id,
    });
    const firstFreeRoll = await recordPlayerTabletopFreeRollInTransaction(tx, {
      characterId: rosteredId,
      playerUserId: playerId,
      method: "entered",
      visibility: "private",
      enteredTotal: 55,
      label: "Idempotent Player Roll",
      idempotencyKey: "1234567890abcdef1234567890abcdef",
    });
    const duplicateFreeRoll = await recordPlayerTabletopFreeRollInTransaction(tx, {
      characterId: rosteredId,
      playerUserId: playerId,
      method: "entered",
      visibility: "table",
      enteredTotal: 99,
      label: "Ignored duplicate payload",
      idempotencyKey: "1234567890abcdef1234567890abcdef",
    });
    assert.equal(duplicateFreeRoll.rollId, firstFreeRoll.rollId);
    assert.equal(duplicateFreeRoll.resultTotal, 55);

    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

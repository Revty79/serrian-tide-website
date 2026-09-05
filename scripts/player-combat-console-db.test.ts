import assert from "node:assert/strict";
import { after, test } from "node:test";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter, campaignCharacterProfile } from "@/db/realm-schema";
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
  addPlayerCombatClarificationInTransaction,
  createPlayerCombatRulingRequestInTransaction,
  lockPlayerCombatContextInTransaction,
  readGodCombatRulingRequestsInTransaction,
  readPlayerCombatRulingRequestsInTransaction,
  ruleOnPlayerCombatRequestInTransaction,
} from "@/features/tabletop-operations/player-combat-ruling-service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Player combat validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing Player combat tests outside a loopback _dev database.");
}

const ROLLBACK = new Error("ROLLBACK_PASS_13_PLAYER_COMBAT");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

after(async () => pool.end());

async function character(tx: Tx, campaignId: number, playerUserId: string, name: string): Promise<number> {
  const [created] = await tx.insert(campaignCharacter).values({ campaignId, playerUserId, name, isNpc: false, npcKind: "race" }).returning({ id: campaignCharacter.id });
  assert.ok(created);
  await tx.insert(campaignCharacterProfile).values({ characterId: created.id, hpMultiplierSteps: 0, baseMagicSteps: 0 });
  return created.id;
}

test("Player combat request lifecycle is exact, idempotent, authorized, and append-only", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const suffix = crypto.randomUUID();
    const godId = `pass13-god-${suffix}`;
    const playerId = `pass13-player-${suffix}`;
    const otherId = `pass13-other-${suffix}`;
    await tx.insert(user).values([
      { id: godId, name: "Pass 13 G.O.D.", email: `${godId}@example.invalid`, username: godId },
      { id: playerId, name: "Pass 13 Player", email: `${playerId}@example.invalid`, username: playerId },
      { id: otherId, name: "Pass 13 Other", email: `${otherId}@example.invalid`, username: otherId },
    ]);
    await tx.insert(userRole).values([{ userId: godId, role: "god" }, { userId: playerId, role: "player" }, { userId: otherId, role: "player" }]);
    const [realm] = await tx.insert(campaign).values({
      name: `Pass 13 ${suffix}`,
      overview: "",
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
    assert.ok(realm);
    await tx.insert(campaignPlayer).values([{ campaignId: realm.id, userId: godId }, { campaignId: realm.id, userId: playerId }, { campaignId: realm.id, userId: otherId }]);
    const playerCharacterId = await character(tx, realm.id, playerId, "Player Character");
    const targetCharacterId = await character(tx, realm.id, otherId, "Target Character");
    const [session] = await tx.insert(campaignSession).values({ campaignId: realm.id, title: "Active", sequenceNumber: 1, status: "active", startedAt: new Date() }).returning({ id: campaignSession.id });
    assert.ok(session);
    await tx.insert(campaignSessionRoster).values([
      { sessionId: session.id, campaignId: realm.id, characterId: playerCharacterId, sortOrder: 0 },
      { sessionId: session.id, campaignId: realm.id, characterId: targetCharacterId, sortOrder: 1 },
    ]);
    const [scene] = await tx.insert(campaignSessionScene).values({ sessionId: session.id, campaignId: realm.id, sequenceNumber: 1, title: "Scene", status: "active", startedAt: new Date() }).returning({ id: campaignSessionScene.id });
    assert.ok(scene);
    await tx.insert(campaignSessionSceneMember).values([
      { sceneId: scene.id, sessionId: session.id, campaignId: realm.id, characterId: playerCharacterId, sortOrder: 0 },
      { sceneId: scene.id, sessionId: session.id, campaignId: realm.id, characterId: targetCharacterId, sortOrder: 1 },
    ]);
    const [encounter] = await tx.insert(campaignSessionEncounter).values({ sceneId: scene.id, sessionId: session.id, campaignId: realm.id, sequenceNumber: 1, title: "Encounter", encounterType: "combat", status: "active", startedAt: new Date() }).returning({ id: campaignSessionEncounter.id });
    assert.ok(encounter);
    await tx.insert(campaignSessionEncounterParticipant).values([
      { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: realm.id, characterId: playerCharacterId, sortOrder: 0 },
      { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: realm.id, characterId: targetCharacterId, sortOrder: 1 },
    ]);
    await tx.insert(campaignSessionEncounterInitiative).values({ encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: realm.id, timelineInitiative: 20 });
    await tx.insert(campaignSessionEncounterInitiativeParticipant).values([
      { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: realm.id, characterId: playerCharacterId, normalTotalInitiative: 20, currentInitiative: 20, movementMode: "Walk" },
      { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: realm.id, characterId: targetCharacterId, normalTotalInitiative: 18, currentInitiative: 18, movementMode: "Walk" },
    ]);

    const context = await lockPlayerCombatContextInTransaction(tx, encounter.id, playerCharacterId, playerId);
    await assert.rejects(lockPlayerCombatContextInTransaction(tx, encounter.id, playerCharacterId, otherId), /not an exact active Initiative participant/);
    const input = {
      requestType: "intervention" as const,
      targetParticipantId: targetCharacterId,
      sourceKind: "manual",
      sourceRef: "player-stated-intent",
      intent: "Pull the target away from the door.",
      requestedTiming: "Initiative 20",
      blockedReason: "Disposition is G.O.D.-authoritative.",
      frozenRequest: { targetParticipantId: targetCharacterId, objective: "Pull away" },
      idempotencyKey: "0123456789abcdef0123456789abcdef",
    };
    const first = await createPlayerCombatRulingRequestInTransaction(tx, context, { userId: playerId, characterId: playerCharacterId }, input);
    const duplicate = await createPlayerCombatRulingRequestInTransaction(tx, context, { userId: playerId, characterId: playerCharacterId }, input);
    assert.equal(duplicate.requestId, first.requestId);
    assert.equal(duplicate.reused, true);
    await assert.rejects(createPlayerCombatRulingRequestInTransaction(tx, context, { userId: playerId, characterId: playerCharacterId }, { ...input, targetParticipantId: playerCharacterId }), /different combat ruling request/);

    await ruleOnPlayerCombatRequestInTransaction(tx, context, godId, first.requestId, { status: "clarification-requested", response: "Which side of the doorway?" });
    await addPlayerCombatClarificationInTransaction(tx, context, { userId: playerId, characterId: playerCharacterId }, first.requestId, "The seaward side.");
    await ruleOnPlayerCombatRequestInTransaction(tx, context, godId, first.requestId, { status: "approved", response: "Approved as stated.", ruling: { reason: "Positioning confirmed." } });
    const playerView = await readPlayerCombatRulingRequestsInTransaction(tx, encounter.id, playerCharacterId, playerId);
    assert.equal(playerView.length, 1);
    assert.equal(playerView[0]?.status, "approved");
    assert.equal(playerView[0]?.events.length, 4);
    assert.deepEqual(playerView[0]?.events.map(({ actorKind }) => actorKind), ["player", "god", "player", "god"]);
    assert.equal((await readGodCombatRulingRequestsInTransaction(tx, encounter.id))[0]?.characterId, playerCharacterId);
    await assert.rejects(readPlayerCombatRulingRequestsInTransaction(tx, encounter.id, playerCharacterId, otherId), /not an exact active Initiative participant/);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

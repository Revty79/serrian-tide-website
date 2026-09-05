import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq, inArray } from "drizzle-orm";
import { Client } from "pg";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterItem,
  campaignCharacterItemEquipmentState,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
  campaignCharacterSpellDocument,
} from "@/db/realm-schema";
import { item, weaponProfile } from "@/db/item-schema";
import { skill } from "@/db/skill-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterPendingActionSource,
  campaignSessionRoll,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { readCombatAidEncounterInTransaction } from "@/features/tabletop-operations/combat-aid-service";
import {
  readPlayerEncounterInTransaction,
  resolveActivePlayerEncounterInTransaction,
} from "@/features/tabletop-operations/player-encounter-service";
import {
  readRollLedgerInTransaction,
  recordRollInTransaction,
} from "@/features/tabletop-operations/roll-runtime-service";
import {
  applyEncounterDamageInTransaction,
  declareEncounterReactionInTransaction,
  holdParticipantInitiativeInTransaction,
  passParticipantInitiativeInTransaction,
  startSpellActionInTransaction,
  startWeaponActionInTransaction,
} from "@/features/tabletop-operations/runtime-integration-service";
import {
  publishTabletopInvalidationInTransaction,
  TABLETOP_LIVE_CHANNEL,
} from "@/features/tabletop-operations/tabletop-live-events";
import { createContainer, createEmptySpell, withCalculationSnapshot } from "@/features/spell-construction/utilities/spellFactory";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Player Encounter validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Player Encounter tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Player Encounter tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_BUILD11_PLAYER_ENCOUNTER");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

after(async () => {
  await pool.end();
});

async function fixture(tx: Tx, label: string) {
  const suffix = crypto.randomUUID();
  const godId = `build11-god-${suffix}`;
  const playerAId = `build11-a-${suffix}`;
  const playerBId = `build11-b-${suffix}`;
  await tx.insert(user).values([
    { id: godId, name: "Build 11 G.O.D.", email: `${godId}@example.invalid`, username: godId },
    { id: playerAId, name: "Build 11 Player A", email: `${playerAId}@example.invalid`, username: playerAId },
    { id: playerBId, name: "Build 11 Player B", email: `${playerBId}@example.invalid`, username: playerBId },
  ]);
  await tx.insert(userRole).values([
    { userId: godId, role: "god" },
    { userId: playerAId, role: "player" },
    { userId: playerBId, role: "player" },
  ]);
  const [createdCampaign] = await tx.insert(campaign).values({
    name: `Build 11 ${label} ${suffix}`,
    overview: "Rollback-only Player active Encounter fixture.",
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
  await tx.insert(campaignPlayer).values([
    { campaignId: createdCampaign.id, userId: godId },
    { campaignId: createdCampaign.id, userId: playerAId },
    { campaignId: createdCampaign.id, userId: playerBId },
  ]);
  const characters = await tx.insert(campaignCharacter).values([
    { campaignId: createdCampaign.id, playerUserId: playerAId, name: "Player A Character" },
    { campaignId: createdCampaign.id, playerUserId: playerBId, name: "Player B Character" },
    { campaignId: createdCampaign.id, playerUserId: godId, name: "Private NPC", isNpc: true, npcKind: "race", npcBuildMode: "detailed" },
    { campaignId: createdCampaign.id, playerUserId: godId, name: "Private Creature", isNpc: true, npcKind: "creature", npcBuildMode: "detailed" },
  ]).returning({ id: campaignCharacter.id, isNpc: campaignCharacter.isNpc });
  const [characterA, characterB, npc, creatureNpc] = characters;
  assert.ok(characterA && characterB && npc && creatureNpc);
  for (const character of characters) {
    await tx.insert(campaignCharacterProfile).values({ characterId: character.id, hpMultiplierSteps: 0, baseMagicSteps: 0 });
    await tx.insert(campaignCharacterAttribute).values([
      { characterId: character.id, attributeKey: "CON", value: 30 },
      { characterId: character.id, attributeKey: "DEX", value: 30 },
    ]);
  }
  const [session] = await tx.insert(campaignSession).values({
    campaignId: createdCampaign.id,
    title: "Active Session",
    sequenceNumber: 1,
    status: "active",
    startedAt: new Date(),
  }).returning({ id: campaignSession.id });
  assert.ok(session);
  await tx.insert(campaignSessionRoster).values(characters.map((character, index) => ({
    sessionId: session.id,
    campaignId: createdCampaign.id,
    characterId: character.id,
    sortOrder: index,
    prepNotes: character.id === npc.id ? "private ambush notes" : "",
  })));
  const [scene] = await tx.insert(campaignSessionScene).values({
    sessionId: session.id,
    campaignId: createdCampaign.id,
    sequenceNumber: 1,
    title: "Active Scene",
    status: "active",
    startedAt: new Date(),
    godNotes: "private scene notes",
  }).returning({ id: campaignSessionScene.id });
  assert.ok(scene);
  await tx.insert(campaignSessionSceneMember).values(characters.map((character, index) => ({
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    characterId: character.id,
    sortOrder: index,
  })));
  const [encounter] = await tx.insert(campaignSessionEncounter).values({
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    sequenceNumber: 1,
    title: "Active Encounter",
    encounterType: "combat",
    status: "active",
    startedAt: new Date(),
    godNotes: "private Encounter plan",
  }).returning({ id: campaignSessionEncounter.id });
  assert.ok(encounter);
  await tx.insert(campaignSessionEncounterParticipant).values(characters.map((character, index) => ({
    encounterId: encounter.id,
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    characterId: character.id,
    sortOrder: index,
    prepNotes: character.id === npc.id ? "secret NPC tactic" : "",
  })));
  await tx.insert(campaignSessionEncounterInitiative).values({
    encounterId: encounter.id,
    sceneId: scene.id,
    sessionId: session.id,
    campaignId: createdCampaign.id,
    timelineInitiative: 20,
  });
  await tx.insert(campaignSessionEncounterInitiativeParticipant).values([
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: characterA.id, normalTotalInitiative: 20, currentInitiative: 20, movementMode: "Walk" },
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: characterB.id, normalTotalInitiative: 18, currentInitiative: 18, movementMode: "Walk" },
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: npc.id, normalTotalInitiative: 12, currentInitiative: 12, movementMode: "Walk" },
    { encounterId: encounter.id, sceneId: scene.id, sessionId: session.id, campaignId: createdCampaign.id, characterId: creatureNpc.id, normalTotalInitiative: 10, currentInitiative: 10, movementMode: "Walk" },
  ]);
  return {
    godId,
    playerAId,
    playerBId,
    campaignId: createdCampaign.id,
    sessionId: session.id,
    sceneId: scene.id,
    encounterId: encounter.id,
    characterAId: characterA.id,
    characterBId: characterB.id,
    npcId: npc.id,
    creatureNpcId: creatureNpc.id,
  };
}

function rollbackManualSpell(frameworkSkillId: number, suffix: string) {
  const spell = createEmptySpell();
  const control = createContainer("control");
  control.id = `build11-control-${suffix}`;
  control.effects = [{ id: `build11-knockdown-${suffix}`, ruleId: "knockdown", quantity: 1, description: "" }];
  return withCalculationSnapshot({
    ...spell,
    id: `build11-spell-${suffix}`,
    name: "Rollback Omen",
    castingSystem: "Spellcraft",
    frameworkSkillId,
    sphere: "Fire",
    containers: [control],
  });
}

test("Player discovery and read require exact ownership and strip private NPC/G.O.D. state", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Privacy");
    const playerContext = await resolveActivePlayerEncounterInTransaction(tx, data.characterAId, data.playerAId);
    assert.ok(playerContext);
    assert.equal(await resolveActivePlayerEncounterInTransaction(tx, data.characterAId, data.playerBId), null);
    assert.equal(await resolveActivePlayerEncounterInTransaction(tx, data.npcId, data.godId), null);
    assert.equal(await resolveActivePlayerEncounterInTransaction(tx, data.creatureNpcId, data.godId), null);

    const godActor = { userId: data.godId, campaignId: data.campaignId, readAs: "god-owner" as const, canRecordGodOnly: true };
    await recordRollInTransaction(tx, godActor, {
      sessionId: data.sessionId, sceneId: data.sceneId, encounterId: data.encounterId,
      method: "entered", visibility: "table", purposeKind: "attack", enteredTotal: 73,
      rollerCharacterId: data.characterAId, targetCharacterId: data.npcId,
    });
    await recordRollInTransaction(tx, godActor, {
      sessionId: data.sessionId, sceneId: data.sceneId, encounterId: data.encounterId,
      method: "entered", visibility: "god-only", purposeKind: "other", enteredTotal: 44,
      rollerCharacterId: data.npcId, notes: "private Roll note",
    });
    const view = await readPlayerEncounterInTransaction(tx, data.characterAId, data.playerAId);
    assert.ok(view);
    assert.deepEqual(view.rolls.map(({ resultTotal }) => resultTotal), [73]);
    const npcSummary = view.participants.find(({ characterId }) => characterId === data.npcId);
    assert.deepEqual(npcSummary, {
      characterId: data.npcId,
      name: "Private NPC",
      kindLabel: "Race NPC",
      currentInitiative: 12,
      participationStatus: "active",
      pendingAction: null,
    });
    const serialized = JSON.stringify(view.participants);
    for (const forbidden of ["private ambush", "private scene", "private Encounter", "secret NPC tactic", "totalDamage", "mana", "equipment"]) {
      assert.equal(serialized.includes(forbidden), false);
    }
    const playerPool = view.character.health?.anatomy.pools[0]?.key;
    assert.ok(playerPool);
    await applyEncounterDamageInTransaction(tx, playerContext, {
      targetCharacterId: data.characterAId,
      amount: 10,
      poolKey: playerPool,
    });
    const changedView = await readPlayerEncounterInTransaction(tx, data.characterAId, data.playerAId);
    assert.equal(changedView?.character.health?.totalDamage, 10);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("Player Weapon action uses the shared authored-action tables and rejects invalid authoritative sources or targets", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Weapon");
    const context = await resolveActivePlayerEncounterInTransaction(tx, data.characterAId, data.playerAId, true);
    assert.ok(context);
    const suffix = crypto.randomUUID();
    const [validWeapon, unwieldedWeapon, untimedWeapon] = await tx.insert(item).values([
      { canonicalId: `BUILD11-VALID-${suffix}`.toUpperCase(), name: "Shared Saber", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "test", family: "test", category: "weapon", priceBasis: "unit" },
      { canonicalId: `BUILD11-UNWIELDED-${suffix}`.toUpperCase(), name: "Packed Saber", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "test", family: "test", category: "weapon", priceBasis: "unit" },
      { canonicalId: `BUILD11-UNTIMED-${suffix}`.toUpperCase(), name: "Untimed Saber", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "test", family: "test", category: "weapon", priceBasis: "unit" },
    ]).returning({ id: item.id });
    assert.ok(validWeapon && unwieldedWeapon && untimedWeapon);
    await tx.insert(weaponProfile).values([
      { itemId: validWeapon.id, weaponType: "Melee", handedness: "One-handed", damageSource: "STR", damage: "2", initiativeCost: 3, damageType: "Slashing" },
      { itemId: unwieldedWeapon.id, weaponType: "Melee", handedness: "One-handed", damageSource: "STR", damage: "2", initiativeCost: 3, damageType: "Slashing" },
      { itemId: untimedWeapon.id, weaponType: "Melee", handedness: "One-handed", damageSource: "STR", damage: "2", initiativeCost: null, damageType: "Slashing" },
    ]);
    await tx.insert(campaignCharacterItem).values([
      { characterId: data.characterAId, itemId: validWeapon.id, quantity: 1, unitCostCredits: 0 },
      { characterId: data.characterAId, itemId: unwieldedWeapon.id, quantity: 1, unitCostCredits: 0 },
      { characterId: data.characterAId, itemId: untimedWeapon.id, quantity: 1, unitCostCredits: 0 },
    ]);
    await tx.insert(campaignCharacterItemEquipmentState).values([
      { characterId: data.characterAId, itemId: validWeapon.id, state: "wielded", quantity: 1 },
      { characterId: data.characterAId, itemId: untimedWeapon.id, state: "wielded", quantity: 1 },
    ]);

    const [nonparticipant] = await tx.insert(campaignCharacter).values({ campaignId: data.campaignId, playerUserId: data.playerBId, name: "Same Campaign Bystander" }).returning({ id: campaignCharacter.id });
    assert.ok(nonparticipant);
    const [otherCampaign] = await tx.insert(campaign).values({
      name: `Build 11 Cross ${suffix}`, overview: "Cross-Campaign rejection fixture.", attributePoints: 0, skillPoints: 0,
      maxStartingSkill: 0, pointsToUnlockNextTier: 0, maxPointsInSkill: 100, startingCreditAmount: 0,
      currencySystem: "Credits", fatePointMethod: "Assigned", assignedFatePoints: 0, createdByUserId: data.godId,
    }).returning({ id: campaign.id });
    assert.ok(otherCampaign);
    await tx.insert(campaignPlayer).values({ campaignId: otherCampaign.id, userId: data.playerBId });
    const [crossCampaign] = await tx.insert(campaignCharacter).values({ campaignId: otherCampaign.id, playerUserId: data.playerBId, name: "Other Campaign Target" }).returning({ id: campaignCharacter.id });
    assert.ok(crossCampaign);

    const request = (itemId: number, targetCharacterId = data.characterBId) => ({
      sourceCharacterId: data.characterAId,
      targetCharacterId,
      itemId,
      instanceId: null,
    });
    await assert.rejects(startWeaponActionInTransaction(tx, context, request(unwieldedWeapon.id)), /wielded/i);
    await assert.rejects(startWeaponActionInTransaction(tx, context, request(untimedWeapon.id)), /Initiative Cost/i);
    await assert.rejects(startWeaponActionInTransaction(tx, context, request(validWeapon.id, nonparticipant.id)), /Participant/i);
    await assert.rejects(startWeaponActionInTransaction(tx, context, request(validWeapon.id, crossCampaign.id)), /Participant/i);

    const action = await startWeaponActionInTransaction(tx, context, request(validWeapon.id));
    assert.equal(action.payload.targetCharacterId, data.characterBId);
    const pending = await tx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, action.pendingActionId));
    const sources = await tx.select().from(campaignSessionEncounterPendingActionSource).where(eq(campaignSessionEncounterPendingActionSource.pendingActionId, action.pendingActionId));
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.originalInitiativeCost, 3);
    assert.equal(sources.length, 1);
    assert.equal(sources[0]?.sourceKind, "weapon");
    const godView = await readCombatAidEncounterInTransaction(tx, data.encounterId, data.godId);
    assert.equal(godView.authoredActions.some(({ pendingActionId }) => pendingActionId === action.pendingActionId), true);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("Player timed Spell uses the shared source and leaves Mana unchanged until authoritative resolution", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Spell");
    await tx.update(campaignCharacterProfile).set({ baseMagicSteps: 4 }).where(eq(campaignCharacterProfile.characterId, data.characterAId));
    const skills = await tx.select({ id: skill.id, name: skill.name }).from(skill).where(inArray(skill.name, ["Spellcraft", "Channeling", "Fire"]));
    const byName = new Map(skills.map((entry) => [entry.name, entry.id]));
    for (const required of ["Spellcraft", "Channeling", "Fire"]) assert.ok(byName.get(required), `Missing canonical ${required}.`);
    const [root] = await tx.insert(campaignCharacterSkillAllocation).values({ characterId: data.characterAId, skillId: byName.get("Spellcraft")!, points: 1 }).returning({ id: campaignCharacterSkillAllocation.id });
    assert.ok(root);
    await tx.insert(campaignCharacterSkillAllocation).values([
      { characterId: data.characterAId, skillId: byName.get("Channeling")!, parentAllocationId: root.id, points: 10 },
      { characterId: data.characterAId, skillId: byName.get("Fire")!, parentAllocationId: root.id, points: 1 },
    ]);
    const suffix = crypto.randomUUID();
    const spell = rollbackManualSpell(byName.get("Fire")!, suffix);
    const [savedSpell] = await tx.insert(campaignCharacterSpellDocument).values({
      characterId: data.characterAId,
      documentId: spell.id,
      name: spell.name,
      tradition: spell.tradition,
      documentJson: JSON.stringify(spell),
      inSpellbook: true,
    }).returning({ id: campaignCharacterSpellDocument.id });
    assert.ok(savedSpell);
    const context = await resolveActivePlayerEncounterInTransaction(tx, data.characterAId, data.playerAId, true);
    assert.ok(context);
    const before = await readActiveManaInTransaction(tx, data.characterAId);
    const started = await startSpellActionInTransaction(tx, context, {
      casterCharacterId: data.characterAId,
      source: { kind: "personal", savedSpellId: savedSpell.id },
      selections: { targetGroups: {}, applications: {} },
    }, data.playerAId);
    const after = await readActiveManaInTransaction(tx, data.characterAId);
    assert.deepEqual(after, before);
    assert.equal(started.binding.sourceKind, "spell");
    assert.equal(started.preview.plan.status, "ready");
    const sourceRows = await tx.select().from(campaignSessionEncounterPendingActionSource).where(eq(campaignSessionEncounterPendingActionSource.id, started.binding.id));
    assert.equal(sourceRows.length, 1);
    assert.equal(sourceRows[0]?.resolutionStatus, "pending");
    const godView = await readCombatAidEncounterInTransaction(tx, data.encounterId, data.godId);
    assert.equal(godView.authoredActions.some(({ id }) => id === started.binding.id), true);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("Player Hold, Pass, Reaction, and Roll mutate the one shared Initiative and Roll state", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const data = await fixture(tx, "Mutations");
    const contextA = await resolveActivePlayerEncounterInTransaction(tx, data.characterAId, data.playerAId, true);
    assert.ok(contextA);
    await holdParticipantInitiativeInTransaction(tx, contextA, data.characterAId);
    let [initiativeA] = await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(and(
      eq(campaignSessionEncounterInitiativeParticipant.encounterId, data.encounterId),
      eq(campaignSessionEncounterInitiativeParticipant.characterId, data.characterAId),
    ));
    assert.equal(initiativeA?.participationStatus, "holding");
    await passParticipantInitiativeInTransaction(tx, contextA, data.characterAId);
    [initiativeA] = await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(and(
      eq(campaignSessionEncounterInitiativeParticipant.encounterId, data.encounterId),
      eq(campaignSessionEncounterInitiativeParticipant.characterId, data.characterAId),
    ));
    assert.equal(initiativeA?.participationStatus, "passed");

    const [action] = await tx.insert(campaignSessionEncounterPendingAction).values({
      encounterId: data.encounterId, sceneId: data.sceneId, sessionId: data.sessionId, campaignId: data.campaignId,
      actorCharacterId: data.characterAId, label: "Shared authored attack", actionKind: "weapon",
      originalInitiativeCost: 10, remainingInitiativeCost: 10, startInitiative: 20,
      startTimelineInitiative: 20, expectedCompletionInitiative: 10, startedRound: 1,
    }).returning({ id: campaignSessionEncounterPendingAction.id });
    assert.ok(action);
    await tx.insert(campaignSessionEncounterPendingActionSource).values({
      pendingActionId: action.id, encounterId: data.encounterId, sceneId: data.sceneId,
      sessionId: data.sessionId, campaignId: data.campaignId, sourceCharacterId: data.characterAId,
      sourceKind: "weapon", sourceRef: "test:weapon", payloadJson: JSON.stringify({ targetCharacterId: data.characterBId, itemId: 1, instanceId: null }),
    });
    const contextB = await resolveActivePlayerEncounterInTransaction(tx, data.characterBId, data.playerBId, true);
    assert.ok(contextB);
    const reaction = await declareEncounterReactionInTransaction(tx, contextB, {
      pendingActionId: action.id,
      reactorCharacterId: data.characterBId,
      reactionType: "dodge",
    });
    assert.equal(reaction.committedInitiativeCost, 1);
    const [initiativeB] = await tx.select().from(campaignSessionEncounterInitiativeParticipant).where(and(
      eq(campaignSessionEncounterInitiativeParticipant.encounterId, data.encounterId),
      eq(campaignSessionEncounterInitiativeParticipant.characterId, data.characterBId),
    ));
    assert.equal(initiativeB?.currentInitiative, 17);

    const playerActor = {
      userId: data.playerBId,
      campaignId: data.campaignId,
      readAs: "player" as const,
      canRecordGodOnly: false,
      characterId: data.characterBId,
    };
    const roll = await recordRollInTransaction(tx, playerActor, {
      sessionId: data.sessionId, sceneId: data.sceneId, encounterId: data.encounterId,
      rollerCharacterId: data.characterBId, reactionId: reaction.id,
      method: "entered", visibility: "table", purposeKind: "defense", enteredTotal: 62,
    });
    assert.equal(roll.resultTotal, 62);
    const randomRoll = await recordRollInTransaction(tx, playerActor, {
      sessionId: data.sessionId, sceneId: data.sceneId, encounterId: data.encounterId,
      rollerCharacterId: data.characterBId, targetCharacterId: data.characterAId,
      method: "random", visibility: "table", purposeKind: "defense",
    }, () => 73);
    assert.equal(randomRoll.resultTotal, 73);
    await assert.rejects(recordRollInTransaction(tx, playerActor, {
      sessionId: data.sessionId, sceneId: data.sceneId, encounterId: data.encounterId,
      rollerCharacterId: data.characterBId, method: "entered", visibility: "god-only",
      purposeKind: "other", enteredTotal: 50,
    }), /cannot record G\.O\.D\.-only/);
    const history = await readRollLedgerInTransaction(tx, playerActor, data.sessionId, { encounterId: data.encounterId });
    assert.deepEqual(history.rolls.map(({ id }) => id), [randomRoll.id, roll.id]);
    const sharedRows = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, data.encounterId));
    assert.equal(sharedRows.length, 2);
    assert.equal(sharedRows.every(({ visibility }) => visibility === "table"), true);
    const godView = await readCombatAidEncounterInTransaction(tx, data.encounterId, data.godId);
    assert.equal(godView.reactions.some(({ id, status }) => id === reaction.id && status === "declared"), true);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

test("PostgreSQL tabletop invalidation emits on commit and emits nothing on rollback", async () => {
  const listener = new Client({ connectionString, application_name: "build11-live-event-test" });
  await listener.connect();
  await listener.query(`LISTEN ${TABLETOP_LIVE_CHANNEL}`);
  const payloads: string[] = [];
  listener.on("notification", (notification) => {
    if (notification.channel === TABLETOP_LIVE_CHANNEL && notification.payload) payloads.push(notification.payload);
  });
  const event = { campaignId: 91, sessionId: 92, sceneId: 93, encounterId: 94, characterIds: [95], category: "initiative" as const };
  await assert.rejects(db.transaction(async (tx) => {
    await publishTabletopInvalidationInTransaction(tx, event);
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(payloads.length, 0);
  await db.transaction((tx) => publishTabletopInvalidationInTransaction(tx, event));
  for (let attempt = 0; attempt < 20 && payloads.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(payloads.length, 1);
  assert.deepEqual(JSON.parse(payloads[0]!), event);
  await listener.query(`UNLISTEN ${TABLETOP_LIVE_CHANNEL}`);
  await listener.end();
});

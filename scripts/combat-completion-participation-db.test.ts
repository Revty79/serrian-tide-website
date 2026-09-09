import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { race, raceMovementMode } from "@/db/race-schema";
import { creatureAttribute, creatureMovement } from "@/db/creature-schema";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterAttribute } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiativeParticipant as participant,
  campaignSessionEncounterActionDeclaration as declaration, campaignSessionRoster as roster, campaignSessionSceneMember as sceneMember,
  campaignSessionRoll, campaignSessionEncounterReaction as reaction, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionEncounterPendingAction as pendingAction, campaignSessionEncounterPendingActionSource as pendingSource } from "@/db/tabletop-operations-schema";
import { changeCombatParticipationInTransaction as change, type CombatParticipationCommand } from "@/features/tabletop-operations/combat-participation-service";
import { declareCombatMovementInTransaction } from "@/features/tabletop-operations/combat-movement-service";
import { spawnEncounterCreaturesInTransaction } from "@/features/tabletop-operations/creature-spawn-service";
import { resolveInitiativeCapacityInTransaction } from "@/features/tabletop-operations/initiative-capacity-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline, advanceInitiativeRound } from "@/features/tabletop-operations/initiative-runtime";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction,
  readActionDeclarationWorkspaceInTransaction, reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { resolveDeclaredDefensesInTransaction, declareDefenseInterventionInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { applyRoutineCombatConsequencesInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { readOpenDeclarationCheckpoint } from "@/features/tabletop-operations/declaration-checkpoint-service";
import { readCombatProjectionInTransaction } from "@/features/tabletop-operations/combat-projection-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rollback = new Error("ROLLBACK_PARTICIPATION");
const expectedRollback = (error: unknown) => { if (error !== rollback) console.error(error); return error === rollback; };
const command = (participantId: number, operation: CombatParticipationCommand["operation"], expectedRevision = 0): CombatParticipationCommand =>
  ({ participantId, operation, expectedRevision, requestKey: crypto.randomUUID(), reason: `Explicit G.O.D. ${operation} fixture ruling.` });

async function fixture(tx: Tx) {
  const f = await completionServiceFixture(tx, "participation");
  const [ancestry] = await tx.insert(race).values({ name: `Arrival ancestry ${crypto.randomUUID()}`, createdByUserId: f.godId }).returning();
  await tx.insert(raceMovementMode).values({ raceId: ancestry.id, movementMode: "Walk", baseValue: 2 });
  for (const id of [f.heroId, f.defenderId]) await tx.update(campaignCharacterProfile).set({ raceId: ancestry.id }).where(eq(campaignCharacterProfile.characterId, id));
  const engine = () => loadInitiativeEngineInTransaction(tx, f.encounterId);
  const activate = async (id: number) => { await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id))); };
  const attack = async (id: number, target: number) => {
    const actor = id === f.heroId ? f.player : f.god;
    const declarationId = await createActionDeclarationDraftInTransaction(tx, f.context, actor, { ...completionDraft(id, target), sourceKind: "weapon", weaponItemId: f.weaponId });
    await lockActionDeclarationInTransaction(tx, f.context, actor, declarationId);
    await commitActionDeclarationInTransaction(tx, f.context, actor, declarationId, { method: "entered", enteredTotal: 70 });
    return declarationId;
  };
  const advance = async (point: number) => { const before = await engine(); await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, point)); };
  return { ...f, ancestry, engine, activate, attack, advance };
}

test("new Player, NPC and exact Creature arrivals reuse late enrollment without moving the fight or duplicating an occurrence", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx); await f.activate(f.heroId);
    await f.attack(f.heroId, f.occurrences[0]); await f.advance(20);
    const before = await f.engine();
    for (const isNpc of [false, true]) {
      const [character] = await tx.insert(campaignCharacter).values({ campaignId: f.campaignId, playerUserId: f.godId, name: `Arriving ${isNpc ? "NPC" : "Player"}`,
        isNpc, npcBuildMode: isNpc ? "detailed" : null }).returning();
      await tx.insert(campaignCharacterProfile).values({ characterId: character.id, raceId: f.ancestry.id });
      await tx.insert(campaignCharacterAttribute).values({ characterId: character.id, attributeKey: "DEX", value: 50 });
      await tx.insert(roster).values({ characterId: character.id, campaignId: f.campaignId, sessionId: f.sessionId, sortOrder: isNpc ? 5 : 4 });
      await tx.insert(sceneMember).values({ characterId: character.id, campaignId: f.campaignId, sessionId: f.sessionId, sceneId: f.sceneId, sortOrder: isNpc ? 5 : 4 });
      const request = command(character.id, "arrive");
      await assert.rejects(change(tx, f.encounterId, f.player, request), /Campaign-owning/);
      await change(tx, f.encounterId, f.god, request);
      assert.equal((await change(tx, f.encounterId, f.god, request)).reused, true);
      const capacity = await resolveInitiativeCapacityInTransaction(tx, character.id, f.campaignId);
      assert.equal((await f.engine()).participants.find(({ characterId }) => characterId === character.id)!.currentInitiative, capacity.normalTotalInitiative);
    }
    const [old] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
    await tx.insert(creatureAttribute).values({ creatureId: old.creatureId!, attributeKey: "Dexterity", value: 50 });
    await tx.insert(creatureMovement).values({ creatureId: old.creatureId!, movementMode: "Walk", movementValue: 2 });
    const input = { creatureId: old.creatureId!, quantity: 1, joinInitiative: true, movementMode: "Walk", requestKey: crypto.randomUUID() };
    const arrived = await spawnEncounterCreaturesInTransaction(tx, f.context, f.godId, input);
    assert.deepEqual(await spawnEncounterCreaturesInTransaction(tx, f.context, f.godId, input), arrived);
    await assert.rejects(spawnEncounterCreaturesInTransaction(tx, f.context, f.godId, { ...input, quantity: 2 }), /different Creature/);
    assert.ok(arrived.created[0].runtimeParticipantKey < 0);
    assert.ok(!f.occurrences.includes(arrived.created[0].runtimeParticipantKey));
    const after = await f.engine();
    assert.deepEqual(after.runtime, before.runtime); assert.deepEqual(after.pendingActions, before.pendingActions);
    assert.equal(after.participants.length, before.participants.length + 3);
    throw rollback;
  }), expectedRollback);
});

test("flee movement remains active until G.O.D. confirmation; Freeze, retries and return preserve spent time and history", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx); await f.activate(f.heroId);
    const move = await declareCombatMovementInTransaction(tx, f.context, f.player, { participantId: f.heroId, movementMode: "Walk", distance: 4, intent: "flee", requestKey: crypto.randomUUID() });
    await f.advance(21);
    assert.equal((await f.engine()).participants.find(({ characterId }) => characterId === f.heroId)!.participationStatus, "active");
    // A request to flee has not disabled normal targeting.
    await createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(f.defenderId, f.heroId), sourceKind: "weapon", weaponItemId: f.weaponId });
    const request = command(f.heroId, "confirm-escape");
    await assert.rejects(change(tx, f.encounterId, f.player, request), /Campaign-owning/);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    await assert.rejects(change(tx, f.encounterId, f.god, request), /Combat is paused/);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    const before = await f.engine();
    await change(tx, f.encounterId, f.god, request);
    const after = await f.engine();
    assert.equal(after.runtime.stepNumber, before.runtime.stepNumber);
    const actor = after.participants.find(({ characterId }) => characterId === f.heroId)!;
    assert.equal(actor.currentInitiative, 21); assert.equal(actor.participationStatus, "suspended");
    assert.equal(after.pendingActions.find(({ id }) => id === move.pendingActionId)!.status, "ended");
    assert.equal((await change(tx, f.encounterId, f.god, request)).reused, true);
    await assert.rejects(createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(f.defenderId, f.heroId), sourceKind: "weapon", weaponItemId: f.weaponId }), /left active combat/);
    const projection = await readCombatProjectionInTransaction(tx, f.context, f.god);
    const card = projection.entities.find(({ participantId }) => participantId === f.heroId)!;
    assert.equal(card.canInspect, true); assert.equal(card.canActNow, false); assert.match(card.statusText, /Left active combat/);
    await change(tx, f.encounterId, f.god, command(f.heroId, "arrive", 1));
    assert.equal((await f.engine()).participants.find(({ characterId }) => characterId === f.heroId)!.currentInitiative, 21);
    assert.equal((await change(tx, f.encounterId, f.god, request)).departed, false, "An old escape retry cannot withdraw a returned combatant.");
    const [history] = await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.heroId)));
    assert.equal((history.localStateJson as { movementHistory: { distance: number }[] }).movementHistory[0].distance, 2);
    assert.equal((history.localStateJson as { defeat?: unknown }).defeat, undefined);
    throw rollback;
  }), expectedRollback);
});

test("withdrawal preserves negative Initiative, deferred debt and effects across a round and re-entry without an extra Step", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx), id = f.occurrences[0];
    await tx.update(participant).set({ participationStatus: "active", currentInitiative: -3, deferredInitiativeCost: 2 }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
    const [original] = await tx.select().from(member).where(eq(member.characterId, id));
    await tx.update(member).set({ localStateJson: { ...(original.localStateJson as object), conditions: [{ name: "Persistent injury", duration: { kind: "until-removed" } },
      { name: "Two round condition", duration: { kind: "combat-rounds", value: 2 } }] } }).where(eq(member.characterId, id));
    const before = await f.engine(); await change(tx, f.encounterId, f.god, command(id, "withdraw"));
    assert.equal((await f.engine()).runtime.stepNumber, before.runtime.stepNumber);
    const departed = await f.engine(); await persistInitiativeEngineInTransaction(tx, f.context, departed, advanceInitiativeRound(departed));
    await change(tx, f.encounterId, f.god, command(id, "arrive", 1));
    const returned = (await f.engine()).participants.find(({ characterId }) => characterId === id)!;
    assert.equal(returned.currentInitiative, -3); assert.equal(returned.deferredInitiativeCost, 2);
    const [state] = await tx.select().from(member).where(eq(member.characterId, id));
    const effects = (state.localStateJson as { conditions: { expiredAt?: string; remainingValue?: number }[] }).conditions;
    assert.equal(effects[0].expiredAt, undefined); assert.equal(effects[1].remainingValue, 1);
    throw rollback;
  }), expectedRollback);
});

test("departing an uncommitted member releases its sealed checkpoint without cancelling another combatant's choice", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx); await f.activate(f.heroId); await f.activate(f.defenderId);
    const id = await f.attack(f.heroId, f.occurrences[0]);
    assert.ok(await readOpenDeclarationCheckpoint(tx, f.encounterId));
    assert.equal((await readActionDeclarationWorkspaceInTransaction(tx, f.context, f.god)).declarations.length, 0);
    const before = await f.engine();
    await change(tx, f.encounterId, f.god, command(f.defenderId, "withdraw"));
    assert.equal(await readOpenDeclarationCheckpoint(tx, f.encounterId), null);
    assert.equal((await f.engine()).runtime.stepNumber, before.runtime.stepNumber);
    assert.equal((await tx.select().from(declaration).where(eq(declaration.id, id)))[0].status, "rolling");
    assert.deepEqual((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).map(({ resultTotal }) => resultTotal), [70]);
    await f.advance(18);
    throw rollback;
  }), expectedRollback);
});

for (const departingActor of [false, true]) test(`a completed fatal head hit survives departure before Apply; departing source=${departingActor}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx); await f.activate(f.heroId);
    const id = await f.attack(f.heroId, f.occurrences[0]);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
    await f.advance(18);
    await change(tx, f.encounterId, f.god, command(departingActor ? f.heroId : f.occurrences[0], "withdraw"));
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id)).status, "applied");
    const [target] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
    assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, 6);
    // Six damage to this fixture's three-HP head is now fatal, independently
    // of whether the attacker or target withdrew before applying the due hit.
    assert.ok((target.localStateJson as { defeat?: unknown }).defeat);
    assert.equal((target.localStateJson as { combatCondition: { status: string } }).combatCondition.status, "dead");
    throw rollback;
  }), expectedRollback);
});

test("departure marks an unfinished incoming attack for ruling and cancels future responses without fabricating a defeat", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx); await f.activate(f.defenderId);
    const id = await f.attack(f.defenderId, f.heroId);
    const request = command(f.heroId, "withdraw");
    await assert.rejects(change(tx, f.encounterId, { authority: "god-owner", userId: "unrelated-admin" }, request), /owner|creator/);
    await change(tx, f.encounterId, f.god, request);
    const [incoming] = await tx.select().from(declaration).where(eq(declaration.id, id));
    assert.equal(incoming.status, "awaiting-god-ruling");
    assert.match(incoming.rulingReason, /Target left active combat/);
    assert.equal((await f.engine()).pendingActions.find(({ id: pendingId }) => pendingId === incoming.pendingActionId)!.remainingInitiativeCost, 4);
    const [absent] = await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.heroId)));
    assert.equal((absent.localStateJson as { defeat?: unknown }).defeat, undefined);
    throw rollback;
  }), expectedRollback);
});

test("a departing defender keeps its committed Dodge cost and Roll while its future response is settled once", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx), target = f.occurrences[0]; await f.activate(f.heroId);
    await tx.update(participant).set({ participationStatus: "holding" }).where(eq(participant.characterId, target));
    const id = await f.attack(f.heroId, target);
    const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, id), eq(opportunity.responderCharacterId, target)));
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
    const reactionId = await declareDefenseInterventionInTransaction(tx, f.context, f.god,
      { opportunityId: window.id, reactionType: "dodge", protectedTargetCharacterId: target }, { method: "entered", enteredTotal: 90 });
    const before = await f.engine();
    assert.equal(before.participants.find(({ characterId }) => characterId === target)!.currentInitiative, 21);
    const request = command(target, "withdraw");
    await change(tx, f.encounterId, f.god, request); await change(tx, f.encounterId, f.god, request);
    const [response] = await tx.select().from(reaction).where(eq(reaction.id, reactionId));
    assert.equal(response.status, "cancelled"); assert.ok(response.reconciliationAppliedAt);
    assert.equal((await f.engine()).participants.find(({ characterId }) => characterId === target)!.currentInitiative, 21);
    assert.equal((await f.engine()).runtime.stepNumber, before.runtime.stepNumber);
    assert.deepEqual((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).map(({ resultTotal }) => resultTotal), [70, 90]);
    throw rollback;
  }), expectedRollback);
});

test("withdrawal settles retained unfinished source bindings and responses without erasing spent time or adding a Step", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx); await f.activate(f.heroId);
    // Reproduce an unfinished binding retained from the old integration path.
    await tx.update(pendingAction).set({ status: "active", initiativeSpent: 2, remainingInitiativeCost: 3,
      startInitiative: 24, startTimelineInitiative: 24, expectedCompletionInitiative: 19, startedRound: 1, completedRound: null }).where(eq(pendingAction.id, f.pendingActionId));
    const before = await f.engine();
    const request = command(f.heroId, "withdraw");
    await change(tx, f.encounterId, f.god, request); await change(tx, f.encounterId, f.god, request);
    const after = await f.engine();
    assert.equal(after.runtime.stepNumber, before.runtime.stepNumber);
    assert.equal(after.pendingActions.find(({ id }) => id === f.pendingActionId)!.status, "ended");
    assert.equal(after.pendingActions.find(({ id }) => id === f.pendingActionId)!.initiativeSpent, 2);
    assert.equal(after.participants.find(({ characterId }) => characterId === f.heroId)!.currentInitiative, 22);
    assert.equal((await tx.select().from(pendingSource).where(eq(pendingSource.pendingActionId, f.pendingActionId)))[0].resolutionStatus, "cancelled");
    const [response] = await tx.select().from(reaction).where(eq(reaction.id, f.reactionId));
    assert.equal(response.status, "cancelled"); assert.ok(response.reconciliationAppliedAt);
    await persistInitiativeEngineInTransaction(tx, f.context, after, advanceInitiativeRound(after));
    assert.equal((await f.engine()).runtime.roundNumber, before.runtime.roundNumber + 1);
    throw rollback;
  }), expectedRollback);
});

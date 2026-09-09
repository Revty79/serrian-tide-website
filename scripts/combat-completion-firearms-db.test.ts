import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { item, weaponProfile, weaponFiringMode, weaponSkillPathMapping } from "@/db/item-schema";
import { campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import { campaignCharacterFirearmState as stateTable, campaignSessionEncounterFirearmAttack as attackTable, campaignSessionEncounterFirearmBullet as bulletTable,
  campaignSessionEncounterInitiativeParticipant as participant, campaignSessionEncounterParticipant as occurrence,
  campaignSessionEncounterResponderOpportunity as opportunity, campaignSessionRoll, campaignSessionEncounterActionDeclaration as declarationTable,
  campaignSessionEncounterEffectPlan as planTable, campaignSessionEncounterEffect as effectTable } from "@/db/tabletop-operations-schema";
import { declareFirearmAttackInTransaction, commitFirearmAttackTriggerInTransaction, fireFirearmAttackInTransaction, cancelFirearmAttackInTransaction,
  previewFirearmAttackInTransaction, type DeclareFirearmAttackCommand } from "@/features/tabletop-operations/firearm-attack-service";
import { startFirearmPreparationInTransaction } from "@/features/tabletop-operations/firearm-readiness-service";
import { reconcileResponderOpportunityInTransaction, interruptActionDeclarationInTransaction, resumeInterruptedActionDeclarationInTransaction,
  restartInterruptedActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { changeCombatParticipationInTransaction } from "@/features/tabletop-operations/combat-participation-service";
import { declareDefenseInterventionInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { applyRoutineCombatConsequencesInTransaction, declineActionEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline, getNextInitiativeTimelineEvent } from "@/features/tabletop-operations/initiative-runtime";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { getAttributeModifier } from "@/features/characters/character-rules";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { cancelAuthoredActionBindingInTransaction, ruleOnInterruptedReactionInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { closeInitiativeRuntime } from "@/features/tabletop-operations/initiative-runtime";
import { lockEncounterCloseoutContextInTransaction, finalizeEncounterCloseoutInTransaction } from "@/features/tabletop-operations/encounter-closeout-service";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_FIREARM_COMPLETION");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function fixture(tx: Tx, kind: "player" | "npc", burst = false) {
  const f = await completionServiceFixture(tx, `firearm-${kind}`);
  await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
  const actorId = kind === "player" ? f.heroId : f.defenderId;
  const actor = kind === "player" ? f.player : f.god;
  const [ammunition, firearm] = await tx.insert(item).values([
    { canonicalId: `COMPLETION-AMMO-${crypto.randomUUID()}`.toUpperCase(), name: "Completion Cartridge", catalogScope: "inventory", recordType: "Ammunition", family: "Fixture", category: "Ammunition", priceBasis: "per round", createdByUserId: f.godId },
    { canonicalId: `COMPLETION-GUN-${crypto.randomUUID()}`.toUpperCase(), name: "Completion Firearm", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "Weapon", family: "Fixture", category: "Firearm", priceBasis: "unit", createdByUserId: f.godId },
  ]).returning();
  const [ammoProfile] = await tx.insert(weaponProfile).values({ itemId: ammunition.id, profileRecordType: "Ammunition", damage: "8", damageType: "Ballistic", ammunitionCyclingInitiativeModifier: 0, ammunitionRecoilResetInitiativeModifier: 0 }).returning();
  const [profile] = await tx.insert(weaponProfile).values({ itemId: firearm.id, profileRecordType: "Weapon", weaponType: "Handgun", damageSource: "Ammunition", ammunitionItemId: ammunition.id,
    rangeText: "Ranged", capacityRounds: 6, readinessMode: "draw-is-ready", drawInitiativeCost: 2, readyInitiativeCost: 1, reloadInitiativeCost: 3, unloadInitiativeCost: 2, firingModeChangeInitiativeCost: 1 }).returning();
  await tx.insert(weaponSkillPathMapping).values({ weaponProfileId: profile.id, endpointSkillId: f.skillId, reviewState: "approved", sortOrder: 0, updatedByUserId: f.godId });
  const modes = await tx.insert(weaponFiringMode).values([1, 3].map((rounds, index) => ({ weaponProfileId: profile.id, name: rounds === 1 ? "Single" : "Burst", normalizedName: rounds === 1 ? "single" : "burst", sortOrder: index,
    baseCyclingInitiativeCost: 1, baseRecoilResetInitiativeCost: 2, deliveryCadence: "per-trigger" as const, roundsPerCadence: rounds }))).returning();
  const mode = modes[burst ? 1 : 0];
  const [instance] = await tx.insert(campaignCharacterItemInstance).values({ characterId: actorId, itemId: firearm.id, currentCharges: 0, equipmentState: "wielded", unitCostCredits: 100 }).returning();
  await tx.insert(stateTable).values({ itemInstanceId: instance.id, campaignId: f.campaignId, characterId: actorId, itemId: firearm.id, weaponProfileId: profile.id, selectedFiringModeId: mode.id,
    loadedAmmunitionItemId: ammunition.id, loadedAmmunitionProfileId: ammoProfile.id, loadedAmmunitionUnitCostCredits: 2, loadedRounds: 3, capacityRounds: 6, capacitySource: "canonical", readinessMode: "draw-is-ready", readinessModeSource: "canonical", readied: true,
    initializationKey: crypto.randomUUID(), initializedByUserId: f.godId, updatedByUserId: f.godId });
  await tx.insert(campaignCharacterItem).values({ characterId: actorId, itemId: ammunition.id, quantity: 9, unitCostCredits: 2 });
  await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, actorId)));
  const body = { ...f.creatureSnapshot, hpPools: [{ canonicalId: "fixture-body", poolName: "Body", maximumHp: 30 }],
    hitLocations: [{ hitLocationNumber: 0, locationName: "Body", hpPoolCanonicalId: "fixture-body", naturalArmor: "2", soak: "1" }] };
  await tx.update(occurrence).set({ creatureSnapshotJson: body }).where(eq(occurrence.characterId, f.occurrences[0]));
  const command: DeclareFirearmAttackCommand = { actorParticipantId: actorId, targetParticipantId: f.occurrences[0], itemInstanceId: instance.id, firingModeId: mode.id,
    aimInitiative: 0, firingDurationInitiative: 1, calledShot: { declared: false, objective: "", locationNumber: null, penalty: null, reason: "" }, idempotencyKey: crypto.randomUUID(), roll: { method: "entered", enteredTotal: 70 } };
  return { ...f, actor, actorId, command, instance, ammunition, modes, profile,
    state: async () => (await tx.select().from(stateTable).where(eq(stateTable.itemInstanceId, instance.id)))[0],
    attack: async (id: number) => (await tx.select().from(attackTable).where(eq(attackTable.id, id)))[0],
    rolls: () => tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId)) };
}

async function complete(tx: Tx, f: Awaited<ReturnType<typeof fixture>>, pendingId: number) {
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  const action = before.pendingActions.find(({ id }) => id === pendingId)!;
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, action.expectedCompletionInitiative));
}

async function noDefense(tx: Tx, f: Awaited<ReturnType<typeof fixture>>, declarationId: number) {
  for (const window of await tx.select().from(opportunity).where(eq(opportunity.declarationId, declarationId))) {
    if (window.status !== "pending") continue;
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "ineligible", reason: "No aware participant has a legitimate response in this isolated shot." });
  }
}

test("a firearm hit on a creature with blank armor and soak applies its full damage once", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(occurrence).set({ creatureSnapshotJson: { ...f.creatureSnapshot,
      hpPools: [{ canonicalId: "fixture-body", poolName: "Body", maximumHp: 30 }],
      hitLocations: [{ hitLocationNumber: 0, locationName: "Body", hpPoolCanonicalId: "fixture-body", naturalArmor: null, soak: null }] } })
      .where(eq(occurrence.characterId, f.occurrences[0]));
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    const attack = await f.attack(declared.attackId);
    await noDefense(tx, f, attack.triggerDeclarationId);
    await complete(tx, f, attack.triggerPendingActionId!);
    await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.actor, attack.triggerDeclarationId)).status, "applied");
    const [bullet] = await tx.select().from(bulletTable).where(eq(bulletTable.attackId, attack.id));
    assert.equal(bullet.armor, 0); assert.equal(bullet.soak, 0); assert.equal(bullet.proposedNetDamage, 8);
    const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
    assert.deepEqual((target.localStateJson as { health: unknown }).health, { totalDamage: 8, poolDamage: { "fixture-body": 8 } });
    assert.equal((await f.state()).loadedRounds, 2);
    assert.deepEqual((await f.rolls()).map(({ resultTotal }) => resultTotal), [70]);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

for (const kind of ["player", "npc"] as const) for (const burst of [false, true]) test(`${kind} ${burst ? "burst" : "single"}: declaration Roll, exact ammo, Freeze and consequence retry`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, kind, burst);
    if (burst) {
      await tx.update(stateTable).set({ loadedRounds: 2 }).where(eq(stateTable.itemInstanceId, f.instance.id));
      await assert.rejects(declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command), /requires 3 rounds, but only 2/);
      await tx.update(stateTable).set({ loadedRounds: 3 }).where(eq(stateTable.itemInstanceId, f.instance.id));
    }
    await assert.rejects(declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, roll: { method: "entered", enteredTotal: 101 } }), /1.*100|between|percentile/i);
    assert.equal((await f.rolls()).length, 0);
    assert.equal((await tx.select().from(declarationTable).where(eq(declarationTable.encounterId, f.encounterId))).length, 0);
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    assert.deepEqual((await f.rolls()).map(({ resultTotal }) => resultTotal), [70]);
    assert.equal((await f.state()).loadedRounds, 3);
    assert.equal((await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command)).reused, true);
    await assert.rejects(declareFirearmAttackInTransaction(tx, f.context, { authority: "god-owner", userId: "unrelated-admin" }, f.command), /Campaign-owning/);
    await assert.rejects(declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, aimInitiative: 2 }), /already used/);
    const attack = await f.attack(declared.attackId);
    await assert.rejects(fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "entered", enteredTotal: 99 }), /must finish/);
    await noDefense(tx, f, attack.triggerDeclarationId);
    await complete(tx, f, attack.triggerPendingActionId!);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    await assert.rejects(fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" }), /Combat is paused/);
    assert.equal((await f.state()).loadedRounds, 3);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "entered", enteredTotal: 99 });
    assert.equal(fired.roundsConsumed, burst ? 3 : 1);
    assert.equal((await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" })).rollId, fired.rollId);
    assert.deepEqual((await f.rolls()).map(({ resultTotal }) => resultTotal), [70]);
    assert.equal((await f.state()).loadedRounds, burst ? 0 : 2);
    assert.equal((await f.state()).requiresCycling, true);
    assert.equal((await f.state()).requiresRecoilRecovery, true);
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.actor, attack.triggerDeclarationId)).status, "applied");
    const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
    assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, burst ? 15 : 5);
    const bullets = await tx.select().from(bulletTable).where(eq(bulletTable.attackId, attack.id));
    assert.equal(bullets.length, burst ? 3 : 1);
    assert.equal(bullets.every(({ armor, soak, proposedNetDamage }) => armor === 2 && soak === 1 && proposedNetDamage === 5), true);
    await assert.rejects(cancelFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, "Retry cancellation after a real shot"), /fired attack cannot/);
    const [other] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[1]));
    assert.equal((other.localStateJson as { health: { totalDamage: number } }).health.totalDamage, 0);
    await cancelAuthoredActionBindingInTransaction(tx, f.context, f.pendingActionId, "Settle unrelated retained fixture binding before closeout.");
    await ruleOnInterruptedReactionInTransaction(tx, f.context, f.reactionId, "keep");
    const beforeClose = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, beforeClose, closeInitiativeRuntime(beforeClose));
    const decision = { kind: "encounter" as const, amountPerCharacter: 10, recipientCharacterIds: [f.heroId, f.defenderId], requestKey: crypto.randomUUID() };
    for (let retry = 0; retry < 2; retry++) {
      const closed = await finalizeEncounterCloseoutInTransaction(tx, await lockEncounterCloseoutContextInTransaction(tx, f.encounterId, f.godId), { awards: [], combatXpDecisions: [decision] });
      assert.equal(closed.encounter.status, "completed");
      assert.deepEqual(closed.recipients.map(({ currentExperience }) => currentExperience), [22, 18]);
      assert.equal(closed.rewards.length, 2);
    }
    assert.equal((await f.state()).loadedRounds, burst ? 0 : 2);
    assert.equal((await f.state()).requiresCycling, true);
    assert.equal((await f.state()).requiresRecoilRecovery, true);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId, true)).participants.find(({ characterId }) => characterId === f.actorId)!.currentInitiative, 21);
    throw rollback;
  }), (error) => error === rollback);
});

test("Aim records no attack Roll; changed target loses Aim and a fresh trigger records its original called-shot Roll", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "npc");
    const original = await declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, aimInitiative: 2 });
    const aiming = await f.attack(original.attackId);
    assert.equal((await f.rolls()).length, 0);
    await noDefense(tx, f, aiming.aimDeclarationId!);
    await complete(tx, f, aiming.aimPendingActionId!);
    await assert.rejects(declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, aimInitiative: 2, targetParticipantId: f.occurrences[1] }), /already used/);
    await cancelFirearmAttackInTransaction(tx, f.context, f.actor, aiming.id, "Change target; abandon accumulated Aim.");
    assert.equal((await f.state()).loadedRounds, 3);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.actorId)!.currentInitiative, 20);
    const [originalTarget] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
    await tx.update(occurrence).set({ creatureSnapshotJson: originalTarget.creatureSnapshotJson }).where(eq(occurrence.characterId, f.occurrences[1]));
    const command = { ...f.command, targetParticipantId: f.occurrences[1], idempotencyKey: crypto.randomUUID(), aimInitiative: 2,
      calledShot: { declared: true, objective: "Body", locationNumber: 0, penalty: 4, reason: "Explicit fixture Called Shot ruling." } };
    const next = await declareFirearmAttackInTransaction(tx, f.context, f.actor, command);
    const nextAim = await f.attack(next.attackId);
    await noDefense(tx, f, nextAim.aimDeclarationId!);
    await complete(tx, f, nextAim.aimPendingActionId!);
    await assert.rejects(commitFirearmAttackTriggerInTransaction(tx, f.context, f.actor, next.attackId, { method: "entered", enteredTotal: 101 }), /1.*100|between|percentile/i);
    assert.equal((await f.attack(next.attackId)).status, "aiming");
    const trigger = await commitFirearmAttackTriggerInTransaction(tx, f.context, f.actor, next.attackId, { method: "entered", enteredTotal: 70 });
    assert.equal(await commitFirearmAttackTriggerInTransaction(tx, f.context, f.actor, next.attackId, { method: "entered", enteredTotal: 99 }), trigger);
    assert.deepEqual((await f.rolls()).map(({ resultTotal }) => resultTotal), [70]);
    await noDefense(tx, f, nextAim.triggerDeclarationId);
    await complete(tx, f, trigger);
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, next.attackId, { method: "random" });
    const [bullet] = await tx.select().from(bulletTable).where(eq(bulletTable.attackId, next.attackId));
    assert.equal(bullet.grossDamage, 8 + getAttributeModifier(50) + 2);
    await declineActionEffectPlanInTransaction(tx, f.context, f.god, fired.effectPlanId!, "Keep fired ammunition spent while declining the pending damage.");
    assert.equal((await f.state()).loadedRounds, 2);
    throw rollback;
  }), (error) => error === rollback);
});

test("authored draw, reload, cycling and recoil complete through Initiative with no attack Rolls", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(campaignCharacterItemInstance).set({ equipmentState: "inactive" }).where(eq(campaignCharacterItemInstance.id, f.instance.id));
    await tx.update(stateTable).set({ readied: false, requiresCycling: true, requiresRecoilRecovery: true }).where(eq(stateTable.itemInstanceId, f.instance.id));
    for (const [operation, cost] of [["draw", 2], ["reload", 3], ["cycle", 1], ["recover-recoil", 2]] as const) {
      const command = { characterId: f.actorId, itemInstanceId: f.instance.id, operation, requestedRounds: operation === "reload" ? 3 : undefined, idempotencyKey: crypto.randomUUID() };
      const before = (await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.actorId)!.currentInitiative;
      const preparation = await startFirearmPreparationInTransaction(tx, f.context, f.actor, command);
      assert.equal((await startFirearmPreparationInTransaction(tx, f.context, f.actor, command)).preparationId, preparation.preparationId);
      const [declaration] = await tx.select().from(declarationTable).where(eq(declarationTable.pendingActionId, preparation.pendingActionId!));
      await noDefense(tx, f, declaration.id);
      await complete(tx, f, preparation.pendingActionId!);
      assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.actorId)!.currentInitiative, before - cost);
    }
    const state = await f.state();
    assert.equal(state.readied, true);
    assert.equal(state.loadedRounds, 6);
    assert.equal(state.requiresCycling, false);
    assert.equal(state.requiresRecoilRecovery, false);
    assert.equal((await f.rolls()).length, 0);
    assert.equal((await previewFirearmAttackInTransaction(tx, f.context, f.actor, f.command)).firearm.roundsLoaded, 6);
    const [inventory] = await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.actorId), eq(campaignCharacterItem.itemId, f.ammunition.id)));
    assert.equal(inventory.quantity, 6);
    for (const operation of ["change-mode", "unload", "load"] as const) {
      const preparation = await startFirearmPreparationInTransaction(tx, f.context, f.actor, { characterId: f.actorId, itemInstanceId: f.instance.id,
        operation, targetFiringModeId: operation === "change-mode" ? f.modes[1].id : undefined,
        partialLoadDisposition: operation === "unload" ? "retain" : undefined,
        requestedRounds: operation === "load" ? 3 : undefined, idempotencyKey: crypto.randomUUID() });
      const [declaration] = await tx.select().from(declarationTable).where(eq(declarationTable.pendingActionId, preparation.pendingActionId!));
      await noDefense(tx, f, declaration.id);
      await complete(tx, f, preparation.pendingActionId!);
    }
    assert.equal((await f.state()).selectedFiringModeId, f.modes[1].id);
    assert.equal((await f.state()).loadedRounds, 3);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.actorId)!.currentInitiative, 8);
    throw rollback;
  }), (error) => error === rollback);
});

test("an aware exact Creature Dodge cancels burst bullet hits, with one defense cost and all fired ammo spent", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "npc", true);
    await tx.update(participant).set({ participationStatus: "holding" }).where(eq(participant.characterId, f.occurrences[0]));
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    const attack = await f.attack(declared.attackId);
    const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, attack.triggerDeclarationId), eq(opportunity.responderCharacterId, f.occurrences[0])));
    assert.ok(window);
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
    const response = { opportunityId: window.id, reactionType: "dodge" as const, protectedTargetCharacterId: f.occurrences[0] };
    const reaction = await declareDefenseInterventionInTransaction(tx, f.context, f.god, response, { method: "entered", enteredTotal: 90 });
    assert.equal(await declareDefenseInterventionInTransaction(tx, f.context, f.god, response), reaction);
    await noDefense(tx, f, attack.triggerDeclarationId);
    await complete(tx, f, attack.triggerPendingActionId!);
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    assert.equal(fired.roundsConsumed, 3);
    const bullets = await tx.select().from(bulletTable).where(eq(bulletTable.attackId, attack.id));
    assert.equal(bullets.length, 3);
    assert.equal(bullets.every(({ status }) => status === "cancelled-by-defense"), true);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.occurrences[0])!.currentInitiative, 21);
    assert.equal((await f.state()).loadedRounds, 0);
    assert.equal((await f.rolls()).length, 2);
    throw rollback;
  }), (error) => error === rollback);
});

for (const interrupted of [false, true]) test(`sustained firing resolves 21,20,19 once from 22; interruption=${interrupted}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "npc");
    const [mode] = await tx.insert(weaponFiringMode).values({ weaponProfileId: f.profile.id, name: "Sustained", normalizedName: "sustained", sortOrder: 2,
      baseCyclingInitiativeCost: 1, baseRecoilResetInitiativeCost: 2, deliveryCadence: "sustained-per-initiative", roundsPerCadence: 2 }).returning();
    await tx.update(stateTable).set({ selectedFiringModeId: mode.id, loadedRounds: 6 }).where(eq(stateTable.itemInstanceId, f.instance.id));
    const command = { ...f.command, firingModeId: mode.id, firingDurationInitiative: 3, roll: { method: "entered" as const, enteredTotal: 90 } };
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, command);
    const attack = await f.attack(declared.attackId);
    await noDefense(tx, f, attack.triggerDeclarationId);
    const starting = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    const timing = starting.pendingActions.find(({ id }) => id === attack.triggerPendingActionId)!;
    assert.equal(timing.originalInitiativeCost, 3);
    assert.equal(timing.expectedCompletionInitiative, 19);
    await assert.rejects(persistInitiativeEngineInTransaction(tx, f.context, starting, advanceInitiativeTimeline(starting, 19)), /one completed Initiative point/);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).runtime.timelineInitiative, 22);
    for (let portion = 1; portion <= (interrupted ? 2 : 3); portion++) {
      const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      assert.equal(getNextInitiativeTimelineEvent(before).initiative, 22 - portion);
      if (portion === 2) {
        await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
        await assert.rejects(persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 20)), /Combat is paused/);
        assert.equal((await f.state()).loadedRounds, 4);
        await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
      }
      await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 22 - portion));
      const receipt = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "entered", enteredTotal: 99 });
      assert.equal(receipt.reused, true);
      assert.equal((await f.state()).loadedRounds, 6 - portion * 2);
      assert.equal((await f.attack(attack.id)).firingPortionsResolved, portion);
      const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
      assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, portion < 3 ? portion * 10 : 25);
      assert.deepEqual((await f.rolls()).map(({ resultTotal }) => resultTotal), [90]);
    }
    if (interrupted) {
      await interruptActionDeclarationInTransaction(tx, f.context, f.god, attack.triggerDeclarationId, "Stop after the second completed portion.");
      for (const resume of [resumeInterruptedActionDeclarationInTransaction, restartInterruptedActionDeclarationInTransaction]) {
        await assert.rejects(resume(tx, f.context, f.god, attack.triggerDeclarationId, "Attempt to reuse the interrupted original."), /Declare a new firing action/);
      }
      assert.equal((await f.attack(attack.id)).status, "cancelled");
      assert.equal((await f.state()).loadedRounds, 2);
      assert.equal((await f.state()).requiresCycling, true);
      assert.equal((await f.state()).requiresRecoilRecovery, true);
      await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
      assert.equal((await f.state()).loadedRounds, 2);
    }
    throw rollback;
  }), (error) => error === rollback);
});

test("a lower-Initiative defense waits for its firing point and cannot cancel already applied bullets", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "npc");
    const [mode] = await tx.insert(weaponFiringMode).values({ weaponProfileId: f.profile.id, name: "Sustained", normalizedName: "sustained", sortOrder: 2,
      baseCyclingInitiativeCost: 1, baseRecoilResetInitiativeCost: 2, deliveryCadence: "sustained-per-initiative", roundsPerCadence: 2 }).returning();
    await tx.update(stateTable).set({ selectedFiringModeId: mode.id, loadedRounds: 6 }).where(eq(stateTable.itemInstanceId, f.instance.id));
    await tx.update(participant).set({ participationStatus: "holding", currentInitiative: 20 }).where(eq(participant.characterId, f.occurrences[0]));
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, firingModeId: mode.id, firingDurationInitiative: 3, roll: { method: "entered", enteredTotal: 90 } });
    const attack = await f.attack(declared.attackId);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 21));
    const at21 = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await assert.rejects(persistInitiativeEngineInTransaction(tx, f.context, at21, advanceInitiativeTimeline(at21, 20)), /responses at this firing point/);
    assert.equal((await f.state()).loadedRounds, 4);
    const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, attack.triggerDeclarationId), eq(opportunity.responderCharacterId, f.occurrences[0])));
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
    await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType: "dodge", protectedTargetCharacterId: f.occurrences[0] }, { method: "entered", enteredTotal: 90 });
    for (const point of [20, 19]) {
      const next = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      await persistInitiativeEngineInTransaction(tx, f.context, next, advanceInitiativeTimeline(next, point));
      const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
      assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, 10);
    }
    const bullets = await tx.select().from(bulletTable).where(eq(bulletTable.attackId, attack.id));
    assert.equal(bullets.filter(({ status }) => status === "cancelled-by-defense").length, 3);
    assert.equal((await f.state()).loadedRounds, 0);
    assert.equal((await f.rolls()).length, 2);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.occurrences[0])!.currentInitiative, 19);
    throw rollback;
  }), (error) => error === rollback);
});

for (const sustained of [false, true]) test(`departure preserves fired ammunition and pending bullet consequences; sustained=${sustained}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "npc");
    let command = f.command;
    if (sustained) {
      const [mode] = await tx.insert(weaponFiringMode).values({ weaponProfileId: f.profile.id, name: "Sustained", normalizedName: "sustained", sortOrder: 2,
        baseCyclingInitiativeCost: 1, baseRecoilResetInitiativeCost: 2, deliveryCadence: "sustained-per-initiative", roundsPerCadence: 2 }).returning();
      await tx.update(stateTable).set({ selectedFiringModeId: mode.id, loadedRounds: 6 }).where(eq(stateTable.itemInstanceId, f.instance.id));
      // Malformed authored protection produces a real pending ruling for the fired
      // portion, instead of fabricating damage or applying it before withdrawal.
      const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
      const body = target.creatureSnapshotJson as { hitLocations: Record<string, unknown>[] };
      await tx.update(occurrence).set({ creatureSnapshotJson: { ...body, hitLocations: body.hitLocations.map((location) => ({ ...location, naturalArmor: "unresolved protection" })) } })
        .where(eq(occurrence.characterId, f.occurrences[0]));
      command = { ...command, firingModeId: mode.id, firingDurationInitiative: 3, roll: { method: "entered", enteredTotal: 90 } };
    }
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, command);
    const attack = await f.attack(declared.attackId);
    await noDefense(tx, f, attack.triggerDeclarationId);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 21));
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    const [plan] = await tx.select().from(planTable).where(eq(planTable.id, fired.effectPlanId!));
    const effectsBefore = await tx.select().from(effectTable).where(eq(effectTable.planId, plan.id));
    const request = { participantId: f.actorId, operation: "withdraw" as const, expectedRevision: 0,
      requestKey: crypto.randomUUID(), reason: "Shooter leaves after the first actual firing point." };
    await changeCombatParticipationInTransaction(tx, f.encounterId, f.god, request);
    await changeCombatParticipationInTransaction(tx, f.encounterId, f.god, request);
    assert.equal((await f.state()).loadedRounds, sustained ? 4 : 2);
    assert.equal((await tx.select().from(planTable).where(eq(planTable.id, plan.id)))[0].status, plan.status);
    assert.deepEqual(await tx.select().from(effectTable).where(eq(effectTable.planId, plan.id)), effectsBefore);
    if (sustained) {
      assert.equal((await f.attack(attack.id)).status, "cancelled");
      assert.equal((await f.attack(attack.id)).firingPortionsResolved, 1);
      assert.equal(plan.status, "requires-god-ruling");
    } else {
      for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.actor, attack.triggerDeclarationId)).status, "applied");
      const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
      assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, 5);
    }
    assert.equal((await f.rolls()).length, 1);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { item, itemPower, itemPowerEffect, itemPowerResource, weaponProfile, weaponFiringMode, weaponSkillPathMapping } from "@/db/item-schema";
import { campaignCharacterItem, campaignCharacterItemInstance, campaignCharacterAttribute, campaignCharacterProfile, campaignCharacterActiveModifier } from "@/db/realm-schema";
import { magazineProfile, magazineAmmunition, weaponMagazine, firearmMagazineAttachment } from "@/db/magazine-schema";
import { readEffectiveFirearmState, validateMagazineSwap } from "@/features/items/firearm-magazine-service";
import { startCombatMagazineFill } from "@/features/tabletop-operations/combat-magazine-fill-service";
import { applyLocalizedDamageInTransaction, readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { campaignCharacterFirearmState as stateTable, campaignSessionEncounterFirearmAttack as attackTable, campaignSessionEncounterFirearmBullet as bulletTable,
  campaignSessionEncounterInitiativeParticipant as participant, campaignSessionEncounterParticipant as occurrence,
  campaignSessionEncounterResponderOpportunity as opportunity, campaignSessionRoll, campaignSessionEncounterActionDeclaration as declarationTable,
  campaignSessionEncounterEffectPlan as planTable, campaignSessionEncounterEffect as effectTable, campaignSessionPeriodicHealthEffect as periodicTable } from "@/db/tabletop-operations-schema";
import { declareFirearmAttackInTransaction, commitFirearmAttackTriggerInTransaction, fireFirearmAttackInTransaction, cancelFirearmAttackInTransaction,
  previewFirearmAttackInTransaction, type DeclareFirearmAttackCommand } from "@/features/tabletop-operations/firearm-attack-service";
import { startFirearmPreparationInTransaction, applyFirearmCatalogConfigurationInTransaction } from "@/features/tabletop-operations/firearm-readiness-service";
import { reconcileResponderOpportunityInTransaction, interruptActionDeclarationInTransaction, resumeInterruptedActionDeclarationInTransaction,
  restartInterruptedActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { changeCombatParticipationInTransaction } from "@/features/tabletop-operations/combat-participation-service";
import { declareDefenseInterventionInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { applyRoutineCombatConsequencesInTransaction, declineActionEffectPlanInTransaction, approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction, declineActionEffectInTransaction, confirmActionEffectRulingInTransaction, resolveManualActionEffectInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline, getNextInitiativeTimelineEvent } from "@/features/tabletop-operations/initiative-runtime";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { getAttributeModifier } from "@/features/characters/character-rules";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { cancelAuthoredActionBindingInTransaction, ruleOnInterruptedReactionInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { closeInitiativeRuntime } from "@/features/tabletop-operations/initiative-runtime";
import { lockEncounterCloseoutContextInTransaction, finalizeEncounterCloseoutInTransaction } from "@/features/tabletop-operations/encounter-closeout-service";
import { createPlayerCombatRulingRequestInTransaction, ruleOnPlayerCombatRequestInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";

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
    rangeText: "", rangeMode: "ranged", distanceUnit: "feet", shortRangeDistance: 10, mediumRangeDistance: 25, longRangeDistance: 50, reloadType: "Single", capacityRounds: 6, readinessMode: "draw-is-ready", drawInitiativeCost: 2, readyInitiativeCost: 1, reloadInitiativeCost: 3, unloadInitiativeCost: 2, firingModeChangeInitiativeCost: 1 }).returning();
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
  let distanceRulingRequestId: number | null = null;
  if (kind === "player") {
    const request = await createPlayerCombatRulingRequestInTransaction(tx, f.context, { userId: f.player.userId, characterId: actorId }, {
      requestType: "weapon-distance", sourceKind: "weapon", sourceRef: `instance:${instance.id}`, sourceInstanceId: instance.id,
      targetParticipantId: f.occurrences[0], intent: "Confirm the measured firearm distance.", requestedTiming: "before firing",
      blockedReason: "The exact Player firearm distance requires a Campaign-owning G.O.D. ruling.",
      frozenRequest: { attackMode: "ranged", distance: 25, unit: "feet", firingModeId: mode.id },
      idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
    });
    await ruleOnPlayerCombatRequestInTransaction(tx, f.context, f.godId, request.requestId, {
      status: "approved", response: "The exact firearm distance is approved.", ruling: { distance: 25, unit: "feet" },
    });
    distanceRulingRequestId = request.requestId;
  }
  const command: DeclareFirearmAttackCommand = { actorParticipantId: actorId, targetParticipantId: f.occurrences[0], itemInstanceId: instance.id, firingModeId: mode.id, rangeDistance: 25, rangeUnit: "feet", distanceRulingRequestId,
    aimInitiative: 0, firingDurationInitiative: 1, calledShot: { declared: false, objective: "", locationNumber: null, penalty: null, reason: "" }, idempotencyKey: crypto.randomUUID(), roll: { method: "entered", enteredTotal: 70 } };
  return { ...f, actor, actorId, command, instance, ammunition, modes, profile,
    state: async () => (await tx.select().from(stateTable).where(eq(stateTable.itemInstanceId, instance.id)))[0],
    attack: async (id: number) => (await tx.select().from(attackTable).where(eq(attackTable.id, id)))[0],
    rolls: () => tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId)) };
}

test("Aim and firing must fit together before a firearm declaration starts", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(participant).set({ currentInitiative: 2 }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.actorId)));
    const before = await f.state();
    await assert.rejects(declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, aimInitiative: 2 }), /costs 3 Initiative; only 2 remains/);
    assert.deepEqual(await f.state(), before);
    assert.equal((await f.rolls()).length, 0);
    assert.equal((await tx.select().from(attackTable).where(eq(attackTable.encounterId, f.encounterId))).length, 0);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).pendingActions.filter((entry) => entry.status === "active").length, 0);
    throw rollback;
  }), (error) => error === rollback);
});

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

test("Player firearm distance approval rejects missing, mismatched, and stale approvals", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await assert.rejects(tx.transaction((savepoint) => declareFirearmAttackInTransaction(savepoint, f.context, f.actor, { ...f.command, distanceRulingRequestId: null })), /distance confirmation/);
    await assert.rejects(tx.transaction((savepoint) => declareFirearmAttackInTransaction(savepoint, f.context, f.actor, { ...f.command, rangeDistance: 75 })), /does not match this exact target, Weapon, mode, distance, or unit/);
    await tx.update(weaponProfile).set({ longRangeDistance: 60 }).where(eq(weaponProfile.id, f.profile.id));
    await assert.rejects(tx.transaction((savepoint) => declareFirearmAttackInTransaction(savepoint, f.context, f.actor, f.command)), /range limits changed after approval/);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

for (const weaponType of ["Bow", "Crossbow"]) for (const calledShot of [false, true]) test(`${weaponType}: Aim, release cost, firearm damage and exact ammunition on retry; called=${calledShot}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "npc");
    await tx.update(weaponProfile).set({ weaponType, capacityRounds: 1, reloadInitiativeCost: 3 }).where(eq(weaponProfile.id, f.profile.id));
    await tx.update(weaponFiringMode).set({ baseCyclingInitiativeCost: null, baseRecoilResetInitiativeCost: null, deliveryCadence: null, roundsPerCadence: null, mechanicsReviewRequired: true }).where(eq(weaponFiringMode.id, f.command.firingModeId));
    await tx.update(stateTable).set({ capacityRounds: 1, loadedRounds: 1, readied: false, readinessMode: null, readinessModeSource: null }).where(eq(stateTable.itemInstanceId, f.instance.id));
    await tx.update(campaignCharacterAttribute).set({ value: 80 }).where(and(eq(campaignCharacterAttribute.characterId, f.actorId), eq(campaignCharacterAttribute.attributeKey, "DEX")));
    const command = { ...f.command, aimInitiative: 2, calledShot: calledShot
      ? { declared: true, objective: "Body", locationNumber: 0, penalty: 4, reason: "Exact projectile Called Shot ruling." } : f.command.calledShot };
    const unaimed = await previewFirearmAttackInTransaction(tx, f.context, f.actor, { ...command, aimInitiative: 0 });
    const preview = await previewFirearmAttackInTransaction(tx, f.context, f.actor, command);
    assert.equal(preview.finalTarget, unaimed.finalTarget - 4);
    assert.equal(preview.timing.firingInitiativeCost, weaponType === "Bow" ? 3 : 1);
    assert.equal(preview.delivery.declaredRounds, 1);
    assert.equal(preview.firearm.effectiveCyclingInitiativeCost, 0);
    assert.equal(preview.firearm.effectiveRecoilResetInitiativeCost, 0);
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, command);
    const aim = await f.attack(declared.attackId);
    assert.equal((await f.rolls()).length, 0);
    await noDefense(tx, f, aim.aimDeclarationId!); await complete(tx, f, aim.aimPendingActionId!);
    const pending = await commitFirearmAttackTriggerInTransaction(tx, f.context, f.actor, aim.id, f.command.roll);
    await noDefense(tx, f, aim.triggerDeclarationId); await complete(tx, f, pending);
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, aim.id, { method: "random" });
    assert.equal((await fireFirearmAttackInTransaction(tx, f.context, f.actor, aim.id, { method: "random" })).rollId, fired.rollId);
    const [bullet] = await tx.select().from(bulletTable).where(eq(bulletTable.attackId, aim.id));
    assert.equal(bullet.dexDamageModifier, calledShot ? getAttributeModifier(80) : 0);
    assert.equal(bullet.additionalSuccessDamage, calledShot ? 5 : 0);
    assert.equal(bullet.grossDamage, 8 + (calledShot ? getAttributeModifier(80) + 5 : 0));
    assert.equal((await f.state()).loadedRounds, 0);
    assert.equal((await f.state()).requiresCycling, false);
    assert.equal((await f.state()).requiresRecoilRecovery, false);
    assert.equal((await f.rolls()).length, 1);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

for (const weaponType of ["Bow", "Crossbow"]) test(`${weaponType} loading charges the correct cost before the separate shot`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(weaponProfile).set({ weaponType, capacityRounds: 1, reloadInitiativeCost: 4 }).where(eq(weaponProfile.id, f.profile.id));
    await tx.update(stateTable).set({ capacityRounds: 1, loadedRounds: 0, loadedAmmunitionItemId: null, loadedAmmunitionProfileId: null, loadedAmmunitionUnitCostCredits: null }).where(eq(stateTable.itemInstanceId, f.instance.id));
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    const load = { characterId: f.actorId, itemInstanceId: f.instance.id, operation: "reload" as const, requestedRounds: 1, idempotencyKey: crypto.randomUUID() };
    const started = await startFirearmPreparationInTransaction(tx, f.context, f.actor, load);
    if (weaponType === "Bow") {
      assert.equal(started.pendingActionId, null);
      assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).runtime.timelineInitiative, before.runtime.timelineInitiative);
    } else {
      assert.equal((await f.state()).loadedRounds, 0);
      const pending = (await loadInitiativeEngineInTransaction(tx, f.encounterId)).pendingActions.find((entry) => entry.id === started.pendingActionId)!;
      assert.equal(pending.originalInitiativeCost, 4);
      const [declaration] = await tx.select().from(declarationTable).where(eq(declarationTable.pendingActionId, started.pendingActionId!));
      await noDefense(tx, f, declaration.id); await complete(tx, f, started.pendingActionId!);
    }
    assert.equal((await startFirearmPreparationInTransaction(tx, f.context, f.actor, load)).reused, true);
    assert.equal((await f.state()).loadedRounds, 1);
    const [stock] = await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.actorId), eq(campaignCharacterItem.itemId, f.ammunition.id)));
    assert.equal(stock.quantity, 8);
    assert.equal((await f.rolls()).length, 0);
    assert.equal((await previewFirearmAttackInTransaction(tx, f.context, f.actor, f.command)).timing.firingInitiativeCost, weaponType === "Bow" ? 4 : 1);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

for (const sustained of [false, true]) test(`injured two-handed ${sustained ? "sustained" : "single"} fire doubles time without doubling ammunition`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.insert(campaignCharacterAttribute).values({ characterId: f.actorId, attributeKey: "CON", value: 50 });
    await tx.update(weaponProfile).set({ handedness: "Two-Handed" }).where(eq(weaponProfile.id, f.profile.id));
    const arm = (await readActiveHealthInTransaction(tx, f.actorId, "race")).anatomy.pools.find((entry) => entry.key === "leftArm")!;
    await applyLocalizedDamageInTransaction(tx, { characterId: f.actorId, poolKey: arm.key, amount: arm.maximumHp! }, "race");
    if (sustained) await tx.update(weaponFiringMode).set({ deliveryCadence: "sustained-per-initiative" }).where(eq(weaponFiringMode.id, f.command.firingModeId));
    const command = { ...f.command, firingDurationInitiative: sustained ? 2 : 1 };
    const preview = await previewFirearmAttackInTransaction(tx, f.context, f.actor, { ...command, aimInitiative: 1 });
    assert.equal(preview.timing.aimInitiativeCost, 2);
    assert.equal(preview.aim.targetOffset, 2);
    assert.equal(preview.timing.firingInitiativeCost, sustained ? 4 : 2);
    assert.equal(preview.delivery.declaredRounds, sustained ? 2 : 1);
    await tx.update(participant).set({ currentInitiative: 1 }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.actorId)));
    await assert.rejects(declareFirearmAttackInTransaction(tx, f.context, f.actor, command), /only 1 remains/);
    assert.equal((await f.rolls()).length, 0);
    const timeline = (await loadInitiativeEngineInTransaction(tx, f.encounterId)).runtime.timelineInitiative;
    await tx.update(participant).set({ currentInitiative: timeline }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.actorId)));
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, command), attack = await f.attack(declared.attackId);
    await noDefense(tx, f, attack.triggerDeclarationId);
    for (let spent = 1; spent <= (sustained ? 4 : 2); spent++) {
      const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, timeline - spent));
      if (sustained) assert.equal((await f.state()).loadedRounds, 3 - Math.floor(spent / 2));
      else if (spent === 1) await assert.rejects(fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" }), /must finish/);
    }
    if (!sustained) await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    assert.equal((await f.state()).loadedRounds, sustained ? 1 : 2);
    assert.equal((await f.rolls()).length, 1);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

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

for (const depleteAfterPlan of [false, true]) test(`firearm damage keeps frozen active bonuses and skips depleted optional riders; late=${depleteAfterPlan}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    const [modifier] = await tx.insert(campaignCharacterActiveModifier).values({ characterId: f.actorId, label: "Damage bonus", modifierChannel: "damage", targetKey: "self", amount: 3,
      sourceKind: "god", sourceId: "fixture", sourceName: "Fixture", durationKind: "scene", durationLabel: "Scene" }).returning();
    await tx.update(campaignCharacterItemInstance).set({ currentCharges: depleteAfterPlan ? 2 : 1 }).where(eq(campaignCharacterItemInstance.id, f.instance.id));
    await tx.insert(itemPowerResource).values({ itemId: f.profile.itemId, maximumCharges: 2 });
    const [power] = await tx.insert(itemPower).values({ itemId: f.profile.itemId, name: "Optional shot", description: "Optional depleted rider", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 2, resolutionMode: "weapon-hit", sortOrder: 0 }).returning();
    await tx.insert(itemPowerEffect).values([
      { itemPowerId: power.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 10, application: "localized" } },
      { itemPowerId: power.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Must skip", description: "Depleted rider", duration: { kind: "scene" } } },
    ]);
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    const attack = await f.attack(declared.attackId);
    await tx.update(campaignCharacterActiveModifier).set({ amount: 20 }).where(eq(campaignCharacterActiveModifier.id, modifier.id));
    await noDefense(tx, f, attack.triggerDeclarationId);
    await complete(tx, f, attack.triggerPendingActionId!);
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    if (depleteAfterPlan) await tx.update(campaignCharacterItemInstance).set({ currentCharges: 1 }).where(eq(campaignCharacterItemInstance.id, f.instance.id));
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.actor, attack.triggerDeclarationId, fired.effectPlanId!)).status, "applied");
    const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
    const local = target.localStateJson as { health: { totalDamage: number }; conditions: { name: string }[] };
    assert.equal(local.health.totalDamage, 8, "8 ammo + 3 frozen general modifier - 3 protection; no ordinary DEX or depleted rider.");
    assert.equal(local.conditions.some(({ name }) => name === "Must skip"), false);
    assert.equal((await f.state()).loadedRounds, 2);
    assert.equal((await f.rolls()).length, 1);
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, f.instance.id)))[0].currentCharges, 1);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("firearm single-bullet Weapon-Hit damage merges once while periodic and non-additive riders persist", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(campaignCharacterItemInstance).set({ currentCharges: 5 }).where(eq(campaignCharacterItemInstance.id, f.instance.id));
    await tx.insert(itemPowerResource).values({ itemId: f.profile.itemId, maximumCharges: 5 });
    const [damagePower] = await tx.insert(itemPower).values({ itemId: f.profile.itemId, name: "Charged Shot", description: "Single-bullet Weapon-Hit fixture", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 1, resolutionMode: "weapon-hit", sortOrder: 0 }).returning();
    const [riderPower] = await tx.insert(itemPower).values({ itemId: f.profile.itemId, name: "Marked Shot", description: "Second single-bullet Weapon-Hit fixture", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 2, resolutionMode: "weapon-hit", sortOrder: 1 }).returning();
    await tx.insert(itemPowerEffect).values([
      { itemPowerId: damagePower.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 2, application: "localized" } },
      { itemPowerId: damagePower.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 3, application: "localized", timing: { mode: "over-time", frequency: "combat-steps", applications: 2, firstApplication: "next-interval" } } },
      { itemPowerId: damagePower.id, sortOrder: 2, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Charged Mark", description: "Single-bullet Weapon-Hit condition", duration: { kind: "scene" } } },
      { itemPowerId: riderPower.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "modifier.apply", label: "Marked Shot", channel: "initiative", targetKey: "self", amount: -1, duration: { kind: "scene" } } },
    ]);
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    const attack = await f.attack(declared.attackId);
    await noDefense(tx, f, attack.triggerDeclarationId);
    await complete(tx, f, attack.triggerPendingActionId!);
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    const planId = fired.effectPlanId!;
    const [storedBullet] = await tx.select().from(bulletTable).where(and(eq(bulletTable.attackId, attack.id), eq(bulletTable.bulletIndex, 1)));
    assert.deepEqual({ grossDamage: storedBullet.grossDamage, proposedNetDamage: storedBullet.proposedNetDamage }, { grossDamage: 8, proposedNetDamage: 5 });
    const [storedPlan] = await tx.select().from(planTable).where(eq(planTable.id, planId));
    const source = storedPlan.sourceSnapshotJson as { resourceCosts: unknown[]; authoredData: { itemPowerItemId: number; itemPowerResourceSource: boolean } };
    assert.deepEqual(source.resourceCosts, []);
    assert.equal(source.authoredData.itemPowerItemId, f.profile.itemId);
    assert.equal(source.authoredData.itemPowerResourceSource, true);
    const beforeApply = await tx.select().from(effectTable).where(eq(effectTable.planId, planId));
    const bulletEffect = beforeApply.find(({ effectKey }) => effectKey === "firearm-bullet:1");
    assert.ok(bulletEffect);
    const bulletAuthored = bulletEffect.authoredValueJson as { baseGrossDamage: number; grossDamage: number; weaponHitAdditiveDamage: number; proposedNetDamage: number };
    const bulletFinal = bulletEffect.finalValueJson as { effect: { amount: number } };
    assert.deepEqual({ baseGrossDamage: bulletAuthored.baseGrossDamage, grossDamage: bulletAuthored.grossDamage, additive: bulletAuthored.weaponHitAdditiveDamage, net: bulletAuthored.proposedNetDamage, applied: bulletFinal.effect.amount },
      { baseGrossDamage: 8, grossDamage: 10, additive: 2, net: 7, applied: 7 });
    assert.equal(beforeApply.filter(({ effectKey }) => effectKey.startsWith(`weapon-hit:${damagePower.id}:bullet:1:effect:`)).length, 2, "Only the non-additive single-bullet effects remain as separate rows.");
    assert.equal(beforeApply.filter(({ effectType }) => effectType === "resource.item-charges").length, 2);
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.actor, attack.triggerDeclarationId, planId)).status, "applied");
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, f.instance.id)))[0].currentCharges, 2);
    const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
    const targetState = target.localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> }; conditions: Array<{ name: string }>; modifiers: Array<{ label: string }> };
    assert.deepEqual(targetState.health, { totalDamage: 7, poolDamage: { "fixture-body": 7 } });
    assert.equal(targetState.conditions.some(({ name }) => name === "Charged Mark"), true);
    assert.equal(targetState.modifiers.some(({ label }) => label === "Marked Shot"), true);
    const periodic = await tx.select().from(periodicTable).where(and(eq(periodicTable.encounterId, f.encounterId), eq(periodicTable.characterId, f.occurrences[0])));
    assert.equal(periodic.length, 1);
    assert.equal(periodic[0].remainingApplications, 2);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("firearm multi-bullet Weapon-Hit allocation merges additive damage and applies each rider and Charge once", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player", true);
    await tx.update(campaignCharacterItemInstance).set({ currentCharges: 5 }).where(eq(campaignCharacterItemInstance.id, f.instance.id));
    await tx.insert(itemPowerResource).values({ itemId: f.profile.itemId, maximumCharges: 5 });
    const [firstPower] = await tx.insert(itemPower).values({ itemId: f.profile.itemId, name: "Burst Edge", description: "First burst Weapon-Hit fixture", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 1, resolutionMode: "weapon-hit", sortOrder: 0 }).returning();
    const [secondPower] = await tx.insert(itemPower).values({ itemId: f.profile.itemId, name: "Burst Mark", description: "Second burst Weapon-Hit fixture", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 2, resolutionMode: "weapon-hit", sortOrder: 1 }).returning();
    await tx.insert(itemPowerEffect).values([
      { itemPowerId: firstPower.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 2, application: "localized" } },
      { itemPowerId: firstPower.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Burst Mark", description: "First burst rider", duration: { kind: "scene" } } },
      { itemPowerId: secondPower.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 1, application: "localized" } },
      { itemPowerId: secondPower.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "modifier.apply", label: "Burst Slow", channel: "initiative", targetKey: "self", amount: -1, duration: { kind: "scene" } } },
    ]);
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    const attack = await f.attack(declared.attackId);
    await noDefense(tx, f, attack.triggerDeclarationId);
    await complete(tx, f, attack.triggerPendingActionId!);
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    const planId = fired.effectPlanId!;
    const sourcePlan = (await tx.select().from(planTable).where(eq(planTable.id, planId)))[0].sourceSnapshotJson as { resourceCosts: unknown[]; authoredData: { itemPowerResourceSource: boolean } };
    assert.deepEqual(sourcePlan.resourceCosts, []);
    assert.equal(sourcePlan.authoredData.itemPowerResourceSource, true);
    let rows = await tx.select().from(effectTable).where(eq(effectTable.planId, planId));
    const boundaries = rows.filter(({ effectType, effectKey }) => effectType === "manual" && effectKey.startsWith("weapon-hit-allocation:"));
    assert.equal(boundaries.length, 2);
    const selected = JSON.stringify({ bulletIndices: [1, 2] });
    for (const boundary of boundaries) await resolveManualActionEffectInTransaction(tx, f.context, f.god, planId, boundary.id, selected, "The first two successful bullets carry this Power.");
    rows = await tx.select().from(effectTable).where(eq(effectTable.planId, planId));
    const authored = (row: typeof rows[number]) => row.authoredValueJson as { powerId?: number; bulletIndex?: number; allocationRole?: string };
    const candidates = (powerId: number, role: string) => rows.filter((row) => authored(row).powerId === powerId && authored(row).allocationRole === role);
    for (const powerId of [firstPower.id, secondPower.id]) {
      for (const row of candidates(powerId, "additive-damage")) assert.equal(row.status, [1, 2].includes(authored(row).bulletIndex!) ? "manual-resolved" : "declined");
      for (const row of candidates(powerId, "rider")) assert.equal(row.status, authored(row).bulletIndex === 1 ? "approved" : "declined");
      for (const row of candidates(powerId, "resource")) assert.equal(row.status, authored(row).bulletIndex === 1 ? "approved" : "declined");
    }
    for (const bulletIndex of [1, 2, 3]) {
      const bullet = rows.find(({ effectKey }) => effectKey === `firearm-bullet:${bulletIndex}`)!;
      const final = bullet.finalValueJson as { effect: { amount: number } };
      assert.equal(final.effect.amount, bulletIndex === 3 ? 5 : 8);
    }
    await approveActionEffectPlanInTransaction(tx, f.context, f.god, planId, "The first two successful bullets receive the selected Weapon-Hit Powers.");
    for (let retry = 0; retry < 2; retry++) assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, planId), "applied");
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, f.instance.id)))[0].currentCharges, 2);
    const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
    const targetState = target.localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> }; conditions: Array<{ name: string }>; modifiers: Array<{ label: string }> };
    assert.deepEqual(targetState.health, { totalDamage: 21, poolDamage: { "fixture-body": 21 } });
    assert.equal(targetState.conditions.filter(({ name }) => name === "Burst Mark").length, 1);
    assert.equal(targetState.modifiers.filter(({ label }) => label === "Burst Slow").length, 1);
    rows = await tx.select().from(effectTable).where(eq(effectTable.planId, planId));
    for (const powerId of [firstPower.id, secondPower.id]) {
      assert.equal(candidates(powerId, "rider").filter((row) => row.status === "applied").length, 1);
      assert.equal(candidates(powerId, "resource").filter((row) => row.status === "applied").length, 1);
      assert.equal(candidates(powerId, "rider").filter((row) => row.status === "declined").length, 2);
      assert.equal(candidates(powerId, "resource").filter((row) => row.status === "declined").length, 2);
    }
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

test("drawing and Single loading need no Ready action and do not bypass cycling or recoil", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(campaignCharacterItemInstance).set({ equipmentState: "inactive" }).where(eq(campaignCharacterItemInstance.id, f.instance.id));
    await tx.update(weaponProfile).set({ reloadInitiativeCost: 1, readinessMode: "separate-ready-action" }).where(eq(weaponProfile.id, f.profile.id));
    await tx.update(stateTable).set({ readied: false, readinessMode: "separate-ready-action", requiresCycling: true, requiresRecoilRecovery: true }).where(eq(stateTable.itemInstanceId, f.instance.id));
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
    assert.equal(state.readied, false, "Legacy readiness is not rewritten or required");
    assert.equal(state.loadedRounds, 6);
    assert.equal(state.requiresCycling, false);
    await assert.rejects(startFirearmPreparationInTransaction(tx, f.context, f.actor, { characterId: f.actorId, itemInstanceId: f.instance.id, operation: "cycle", idempotencyKey: crypto.randomUUID() }), /does not currently require cycling/);
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

test("Single reload checks the full cost and retains each completed insertion through interruption", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    const command = { characterId: f.actorId, itemInstanceId: f.instance.id, operation: "reload" as const, requestedRounds: 3, idempotencyKey: crypto.randomUUID() };
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId), timeline = before.runtime.timelineInitiative;
    await tx.update(participant).set({ currentInitiative: 8 }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.actorId)));
    await assert.rejects(startFirearmPreparationInTransaction(tx, f.context, f.actor, command), /costs 9 Initiative; only 8 remains/);
    assert.equal((await f.state()).loadedRounds, 3);
    await tx.update(participant).set({ currentInitiative: timeline }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.actorId)));
    const started = await startFirearmPreparationInTransaction(tx, f.context, f.actor, command);
    const [declaration] = await tx.select().from(declarationTable).where(eq(declarationTable.pendingActionId, started.pendingActionId!));
    await noDefense(tx, f, declaration.id);
    for (const spent of [2, 3, 4]) {
      const current = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      await persistInitiativeEngineInTransaction(tx, f.context, current, advanceInitiativeTimeline(current, timeline - spent));
      assert.equal((await f.state()).loadedRounds, 3 + Math.floor(spent / 3));
    }
    await interruptActionDeclarationInTransaction(tx, f.context, f.god, declaration.id, "Interrupted during the second insertion.");
    assert.equal((await f.state()).loadedRounds, 4);
    assert.equal((await startFirearmPreparationInTransaction(tx, f.context, f.actor, command)).reused, true);
    const [inventory] = await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.actorId), eq(campaignCharacterItem.itemId, f.ammunition.id)));
    assert.equal(inventory.quantity, 8);
    assert.equal((await f.rolls()).length, 0);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("an ammunition relationship does not authorize an unsupported projectile or ammunition-free attack", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(weaponProfile).set({ weaponType: "Sling" }).where(eq(weaponProfile.id, f.profile.id));
    await assert.rejects(previewFirearmAttackInTransaction(tx, f.context, f.actor, f.command), /no supported ammunition/);
    await assert.rejects(startFirearmPreparationInTransaction(tx, f.context, f.actor, { characterId: f.actorId, itemInstanceId: f.instance.id, operation: "reload", requestedRounds: 1, idempotencyKey: crypto.randomUUID() }), /no supported ammunition/);
    const { previewCombatChoiceInTransaction } = await import("@/features/combat-screen/choice-service");
    await assert.rejects(previewCombatChoiceInTransaction(tx, f.context, f.actor, { participantId: f.actorId, targetIds: [f.occurrences[0]],
      source: { kind: "weapon", ref: `instance:${f.instance.id}`, instanceId: f.instance.id, itemId: f.instance.itemId, name: "Sling", description: "" } }), /no supported combat ammunition workflow/);
    assert.equal((await f.state()).loadedRounds, 3);
    assert.equal((await f.rolls()).length, 0);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

for (const weaponType of ["Handgun", "Crossbow"]) for (const interrupted of [false, true]) test(`${weaponType} physical magazine swap preserves copy contents and becomes usable only on completion; interrupted=${interrupted}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(weaponProfile).set({ weaponType, reloadType: "Magazine", readinessMode: null, readyInitiativeCost: null }).where(eq(weaponProfile.id, f.profile.id));
    await tx.update(stateTable).set({ readied: false, readinessMode: null, readinessModeSource: null }).where(eq(stateTable.itemInstanceId, f.instance.id));
    const [model] = await tx.insert(item).values({ canonicalId: `MAG-${crypto.randomUUID()}`.toUpperCase(), name: "Extended Magazine", catalogScope: "equipment", equipmentGroup: "general", recordType: "Magazine", family: "Fixture", category: "Magazine", priceBasis: "unit", createdByUserId: f.godId }).returning();
    await tx.insert(magazineProfile).values({ itemId: model.id, capacityRounds: 8, fillInitiativeCostPerRound: 2 });
    await tx.insert(magazineAmmunition).values({ magazineItemId: model.id, ammunitionItemId: f.ammunition.id });
    await tx.insert(weaponMagazine).values({ weaponProfileId: f.profile.id, magazineItemId: model.id });
    const magazines = await tx.insert(campaignCharacterItemInstance).values([6, 2].map((rounds) => ({ characterId: f.actorId, itemId: model.id, currentCharges: 0,
      loadedAmmunitionItemId: f.ammunition.id, loadedRounds: rounds, loadedAmmunitionUnitCostCredits: 2, unitCostCredits: 10 }))).returning();
    const command = { characterId: f.actorId, itemInstanceId: f.instance.id, operation: "reload" as const, magazineInstanceId: magazines[0].id, idempotencyKey: crypto.randomUUID() };
    await assert.rejects(startFirearmPreparationInTransaction(tx, f.context, f.actor, command), /Unload the existing internal rounds/);
    const unload = await startFirearmPreparationInTransaction(tx, f.context, f.actor, { characterId: f.actorId, itemInstanceId: f.instance.id, operation: "unload", partialLoadDisposition: "retain", idempotencyKey: crypto.randomUUID() });
    const [unloadDeclaration] = await tx.select().from(declarationTable).where(eq(declarationTable.pendingActionId, unload.pendingActionId!));
    await noDefense(tx, f, unloadDeclaration.id); await complete(tx, f, unload.pendingActionId!);
    const started = await startFirearmPreparationInTransaction(tx, f.context, f.actor, command);
    const [declaration] = await tx.select().from(declarationTable).where(eq(declarationTable.pendingActionId, started.pendingActionId!));
    await noDefense(tx, f, declaration.id);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, before.runtime.timelineInitiative - 1));
    assert.equal((await tx.select().from(firearmMagazineAttachment).where(eq(firearmMagazineAttachment.weaponInstanceId, f.instance.id))).length, 0);
    assert.equal((await readEffectiveFirearmState(tx, await f.state())).loadedRounds, 0);
    if (interrupted) {
      await interruptActionDeclarationInTransaction(tx, f.context, f.god, declaration.id, "Stop the incomplete magazine swap.");
      assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, magazines[0].id)))[0].loadedRounds, 6);
    } else {
      await complete(tx, f, started.pendingActionId!);
      assert.equal((await startFirearmPreparationInTransaction(tx, f.context, f.actor, command)).reused, true);
      const ready = await previewFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
      assert.equal(ready.firearm.roundsLoaded, 6); assert.equal(ready.firearm.capacityRounds, 8);
      assert.equal((await f.state()).loadedRounds, 0, "The weapon stores no second copy of magazine rounds.");
      await assert.rejects(validateMagazineSwap(tx, await f.state(), magazines[0].id), /already attached/);
      const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, aimInitiative: weaponType === "Crossbow" ? 1 : 0 });
      let attack = await f.attack(declared.attackId);
      if (attack.aimPendingActionId) {
        await noDefense(tx, f, attack.aimDeclarationId!); await complete(tx, f, attack.aimPendingActionId);
        await commitFirearmAttackTriggerInTransaction(tx, f.context, f.actor, attack.id, f.command.roll);
        attack = await f.attack(attack.id);
      }
      await noDefense(tx, f, attack.triggerDeclarationId); await complete(tx, f, attack.triggerPendingActionId!);
      await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
      await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
      await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.actor, attack.triggerDeclarationId);
      const swap = await startFirearmPreparationInTransaction(tx, f.context, f.actor, { ...command, magazineInstanceId: magazines[1].id, idempotencyKey: crypto.randomUUID() });
      const [swapDeclaration] = await tx.select().from(declarationTable).where(eq(declarationTable.pendingActionId, swap.pendingActionId!));
      await noDefense(tx, f, swapDeclaration.id); await complete(tx, f, swap.pendingActionId!);
      assert.equal((await readEffectiveFirearmState(tx, await f.state())).loadedRounds, 2);
      assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, magazines[0].id)))[0].loadedRounds, 5);
      assert.equal((await f.rolls()).length, 1);
    }
    const [loose] = await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.actorId), eq(campaignCharacterItem.itemId, f.ammunition.id)));
    assert.equal(loose.quantity, 12, "Only the explicit initial unload returns rounds to loose inventory.");
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("a 500-round belt can fires through combat without clamping to the weapon's 100-round default or consuming twice", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(weaponProfile).set({ reloadType: "Magazine", capacityRounds: 100 }).where(eq(weaponProfile.id, f.profile.id));
    await tx.update(stateTable).set({ capacityRounds: 100, loadedRounds: 0, loadedAmmunitionItemId: null, loadedAmmunitionProfileId: null, loadedAmmunitionUnitCostCredits: null }).where(eq(stateTable.itemInstanceId, f.instance.id));
    const [model] = await tx.insert(item).values({ canonicalId: `BELT-${crypto.randomUUID()}`.toUpperCase(), name: "500-round Belt Can", catalogScope: "inventory", recordType: "Magazine", family: "Fixture", category: "Magazine", priceBasis: "unit", createdByUserId: f.godId }).returning();
    await tx.insert(magazineProfile).values({ itemId: model.id, capacityRounds: 500 });
    await tx.insert(magazineAmmunition).values({ magazineItemId: model.id, ammunitionItemId: f.ammunition.id });
    await tx.insert(weaponMagazine).values({ weaponProfileId: f.profile.id, magazineItemId: model.id });
    const [can] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.actorId, itemId: model.id, currentCharges: 0, loadedAmmunitionItemId: f.ammunition.id, loadedRounds: 500, loadedAmmunitionUnitCostCredits: 2, unitCostCredits: 10 }).returning();
    await tx.insert(firearmMagazineAttachment).values({ weaponInstanceId: f.instance.id, magazineInstanceId: can.id, characterId: f.actorId, campaignId: f.campaignId, weaponItemId: f.profile.itemId, weaponProfileId: f.profile.id, magazineItemId: model.id });
    const preview = await previewFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    assert.equal(preview.firearm.roundsLoaded, 500); assert.equal(preview.firearm.capacityRounds, 500);
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    const attack = await f.attack(declared.attackId);
    await noDefense(tx, f, attack.triggerDeclarationId); await complete(tx, f, attack.triggerPendingActionId!);
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    assert.equal((await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" })).rollId, fired.rollId);
    const effective = await readEffectiveFirearmState(tx, await f.state());
    assert.equal(effective.loadedRounds, 499); assert.equal(effective.capacityRounds, 500);
    assert.equal((await f.state()).loadedRounds, 0); assert.equal((await f.state()).capacityRounds, 100);
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, can.id)))[0].loadedRounds, 499);
    assert.equal((await f.rolls()).length, 1);
    assert.equal((await tx.select().from(bulletTable).where(eq(bulletTable.attackId, attack.id))).length, 1);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("zero-cost filling preserves ordinary choice and cannot bypass a busy actor", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "npc");
    const [model] = await tx.insert(item).values({ canonicalId: `ZERO-MAG-${crypto.randomUUID()}`.toUpperCase(), name: "Zero Fill Magazine", catalogScope: "equipment", equipmentGroup: "general", recordType: "Magazine", family: "Fixture", category: "Magazine", priceBasis: "unit", createdByUserId: f.godId }).returning();
    await tx.insert(magazineProfile).values({ itemId: model.id, capacityRounds: 6, fillInitiativeCostPerRound: 0 });
    await tx.insert(magazineAmmunition).values({ magazineItemId: model.id, ammunitionItemId: f.ammunition.id });
    const [magazine] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.actorId, itemId: model.id, currentCharges: 0, unitCostCredits: 10 }).returning();
    const command = { characterId: f.actorId, instanceId: magazine.id, ammunitionItemId: f.ammunition.id, rounds: 1, requestKey: crypto.randomUUID() };
    await tx.update(participant).set({ participationStatus: "holding" }).where(eq(participant.characterId, f.actorId));
    await assert.rejects(startCombatMagazineFill(tx, f.context, f.actor, command), /ordinary Initiative opportunity/);
    await tx.update(participant).set({ participationStatus: "active" }).where(eq(participant.characterId, f.actorId));
    assert.equal((await startCombatMagazineFill(tx, f.context, f.actor, command)).status, "completed");
    assert.equal((await startCombatMagazineFill(tx, f.context, f.actor, command)).roundsCompleted, 1);
    await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    await assert.rejects(startCombatMagazineFill(tx, f.context, f.actor, { ...command, requestKey: crypto.randomUUID() }), /unfinished action/);
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, magazine.id)))[0].loadedRounds, 1);
    assert.equal((await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.actorId), eq(campaignCharacterItem.itemId, f.ammunition.id))))[0].quantity, 8);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

for (const interrupted of [false, true]) test(`detached magazine filling uses an authored cost per round and preserves completed rounds; interrupted=${interrupted}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "npc");
    const [model] = await tx.insert(item).values({ canonicalId: `FILL-MAG-${crypto.randomUUID()}`.toUpperCase(), name: "Fill Magazine", catalogScope: "equipment", equipmentGroup: "general", recordType: "Magazine", family: "Fixture", category: "Magazine", priceBasis: "unit", createdByUserId: f.godId }).returning();
    await tx.insert(magazineProfile).values({ itemId: model.id, capacityRounds: 6 });
    await tx.insert(magazineAmmunition).values({ magazineItemId: model.id, ammunitionItemId: f.ammunition.id });
    const [magazine] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.actorId, itemId: model.id, currentCharges: 0, unitCostCredits: 10 }).returning();
    const command = { characterId: f.actorId, instanceId: magazine.id, ammunitionItemId: f.ammunition.id, rounds: 3, requestKey: crypto.randomUUID() };
    await assert.rejects(startCombatMagazineFill(tx, f.context, f.actor, command), /Set Fill Initiative per Round/);
    await tx.update(magazineProfile).set({ fillInitiativeCostPerRound: 2 }).where(eq(magazineProfile.itemId, model.id));
    await tx.update(participant).set({ currentInitiative: 5 }).where(eq(participant.characterId, f.actorId));
    await assert.rejects(startCombatMagazineFill(tx, f.context, f.actor, command), /6 Initiative/);
    await tx.update(participant).set({ currentInitiative: 22 }).where(eq(participant.characterId, f.actorId));
    const started = await startCombatMagazineFill(tx, f.context, f.actor, command);
    assert.equal((await startCombatMagazineFill(tx, f.context, f.actor, command)).pendingActionId, started.pendingActionId);
    await noDefense(tx, f, started.declarationId!);
    const initial = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(initial.pendingActions.find((entry) => entry.id === started.pendingActionId)!.originalInitiativeCost, 6);
    for (const spent of [1, 2, 3]) {
      const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, initial.runtime.timelineInitiative - spent));
      assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, magazine.id)))[0].loadedRounds, Math.floor(spent / 2));
    }
    if (interrupted) await interruptActionDeclarationInTransaction(tx, f.context, f.god, started.declarationId!, "Interrupted midway through the next magazine insertion.");
    else await complete(tx, f, started.pendingActionId!);
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, magazine.id)))[0].loadedRounds, interrupted ? 1 : 3);
    const receipt = await startCombatMagazineFill(tx, f.context, f.actor, command);
    assert.equal(receipt.roundsCompleted, interrupted ? 1 : 3);
    assert.equal(receipt.status, interrupted ? "interrupted" : "completed");
    if (!interrupted) assert.equal((await tx.select().from(declarationTable).where(eq(declarationTable.id, started.declarationId!)))[0].status, "resolved");
    const [stock] = await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.actorId), eq(campaignCharacterItem.itemId, f.ammunition.id)));
    assert.equal(stock.quantity, interrupted ? 8 : 6);
    assert.equal((await f.rolls()).length, 0);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
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

test("a free Creature may move at a sustained-fire crossing before the pending portion resolves", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "npc"), mover = f.occurrences[0];
    await tx.update(occurrence).set({ creatureSnapshotJson: { ...f.creatureSnapshot, movement: [{ movementMode: "Land", movementValue: 2 }] } }).where(eq(occurrence.characterId, mover));
    const [mode] = await tx.insert(weaponFiringMode).values({ weaponProfileId: f.profile.id, name: "Sustained", normalizedName: "sustained", sortOrder: 2,
      baseCyclingInitiativeCost: 1, baseRecoilResetInitiativeCost: 2, deliveryCadence: "sustained-per-initiative", roundsPerCadence: 2 }).returning();
    await tx.update(stateTable).set({ selectedFiringModeId: mode.id, loadedRounds: 6 }).where(eq(stateTable.itemInstanceId, f.instance.id));
    await tx.update(participant).set({ participationStatus: "active", currentInitiative: 21 }).where(eq(participant.characterId, mover));
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, firingModeId: mode.id,
      firingDurationInitiative: 3, roll: { method: "entered", enteredTotal: 70 } });
    const initial = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, initial, advanceInitiativeTimeline(initial, 21));
    const { readCombatProjectionInTransaction } = await import("@/features/tabletop-operations/combat-projection-service");
    const projection = await readCombatProjectionInTransaction(tx, f.context, f.god);
    const entity = projection.entities.find((entry) => entry.participantId === mover)!;
    assert.equal(entity.mustChooseNow, true); assert.deepEqual(entity.responseDecisionOpportunityIds, []);
    assert.equal(projection.progression.canAdvanceTimeline, false);
    assert.equal((await f.state()).loadedRounds, 6, "The reached choice precedes the pending firing portion.");
    const { declareCombatMovementInTransaction, resolveCombatMovementInTransaction } = await import("@/features/tabletop-operations/combat-movement-service");
    const movement = await resolveCombatMovementInTransaction(tx, f.context, mover, "Land", 1);
    await declareCombatMovementInTransaction(tx, f.context, f.god, { participantId: mover, movementMode: "Land", distance: movement.baseMovement, requestKey: crypto.randomUUID() });
    const firing = await f.attack(declared.attackId);
    await fireFirearmAttackInTransaction(tx, f.context, f.actor, firing.id, { method: "random" });
    assert.equal((await f.state()).loadedRounds, 4);
    assert.equal((await f.rolls()).length, 1);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).pendingActions.find((entry) => entry.id === firing.triggerPendingActionId)!.remainingInitiativeCost, 2);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
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
    await assert.rejects(persistInitiativeEngineInTransaction(tx, f.context, starting, advanceInitiativeTimeline(starting, 19)), /one completed firing portion/);
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
    await persistInitiativeEngineInTransaction(tx, f.context, at21, advanceInitiativeTimeline(at21, 20));
    assert.equal((await f.state()).loadedRounds, 4);
    const at20 = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(at20.runtime.timelineInitiative, 20);
    await assert.rejects(persistInitiativeEngineInTransaction(tx, f.context, at20, advanceInitiativeTimeline(at20, 19)), /pending firing result/);
    const [window] = await tx.select().from(opportunity).where(and(eq(opportunity.declarationId, attack.triggerDeclarationId), eq(opportunity.responderCharacterId, f.occurrences[0])));
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
    await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType: "dodge", protectedTargetCharacterId: f.occurrences[0] }, { method: "entered", enteredTotal: 90 });
    await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    for (const point of [19]) {
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


test("catalog configuration adoption preserves ammunition, readiness and Initiative and retries once", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(stateTable).set({ capacityRounds: null, capacitySource: null, readinessMode: null, readinessModeSource: null, readied: false }).where(eq(stateTable.itemInstanceId, f.instance.id));
    const before = await f.state(), engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    const command = { characterId: f.actorId, itemInstanceId: f.instance.id, expectedVersion: before.version };
    const version = await applyFirearmCatalogConfigurationInTransaction(tx, f.context, f.actor, command);
    assert.equal(await applyFirearmCatalogConfigurationInTransaction(tx, f.context, f.actor, command), version);
    const after = await f.state();
    assert.equal(after.capacityRounds, 6); assert.equal(after.readinessMode, "draw-is-ready");
    assert.equal(after.capacitySource, "canonical"); assert.equal(after.version, before.version + 1);
    assert.equal(after.loadedRounds, before.loadedRounds); assert.equal(after.loadedAmmunitionItemId, before.loadedAmmunitionItemId);
    assert.equal(after.readied, false); assert.equal((await f.rolls()).length, 0);
    assert.deepEqual((await loadInitiativeEngineInTransaction(tx, f.encounterId)).runtime, engine.runtime);
    const { campaignCharacterFirearmEvent } = await import("@/db/tabletop-operations-schema");
    const events = await tx.select().from(campaignCharacterFirearmEvent).where(and(eq(campaignCharacterFirearmEvent.itemInstanceId, f.instance.id), eq(campaignCharacterFirearmEvent.eventKind, "catalog-configuration-applied")));
    assert.equal(events.length, 1); assert.equal((events[0].beforeStateJson as Record<string, unknown>).loadedRounds, (events[0].afterStateJson as Record<string, unknown>).loadedRounds);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("catalog adoption rejects another Player, Freeze, stale versions, over-capacity and unfinished actions", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    const command = { characterId: f.actorId, itemInstanceId: f.instance.id, expectedVersion: (await f.state()).version };
    await assert.rejects(applyFirearmCatalogConfigurationInTransaction(tx, f.context, { authority: "player", characterId: f.actorId, userId: `${f.godId}-other` }, command), /assigned non-NPC/);
    await setCombatFrozenInTransaction(tx, f.encounterId, { authority: "god-owner", userId: f.godId }, { frozen: true, expectedRevision: 0 });
    await assert.rejects(applyFirearmCatalogConfigurationInTransaction(tx, f.context, f.actor, command), /paused/);
    await setCombatFrozenInTransaction(tx, f.encounterId, { authority: "god-owner", userId: f.godId }, { frozen: false, expectedRevision: 1 });
    await tx.update(weaponProfile).set({ capacityRounds: 2 }).where(eq(weaponProfile.id, f.profile.id));
    await assert.rejects(applyFirearmCatalogConfigurationInTransaction(tx, f.context, f.actor, command), /excess internal rounds/);
    await tx.update(weaponProfile).set({ capacityRounds: 8 }).where(eq(weaponProfile.id, f.profile.id));
    await assert.rejects(applyFirearmCatalogConfigurationInTransaction(tx, f.context, f.actor, { ...command, expectedVersion: command.expectedVersion - 1 }), /changed/);
    await tx.update(weaponProfile).set({ capacityRounds: 6 }).where(eq(weaponProfile.id, f.profile.id));
    await declareFirearmAttackInTransaction(tx, f.context, f.actor, f.command);
    await assert.rejects(applyFirearmCatalogConfigurationInTransaction(tx, f.context, f.actor, command), /unfinished action/);
    assert.equal((await f.state()).loadedRounds, 3);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("combined next-shot preparation charges and freezes the remaining costs, completing both requirements once", async () => {
  for (const [cycling, recoil, cost] of [[true, true, 3], [true, false, 1], [false, true, 2]] as const) {
    await assert.rejects(db.transaction(async (tx) => {
      const f = await fixture(tx, "player");
      await tx.update(stateTable).set({ requiresCycling: cycling, requiresRecoilRecovery: recoil }).where(eq(stateTable.itemInstanceId, f.instance.id));
      const beforeState = await f.state();
      const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      const available = before.participants.find((entry) => entry.characterId === f.actorId)!.currentInitiative;
      await tx.update(participant).set({ currentInitiative: cost - 1 }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.actorId)));
      const command = { characterId: f.actorId, itemInstanceId: f.instance.id, operation: "recover-recoil" as const, combineFollowUp: true, idempotencyKey: crypto.randomUUID() };
      await assert.rejects(startFirearmPreparationInTransaction(tx, f.context, f.actor, command), /Initiative|afford/);
      assert.deepEqual(await f.state(), beforeState);
      await tx.update(participant).set({ currentInitiative: available }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.actorId)));
      const preparation = await startFirearmPreparationInTransaction(tx, f.context, f.actor, command);
      assert.equal((await startFirearmPreparationInTransaction(tx, f.context, f.actor, command)).preparationId, preparation.preparationId);
      const [declaration] = await tx.select().from(declarationTable).where(eq(declarationTable.pendingActionId, preparation.pendingActionId!));
      await noDefense(tx, f, declaration.id);
      const started = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      assert.equal(started.pendingActions.find((entry) => entry.id === preparation.pendingActionId)!.originalInitiativeCost, cost);
      if (cost > 1) {
        await persistInitiativeEngineInTransaction(tx, f.context, started, advanceInitiativeTimeline(started, started.runtime.timelineInitiative - 1));
        const partial = await f.state();
        assert.equal(partial.requiresCycling, cycling);
        assert.equal(partial.requiresRecoilRecovery, recoil);
      }
      await tx.update(weaponFiringMode).set({ baseCyclingInitiativeCost: 9, baseRecoilResetInitiativeCost: 9 }).where(eq(weaponFiringMode.id, f.modes[0].id));
      await complete(tx, f, preparation.pendingActionId!);
      const done = await f.state();
      assert.equal(done.requiresCycling, false);
      assert.equal(done.requiresRecoilRecovery, false);
      assert.equal(done.loadedRounds, beforeState.loadedRounds);
      assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find((entry) => entry.characterId === f.actorId)!.currentInitiative, available - cost);
      assert.equal((await startFirearmPreparationInTransaction(tx, f.context, f.actor, command)).preparationId, preparation.preparationId);
      assert.deepEqual(await f.state(), done);
      assert.equal((await f.rolls()).length, 0);
      throw rollback;
    }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
  }
});

for (const forceEnd of [false, true]) test("a Player firearm kill retains CR Fame and applied damage through " + (forceEnd ? "force end" : "the final critical ruling"), async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(occurrence).set({ creatureSnapshotJson: { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, challengeRating: 4 },
      hpPools: [{ canonicalId: "fixture-head", poolName: "Head", maximumHp: 2 }],
      hitLocations: [{ hitLocationNumber: 0, locationName: "Head", hpPoolCanonicalId: "fixture-head", naturalArmor: 0, soak: 0 }] } })
      .where(eq(occurrence.characterId, f.occurrences[0]));
    const profile = async () => (await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0];
    const before = await profile();
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, roll: { method: "entered", enteredTotal: 100 } });
    const attack = await f.attack(declared.attackId);
    await noDefense(tx, f, attack.triggerDeclarationId);
    await complete(tx, f, attack.triggerPendingActionId!);
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    await approveActionEffectPlanInTransaction(tx, f.context, f.god, fired.effectPlanId!, "Apply supported damage while the critical remains a specific decision.");
    assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, fired.effectPlanId!), "partially-applied");
    assert.equal((await profile()).fame, before.fame + 4);
    assert.equal((await profile()).experience, before.experience);
    assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, fired.effectPlanId!), "partially-applied");
    assert.equal((await profile()).fame, before.fame + 4);
    const rows = await tx.select().from(effectTable).where(eq(effectTable.planId, fired.effectPlanId!));
    const manual = rows.find((entry) => entry.effectType === "manual")!;
    if (forceEnd) {
      const { forceEndCombatInTransaction } = await import("@/features/tabletop-operations/combat-force-end-service");
      const beforePlan = (await tx.select().from(planTable).where(eq(planTable.id, fired.effectPlanId!)))[0];
      const beforeTarget = (await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0])))[0];
      await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
      assert.equal((await forceEndCombatInTransaction(tx, f.encounterId, f.god)).reused, false);
      assert.equal((await forceEndCombatInTransaction(tx, f.encounterId, f.god)).reused, true);
      const closedPlan = (await tx.select().from(planTable).where(eq(planTable.id, fired.effectPlanId!)))[0];
      assert.equal(closedPlan.status, "applied"); assert.deepEqual(closedPlan.appliedAt, beforePlan.appliedAt);
      assert.equal(closedPlan.appliedByUserId, beforePlan.appliedByUserId);
      assert.deepEqual((await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0])))[0], beforeTarget);
      assert.deepEqual((await tx.select().from(effectTable).where(eq(effectTable.planId, fired.effectPlanId!))).filter((entry) => entry.status === "applied"), rows.filter((entry) => entry.status === "applied"));
      assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId, true)).runtime.status, "closed");
      assert.equal((await profile()).fame, before.fame + 4);
      assert.equal((await profile()).experience, before.experience);
      assert.equal((await f.state()).loadedRounds, 2); assert.equal((await f.rolls()).length, 1);
      throw rollback;
    }
    await declineActionEffectInTransaction(tx, f.context, f.god, fired.effectPlanId!, manual.id, "No additional critical effect.");
    assert.equal((await tx.select().from(planTable).where(eq(planTable.id, fired.effectPlanId!)))[0].status, "applied");
    assert.equal((await tx.select().from(declarationTable).where(eq(declarationTable.id, attack.triggerDeclarationId)))[0].status, "resolved");
    await declineActionEffectInTransaction(tx, f.context, f.god, fired.effectPlanId!, manual.id, "No additional critical effect.");
    assert.equal((await profile()).fame, before.fame + 4);
    assert.equal((await f.state()).loadedRounds, 2);
    assert.equal((await f.rolls()).length, 1);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

for (const scenario of ["fresh", "retained", "separate-effect"] as const) test(`critical confirmation settles only the recorded attack ruling, without duplicate damage: ${scenario}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(weaponProfile).set({ readinessMode: null, readyInitiativeCost: null }).where(eq(weaponProfile.id, f.profile.id));
    await tx.update(stateTable).set({ readied: false, readinessMode: null, readinessModeSource: null }).where(eq(stateTable.itemInstanceId, f.instance.id));
    await tx.update(occurrence).set({ creatureSnapshotJson: { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, challengeRating: 4 },
      hpPools: [{ canonicalId: "fixture-head", poolName: "Head", maximumHp: 2 }],
      hitLocations: [{ hitLocationNumber: 0, locationName: "Head", hpPoolCanonicalId: "fixture-head", naturalArmor: 0, soak: 0 }] } })
      .where(eq(occurrence.characterId, f.occurrences[0]));
    await assert.rejects(startFirearmPreparationInTransaction(tx, f.context, f.actor, { characterId: f.actorId, itemInstanceId: f.instance.id, operation: "ready", idempotencyKey: crypto.randomUUID() }), /do not need a separate Ready/);
    const profile = async () => (await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, f.heroId)))[0];
    const before = await profile();
    const declared = await declareFirearmAttackInTransaction(tx, f.context, f.actor, { ...f.command, aimInitiative: 1, roll: { method: "entered", enteredTotal: 100 } });
    let attack = await f.attack(declared.attackId);
    await noDefense(tx, f, attack.aimDeclarationId!); await complete(tx, f, attack.aimPendingActionId!);
    await commitFirearmAttackTriggerInTransaction(tx, f.context, f.actor, attack.id, { method: "entered", enteredTotal: 100 });
    attack = await f.attack(attack.id);
    await noDefense(tx, f, attack.triggerDeclarationId); await complete(tx, f, attack.triggerPendingActionId!);
    const fired = await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    if (scenario === "retained") {
      await approveActionEffectPlanInTransaction(tx, f.context, f.god, fired.effectPlanId!, "Legacy partial approval fixture.");
      assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, fired.effectPlanId!), "partially-applied");
    }
    await assert.rejects(confirmActionEffectRulingInTransaction(tx, f.context, f.god, fired.effectPlanId!, ""), /ruling/i);
    await assert.rejects(confirmActionEffectRulingInTransaction(tx, f.context, { ...f.god, userId: "wrong-owner" }, fired.effectPlanId!, "Unauthorized ruling"), /owning|owner/i);
    if (scenario === "separate-effect") {
      const [boundary] = await tx.select().from(effectTable).where(and(eq(effectTable.planId, fired.effectPlanId!), eq(effectTable.effectKey, "firearm-ruling-boundary")));
      await tx.insert(effectTable).values({ ...boundary, id: undefined, effectKey: "firearm-called-automatic-dex", finalValueJson: { effect: { kind: "manual", title: "Separate DEX placement", description: "An additional explicit mechanical placement is required." }, application: {} } });
    }
    const confirm = () => confirmActionEffectRulingInTransaction(tx, f.context, f.god, fired.effectPlanId!, "The critical causes the shown head damage; no additional consequence.");
    const confirmed = await confirm();
    if (scenario === "separate-effect") {
      assert.equal(confirmed, "partially-applied");
      const rows = await tx.select().from(effectTable).where(eq(effectTable.planId, fired.effectPlanId!));
      assert.equal(rows.find((row) => row.effectKey === "firearm-ruling-boundary")!.status, "manual-resolved");
      assert.equal(rows.find((row) => row.effectKey === "firearm-called-automatic-dex")!.status, "approved", "Other mechanical rulings are not silently completed or discarded");
      assert.equal(await confirm(), "partially-applied");
      assert.equal((await profile()).fame, before.fame + 4);
      throw rollback;
    }
    assert.equal(confirmed, "applied", JSON.stringify(await tx.select({ key: effectTable.effectKey, status: effectTable.status, value: effectTable.finalValueJson }).from(effectTable).where(eq(effectTable.planId, fired.effectPlanId!))));
    const effects = await tx.select().from(effectTable).where(eq(effectTable.planId, fired.effectPlanId!));
    assert.equal(effects.find((effect) => effect.effectKey === "firearm-ruling-boundary")!.status, "manual-resolved");
    assert.equal(effects.filter((effect) => effect.status === "applied").length, 1);
    assert.equal(effects.some((effect) => effect.status === "declined"), false);
    assert.equal((await tx.select().from(declarationTable).where(eq(declarationTable.id, attack.triggerDeclarationId)))[0].status, "resolved");
    const target = (await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0])))[0];
    assert.equal((target.localStateJson as { combatCondition: { status: string } }).combatCondition.status, "dead");
    assert.equal(await confirm(), "applied");
    await fireFirearmAttackInTransaction(tx, f.context, f.actor, attack.id, { method: "random" });
    assert.deepEqual((await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0])))[0], target);
    assert.deepEqual(await tx.select().from(effectTable).where(eq(effectTable.planId, fired.effectPlanId!)), effects);
    assert.equal((await profile()).fame, before.fame + 4);
    assert.equal((await f.state()).loadedRounds, 2);
    assert.equal((await f.rolls()).length, 1);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

test("decimal cycling and recoil costs persist, freeze and finish without rounding or another Roll", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "player");
    await tx.update(weaponFiringMode).set({ baseCyclingInitiativeCost: 0.2, baseRecoilResetInitiativeCost: 0.25 }).where(eq(weaponFiringMode.id, f.modes[0].id));
    await tx.update(weaponProfile).set({ ammunitionCyclingInitiativeModifier: -0.1, ammunitionRecoilResetInitiativeModifier: -0.05 }).where(eq(weaponProfile.itemId, f.ammunition.id));
    await tx.update(stateTable).set({ requiresCycling: true, requiresRecoilRecovery: true }).where(eq(stateTable.itemInstanceId, f.instance.id));
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId), beforeState = await f.state();
    const available = before.participants.find((entry) => entry.characterId === f.actorId)!.currentInitiative;
    const command = { characterId: f.actorId, itemInstanceId: f.instance.id, operation: "recover-recoil" as const, combineFollowUp: true, idempotencyKey: crypto.randomUUID() };
    const preparation = await startFirearmPreparationInTransaction(tx, f.context, f.actor, command);
    const [declaration] = await tx.select().from(declarationTable).where(eq(declarationTable.pendingActionId, preparation.pendingActionId!));
    await noDefense(tx, f, declaration.id);
    let engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(engine.pendingActions.find((entry) => entry.id === preparation.pendingActionId)!.originalInitiativeCost, 0.3);
    await persistInitiativeEngineInTransaction(tx, f.context, engine, advanceInitiativeTimeline(engine, available - 0.1));
    assert.equal((await f.state()).requiresCycling, true);
    await tx.update(weaponFiringMode).set({ baseCyclingInitiativeCost: 9, baseRecoilResetInitiativeCost: 9 }).where(eq(weaponFiringMode.id, f.modes[0].id));
    await complete(tx, f, preparation.pendingActionId!);
    engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(engine.pendingActions.find((entry) => entry.id === preparation.pendingActionId)!.remainingInitiativeCost, 0);
    assert.equal(engine.participants.find((entry) => entry.characterId === f.actorId)!.currentInitiative, available - 0.3);
    const done = await f.state();
    assert.equal(done.requiresCycling, false); assert.equal(done.requiresRecoilRecovery, false);
    assert.equal(done.loadedRounds, beforeState.loadedRounds);
    assert.equal((await f.rolls()).length, 0);
    assert.equal((await startFirearmPreparationInTransaction(tx, f.context, f.actor, command)).preparationId, preparation.preparationId);
    assert.deepEqual(await f.state(), done);
    throw rollback;
  }), (error) => { if (error !== rollback) console.error(error); return error === rollback; });
});

import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq } from "drizzle-orm";

import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { creature } from "@/db/creature-schema";
import { item, weaponFiringMode, weaponProfile } from "@/db/item-schema";
import { campaignCharacterAttribute, campaignCharacterItemInstance } from "@/db/realm-schema";
import {
  campaignCharacterFirearmEvent,
  campaignCharacterFirearmState,
  campaignSessionEncounterEffect,
  campaignSessionEncounterEffectPlan,
  campaignSessionEncounterFirearmAttack,
  campaignSessionEncounterFirearmBullet,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterResponderOpportunity,
  campaignSessionRoll,
} from "@/db/tabletop-operations-schema";
import {
  approveActionEffectPlanInTransaction,
  applyActionEffectPlanInTransaction,
  declineActionEffectPlanInTransaction,
} from "@/features/tabletop-operations/action-effect-plan-service";
import { reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import {
  cancelFirearmAttackInTransaction,
  declareFirearmAttackInTransaction,
  fireFirearmAttackInTransaction,
  previewFirearmAttackInTransaction,
  readFirearmAttackWorkspaceInTransaction,
  type FirearmAttackCommand,
} from "@/features/tabletop-operations/firearm-attack-service";
import { getAttributeModifier } from "@/features/characters/character-rules";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import {
  loadInitiativeEngineInTransaction,
  lockOwnedEncounterRuntimeInTransaction,
  persistInitiativeEngineInTransaction,
} from "@/features/tabletop-operations/runtime-integration-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for firearm attack validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing firearm attack tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing firearm attack tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_FIREARM_ATTACK_TEST");

after(async () => {
  await pool.end();
});

test("guarded firearm firing is exact, atomic, idempotent, review-first, and Creature-local", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "firearm-attack");
    await tx.insert(userRole).values({ userId: base.godId, role: "god" });
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId, base.godId);
    const god = { authority: "god-owner" as const, userId: base.godId };
    const suffix = crypto.randomUUID().toUpperCase();
    await tx.insert(campaignCharacterAttribute).values({ characterId: base.heroId, attributeKey: "DEX", value: 30 });
    const [ammunitionItem, firearmItem] = await tx.insert(item).values([
      {
        canonicalId: `PASS10-AMMO-${suffix}`,
        name: "Pass 10 Exact Cartridge",
        catalogScope: "inventory",
        recordType: "Ammunition",
        family: "Test",
        category: "Ammunition",
        priceBasis: "per round",
        createdByUserId: base.godId,
      },
      {
        canonicalId: `PASS10-PISTOL-${suffix}`,
        name: "Pass 10 Service Pistol",
        catalogScope: "equipment",
        equipmentGroup: "weapon",
        recordType: "Weapon",
        family: "Test",
        category: "Firearm",
        priceBasis: "per item",
        createdByUserId: base.godId,
      },
    ]).returning({ id: item.id });
    assert.ok(ammunitionItem && firearmItem);
    const [ammunitionProfile] = await tx.insert(weaponProfile).values({
      itemId: ammunitionItem.id,
      profileRecordType: "Ammunition",
      damage: "8",
      damageType: "Ballistic",
      ammunitionCyclingInitiativeModifier: 0,
      ammunitionRecoilResetInitiativeModifier: 0,
    }).returning({ id: weaponProfile.id });
    const [firearmProfile] = await tx.insert(weaponProfile).values({
      itemId: firearmItem.id,
      profileRecordType: "Weapon",
      weaponType: "Handgun",
      damageSource: "Ammunition",
      ammunitionItemId: ammunitionItem.id,
      rangeText: "Ranged",
      capacityRounds: 6,
      readinessMode: "draw-is-ready",
      drawInitiativeCost: 0,
      readyInitiativeCost: 0,
      reloadInitiativeCost: 0,
      unloadInitiativeCost: 0,
      firingModeChangeInitiativeCost: 0,
    }).returning({ id: weaponProfile.id });
    assert.ok(ammunitionProfile && firearmProfile);
    const [mode] = await tx.insert(weaponFiringMode).values({
      weaponProfileId: firearmProfile.id,
      name: "Single",
      normalizedName: "single",
      sortOrder: 0,
      baseCyclingInitiativeCost: 0,
      baseRecoilResetInitiativeCost: 0,
      deliveryCadence: "per-trigger",
      roundsPerCadence: 1,
    }).returning({ id: weaponFiringMode.id });
    assert.ok(mode);
    const [burstMode] = await tx.insert(weaponFiringMode).values({
      weaponProfileId: firearmProfile.id,
      name: "Three-round burst",
      normalizedName: "three-round burst",
      sortOrder: 1,
      baseCyclingInitiativeCost: 0,
      baseRecoilResetInitiativeCost: 0,
      deliveryCadence: "per-trigger",
      roundsPerCadence: 3,
    }).returning({ id: weaponFiringMode.id });
    assert.ok(burstMode);
    const [instance] = await tx.insert(campaignCharacterItemInstance).values({
      characterId: base.heroId,
      itemId: firearmItem.id,
      currentCharges: 0,
      equipmentState: "wielded",
      unitCostCredits: 100,
    }).returning({ id: campaignCharacterItemInstance.id });
    assert.ok(instance);
    await tx.insert(campaignCharacterFirearmState).values({
      itemInstanceId: instance.id,
      campaignId: base.campaignId,
      characterId: base.heroId,
      itemId: firearmItem.id,
      weaponProfileId: firearmProfile.id,
      selectedFiringModeId: mode.id,
      loadedAmmunitionItemId: ammunitionItem.id,
      loadedAmmunitionProfileId: ammunitionProfile.id,
      loadedAmmunitionUnitCostCredits: 2,
      loadedRounds: 3,
      capacityRounds: 6,
      capacitySource: "canonical",
      readinessMode: "draw-is-ready",
      readinessModeSource: "canonical",
      readied: false,
      initializationKey: `pass10-${suffix}`,
      initializedByUserId: base.godId,
      updatedByUserId: base.godId,
    });

    const [creatureDefinition] = await tx.insert(creature).values({
      canonicalId: `PASS10-CREATURE-${suffix}`,
      canonicalName: "Pass 10 Creature Canon",
      size: "Medium",
    }).returning({ id: creature.id });
    assert.ok(creatureDefinition);
    const poolKey = `PASS10-BODY-${suffix}`;
    const creatureSnapshot = {
      core: { size: "Medium" },
      hpPools: [{ canonicalId: poolKey, poolName: "Body", maximumHp: 30, hpPercentage: 100, sortOrder: 0 }],
      hitLocations: [{ hitLocationNumber: 1, locationName: "Torso", bodyPartsIncluded: "Torso", hpPoolCanonicalId: poolKey, naturalArmor: 2, soak: 1, sortOrder: 0 }],
    };
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId: base.encounterId,
      sceneId: base.sceneId,
      sessionId: base.sessionId,
      campaignId: base.campaignId,
      characterId: -1,
      participantKind: "creature",
      creatureId: creatureDefinition.id,
      displayLabel: "Pass 10 Creature Occurrence",
      creatureSnapshotJson: creatureSnapshot,
      localStateJson: { health: { totalDamage: 0, poolDamage: { [poolKey]: 0 } }, conditions: [], modifiers: [], history: [] },
      sortOrder: 2,
    });
    await tx.insert(campaignSessionEncounterInitiativeParticipant).values({
      encounterId: base.encounterId,
      sceneId: base.sceneId,
      sessionId: base.sessionId,
      campaignId: base.campaignId,
      characterId: -1,
      normalTotalInitiative: 20,
      currentInitiative: 17,
    });

    const command: FirearmAttackCommand = {
      actorParticipantId: base.heroId,
      targetParticipantId: -1,
      itemInstanceId: instance.id,
      firingModeId: mode.id,
      aimInitiative: 0,
      firingDurationInitiative: 1,
      calledShot: { declared: true, objective: "Torso", locationNumber: 1, penalty: 4, reason: "Exact test Called Shot difficulty." },
      manualGovernance: { label: "Pass 10 exact manual firearm target", originalTarget: 50, reason: "Focused test uses the existing one-action G.O.D. ruling boundary." },
    };
    const [uninitializedInstance] = await tx.insert(campaignCharacterItemInstance).values({
      characterId: base.heroId,
      itemId: firearmItem.id,
      currentCharges: 0,
      equipmentState: "wielded",
      unitCostCredits: 100,
    }).returning({ id: campaignCharacterItemInstance.id });
    const [wrongOwnerInstance] = await tx.insert(campaignCharacterItemInstance).values({
      characterId: base.defenderId,
      itemId: firearmItem.id,
      currentCharges: 0,
      equipmentState: "wielded",
      unitCostCredits: 100,
    }).returning({ id: campaignCharacterItemInstance.id });
    assert.ok(uninitializedInstance && wrongOwnerInstance);
    await assert.rejects(previewFirearmAttackInTransaction(tx, context, base.godId, { ...command, itemInstanceId: uninitializedInstance.id }), /no initialized runtime state/);
    await assert.rejects(previewFirearmAttackInTransaction(tx, context, base.godId, { ...command, itemInstanceId: wrongOwnerInstance.id }), /no initialized runtime state/);
    await assert.rejects(previewFirearmAttackInTransaction(tx, context, base.godId, { ...command, firingModeId: burstMode.id }), /does not match this exact firearm/);
    await tx.update(campaignCharacterFirearmState).set({ selectedFiringModeId: burstMode.id, loadedRounds: 2, readied: true })
      .where(eq(campaignCharacterFirearmState.itemInstanceId, instance.id));
    await assert.rejects(previewFirearmAttackInTransaction(tx, context, base.godId, { ...command, firingModeId: burstMode.id }), /requires 3 rounds, but only 2/);
    await tx.update(campaignCharacterFirearmState).set({ selectedFiringModeId: mode.id, loadedRounds: 3, readied: false })
      .where(eq(campaignCharacterFirearmState.itemInstanceId, instance.id));
    await assert.rejects(previewFirearmAttackInTransaction(tx, context, base.godId, command), /not authoritatively ready|not been.*readiness|not-readied|not completed/i);
    await tx.update(campaignCharacterFirearmState).set({ readied: true }).where(eq(campaignCharacterFirearmState.itemInstanceId, instance.id));

    const preview = await previewFirearmAttackInTransaction(tx, context, base.godId, command);
    assert.equal(preview.finalTarget, 54);
    assert.equal(preview.authoredDamage.numeric, 8);
    assert.equal(preview.calledShot.locationNumber, 1);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, base.encounterId))).length, 0);
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, instance.id)))[0]?.loadedRounds, 3);

    const declared = await declareFirearmAttackInTransaction(tx, context, base.godId, { ...command, idempotencyKey: `attack-${suffix}` });
    const duplicateDeclaration = await declareFirearmAttackInTransaction(tx, context, base.godId, { ...command, idempotencyKey: `attack-${suffix}` });
    assert.deepEqual(duplicateDeclaration, { ...declared, reused: true });
    const [attackBefore] = await tx.select().from(campaignSessionEncounterFirearmAttack).where(eq(campaignSessionEncounterFirearmAttack.id, declared.attackId));
    assert.ok(attackBefore?.triggerPendingActionId);
    const opportunities = await tx.select().from(campaignSessionEncounterResponderOpportunity)
      .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, attackBefore.triggerDeclarationId));
    assert.ok(opportunities.length >= 1);
    for (const opportunity of opportunities) {
      await reconcileResponderOpportunityInTransaction(tx, context, god, opportunity.id, { status: "declined", reason: "Focused firearm attack fixture declines this opportunity." });
    }
    const beforeTriggerCompletion = await loadInitiativeEngineInTransaction(tx, base.encounterId);
    const triggerAction = beforeTriggerCompletion.pendingActions.find(({ id }) => id === attackBefore.triggerPendingActionId);
    assert.ok(triggerAction);
    const afterTriggerCompletion = advanceInitiativeTimeline(beforeTriggerCompletion, triggerAction.expectedCompletionInitiative);
    await persistInitiativeEngineInTransaction(tx, context, beforeTriggerCompletion, afterTriggerCompletion);
    const fired = await fireFirearmAttackInTransaction(tx, context, base.godId, declared.attackId, { method: "entered", enteredTotal: 75 });
    assert.equal(fired.roundsConsumed, 1);
    assert.ok(fired.effectPlanId);
    const duplicateFire = await fireFirearmAttackInTransaction(tx, context, base.godId, declared.attackId, { method: "entered", enteredTotal: 99 });
    assert.equal(duplicateFire.reused, true);
    assert.equal(duplicateFire.rollId, fired.rollId);

    const [stateAfter] = await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, instance.id));
    assert.equal(stateAfter?.loadedRounds, 2);
    assert.equal(stateAfter?.version, 2);
    assert.equal(stateAfter?.requiresCycling, false);
    assert.equal(stateAfter?.requiresRecoilRecovery, false);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.pendingActionId, attackBefore.triggerPendingActionId))).length, 1);
    assert.equal((await tx.select().from(campaignCharacterFirearmEvent).where(and(
      eq(campaignCharacterFirearmEvent.itemInstanceId, instance.id),
      eq(campaignCharacterFirearmEvent.eventKind, "firearm-attack-fired"),
    ))).length, 1);
    const [bullet] = await tx.select().from(campaignSessionEncounterFirearmBullet).where(eq(campaignSessionEncounterFirearmBullet.attackId, declared.attackId));
    assert.ok(bullet);
    assert.equal(bullet.hitLocationNumber, 1);
    assert.equal(bullet.grossDamage, 8 + getAttributeModifier(30) + 2);
    assert.equal(bullet.armor, 2);
    assert.equal(bullet.soak, 1);
    assert.equal(bullet.proposedNetDamage, bullet.grossDamage - 3);
    const [firedAttack] = await tx.select({ damage: campaignSessionEncounterFirearmAttack.damageResolutionJson })
      .from(campaignSessionEncounterFirearmAttack).where(eq(campaignSessionEncounterFirearmAttack.id, declared.attackId));
    assert.equal((firedAttack?.damage as { calledShotValidAtRoll: boolean }).calledShotValidAtRoll, true);

    const [creatureBeforeReview] = await tx.select({ localState: campaignSessionEncounterParticipant.localStateJson })
      .from(campaignSessionEncounterParticipant).where(and(
        eq(campaignSessionEncounterParticipant.encounterId, base.encounterId),
        eq(campaignSessionEncounterParticipant.characterId, -1),
      ));
    assert.deepEqual((creatureBeforeReview?.localState as { health: unknown }).health, { totalDamage: 0, poolDamage: { [poolKey]: 0 } });
    await approveActionEffectPlanInTransaction(tx, context, god, fired.effectPlanId!, "Apply the exact reviewed firearm damage proposal.");
    assert.equal(await applyActionEffectPlanInTransaction(tx, context, god, fired.effectPlanId!), "applied");
    assert.equal(await applyActionEffectPlanInTransaction(tx, context, god, fired.effectPlanId!), "applied");
    const [creatureAfter] = await tx.select({ localState: campaignSessionEncounterParticipant.localStateJson })
      .from(campaignSessionEncounterParticipant).where(and(
        eq(campaignSessionEncounterParticipant.encounterId, base.encounterId),
        eq(campaignSessionEncounterParticipant.characterId, -1),
      ));
    const localHealth = (creatureAfter?.localState as { health: { totalDamage: number; poolDamage: Record<string, number> } }).health;
    assert.equal(localHealth.totalDamage, bullet.proposedNetDamage);
    assert.equal(localHealth.poolDamage[poolKey], bullet.proposedNetDamage);
    assert.equal((await tx.select({ name: creature.canonicalName }).from(creature).where(eq(creature.id, creatureDefinition.id)))[0]?.name, "Pass 10 Creature Canon");
    assert.equal((await tx.select().from(campaignSessionEncounterEffect).where(eq(campaignSessionEncounterEffect.planId, fired.effectPlanId!))).every(({ targetParticipantId }) => targetParticipantId === -1), true);

    const beforeAimCancellation = stateAfter!.loadedRounds;
    const aimed = await declareFirearmAttackInTransaction(tx, context, base.godId, {
      ...command,
      aimInitiative: 1,
      calledShot: { declared: false, objective: "", locationNumber: null, penalty: null, reason: "" },
      idempotencyKey: `aim-${suffix}`,
    });
    await cancelFirearmAttackInTransaction(tx, context, base.godId, aimed.attackId, "The attacker changes plans before firing.");
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, instance.id)))[0]?.loadedRounds, beforeAimCancellation);
    assert.equal((await tx.select().from(campaignSessionEncounterFirearmAttack).where(eq(campaignSessionEncounterFirearmAttack.id, aimed.attackId)))[0]?.status, "cancelled");

    const workspace = await readFirearmAttackWorkspaceInTransaction(tx, context, base.godId);
    assert.equal(workspace.attacks.length, 2);
    assert.equal(workspace.participants.find(({ id }) => id === -1)?.hitLocations[0]?.name, "Torso");
    await assert.rejects(readFirearmAttackWorkspaceInTransaction(tx, context, `${base.godId}-administrator-only`), /Campaign-owning G\.O\.D/);

    const planCount = (await tx.select().from(campaignSessionEncounterEffectPlan).where(eq(campaignSessionEncounterEffectPlan.id, fired.effectPlanId!))).length;
    assert.equal(planCount, 1);
    await declineActionEffectPlanInTransaction(tx, context, god, fired.effectPlanId!, "Idempotent terminal plan cannot be declined.").catch((error: unknown) => {
      assert.match(error instanceof Error ? error.message : String(error), /can no longer be declined/);
    });
    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

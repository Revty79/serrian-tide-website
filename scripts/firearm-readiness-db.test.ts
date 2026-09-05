import assert from "node:assert/strict";
import { after, test } from "node:test";

import { and, eq, sql } from "drizzle-orm";

import { db, pool } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { item, itemRuntimeProfile, weaponFiringMode, weaponProfile } from "@/db/item-schema";
import { campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import {
  campaignCharacterFirearmEvent,
  campaignCharacterFirearmPreparation,
  campaignCharacterFirearmState,
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterResponderOpportunity,
} from "@/db/tabletop-operations-schema";
import {
  cancelActionDeclarationInTransaction,
  interruptActionDeclarationInTransaction,
  reconcileResponderOpportunityInTransaction,
} from "@/features/tabletop-operations/action-declaration-service";
import {
  initializeFirearmStateInTransaction,
  readFirearmWorkspaceInTransaction,
  recordFirearmManualHandlingInTransaction,
  startFirearmPreparationInTransaction,
} from "@/features/tabletop-operations/firearm-readiness-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import {
  loadInitiativeEngineInTransaction,
  lockOwnedEncounterRuntimeInTransaction,
  persistInitiativeEngineInTransaction,
} from "@/features/tabletop-operations/runtime-integration-service";

import { insertBuildTenFixture } from "./tabletop-build-ten-db-fixture";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for firearm readiness validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing firearm readiness tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing firearm readiness tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const ROLLBACK = new Error("ROLLBACK_FIREARM_READINESS_TEST");

after(async () => {
  await pool.end();
});

test("guarded exact firearm, ammunition, Initiative, audit, NPC, Creature, retry, and authority paths remain transactional", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const base = await insertBuildTenFixture(tx, "firearm-readiness");
    await tx.insert(userRole).values({ userId: base.godId, role: "god" });
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId, base.godId);
    const actor = { authority: "god-owner" as const, userId: base.godId };
    const suffix = crypto.randomUUID().toUpperCase();
    const [firearmItem, ammunitionItem, wrongAmmunitionItem, foreignFirearmItem] = await tx.insert(item).values([
      { canonicalId: `TEST-FIREARM-${suffix}`, name: "Twin Test Pistol", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "Weapon", family: "Test", category: "Firearm", priceBasis: "per item", createdByUserId: base.godId },
      { canonicalId: `TEST-AMMO-${suffix}`, name: "Exact Test Cartridge", catalogScope: "inventory", recordType: "Ammunition", family: "Test", category: "Ammunition", priceBasis: "per round", createdByUserId: base.godId },
      { canonicalId: `TEST-WRONG-AMMO-${suffix}`, name: "Exact Test Cartridge", catalogScope: "inventory", recordType: "Ammunition", family: "Test", category: "Ammunition", priceBasis: "per round", createdByUserId: base.godId },
      { canonicalId: `TEST-FOREIGN-FIREARM-${suffix}`, name: "Foreign Pistol", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "Weapon", family: "Test", category: "Firearm", priceBasis: "per item", createdByUserId: base.godId },
    ]).returning({ id: item.id });
    assert.ok(firearmItem && ammunitionItem && wrongAmmunitionItem && foreignFirearmItem);
    const [ammunitionProfile, wrongAmmunitionProfile] = await tx.insert(weaponProfile).values([
      { itemId: ammunitionItem.id, profileRecordType: "Ammunition", ammunitionCyclingInitiativeModifier: 0, ammunitionRecoilResetInitiativeModifier: 0 },
      { itemId: wrongAmmunitionItem.id, profileRecordType: "Ammunition", ammunitionCyclingInitiativeModifier: 0, ammunitionRecoilResetInitiativeModifier: 0 },
    ]).returning({ id: weaponProfile.id });
    assert.ok(ammunitionProfile && wrongAmmunitionProfile);
    const [firearmProfile, foreignProfile] = await tx.insert(weaponProfile).values([
      { itemId: firearmItem.id, profileRecordType: "Weapon", weaponType: "Handgun", ammunitionItemId: ammunitionItem.id, capacityRounds: 6, readinessMode: "draw-is-ready", drawInitiativeCost: 0, readyInitiativeCost: 0, reloadInitiativeCost: 0, unloadInitiativeCost: 0, firingModeChangeInitiativeCost: 0 },
      { itemId: foreignFirearmItem.id, profileRecordType: "Weapon", weaponType: "Handgun", ammunitionItemId: ammunitionItem.id, capacityRounds: 6, readinessMode: "draw-is-ready", drawInitiativeCost: 0, readyInitiativeCost: 0, reloadInitiativeCost: 0, unloadInitiativeCost: 0, firingModeChangeInitiativeCost: 0 },
    ]).returning({ id: weaponProfile.id });
    assert.ok(firearmProfile && foreignProfile);
    const [singleMode, burstMode, foreignMode] = await tx.insert(weaponFiringMode).values([
      { weaponProfileId: firearmProfile.id, name: "Single", normalizedName: "single", sortOrder: 0, baseCyclingInitiativeCost: 1, baseRecoilResetInitiativeCost: 2, deliveryCadence: "per-trigger", roundsPerCadence: 1 },
      { weaponProfileId: firearmProfile.id, name: "Burst", normalizedName: "burst", sortOrder: 1, baseCyclingInitiativeCost: 2, baseRecoilResetInitiativeCost: 3, deliveryCadence: "per-trigger", roundsPerCadence: 3 },
      { weaponProfileId: foreignProfile.id, name: "Single", normalizedName: "single", sortOrder: 0, baseCyclingInitiativeCost: 0, baseRecoilResetInitiativeCost: 0, deliveryCadence: "per-trigger", roundsPerCadence: 1 },
    ]).returning({ id: weaponFiringMode.id });
    assert.ok(singleMode && burstMode && foreignMode);
    await tx.insert(itemRuntimeProfile).values({ itemId: firearmItem.id, useMode: "none", activationLabel: "Use" });
    await tx.insert(campaignCharacterItem).values([
      { characterId: base.heroId, itemId: firearmItem.id, quantity: 2, unitCostCredits: 100 },
      { characterId: base.heroId, itemId: ammunitionItem.id, quantity: 20, unitCostCredits: 2 },
      { characterId: base.heroId, itemId: wrongAmmunitionItem.id, quantity: 20, unitCostCredits: 2 },
      { characterId: base.defenderId, itemId: firearmItem.id, quantity: 1, unitCostCredits: 100 },
    ]);

    await assert.rejects(initializeFirearmStateInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemId: firearmItem.id, itemInstanceId: null, selectedFiringModeId: foreignMode.id, reason: "Exact baseline", idempotencyKey: `cross-mode-${suffix}`,
    }), /does not belong to this Weapon Profile/);

    const first = await initializeFirearmStateInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemId: firearmItem.id, itemInstanceId: null, selectedFiringModeId: singleMode.id, reason: "First explicit empty baseline", idempotencyKey: `first-${suffix}`,
    });
    const retried = await initializeFirearmStateInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemId: firearmItem.id, itemInstanceId: null, selectedFiringModeId: singleMode.id, reason: "First explicit empty baseline", idempotencyKey: `first-${suffix}`,
    });
    assert.equal(retried.itemInstanceId, first.itemInstanceId);
    assert.equal(retried.reused, true);
    const second = await initializeFirearmStateInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemId: firearmItem.id, itemInstanceId: null, selectedFiringModeId: burstMode.id, reason: "Second explicit empty baseline", idempotencyKey: `second-${suffix}`,
    });
    assert.notEqual(first.itemInstanceId, second.itemInstanceId);
    assert.equal((await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, base.heroId), eq(campaignCharacterItem.itemId, firearmItem.id)))).length, 0);
    const exactStates = await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.characterId, base.heroId));
    assert.equal(exactStates.length, 2);
    const exactStatesByInstance = new Map(exactStates.map((state) => [state.itemInstanceId, state]));
    assert.deepEqual(
      exactStatesByInstance.get(first.itemInstanceId) && {
        itemInstanceId: exactStatesByInstance.get(first.itemInstanceId)!.itemInstanceId,
        selectedFiringModeId: exactStatesByInstance.get(first.itemInstanceId)!.selectedFiringModeId,
        loadedRounds: exactStatesByInstance.get(first.itemInstanceId)!.loadedRounds,
      },
      { itemInstanceId: first.itemInstanceId, selectedFiringModeId: singleMode.id, loadedRounds: 0 },
    );
    assert.deepEqual(
      exactStatesByInstance.get(second.itemInstanceId) && {
        itemInstanceId: exactStatesByInstance.get(second.itemInstanceId)!.itemInstanceId,
        selectedFiringModeId: exactStatesByInstance.get(second.itemInstanceId)!.selectedFiringModeId,
        loadedRounds: exactStatesByInstance.get(second.itemInstanceId)!.loadedRounds,
      },
      { itemInstanceId: second.itemInstanceId, selectedFiringModeId: burstMode.id, loadedRounds: 0 },
    );
    await tx.execute(sql.raw("savepoint firearm_readiness_constraint"));
    await assert.rejects(tx.update(campaignCharacterFirearmState).set({
      readinessMode: null,
      readinessModeSource: null,
      readied: true,
    }).where(eq(campaignCharacterFirearmState.itemInstanceId, first.itemInstanceId)), (error: unknown) => (
      (error as { cause?: { constraint?: string } }).cause?.constraint
        === "campaign_character_firearm_state_readied_relationship_valid"
    ));
    await tx.execute(sql.raw("rollback to savepoint firearm_readiness_constraint"));

    const beforeFailedLoad = (await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, base.heroId), eq(campaignCharacterItem.itemId, ammunitionItem.id))))[0]!;
    await assert.rejects(startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemInstanceId: first.itemInstanceId, operation: "load", requestedRounds: 7, idempotencyKey: `too-many-${suffix}`,
    }), /above.*capacity/);
    assert.equal((await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, base.heroId), eq(campaignCharacterItem.itemId, ammunitionItem.id))))[0]?.quantity, beforeFailedLoad.quantity);
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, first.itemInstanceId)))[0]?.loadedRounds, 0);

    const load = await startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemInstanceId: first.itemInstanceId, operation: "load", requestedRounds: 4, idempotencyKey: `load-${suffix}`,
    });
    assert.equal(load.status, "completed");
    const duplicateLoad = await startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemInstanceId: first.itemInstanceId, operation: "load", requestedRounds: 4, idempotencyKey: `load-${suffix}`,
    });
    assert.equal(duplicateLoad.reused, true);
    assert.equal((await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, base.heroId), eq(campaignCharacterItem.itemId, ammunitionItem.id))))[0]?.quantity, 16);
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, first.itemInstanceId)))[0]?.loadedRounds, 4);
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, second.itemInstanceId)))[0]?.loadedRounds, 0);

    await startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemInstanceId: first.itemInstanceId, operation: "unload", partialLoadDisposition: "retain", idempotencyKey: `retain-${suffix}`,
    });
    assert.equal((await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, base.heroId), eq(campaignCharacterItem.itemId, ammunitionItem.id))))[0]?.quantity, 20);
    await startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemInstanceId: first.itemInstanceId, operation: "load", requestedRounds: 3, idempotencyKey: `reload-for-discard-${suffix}`,
    });
    await assert.rejects(startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemInstanceId: first.itemInstanceId, operation: "unload", partialLoadDisposition: "discard", idempotencyKey: `discard-no-reason-${suffix}`,
    }), /requires an explicit reason/);
    await startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemInstanceId: first.itemInstanceId, operation: "unload", partialLoadDisposition: "discard", godReason: "Rounds were destroyed by the environment", idempotencyKey: `discard-${suffix}`,
    });
    assert.equal((await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, base.heroId), eq(campaignCharacterItem.itemId, ammunitionItem.id))))[0]?.quantity, 17);
    assert.ok((await tx.select().from(campaignCharacterFirearmEvent).where(eq(campaignCharacterFirearmEvent.itemInstanceId, first.itemInstanceId))).some(({ reason }) => reason === "Rounds were destroyed by the environment"));

    await tx.update(weaponProfile).set({ reloadInitiativeCost: 3 }).where(eq(weaponProfile.id, firearmProfile.id));
    const longLoad = await startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemInstanceId: second.itemInstanceId, operation: "load", requestedRounds: 2, idempotencyKey: `long-load-${suffix}`,
    });
    assert.equal(longLoad.status, "pending");
    assert.ok(longLoad.pendingActionId);
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, second.itemInstanceId)))[0]?.loadedRounds, 0);
    const longPreparation = (await tx.select().from(campaignCharacterFirearmPreparation).where(eq(campaignCharacterFirearmPreparation.id, longLoad.preparationId)))[0]!;
    const opportunities = await tx.select().from(campaignSessionEncounterResponderOpportunity).where(eq(campaignSessionEncounterResponderOpportunity.declarationId, longPreparation.actionDeclarationId!));
    assert.equal(opportunities.length, 1);
    assert.equal(opportunities[0]?.responderCharacterId, base.defenderId);
    const beforeEngine = await loadInitiativeEngineInTransaction(tx, base.encounterId);
    const afterEngine = advanceInitiativeTimeline(beforeEngine, 15);
    await persistInitiativeEngineInTransaction(tx, context, beforeEngine, afterEngine);
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, second.itemInstanceId)))[0]?.loadedRounds, 0);
    await reconcileResponderOpportunityInTransaction(tx, context, actor, opportunities[0]!.id, { status: "declined", reason: "No response declared" });
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, second.itemInstanceId)))[0]?.loadedRounds, 2);
    assert.equal((await tx.select().from(campaignCharacterFirearmPreparation).where(eq(campaignCharacterFirearmPreparation.id, longLoad.preparationId)))[0]?.status, "completed");

    await tx.update(weaponProfile).set({ unloadInitiativeCost: 2 }).where(eq(weaponProfile.id, firearmProfile.id));
    const interruptedUnload = await startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: base.heroId, itemInstanceId: second.itemInstanceId, operation: "unload", partialLoadDisposition: "retain", idempotencyKey: `interrupt-${suffix}`,
    });
    const interruptedDeclaration = (await tx.select().from(campaignCharacterFirearmPreparation).where(eq(campaignCharacterFirearmPreparation.id, interruptedUnload.preparationId)))[0]!.actionDeclarationId!;
    await interruptActionDeclarationInTransaction(tx, context, actor, interruptedDeclaration, "Interrupted by test hazard");
    assert.equal((await tx.select().from(campaignCharacterFirearmPreparation).where(eq(campaignCharacterFirearmPreparation.id, interruptedUnload.preparationId)))[0]?.status, "interrupted");
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, second.itemInstanceId)))[0]?.loadedRounds, 2);
    await cancelActionDeclarationInTransaction(tx, context, actor, interruptedDeclaration, "Preparation abandoned");
    assert.equal((await tx.select().from(campaignCharacterFirearmPreparation).where(eq(campaignCharacterFirearmPreparation.id, interruptedUnload.preparationId)))[0]?.status, "cancelled");
    assert.equal((await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, second.itemInstanceId)))[0]?.loadedRounds, 2);

    await recordFirearmManualHandlingInTransaction(tx, context, base.godId, { characterId: base.heroId, itemInstanceId: first.itemInstanceId, reason: "Unsupported table situation" });
    assert.ok((await tx.select().from(campaignCharacterFirearmEvent).where(eq(campaignCharacterFirearmEvent.itemInstanceId, first.itemInstanceId))).some(({ eventKind }) => eventKind === "manual-handling-required"));
    const refreshed = await readFirearmWorkspaceInTransaction(tx, context, base.heroId, first.itemInstanceId);
    assert.equal(refreshed.selectedItemInstanceId, first.itemInstanceId);
    assert.equal(refreshed.firearms.find(({ itemInstanceId }) => itemInstanceId === second.itemInstanceId)?.state?.loadedRounds, 2);

    const npcState = await initializeFirearmStateInTransaction(tx, context, base.godId, {
      characterId: base.defenderId, itemId: firearmItem.id, itemInstanceId: null, selectedFiringModeId: singleMode.id, reason: "Persistent NPC explicit baseline", idempotencyKey: `npc-${suffix}`,
    });
    assert.ok(npcState.itemInstanceId > 0);
    await assert.rejects(startFirearmPreparationInTransaction(tx, context, base.godId, {
      characterId: -1, itemInstanceId: npcState.itemInstanceId, operation: "draw", idempotencyKey: `creature-${suffix}`,
    }), /saved positive record|persistent Character or NPC/);

    const outsiderId = `firearm-outsider-${crypto.randomUUID()}`;
    await tx.insert(user).values({ id: outsiderId, name: "Administrator only", email: `${outsiderId}@example.invalid`, username: outsiderId });
    await tx.insert(userRole).values({ userId: outsiderId, role: "admin" });
    await assert.rejects(lockOwnedEncounterRuntimeInTransaction(tx, base.encounterId, outsiderId), /Campaign creator|Campaign-owning G\.O\.D/);

    const firearmDeclarations = (await tx.select().from(campaignSessionEncounterActionDeclaration).where(eq(campaignSessionEncounterActionDeclaration.encounterId, base.encounterId))).filter(({ lockedSnapshotJson }) => (
      ((lockedSnapshotJson as { actionKind?: string } | null)?.actionKind ?? "").startsWith("firearm-preparation:")
    ));
    assert.ok(firearmDeclarations.length >= 2);
    assert.equal(firearmDeclarations.every(({ lockedSnapshotJson }) => lockedSnapshotJson !== null), true);
    assert.equal((await tx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.encounterId, base.encounterId))).some(({ actionKind }) => actionKind.startsWith("firearm-preparation:")), true);
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.characterId, base.heroId))).filter(({ itemId }) => itemId === firearmItem.id).length, 2);

    throw ROLLBACK;
  }), (error: unknown) => error === ROLLBACK);
});

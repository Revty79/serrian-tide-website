import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { item, itemEffect, itemRuntimeProfile } from "@/db/item-schema";
import { derivedAbility, derivedAbilityCost, derivedAbilityEffect, derivedAbilityUseLimit, characterDerivedAbility, characterDerivedAbilityUse, campaignAllowedDerivedAbility } from "@/db/derived-ability-schema";
import { campaignCharacterItem, campaignCharacterItemInstance } from "@/db/realm-schema";
import { campaignSessionEncounterInitiativeParticipant as participant, campaignSessionEncounterParticipant as occurrence, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { applyRoutineCombatConsequencesInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { recordCombatSourceResolutionInTransaction } from "@/features/tabletop-operations/combat-source-resolution-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_ITEM_ABILITY_FIXTURE");

for (const mode of ["consume-item", "charges"] as const) test(`${mode}: source resource and independent Creature condition apply atomically once after completion`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, mode);
    const [source] = await tx.insert(item).values({ canonicalId: `COMPLETION-${crypto.randomUUID()}`.toUpperCase(), name: "Condition item", catalogScope: "equipment", equipmentGroup: "general",
      recordType: "General Equipment", family: "Fixture", category: "Fixture", priceBasis: "unit", createdByUserId: f.godId }).returning();
    await tx.insert(itemRuntimeProfile).values({ itemId: source.id, useMode: mode, quantityPerUse: mode === "consume-item" ? 1 : null, maximumCharges: mode === "charges" ? 3 : null, chargesPerUse: mode === "charges" ? 1 : null });
    await tx.insert(itemEffect).values({ itemId: source.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Marked", description: "Exact authored condition", duration: { kind: "scene" } } });
    await tx.insert(itemEffect).values([
      { itemId: source.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "modifier.apply", label: "Slowing mark", channel: "initiative", targetKey: "self", amount: -3, duration: { kind: "scene" } } },
      { itemId: source.id, sortOrder: 2, schemaVersion: 2, effectJson: { kind: "health.heal", amount: 3, scope: "full-body" } },
    ]);
    let instanceId: number | null = null;
    if (mode === "charges") instanceId = (await tx.insert(campaignCharacterItemInstance).values({ characterId: f.heroId, itemId: source.id, currentCharges: 3, unitCostCredits: 0 }).returning())[0].id;
    else await tx.insert(campaignCharacterItem).values({ characterId: f.heroId, itemId: source.id, quantity: 2, unitCostCredits: 0 });
    const resource = async () => mode === "charges"
      ? (await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, instanceId!)))[0].currentCharges
      : (await tx.select().from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, f.heroId), eq(campaignCharacterItem.itemId, source.id))))[0]?.quantity ?? 0;
    const states = () => tx.select().from(occurrence).where(eq(occurrence.encounterId, f.encounterId));
    const other = (await states()).find(({ characterId }) => characterId === f.occurrences[1])!.localStateJson;
    const targetBefore = (await states()).find(({ characterId }) => characterId === f.occurrences[0])!.localStateJson as Record<string, unknown>;
    await tx.update(occurrence).set({ localStateJson: { ...targetBefore, health: { totalDamage: 6, poolDamage: { "fixture-head": 3 } } } }).where(eq(occurrence.characterId, f.occurrences[0]));
    await recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: "item", sourceRef: `item:${source.id}`,
      mode: "automatic-no-roll", governing: null, effectScaling: {}, initiativeCost: 4, reason: "Explicit fixture timing for the authored item: four Initiative." });
    await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.heroId)));
    const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "item", sourceRef: `item:${source.id}`,
      sourceInstanceId: instanceId, actionKind: "item-use", windowKind: "ordinary", godNotes: "Explicit isolated timing ruling: item use takes four Initiative." });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
    const pendingId = await commitActionDeclarationInTransaction(tx, f.context, f.player, id);
    assert.equal(await commitActionDeclarationInTransaction(tx, f.context, f.player, id), pendingId);
    assert.equal(await resource(), mode === "charges" ? 3 : 2);
    await assert.rejects(applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id), /complete/);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    await assert.rejects(applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id), /Combat is paused/);
    assert.equal(await resource(), mode === "charges" ? 3 : 2);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id)).status, "applied");
    assert.equal(await resource(), mode === "charges" ? 2 : 1);
    const after = await states();
    assert.equal((after.find(({ characterId }) => characterId === f.occurrences[0])!.localStateJson as { conditions: unknown[] }).conditions.length, 1);
    const target = after.find(({ characterId }) => characterId === f.occurrences[0])!.localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> }; modifiers: unknown[] };
    assert.equal(target.modifiers.length, 1);
    assert.equal(target.health.totalDamage, 3);
    assert.equal(target.health.poolDamage["fixture-head"], 0);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.occurrences[0])!.normalTotalInitiative, 19);
    assert.deepEqual(after.find(({ characterId }) => characterId === f.occurrences[1])!.localStateJson, other);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 0);
    throw rollback;
  }), (error) => error === rollback);
});

test("owned activated Ability shares its retained use-limit ledger with combat and applies one condition", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "ability-limit");
    await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
    const [ability] = await tx.insert(derivedAbility).values({ name: "Limited Mark", acquisitionType: "awarded", activationType: "activated", createdByUserId: f.godId }).returning();
    await tx.insert(campaignAllowedDerivedAbility).values({ campaignId: f.campaignId, derivedAbilityId: ability.id });
    await tx.insert(characterDerivedAbility).values({ characterId: f.heroId, derivedAbilityId: ability.id, acquisitionMethod: "awarded", acquiredByUserId: f.godId });
    await tx.insert(derivedAbilityCost).values({ derivedAbilityId: ability.id, costType: "initiative", amount: 4 });
    await tx.insert(derivedAbilityUseLimit).values({ derivedAbilityId: ability.id, maximumUses: 1, refreshScope: "encounter" });
    await tx.insert(derivedAbilityEffect).values({ derivedAbilityId: ability.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Ability mark", description: "One encounter use", duration: { kind: "scene" } } });
    const sourceRef = `derived-ability:${ability.id}`;
    await recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: "derived-ability", sourceRef,
      mode: "automatic-no-roll", governing: null, effectScaling: {}, reason: "The authored Mark activates without a Roll." });
    await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.heroId)));
    const draft = { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "derived-ability" as const, sourceRef, actionKind: "ability-use", windowKind: "ordinary" as const };
    const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, draft);
    await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
    const pendingId = await commitActionDeclarationInTransaction(tx, f.context, f.player, id);
    assert.equal(await commitActionDeclarationInTransaction(tx, f.context, f.player, id), pendingId);
    assert.equal((await tx.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, f.heroId))).length, 1);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id)).status, "applied");
    const again = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, draft);
    await lockActionDeclarationInTransaction(tx, f.context, f.player, again);
    await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.player, again), /exhausted/);
    assert.equal((await tx.select().from(characterDerivedAbilityUse).where(eq(characterDerivedAbilityUse.characterId, f.heroId))).length, 1);
    const [target] = await tx.select().from(occurrence).where(eq(occurrence.characterId, f.occurrences[0]));
    assert.equal((target.localStateJson as { conditions: unknown[] }).conditions.length, 1);
    throw rollback;
  }), (error) => error === rollback);
});

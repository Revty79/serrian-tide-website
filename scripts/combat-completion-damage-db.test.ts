import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { itemPower, itemPowerEffect, itemPowerResource, weaponProfile } from "@/db/item-schema";
import { campaignCharacterItemInstance, campaignCharacterSkillAllocation, campaignCharacterAttribute, campaignCharacterActiveModifier } from "@/db/realm-schema";
import { campaignSessionEncounterInitiative as runtime, campaignSessionEncounterInitiativeParticipant as participant,
  campaignSessionEncounterParticipant as occurrence, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionEncounterEffect as effect, campaignSessionEncounterEffectPlan as plan, campaignSessionPeriodicHealthEffect as periodic, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { declareDefenseInterventionInTransaction, resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { applyRoutineCombatConsequencesInTransaction, generateActionEffectPlanInTransaction, approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction, ruleOrdinaryAttackConsequenceInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_DAMAGE_FIXTURE");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof completionServiceFixture>>;

test("ordinary damage freezes STR and active bonuses and counts the selected weapon passive once", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "damage-modifiers");
    await tx.insert(campaignCharacterAttribute).values({ characterId: f.heroId, attributeKey: "STR", value: 35 });
    const [passive] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Flaming Edge", description: "Selected weapon passive damage fixture", activationLabel: "", trigger: "passive", resolutionMode: "automatic", requiredEquipmentState: "wielded", resourceCostKind: "none", sortOrder: 0 }).returning();
    const [passiveEffect] = await tx.insert(itemPowerEffect).values({ itemPowerId: passive.id, sortOrder: 0, schemaVersion: 2,
      effectJson: { kind: "modifier.apply", label: "Flaming Edge", channel: "damage", targetKey: "self", amount: 2, duration: { kind: "until-removed" } } }).returning();
    await tx.insert(campaignCharacterActiveModifier).values([
      { characterId: f.heroId, label: "General damage bonus", modifierChannel: "damage", targetKey: "self", amount: 3, sourceKind: "god", sourceId: "fixture", sourceName: "Fixture", durationKind: "scene", durationLabel: "Scene" },
      { characterId: f.heroId, label: "Flaming Edge", modifierChannel: "damage", targetKey: "self", amount: 2, sourceKind: "item", sourceId: String(f.weaponId), sourceName: "Fixture", sourceEffectKey: `power:${passive.id}:effect:${passiveEffect.id}`, durationKind: "until-removed", durationLabel: "While wielded" },
    ]);
    await setActor(tx, f, f.heroId, 22);
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: 70 });
    await tx.update(campaignCharacterAttribute).set({ value: 70 }).where(and(eq(campaignCharacterAttribute.characterId, f.heroId), eq(campaignCharacterAttribute.attributeKey, "STR")));
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await advance(tx, f, 18);
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration);
    const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
    const calculation = row.calculatedValueJson as { authoredBase: number; weaponHitDamage: number; damageModifiers: { attributeModifier: number; activeModifier: number }; netDamage: number };
    assert.equal(calculation.authoredBase, 4);
    assert.equal(calculation.damageModifiers.attributeModifier, 2);
    assert.equal(calculation.damageModifiers.activeModifier, 3);
    assert.equal(calculation.weaponHitDamage, 2);
    assert.equal(calculation.netDamage, 13);
    for (let retry = 0; retry < 2; retry++) await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, declaration);
    assert.equal((await health(tx, f, f.occurrences[0])).health.totalDamage, 13);
    throw rollback;
  }), (error) => error === rollback);
});
test("negative damage modifiers apply to the complete damage sum before clamping at zero", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "negative-damage-modifier");
    await tx.insert(campaignCharacterActiveModifier).values({ characterId: f.heroId, label: "Damage penalty", modifierChannel: "damage", targetKey: "self", amount: -10,
      sourceKind: "god", sourceId: "fixture", sourceName: "Fixture", durationKind: "scene", durationLabel: "Scene" });
    await setActor(tx, f, f.heroId, 22);
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: 70 });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await advance(tx, f, 18);
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration);
    const [row] = await tx.select().from(effect).where(eq(effect.planId, planId));
    const calculation = row.calculatedValueJson as { authoredBase: number; extraSuccesses: number; grossDamage: number; netDamage: number };
    assert.equal(calculation.authoredBase, 4); assert.equal(calculation.extraSuccesses, 2);
    assert.equal(calculation.grossDamage, 0); assert.equal(calculation.netDamage, 0);
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, declaration)).status, "applied");
    assert.equal((await health(tx, f, f.occurrences[0])).health.totalDamage, 0);
    throw rollback;
  }), (error) => error === rollback);
});
async function advance(tx: Tx, f: Fixture, point: number) {
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, point));
}
async function setActor(tx: Tx, f: Fixture, id: number, value: number, status: "active" | "holding" | "passed" | "suspended" = "active") {
  await tx.update(participant).set({ participationStatus: status, currentInitiative: value, normalTotalInitiative: value })
    .where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
}
async function health(tx: Tx, f: Fixture, id: number) {
  return (await tx.select().from(occurrence).where(and(eq(occurrence.encounterId, f.encounterId), eq(occurrence.characterId, id))))[0].localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> }; defeat?: { defeatValueXp: number; awards: unknown[] }; injuries?: unknown[] };
}

test("Rowan's owned weapon/Skill Roll 90 and failed Block 20 derive 11/3 fatal head damage without narration or a defeat override", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "rowan-first-hit");
    await tx.update(weaponProfile).set({ damage: "6", initiativeCost: 6 }).where(eq(weaponProfile.itemId, f.weaponId));
    await tx.insert(campaignCharacterSkillAllocation).values({ characterId: f.heroId, skillId: f.skillId, points: 5 });
    await setActor(tx, f, f.heroId, 26);
    await setActor(tx, f, f.occurrences[0], 22, "holding");
    await tx.update(runtime).set({ timelineInitiative: 26 }).where(eq(runtime.encounterId, f.encounterId));
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId, initiativeCost: 6 });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    const pendingId = await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: 90 });
    const [roll] = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.pendingActionId, pendingId));
    assert.equal((roll.mechanicalSnapshot as { resolution: { originalTarget: number } }).resolution.originalTarget, 40);
    const [window] = await tx.select().from(opportunity).where(eq(opportunity.declarationId, declaration));
    await advance(tx, f, 22);
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
    await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType: "block", protectedTargetCharacterId: f.occurrences[0], sourceRef: "fixture-shortsword" }, { method: "entered", enteredTotal: 20 });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await assert.rejects(generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration), /Initiative action is complete/);
    assert.equal((await health(tx, f, f.occurrences[0])).health.totalDamage, 0);
    await advance(tx, f, 20);
    const id = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration, { targetParticipantId: f.occurrences[0], hitLocationNumber: 0,
      reason: "G.O.D. selects the authored head location." });
    const [proposal] = await tx.select().from(effect).where(eq(effect.planId, id));
    assert.equal((proposal.finalValueJson as { effect: { amount: number } }).effect.amount, 11);
    await approveActionEffectPlanInTransaction(tx, f.context, f.god, id);
    assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, id), "applied");
    assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, id), "applied");
    const target = await health(tx, f, f.occurrences[0]);
    assert.equal(target.health.totalDamage, 11);
    assert.equal(target.health.poolDamage["fixture-head"], 11);
    assert.equal(target.defeat?.defeatValueXp, null, "XP value/credit/distribution remain separately authorized.");
    assert.deepEqual(target.defeat?.awards, []);
    assert.equal(target.injuries, undefined, "Narration is optional and does not determine death.");
    assert.equal((target as unknown as { combatCondition: { status: string } }).combatCondition.status, "dead");
    assert.equal((await health(tx, f, f.occurrences[1])).health.totalDamage, 0);
    assert.equal((await loadInitiativeEngineInTransaction(tx, f.encounterId)).participants.find(({ characterId }) => characterId === f.occurrences[0])?.participationStatus, "suspended");
    throw rollback;
  }), (error) => error === rollback);
});

for (const [armor, soak, expectedDamage] of [[2, 1, 3], [6, 1, 0], [null, null, 6], [undefined, undefined, 6], ["", " ", 6], [0, 0, 6]] as const) test(`normal location protection ${String(armor)} / ${String(soak)} applies ${expectedDamage} damage exactly once`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, `armor-${armor}`);
    await tx.update(occurrence).set({ creatureSnapshotJson: { ...f.creatureSnapshot,
      hpPools: [{ canonicalId: "fixture-body", poolName: "Body", maximumHp: 15 }], hitLocations: [{ hitLocationNumber: 0, locationName: "Body", hpPoolCanonicalId: "fixture-body", naturalArmor: armor, soak }] } })
      .where(eq(occurrence.characterId, f.occurrences[0]));
    await setActor(tx, f, f.heroId, 22);
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: 70 });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await advance(tx, f, 18);
    const id = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration);
    assert.equal((await tx.select().from(plan).where(eq(plan.id, id)))[0].status, expectedDamage > 0 ? "calculated" : "applied",
      "A fully absorbed hit finishes automatically with no applicable damage.");
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, declaration)).status, "applied");
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, declaration)).status, "applied");
    assert.equal((await health(tx, f, f.occurrences[0])).health.totalDamage, expectedDamage);
    assert.equal((await health(tx, f, f.occurrences[0])).health.poolDamage["fixture-body"] ?? 0, expectedDamage);
    assert.equal((await health(tx, f, f.occurrences[0])).defeat, undefined);
    throw rollback;
  }), (error) => error === rollback);
});

for (const absorbed of [false, true]) test(`ordinary Weapon-Hit Powers preserve riders and spend each exact Charge cost once; absorbed=${absorbed}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, `weapon-hit-${absorbed}`);
    await tx.update(occurrence).set({ creatureSnapshotJson: { ...f.creatureSnapshot,
      hpPools: [{ canonicalId: "fixture-body", poolName: "Body", maximumHp: 30 }],
      hitLocations: [{ hitLocationNumber: 0, locationName: "Body", hpPoolCanonicalId: "fixture-body", naturalArmor: absorbed ? "100" : "0", soak: "0" }] } })
      .where(eq(occurrence.characterId, f.occurrences[0]));
    const [instance] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.heroId, itemId: f.weaponId, currentCharges: 5, equipmentState: "wielded", unitCostCredits: 0 }).returning();
    await tx.insert(itemPowerResource).values({ itemId: f.weaponId, maximumCharges: 5 });
    const [charged] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Charged Edge", description: "Fixture Weapon-Hit Power", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 1, resolutionMode: "weapon-hit", sortOrder: 0 }).returning();
    const [second] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Second Edge", description: "Second fixture Weapon-Hit Power", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 2, resolutionMode: "weapon-hit", sortOrder: 1 }).returning();
    const passive = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Heavy Edge", description: "Wielded passive damage", trigger: "passive", activationLabel: "", resourceCostKind: "none", resolutionMode: "automatic", requiredEquipmentState: "wielded", sortOrder: 2 }).returning();
    await tx.insert(itemPowerEffect).values([
      { itemPowerId: charged.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 2, application: "localized" } },
      { itemPowerId: charged.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 3, application: "localized", timing: { mode: "over-time", frequency: "combat-steps", applications: 2, firstApplication: "next-interval" } } },
      { itemPowerId: charged.id, sortOrder: 2, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Marked", description: "Weapon-Hit rider", duration: { kind: "scene" } } },
      { itemPowerId: second.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 1, application: "area" } },
      { itemPowerId: second.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "modifier.apply", label: "Staggered", channel: "initiative", targetKey: "self", amount: -1, duration: { kind: "scene" } } },
      { itemPowerId: passive[0].id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "modifier.apply", label: "Heavy Edge", channel: "damage", targetKey: "self", amount: 1, duration: { kind: "until-removed" } } },
    ]);
    await setActor(tx, f, f.heroId, 22);
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId, sourceInstanceId: instance.id });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: 70 });
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, instance.id)))[0].currentCharges, 5, "Weapon-Hit Charges wait for the consequence stage.");
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await advance(tx, f, 18);
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration);
    const [storedPlan] = await tx.select().from(plan).where(eq(plan.id, planId));
    const source = storedPlan.sourceSnapshotJson as { authoredData: { itemPowerItemId: number; itemPowerResourceSource: boolean }; resourceCosts: Array<{ key: string; amount: number; commitAt: string }> };
    assert.equal(source.authoredData.itemPowerItemId, f.weaponId);
    assert.equal(source.authoredData.itemPowerResourceSource, true);
    assert.deepEqual(source.resourceCosts.map(({ key, amount, commitAt }) => ({ key, amount, commitAt })), [
      { key: `item-power:${charged.id}:charges`, amount: 1, commitAt: "consequence" },
      { key: `item-power:${second.id}:charges`, amount: 2, commitAt: "consequence" },
    ]);
    const rows = await tx.select().from(effect).where(eq(effect.planId, planId));
    const base = rows.find(({ effectKey }) => effectKey === `ordinary-attack:target:${f.occurrences[0]}`)!;
    const costRows = rows.filter(({ effectType }) => effectType === "resource.item-charges");
    assert.deepEqual(costRows.map(({ status }) => status), ["calculated", "calculated"]);
    assert.equal(base.status, absorbed ? "declined" : "calculated");
    assert.equal(rows.some(({ effectKey }) => effectKey.includes(`item-power:${charged.id}:effect:`)), true);
    assert.equal(rows.some(({ effectKey }) => effectKey.includes(`item-power:${second.id}:effect:`)), true);
    assert.equal(rows.some(({ effectKey }) => effectKey.includes(`item-power:${passive[0].id}:effect:`)), false);
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, declaration)).status, "applied");
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, instance.id)))[0].currentCharges, 2);
    const target = await health(tx, f, f.occurrences[0]);
    const conditions = target as unknown as { conditions: Array<{ name: string }>; modifiers: Array<{ label: string }>; health: { totalDamage: number; poolDamage: Record<string, number> } };
    assert.equal(conditions.conditions.some(({ name }) => name === "Marked"), true);
    assert.equal(conditions.modifiers.some(({ label }) => label === "Staggered"), true);
    assert.equal(conditions.modifiers.some(({ label }) => label === "Heavy Edge"), false);
    assert.equal((await tx.select().from(periodic).where(and(eq(periodic.encounterId, f.encounterId), eq(periodic.characterId, f.occurrences[0])))).length, 1);
    assert.equal(conditions.health.totalDamage > 1, !absorbed, "A fully absorbed base hit still keeps its separate Weapon-Hit rider active.");
    throw rollback;
  }), (error) => error === rollback);
});

test("ordinary failed Weapon-Hit attacks decline Charge costs without applying riders", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "weapon-hit-miss");
    const [instance] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.heroId, itemId: f.weaponId, currentCharges: 4, equipmentState: "wielded", unitCostCredits: 0 }).returning();
    await tx.insert(itemPowerResource).values({ itemId: f.weaponId, maximumCharges: 4 });
    const [power] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Miss Edge", description: "Failed Weapon-Hit fixture", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 2, resolutionMode: "weapon-hit", sortOrder: 0 }).returning();
    await tx.insert(itemPowerEffect).values({ itemPowerId: power.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Should Not Apply", description: "Miss rider", duration: { kind: "scene" } } });
    await setActor(tx, f, f.heroId, 22);
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId, sourceInstanceId: instance.id });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: 40 });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await advance(tx, f, 18);
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration);
    const rows = await tx.select().from(effect).where(eq(effect.planId, planId));
    assert.equal(rows.find(({ effectType }) => effectType === "resource.item-charges")?.status, "declined");
    assert.equal(rows.find(({ effectKey }) => effectKey.includes("item-power:"))?.status, "declined");
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, declaration)).status, "applied");
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, instance.id)))[0].currentCharges, 4);
    throw rollback;
  }), (error) => error === rollback);
});

test("ordinary Weapon-Hit ruling refreshes every rider and exact Charge row before application", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "weapon-hit-ruling");
    const [instance] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.heroId, itemId: f.weaponId, currentCharges: 3, equipmentState: "wielded", unitCostCredits: 0 }).returning();
    await tx.insert(itemPowerResource).values({ itemId: f.weaponId, maximumCharges: 3 });
    const [power] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Ruling Edge", description: "Ruling Weapon-Hit fixture", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 1, resolutionMode: "weapon-hit", sortOrder: 0 }).returning();
    await tx.insert(itemPowerEffect).values([
      { itemPowerId: power.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 2, application: "localized" } },
      { itemPowerId: power.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Ruling Mark", description: "Ruling Weapon-Hit rider", duration: { kind: "scene" } } },
    ]);
    await setActor(tx, f, f.heroId, 22);
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId, sourceInstanceId: instance.id });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: 100 });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await advance(tx, f, 18);
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration);
    assert.equal((await tx.select().from(plan).where(eq(plan.id, planId)))[0].status, "requires-god-ruling");
    await ruleOrdinaryAttackConsequenceInTransaction(tx, f.context, f.god, planId, { targetParticipantId: f.occurrences[0], hitLocationNumber: 0, reason: "The G.O.D. confirms the authored head location and critical consequence." });
    const rows = await tx.select().from(effect).where(eq(effect.planId, planId));
    assert.equal(rows.length, 3, "Localized additive damage is merged into the base row; the Condition and Charge remain separate rows.");
    assert.ok(rows.every(({ status }) => status === "calculated"));
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, declaration)).status, "applied");
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, instance.id)))[0].currentCharges, 2);
    const target = await health(tx, f, f.occurrences[0]);
    const conditions = target as unknown as { conditions: Array<{ name: string }> };
    assert.ok(target.health.totalDamage > 0);
    assert.equal(conditions.conditions.some(({ name }) => name === "Ruling Mark"), true);
    throw rollback;
  }), (error) => error === rollback);
});

for (const depleteAfterPlan of [false, true]) test(`insufficient ordinary Weapon-Hit Charges skip the optional rider and preserve base damage; depleted after plan=${depleteAfterPlan}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "weapon-hit-insufficient-charges");
    const [instance] = await tx.insert(campaignCharacterItemInstance).values({ characterId: f.heroId, itemId: f.weaponId, currentCharges: depleteAfterPlan ? 2 : 1, equipmentState: "wielded", unitCostCredits: 0 }).returning();
    await tx.insert(itemPowerResource).values({ itemId: f.weaponId, maximumCharges: 2 });
    const [power] = await tx.insert(itemPower).values({ itemId: f.weaponId, name: "Hungry Edge", description: "Insufficient Charge fixture", trigger: "weapon-hit", activationLabel: "", resourceCostKind: "shared-charges", resourceCostAmount: 2, resolutionMode: "weapon-hit", sortOrder: 0 }).returning();
    await tx.insert(itemPowerEffect).values([
      { itemPowerId: power.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "condition.apply", name: "Should Not Apply", description: "Insufficient Charge rider", duration: { kind: "scene" } } },
      { itemPowerId: power.id, sortOrder: 1, schemaVersion: 2, effectJson: { kind: "health.damage", amount: 10, application: "localized" } },
    ]);
    await setActor(tx, f, f.heroId, 22);
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId, sourceInstanceId: instance.id });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: 70 });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await advance(tx, f, 18);
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration);
    if (depleteAfterPlan) await tx.update(campaignCharacterItemInstance).set({ currentCharges: 1 }).where(eq(campaignCharacterItemInstance.id, instance.id));
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, declaration, planId)).status, "applied");
    assert.equal((await tx.select().from(plan).where(eq(plan.id, planId)))[0].status, "applied");
    assert.equal((await tx.select().from(campaignCharacterItemInstance).where(eq(campaignCharacterItemInstance.id, instance.id)))[0].currentCharges, 1);
    const target = await health(tx, f, f.occurrences[0]);
    const conditions = target as unknown as { conditions: Array<{ name: string }> };
    assert.equal(target.health.totalDamage, 6);
    assert.equal(conditions.conditions.some(({ name }) => name === "Should Not Apply"), false);
    throw rollback;
  }), (error) => error === rollback);
});

for (const reversed of [false, true]) test(`simultaneous completed attacks survive defeat in either application order; reversed=${reversed}`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, `simultaneous-outcome-${reversed}`);
    const declarations: number[] = [];
    for (const id of f.occurrences) await setActor(tx, f, id, 22);
    for (const [index, id] of f.occurrences.entries()) {
      const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, { ...completionDraft(id, f.occurrences[1 - index]), sourceKind: "creature-attack", sourceRef: "fixture-shortsword" });
      await lockActionDeclarationInTransaction(tx, f.context, f.god, declaration);
      await commitActionDeclarationInTransaction(tx, f.context, f.god, declaration, { method: "entered", enteredTotal: 55 });
      declarations.push(declaration);
    }
    for (const declaration of declarations) {
      const windows = await tx.select().from(opportunity).where(eq(opportunity.declarationId, declaration));
      assert.ok(windows.every((window) => window.status !== "pending"), "Both actors are busy; the authoritative service excludes their response opportunities.");
      await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    }
    await advance(tx, f, 18);
    const plans = [];
    for (const [index, declaration] of declarations.entries()) plans.push(await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration,
      { targetParticipantId: f.occurrences[1 - index], hitLocationNumber: 0, finalDamage: index === 0 ? 31 : 4, reason: "Explicit simultaneous-outcome fixture damage override." }));
    for (const id of reversed ? [...plans].reverse() : plans) {
      await approveActionEffectPlanInTransaction(tx, f.context, f.god, id);
      assert.equal(await applyActionEffectPlanInTransaction(tx, f.context, f.god, id), "applied");
    }
    assert.equal((await health(tx, f, f.occurrences[0])).health.totalDamage, 4);
    assert.equal((await health(tx, f, f.occurrences[1])).health.totalDamage, 31);
    const engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    assert.equal(engine.participants.find(({ characterId }) => characterId === f.occurrences[1])?.participationStatus, "suspended");
    assert.ok(engine.pendingActions.filter(({ actorCharacterId }) => f.occurrences.includes(actorCharacterId)).every(({ status }) => status === "completed"));
    throw rollback;
  }), (error) => error === rollback);
});

for (const critical of [1, 100]) test(`critical ${critical} remains an explicit ruling even with no defenders`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, `critical-${critical}`);
    await setActor(tx, f, f.heroId, 22);
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: critical });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await advance(tx, f, 18);
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, declaration)).status, "requires-god-ruling");
    assert.equal((await health(tx, f, f.occurrences[0])).health.totalDamage, 0);
    throw rollback;
  }), (error) => error === rollback);
});

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { weaponProfile } from "@/db/item-schema";
import { campaignCharacterSkillAllocation } from "@/db/realm-schema";
import { campaignSessionEncounterInitiative as runtime, campaignSessionEncounterInitiativeParticipant as participant,
  campaignSessionEncounterParticipant as occurrence, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionEncounterEffect as effect, campaignSessionEncounterEffectPlan as plan, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { declareDefenseInterventionInTransaction, resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { applyRoutineCombatConsequencesInTransaction, generateActionEffectPlanInTransaction, approveActionEffectPlanInTransaction, applyActionEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_DAMAGE_FIXTURE");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof completionServiceFixture>>;
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

for (const armor of [2, 6]) test(`normal location uses exact authored protection ${armor}+1 and records actual damage once`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, `armor-${armor}`);
    await tx.update(occurrence).set({ creatureSnapshotJson: { ...f.creatureSnapshot,
      hpPools: [{ canonicalId: "fixture-body", poolName: "Body", maximumHp: 15 }], hitLocations: [{ hitLocationNumber: 0, locationName: "Body", hpPoolCanonicalId: "fixture-body", naturalArmor: armor, soak: 1 }] } })
      .where(eq(occurrence.characterId, f.occurrences[0]));
    await setActor(tx, f, f.heroId, 22);
    const declaration = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]), sourceKind: "weapon", weaponItemId: f.weaponId });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, declaration);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, declaration, { method: "entered", enteredTotal: 70 });
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, declaration);
    await advance(tx, f, 18);
    const id = await generateActionEffectPlanInTransaction(tx, f.context, f.god, declaration);
    assert.equal((await tx.select().from(plan).where(eq(plan.id, id)))[0].status, armor === 2 ? "calculated" : "applied",
      "A fully absorbed hit finishes automatically with no applicable damage.");
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, declaration)).status, "applied");
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, declaration)).status, "applied");
    assert.equal((await health(tx, f, f.occurrences[0])).health.totalDamage, armor === 2 ? 3 : 0);
    assert.equal((await health(tx, f, f.occurrences[0])).defeat, undefined);
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
      for (const window of await tx.select().from(opportunity).where(eq(opportunity.declarationId, declaration))) await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id,
        { decision: "ineligible", reason: "Fixture ruling: neither notices the simultaneous attack in time to defend." });
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

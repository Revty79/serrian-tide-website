import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { skill } from "@/db/skill-schema";
import { campaignCharacterAttribute, campaignCharacterProfile, campaignCharacterSkillAllocation, campaignCharacterSpellDocument } from "@/db/realm-schema";
import { campaignSessionEncounterInitiativeParticipant as participant, campaignSessionEncounterActionDeclaration as declaration, campaignSessionRoll,
  campaignSessionEncounterParticipant as occurrence } from "@/db/tabletop-operations-schema";
import { createEmptySpell, createContainer } from "@/features/spell-construction/utilities/spellFactory";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction,
  cancelActionDeclarationInTransaction, interruptActionDeclarationInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { recordCombatSourceResolutionInTransaction, type CombatSourceResolutionRuling } from "@/features/tabletop-operations/combat-source-resolution-service";
import { reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { declareDefenseInterventionInTransaction, resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { campaignSessionEncounterResponderOpportunity as opportunity, campaignSessionEncounterInitiative as runtime } from "@/db/tabletop-operations-schema";
import { applyRoutineCombatConsequencesInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, holdParticipantInitiativeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline, advanceInitiativeRound } from "@/features/tabletop-operations/initiative-runtime";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";
import { projectSealedCombatManaInTransaction } from "@/features/tabletop-operations/combat-resource-projection-service";
import { parseLockedActionDeclarationSnapshot } from "@/features/tabletop-operations/action-declaration";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rollback = new Error("ROLLBACK_SPELL_FIXTURE");

async function fixture(tx: Tx, name: string, fixedArcBolt: boolean, mode: CombatSourceResolutionRuling["mode"] = "attribute-roll", multi = false) {
  const f = await completionServiceFixture(tx, name);
  await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
  const [spellcraft, channeling] = await tx.insert(skill).values([
    { name: "Spellcraft", classification: "standard", tier: 1, primaryAttribute: "INT", createdByUserId: f.godId },
    { name: "Channeling", classification: "standard", tier: 1, primaryAttribute: "WIS", createdByUserId: f.godId },
  ]).returning();
  const [castAllocation] = await tx.insert(campaignCharacterSkillAllocation).values([{ characterId: f.heroId, skillId: spellcraft.id, points: 1 }, { characterId: f.heroId, skillId: channeling.id, points: 20 }]).returning();
  await tx.update(campaignCharacterProfile).set({ baseMagicSteps: 4 }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  await tx.insert(campaignCharacterAttribute).values([{ characterId: f.heroId, attributeKey: "INT", value: 60 }, { characterId: f.heroId, attributeKey: "CON", value: 40 }]);
  const spell = { ...createEmptySpell(), name: "Arc Bolt", castingSystem: "Spellcraft" as const, sphere: "Force", frameworkSkillId: spellcraft.id,
    containers: [{ ...createContainer("target"), id: "bolt-target", ...(multi ? { multiTarget: { ruleId: "multi-target", additionalTargets: 1 } } : {}),
      effects: [{ id: "bolt-damage", ruleId: "damage", quantity: 2, description: "Explicit fixture bolt" }] }] };
  const [saved] = await tx.insert(campaignCharacterSpellDocument).values({ characterId: f.heroId, documentId: spell.id, name: spell.name, tradition: spell.tradition, inSpellbook: true, documentJson: JSON.stringify(spell) }).returning();
  const sourceRef = `personal:${saved.id}`;
  await recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: "spell", sourceRef,
    mode, governing: mode === "skill-roll" ? { kind: "skill", allocationId: castAllocation.id } : mode === "automatic-no-roll" || mode === "manual-god-ruling" ? null : { kind: "attribute", attributeKey: "INT" },
    effectScaling: mode === "automatic-no-roll" || mode === "manual-god-ruling" ? {} : { "bolt-damage": "per-success" }, reason: "Explicit isolated casting mode and authored damage scaling." });
  await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.heroId)));
  const declarationId = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]),
    sourceKind: "spell", sourceRef: `spell:${sourceRef}`, label: "Arc Bolt", actionKind: "spell-cast", windowKind: "ordinary", targetCharacterIds: multi ? f.occurrences : [f.occurrences[0]],
    sourcePayload: { selections: { targetGroups: { "bolt-target": multi ? f.occurrences : [f.occurrences[0]] }, applications: Object.fromEntries(f.occurrences.map((id) => [`bolt-damage:${id}`, { hitLocationNumber: 0 }])) } } });
  await lockActionDeclarationInTransaction(tx, f.context, f.player, declarationId);
  let locked = parseLockedActionDeclarationSnapshot((await tx.select().from(declaration).where(eq(declaration.id, declarationId)))[0].lockedSnapshotJson);
  if (fixedArcBolt) {
    // Brannan supplied 3 Mana / 4 Initiative for this synthetic trace. Exercise
    // canonical owned spell loading above; override only this isolated snapshot.
    locked = { ...locked, initiativeCost: 4, authoredSource: { ...locked.authoredSource!,
      resourceCosts: locked.authoredSource!.resourceCosts.map((cost) => ({ ...cost, amount: 3 })),
      authoredData: { ...locked.authoredSource!.authoredData, fixtureRuling: "Supplied fixed Arc Bolt costs: 3 Mana and 4 Initiative; production formula unchanged." } } };
    await tx.update(declaration).set({ lockedSnapshotJson: locked }).where(eq(declaration.id, declarationId));
  }
  const mana = (await readActiveManaInTransaction(tx, f.heroId)).pools.find(({ system }) => system === "Spellcraft")!;
  assert.equal(mana.currentMana, 20);
  return { ...f, declarationId, locked, savedSpellId: saved.id, manaCost: locked.authoredSource!.resourceCosts[0].amount!, initiativeCost: locked.initiativeCost };
}

for (const outcome of ["failed", "successful", "cancelled", "interrupted"] as const) test(`owned Spell ${outcome}: Mana spends at start, immutable Roll, no refund or duplicate application`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, outcome, outcome !== "successful");
    const rolled = outcome === "failed" ? 12 : 70;
    const id = await commitActionDeclarationInTransaction(tx, f.context, f.player, f.declarationId, { method: "entered", enteredTotal: rolled });
    const mana = () => readActiveManaInTransaction(tx, f.heroId).then((view) => view.pools.find(({ system }) => system === "Spellcraft")!.currentMana);
    assert.equal(await mana(), 20 - f.manaCost);
    assert.equal(await commitActionDeclarationInTransaction(tx, f.context, f.player, f.declarationId), id);
    const [roll] = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.pendingActionId, id));
    assert.equal(roll.resultTotal, rolled);
    assert.equal((roll.mechanicalSnapshot as { resolution: { originalTarget: number } }).resolution.originalTarget, 40);
    if (outcome === "cancelled") await cancelActionDeclarationInTransaction(tx, f.context, f.god, f.declarationId, "Voluntarily stop the begun cast.");
    else if (outcome === "interrupted") await interruptActionDeclarationInTransaction(tx, f.context, f.god, f.declarationId, "Fixture interruption after casting began.");
    else {
      const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
      await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 22 - f.initiativeCost));
      for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, f.declarationId)).status, "applied");
      const [target] = await tx.select().from(occurrence).where(and(eq(occurrence.encounterId, f.encounterId), eq(occurrence.characterId, f.occurrences[0])));
      assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, outcome === "failed" ? 0 : 8);
    }
    assert.equal(await mana(), 20 - f.manaCost);
    throw rollback;
  }), (error) => error === rollback);
});

for (const mode of ["skill-roll", "automatic-no-roll", "manual-god-ruling"] as const) test(`explicit ${mode} Spell mode uses the owned source and preserves its execution boundary`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, mode, false, mode);
    await commitActionDeclarationInTransaction(tx, f.context, f.player, f.declarationId, { method: "entered", enteredTotal: 70 });
    const rolls = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId));
    assert.equal(rolls.length, mode === "skill-roll" ? 1 : 0);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 22 - f.initiativeCost));
    const result = await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, f.declarationId);
    assert.equal(result.status, mode === "manual-god-ruling" ? "requires-god-ruling" : "applied");
    assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools[0].currentMana, 20 - f.manaCost);
    throw rollback;
  }), (error) => error === rollback);
});

test("opposed multi-target Spell: one authorized Dodge protects only its exact target and preserves the other target's effect", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "opposed-multi", false, "opposed-roll", true);
    for (const id of f.occurrences) await tx.update(participant).set({ participationStatus: "holding" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, id)));
    await commitActionDeclarationInTransaction(tx, f.context, f.player, f.declarationId, { method: "entered", enteredTotal: 55 });
    const opportunities = await tx.select().from(opportunity).where(eq(opportunity.declarationId, f.declarationId));
    const dodge = opportunities.find(({ responderCharacterId }) => responderCharacterId === f.occurrences[0])!;
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, dodge.id, { decision: "allow" });
    await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: dodge.id, reactionType: "dodge", protectedTargetCharacterId: f.occurrences[0] }, { method: "entered", enteredTotal: 90 });
    for (const other of opportunities.filter(({ id }) => id !== dodge.id)) {
      await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, other.id, { decision: "allow" });
      await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: other.id, reactionType: "no-reaction", protectedTargetCharacterId: other.responderCharacterId });
    }
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.player, f.declarationId);
    const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 22 - f.initiativeCost));
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, f.declarationId)).status, "applied");
    const damage: number[] = [];
    for (const id of f.occurrences) damage.push(((await tx.select().from(occurrence).where(eq(occurrence.characterId, id)))[0].localStateJson as { health: { totalDamage: number } }).health.totalDamage);
    assert.deepEqual(damage, [0, 4]);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 2);
    throw rollback;
  }), (error) => error === rollback);
});

test("rejected casting Rolls roll back the entire start, and paused sealed casts preserve Mana privacy through Resume", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "sealed-spell", true);
    await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.player, f.declarationId, { method: "entered", enteredTotal: 101 }), /Roll|result|100/);
    assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools[0].currentMana, 20);
    await tx.update(participant).set({ participationStatus: "active" }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.occurrences[0])));
    const pendingId = await commitActionDeclarationInTransaction(tx, f.context, f.player, f.declarationId, { method: "entered", enteredTotal: 12 });
    const actual = await readActiveManaInTransaction(tx, f.heroId);
    assert.equal(actual.pools[0].currentMana, 17);
    assert.equal((await projectSealedCombatManaInTransaction(tx, actual)).pools[0].currentMana, 20);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: true, expectedRevision: 0 });
    await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.player, f.declarationId), /Combat is paused/);
    assert.equal((await projectSealedCombatManaInTransaction(tx, await readActiveManaInTransaction(tx, f.heroId))).pools[0].currentMana, 20);
    await setCombatFrozenInTransaction(tx, f.encounterId, f.god, { frozen: false, expectedRevision: 1 });
    await holdParticipantInitiativeInTransaction(tx, f.context, f.occurrences[0]);
    assert.equal(await commitActionDeclarationInTransaction(tx, f.context, f.player, f.declarationId), pendingId);
    assert.equal((await projectSealedCombatManaInTransaction(tx, await readActiveManaInTransaction(tx, f.heroId))).pools[0].currentMana, 17);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 1);
    throw rollback;
  }), (error) => error === rollback);
});

test("a locked Spell removed from the exact owner's Spellbook cannot begin or spend Mana", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "ownership-recheck", true);
    await tx.update(campaignCharacterSpellDocument).set({ inSpellbook: false }).where(eq(campaignCharacterSpellDocument.id, f.savedSpellId));
    await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.player, f.declarationId), /no longer in.*Spellbook/);
    assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools[0].currentMana, 20);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 0);
    throw rollback;
  }), (error) => error === rollback);
});

test("authored concentration carries a begun cast across the round and keeps one Mana cost and original Roll", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await fixture(tx, "concentration-round", false);
    const [saved] = await tx.select().from(campaignCharacterSpellDocument).where(eq(campaignCharacterSpellDocument.id, f.savedSpellId));
    const spell = JSON.parse(saved.documentJson);
    spell.modifiers = [{ id: "focus", ruleId: "concentration", quantity: 2, description: "Two authored concentration points" }];
    await tx.update(campaignCharacterSpellDocument).set({ documentJson: JSON.stringify(spell) }).where(eq(campaignCharacterSpellDocument.id, saved.id));
    await tx.update(participant).set({ participationStatus: "suspended" }).where(eq(participant.encounterId, f.encounterId));
    await tx.update(participant).set({ participationStatus: "active", currentInitiative: 2 }).where(and(eq(participant.encounterId, f.encounterId), eq(participant.characterId, f.heroId)));
    await tx.update(runtime).set({ timelineInitiative: 2 }).where(eq(runtime.encounterId, f.encounterId));
    const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, { ...completionDraft(f.heroId, f.occurrences[0]),
      sourceKind: "spell", sourceRef: `personal:${saved.id}`, actionKind: "spell-cast", windowKind: "ordinary", allowsMultiRound: true,
      sourcePayload: { selections: { targetGroups: { "bolt-target": [f.occurrences[0]] }, applications: { [`bolt-damage:${f.occurrences[0]}`]: { hitLocationNumber: 0 } } } } });
    await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
    const pendingId = await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 12 });
    const engine = () => loadInitiativeEngineInTransaction(tx, f.encounterId);
    let before = await engine();
    // Base 6 minus 4 concentration Mana; the existing practitioner adjustment
    // rounds the casting cost to 1 Mana, with 1 + 4 concentration Initiative.
    assert.equal(before.pendingActions.find(({ id }) => id === pendingId)!.originalInitiativeCost, 5);
    assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools[0].currentMana, 19);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 0));
    before = await engine();
    assert.equal(before.pendingActions.find(({ id }) => id === pendingId)!.remainingInitiativeCost, 3);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeRound(before));
    before = await engine();
    assert.equal(before.runtime.roundNumber, 2);
    assert.equal(before.pendingActions.find(({ id }) => id === pendingId)!.expectedCompletionInitiative, 19);
    await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 19));
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id)).status, "applied");
    assert.equal(await commitActionDeclarationInTransaction(tx, f.context, f.player, id), pendingId);
    assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools[0].currentMana, 19);
    const rolls = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId));
    assert.equal(rolls.length, 1);
    assert.equal(rolls[0].resultTotal, 12);
    throw rollback;
  }), (error) => error === rollback);
});

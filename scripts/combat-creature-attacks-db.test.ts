import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { race } from "@/db/race-schema";
import { itemArmorDamageModifier } from "@/db/item-schema";
import { campaignCharacter, campaignCreatureNpcProfile, campaignCharacterAttribute, campaignCharacterActiveModifier } from "@/db/realm-schema";
import { campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterParticipant as member,
  campaignSessionEncounterInitiativeParticipant as initiative, campaignSessionEncounterEffect as effect,
  campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { campaignSessionEncounterResponderOpportunity as opportunity } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, previewCombatDeclarationInTransaction, reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { parseLockedActionDeclarationSnapshot, type ActionDeclarationDraft } from "@/features/tabletop-operations/action-declaration";
import { recordCombatSourceResolutionInTransaction } from "@/features/tabletop-operations/combat-source-resolution-service";
import { resolveDeclaredDefensesInTransaction, declareDefenseInterventionInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { applyRoutineCombatConsequencesInTransaction, generateActionEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { advanceInitiativeTimeline, passInitiative } from "@/features/tabletop-operations/initiative-runtime";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { protectionPipelineFixture } from "./fixtures/protection-pipeline-fixture";
import { magicCompletionDocument } from './fixtures/magic-completion-fixture';
import { storedIncomingResolution } from '@/features/incoming-effects/effect-proposal';
import { emptyCreatureAbilityAuthoring } from '@/features/creatures/creature-authoring';
import { addLearnedCombatSpell } from './fixtures/combat-learned-spell-fixture';
import { readActiveManaInTransaction } from '@/features/active-state/active-mana-service';

import { creature, creatureAttack } from "@/db/creature-schema";
import { emptyAttackAuthoring, type AttackAuthoring } from "@/features/attacks/attack-authoring";
import { readCreatureAttackDefinitionInTransaction } from "@/features/tabletop-operations/action-source-resolver-service";
import { startCreatureAttackInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true" || !/^postgresql:\/\/[^/]+@127\.0\.0\.1:\d+\/serrian_combat_completion_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof setup>>;
const rollback = new Error("ROLLBACK_CREATURE_ATTACK_FIXTURE");
function scenario(name: string, run: (tx: Tx, f: Fixture) => Promise<void>) {
  test(name, async () => { await assert.rejects(db.transaction(async tx => { await run(tx, await setup(tx)); throw rollback; }), error => { if (error !== rollback) console.error(error); return error === rollback; }); });
}

async function setup(tx: Tx) {
  const f = await completionServiceFixture(tx, "creature-attack-pass3");
  const attack = { ...f.creatureSnapshot.attacks[0], attackName: "Bite", damage: "18", damageType: "Fire", authoring: { ...emptyAttackAuthoring(), initiativeCost: 4, mode: "melee" as const,
    range: { unit: "feet", reach: 5, short: 10, medium: 20, long: 40 }, magical: true } as AttackAuthoring };
  const snapshot = { ...f.creatureSnapshot, attacks: [attack], core: { ...f.creatureSnapshot.core, hpMultiplierSteps: 0, baseMovementSteps: 0, baseMagicSteps: 0 }, attributes: [{ attributeKey: "CON", value: 30 }], hpPools: [{ ...f.creatureSnapshot.hpPools[0], hpPercentage: 100, sortOrder: 0 }], hitLocations: [{ ...f.creatureSnapshot.hitLocations[0], bodyPartsIncluded: "Head", sortOrder: 0 }] };
  await tx.update(member).set({ creatureSnapshotJson: snapshot }).where(eq(member.characterId, f.occurrences[0]));
  const [occurrence] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
  await tx.update(campaignCharacter).set({ isNpc: true, npcKind: "creature" }).where(eq(campaignCharacter.id, f.defenderId));
  await tx.insert(campaignCreatureNpcProfile).values({ characterId: f.defenderId, creatureId: occurrence.creatureId!, baselineSnapshotJson: JSON.stringify(f.creatureSnapshot), currentSnapshotJson: JSON.stringify(snapshot) });
  await tx.insert(campaignCharacterAttribute).values({ characterId: f.defenderId, attributeKey: "STR", value: 99 });
  await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.occurrences[0]));
  return { ...f, attack, snapshot, actor: f.occurrences[0], target: f.occurrences[1], templateId: occurrence.creatureId! };
}
async function persistent(tx: Tx, f: Fixture) {
  await tx.update(initiative).set({ participationStatus: "passed" }).where(eq(initiative.encounterId, f.encounterId));
  f.actor = f.defenderId;
  await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.actor));
}
async function change(tx: Tx, f: Fixture, patch: Record<string, unknown>) {
  const snapshot = { ...f.snapshot, attacks: [{ ...f.attack, ...patch }] };
  if (f.actor < 0) await tx.update(member).set({ creatureSnapshotJson: snapshot }).where(eq(member.characterId, f.actor));
  else await tx.update(campaignCreatureNpcProfile).set({ currentSnapshotJson: JSON.stringify(snapshot) }).where(eq(campaignCreatureNpcProfile.characterId, f.actor));
}
function draft(f: Fixture, target = f.target): ActionDeclarationDraft {
  return { ...completionDraft(f.actor, target), sourceKind: "creature-attack" as const, sourceRef: f.attack.canonicalId,
    sourcePayload: { rangeAttackMode: "melee", rangeDistance: 5, rangeUnit: "feet" } };
}
async function locked(tx: Tx, f: Fixture, value = draft(f)) {
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, value);
  await lockActionDeclarationInTransaction(tx, f.context, f.god, id); return id;
}
async function finish(tx: Tx, f: Fixture, id: number, roll = 70) {
  const pending = await commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: roll });
  assert.equal(await commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: roll }), pending);
  await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, before.pendingActions.find(action => action.id === pending)!.expectedCompletionInitiative));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  return { planId, pending, effects: await tx.select().from(effect).where(eq(effect.planId, planId)) };
}
async function ruling(tx: Tx, f: Fixture, extra = {}) {
  return recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.actor, sourceKind: "creature-attack", sourceRef: f.attack.canonicalId,
    mode: "opposed-roll", governing: { kind: "manual", label: "Bite", originalTarget: 50 }, effectScaling: {}, reason: "Explicit fixture ruling", ...extra });
}
async function local(tx: Tx, id: number) { return (await tx.select().from(member).where(eq(member.characterId, id)))[0].localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> }; conditions: { name: string }[]; modifiers: { label: string }[] }; }
async function apply(tx: Tx, f: Fixture, id: number) { for (let retry = 0; retry < 2; retry++) await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, id); }
const riders: AttackAuthoring["onHitEffects"] = [
  { effectKey: "condition", schemaVersion: 2, sortOrder: 0, effect: { kind: "condition.apply", name: "Creature Mark", description: "Authored hit", duration: { kind: "scene" } } },
  { effectKey: "modifier", schemaVersion: 2, sortOrder: 1, effect: { kind: "modifier.apply", label: "Creature Penalty", channel: "soak", targetKey: "self", amount: -2, duration: { kind: "scene" } } },
  { effectKey: "damage", schemaVersion: 2, sortOrder: 2, effect: { kind: "health.damage", amount: 3, application: "full-body" } },
];

for (const owner of ["direct", "persistent"] as const) {
  const run = (name: string, fn: (tx: Tx, f: Fixture) => Promise<void>) => scenario(`${owner}: ${name}`, async (tx, f) => { if (owner === "persistent") await persistent(tx, f); await fn(tx, f); });
  run('Pass 4 attached Damage/Healing/Condition/Modifier and on-hit effects stay distinct, frozen, cost-free and apply once', async (tx, f) => {
    await change(tx, f, { damageType: 'Slashing', authoring: { ...f.attack.authoring, onHitEffects: riders, magic: { document: magicCompletionDocument() } } });
    const id = await locked(tx, f);
    const frozen = parseLockedActionDeclarationSnapshot((await tx.select().from(declaration).where(eq(declaration.id, id)))[0].lockedSnapshotJson).authoredSource!;
    assert.deepEqual(frozen.resourceCosts, []);
    await change(tx, f, { authoring: { ...f.attack.authoring, magic: null, initiativeCost: 20 } });
    const result = await finish(tx, f, id); assert.equal(result.effects.length, 8);
    const damage = result.effects.find(row => row.effectKey.includes('magic:magic-damage'))!;
    assert.equal(storedIncomingResolution(result.effects.find(row => row.effectKey.startsWith('ordinary-attack:'))!.authoredValueJson)?.input.source.damageType, 'Slashing');
    assert.equal(storedIncomingResolution(damage.authoredValueJson)?.input.source.damageType, 'Fire');
    assert.equal(storedIncomingResolution(damage.authoredValueJson)?.input.source.magical, true);
    await apply(tx, f, id);
    const state = await local(tx, f.target);
    assert.equal(state.health.totalDamage, 26);
    assert.equal(state.conditions.filter(row => row.name === 'Constructed Mark').length, 1);
    assert.equal(state.modifiers.filter(row => row.label === 'Constructed Strength').length, 1);
    assert.equal((await tx.select().from(initiative).where(eq(initiative.characterId, f.actor)))[0].currentInitiative, 18);
    assert.equal(await generateActionEffectPlanInTransaction(tx, f.context, f.god, id), result.planId);
    const beforeExpiry = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, beforeExpiry, passInitiative(beforeExpiry, f.actor));
    const expired = await local(tx, f.target) as { conditions: { name: string; expiredAt?: string }[]; modifiers: { label: string; expiredAt?: string }[]; health: { totalDamage: number } };
    assert.ok(expired.conditions.find(row => row.name === 'Constructed Mark')?.expiredAt);
    assert.ok(expired.modifiers.find(row => row.label === 'Constructed Strength')?.expiredAt);
    await apply(tx, f, id); assert.deepEqual(await local(tx, f.target), expired);
  });
  run('Pass 4 a miss suppresses every constructed effect', async (tx, f) => {
    await change(tx, f, { authoring: { ...f.attack.authoring, magic: { document: magicCompletionDocument() } } });
    const result = await finish(tx, f, await locked(tx, f), 20);
    assert.equal(result.effects.length, 5); assert.ok(result.effects.every(row => row.status === 'declined'));
  });
  run('Pass 4 Ability keeps separate consequences, explicit Mana only, fixed Roll and exact targets', async (tx, f) => {
    const ability = { canonicalId: 'MAGIC-ABILITY', abilityName: 'Constructed Ability', effects: riders,
      authoring: { ...emptyCreatureAbilityAuthoring(), activationType: 'activated' as const, initiativeCost: 4,
        resolutionMode: 'fixed-roll' as const, fixedRollTarget: 50, magic: { document: magicCompletionDocument() },
        costs: owner === 'persistent' ? [{ costType: 'mana' as const, amount: 2, resourceKey: 'Spellcraft', notes: 'Explicit Ability Mana', sortOrder: 0 }] : [] } };
    const snapshot = { ...f.snapshot, abilities: [ability] };
    if (owner === 'persistent') {
      await tx.update(campaignCreatureNpcProfile).set({ currentSnapshotJson: JSON.stringify(snapshot) }).where(eq(campaignCreatureNpcProfile.characterId, f.actor));
      await addLearnedCombatSpell(tx, { heroId: f.actor, godId: f.godId });
    } else await tx.update(member).set({ creatureSnapshotJson: snapshot }).where(eq(member.characterId, f.actor));
    const mana = async () => owner === 'persistent' ? (await readActiveManaInTransaction(tx, f.actor)).pools.find(row => row.system === 'Spellcraft')!.currentMana : 0;
    const beforeMana = await mana();
    const id = await locked(tx, f, { ...draft(f), actionKind: 'ability-use', windowKind: 'ordinary', sourceKind: 'creature-ability', sourceRef: ability.canonicalId,
      sourcePayload: { effectSelections: { [`damage:${f.target}`]: { hitLocationNumber: 0 } } } });
    const result = await finish(tx, f, id); assert.equal(result.effects.length, 7);
    assert.ok(result.effects.every(row => row.status === 'calculated'), JSON.stringify(result.effects.map(row => ({ key: row.effectKey, status: row.status, supported: row.applicationSupported, reason: row.amendmentReason, value: row.finalValueJson }))));
    assert.equal((await tx.select().from(initiative).where(eq(initiative.characterId, f.actor)))[0].currentInitiative, 18);
    await apply(tx, f, id);
    const state = await local(tx, f.target); assert.equal(state.health.totalDamage, 6);
    assert.equal(state.conditions.length, 2); assert.equal(state.modifiers.length, 2);
    assert.equal(await mana(), beforeMana - (owner === 'persistent' ? 2 : 0));
  });
  run("exact source, authored percentage and structured timing; damage/location/Initiative/Roll retry once without Attribute bonuses", async (tx, f) => {
    const preview = await previewCombatDeclarationInTransaction(tx, f.context, f.god, draft(f));
    assert.equal(preview.governing?.rollOverTarget, 50); assert.equal(preview.initiativeCost, 4);
    assert.equal(preview.authoredSource?.kind, "creature-attack"); assert.equal(preview.authoredSource?.sourceId, f.attack.canonicalId);
    assert.deepEqual(preview.authoredSource?.authoredData.definition, f.attack); assert.equal(preview.weapon, null);
    const id = await locked(tx, f); const result = await finish(tx, f, id); await apply(tx, f, id);
    assert.equal((await local(tx, f.target)).health.totalDamage, 20); assert.equal((await local(tx, f.target)).health.poolDamage["fixture-head"], 20);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.pendingActionId, result.pending))).length, 1);
    assert.equal((await tx.select().from(initiative).where(eq(initiative.characterId, f.actor)))[0].currentInitiative, 18);
    assert.equal((await tx.select().from(creature).where(eq(creature.id, f.templateId)))[0].totalHp, 30);
  });
  run("missing Attack % requires an exact G.O.D. target; Skill/Attribute substitution and valid percentage replacement are rejected", async (tx, f) => {
    await assert.rejects(ruling(tx, f, { governing: { kind: "manual", label: "Fake", originalTarget: 99 } }), /cannot replace.*Attack %/);
    await assert.rejects(ruling(tx, f, { governing: { kind: "attribute", attributeKey: "DEX" } }), /Creature Attacks|owned Skill/);
    await change(tx, f, { attackPercentage: null });
    const id = await locked(tx, f);
    await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: 70 }), /ruling|governing/i);
    const first = await ruling(tx, f); assert.equal(await ruling(tx, f), first);
    assert.equal((await previewCombatDeclarationInTransaction(tx, f.context, f.god, draft(f))).governing?.rollOverTarget, 50);
  });
  run("current missing Initiative cannot guess from Bite or damage; exact timing ruling is definition-bound", async (tx, f) => {
    await change(tx, f, { authoring: { ...f.attack.authoring, initiativeCost: null } });
    await assert.rejects(locked(tx, f), /positive Initiative Cost/);
    await ruling(tx, f, { initiativeCost: 3 });
    assert.equal((await previewCombatDeclarationInTransaction(tx, f.context, f.god, draft(f))).initiativeCost, 3);
    await change(tx, f, { attackPercentage: 55, authoring: { ...f.attack.authoring, initiativeCost: null } });
    await assert.rejects(locked(tx, f), /positive Initiative Cost/);
  });
  run("melee Reach and exact authored unit are enforced", async (tx, f) => {
    for (const payload of [{ rangeDistance: 6, rangeUnit: "feet" }, { rangeDistance: 1, rangeUnit: "meters" }]) await assert.rejects(locked(tx, f, { ...draft(f), sourcePayload: payload }), /Reach|authored unit/);
  });
  for (const mode of ["ranged", "hybrid"] as const) run(`${mode} bands use shared modifiers and no ammunition`, async (tx, f) => {
    await change(tx, f, { authoring: { ...f.attack.authoring, mode } });
    for (const [distance, adjustment] of [[5, 10], [15, 0], [30, -10]]) {
      const preview = await previewCombatDeclarationInTransaction(tx, f.context, f.god, { ...draft(f), sourcePayload: { rangeAttackMode: "ranged", rangeDistance: distance, rangeUnit: "feet" } });
      assert.equal((preview.authoredSource?.authoredData.range as { adjustment: number }).adjustment, adjustment); assert.equal(preview.windowKind, "ordinary"); assert.deepEqual(preview.authoredSource?.resourceCosts, []);
    }
    if (mode === "hybrid") {
      assert.equal((await previewCombatDeclarationInTransaction(tx, f.context, f.god, draft(f))).windowKind, "melee-overlap");
      await assert.rejects(locked(tx, f, { ...draft(f), sourcePayload: { rangeDistance: 5, rangeUnit: "feet" } }), /Choose melee or ranged/);
    }
    await assert.rejects(locked(tx, f, { ...draft(f), sourcePayload: { rangeAttackMode: "ranged", rangeDistance: 50, rangeUnit: "feet" } }), /Beyond Long/);
  });
  run("condition, modifier and separate damage rider apply once after the ordinary hit", async (tx, f) => {
    await change(tx, f, { authoring: { ...f.attack.authoring, onHitEffects: riders } });
    const id = await locked(tx, f); const result = await finish(tx, f, id); assert.equal(result.effects.length, 4); await apply(tx, f, id);
    const target = await local(tx, f.target); assert.equal(target.health.totalDamage, 23);
    assert.equal(target.conditions.filter(row => row.name === "Creature Mark").length, 1); assert.equal(target.modifiers.filter(row => row.label === "Creature Penalty").length, 1);
  });
  run("miss suppresses all on-hit effects", async (tx, f) => {
    await change(tx, f, { authoring: { ...f.attack.authoring, onHitEffects: riders } });
    const result = await finish(tx, f, await locked(tx, f), 20); assert.equal(result.effects.length, 4); assert.ok(result.effects.every(row => row.status === "declined"));
  });
  run("successful Dodge suppresses damage and all hit riders", async (tx, f) => {
    await change(tx, f, { authoring: { ...f.attack.authoring, onHitEffects: riders, magic: { document: magicCompletionDocument() } } });
    await tx.update(initiative).set({ participationStatus: "holding" }).where(eq(initiative.characterId, f.target));
    const id = await locked(tx, f); await commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: 70 });
    const [window] = await tx.select().from(opportunity).where(eq(opportunity.declarationId, id));
    await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
    await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType: "dodge", protectedTargetCharacterId: f.target }, { method: "entered", enteredTotal: 80 });
    const result = await finish(tx, f, id); assert.ok(result.effects.every(row => row.status === "declined"));
  });
  run("later individual/occurrence and master edits cannot rewrite locked source or committed consequences", async (tx, f) => {
    const id = await locked(tx, f);
    await change(tx, f, { damage: "900", attackPercentage: 99, damageType: "Cold", authoring: { ...f.attack.authoring, initiativeCost: 20, magical: false, onHitEffects: riders } });
    await tx.insert(creatureAttack).values({ creatureId: f.templateId, canonicalId: `MASTER-${crypto.randomUUID()}`.toUpperCase(), attackName: "Master only", damage: "999", attackPercentage: 99 });
    const result = await finish(tx, f, id); assert.equal((result.effects[0].finalValueJson as { effect: { amount: number } }).effect.amount, 20);
    assert.equal(result.effects.length, 1); assert.equal(await generateActionEffectPlanInTransaction(tx, f.context, f.god, id), result.planId);
    const frozen = parseLockedActionDeclarationSnapshot((await tx.select().from(declaration).where(eq(declaration.id, id)))[0].lockedSnapshotJson);
    assert.deepEqual(frozen.authoredSource?.authoredData.definition, f.attack);
  });
  for (const magical of [true, false, null]) run(`typed Worn Armor, Magical Requirement, Resistance, Race Soak: magical=${magical}`, async (tx, f) => {
    await protectionPipelineFixture(tx, f.godId, f.heroId, true); await change(tx, f, { authoring: { ...f.attack.authoring, magical } });
    const initial = (await readActiveHealthInTransaction(tx, f.heroId, "race")).state.totalDamage;
    const id = await locked(tx, f, draft(f, f.heroId)); const result = await finish(tx, f, id);
    if (magical === null) { assert.equal(result.effects[0].status, "requires-god-ruling"); return; }
    await apply(tx, f, id); assert.equal((await readActiveHealthInTransaction(tx, f.heroId, "race")).state.totalDamage - initial, magical ? 5 : 0);
  });
  run("empty construction freezes Magical independently of Fire and requires an explicit manual outcome", async (tx, f) => {
    const magic = { document: createEmptySpell() }; await change(tx, f, { authoring: { ...f.attack.authoring, magical: null, magic } });
    const id = await locked(tx, f); const result = await finish(tx, f, id);
    const frozen = parseLockedActionDeclarationSnapshot((await tx.select().from(declaration).where(eq(declaration.id, id)))[0].lockedSnapshotJson).authoredSource!;
    assert.deepEqual((frozen.authoredData.authoring as AttackAuthoring).magic, JSON.parse(JSON.stringify(magic)));
    assert.match(JSON.stringify(frozen.incomingSourceFacts), /"magical":true/); assert.match(JSON.stringify(frozen.incomingSourceFacts), /Fire/);
    assert.ok(frozen.warnings.some(warning => warning.includes('manual effects'))); assert.equal(result.effects.length, 2);
    assert.equal(result.effects[1].effectType, 'manual'); assert.equal(result.effects[1].status, 'requires-god-ruling');
  });
}
scenario("Race NPC and Player with stray Creature JSON cannot gain Creature Attack sources", async (tx, f) => {
  await tx.update(campaignCharacter).set({ npcKind: "race" }).where(eq(campaignCharacter.id, f.defenderId));
  for (const actor of [f.defenderId, f.heroId]) {
    await assert.rejects(readCreatureAttackDefinitionInTransaction(tx, f.context, actor, f.attack.canonicalId), /snapshot.*missing/);
  }
});
scenario("direct frozen occurrence ignores later master attack edits", async (tx, f) => {
  await tx.insert(creatureAttack).values({ creatureId: f.templateId, canonicalId: `OTHER-${crypto.randomUUID()}`.toUpperCase(), attackName: "Master changed", attackPercentage: 99, damage: "999" });
  assert.deepEqual(await readCreatureAttackDefinitionInTransaction(tx, f.context, f.actor, f.attack.canonicalId), f.attack);
});
scenario("legacy snapshot timing is labeled; structured attacks cannot enter legacy bypass", async (tx, f) => {
  await assert.rejects(startCreatureAttackInTransaction(tx, f.context, { sourceCharacterId: f.actor, targetCharacterId: f.target, attackCanonicalId: f.attack.canonicalId }), /declaration pipeline/);
  await change(tx, f, { authoring: null }); const result = await previewCombatDeclarationInTransaction(tx, f.context, f.god, draft(f));
  assert.equal(result.initiativeCost, 2); assert.ok(result.authoredSource?.warnings.some(warning => warning.includes("Legacy snapshot timing")));
});
scenario("AoE exact G.O.D. target set; Notes cannot create geometry, per-target outcomes remain manual", async (tx, f) => {
  await change(tx, f, { notes: "All participants in a 100 foot cone", authoring: { ...f.attack.authoring, mode: "aoe" } });
  const targets = [f.defenderId, f.target]; const value = { ...draft(f), targetCharacterIds: targets };
  await assert.rejects(locked(tx, f, value), /confirmed exact target set/);
  await ruling(tx, f, { targetParticipantIds: targets });
  await assert.rejects(locked(tx, f), /confirmed exact target set/);
  const id = await locked(tx, f, value); const result = await finish(tx, f, id);
  assert.equal(result.effects.length, 2); assert.ok(result.effects.every(row => row.status === "requires-god-ruling"));
});
for (const damage of ["2d6+4", "18 Fire + 2 Cold"]) scenario(`unsupported damage ${damage} needs outcome ruling`, async (tx, f) => {
  await change(tx, f, { damage }); assert.equal((await finish(tx, f, await locked(tx, f))).effects[0].status, "requires-god-ruling");
});
for (const field of ["specialEffect", "requirements", "requiredAnatomy", "usesRecharge", "notes", "rangeReach"]) scenario(`${field} prose is frozen and visible without automatic mechanics or resource ledger`, async (tx, f) => {
  const text = "Once per turn; unavailable claw; +900 damage; cone 100 feet"; await change(tx, f, { [field]: text });
  const preview = await previewCombatDeclarationInTransaction(tx, f.context, f.god, draft(f));
  assert.equal(preview.authoredSource?.authoredData[field], text); assert.ok(preview.authoredSource?.warnings.some(warning => warning.includes(text))); assert.deepEqual(preview.authoredSource?.resourceCosts, []);
  const result = await finish(tx, f, await locked(tx, f));
  assert.equal(result.effects[0].status, field === "specialEffect" ? "requires-god-ruling" : "calculated");
});
scenario("manual on-hit effect remains manual", async (tx, f) => {
  await change(tx, f, { authoring: { ...f.attack.authoring, onHitEffects: [{ effectKey: "manual", schemaVersion: 2, sortOrder: 0, effect: { kind: "manual", title: "Venom choice", description: "G.O.D. chooses" } }] } });
  const result = await finish(tx, f, await locked(tx, f)); assert.equal(result.effects.find(row => row.effectType === "manual")?.status, "requires-god-ruling");
});
for (const [ruleType, percentage, expected] of [["immunity", null, 0], ["vulnerability", 50, 19], ["absorption", 50, 0]] as const) scenario(`shared ${ruleType} protection`, async (tx, f) => {
  const protection = await protectionPipelineFixture(tx, f.godId, f.heroId);
  await tx.update(race).set({ interactionRules: { schemaVersion: 1, rules: [{ key: "fire", name: "Fire protection", ruleType, percentage, scope: "damage", match: "ALL", sortOrder: 0, notes: "", conditions: [{ key: "fire", kind: "damage-type", damageType: "Fire" }] }] } }).where(eq(race.id, protection.ancestry.id));
  const initial = (await readActiveHealthInTransaction(tx, f.heroId, "race")).state.totalDamage;
  const id = await locked(tx, f, draft(f, f.heroId)); await finish(tx, f, id); await apply(tx, f, id);
  assert.equal((await readActiveHealthInTransaction(tx, f.heroId, "race")).state.totalDamage - initial, expected);
});
scenario("typed Armor weakness clamps Worn layer; temporary Soak follows Race Soak", async (tx, f) => {
  const protection = await protectionPipelineFixture(tx, f.godId, f.heroId);
  await tx.update(itemArmorDamageModifier).set({ modifier: "-6" }).where(eq(itemArmorDamageModifier.id, protection.modifier.id));
  await tx.insert(campaignCharacterActiveModifier).values({ characterId: f.heroId, label: "Ward", modifierChannel: "soak", targetKey: "self", amount: 3, sourceKind: "god", sourceId: "ward", sourceName: "Ward", durationKind: "scene", durationLabel: "Scene" });
  const initial = (await readActiveHealthInTransaction(tx, f.heroId, "race")).state.totalDamage;
  const id = await locked(tx, f, draft(f, f.heroId)); await finish(tx, f, id); await apply(tx, f, id);
  assert.equal((await readActiveHealthInTransaction(tx, f.heroId, "race")).state.totalDamage - initial, 5);
});
for (const targetKind of ["direct", "persistent"] as const) scenario(`Creature Natural Armor + Natural Soak on ${targetKind} target`, async (tx, f) => {
  const snapshot = { ...f.snapshot, hitLocations: [{ ...f.snapshot.hitLocations[0], naturalArmor: "4", soak: "2" }] };
  if (targetKind === "persistent") { f.target = f.defenderId; await tx.update(campaignCreatureNpcProfile).set({ currentSnapshotJson: JSON.stringify(snapshot) }).where(eq(campaignCreatureNpcProfile.characterId, f.target)); }
  else await tx.update(member).set({ creatureSnapshotJson: snapshot }).where(eq(member.characterId, f.target));
  const result = await finish(tx, f, await locked(tx, f)); assert.equal((result.effects[0].finalValueJson as { effect: { amount: number } }).effect.amount, 14);
});

scenario("AoE cannot use a direct ordinary defense submission to stop every affected target", async (tx, f) => {
  await change(tx, f, { authoring: { ...f.attack.authoring, mode: "aoe" } });
  await ruling(tx, f, { targetParticipantIds: [f.target, f.defenderId] });
  await tx.update(initiative).set({ participationStatus: "holding" }).where(eq(initiative.characterId, f.target));
  const id = await locked(tx, f, { ...draft(f), targetCharacterIds: [f.target, f.defenderId] });
  await commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: 70 });
  const windows = await tx.select().from(opportunity).where(eq(opportunity.declarationId, id));
  const window = windows.find(row => row.responderCharacterId === f.target)!;
  await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
  for (const reactionType of ["dodge", "block", "parry"] as const) await assert.rejects(declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType, protectedTargetCharacterId: f.target, sourceRef: "fixture-shortsword" }, { method: "entered", enteredTotal: 80 }), /each confirmed target/);
});
for (const reactionType of ["block", "parry"] as const) scenario(`ordinary ${reactionType} uses shared defense timing and suppresses Creature hit riders`, async (tx, f) => {
  await change(tx, f, { authoring: { ...f.attack.authoring, onHitEffects: riders } });
  await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot, defenses: [{ defenseType: reactionType === "block" ? "Block" : "Parry", value: "50", seedIdentity: "exact-defense" }], attacks: [{ ...f.attack, authoring: { ...f.attack.authoring, initiativeCost: 3 } }] } }).where(eq(member.characterId, f.target));
  await tx.update(initiative).set({ participationStatus: "holding" }).where(eq(initiative.characterId, f.target));
  const id = await locked(tx, f); await commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: 70 });
  const [window] = await tx.select().from(opportunity).where(eq(opportunity.declarationId, id));
  await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
  await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType, protectedTargetCharacterId: f.target, sourceRef: f.attack.canonicalId }, { method: "entered", enteredTotal: 90 });
  assert.equal((await tx.select().from(initiative).where(eq(initiative.characterId, f.target)))[0].currentInitiative, 19);
  const result = await finish(tx, f, id); assert.ok(result.effects.every(row => row.status === "declined"));
});
for (const roll of [1, 100]) scenario(`critical percentile ${roll} uses shared Roll history and ruling boundary`, async (tx, f) => {
  const id = await locked(tx, f); const result = await finish(tx, f, id, roll);
  const [stored] = await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.pendingActionId, result.pending));
  assert.equal((stored.mechanicalSnapshot as { resolution: { requiresGodRuling: boolean } }).resolution.requiresGodRuling, true);
  if (roll === 100) assert.equal(result.effects[0].status, "requires-god-ruling");
  else assert.equal(result.effects[0].status, "declined");
});
scenario("Called Shot retains the shared explicit location ruling boundary", async (tx, f) => {
  const id = await locked(tx, f, { ...draft(f), calledShot: { declared: true, label: "Head", assignedPenalty: 2 } });
  const result = await finish(tx, f, id); assert.equal(result.effects[0].status, "requires-god-ruling");
  assert.match(result.effects[0].amendmentReason ?? "", /called shot.*location ruling/i);
});

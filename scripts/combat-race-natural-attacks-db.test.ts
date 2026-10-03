import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { race, raceNaturalAttack, raceForm, raceFormNaturalAttack } from "@/db/race-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import { itemArmorDamageModifier } from "@/db/item-schema";
import { campaignSkillExclusion } from "@/db/campaign-schema";
import { createPlayerCombatRulingRequestInTransaction, ruleOnPlayerCombatRequestInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { submitCombatChoiceInTransaction } from "@/features/combat-screen/choice-service";
import { campaignCharacter, campaignCharacterProfile, campaignCharacterSkillAllocation, campaignCharacterActiveHealthPool } from "@/db/realm-schema";
import { campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterParticipant as member,
  campaignSessionEncounterInitiativeParticipant as initiative, campaignSessionEncounterInitiative as runtime, campaignSessionEncounterEffect as effect,
  campaignSessionEncounterEffectPlan as plan, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { campaignSessionEncounterResponderOpportunity as opportunity } from "@/db/tabletop-operations-schema";
import { createActionDeclarationDraftInTransaction, lockActionDeclarationInTransaction, commitActionDeclarationInTransaction, previewCombatDeclarationInTransaction, reconcileResponderOpportunityInTransaction } from "@/features/tabletop-operations/action-declaration-service";
import { parseLockedActionDeclarationSnapshot } from "@/features/tabletop-operations/action-declaration";
import { readRaceAttackSourcesInTransaction } from "@/features/tabletop-operations/race-natural-attack-service";
import { recordCombatSourceResolutionInTransaction } from "@/features/tabletop-operations/combat-source-resolution-service";
import { resolveDeclaredDefensesInTransaction, declareDefenseInterventionInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { applyRoutineCombatConsequencesInTransaction, generateActionEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";
import { completionDraft, completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { raceNaturalAttackFixture } from "./fixtures/race-natural-attack-fixture";
import { protectionPipelineFixture } from "./fixtures/protection-pipeline-fixture";
import { magicCompletionDocument } from './fixtures/magic-completion-fixture';

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true" || !/^postgresql:\/\/[^/]+@127\.0\.0\.1:\d+\/serrian_combat_completion_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Use the isolated completion harness.");
after(() => pool.end());
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fixture = Awaited<ReturnType<typeof setup>>;
const rollback = new Error("ROLLBACK_NATURAL_ATTACK_FIXTURE");
function scenario(name: string, run: (tx: Tx, f: Fixture) => Promise<void>) {
  test(name, async () => { await assert.rejects(db.transaction(async tx => { await run(tx, await setup(tx)); throw rollback; }), error => error === rollback); });
}
async function setup(tx: Tx) {
  const f = await completionServiceFixture(tx, "race-natural-attack");
  const natural = await raceNaturalAttackFixture(tx, f.heroId, f.skillId);
  await tx.update(initiative).set({ participationStatus: "active" }).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.heroId)));
  return { ...f, ...natural };
}
function draft(f: Fixture, target = f.occurrences[0]) {
  return { ...completionDraft(f.heroId, target), sourceKind: "race-natural-attack" as const, sourceRef: f.ref,
    sourcePayload: { rangeAttackMode: "melee", rangeDistance: 5, rangeUnit: "feet" } };
}
async function locked(tx: Tx, f: Fixture, target = f.occurrences[0]) {
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, draft(f, target));
  await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
  return id;
}
async function finish(tx: Tx, f: Fixture, id: number, roll = 70) {
  const pending = await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: roll });
  assert.equal(await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: roll }), pending);
  await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, id);
  const before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
  await persistInitiativeEngineInTransaction(tx, f.context, before, advanceInitiativeTimeline(before, 18));
  const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, id);
  return { planId, pending, effects: await tx.select().from(effect).where(eq(effect.planId, planId)) };
}
async function ruling(tx: Tx, f: Fixture, extra = {}) {
  return recordCombatSourceResolutionInTransaction(tx, f.context, f.god, { participantId: f.heroId, sourceKind: "race-natural-attack", sourceRef: f.ref,
    mode: "opposed-roll", governing: { kind: "attribute", attributeKey: "DEX" }, effectScaling: {}, reason: "Explicit fixture ruling", ...extra });
}

scenario("Player current Normal Race identity; another Race, Creature occurrence and Creature NPC cannot supply it", async (tx, f) => {
  const rows = await readRaceAttackSourcesInTransaction(tx, f.context, f.heroId);
  assert.equal(rows.length, 1); assert.equal(rows[0].ref, f.ref);
  assert.deepEqual(await readRaceAttackSourcesInTransaction(tx, f.context, f.defenderId), []);
  assert.deepEqual(await readRaceAttackSourcesInTransaction(tx, f.context, f.occurrences[0]), []);
  await assert.rejects(previewCombatDeclarationInTransaction(tx, f.context, f.player, { ...draft(f), sourceRef: `race:${f.ancestry.id + 1}:attack:fire-claw` }), /current Normal Race/);
  await tx.update(campaignCharacter).set({ npcKind: "creature" }).where(eq(campaignCharacter.id, f.heroId));
  assert.deepEqual(await readRaceAttackSourcesInTransaction(tx, f.context, f.heroId), []);
});
scenario("Form-only attacks never enter the Normal Race source list", async (tx, f) => {
  const [form] = await tx.insert(raceForm).values({ raceId: f.ancestry.id, key: "dragon", name: "Dragon", sortOrder: 0 }).returning();
  await tx.insert(raceFormNaturalAttack).values({ ...f.attack, id: undefined, formId: form.id, key: "form-only", attackName: "Form-only breath" });
  assert.deepEqual((await readRaceAttackSourcesInTransaction(tx, f.context, f.heroId)).map(source => source.definition.key), ["fire-claw"]);
});
scenario("Campaign-owning G.O.D. can lock and commit a Race NPC attack; Player cannot control that NPC", async (tx, f) => {
  await tx.update(campaignCharacterProfile).set({ raceId: f.ancestry.id }).where(eq(campaignCharacterProfile.characterId, f.defenderId));
  await tx.update(campaignCharacter).set({ isNpc: true, npcKind: "race" }).where(eq(campaignCharacter.id, f.defenderId));
  await tx.update(initiative).set({ participationStatus: "passed" }).where(eq(initiative.characterId, f.heroId));
  await tx.update(initiative).set({ participationStatus: "active" }).where(eq(initiative.characterId, f.defenderId));
  const npcDraft = { ...draft(f), actorCharacterId: f.defenderId };
  await assert.rejects(previewCombatDeclarationInTransaction(tx, f.context, f.player, npcDraft), /own|Player|control/i);
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.god, npcDraft);
  await lockActionDeclarationInTransaction(tx, f.context, f.god, id);
  assert.ok(await commitActionDeclarationInTransaction(tx, f.context, f.god, id, { method: "entered", enteredTotal: 70 }));
});
for (const requirement of [{ hpPoolIds: ["missing"], hitLocationNumbers: [], notes: "" }, { hpPoolIds: [], hitLocationNumbers: [99], notes: "" }]) scenario(`missing exact anatomy blocks ${JSON.stringify(requirement)}`, async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ anatomy: requirement }).where(eq(raceNaturalAttack.id, f.attack.id));
  await assert.rejects(locked(tx, f), /anatomy is missing/);
});
scenario("exact structured incapacitation blocks; descriptive anatomy notes do not execute", async (tx, f) => {
  const body = (await readActiveHealthInTransaction(tx, f.heroId, "race")).anatomy;
  const required = body.pools[0].key;
  await tx.update(raceNaturalAttack).set({ anatomy: { hpPoolIds: [required], hitLocationNumbers: [], notes: "Cannot attack at night" } }).where(eq(raceNaturalAttack.id, f.attack.id));
  assert.equal((await readRaceAttackSourcesInTransaction(tx, f.context, f.heroId))[0].unavailable, null);
  await tx.update(member).set({ localStateJson: { limbConditions: [{ poolKey: required, name: "Disabled", sourceEffectId: 1, incapacitatedAt: new Date().toISOString() }] } }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.heroId)));
  await assert.rejects(locked(tx, f), /body part is unavailable/);
});
scenario("damage without a structured usability fact requires a recorded anatomy ruling", async (tx, f) => {
  const required = (await readActiveHealthInTransaction(tx, f.heroId, "race")).anatomy.pools[0].key;
  await tx.update(raceNaturalAttack).set({ anatomy: { hpPoolIds: [required], hitLocationNumbers: [], notes: "" } }).where(eq(raceNaturalAttack.id, f.attack.id));
  await tx.insert(campaignCharacterActiveHealthPool).values({ characterId: f.heroId, poolKey: required, poolNameSnapshot: "Required part", damage: 1 }).onConflictDoUpdate({ target: [campaignCharacterActiveHealthPool.characterId, campaignCharacterActiveHealthPool.poolKey], set: { damage: 1 } });
  await assert.rejects(locked(tx, f), /authoritative usability fact/);
  await ruling(tx, f, { useRequirementsReason: "This wound leaves the required part usable." });
  assert.ok(await locked(tx, f));
});
scenario("trained Skill uses its exact saved allocation and Rank; untrained canonical endpoint falls back to the owned parent", async (tx, f) => {
  const [allocation] = await tx.insert(campaignCharacterSkillAllocation).values({ characterId: f.heroId, skillId: f.skillId, points: 5 }).returning();
  let source = (await readRaceAttackSourcesInTransaction(tx, f.context, f.heroId))[0];
  assert.equal(source.governance.selected?.source.originalTarget, 40);
  assert.equal(source.governance.selected?.rollGoverningSource?.kind, "skill");
  assert.equal((source.governance.selected?.rollGoverningSource as { allocationId: number }).allocationId, allocation.id);
  const [child] = await tx.insert(skill).values({ name: "Child path", classification: "standard", tier: 2, createdByUserId: f.godId }).returning();
  await tx.insert(skillRelationship).values({ skillId: child.id, relatedSkillId: f.skillId, relationshipType: "parent", sortOrder: 0 });
  await tx.update(raceNaturalAttack).set({ skillId: child.id }).where(eq(raceNaturalAttack.id, f.attack.id));
  source = (await readRaceAttackSourcesInTransaction(tx, f.context, f.heroId))[0];
  assert.equal(source.governance.selected?.source.originalTarget, 40);
  assert.equal((await tx.select().from(campaignCharacterSkillAllocation).where(eq(campaignCharacterSkillAllocation.characterId, f.heroId))).length, 1);
});
scenario("untrained root uses the established Attribute fallback without granting a Skill", async (tx, f) => {
  const source = (await readRaceAttackSourcesInTransaction(tx, f.context, f.heroId))[0];
  assert.equal(source.governance.selected?.source.originalTarget, 50);
  assert.equal(source.governance.selected?.rollGoverningSource?.kind, "attribute");
  assert.deepEqual(await tx.select().from(campaignCharacterSkillAllocation).where(eq(campaignCharacterSkillAllocation.characterId, f.heroId)), []);
});
scenario("multiple owned canonical paths require exact G.O.D. governance instead of the highest target", async (tx, f) => {
  const [other] = await tx.insert(skill).values({ name: "Other parent", classification: "standard", tier: 1, primaryAttribute: "DEX", createdByUserId: f.godId }).returning();
  const [child] = await tx.insert(skill).values({ name: "Ambiguous child", classification: "standard", tier: 2, createdByUserId: f.godId }).returning();
  await tx.insert(skillRelationship).values([f.skillId, other.id].map(relatedSkillId => ({ skillId: child.id, relatedSkillId, relationshipType: "parent", sortOrder: 0 })));
  await tx.insert(campaignCharacterSkillAllocation).values([{ characterId: f.heroId, skillId: f.skillId, points: 5 }, { characterId: f.heroId, skillId: other.id, points: 10 }]);
  await tx.update(raceNaturalAttack).set({ skillId: child.id }).where(eq(raceNaturalAttack.id, f.attack.id));
  assert.equal((await readRaceAttackSourcesInTransaction(tx, f.context, f.heroId))[0].governance.selected, null);
  const id = await locked(tx, f);
  await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 70 }), /governing-source ruling/);
});
scenario("missing Skill remains visible without an invented target; exact ruling enables a new lock", async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ skillId: null }).where(eq(raceNaturalAttack.id, f.attack.id));
  const preview = await previewCombatDeclarationInTransaction(tx, f.context, f.player, draft(f));
  assert.equal(preview.governing?.rollOverTarget, null);
  await ruling(tx, f);
  assert.equal((await previewCombatDeclarationInTransaction(tx, f.context, f.player, draft(f))).governing?.rollOverTarget, 50);
});
scenario("missing Initiative has no heuristic default; explicit timing ruling supplies only the missing cost", async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, initiativeCost: null } }).where(eq(raceNaturalAttack.id, f.attack.id));
  await assert.rejects(locked(tx, f), /positive Initiative Cost/);
  await ruling(tx, f, { initiativeCost: 3 });
  assert.equal((await previewCombatDeclarationInTransaction(tx, f.context, f.player, draft(f))).initiativeCost, 3);
});
scenario("insufficient Initiative leaves no Roll or spending", async (tx, f) => {
  await tx.update(initiative).set({ currentInitiative: 2 }).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.heroId)));
  await tx.update(runtime).set({ timelineInitiative: 2 }).where(eq(runtime.encounterId, f.encounterId));
  const id = await locked(tx, f);
  await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 70 }), /Initiative|round/);
  assert.equal((await tx.select().from(initiative).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.heroId))))[0].currentInitiative, 2);
  assert.deepEqual(await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId)), []);
});
for (const [roll, damage] of [[20, 0], [70, 20]] as const) scenario(`ordinary Roll ${roll} produces ${damage} numeric damage; Roll, Initiative and Health retry once`, async (tx, f) => {
  const id = await locked(tx, f);
  const result = await finish(tx, f, id, roll);
  assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.pendingActionId, result.pending))).length, 1);
  assert.equal((await tx.select().from(initiative).where(and(eq(initiative.encounterId, f.encounterId), eq(initiative.characterId, f.heroId))))[0].currentInitiative, 18);
  for (let retry = 0; retry < 2; retry++) await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id);
  const [target] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
  const health = (target.localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> } }).health;
  assert.equal(health.totalDamage, damage); assert.equal(health.poolDamage["fixture-head"] ?? 0, damage);
});
for (const magical of [true, false, null]) scenario(`shared Worn Armor + typed modifier + Magical Requirement + Resistance + Race Soak, magical=${magical}`, async (tx, f) => {
  await protectionPipelineFixture(tx, f.godId, f.defenderId, true);
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, magical } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const initial = (await readActiveHealthInTransaction(tx, f.defenderId, "race")).state.totalDamage;
  const id = await locked(tx, f, f.defenderId);
  const result = await finish(tx, f, id);
  if (magical === null) { assert.ok(result.effects.some(row => row.status === "requires-god-ruling")); return; }
  for (let retry = 0; retry < 2; retry++) await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id);
  assert.equal((await readActiveHealthInTransaction(tx, f.defenderId, "race")).state.totalDamage - initial, magical ? 5 : 0);
});
scenario("typed Armor weakness shares the same clamped Worn layer", async (tx, f) => {
  const protection = await protectionPipelineFixture(tx, f.godId, f.defenderId);
  await tx.update(itemArmorDamageModifier).set({ modifier: "-6" }).where(eq(itemArmorDamageModifier.id, protection.modifier.id));
  const initial = (await readActiveHealthInTransaction(tx, f.defenderId, "race")).state.totalDamage;
  const id = await locked(tx, f, f.defenderId); await finish(tx, f, id);
  await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id);
  assert.equal((await readActiveHealthInTransaction(tx, f.defenderId, "race")).state.totalDamage - initial, 8);
});
scenario("Creature Natural Armor and Soak apply after the same incoming pipeline", async (tx, f) => {
  await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot, hitLocations: [{ ...f.creatureSnapshot.hitLocations[0], naturalArmor: "4", soak: "2" }] } }).where(eq(member.characterId, f.occurrences[0]));
  const id = await locked(tx, f); const result = await finish(tx, f, id);
  assert.equal((result.effects[0].finalValueJson as { effect: { amount: number } }).effect.amount, 14);
});
scenario("supported on-hit condition applies once and does not replace ordinary damage", async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, onHitEffects: [{ effectKey: "mark", schemaVersion: 2, sortOrder: 0,
    effect: { kind: "condition.apply", name: "Natural Mark", description: "Authored on-hit condition", duration: { kind: "scene" } } }] } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const id = await locked(tx, f); const result = await finish(tx, f, id);
  assert.equal(result.effects.length, 2);
  for (let retry = 0; retry < 2; retry++) await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id);
  const [target] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
  assert.equal((target.localStateJson as { conditions: { name: string }[] }).conditions.filter(entry => entry.name === "Natural Mark").length, 1);
});
scenario("empty attached Magic freezes Magical identity and requires an explicit manual outcome", async (tx, f) => {
  const magic = { document: createEmptySpell() };
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, magical: null, magic } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const id = await locked(tx, f); const result = await finish(tx, f, id);
  const [stored] = await tx.select().from(declaration).where(eq(declaration.id, id));
  const source = parseLockedActionDeclarationSnapshot(stored.lockedSnapshotJson).authoredSource!;
  assert.equal(source.kind, "race-natural-attack"); assert.ok(source.warnings.some(warning => warning.includes('manual effects')));
  assert.deepEqual((source.authoredData.authoring as typeof f.attack.authoring).magic, JSON.parse(JSON.stringify(magic)));
  assert.equal(result.effects.length, 2); assert.equal(result.effects[1].effectType, 'manual');
  assert.ok(JSON.stringify(source.incomingSourceFacts).includes('"magical":true')); assert.ok(JSON.stringify(source.incomingSourceFacts).includes('Fire'));
});
for (const succeeded of [true, false]) scenario(`Pass 4 Race construction effects remain separate and apply once; hit=${succeeded}`, async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, magic: { document: magicCompletionDocument() } } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const id = await locked(tx, f);
  const snapshot = parseLockedActionDeclarationSnapshot((await tx.select().from(declaration).where(eq(declaration.id, id)))[0].lockedSnapshotJson);
  assert.deepEqual(snapshot.authoredSource!.resourceCosts, []); assert.equal(snapshot.initiativeCost, 4);
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, magic: null } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const result = await finish(tx, f, id, succeeded ? 70 : 20); assert.equal(result.effects.length, 5);
  if (!succeeded) { assert.ok(result.effects.every(row => row.status === 'declined')); return; }
  const base = (result.effects.find(row => row.effectKey.startsWith('ordinary-attack:'))!.finalValueJson as { effect: { amount: number } }).effect.amount;
  for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id)).status, 'applied');
  const state = (await tx.select().from(member).where(eq(member.characterId, f.occurrences[0])))[0].localStateJson as { health: { totalDamage: number }; conditions: unknown[]; modifiers: unknown[] };
  assert.equal(state.health.totalDamage, base + 3); assert.equal(state.conditions.length, 1); assert.equal(state.modifiers.length, 1);
});
scenario("later Race/Skill edits and target protection edits cannot rewrite a committed plan", async (tx, f) => {
  const id = await locked(tx, f); const result = await finish(tx, f, id);
  const [before] = await tx.select().from(plan).where(eq(plan.id, result.planId));
  await tx.update(raceNaturalAttack).set({ damage: "1000", damageType: "Cold", skillId: null, authoring: { ...f.attack.authoring, initiativeCost: 20, magical: false } }).where(eq(raceNaturalAttack.id, f.attack.id));
  await tx.update(skill).set({ name: "Changed Skill", primaryAttribute: "STR" }).where(eq(skill.id, f.skillId));
  await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot, hitLocations: [{ ...f.creatureSnapshot.hitLocations[0], soak: "9000" }] } }).where(eq(member.characterId, f.occurrences[0]));
  assert.equal(await generateActionEffectPlanInTransaction(tx, f.context, f.god, id), result.planId);
  assert.deepEqual((await tx.select().from(plan).where(eq(plan.id, result.planId)))[0].sourceSnapshotJson, before.sourceSnapshotJson);
  assert.equal((result.effects[0].finalValueJson as { effect: { amount: number } }).effect.amount, 20);
});
scenario("current Race is rechecked between lock and commit", async (tx, f) => {
  const id = await locked(tx, f);
  await tx.update(campaignCharacterProfile).set({ raceId: null }).where(eq(campaignCharacterProfile.characterId, f.heroId));
  await assert.rejects(commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 70 }), /current Normal Race/);
});
scenario("melee Reach rejects an out-of-range target", async (tx, f) => {
  await assert.rejects(previewCombatDeclarationInTransaction(tx, f.context, f.player, { ...draft(f), sourcePayload: { rangeAttackMode: "melee", rangeDistance: 6, rangeUnit: "feet" } }), /beyond.*Reach/);
});
for (const mode of ["ranged", "hybrid"] as const) for (const [distance, adjustment] of [[5, 10], [15, 0], [30, -10]] as const) scenario(`${mode} uses authored distance ${distance} with adjustment ${adjustment}`, async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, mode } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const result = await previewCombatDeclarationInTransaction(tx, f.context, f.god, { ...draft(f), sourcePayload: { rangeAttackMode: "ranged", rangeDistance: distance, rangeUnit: "feet" } });
  assert.equal((result.authoredSource?.authoredData.range as { adjustment: number }).adjustment, adjustment);
  assert.equal(result.windowKind, "ordinary"); assert.equal(result.weapon, null);
  if (mode === "hybrid") assert.equal((await previewCombatDeclarationInTransaction(tx, f.context, f.god, draft(f))).windowKind, "melee-overlap");
});
scenario("AoE uses only G.O.D.-confirmed exact targets and preserves a per-target outcome boundary", async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, mode: "aoe" } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const aoe = { ...draft(f), targetCharacterIds: f.occurrences };
  await assert.rejects(previewCombatDeclarationInTransaction(tx, f.context, f.player, aoe), /confirmed exact target set/);
  await ruling(tx, f, { targetParticipantIds: f.occurrences });
  const preview = await previewCombatDeclarationInTransaction(tx, f.context, f.player, aoe);
  assert.deepEqual(preview.authoredSource?.authoredData.confirmedAoeTargets, f.occurrences);
  assert.ok(preview.authoredSource?.warnings.some(warning => warning.includes("each confirmed target")));
  await assert.rejects(previewCombatDeclarationInTransaction(tx, f.context, f.player, draft(f)), /confirmed exact target set/);
  const id = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, aoe);
  await lockActionDeclarationInTransaction(tx, f.context, f.player, id);
  const result = await finish(tx, f, id);
  assert.equal(result.effects.length, 2);
  assert.ok(result.effects.every(row => row.status === "requires-god-ruling"));
});

scenario("Campaign purchase exclusion does not remove an inherent attack or grant its Skill", async (tx, f) => {
  await tx.insert(campaignSkillExclusion).values({ campaignId: f.campaignId, skillId: f.skillId, pathKey: String(f.skillId) });
  assert.equal((await readRaceAttackSourcesInTransaction(tx, f.context, f.heroId)).length, 1);
  assert.equal((await previewCombatDeclarationInTransaction(tx, f.context, f.player, draft(f))).governing?.rollOverTarget, 50);
  assert.deepEqual(await tx.select().from(campaignCharacterSkillAllocation).where(eq(campaignCharacterSkillAllocation.characterId, f.heroId)), []);
});
scenario("manual on-hit effects preserve an explicit ruling and a miss executes no rider", async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, onHitEffects: [{ effectKey: "manual", schemaVersion: 2, sortOrder: 0,
    effect: { kind: "manual", title: "Choose venom", description: "The G.O.D. chooses the exact venom consequence." } }] } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const id = await locked(tx, f); const result = await finish(tx, f, id);
  assert.equal(result.effects.find(row => row.effectType === "manual")?.status, "requires-god-ruling");
});
scenario("failed Natural Attack declines supported on-hit effects", async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, onHitEffects: [{ effectKey: "mark", schemaVersion: 2, sortOrder: 0,
    effect: { kind: "condition.apply", name: "Mark", description: "Only a hit marks", duration: { kind: "scene" } } }] } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const result = await finish(tx, f, await locked(tx, f), 20);
  assert.equal(result.effects.length, 2); assert.ok(result.effects.every(row => row.status === "declined"));
});
for (const damage of ["2d6+4", "18 Fire + 2 Cold"]) scenario(`unsupported damage expression ${damage} requires a ruling`, async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ damage }).where(eq(raceNaturalAttack.id, f.attack.id));
  const result = await finish(tx, f, await locked(tx, f));
  assert.equal(result.effects[0].status, "requires-god-ruling");
});
for (const [ruleType, percentage, expected] of [["immunity", null, 0], ["vulnerability", 50, 19]] as const) scenario(`shared ${ruleType} preserves target protection semantics`, async (tx, f) => {
  const protection = await protectionPipelineFixture(tx, f.godId, f.defenderId);
  await tx.update(race).set({ interactionRules: { schemaVersion: 1, rules: [{ key: "fire", name: "Fire protection", ruleType, percentage, scope: "damage", match: "ALL", sortOrder: 0, notes: "", conditions: [{ key: "fire", kind: "damage-type", damageType: "Fire" }] }] } }).where(eq(race.id, protection.ancestry.id));
  const initial = (await readActiveHealthInTransaction(tx, f.defenderId, "race")).state.totalDamage;
  const id = await locked(tx, f, f.defenderId); await finish(tx, f, id);
  await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.player, id);
  assert.equal((await readActiveHealthInTransaction(tx, f.defenderId, "race")).state.totalDamage - initial, expected);
});
scenario("mixed damage and typed target Armor preserve the shared unresolved-type boundary", async (tx, f) => {
  await protectionPipelineFixture(tx, f.godId, f.defenderId);
  await tx.update(raceNaturalAttack).set({ damageType: "Fire/Cold" }).where(eq(raceNaturalAttack.id, f.attack.id));
  const result = await finish(tx, f, await locked(tx, f, f.defenderId));
  assert.equal(result.effects[0].status, "requires-god-ruling");
});
scenario("Player ranged approval binds exact source/target/distance and is consumed once; forged modifiers cannot change it", async (tx, f) => {
  await tx.update(raceNaturalAttack).set({ authoring: { ...f.attack.authoring, mode: "ranged" } }).where(eq(raceNaturalAttack.id, f.attack.id));
  const ranged = { ...draft(f), sourcePayload: { rangeAttackMode: "ranged", rangeDistance: 50, rangeUnit: "feet", rangeBeyondLongModifier: 0, rangeBeyondLongReason: "Untrusted" } };
  const beforeApproval = await createActionDeclarationDraftInTransaction(tx, f.context, f.player, ranged);
  await assert.rejects(lockActionDeclarationInTransaction(tx, f.context, f.player, beforeApproval), /distance confirmation/);
  const request = await createPlayerCombatRulingRequestInTransaction(tx, f.context, f.player, { requestType: "weapon-distance", sourceKind: "race-natural-attack", sourceRef: f.ref,
    targetParticipantId: f.occurrences[0], sourceInstanceId: null, intent: "Attack at 50 feet", blockedReason: "Distance needs confirmation", idempotencyKey: crypto.randomUUID().replaceAll("-", ""),
    frozenRequest: { distance: 50, unit: "feet", attackMode: "ranged" } });
  await ruleOnPlayerCombatRequestInTransaction(tx, f.context, f.godId, request.requestId, { status: "approved", response: "Confirmed beyond Long", ruling: { distance: 50, unit: "feet", beyondLongModifier: 20, beyondLongReason: "Measured range" } });
  const choice = { participantId: f.heroId, source: { kind: "race-natural-attack" as const, ref: f.ref, name: "Fire Claw", description: "Synthetic Natural Attack", instanceId: null, itemId: null }, targetIds: [f.occurrences[0]],
    range: { attackMode: "ranged" as const, distance: 50, unit: "feet", distanceRulingRequestId: request.requestId, beyondLongModifier: 0, beyondLongReason: "Forged neutral modifier" } };
  const submission = { choice, requestKey: crypto.randomUUID(), roll: { method: "entered" as const, enteredTotal: 70 } };
  const result = await submitCombatChoiceInTransaction(tx, f.context, f.player, submission);
  const repeated = await submitCombatChoiceInTransaction(tx, f.context, f.player, submission);
  assert.ok("declarationId" in result && "declarationId" in repeated);
  assert.equal(repeated.declarationId, result.declarationId);
  const [stored] = await tx.select().from(declaration).where(eq(declaration.id, result.declarationId));
  const snapshot = parseLockedActionDeclarationSnapshot(stored.lockedSnapshotJson);
  assert.equal((snapshot.authoredSource?.authoredData.range as { adjustment: number }).adjustment, -20);
  await assert.rejects(submitCombatChoiceInTransaction(tx, f.context, f.player, { ...submission, requestKey: crypto.randomUUID() }), /consumed/);
});
scenario("ordinary Natural Attack gives its exact target the existing defense opportunity; a successful Dodge stops damage", async (tx, f) => {
  await tx.update(initiative).set({ participationStatus: "holding" }).where(eq(initiative.characterId, f.occurrences[0]));
  const id = await locked(tx, f);
  await commitActionDeclarationInTransaction(tx, f.context, f.player, id, { method: "entered", enteredTotal: 70 });
  const [window] = await tx.select().from(opportunity).where(eq(opportunity.declarationId, id));
  assert.equal(window.responderCharacterId, f.occurrences[0]);
  await reconcileResponderOpportunityInTransaction(tx, f.context, f.god, window.id, { decision: "allow" });
  await declareDefenseInterventionInTransaction(tx, f.context, f.god, { opportunityId: window.id, reactionType: "dodge", protectedTargetCharacterId: f.occurrences[0] }, { method: "entered", enteredTotal: 80 });
  const result = await finish(tx, f, id);
  assert.equal(result.effects[0].status, "declined");
});
scenario("Player Called Shot uses G.O.D. approval and preserves its exact location ruling boundary", async (tx, f) => {
  const request = await createPlayerCombatRulingRequestInTransaction(tx, f.context, f.player, { requestType: "called-shot", sourceKind: "race-natural-attack", sourceRef: f.ref,
    targetParticipantId: f.occurrences[0], sourceInstanceId: null, intent: "Hit the head", blockedReason: "Needs penalty", idempotencyKey: crypto.randomUUID().replaceAll("-", ""), frozenRequest: { locationNumber: 0, objective: "Head" } });
  await ruleOnPlayerCombatRequestInTransaction(tx, f.context, f.godId, request.requestId, { status: "approved", response: "Head approved", ruling: { penalty: 2, reason: "Exact target Head" } });
  const choice = { participantId: f.heroId, source: { kind: "race-natural-attack" as const, ref: f.ref, name: "Fire Claw", description: "Synthetic Natural Attack", instanceId: null, itemId: null },
    targetIds: [f.occurrences[0]], range: { attackMode: "melee" as const, distance: 5, unit: "feet" }, calledShot: { locationNumber: 0, label: "Head", objective: "Head", requestId: request.requestId } };
  const submitted = await submitCombatChoiceInTransaction(tx, f.context, f.player, { choice, requestKey: crypto.randomUUID(), roll: { method: "entered", enteredTotal: 70 } });
  assert.ok("declarationId" in submitted);
  const result = await finish(tx, f, submitted.declarationId);
  assert.equal(result.effects[0].status, "requires-god-ruling");
  assert.match(result.effects[0].amendmentReason ?? "", /called shot.*location ruling/i);
});

import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaignCharacter, campaignCharacterSkillAllocation, campaignCharacterActiveHealth } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as member, campaignSessionEncounterInitiativeParticipant as initiativeParticipant,
  campaignSessionEncounterActionDeclaration as declaration, campaignSessionRoll } from "@/db/tabletop-operations-schema";
import { previewCombatChoiceInTransaction, submitCombatChoiceInTransaction } from "@/features/combat-screen/choice-service";
import { readActionEffectWorkspaceInTransaction, generateActionEffectPlanInTransaction, applyRoutineCombatConsequencesInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";
import { resolveDeclaredDefensesInTransaction } from "@/features/tabletop-operations/defense-intervention-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { advanceInitiativeTimeline } from "@/features/tabletop-operations/initiative-runtime";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import type { CombatChoice } from "@/features/combat-screen/choice-types";
import { completionServiceFixture } from "./fixtures/combat-completion-service-fixture";
import { addLearnedCombatSpell } from "./fixtures/combat-learned-spell-fixture";
import { skill, skillExtension } from "@/db/skill-schema";
import { createModifierSelection } from "@/features/spell-construction/utilities/spellFactory";
import { storedIncomingResolution } from "@/features/incoming-effects/effect-proposal";
import { parseLockedActionDeclarationSnapshot } from "@/features/tabletop-operations/action-declaration";
import { saveSkillExtensionMutations, readSkillExtension } from "@/features/skills/skill-extension-persistence";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import type { SpellDocument } from "@/features/spell-construction/models/spell";
import { magicCompletionDocument } from './fixtures/magic-completion-fixture';

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_LEARNED_SPELL");
const expected = (error: unknown) => { if (error !== rollback) console.error(error); return error === rollback; };

for (const variant of ['runtime', 'area-healing', 'short', 'medium', 'long', 'out-of-range', 'player-range', 'line-of-sight', 'condition-immunity', 'unknown-harmfulness'] as const) test(`Pass 4 learned Magic ${variant}: exact effects, range, Interaction and retries`, async () => {
  await assert.rejects(db.transaction(async tx => {
    const f = await completionServiceFixture(tx, `magic-${variant}`);
    await tx.insert(userRole).values([{ userId: f.godId, role: 'god' }, { userId: f.godId, role: 'player' }]);
    const learned = await addLearnedCombatSpell(tx, f, { fixed: true });
    const [channel] = await tx.select().from(skill).where(eq(skill.name, 'Channeling'));
    await tx.update(campaignCharacterSkillAllocation).set({ points: 200 }).where(and(eq(campaignCharacterSkillAllocation.characterId, f.heroId), eq(campaignCharacterSkillAllocation.skillId, channel.id)));
    const document = magicCompletionDocument(); document.frameworkSkillId = learned.spell.frameworkSkillId;
    if (variant === 'area-healing') {
      document.containers[0].effects = [{ id: 'magic-heal', ruleId: 'healing', quantity: 2, healingScope: 'area' }];
      const [target] = await tx.select().from(member).where(eq(member.characterId, f.occurrences[0]));
      await tx.update(member).set({ localStateJson: { ...(target.localStateJson as Record<string, unknown>), health: { totalDamage: 6, poolDamage: { 'fixture-head': 3 } } } }).where(eq(member.characterId, f.occurrences[0]));
    }
    const isInteraction = variant === 'condition-immunity' || variant === 'unknown-harmfulness';
    if (isInteraction) {
      document.containers[0].effects = [document.containers[0].effects[2]];
      document.containers[0].effects[0].runtimeApplication!.harmful = variant === 'condition-immunity' ? true : undefined;
      await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core, interactionRules: { schemaVersion: 1, rules: [{
        key: 'mark-immunity', name: 'Mark Immunity', ruleType: 'immunity', scope: 'condition', match: 'ALL', percentage: null, sortOrder: 0, notes: '', crImpact: 'None',
        conditions: [{ key: 'mark', kind: 'condition-name', conditionName: 'Constructed Mark' }],
      }] } } } }).where(eq(member.characterId, f.occurrences[0]));
    }
    const range = ['runtime', 'area-healing', 'condition-immunity', 'unknown-harmfulness'].includes(variant) ? undefined : variant === 'out-of-range' || variant === 'player-range' ? 'short' : variant;
    document.containers[0].rangeRuleId = range;
    await tx.update(skillExtension).set({ dataJson: JSON.stringify(document) }).where(eq(skillExtension.skillId, learned.spellSkill.id));
    await tx.update(initiativeParticipant).set({ participationStatus: 'active' }).where(eq(initiativeParticipant.characterId, f.heroId));
    const limit = range === 'medium' ? 60 : range === 'long' ? 120 : 30;
    const choice: CombatChoice = { participantId: f.heroId, source: { kind: 'spell', ref: `catalog:${learned.allocation.id}`, instanceId: null, itemId: null, name: document.name, description: '' },
      targetIds: [f.occurrences[0]], spellSelections: { targetGroups: { 'magic-target': [f.occurrences[0]] }, applications: {}, ranges: {
        [`magic-target:${f.occurrences[0]}`]: range === 'line-of-sight' ? { confirmed: true } : { distanceFeet: variant === 'out-of-range' ? limit + 1 : limit },
      } } };
    const actor = variant === 'player-range' || variant === 'line-of-sight' ? f.player : f.god;
    if (variant === 'area-healing') choice.spellSelections!.applications = { [`magic-heal:${f.occurrences[0]}`]: { poolKey: 'fixture-head' } };
    if (actor.authority === 'god-owner') await tx.update(campaignCharacter).set({ isNpc: true, npcBuildMode: "detailed" }).where(eq(campaignCharacter.id, f.heroId));
    if (variant === 'out-of-range') { await assert.rejects(previewCombatChoiceInTransaction(tx, f.context, actor, choice), /limited to 30/); throw rollback; }
    const preview = await previewCombatChoiceInTransaction(tx, f.context, actor, choice);
    assert.equal(preview.kind, 'declaration'); if (preview.kind !== 'declaration') throw new Error('Expected Spell');
    const mana = async () => (await readActiveManaInTransaction(tx, f.heroId)).pools.find(row => row.system === 'Spellcraft')!.currentMana;
    const beforeMana = await mana();
    const input = { choice, requestKey: crypto.randomUUID(), roll: { method: 'entered' as const, enteredTotal: 70 } };
    const submitted = await submitCombatChoiceInTransaction(tx, f.context, actor, input); assert.ok('declarationId' in submitted);
    const repeated = await submitCombatChoiceInTransaction(tx, f.context, actor, input);
    assert.ok('declarationId' in repeated); assert.equal(repeated.declarationId, submitted.declarationId); assert.equal(repeated.reused, true);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, submitted.declarationId);
    const state = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, state, advanceInitiativeTimeline(state, 22 - preview.snapshot.initiativeCost));
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, submitted.declarationId);
    const plan = (await readActionEffectWorkspaceInTransaction(tx, f.context)).plans.find(row => row.id === planId)!;
    const manual = ['player-range', 'line-of-sight', 'unknown-harmfulness'].includes(variant);
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, submitted.declarationId, planId)).status, manual ? 'requires-god-ruling' : 'applied');
    assert.equal(await mana(), beforeMana - preview.snapshot.authoredSource!.resourceCosts[0].amount!);
    const local = (await tx.select().from(member).where(eq(member.characterId, f.occurrences[0])))[0].localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> }; conditions?: unknown[]; modifiers?: unknown[] };
    if (variant === 'area-healing') { assert.equal(local.health.totalDamage, 4); assert.equal(local.health.poolDamage['fixture-head'], 1); }
    else if (manual || isInteraction) { assert.equal(local.health.totalDamage, 0); assert.equal(local.conditions?.length ?? 0, 0); }
    else { assert.equal(local.health.totalDamage, 1 + plan.governingRollSnapshot!.resolution.additionalSuccesses); assert.equal(local.conditions!.length, 1); assert.equal(local.modifiers!.length, 1); }
    if (variant === 'condition-immunity') assert.equal(plan.effects[0].status, 'declined');
    if (variant === 'unknown-harmfulness') assert.equal(storedIncomingResolution(plan.effects[0].authoredValue)?.issues[0].code, 'unknown-harmfulness');
    throw rollback;
  }), expected);
});

test("Spell extension persistence accepts optional shared types and rejects unapproved submitted types before writing", async () => {
  await assert.rejects(db.transaction(async tx => {
    const f = await completionServiceFixture(tx, "spell-type-save");
    const learned = await addLearnedCombatSpell(tx, f);
    const document: SpellDocument = { ...learned.spell, frameworkSkillId: undefined };
    const originalCalculation = calculateSpell(document);
    for (const damageType of [undefined, "", "Fire", "supernatural / Fire"]) {
      document.containers[0].effects[0].damageType = damageType;
      await saveSkillExtensionMutations(tx, { skillId: learned.spellSkill.id, name: document.name, classification: "standard", actor: { userId: f.godId, roles: ["god"] },
        previous: [], mutations: [{ operation: "upsert", extensionType: "spell-construction", schemaVersion: document.schemaVersion, data: document }] });
      const [saved] = await tx.select().from(skillExtension).where(eq(skillExtension.skillId, learned.spellSkill.id));
      const decoded = readSkillExtension(saved); assert.equal(decoded.readStatus, "ready");
      const roundTrip = decoded.data as SpellDocument;
      assert.equal(roundTrip.id, document.id); assert.equal(roundTrip.containers[0].id, "bolt-target");
      assert.equal(roundTrip.containers[0].effects[0].id, "bolt-damage");
      assert.equal(roundTrip.containers[0].effects[0].damageType, damageType === "supernatural / Fire" ? "Fire / Supernatural" : damageType);
      assert.equal(roundTrip.calculation!.totalMana, originalCalculation.totalMana);
      assert.equal(roundTrip.calculation!.spellMastery, originalCalculation.spellMastery);
      assert.equal(roundTrip.calculation!.castingTime, originalCalculation.castingTime);
    }
    const before = await tx.select().from(skillExtension).where(eq(skillExtension.skillId, learned.spellSkill.id));
    document.containers[0].effects[0].damageType = "Pow";
    await assert.rejects(saveSkillExtensionMutations(tx, { skillId: learned.spellSkill.id, name: document.name, classification: "standard", actor: { userId: f.godId, roles: ["god"] },
      previous: before, mutations: [{ operation: "upsert", extensionType: "spell-construction", schemaVersion: document.schemaVersion, data: document }] }), /Damage Type/);
    assert.deepEqual(await tx.select().from(skillExtension).where(eq(skillExtension.skillId, learned.spellSkill.id)), before);
    throw rollback;
  }), expected);
});

for (const scenario of ["legacy", "Fire", "Cold", "Blunt / Fire", "two-types", "area"] as const) test(`Spell Damage Type ${scenario} survives frozen targeting and consequence application`, async () => {
  await assert.rejects(db.transaction(async tx => {
    const f = await completionServiceFixture(tx, `spell-types-${scenario}`);
    await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
    const learned = await addLearnedCombatSpell(tx, f, { area: scenario === "area", fixed: true });
    const document: SpellDocument = learned.spell;
    if (scenario !== "legacy") document.containers[0].effects[0].damageType = ["area", "two-types"].includes(scenario) ? "Fire" : scenario;
    if (scenario === "two-types") document.containers[0].effects.push({ id: "cold-damage", ruleId: "damage", quantity: 2, damageType: "Cold" });
    await tx.update(skillExtension).set({ dataJson: JSON.stringify(document) }).where(eq(skillExtension.skillId, learned.spellSkill.id));
    await tx.update(initiativeParticipant).set({ participationStatus: "active" }).where(and(eq(initiativeParticipant.encounterId, f.encounterId), eq(initiativeParticipant.characterId, f.heroId)));
    if (scenario !== "legacy") await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot, core: { ...f.creatureSnapshot.core,
      interactionRules: { schemaVersion: 1, rules: [{ key: "fire-resistance", name: "Fire Resistance", ruleType: "resistance", scope: "damage", match: "ALL", percentage: 50, sortOrder: 0, notes: "",
        conditions: [{ key: "fire", kind: "damage-type", damageType: "Fire" }], crImpact: "None" }] } },
    } }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.occurrences[0])));
    const area = scenario === "area";
    const choice: CombatChoice = { participantId: f.heroId, source: { kind: "spell", ref: `catalog:${learned.allocation.id}`, instanceId: null, itemId: null, name: document.name, description: "" },
      targetIds: area ? [] : [f.occurrences[0]], spellSelections: { targetGroups: { "bolt-target": area ? [] : [f.occurrences[0]] }, applications: {} } };
    const preview = await previewCombatChoiceInTransaction(tx, f.context, f.player, choice); assert.equal(preview.kind, "declaration"); if (preview.kind !== "declaration") throw new Error("Expected spell preview");
    const submitted = await submitCombatChoiceInTransaction(tx, f.context, f.player, { choice, requestKey: crypto.randomUUID(), roll: { method: "entered", enteredTotal: 70 } });
    assert.ok("declarationId" in submitted);
    const [action] = await tx.select().from(declaration).where(eq(declaration.id, submitted.declarationId));
    const frozen = parseLockedActionDeclarationSnapshot(action.lockedSnapshotJson).authoredSource!;
    assert.equal(frozen.incomingSourceFacts?.damageType, null, "no Spell-wide type");
    if (!area) assert.deepEqual(frozen.effects.map(e => [e.instruction.spellEffectId, e.instruction.damageType]), document.containers[0].effects.map(e => [e.id, e.damageType ?? ""]));
    // A later catalog edit must not alter already frozen per-effect types.
    const edited = structuredClone(document); edited.containers[0].effects[0].damageType = "Acid";
    await tx.update(skillExtension).set({ dataJson: JSON.stringify(edited) }).where(eq(skillExtension.skillId, learned.spellSkill.id));
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, action.id);
    const engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, engine, advanceInitiativeTimeline(engine, 22 - preview.snapshot.initiativeCost));
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, action.id, undefined, area ? { "bolt-target": [f.occurrences[0]] } : {});
    const plan = (await readActionEffectWorkspaceInTransaction(tx, f.context)).plans.find(p => p.id === planId)!;
    const effects = plan.effects.filter(e => e.effectType === "health.damage"); assert.equal(effects.length, document.containers[0].effects.length);
    let totalDamage = 0;
    for (const [index, effect] of effects.entries()) {
      const resolution = storedIncomingResolution(effect.authoredValue)!; assert.ok(resolution);
      const type = document.containers[0].effects[index].damageType ?? null;
      assert.equal(resolution.input.source.damageType, type);
      if (scenario === "Blunt / Fire") { assert.equal(effect.status, "requires-god-ruling"); assert.equal(effect.applicationSupported, false); }
      else { const damage = type === "Fire" ? Math.ceil(resolution.input.effect.amount! / 2) : resolution.input.effect.amount!;
        assert.equal(resolution.finalEffect!.damage, damage); totalDamage += damage; }
    }
    const result = await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action.id, planId);
    assert.equal(result.status, scenario === "Blunt / Fire" ? "requires-god-ruling" : "applied");
    const [target] = await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.occurrences[0])));
    assert.equal((target.localStateJson as { health: { totalDamage: number } }).health.totalDamage, totalDamage);
    throw rollback;
  }), expected);
});

for (const scenario of ["scaled", "static", "progressive-scaled", "progressive-static", "failed", "area", "area-static", "area-failed", "area-critical", "unlearned"] as const) test(`learned spell ${scenario}: actual Skill, original Roll, automatic location or area report`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, `learned-${scenario}`);
    await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
    const area = scenario.startsWith("area"), fixed = scenario === "static" || scenario === "progressive-static" || scenario === "area-static";
    const learned = await addLearnedCombatSpell(tx, f, { area, fixed: scenario === "static" || scenario === "area-static" });
    if (scenario.startsWith("progressive")) {
      const originalScaling = learned.spell.modifiers[0];
      learned.spell.modifiers = [createModifierSelection("progressive-spell"), ...(fixed ? [originalScaling] : [])];
      learned.spell.containers[0].rangeRuleId = "melee-reach";
      learned.spell.progressive.enabled = true;
      learned.spell.progressive.milestones.find((entry) => entry.level === "Novice")!.changes = [
        ...(fixed ? [{ kind: "remove-modifier" as const, modifierId: originalScaling.id }] : []),
        { kind: "add-modifier", modifier: createModifierSelection(fixed ? "static-assignment" : "per-success-assignment") },
        { kind: "set-range", containerId: "bolt-target", rangeRuleId: "short", rangeDescription: "Short (30 ft)" },
      ];
      await tx.update(skillExtension).set({ dataJson: JSON.stringify(learned.spell) }).where(and(eq(skillExtension.skillId, learned.spellSkill.id), eq(skillExtension.extensionType, "spell-construction")));
    }
    await tx.update(initiativeParticipant).set({ participationStatus: "active" }).where(and(eq(initiativeParticipant.encounterId, f.encounterId), eq(initiativeParticipant.characterId, f.heroId)));
    await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot,
      hpPools: [...f.creatureSnapshot.hpPools, { canonicalId: "fixture-arm", poolName: "Right Arm", maximumHp: 20 }],
      hitLocations: [...f.creatureSnapshot.hitLocations, { hitLocationNumber: 2, locationName: "Right Arm", hpPoolCanonicalId: "fixture-arm", naturalArmor: "0", soak: "0" }],
    } }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.occurrences[0])));
    const choice: CombatChoice = { participantId: f.heroId, source: { kind: "spell", ref: `catalog:${learned.allocation.id}`, instanceId: null, itemId: null, name: learned.spell.name, description: "" },
      targetIds: area ? [] : [f.occurrences[0]], spellSelections: { targetGroups: { "bolt-target": area ? [] : [f.occurrences[0]] },
        applications: { [`bolt-damage:${f.occurrences[0]}`]: { hitLocationNumber: 0, poolKey: "fixture-head" } } } };
    if (scenario.startsWith("progressive")) choice.spellSelections!.ranges = { [`bolt-target:${f.occurrences[0]}`]: { distanceFeet: 25 } };
    const casterAuthority = scenario.startsWith("progressive") ? f.god : f.player;
    if (casterAuthority.authority === 'god-owner') await tx.update(campaignCharacter).set({ isNpc: true, npcBuildMode: "detailed" }).where(eq(campaignCharacter.id, f.heroId));
    const beforeHealth = await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, f.heroId));
    const preview = await previewCombatChoiceInTransaction(tx, f.context, casterAuthority, choice);
    assert.equal(preview.kind, "declaration"); if (preview.kind !== "declaration") throw new Error("Expected cast preview");
    assert.equal(preview.snapshot.authoredSource?.resolutionMode, "skill-roll");
    if (scenario.startsWith("progressive")) {
      assert.equal(preview.snapshot.authoredSource!.effects[0].scaling, fixed ? "fixed" : "per-success");
      const casting = preview.snapshot.authoredSource!.authoredData.casting as { activeProgressiveTier: string; targetGroups: { rangeLabel: string }[] };
      assert.equal(casting.activeProgressiveTier, "Novice");
      assert.match(casting.targetGroups[0].rangeLabel, /Short/);
    }
    assert.equal(preview.snapshot.authoredSource?.governingSnapshot?.kind, "skill");
    assert.equal((preview.snapshot.authoredSource?.governingSnapshot as { allocationId: number }).allocationId, learned.allocation.id);
    assert.notEqual((preview.snapshot.authoredSource?.governingSnapshot as { allocationId: number }).allocationId, learned.root.id);
    const manaBefore = (await readActiveManaInTransaction(tx, f.heroId)).pools.find((entry) => entry.system === "Spellcraft")!.currentMana;
    const input = { choice, requestKey: crypto.randomUUID(), roll: { method: "entered" as const, enteredTotal: scenario.includes("failed") ? 12 : scenario === "area-critical" ? 100 : 72 } };
    if (scenario === "unlearned") {
      await tx.update(campaignCharacterSkillAllocation).set({ points: 0 }).where(eq(campaignCharacterSkillAllocation.id, learned.allocation.id));
      await assert.rejects(submitCombatChoiceInTransaction(tx, f.context, casterAuthority, input), /no longer owns|Skill/);
      assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 0);
      assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools.find((entry) => entry.system === "Spellcraft")!.currentMana, manaBefore);
      throw rollback;
    }
    const submitted = await submitCombatChoiceInTransaction(tx, f.context, casterAuthority, input);
    assert.ok("declarationId" in submitted);
    const repeated = await submitCombatChoiceInTransaction(tx, f.context, casterAuthority, input);
    assert.ok("declarationId" in repeated); assert.equal(repeated.declarationId, submitted.declarationId);
    const [action] = await tx.select().from(declaration).where(eq(declaration.id, submitted.declarationId));
    const manaAfter = (await readActiveManaInTransaction(tx, f.heroId)).pools.find((entry) => entry.system === "Spellcraft")!.currentMana;
    assert.equal(manaAfter, manaBefore - preview.snapshot.authoredSource!.resourceCosts[0].amount!);
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, action.id);
    const engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, engine, advanceInitiativeTimeline(engine, 22 - preview.snapshot.initiativeCost));
    if (area) await assert.rejects(generateActionEffectPlanInTransaction(tx, f.context, f.god, action.id), /Confirm the affected participants/);
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, action.id, undefined, area ? { "bolt-target": [] } : {});
    const plan = (await readActionEffectWorkspaceInTransaction(tx, f.context)).plans.find((entry) => entry.id === planId)!;
    const successes = plan.governingRollSnapshot!.resolution.succeeded ? plan.governingRollSnapshot!.resolution.totalSuccesses : 0;
    if (area) { assert.equal(plan.status, scenario === "area-critical" ? "requires-god-ruling" : "calculated"); assert.deepEqual(plan.effects, [], "An AoE with no selected victims creates no effect proposals or caster damage."); }
    else if (scenario !== "failed") {
      const value = plan.effects[0].finalValue as { application?: { hitLocationNumber: number; poolKey: string }; effect: { amount: number } };
      assert.equal(value.application?.hitLocationNumber, 2); assert.equal(value.application?.poolKey, "fixture-arm"); assert.equal(value.effect.amount, fixed ? 2 + plan.governingRollSnapshot!.resolution.additionalSuccesses : 2 * successes);
    }
    if (scenario === "area-critical") {
      for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action.id, planId)).status, "requires-god-ruling");
      assert.deepEqual(await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, f.heroId)), beforeHealth, "A critical zero-victim AoE never damages the caster.");
      assert.notEqual((await tx.select().from(declaration).where(eq(declaration.id, action.id)))[0].status, "resolved");
      throw rollback;
    }
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action.id, planId)).status, "applied");
    const [target] = await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.occurrences[0])));
    const health = (target.localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> } }).health;
    assert.equal(health.totalDamage, area || scenario === "failed" ? 0 : fixed ? 2 + plan.governingRollSnapshot!.resolution.additionalSuccesses : 2 * successes);
    assert.equal(health.poolDamage["fixture-head"] ?? 0, 0, "A browser-supplied head location cannot replace the casting Roll's location.");
    assert.deepEqual(await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, f.heroId)), beforeHealth, "The caster is never damaged by an area report.");
    assert.equal((await tx.select().from(declaration).where(eq(declaration.id, action.id)))[0].status, "resolved");
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 1);
    assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools.find((entry) => entry.system === "Spellcraft")!.currentMana, manaAfter);
    throw rollback;
  }), expected);
});

test("learned spell AoE applies equal calculated damage to selected victims once and never to the caster", async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, "learned-area-selected");
    await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
    const learned = await addLearnedCombatSpell(tx, f, { area: true, name: "Selected Area Bolt" });
    await tx.update(initiativeParticipant).set({ participationStatus: "active" }).where(and(eq(initiativeParticipant.encounterId, f.encounterId), eq(initiativeParticipant.characterId, f.heroId)));
    for (const targetId of f.occurrences) await tx.update(member).set({ creatureSnapshotJson: { ...f.creatureSnapshot,
      hpPools: [...f.creatureSnapshot.hpPools, { canonicalId: "fixture-arm", poolName: "Right Arm", maximumHp: 20 }],
      hitLocations: [...f.creatureSnapshot.hitLocations, { hitLocationNumber: 2, locationName: "Right Arm", hpPoolCanonicalId: "fixture-arm", naturalArmor: "0", soak: "0" }],
    } }).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, targetId)));
    const choice: CombatChoice = { participantId: f.heroId, source: { kind: "spell", ref: `catalog:${learned.allocation.id}`, instanceId: null, itemId: null, name: learned.spell.name, description: "" },
      targetIds: [], spellSelections: { targetGroups: { "bolt-target": [] }, applications: {} } };
    const beforeCasterHealth = await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, f.heroId));
    const preview = await previewCombatChoiceInTransaction(tx, f.context, f.player, choice);
    assert.equal(preview.kind, "declaration"); if (preview.kind !== "declaration") throw new Error("Expected cast preview");
    const input = { choice, requestKey: crypto.randomUUID(), roll: { method: "entered" as const, enteredTotal: 72 } };
    const submitted = await submitCombatChoiceInTransaction(tx, f.context, f.player, input);
    assert.ok("declarationId" in submitted);
    assert.deepEqual(await submitCombatChoiceInTransaction(tx, f.context, f.player, input), { declarationId: submitted.declarationId, reused: true });
    const [action] = await tx.select().from(declaration).where(eq(declaration.id, submitted.declarationId));
    await resolveDeclaredDefensesInTransaction(tx, f.context, f.god, action.id);
    const engine = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    await persistInitiativeEngineInTransaction(tx, f.context, engine, advanceInitiativeTimeline(engine, 22 - preview.snapshot.initiativeCost));
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, action.id, undefined, { "bolt-target": f.occurrences });
    assert.equal(await generateActionEffectPlanInTransaction(tx, f.context, f.god, action.id, undefined, { "bolt-target": f.occurrences }), planId);
    const plan = (await readActionEffectWorkspaceInTransaction(tx, f.context)).plans.find((entry) => entry.id === planId)!;
    assert.equal(plan.status, "calculated"); assert.equal(plan.effects.length, 2);
    assert.deepEqual(plan.effects.map(({ targetParticipantId }) => targetParticipantId).sort((a, b) => a - b), [...f.occurrences].sort((a, b) => a - b));
    const gross = plan.effects.map((effect) => (effect.finalValue as { effect: { amount: number } }).effect.amount);
    assert.equal(gross[0], gross[1]);
    const successes = plan.governingRollSnapshot!.resolution.totalSuccesses;
    assert.equal(gross[0], 2 * successes);
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 1);
    const manaAfterDeclaration = (await readActiveManaInTransaction(tx, f.heroId)).pools.find((entry) => entry.system === "Spellcraft")!.currentMana;
    const firstApply = await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action.id, planId);
    assert.equal(firstApply.status, "applied");
    assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action.id, planId)).status, "applied");
    for (const targetId of f.occurrences) {
      const [target] = await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, targetId)));
      const health = (target.localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> } }).health;
      assert.equal(health.totalDamage, gross[0]); assert.equal(health.poolDamage["fixture-arm"], gross[0]);
    }
    assert.deepEqual(await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, f.heroId)), beforeCasterHealth);
    assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools.find((entry) => entry.system === "Spellcraft")!.currentMana, manaAfterDeclaration);
    throw rollback;
  }), expected);
});

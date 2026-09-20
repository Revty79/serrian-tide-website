import assert from "node:assert/strict";
import { after, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaignCharacterSkillAllocation, campaignCharacterActiveHealth } from "@/db/realm-schema";
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
import { skillExtension } from "@/db/skill-schema";
import { createModifierSelection } from "@/features/spell-construction/utilities/spellFactory";

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_LEARNED_SPELL");
const expected = (error: unknown) => { if (error !== rollback) console.error(error); return error === rollback; };

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
    const beforeHealth = await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, f.heroId));
    const preview = await previewCombatChoiceInTransaction(tx, f.context, f.player, choice);
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
      await assert.rejects(submitCombatChoiceInTransaction(tx, f.context, f.player, input), /no longer owns|Skill/);
      assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 0);
      assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools.find((entry) => entry.system === "Spellcraft")!.currentMana, manaBefore);
      throw rollback;
    }
    const submitted = await submitCombatChoiceInTransaction(tx, f.context, f.player, input);
    assert.ok("declarationId" in submitted);
    const repeated = await submitCombatChoiceInTransaction(tx, f.context, f.player, input);
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

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

if (process.env.SERRIAN_DISPOSABLE_COMBAT_COMPLETION !== "true") throw new Error("Use the disposable combat completion harness.");
after(() => pool.end());
const rollback = new Error("ROLLBACK_LEARNED_SPELL");
const expected = (error: unknown) => { if (error !== rollback) console.error(error); return error === rollback; };

for (const scenario of ["scaled", "static", "failed", "area", "area-failed", "area-critical", "unlearned"] as const) test(`learned spell ${scenario}: actual Skill, original Roll, automatic location or area report`, async () => {
  await assert.rejects(db.transaction(async (tx) => {
    const f = await completionServiceFixture(tx, `learned-${scenario}`);
    await tx.insert(userRole).values([{ userId: f.godId, role: "god" }, { userId: f.godId, role: "player" }]);
    const area = scenario.startsWith("area"), learned = await addLearnedCombatSpell(tx, f, { area, fixed: scenario === "static" });
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
    const planId = await generateActionEffectPlanInTransaction(tx, f.context, f.god, action.id);
    const plan = (await readActionEffectWorkspaceInTransaction(tx, f.context)).plans.find((entry) => entry.id === planId)!;
    const value = plan.effects[0].finalValue as { application?: { hitLocationNumber: number; poolKey: string }; amount?: number; effect: { amount: number } };
    const successes = plan.governingRollSnapshot!.resolution.succeeded ? plan.governingRollSnapshot!.resolution.totalSuccesses : 0;
    if (area) { assert.equal(plan.status, "calculated"); assert.equal(plan.effects[0].effectType, "spell.area-report"); assert.equal(value.amount, 2 * successes); }
    else if (scenario !== "failed") { assert.equal(value.application?.hitLocationNumber, 2); assert.equal(value.application?.poolKey, "fixture-arm"); assert.equal(value.effect.amount, scenario === "static" ? 2 : 2 * successes); }
    for (let retry = 0; retry < 2; retry++) assert.equal((await applyRoutineCombatConsequencesInTransaction(tx, f.context, f.god, action.id, planId)).status, "applied");
    const [target] = await tx.select().from(member).where(and(eq(member.encounterId, f.encounterId), eq(member.characterId, f.occurrences[0])));
    const health = (target.localStateJson as { health: { totalDamage: number; poolDamage: Record<string, number> } }).health;
    assert.equal(health.totalDamage, area || scenario === "failed" ? 0 : scenario === "static" ? 2 : 2 * successes);
    assert.equal(health.poolDamage["fixture-head"] ?? 0, 0, "A browser-supplied head location cannot replace the casting Roll's location.");
    assert.deepEqual(await tx.select().from(campaignCharacterActiveHealth).where(eq(campaignCharacterActiveHealth.characterId, f.heroId)), beforeHealth, "The caster is never damaged by an area report.");
    assert.equal((await tx.select().from(declaration).where(eq(declaration.id, action.id)))[0].status, "resolved");
    assert.equal((await tx.select().from(campaignSessionRoll).where(eq(campaignSessionRoll.encounterId, f.encounterId))).length, 1);
    assert.equal((await readActiveManaInTransaction(tx, f.heroId)).pools.find((entry) => entry.system === "Spellcraft")!.currentMana, manaAfter);
    throw rollback;
  }), expected);
});

import assert from "node:assert/strict";
import test from "node:test";
import { attackReportTarget, isSpellResultReport } from "./attack-report";
import type { ActionEffectPlanView } from "@/features/tabletop-operations/action-effect-plan-service";

test("direct spells stop for one result review", () => {
  const plan = { sourceKind: "spell", status: "calculated", effects: [{ effectType: "health.damage", effectKey: "spell-effect:damage" }] } as unknown as ActionEffectPlanView;
  assert.equal(isSpellResultReport(plan), true);
  assert.equal(isSpellResultReport({ ...plan, status: "requires-god-ruling" }), false);
});

test("area-only spell reports complete automatically", () => {
  const plan = { sourceKind: "spell", status: "calculated", effects: [{ effectType: "spell.area-report", effectKey: "spell-effect:area" }] } as unknown as ActionEffectPlanView;
  assert.equal(isSpellResultReport(plan), false);
});

test("source-linked spell recovery uses the G.O.D. recovery ruling path", () => {
  const plan = { sourceKind: "spell", status: "requires-god-ruling", effects: [{ effectType: "manual", effectKey: "spell-combat-recovery:target:4" }] } as unknown as ActionEffectPlanView;
  assert.equal(isSpellResultReport(plan), false);
});

test("minimal spell report effects without a key remain reportable", () => {
  const plan = { sourceKind: "spell", status: "calculated", effects: [{ effectType: "health.damage" }] } as unknown as ActionEffectPlanView;
  assert.equal(isSpellResultReport(plan), true);
});

test("the report displays the recorded location and overridden damage without recalculating the attack", () => {
  const effect = { status: "calculated", targetName: "Bull", authoredValue: { roll: { succeeded: true } },
    finalValue: { effect: { amount: 9 }, application: { hitLocationNumber: 0, ordinaryAttack: { locationName: "Head", issues: [] } } },
    calculatedValue: { baseDamage: 4, extraSuccesses: 2, armor: 1, soak: 0, netDamage: 5 } } as unknown as ActionEffectPlanView["effects"][number];
  const result = attackReportTarget(effect);
  assert.equal(result.damage, 9); assert.equal(result.suggestedDamage, 5); assert.equal(result.location, "Head");
  const miss = attackReportTarget({ ...effect, status: "declined", finalValue: null, authoredValue: { roll: { succeeded: false } } });
  assert.equal(miss.damage, 0); assert.equal(miss.outcome, "Miss"); assert.equal(miss.calculation, null);
});

test("a critical ruling retains calculated incoming damage while an unresolved interaction hides it", () => {
  const effect = { status: "requires-god-ruling", targetName: "Bull", authoredValue: { roll: { succeeded: true }, incomingEffectResolution: { schemaVersion: 1, status: "resolved" } },
    finalValue: { effect: { kind: "health.damage", amount: 14 }, application: { hitLocationNumber: 0, ordinaryAttack: { locationName: "Head", issues: ["Critical ruling required"] } } },
    calculatedValue: { grossDamage: 14, netDamage: 14, incomingResolution: true } } as unknown as ActionEffectPlanView["effects"][number];
  assert.equal(attackReportTarget(effect).damage, 14);
  const unknown = { ...effect, authoredValue: { incomingEffectResolution: { schemaVersion: 1, status: "requires-god-ruling" } } };
  assert.equal(attackReportTarget(unknown).damage, null);
  assert.equal(attackReportTarget(unknown).suggestedDamage, null);
  assert.equal(attackReportTarget({ ...unknown, status: "calculated" }).damage, 14, "An explicit final G.O.D. decision remains visible alongside the original unresolved trace.");
});

test("Absorption is displayed as healing with zero damage", () => {
  const effect = { status: "calculated", targetName: "Bull", authoredValue: { incomingEffectResolution: { schemaVersion: 1, status: "absorbed" } },
    finalValue: { effect: { kind: "health.heal", amount: 6 }, application: { poolKey: "head" } } } as unknown as ActionEffectPlanView["effects"][number];
  const result = attackReportTarget(effect);
  assert.equal(result.damage, 0); assert.equal(result.healing, 6); assert.equal(result.outcome, "Absorbed as healing");
});

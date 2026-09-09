import assert from "node:assert/strict";
import test from "node:test";
import { attackReportTarget, isSpellResultReport } from "./attack-report";
import type { ActionEffectPlanView } from "@/features/tabletop-operations/action-effect-plan-service";

test("direct spells stop for one result review, while area-only reports complete automatically", () => {
  const plan = { sourceKind: "spell", status: "calculated", effects: [{ effectType: "health.damage" }] } as unknown as ActionEffectPlanView;
  assert.equal(isSpellResultReport(plan), true);
  assert.equal(isSpellResultReport({ ...plan, effects: [{ ...plan.effects[0], effectType: "spell.area-report" }] }), false);
  assert.equal(isSpellResultReport({ ...plan, status: "requires-god-ruling" }), false);
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

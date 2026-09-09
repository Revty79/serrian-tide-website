import assert from "node:assert/strict";
import test from "node:test";
import { combatEffectSummary, combatRollSummary } from "./result-summary";
import { resolvePercentileCheck } from "@/features/tabletop-operations/percentile-resolution";
import type { RollMechanicalSnapshot } from "@/features/tabletop-operations/roll-mechanical-snapshot";

const damage = { effectType: "health.damage", status: "applied" as const, authoredValue: { roll: { succeeded: true } }, calculatedValue: { baseDamage: 4, extraSuccesses: 2, armor: 2, soak: 1, netDamage: 3 },
  finalValue: { effect: { amount: 3 }, application: { ordinaryAttack: { locationName: "Head" } } }, amendmentReason: "" };
test("damage history distinguishes applied damage, a failed attack, defense, and complete protection", () => {
  assert.equal(combatEffectSummary(damage, true), "3 damage applied to Head. Damage calculation: 4 base + 2 extra successes - 2 armor - 1 soak = 3.");
  assert.equal(combatEffectSummary({ ...damage, status: "declined", finalValue: null, authoredValue: { roll: { succeeded: false } } }, true), "Miss - no damage applied.");
  assert.match(combatEffectSummary({ ...damage, status: "declined", finalValue: null, amendmentReason: "The resolved defense prevented the attack's damage." }, true), /^The resolved defense prevented/);
  assert.match(combatEffectSummary({ ...damage, status: "declined", finalValue: null, amendmentReason: "Armor and soak absorbed the complete hit." }, true), /^Armor and soak absorbed/);
  assert.match(combatEffectSummary({ ...damage, status: "calculated" }, true), /^3 damage pending to Head/);
});
test("restricted result summaries do not disclose roll or armor mechanics", () => {
  assert.equal(combatEffectSummary(damage, false), "3 damage applied.");
  assert.equal(combatEffectSummary({ ...damage, status: "declined", finalValue: null }, false), "No damage applied.");
  assert.equal(combatRollSummary({ effectiveMechanicalSnapshot: null, effectiveResultTotal: 28, status: "recorded" }), "Roll 28");
});
test("the Cat's recorded low rolls against 90 explain failures, without treating 90 as a success chance", () => {
  for (const resultTotal of [28, 38, 29]) {
    const resolution = resolvePercentileCheck({ resultTotal, originalTarget: 90 });
    assert.equal(resolution.succeeded, false);
    assert.match(combatRollSummary({ effectiveMechanicalSnapshot: { resolution } as RollMechanicalSnapshot, effectiveResultTotal: resultTotal, status: "recorded" }), /roll-over target 90: failure; 0 extra successes/);
  }
});

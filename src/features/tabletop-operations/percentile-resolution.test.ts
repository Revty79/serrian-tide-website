import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePerSuccessQuantity,
  compareAttackAndDefense,
  resolvePercentileCheck,
  validateRollResult,
  type PercentileResolutionInput,
  type PercentileTargetModifier,
} from "./percentile-resolution";

function resolve(
  resultTotal: number,
  originalTarget: number,
  modifiers: readonly PercentileTargetModifier[] = [],
) {
  return resolvePercentileCheck({ resultTotal, originalTarget, modifiers });
}

test("percentile validation accepts only whole results from 1 through 100", () => {
  assert.equal(validateRollResult(1), 1);
  assert.equal(validateRollResult(100), 100);
  for (const invalid of [0, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => validateRollResult(invalid));
  }
});

test("ordinary roll-over boundaries count basic and complete additional successes", () => {
  const cases = [
    { roll: 49, succeeded: false, additional: 0, total: 0 },
    { roll: 50, succeeded: true, additional: 0, total: 1 },
    { roll: 59, succeeded: true, additional: 0, total: 1 },
    { roll: 60, succeeded: true, additional: 1, total: 2 },
    { roll: 79, succeeded: true, additional: 2, total: 3 },
    { roll: 99, succeeded: true, additional: 4, total: 5 },
  ] as const;
  for (const expected of cases) {
    const result = resolve(expected.roll, 50);
    assert.equal(result.succeeded, expected.succeeded, `roll ${expected.roll}`);
    assert.equal(result.basicSuccess, expected.succeeded, `roll ${expected.roll}`);
    assert.equal(result.additionalSuccesses, expected.additional, `roll ${expected.roll}`);
    assert.equal(result.totalSuccesses, expected.total, `roll ${expected.roll}`);
  }
});

test("labeled bonuses lower and penalties raise the target without clamping", () => {
  const modifiers = [
    { kind: "bonus", label: "Clear sight line", magnitude: 20 },
    { kind: "penalty", label: "Moving target", magnitude: 5 },
    { kind: "bonus", label: "Prepared position", magnitude: 40 },
    { kind: "penalty", label: "Heavy rain", magnitude: 3 },
  ] as const;
  const result = resolve(20, 25, modifiers);
  assert.equal(result.originalTarget, 25);
  assert.equal(result.totalBonuses, 60);
  assert.equal(result.totalPenalties, 8);
  assert.equal(result.finalTarget, -27);
  assert.deepEqual(result.modifiers, modifiers);
});

test("malformed targets and modifiers are rejected instead of coerced", () => {
  assert.throws(() => resolve(50, Number.NaN), /target must be finite/i);
  assert.throws(() => resolve(50, Number.POSITIVE_INFINITY), /target must be finite/i);
  assert.throws(() => resolve(50, 1_000_001), /between/);
  assert.throws(() => resolve(50, 50, [
    { kind: "bonus", label: "Invalid", magnitude: -1 },
  ]), /must not be negative/);
  assert.throws(() => resolve(50, 50, [
    { kind: "penalty", label: "Invalid", magnitude: Number.NaN },
  ]), /must be finite/);
  assert.throws(() => resolvePercentileCheck({
    resultTotal: 50,
    originalTarget: 50,
    modifiers: [{ kind: "bonus", label: "", magnitude: 1 }],
  }), /requires a label/);
});

test("zero and negative targets are automatic and count from the actual target", () => {
  const zero = resolve(10, 0);
  assert.equal(zero.automaticSuccess, true);
  assert.equal(zero.finalTarget, 0);
  assert.equal(zero.additionalSuccesses, 1);
  assert.equal(zero.totalSuccesses, 2);

  const negative = resolve(20, -10);
  assert.equal(negative.automaticSuccess, true);
  assert.equal(negative.finalTarget, -10);
  assert.equal(negative.additionalSuccesses, 3);
  assert.equal(negative.totalSuccesses, 4);
});

test("01 reverses an automatic success while preserving would-be success math", () => {
  const cases = [
    { target: 0, additional: 0, total: 1 },
    { target: -10, additional: 1, total: 2 },
  ] as const;
  for (const expected of cases) {
    const result = resolve(1, expected.target);
    assert.equal(result.outcome, "failure");
    assert.equal(result.succeeded, false);
    assert.equal(result.mathematicalSuccess, true);
    assert.equal(result.basicSuccess, true);
    assert.equal(result.additionalSuccesses, expected.additional);
    assert.equal(result.totalSuccesses, expected.total);
    assert.equal(result.automaticSuccess, true);
    assert.equal(result.criticalFailure, true);
    assert.equal(result.requiresGodRuling, true);
    assert.deepEqual(result.rulingReasons, ["critical-failure"]);
  }
});

test("targets above 100 remain impossible until bonuses make them reachable", () => {
  const impossible = resolve(99, 110);
  assert.equal(impossible.impossibleTarget, true);
  assert.equal(impossible.succeeded, false);
  assert.equal(impossible.totalSuccesses, 0);

  const reachable = resolve(95, 110, [{ kind: "bonus", label: "Aimed", magnitude: 15 }]);
  assert.equal(reachable.finalTarget, 95);
  assert.equal(reachable.impossibleTarget, false);
  assert.equal(reachable.succeeded, true);
  assert.equal(reachable.totalSuccesses, 1);
});

test("double ott against an impossible target preserves both states for a ruling", () => {
  const result = resolve(100, 110);
  assert.equal(result.outcome, "failure");
  assert.equal(result.mathematicalSuccess, false);
  assert.equal(result.basicSuccess, false);
  assert.equal(result.totalSuccesses, 0);
  assert.equal(result.impossibleTarget, true);
  assert.equal(result.criticalSuccess, true);
  assert.equal(result.doubleOtt, true);
  assert.equal(result.requiresGodRuling, true);
  assert.deepEqual(result.rulingReasons, [
    "double-ott-critical-success",
    "double-ott-impossible-target-collision",
  ]);
});

test("critical flags preserve ordinary math and manufacture no consequence", () => {
  const criticalFailure = resolve(1, 50);
  assert.equal(criticalFailure.succeeded, false);
  assert.equal(criticalFailure.mathematicalSuccess, false);
  assert.equal(criticalFailure.criticalFailure, true);
  assert.equal(criticalFailure.criticalSuccess, false);
  assert.equal(criticalFailure.requiresGodRuling, true);

  const criticalSuccess = resolve(100, 50);
  assert.equal(criticalSuccess.succeeded, true);
  assert.equal(criticalSuccess.basicSuccess, true);
  assert.equal(criticalSuccess.additionalSuccesses, 5);
  assert.equal(criticalSuccess.totalSuccesses, 6);
  assert.equal(criticalSuccess.criticalSuccess, true);
  assert.equal(criticalSuccess.doubleOtt, true);
  assert.deepEqual(criticalSuccess.rulingReasons, ["double-ott-critical-success"]);
  assert.equal("damage" in criticalSuccess, false);
  assert.equal("extraAction" in criticalSuccess, false);
  assert.equal("condition" in criticalSuccess, false);
});

test("per-success quantity uses final successful levels with no critical multiplier", () => {
  const ordinary = calculatePerSuccessQuantity(resolve(70, 50), 3);
  assert.equal(ordinary.successCountApplied, 3);
  assert.equal(ordinary.appliedQuantity, 9);
  assert.equal(ordinary.requiresGodRuling, false);

  const failure = calculatePerSuccessQuantity(resolve(49, 50), 3);
  assert.equal(failure.successCountApplied, 0);
  assert.equal(failure.appliedQuantity, 0);

  const critical = calculatePerSuccessQuantity(resolve(100, 50), 3);
  assert.equal(critical.successCountApplied, 6);
  assert.equal(critical.appliedQuantity, 18);
  assert.equal(critical.requiresGodRuling, true);

  const reversedAutomaticSuccess = calculatePerSuccessQuantity(resolve(1, -10), 3);
  assert.equal(reversedAutomaticSuccess.successCountApplied, 0);
  assert.equal(reversedAutomaticSuccess.appliedQuantity, 0);
  assert.equal(reversedAutomaticSuccess.requiresGodRuling, true);

  const impossibleDoubleOtt = calculatePerSuccessQuantity(resolve(100, 110), 3);
  assert.equal(impossibleDoubleOtt.successCountApplied, 0);
  assert.equal(impossibleDoubleOtt.appliedQuantity, 0);
  assert.equal(impossibleDoubleOtt.requiresGodRuling, true);
  assert.throws(() => calculatePerSuccessQuantity(resolve(70, 50), Number.NaN), /must be finite/);
  assert.throws(() => calculatePerSuccessQuantity(resolve(70, 50), Number.POSITIVE_INFINITY), /must be finite/);
});

test("ordinary attack and defense comparisons use successful levels and defense-favored ties", () => {
  const cases = [
    {
      label: "ordinary tie",
      attack: resolve(70, 50),
      defense: resolve(80, 60),
      outcome: "defense-wins",
    },
    {
      label: "higher attack",
      attack: resolve(80, 50),
      defense: resolve(70, 50),
      outcome: "attack-wins",
    },
    {
      label: "higher defense",
      attack: resolve(70, 50),
      defense: resolve(90, 50),
      outcome: "defense-wins",
    },
    {
      label: "failed attack",
      attack: resolve(49, 50),
      defense: resolve(80, 50),
      outcome: "neither-side-produced-successful-attack",
    },
    {
      label: "failed defense",
      attack: resolve(70, 50),
      defense: resolve(49, 50),
      outcome: "attack-wins",
    },
  ] as const;

  for (const expected of cases) {
    const comparison = compareAttackAndDefense(expected.attack, expected.defense);
    assert.equal(comparison.outcome, expected.outcome, expected.label);
    assert.equal(comparison.objectiveOutcome, expected.outcome, expected.label);
    assert.equal(comparison.requiresGodRuling, false, expected.label);
  }
});

test("attacker double ott wins a matching-level tie without changing success counts", () => {
  const comparison = compareAttackAndDefense(resolve(100, 50), resolve(99, 49));
  assert.equal(comparison.attackTotalSuccesses, 6);
  assert.equal(comparison.defenseTotalSuccesses, 6);
  assert.equal(comparison.outcome, "attack-wins");
  assert.equal(comparison.winner, "attack");
  assert.equal(comparison.attackerDoubleOttTieExceptionUsed, true);
  assert.equal(comparison.attackerDoubleOtt, true);
  assert.equal(comparison.requiresGodRuling, true);
  assert.deepEqual(comparison.rulingReasons, ["attacker-double-ott-critical-success"]);
});

test("single-side criticals preserve settled objective outcomes and require interpretation", () => {
  const cases = [
    {
      label: "critical-failure attack",
      comparison: compareAttackAndDefense(resolve(1, 50), resolve(70, 50)),
      outcome: "neither-side-produced-successful-attack",
      reason: "attacker-critical-failure",
    },
    {
      label: "critical-failure defense",
      comparison: compareAttackAndDefense(resolve(70, 50), resolve(1, 50)),
      outcome: "attack-wins",
      reason: "defender-critical-failure",
    },
    {
      label: "double-ott defense",
      comparison: compareAttackAndDefense(resolve(80, 50), resolve(100, 50)),
      outcome: "defense-wins",
      reason: "defender-double-ott-critical-success",
    },
  ] as const;

  for (const expected of cases) {
    assert.equal(expected.comparison.outcome, expected.outcome, expected.label);
    assert.equal(expected.comparison.objectiveOutcome, expected.outcome, expected.label);
    assert.equal(expected.comparison.requiresGodRuling, true, expected.label);
    assert.ok(expected.comparison.rulingReasons.includes(expected.reason), expected.label);
  }
});

test("complicated critical collisions expose the objective comparison but require a ruling", () => {
  const comparison = compareAttackAndDefense(resolve(100, 50), resolve(100, 60));
  assert.equal(comparison.objectiveOutcome, "attack-wins");
  assert.equal(comparison.outcome, "god-ruling-required");
  assert.equal(comparison.winner, null);
  assert.equal(comparison.attackerCriticalSuccess, true);
  assert.equal(comparison.defenderCriticalSuccess, true);
  assert.equal(comparison.attackerDoubleOttTieExceptionUsed, false);
  assert.equal(comparison.requiresGodRuling, true);
  assert.deepEqual(comparison.rulingReasons, [
    "attacker-double-ott-critical-success",
    "defender-double-ott-critical-success",
    "opposed-critical-collision",
  ]);

  const dualCriticalFailure = compareAttackAndDefense(resolve(1, 50), resolve(1, 50));
  assert.equal(dualCriticalFailure.objectiveOutcome, "neither-side-produced-successful-attack");
  assert.equal(dualCriticalFailure.outcome, "god-ruling-required");
  assert.deepEqual(dualCriticalFailure.rulingReasons, [
    "attacker-critical-failure",
    "defender-critical-failure",
    "opposed-critical-collision",
  ]);
});

test("an impossible-target double ott cannot be promoted by opposed comparison", () => {
  const comparison = compareAttackAndDefense(resolve(100, 110), resolve(49, 50));
  assert.equal(comparison.objectiveOutcome, "neither-side-produced-successful-attack");
  assert.equal(comparison.outcome, "god-ruling-required");
  assert.equal(comparison.winner, null);
  assert.equal(comparison.attackerDoubleOtt, true);
  assert.ok(comparison.rulingReasons.includes("attacker-double-ott-impossible-target-collision"));
});

test("resolution is deterministic and never mutates supplied modifiers", () => {
  const modifiers: PercentileTargetModifier[] = [
    { kind: "bonus", label: "Position", magnitude: 10 },
    { kind: "penalty", label: "Weather", magnitude: 5 },
  ];
  const snapshot = structuredClone(modifiers);
  const input: PercentileResolutionInput = { resultTotal: 70, originalTarget: 50, modifiers };
  const first = resolvePercentileCheck(input);
  const second = resolvePercentileCheck(input);
  assert.deepEqual(modifiers, snapshot);
  assert.deepEqual(first, second);
  assert.notEqual(first.modifiers, modifiers);
  assert.notEqual(first.modifiers[0], modifiers[0]);
});

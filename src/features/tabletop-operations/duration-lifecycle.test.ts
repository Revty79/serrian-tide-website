import assert from "node:assert/strict";
import test from "node:test";

import { RUNTIME_DURATION_KINDS } from "@/features/mechanical-effects";

import {
  TABLETOP_BOUND_DURATION_KINDS,
  advanceFiniteDuration,
  assertDurationVocabularyUnchanged,
  getInitiativeDurationTransition,
  isTabletopBoundDurationKind,
  requireFiniteDurationValue,
} from "./duration-lifecycle";

test("Build 9 keeps the established duration vocabulary exactly unchanged", () => {
  assert.deepEqual(RUNTIME_DURATION_KINDS, ["until-removed", "combat-steps", "combat-rounds", "scene"]);
  assert.deepEqual(TABLETOP_BOUND_DURATION_KINDS, ["combat-steps", "combat-rounds", "scene"]);
  assert.doesNotThrow(assertDurationVocabularyUnchanged);
  assert.equal(isTabletopBoundDurationKind("until-removed"), false);
  assert.equal(isTabletopBoundDurationKind("combat-steps"), true);
  assert.equal(isTabletopBoundDurationKind("combat-rounds"), true);
  assert.equal(isTabletopBoundDurationKind("scene"), true);
});

test("two finite boundaries advance remaining duration and expire at zero", () => {
  const afterFirst = advanceFiniteDuration(2, 1);
  assert.deepEqual(afterFirst, { remainingValue: 1, expired: false });
  assert.deepEqual(advanceFiniteDuration(afterFirst.remainingValue, 1), { remainingValue: 0, expired: true });
  assert.deepEqual(advanceFiniteDuration(3, 2), { remainingValue: 1, expired: false });
});

test("one real Round transition reports one Round and one Combat Step exactly", () => {
  assert.deepEqual(getInitiativeDurationTransition(
    { status: "active", roundNumber: 2, stepNumber: 5 },
    { status: "active", roundNumber: 3, stepNumber: 6 },
  ), {
    combatStepBoundaries: 1,
    combatRoundBoundaries: 1,
    initiativeClosed: false,
  });
});

test("actual multi-boundary and forced transitions use authoritative deltas", () => {
  assert.deepEqual(getInitiativeDurationTransition(
    { status: "active", roundNumber: 3, stepNumber: 7 },
    { status: "active", roundNumber: 5, stepNumber: 10 },
  ), {
    combatStepBoundaries: 3,
    combatRoundBoundaries: 2,
    initiativeClosed: false,
  });
});

test("Initiative correction consumes no duration even when counters increase", () => {
  assert.deepEqual(getInitiativeDurationTransition(
    { status: "active", roundNumber: 2, stepNumber: 4 },
    { status: "active", roundNumber: 3, stepNumber: 7 },
    "correction",
  ), {
    combatStepBoundaries: 0,
    combatRoundBoundaries: 0,
    initiativeClosed: false,
  });
});

test("refresh-equivalent unchanged state advances nothing and close is explicit", () => {
  const active = { status: "active" as const, roundNumber: 2, stepNumber: 4 };
  assert.deepEqual(getInitiativeDurationTransition(active, active), {
    combatStepBoundaries: 0,
    combatRoundBoundaries: 0,
    initiativeClosed: false,
  });
  assert.deepEqual(getInitiativeDurationTransition(active, { ...active, status: "closed" }), {
    combatStepBoundaries: 0,
    combatRoundBoundaries: 0,
    initiativeClosed: true,
  });
});

test("finite runtime values require positive whole counts", () => {
  assert.equal(requireFiniteDurationValue(2), 2);
  for (const invalid of [null, undefined, 0, -1, 1.5]) {
    assert.throws(() => requireFiniteDurationValue(invalid), /positive whole/);
  }
  assert.throws(() => advanceFiniteDuration(2, -1), /nonnegative whole/);
  assert.throws(() => advanceFiniteDuration(2, 1.5), /nonnegative whole/);
});

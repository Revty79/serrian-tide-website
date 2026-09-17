import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { RUNTIME_DURATION_KINDS } from "@/features/mechanical-effects";

import {
  TABLETOP_BOUND_DURATION_KINDS,
  advanceFiniteDuration,
  assertDurationVocabularyUnchanged,
  getInitiativeDurationTransition,
  isTabletopBoundDurationKind,
  requireFiniteDurationValue,
} from "./duration-lifecycle";
import { consumePeriodicApplications, getPeriodicDueCount, requirePeriodicHealthApplication } from "./periodic-health";

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

test("periodic health lifecycle uses the existing Initiative transition hook and idempotent next-boundary markers", () => {
  const service = readFileSync("src/features/tabletop-operations/duration-lifecycle-service.ts", "utf8");
  assert.match(service, /advancePeriodicHealthEffectsInTransaction/);
  assert.match(service, /campaignSessionPeriodicHealthEffect/);
  assert.match(service, /eq\(campaignSessionPeriodicHealthEffect\.status, "active"\)/);
  assert.match(service, /nextStep|nextRound/);
  assert.match(service, /initiativeClosed/);
  assert.match(service, /applicationKey/);
  assert.match(service, /campaignSessionEncounterParticipant/);
  assert.match(service, /applyDirectCreatureHealthInTransaction/);
  assert.doesNotMatch(service, /direct Creature participants is not supported yet/);
  assert.match(service, /application: "area" \| "full-body" \| "localized"/);
});

test("periodic health application identity and boundary helpers are retry-safe", () => {
  assert.equal(requirePeriodicHealthApplication("area", " rightArm "), "rightArm");
  assert.equal(requirePeriodicHealthApplication("full-body", null), null);
  assert.throws(() => requirePeriodicHealthApplication("area", ""), /frozen HP Pool/);
  assert.throws(() => requirePeriodicHealthApplication("full-body", "rightArm"), /must not specify/);
  assert.equal(getPeriodicDueCount("combat-steps", 4, 1, 6, 1, 3), 3);
  assert.equal(getPeriodicDueCount("combat-rounds", 1, 3, 8, 5, 2), 2);
  assert.deepEqual(consumePeriodicApplications(5, 1), { remainingApplications: 4, completed: false });
  assert.deepEqual(consumePeriodicApplications(1, 1), { remainingApplications: 0, completed: true });
});

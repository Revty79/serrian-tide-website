import assert from "node:assert/strict";
import test from "node:test";

import { resolvePercentileCheck } from "./percentile-resolution";
import {
  canReadRollVisibility,
  generateRandomRoll,
  getHitLocationFromPercentile,
  normalizeRollRecordRequest,
  normalizeVoidReason,
  readableRollVisibilities,
  resolveRollOutcome,
  validateRollResult,
} from "./roll-runtime";

function request(overrides: Partial<Parameters<typeof normalizeRollRecordRequest>[0]> = {}) {
  return normalizeRollRecordRequest({
    sessionId: 1,
    method: "random",
    visibility: "god-only",
    purposeKind: "free",
    ...overrides,
  });
}

test("server random percentile uses exactly one secure 1 through 100 request", () => {
  const bounds: Array<[number, number]> = [];
  assert.deepEqual(generateRandomRoll((minimum, maximum) => {
    bounds.push([minimum, maximum]);
    return 100;
  }), { resultTotal: 100 });
  assert.deepEqual(bounds, [[1, 101]]);
});

test("random source output is defensively limited to canonical percentile", () => {
  assert.throws(() => generateRandomRoll(() => 0), /invalid Percentile/);
  assert.throws(() => generateRandomRoll(() => 101), /invalid Percentile/);
  assert.throws(() => generateRandomRoll(() => 2.5), /invalid Percentile/);
});

test("System Random rejects any browser-supplied result", () => {
  assert.throws(() => resolveRollOutcome(request({ enteredTotal: 73 }), () => 73), /cannot accept a browser-supplied result/);
  assert.deepEqual(resolveRollOutcome(request(), () => 73), { resultTotal: 73 });
});

test("entered physical percentile accepts 1, 73, and physical 00 as 100", () => {
  for (const result of [1, 73, 100]) {
    const normalized = request({ method: "entered", enteredTotal: result });
    assert.deepEqual(resolveRollOutcome(normalized, () => { throw new Error("must not generate"); }), { resultTotal: result });
  }
  assert.throws(() => resolveRollOutcome(request({ method: "entered" }), () => 1), /physical percentile result/);
  assert.throws(() => validateRollResult(0), /between 1 and 100/);
  assert.throws(() => validateRollResult(101), /between 1 and 100/);
});

test("System Random and entered results resolve identically after acquisition", () => {
  const random = resolveRollOutcome(request(), () => 73);
  const entered = resolveRollOutcome(request({ method: "entered", enteredTotal: 73 }), () => {
    throw new Error("must not generate");
  });
  assert.deepEqual(
    resolvePercentileCheck({ ...random, originalTarget: 50 }),
    resolvePercentileCheck({ ...entered, originalTarget: 50 }),
  );
});

test("Hit Location is derived from the ones digit of the one percentile result", () => {
  const expected = new Map([
    [1, 1], [9, 9], [10, 0], [23, 3], [48, 8], [73, 3], [90, 0], [99, 9], [100, 0],
  ]);
  for (const [roll, hitLocation] of expected) {
    assert.equal(getHitLocationFromPercentile(roll), hitLocation);
  }
  for (const invalid of [0, 101, 1.5, Number.NaN]) {
    assert.throws(() => getHitLocationFromPercentile(invalid));
  }
});

test("request normalization enforces exact hierarchy prerequisites", () => {
  assert.throws(() => request({ encounterId: 3 }), /requires its Scene context/);
  assert.throws(() => request({ pendingActionId: 4 }), /require an Encounter context/);
  assert.throws(() => request({ reactionId: 5 }), /require an Encounter context/);
  const normalized = request({ sceneId: 2, encounterId: 3, pendingActionId: 4 });
  assert.equal(normalized.sceneId, 2);
  assert.equal(normalized.encounterId, 3);
  assert.equal(normalized.pendingActionId, 4);
});

test("Roll targets accept exact negative direct-Creature occurrence keys without allowing negative rollers", () => {
  assert.equal(request({ targetCharacterId: -7 }).targetCharacterId, -7);
  assert.throws(() => request({ targetCharacterId: 0 }), /Target Participant is invalid/);
  assert.throws(() => request({ rollerCharacterId: -7 }), /Roller Character is invalid/);
});

test("request metadata is trimmed, bounded, and target number stays uninterpreted", () => {
  const normalized = request({ label: "  Stealth  ", notes: "  table context  ", targetNumber: 55 });
  assert.equal(normalized.label, "Stealth");
  assert.equal(normalized.notes, "table context");
  assert.equal(normalized.targetNumber, 55);
  assert.throws(() => request({ label: "x".repeat(201) }), /200 characters/);
  assert.throws(() => request({ notes: "x".repeat(2001) }), /2000 characters/);
  assert.throws(() => request({ targetNumber: Number.NaN }), /finite table reference/);
});

test("void reasons are mandatory, trimmed, and bounded", () => {
  assert.equal(normalizeVoidReason("  wrong physical result  "), "wrong physical result");
  assert.throws(() => normalizeVoidReason("   "), /nonblank reason/);
  assert.throws(() => normalizeVoidReason("x".repeat(501)), /500 characters/);
});

test("shared visibility policy hides G.O.D.-only Rolls from Player reads", () => {
  assert.equal(canReadRollVisibility("god-owner", "table"), true);
  assert.equal(canReadRollVisibility("god-owner", "private"), true);
  assert.equal(canReadRollVisibility("god-owner", "god-only"), true);
  assert.equal(canReadRollVisibility("player", "table"), true);
  assert.equal(canReadRollVisibility("player", "private", {
    authorizedCharacterId: 7,
    rollerCharacterId: 7,
  }), true);
  assert.equal(canReadRollVisibility("player", "private", {
    authorizedCharacterId: 8,
    rollerCharacterId: 7,
  }), false);
  assert.equal(canReadRollVisibility("player", "god-only"), false);
  assert.deepEqual(readableRollVisibilities("god-owner"), ["table", "private", "god-only"]);
  assert.deepEqual(readableRollVisibilities("player"), ["table"]);
  assert.deepEqual(readableRollVisibilities("player", 7), ["table", "private"]);
});

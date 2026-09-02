import assert from "node:assert/strict";
import test from "node:test";

import {
  canReadRollVisibility,
  generateRandomRoll,
  normalizeRollRecordRequest,
  normalizeVoidReason,
  readableRollVisibilities,
  resolveRollOutcome,
  ROLL_TYPES,
  rollTypeLabel,
  validateRollResult,
} from "./roll-runtime";

function request(overrides: Partial<Parameters<typeof normalizeRollRecordRequest>[0]> = {}) {
  return normalizeRollRecordRequest({
    sessionId: 1,
    method: "random",
    visibility: "god-only",
    purposeKind: "free",
    rollType: "percentile",
    ...overrides,
  });
}

test("Roll types are explicitly limited to Serrian Tide percentile and hit location", () => {
  assert.deepEqual(ROLL_TYPES, ["percentile", "hit-location"]);
  assert.equal(rollTypeLabel("percentile"), "Percentile / d100");
  assert.equal(rollTypeLabel("hit-location"), "Hit Location / d10 (0–9)");
  assert.throws(() => request({ rollType: "d20" as "percentile" }), /percentile or hit-location/);
});

test("server random percentile uses the canonical 1 through 100 range", () => {
  const bounds: Array<[number, number]> = [];
  assert.deepEqual(generateRandomRoll("percentile", (minimum, maximum) => {
    bounds.push([minimum, maximum]);
    return 100;
  }), { resultTotal: 100 });
  assert.deepEqual(bounds, [[1, 101]]);
});

test("server random hit location preserves the canonical 0 through 9 values", () => {
  const bounds: Array<[number, number]> = [];
  assert.deepEqual(generateRandomRoll("hit-location", (minimum, maximum) => {
    bounds.push([minimum, maximum]);
    return 0;
  }), { resultTotal: 0 });
  assert.deepEqual(bounds, [[0, 10]]);
});

test("random source output is defensively validated for both canonical Roll types", () => {
  assert.throws(() => generateRandomRoll("percentile", () => 0), /invalid Percentile/);
  assert.throws(() => generateRandomRoll("percentile", () => 101), /invalid Percentile/);
  assert.throws(() => generateRandomRoll("hit-location", () => -1), /invalid Hit Location/);
  assert.throws(() => generateRandomRoll("hit-location", () => 10), /invalid Hit Location/);
  assert.throws(() => generateRandomRoll("hit-location", () => 2.5), /invalid Hit Location/);
});

test("System Random rejects any browser-supplied result", () => {
  assert.throws(() => resolveRollOutcome(request({ enteredTotal: 73 }), () => 73), /cannot accept a browser-supplied result/);
  assert.deepEqual(resolveRollOutcome(request(), () => 73), { resultTotal: 73 });
});

test("entered physical Rolls store a validated canonical result", () => {
  const normalized = request({ method: "entered", rollType: "hit-location", enteredTotal: 8 });
  assert.deepEqual(resolveRollOutcome(normalized, () => { throw new Error("must not generate"); }), {
    resultTotal: 8,
  });
  assert.throws(() => resolveRollOutcome(request({ method: "entered" }), () => 1), /Enter the physical Roll total/);
});

test("physical percentile 00 is represented as 100 while zero is rejected", () => {
  assert.equal(validateRollResult("percentile", 100), 100);
  assert.throws(() => validateRollResult("percentile", 0), /between 1 and 100/);
});

test("hit-location results remain canonical 0 through 9", () => {
  assert.equal(validateRollResult("hit-location", 0), 0);
  assert.equal(validateRollResult("hit-location", 9), 9);
  assert.throws(() => validateRollResult("hit-location", -1), /between 0 and 9/);
  assert.throws(() => validateRollResult("hit-location", 10), /between 0 and 9/);
  assert.throws(() => validateRollResult("hit-location", 7.5), /whole number/);
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

test("shared visibility policy hides G.O.D.-only Rolls from future Player reads", () => {
  assert.equal(canReadRollVisibility("god-owner", "table"), true);
  assert.equal(canReadRollVisibility("god-owner", "god-only"), true);
  assert.equal(canReadRollVisibility("player", "table"), true);
  assert.equal(canReadRollVisibility("player", "god-only"), false);
  assert.deepEqual(readableRollVisibilities("god-owner"), ["table", "god-only"]);
  assert.deepEqual(readableRollVisibilities("player"), ["table"]);
});

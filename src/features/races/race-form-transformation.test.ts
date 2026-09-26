import assert from "node:assert/strict";
import test from "node:test";
import { emptyRaceFormTransformation, FORM_DURATION_MODES, FORM_ENTRY_METHODS, FORM_EXIT_METHODS, normalizeRaceFormTransformation as normalize } from "./race-form-transformation";
import { transformationFixture } from "../../../scripts/race-form-transformation-fixture";

test("legacy and empty transformations remain neutral without inferred rules", () => {
  assert.equal(normalize(null), null); assert.equal(normalize(undefined), null);
  const empty = emptyRaceFormTransformation();
  assert.deepEqual(normalize(empty), empty);
  assert.equal(empty.entryMethod, null); assert.equal(empty.entryTiming.mode, null); assert.equal(empty.duration.mode, null);
  assert.equal(empty.entryCosts.mode, "unspecified"); assert.equal(empty.limitMode, "unspecified");
});
test("every entry, duration and exit choice uses structured definitions", () => {
  for (const entryMethod of FORM_ENTRY_METHODS) for (const mode of FORM_DURATION_MODES) {
    const value = { ...transformationFixture(), entryMethod, duration: { mode, description: "Authored duration" }, exitMethods: [...FORM_EXIT_METHODS] };
    assert.deepEqual(normalize(value), value);
  }
});
test("shared costs, conditions and refresh limits round-trip independently", () => {
  const value = transformationFixture();
  assert.deepEqual(normalize(value), value);
  const normalized = normalize(value)!;
  normalized.requirements[0].numericValue = 1; normalized.entryCosts.costs[0].amount = 20;
  assert.equal(value.requirements[0].numericValue, 50); assert.equal(value.entryCosts.costs[0].amount, 3);
});
test("timing distinguishes instant from positive Initiative and independent noncombat descriptions", () => {
  const value = transformationFixture();
  value.entryTiming = { mode: "instant", initiativeCost: null, time: "", notes: "Explicitly instant" };
  value.exitTiming = { mode: "custom", initiativeCost: null, time: "", notes: "G.O.D. controls timing" };
  assert.deepEqual(normalize(value), value);
  assert.throws(() => normalize({ ...value, entryTiming: { ...value.entryTiming, initiativeCost: 4 } }), /Choose Initiative/);
  assert.throws(() => normalize({ ...value, entryTiming: { ...value.entryTiming, mode: "initiative", initiativeCost: 0 } }), /greater than zero/);
});
test("invalid shared definitions and hidden cost/limit rows cannot silently save", () => {
  const value = transformationFixture();
  assert.throws(() => normalize({ ...value, entryCosts: { ...value.entryCosts, mode: "none" } }), /List resource costs/);
  assert.throws(() => normalize({ ...value, entryCosts: { mode: "costs", costs: [{ ...value.entryCosts.costs[0], amount: 0 }] } }), /greater than zero/);
  assert.throws(() => normalize({ ...value, entryCosts: { mode: "costs", costs: [{ ...value.entryCosts.costs[0], costType: "initiative" }] } }), /separate/);
  assert.throws(() => normalize({ ...value, requirements: [{ ...value.requirements[1], notes: "" }] }), /Manual use condition/);
  assert.throws(() => normalize({ ...value, limitMode: "unlimited" }), /Limit the number of uses/);
  assert.throws(() => normalize({ ...value, useLimits: [{ ...value.useLimits[0], maximumUses: 0.5 }] }), /whole number/);
});

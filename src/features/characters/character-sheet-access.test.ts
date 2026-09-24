import assert from "node:assert/strict";
import test from "node:test";
import { canManageCharacterSheet, characterTrackingPatch, CHARACTER_TRACKING_KEYS } from "./character-sheet-access";

const stored = { fame: 7, experience: 123, totalExperience: 456, quintessence: 12, totalQuintessence: 34 };

test("sheet management follows the actual Campaign owner", () => {
  assert.equal(canManageCharacterSheet("owner", "owner"), true);
  for (const actor of ["player", "other-god", "admin"]) assert.equal(canManageCharacterSheet(actor, "owner"), false);
});

test("read-only balances can round-trip or be omitted without entering the update patch", () => {
  assert.deepEqual(characterTrackingPatch(stored, false, stored), {});
  assert.deepEqual(characterTrackingPatch({}, false, stored), {});
  assert.deepEqual(characterTrackingPatch({}, true, stored), {});
  assert.deepEqual(characterTrackingPatch({ fame: 0 }, true, stored), { fame: 0 });
  assert.deepEqual(stored, { fame: 7, experience: 123, totalExperience: 456, quintessence: 12, totalQuintessence: 34 });
});

test("each submitted balance rejects unauthorized edits and invalid owner values", () => {
  for (const key of CHARACTER_TRACKING_KEYS) {
    assert.throws(() => characterTrackingPatch({ [key]: 999 }, false, stored), /Campaign creator/);
    for (const value of [-1, Infinity, NaN, undefined]) assert.throws(() => characterTrackingPatch({ [key]: value }, true, stored), /finite numbers/);
  }
});

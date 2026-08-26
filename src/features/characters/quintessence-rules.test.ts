import assert from "node:assert/strict";
import test from "node:test";

import {
  getExperienceFromQuintessence,
  getQuintessenceCost,
} from "./quintessence-rules";

test("Quintessence charges 5 Q per Attribute point and 10 Q per Fate Point", () => {
  assert.equal(getQuintessenceCost("attribute", 3), 15);
  assert.equal(getQuintessenceCost("fatePoints", 2), 20);
});

test("each Quintessence spent on Experience grants 10 XP", () => {
  assert.equal(getQuintessenceCost("experience", 4), 4);
  assert.equal(getExperienceFromQuintessence(4), 40);
});

test("Quintessence purchases reject zero, negative, and fractional quantities", () => {
  assert.equal(getQuintessenceCost("attribute", 0), Number.POSITIVE_INFINITY);
  assert.equal(getQuintessenceCost("fatePoints", -1), Number.POSITIVE_INFINITY);
  assert.equal(getQuintessenceCost("experience", 1.5), Number.POSITIVE_INFINITY);
});

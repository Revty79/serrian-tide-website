import assert from "node:assert/strict";
import test from "node:test";

import {
  getExperienceFromQuintessence,
  getQuintessenceCost,
  getQuintessenceSpendingLedger,
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

test("Attribute and Fate purchases add actual Q spending to Lifetime Quintessence", () => {
  assert.deepEqual(getQuintessenceSpendingLedger({
    purchaseType: "attribute",
    quantity: 2,
    quintessence: 20,
    totalQuintessence: 7,
    experience: 8,
    totalExperience: 50,
  }), {
    quintessence: 10,
    totalQuintessence: 17,
    experience: 8,
    totalExperience: 50,
  });
  assert.deepEqual(getQuintessenceSpendingLedger({
    purchaseType: "fatePoints",
    quantity: 2,
    quintessence: 25,
    totalQuintessence: 12,
    experience: 8,
    totalExperience: 50,
  }), {
    quintessence: 5,
    totalQuintessence: 32,
    experience: 8,
    totalExperience: 50,
  });
});

test("Q to XP increases available XP and Lifetime Q but not Lifetime XP", () => {
  assert.deepEqual(getQuintessenceSpendingLedger({
    purchaseType: "experience",
    quantity: 2,
    quintessence: 5,
    totalQuintessence: 12,
    experience: 8,
    totalExperience: 50,
  }), {
    quintessence: 3,
    totalQuintessence: 14,
    experience: 28,
    totalExperience: 50,
  });
});

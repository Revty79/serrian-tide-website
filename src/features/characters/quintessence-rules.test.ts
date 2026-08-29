import assert from "node:assert/strict";
import test from "node:test";

import {
  getExperienceFromQuintessence,
  getMaximumQuintessenceAttributeIncrease,
  getQuintessenceCost,
  getQuintessenceSpendingLedger,
  validateQuintessenceAttributeIncrease,
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

test("an Attribute below its racial maximum can be raised to that maximum", () => {
  assert.equal(validateQuintessenceAttributeIncrease({
    currentAttributeValue: 16,
    quantity: 2,
    racialMaximum: 18,
  }), 18);
  assert.equal(validateQuintessenceAttributeIncrease({
    currentAttributeValue: 18,
    quantity: 2,
    racialMaximum: null,
  }), 20);
});

test("an Attribute purchase cannot exceed its racial maximum and changes no ledger state", () => {
  const state = {
    attributeValue: 17,
    quintessence: 20,
    totalQuintessence: 7,
  };
  const before = { ...state };

  assert.throws(() => {
    const attributeValue = validateQuintessenceAttributeIncrease({
      currentAttributeValue: state.attributeValue,
      quantity: 2,
      racialMaximum: 18,
    });
    const ledger = getQuintessenceSpendingLedger({
      purchaseType: "attribute",
      quantity: 2,
      quintessence: state.quintessence,
      totalQuintessence: state.totalQuintessence,
      experience: 0,
      totalExperience: 0,
    });
    Object.assign(state, {
      attributeValue,
      quintessence: ledger.quintessence,
      totalQuintessence: ledger.totalQuintessence,
    });
  }, /racial maximum of 18/);
  assert.deepEqual(state, before);
});

test("an Attribute exactly at its racial maximum cannot be increased", () => {
  assert.throws(
    () => validateQuintessenceAttributeIncrease({
      currentAttributeValue: 18,
      quantity: 1,
      racialMaximum: 18,
    }),
    /racial maximum of 18/,
  );
});

test("Attribute quantity is constrained by both Quintessence and the racial maximum", () => {
  assert.equal(getMaximumQuintessenceAttributeIncrease({
    quintessence: 25,
    currentAttributeValue: 17,
    racialMaximum: 18,
  }), 1);
  assert.equal(getMaximumQuintessenceAttributeIncrease({
    quintessence: 5,
    currentAttributeValue: 10,
    racialMaximum: 18,
  }), 1);
  assert.equal(getMaximumQuintessenceAttributeIncrease({
    quintessence: 20,
    currentAttributeValue: 16,
    racialMaximum: 18,
  }), 2);
  assert.equal(getMaximumQuintessenceAttributeIncrease({
    quintessence: 20,
    currentAttributeValue: 18,
    racialMaximum: 18,
  }), 0);
  assert.equal(getMaximumQuintessenceAttributeIncrease({
    quintessence: 20,
    currentAttributeValue: 18,
    racialMaximum: null,
  }), 4);
});

test("a successful capped Attribute purchase preserves Q lifetime accounting", () => {
  const attributeValue = validateQuintessenceAttributeIncrease({
    currentAttributeValue: 16,
    quantity: 2,
    racialMaximum: 18,
  });
  const ledger = getQuintessenceSpendingLedger({
    purchaseType: "attribute",
    quantity: 2,
    quintessence: 20,
    totalQuintessence: 7,
    experience: 8,
    totalExperience: 50,
  });

  assert.deepEqual({ attributeValue, ...ledger }, {
    attributeValue: 18,
    quintessence: 10,
    totalQuintessence: 17,
    experience: 8,
    totalExperience: 50,
  });
});

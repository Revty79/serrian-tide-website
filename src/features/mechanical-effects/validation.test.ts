import assert from "node:assert/strict";
import test from "node:test";

import { MECHANICAL_EFFECT_SCHEMA_VERSION } from "./models";
import { validateMechanicalEffect } from "./validation";

test("schema version establishes the expanded Mechanical Effect contract", () => {
  assert.equal(MECHANICAL_EFFECT_SCHEMA_VERSION, 2);
});

test("validation accepts every initial supported effect shape", () => {
  const effects = [
    { kind: "health.heal", amount: 5, scope: "full-body" },
    { kind: "health.heal", amount: 5, scope: "area" },
    { kind: "health.damage", amount: 7, application: "localized" },
    {
      kind: "manual",
      title: "Whispers of Shadow",
      description: "Affected shadows reveal secrets at the G.O.D.'s discretion.",
    },
  ];

  for (const effect of effects) {
    assert.equal(validateMechanicalEffect(effect).valid, true);
  }
});

test("validation rejects zero, negative, and non-finite health amounts", () => {
  for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const healing = validateMechanicalEffect({ kind: "health.heal", amount, scope: "area" });
    const damage = validateMechanicalEffect({ kind: "health.damage", amount, application: "localized" });
    assert.equal(healing.valid, false);
    assert.equal(damage.valid, false);
    assert.equal(healing.issues.some(({ code }) => code === "invalid-amount"), true);
    assert.equal(damage.issues.some(({ code }) => code === "invalid-amount"), true);
  }
});

test("validation preserves fractional Active Health amounts", () => {
  assert.equal(validateMechanicalEffect({
    kind: "health.heal",
    amount: 2.5,
    scope: "full-body",
  }).valid, true);
});

test("validation rejects unsupported mechanics rather than coercing them", () => {
  const badScope = validateMechanicalEffect({ kind: "health.heal", amount: 5, scope: "limb" });
  const badApplication = validateMechanicalEffect({
    kind: "health.damage",
    amount: 7,
    application: "total-only",
  });
  const badKind = validateMechanicalEffect({ kind: "condition.add", condition: "Prone" });

  assert.equal(badScope.valid, false);
  assert.equal(badScope.issues[0]?.code, "unsupported-scope");
  assert.equal(badApplication.valid, false);
  assert.equal(badApplication.issues[0]?.code, "unsupported-application");
  assert.equal(badKind.valid, false);
  assert.equal(badKind.issues[0]?.code, "unsupported-kind");
});

test("validation rejects manual effects without a meaningful title and description", () => {
  const result = validateMechanicalEffect({ kind: "manual", title: "  ", description: "" });
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues.map(({ code }) => code), [
    "empty-manual-title",
    "empty-manual-description",
  ]);
});

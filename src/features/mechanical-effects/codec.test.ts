import assert from "node:assert/strict";
import test from "node:test";

import { decodeMechanicalEffect, encodeMechanicalEffect } from "./codec";
import { MECHANICAL_EFFECT_SCHEMA_VERSION, type MechanicalEffect } from "./models";

test("Mechanical Effects codec preserves every version-one effect", () => {
  const effects: MechanicalEffect[] = [
    { kind: "health.heal", amount: 5, scope: "full-body" },
    { kind: "health.heal", amount: 8, scope: "area" },
    { kind: "health.damage", amount: 7, application: "localized" },
    { kind: "manual", title: "Whispering Glass", description: "The G.O.D. chooses a memory." },
  ];

  for (const effect of effects) {
    const persisted = encodeMechanicalEffect(effect);
    assert.equal(persisted.schemaVersion, MECHANICAL_EFFECT_SCHEMA_VERSION);
    assert.deepEqual(decodeMechanicalEffect(JSON.parse(JSON.stringify(persisted))), effect);
  }
});

test("Mechanical Effects codec rejects unsupported versions and invalid JSON mechanics", () => {
  assert.throws(
    () => decodeMechanicalEffect({
      schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION + 1,
      effectJson: { kind: "health.heal", amount: 5, scope: "full-body" },
    }),
    /Unsupported Mechanical Effect schema version/,
  );
  assert.throws(
    () => decodeMechanicalEffect({
      schemaVersion: MECHANICAL_EFFECT_SCHEMA_VERSION,
      effectJson: { kind: "health.heal", amount: 0, scope: "full-body" },
    }),
    /finite number greater than zero/,
  );
});

test("Mechanical Effects codec persists only contract fields and excludes source metadata", () => {
  const encoded = encodeMechanicalEffect({
    kind: "health.heal",
    amount: 5,
    scope: "area",
    source: { kind: "item", id: 42, name: "Healing Salve" },
  } as MechanicalEffect);

  assert.deepEqual(encoded.effectJson, {
    kind: "health.heal",
    amount: 5,
    scope: "area",
  });
  assert.equal("source" in (encoded.effectJson as object), false);
});

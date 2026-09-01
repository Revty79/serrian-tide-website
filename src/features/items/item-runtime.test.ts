import assert from "node:assert/strict";
import test from "node:test";

import { MECHANICAL_EFFECT_SCHEMA_VERSION, type MechanicalEffect } from "../mechanical-effects";

import {
  copyItemRuntimeDefinition,
  decodeItemRuntimeDefinition,
  DEFAULT_ITEM_RUNTIME_PROFILE,
  encodeItemRuntimeDefinition,
  formatItemActivatedUse,
  validateItemRuntimeDefinition,
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
} from "./item-runtime";

function profile(update: Partial<ItemRuntimeProfile>): ItemRuntimeProfile {
  return { ...DEFAULT_ITEM_RUNTIME_PROFILE, ...update };
}

test("none is the default and normalizes stale resource fields to null", () => {
  const result = validateItemRuntimeProfile(profile({
    useMode: "none",
    quantityPerUse: 3,
    maximumCharges: 10,
    chargesPerUse: 2,
  }));
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.profile, DEFAULT_ITEM_RUNTIME_PROFILE);
});

test("consume-item accepts positive whole quantities and defaults a new consumable to one", () => {
  for (const quantityPerUse of [1, 2, 5]) {
    const result = validateItemRuntimeProfile(profile({ useMode: "consume-item", quantityPerUse }));
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.profile.quantityPerUse, quantityPerUse);
      assert.equal(result.profile.maximumCharges, null);
      assert.equal(result.profile.chargesPerUse, null);
    }
  }
  const defaulted = validateItemRuntimeProfile(profile({ useMode: "consume-item" }));
  assert.equal(defaulted.valid, true);
  if (defaulted.valid) assert.equal(defaulted.profile.quantityPerUse, 1);
});

test("consume-item rejects zero, negative, and fractional quantities", () => {
  for (const quantityPerUse of [0, -1, 1.5]) {
    const result = validateItemRuntimeProfile(profile({ useMode: "consume-item", quantityPerUse }));
    assert.equal(result.valid, false);
    assert.match(result.issues[0]?.message ?? "", /positive whole number/);
  }
});

test("charges accepts valid templates and removes quantity-per-use", () => {
  for (const chargesPerUse of [1, 2]) {
    const result = validateItemRuntimeProfile(profile({
      useMode: "charges",
      quantityPerUse: 4,
      maximumCharges: 10,
      chargesPerUse,
    }));
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.profile.maximumCharges, 10);
      assert.equal(result.profile.chargesPerUse, chargesPerUse);
      assert.equal(result.profile.quantityPerUse, null);
    }
  }
});

test("charges rejects invalid maximums, costs, and costs above maximum", () => {
  for (const maximumCharges of [0, -1, 1.5]) {
    assert.equal(validateItemRuntimeProfile(profile({
      useMode: "charges",
      maximumCharges,
      chargesPerUse: 1,
    })).valid, false);
  }
  for (const chargesPerUse of [0, -1, 1.5, 11]) {
    assert.equal(validateItemRuntimeProfile(profile({
      useMode: "charges",
      maximumCharges: 10,
      chargesPerUse,
    })).valid, false);
  }
});

test("unlimited removes every consumable and charge resource field", () => {
  const result = validateItemRuntimeProfile(profile({
    useMode: "unlimited",
    quantityPerUse: 2,
    maximumCharges: 8,
    chargesPerUse: 1,
  }));
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.profile.quantityPerUse, null);
  assert.equal(result.profile.maximumCharges, null);
  assert.equal(result.profile.chargesPerUse, null);
});

test("magical classification is independent from every use mode", () => {
  const cases = [
    { isMagical: true, runtimeProfile: profile({ useMode: "none" }) },
    { isMagical: true, runtimeProfile: profile({ useMode: "unlimited" }) },
    { isMagical: true, runtimeProfile: profile({ useMode: "charges", maximumCharges: 10, chargesPerUse: 1 }) },
    { isMagical: false, runtimeProfile: profile({ useMode: "consume-item", quantityPerUse: 1 }) },
  ];
  for (const entry of cases) {
    const result = validateItemRuntimeDefinition({ ...entry, effects: [] });
    assert.equal(result.valid, true);
    if (result.valid) assert.equal(result.definition.isMagical, entry.isMagical);
  }
});

test("versioned persistence round-trips multiple ordered Mechanical Effects without source metadata", () => {
  const effects: MechanicalEffect[] = [
    { kind: "health.heal", amount: 5, scope: "full-body" },
    { kind: "health.heal", amount: 8, scope: "area" },
    { kind: "health.damage", amount: 7, application: "localized" },
    { kind: "manual", title: "Whispering Glass", description: "The G.O.D. chooses a memory." },
  ];
  const definition = {
    isMagical: true,
    runtimeProfile: profile({
      useMode: "charges" as const,
      maximumCharges: 10,
      chargesPerUse: 1,
      activationLabel: "Activate",
    }),
    effects,
  };
  const encoded = encodeItemRuntimeDefinition(definition);
  assert.deepEqual(encoded.effects.map(({ sortOrder }) => sortOrder), [0, 1, 2, 3]);
  assert.equal(encoded.effects.every(({ schemaVersion }) => schemaVersion === MECHANICAL_EFFECT_SCHEMA_VERSION), true);
  assert.equal(encoded.effects.every((effect) => !("source" in (effect.effectJson as object))), true);

  const serialized = JSON.parse(JSON.stringify(encoded));
  serialized.effects.reverse();
  assert.deepEqual(decodeItemRuntimeDefinition(serialized), definition);
});

test("Item definition validation delegates invalid effects to Mechanical Effects validation", () => {
  const result = validateItemRuntimeDefinition({
    isMagical: false,
    runtimeProfile: profile({ useMode: "consume-item", quantityPerUse: 1 }),
    effects: [{ kind: "health.heal", amount: 0, scope: "area" }],
  });
  assert.equal(result.valid, false);
  assert.match(result.issues[0]?.message ?? "", /finite number greater than zero/);
});

test("Item definition validation rejects a malformed effect collection", () => {
  const result = validateItemRuntimeDefinition({
    isMagical: false,
    runtimeProfile: profile({ useMode: "none" }),
    effects: { kind: "health.heal", amount: 5, scope: "full-body" },
  });
  assert.equal(result.valid, false);
  assert.match(result.issues[0]?.message ?? "", /ordered list/);
});

test("variant runtime definitions are copied deeply and then remain independent", () => {
  const parent = {
    isMagical: true,
    runtimeProfile: profile({ useMode: "unlimited", activationLabel: "Invoke" }),
    effects: [{ kind: "health.heal", amount: 3, scope: "area" }] satisfies MechanicalEffect[],
  };
  const variant = copyItemRuntimeDefinition(parent);
  variant.runtimeProfile.activationLabel = "Trigger";
  const variantEffect = variant.effects[0];
  if (variantEffect?.kind === "health.heal") variantEffect.amount = 6;

  assert.equal(parent.runtimeProfile.activationLabel, "Invoke");
  assert.equal(parent.effects[0]?.kind === "health.heal" ? parent.effects[0].amount : null, 3);
  assert.notEqual(variant.runtimeProfile, parent.runtimeProfile);
  assert.notEqual(variant.effects[0], parent.effects[0]);
});

test("activated-use summaries communicate resource behavior", () => {
  assert.equal(formatItemActivatedUse(profile({ useMode: "none" })), "No Activated Use");
  assert.equal(formatItemActivatedUse(profile({ useMode: "consume-item", quantityPerUse: 1 })), "Consume 1");
  assert.equal(formatItemActivatedUse(profile({ useMode: "charges", maximumCharges: 10, chargesPerUse: 1 })), "10 Maximum Charges · 1 per Use");
  assert.equal(formatItemActivatedUse(profile({ useMode: "unlimited" })), "Unlimited");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertItemOwnershipStrategy,
  assertNoStackInstanceOwnershipCollision,
  createDraftOwnedItemInstances,
  getItemChargeDisplay,
  getItemOwnershipStrategy,
  getOwnedItemPurchaseCost,
  getStartingItemInstanceCharges,
  planOwnedItemInstancePersistence,
  removeDraftOwnedItemInstance,
  validateCurrentItemCharges,
} from "./item-ownership";
import type { ItemRuntimeProfile } from "./item-runtime";

function profile(
  useMode: ItemRuntimeProfile["useMode"],
  maximumCharges: number | null = null,
): ItemRuntimeProfile {
  return {
    useMode,
    quantityPerUse: useMode === "consume-item" ? 1 : null,
    maximumCharges,
    chargesPerUse: useMode === "charges" ? 1 : null,
    rechargeNotes: "",
    activationLabel: "Use",
    useNotes: "",
  };
}

test("ownership strategy centralizes charged instances and leaves other modes stacked", () => {
  assert.equal(getItemOwnershipStrategy(profile("charges", 10)), "instance");
  assert.equal(getItemOwnershipStrategy(profile("consume-item")), "stack");
  assert.equal(getItemOwnershipStrategy(profile("unlimited")), "stack");
  assert.equal(getItemOwnershipStrategy(profile("none")), "stack");
  assert.equal(getItemOwnershipStrategy(profile("none"), true), "instance");
});

test("firearm copies receive exact instance identity without inventing charges", () => {
  const ordinary = profile("none");
  assert.equal(getStartingItemInstanceCharges(ordinary, true), 0);
  assert.doesNotThrow(() => assertItemOwnershipStrategy(ordinary, "instance", "Firearm", { requiresExactInstance: true }));
  assert.doesNotThrow(() => assertItemOwnershipStrategy(ordinary, "stack", "Legacy firearm", { requiresExactInstance: true, allowLegacyExactStack: true }));
  assert.doesNotThrow(() => assertNoStackInstanceOwnershipCollision({
    definitions: [{ itemId: 41, runtimeProfile: ordinary, requiresExactInstance: true }],
    stacks: [{ itemId: 41, quantity: 1 }],
    instances: [{ itemId: 41 }],
  }));
});

test("charged acquisition creates distinct unsaved instances at the template maximum", () => {
  let nextDraftId = -1;
  const charged = profile("charges", 10);
  const instances = createDraftOwnedItemInstances({
    itemId: 40,
    quantity: 2,
    unitCostCredits: 100,
    runtimeProfile: charged,
    createDraftId: () => nextDraftId--,
  });

  assert.deepEqual(instances.map(({ draftId }) => draftId), [-1, -2]);
  assert.equal(new Set(instances.map(({ draftId }) => draftId)).size, 2);
  assert.equal(getStartingItemInstanceCharges(charged), 10);
  assert.equal(getItemChargeDisplay({ currentCharges: 10, maximumCharges: 10 }).label, "10 / 10 Charges");
  assert.equal(getOwnedItemPurchaseCost({ stacks: [], instances }), 200);
});

test("current charges reject negative and fractional values but preserve valid over-maximum state", () => {
  assert.equal(validateCurrentItemCharges(0), 0);
  assert.equal(validateCurrentItemCharges(8), 8);
  assert.throws(() => validateCurrentItemCharges(-1), /whole number zero or greater/);
  assert.throws(() => validateCurrentItemCharges(1.5), /whole number zero or greater/);
  assert.deepEqual(getItemChargeDisplay({ currentCharges: 12, maximumCharges: 10 }), {
    label: "12 / 10 Charges",
    exceedsCurrentMaximum: true,
  });
});

test("removing one selected instance leaves the other copy untouched", () => {
  const instances = [
    { draftId: 418, instanceId: 418, itemId: 40, unitCostCredits: 100 },
    { draftId: 419, instanceId: 419, itemId: 40, unitCostCredits: 100 },
  ];
  assert.deepEqual(removeDraftOwnedItemInstance(instances, 418), [instances[1]]);
  assert.deepEqual(planOwnedItemInstancePersistence({
    existingInstanceIds: [418, 419],
    drafts: [instances[1]],
  }), {
    removedInstanceIds: [418],
    newInstances: [],
  });
});

test("an unrelated save produces no instance persistence work", () => {
  const persisted = { draftId: 418, instanceId: 418, itemId: 40, unitCostCredits: 100 };
  assert.deepEqual(planOwnedItemInstancePersistence({
    existingInstanceIds: [418],
    drafts: [persisted],
  }), {
    removedInstanceIds: [],
    newInstances: [],
  });
});

test("stack and instance invariants reject the wrong ownership path and collisions", () => {
  const charged = profile("charges", 10);
  const ordinary = profile("none");
  assert.throws(() => assertItemOwnershipStrategy(charged, "stack"), /individual owned instances/);
  assert.doesNotThrow(() => assertItemOwnershipStrategy(ordinary, "stack"));
  assert.throws(
    () => assertNoStackInstanceOwnershipCollision({
      definitions: [{ itemId: 40, runtimeProfile: charged }],
      stacks: [{ itemId: 40, quantity: 2 }],
      instances: [],
    }),
    /must be stored as individual owned instances/,
  );
});

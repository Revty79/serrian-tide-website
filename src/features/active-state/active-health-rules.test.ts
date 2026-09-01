import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCreatureHealthAnatomy,
  resolveHumanoidHealthAnatomy,
} from "./anatomy";
import {
  applyAreaHealing,
  applyFullBodyHealing,
  applyLocalizedDamage,
  createEmptyActiveHealthState,
  resolveActiveHealthView,
  resolveLocalizedDamageTarget,
  restoreAllHealth,
} from "./health-rules";
import type { ActiveHealthAnatomy, ActiveHealthState } from "./models";

function simpleAnatomy(): ActiveHealthAnatomy {
  return {
    kind: "humanoid",
    totalMaximumHp: 50,
    maximumHpNote: null,
    pools: [
      { key: "head", name: "Head", maximumHp: 5, percentage: 10, sortOrder: 0 },
      { key: "rightArm", name: "Right Arm", maximumHp: 8, percentage: 15, sortOrder: 1 },
      { key: "leftArm", name: "Left Arm", maximumHp: 8, percentage: 15, sortOrder: 2 },
      { key: "rightLeg", name: "Right Leg", maximumHp: 8, percentage: 15, sortOrder: 3 },
    ],
    hitLocations: [
      { result: 1, name: "Right Arm", bodyParts: "Right Arm", poolKey: "rightArm", poolName: "Right Arm" },
      { result: 3, name: "Right Lower Leg", bodyParts: "Right Lower Leg", poolKey: "rightLeg", poolName: "Right Leg" },
      { result: 4, name: "Right Upper Leg", bodyParts: "Right Upper Leg", poolKey: "rightLeg", poolName: "Right Leg" },
    ],
  };
}

test("localized damage stores full damage on Total and the resolved HP Pool", () => {
  const anatomy = simpleAnatomy();
  const result = applyLocalizedDamage(createEmptyActiveHealthState(10), anatomy, {
    amount: 7,
    hitLocationNumber: 1,
  });
  const view = resolveActiveHealthView(anatomy, result);
  assert.equal(result.totalDamage, 7);
  assert.equal(result.pools.find(({ poolKey }) => poolKey === "rightArm")?.damage, 7);
  assert.equal(view.total.remainingHp, 43);
  assert.equal(view.tracks.find(({ key }) => key === "rightArm")?.remainingHp, 1);
});

test("exact lower and upper leg locations share one Right Leg HP Pool", () => {
  const anatomy = simpleAnatomy();
  const lowerTarget = resolveLocalizedDamageTarget(anatomy, { amount: 7, hitLocationNumber: 3 });
  const upperTarget = resolveLocalizedDamageTarget(anatomy, { amount: 5, hitLocationNumber: 4 });
  const lower = applyLocalizedDamage(createEmptyActiveHealthState(10), anatomy, {
    amount: 7,
    hitLocationNumber: 3,
  });
  const upper = applyLocalizedDamage(lower, anatomy, {
    amount: 5,
    hitLocationNumber: 4,
  });
  assert.equal(upper.totalDamage, 12);
  assert.deepEqual(upper.pools, [{
    poolKey: "rightLeg",
    poolNameSnapshot: "Right Leg",
    damage: 12,
  }]);
  assert.equal(lowerTarget.poolKey, upperTarget.poolKey);
  assert.equal(lowerTarget.hitLocationName, "Right Lower Leg");
  assert.equal(upperTarget.hitLocationName, "Right Upper Leg");
});

test("pool over-damage is preserved without clamping or spillover", () => {
  const anatomy = simpleAnatomy();
  const result = applyLocalizedDamage(createEmptyActiveHealthState(10), anatomy, {
    amount: 12,
    poolKey: "rightArm",
  });
  const view = resolveActiveHealthView(anatomy, result);
  const arm = view.tracks.find(({ key }) => key === "rightArm");
  assert.equal(result.totalDamage, 12);
  assert.equal(arm?.damage, 12);
  assert.equal(arm?.remainingHp, 0);
  assert.equal(arm?.overDamage, 4);
  assert.equal(result.pools.length, 1);
});

test("Total Health remains independent when every area has zero remaining", () => {
  const anatomy: ActiveHealthAnatomy = {
    ...simpleAnatomy(),
    totalMaximumHp: 20,
    pools: [
      { key: "one", name: "One", maximumHp: 5, percentage: 50, sortOrder: 0 },
      { key: "two", name: "Two", maximumHp: 5, percentage: 50, sortOrder: 1 },
    ],
  };
  const state: ActiveHealthState = {
    characterId: 11,
    totalDamage: 18,
    pools: [
      { poolKey: "one", poolNameSnapshot: "One", damage: 5 },
      { poolKey: "two", poolNameSnapshot: "Two", damage: 7 },
    ],
    injuries: [],
  };
  const view = resolveActiveHealthView(anatomy, state);
  assert.equal(view.total.remainingHp, 2);
  assert.deepEqual(view.tracks.map(({ remainingHp }) => remainingHp), [0, 0]);
});

test("full-body healing independently reduces Total and every damaged Pool", () => {
  const state: ActiveHealthState = {
    characterId: 12,
    totalDamage: 20,
    pools: [
      { poolKey: "head", poolNameSnapshot: "Head", damage: 3 },
      { poolKey: "rightArm", poolNameSnapshot: "Right Arm", damage: 8 },
      { poolKey: "leftArm", poolNameSnapshot: "Left Arm", damage: 0 },
      { poolKey: "rightLeg", poolNameSnapshot: "Right Leg", damage: 11 },
    ],
    injuries: [],
  };
  const healed = applyFullBodyHealing(state, 5);
  assert.equal(healed.totalDamage, 15);
  assert.deepEqual(healed.pools.map(({ damage }) => damage), [0, 3, 0, 6]);
});

test("area healing changes one Pool and never changes Total Damage", () => {
  const state: ActiveHealthState = {
    characterId: 13,
    totalDamage: 15,
    pools: [{ poolKey: "rightArm", poolNameSnapshot: "Right Arm", damage: 8 }],
    injuries: [],
  };
  const healed = applyAreaHealing(state, simpleAnatomy(), "rightArm", 5);
  assert.equal(healed.totalDamage, 15);
  assert.equal(healed.pools[0]?.damage, 3);
});

test("healing floors every damage track at zero", () => {
  const state: ActiveHealthState = {
    characterId: 14,
    totalDamage: 3,
    pools: [{ poolKey: "rightArm", poolNameSnapshot: "Right Arm", damage: 3 }],
    injuries: [],
  };
  const healed = applyFullBodyHealing(state, 10);
  assert.equal(healed.totalDamage, 0);
  assert.equal(healed.pools[0]?.damage, 0);
});

test("Restore All clears damage and resolves Injuries without deleting history", () => {
  const createdAt = "2026-08-30T12:00:00.000Z";
  const state: ActiveHealthState = {
    characterId: 15,
    totalDamage: 9,
    pools: [{ poolKey: "rightArm", poolNameSnapshot: "Right Arm", damage: 9 }],
    injuries: [{
      id: 1,
      characterId: 15,
      poolKey: "rightArm",
      poolNameSnapshot: "Right Arm",
      hitLocationNumber: 1,
      hitLocationNameSnapshot: "Right Arm",
      name: "Cut",
      notes: "",
      damageAmount: 9,
      resolved: false,
      resolvedAt: null,
      createdAt,
      updatedAt: createdAt,
    }],
  };
  const restoredAt = new Date("2026-08-31T12:00:00.000Z");
  const restored = restoreAllHealth(state, restoredAt);
  assert.equal(restored.totalDamage, 0);
  assert.equal(restored.pools[0]?.damage, 0);
  assert.equal(restored.injuries.length, 1);
  assert.equal(restored.injuries[0]?.resolved, true);
  assert.equal(restored.injuries[0]?.resolvedAt, restoredAt.toISOString());
});

test("stored damage survives permanent maximum-HP advancement", () => {
  const state: ActiveHealthState = {
    characterId: 16,
    totalDamage: 20,
    pools: [],
    injuries: [],
  };
  const before = resolveActiveHealthView({ ...simpleAnatomy(), totalMaximumHp: 50 }, state);
  const after = resolveActiveHealthView({ ...simpleAnatomy(), totalMaximumHp: 60 }, state);
  assert.equal(before.total.remainingHp, 30);
  assert.equal(after.total.remainingHp, 40);
  assert.equal(after.totalDamage, 20);
});

test("humanoid anatomy maps locations 3 and 4 to the shared Right Leg Pool", () => {
  const anatomy = resolveHumanoidHealthAnatomy(25, 0);
  assert.equal(anatomy.kind, "humanoid");
  assert.equal(anatomy.hitLocations.find(({ result }) => result === 3)?.poolKey, "rightLeg");
  assert.equal(anatomy.hitLocations.find(({ result }) => result === 4)?.poolKey, "rightLeg");
  assert.equal(anatomy.pools.filter(({ key }) => key === "rightLeg").length, 1);
});

test("Creature anatomy uses current non-humanoid Pool IDs and exact locations", () => {
  const anatomy = resolveCreatureHealthAnatomy({
    core: {
      size: "Huge",
      hpMultiplierSteps: 0,
      baseMovementSteps: 0,
      baseMagicSteps: 0,
    },
    attributes: [{ attributeKey: "Constitution", value: 30 }],
    hpPools: [
      { canonicalId: "CORE", poolName: "Core", hpPercentage: 50, sortOrder: 0 },
      { canonicalId: "LEFT-WING", poolName: "Left Wing", hpPercentage: 20, sortOrder: 1 },
      { canonicalId: "RIGHT-WING", poolName: "Right Wing", hpPercentage: 20, sortOrder: 2 },
      { canonicalId: "TAIL", poolName: "Tail", hpPercentage: 10, sortOrder: 3 },
    ],
    hitLocations: [{
      hitLocationNumber: 2,
      locationName: "Left Wing Tip",
      bodyPartsIncluded: "Outer feathers",
      hpPoolCanonicalId: "LEFT-WING",
      sortOrder: 0,
    }],
  }, 6);
  const damaged = applyLocalizedDamage(createEmptyActiveHealthState(17), anatomy, {
    amount: 9,
    hitLocationNumber: 2,
  });
  assert.equal(anatomy.totalMaximumHp, 100);
  assert.deepEqual(anatomy.pools.map(({ key }) => key), ["CORE", "LEFT-WING", "RIGHT-WING", "TAIL"]);
  assert.deepEqual(anatomy.pools.map(({ maximumHp }) => maximumHp), [50, 20, 20, 10]);
  assert.equal(damaged.totalDamage, 9);
  assert.deepEqual(damaged.pools, [{ poolKey: "LEFT-WING", poolNameSnapshot: "Left Wing", damage: 9 }]);
  assert.equal(anatomy.pools.some(({ name }) => /arm|leg|torso/i.test(name)), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCreatureHealthAnatomy,
  resolveHumanoidHealthAnatomy,
} from "../active-state/anatomy";
import type { ActiveHealthAnatomy, ActiveHealthState } from "../active-state/models";

import type { MechanicalEffectHealthResult } from "./models";
import { planMechanicalEffect } from "./planning";

function bridgeAnatomy(): ActiveHealthAnatomy {
  return {
    kind: "humanoid",
    totalMaximumHp: 50,
    maximumHpNote: null,
    pools: [
      { key: "head", name: "Head", maximumHp: 5, percentage: 10, sortOrder: 0 },
      { key: "rightArm", name: "Right Arm", maximumHp: 8, percentage: 15, sortOrder: 1 },
      { key: "rightLeg", name: "Right Leg", maximumHp: 8, percentage: 15, sortOrder: 2 },
    ],
    hitLocations: [],
  };
}

function requireHealthResult(result: MechanicalEffectHealthResult | null): MechanicalEffectHealthResult {
  assert.ok(result, "Expected a resolved Active Health preview.");
  return result;
}

test("full-body healing bridge uses Active Health to reduce Total and every damaged Pool", () => {
  const state: ActiveHealthState = {
    characterId: 12,
    totalDamage: 20,
    pools: [
      { poolKey: "head", poolNameSnapshot: "Head", damage: 3 },
      { poolKey: "rightArm", poolNameSnapshot: "Right Arm", damage: 8 },
      { poolKey: "rightLeg", poolNameSnapshot: "Right Leg", damage: 11 },
    ],
    injuries: [],
  };
  const plan = planMechanicalEffect({
    effect: { kind: "health.heal", amount: 5, scope: "full-body" },
    application: { targetCharacterId: 12 },
    health: { anatomy: bridgeAnatomy(), state },
  });
  const result = requireHealthResult(plan.healthResult);

  assert.equal(plan.status, "ready");
  assert.equal(result.nextState.totalDamage, 15);
  assert.deepEqual(result.nextState.pools.map(({ damage }) => damage), [0, 3, 6]);
  assert.deepEqual(result.totalDamage, { before: 20, after: 15 });
});

test("area-healing bridge changes one Pool while Total Damage remains independent", () => {
  const state: ActiveHealthState = {
    characterId: 13,
    totalDamage: 15,
    pools: [{ poolKey: "rightArm", poolNameSnapshot: "Right Arm", damage: 8 }],
    injuries: [],
  };
  const plan = planMechanicalEffect({
    effect: { kind: "health.heal", amount: 5, scope: "area" },
    application: { targetCharacterId: 13, poolKey: "rightArm" },
    health: { anatomy: bridgeAnatomy(), state },
  });
  const result = requireHealthResult(plan.healthResult);

  assert.equal(plan.status, "ready");
  assert.equal(result.nextState.totalDamage, 15);
  assert.equal(result.nextState.pools[0]?.damage, 3);
  assert.deepEqual(result.poolDamage, [{
    poolKey: "rightArm",
    poolName: "Right Arm",
    before: 8,
    after: 3,
  }]);
});

test("localized damage delegates exact humanoid hit-location mapping to Active Health", () => {
  const anatomy = resolveHumanoidHealthAnatomy(25, 0);
  const lowerLeg = anatomy.hitLocations.find(({ name }) => name === "Right Lower Leg");
  assert.ok(lowerLeg, "Current Active Health anatomy must contain Right Lower Leg.");

  const state: ActiveHealthState = { characterId: 14, totalDamage: 2, pools: [], injuries: [] };
  const plan = planMechanicalEffect({
    effect: { kind: "health.damage", amount: 7, application: "localized" },
    application: { targetCharacterId: 14, hitLocationNumber: lowerLeg.result },
    health: { anatomy, state },
  });
  const result = requireHealthResult(plan.healthResult);

  assert.equal(plan.status, "ready");
  assert.equal(lowerLeg.poolKey, "rightLeg");
  assert.equal(result.nextState.totalDamage, 9);
  assert.equal(result.nextState.pools.find(({ poolKey }) => poolKey === "rightLeg")?.damage, 7);
});

test("localized damage supports direct Pool targeting already accepted by Active Health", () => {
  const state: ActiveHealthState = { characterId: 15, totalDamage: 0, pools: [], injuries: [] };
  const plan = planMechanicalEffect({
    effect: { kind: "health.damage", amount: 4, application: "localized" },
    application: { targetCharacterId: 15, poolKey: "rightArm" },
    health: { anatomy: bridgeAnatomy(), state },
  });
  const result = requireHealthResult(plan.healthResult);

  assert.equal(result.nextState.totalDamage, 4);
  assert.equal(result.nextState.pools[0]?.poolKey, "rightArm");
  assert.equal(result.nextState.pools[0]?.damage, 4);
});

test("creature damage uses non-humanoid Pool identity with calculated maximum HP", () => {
  const anatomy = resolveCreatureHealthAnatomy({
    core: {
      size: "Medium",
      hpMultiplierSteps: 0,
      baseMovementSteps: 0,
      baseMagicSteps: 0,
    },
    attributes: [{ attributeKey: "Constitution", value: 30 }],
    hpPools: [
      { canonicalId: "CORE", poolName: "Core", hpPercentage: 60, sortOrder: 0 },
      { canonicalId: "LEFT_WING", poolName: "Left Wing", hpPercentage: 40, sortOrder: 1 },
    ],
    hitLocations: [{
      hitLocationNumber: 2,
      locationName: "Left Wing Tip",
      bodyPartsIncluded: "Outer feathers",
      hpPoolCanonicalId: "LEFT_WING",
      sortOrder: 0,
    }],
  }, 0);
  const state: ActiveHealthState = { characterId: 16, totalDamage: 6, pools: [], injuries: [] };
  const plan = planMechanicalEffect({
    effect: { kind: "health.damage", amount: 6, application: "localized" },
    application: { targetCharacterId: 16, hitLocationNumber: 2 },
    health: { anatomy, state },
  });
  const result = requireHealthResult(plan.healthResult);
  const wing = result.after.tracks.find(({ key }) => key === "LEFT_WING");

  assert.equal(plan.status, "ready");
  assert.equal(result.nextState.totalDamage, 12);
  assert.equal(result.nextState.pools[0]?.poolKey, "LEFT_WING");
  assert.equal(result.nextState.pools[0]?.damage, 6);
  assert.equal(result.before.total.maximumHp, 61);
  assert.equal(result.after.total.maximumHp, 61);
  assert.equal(result.after.total.remainingHp, 49);
  assert.equal(wing?.maximumHp, 25);
  assert.equal(wing?.remainingHp, 19);
  assert.equal(anatomy.maximumHpNote, null);
});

test("health preview rejects a state belonging to a different selected target", () => {
  const plan = planMechanicalEffect({
    effect: { kind: "health.heal", amount: 5, scope: "full-body" },
    application: { targetCharacterId: 99 },
    health: {
      anatomy: bridgeAnatomy(),
      state: { characterId: 98, totalDamage: 5, pools: [], injuries: [] },
    },
  });

  assert.equal(plan.status, "invalid");
  assert.equal(plan.issues[0]?.code, "target-state-mismatch");
});

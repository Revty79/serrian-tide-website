import assert from "node:assert/strict";
import test from "node:test";

import type { ActiveHealthAnatomy, ActiveHealthState } from "../active-state/models";

import type { MechanicalEffect } from "./models";
import { planMechanicalEffect } from "./planning";
import {
  getMechanicalEffectRequirements,
  getMissingMechanicalEffectSelections,
} from "./requirements";
import { formatMechanicalEffectSummary } from "./summaries";

const fullBodyHeal: MechanicalEffect = { kind: "health.heal", amount: 5, scope: "full-body" };
const areaHeal: MechanicalEffect = { kind: "health.heal", amount: 5, scope: "area" };
const localizedDamage: MechanicalEffect = {
  kind: "health.damage",
  amount: 7,
  application: "localized",
};

test("target requirements are centralized for each supported effect", () => {
  assert.deepEqual(getMechanicalEffectRequirements(fullBodyHeal), ["target-character"]);
  assert.deepEqual(getMechanicalEffectRequirements(areaHeal), ["target-character", "hp-pool"]);
  assert.deepEqual(getMechanicalEffectRequirements(localizedDamage), [
    "target-character",
    "hit-location-or-hp-pool",
  ]);
  assert.deepEqual(getMechanicalEffectRequirements({
    kind: "manual",
    title: "Omen",
    description: "Resolve at the G.O.D.'s discretion.",
  }), []);
});

test("missing selections distinguish full-body, area, and localized targeting", () => {
  assert.deepEqual(getMissingMechanicalEffectSelections(fullBodyHeal), ["target-character"]);
  assert.deepEqual(getMissingMechanicalEffectSelections(fullBodyHeal, { targetCharacterId: 17 }), []);
  assert.deepEqual(getMissingMechanicalEffectSelections(areaHeal, { targetCharacterId: 17 }), ["hp-pool"]);
  assert.deepEqual(getMissingMechanicalEffectSelections(localizedDamage, { targetCharacterId: 17 }), [
    "hit-location-or-hp-pool",
  ]);
  assert.deepEqual(getMissingMechanicalEffectSelections(localizedDamage, {
    targetCharacterId: 17,
    hitLocationNumber: 3,
  }), []);
  assert.deepEqual(getMissingMechanicalEffectSelections(localizedDamage, {
    targetCharacterId: 17,
    poolKey: "rightLeg",
  }), []);
});

test("planning exposes needs-selection and ready statuses without persistence", () => {
  const needsPool = planMechanicalEffect({ effect: areaHeal, application: { targetCharacterId: 17 } });
  const ready = planMechanicalEffect({
    effect: areaHeal,
    application: { targetCharacterId: 17, poolKey: "rightArm" },
  });
  const blankPool = planMechanicalEffect({
    effect: areaHeal,
    application: { targetCharacterId: 17, poolKey: "  " },
  });

  assert.equal(needsPool.status, "needs-selection");
  assert.deepEqual(needsPool.missingSelections, ["hp-pool"]);
  assert.equal(blankPool.status, "needs-selection");
  assert.deepEqual(blankPool.missingSelections, ["hp-pool"]);
  assert.equal(ready.status, "ready");
  assert.equal(ready.healthResult, null);
});

test("planning rejects malformed runtime selections", () => {
  const invalidTarget = planMechanicalEffect({
    effect: fullBodyHeal,
    application: { targetCharacterId: -1 },
  });
  const invalidLocation = planMechanicalEffect({
    effect: localizedDamage,
    application: { targetCharacterId: 17, hitLocationNumber: 2.5 },
  });

  assert.equal(invalidTarget.status, "invalid");
  assert.equal(invalidTarget.issues[0]?.code, "invalid-target-character");
  assert.equal(invalidLocation.status, "invalid");
  assert.equal(invalidLocation.issues[0]?.code, "invalid-hit-location");
});

test("manual effects are valid plans, retain source metadata, and never mutate health", () => {
  const state: ActiveHealthState = {
    characterId: 22,
    totalDamage: 9,
    pools: [{ poolKey: "rightArm", poolNameSnapshot: "Right Arm", damage: 4 }],
    injuries: [],
  };
  const stateSnapshot = structuredClone(state);
  const plan = planMechanicalEffect({
    effect: {
      kind: "manual",
      title: "Whispers of Shadow",
      description: "Affected shadows reveal secrets at the G.O.D.'s discretion.",
    },
    source: { kind: "god", id: "god-ruling", name: "G.O.D. Ruling" },
    health: { anatomy: emptyAnatomy(), state },
  });

  assert.equal(plan.status, "manual");
  assert.equal(plan.summary, "Manual · Whispers of Shadow");
  assert.equal(plan.source?.kind, "god");
  assert.equal(plan.healthResult, null);
  assert.deepEqual(state, stateSnapshot);
});

test("one formatter produces shared summaries for every initial effect kind", () => {
  assert.equal(formatMechanicalEffectSummary(fullBodyHeal), "Heal 5 · Full Body");
  assert.equal(formatMechanicalEffectSummary({ ...areaHeal, amount: 8 }), "Heal 8 · Area Applied");
  assert.equal(formatMechanicalEffectSummary({ ...localizedDamage, amount: 9 }), "Deal 9 Damage · Localized");
  assert.equal(formatMechanicalEffectSummary({
    kind: "manual",
    title: "Whispers of Shadow",
    description: "G.O.D. resolution.",
  }), "Manual · Whispers of Shadow");
});

function emptyAnatomy(): ActiveHealthAnatomy {
  return {
    kind: "humanoid",
    totalMaximumHp: 50,
    maximumHpNote: null,
    pools: [],
    hitLocations: [],
  };
}

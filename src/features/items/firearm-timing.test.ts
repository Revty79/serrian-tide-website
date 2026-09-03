import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateFirearmTiming,
  copyFirearmFiringModes,
  normalizeFirearmFiringModes,
  resolveFirearmFiringMode,
  type FirearmFiringModeDraft,
} from "./firearm-timing";

function mode(overrides: Partial<FirearmFiringModeDraft> = {}): FirearmFiringModeDraft {
  return {
    id: null,
    name: "Single",
    sortOrder: 0,
    baseCyclingInitiativeCost: 0,
    baseRecoilResetInitiativeCost: 0,
    deliveryCadence: "per-trigger",
    roundsPerCadence: 1,
    mechanicsReviewRequired: false,
    ...overrides,
  };
}

test("firearm timing accepts zero base components and adds the ordinary trigger pull", () => {
  assert.deepEqual(calculateFirearmTiming({
    baseCyclingInitiativeCost: 0,
    baseRecoilResetInitiativeCost: 0,
    ammunitionCyclingInitiativeModifier: 0,
    ammunitionRecoilResetInitiativeModifier: 0,
  }), {
    effectiveCyclingInitiativeCost: 0,
    effectiveRecoilResetInitiativeCost: 0,
    followUpPreparationInitiativeCost: 0,
    totalThroughNextTriggerPullInitiativeCost: 1,
  });
});

test("positive ammunition modifiers increase their independently authored components", () => {
  const result = calculateFirearmTiming({
    baseCyclingInitiativeCost: 2,
    baseRecoilResetInitiativeCost: 3,
    ammunitionCyclingInitiativeModifier: 1,
    ammunitionRecoilResetInitiativeModifier: 2,
  });
  assert.deepEqual(result, {
    effectiveCyclingInitiativeCost: 3,
    effectiveRecoilResetInitiativeCost: 5,
    followUpPreparationInitiativeCost: 8,
    totalThroughNextTriggerPullInitiativeCost: 9,
  });
});

test("negative ammunition modifiers clamp cycling and recoil reset independently", () => {
  const result = calculateFirearmTiming({
    baseCyclingInitiativeCost: 2,
    baseRecoilResetInitiativeCost: 5,
    ammunitionCyclingInitiativeModifier: -8,
    ammunitionRecoilResetInitiativeModifier: -3,
  });
  assert.equal(result.effectiveCyclingInitiativeCost, 0);
  assert.equal(result.effectiveRecoilResetInitiativeCost, 2);
  assert.equal(result.followUpPreparationInitiativeCost, 2);
  assert.equal(result.totalThroughNextTriggerPullInitiativeCost, 3);
});

test("timing rejects negative, fractional, and unreviewed base costs", () => {
  assert.throws(() => calculateFirearmTiming({ baseCyclingInitiativeCost: -1, baseRecoilResetInitiativeCost: 0, ammunitionCyclingInitiativeModifier: 0, ammunitionRecoilResetInitiativeModifier: 0 }), /zero or greater/);
  assert.throws(() => calculateFirearmTiming({ baseCyclingInitiativeCost: 1.5, baseRecoilResetInitiativeCost: 0, ammunitionCyclingInitiativeModifier: 0, ammunitionRecoilResetInitiativeModifier: 0 }), /whole number/);
  assert.throws(() => calculateFirearmTiming({ baseCyclingInitiativeCost: null, baseRecoilResetInitiativeCost: 0, ammunitionCyclingInitiativeModifier: 0, ammunitionRecoilResetInitiativeModifier: 0 }), /reviewed and authored/);
  assert.throws(() => calculateFirearmTiming({ baseCyclingInitiativeCost: 0, baseRecoilResetInitiativeCost: null, ammunitionCyclingInitiativeModifier: 0, ammunitionRecoilResetInitiativeModifier: 0 }), /reviewed and authored/);
});

test("ordered firing-mode normalization trims names, assigns order, and rejects duplicates", () => {
  const normalized = normalizeFirearmFiringModes([
    mode({ name: " Single ", sortOrder: 7 }),
    mode({ name: "Burst", sortOrder: 2, baseCyclingInitiativeCost: 1 }),
  ]);
  assert.deepEqual(normalized.map(({ name, sortOrder }) => ({ name, sortOrder })), [
    { name: "Single", sortOrder: 0 },
    { name: "Burst", sortOrder: 1 },
  ]);
  assert.throws(() => normalizeFirearmFiringModes([mode(), mode({ name: " single " })]), /must be unique/);
  assert.throws(() => normalizeFirearmFiringModes([mode({ name: "   " })]), /Name is required/);
  assert.throws(() => normalizeFirearmFiringModes([mode({ baseRecoilResetInitiativeCost: -1 })]), /zero or greater/);
  assert.throws(() => normalizeFirearmFiringModes([mode({ roundsPerCadence: 0 })]), /greater than zero/);
  assert.throws(() => normalizeFirearmFiringModes([mode({ roundsPerCadence: 1.5 })]), /whole number/);
});

test("firing modes author a structured positive-round delivery cadence", () => {
  const normalized = normalizeFirearmFiringModes([
    mode({ name: "Semiautomatic", deliveryCadence: "per-trigger", roundsPerCadence: 1 }),
    mode({ name: "Three-round burst", deliveryCadence: "per-trigger", roundsPerCadence: 3 }),
    mode({ name: "Fully automatic", deliveryCadence: "sustained-per-initiative", roundsPerCadence: 5 }),
  ]);
  assert.deepEqual(normalized.map(({ deliveryCadence, roundsPerCadence }) => ({ deliveryCadence, roundsPerCadence })), [
    { deliveryCadence: "per-trigger", roundsPerCadence: 1 },
    { deliveryCadence: "per-trigger", roundsPerCadence: 3 },
    { deliveryCadence: "sustained-per-initiative", roundsPerCadence: 5 },
  ]);
});

test("migrated modes remain explicitly unreviewed and cannot produce a claimed timing total", () => {
  const migrated = normalizeFirearmFiringModes([mode({
    id: 42,
    name: "Legacy Burst",
    baseCyclingInitiativeCost: null,
    baseRecoilResetInitiativeCost: null,
    deliveryCadence: null,
    roundsPerCadence: null,
    mechanicsReviewRequired: true,
  })]);
  assert.equal(migrated[0]?.mechanicsReviewRequired, true);
  assert.equal(resolveFirearmFiringMode(migrated[0]!).timing, null);
  assert.throws(() => normalizeFirearmFiringModes([mode({
    id: null,
    baseCyclingInitiativeCost: null,
    baseRecoilResetInitiativeCost: null,
    deliveryCadence: null,
    roundsPerCadence: null,
    mechanicsReviewRequired: false,
  })]), /must provide nonnegative/);
});

test("variant copies own independent firing-mode records", () => {
  const parent = [mode({ id: 8, name: "Burst", baseCyclingInitiativeCost: 2, baseRecoilResetInitiativeCost: 1 })];
  const clone = copyFirearmFiringModes(parent);
  assert.equal(clone[0]?.id, null);
  assert.notEqual(clone[0], parent[0]);
  clone[0]!.name = "Variant Burst";
  assert.equal(parent[0]!.name, "Burst");
});

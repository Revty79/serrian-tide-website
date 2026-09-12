import assert from "node:assert/strict";
import test from "node:test";
import { movementInjuryTiming, weaponInjuryTiming } from "./combat-injury-timing";

const arms = [{ key: "left", name: "Left Arm", disabled: true }, { key: "right", name: "Right Arm", disabled: false }];
test("one functioning hand doubles two-handed timing and preserves good-hand one-handed timing", () => {
  assert.equal(weaponInjuryTiming(4, "Two-Handed", arms).initiativeCost, 8);
  assert.equal(weaponInjuryTiming(4, "One-Handed", arms).initiativeCost, 4);
  assert.match(weaponInjuryTiming(4, "One-Handed", arms).explanation!, /functioning right arm/);
  assert.throws(() => weaponInjuryTiming(4, "Versatile", arms), /Choose one-handed or two-handed/);
  assert.equal(weaponInjuryTiming(4, "Versatile", arms, 1).initiativeCost, 4);
  assert.equal(weaponInjuryTiming(4, "Versatile", arms, 2).initiativeCost, 8);
  assert.equal(weaponInjuryTiming(4, "Two-Handed", arms, 1).initiativeCost, 8, "a caller cannot override authored two-handed use");
  assert.throws(() => weaponInjuryTiming(4, "", arms), /Handedness/);
  assert.throws(() => weaponInjuryTiming(4, "One-Handed", arms.map((entry) => ({ ...entry, disabled: true }))), /Both arms/);
});
test("the confirmed movement penalty applies to one disabled leg on a two-legged anatomy", () => {
  const legs = [{ key: "left", name: "Left Leg", disabled: true }, { key: "right", name: "Right Leg", disabled: false }];
  assert.equal(movementInjuryTiming(2, legs).initiativeCost, 4);
  assert.equal(movementInjuryTiming(2, arms).initiativeCost, 2);
  assert.equal(movementInjuryTiming(2, legs.map((entry) => ({ ...entry, disabled: false }))).initiativeCost, 2);
  assert.equal(movementInjuryTiming(2, [...legs, { key: "front-left", name: "Left Foreleg", disabled: false }, { key: "front-right", name: "Right Foreleg", disabled: false }]).initiativeCost, 2);
});

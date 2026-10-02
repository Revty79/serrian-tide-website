import assert from "node:assert/strict";
import test from "node:test";
import { ARMOR_BODY_LOCATION_CHOICES, armorCoverageDraftKey, armorCoverageEntries, armorCoversLocation, armorLocationDefinition, normalizeArmorCoverageKeys, otherArmorLocationKeys } from "./armor-coverage";

test("whole legs select both legacy hit locations without broadening existing partial coverage", () => {
  assert.deepEqual(ARMOR_BODY_LOCATION_CHOICES.find(({ key }) => key === "right-leg")?.locationKeys, ["3", "4"]);
  assert.deepEqual(otherArmorLocationKeys("Left Leg"), ["5", "6"]);
  assert.deepEqual(armorCoverageEntries(["3"]), [{ label: "Right Lower Leg", keys: ["3"] }]);
  assert.deepEqual(armorCoverageEntries(["3", "4"]), [{ label: "Right Leg", keys: ["3", "4"] }]);
  assert.equal(armorCoversLocation(["3"], { key: "4", name: "Right Upper Leg" }), false);
});

test("custom names retain display text, share a stable identity, and cannot duplicate standard coverage", () => {
  const keys = normalizeArmorCoverageKeys(["1", "custom:Right Arm", "custom:  Left   Wing ", "custom:left wing", "custom:Right Leg"]);
  assert.deepEqual(keys, ["1", "custom:Left Wing", "3", "4"]);
  assert.deepEqual(armorLocationDefinition("custom:Left Wing"), { key: "custom:left wing", label: "Left Wing" });
  assert.equal(armorCoverageDraftKey("custom:left wing", "Left Wing"), "custom:Left Wing");
  assert.throws(() => otherArmorLocationKeys("  "), /Enter the body location/);
  assert.throws(() => otherArmorLocationKeys("a".repeat(81)), /80 characters/);
  assert.throws(() => normalizeArmorCoverageKeys(["custom:"]), /Enter the body location/);
  assert.throws(() => normalizeArmorCoverageKeys([null as unknown as string]), /valid covered body location/);
});

test("named coverage follows exact anatomy names across different hit numbers and does not cover absent limbs", () => {
  assert.equal(armorCoversLocation(["custom:Tail"], { key: "8", name: " Tail " }), true);
  assert.equal(armorCoversLocation(["custom:Tail"], { key: "6", name: "TAIL" }), true);
  assert.equal(armorCoversLocation(["custom:Tail"], { key: "8", name: "Stomach" }), false);
  assert.equal(armorCoversLocation(["custom:Tail"], { key: "6", name: "Tail Tip" }), false);
  assert.equal(armorCoversLocation(["custom:Tail"], undefined), false);
  assert.equal(armorCoversLocation(["9"], { key: "9", name: "Chest" }), true);
});

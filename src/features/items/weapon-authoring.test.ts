import assert from "node:assert/strict";
import test from "node:test";

import { validateWeaponAuthoringValues } from "./weapon-authoring";

const supported = { profileRecordType: "Weapon", handedness: "Versatile", damageSource: "Ammunition" };

test("supported weapon authoring vocabularies round-trip", () => {
  assert.deepEqual(validateWeaponAuthoringValues(supported), supported);
});

test("new unsupported weapon authoring values are rejected", () => {
  assert.throws(() => validateWeaponAuthoringValues({ ...supported, handedness: "Twenty" }), /Handedness/);
  assert.throws(() => validateWeaponAuthoringValues({ ...supported, damageSource: "Magic" }), /Damage Source/);
  assert.throws(() => validateWeaponAuthoringValues({ ...supported, profileRecordType: "Projectile" }), /Profile Record Type/);
});

test("an unchanged historical value is preserved, but changing it is rejected", () => {
  const historical = { profileRecordType: "Legacy Weapon", handedness: "Two hands", damageSource: "Payload" };
  assert.deepEqual(validateWeaponAuthoringValues(historical, historical), historical);
  assert.equal(validateWeaponAuthoringValues({ ...historical, damageSource: "Weapon" }, historical).damageSource, "Weapon");
  assert.throws(() => validateWeaponAuthoringValues({ ...historical, damageSource: "Magic" }, historical), /Damage Source/);
});

import assert from "node:assert/strict";
import test from "node:test";

import { resolveWeaponRange, validateStructuredWeaponRange, weaponAttackMode } from "./weapon-range";

const pistol = { mode: "ranged" as const, unit: "feet", reach: null, short: 10, medium: 25, long: 50 };

test("canonical melee needs no distance while ranged cannot be relabeled to bypass approval", () => {
  assert.equal(weaponAttackMode("melee", null), "melee");
  assert.equal(weaponAttackMode(null, null), "melee");
  assert.equal(weaponAttackMode("melee", "ranged"), "melee");
  assert.equal(weaponAttackMode("ranged", "melee"), "ranged");
  assert.equal(weaponAttackMode(null, "melee", true), "ranged");
  assert.equal(weaponAttackMode("hybrid", "melee"), "melee");
  assert.equal(weaponAttackMode("hybrid", "ranged"), "ranged");
  assert.throws(() => weaponAttackMode("hybrid", null), /Choose whether/);
  assert.equal(weaponAttackMode(null, null, false, "Sword"), "melee");
  assert.throws(() => weaponAttackMode(null, "melee", false, "Sonic Weapon"), /no supported attack mode/);
});

test("structured ranged limits use inclusive Short, Medium, and Long boundaries", () => {
  assert.equal(resolveWeaponRange({ profile: pistol, attackMode: "ranged", distance: 10, unit: "feet" }).band, "short");
  assert.equal(resolveWeaponRange({ profile: pistol, attackMode: "ranged", distance: 25, unit: "feet" }).band, "medium");
  assert.equal(resolveWeaponRange({ profile: pistol, attackMode: "ranged", distance: 50, unit: "feet" }).band, "long");
  assert.equal(resolveWeaponRange({ profile: pistol, attackMode: "ranged", distance: 10, unit: "feet" }).adjustment, 10);
  assert.equal(resolveWeaponRange({ profile: pistol, attackMode: "ranged", distance: 50, unit: "feet" }).adjustment, -10);
});

test("Beyond Long requires a G.O.D. modifier and replaces Long adjustment", () => {
  assert.throws(() => resolveWeaponRange({ profile: pistol, attackMode: "ranged", distance: 51, unit: "feet" }), /explicit G.O.D. modifier/);
  assert.equal(resolveWeaponRange({ profile: pistol, attackMode: "ranged", distance: 51, unit: "feet", beyondLongModifier: 0, beyondLongReason: "Neutral ruling." }).adjustment, 0);
  assert.equal(resolveWeaponRange({ profile: pistol, attackMode: "ranged", distance: 51, unit: "feet", beyondLongModifier: 25, beyondLongReason: "Far target." }).adjustment, -25);
});

test("range validation permits unfinished values but rejects entered disorder and missing units", () => {
  assert.doesNotThrow(() => validateStructuredWeaponRange({ mode: "ranged", unit: null, reach: null, short: null, medium: null, long: null }));
  assert.throws(() => validateStructuredWeaponRange({ ...pistol, medium: 5 }), /Short Range/);
  assert.throws(() => validateStructuredWeaponRange({ ...pistol, unit: null }), /distance unit/);
  assert.throws(() => resolveWeaponRange({ profile: { mode: null, unit: "feet", reach: null, short: null, medium: null, long: null }, attackMode: "ranged", distance: 10, unit: "feet" }), /authored ranged mode and limits/);
});

test("hybrid melee uses Reach and never receives ranged adjustment", () => {
  const hybrid = { mode: "hybrid" as const, unit: "meters", reach: 2, short: 10, medium: 20, long: 40 };
  const result = resolveWeaponRange({ profile: hybrid, attackMode: "melee", distance: 2, unit: "meters" });
  assert.equal(result.band, "reach");
  assert.equal(result.adjustment, 0);
});

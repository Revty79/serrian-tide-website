import assert from "node:assert/strict";
import test from "node:test";

import { resolveWeaponRange, validateStructuredWeaponRange } from "./weapon-range";

const pistol = { mode: "ranged" as const, unit: "feet", reach: null, short: 10, medium: 25, long: 50 };

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
});

test("hybrid melee uses Reach and never receives ranged adjustment", () => {
  const hybrid = { mode: "hybrid" as const, unit: "meters", reach: 2, short: 10, medium: 20, long: 40 };
  const result = resolveWeaponRange({ profile: hybrid, attackMode: "melee", distance: 2, unit: "meters" });
  assert.equal(result.band, "reach");
  assert.equal(result.adjustment, 0);
});

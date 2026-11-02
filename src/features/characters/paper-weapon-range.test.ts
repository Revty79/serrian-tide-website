import assert from "node:assert/strict";
import test from "node:test";
import { describePaperWeaponRange } from "./paper-weapon-range";

test("printed range uses structured bands and the saved unit even when legacy text is empty or stale", () => {
  const profile = { rangeMode: "ranged", distanceUnit: "feet", shortRangeDistance: 25, mediumRangeDistance: 50, longRangeDistance: 100, rangeText: "Old range text", reachText: "Old reach text" };
  const before = structuredClone(profile);
  assert.deepEqual(describePaperWeaponRange(profile), { full: "Short 25; Medium 50; Long 100 feet", compact: "S/M/L 25/50/100 feet" });
  assert.deepEqual(profile, before);
});

test("melee and hybrid ranges retain their authored mode, reach and exact fractional units", () => {
  const profile = { rangeMode: "melee", distanceUnit: "meters", reachDistance: .001, shortRangeDistance: 10, mediumRangeDistance: 20, longRangeDistance: 40 };
  assert.deepEqual(describePaperWeaponRange(profile), { full: "Reach 0.001 meters", compact: "Reach 0.001 meters" });
  assert.deepEqual(describePaperWeaponRange({ ...profile, rangeMode: "hybrid" }), { full: "Reach 0.001 meters; Short 10; Medium 20; Long 40 meters", compact: "Reach 0.001 meters; S/M/L 10/20/40 meters" });
});

test("legacy descriptions remain printable when the corresponding structured values are absent", () => {
  assert.deepEqual(describePaperWeaponRange({ rangeText: "30–90 ft, depending on load", reachText: "5 ft" }), { full: "Reach 5 ft; Range 30–90 ft, depending on load", compact: "Reach 5 ft; 30–90 ft, depending on load" });
  assert.equal(describePaperWeaponRange({ rangeMode: "ranged", rangeText: "120 ft", reachText: "5 ft" }).compact, "120 ft");
});

test("unfinished range records expose missing bands or units without inventing values", () => {
  assert.deepEqual(describePaperWeaponRange({ rangeMode: "ranged", shortRangeDistance: 10, longRangeDistance: 40 }), { full: "Short 10; Medium —; Long 40 (unit not recorded)", compact: "S/M/L 10/—/40 [unit?]" });
  assert.deepEqual(describePaperWeaponRange({}), { full: "Range/reach not recorded", compact: "—" });
});

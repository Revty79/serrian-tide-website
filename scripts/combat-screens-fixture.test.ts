import assert from "node:assert/strict";
import test from "node:test";
import { screenFirearmRangeProfile } from "./fixtures/combat-screen-mechanics";

for (const filter of [undefined, "distance-approval", "distance-approval,magazine-combat"]) {
  test(`screen firearm mechanics are filter-independent: ${filter ?? "no filter"}`, () => {
    const previous = process.env.COMBAT_SCREEN_CASE_FILTER;
    if (filter === undefined) delete process.env.COMBAT_SCREEN_CASE_FILTER;
    else process.env.COMBAT_SCREEN_CASE_FILTER = filter;
    try {
      assert.deepEqual(screenFirearmRangeProfile(), {
        rangeMode: "ranged",
        distanceUnit: "feet",
        shortRangeDistance: 10,
        mediumRangeDistance: 25,
        longRangeDistance: 50,
      });
    } finally {
      if (previous === undefined) delete process.env.COMBAT_SCREEN_CASE_FILTER;
      else process.env.COMBAT_SCREEN_CASE_FILTER = previous;
    }
  });
}

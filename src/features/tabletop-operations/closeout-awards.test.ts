import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { closeoutAwardTotalIsSafe, normalizeCloseoutAwards } from "./closeout-awards";

test("manual awards accept zero and finite fractional amounts without calculated defaults", () => {
  assert.deepEqual(normalizeCloseoutAwards({ awards: [], note: "" }), { awards: [], note: "" });
  assert.deepEqual(normalizeCloseoutAwards({ awards: [{ characterId: 2, experience: 10.5, fame: 0, quintessence: 0.25 }], note: "  Good work  " }), {
    awards: [{ characterId: 2, experience: 10.5, fame: 0, quintessence: 0.25 }], note: "Good work",
  });
});
test("manual awards reject malformed, duplicate, negative, nonfinite, and oversized inputs", () => {
  const award = { characterId: 1, experience: 1, fame: 0, quintessence: 0 };
  for (const amount of [-1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "5", null]) {
    for (const key of ["experience", "fame", "quintessence"]) assert.throws(() => normalizeCloseoutAwards({ awards: [{ ...award, [key]: amount }], note: "" } as never));
  }
  assert.throws(() => normalizeCloseoutAwards({ awards: [award, award], note: "" }));
  assert.throws(() => normalizeCloseoutAwards({ awards: [{ ...award, characterId: -1 }], note: "" }));
  assert.throws(() => normalizeCloseoutAwards({ awards: [], note: "x".repeat(2001) }));
  assert.throws(() => normalizeCloseoutAwards(null as never));
});
test("award retry comparisons have stable Character ordering", () => {
  const awards = [2, 1].map((characterId) => ({ characterId, experience: 1, fame: 2, quintessence: 3 }));
  assert.deepEqual(normalizeCloseoutAwards({ awards, note: "" }), normalizeCloseoutAwards({ awards: [...awards].reverse(), note: "" }));
});
test("incoming grants must fit balances without disappearing into floating point precision", () => {
  assert.equal(closeoutAwardTotalIsSafe(10, 0.5), true);
  assert.equal(closeoutAwardTotalIsSafe(Number.MAX_SAFE_INTEGER, 1), false);
  assert.equal(closeoutAwardTotalIsSafe(Number.MAX_SAFE_INTEGER, 0.1), false);
  assert.equal(closeoutAwardTotalIsSafe(Infinity, 0), false);
});
test("all public closeout paths write manual awards inside their existing lifecycle transaction", () => {
  for (const file of ["actions.ts", "scene-actions.ts", "session-closeout-actions.ts"]) {
    const source = readFileSync(`src/app/heavens/tabletop/${file}`, "utf8");
    assert.match(source, /db\.transaction/);
    assert.match(source, /await applyCloseoutAwardsInTransaction\(tx,/);
    assert.match(source, /assertCampaignRuntimeOperator/);
  }
  const source = readFileSync("src/features/tabletop-operations/closeout-award-service.ts", "utf8");
  assert.match(source, /eq\(userRole\.role, "god"\)/);
  assert.doesNotMatch(source, /totalExperience:|totalQuintessence:/);
  assert.match(source, /if \(previous\)/);
  const fields = readFileSync("src/app/heavens/tabletop/closeout-award-fields.tsx", "utf8");
  assert.match(fields, /\?\? ""/);
  assert.match(fields, /if \(view\.decision\) return/);
});

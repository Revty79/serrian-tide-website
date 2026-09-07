import assert from "node:assert/strict";
import test from "node:test";

import { calculateOrdinaryAttackDamage } from "./ordinary-attack-consequence";

test("ordinary attack damage applies authored damage, armor, and soak without firearm-only success damage", () => {
  assert.deepEqual(calculateOrdinaryAttackDamage({
    authoredDamage: "12",
    armor: 3,
    soak: 2,
    protectionSupported: true,
  }), {
    authoredDamage: "12",
    grossDamage: 12,
    armor: 3,
    soak: 2,
    netDamage: 7,
    supported: true,
    rulingReasons: [],
  });
});

test("ordinary attack damage reports the exact missing automation facts", () => {
  const dice = calculateOrdinaryAttackDamage({
    authoredDamage: "1d10 + 2",
    armor: 1,
    soak: 0,
    protectionSupported: true,
  });
  assert.equal(dice.supported, false);
  assert.match(dice.rulingReasons.join(" "), /damage Roll or interpretation requires a G\.O\.D\. ruling/);

  const protection = calculateOrdinaryAttackDamage({
    authoredDamage: 8,
    armor: null,
    soak: 0,
    protectionSupported: false,
    protectionRulingReasons: ["Multiple worn armor sources cover this Hit Location; no stacking rule was invented."],
  });
  assert.equal(protection.netDamage, null);
  assert.deepEqual(protection.rulingReasons, ["Multiple worn armor sources cover this Hit Location; no stacking rule was invented."]);
});

test("fully absorbed ordinary damage is a supported zero-damage consequence", () => {
  const result = calculateOrdinaryAttackDamage({
    authoredDamage: 4,
    armor: 3,
    soak: 2,
    protectionSupported: true,
  });
  assert.equal(result.supported, true);
  assert.equal(result.netDamage, 0);
});

test("negative protection is a ruling boundary and never increases damage", () => {
  const result = calculateOrdinaryAttackDamage({
    authoredDamage: 8,
    armor: -2,
    soak: 0,
    protectionSupported: true,
  });
  assert.equal(result.supported, false);
  assert.equal(result.netDamage, null);
  assert.match(result.rulingReasons.join(" "), /not converted into bonus damage/);
});

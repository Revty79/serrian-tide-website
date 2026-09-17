import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { physicalPercentile } from "./choice-types";

const commandPanel = readFileSync("src/features/combat-screen/command-panel.tsx", "utf8");

test("fixed-roll Item Abilities use the existing RollFields commit path", () => {
  assert.match(commandPanel, /"fixed-roll"/);
  assert.match(commandPanel, /needsRoll \? <RollFields/);
  assert.match(commandPanel, /rollInput\(draft\.roll\)/);
  assert.equal(physicalPercentile("01"), 1);
  assert.equal(physicalPercentile("00"), 100);
  assert.equal(physicalPercentile("100"), 100);
  assert.match(commandPanel, /rollInput\(draft\.roll\)/);
});

test("authored manual Item Abilities are not blocked before commit", () => {
  assert.match(commandPanel, /authoredManualItemAbility/);
    assert.match(commandPanel, /source\.ref\.startsWith\("item-power:"\)/);
  assert.match(commandPanel, /!authoredManualItemAbility/);
  assert.match(commandPanel, /resolutionMode === "manual-god-ruling"/);
});

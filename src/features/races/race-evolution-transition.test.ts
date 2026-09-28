import assert from "node:assert/strict";
import test from "node:test";
import { applyRaceEvolutionTransition, emptyRaceEvolutionTransition, normalizeRaceEvolutionTransition } from "./race-evolution-transition";
import { getCharacterHp } from "@/features/characters/character-rules";
const before = { attributes: [{ attributeKey: "STR", value: 30 }, { attributeKey: "CON", value: 30 }], hpMultiplierSteps: 2, baseMovementSteps: 1, baseMagicSteps: 3 };
test("authored add/set adjustments permanently project saved mechanics without creation caps or damage changes", () => {
  const after = applyRaceEvolutionTransition({ ...emptyRaceEvolutionTransition(), attributes: [{ key: "STR", operation: "add", value: 10 }, { key: "CON", operation: "add", value: 15 }], hpMultiplierSteps: { operation: "add", value: 2 }, baseMovementSteps: { operation: "set", value: 0 } }, before);
  assert.deepEqual(after.attributes, [{ attributeKey: "STR", value: 40 }, { attributeKey: "CON", value: 45 }]);
  assert.equal(after.hpMultiplierSteps, 4); assert.equal(after.baseMagicSteps, 3); assert.equal(after.baseMovementSteps, 0);
  assert.ok(getCharacterHp(45, 4) > getCharacterHp(30, 2)); assert.equal(before.attributes[0].value, 30);
  assert.deepEqual(applyRaceEvolutionTransition(null, before), before);
});
test("invalid keys, duplicates, unknown fields, nonfinite values, negative outcomes and fractional steps fail closed", () => {
  for (const value of [Infinity, NaN, -Infinity]) assert.throws(() => normalizeRaceEvolutionTransition({ ...emptyRaceEvolutionTransition(), attributes: [{ key: "STR", operation: "add", value }] }));
  assert.throws(() => normalizeRaceEvolutionTransition({ ...emptyRaceEvolutionTransition(), hpMultiplierSteps: { operation: "add", value: .5 } }));
  assert.throws(() => applyRaceEvolutionTransition({ ...emptyRaceEvolutionTransition(), attributes: [{ key: "CON", operation: "add", value: -31 }] }, before), /Nothing will be clamped/);
  assert.throws(() => applyRaceEvolutionTransition({ ...emptyRaceEvolutionTransition(), attributes: [{ key: "DEX", operation: "set", value: 20 }] }, before), /Record DEX/);
  assert.throws(() => normalizeRaceEvolutionTransition({ ...emptyRaceEvolutionTransition(), attributes: [{ key: "STR", operation: "add", value: 1 }, { key: "STR", operation: "set", value: 2 }] }), /at most once/);
});

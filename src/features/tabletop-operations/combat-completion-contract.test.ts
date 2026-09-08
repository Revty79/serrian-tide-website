import assert from "node:assert/strict";
import test from "node:test";
import { COMBAT_COMPLETION_FIXTURE as fixture } from "../../../scripts/fixtures/combat-completion-fixture";
import { resolvePercentileCheck, compareAttackAndDefense, calculatePerSuccessQuantity } from "./percentile-resolution";

test("the supplied fixed Rolls retain independent confirmed outcomes", () => {
  const check = (resultTotal: number, originalTarget: number) => resolvePercentileCheck({ resultTotal, originalTarget });
  const first = check(fixture.rolls.rowanFirst, fixture.rowan.attack);
  assert.equal(first.totalSuccesses, 6);
  assert.equal(compareAttackAndDefense(first, check(fixture.rolls.goblinOneBlock, 50)).outcome, "attack-wins");
  assert.equal(compareAttackAndDefense(check(55, 50), check(74, 40)).outcome, "defense-wins");
  assert.equal(check(fixture.rolls.rowanSecond, fixture.rowan.attack).succeeded, false);
  assert.equal(check(fixture.rolls.goblinTwoBlock, 50).succeeded, true);
  assert.equal(calculatePerSuccessQuantity(check(fixture.rolls.arcBolt, fixture.bolt.target), fixture.bolt.damagePerSuccess).appliedQuantity, 0);
});

test("the original exercise preserves its ruled first hit and excludes the invalid Mira defense", () => {
  assert.ok(fixture.firstHitRuling.damage > 2 * fixture.firstHitRuling.locationHp);
  assert.equal(fixture.firstHitRuling.award, null);
  assert.equal(fixture.expected.miraMana, fixture.mira.mana - fixture.bolt.manaCost);
  assert.equal(fixture.expected.goblinTwoNextEndpoint, 10);
  assert.ok(fixture.expected.rowanSecondEndpoint > fixture.expected.goblinTwoNextEndpoint);
  assert.equal((Object.values(fixture.rolls) as readonly number[]).includes(94), false);
  assert.equal(fixture.holdVariant.defenseRoll, 36);
});

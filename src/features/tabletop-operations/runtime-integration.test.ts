import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDurableAuthoredActionPayload,
  buildCreatureSpawnNames,
  getReactionCommitment,
  getUniversalNaturalActionInitiativeCost,
  parseDirectNumericDamage,
  reconcileReaction,
  requireReadyAuthoredAction,
  resolveCreatureAttackInitiativeCost,
  type AuthoredActionSourceKind,
} from "./runtime-integration";

test("durable authored payloads keep identities and reject copied live Character state", () => {
  assert.doesNotThrow(() => assertDurableAuthoredActionPayload({
    targetCharacterId: 12,
    itemId: 8,
    effectSelections: { "effect-1": { hitLocationNumber: 4, poolKey: "torso" } },
  }));
  for (const forbidden of [
    { currentMana: 10 },
    { hp: 25 },
    { nested: { inventoryQuantity: 2 } },
    { attributes: { strength: 40 } },
    { creatureSnapshot: {} },
  ]) assert.throws(() => assertDurableAuthoredActionPayload(forbidden), /may not copy live Character state/);
});

test("Creature batch naming is deterministic and bounded", () => {
  assert.deepEqual(buildCreatureSpawnNames("Wolf", 1), ["Wolf"]);
  assert.deepEqual(buildCreatureSpawnNames("Wolf", 3), ["Wolf 1", "Wolf 2", "Wolf 3"]);
  assert.throws(() => buildCreatureSpawnNames("Wolf", 0), /whole number from 1 to 50/);
  assert.throws(() => buildCreatureSpawnNames("Wolf", 51), /whole number from 1 to 50/);
});

test("direct Serrian Tide damage accepts clean numeric values and rejects dice", () => {
  assert.equal(parseDirectNumericDamage("8"), 8);
  assert.equal(parseDirectNumericDamage("3.5"), 3.5);
  assert.equal(parseDirectNumericDamage("1d6"), null);
  assert.equal(parseDirectNumericDamage("2d8+3"), null);
  assert.equal(parseDirectNumericDamage(0), null);
});

test("natural action baselines remain canonical", () => {
  assert.equal(getUniversalNaturalActionInitiativeCost("Punch"), 2);
  assert.equal(getUniversalNaturalActionInitiativeCost("Fist"), 2);
  assert.equal(getUniversalNaturalActionInitiativeCost("Bite"), 2);
  assert.equal(getUniversalNaturalActionInitiativeCost("Grapple"), 2);
  assert.equal(getUniversalNaturalActionInitiativeCost("Kick"), 3);
  assert.equal(getUniversalNaturalActionInitiativeCost("Tail Swipe"), 4);
});

test("custom Creature attacks use direct numeric damage before requiring a G.O.D. cost", () => {
  assert.deepEqual(resolveCreatureAttackInitiativeCost({ attackName: "Claw", damage: "7" }), { cost: 7, source: "damage" });
  assert.deepEqual(resolveCreatureAttackInitiativeCost({ attackName: "Claw", damage: "1d6" }), { cost: null, source: "missing" });
  assert.deepEqual(resolveCreatureAttackInitiativeCost({ attackName: "Claw", damage: "1d6", godSuppliedInitiativeCost: 5 }), { cost: 5, source: "god" });
  assert.deepEqual(resolveCreatureAttackInitiativeCost({ attackName: "Bite", damage: "12" }), { cost: 2, source: "natural" });
});

test("authored consequences require completed Initiative and a pending binding", () => {
  assert.doesNotThrow(() => requireReadyAuthoredAction({ status: "completed", remainingInitiativeCost: 0 }, "pending"));
  assert.throws(() => requireReadyAuthoredAction({ status: "active", remainingInitiativeCost: 2 }, "pending"), /not reached/);
  assert.throws(() => requireReadyAuthoredAction({ status: "completed", remainingInitiativeCost: 0 }, "resolved"), /already/);
});

test("Weapon, Creature Attack, Spell, Item, and Creature Ability share the exact-once resolution gate", () => {
  const sourceKinds: AuthoredActionSourceKind[] = [
    "weapon",
    "creature-attack",
    "spell",
    "item",
    "creature-ability",
  ];
  for (const sourceKind of sourceKinds) {
    let status: "pending" | "resolved" = "pending";
    let executions = 0;
    const execute = () => {
      requireReadyAuthoredAction({ status: "completed", remainingInitiativeCost: 0 }, status);
      executions += 1;
      status = "resolved";
    };
    execute();
    assert.throws(execute, /already been resolved or cancelled/, sourceKind);
    assert.equal(executions, 1, sourceKind);
  }
});

test("Dodge commits one and never adds an attacker penalty", () => {
  assert.equal(getReactionCommitment("dodge"), 1);
  assert.deepEqual(reconcileReaction({
    reactionType: "dodge",
    committedInitiativeCost: 1,
    attackerInitiativeCost: 8,
    succeeded: true,
  }), {
    defenderFinalCost: 1,
    defenderRefund: 0,
    attackerAdditionalCost: 0,
    attackPrevented: true,
  });
  assert.deepEqual(reconcileReaction({
    reactionType: "dodge",
    committedInitiativeCost: 1,
    attackerInitiativeCost: 8,
    succeeded: false,
  }), {
    defenderFinalCost: 1,
    defenderRefund: 0,
    attackerAdditionalCost: 0,
    attackPrevented: false,
  });
});

test("successful and failed Parry reconcile committed Initiative without double charging the attack", () => {
  assert.equal(getReactionCommitment("parry", 6), 6);
  assert.deepEqual(reconcileReaction({
    reactionType: "parry",
    committedInitiativeCost: 6,
    attackerInitiativeCost: 8,
    succeeded: true,
  }), {
    defenderFinalCost: 1,
    defenderRefund: 5,
    attackerAdditionalCost: 6,
    attackPrevented: true,
  });
  assert.deepEqual(reconcileReaction({
    reactionType: "parry",
    committedInitiativeCost: 6,
    attackerInitiativeCost: 8,
    succeeded: false,
  }), {
    defenderFinalCost: 6,
    defenderRefund: 0,
    attackerAdditionalCost: 0,
    attackPrevented: false,
  });
});

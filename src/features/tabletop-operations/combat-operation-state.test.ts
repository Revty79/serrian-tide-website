import assert from "node:assert/strict";
import test from "node:test";

import {
  combatOperationStateKey,
  readCombatOperationValue,
  updateCombatOperationValues,
  type CombatOperationValues,
} from "@/components/tabletop/combat-operation-state";

test("battle operation state survives command and combatant switches without crossing actor keys", () => {
  const scope = "god-battle:42";
  const creatureAttackEditor = { actorId: -7, command: "attack", targetId: 12, notes: "Keep this exact draft" };
  const npcMovementEditor = { actorId: 9, command: "move-other", distance: 20, notes: "Circle the doorway" };
  const uncertainAttempt = {
    idempotencyKey: "0123456789abcdef0123456789abcdef",
    payload: { actorId: -7, targetId: 12, sourceRef: "CREATURE-BITE" },
  };
  let values: CombatOperationValues = {};
  values = updateCombatOperationValues(
    values,
    combatOperationStateKey(scope, "declaration:-7:attack:editor"),
    creatureAttackEditor,
  );
  values = updateCombatOperationValues(
    values,
    combatOperationStateKey(scope, "declaration:-7:attack:attempt"),
    uncertainAttempt,
  );
  values = updateCombatOperationValues(
    values,
    combatOperationStateKey(scope, "declaration:9:move-other:editor"),
    npcMovementEditor,
  );

  assert.strictEqual(
    readCombatOperationValue(values, scope, "declaration:-7:attack:editor", null),
    creatureAttackEditor,
  );
  assert.strictEqual(
    readCombatOperationValue(values, scope, "declaration:-7:attack:attempt", null),
    uncertainAttempt,
  );
  assert.strictEqual(
    readCombatOperationValue(values, scope, "declaration:9:move-other:editor", null),
    npcMovementEditor,
  );
  assert.equal(readCombatOperationValue(values, scope, "declaration:9:attack:attempt", null), null);
});

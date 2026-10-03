import assert from "node:assert/strict";
import test from "node:test";
import { emptyAttackAuthoring } from "@/features/attacks/attack-authoring";
import { authoritativeCreatureSnapshot, creatureAttackRuntime } from "./creature-attack-runtime";
import { resolveCreatureAttackInitiativeCost } from "./runtime-integration";

test("structured timing beats old Bite and numeric damage heuristics; current missing timing stays missing", () => {
  const attack = { attackName: "Bite", damage: "18", attackPercentage: 57, authoring: { ...emptyAttackAuthoring(), initiativeCost: 4 } };
  assert.deepEqual(creatureAttackRuntime(attack).initiative, { cost: 4, source: "structured" });
  assert.deepEqual(creatureAttackRuntime({ ...attack, authoring: emptyAttackAuthoring() }).initiative, { cost: null, source: "missing" });
  assert.deepEqual(resolveCreatureAttackInitiativeCost({ attackName: "Bite", damage: "18", allowLegacyFallback: false, godSuppliedInitiativeCost: 3 }), { cost: 3, source: "god" });
});
test("legacy timing is labeled; descriptive text cannot assert timing, mode, target or Magical", () => {
  const result = creatureAttackRuntime({ attackName: "Bite", damage: "18", attackPercentage: "57", specialEffect: "Magic cone 90%", requiredAnatomy: "Missing claw", usesRecharge: "Once per round" });
  assert.equal(result.target, null); assert.equal(result.authoring, null);
  assert.match(result.description, /Legacy snapshot timing/); assert.match(result.description, /Magical unspecified/);
  assert.match(result.description, /not automatically enforced: Missing claw/);
});
test("exact Creature owner chooses individual current snapshot or occurrence and excludes Race/PC JSON", () => {
  const owner = { participantId: 1, participantKind: "campaign-character", isNpc: true, npcKind: "creature", occurrence: { stale: true }, persistent: '{"current":true}' };
  assert.deepEqual(authoritativeCreatureSnapshot(owner), { current: true });
  assert.deepEqual(authoritativeCreatureSnapshot({ ...owner, participantId: -1, participantKind: "creature" }), { stale: true });
  assert.equal(authoritativeCreatureSnapshot({ ...owner, npcKind: "race" }), null);
  assert.equal(authoritativeCreatureSnapshot({ ...owner, isNpc: false }), null);
});
test("invalid historical Attack percentages require ruling without coercion", () => {
  for (const attackPercentage of [undefined, null, "50", "invalid", NaN, Infinity]) assert.equal(creatureAttackRuntime({ attackName: "Claw", attackPercentage }).target, null);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateCreatureExperience, allocateEncounterExperience, creatureExperienceEvidence } from "./combat-xp";

test("incapacitation supports XP without recording death or inventing an XP value", () => {
  const local = { combatCondition: { status: "incapacitated", revision: 1, reason: "Whole-body HP reached zero." } };
  const before = structuredClone(local);
  assert.deepEqual(creatureExperienceEvidence(local), { reason: local.combatCondition.reason, conditionEvidence: local.combatCondition });
  assert.deepEqual(local, before);
  assert.equal(creatureExperienceEvidence({ combatCondition: { status: "able" } }), null);
  assert.equal(creatureExperienceEvidence({}), null);
  const defeat = { defeatValueXp: 3, credit: { characterId: 2 }, awards: [{ decisionId: 5 }] };
  assert.deepEqual(creatureExperienceEvidence({ ...local, defeat }), defeat);
});

test("Creature XP explicitly distinguishes killer-only, full-to-each and shared split", () => {
  assert.deepEqual(allocateCreatureExperience({ value: 3, mode: "killer-only", recipientCharacterIds: [2], killerCharacterId: 2 }), [{ characterId: 2, amount: 3 }]);
  assert.deepEqual(allocateCreatureExperience({ value: 3, mode: "full-to-each", recipientCharacterIds: [2, 1], killerCharacterId: null }), [{ characterId: 1, amount: 3 }, { characterId: 2, amount: 3 }]);
  assert.deepEqual(allocateCreatureExperience({ value: 3, mode: "shared-split", recipientCharacterIds: [1, 2, 3], killerCharacterId: null }).map(({ amount }) => amount), [1, 1, 1]);
});

test("shared split gives the whole remainder to the credited killer without changing total XP", () => {
  assert.deepEqual(allocateCreatureExperience({ value: 3, mode: "shared-split", recipientCharacterIds: [1, 2], killerCharacterId: 2 }), [{ characterId: 1, amount: 1 }, { characterId: 2, amount: 2 }]);
  assert.throws(() => allocateCreatureExperience({ value: 3, mode: "shared-split", recipientCharacterIds: [1, 2], killerCharacterId: null }), /credited killer/);
  assert.throws(() => allocateCreatureExperience({ value: 3, mode: "shared-split", recipientCharacterIds: [1, 2], killerCharacterId: 3 }), /selected eligible/);
});

test("additional encounter XP is full per recipient and adds to either Creature distribution", () => {
  const extra = allocateEncounterExperience(10, [1, 2, 3]);
  for (const [mode, expected] of [["shared-split", 11], ["full-to-each", 13]] as const) {
    const creature = allocateCreatureExperience({ value: 3, mode, recipientCharacterIds: [1, 2, 3], killerCharacterId: null });
    assert.deepEqual(creature.map((award, index) => award.amount + extra[index].amount), [expected, expected, expected]);
  }
  assert.throws(() => allocateEncounterExperience(1.5, [1]), /whole/);
  assert.throws(() => allocateEncounterExperience(10, [1, 1]), /exactly once/);
});

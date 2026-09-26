import assert from "node:assert/strict";
import test from "node:test";
import { emptyRaceFormMechanics, normalizeRaceFormMechanics, type RaceFormMechanics } from "./race-form-mechanics";
import { createHumanoidRaceAnatomy } from "./race-anatomy";
import { emptyRaceNaturalAttack } from "./race-natural-attacks";

const race = { anatomy: null, naturalAttacks: [], naturalProtections: [] };
test("default Form mechanics use Race definitions and make no Attribute adjustments", () => {
  const defaults = emptyRaceFormMechanics();
  assert.deepEqual(normalizeRaceFormMechanics(defaults, race), defaults);
  assert.deepEqual(defaults.attributeAdjustments, { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHR: 0 });
});
test("positive, negative and zero adjustments retain existing Attribute identities without caps or runtime calculation", () => {
  const value = { ...emptyRaceFormMechanics(), attributeAdjustments: { STR: 5, DEX: 10, CON: 5, INT: 0, WIS: 5, CHR: -5 } };
  assert.deepEqual(normalizeRaceFormMechanics(value, race).attributeAdjustments, value.attributeAdjustments);
  for (const adjustment of [NaN, Infinity, "5", null]) {
    assert.throws(() => normalizeRaceFormMechanics({ ...value, attributeAdjustments: { ...value.attributeAdjustments, STR: adjustment } } as RaceFormMechanics, race), /finite number/);
  }
  assert.throws(() => normalizeRaceFormMechanics({ ...value, attributeAdjustments: { ...value.attributeAdjustments, LUCK: 5 } } as RaceFormMechanics, race), /six existing/);
});
test("empty replacement collections remain distinct from Use Race and invalid modes reject", () => {
  const mechanics = { ...emptyRaceFormMechanics(), movementMode: "override", protectionMode: "override", attacksMode: "override", interactionMode: "replace" } as RaceFormMechanics;
  assert.deepEqual(normalizeRaceFormMechanics(mechanics, race), mechanics);
  assert.throws(() => normalizeRaceFormMechanics({ ...mechanics, movementMode: "merge" } as unknown as RaceFormMechanics, race), /source/);
  assert.throws(() => normalizeRaceFormMechanics({ ...mechanics, size: "Titanic" } as unknown as RaceFormMechanics, race), /Size/);
});
test("protection and attacks validate against Form Anatomy or the underlying Race as authored", () => {
  const anatomy = createHumanoidRaceAnatomy();
  anatomy.hpPools.push({ canonicalId: "tail", poolName: "Tail", hpPercentage: 5, notes: "", sortOrder: 9 });
  anatomy.hitLocations[0].hpPoolCanonicalId = "tail";
  const mechanics = emptyRaceFormMechanics();
  mechanics.attacksMode = "override";
  mechanics.attacks = [{ ...emptyRaceNaturalAttack("tail-strike"), attackName: "Tail Strike", anatomy: { hpPoolIds: ["tail"], hitLocationNumbers: [0], notes: "" } }];
  assert.throws(() => normalizeRaceFormMechanics(mechanics, race), /HP Pools/);
  assert.doesNotThrow(() => normalizeRaceFormMechanics(mechanics, { ...race, anatomy }));
  mechanics.anatomyMode = "override"; mechanics.anatomy = anatomy;
  mechanics.protectionMode = "override";
  mechanics.protections = [{ key: "hide", name: "Tail Hide", naturalSoak: 2, sortOrder: 0, coverage: { kind: "locations", locationKeys: ["0"] } }];
  assert.doesNotThrow(() => normalizeRaceFormMechanics(mechanics, race));
  const incomplete = structuredClone(mechanics);
  incomplete.anatomy!.hitLocations = incomplete.anatomy!.hitLocations.filter(row => row.hitLocationNumber !== 0);
  incomplete.attacks = [];
  assert.throws(() => normalizeRaceFormMechanics(incomplete, race), /Choose a hit location/);
});
test("overridden body cannot silently retain incompatible inherited Race attacks or protection", () => {
  const mechanics = emptyRaceFormMechanics(); mechanics.anatomyMode = "override";
  mechanics.anatomy = { schemaVersion: 1, hpPools: [], hitLocations: [] };
  const attack = { ...emptyRaceNaturalAttack("bite"), attackName: "Bite", anatomy: { hpPoolIds: [], hitLocationNumbers: [0], notes: "" } };
  assert.throws(() => normalizeRaceFormMechanics(mechanics, { ...race, naturalAttacks: [attack] }), /Hit Locations/);
  mechanics.attacksMode = "override";
  assert.doesNotThrow(() => normalizeRaceFormMechanics(mechanics, { ...race, naturalAttacks: [attack] }));
  assert.throws(() => normalizeRaceFormMechanics(mechanics, { ...race, naturalProtections: [{ key: "hide", name: "Hide", naturalSoak: 1, sortOrder: 0, coverage: { kind: "locations", locationKeys: ["0"] } }] }), /Choose a hit location/);
});
test("capabilities, restrictions, shared Interaction Rules and collection identities validate", () => {
  for (const patch of [
    { manipulation: { state: "telekinesis", notes: "" } }, { speech: { state: "anything", notes: "" } },
    { equipment: { state: "destroyed", notes: "" } }, { restrictions: [{ key: "one", name: "", notes: "" }] },
    { skillsMode: "replace" }, { interactionRules: { schemaVersion: 1, rules: [] } },
    { movement: [{ key: "land", movementMode: "Land", baseValue: 3, notes: "", sortOrder: 0 }] },
  ]) assert.throws(() => normalizeRaceFormMechanics({ ...emptyRaceFormMechanics(), ...patch } as RaceFormMechanics, race));
});

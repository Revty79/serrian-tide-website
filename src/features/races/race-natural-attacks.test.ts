import assert from "node:assert/strict";
import test from "node:test";
import { emptyRaceNaturalAttack, normalizeRaceNaturalAttacks, type RaceNaturalAttack } from "./race-natural-attacks";
import { createHumanoidRaceAnatomy } from "./race-anatomy";
import { normalizeCreatureAttackAuthoring } from "@/features/creatures/creature-authoring";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";

const attack = (): RaceNaturalAttack => ({ ...emptyRaceNaturalAttack("bite"), attackName: "Bite", damage: "4", damageType: "Piercing" });
test("empty Race remains valid; attack identity, description, ordering and unresolved basis normalize independently", () => {
  assert.deepEqual(normalizeRaceNaturalAttacks([], null), []);
  const rows = normalizeRaceNaturalAttacks([{ ...attack(), attackName: " Bite ", sortOrder: 9 }, { ...attack(), key: "claws", attackName: "Claws", sortOrder: 2 }], null);
  assert.deepEqual(rows.map(row => [row.key, row.attackName, row.sortOrder]), [["bite", "Bite", 0], ["claws", "Claws", 1]]);
  assert.equal(rows[0].skillId, null);
  assert.equal("attackPercentage" in rows[0], false);
});
for (const mode of ["melee", "ranged", "hybrid", "aoe"] as const) test(`${mode} Race mechanics use the unchanged Creature normalization contract`, () => {
  const row = attack();
  row.authoring = { ...row.authoring, mode, initiativeCost: 0.5, range: { unit: " Feet ", reach: mode === "melee" || mode === "hybrid" ? 2 : null, short: mode === "melee" ? null : 10, medium: mode === "melee" ? null : 20, long: mode === "melee" ? null : 40 } };
  const normalized = normalizeRaceNaturalAttacks([row], null)[0];
  assert.deepEqual(normalized.authoring, normalizeCreatureAttackAuthoring(row.authoring));
  assert.equal(normalized.authoring.range.unit, "feet");
});
test("Skill/basis and anatomical identities survive normalization and pool renames", () => {
  const body = createHumanoidRaceAnatomy();
  body.hpPools.push({ canonicalId: "tail", poolName: "Tail", hpPercentage: 20, notes: "", sortOrder: body.hpPools.length });
  body.hitLocations[0] = { ...body.hitLocations[0], locationName: "Tail", hpPoolCanonicalId: "tail" };
  const row = { ...attack(), skillId: 42, skillName: "Unarmed", basisNotes: " Character Skill basis ", anatomy: { hpPoolIds: ["tail"], hitLocationNumbers: [0], notes: " A functional tail " } };
  const normalized = normalizeRaceNaturalAttacks([row], body)[0];
  assert.equal(normalized.skillId, 42); assert.equal(normalized.basisNotes, "Character Skill basis");
  assert.deepEqual(normalized.anatomy, { hpPoolIds: ["tail"], hitLocationNumbers: [0], notes: "A functional tail" });
  body.hpPools.at(-1)!.poolName = "Renamed tail";
  assert.deepEqual(normalizeRaceNaturalAttacks([row], body)[0], normalized);
  assert.throws(() => normalizeRaceNaturalAttacks([row], null), /HP Pools/);
});
test("Yes, No and Unspecified remain explicit; on-hit effects and constructions use the common languages", () => {
  for (const magical of [true, false, null]) {
    const row = attack(); row.authoring.magical = magical;
    row.authoring.onHitEffects = [{ effectKey: "venom", schemaVersion: 2, sortOrder: 5, effect: { kind: "condition.apply", name: "Venom", description: "Authored condition", duration: { kind: "scene" } } }];
    const saved = normalizeRaceNaturalAttacks([row], null)[0];
    assert.equal(saved.authoring.magical, magical); assert.equal(saved.authoring.onHitEffects[0].sortOrder, 0);
  }
  const row = attack(); row.authoring.magic = { document: createEmptySpell() };
  assert.deepEqual(normalizeRaceNaturalAttacks([row], null)[0].authoring.magic, normalizeCreatureAttackAuthoring(row.authoring)?.magic);
  row.authoring.magical = false;
  assert.throws(() => normalizeRaceNaturalAttacks([row], null), /nonmagical/);
});
test("invalid identity, Skill, anatomy and mechanics are rejected without silently dropping references", () => {
  for (const patch of [{ attackName: " " }, { key: "" }, { skillId: 0 }, { skillId: -1 }, { skillId: 1.5 }, { damage: 4 }]) {
    assert.throws(() => normalizeRaceNaturalAttacks([{ ...attack(), ...patch } as RaceNaturalAttack], null));
  }
  assert.throws(() => normalizeRaceNaturalAttacks([attack(), attack()], null), /unique/);
  for (const anatomy of [{ hpPoolIds: ["missing"], hitLocationNumbers: [], notes: "" }, { hpPoolIds: [], hitLocationNumbers: [99], notes: "" }, { hpPoolIds: [], hitLocationNumbers: [0, 0], notes: "" }]) {
    assert.throws(() => normalizeRaceNaturalAttacks([{ ...attack(), anatomy }], null));
  }
  for (const initiativeCost of [0, -1, NaN, Infinity]) {
    const row = attack(); row.authoring.initiativeCost = initiativeCost;
    assert.throws(() => normalizeRaceNaturalAttacks([row], null), /Initiative/);
  }
  const row = attack(); row.authoring.range = { unit: null, reach: 2, short: null, medium: null, long: null };
  assert.throws(() => normalizeRaceNaturalAttacks([row], null), /unit/);
  row.authoring.range = { unit: "feet", reach: null, short: 40, medium: 20, long: 30 };
  assert.throws(() => normalizeRaceNaturalAttacks([row], null), /Range/);
});

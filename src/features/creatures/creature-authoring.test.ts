import assert from "node:assert/strict";
import test from "node:test";
import {
  creatureSourceIsMagical, emptyCreatureAbilityAuthoring, emptyCreatureAttackAuthoring,
  normalizeCreatureAbilityAuthoring, normalizeCreatureAttackAuthoring,
} from "./creature-authoring";
import { copyCreatureAbility, normalizeCreatureAbilityDefinition, normalizeCreatureSnapshotAbilities } from "./creature-ability";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";

const legacyAbility = { canonicalId: "ABILITY-OLD", abilityName: "Legacy", abilityType: "Unknown origin", activation: "After a bite", requirements: "A living target", usesRecharge: "When the G.O.D. rules", description: "Description", mechanicalEffect: "Retain this instruction", notes: "Notes", crImpact: "None", sortOrder: 0, effects: [] };

test("missing authoring stays absent in old snapshots and legacy text is preserved", () => {
  assert.equal(normalizeCreatureAttackAuthoring(undefined), null);
  assert.equal(normalizeCreatureAbilityAuthoring(null), null);
  assert.deepEqual(normalizeCreatureAbilityDefinition(legacyAbility), legacyAbility);
  assert.deepEqual(normalizeCreatureSnapshotAbilities({ abilities: [legacyAbility], uses: [{ useName: "Hide", notes: "Harvest" }] }), { abilities: [legacyAbility], uses: [{ useName: "Hide", notes: "Harvest" }] });
});

for (const mode of ["melee", "ranged", "hybrid", "aoe"] as const) test(`${mode} is explicit and survives authoring without a required target distance`, () => {
  const profile = { ...emptyCreatureAttackAuthoring(), mode, initiativeCost: 4 };
  assert.deepEqual(normalizeCreatureAttackAuthoring(profile), profile);
  assert.equal(normalizeCreatureAttackAuthoring({ ...profile, initiativeCost: 0 })?.initiativeCost, 0);
  assert.throws(() => normalizeCreatureAttackAuthoring({ ...profile, initiativeCost: -1 }), /Initiative/);
});

test("structured range reuses weapon units, positivity, and ordered bands", () => {
  const profile = { ...emptyCreatureAttackAuthoring(), mode: "hybrid", range: { unit: " Feet ", reach: 2, short: 10, medium: 20, long: 30 } };
  assert.equal(normalizeCreatureAttackAuthoring(profile)?.range.unit, "feet");
  for (const change of [{ unit: null }, { reach: -1 }, { short: 25 }, { medium: 40 }, { reach: 0 }, { short: 40, medium: null }]) {
    assert.throws(() => normalizeCreatureAttackAuthoring({ ...profile, range: { ...profile.range, ...change } }));
  }
  assert.throws(() => normalizeCreatureAttackAuthoring({ ...profile, mode: "bite" }), /Mode/);
  assert.throws(() => normalizeCreatureAttackAuthoring({ ...profile, schemaVersion: 2 }), /schema/);
});

test("magic is explicit or construction-backed, never inferred from names or Origin", () => {
  assert.equal(creatureSourceIsMagical(undefined), false);
  assert.equal(creatureSourceIsMagical(emptyCreatureAttackAuthoring()), false);
  for (const magical of [null, false, true]) assert.equal(normalizeCreatureAttackAuthoring({ ...emptyCreatureAttackAuthoring(), magical })?.magical, magical);
  const profile = { ...emptyCreatureAttackAuthoring(), magic: { document: createEmptySpell() } };
  const saved = normalizeCreatureAttackAuthoring(profile);
  assert.ok(saved?.magic);
  assert.equal(creatureSourceIsMagical(saved), true);
  assert.throws(() => normalizeCreatureAttackAuthoring({ ...profile, magical: false }), /nonmagical/);
  assert.throws(() => normalizeCreatureAttackAuthoring({ ...profile, magical: "yes" }), /qualifier/);
});

test("On-Hit Effects preserve explicit order and manual instructions with stable unique keys", () => {
  const effects = [
    { effectKey: "poison", schemaVersion: 2, effect: { kind: "condition.apply", name: "Poison", description: "Ruling follows", duration: { kind: "scene", value: null } }, sortOrder: 10 },
    { effectKey: "manual", schemaVersion: 2, effect: { kind: "manual", title: "Venom", description: "G.O.D. resolves unsupported physiology" }, sortOrder: 2 },
  ];
  const profile = { ...emptyCreatureAttackAuthoring(), onHitEffects: effects };
  const saved = normalizeCreatureAttackAuthoring(profile)!;
  assert.deepEqual(saved.onHitEffects.map((effect) => [effect.effectKey, effect.sortOrder]), [["poison", 0], ["manual", 1]]);
  assert.deepEqual(saved.onHitEffects[1].effect, effects[1].effect);
  assert.deepEqual(normalizeCreatureAttackAuthoring({ ...profile, onHitEffects: [...effects].reverse() })?.onHitEffects.map((effect) => effect.effectKey), ["manual", "poison"]);
  assert.throws(() => normalizeCreatureAttackAuthoring({ ...profile, onHitEffects: [effects[0], { ...effects[1], effectKey: "POISON" }] }), /duplicated/);
});

for (const activationType of ["activated", "triggered", "reaction"] as const) test(`${activationType} reuses Derived Ability conditions, costs, and recharge`, () => {
  const profile = { ...emptyCreatureAbilityAuthoring(), activationType, initiativeCost: 3, resolutionMode: "fixed-roll", fixedRollTarget: 65,
    costs: [{ costType: "mana", amount: 2, resourceKey: null, notes: "Authored", sortOrder: 0 }],
    useConditions: [{ conditionType: "event", conditionKey: "manual-event-key", operator: null, numericValue: null, textValue: null, notes: "Existing event vocabulary", sortOrder: 0 }],
    useLimits: [{ maximumUses: 2, refreshScope: "scene", refreshKey: null, notes: "", sortOrder: 0 }],
  };
  assert.deepEqual(normalizeCreatureAbilityAuthoring(profile), profile);
  assert.throws(() => normalizeCreatureAbilityAuthoring({ ...profile, initiativeCost: -2 }), /Initiative/);
  assert.throws(() => normalizeCreatureAbilityAuthoring({ ...profile, fixedRollTarget: null }), /requires/);
  assert.throws(() => normalizeCreatureAbilityAuthoring({ ...profile, fixedRollTarget: 101 }), /100/);
  assert.throws(() => normalizeCreatureAbilityAuthoring({ ...profile, costs: [{ ...profile.costs[0], amount: 0 }] }), /greater than zero/);
  assert.throws(() => normalizeCreatureAbilityAuthoring({ ...profile, useConditions: [{ ...profile.useConditions[0], conditionKey: null }] }), /condition key/);
  assert.throws(() => normalizeCreatureAbilityAuthoring({ ...profile, useLimits: [{ ...profile.useLimits[0], maximumUses: 0 }] }), /positive whole number/);
});

test("Passive traits cannot carry activation costs or rolls", () => {
  const profile = { ...emptyCreatureAbilityAuthoring(), activationType: "passive" };
  assert.equal(normalizeCreatureAbilityAuthoring(profile)?.activationType, "passive");
  for (const update of [{ initiativeCost: 1 }, { initiativeCost: 0 }, { resolutionMode: "fixed-roll", fixedRollTarget: 50 }, { costs: [{ costType: "mana", amount: 1, resourceKey: null, notes: "", sortOrder: 0 }] }]) assert.throws(() => normalizeCreatureAbilityAuthoring({ ...profile, ...update }), /Passive/);
});

test("ability copying isolates constructions and conditions from the master template", () => {
  const ability = { ...legacyAbility, authoring: { ...emptyCreatureAbilityAuthoring(), magic: { document: createEmptySpell() }, useConditions: [{ conditionType: "manual" as const, conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "original", sortOrder: 0 }] } };
  const copy = copyCreatureAbility(ability);
  copy.authoring!.magic!.document.name = "Individual";
  copy.authoring!.useConditions[0].notes = "Individual";
  assert.notEqual(ability.authoring.magic.document.name, "Individual");
  assert.equal(ability.authoring.useConditions[0].notes, "original");
});

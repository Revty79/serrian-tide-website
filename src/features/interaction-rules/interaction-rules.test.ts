import assert from "node:assert/strict";
import test from "node:test";
import { INTERACTION_RULE_TYPES, normalizeInteractionRuleProfile as normalize, type InteractionCondition, type InteractionRule, type InteractionRuleProfile } from "./interaction-rules";

const fire: InteractionCondition = { key: "fire", kind: "damage-type", damageType: "Fire" };
const silver: InteractionCondition = { key: "silver", kind: "item-property", propertyName: "Material", value: "Silver" };
const magical: InteractionCondition = { key: "magic", kind: "magical", magical: true };
function rule(overrides: Partial<InteractionRule> = {}): InteractionRule {
  return { key: "stable-rule", name: "Fire Immunity", ruleType: "immunity", scope: "damage", match: "ANY", conditions: [fire], percentage: null, notes: "Authored only", sortOrder: 0, ...overrides };
}
function profile(...rules: InteractionRule[]): InteractionRuleProfile { return { schemaVersion: 1, rules }; }

for (const ruleType of INTERACTION_RULE_TYPES) test(`${ruleType} uses the same Race and Creature contract`, () => {
  const percentage = ["requirement", "immunity"].includes(ruleType) ? null : 50;
  const race = profile(rule({ ruleType, percentage }));
  assert.deepEqual(normalize(race, "race"), race);
  const creature = profile({ ...race.rules[0], crImpact: "Major" });
  assert.deepEqual(normalize(creature, "creature"), creature);
  assert.throws(() => normalize(creature, "race"), /CR Impact/);
  assert.throws(() => normalize(race, "creature"), /CR Impact/);
});

test("Silver, Magical, ANY alternatives and ALL requirements remain explicit", () => {
  for (const conditions of [[silver], [magical], [silver, magical], [magical, fire]]) {
    for (const match of ["ANY", "ALL"] as const) {
      const input = profile(rule({ name: "Requirement", ruleType: "requirement", match, conditions }));
      assert.deepEqual(normalize(input, "race"), input);
    }
  }
});
test("all initial condition types preserve authored facts, including property relationships", () => {
  const conditions: InteractionCondition[] = [fire, silver, magical,
    { key: "no-magic", kind: "magical", magical: false },
    { key: "source", kind: "source-kind", sourceKind: "weapon", weaponFamily: "firearm" },
    { key: "spell", kind: "source-kind", sourceKind: "spell" },
    { key: "tag", kind: "item-tag", tagCanonicalId: "TAG-FIRE" },
    { key: "effect", kind: "mechanical-effect-kind", effectKind: "condition.apply" },
    { key: "poison", kind: "condition-name", conditionName: "Poison" },
    { key: "cold-iron", kind: "item-property", propertyName: "Material", value: "Cold Iron", relatedCreatureCanonicalId: null },
    { key: "holy", kind: "item-property", propertyName: "Blessing", value: "Holy", relatedCreatureCanonicalId: "CR-SPECTRE" },
    { key: "any-material", kind: "item-property", propertyName: "Material", value: null },
  ];
  const input = profile(rule({ conditions }));
  assert.deepEqual(normalize(input, "race"), input);
  assert.deepEqual(normalize(profile(rule({ scope: "condition", conditions: [conditions[8]] })), "race")?.rules[0].conditions, [conditions[8]]);
  assert.equal(normalize(profile(rule({ scope: "mechanical-effect", conditions: [conditions[7]] })), "race")?.rules[0].scope, "mechanical-effect");
});
for (const ruleType of ["resistance", "vulnerability", "absorption"] as const) test(`${ruleType} requires a finite positive percentage, preserves exact values and has no cap`, () => {
  for (const percentage of [0.0001, 25, 50, 100, 150, 1000.123456789]) {
    assert.equal(normalize(profile(rule({ ruleType, percentage })), "race")?.rules[0].percentage, percentage);
  }
  for (const percentage of [null, 0, -1, Infinity, -Infinity, NaN, "25", undefined]) {
    assert.throws(() => normalize(profile(rule({ ruleType, percentage: percentage as number })), "race"), /greater than zero/);
  }
  for (const scope of ["condition", "mechanical-effect"] as const) assert.throws(() => normalize(profile(rule({ ruleType, percentage: 25, scope })), "race"), /Damage only/);
});
test("Requirement and Immunity reject all authored percentages", () => {
  for (const ruleType of ["requirement", "immunity"] as const) {
    for (const percentage of [0, -1, 25, NaN, Infinity]) assert.throws(() => normalize(profile(rule({ ruleType, percentage })), "race"), /do not use/);
  }
});
test("null and omitted profiles stay unauthored, while empty authored profiles are valid", () => {
  assert.equal(normalize(null, "creature"), null);
  assert.equal(normalize(undefined, "race"), null);
  assert.deepEqual(normalize(profile(), "race"), profile());
});
test("keys, ordering and nested copy isolation survive repeated normalization", () => {
  const input = profile(rule({ key: "second", sortOrder: 10 }), rule({ key: "first", sortOrder: 2, conditions: [silver] }));
  const output = normalize(input, "race")!;
  assert.deepEqual(output.rules.map(({ key, sortOrder }) => ({ key, sortOrder })), [{ key: "first", sortOrder: 2 }, { key: "second", sortOrder: 10 }]);
  assert.deepEqual(normalize(output, "race"), output);
  output.rules[0].conditions[0].key = "changed-copy";
  assert.equal(input.rules[1].conditions[0].key, "silver");
  assert.throws(() => normalize(profile(rule(), rule({ sortOrder: 1 })), "race"), /keys must be unique/);
  assert.throws(() => normalize(profile(rule(), rule({ key: "different" })), "race"), /sort orders must be unique/);
  assert.throws(() => normalize(profile(rule({ conditions: [fire, fire] })), "race"), /Condition keys must be unique/);
});
test("malformed profiles, missing conditions and malformed condition facts fail", () => {
  for (const input of [[], {}, true, "{}", { schemaVersion: 2, rules: [] }, { schemaVersion: "1", rules: [] }, { schemaVersion: 1, rules: {} }]) assert.throws(() => normalize(input, "race"));
  for (const overrides of [{ key: "" }, { name: "" }, { ruleType: "unknown" }, { scope: "all" }, { match: "sometimes" }, { conditions: [] }, { conditions: null }, { sortOrder: -1 }, { sortOrder: 0.5 }, { notes: 5 }]) assert.throws(() => normalize(profile(rule(overrides as Partial<InteractionRule>)), "race"));
  for (const condition of [null, {}, { ...fire, damageType: "" }, { ...magical, magical: "true" }, { ...silver, propertyName: "" }, { key: "tag", kind: "item-tag", tagCanonicalId: "" }, { key: "x", kind: "nested", conditions: [fire] }, { key: "x", kind: "source-kind", sourceKind: "firearm" }, { key: "x", kind: "source-kind", sourceKind: "spell", weaponFamily: "firearm" }, { key: "x", kind: "mechanical-effect-kind", effectKind: "poison" }, { key: "x", kind: "condition-name", conditionName: "" }]) assert.throws(() => normalize(profile(rule({ conditions: [condition as InteractionCondition] })), "race"));
});

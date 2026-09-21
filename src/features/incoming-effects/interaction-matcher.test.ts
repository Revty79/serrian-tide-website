import assert from "node:assert/strict";
import test from "node:test";
import type { InteractionCondition, InteractionRule } from "@/features/interaction-rules/interaction-rules";
import { INTERACTION_EFFECT_LABELS, INTERACTION_SOURCE_KINDS } from "@/features/interaction-rules/interaction-rules";
import { matchInteractionCondition, matchInteractionRule } from "./interaction-matcher";
import type { IncomingSourceFacts } from "./models";

const facts: IncomingSourceFacts = { damageType: " Fire ", magical: true, sourceKind: "weapon", weaponFamily: "firearm",
  itemProperties: [{ name: " Material ", value: " SILVER ", relatedCreatureCanonicalId: "CREATURE-1" }, { name: "Holy", value: null }],
  itemTags: ["TAG-1"], mechanicalEffectKind: "condition.apply", conditionName: " Burning " };
type WithoutKey<T> = T extends unknown ? Omit<T, "key"> : never;
const cases: Array<[string, WithoutKey<InteractionCondition>, boolean]> = [
  ["Damage Type normalized", { kind: "damage-type", damageType: "fire" }, true],
  ["Damage Type mismatch", { kind: "damage-type", damageType: "ice" }, false],
  ["Magical true", { kind: "magical", magical: true }, true],
  ["Magical false", { kind: "magical", magical: false }, false],
  ["Source Kind", { kind: "source-kind", sourceKind: "weapon" }, true],
  ["Source Kind mismatch", { kind: "source-kind", sourceKind: "spell" }, false],
  ["Firearm family", { kind: "source-kind", sourceKind: "weapon", weaponFamily: "firearm" }, true],
  ["Property name any value", { kind: "item-property", propertyName: "material", value: null }, true],
  ["Property name and value", { kind: "item-property", propertyName: "material", value: "silver" }, true],
  ["Property value mismatch", { kind: "item-property", propertyName: "material", value: "steel" }, false],
  ["Related Creature exact", { kind: "item-property", propertyName: "material", value: null, relatedCreatureCanonicalId: "CREATURE-1" }, true],
  ["Related Creature different", { kind: "item-property", propertyName: "material", value: null, relatedCreatureCanonicalId: "CREATURE-2" }, false],
  ["Related Creature case preserved", { kind: "item-property", propertyName: "material", value: null, relatedCreatureCanonicalId: "creature-1" }, false],
  ["Related Creature whitespace preserved", { kind: "item-property", propertyName: "material", value: null, relatedCreatureCanonicalId: " CREATURE-1" }, false],
  ["Tag exact", { kind: "item-tag", tagCanonicalId: "TAG-1" }, true],
  ["Tag case preserved", { kind: "item-tag", tagCanonicalId: "tag-1" }, false],
  ["Tag whitespace preserved", { kind: "item-tag", tagCanonicalId: "TAG-1 " }, false],
  ["Mechanical Effect Kind", { kind: "mechanical-effect-kind", effectKind: "condition.apply" }, true],
  ["Mechanical Effect Kind mismatch", { kind: "mechanical-effect-kind", effectKind: "health.damage" }, false],
  ["Condition Name normalized", { kind: "condition-name", conditionName: "burning" }, true],
  ["Condition Name mismatch", { kind: "condition-name", conditionName: "frozen" }, false],
];
for (const [label, condition, expected] of cases) test(label, () => {
  const before = structuredClone(facts);
  assert.equal(matchInteractionCondition({ ...condition, key: "c" } as InteractionCondition, facts).outcome, expected ? "match" : "no-match");
  assert.deepEqual(facts, before);
});
test("known mundane and known non-firearm facts differ from missing facts", () => {
  assert.equal(matchInteractionCondition({ key: "m", kind: "magical", magical: false }, { ...facts, magical: false }).outcome, "match");
  assert.equal(matchInteractionCondition({ key: "m", kind: "magical", magical: false }, { ...facts, magical: null }).outcome, "unknown");
  const firearm: InteractionCondition = { key: "f", kind: "source-kind", sourceKind: "weapon", weaponFamily: "firearm" };
  assert.equal(matchInteractionCondition(firearm, { ...facts, weaponFamily: "none" }).outcome, "no-match");
  assert.equal(matchInteractionCondition(firearm, { ...facts, weaponFamily: null }).outcome, "unknown");
});
test("unknown collections differ from known empty collections and null property values", () => {
  const condition: InteractionCondition = { key: "p", kind: "item-property", propertyName: "holy", value: null };
  assert.equal(matchInteractionCondition(condition, facts).outcome, "match");
  assert.equal(matchInteractionCondition({ ...condition, value: "yes" }, facts).outcome, "no-match");
  assert.equal(matchInteractionCondition(condition, { ...facts, itemProperties: [] }).outcome, "no-match");
  assert.equal(matchInteractionCondition(condition, { ...facts, itemProperties: null }).outcome, "unknown");
  assert.equal(matchInteractionCondition({ key: "t", kind: "item-tag", tagCanonicalId: "TAG-1" }, { ...facts, itemTags: null }).outcome, "unknown");
});
for (const match of ["ANY", "ALL"] as const) test(`${match} uses three-valued matching without losing decisive facts`, () => {
  const rule: InteractionRule = { key: "r", name: "Gate", ruleType: "requirement", scope: "damage", match, percentage: null, notes: "", sortOrder: 0,
    conditions: [{ key: "fire", kind: "damage-type", damageType: "Fire" }, { key: "magic", kind: "magical", magical: true }] };
  assert.equal(matchInteractionRule(rule, facts).outcome, "match");
  assert.equal(matchInteractionRule(rule, { ...facts, magical: false }).outcome, match === "ANY" ? "match" : "no-match");
  assert.equal(matchInteractionRule(rule, { ...facts, magical: null }).outcome, match === "ANY" ? "match" : "unknown");
  assert.equal(matchInteractionRule(rule, { ...facts, damageType: "Ice", magical: null }).outcome, match === "ANY" ? "unknown" : "no-match");
  assert.equal(matchInteractionRule(rule, { ...facts, damageType: "Ice", magical: false }).outcome, "no-match");
});
test("all supported source and mechanical effect kinds use the same matcher", () => {
  for (const sourceKind of INTERACTION_SOURCE_KINDS) assert.equal(matchInteractionCondition({ key: "s", kind: "source-kind", sourceKind }, { ...facts, sourceKind }).outcome, "match");
  for (const effectKind of Object.keys(INTERACTION_EFFECT_LABELS) as IncomingSourceFacts["mechanicalEffectKind"][]) assert.equal(matchInteractionCondition({ key: "e", kind: "mechanical-effect-kind", effectKind }, { ...facts, mechanicalEffectKind: effectKind }).outcome, "match");
});

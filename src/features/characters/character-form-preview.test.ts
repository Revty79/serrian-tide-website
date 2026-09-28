import assert from "node:assert/strict";
import test from "node:test";
import { availableCharacterForms, resolveCharacterFormPreview as resolve } from "./character-form-preview";
import { transformationFixture } from "../../../scripts/race-form-transformation-fixture";
import { getAttributePointsUsed, getSkillPointsUsed, getCharacterHp, getCharacterMovementBaseValue, getMovementInitiative } from "./character-rules";

import { characterFormFixture as fixture } from "../../../scripts/character-form-preview-fixture";

test("Normal, missing forms, stale Race and foreign form IDs produce no preview", () => {
  const { draft, race, catalog } = fixture();
  assert.equal(resolve(draft, race, null, catalog), null); assert.equal(resolve(draft, race, 99, catalog), null);
  assert.equal(resolve(draft, { ...race, formPreview: undefined }, 1, catalog), null);
  assert.equal(resolve({ ...draft, profile: { ...draft.profile, raceId: 8 } }, race, 1, catalog), null);
  race.formPreview!.forms[0].raceId = 8;
  assert.equal(resolve(draft, race, 1, catalog), null);
});
test("all exact Race forms remain available without a list cap", () => {
  const { draft, race } = fixture(); const template = race.formPreview!.forms[0];
  race.formPreview!.forms = Array.from({ length: 250 }, (_, i) => ({ ...template, id: i + 1, key: `form-${i}` }));
  assert.equal(availableCharacterForms(draft, race).length, 250);
});
test("signed preview Attributes drive existing modifiers, targets, HP and Initiative without cap clamping", () => {
  const { draft, race, catalog } = fixture(), result = resolve(draft, race, 1, catalog)!;
  assert.deepEqual(result.attributes.map(row => row.value), [40, 45, 40, 35, 40, 30]);
  assert.deepEqual(result.attributes[0], { key: "STR", stored: 35, adjustment: 5, value: 40, modifier: 3, rollTarget: 60 });
  assert.equal(result.attributes[5].adjustment, -5); assert.equal(result.baseInitiative, 10);
  assert.equal(result.hp, getCharacterHp(40, 1)); assert.equal(result.size, "Large");
  assert.equal(result.movement[0].baseValue, getCharacterMovementBaseValue(4, 2));
  assert.equal(result.movement[0].initiative, getMovementInitiative(45, result.movement[0].baseValue));
});
test("effective body, collection overrides, Skills, capabilities and transformation are displayed", () => {
  const { draft, race, catalog } = fixture(), result = resolve(draft, race, 1, catalog)!;
  assert.equal(result.anatomyChanged, true); assert.equal(result.anatomy.hitLocations[0].name, "Tail");
  assert.equal(result.anatomy.pools.find(pool => pool.key === "wolf-tail")!.maximumHp, Math.ceil(result.hp / 10));
  assert.equal(result.attacks[0].attackName, "Bite"); assert.equal(result.protections[0].naturalSoak, 2);
  assert.equal(result.skills[0].points, 12); assert.equal(result.skills[0].rank, 16); assert.equal(result.skills[0].target, 39);
  assert.equal(result.skills[1].rank, 19); assert.equal(result.skills[1].target, 36);
  assert.equal(result.skillAdditions[1].definition, "Definition 2"); assert.equal(result.manipulation.state, "none"); assert.equal(result.speech.state, "limited"); assert.equal(result.equipment.state, "unusable"); assert.equal(result.restrictions[0].name, "Cannot use fine tools");
  assert.deepEqual(result.transformation, transformationFixture());
});
test("unlearned Tier 1 predisposition is display-only and learned Skills remain", () => {
  const { draft, race, catalog } = fixture(); race.formPreview!.forms[0].mechanics!.skillLinks.push({ skillId: 4, skillName: "Added Skill", skillClassification: "standard", linkType: "Skill", value: 6, sortOrder: 2 });
  const result = resolve(draft, race, 1, catalog)!;
  assert.equal(result.skills.length, 3); assert.equal(result.skills[2].rank, 10); assert.equal(draft.skillAllocations.length, 2);
});
test("zero-minimum Race abilities remain visible across Forms without allocations or duplicate grants", () => {
  const { draft, race, catalog } = fixture();
  race.skillLinks.push({ skillId: 2, skillName: "Skill 2", skillClassification: "Special Ability", linkType: "Granted", value: 0 });
  const before = structuredClone({ draft, race, catalog });
  for (const id of [1, 2, 1]) {
    const preview = resolve(draft, race, id, catalog)!;
    assert.deepEqual(preview.grantedAbilities, [{ skillId: 2, name: "Skill 2", definition: "Definition 2", fromRace: true }]);
    preview.grantedAbilities[0].definition = "Edited display";
  }
  assert.equal(resolve(draft, race, null, catalog), null);
  assert.deepEqual({ draft, race, catalog }, before);
});
test("Attribute reference display uses existing catalog rows and never extrapolates missing physical/canon data", () => {
  const { draft, race, catalog } = fixture();
  const references = [{ attributeKey: "STR" as const, score: 40, maxCarry: 100, maxLift: 200, maxSpheres: null, spellWeaving: null, teachingBase: null, loyaltyBase: null }];
  const result = resolve(draft, race, 1, catalog, references)!;
  assert.deepEqual(result.attributeReferences[0].fields.map(row => row.value), [100, 200]);
  assert.equal(result.attributeReferences[1].fields[0].value, null);
  race.formPreview!.forms[0].mechanics!.attributeAdjustments.STR = 100;
  assert.equal(resolve(draft, race, 1, catalog, references)!.attributeReferences[0].fields[0].value, null);
});
test("Race/Add/Replace interactions, inherited collections and empty replacements are independent", () => {
  const { draft, race, catalog } = fixture(), mechanics = race.formPreview!.forms[0].mechanics!;
  assert.deepEqual(resolve(draft, race, 1, catalog)!.interactionRules.map(row => row.name), ["Race rule", "Silver vulnerability"]);
  mechanics.interactionMode = "replace"; assert.equal(resolve(draft, race, 1, catalog)!.interactionRules.length, 1);
  mechanics.interactionMode = "race"; assert.equal(resolve(draft, race, 1, catalog)!.interactionRules[0].name, "Race rule");
  const inherited = resolve(draft, race, 2, catalog)!; assert.equal(inherited.anatomyChanged, false); assert.equal(inherited.size, "Small"); assert.equal(inherited.movement[0].notes, "Normal"); assert.deepEqual(inherited.attacks, []);
  mechanics.attacks = []; mechanics.protections = []; mechanics.movement = [];
  const empty = resolve(draft, race, 1, catalog)!; assert.deepEqual(empty.attacks, []); assert.deepEqual(empty.protections, []); assert.deepEqual(empty.movement, []);
});
test("switching previews and mutating a returned display cannot affect drafts, budgets or catalogs", () => {
  const { draft, race, catalog } = fixture(), before = structuredClone({ draft, race, catalog });
  const budgets = [getAttributePointsUsed(draft), getSkillPointsUsed(draft)];
  const first = resolve(draft, race, 1, catalog)!;
  first.attacks[0].damage = "999"; first.transformation!.entryCosts.costs[0].amount = 999;
  assert.equal(resolve(draft, race, 2, catalog)!.attributes[0].value, 25);
  assert.equal(resolve(draft, race, 1, catalog)!.attacks[0].damage, "5"); assert.equal(resolve(draft, race, null, catalog), null);
  assert.deepEqual({ draft, race, catalog }, before); assert.deepEqual([getAttributePointsUsed(draft), getSkillPointsUsed(draft)], budgets);
});

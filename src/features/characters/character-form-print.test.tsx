import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { characterFormFixture } from "../../../scripts/character-form-preview-fixture";
import type { CharacterAggregate } from "./models";
import { buildCharacterFormReferences, selectedCharacterFormReferences } from "./character-form-print";
import { resolveCharacterFormPreview } from "./character-form-preview";
import { emptyFormAccessRequirement } from "@/features/forms/form-access";
import { PaperFormReference } from "@/app/characters/paper-form-reference";
import { PaperCharacterSheet } from "@/app/characters/paper-character-sheet";
import type { PaperCharacterData } from "./paper-character";

function fixture() {
  const {draft, race, catalog} = characterFormFixture();
  const aggregate = {character: {id: 1, name: draft.name}, profile: draft.profile, selectedRace: race,
    attributes: Object.entries(draft.attributes).map(([attributeKey, value]) => ({attributeKey, value})),
    skillAllocations: draft.skillAllocations.map(row => ({id: row.draftId, skillId: row.skillId, parentAllocationId: row.parentDraftId, points: row.points})),
    skillCatalog: catalog, attributeReferenceCatalog: [], derivedAbilityStatuses: [], items: [], itemInstances: [], currencyHoldings: [], campaign: {currencySystem: "Credits"},
  } as unknown as CharacterAggregate;
  return {aggregate, draft, race, catalog};
}
test("saved Form print projection exactly matches View Form mechanics and mutates no input", () => {
  const {aggregate, draft, race, catalog} = fixture(), before = structuredClone(aggregate);
  const references = buildCharacterFormReferences(aggregate);
  assert.equal(references.length, 2);
  for (const row of references) assert.deepEqual(row.preview, resolveCharacterFormPreview(draft, race, row.preview.form.id, catalog));
  assert.deepEqual(aggregate, before);
  references[0].preview.attributes[0].value = 999;
  assert.equal(buildCharacterFormReferences(aggregate)[0].preview.attributes[0].value, 40);
});
test("Locked and Manual Review references print all requirements without granting access", () => {
  const {aggregate, race} = fixture();
  race.formPreview!.forms[0].access = {mode: "requirements", requirements: [{...emptyFormAccessRequirement("strong", 0, "attribute"), attributeKey: "STR", requiredValue: 80}]};
  race.formPreview!.forms[1].access = {mode: "requirements", requirements: [{...emptyFormAccessRequirement("story", 0), notes: "Confirm the spirit pact"}]};
  const before = structuredClone(aggregate), refs = buildCharacterFormReferences(aggregate);
  assert.deepEqual(refs.map(row => row.access.status), ["locked", "manual-review"]);
  const html = refs.map(reference => renderToStaticMarkup(<PaperFormReference reference={reference} />)).join("");
  assert.match(html, /Access: Locked/); assert.match(html, /Needs G.O.D. Review/); assert.match(html, /Confirm the spirit pact/);
  assert.match(html, /80/); assert.match(html, /does not grant access/); assert.deepEqual(aggregate, before);
});
test("paper reference covers effective values, anatomy, movement, protection, attacks, Skills, restrictions and transformation", () => {
  const {aggregate} = fixture(), ref = buildCharacterFormReferences(aggregate)[0];
  const html = renderToStaticMarkup(<PaperFormReference reference={ref} />);
  for (const text of ["REFERENCE ONLY", "NOT CURRENT FORM STATE", "Stored Character", "Exact Race", "Wolf", "Normal", "Form change", "+5", "40", "Wolf Tail", "Tail and fur", "Movement Initiative", "Four legs", "Fur", "Soak 2", "Bite", "Piercing", "Bite rider", "Silver vulnerability", "Form predisposition", "Paws", "Short sounds", "Cannot use fine tools", "Entry method", "Cost to change", "Duration", "Cooldown / recovery", "Equipment on exit", "Current damage and injuries remain recorded on the Character.", "no damage redistribution has occurred."])
    assert.ok(html.includes(text), `Missing ${text}`);
  assert.ok(!html.includes("wolf-tail"), "storage keys do not leak into paper labels");
});
test("one/many/all independent selections print only exact current Race forms, once each; former selections vanish", () => {
  const {aggregate, race} = fixture(), refs = buildCharacterFormReferences(aggregate);
  const data = {characterId: 1, name: "Reference test", recordedAt: "2026-09-28T00:00:00.000Z", formReferences: refs} as PaperCharacterData;
  const render = (ids: number[]) => renderToStaticMarkup(<PaperCharacterSheet data={data} selection={{front: false, backs: [], books: [], references: [], formIds: ids}} />);
  assert.equal((render([1]).match(/class="paper-form-reference"/g) ?? []).length, 1);
  assert.equal((render([1, 2, 2, 99]).match(/class="paper-form-reference"/g) ?? []).length, 2);
  assert.equal((render([]).match(/class="paper-form-reference"/g) ?? []).length, 0);
  assert.equal(selectedCharacterFormReferences(refs, [99]).length, 0);
  aggregate.profile.raceId = 9;
  assert.deepEqual(buildCharacterFormReferences(aggregate), [], "stale aggregate cannot print old Race Forms");
  aggregate.selectedRace = {...race, race: {...race.race, id: 9}, formPreview: {...race.formPreview!, forms: [{...race.formPreview!.forms[0], id: 3, raceId: 9, name: "Evolved Form"}]}};
  const next = buildCharacterFormReferences(aggregate);
  assert.deepEqual(selectedCharacterFormReferences(next, [1, 2]), []); assert.equal(next[0].preview.form.name, "Evolved Form");
  aggregate.profile.raceId = 1; aggregate.selectedRace = race;
  assert.deepEqual(buildCharacterFormReferences(aggregate).map(row => row.preview.form.id), [1, 2]);
});

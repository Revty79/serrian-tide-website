import assert from "node:assert/strict";
import test from "node:test";
import {DEFAULT_PRINT_SELECTION, ownedPrintSystems, printPresetSelection, type UnifiedPrintSelection} from "./character-print-options";
import {getNamedSupernaturalSkillSystems, isSkillAllowedByCampaign} from "./character-rules";
import type {PaperCharacterData} from "./paper-character";
import type {CharacterSkillReference} from "./models";

test("Description-only supernatural training gets a book without a construction document", () => {
  const data = {skills: [{systems: ["Psyonics"], special: false}], spells: [], abilities: [], inventory: [], gear: [], story: []} as unknown as PaperCharacterData;
  assert.deepEqual(ownedPrintSystems(data), ["Psyonics"]);
  assert.deepEqual(printPresetSelection("full", data, DEFAULT_PRINT_SELECTION).books, ["Psyonics"]);
  assert.deepEqual(printPresetSelection("quick", data, DEFAULT_PRINT_SELECTION), {front: true, backs: ["General"], books: [], references: []});
});
test("Independent books and multiple backs survive custom selection without an implicit front", () => {
  const custom: UnifiedPrintSelection = {front: false, backs: ["Faith", "Bardic Resonance"], books: ["Psyonics"], references: ["derivedAbilities"]};
  assert.deepEqual(printPresetSelection("custom", null, custom), custom);
  assert.deepEqual(printPresetSelection("paper", null, custom), { front: false, backs: [], books: [], references: [] });
});
test("Canonical support mappings govern printing and campaign eligibility", () => {
  assert.deepEqual(getNamedSupernaturalSkillSystems("Channeling"), ["Spellcraft", "Talismanism"]);
  assert.deepEqual(getNamedSupernaturalSkillSystems("Psionic Channeling"), ["Psyonics"]);
  assert.deepEqual(getNamedSupernaturalSkillSystems("Resonance Attunement"), ["Bardic Resonance"]);
  assert.equal(getNamedSupernaturalSkillSystems("Mental"), null);
  const skill: CharacterSkillReference = {id: 1, name: "Channeling", classification: "standard", tier: 1, primaryAttribute: "INT", secondaryAttribute: null, definition: "", spellLevel: null, manaCost: null, spellDocumentJson: null};
  assert.equal(isSkillAllowedByCampaign(skill, skill, ["Tier 1"]), false, "A standard classification cannot bypass the support Skill system mapping");
});

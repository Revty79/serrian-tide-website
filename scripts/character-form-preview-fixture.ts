import type { CharacterDraft, CharacterRaceAggregate, CharacterSkillReference } from "../src/features/characters/models";
import { emptyRaceFormMechanics } from "../src/features/races/race-form-mechanics";
import { wolfFormMechanics } from "./race-form-mechanics-fixture";
import { transformationFixture } from "./race-form-transformation-fixture";
export function characterFormFixture() {
  const draft: CharacterDraft = { name: "Stored Character", npcRoleLabel: "", expectedCommerceVersion: 0,
    attributes: { STR: 35, DEX: 35, CON: 35, INT: 35, WIS: 35, CHR: 35 }, items: [], itemInstances: [], currencyHoldings: [],
    skillAllocations: [{ draftId: 10, skillId: 1, parentDraftId: null, points: 5 }, { draftId: 11, skillId: 3, parentDraftId: 10, points: 3 }],
    profile: { raceId: 1, age: null, sex: "", heightFeet: null, heightInches: null, weight: null, skinColor: "", eyeColor: "", hairColor: "", deity: "", definingMarks: "", personality: "", goals: "", secrets: "", backstory: "", motivations: "", fame: 0, experience: 0, totalExperience: 0, quintessence: 0, totalQuintessence: 0, hpMultiplierSteps: 1, baseMovementSteps: 2, baseMagicSteps: 0, fatePoints: 0, creditsRemaining: 0 } };
  const catalog: CharacterSkillReference[] = [1, 2, 3, 4].map(id => ({ id, name: `Skill ${id}`, classification: id === 2 ? "Special Ability" : "standard", tier: id === 2 ? null : id === 3 ? 2 : 1, primaryAttribute: "DEX", secondaryAttribute: null, definition: `Definition ${id}`, spellLevel: null, manaCost: null, spellDocumentJson: null }));
  const race: CharacterRaceAggregate = { race: { id: 1, name: "Exact Race", size: "Medium", baseMagic: 1, ageMin: null, ageMax: null, ageRangeText: "", physicalDescription: "", racialQuirkName: "", quirkSuccessEffect: "", quirkFailureEffect: "" }, attributeCaps: [{ attributeKey: "STR", maxValue: 36 }], movementModes: [{ movementMode: "Land", baseValue: 3, notes: "Normal" }], skillLinks: [{ skillId: 1, skillName: "Skill 1", skillClassification: "standard", linkType: "Skill", value: 2 }],
    formPreview: { naturalAttacks: [], naturalProtections: [], interactionRules: { schemaVersion: 1, rules: [{ key: "race", name: "Race rule", ruleType: "immunity", scope: "damage", match: "ALL", conditions: [{ key: "cold", kind: "damage-type", damageType: "Cold" }], percentage: null, notes: "", sortOrder: 0 }] }, forms: [
      { id: 1, raceId: 1, key: "wolf", name: "Wolf", description: "Wolf body", notes: "", sortOrder: 0, mechanics: wolfFormMechanics(1, 2), transformation: transformationFixture() },
      { id: 2, raceId: 1, key: "mist", name: "Mist", description: "", notes: "", sortOrder: 1, mechanics: { ...emptyRaceFormMechanics(), size: "Small", attributeAdjustments: { STR: -10, DEX: 0, CON: 0, INT: 0, WIS: 0, CHR: 0 } } },
    ] } };
  return { draft, race, catalog };
}
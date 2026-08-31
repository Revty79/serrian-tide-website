import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  canAccessSupernaturalSkillAtLevel,
  canAccessSpellAtLevel,
  characterAggregateToDraft,
  getCharacterManaProfiles,
  getCharacterSkillGroupKey,
  getCreationPurchasedSkillMaximum,
  getEffectiveSkillPoints,
  getRacialSkillGrant,
  getRaceAttributeCap,
  getSkillRank,
  getSkillUnlockThreshold,
  getSpecialAbilityRollTarget,
  isSkillAllowedByCampaign,
  reconcileRacialSkillAnchors,
  removeSkillAllocationDescendants,
} from "./character-rules";
import {
  CHARACTER_CREATION_TABS,
  getCharacterCreationTabs,
} from "./character-creation";
import type {
  CharacterAggregate,
  CharacterRaceAggregate,
  CharacterSkillReference,
} from "./models";
import { resolveRandomCharacterRaceId } from "./random-character";

function readSource(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function skill(
  id: number,
  name: string,
  options: Partial<CharacterSkillReference> = {},
): CharacterSkillReference {
  return {
    id,
    name,
    classification: "standard",
    tier: 1,
    primaryAttribute: "STR",
    secondaryAttribute: null,
    definition: `${name} definition`,
    spellLevel: null,
    manaCost: null,
    spellDocumentJson: null,
    ...options,
  };
}

function race(skillLinks: CharacterRaceAggregate["skillLinks"] = []): CharacterRaceAggregate {
  return {
    race: {
      id: 4,
      name: "Tideborn",
      size: "Medium",
      baseMagic: 2,
      ageMin: 16,
      ageMax: 90,
      ageRangeText: "16-90",
      physicalDescription: "",
      racialQuirkName: "Tidal Memory",
      quirkSuccessEffect: "",
      quirkFailureEffect: "",
    },
    attributeCaps: [{ attributeKey: "Strength", maxValue: 42 }],
    movementModes: [{ movementMode: "Walk", baseValue: 3, notes: "" }],
    skillLinks,
  };
}

test("Character Creation exposes the exact final tab sequence", () => {
  assert.deepEqual(CHARACTER_CREATION_TABS, [
    { id: "identity", label: "Identity" },
    { id: "attributes", label: "Attributes" },
    { id: "skills", label: "Skills & Abilities" },
    { id: "story", label: "Story & Personality" },
    { id: "equipment", label: "Equipment" },
    { id: "god", label: "G.O.D. Controls" },
    { id: "sheet", label: "Character Sheet" },
  ]);
  assert.deepEqual(
    getCharacterCreationTabs(false).map(({ label }) => label),
    ["Identity", "Attributes", "Skills & Abilities", "Story & Personality", "Equipment", "Character Sheet"],
  );
  const labels: readonly string[] = getCharacterCreationTabs(false).map(({ label }) => label);
  assert.equal(labels.includes("Race") || labels.includes("Review"), false);
});

test("Skill roots group by Attribute, Special Ability, and Other", () => {
  assert.equal(getCharacterSkillGroupKey(skill(1, "Athletics", { primaryAttribute: "DEX" })), "DEX");
  assert.equal(getCharacterSkillGroupKey(skill(2, "Night Sight", { classification: "Special Ability" })), "SPECIAL");
  assert.equal(getCharacterSkillGroupKey(skill(3, "Untethered", { primaryAttribute: null })), "OTHER");
});

test("Campaign systems and tier limits govern branches without suppressing racial grants", () => {
  const standard = skill(1, "Athletics");
  const tierTwo = skill(2, "Acrobatics", { tier: 2 });
  const special = skill(3, "Night Sight", { classification: "Special Ability" });
  assert.equal(isSkillAllowedByCampaign(standard, standard, ["Tier 1"]), true);
  assert.equal(isSkillAllowedByCampaign(tierTwo, standard, ["Tier 1"]), false);
  assert.equal(isSkillAllowedByCampaign(special, special, ["Tier 1"]), false);
  assert.equal(isSkillAllowedByCampaign(special, special, ["Tier 1"], true, true), true);
});

test("supernatural branches use system progression instead of ordinary Tier 2 and Tier 3 flags", () => {
  const roots = [
    ["Spellcraft", "Spellcraft", "spell"],
    ["Talismanism", "Talismanism", "spell"],
    ["Faith", "Faith", "spell"],
    ["Psionic Focus", "Psyonics", "psionic skill"],
    ["Resonant Performance", "Bardic Resonance", "reverberation"],
  ] as const;

  for (const [rootName, system, tierThreeClassification] of roots) {
    const root = skill(10, rootName, { classification: "magic access", tier: 1 });
    const tierTwo = skill(11, `${rootName} Branch`, {
      classification: "sphere",
      tier: 2,
    });
    const tierThree = skill(12, `${rootName} Power`, {
      classification: tierThreeClassification,
      tier: 3,
      spellLevel: "Apprentice",
    });
    const allowedSystems = ["Tier 1", system] as const;

    assert.equal(
      isSkillAllowedByCampaign(root, root, [system]),
      false,
      `${rootName} still requires the Campaign's Tier 1 root permission`,
    );
    assert.equal(
      isSkillAllowedByCampaign(tierTwo, root, allowedSystems),
      true,
      `${rootName} Tier 2 branches should use supernatural progression`,
    );
    assert.equal(
      isSkillAllowedByCampaign(tierThree, root, allowedSystems),
      true,
      `${rootName} Tier 3 branches should be left to Mana/mastery access`,
    );
  }
});

test("recursive racial anchors preserve their parent path and descendants prune together", () => {
  let nextDraftId = 10;
  const racial = race([{ skillId: 2, skillName: "Acrobatics", skillClassification: "standard", linkType: "racial", value: 2 }]);
  const anchored = reconcileRacialSkillAnchors(
    [],
    racial,
    [{ skillId: 2, relatedSkillId: 1, relationshipType: "parent", sortOrder: 0 }],
    () => nextDraftId++,
  );
  assert.deepEqual(anchored, [
    { draftId: 10, skillId: 1, parentDraftId: null, points: 0 },
    { draftId: 11, skillId: 2, parentDraftId: 10, points: 0 },
  ]);
  assert.deepEqual(removeSkillAllocationDescendants(anchored, 10), [anchored[0]]);
  assert.deepEqual(getRacialSkillGrant(racial, 2), { granted: true, minimum: 2 });
  assert.equal(getEffectiveSkillPoints(3, racial, 2), 5);
});

test("creation maxima, ranks, and roll targets retain final rules", () => {
  const standard = skill(1, "Athletics");
  const special = skill(2, "Night Sight", { classification: "Special Ability" });
  assert.equal(getCreationPurchasedSkillMaximum(standard, 25, 75, 5), 25);
  assert.equal(getCreationPurchasedSkillMaximum(special, 25, 75, 90), 10);
  assert.equal(getSkillRank(0, 4, null, 1), 0);
  assert.equal(getSkillRank(5, 4, null, 1), 9);
  assert.equal(getSkillRank(3, 4, 9, 2), 12);
  assert.equal(getSpecialAbilityRollTarget(37), 63);
  assert.equal(getRaceAttributeCap(race(), "STR"), 42);
});

test("magic roots unlock at one point and Mana controls spell access", () => {
  const spellcraft = skill(1, "Spellcraft", { classification: "magic" });
  const channeling = skill(2, "Channeling", { classification: "magic" });
  const apprenticeSpell = skill(3, "Glow", { classification: "spell", spellLevel: "Apprentice" });
  const masterSpell = skill(4, "Storm Gate", { classification: "spell", spellLevel: "Master" });
  assert.equal(getSkillUnlockThreshold(skill(9, "Athletics"), 5), 5);
  assert.equal(getSkillUnlockThreshold(spellcraft, 5), 1);
  const profiles = getCharacterManaProfiles(
    { skillAllocations: [
      { draftId: 1, skillId: 1, parentDraftId: null, points: 1 },
      { draftId: 2, skillId: 2, parentDraftId: null, points: 6 },
    ] },
    [spellcraft, channeling, apprenticeSpell, masterSpell],
    race(),
  );
  assert.equal(profiles[0]?.manaPool, 12);
  assert.equal(profiles[0]?.spellAccessLevel, "Novice");
  assert.equal(canAccessSpellAtLevel(apprenticeSpell, profiles[0]?.spellAccessLevel ?? null), true);
  assert.equal(canAccessSpellAtLevel(masterSpell, profiles[0]?.spellAccessLevel ?? null), false);
  assert.equal(canAccessSupernaturalSkillAtLevel(apprenticeSpell, spellcraft, "Novice"), true);
  assert.equal(canAccessSupernaturalSkillAtLevel(masterSpell, spellcraft, "Novice"), false);
});

test("a saved aggregate reopens as the same editable draft record", () => {
  const profile = {
    characterId: 11,
    raceId: 4,
    age: 31,
    sex: "Female",
    heightFeet: 5,
    heightInches: 8,
    weight: 145,
    skinColor: "Bronze",
    eyeColor: "Green",
    hairColor: "Black",
    deity: "None",
    definingMarks: "Wave tattoo",
    personality: "Patient",
    goals: "Chart the coast",
    secrets: "Hidden map",
    backstory: "Sailed from the north.",
    motivations: "Discovery",
    fame: 2,
    experience: 3,
    totalExperience: 5,
    quintessence: 1,
    totalQuintessence: 2,
    hpMultiplierSteps: 0,
    fatePoints: 4,
    creditsRemaining: 70,
    creationCompletedAt: null,
    createdAt: "created",
    updatedAt: "updated",
  };
  const aggregate = {
    character: { name: "Mara Tidewalker" },
    profile,
    attributes: [
      { attributeKey: "STR", value: 30 },
      { attributeKey: "DEX", value: 31 },
      { attributeKey: "CON", value: 32 },
      { attributeKey: "INT", value: 33 },
      { attributeKey: "WIS", value: 34 },
      { attributeKey: "CHR", value: 35 },
    ],
    skillAllocations: [{ id: 41, skillId: 7, parentAllocationId: null, points: 5 }],
    items: [{ itemId: 8, quantity: 2, unitCostCredits: 15 }],
    currencyHoldings: [],
    campaign: { currencySystem: "Credits", derivedCurrencies: [] },
  } as unknown as CharacterAggregate;
  const reopened = characterAggregateToDraft(aggregate);
  assert.equal(reopened.name, "Mara Tidewalker");
  assert.deepEqual(reopened.profile, {
    raceId: 4,
    age: 31,
    sex: "Female",
    heightFeet: 5,
    heightInches: 8,
    weight: 145,
    skinColor: "Bronze",
    eyeColor: "Green",
    hairColor: "Black",
    deity: "None",
    definingMarks: "Wave tattoo",
    personality: "Patient",
    goals: "Chart the coast",
    secrets: "Hidden map",
    backstory: "Sailed from the north.",
    motivations: "Discovery",
    fame: 2,
    experience: 3,
    totalExperience: 5,
    quintessence: 1,
    totalQuintessence: 2,
    hpMultiplierSteps: 0,
    fatePoints: 4,
    creditsRemaining: 70,
  });
  assert.equal(reopened.attributes.CHR, 35);
  assert.deepEqual(reopened.skillAllocations, [{ draftId: 41, skillId: 7, parentDraftId: null, points: 5 }]);
  assert.deepEqual(reopened.items, [{ itemId: 8, quantity: 2, unitCostCredits: 15 }]);
});

test("guided Race surprise selects only a Campaign-allowed Race", () => {
  const allowed = [{ id: 3, name: "Human" }, { id: 7, name: "Dwarf" }];
  assert.equal(resolveRandomCharacterRaceId(allowed, null, () => 0), 3);
  assert.equal(resolveRandomCharacterRaceId(allowed, null, () => 0.99), 7);
  assert.equal(resolveRandomCharacterRaceId(allowed, 7), 7);
  assert.equal(resolveRandomCharacterRaceId(allowed, 9), null);
});

test("Character editor uses the recursive final workflow, authorized store, and server Race record", () => {
  const editor = readSource("src/app/characters/character-editor.tsx");
  const actions = readSource("src/app/characters/actions.ts");
  const guided = readSource("src/app/realms/characters/[characterId]/random/guided/random-character-workspace.tsx");
  assert.match(editor, /function SkillBranch/);
  assert.match(editor, /getAllowedRaceForCharacter/);
  assert.match(editor, /aggregate\.authorizedItems/);
  assert.match(editor, /CharacterSheet/);
  assert.equal(editor.includes("Parent Path"), false);
  assert.equal(editor.includes("Add Skill"), false);
  assert.match(actions, /requireCharacterAccess/);
  assert.match(actions, /if \(!godMode && aggregate\.profile\.creationCompletedAt\)/);
  assert.match(actions, /if \(completeCreation && !readiness\.ready\)/);
  assert.match(actions, /tx\.delete\(campaignCharacterSkillAllocation\)/);
  assert.match(actions, /tx\.insert\(campaignCharacterSkillAllocation\)/);
  assert.match(guided, />Surprise Me<\/option>/);
  assert.match(guided, /raceId: raceId \? Number\(raceId\) : null/);
});

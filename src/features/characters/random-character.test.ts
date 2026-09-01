import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCharacterReadiness,
  getAttributePointsUsed,
  getSkillPointsUsed,
} from "./character-rules";
import type {
  CharacterAggregate,
  CharacterDraft,
  CharacterRaceAggregate,
} from "./models";
import {
  createCompletelyRandomAnswers,
  generateRandomCharacterDraft,
  type GuidedRandomCharacterAnswers,
} from "./random-character";

function race(): CharacterRaceAggregate {
  return {
    race: {
      id: 3,
      name: "Human",
      size: "Medium",
      baseMagic: 2,
      ageMin: 18,
      ageMax: 80,
      ageRangeText: "18-80",
      physicalDescription: "",
      racialQuirkName: "Adaptable",
      quirkSuccessEffect: "",
      quirkFailureEffect: "",
    },
    attributeCaps: ["STR", "DEX", "CON", "INT", "WIS", "CHR"].map(
      (attributeKey) => ({ attributeKey, maxValue: 10 }),
    ),
    movementModes: [],
    skillLinks: [],
  };
}

function aggregate(): CharacterAggregate {
  return {
    character: {
      id: 9,
      campaignId: 12,
      playerUserId: "player-2",
      name: "New Character",
      campaignName: "Tidefall",
      playerUsername: "Mariner",
      createdAt: "created",
      updatedAt: "updated",
      isNpc: false,
      npcKind: "race",
    },
    profile: {
      characterId: 9,
      raceId: null,
      age: null,
      sex: "",
      heightFeet: null,
      heightInches: null,
      weight: null,
      skinColor: "",
      eyeColor: "",
      hairColor: "",
      deity: "",
      definingMarks: "",
      personality: "",
      goals: "",
      secrets: "",
      backstory: "",
      motivations: "",
      fame: 0,
      experience: 0,
      totalExperience: 0,
      quintessence: 0,
      totalQuintessence: 0,
      hpMultiplierSteps: 0,
      baseMovementSteps: 0,
      baseMagicSteps: 0,
      fatePoints: 3,
      creditsRemaining: 100,
      creationCompletedAt: null,
      createdAt: "created",
      updatedAt: "updated",
    },
    attributes: [],
    attributeReferenceCatalog: [],
    skillAllocations: [],
    items: [],
    itemInstances: [],
    currencyHoldings: [],
    campaign: {
      id: 12,
      name: "Tidefall",
      attributePoints: 30,
      skillPoints: 12,
      maxStartingSkill: 5,
      pointsToUnlockNextTier: 3,
      maxPointsInSkill: 75,
      startingCreditAmount: 100,
      currencySystem: "Credits",
      fatePointMethod: "Assigned",
      assignedFatePoints: 3,
      allowedSystems: ["Tier 1"],
      derivedCurrencies: [],
    },
    allowedRaces: [{ id: 3, name: "Human" }],
    selectedRace: null,
    skillCatalog: [
      "Athletics",
      "Dodge",
      "Endurance",
      "Lore",
      "Perception",
      "Persuasion",
    ].map((name, index) => ({
      id: index + 1,
      name,
      classification: "standard",
      tier: 1,
      primaryAttribute: ["STR", "DEX", "CON", "INT", "WIS", "CHR"][index]!,
      secondaryAttribute: null,
      definition: "",
      spellLevel: null,
      manaCost: null,
      spellDocumentJson: null,
    })),
    skillRelationships: [],
    personalSpellbook: [],
    derivedAbilities: [],
    authorizedItems: [
      {
        id: 7,
        canonicalId: "ITEM-7",
        name: "Travel Pack",
        catalogScope: "equipment",
        equipmentGroup: "general",
        recordType: "Item",
        category: "Gear",
        credits: 10,
        priceBasis: "each",
        description: "",
        weight: 2,
        weightUnit: "lb",
        size: "Small",
        durability: 10,
        isMagical: false,
        effectCount: 0,
        runtimeProfile: {
          useMode: "none",
          quantityPerUse: null,
          maximumCharges: null,
          chargesPerUse: null,
          rechargeNotes: "",
          activationLabel: "Use",
          useNotes: "",
        },
        weaponType: null,
        handedness: null,
        damageSource: null,
        damage: null,
        damageType: null,
        ammunitionItemId: null,
        ammunitionItemName: null,
        ammunitionDamage: null,
        ammunitionDamageType: null,
        rangeText: null,
        reachText: null,
        weaponRulesText: null,
        armorType: null,
        coverage: null,
        baseSoak: null,
        armorDamageModifiers: null,
        armorRulesText: null,
      },
    ],
  };
}

function draft(character: CharacterAggregate): CharacterDraft {
  return {
    name: character.character.name,
    profile: {
      raceId: null,
      age: null,
      sex: "",
      heightFeet: null,
      heightInches: null,
      weight: null,
      skinColor: "",
      eyeColor: "",
      hairColor: "",
      deity: "",
      definingMarks: "",
      personality: "",
      goals: "",
      secrets: "",
      backstory: "",
      motivations: "",
      fame: 0,
      experience: 0,
      totalExperience: 0,
      quintessence: 0,
      totalQuintessence: 0,
      hpMultiplierSteps: 0,
      baseMovementSteps: 0,
      baseMagicSteps: 0,
      fatePoints: 3,
      creditsRemaining: 100,
    },
    attributes: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHR: 0 },
    skillAllocations: [],
    items: [],
    itemInstances: [],
    currencyHoldings: [],
  };
}

test("guided random generation produces a legal, completion-ready draft", () => {
  const character = aggregate();
  const selectedRace = race();
  const answers: GuidedRandomCharacterAnswers = {
    name: "Rhea Testborn",
    raceId: 3,
    focus: "scout",
    magic: "none",
    equipment: "prepared",
    temperament: "curious",
  };
  const result = generateRandomCharacterDraft(
    character,
    selectedRace,
    draft(character),
    answers,
    () => 0.37,
  );

  assert.equal(result.draft.name, "Rhea Testborn");
  assert.equal(getAttributePointsUsed(result.draft), 30);
  assert.equal(getSkillPointsUsed(result.draft), 12);
  assert.deepEqual(result.draft.items, [
    { itemId: 7, quantity: 1, unitCostCredits: 10 },
  ]);
  assert.deepEqual(result.warnings, []);
  assert.equal(
    evaluateCharacterReadiness(result.draft, character, selectedRace).ready,
    true,
  );
});

test("guided random generation routes charged equipment into per-copy drafts", () => {
  const character = aggregate();
  character.authorizedItems = [{
    ...character.authorizedItems[0]!,
    id: 8,
    canonicalId: "ITEM-8",
    name: "Restoration Wand",
    credits: 100,
    isMagical: true,
    runtimeProfile: {
      useMode: "charges",
      quantityPerUse: null,
      maximumCharges: 10,
      chargesPerUse: 1,
      rechargeNotes: "",
      activationLabel: "Restore",
      useNotes: "",
    },
  }];
  const generated = generateRandomCharacterDraft(
    character,
    race(),
    draft(character),
    {
      name: "Charged Test",
      raceId: 3,
      focus: "scout",
      magic: "none",
      equipment: "prepared",
      temperament: "curious",
    },
    () => 0.37,
  );

  assert.deepEqual(generated.draft.items, []);
  assert.equal(generated.draft.itemInstances.length, 1);
  assert.deepEqual(generated.draft.itemInstances[0], {
    draftId: -2_000_000,
    instanceId: null,
    itemId: 8,
    unitCostCredits: 100,
  });
});

test("complete random generation stays within Campaign choices and preserves rolled Fate ambiguity", () => {
  const character = aggregate();
  character.campaign.fatePointMethod = "Rolled";
  character.campaign.assignedFatePoints = null;
  const base = draft(character);
  base.profile.fatePoints = null;
  const answers = createCompletelyRandomAnswers(character, () => 0.2);
  const result = generateRandomCharacterDraft(
    character,
    race(),
    base,
    answers,
    () => 0.2,
  );

  assert.equal(answers.raceId, 3);
  assert.equal(result.draft.profile.fatePoints, null);
  assert.match(result.warnings.join(" "), /does not define a die formula/i);
});

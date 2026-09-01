import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";

import { resolveCharacterSpellCastingContext } from "./character-spell-casting";
import type {
  CharacterAggregate,
  CharacterSkillAllocation,
  CharacterSkillReference,
} from "./models";

function allocation(
  id: number,
  skillId: number,
  skillName: string,
  parentAllocationId: number | null,
  points: number,
): CharacterSkillAllocation {
  return {
    id,
    characterId: 9,
    skillId,
    skillName,
    skillClassification: "standard",
    skillTier: 1,
    primaryAttribute: "INT",
    parentAllocationId,
    points,
    createdAt: "created",
    updatedAt: "updated",
  };
}

function skill(
  id: number,
  name: string,
  classification: string,
): CharacterSkillReference {
  return {
    id,
    name,
    classification,
    tier: 1,
    primaryAttribute: "INT",
    secondaryAttribute: null,
    definition: "",
    spellLevel: null,
    manaCost: null,
    spellDocumentJson: null,
  };
}

function aggregate(): CharacterAggregate {
  return {
    character: {
      id: 9,
      campaignId: 12,
      playerUserId: "player-1",
      name: "Neris",
      campaignName: "Tidefall",
      playerUsername: "Mariner",
      createdAt: "created",
      updatedAt: "updated",
      isNpc: false,
      npcKind: "race",
    },
    profile: {
      characterId: 9,
      raceId: 3,
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
      fatePoints: 0,
      creditsRemaining: 0,
      creationCompletedAt: "completed",
      createdAt: "created",
      updatedAt: "updated",
    },
    attributes: [],
    attributeReferenceCatalog: [],
    items: [],
    itemInstances: [],
    currencyHoldings: [],
    campaign: {
      id: 12,
      name: "Tidefall",
      attributePoints: 0,
      skillPoints: 0,
      maxStartingSkill: 0,
      pointsToUnlockNextTier: 0,
      maxPointsInSkill: 0,
      startingCreditAmount: 0,
      currencySystem: "Credits",
      fatePointMethod: "Assigned",
      assignedFatePoints: 0,
      allowedSystems: [],
      derivedCurrencies: [],
    },
    allowedRaces: [],
    selectedRace: {
      race: {
        id: 3,
        name: "Human",
        size: "Medium",
        baseMagic: 2,
        ageMin: null,
        ageMax: null,
        ageRangeText: "",
        physicalDescription: "",
        racialQuirkName: "",
        quirkSuccessEffect: "",
        quirkFailureEffect: "",
      },
      attributeCaps: [],
      movementModes: [],
      skillLinks: [],
    },
    skillCatalog: [
      skill(1, "Spellcraft", "magic access"),
      skill(2, "Faith", "magic access"),
      skill(3, "Channeling", "standard"),
      skill(4, "Devotion", "standard"),
      skill(5, "Elemental Sphere", "sphere"),
      skill(6, "Tidal Light", "spell"),
    ],
    skillRelationships: [],
    personalSpellbook: [],
    authorizedItems: [],
    derivedAbilities: [],
    skillAllocations: [
      allocation(100, 1, "Spellcraft", null, 1),
      allocation(101, 3, "Channeling", 100, 16),
      allocation(102, 5, "Elemental Sphere", 100, 1),
      allocation(104, 6, "Tidal Light", 102, 1),
      allocation(200, 2, "Faith", null, 1),
      allocation(201, 4, "Devotion", 200, 6),
      allocation(202, 5, "Elemental Sphere", 200, 1),
      allocation(204, 6, "Tidal Light", 202, 1),
    ],
  };
}

describe("Character Spell casting context", () => {
  it("uses the exact owned Spell tree instead of borrowing another tree's level", () => {
    const character = aggregate();
    const spellDocument = { ...createEmptySpell(), frameworkSkillId: 5 };

    assertContext(
      resolveCharacterSpellCastingContext(character, spellDocument, 104),
      "Spellcraft",
      "Master",
      32,
    );
    assertContext(
      resolveCharacterSpellCastingContext(character, spellDocument, 204),
      "Faith",
      "Novice",
      12,
    );
  });

  it("honors a personal Spell's stored tree and leaves ambiguity unresolved", () => {
    const character = aggregate();
    const spellDocument = { ...createEmptySpell(), frameworkSkillId: 5 };

    const faith = resolveCharacterSpellCastingContext(character, {
      ...spellDocument,
      castingSystem: "Faith",
    });
    assert.equal(faith?.system, "Faith");
    assert.equal(faith?.profile.spellAccessLevel, "Novice");
    assert.equal(
      resolveCharacterSpellCastingContext(character, spellDocument),
      null,
    );
  });
});

function assertContext(
  context: ReturnType<typeof resolveCharacterSpellCastingContext>,
  system: "Spellcraft" | "Faith",
  spellAccessLevel: "Master" | "Novice",
  manaPool: number,
) {
  assert.equal(context?.system, system);
  assert.equal(context?.profile.system, system);
  assert.equal(context?.profile.sourceSkillName, system === "Faith" ? "Devotion" : "Channeling");
  assert.equal(context?.profile.sourceSkillPoints, system === "Faith" ? 6 : 16);
  assert.equal(context?.profile.baseMagic, 2);
  assert.equal(context?.profile.manaPool, manaPool);
  assert.equal(context?.profile.spellAccessLevel, spellAccessLevel);
}

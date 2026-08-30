import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCharacterAdvancementPlan,
  buildCharacterAdvancementTree,
  canPlayerAdvanceSkillWithExperience,
  getExperienceSpendingLedger,
  getInitialAdvancementAllocations,
  getMaximumAffordableSkillPoints,
  getSkillAdvancementCost,
  pruneUnavailableProjectedAllocations,
  setProjectedSkillNumber,
} from "./character-advancement-rules";
import type {
  CharacterAggregate,
  CharacterRaceAggregate,
  CharacterSkillAllocation,
  CharacterSkillReference,
} from "./models";

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

function allocation(
  id: number,
  skillReference: CharacterSkillReference,
  points: number,
  parentAllocationId: number | null = null,
): CharacterSkillAllocation {
  return {
    id,
    characterId: 9,
    skillId: skillReference.id,
    skillName: skillReference.name,
    skillClassification: skillReference.classification,
    skillTier: skillReference.tier,
    primaryAttribute: skillReference.primaryAttribute,
    parentAllocationId,
    points,
    createdAt: "created",
    updatedAt: "updated",
  };
}

function race(
  skillLinks: CharacterRaceAggregate["skillLinks"] = [],
): CharacterRaceAggregate {
  return {
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
    skillLinks,
  };
}

function aggregate(): CharacterAggregate {
  const athletics = skill(1, "Athletics");
  const climbing = skill(2, "Climbing", { tier: 2 });
  const swimming = skill(3, "Swimming", { tier: 2, primaryAttribute: "DEX" });
  const swordsmanship = skill(4, "Swordsmanship", { primaryAttribute: "DEX" });
  return {
    character: {
      id: 9,
      campaignId: 12,
      playerUserId: "player-2",
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
      age: 24,
      sex: "Female",
      heightFeet: 5,
      heightInches: 7,
      weight: 65,
      skinColor: "Bronze",
      eyeColor: "Green",
      hairColor: "Black",
      deity: "None",
      definingMarks: "None",
      personality: "Patient",
      goals: "Explore",
      secrets: "None",
      backstory: "A traveler.",
      motivations: "Discovery",
      fame: 0,
      experience: 50,
      totalExperience: 140,
      quintessence: 20,
      totalQuintessence: 7,
      hpMultiplierSteps: 0,
      fatePoints: 3,
      creditsRemaining: 80,
      creationCompletedAt: "completed",
      createdAt: "created",
      updatedAt: "updated",
    },
    attributes: (["STR", "DEX", "CON", "INT", "WIS", "CHR"] as const).map(
      (attributeKey) => ({ characterId: 9, attributeKey, value: 25 }),
    ),
    attributeReferenceCatalog: [],
    skillAllocations: [
      allocation(10, athletics, 4),
      allocation(11, swordsmanship, 8),
    ],
    items: [],
    currencyHoldings: [],
    campaign: {
      id: 12,
      name: "Tidefall",
      attributePoints: 150,
      skillPoints: 10,
      maxStartingSkill: 5,
      pointsToUnlockNextTier: 5,
      maxPointsInSkill: 75,
      startingCreditAmount: 100,
      currencySystem: "Credits",
      fatePointMethod: "Assigned",
      assignedFatePoints: 3,
      allowedSystems: ["Tier 1"],
      derivedCurrencies: [],
    },
    allowedRaces: [{ id: 3, name: "Human" }],
    selectedRace: race(),
    skillCatalog: [athletics, climbing, swimming, swordsmanship],
    skillRelationships: [
      { skillId: climbing.id, relatedSkillId: athletics.id, relationshipType: "parent", sortOrder: 0 },
      { skillId: swimming.id, relatedSkillId: athletics.id, relationshipType: "parent", sortOrder: 1 },
    ],
    personalSpellbook: [],
    authorizedItems: [],
  };
}

test("XP pricing uses Skill # and the established zero-point exception", () => {
  assert.equal(getSkillAdvancementCost(0, 1), 10);
  assert.equal(getSkillAdvancementCost(1, 1), 1);
  assert.equal(getSkillAdvancementCost(5, 1), 5);
  assert.equal(getSkillAdvancementCost(10, 1), 10);
  assert.equal(getSkillAdvancementCost(5, 3), 18);
  assert.equal(getSkillAdvancementCost(0, 4), 16);
  assert.equal(getSkillAdvancementCost(8, 3), 27);
});

test("affordability accounts for escalating costs and the final maximum", () => {
  assert.equal(getMaximumAffordableSkillPoints(5, 17, 75), 2);
  assert.equal(getMaximumAffordableSkillPoints(0, 20, 75), 5);
  assert.equal(getMaximumAffordableSkillPoints(74, 500, 75), 1);
});

test("a bonus-supported displayed Skill #3 costs 3 XP and Race data is unchanged", () => {
  const character = aggregate();
  const athletics = character.skillCatalog[0];
  character.skillAllocations[0].points = 0;
  character.selectedRace = race([{
    skillId: athletics.id,
    skillName: athletics.name,
    skillClassification: athletics.classification,
    linkType: "bonus",
    value: 3,
  }]);
  const raceBefore = structuredClone(character.selectedRace);
  let projected = getInitialAdvancementAllocations(character);
  projected = setProjectedSkillNumber({
    aggregate: character,
    projectedAllocations: projected,
    skillId: athletics.id,
    parentDraftId: null,
    requestedSkillNumber: 4,
    newDraftId: -1,
  });
  const athleticsPlan = buildCharacterAdvancementPlan(character, projected).entries[0];

  assert.deepEqual(
    { before: athleticsPlan.before, after: athleticsPlan.after, cost: athleticsPlan.experienceCost },
    { before: 3, after: 4, cost: 3 },
  );
  assert.deepEqual(character.selectedRace, raceBefore);
});

test("projected parent threshold reveals children and reversing it prunes only planned descendants", () => {
  const character = aggregate();
  let projected = getInitialAdvancementAllocations(character);
  assert.equal(
    buildCharacterAdvancementTree(character, projected).some(
      (entry) => entry.skill.name === "Climbing",
    ),
    false,
  );

  projected = setProjectedSkillNumber({
    aggregate: character,
    projectedAllocations: projected,
    skillId: 1,
    parentDraftId: null,
    requestedSkillNumber: 5,
    newDraftId: -1,
  });
  assert.equal(
    buildCharacterAdvancementTree(character, projected).some(
      (entry) => entry.skill.name === "Climbing",
    ),
    true,
  );

  projected = setProjectedSkillNumber({
    aggregate: character,
    projectedAllocations: projected,
    skillId: 2,
    parentDraftId: 10,
    requestedSkillNumber: 1,
    newDraftId: -1,
  });
  assert.equal(
    buildCharacterAdvancementPlan(character, projected).entries.find(
      (entry) => entry.skillName === "Climbing",
    )?.experienceCost,
    10,
  );

  projected = setProjectedSkillNumber({
    aggregate: character,
    projectedAllocations: projected,
    skillId: 1,
    parentDraftId: null,
    requestedSkillNumber: 4,
    newDraftId: -2,
  });
  assert.equal(projected.some((entry) => entry.skillId === 2), false);
  assert.equal(
    buildCharacterAdvancementTree(character, projected).some(
      (entry) => entry.skill.name === "Climbing",
    ),
    false,
  );
});

test("permanently owned children remain visible and are never pruned", () => {
  const character = aggregate();
  character.skillAllocations.push(
    allocation(12, character.skillCatalog[1], 1, 10),
  );
  const projected = pruneUnavailableProjectedAllocations(
    character,
    getInitialAdvancementAllocations(character),
  );
  assert.equal(projected.some((entry) => entry.draftId === 12), true);
  assert.equal(
    buildCharacterAdvancementTree(character, projected).some(
      (entry) => entry.skill.name === "Climbing" && entry.permanentlyOwned,
    ),
    true,
  );
});

test("the same shared Skill remains branch-specific in a projected plan", () => {
  const character = aggregate();
  const spellcraft = skill(20, "Spellcraft", { classification: "magic access", primaryAttribute: "INT" });
  const faith = skill(21, "Faith", { classification: "magic access", primaryAttribute: "WIS" });
  const life = skill(22, "Life", { classification: "sphere", tier: 2, primaryAttribute: "INT" });
  character.campaign.allowedSystems.push("Spellcraft", "Faith");
  character.skillCatalog.push(spellcraft, faith, life);
  character.skillRelationships.push(
    { skillId: life.id, relatedSkillId: spellcraft.id, relationshipType: "parent", sortOrder: 0 },
    { skillId: life.id, relatedSkillId: faith.id, relationshipType: "parent", sortOrder: 0 },
  );
  character.skillAllocations.push(
    allocation(20, spellcraft, 1),
    allocation(21, faith, 1),
  );
  let projected = getInitialAdvancementAllocations(character);
  projected = setProjectedSkillNumber({ aggregate: character, projectedAllocations: projected, skillId: life.id, parentDraftId: 20, requestedSkillNumber: 1, newDraftId: -20 });
  projected = setProjectedSkillNumber({ aggregate: character, projectedAllocations: projected, skillId: life.id, parentDraftId: 21, requestedSkillNumber: 1, newDraftId: -21 });
  const lifeEntries = buildCharacterAdvancementPlan(character, projected).entries.filter(
    (entry) => entry.skillName === "Life",
  );

  assert.equal(lifeEntries.length, 2);
  assert.deepEqual(
    lifeEntries.map((entry) => entry.request.parentAllocationId).sort(),
    [20, 21],
  );
});

test("an unowned Special Ability cannot be acquired through Player Advancement", () => {
  const character = aggregate();
  const phaseShift = skill(30, "Phase Shift", {
    classification: "special ability",
  });
  character.campaign.allowedSystems.push("Special Abilities");
  character.skillCatalog.push(phaseShift);

  assert.equal(canPlayerAdvanceSkillWithExperience(phaseShift, 0), false);
});

test("an unowned Special Ability is omitted and cannot become projected ownership", () => {
  const character = aggregate();
  const phaseShift = skill(30, "Phase Shift", {
    classification: "special ability",
  });
  character.campaign.allowedSystems.push("Special Abilities");
  character.skillCatalog.push(phaseShift);
  let projected = getInitialAdvancementAllocations(character);

  assert.equal(
    buildCharacterAdvancementTree(character, projected).some(
      (entry) => entry.skill.id === phaseShift.id,
    ),
    false,
  );

  projected = setProjectedSkillNumber({
    aggregate: character,
    projectedAllocations: projected,
    skillId: phaseShift.id,
    parentDraftId: null,
    requestedSkillNumber: 1,
    newDraftId: -30,
  });
  assert.equal(
    projected.some((entry) => entry.skillId === phaseShift.id),
    false,
  );
});

test("an owned Special Ability advances from #5 to #6 for 5 XP", () => {
  const character = aggregate();
  const phaseShift = skill(30, "Phase Shift", {
    classification: "special ability",
  });
  character.skillCatalog.push(phaseShift);
  character.skillAllocations.push(allocation(30, phaseShift, 5));
  let projected = getInitialAdvancementAllocations(character);
  projected = setProjectedSkillNumber({
    aggregate: character,
    projectedAllocations: projected,
    skillId: phaseShift.id,
    parentDraftId: null,
    requestedSkillNumber: 6,
    newDraftId: -30,
  });
  const entry = buildCharacterAdvancementPlan(character, projected).entries.find(
    (candidate) => candidate.skillName === phaseShift.name,
  );

  assert.equal(canPlayerAdvanceSkillWithExperience(phaseShift, 5), true);
  assert.deepEqual(
    { before: entry?.before, after: entry?.after, cost: entry?.experienceCost },
    { before: 5, after: 6, cost: 5 },
  );
});

test("a permanently saved G.O.D.-granted Special Ability becomes Player-advanceable", () => {
  const character = aggregate();
  const tideStep = skill(31, "Tide Step", {
    classification: "special ability",
  });
  character.skillCatalog.push(tideStep);
  character.skillAllocations.push(allocation(31, tideStep, 1));
  let projected = getInitialAdvancementAllocations(character);
  projected = setProjectedSkillNumber({
    aggregate: character,
    projectedAllocations: projected,
    skillId: tideStep.id,
    parentDraftId: null,
    requestedSkillNumber: 2,
    newDraftId: -31,
  });
  const entry = buildCharacterAdvancementPlan(character, projected).entries.find(
    (candidate) => candidate.skillName === tideStep.name,
  );

  assert.deepEqual(
    { owned: canPlayerAdvanceSkillWithExperience(tideStep, 1), cost: entry?.experienceCost },
    { owned: true, cost: 1 },
  );
});

test("normal unlocked Skills still use the 10 XP first-point rule", () => {
  const character = aggregate();
  let projected = getInitialAdvancementAllocations(character);
  projected = setProjectedSkillNumber({
    aggregate: character,
    projectedAllocations: projected,
    skillId: 1,
    parentDraftId: null,
    requestedSkillNumber: 5,
    newDraftId: -1,
  });
  projected = setProjectedSkillNumber({
    aggregate: character,
    projectedAllocations: projected,
    skillId: 2,
    parentDraftId: 10,
    requestedSkillNumber: 1,
    newDraftId: -2,
  });
  const climbing = buildCharacterAdvancementPlan(character, projected).entries.find(
    (entry) => entry.skillName === "Climbing",
  );

  assert.equal(
    canPlayerAdvanceSkillWithExperience(character.skillCatalog[1], 0),
    true,
  );
  assert.equal(climbing?.experienceCost, 10);
});

test("Experience ledger adds actual spending to Lifetime Experience and rejects atomically", () => {
  assert.deepEqual(getExperienceSpendingLedger(30, 40, 11), {
    experience: 19,
    totalExperience: 51,
  });
  const resources = { experience: 10, totalExperience: 40 };
  const allocations = [{ id: 10, points: 5 }, { id: 11, points: 8 }];
  const before = { resources: { ...resources }, allocations: structuredClone(allocations) };
  assert.throws(
    () => getExperienceSpendingLedger(resources.experience, resources.totalExperience, 18),
    /does not have enough Experience/,
  );
  assert.deepEqual({ resources, allocations }, before);
});

test("the server validates the complete Advancement plan before its first write", () => {
  const source = readFileSync("src/app/characters/actions.ts", "utf8");
  const start = source.indexOf("export async function advanceCharacterSkills(");
  const end = source.indexOf("export async function advanceCharacterSkill(", start);
  const action = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "advanceCharacterSkills action was not found");
  assert.match(action, /await db\.transaction\(async \(tx\) =>/);
  assert.ok(
    (action.match(/\.for\("update"/g) ?? []).length >= 3,
    "Character, profile, and allocation state must be locked before validation",
  );
  assert.match(
    action,
    /isSkillAllowedByCampaign\([\s\S]*?allowedSystemRows[\s\S]*?false,[\s\S]*?racialGrant\.granted/,
    "Advancement must disable Character Creation tier enforcement",
  );
  assert.doesNotMatch(
    action,
    /getCreationPurchasedSkillMaximum|maxStartingSkill|campaign\.skillPoints/,
    "Character Creation Skill budgets and starting caps do not belong in Advancement",
  );

  const ledgerIndex = action.indexOf("const ledger = getExperienceSpendingLedger(");
  const specialAbilityGuardIndex = action.indexOf(
    "!canPlayerAdvanceSkillWithExperience(",
  );
  const firstAllocationUpdate = action.indexOf(".update(campaignCharacterSkillAllocation)");
  const firstAllocationInsert = action.indexOf(".insert(campaignCharacterSkillAllocation)");
  const profileUpdate = action.indexOf(".update(campaignCharacterProfile)");
  assert.ok(ledgerIndex >= 0, "the final Experience ledger validation is required");
  assert.ok(
    specialAbilityGuardIndex >= 0 && specialAbilityGuardIndex < ledgerIndex,
    "saved Special Ability ownership must be validated before ledger calculation",
  );
  assert.ok(firstAllocationUpdate > ledgerIndex);
  assert.ok(firstAllocationInsert > ledgerIndex);
  assert.ok(profileUpdate > ledgerIndex);
});

test("an unowned Special Ability rejection leaves allocations and XP ledgers unchanged", () => {
  const phaseShift = skill(30, "Phase Shift", {
    classification: "special ability",
  });
  const resources = { experience: 30, totalExperience: 40 };
  const allocations = [{ id: 10, skillId: 1, points: 5 }];
  const before = {
    resources: { ...resources },
    allocations: structuredClone(allocations),
  };

  assert.throws(() => {
    if (!canPlayerAdvanceSkillWithExperience(phaseShift, 0)) {
      throw new Error("Special Ability must already be permanently owned.");
    }
    allocations.push({ id: 30, skillId: phaseShift.id, points: 1 });
    const ledger = getExperienceSpendingLedger(
      resources.experience,
      resources.totalExperience,
      10,
    );
    Object.assign(resources, ledger);
  }, /permanently owned/);
  assert.deepEqual({ resources, allocations }, before);
});

test("the server enforces racial caps, locks Q accounting, and preserves Lifetime XP", () => {
  const source = readFileSync("src/app/characters/actions.ts", "utf8");
  const start = source.indexOf("export async function spendCharacterQuintessence(");
  const end = source.indexOf("function revalidateCharacterAdvancementPaths(", start);
  const action = source.slice(start, end);

  assert.ok(start >= 0 && end > start, "spendCharacterQuintessence action was not found");
  assert.match(action, /await db\.transaction\(async \(tx\) =>/);
  assert.ok(
    (action.match(/\.for\("update"/g) ?? []).length >= 2,
    "Character and profile resources must be locked",
  );
  assert.match(action, /raceId: campaignCharacterProfile\.raceId/);
  assert.match(action, /\.from\(raceAttributeCap\)/);
  assert.match(action, /validateQuintessenceAttributeIncrease\(\{/);
  assert.match(action, /const ledger = getQuintessenceSpendingLedger\(/);

  const racialCapValidation = action.indexOf(
    "validatedAttributeFinalValue = validateQuintessenceAttributeIncrease({",
  );
  const ledgerValidation = action.indexOf(
    "const ledger = getQuintessenceSpendingLedger({",
  );
  const attributeWrite = action.indexOf(".update(campaignCharacterAttribute)");
  assert.ok(racialCapValidation >= 0 && racialCapValidation < ledgerValidation);
  assert.ok(ledgerValidation < attributeWrite);

  const profileWriteStart = action.indexOf(".update(campaignCharacterProfile)");
  const profileWriteEnd = action.indexOf(")\n      .where", profileWriteStart);
  const profileWrite = action.slice(profileWriteStart, profileWriteEnd);
  assert.match(profileWrite, /totalQuintessence: ledger\.totalQuintessence/);
  assert.match(profileWrite, /experience: ledger\.experience/);
  assert.doesNotMatch(profileWrite, /totalExperience\s*:/);
});

test("the Quintessence UI applies both the selected Race cap and Q affordability", () => {
  const source = readFileSync(
    "src/app/realms/characters/[characterId]/advance/advance-workspace.tsx",
    "utf8",
  );

  assert.match(source, /getRaceAttributeCap\([\s\S]*?aggregate\.selectedRace/);
  assert.match(source, /getMaximumQuintessenceAttributeIncrease\(\{/);
  assert.match(source, /maximum={maximumAttributeQuantity}/);
  assert.match(source, /Racial maximum .* reached\./);
});

import type { CampaignSystem } from "@/db/campaign-schema";

export const CHARACTER_ATTRIBUTE_KEYS = ["STR", "DEX", "CON", "INT", "WIS", "CHR"] as const;
export type CharacterAttributeKey = (typeof CHARACTER_ATTRIBUTE_KEYS)[number];

export const CHARACTER_ATTRIBUTE_LABELS: Record<CharacterAttributeKey, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHR: "Charisma",
};

export type CharacterCore = {
  id: number;
  campaignId: number;
  playerUserId: string;
  name: string;
  campaignName: string;
  playerUsername: string;
  createdAt: string;
  updatedAt: string;
  isNpc: boolean;
  npcKind: "race" | "creature";
};

export type CharacterProfile = {
  characterId: number;
  raceId: number | null;
  age: number | null;
  sex: string;
  heightFeet: number | null;
  heightInches: number | null;
  weight: number | null;
  skinColor: string;
  eyeColor: string;
  hairColor: string;
  deity: string;
  definingMarks: string;
  personality: string;
  goals: string;
  secrets: string;
  backstory: string;
  motivations: string;
  fame: number;
  experience: number;
  totalExperience: number;
  quintessence: number;
  totalQuintessence: number;
  fatePoints: number | null;
  creditsRemaining: number;
  creationCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CharacterAttributeAllocation = {
  characterId: number;
  attributeKey: CharacterAttributeKey;
  value: number;
};

export type CharacterSkillAllocation = {
  id: number;
  characterId: number;
  skillId: number;
  skillName: string;
  skillClassification: string;
  skillTier: number | null;
  primaryAttribute: string | null;
  parentAllocationId: number | null;
  points: number;
  createdAt: string;
  updatedAt: string;
};

export type CharacterOwnedItem = {
  characterId: number;
  itemId: number;
  canonicalId: string;
  name: string;
  catalogScope: string;
  equipmentGroup: string | null;
  recordType: string;
  category: string;
  quantity: number;
  unitCostCredits: number;
  acquiredAt: string;
};

export type CharacterCurrencyHolding = {
  characterId: number;
  currencyId: number;
  quantity: number;
};

export type CharacterCampaignRules = {
  id: number;
  name: string;
  attributePoints: number;
  skillPoints: number;
  maxStartingSkill: number;
  pointsToUnlockNextTier: number;
  maxPointsInSkill: number;
  startingCreditAmount: number;
  currencySystem: "Credits" | "Derived Currency";
  fatePointMethod: "Assigned" | "Rolled";
  assignedFatePoints: number | null;
  allowedSystems: CampaignSystem[];
  derivedCurrencies: Array<{
    id: number;
    campaignId: number;
    name: string;
    description: string;
    creditsPerUnit: number;
    sortOrder: number;
  }>;
};

export type CharacterRaceSummary = { id: number; name: string };

export type CharacterRaceAggregate = {
  race: {
    id: number;
    name: string;
    size: string;
    baseMagic: number | null;
    ageMin: number | null;
    ageMax: number | null;
    ageRangeText: string;
    physicalDescription: string;
    racialQuirkName: string;
    quirkSuccessEffect: string;
    quirkFailureEffect: string;
  };
  attributeCaps: Array<{ attributeKey: string; maxValue: number }>;
  movementModes: Array<{ movementMode: string; baseValue: number; notes: string }>;
  skillLinks: Array<{
    skillId: number;
    skillName: string;
    skillClassification: string;
    linkType: string;
    value: number | null;
  }>;
};

export type CharacterSkillReference = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
  primaryAttribute: string | null;
  secondaryAttribute: string | null;
  definition: string;
  spellLevel: string | null;
  manaCost: number | null;
  spellDocumentJson: string | null;
};

export type CharacterSkillRelationship = {
  skillId: number;
  relatedSkillId: number;
  relationshipType: string;
  sortOrder: number;
};

export type CharacterAuthorizedItem = {
  id: number;
  canonicalId: string;
  name: string;
  catalogScope: string;
  equipmentGroup: string | null;
  recordType: string;
  category: string;
  credits: number | null;
  priceBasis: string;
  description: string;
  weight: number | null;
  weightUnit: string;
  size: string;
  durability: number | null;
  weaponType: string | null;
  handedness: string | null;
  damage: string | null;
  damageType: string | null;
  rangeText: string | null;
  reachText: string | null;
  weaponRulesText: string | null;
  armorType: string | null;
  coverage: string | null;
  baseSoak: number | null;
  armorDamageModifiers: string | null;
  armorRulesText: string | null;
};

export type CharacterAggregate = {
  character: CharacterCore;
  profile: CharacterProfile;
  attributes: CharacterAttributeAllocation[];
  skillAllocations: CharacterSkillAllocation[];
  items: CharacterOwnedItem[];
  currencyHoldings: CharacterCurrencyHolding[];
  campaign: CharacterCampaignRules;
  allowedRaces: CharacterRaceSummary[];
  selectedRace: CharacterRaceAggregate | null;
  skillCatalog: CharacterSkillReference[];
  skillRelationships: CharacterSkillRelationship[];
  authorizedItems: CharacterAuthorizedItem[];
};

export type CharacterSkillAllocationDraft = {
  draftId: number;
  skillId: number;
  parentDraftId: number | null;
  points: number;
};

export type CharacterDraft = {
  name: string;
  profile: Omit<CharacterProfile, "characterId" | "creationCompletedAt" | "createdAt" | "updatedAt">;
  attributes: Record<CharacterAttributeKey, number>;
  skillAllocations: CharacterSkillAllocationDraft[];
  items: Array<{ itemId: number; quantity: number; unitCostCredits: number }>;
  currencyHoldings: Array<{ currencyId: number; quantity: number }>;
};

export type CharacterReadiness = {
  ready: boolean;
  identityComplete: boolean;
  raceComplete: boolean;
  attributesComplete: boolean;
  skillsComplete: boolean;
  storyComplete: boolean;
  equipmentComplete: boolean;
  attributesUsed: number;
  skillPointsUsed: number;
  fundsRemaining: number;
  issues: string[];
};

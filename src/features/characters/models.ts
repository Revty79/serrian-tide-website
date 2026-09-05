import type { CampaignSystem } from "@/db/campaign-schema";
import type {
  CharacterDerivedAbilityOwnership,
  CharacterDerivedAbilityStatus,
  DerivedAbilityDefinition,
} from "@/features/derived-abilities/models";
import type { DraftOwnedItemInstance } from "@/features/items/item-ownership";
import type { ItemRuntimeProfile } from "@/features/items/item-runtime";

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
  npcBuildMode?: "simple" | "detailed" | null;
  npcRoleLabel?: string;
  archivedAt?: string | null;
  archiveReason?: string;
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
  hpMultiplierSteps: number;
  baseMovementSteps: number;
  baseMagicSteps: number;
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

export type CharacterAttributeReferenceKey = Extract<
  CharacterAttributeKey,
  "STR" | "INT" | "WIS" | "CHR"
>;

export type CharacterAttributeReference = {
  attributeKey: CharacterAttributeReferenceKey;
  score: number;
  maxCarry: number | null;
  maxLift: number | null;
  maxSpheres: number | null;
  spellWeaving: number | null;
  teachingBase: number | null;
  loyaltyBase: number | null;
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
  weight: number | null;
  weightUnit: string;
  acquiredAt: string;
};

export type CharacterOwnedItemInstance = {
  id: number;
  characterId: number;
  itemId: number;
  canonicalId: string;
  name: string;
  catalogScope: string;
  equipmentGroup: string | null;
  recordType: string;
  category: string;
  isMagical: boolean;
  currentCharges: number;
  unitCostCredits: number;
  weight: number | null;
  weightUnit: string;
  acquiredAt: string;
  runtimeProfile: ItemRuntimeProfile;
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

export type CharacterRaceSummary = { id: number; name: string; archived?: boolean };

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
  archived?: boolean;
};

export type CharacterSkillRelationship = {
  skillId: number;
  relatedSkillId: number;
  relationshipType: string;
  sortOrder: number;
};

export type CharacterPersonalSpell = {
  id: number;
  documentId: string;
  name: string;
  tradition: string;
  documentJson: string;
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
  isMagical: boolean;
  effectCount: number;
  runtimeProfile: ItemRuntimeProfile;
  weaponProfileId?: number | null;
  isFirearm?: boolean;
  weaponType: string | null;
  handedness: string | null;
  damageSource: string | null;
  damage: string | null;
  damageType: string | null;
  ammunitionItemId: number | null;
  ammunitionItemName: string | null;
  ammunitionDamage: string | null;
  ammunitionDamageType: string | null;
  rangeText: string | null;
  reachText: string | null;
  weaponRulesText: string | null;
  armorType: string | null;
  coverage: string | null;
  baseSoak: number | null;
  armorDamageModifiers: string | null;
  armorRulesText: string | null;
  archived?: boolean;
};

export type CharacterAggregate = {
  character: CharacterCore;
  profile: CharacterProfile;
  attributes: CharacterAttributeAllocation[];
  attributeReferenceCatalog: CharacterAttributeReference[];
  skillAllocations: CharacterSkillAllocation[];
  items: CharacterOwnedItem[];
  itemInstances: CharacterOwnedItemInstance[];
  currencyHoldings: CharacterCurrencyHolding[];
  campaign: CharacterCampaignRules;
  allowedRaces: CharacterRaceSummary[];
  selectedRace: CharacterRaceAggregate | null;
  skillCatalog: CharacterSkillReference[];
  skillRelationships: CharacterSkillRelationship[];
  personalSpellbook: CharacterPersonalSpell[];
  authorizedItems: CharacterAuthorizedItem[];
  derivedAbilities: DerivedAbilityDefinition[];
  derivedAbilityOwnerships: CharacterDerivedAbilityOwnership[];
  derivedAbilityStatuses: CharacterDerivedAbilityStatus[];
  effectiveDerivedAbilityIds: number[];
};

export type CharacterSkillAllocationDraft = {
  draftId: number;
  skillId: number;
  parentDraftId: number | null;
  points: number;
};

export type CharacterDraft = {
  name: string;
  npcRoleLabel?: string;
  profile: Omit<CharacterProfile, "characterId" | "creationCompletedAt" | "createdAt" | "updatedAt">;
  attributes: Record<CharacterAttributeKey, number>;
  skillAllocations: CharacterSkillAllocationDraft[];
  items: Array<{ itemId: number; quantity: number; unitCostCredits: number }>;
  itemInstances: DraftOwnedItemInstance[];
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

import type { InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import type { CreatureAttackAuthoring } from "./creature-authoring";
import type { CreatureAbilityDefinition } from "./creature-ability";
import type { CreatureCrImpact } from "@/db/creature-schema";
import type { CreatureForm } from "./creature-forms";

export type CreatureLineageSummary = {
  id: number;
  canonicalId: string;
  canonicalName: string;
  size: string;
  challengeRating: number | null;
  killXp: number | null;
  archivedAt: string | null;
};

export type CreatureDraft = {
  id?: number;
  forms?: CreatureForm[];
  core: {
    interactionRules?: InteractionRuleProfile | null;
    canonicalId: string;
    canonicalName: string;
    family: string;
    creatureType: string;
    size: string;
    hpMultiplierSteps: number;
    totalHp: number | null;
    baseMovementSteps: number;
    baseMagicSteps: number;
    challengeRating: number | null;
    killXp: number | null;
    parentCreatureId: number | null;
    parentCreatureName: string | null;
    calculatedChallengeRating: number | null;
    challengeRatingAdjustment: number;
    challengeRatingAdjustmentReason: string;
    description: string;
    typicalBehavior: string;
    habitatEcology: string;
    notes: string;
    sourceSystem: string | null;
  };
  attributes: Array<{ attributeKey: string; value: number | null; notes: string; sortOrder: number }>;
  movement: Array<{ movementMode: string; movementValue: number | null; initiative: number | null; requirements: string; notes: string; sortOrder: number }>;
  hpPools: Array<{ canonicalId: string; poolName: string; hpPercentage: number | null; maximumHp: number | null; notes: string; sortOrder: number }>;
  hitLocations: Array<{ hitLocationNumber: number; locationName: string; bodyPartsIncluded: string; hpPoolCanonicalId: string | null; naturalArmor: number | null; soak: number | null; locationEffect: string; notes: string; sortOrder: number }>;
  attacks: Array<{ authoring?: CreatureAttackAuthoring | null; canonicalId: string; attackName: string; attackPercentage: number | null; damage: string | null; damageType: string; rangeReach: string; requiredAnatomy: string; requirements: string; usesRecharge: string; specialEffect: string; notes: string; sortOrder: number }>;
  skillLinks: Array<{ skillId: number; skillName: string; skillClassification: string; rank: string | null; notes: string; sortOrder: number }>;
  abilities: Array<Omit<CreatureAbilityDefinition, "crImpact"> & { crImpact: CreatureCrImpact }>;
  defenses: Array<{ seedIdentity: string | null; defenseType: string; against: string; value: string | null; notes: string; sortOrder: number; crImpact: CreatureCrImpact }>;
  uses: Array<{ seedIdentity: string | null; useName: string; notes: string; sortOrder: number }>;
  derivedCreatures: CreatureLineageSummary[];
};

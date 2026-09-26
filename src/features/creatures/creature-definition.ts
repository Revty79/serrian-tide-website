import { normalizeAttackDescription } from "@/features/attacks/attack-authoring";
import { normalizeInteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import { normalizeCreatureAttackAuthoring, normalizeCreatureAbilityAuthoring } from "./creature-authoring";
import { normalizeCreatureAbilityEffects } from "./creature-ability";
import { CREATURE_SIZE_OPTIONS, CREATURE_CR_IMPACTS, type CreatureSize, type CreatureCrImpact } from "@/db/creature-schema";
import type { CreatureDraft } from "./models";

const ATTRIBUTE_NAMES = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"] as const;

const clean = (value: string | null | undefined) => value?.trim() ?? "";
const optionalText = (value: string | null | undefined) => clean(value) || null;

function required(value: string | null | undefined, label: string) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function optionalNumber(value: number | null, label: string) {
  if (value === null) return null;
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number or left blank.`);
  return value;
}

function wholeNumber(value: number, label: string, minimum: number, maximum?: number) {
  if (!Number.isInteger(value) || value < minimum || (maximum !== undefined && value > maximum)) {
    throw new Error(`${label} must be a whole number from ${minimum}${maximum === undefined ? " upward" : ` through ${maximum}`}.`);
  }
  return value;
}

function ensureUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) throw new Error(`${label} ${JSON.stringify(value)} is duplicated.`);
    seen.add(key);
  }
}

export function normalizeCreatureDefinition(input: CreatureDraft) {
  const canonicalId = required(input.core.canonicalId, "Creature ID").toLocaleUpperCase("en-US");
  const canonicalName = required(input.core.canonicalName, "Canonical Name");
  const size = clean(input.core.size);
  if (!CREATURE_SIZE_OPTIONS.includes(size as CreatureSize)) {
    throw new Error(`Creature Size must be one of: ${CREATURE_SIZE_OPTIONS.join(", ")}.`);
  }

  const attributes = input.attributes.map((row, sortOrder) => {
    const attributeKey = required(row.attributeKey, "Attribute");
    if (!ATTRIBUTE_NAMES.includes(attributeKey as (typeof ATTRIBUTE_NAMES)[number])) {
      throw new Error(`${attributeKey} is not a canonical Creature Attribute.`);
    }
    return { attributeKey, value: optionalNumber(row.value, `${attributeKey} Value`), notes: clean(row.notes), sortOrder };
  });
  ensureUnique(attributes.map(({ attributeKey }) => attributeKey), "Attribute assignment");

  const movement = input.movement.map((row, sortOrder) => ({
    movementMode: required(row.movementMode, "Movement Mode"),
    movementValue: optionalNumber(row.movementValue, `${row.movementMode || "Movement"} Value`),
    initiative: optionalNumber(row.initiative, `${row.movementMode || "Movement"} Initiative`),
    requirements: clean(row.requirements),
    notes: clean(row.notes),
    sortOrder,
  }));
  ensureUnique(movement.map(({ movementMode }) => movementMode), "Movement assignment");

  const hpPools = input.hpPools.map((row, sortOrder) => ({
    canonicalId: required(row.canonicalId, "HP Pool ID").toLocaleUpperCase("en-US"),
    poolName: required(row.poolName, "HP Pool Name"),
    hpPercentage: optionalNumber(row.hpPercentage, `${row.poolName || "HP Pool"} HP %`),
    maximumHp: null as number | null,
    notes: clean(row.notes),
    sortOrder,
  }));
  ensureUnique(hpPools.map(({ canonicalId }) => canonicalId), "HP Pool ID");
  const hpPoolIds = new Set(hpPools.map(({ canonicalId }) => canonicalId.toLowerCase()));

  const hitLocations = input.hitLocations.map((row, sortOrder) => {
    const hpPoolCanonicalId = optionalText(row.hpPoolCanonicalId)?.toLocaleUpperCase("en-US") ?? null;
    if (hpPoolCanonicalId && !hpPoolIds.has(hpPoolCanonicalId.toLowerCase())) {
      throw new Error(`Hit Location ${row.hitLocationNumber} references missing HP Pool ${JSON.stringify(hpPoolCanonicalId)}.`);
    }
    return {
      hitLocationNumber: wholeNumber(row.hitLocationNumber, "Hit Location #", 0, 9),
      locationName: clean(row.locationName),
      bodyPartsIncluded: clean(row.bodyPartsIncluded),
      hpPoolCanonicalId,
      naturalArmor: optionalNumber(row.naturalArmor, `Hit Location ${row.hitLocationNumber} Natural Armor`),
      soak: optionalNumber(row.soak, `Hit Location ${row.hitLocationNumber} Soak`),
      locationEffect: clean(row.locationEffect),
      notes: clean(row.notes),
      sortOrder,
    };
  });
  ensureUnique(hitLocations.map(({ hitLocationNumber }) => String(hitLocationNumber)), "Hit Location");

  const attacks = input.attacks.map((row, sortOrder) => ({
    ...normalizeAttackDescription(row),
    canonicalId: required(row.canonicalId, "Attack ID").toLocaleUpperCase("en-US"),
    attackPercentage: optionalNumber(row.attackPercentage, `${row.attackName || "Attack"} Attack %`),
    rangeReach: clean(row.rangeReach),
    requiredAnatomy: clean(row.requiredAnatomy),
    requirements: clean(row.requirements),
    usesRecharge: clean(row.usesRecharge),
    specialEffect: clean(row.specialEffect),
    authoring: normalizeCreatureAttackAuthoring(row.authoring),
    sortOrder,
  }));
  ensureUnique(attacks.map(({ canonicalId }) => canonicalId), "Attack ID");

  const skillLinks = input.skillLinks.map((row, sortOrder) => {
    if (!Number.isInteger(row.skillId) || row.skillId <= 0) throw new Error("Every Creature Skill must reference a saved Skill.");
    return {
      skillId: row.skillId,
      skillName: clean(row.skillName),
      skillClassification: clean(row.skillClassification),
      rank: optionalText(row.rank),
      notes: clean(row.notes),
      sortOrder,
    };
  });
  ensureUnique(skillLinks.map(({ skillId }) => String(skillId)), "Creature Skill assignment");

  const abilities = input.abilities.map((row, sortOrder) => ({
    canonicalId: required(row.canonicalId, "Ability ID").toLocaleUpperCase("en-US"),
    abilityName: required(row.abilityName, "Ability Name"),
    abilityType: clean(row.abilityType),
    activation: clean(row.activation),
    requirements: clean(row.requirements),
    usesRecharge: clean(row.usesRecharge),
    description: clean(row.description),
    mechanicalEffect: clean(row.mechanicalEffect),
    notes: clean(row.notes),
    sortOrder,
    crImpact: CREATURE_CR_IMPACTS.includes(row.crImpact) ? row.crImpact : "None" as CreatureCrImpact,
    effects: normalizeCreatureAbilityEffects(row.effects),
    authoring: normalizeCreatureAbilityAuthoring(row.authoring),
  }));
  ensureUnique(abilities.map(({ canonicalId }) => canonicalId), "Ability ID");

  const defenses = input.defenses.map((row, sortOrder) => ({
    seedIdentity: optionalText(row.seedIdentity),
    defenseType: required(row.defenseType, "Defense Type"),
    against: clean(row.against),
    value: optionalText(row.value),
    notes: clean(row.notes),
    sortOrder,
    crImpact: CREATURE_CR_IMPACTS.includes(row.crImpact) ? row.crImpact : "None" as CreatureCrImpact,
  }));

  const uses = input.uses.map((row, sortOrder) => ({
    seedIdentity: optionalText(row.seedIdentity),
    useName: required(row.useName, "Creature Use"),
    notes: clean(row.notes),
    sortOrder,
  }));

  const adjustment = Math.trunc(input.core.challengeRatingAdjustment || 0);
  if (adjustment < -49 || adjustment > 49) throw new Error("Challenge Rating Adjustment must be between -49 and 49.");
  const adjustmentReason = clean(input.core.challengeRatingAdjustmentReason);
  if (adjustment !== 0 && !adjustmentReason) throw new Error("A Challenge Rating adjustment requires a reason.");

  return {
    core: {
      interactionRules: normalizeInteractionRuleProfile(input.core.interactionRules, "creature"),
      canonicalId,
      canonicalName,
      family: clean(input.core.family),
      creatureType: clean(input.core.creatureType),
      size,
      hpMultiplierSteps: wholeNumber(input.core.hpMultiplierSteps ?? 0, "HP Multiplier Steps", 0),
      totalHp: null as number | null,
      baseMovementSteps: wholeNumber(input.core.baseMovementSteps ?? 0, "Base Movement Steps", 0),
      baseMagicSteps: wholeNumber(input.core.baseMagicSteps ?? 0, "Base Magic Steps", 0),
      challengeRating: input.core.challengeRating === null ? 1 : wholeNumber(input.core.challengeRating, "Challenge Rating", 1, 50),
      killXp: null as number | null,
      parentCreatureId: input.core.parentCreatureId,
      calculatedChallengeRating: input.core.calculatedChallengeRating,
      challengeRatingAdjustment: adjustment,
      challengeRatingAdjustmentReason: adjustmentReason,
      description: clean(input.core.description),
      typicalBehavior: clean(input.core.typicalBehavior),
      habitatEcology: clean(input.core.habitatEcology),
      notes: clean(input.core.notes),
      sourceSystem: optionalText(input.core.sourceSystem),
    },
    attributes,
    movement,
    hpPools,
    hitLocations,
    attacks,
    skillLinks,
    abilities,
    defenses,
    uses,
  };
}

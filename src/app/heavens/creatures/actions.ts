"use server";

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  CREATURE_CR_IMPACTS,
  CREATURE_SIZE_OPTIONS,
  challengeRatingReference,
  creature,
  creatureAbility,
  creatureAbilityEffect,
  creatureAttack,
  creatureAttribute,
  creatureDefense,
  creatureHitLocation,
  creatureHpPool,
  creatureMovement,
  creatureSkillLink,
  creatureUse,
  type CreatureCrImpact,
  type CreatureSize,
} from "@/db/creature-schema";
import { db } from "@/db";
import { skill } from "@/db/skill-schema";
import {
  calculateCreatureChallengeRating,
  getCreatureKillXpForChallengeRating,
  type ChallengeRatingBreakdown,
} from "@/features/creatures/challenge-rating";
import {
  normalizeCreatureAbilityEffects,
  type CreatureAbilityDefinition,
} from "@/features/creatures/creature-ability";
import {
  assertCreatureCanonicalIdsSystemOwned,
  resolveSystemAssignedCreatureIds,
} from "@/features/creatures/creature-canonical-ids";
import { resolveCreatureHpModel } from "@/features/creatures/creature-size-rules";
import { requireGod } from "@/lib/server-access";

export type CreatureLibraryFilters = {
  search?: string;
  family?: string;
  creatureType?: string;
  size?: CreatureSize | "";
  challengeRating?: number | null;
  page?: number;
  pageSize?: number;
};

export type CreatureSummary = {
  id: number;
  canonicalId: string;
  canonicalName: string;
  family: string;
  creatureType: string;
  size: string;
  challengeRating: number | null;
  killXp: number | null;
};

export type CreatureLibraryResult = {
  items: CreatureSummary[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type CreatureFacets = {
  families: string[];
  creatureTypes: string[];
};

export type ChallengeRatingReference = {
  challengeRating: number;
  threatBand: string;
  attackTargetGuidance: string;
  damageGuidance: string;
  initiativeGuidance: string;
  soakGuidance: string;
  hpToughnessGuidance: string;
  killXp: number | null;
  currentCreatureExample: string;
  exampleNotes: string;
};

export type CreatureSkillCandidate = {
  id: number;
  name: string;
  classification: string;
  tier: number | null;
};

export type CreatureLineageSummary = {
  id: number;
  canonicalId: string;
  canonicalName: string;
  size: string;
  challengeRating: number | null;
  killXp: number | null;
};

export type CreatureDraft = {
  id?: number;
  core: {
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
  attacks: Array<{ canonicalId: string; attackName: string; attackPercentage: number | null; damage: string | null; damageType: string; rangeReach: string; requiredAnatomy: string; requirements: string; usesRecharge: string; specialEffect: string; notes: string; sortOrder: number }>;
  skillLinks: Array<{ skillId: number; skillName: string; skillClassification: string; rank: string | null; notes: string; sortOrder: number }>;
  abilities: Array<Omit<CreatureAbilityDefinition, "crImpact"> & { crImpact: CreatureCrImpact }>;
  defenses: Array<{ seedIdentity: string | null; defenseType: string; against: string; value: string | null; notes: string; sortOrder: number; crImpact: CreatureCrImpact }>;
  uses: Array<{ seedIdentity: string | null; useName: string; notes: string; sortOrder: number }>;
  derivedCreatures: CreatureLineageSummary[];
};

export type CreatureAggregate = CreatureDraft & {
  id: number;
  createdAt: string;
  updatedAt: string;
  challengeRatingBreakdown?: ChallengeRatingBreakdown;
};

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

function normalize(input: CreatureDraft) {
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
    canonicalId: required(row.canonicalId, "Attack ID").toLocaleUpperCase("en-US"),
    attackName: required(row.attackName, "Attack Name"),
    attackPercentage: optionalNumber(row.attackPercentage, `${row.attackName || "Attack"} Attack %`),
    damage: optionalText(row.damage),
    damageType: clean(row.damageType),
    rangeReach: clean(row.rangeReach),
    requiredAnatomy: clean(row.requiredAnatomy),
    requirements: clean(row.requirements),
    usesRecharge: clean(row.usesRecharge),
    specialEffect: clean(row.specialEffect),
    notes: clean(row.notes),
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

export async function listCreatures(
  filters: CreatureLibraryFilters = {},
): Promise<CreatureLibraryResult> {
  await requireGod();
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 40)));
  const conditions: SQL[] = [];
  if (clean(filters.search)) conditions.push(ilike(creature.canonicalName, `%${clean(filters.search)}%`));
  if (clean(filters.family)) conditions.push(eq(creature.family, clean(filters.family)));
  if (clean(filters.creatureType)) conditions.push(eq(creature.creatureType, clean(filters.creatureType)));
  if (clean(filters.size)) conditions.push(eq(creature.size, clean(filters.size)));
  if (filters.challengeRating !== undefined && filters.challengeRating !== null) conditions.push(eq(creature.challengeRating, filters.challengeRating));
  const where = conditions.length ? and(...conditions) : undefined;
  const [countRow] = await db.select({ value: count() }).from(creature).where(where);
  const total = Number(countRow?.value ?? 0);
  const items = await db.select({
    id: creature.id,
    canonicalId: creature.canonicalId,
    canonicalName: creature.canonicalName,
    family: creature.family,
    creatureType: creature.creatureType,
    size: creature.size,
    challengeRating: creature.challengeRating,
    killXp: creature.killXp,
  }).from(creature).where(where).orderBy(asc(creature.canonicalName), asc(creature.id)).limit(pageSize).offset((page - 1) * pageSize);
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function listCreatureFacets(): Promise<CreatureFacets> {
  await requireGod();
  const [families, types] = await Promise.all([
    db.selectDistinct({ value: creature.family }).from(creature).orderBy(asc(creature.family)),
    db.selectDistinct({ value: creature.creatureType }).from(creature).orderBy(asc(creature.creatureType)),
  ]);
  return {
    families: families.map(({ value }) => value.trim()).filter(Boolean),
    creatureTypes: types.map(({ value }) => value.trim()).filter(Boolean),
  };
}

export async function listChallengeRatingReferences(): Promise<ChallengeRatingReference[]> {
  await requireGod();
  return db.select().from(challengeRatingReference).orderBy(asc(challengeRatingReference.challengeRating));
}

export async function listCreatureSkillCandidates(search = ""): Promise<CreatureSkillCandidate[]> {
  await requireGod();
  return db.select({ id: skill.id, name: skill.name, classification: skill.classification, tier: skill.tier })
    .from(skill)
    .where(clean(search) ? ilike(skill.name, `%${clean(search)}%`) : undefined)
    .orderBy(asc(skill.name), asc(skill.id))
    .limit(30);
}

export async function getCreature(id: number): Promise<CreatureAggregate | null> {
  await requireGod();
  const [row] = await db.select({
    id: creature.id,
    canonicalId: creature.canonicalId,
    canonicalName: creature.canonicalName,
    family: creature.family,
    creatureType: creature.creatureType,
    size: creature.size,
    hpMultiplierSteps: creature.hpMultiplierSteps,
    totalHp: creature.totalHp,
    baseMovementSteps: creature.baseMovementSteps,
    baseMagicSteps: creature.baseMagicSteps,
    challengeRating: creature.challengeRating,
    killXp: creature.killXp,
    parentCreatureId: creature.parentCreatureId,
    parentCreatureName: creature.canonicalName,
    calculatedChallengeRating: creature.calculatedChallengeRating,
    challengeRatingAdjustment: creature.challengeRatingAdjustment,
    challengeRatingAdjustmentReason: creature.challengeRatingAdjustmentReason,
    description: creature.description,
    typicalBehavior: creature.typicalBehavior,
    habitatEcology: creature.habitatEcology,
    notes: creature.notes,
    sourceSystem: creature.sourceSystem,
    createdAt: creature.createdAt,
    updatedAt: creature.updatedAt,
  }).from(creature).where(eq(creature.id, id)).limit(1);
  if (!row) return null;

  let parentCreatureName: string | null = null;
  if (row.parentCreatureId) {
    const [parent] = await db.select({ name: creature.canonicalName }).from(creature).where(eq(creature.id, row.parentCreatureId)).limit(1);
    parentCreatureName = parent?.name ?? null;
  }

  const [attributes, movement, pools, locations, attacks, links, abilities, defenses, uses, derivedCreatures, references] = await Promise.all([
    db.select({ attributeKey: creatureAttribute.attributeKey, value: creatureAttribute.value, notes: creatureAttribute.notes, sortOrder: creatureAttribute.sortOrder }).from(creatureAttribute).where(and(eq(creatureAttribute.creatureId, id), isNull(creatureAttribute.variantId))).orderBy(asc(creatureAttribute.sortOrder), asc(creatureAttribute.id)),
    db.select({ movementMode: creatureMovement.movementMode, movementValue: creatureMovement.movementValue, initiative: creatureMovement.initiative, requirements: creatureMovement.requirements, notes: creatureMovement.notes, sortOrder: creatureMovement.sortOrder }).from(creatureMovement).where(and(eq(creatureMovement.creatureId, id), isNull(creatureMovement.variantId))).orderBy(asc(creatureMovement.sortOrder), asc(creatureMovement.id)),
    db.select({ id: creatureHpPool.id, canonicalId: creatureHpPool.canonicalId, poolName: creatureHpPool.poolName, hpPercentage: creatureHpPool.hpPercentage, maximumHp: creatureHpPool.maximumHp, notes: creatureHpPool.notes, sortOrder: creatureHpPool.sortOrder }).from(creatureHpPool).where(and(eq(creatureHpPool.creatureId, id), isNull(creatureHpPool.variantId))).orderBy(asc(creatureHpPool.sortOrder), asc(creatureHpPool.id)),
    db.select({ hitLocationNumber: creatureHitLocation.hitLocationNumber, locationName: creatureHitLocation.locationName, bodyPartsIncluded: creatureHitLocation.bodyPartsIncluded, hpPoolId: creatureHitLocation.hpPoolId, naturalArmor: creatureHitLocation.naturalArmor, soak: creatureHitLocation.soak, locationEffect: creatureHitLocation.locationEffect, notes: creatureHitLocation.notes, sortOrder: creatureHitLocation.sortOrder }).from(creatureHitLocation).where(and(eq(creatureHitLocation.creatureId, id), isNull(creatureHitLocation.variantId))).orderBy(asc(creatureHitLocation.sortOrder), asc(creatureHitLocation.id)),
    db.select({ canonicalId: creatureAttack.canonicalId, attackName: creatureAttack.attackName, attackPercentage: creatureAttack.attackPercentage, damage: creatureAttack.damage, damageType: creatureAttack.damageType, rangeReach: creatureAttack.rangeReach, requiredAnatomy: creatureAttack.requiredAnatomy, requirements: creatureAttack.requirements, usesRecharge: creatureAttack.usesRecharge, specialEffect: creatureAttack.specialEffect, notes: creatureAttack.notes, sortOrder: creatureAttack.sortOrder }).from(creatureAttack).where(and(eq(creatureAttack.creatureId, id), isNull(creatureAttack.variantId))).orderBy(asc(creatureAttack.sortOrder), asc(creatureAttack.id)),
    db.select({ skillId: creatureSkillLink.skillId, skillName: skill.name, skillClassification: skill.classification, rank: creatureSkillLink.rank, notes: creatureSkillLink.notes, sortOrder: creatureSkillLink.sortOrder }).from(creatureSkillLink).innerJoin(skill, eq(skill.id, creatureSkillLink.skillId)).where(and(eq(creatureSkillLink.creatureId, id), isNull(creatureSkillLink.variantId))).orderBy(asc(creatureSkillLink.sortOrder), asc(creatureSkillLink.id)),
    db.select({ id: creatureAbility.id, canonicalId: creatureAbility.canonicalId, abilityName: creatureAbility.abilityName, abilityType: creatureAbility.abilityType, activation: creatureAbility.activation, requirements: creatureAbility.requirements, usesRecharge: creatureAbility.usesRecharge, description: creatureAbility.description, mechanicalEffect: creatureAbility.mechanicalEffect, notes: creatureAbility.notes, sortOrder: creatureAbility.sortOrder, crImpact: creatureAbility.crImpact }).from(creatureAbility).where(and(eq(creatureAbility.creatureId, id), isNull(creatureAbility.variantId))).orderBy(asc(creatureAbility.sortOrder), asc(creatureAbility.id)),
    db.select({ seedIdentity: creatureDefense.seedIdentity, defenseType: creatureDefense.defenseType, against: creatureDefense.against, value: creatureDefense.value, notes: creatureDefense.notes, sortOrder: creatureDefense.sortOrder, crImpact: creatureDefense.crImpact }).from(creatureDefense).where(and(eq(creatureDefense.creatureId, id), isNull(creatureDefense.variantId))).orderBy(asc(creatureDefense.sortOrder), asc(creatureDefense.id)),
    db.select({ seedIdentity: creatureUse.seedIdentity, useName: creatureUse.useName, notes: creatureUse.notes, sortOrder: creatureUse.sortOrder }).from(creatureUse).where(and(eq(creatureUse.creatureId, id), isNull(creatureUse.variantId))).orderBy(asc(creatureUse.sortOrder), asc(creatureUse.id)),
    db.select({ id: creature.id, canonicalId: creature.canonicalId, canonicalName: creature.canonicalName, size: creature.size, challengeRating: creature.challengeRating, killXp: creature.killXp }).from(creature).where(eq(creature.parentCreatureId, id)).orderBy(asc(creature.canonicalName), asc(creature.id)),
    db.select().from(challengeRatingReference).orderBy(asc(challengeRatingReference.challengeRating)),
  ]);

  const abilityEffectRows = abilities.length
    ? await db.select({
        abilityId: creatureAbilityEffect.abilityId,
        effectKey: creatureAbilityEffect.effectKey,
        schemaVersion: creatureAbilityEffect.schemaVersion,
        effect: creatureAbilityEffect.effectJson,
        sortOrder: creatureAbilityEffect.sortOrder,
      }).from(creatureAbilityEffect)
        .where(inArray(creatureAbilityEffect.abilityId, abilities.map(({ id: abilityId }) => abilityId)))
        .orderBy(asc(creatureAbilityEffect.sortOrder), asc(creatureAbilityEffect.id))
    : [];
  const abilityEffects = new Map<number, typeof abilityEffectRows>();
  for (const effect of abilityEffectRows) {
    abilityEffects.set(effect.abilityId, [...(abilityEffects.get(effect.abilityId) ?? []), effect]);
  }

  const poolIdToCanonical = new Map(pools.map((pool) => [pool.id, pool.canonicalId]));
  const draft: CreatureAggregate = {
    id: row.id,
    core: {
      canonicalId: row.canonicalId,
      canonicalName: row.canonicalName,
      family: row.family,
      creatureType: row.creatureType,
      size: row.size,
      hpMultiplierSteps: row.hpMultiplierSteps,
      totalHp: row.totalHp,
      baseMovementSteps: row.baseMovementSteps,
      baseMagicSteps: row.baseMagicSteps,
      challengeRating: row.challengeRating,
      killXp: row.killXp,
      parentCreatureId: row.parentCreatureId,
      parentCreatureName,
      calculatedChallengeRating: row.calculatedChallengeRating,
      challengeRatingAdjustment: row.challengeRatingAdjustment,
      challengeRatingAdjustmentReason: row.challengeRatingAdjustmentReason,
      description: row.description,
      typicalBehavior: row.typicalBehavior,
      habitatEcology: row.habitatEcology,
      notes: row.notes,
      sourceSystem: row.sourceSystem,
    },
    attributes,
    movement,
    hpPools: pools.map(({ canonicalId, poolName, hpPercentage, maximumHp, notes, sortOrder }) => ({
      canonicalId,
      poolName,
      hpPercentage,
      maximumHp,
      notes,
      sortOrder,
    })),
    hitLocations: locations.map(({ hpPoolId, ...location }) => ({ ...location, hpPoolCanonicalId: hpPoolId ? poolIdToCanonical.get(hpPoolId) ?? null : null })),
    attacks,
    skillLinks: links,
    abilities: abilities.map(({ id: abilityId, ...ability }) => ({
      ...ability,
      crImpact: CREATURE_CR_IMPACTS.includes(ability.crImpact as CreatureCrImpact) ? ability.crImpact as CreatureCrImpact : "None",
      effects: normalizeCreatureAbilityEffects(abilityEffects.get(abilityId) ?? []),
    })),
    defenses: defenses.map((defense) => ({ ...defense, crImpact: CREATURE_CR_IMPACTS.includes(defense.crImpact as CreatureCrImpact) ? defense.crImpact as CreatureCrImpact : "None" })),
    uses,
    derivedCreatures,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  draft.challengeRatingBreakdown = calculateCreatureChallengeRating(draft, references);
  return draft;
}

export async function saveCreature(input: CreatureDraft): Promise<CreatureAggregate> {
  const session = await requireGod();
  const normalized = normalize(input);
  const assignedIds = resolveSystemAssignedCreatureIds(normalized, input.id === undefined);
  normalized.core.canonicalId = assignedIds.coreCanonicalId;
  normalized.hpPools = normalized.hpPools.map((pool, index) => ({
    ...pool,
    canonicalId: assignedIds.hpPoolCanonicalIds[index]!,
  }));
  normalized.hitLocations = normalized.hitLocations.map((location, index) => ({
    ...location,
    hpPoolCanonicalId: assignedIds.hitLocationPoolCanonicalIds[index]!,
  }));
  normalized.attacks = normalized.attacks.map((attack, index) => ({
    ...attack,
    canonicalId: assignedIds.attackCanonicalIds[index]!,
  }));
  normalized.abilities = normalized.abilities.map((ability, index) => ({
    ...ability,
    canonicalId: assignedIds.abilityCanonicalIds[index]!,
  }));
  const hpModel = resolveCreatureHpModel(normalized, normalized.hpPools);
  normalized.core.totalHp = hpModel.calculatedTotalHp;
  normalized.hpPools = hpModel.pools;
  const references = await db.select().from(challengeRatingReference).orderBy(asc(challengeRatingReference.challengeRating));
  const calculation = calculateCreatureChallengeRating({ ...normalized, core: normalized.core }, references);
  normalized.core.calculatedChallengeRating = calculation.calculatedRating;
  normalized.core.challengeRating = calculation.finalRating;
  normalized.core.killXp = calculation.killXp;

  const savedId = await db.transaction(async (tx) => {
    let id = input.id;
    if (id === undefined) {
      const [created] = await tx.insert(creature).values({ ...normalized.core, createdByUserId: session.user.id }).returning({ id: creature.id });
      id = created.id;
    } else {
      const [stored] = await tx
        .select({
          canonicalId: creature.canonicalId,
          parentCreatureId: creature.parentCreatureId,
          sourceSystem: creature.sourceSystem,
        })
        .from(creature)
        .where(eq(creature.id, id))
        .limit(1);
      if (!stored) throw new Error("That Creature no longer exists.");
      if (stored.canonicalId !== normalized.core.canonicalId) {
        throw new Error("Canonical Creature IDs are generated by the system and cannot be changed after creation.");
      }
      if (stored.parentCreatureId !== normalized.core.parentCreatureId) {
        throw new Error("Creature lineage cannot be changed after creation.");
      }
      if (stored.sourceSystem !== normalized.core.sourceSystem) {
        throw new Error("Canonical Creature source identity cannot be changed.");
      }
      const updated = await tx.update(creature).set({ ...normalized.core, updatedAt: new Date() }).where(eq(creature.id, id)).returning({ id: creature.id });
      if (!updated.length) throw new Error("That Creature no longer exists.");
    }

    const [storedAbilities, storedPools, storedAttacks] = await Promise.all([
      tx.select({
        id: creatureAbility.id,
        canonicalId: creatureAbility.canonicalId,
      }).from(creatureAbility).where(and(
        eq(creatureAbility.creatureId, id),
        isNull(creatureAbility.variantId),
      )),
      tx.select({ canonicalId: creatureHpPool.canonicalId }).from(creatureHpPool).where(and(
        eq(creatureHpPool.creatureId, id),
        isNull(creatureHpPool.variantId),
      )),
      tx.select({ canonicalId: creatureAttack.canonicalId }).from(creatureAttack).where(and(
        eq(creatureAttack.creatureId, id),
        isNull(creatureAttack.variantId),
      )),
    ]);
    if (input.id !== undefined) {
      assertCreatureCanonicalIdsSystemOwned(input.hpPools, storedPools, "HP Pool");
      assertCreatureCanonicalIdsSystemOwned(input.attacks, storedAttacks, "Attack");
      assertCreatureCanonicalIdsSystemOwned(input.abilities, storedAbilities, "Ability");
    }
    const nextAbilityIds = new Set(
      normalized.abilities.map(({ canonicalId }) => canonicalId.toLocaleLowerCase("en-US")),
    );
    const removedAbilityIds = storedAbilities
      .filter(({ canonicalId }) => !nextAbilityIds.has(canonicalId.toLocaleLowerCase("en-US")))
      .map(({ id: abilityId }) => abilityId);
    if (removedAbilityIds.length) {
      await tx.delete(creatureAbility).where(inArray(creatureAbility.id, removedAbilityIds));
    }
    const storedAbilityByCanonicalId = new Map(
      storedAbilities.map((entry) => [entry.canonicalId.toLocaleLowerCase("en-US"), entry]),
    );

    await tx.delete(creatureHitLocation).where(and(eq(creatureHitLocation.creatureId, id), isNull(creatureHitLocation.variantId)));
    await tx.delete(creatureAttribute).where(and(eq(creatureAttribute.creatureId, id), isNull(creatureAttribute.variantId)));
    await tx.delete(creatureMovement).where(and(eq(creatureMovement.creatureId, id), isNull(creatureMovement.variantId)));
    await tx.delete(creatureAttack).where(and(eq(creatureAttack.creatureId, id), isNull(creatureAttack.variantId)));
    await tx.delete(creatureSkillLink).where(and(eq(creatureSkillLink.creatureId, id), isNull(creatureSkillLink.variantId)));
    await tx.delete(creatureDefense).where(and(eq(creatureDefense.creatureId, id), isNull(creatureDefense.variantId)));
    await tx.delete(creatureUse).where(and(eq(creatureUse.creatureId, id), isNull(creatureUse.variantId)));
    await tx.delete(creatureHpPool).where(and(eq(creatureHpPool.creatureId, id), isNull(creatureHpPool.variantId)));

    if (normalized.attributes.length) await tx.insert(creatureAttribute).values(normalized.attributes.map((row) => ({ creatureId: id!, variantId: null, ...row })));
    if (normalized.movement.length) await tx.insert(creatureMovement).values(normalized.movement.map((row) => ({ creatureId: id!, variantId: null, ...row })));

    const poolMap = new Map<string, number>();
    for (const pool of normalized.hpPools) {
      const [created] = await tx.insert(creatureHpPool).values({ creatureId: id!, variantId: null, ...pool }).returning({ id: creatureHpPool.id });
      poolMap.set(pool.canonicalId.toLowerCase(), created.id);
    }
    if (normalized.hitLocations.length) {
      await tx.insert(creatureHitLocation).values(normalized.hitLocations.map(({ hpPoolCanonicalId, ...location }) => ({
        creatureId: id!,
        variantId: null,
        hpPoolId: hpPoolCanonicalId ? poolMap.get(hpPoolCanonicalId.toLowerCase()) ?? null : null,
        ...location,
      })));
    }
    if (normalized.attacks.length) await tx.insert(creatureAttack).values(normalized.attacks.map((row) => ({ creatureId: id!, variantId: null, ...row })));
    if (normalized.skillLinks.length) {
      const skillIds = [...new Set(normalized.skillLinks.map(({ skillId }) => skillId))];
      const existing = await tx.select({ id: skill.id }).from(skill).where(inArray(skill.id, skillIds));
      if (existing.length !== skillIds.length) throw new Error("One or more linked Skills no longer exist.");
      await tx.insert(creatureSkillLink).values(normalized.skillLinks.map(({ skillId, rank, notes, sortOrder }) => ({
        creatureId: id!,
        variantId: null,
        skillId,
        rank,
        notes,
        sortOrder,
      })));
    }
    for (const { effects, ...ability } of normalized.abilities) {
      const storedAbility = storedAbilityByCanonicalId.get(ability.canonicalId.toLocaleLowerCase("en-US"));
      const abilityId = storedAbility
        ? storedAbility.id
        : (await tx.insert(creatureAbility).values({ creatureId: id!, variantId: null, ...ability }).returning({ id: creatureAbility.id }))[0].id;
      if (storedAbility) {
        await tx.update(creatureAbility).set({ ...ability, updatedAt: new Date() }).where(eq(creatureAbility.id, abilityId));
      }

      const storedEffects = await tx.select({
        id: creatureAbilityEffect.id,
        effectKey: creatureAbilityEffect.effectKey,
      }).from(creatureAbilityEffect).where(eq(creatureAbilityEffect.abilityId, abilityId));
      const nextEffectKeys = new Set(effects.map(({ effectKey }) => effectKey.toLocaleLowerCase("en-US")));
      const removedEffectIds = storedEffects
        .filter(({ effectKey }) => !nextEffectKeys.has(effectKey.toLocaleLowerCase("en-US")))
        .map(({ id: effectId }) => effectId);
      if (removedEffectIds.length) {
        await tx.delete(creatureAbilityEffect).where(inArray(creatureAbilityEffect.id, removedEffectIds));
      }
      if (storedEffects.length) {
        await tx.update(creatureAbilityEffect)
          .set({ sortOrder: sql`${creatureAbilityEffect.sortOrder} + 1000000` })
          .where(eq(creatureAbilityEffect.abilityId, abilityId));
      }
      const storedEffectByKey = new Map(
        storedEffects.map((entry) => [entry.effectKey.toLocaleLowerCase("en-US"), entry]),
      );
      for (const effect of effects) {
        const values = {
          effectKey: effect.effectKey,
          schemaVersion: effect.schemaVersion,
          effectJson: effect.effect,
          sortOrder: effect.sortOrder,
          updatedAt: new Date(),
        };
        const storedEffect = storedEffectByKey.get(effect.effectKey.toLocaleLowerCase("en-US"));
        if (storedEffect) {
          await tx.update(creatureAbilityEffect).set(values).where(eq(creatureAbilityEffect.id, storedEffect.id));
        } else {
          await tx.insert(creatureAbilityEffect).values({ abilityId, ...values });
        }
      }
    }
    if (normalized.defenses.length) await tx.insert(creatureDefense).values(normalized.defenses.map((row) => ({ creatureId: id!, variantId: null, ...row })));
    if (normalized.uses.length) await tx.insert(creatureUse).values(normalized.uses.map((row) => ({ creatureId: id!, variantId: null, ...row })));

    return id;
  });

  revalidatePath("/heavens/creatures");
  const saved = await getCreature(savedId);
  if (!saved) throw new Error("The saved Creature could not be reloaded.");
  return saved;
}

export async function createDerivedCreature(parentCreatureId: number, variantName: string): Promise<CreatureAggregate> {
  const session = await requireGod();
  const name = required(variantName, "Variant Name");
  const savedId = await db.transaction(async (tx) => {
    const [parent] = await tx
      .select()
      .from(creature)
      .where(eq(creature.id, parentCreatureId))
      .limit(1);
    if (!parent) throw new Error("Parent Creature not found.");
    if (parent.challengeRating === null) {
      throw new Error("The parent Creature has no final Challenge Rating.");
    }
    const rewardReferences = await tx
      .select({
        challengeRating: challengeRatingReference.challengeRating,
        killXp: challengeRatingReference.killXp,
      })
      .from(challengeRatingReference)
      .where(eq(challengeRatingReference.challengeRating, parent.challengeRating))
      .limit(1);
    const killXp = getCreatureKillXpForChallengeRating(
      parent.challengeRating,
      rewardReferences,
    );
    const [parentAttributes, parentPools, parentHitLocations] = await Promise.all([
      tx.select({
        attributeKey: creatureAttribute.attributeKey,
        value: creatureAttribute.value,
      }).from(creatureAttribute).where(and(
        eq(creatureAttribute.creatureId, parentCreatureId),
        isNull(creatureAttribute.variantId),
      )).orderBy(asc(creatureAttribute.sortOrder), asc(creatureAttribute.id)),
      tx.select({
        id: creatureHpPool.id,
        poolName: creatureHpPool.poolName,
        hpPercentage: creatureHpPool.hpPercentage,
        notes: creatureHpPool.notes,
        sortOrder: creatureHpPool.sortOrder,
      }).from(creatureHpPool).where(and(
        eq(creatureHpPool.creatureId, parentCreatureId),
        isNull(creatureHpPool.variantId),
      )).orderBy(asc(creatureHpPool.sortOrder), asc(creatureHpPool.id)),
      tx.select({
        hitLocationNumber: creatureHitLocation.hitLocationNumber,
        locationName: creatureHitLocation.locationName,
        bodyPartsIncluded: creatureHitLocation.bodyPartsIncluded,
        hpPoolId: creatureHitLocation.hpPoolId,
        naturalArmor: creatureHitLocation.naturalArmor,
        soak: creatureHitLocation.soak,
        locationEffect: creatureHitLocation.locationEffect,
        notes: creatureHitLocation.notes,
        sortOrder: creatureHitLocation.sortOrder,
      }).from(creatureHitLocation).where(and(
        eq(creatureHitLocation.creatureId, parentCreatureId),
        isNull(creatureHitLocation.variantId),
      )).orderBy(asc(creatureHitLocation.sortOrder), asc(creatureHitLocation.id)),
    ]);
    const parentHpModel = resolveCreatureHpModel(
      {
        core: parent,
        attributes: parentAttributes,
      },
      parentPools.map((pool) => ({ ...pool, canonicalId: String(pool.id) })),
    );

    let rootId = parentCreatureId;
    let rootCanonicalId = parent.canonicalId;
    let nextParentId = parent.parentCreatureId;
    while (nextParentId !== null) {
      rootId = nextParentId;
      const [ancestor] = await tx
        .select({ canonicalId: creature.canonicalId, parentCreatureId: creature.parentCreatureId })
        .from(creature)
        .where(eq(creature.id, rootId))
        .limit(1);
      if (!ancestor) throw new Error("The parent Creature lineage is incomplete.");
      rootCanonicalId = ancestor.canonicalId;
      nextParentId = ancestor.parentCreatureId;
    }
    const rootToken = rootCanonicalId
      .replace(/^(CR|VAR)-/i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLocaleUpperCase("en-US");
    if (!rootToken) throw new Error("The parent Creature ID cannot produce a Variant ID.");

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`serrian-tide:creature-variant:${rootId}`}))`);
    let canonicalId: string | null = null;
    for (let sequence = 1; sequence <= 9999; sequence += 1) {
      const candidate = `VAR-${rootToken}-${String(sequence).padStart(3, "0")}`;
      const [existing] = await tx
        .select({ id: creature.id })
        .from(creature)
        .where(eq(creature.canonicalId, candidate))
        .limit(1);
      if (!existing) {
        canonicalId = candidate;
        break;
      }
    }
    if (!canonicalId) throw new Error("No available Variant ID remains for this Creature family.");

    const [created] = await tx
      .insert(creature)
      .values({
        canonicalId,
        canonicalName: name,
        family: parent.family,
        creatureType: parent.creatureType,
        size: parent.size,
        hpMultiplierSteps: parent.hpMultiplierSteps,
        totalHp: parentHpModel.calculatedTotalHp,
        baseMovementSteps: parent.baseMovementSteps,
        baseMagicSteps: parent.baseMagicSteps,
        challengeRating: parent.challengeRating,
        killXp,
        description: parent.description,
        typicalBehavior: parent.typicalBehavior,
        habitatEcology: parent.habitatEcology,
        notes: parent.notes,
        createdByUserId: session.user.id,
        sourceSystem: null,
        parentCreatureId,
        calculatedChallengeRating: parent.calculatedChallengeRating,
        challengeRatingAdjustment: parent.challengeRatingAdjustment,
        challengeRatingAdjustmentReason: parent.challengeRatingAdjustmentReason,
      })
      .returning({ id: creature.id });
    const childToken = canonicalId.slice(4);

    await tx.execute(sql`
      insert into creature_attributes (creature_id, variant_id, attribute_key, value, notes, sort_order)
      select ${created.id}, null, attribute_key, value, notes, sort_order
      from creature_attributes where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_movement (creature_id, variant_id, movement_mode, movement_value, initiative, requirements, notes, sort_order)
      select ${created.id}, null, movement_mode, movement_value, initiative, requirements, notes, sort_order
      from creature_movement where creature_id = ${parentCreatureId} and variant_id is null
    `);
    const copiedPoolIds = new Map<number, number>();
    for (const pool of parentHpModel.pools) {
      const parentPoolId = Number(pool.canonicalId);
      const [copied] = await tx.insert(creatureHpPool).values({
        canonicalId: `HP-${childToken}-${String(parentPoolId).padStart(4, "0")}`,
        creatureId: created.id,
        variantId: null,
        poolName: pool.poolName,
        hpPercentage: pool.hpPercentage,
        maximumHp: pool.maximumHp,
        notes: pool.notes,
        sortOrder: pool.sortOrder,
      }).returning({ id: creatureHpPool.id });
      copiedPoolIds.set(parentPoolId, copied.id);
    }
    if (parentHitLocations.length) {
      const copiedLocations = parentHitLocations.map((location) => {
        const hpPoolId = location.hpPoolId === null
          ? null
          : copiedPoolIds.get(location.hpPoolId);
        if (hpPoolId === undefined) {
          throw new Error(`Hit Location ${location.hitLocationNumber} references an unavailable parent HP Pool.`);
        }
        return {
          creatureId: created.id,
          variantId: null,
          hitLocationNumber: location.hitLocationNumber,
          locationName: location.locationName,
          bodyPartsIncluded: location.bodyPartsIncluded,
          hpPoolId,
          naturalArmor: location.naturalArmor,
          soak: location.soak,
          locationEffect: location.locationEffect,
          notes: location.notes,
          sortOrder: location.sortOrder,
        };
      });
      await tx.insert(creatureHitLocation).values(copiedLocations);
    }
    await tx.execute(sql`
      insert into creature_attacks (
        canonical_id, creature_id, variant_id, attack_name, attack_percentage, damage,
        damage_type, range_reach, required_anatomy, requirements, uses_recharge,
        special_effect, notes, sort_order
      )
      select 'ATK-' || ${childToken} || '-' || lpad(id::text, 4, '0'), ${created.id}, null,
             attack_name, attack_percentage, damage, damage_type, range_reach, required_anatomy,
             requirements, uses_recharge, special_effect, notes, sort_order
      from creature_attacks where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_skill_links (creature_id, variant_id, skill_id, rank, notes, sort_order)
      select ${created.id}, null, skill_id, rank, notes, sort_order
      from creature_skill_links where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_abilities (
        canonical_id, creature_id, variant_id, ability_name, ability_type, activation,
        requirements, uses_recharge, description, mechanical_effect, notes, sort_order, cr_impact
      )
      select 'ABL-' || ${childToken} || '-' || lpad(id::text, 4, '0'), ${created.id}, null,
             ability_name, ability_type, activation, requirements, uses_recharge, description,
             mechanical_effect, notes, sort_order, cr_impact
      from creature_abilities where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_ability_effects (
        ability_id, effect_key, schema_version, effect_json, sort_order
      )
      select copied_ability.id, source_effect.effect_key, source_effect.schema_version,
             source_effect.effect_json, source_effect.sort_order
      from creature_ability_effects source_effect
      inner join creature_abilities source_ability on source_ability.id = source_effect.ability_id
      inner join creature_abilities copied_ability
        on copied_ability.creature_id = ${created.id}
       and copied_ability.variant_id is null
       and copied_ability.canonical_id = 'ABL-' || ${childToken} || '-' || lpad(source_ability.id::text, 4, '0')
      where source_ability.creature_id = ${parentCreatureId}
        and source_ability.variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_defenses (
        seed_identity, creature_id, variant_id, defense_type, against, value, notes, sort_order, cr_impact
      )
      select null, ${created.id}, null, defense_type, against, value, notes, sort_order, cr_impact
      from creature_defenses where creature_id = ${parentCreatureId} and variant_id is null
    `);
    await tx.execute(sql`
      insert into creature_uses (seed_identity, creature_id, variant_id, use_name, notes, sort_order)
      select null, ${created.id}, null, use_name, notes, sort_order
      from creature_uses where creature_id = ${parentCreatureId} and variant_id is null
    `);

    return created.id;
  });

  revalidatePath("/heavens/creatures");
  const saved = await getCreature(savedId);
  if (!saved) throw new Error("The derived Creature could not be reloaded.");
  return saved;
}

export async function deleteCreature(id: number) {
  await requireGod();
  const [children] = await db.select({ value: count() }).from(creature).where(eq(creature.parentCreatureId, id));
  if (Number(children?.value ?? 0) > 0) throw new Error("This Creature cannot be deleted while derived Creatures still link to it.");
  await db.delete(creature).where(eq(creature.id, id));
  revalidatePath("/heavens/creatures");
}

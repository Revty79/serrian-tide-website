import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { db } from "@/db";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import {
  CREATURE_CR_IMPACTS,
  CREATURE_SIZE_OPTIONS,
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
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterProfile,
  campaignCreatureNpcProfile,
} from "@/db/realm-schema";
import type { CreatureDraft } from "@/app/heavens/creatures/actions";
import { CHARACTER_ATTRIBUTE_KEYS } from "@/features/characters/models";
import type { NpcBuildMode } from "@/features/npcs/npc-workflow";
import { skill } from "@/db/skill-schema";

import {
  copyCreatureAbility,
  normalizeCreatureAbilityEffects,
  normalizeCreatureSnapshotAbilities,
} from "./creature-ability";
import { normalizeCreatureHpSnapshot } from "./creature-size-rules";

export type CreatureNpcConstructorTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function nonnegativeSteps(value: number | null | undefined, label: string): number {
  const normalized = value ?? 0;
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(`${label} must be a whole number zero or greater.`);
  }
  return normalized;
}

export function normalizeCreatureNpcSnapshotCore(
  core: CreatureDraft["core"],
): CreatureDraft["core"] {
  const size = core.size as CreatureSize;
  if (!CREATURE_SIZE_OPTIONS.includes(size)) {
    throw new Error(`Creature Size must be one of: ${CREATURE_SIZE_OPTIONS.join(", ")}.`);
  }
  return {
    ...core,
    size,
    hpMultiplierSteps: nonnegativeSteps(core.hpMultiplierSteps, "HP Multiplier Steps"),
    baseMovementSteps: nonnegativeSteps(core.baseMovementSteps, "Base Movement Steps"),
    baseMagicSteps: nonnegativeSteps(core.baseMagicSteps, "Base Magic Steps"),
  };
}

export function normalizeCreatureNpcSnapshot(
  snapshot: CreatureDraft,
  hpAdjustment: number,
): CreatureDraft {
  const core = normalizeCreatureNpcSnapshotCore(snapshot.core);
  return normalizeCreatureHpSnapshot({
    ...snapshot,
    core,
    hpPools: snapshot.hpPools.map((pool) => ({ ...pool, maximumHp: null })),
  }, hpAdjustment);
}

export function buildCreatureNpcSnapshot(template: CreatureDraft): CreatureDraft {
  return normalizeCreatureNpcSnapshot({
    id: template.id,
    core: { ...template.core },
    attributes: template.attributes.map((row) => ({ ...row })),
    movement: template.movement.map((row) => ({ ...row })),
    hpPools: template.hpPools.map((row) => ({ ...row })),
    hitLocations: template.hitLocations.map((row) => ({ ...row })),
    attacks: template.attacks.map((row) => ({ ...row })),
    skillLinks: template.skillLinks.map((row) => ({ ...row })),
    abilities: template.abilities.map((row) => ({
      ...copyCreatureAbility(row),
      crImpact: row.crImpact as CreatureCrImpact,
    })),
    defenses: template.defenses.map((row) => ({ ...row })),
    uses: template.uses.map((row) => ({ ...row })),
    derivedCreatures: [],
  }, 0);
}

/**
 * Loads a complete Creature master without going through a role-bound Server
 * Action. This keeps NPC construction usable by an authorized administrator
 * while the caller owns the Campaign authorization decision.
 */
export async function readCreatureNpcTemplateInTransaction(
  tx: CreatureNpcConstructorTransaction,
  creatureId: number,
  options: { activeOnly?: boolean } = {},
): Promise<CreatureDraft | null> {
  const [row] = await tx.select({
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
    calculatedChallengeRating: creature.calculatedChallengeRating,
    challengeRatingAdjustment: creature.challengeRatingAdjustment,
    challengeRatingAdjustmentReason: creature.challengeRatingAdjustmentReason,
    description: creature.description,
    typicalBehavior: creature.typicalBehavior,
    habitatEcology: creature.habitatEcology,
    notes: creature.notes,
    sourceSystem: creature.sourceSystem,
  }).from(creature).where(and(
    eq(creature.id, creatureId),
    options.activeOnly === false ? undefined : isNull(creature.archivedAt),
  )).limit(1).for("update");
  if (!row) return null;

  let parentCreatureName: string | null = null;
  if (row.parentCreatureId !== null) {
    const [parent] = await tx.select({ name: creature.canonicalName })
      .from(creature)
      .where(eq(creature.id, row.parentCreatureId))
      .limit(1);
    parentCreatureName = parent?.name ?? null;
  }

  // Keep transaction-client reads sequential. Some PostgreSQL drivers cannot
  // safely multiplex queries over the transaction's single connection.
  const attributes = await tx.select({
    attributeKey: creatureAttribute.attributeKey,
    value: creatureAttribute.value,
    notes: creatureAttribute.notes,
    sortOrder: creatureAttribute.sortOrder,
  }).from(creatureAttribute).where(and(
    eq(creatureAttribute.creatureId, creatureId),
    isNull(creatureAttribute.variantId),
  )).orderBy(asc(creatureAttribute.sortOrder), asc(creatureAttribute.id));
  const movement = await tx.select({
    movementMode: creatureMovement.movementMode,
    movementValue: creatureMovement.movementValue,
    initiative: creatureMovement.initiative,
    requirements: creatureMovement.requirements,
    notes: creatureMovement.notes,
    sortOrder: creatureMovement.sortOrder,
  }).from(creatureMovement).where(and(
    eq(creatureMovement.creatureId, creatureId),
    isNull(creatureMovement.variantId),
  )).orderBy(asc(creatureMovement.sortOrder), asc(creatureMovement.id));
  const pools = await tx.select({
    id: creatureHpPool.id,
    canonicalId: creatureHpPool.canonicalId,
    poolName: creatureHpPool.poolName,
    hpPercentage: creatureHpPool.hpPercentage,
    maximumHp: creatureHpPool.maximumHp,
    notes: creatureHpPool.notes,
    sortOrder: creatureHpPool.sortOrder,
  }).from(creatureHpPool).where(and(
    eq(creatureHpPool.creatureId, creatureId),
    isNull(creatureHpPool.variantId),
  )).orderBy(asc(creatureHpPool.sortOrder), asc(creatureHpPool.id));
  const locations = await tx.select({
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
    eq(creatureHitLocation.creatureId, creatureId),
    isNull(creatureHitLocation.variantId),
  )).orderBy(asc(creatureHitLocation.sortOrder), asc(creatureHitLocation.id));
  const attacks = await tx.select({
    canonicalId: creatureAttack.canonicalId,
    attackName: creatureAttack.attackName,
    attackPercentage: creatureAttack.attackPercentage,
    damage: creatureAttack.damage,
    damageType: creatureAttack.damageType,
    rangeReach: creatureAttack.rangeReach,
    requiredAnatomy: creatureAttack.requiredAnatomy,
    requirements: creatureAttack.requirements,
    usesRecharge: creatureAttack.usesRecharge,
    specialEffect: creatureAttack.specialEffect,
    notes: creatureAttack.notes,
    sortOrder: creatureAttack.sortOrder,
  }).from(creatureAttack).where(and(
    eq(creatureAttack.creatureId, creatureId),
    isNull(creatureAttack.variantId),
  )).orderBy(asc(creatureAttack.sortOrder), asc(creatureAttack.id));
  const skillLinks = await tx.select({
    skillId: creatureSkillLink.skillId,
    skillName: skill.name,
    skillClassification: skill.classification,
    rank: creatureSkillLink.rank,
    notes: creatureSkillLink.notes,
    sortOrder: creatureSkillLink.sortOrder,
  }).from(creatureSkillLink)
    .innerJoin(skill, eq(skill.id, creatureSkillLink.skillId))
    .where(and(
      eq(creatureSkillLink.creatureId, creatureId),
      isNull(creatureSkillLink.variantId),
    ))
    .orderBy(asc(creatureSkillLink.sortOrder), asc(creatureSkillLink.id));
  const abilityRows = await tx.select({
    id: creatureAbility.id,
    canonicalId: creatureAbility.canonicalId,
    abilityName: creatureAbility.abilityName,
    abilityType: creatureAbility.abilityType,
    activation: creatureAbility.activation,
    requirements: creatureAbility.requirements,
    usesRecharge: creatureAbility.usesRecharge,
    description: creatureAbility.description,
    mechanicalEffect: creatureAbility.mechanicalEffect,
    notes: creatureAbility.notes,
    sortOrder: creatureAbility.sortOrder,
    crImpact: creatureAbility.crImpact,
  }).from(creatureAbility).where(and(
    eq(creatureAbility.creatureId, creatureId),
    isNull(creatureAbility.variantId),
  )).orderBy(asc(creatureAbility.sortOrder), asc(creatureAbility.id));
  const defenses = await tx.select({
    seedIdentity: creatureDefense.seedIdentity,
    defenseType: creatureDefense.defenseType,
    against: creatureDefense.against,
    value: creatureDefense.value,
    notes: creatureDefense.notes,
    sortOrder: creatureDefense.sortOrder,
    crImpact: creatureDefense.crImpact,
  }).from(creatureDefense).where(and(
    eq(creatureDefense.creatureId, creatureId),
    isNull(creatureDefense.variantId),
  )).orderBy(asc(creatureDefense.sortOrder), asc(creatureDefense.id));
  const uses = await tx.select({
    seedIdentity: creatureUse.seedIdentity,
    useName: creatureUse.useName,
    notes: creatureUse.notes,
    sortOrder: creatureUse.sortOrder,
  }).from(creatureUse).where(and(
    eq(creatureUse.creatureId, creatureId),
    isNull(creatureUse.variantId),
  )).orderBy(asc(creatureUse.sortOrder), asc(creatureUse.id));
  const effectRows = abilityRows.length
    ? await tx.select({
        abilityId: creatureAbilityEffect.abilityId,
        effectKey: creatureAbilityEffect.effectKey,
        schemaVersion: creatureAbilityEffect.schemaVersion,
        effect: creatureAbilityEffect.effectJson,
        sortOrder: creatureAbilityEffect.sortOrder,
      }).from(creatureAbilityEffect)
        .where(inArray(creatureAbilityEffect.abilityId, abilityRows.map(({ id }) => id)))
        .orderBy(asc(creatureAbilityEffect.sortOrder), asc(creatureAbilityEffect.id))
    : [];

  const effectsByAbility = new Map<number, typeof effectRows>();
  for (const effect of effectRows) {
    effectsByAbility.set(effect.abilityId, [
      ...(effectsByAbility.get(effect.abilityId) ?? []),
      effect,
    ]);
  }
  const poolIds = new Map(pools.map(({ id, canonicalId }) => [id, canonicalId]));

  return {
    id: creatureId,
    core: {
      ...row,
      parentCreatureName,
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
    hitLocations: locations.map(({ hpPoolId, ...location }) => ({
      ...location,
      hpPoolCanonicalId: hpPoolId === null ? null : poolIds.get(hpPoolId) ?? null,
    })),
    attacks,
    skillLinks,
    abilities: abilityRows.map(({ id, ...ability }) => ({
      ...ability,
      crImpact: CREATURE_CR_IMPACTS.includes(ability.crImpact as CreatureCrImpact)
        ? ability.crImpact as CreatureCrImpact
        : "None",
      effects: normalizeCreatureAbilityEffects(effectsByAbility.get(id) ?? []),
    })),
    defenses: defenses.map((defense) => ({
      ...defense,
      crImpact: CREATURE_CR_IMPACTS.includes(defense.crImpact as CreatureCrImpact)
        ? defense.crImpact as CreatureCrImpact
        : "None",
    })),
    uses,
    derivedCreatures: [],
  };
}

export function parseCreatureNpcSnapshot(
  value: string,
  label: string,
  hpAdjustment = 0,
): CreatureDraft {
  try {
    const parsed = JSON.parse(value) as CreatureDraft;
    const normalized = normalizeCreatureSnapshotAbilities(parsed);
    return normalizeCreatureNpcSnapshot({
      ...parsed,
      abilities: normalized.abilities.map((ability) => ({
        ...ability,
        crImpact: CREATURE_CR_IMPACTS.includes(ability.crImpact as CreatureCrImpact)
          ? ability.crImpact as CreatureCrImpact
          : "None",
      })),
    }, hpAdjustment);
  } catch (error) {
    throw new Error(`${label} contains invalid Creature data: ${error instanceof Error ? error.message : "Unreadable snapshot."}`);
  }
}

/** Canonical Creature NPC persistence boundary shared by NPC management and Encounter spawning. */
export async function createCreatureNpcInTransaction(
  tx: CreatureNpcConstructorTransaction,
  input: {
    campaignId: number;
    controllerUserId: string;
    creatureId: number;
    name: string;
    snapshot: CreatureDraft;
    buildMode?: NpcBuildMode;
    roleLabel?: string;
    personalityDescription?: string;
    notes?: string;
  },
): Promise<number> {
  const [campaignRow] = await tx.select({
    id: campaign.id,
    startingCredits: campaign.startingCreditAmount,
  }).from(campaign).where(eq(campaign.id, input.campaignId)).limit(1).for("update");
  if (!campaignRow) throw new Error("Campaign not found.");
  const name = input.name.trim();
  if (!name) throw new Error("Creature NPC name is required.");
  const snapshot = normalizeCreatureNpcSnapshot(input.snapshot, 0);
  await tx.insert(campaignPlayer).values({
    campaignId: input.campaignId,
    userId: input.controllerUserId,
    isNpcController: true,
  }).onConflictDoNothing();
  const [created] = await tx.insert(campaignCharacter).values({
    campaignId: input.campaignId,
    playerUserId: input.controllerUserId,
    name,
    isNpc: true,
    npcKind: "creature",
    npcBuildMode: input.buildMode ?? "detailed",
    npcRoleLabel: input.roleLabel?.trim() ?? "",
  }).returning({ id: campaignCharacter.id });
  if (!created) throw new Error("Creature NPC Character could not be created.");
  await tx.insert(campaignCharacterProfile).values({
    characterId: created.id,
    creditsRemaining: campaignRow.startingCredits,
  });
  await tx.insert(campaignCharacterAttribute).values(
    CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({
      characterId: created.id,
      attributeKey,
      value: 25,
    })),
  );
  await tx.insert(campaignCreatureNpcProfile).values({
    characterId: created.id,
    creatureId: input.creatureId,
    personality: input.personalityDescription?.trim() ?? "",
    instanceNotes: input.notes?.trim() ?? "",
    hpAdjustment: 0,
    baselineSnapshotJson: JSON.stringify(snapshot),
    currentSnapshotJson: JSON.stringify(snapshot),
  });
  return created.id;
}

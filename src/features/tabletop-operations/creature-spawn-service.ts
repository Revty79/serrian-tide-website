import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  CREATURE_CR_IMPACTS,
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
} from "@/db/creature-schema";
import { skill } from "@/db/skill-schema";
import {
  campaignSessionEncounterInitiative,
  campaignSessionEncounterParticipant,
  campaignSessionRoster,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import type { CreatureAggregate } from "@/app/heavens/creatures/actions";
import {
  normalizeCreatureAbilityEffects,
} from "@/features/creatures/creature-ability";
import {
  buildCreatureNpcSnapshot,
  createCreatureNpcInTransaction,
} from "@/features/creatures/creature-npc-constructor-service";

import {
  enrollSpawnedCreatureInInitiativeInTransaction,
  type OwnedEncounterRuntimeContext,
  type RuntimeIntegrationTransaction,
} from "./runtime-integration-service";
import { buildCreatureSpawnNames } from "./runtime-integration";

export type CreatureCatalogEntry = {
  id: number;
  name: string;
  size: string;
  family: string;
  creatureType: string;
  challengeRating: number | null;
  movementModes: string[];
};

export type SpawnEncounterCreaturesInput = {
  creatureId: number;
  quantity: number;
  joinInitiative: boolean;
  movementMode?: string;
};

export type SpawnEncounterCreaturesResult = {
  creatureId: number;
  templateName: string;
  created: Array<{ characterId: number; name: string; joinedInitiative: boolean }>;
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

export async function listCreatureCatalogInTransaction(
  tx: RuntimeIntegrationTransaction,
): Promise<CreatureCatalogEntry[]> {
  const rows = await tx.select({
    id: creature.id,
    name: creature.canonicalName,
    size: creature.size,
    family: creature.family,
    creatureType: creature.creatureType,
    challengeRating: creature.challengeRating,
  }).from(creature).orderBy(asc(creature.canonicalName), asc(creature.id));
  const movementRows = await tx.select({
    creatureId: creatureMovement.creatureId,
    movementMode: creatureMovement.movementMode,
  }).from(creatureMovement)
    .where(isNull(creatureMovement.variantId))
    .orderBy(asc(creatureMovement.sortOrder), asc(creatureMovement.id));
  const movementByCreature = new Map<number, string[]>();
  for (const movement of movementRows) {
    movementByCreature.set(movement.creatureId, [
      ...(movementByCreature.get(movement.creatureId) ?? []),
      movement.movementMode,
    ]);
  }
  return rows.map((row) => ({ ...row, movementModes: movementByCreature.get(row.id) ?? [] }));
}

async function loadCreatureAggregateInTransaction(
  tx: RuntimeIntegrationTransaction,
  creatureId: number,
): Promise<CreatureAggregate> {
  const [row] = await tx.select({
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
  }).from(creature).where(eq(creature.id, positiveId(creatureId, "Creature"))).limit(1).for("update");
  if (!row) throw new Error("The selected master Creature no longer exists.");

  const attributes = await tx.select({ attributeKey: creatureAttribute.attributeKey, value: creatureAttribute.value, notes: creatureAttribute.notes, sortOrder: creatureAttribute.sortOrder })
    .from(creatureAttribute).where(and(eq(creatureAttribute.creatureId, creatureId), isNull(creatureAttribute.variantId))).orderBy(asc(creatureAttribute.sortOrder), asc(creatureAttribute.id));
  const movement = await tx.select({ movementMode: creatureMovement.movementMode, movementValue: creatureMovement.movementValue, initiative: creatureMovement.initiative, requirements: creatureMovement.requirements, notes: creatureMovement.notes, sortOrder: creatureMovement.sortOrder })
    .from(creatureMovement).where(and(eq(creatureMovement.creatureId, creatureId), isNull(creatureMovement.variantId))).orderBy(asc(creatureMovement.sortOrder), asc(creatureMovement.id));
  const pools = await tx.select({ id: creatureHpPool.id, canonicalId: creatureHpPool.canonicalId, poolName: creatureHpPool.poolName, hpPercentage: creatureHpPool.hpPercentage, maximumHp: creatureHpPool.maximumHp, notes: creatureHpPool.notes, sortOrder: creatureHpPool.sortOrder })
    .from(creatureHpPool).where(and(eq(creatureHpPool.creatureId, creatureId), isNull(creatureHpPool.variantId))).orderBy(asc(creatureHpPool.sortOrder), asc(creatureHpPool.id));
  const locations = await tx.select({ hitLocationNumber: creatureHitLocation.hitLocationNumber, locationName: creatureHitLocation.locationName, bodyPartsIncluded: creatureHitLocation.bodyPartsIncluded, hpPoolId: creatureHitLocation.hpPoolId, naturalArmor: creatureHitLocation.naturalArmor, soak: creatureHitLocation.soak, locationEffect: creatureHitLocation.locationEffect, notes: creatureHitLocation.notes, sortOrder: creatureHitLocation.sortOrder })
    .from(creatureHitLocation).where(and(eq(creatureHitLocation.creatureId, creatureId), isNull(creatureHitLocation.variantId))).orderBy(asc(creatureHitLocation.sortOrder), asc(creatureHitLocation.id));
  const attacks = await tx.select({ canonicalId: creatureAttack.canonicalId, attackName: creatureAttack.attackName, attackPercentage: creatureAttack.attackPercentage, damage: creatureAttack.damage, damageType: creatureAttack.damageType, rangeReach: creatureAttack.rangeReach, requiredAnatomy: creatureAttack.requiredAnatomy, requirements: creatureAttack.requirements, usesRecharge: creatureAttack.usesRecharge, specialEffect: creatureAttack.specialEffect, notes: creatureAttack.notes, sortOrder: creatureAttack.sortOrder })
    .from(creatureAttack).where(and(eq(creatureAttack.creatureId, creatureId), isNull(creatureAttack.variantId))).orderBy(asc(creatureAttack.sortOrder), asc(creatureAttack.id));
  const links = await tx.select({ skillId: creatureSkillLink.skillId, skillName: skill.name, skillClassification: skill.classification, rank: creatureSkillLink.rank, notes: creatureSkillLink.notes, sortOrder: creatureSkillLink.sortOrder })
    .from(creatureSkillLink).innerJoin(skill, eq(skill.id, creatureSkillLink.skillId)).where(and(eq(creatureSkillLink.creatureId, creatureId), isNull(creatureSkillLink.variantId))).orderBy(asc(creatureSkillLink.sortOrder), asc(creatureSkillLink.id));
  const abilities = await tx.select({ id: creatureAbility.id, canonicalId: creatureAbility.canonicalId, abilityName: creatureAbility.abilityName, abilityType: creatureAbility.abilityType, activation: creatureAbility.activation, requirements: creatureAbility.requirements, usesRecharge: creatureAbility.usesRecharge, description: creatureAbility.description, mechanicalEffect: creatureAbility.mechanicalEffect, notes: creatureAbility.notes, sortOrder: creatureAbility.sortOrder, crImpact: creatureAbility.crImpact })
    .from(creatureAbility).where(and(eq(creatureAbility.creatureId, creatureId), isNull(creatureAbility.variantId))).orderBy(asc(creatureAbility.sortOrder), asc(creatureAbility.id));
  const defenses = await tx.select({ seedIdentity: creatureDefense.seedIdentity, defenseType: creatureDefense.defenseType, against: creatureDefense.against, value: creatureDefense.value, notes: creatureDefense.notes, sortOrder: creatureDefense.sortOrder, crImpact: creatureDefense.crImpact })
    .from(creatureDefense).where(and(eq(creatureDefense.creatureId, creatureId), isNull(creatureDefense.variantId))).orderBy(asc(creatureDefense.sortOrder), asc(creatureDefense.id));
  const uses = await tx.select({ seedIdentity: creatureUse.seedIdentity, useName: creatureUse.useName, notes: creatureUse.notes, sortOrder: creatureUse.sortOrder })
    .from(creatureUse).where(and(eq(creatureUse.creatureId, creatureId), isNull(creatureUse.variantId))).orderBy(asc(creatureUse.sortOrder), asc(creatureUse.id));
  const effectRows = abilities.length ? await tx.select({
    abilityId: creatureAbilityEffect.abilityId,
    effectKey: creatureAbilityEffect.effectKey,
    schemaVersion: creatureAbilityEffect.schemaVersion,
    effect: creatureAbilityEffect.effectJson,
    sortOrder: creatureAbilityEffect.sortOrder,
  }).from(creatureAbilityEffect)
    .where(inArray(creatureAbilityEffect.abilityId, abilities.map(({ id }) => id)))
    .orderBy(asc(creatureAbilityEffect.sortOrder), asc(creatureAbilityEffect.id)) : [];
  const effectsByAbility = new Map<number, typeof effectRows>();
  for (const effect of effectRows) {
    effectsByAbility.set(effect.abilityId, [...(effectsByAbility.get(effect.abilityId) ?? []), effect]);
  }
  const poolCanonicalById = new Map(pools.map((pool) => [pool.id, pool.canonicalId]));
  return {
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
      parentCreatureName: null,
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
    hpPools: pools.map((pool) => ({
      canonicalId: pool.canonicalId,
      poolName: pool.poolName,
      hpPercentage: pool.hpPercentage,
      maximumHp: pool.maximumHp,
      notes: pool.notes,
      sortOrder: pool.sortOrder,
    })),
    hitLocations: locations.map(({ hpPoolId, ...location }) => ({
      ...location,
      hpPoolCanonicalId: hpPoolId ? poolCanonicalById.get(hpPoolId) ?? null : null,
    })),
    attacks,
    skillLinks: links,
    abilities: abilities.map(({ id, ...ability }) => ({
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function spawnEncounterCreaturesInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  actingUserId: string,
  input: SpawnEncounterCreaturesInput,
): Promise<SpawnEncounterCreaturesResult> {
  if (context.encounterStatus === "completed") throw new Error("Completed Encounters cannot receive new Creatures.");
  if (context.sessionStatus === "completed" || context.sceneStatus === "completed") {
    throw new Error("Completed Session or Scene history cannot receive new Creatures.");
  }
  const template = await loadCreatureAggregateInTransaction(tx, input.creatureId);
  const spawnNames = buildCreatureSpawnNames(template.core.canonicalName, input.quantity);
  const snapshot = buildCreatureNpcSnapshot(template);
  const lastRoster = await tx.select({ sortOrder: campaignSessionRoster.sortOrder }).from(campaignSessionRoster)
    .where(eq(campaignSessionRoster.sessionId, context.sessionId)).orderBy(desc(campaignSessionRoster.sortOrder)).limit(1).for("update");
  const lastScene = await tx.select({ sortOrder: campaignSessionSceneMember.sortOrder }).from(campaignSessionSceneMember)
    .where(eq(campaignSessionSceneMember.sceneId, context.sceneId)).orderBy(desc(campaignSessionSceneMember.sortOrder)).limit(1).for("update");
  const lastEncounter = await tx.select({ sortOrder: campaignSessionEncounterParticipant.sortOrder }).from(campaignSessionEncounterParticipant)
    .where(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId)).orderBy(desc(campaignSessionEncounterParticipant.sortOrder)).limit(1).for("update");
  const runtime = await tx.select({ status: campaignSessionEncounterInitiative.status }).from(campaignSessionEncounterInitiative)
    .where(eq(campaignSessionEncounterInitiative.encounterId, context.encounterId)).limit(1).for("update");
  if (input.joinInitiative && runtime[0]?.status !== "active") {
    throw new Error("Join Initiative now requires an active Initiative runtime.");
  }

  const created: SpawnEncounterCreaturesResult["created"] = [];
  for (let index = 0; index < spawnNames.length; index += 1) {
    const name = spawnNames[index];
    const characterId = await createCreatureNpcInTransaction(tx, {
      campaignId: context.campaignId,
      controllerUserId: actingUserId,
      creatureId: template.id,
      name,
      snapshot,
    });
    await tx.insert(campaignSessionRoster).values({
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      characterId,
      sortOrder: (lastRoster[0]?.sortOrder ?? -1) + index + 1,
    });
    await tx.insert(campaignSessionSceneMember).values({
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      characterId,
      sortOrder: (lastScene[0]?.sortOrder ?? -1) + index + 1,
    });
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      characterId,
      sortOrder: (lastEncounter[0]?.sortOrder ?? -1) + index + 1,
    });
    if (input.joinInitiative) {
      await enrollSpawnedCreatureInInitiativeInTransaction(tx, context, characterId, input.movementMode);
    }
    created.push({ characterId, name, joinedInitiative: input.joinInitiative });
  }
  return { creatureId: template.id, templateName: template.core.canonicalName, created };
}

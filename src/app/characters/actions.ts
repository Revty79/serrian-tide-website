"use server";

import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { attributeScoreReference } from "@/db/attribute-reference-schema";
import { user } from "@/db/auth-schema";
import {
  campaign,
  campaignAllowedSystem,
  campaignDerivedCurrency,
  campaignPlayer,
} from "@/db/campaign-schema";
import {
  campaignAllowedDerivedAbility,
  characterDerivedAbility,
  derivedAbility,
  derivedAbilityCost,
  derivedAbilityEffect,
  derivedAbilityRequirement,
  derivedAbilityTrigger,
  derivedAbilityUseCondition,
  derivedAbilityUseLimit,
} from "@/db/derived-ability-schema";
import { armorProfile, item, itemEffect, itemRuntimeProfile, weaponFiringMode, weaponProfile } from "@/db/item-schema";
import {
  race,
  raceAttributeCap,
  raceMovementMode,
  raceSkillLink,
} from "@/db/race-schema";
import { creature } from "@/db/creature-schema";
import {
  campaignAllowedRace,
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterCurrencyHolding,
  campaignCharacterItem,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
  campaignCharacterSkillAllocation,
  campaignCharacterSpellDocument,
  campaignCreatureNpcProfile,
  campaignInventoryItem,
} from "@/db/realm-schema";
import {
  skill,
  skillExtension,
  skillRelationship,
} from "@/db/skill-schema";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAggregate,
  type CharacterAttributeKey,
  type CharacterAttributeReferenceKey,
  type CharacterDraft,
  type CharacterRaceAggregate,
} from "@/features/characters/models";
import {
  canAccessSupernaturalSkillAtLevel,
  evaluateCharacterReadiness,
  getAttributePointsUsed,
  getCharacterMagicSystem,
  getCharacterManaProfiles,
  getEffectiveSkillMaximum,
  getEffectiveSkillPoints,
  getRaceAttributeCap,
  getRacialSkillGrant,
  getSkillPointsUsed,
  getSkillUnlockThreshold,
  isSkillAllowedByCampaign,
} from "@/features/characters/character-rules";
import {
  canPlayerAdvanceSkillWithExperience,
  getExperienceSpendingLedger,
  getSkillAdvancementCost,
  type CharacterSkillAdvancementRequest,
} from "@/features/characters/character-advancement-rules";
import { getEffectiveCampaignSystems } from "@/features/campaigns/campaign-systems";
import { permanentlyDeleteLifecycleEntityForActor } from "@/features/lifecycle/lifecycle-service";
import { assertOwnedRootManager } from "@/features/lifecycle/policy";
import {
  getCampaignMoneyBreakdown,
  getCanonicalCreditsFromHoldings,
} from "@/features/characters/currency-rules";
import {
  getBaseMagicStepsAfterPurchase,
  getBaseMovementStepsAfterPurchase,
  getHpMultiplierStepsAfterPurchase,
  getQuintessenceSpendingLedger,
  type CharacterQuintessencePurchaseType,
  validateQuintessenceAttributeIncrease,
} from "@/features/characters/quintessence-rules";
import { assembleDerivedAbilityCatalog } from "@/features/derived-abilities/derived-ability-catalog";
import { decodeDerivedAbilityEffectRows } from "@/features/derived-abilities/derived-ability-effects";
import { resolveCharacterDerivedAbilities } from "@/features/derived-abilities/character-derived-ability-resolver";
import { reconcileCharacterDerivedAbilityPassivesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import type {
  DerivedAbilityCostType,
  DerivedAbilityRefreshScope,
  DerivedAbilityRequirementOperator,
  DerivedAbilityRequirementType,
  DerivedAbilityUseConditionType,
} from "@/features/derived-abilities/models";
import {
  assertItemOwnershipStrategy,
  assertNoStackInstanceOwnershipCollision,
  getOwnedItemPurchaseCost,
  getStartingItemInstanceCharges,
  planOwnedItemInstancePersistence,
  validateCurrentItemCharges,
} from "@/features/items/item-ownership";
import {
  reconcileEquipmentAfterOwnershipMutationInTransaction,
  validateEquipmentOwnershipMutationInTransaction,
} from "@/features/items/equipment-state-service";
import { readOverrideIdsForAllocationsInTransaction } from "@/features/items/weapon-governance-management-service";
import {
  DEFAULT_ITEM_RUNTIME_PROFILE,
  validateItemRuntimeProfile,
  type ItemRuntimeProfile,
  type ItemUseMode,
} from "@/features/items/item-runtime";
import { requireGod, requireGodOrAdminAccessContext, requirePlayer, requireSession } from "@/lib/server-access";

const ammunitionItem = alias(item, "ammunition_item");
const ammunitionWeaponProfile = alias(weaponProfile, "ammunition_weapon_profile");

type ItemRuntimeColumns = {
  runtimeUseMode: string | null;
  runtimeQuantityPerUse: number | null;
  runtimeMaximumCharges: number | null;
  runtimeChargesPerUse: number | null;
  runtimeRechargeNotes: string | null;
  runtimeActivationLabel: string | null;
  runtimeUseNotes: string | null;
};

function readItemRuntimeProfile(row: ItemRuntimeColumns): ItemRuntimeProfile {
  const validation = validateItemRuntimeProfile(
    row.runtimeUseMode === null
      ? DEFAULT_ITEM_RUNTIME_PROFILE
      : {
          useMode: row.runtimeUseMode as ItemUseMode,
          quantityPerUse: row.runtimeQuantityPerUse,
          maximumCharges: row.runtimeMaximumCharges,
          chargesPerUse: row.runtimeChargesPerUse,
          rechargeNotes: row.runtimeRechargeNotes,
          activationLabel: row.runtimeActivationLabel,
          useNotes: row.runtimeUseNotes,
        },
  );
  if (!validation.valid) {
    throw new Error(validation.issues.map(({ message }) => message).join(" "));
  }
  return validation.profile;
}

export type PlayerCampaignSummary = { id: number; name: string; overview: string };
export type CharacterSummary = {
  id: number;
  campaignId: number;
  playerUserId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  creationCompletedAt: string | null;
  isNpc: boolean;
  npcKind: "race" | "creature";
  creatureTemplateName: string | null;
};
export type CampaignPlayerSummary = {
  userId: string;
  username: string;
  name: string;
  addedAt: string;
};
export type GodCampaignSummary = { id: number; name: string };

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function required(value: string | null | undefined, label: string) {
  const result = clean(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function nonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return value;
}

function optionalWholeNonNegative(value: number | null, label: string) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number zero or greater.`);
  }
  return value;
}

async function isCampaignOwner(campaignId: number, userId: string) {
  const [row] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.createdByUserId, userId)))
    .limit(1);
  return Boolean(row);
}

async function isCampaignMember(campaignId: number, userId: string) {
  const [row] = await db
    .select({ campaignId: campaignPlayer.campaignId })
    .from(campaignPlayer)
    .innerJoin(campaign, eq(campaign.id, campaignPlayer.campaignId))
    .where(and(
      eq(campaignPlayer.campaignId, campaignId),
      eq(campaignPlayer.userId, userId),
      isNull(campaign.archivedAt),
    ))
    .limit(1);
  return Boolean(row);
}

async function requireCharacterAccess(characterId: number, godMode: boolean) {
  const session = await requireSession();
  const [row] = await db
    .select({
      id: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      playerUserId: campaignCharacter.playerUserId,
      isNpc: campaignCharacter.isNpc,
      archivedAt: campaignCharacter.archivedAt,
    })
    .from(campaignCharacter)
    .where(eq(campaignCharacter.id, characterId))
    .limit(1);

  if (!row) throw new Error("Character not found.");

  if (godMode) {
    const access = await requireGodOrAdminAccessContext();
    const [campaignRow] = await db.select({
      createdByUserId: campaign.createdByUserId,
    }).from(campaign).where(eq(campaign.id, row.campaignId)).limit(1);
    if (!campaignRow) throw new Error("Campaign not found.");
    assertOwnedRootManager(
      { userId: access.session.user.id, roles: access.roles },
      campaignRow.createdByUserId,
      "Campaign",
    );
  } else {
    await requirePlayer();
    if (row.archivedAt || row.isNpc || row.playerUserId !== session.user.id) {
      throw new Error("A Player may only access their own Character.");
    }
    if (!(await isCampaignMember(row.campaignId, session.user.id))) {
      throw new Error("This Character is not in one of your Campaign memberships.");
    }
  }

  return { session, row };
}

async function readRaceAggregate(raceId: number): Promise<CharacterRaceAggregate | null> {
  const [raceRow] = await db
    .select({
      id: race.id,
      name: race.name,
      size: race.size,
      baseMagic: race.baseMagic,
      ageMin: race.ageMin,
      ageMax: race.ageMax,
      ageRangeText: race.ageRangeText,
      physicalDescription: race.physicalDescription,
      racialQuirkName: race.racialQuirkName,
      quirkSuccessEffect: race.quirkSuccessEffect,
      quirkFailureEffect: race.quirkFailureEffect,
    })
    .from(race)
    .where(eq(race.id, raceId))
    .limit(1);
  if (!raceRow) return null;

  const [caps, movement, links] = await Promise.all([
    db.select({ attributeKey: raceAttributeCap.attributeKey, maxValue: raceAttributeCap.maxValue })
      .from(raceAttributeCap).where(eq(raceAttributeCap.raceId, raceId)).orderBy(asc(raceAttributeCap.sortOrder)),
    db.select({ movementMode: raceMovementMode.movementMode, baseValue: raceMovementMode.baseValue, notes: raceMovementMode.notes })
      .from(raceMovementMode).where(eq(raceMovementMode.raceId, raceId)).orderBy(asc(raceMovementMode.sortOrder)),
    db.select({
      skillId: raceSkillLink.skillId,
      skillName: skill.name,
      skillClassification: skill.classification,
      linkType: raceSkillLink.linkType,
      value: raceSkillLink.value,
    }).from(raceSkillLink)
      .innerJoin(skill, eq(skill.id, raceSkillLink.skillId))
      .where(eq(raceSkillLink.raceId, raceId))
      .orderBy(asc(raceSkillLink.sortOrder), asc(raceSkillLink.id)),
  ]);

  return { race: raceRow, attributeCaps: caps, movementModes: movement, skillLinks: links };
}

function readSpellImportReference(dataJson: string) {
  try {
    const parsed = JSON.parse(dataJson) as {
      spreadsheetReference?: { masteryLabel?: unknown; statedSpellCost?: unknown };
    };
    const mastery = parsed.spreadsheetReference?.masteryLabel;
    const cost = parsed.spreadsheetReference?.statedSpellCost;
    return {
      spellLevel: typeof mastery === "string" ? mastery : null,
      manaCost: typeof cost === "number" && Number.isFinite(cost)
        ? cost
        : typeof cost === "string" && cost.trim() && Number.isFinite(Number(cost))
          ? Number(cost)
          : null,
    };
  } catch {
    return { spellLevel: null, manaCost: null };
  }
}

export async function listPlayerCampaigns(): Promise<PlayerCampaignSummary[]> {
  const session = await requirePlayer();
  return db
    .select({ id: campaign.id, name: campaign.name, overview: campaign.overview })
    .from(campaignPlayer)
    .innerJoin(campaign, eq(campaign.id, campaignPlayer.campaignId))
    .where(and(
      eq(campaignPlayer.userId, session.user.id),
      isNull(campaign.archivedAt),
    ))
    .orderBy(asc(campaign.name), asc(campaign.id));
}

export async function listGodCampaigns(): Promise<GodCampaignSummary[]> {
  const session = await requireGod();
  return db
    .select({ id: campaign.id, name: campaign.name })
    .from(campaign)
    .where(and(
      eq(campaign.createdByUserId, session.user.id),
      isNull(campaign.archivedAt),
    ))
    .orderBy(asc(campaign.name), asc(campaign.id));
}

export async function listCampaignPlayers(campaignId: number): Promise<CampaignPlayerSummary[]> {
  const session = await requireGod();
  if (!(await isCampaignOwner(campaignId, session.user.id))) {
    throw new Error("Only the Campaign creator can manage its Players.");
  }
  return db
    .select({
      userId: user.id,
      username: user.username,
      name: user.name,
      addedAt: campaignPlayer.createdAt,
    })
    .from(campaignPlayer)
    .innerJoin(user, eq(user.id, campaignPlayer.userId))
    .where(eq(campaignPlayer.campaignId, campaignId))
    .orderBy(asc(user.username), asc(user.name), asc(user.id))
    .then((rows) => rows.map((row) => ({
      userId: row.userId,
      username: row.username ?? row.name,
      name: row.name,
      addedAt: row.addedAt.toISOString(),
    })));
}

export async function listCharactersForCampaign(
  campaignId: number,
  playerUserId?: string,
  includeNpcs = false,
): Promise<CharacterSummary[]> {
  const session = await requireSession();
  const godMode = await isCampaignOwner(campaignId, session.user.id);

  if (!godMode) {
    await requirePlayer();
    if (!(await isCampaignMember(campaignId, session.user.id))) {
      throw new Error("You do not have access to this Campaign.");
    }
  }

  const ownerId = godMode && playerUserId ? playerUserId : session.user.id;
  const conditions = [eq(campaignCharacter.campaignId, campaignId)];
  conditions.push(isNull(campaignCharacter.archivedAt));
  if (includeNpcs && godMode) {
    conditions.push(eq(campaignCharacter.isNpc, true));
  } else {
    conditions.push(eq(campaignCharacter.isNpc, false));
    conditions.push(eq(campaignCharacter.playerUserId, ownerId));
  }

  const rows = await db
    .select({
      id: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      playerUserId: campaignCharacter.playerUserId,
      name: campaignCharacter.name,
      createdAt: campaignCharacter.createdAt,
      updatedAt: campaignCharacter.updatedAt,
      creationCompletedAt: campaignCharacterProfile.creationCompletedAt,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      npcBuildMode: campaignCharacter.npcBuildMode,
      npcRoleLabel: campaignCharacter.npcRoleLabel,
      archivedAt: campaignCharacter.archivedAt,
      archiveReason: campaignCharacter.archiveReason,
      creatureTemplateName: creature.canonicalName,
    })
    .from(campaignCharacter)
    .leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
    .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
    .leftJoin(
      creature,
      eq(creature.id, campaignCreatureNpcProfile.creatureId),
    )
    .where(and(...conditions))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    creationCompletedAt: row.creationCompletedAt?.toISOString() ?? null,
    npcKind: row.npcKind === "creature" ? "creature" : "race",
  }));
}

export async function createCharacterForPlayer(
  campaignId: number,
  playerUserId: string,
): Promise<CharacterAggregate> {
  const { session, roles } = await requireGodOrAdminAccessContext();

  const [campaignRow] = await db
    .select({
      createdByUserId: campaign.createdByUserId,
      startingCreditAmount: campaign.startingCreditAmount,
      fatePointMethod: campaign.fatePointMethod,
      assignedFatePoints: campaign.assignedFatePoints,
    })
    .from(campaign)
    .where(and(eq(campaign.id, campaignId), isNull(campaign.archivedAt)))
    .limit(1);
  if (!campaignRow) throw new Error("That Campaign is archived or no longer exists.");
  assertOwnedRootManager(
    { userId: session.user.id, roles },
    campaignRow.createdByUserId,
    "Campaign",
  );

  if (!(await isCampaignMember(campaignId, playerUserId))) {
    throw new Error("The selected Player must belong to this Campaign before a Character can be created.");
  }

  const characterId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(campaignCharacter).values({
      campaignId,
      playerUserId,
      name: "New Character",
      isNpc: false,
      npcKind: "race",
    }).returning({ id: campaignCharacter.id });

    await tx.insert(campaignCharacterProfile).values({
      characterId: created.id,
      creditsRemaining: campaignRow.startingCreditAmount,
      fatePoints: campaignRow.fatePointMethod === "Assigned" ? campaignRow.assignedFatePoints ?? 0 : null,
    });
    await tx.insert(campaignCharacterAttribute).values(
      CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({ characterId: created.id, attributeKey, value: 25 })),
    );
    return created.id;
  });

  revalidatePath("/realms");
  revalidatePath("/heavens");
  return getCharacter(characterId, true);
}

export async function deleteCharacterAsGod(characterId: number): Promise<{
  id: number;
  name: string;
  campaignId: number;
}> {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error("A saved player Character must be selected for deletion.");
  }

  const { session, roles } = await requireGodOrAdminAccessContext();
  const deleted = await permanentlyDeleteLifecycleEntityForActor(
    { entityKind: "player-character", entityId: characterId },
    { userId: session.user.id, roles },
  );
  if (deleted.campaignId === undefined) {
    throw new Error("Deleted Character Campaign context is missing.");
  }

  revalidatePath("/heavens");
  revalidatePath("/heavens/campaigns");
  revalidatePath(`/heavens/characters/${deleted.entityId}`);
  revalidatePath("/realms");
  revalidatePath(`/realms/characters/${deleted.entityId}`);
  return {
    id: deleted.entityId,
    name: deleted.entityName,
    campaignId: deleted.campaignId,
  };
}

export async function getCharacter(characterId: number, godMode = false): Promise<CharacterAggregate> {
  const { row } = await requireCharacterAccess(characterId, godMode);

  const [profileRow] = await db.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, characterId)).limit(1);
  if (!profileRow) throw new Error("The Character aggregate is missing its profile row.");

  const [
    attributeRows,
    attributeReferenceRows,
    allocationRows,
    ownedItems,
    ownedItemInstances,
    currencyHoldings,
    allowedSystemRows,
    legacyDerivedAbilityRows,
    currencies,
    allowedRaceRows,
    skillRows,
    relationshipRows,
    extensionRows,
    personalSpellRows,
    authorizedRows,
    derivedAbilityRows,
    derivedAbilityTriggerRows,
    derivedAbilityRequirementRows,
    derivedAbilityUseConditionRows,
    derivedAbilityCostRows,
    derivedAbilityUseLimitRows,
    derivedAbilityEffectRows,
    derivedAbilityOwnershipRows,
    characterRow,
  ] = await Promise.all([
    db.select().from(campaignCharacterAttribute).where(eq(campaignCharacterAttribute.characterId, characterId)),
    db.select().from(attributeScoreReference).orderBy(
      asc(attributeScoreReference.attributeKey),
      asc(attributeScoreReference.score),
    ),
    db.select({
      id: campaignCharacterSkillAllocation.id,
      characterId: campaignCharacterSkillAllocation.characterId,
      skillId: campaignCharacterSkillAllocation.skillId,
      skillName: skill.name,
      skillClassification: skill.classification,
      skillTier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      parentAllocationId: campaignCharacterSkillAllocation.parentAllocationId,
      points: campaignCharacterSkillAllocation.points,
      createdAt: campaignCharacterSkillAllocation.createdAt,
      updatedAt: campaignCharacterSkillAllocation.updatedAt,
    }).from(campaignCharacterSkillAllocation)
      .innerJoin(skill, eq(skill.id, campaignCharacterSkillAllocation.skillId))
      .where(eq(campaignCharacterSkillAllocation.characterId, characterId))
      .orderBy(asc(campaignCharacterSkillAllocation.id)),
    db.select({
      characterId: campaignCharacterItem.characterId,
      itemId: campaignCharacterItem.itemId,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      recordType: item.recordType,
      category: item.category,
      quantity: campaignCharacterItem.quantity,
      unitCostCredits: campaignCharacterItem.unitCostCredits,
      weight: item.weight,
      weightUnit: item.weightUnit,
      acquiredAt: campaignCharacterItem.acquiredAt,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
    }).from(campaignCharacterItem)
      .innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
      .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
      .where(eq(campaignCharacterItem.characterId, characterId))
      .orderBy(asc(item.name)),
    db.select({
      id: campaignCharacterItemInstance.id,
      characterId: campaignCharacterItemInstance.characterId,
      itemId: campaignCharacterItemInstance.itemId,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      recordType: item.recordType,
      category: item.category,
      isMagical: item.isMagical,
      currentCharges: campaignCharacterItemInstance.currentCharges,
      unitCostCredits: campaignCharacterItemInstance.unitCostCredits,
      weight: item.weight,
      weightUnit: item.weightUnit,
      acquiredAt: campaignCharacterItemInstance.acquiredAt,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
    }).from(campaignCharacterItemInstance)
      .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
      .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
      .where(eq(campaignCharacterItemInstance.characterId, characterId))
      .orderBy(asc(item.name), asc(campaignCharacterItemInstance.id)),
    db.select().from(campaignCharacterCurrencyHolding).where(eq(campaignCharacterCurrencyHolding.characterId, characterId)),
    db.select({ system: campaignAllowedSystem.system }).from(campaignAllowedSystem).where(eq(campaignAllowedSystem.campaignId, row.campaignId)).orderBy(asc(campaignAllowedSystem.sortOrder)),
    db.select({ id: campaignAllowedDerivedAbility.derivedAbilityId })
      .from(campaignAllowedDerivedAbility)
      .where(eq(campaignAllowedDerivedAbility.campaignId, row.campaignId))
      .limit(1),
    db.select().from(campaignDerivedCurrency).where(eq(campaignDerivedCurrency.campaignId, row.campaignId)).orderBy(asc(campaignDerivedCurrency.sortOrder)),
    db.select({ id: race.id, name: race.name, archivedAt: race.archivedAt }).from(campaignAllowedRace).innerJoin(race, eq(race.id, campaignAllowedRace.raceId)).where(eq(campaignAllowedRace.campaignId, row.campaignId)).orderBy(asc(campaignAllowedRace.sortOrder), asc(race.name)),
    db.select().from(skill).orderBy(asc(skill.name), asc(skill.id)),
    db.select({ skillId: skillRelationship.skillId, relatedSkillId: skillRelationship.relatedSkillId, relationshipType: skillRelationship.relationshipType, sortOrder: skillRelationship.sortOrder }).from(skillRelationship).where(eq(skillRelationship.relationshipType, "parent")).orderBy(asc(skillRelationship.skillId), asc(skillRelationship.sortOrder)),
    db.select({ skillId: skillExtension.skillId, extensionType: skillExtension.extensionType, dataJson: skillExtension.dataJson }).from(skillExtension).where(inArray(skillExtension.extensionType, ["spell-import-source", "spell-construction"])),
    db.select({
      id: campaignCharacterSpellDocument.id,
      documentId: campaignCharacterSpellDocument.documentId,
      name: campaignCharacterSpellDocument.name,
      tradition: campaignCharacterSpellDocument.tradition,
      documentJson: campaignCharacterSpellDocument.documentJson,
    }).from(campaignCharacterSpellDocument)
      .where(and(
        eq(campaignCharacterSpellDocument.characterId, characterId),
        eq(campaignCharacterSpellDocument.inSpellbook, true),
      ))
      .orderBy(asc(campaignCharacterSpellDocument.name), asc(campaignCharacterSpellDocument.id)),
    db.select({
      id: item.id,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      recordType: item.recordType,
      category: item.category,
      archivedAt: item.archivedAt,
      credits: item.credits,
      priceBasis: item.priceBasis,
      description: item.description,
      weight: item.weight,
      weightUnit: item.weightUnit,
      size: item.size,
      durability: item.durability,
      isMagical: item.isMagical,
      effectCount: sql<number>`(select count(*)::int from ${itemEffect} where ${itemEffect.itemId} = ${item.id})`,
      runtimeUseMode: itemRuntimeProfile.useMode,
      runtimeQuantityPerUse: itemRuntimeProfile.quantityPerUse,
      runtimeMaximumCharges: itemRuntimeProfile.maximumCharges,
      runtimeChargesPerUse: itemRuntimeProfile.chargesPerUse,
      runtimeRechargeNotes: itemRuntimeProfile.rechargeNotes,
      runtimeActivationLabel: itemRuntimeProfile.activationLabel,
      runtimeUseNotes: itemRuntimeProfile.useNotes,
      weaponProfileId: weaponProfile.id,
      isFirearm: sql<boolean>`coalesce(lower(trim(${weaponProfile.profileRecordType})) <> 'ammunition' and (${weaponProfile.ammunitionItemId} is not null or exists(select 1 from ${weaponFiringMode} where ${weaponFiringMode.weaponProfileId} = ${weaponProfile.id})), false)`,
      weaponType: weaponProfile.weaponType,
      handedness: weaponProfile.handedness,
      damageSource: weaponProfile.damageSource,
      damage: weaponProfile.damage,
      damageType: weaponProfile.damageType,
      ammunitionItemId: weaponProfile.ammunitionItemId,
      ammunitionItemName: ammunitionItem.name,
      ammunitionDamage: ammunitionWeaponProfile.damage,
      ammunitionDamageType: ammunitionWeaponProfile.damageType,
      rangeText: weaponProfile.rangeText,
      reachText: weaponProfile.reachText,
      weaponRulesText: weaponProfile.rulesText,
      armorType: armorProfile.armorType,
      coverage: armorProfile.coverage,
      baseSoak: armorProfile.baseSoak,
      armorDamageModifiers: armorProfile.damageModifiersSourceText,
      armorRulesText: armorProfile.rulesText,
    }).from(campaignInventoryItem)
      .innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
      .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
      .leftJoin(ammunitionItem, eq(ammunitionItem.id, weaponProfile.ammunitionItemId))
      .leftJoin(ammunitionWeaponProfile, eq(ammunitionWeaponProfile.itemId, ammunitionItem.id))
      .leftJoin(armorProfile, eq(armorProfile.itemId, item.id))
      .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
      .where(eq(campaignInventoryItem.campaignId, row.campaignId))
      .orderBy(asc(campaignInventoryItem.sortOrder), asc(item.name)),
    db.select({
      id: derivedAbility.id,
      name: derivedAbility.name,
      description: derivedAbility.description,
      mechanicalEffect: derivedAbility.mechanicalEffect,
      acquisitionType: derivedAbility.acquisitionType,
      activationType: derivedAbility.activationType,
      sourceSystem: derivedAbility.sourceSystem,
      sourceExternalId: derivedAbility.sourceExternalId,
      archivedAt: derivedAbility.archivedAt,
    }).from(derivedAbility)
      .orderBy(asc(derivedAbility.name), asc(derivedAbility.id)),
    db.select({
      triggerId: derivedAbilityTrigger.id,
      derivedAbilityId: derivedAbilityTrigger.derivedAbilityId,
      triggerType: derivedAbilityTrigger.triggerType,
      attributeKey: derivedAbilityTrigger.attributeKey,
      minimumScore: derivedAbilityTrigger.minimumScore,
      sortOrder: derivedAbilityTrigger.sortOrder,
    }).from(derivedAbilityTrigger)
      .orderBy(
        asc(derivedAbilityTrigger.derivedAbilityId),
        asc(derivedAbilityTrigger.sortOrder),
        asc(derivedAbilityTrigger.id),
      ),
    db.select().from(derivedAbilityRequirement).orderBy(
      asc(derivedAbilityRequirement.derivedAbilityId),
      asc(derivedAbilityRequirement.requirementScope),
      asc(derivedAbilityRequirement.groupNumber),
      asc(derivedAbilityRequirement.sortOrder),
      asc(derivedAbilityRequirement.id),
    ),
    db.select().from(derivedAbilityUseCondition).orderBy(
      asc(derivedAbilityUseCondition.derivedAbilityId),
      asc(derivedAbilityUseCondition.sortOrder),
      asc(derivedAbilityUseCondition.id),
    ),
    db.select().from(derivedAbilityCost).orderBy(
      asc(derivedAbilityCost.derivedAbilityId),
      asc(derivedAbilityCost.sortOrder),
      asc(derivedAbilityCost.id),
    ),
    db.select().from(derivedAbilityUseLimit).orderBy(
      asc(derivedAbilityUseLimit.derivedAbilityId),
      asc(derivedAbilityUseLimit.sortOrder),
      asc(derivedAbilityUseLimit.id),
    ),
    db.select().from(derivedAbilityEffect).orderBy(
      asc(derivedAbilityEffect.derivedAbilityId),
      asc(derivedAbilityEffect.sortOrder),
      asc(derivedAbilityEffect.id),
    ),
    db.select().from(characterDerivedAbility)
      .where(eq(characterDerivedAbility.characterId, characterId))
      .orderBy(
        asc(characterDerivedAbility.derivedAbilityId),
        asc(characterDerivedAbility.acquiredAt),
        asc(characterDerivedAbility.id),
      ),
    db.select({
      id: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      playerUserId: campaignCharacter.playerUserId,
      name: campaignCharacter.name,
      campaignName: campaign.name,
      playerUsername: user.username,
      playerName: user.name,
      createdAt: campaignCharacter.createdAt,
      updatedAt: campaignCharacter.updatedAt,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      npcBuildMode: campaignCharacter.npcBuildMode,
      npcRoleLabel: campaignCharacter.npcRoleLabel,
      archivedAt: campaignCharacter.archivedAt,
      archiveReason: campaignCharacter.archiveReason,
      attributePoints: campaign.attributePoints,
      skillPoints: campaign.skillPoints,
      maxStartingSkill: campaign.maxStartingSkill,
      pointsToUnlockNextTier: campaign.pointsToUnlockNextTier,
      maxPointsInSkill: campaign.maxPointsInSkill,
      startingCreditAmount: campaign.startingCreditAmount,
      currencySystem: campaign.currencySystem,
      fatePointMethod: campaign.fatePointMethod,
      assignedFatePoints: campaign.assignedFatePoints,
      legacyDerivedAbilityCompatibilityResolved:
        campaign.legacyDerivedAbilityCompatibilityResolved,
    }).from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
      .innerJoin(user, eq(user.id, campaignCharacter.playerUserId))
      .where(eq(campaignCharacter.id, characterId))
      .limit(1),
  ]);

  const core = characterRow[0];
  if (!core) throw new Error("Character could not be reloaded.");
  const importMap = new Map<number, { spellLevel: string | null; manaCost: number | null }>();
  const spellDocuments = new Map<number, string>();
  for (const extension of extensionRows) {
    if (extension.extensionType === "spell-import-source") importMap.set(extension.skillId, readSpellImportReference(extension.dataJson));
    if (extension.extensionType === "spell-construction") spellDocuments.set(extension.skillId, extension.dataJson);
  }

  const selectedRace = profileRow.raceId === null ? null : await readRaceAggregate(profileRow.raceId);
  if (profileRow.raceId !== null && !allowedRaceRows.some(({ id }) => id === profileRow.raceId)) {
    throw new Error("The Character references a Race that is not allowed by its Campaign.");
  }

  assertNoStackInstanceOwnershipCollision({
    definitions: authorizedRows.map((entry) => ({
      itemId: entry.id,
      runtimeProfile: readItemRuntimeProfile(entry),
      requiresExactInstance: entry.isFirearm === true,
    })),
    stacks: ownedItems,
    instances: ownedItemInstances,
  });

  const allowedSystems = getEffectiveCampaignSystems(
    allowedSystemRows.map(({ system }) => system),
    {
      hasLegacyDerivedAbilityConfiguration: legacyDerivedAbilityRows.length > 0,
      legacyDerivedAbilityCompatibilityResolved:
        core.legacyDerivedAbilityCompatibilityResolved,
    },
  );
  const derivedAbilityCatalog = assembleDerivedAbilityCatalog({
    definitions: derivedAbilityRows.map(({ archivedAt, ...definition }) => ({
      ...definition,
      archived: archivedAt !== null,
    })),
    triggers: derivedAbilityTriggerRows.map((trigger) => ({
      id: trigger.triggerId,
      derivedAbilityId: trigger.derivedAbilityId,
      triggerType: trigger.triggerType,
      attributeKey: trigger.attributeKey,
      minimumScore: trigger.minimumScore,
      sortOrder: trigger.sortOrder,
    })),
    requirements: derivedAbilityRequirementRows.map((requirement) => ({
      ...requirement,
      requirementType:
        requirement.requirementType as DerivedAbilityRequirementType,
      operator:
        requirement.operator as DerivedAbilityRequirementOperator | null,
    })),
    useConditions: derivedAbilityUseConditionRows.map((condition) => ({
      ...condition,
      conditionType:
        condition.conditionType as DerivedAbilityUseConditionType,
      operator:
        condition.operator as DerivedAbilityRequirementOperator | null,
    })),
    costs: derivedAbilityCostRows.map((cost) => ({
      ...cost,
      costType: cost.costType as DerivedAbilityCostType,
    })),
    useLimits: derivedAbilityUseLimitRows.map((limit) => ({
      ...limit,
      refreshScope: limit.refreshScope as DerivedAbilityRefreshScope,
    })),
    effects: decodeDerivedAbilityEffectRows(derivedAbilityEffectRows),
  });
  const ownerships = derivedAbilityOwnershipRows.map((ownership) => ({
    ...ownership,
    acquiredAt: ownership.acquiredAt.toISOString(),
    revokedAt: ownership.revokedAt?.toISOString() ?? null,
  }));
  const storedSkillPoints = new Map<number, number>();
  for (const allocation of allocationRows) {
    storedSkillPoints.set(
      allocation.skillId,
      Math.max(storedSkillPoints.get(allocation.skillId) ?? 0, allocation.points),
    );
  }
  const resolution = resolveCharacterDerivedAbilities({
    catalog: derivedAbilityCatalog,
    ownerships,
    attributes: Object.fromEntries(
      attributeRows.map(({ attributeKey, value }) => [attributeKey, value]),
    ),
    skillPoints: storedSkillPoints,
    allowedSystems,
  });

  const aggregate: CharacterAggregate = {
    character: {
      id: core.id,
      campaignId: core.campaignId,
      playerUserId: core.playerUserId,
      name: core.name,
      campaignName: core.campaignName,
      playerUsername: core.playerUsername ?? core.playerName,
      createdAt: core.createdAt.toISOString(),
      updatedAt: core.updatedAt.toISOString(),
      isNpc: core.isNpc,
      npcKind: core.npcKind === "creature" ? "creature" : "race",
      npcBuildMode: core.npcBuildMode === "simple"
        ? "simple"
        : core.npcBuildMode === "detailed"
          ? "detailed"
          : null,
      npcRoleLabel: core.npcRoleLabel,
      archivedAt: core.archivedAt?.toISOString() ?? null,
      archiveReason: core.archiveReason,
    },
    profile: {
      characterId: profileRow.characterId,
      raceId: profileRow.raceId,
      age: profileRow.age,
      sex: profileRow.sex,
      heightFeet: profileRow.heightFeet,
      heightInches: profileRow.heightInches,
      weight: profileRow.weight,
      skinColor: profileRow.skinColor,
      eyeColor: profileRow.eyeColor,
      hairColor: profileRow.hairColor,
      deity: profileRow.deity,
      definingMarks: profileRow.definingMarks,
      personality: profileRow.personality,
      goals: profileRow.goals,
      secrets: profileRow.secrets,
      backstory: profileRow.backstory,
      motivations: profileRow.motivations,
      fame: profileRow.fame,
      experience: profileRow.experience,
      totalExperience: profileRow.totalExperience,
      quintessence: profileRow.quintessence,
      totalQuintessence: profileRow.totalQuintessence,
      hpMultiplierSteps: profileRow.hpMultiplierSteps ?? 0,
      baseMovementSteps: profileRow.baseMovementSteps ?? 0,
      baseMagicSteps: profileRow.baseMagicSteps ?? 0,
      fatePoints: profileRow.fatePoints,
      creditsRemaining: profileRow.creditsRemaining,
      creationCompletedAt: profileRow.creationCompletedAt?.toISOString() ?? null,
      createdAt: profileRow.createdAt.toISOString(),
      updatedAt: profileRow.updatedAt.toISOString(),
    },
    attributes: attributeRows.map((attribute) => ({
      characterId: attribute.characterId,
      attributeKey: attribute.attributeKey as CharacterAttributeKey,
      value: attribute.value,
    })),
    attributeReferenceCatalog: attributeReferenceRows.map((reference) => ({
      ...reference,
      attributeKey: reference.attributeKey as CharacterAttributeReferenceKey,
    })),
    skillAllocations: allocationRows.map((allocation) => ({ ...allocation, createdAt: allocation.createdAt.toISOString(), updatedAt: allocation.updatedAt.toISOString() })),
    items: ownedItems.map((entry) => ({
      characterId: entry.characterId,
      itemId: entry.itemId,
      canonicalId: entry.canonicalId,
      name: entry.name,
      catalogScope: entry.catalogScope,
      equipmentGroup: entry.equipmentGroup,
      recordType: entry.recordType,
      category: entry.category,
      quantity: entry.quantity,
      unitCostCredits: entry.unitCostCredits,
      weight: entry.weight,
      weightUnit: entry.weightUnit,
      acquiredAt: entry.acquiredAt.toISOString(),
    })),
    itemInstances: ownedItemInstances.map((entry) => ({
      id: entry.id,
      characterId: entry.characterId,
      itemId: entry.itemId,
      canonicalId: entry.canonicalId,
      name: entry.name,
      catalogScope: entry.catalogScope,
      equipmentGroup: entry.equipmentGroup,
      recordType: entry.recordType,
      category: entry.category,
      isMagical: entry.isMagical,
      currentCharges: validateCurrentItemCharges(entry.currentCharges),
      unitCostCredits: entry.unitCostCredits,
      weight: entry.weight,
      weightUnit: entry.weightUnit,
      acquiredAt: entry.acquiredAt.toISOString(),
      runtimeProfile: readItemRuntimeProfile(entry),
    })),
    currencyHoldings,
    campaign: {
      id: core.campaignId,
      name: core.campaignName,
      attributePoints: core.attributePoints,
      skillPoints: core.skillPoints,
      maxStartingSkill: core.maxStartingSkill,
      pointsToUnlockNextTier: core.pointsToUnlockNextTier,
      maxPointsInSkill: core.maxPointsInSkill,
      startingCreditAmount: core.startingCreditAmount,
      currencySystem: core.currencySystem,
      fatePointMethod: core.fatePointMethod,
      assignedFatePoints: core.assignedFatePoints,
      allowedSystems,
      derivedCurrencies: currencies,
    },
    allowedRaces: allowedRaceRows.map(({ archivedAt, ...entry }) => ({
      ...entry,
      archived: archivedAt !== null,
    })),
    selectedRace,
    skillCatalog: skillRows.map((skillRow) => ({
      id: skillRow.id,
      name: skillRow.name,
      classification: skillRow.classification,
      tier: skillRow.tier,
      primaryAttribute: skillRow.primaryAttribute,
      secondaryAttribute: skillRow.secondaryAttribute,
      definition: skillRow.definition,
      spellLevel: importMap.get(skillRow.id)?.spellLevel ?? null,
      manaCost: importMap.get(skillRow.id)?.manaCost ?? null,
      spellDocumentJson: spellDocuments.get(skillRow.id) ?? null,
      archived: skillRow.archivedAt !== null,
    })),
    skillRelationships: relationshipRows,
    personalSpellbook: personalSpellRows,
    authorizedItems: authorizedRows.map((entry) => ({
      id: entry.id,
      canonicalId: entry.canonicalId,
      name: entry.name,
      catalogScope: entry.catalogScope,
      equipmentGroup: entry.equipmentGroup,
      recordType: entry.recordType,
      category: entry.category,
      credits: entry.credits,
      priceBasis: entry.priceBasis,
      description: entry.description,
      weight: entry.weight,
      weightUnit: entry.weightUnit,
      size: entry.size,
      durability: entry.durability,
      isMagical: entry.isMagical,
      effectCount: entry.effectCount,
      runtimeProfile: readItemRuntimeProfile(entry),
      weaponProfileId: entry.weaponProfileId,
      isFirearm: entry.isFirearm,
      weaponType: entry.weaponType,
      handedness: entry.handedness,
      damageSource: entry.damageSource,
      damage: entry.damage,
      damageType: entry.damageType,
      ammunitionItemId: entry.ammunitionItemId,
      ammunitionItemName: entry.ammunitionItemName,
      ammunitionDamage: entry.ammunitionDamage,
      ammunitionDamageType: entry.ammunitionDamageType,
      rangeText: entry.rangeText,
      reachText: entry.reachText,
      weaponRulesText: entry.weaponRulesText,
      armorType: entry.armorType,
      coverage: entry.coverage,
      baseSoak: entry.baseSoak,
      armorDamageModifiers: entry.armorDamageModifiers,
      armorRulesText: entry.armorRulesText,
      archived: entry.archivedAt !== null,
    })),
    derivedAbilities: derivedAbilityCatalog,
    derivedAbilityOwnerships: ownerships,
    derivedAbilityStatuses: resolution.statuses,
    effectiveDerivedAbilityIds: resolution.effectiveDerivedAbilityIds,
  };

  return aggregate;
}

export async function getAllowedRaceForCharacter(
  characterId: number,
  raceId: number,
  godMode = false,
): Promise<CharacterRaceAggregate> {
  if (!Number.isInteger(raceId) || raceId <= 0) {
    throw new Error("Choose a saved Race.");
  }
  const { row } = await requireCharacterAccess(characterId, godMode);
  const [allowed] = await db
    .select({ raceId: campaignAllowedRace.raceId })
    .from(campaignAllowedRace)
    .innerJoin(race, eq(race.id, campaignAllowedRace.raceId))
    .where(
      and(
        eq(campaignAllowedRace.campaignId, row.campaignId),
        eq(campaignAllowedRace.raceId, raceId),
        isNull(race.archivedAt),
      ),
    )
    .limit(1);
  if (!allowed) throw new Error("That Race is not allowed by this Campaign.");
  const selectedRace = await readRaceAggregate(raceId);
  if (!selectedRace) throw new Error("The selected Race could not be loaded.");
  return selectedRace;
}

function normalizeDraft(aggregate: CharacterAggregate, draft: CharacterDraft, godMode: boolean) {
  const heightFeet = optionalWholeNonNegative(draft.profile.heightFeet, "Height feet");
  const heightInches = optionalWholeNonNegative(draft.profile.heightInches, "Height inches");
  if (heightInches !== null && heightInches > 11) throw new Error("Height inches must be between 0 and 11.");
  if (draft.profile.raceId !== null) {
    const selected = aggregate.allowedRaces.find(({ id }) => id === draft.profile.raceId);
    if (!selected || (selected.archived && draft.profile.raceId !== aggregate.profile.raceId)) {
      throw new Error("Choose an active Race allowed by this Campaign.");
    }
  }

  const attributes = CHARACTER_ATTRIBUTE_KEYS.map((attributeKey) => ({
    attributeKey,
    value: nonNegative(draft.attributes[attributeKey], `${attributeKey} Attribute`),
  }));
  const seenItems = new Set<number>();
  const items = draft.items.map((entry) => {
    if (!Number.isInteger(entry.itemId) || entry.itemId <= 0) throw new Error("Character Item must reference a saved Item.");
    if (seenItems.has(entry.itemId)) throw new Error("A master Item can only appear once in Character possessions.");
    seenItems.add(entry.itemId);
    if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) throw new Error("Character Item quantity must be a positive whole number.");
    if (!Number.isFinite(entry.unitCostCredits) || entry.unitCostCredits < 0) throw new Error("Item unit cost must be zero or greater.");
    const authorized = aggregate.authorizedItems.find(({ id }) => id === entry.itemId);
    if (!authorized) throw new Error("Character possessions must be Campaign-authorized Items.");
    const existingItem = aggregate.items.find(({ itemId }) => itemId === entry.itemId);
    if (authorized.archived && (!existingItem || entry.quantity > existingItem.quantity)) {
      throw new Error("Archived Items cannot be added to or increased in Character possessions.");
    }
    assertItemOwnershipStrategy(authorized.runtimeProfile, "stack", authorized.name, {
      requiresExactInstance: authorized.isFirearm === true,
      allowLegacyExactStack: true,
    });
    if (!godMode && (authorized.credits === null || Math.abs(authorized.credits - entry.unitCostCredits) > 0.000001)) {
      throw new Error("Starting possessions must be Campaign-authorized and use their canonical price.");
    }
    return entry;
  });

  if (!Array.isArray(draft.itemInstances)) {
    throw new Error("Character owned Item instances are missing from the draft.");
  }
  const existingInstances = new Map(aggregate.itemInstances.map((entry) => [entry.id, entry]));
  const seenDraftInstanceIds = new Set<number>();
  const seenPersistedInstanceIds = new Set<number>();
  const itemInstances = draft.itemInstances.map((entry) => {
    if (!Number.isSafeInteger(entry.draftId) || seenDraftInstanceIds.has(entry.draftId)) {
      throw new Error("Every owned Item instance needs a distinct draft identity.");
    }
    seenDraftInstanceIds.add(entry.draftId);
    if (!Number.isInteger(entry.itemId) || entry.itemId <= 0) {
      throw new Error("Owned Item instance must reference a saved Item.");
    }
    if (!Number.isFinite(entry.unitCostCredits) || entry.unitCostCredits < 0) {
      throw new Error("Item instance unit cost must be zero or greater.");
    }
    const authorized = aggregate.authorizedItems.find(({ id }) => id === entry.itemId);
    if (!authorized) throw new Error("Owned Item instances must use Campaign-authorized Items.");
    if (authorized.archived && entry.instanceId === null) {
      throw new Error("Archived Items cannot be added as new owned instances.");
    }
    assertItemOwnershipStrategy(authorized.runtimeProfile, "instance", authorized.name, {
      requiresExactInstance: authorized.isFirearm === true,
    });

    if (entry.instanceId === null) {
      if (entry.draftId >= 0) throw new Error("An unsaved Item instance needs a temporary draft identity.");
      if (!godMode && (authorized.credits === null || Math.abs(authorized.credits - entry.unitCostCredits) > 0.000001)) {
        throw new Error("Starting possessions must be Campaign-authorized and use their canonical price.");
      }
      return entry;
    }

    if (!Number.isInteger(entry.instanceId) || entry.instanceId <= 0 || seenPersistedInstanceIds.has(entry.instanceId)) {
      throw new Error("Owned Item instance identity is invalid or duplicated.");
    }
    seenPersistedInstanceIds.add(entry.instanceId);
    const existing = existingInstances.get(entry.instanceId);
    if (
      !existing
      || existing.itemId !== entry.itemId
      || Math.abs(existing.unitCostCredits - entry.unitCostCredits) > 0.000001
    ) {
      throw new Error("Owned Item instance identity and acquisition data cannot be changed.");
    }
    return entry;
  });

  assertNoStackInstanceOwnershipCollision({
    definitions: aggregate.authorizedItems.map((entry) => ({
      itemId: entry.id,
      runtimeProfile: entry.runtimeProfile,
      requiresExactInstance: entry.isFirearm === true,
    })),
    stacks: items,
    instances: itemInstances,
  });

  const currenciesSeen = new Set<number>();
  const currencyHoldings = godMode
    ? draft.currencyHoldings.map((holding) => {
        if (!aggregate.campaign.derivedCurrencies.some(({ id }) => id === holding.currencyId)) throw new Error("Currency must belong to this Campaign.");
        if (currenciesSeen.has(holding.currencyId)) throw new Error("A Campaign Currency can only appear once in a purse.");
        currenciesSeen.add(holding.currencyId);
        if (!Number.isInteger(holding.quantity) || holding.quantity < 0) throw new Error("Currency quantity must be a whole number zero or greater.");
        return holding;
      })
    : [];

  const name = required(draft.name, aggregate.character.isNpc ? "NPC Name" : "Character Name");
  const npcRoleLabel = aggregate.character.isNpc
    ? required(draft.npcRoleLabel ?? "", "NPC Role / Label")
    : aggregate.character.npcRoleLabel ?? "";
  const profile = {
    raceId: draft.profile.raceId,
    age: draft.profile.age === null ? null : Math.trunc(nonNegative(draft.profile.age, "Age")),
    sex: clean(draft.profile.sex),
    heightFeet,
    heightInches,
    weight: draft.profile.weight === null ? null : nonNegative(draft.profile.weight, "Weight"),
    skinColor: clean(draft.profile.skinColor),
    eyeColor: clean(draft.profile.eyeColor),
    hairColor: clean(draft.profile.hairColor),
    deity: clean(draft.profile.deity),
    definingMarks: clean(draft.profile.definingMarks),
    personality: clean(draft.profile.personality),
    goals: clean(draft.profile.goals),
    secrets: clean(draft.profile.secrets),
    backstory: clean(draft.profile.backstory),
    motivations: clean(draft.profile.motivations),
    fame: nonNegative(draft.profile.fame, "Fame"),
    experience: nonNegative(draft.profile.experience, "Experience"),
    totalExperience: nonNegative(draft.profile.totalExperience, "Total Experience"),
    quintessence: nonNegative(draft.profile.quintessence, "Quintessence"),
    totalQuintessence: nonNegative(draft.profile.totalQuintessence, "Total Quintessence"),
    hpMultiplierSteps: godMode
      ? optionalWholeNonNegative(draft.profile.hpMultiplierSteps, "HP multiplier steps") ?? 0
      : aggregate.profile.hpMultiplierSteps,
    baseMovementSteps: godMode
      ? optionalWholeNonNegative(draft.profile.baseMovementSteps, "Base Movement steps") ?? 0
      : aggregate.profile.baseMovementSteps,
    baseMagicSteps: godMode
      ? optionalWholeNonNegative(draft.profile.baseMagicSteps, "Base Magic steps") ?? 0
      : aggregate.profile.baseMagicSteps,
    fatePoints: godMode || aggregate.campaign.fatePointMethod === "Rolled"
      ? optionalWholeNonNegative(draft.profile.fatePoints, "Fate Points")
      : aggregate.campaign.assignedFatePoints ?? 0,
    creditsRemaining: nonNegative(draft.profile.creditsRemaining, "Current funds"),
  };

  return { name, npcRoleLabel, profile, attributes, items, itemInstances, currencyHoldings };
}

export async function saveCharacter(
  characterId: number,
  draft: CharacterDraft,
  completeCreation = false,
  godMode = false,
): Promise<CharacterAggregate> {
  await requireCharacterAccess(characterId, godMode);
  const aggregate = await getCharacter(characterId, godMode);
  if (aggregate.character.isNpc && aggregate.character.npcBuildMode === "simple") {
    throw new Error("Use the Simple NPC editor until this NPC is upgraded.");
  }
  if (aggregate.character.archivedAt) {
    throw new Error(aggregate.character.isNpc
      ? "Archived NPCs are read-only. Restore this NPC before you save it."
      : "Archived Characters are read-only. Restore this Character before you save it.");
  }
  if (!godMode && aggregate.profile.creationCompletedAt) {
    throw new Error("Character creation is complete and its creation record is permanently locked.");
  }

  const normalized = normalizeDraft(aggregate, draft, godMode);
  const selectedRace = draft.profile.raceId === null ? null : await readRaceAggregate(draft.profile.raceId);
  const readiness = evaluateCharacterReadiness(draft, aggregate, selectedRace);
  if (!godMode) {
    if (getAttributePointsUsed(draft) > aggregate.campaign.attributePoints + 0.000001) {
      throw new Error("Character Attributes exceed the Campaign Attribute Point budget.");
    }
    for (const key of CHARACTER_ATTRIBUTE_KEYS) {
      const cap = getRaceAttributeCap(selectedRace, key);
      if (cap !== null && draft.attributes[key] > cap + 0.000001) {
        throw new Error(`${key} exceeds the selected Race maximum.`);
      }
    }
    if (getSkillPointsUsed(draft) > aggregate.campaign.skillPoints + 0.000001) {
      throw new Error("Character Skill allocations exceed the Campaign Skill Point budget.");
    }
    if (readiness.issues.includes("One or more Skill allocations violate Campaign rules.")) {
      throw new Error("One or more Skill allocations violate Campaign rules.");
    }
  }
  if (completeCreation && !readiness.ready) {
    throw new Error(readiness.issues.join(" "));
  }

  let creditsRemaining = godMode
    ? normalized.profile.creditsRemaining
    : Math.max(
        0,
        aggregate.campaign.startingCreditAmount - getOwnedItemPurchaseCost({
          stacks: normalized.items,
          instances: normalized.itemInstances,
        }),
      );
  let currencyHoldings = normalized.currencyHoldings;
  if (aggregate.campaign.currencySystem === "Credits") {
    if (godMode && currencyHoldings.length) {
      throw new Error("A Credits Campaign cannot store derived Currency holdings.");
    }
    currencyHoldings = [];
  } else {
    if (!aggregate.campaign.derivedCurrencies.length) {
      throw new Error("Derived Currency requires at least one saved denomination.");
    }
    if (godMode) {
      creditsRemaining = getCanonicalCreditsFromHoldings(
        aggregate.campaign.derivedCurrencies,
        currencyHoldings,
      );
    } else {
      currencyHoldings = getCampaignMoneyBreakdown(
        creditsRemaining,
        aggregate.campaign.currencySystem,
        aggregate.campaign.derivedCurrencies,
      ).entries
        .filter((entry) => entry.quantity > 0)
        .map((entry) => ({ currencyId: entry.id, quantity: entry.quantity }));
    }
  }

  await db.transaction(async (tx) => {
    const [lockedCharacter] = await tx.select({
      isNpc: campaignCharacter.isNpc,
      npcBuildMode: campaignCharacter.npcBuildMode,
      archivedAt: campaignCharacter.archivedAt,
    }).from(campaignCharacter)
      .where(eq(campaignCharacter.id, characterId))
      .limit(1)
      .for("update");
    if (!lockedCharacter) throw new Error("Character not found.");
    if (lockedCharacter.isNpc && lockedCharacter.npcBuildMode === "simple") {
      throw new Error("Use the Simple NPC editor until this NPC is upgraded.");
    }
    if (lockedCharacter.archivedAt) {
      throw new Error(lockedCharacter.isNpc
        ? "Archived NPCs are read-only. Restore this NPC before you save it."
        : "Archived Characters are read-only. Restore this Character before you save it.");
    }
    await tx.update(campaignCharacter).set({
      name: normalized.name,
      npcRoleLabel: normalized.npcRoleLabel,
      updatedAt: new Date(),
    }).where(eq(campaignCharacter.id, characterId));
    await tx.update(campaignCharacterProfile).set({
      ...normalized.profile,
      creditsRemaining,
      creationCompletedAt: completeCreation ? new Date() : aggregate.profile.creationCompletedAt ? new Date(aggregate.profile.creationCompletedAt) : null,
      updatedAt: new Date(),
    }).where(eq(campaignCharacterProfile.characterId, characterId));

    const storedAttributeKeys = new Set(
      aggregate.attributes.map(({ attributeKey }) => attributeKey),
    );
    for (const entry of normalized.attributes) {
      if (storedAttributeKeys.has(entry.attributeKey)) {
        await tx.update(campaignCharacterAttribute).set({ value: entry.value }).where(and(
          eq(campaignCharacterAttribute.characterId, characterId),
          eq(campaignCharacterAttribute.attributeKey, entry.attributeKey),
        ));
      } else {
        await tx.insert(campaignCharacterAttribute).values({ characterId, ...entry });
      }
    }

    const allocationMap = new Map(draft.skillAllocations.map((entry) => [entry.draftId, entry]));
    const storedAllocationMap = new Map(
      aggregate.skillAllocations.map((entry) => [entry.id, entry]),
    );
    const retainedAllocationIds = new Set<number>();
    for (const allocation of draft.skillAllocations) {
      const stored = storedAllocationMap.get(allocation.draftId);
      if (!stored) {
        if (allocation.draftId > 0) {
          throw new Error("A submitted Skill allocation identity does not belong to this Character.");
        }
        continue;
      }
      if (
        stored.skillId !== allocation.skillId
        || stored.parentAllocationId !== allocation.parentDraftId
      ) {
        throw new Error("An existing Skill allocation identity or parent lineage cannot be redirected.");
      }
      retainedAllocationIds.add(stored.id);
    }
    const removedAllocationIds = aggregate.skillAllocations
      .map(({ id }) => id)
      .filter((id) => !retainedAllocationIds.has(id));
    if (removedAllocationIds.length) {
      const referencedOverrides = await readOverrideIdsForAllocationsInTransaction(
        tx,
        characterId,
        removedAllocationIds,
      );
      if (referencedOverrides.length) {
        const blocker = referencedOverrides[0];
        const modeQuery = blocker.firingModeId === null ? "" : `&weaponMode=${blocker.firingModeId}`;
        const reviewPath = `/heavens/tabletop?campaign=${blocker.campaignId}&workspace=weapons&weaponCharacter=${characterId}&weaponItem=${blocker.itemId}${modeQuery}`;
        throw new Error(
          `Skill allocation #${blocker.allocationId} is the authoritative source for persistent weapon override #${blocker.overrideId} on ${blocker.weaponName} (${blocker.canonicalId}). Remove or replace that override in G.O.D. Tabletop before deleting the allocation: ${reviewPath}`,
        );
      }
      await tx.delete(campaignCharacterSkillAllocation).where(and(
        eq(campaignCharacterSkillAllocation.characterId, characterId),
        inArray(campaignCharacterSkillAllocation.id, removedAllocationIds),
      ));
    }
    const savedMap = new Map<number, number>();
    const visiting = new Set<number>();
    async function saveAllocation(draftId: number): Promise<number> {
      const existing = savedMap.get(draftId);
      if (existing) return existing;
      if (visiting.has(draftId)) throw new Error("Skill allocation path contains a cycle.");
      visiting.add(draftId);
      const allocation = allocationMap.get(draftId);
      if (!allocation) throw new Error("Skill allocation path is incomplete.");
      const parentAllocationId = allocation.parentDraftId === null ? null : await saveAllocation(allocation.parentDraftId);
      const stored = storedAllocationMap.get(draftId);
      if (stored) {
        await tx.update(campaignCharacterSkillAllocation).set({
          points: nonNegative(allocation.points, "Skill points"),
          updatedAt: new Date(),
        }).where(and(
          eq(campaignCharacterSkillAllocation.id, stored.id),
          eq(campaignCharacterSkillAllocation.characterId, characterId),
        ));
        savedMap.set(draftId, stored.id);
        visiting.delete(draftId);
        return stored.id;
      }
      const selectedSkill = aggregate.skillCatalog.find(({ id }) => id === allocation.skillId);
      if (!selectedSkill || selectedSkill.archived) {
        throw new Error("Archived Skills cannot be added to a Character.");
      }
      const [created] = await tx.insert(campaignCharacterSkillAllocation).values({
        characterId,
        skillId: allocation.skillId,
        parentAllocationId,
        points: nonNegative(allocation.points, "Skill points"),
      }).returning({ id: campaignCharacterSkillAllocation.id });
      savedMap.set(draftId, created.id);
      visiting.delete(draftId);
      return created.id;
    }
    for (const allocation of draft.skillAllocations) await saveAllocation(allocation.draftId);

    const { removedInstanceIds, newInstances: newItemInstances } = planOwnedItemInstancePersistence({
      existingInstanceIds: aggregate.itemInstances.map(({ id }) => id),
      drafts: normalized.itemInstances,
    });
    await validateEquipmentOwnershipMutationInTransaction(tx, {
      characterId,
      nextStackQuantities: normalized.items,
      removedInstanceIds,
    });

    await tx.delete(campaignCharacterItem).where(eq(campaignCharacterItem.characterId, characterId));
    if (normalized.items.length) await tx.insert(campaignCharacterItem).values(normalized.items.map((entry) => ({ characterId, ...entry })));

    if (removedInstanceIds.length) {
      await tx.delete(campaignCharacterItemInstance).where(and(
        eq(campaignCharacterItemInstance.characterId, characterId),
        inArray(campaignCharacterItemInstance.id, removedInstanceIds),
      ));
    }
    if (newItemInstances.length) {
      const authorizedItems = new Map(aggregate.authorizedItems.map((entry) => [entry.id, entry]));
      await tx.insert(campaignCharacterItemInstance).values(newItemInstances.map((entry) => {
        const authorized = authorizedItems.get(entry.itemId);
        if (!authorized) throw new Error("Owned Item instance must use a Campaign-authorized Item.");
        return {
          characterId,
          itemId: entry.itemId,
          currentCharges: getStartingItemInstanceCharges(
            authorized.runtimeProfile,
            authorized.isFirearm === true,
          ),
          unitCostCredits: entry.unitCostCredits,
        };
      }));
    }
    await reconcileEquipmentAfterOwnershipMutationInTransaction(tx, characterId);

    await tx.delete(campaignCharacterCurrencyHolding).where(eq(campaignCharacterCurrencyHolding.characterId, characterId));
    if (currencyHoldings.length) await tx.insert(campaignCharacterCurrencyHolding).values(currencyHoldings.map((entry) => ({ characterId, ...entry })));
    await reconcileCharacterDerivedAbilityPassivesInTransaction(tx, characterId);
  });

  revalidatePath("/realms");
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/heavens/characters/${characterId}`);
  return getCharacter(characterId, godMode);
}

export async function advanceCharacterSkills(
  characterId: number,
  requests: CharacterSkillAdvancementRequest[],
): Promise<CharacterAggregate> {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error("Character advancement must reference a saved Character.");
  }
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error("Choose at least one Skill advancement.");
  }
  if (requests.length > 500) {
    throw new Error("The Skill advancement plan is too large.");
  }
  const planIds = new Set<string>();
  for (const request of requests) {
    if (!request.planId?.trim() || planIds.has(request.planId)) {
      throw new Error("Every planned Skill branch needs a unique plan identity.");
    }
    planIds.add(request.planId);
    if (!Number.isInteger(request.skillId) || request.skillId <= 0) {
      throw new Error("Every advancement must reference a saved Skill.");
    }
    if (!Number.isInteger(request.pointsToAdd) || request.pointsToAdd <= 0) {
      throw new Error("Skill advancement points must be positive whole numbers.");
    }
    if (
      request.parentAllocationId !== null &&
      (!Number.isInteger(request.parentAllocationId) || request.parentAllocationId <= 0)
    ) {
      throw new Error("A planned parent allocation must reference a saved record.");
    }
    if (request.parentAllocationId !== null && request.parentPlanId !== null) {
      throw new Error("A planned Skill cannot have two parent paths.");
    }
  }
  for (const request of requests) {
    if (request.parentPlanId !== null && !planIds.has(request.parentPlanId)) {
      throw new Error("A planned Skill references a missing planned parent.");
    }
  }

  const session = await requirePlayer();
  await db.transaction(async (tx) => {
    const [characterContext] = await tx
      .select({
        id: campaignCharacter.id,
        campaignId: campaignCharacter.campaignId,
        playerUserId: campaignCharacter.playerUserId,
        isNpc: campaignCharacter.isNpc,
        membershipUserId: campaignPlayer.userId,
        pointsToUnlockNextTier: campaign.pointsToUnlockNextTier,
        maxPointsInSkill: campaign.maxPointsInSkill,
      })
      .from(campaignCharacter)
      .innerJoin(campaign, eq(campaign.id, campaignCharacter.campaignId))
      .leftJoin(
        campaignPlayer,
        and(
          eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
          eq(campaignPlayer.userId, session.user.id),
        ),
      )
      .where(and(
        eq(campaignCharacter.id, characterId),
        isNull(campaignCharacter.archivedAt),
        isNull(campaign.archivedAt),
      ))
      .limit(1)
      .for("update", { of: campaignCharacter });
    if (!characterContext) throw new Error("Character not found.");
    if (
      characterContext.isNpc ||
      characterContext.playerUserId !== session.user.id ||
      characterContext.membershipUserId !== session.user.id
    ) {
      throw new Error("A Player may only advance their own Character.");
    }

    const [profile] = await tx
      .select({
        raceId: campaignCharacterProfile.raceId,
        baseMagicSteps: campaignCharacterProfile.baseMagicSteps,
        experience: campaignCharacterProfile.experience,
        totalExperience: campaignCharacterProfile.totalExperience,
        creationCompletedAt: campaignCharacterProfile.creationCompletedAt,
      })
      .from(campaignCharacterProfile)
      .where(eq(campaignCharacterProfile.characterId, characterId))
      .limit(1)
      .for("update");
    if (!profile) {
      throw new Error("The Character aggregate is missing its profile row.");
    }
    if (!profile.creationCompletedAt) {
      throw new Error(
        "Character creation must be completed before Experience can be spent.",
      );
    }

    const allocationRows = await tx
      .select({
        id: campaignCharacterSkillAllocation.id,
        skillId: campaignCharacterSkillAllocation.skillId,
        parentAllocationId: campaignCharacterSkillAllocation.parentAllocationId,
        points: campaignCharacterSkillAllocation.points,
      })
      .from(campaignCharacterSkillAllocation)
      .where(eq(campaignCharacterSkillAllocation.characterId, characterId))
      .orderBy(asc(campaignCharacterSkillAllocation.id))
      .for("update");
    const skillRows = await tx.select().from(skill).orderBy(asc(skill.id));
    const relationshipRows = await tx
      .select({
        skillId: skillRelationship.skillId,
        relatedSkillId: skillRelationship.relatedSkillId,
        relationshipType: skillRelationship.relationshipType,
      })
      .from(skillRelationship)
      .where(eq(skillRelationship.relationshipType, "parent"));
    const extensionRows = await tx
      .select({ skillId: skillExtension.skillId, dataJson: skillExtension.dataJson })
      .from(skillExtension)
      .where(eq(skillExtension.extensionType, "spell-import-source"));
    const allowedSystemRows = await tx
      .select({ system: campaignAllowedSystem.system })
      .from(campaignAllowedSystem)
      .where(eq(campaignAllowedSystem.campaignId, characterContext.campaignId));

    const importMap = new Map(
      extensionRows.map((extension) => [
        extension.skillId,
        readSpellImportReference(extension.dataJson),
      ]),
    );
    const skillCatalog = skillRows.map((skillRow) => ({
      id: skillRow.id,
      name: skillRow.name,
      classification: skillRow.classification,
      tier: skillRow.tier,
      primaryAttribute: skillRow.primaryAttribute,
      secondaryAttribute: skillRow.secondaryAttribute,
      definition: skillRow.definition,
      spellLevel: importMap.get(skillRow.id)?.spellLevel ?? null,
      manaCost: importMap.get(skillRow.id)?.manaCost ?? null,
      spellDocumentJson: null,
      archived: skillRow.archivedAt !== null,
    }));
    const catalogById = new Map(
      skillCatalog.map((catalogSkill) => [catalogSkill.id, catalogSkill]),
    );

    let selectedRace: CharacterRaceAggregate | null = null;
    if (profile.raceId !== null) {
      const [raceRow] = await tx
        .select({
          id: race.id,
          name: race.name,
          size: race.size,
          baseMagic: race.baseMagic,
          ageMin: race.ageMin,
          ageMax: race.ageMax,
          ageRangeText: race.ageRangeText,
          physicalDescription: race.physicalDescription,
          racialQuirkName: race.racialQuirkName,
          quirkSuccessEffect: race.quirkSuccessEffect,
          quirkFailureEffect: race.quirkFailureEffect,
        })
        .from(race)
        .where(eq(race.id, profile.raceId))
        .limit(1);
      if (!raceRow) throw new Error("The Character's Race could not be read.");
      const racialSkillRows = await tx
        .select({
          skillId: raceSkillLink.skillId,
          skillName: skill.name,
          skillClassification: skill.classification,
          linkType: raceSkillLink.linkType,
          value: raceSkillLink.value,
        })
        .from(raceSkillLink)
        .innerJoin(skill, eq(skill.id, raceSkillLink.skillId))
        .where(eq(raceSkillLink.raceId, profile.raceId));
      selectedRace = {
        race: raceRow,
        attributeCaps: [],
        movementModes: [],
        skillLinks: racialSkillRows,
      };
    }

    type ProjectedAllocation = {
      id: number;
      skillId: number;
      parentAllocationId: number | null;
      points: number;
    };
    type ResolvedRequest = {
      request: CharacterSkillAdvancementRequest;
      targetAllocationId: number;
      parentAllocationId: number | null;
      existingAllocationId: number | null;
      currentAllocationPoints: number;
    };
    let nextTemporaryId = -1;
    let projectedAllocations: ProjectedAllocation[] = allocationRows.map(
      (allocation) => ({ ...allocation }),
    );
    const targetIdByPlanId = new Map<string, number>();
    const resolvedRequests: ResolvedRequest[] = [];
    const plannedBranches = new Set<string>();
    const unresolved = [...requests];
    while (unresolved.length > 0) {
      let progressed = false;
      for (let index = unresolved.length - 1; index >= 0; index -= 1) {
        const request = unresolved[index];
        if (
          request.parentPlanId !== null &&
          !targetIdByPlanId.has(request.parentPlanId)
        ) {
          continue;
        }
        const resolvedParentId = request.parentPlanId !== null
          ? targetIdByPlanId.get(request.parentPlanId)!
          : request.parentAllocationId;
        if (
          resolvedParentId !== null &&
          !projectedAllocations.some((allocation) => allocation.id === resolvedParentId)
        ) {
          throw new Error("A planned Skill parent does not belong to this Character.");
        }
        const branchKey = `${resolvedParentId ?? "root"}:${request.skillId}`;
        if (plannedBranches.has(branchKey)) {
          throw new Error("A Skill branch may only appear once in an Advancement plan.");
        }
        plannedBranches.add(branchKey);
        const existing = projectedAllocations.find(
          (allocation) =>
            allocation.skillId === request.skillId &&
            allocation.parentAllocationId === resolvedParentId,
        );
        const targetAllocationId = existing?.id ?? nextTemporaryId--;
        const currentAllocationPoints = existing?.points ?? 0;
        if (existing) {
          projectedAllocations = projectedAllocations.map((allocation) =>
            allocation.id === existing.id
              ? { ...allocation, points: allocation.points + request.pointsToAdd }
              : allocation,
          );
        } else {
          projectedAllocations.push({
            id: targetAllocationId,
            skillId: request.skillId,
            parentAllocationId: resolvedParentId,
            points: request.pointsToAdd,
          });
        }
        targetIdByPlanId.set(request.planId, targetAllocationId);
        resolvedRequests.push({
          request,
          targetAllocationId,
          parentAllocationId: resolvedParentId,
          existingAllocationId: existing?.id ?? null,
          currentAllocationPoints,
        });
        unresolved.splice(index, 1);
        progressed = true;
      }
      if (!progressed) {
        throw new Error("The Advancement plan contains a missing parent or cycle.");
      }
    }

    const projectedById = new Map(
      projectedAllocations.map((allocation) => [allocation.id, allocation]),
    );
    const projectedManaProfiles = getCharacterManaProfiles(
      {
        skillAllocations: projectedAllocations.map((allocation) => ({
          draftId: allocation.id,
          skillId: allocation.skillId,
          parentDraftId: allocation.parentAllocationId,
          points: allocation.points,
        })),
      },
      skillCatalog,
      selectedRace,
      profile.baseMagicSteps,
    );
    let totalExperienceCost = 0;
    for (const resolved of resolvedRequests) {
      const target = catalogById.get(resolved.request.skillId);
      if (!target) throw new Error("A planned Skill could not be found.");
      if (target.archived) throw new Error(`${target.name} is archived and cannot receive new advancement.`);
      if (
        !canPlayerAdvanceSkillWithExperience(
          target,
          resolved.currentAllocationPoints,
        )
      ) {
        throw new Error(
          `${target.name} must be permanently owned before a Player can advance it with Experience.`,
        );
      }
      const racialGrant = getRacialSkillGrant(selectedRace, target.id);
      let root = target;
      let parent: ProjectedAllocation | null = null;
      if (resolved.parentAllocationId !== null) {
        parent = projectedById.get(resolved.parentAllocationId) ?? null;
        if (!parent) {
          throw new Error("A planned parent Skill path no longer exists.");
        }
        const parentSkill = catalogById.get(parent.skillId);
        if (!parentSkill) throw new Error("A planned parent Skill is missing.");
        const linked = relationshipRows.some(
          (relationship) =>
            relationship.skillId === target.id &&
            relationship.relatedSkillId === parentSkill.id &&
            relationship.relationshipType.trim().toLowerCase() === "parent",
        );
        if (!linked) {
          throw new Error(`${target.name} is not a child of ${parentSkill.name}.`);
        }
        if (
          parentSkill.tier !== null &&
          target.tier !== null &&
          target.tier !== parentSkill.tier + 1
        ) {
          throw new Error("Skill tiers do not follow their parent branch.");
        }
        let cursor: ProjectedAllocation | null = parent;
        const visited = new Set<number>();
        while (cursor) {
          if (visited.has(cursor.id)) {
            throw new Error("The planned Skill ancestry contains a cycle.");
          }
          visited.add(cursor.id);
          const cursorSkill = catalogById.get(cursor.skillId);
          if (!cursorSkill) {
            throw new Error("The planned Skill ancestry references a missing Skill.");
          }
          root = cursorSkill;
          if (cursor.parentAllocationId === null) break;
          cursor = projectedById.get(cursor.parentAllocationId) ?? null;
          if (!cursor) {
            throw new Error("The planned Skill ancestry has a missing parent.");
          }
        }
      } else if (target.tier !== null && target.tier !== 1) {
        throw new Error("Tier 2 and Tier 3 Skills require a parent allocation.");
      }

      const magicSystem = getCharacterMagicSystem(root);
      const spellAccessLevel = magicSystem
        ? projectedManaProfiles.find((mana) => mana.system === magicSystem)
            ?.spellAccessLevel ?? null
        : null;
      if (!canAccessSupernaturalSkillAtLevel(target, root, spellAccessLevel)) {
        throw new Error(
          `${target.name} is above the Character's current projected casting access.`,
        );
      }
      if (
        !isSkillAllowedByCampaign(
          target,
          root,
          allowedSystemRows.map(({ system }) => system),
          false,
          racialGrant.granted,
        )
      ) {
        throw new Error("That Skill is not allowed by this Campaign.");
      }
      if (parent) {
        const parentEffectivePoints = getEffectiveSkillPoints(
          parent.points,
          selectedRace,
          parent.skillId,
        );
        const unlockThreshold = getSkillUnlockThreshold(
          root,
          characterContext.pointsToUnlockNextTier,
        );
        if (
          !racialGrant.granted &&
          parentEffectivePoints + 0.000_001 < unlockThreshold
        ) {
          throw new Error(
            `${target.name} is locked until its parent reaches ${unlockThreshold} points.`,
          );
        }
      }

      const currentSkillNumber = getEffectiveSkillPoints(
        resolved.currentAllocationPoints,
        selectedRace,
        target.id,
      );
      const finalAllocation = projectedById.get(resolved.targetAllocationId)!;
      const finalSkillNumber = getEffectiveSkillPoints(
        finalAllocation.points,
        selectedRace,
        target.id,
      );
      const maximumSkillNumber = getEffectiveSkillMaximum(
        target,
        characterContext.maxPointsInSkill,
      );
      if (finalSkillNumber > maximumSkillNumber + 0.000_001) {
        throw new Error(
          `${target.name} cannot exceed ${maximumSkillNumber} Skill points.`,
        );
      }
      totalExperienceCost += getSkillAdvancementCost(
        currentSkillNumber,
        resolved.request.pointsToAdd,
      );
    }
    const ledger = getExperienceSpendingLedger(
      profile.experience,
      profile.totalExperience,
      totalExperienceCost,
    );

    const changedAt = new Date();
    const savedIdByTemporaryId = new Map<number, number>();
    for (const resolved of resolvedRequests) {
      if (resolved.existingAllocationId !== null) {
        const finalAllocation = projectedById.get(resolved.targetAllocationId)!;
        await tx
          .update(campaignCharacterSkillAllocation)
          .set({ points: finalAllocation.points, updatedAt: changedAt })
          .where(
            and(
              eq(campaignCharacterSkillAllocation.id, resolved.existingAllocationId),
              eq(campaignCharacterSkillAllocation.characterId, characterId),
            ),
          );
        continue;
      }
      const parentAllocationId = resolved.parentAllocationId === null
        ? null
        : resolved.parentAllocationId > 0
          ? resolved.parentAllocationId
          : savedIdByTemporaryId.get(resolved.parentAllocationId) ?? null;
      if (resolved.parentAllocationId !== null && parentAllocationId === null) {
        throw new Error("A planned parent Skill could not be saved.");
      }
      const [created] = await tx
        .insert(campaignCharacterSkillAllocation)
        .values({
          characterId,
          skillId: resolved.request.skillId,
          parentAllocationId,
          points: resolved.request.pointsToAdd,
          updatedAt: changedAt,
        })
        .returning({ id: campaignCharacterSkillAllocation.id });
      savedIdByTemporaryId.set(resolved.targetAllocationId, created.id);
    }
    await tx
      .update(campaignCharacterProfile)
      .set({ ...ledger, updatedAt: changedAt })
      .where(eq(campaignCharacterProfile.characterId, characterId));
    await tx
      .update(campaignCharacter)
      .set({ updatedAt: changedAt })
      .where(eq(campaignCharacter.id, characterId));
    await reconcileCharacterDerivedAbilityPassivesInTransaction(
      tx,
      characterId,
      session.user.id,
    );
  });

  revalidateCharacterAdvancementPaths(characterId);
  return getCharacter(characterId, false);
}

export async function advanceCharacterSkill(
  characterId: number,
  skillId: number,
  parentAllocationId: number | null,
  pointsToAdd = 1,
): Promise<CharacterAggregate> {
  return advanceCharacterSkills(characterId, [{
    planId: `legacy:${parentAllocationId ?? "root"}:${skillId}`,
    skillId,
    parentAllocationId,
    parentPlanId: null,
    pointsToAdd,
  }]);
}

export async function spendCharacterQuintessence(
  characterId: number,
  purchaseType: CharacterQuintessencePurchaseType,
  quantity: number,
  attributeKey: CharacterAttributeKey | null = null,
): Promise<CharacterAggregate> {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error("A Quintessence purchase must reference a saved Character.");
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Purchase quantity must be a positive whole number.");
  }
  if (!(["attribute", "fatePoints", "experience", "hpMultiplier", "baseMovement", "baseMagic"] as const).includes(purchaseType)) {
    throw new Error("Unsupported Quintessence purchase type.");
  }
  if (
    purchaseType === "attribute" &&
    (!attributeKey || !CHARACTER_ATTRIBUTE_KEYS.includes(attributeKey))
  ) {
    throw new Error("Attribute advancement requires one core Attribute.");
  }

  const session = await requirePlayer();
  await db.transaction(async (tx) => {
    const [characterContext] = await tx
      .select({
        id: campaignCharacter.id,
        playerUserId: campaignCharacter.playerUserId,
        isNpc: campaignCharacter.isNpc,
        membershipUserId: campaignPlayer.userId,
      })
      .from(campaignCharacter)
      .leftJoin(
        campaignPlayer,
        and(
          eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
          eq(campaignPlayer.userId, session.user.id),
        ),
      )
      .where(eq(campaignCharacter.id, characterId))
      .limit(1)
      .for("update", { of: campaignCharacter });
    if (!characterContext) throw new Error("Character not found.");
    if (
      characterContext.isNpc ||
      characterContext.playerUserId !== session.user.id ||
      characterContext.membershipUserId !== session.user.id
    ) {
      throw new Error("A Player may only spend Quintessence for their own Character.");
    }

    const [profile] = await tx
      .select({
        raceId: campaignCharacterProfile.raceId,
        quintessence: campaignCharacterProfile.quintessence,
        totalQuintessence: campaignCharacterProfile.totalQuintessence,
        experience: campaignCharacterProfile.experience,
        totalExperience: campaignCharacterProfile.totalExperience,
        fatePoints: campaignCharacterProfile.fatePoints,
        hpMultiplierSteps: campaignCharacterProfile.hpMultiplierSteps,
        baseMovementSteps: campaignCharacterProfile.baseMovementSteps,
        baseMagicSteps: campaignCharacterProfile.baseMagicSteps,
        creationCompletedAt: campaignCharacterProfile.creationCompletedAt,
      })
      .from(campaignCharacterProfile)
      .where(eq(campaignCharacterProfile.characterId, characterId))
      .limit(1)
      .for("update");
    if (!profile) {
      throw new Error("The Character aggregate is missing its profile row.");
    }
    if (!profile.creationCompletedAt) {
      throw new Error(
        "Character creation must be completed before Quintessence can be spent.",
      );
    }
    let validatedAttributeFinalValue: number | null = null;
    if (purchaseType === "attribute") {
      const [currentAttribute] = await tx
        .select({ value: campaignCharacterAttribute.value })
        .from(campaignCharacterAttribute)
        .where(
          and(
            eq(campaignCharacterAttribute.characterId, characterId),
            eq(campaignCharacterAttribute.attributeKey, attributeKey!),
          ),
        )
        .limit(1)
        .for("update");
      if (!currentAttribute) {
        throw new Error("The selected Character Attribute could not be found.");
      }
      let racialMaximum: number | null = null;
      if (profile.raceId !== null) {
        const capRows = await tx
          .select({
            attributeKey: raceAttributeCap.attributeKey,
            maxValue: raceAttributeCap.maxValue,
          })
          .from(raceAttributeCap)
          .where(eq(raceAttributeCap.raceId, profile.raceId))
          .for("share");
        const shortKey = attributeKey!.toUpperCase();
        const longKey = CHARACTER_ATTRIBUTE_LABELS[attributeKey!].toUpperCase();
        racialMaximum = capRows.find((cap) => {
          const recordedKey = cap.attributeKey.trim().toUpperCase();
          return recordedKey === shortKey || recordedKey === longKey;
        })?.maxValue ?? null;
      }
      validatedAttributeFinalValue = validateQuintessenceAttributeIncrease({
        currentAttributeValue: currentAttribute.value,
        quantity,
        racialMaximum,
      });
    }

    const ledger = getQuintessenceSpendingLedger({
      purchaseType,
      quantity,
      quintessence: profile.quintessence,
      totalQuintessence: profile.totalQuintessence,
      experience: profile.experience,
      totalExperience: profile.totalExperience,
    });
    const hpMultiplierSteps = purchaseType === "hpMultiplier"
      ? getHpMultiplierStepsAfterPurchase(profile.hpMultiplierSteps, quantity)
      : profile.hpMultiplierSteps;
    const baseMovementSteps = purchaseType === "baseMovement"
      ? getBaseMovementStepsAfterPurchase(profile.baseMovementSteps, quantity)
      : profile.baseMovementSteps;
    const baseMagicSteps = purchaseType === "baseMagic"
      ? getBaseMagicStepsAfterPurchase(profile.baseMagicSteps, quantity)
      : profile.baseMagicSteps;

    if (purchaseType === "attribute") {
      await tx
        .update(campaignCharacterAttribute)
        .set({ value: validatedAttributeFinalValue! })
        .where(
          and(
            eq(campaignCharacterAttribute.characterId, characterId),
            eq(campaignCharacterAttribute.attributeKey, attributeKey!),
          ),
        );
    }

    const changedAt = new Date();
    await tx
      .update(campaignCharacterProfile)
      .set({
        quintessence: ledger.quintessence,
        totalQuintessence: ledger.totalQuintessence,
        experience: ledger.experience,
        fatePoints:
          purchaseType === "fatePoints"
            ? (profile.fatePoints ?? 0) + quantity
            : profile.fatePoints,
        hpMultiplierSteps,
        baseMovementSteps,
        baseMagicSteps,
        updatedAt: changedAt,
      })
      .where(eq(campaignCharacterProfile.characterId, characterId));
    await tx
      .update(campaignCharacter)
      .set({ updatedAt: changedAt })
      .where(eq(campaignCharacter.id, characterId));
    await reconcileCharacterDerivedAbilityPassivesInTransaction(
      tx,
      characterId,
      session.user.id,
    );
  });

  revalidateCharacterAdvancementPaths(characterId);
  return getCharacter(characterId, false);
}

function revalidateCharacterAdvancementPaths(characterId: number) {
  revalidatePath("/realms");
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/realms/characters/${characterId}/advance`);
  revalidatePath(`/heavens/characters/${characterId}`);
}

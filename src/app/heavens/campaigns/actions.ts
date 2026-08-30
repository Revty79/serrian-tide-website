"use server";

import {
  and,
  asc,
  count,
  eq,
  inArray,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import {
  campaign,
  campaignAllowedSystem,
  campaignDerivedCurrency,
  campaignPlayer,
  campaignSystem,
  type CampaignSystem,
} from "@/db/campaign-schema";
import {
  campaignAllowedDerivedAbility,
  derivedAbility,
  derivedAbilityTrigger,
} from "@/db/derived-ability-schema";
import { item, itemTagCatalog, itemTagLink } from "@/db/item-schema";
import { race } from "@/db/race-schema";
import {
  buildCampaignInventoryPool,
  createCampaignInventoryPersistence,
  restoreCampaignInventoryPersistence,
  sortCampaignInventoryTags,
  type CampaignInventoryItemRecord,
  type CampaignInventoryPoolItem,
} from "@/features/campaigns/campaign-inventory";
import {
  buildCampaignPlayerCandidates,
  canAdministerCampaign,
} from "@/features/campaigns/campaign-membership";
import {
  normalizeCampaignDerivedAbilityIds,
  validateCampaignDerivedAbilitySelection,
} from "@/features/derived-abilities/campaign-derived-abilities";
import {
  getDerivedAbilityRequirementSummary,
  groupDerivedAbilityRows,
} from "@/features/derived-abilities/derived-ability-rules";
import type { CampaignDerivedAbilityOption } from "@/features/derived-abilities/models";
import {
  campaignAllowedRace,
  campaignCharacter,
  campaignCharacterProfile,
  campaignInventoryItem,
  campaignInventoryTag,
} from "@/db/realm-schema";
import { requireGod } from "@/lib/server-access";

export type CampaignAdminSummary = {
  id: number;
  name: string;
  currencySystem: "Credits" | "Derived Currency";
  updatedAt: string;
  playerCount: number;
  characterCount: number;
  npcCount: number;
};

export type CampaignAdminDraft = {
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
    id?: number;
    name: string;
    description: string;
    creditsPerUnit: number;
  }>;
  allowedRaceIds: number[];
  allowedDerivedAbilityIds: number[];
  inventoryTagIds: number[];
  inventoryItemIds: number[];
};

export type CampaignReferenceData = {
  races: Array<{ id: number; name: string; size: string }>;
  derivedAbilities: CampaignDerivedAbilityOption[];
  tags: Array<{ id: number; name: string; tagGroup: string; description: string }>;
};

export type CampaignMemberData = {
  players: Array<{
    userId: string;
    username: string;
    displayName: string;
    addedAt: string;
  }>;
  candidates: Array<{
    userId: string;
    username: string;
    displayName: string;
    roles: Array<"admin" | "god" | "player">;
    isMember: boolean;
    isCampaignCreator: boolean;
  }>;
  characters: Array<{
    id: number;
    campaignId: number;
    playerUserId: string;
    playerName: string;
    name: string;
    creationCompletedAt: string | null;
  }>;
  npcs: Array<{
    id: number;
    name: string;
    npcKind: "race" | "creature";
    creationCompletedAt: string | null;
  }>;
};

function clean(value: string | null | undefined) { return value?.trim() ?? ""; }
function required(value: string, label: string) { const result = clean(value); if (!result) throw new Error(`${label} is required.`); return result; }
function nonNegative(value: number, label: string) { if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`); return value; }

async function requireOwner(campaignId: number) {
  const session = await requireGod();
  const [owned] = await db.select({ id: campaign.id, createdByUserId: campaign.createdByUserId }).from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (!owned || !canAdministerCampaign(owned.createdByUserId, session.user.id)) throw new Error("Only the Campaign creator can manage this Campaign.");
  return session;
}

export async function listCampaignsForGod(): Promise<CampaignAdminSummary[]> {
  const session = await requireGod();
  const rows = await db.select({
    id: campaign.id,
    name: campaign.name,
    currencySystem: campaign.currencySystem,
    updatedAt: campaign.updatedAt,
  }).from(campaign).where(eq(campaign.createdByUserId, session.user.id)).orderBy(asc(campaign.name), asc(campaign.id));

  const ids = rows.map(({ id }) => id);
  if (!ids.length) return [];
  const [members, characters] = await Promise.all([
    db.select({ campaignId: campaignPlayer.campaignId }).from(campaignPlayer).where(inArray(campaignPlayer.campaignId, ids)),
    db.select({ campaignId: campaignCharacter.campaignId, isNpc: campaignCharacter.isNpc }).from(campaignCharacter).where(inArray(campaignCharacter.campaignId, ids)),
  ]);
  const playerCount = new Map<number, number>();
  for (const row of members) playerCount.set(row.campaignId, (playerCount.get(row.campaignId) ?? 0) + 1);
  const characterCount = new Map<number, number>();
  const npcCount = new Map<number, number>();
  for (const row of characters) {
    const map = row.isNpc ? npcCount : characterCount;
    map.set(row.campaignId, (map.get(row.campaignId) ?? 0) + 1);
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    currencySystem: row.currencySystem,
    updatedAt: row.updatedAt.toISOString(),
    playerCount: playerCount.get(row.id) ?? 0,
    characterCount: characterCount.get(row.id) ?? 0,
    npcCount: npcCount.get(row.id) ?? 0,
  }));
}

export async function getCampaignAdmin(campaignId: number): Promise<CampaignAdminDraft> {
  await requireOwner(campaignId);
  const [core] = await db.select().from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (!core) throw new Error("Campaign not found.");
  const [systems, currencies, races, derivedAbilities, tags, items] = await Promise.all([
    db.select({ system: campaignAllowedSystem.system }).from(campaignAllowedSystem).where(eq(campaignAllowedSystem.campaignId, campaignId)).orderBy(asc(campaignAllowedSystem.sortOrder)),
    db.select().from(campaignDerivedCurrency).where(eq(campaignDerivedCurrency.campaignId, campaignId)).orderBy(asc(campaignDerivedCurrency.sortOrder), asc(campaignDerivedCurrency.id)),
    db.select({ raceId: campaignAllowedRace.raceId }).from(campaignAllowedRace).where(eq(campaignAllowedRace.campaignId, campaignId)).orderBy(asc(campaignAllowedRace.sortOrder)),
    db.select({ derivedAbilityId: campaignAllowedDerivedAbility.derivedAbilityId }).from(campaignAllowedDerivedAbility).where(eq(campaignAllowedDerivedAbility.campaignId, campaignId)).orderBy(asc(campaignAllowedDerivedAbility.sortOrder)),
    db.select({ id: campaignInventoryTag.tagId, sortOrder: campaignInventoryTag.sortOrder }).from(campaignInventoryTag).where(eq(campaignInventoryTag.campaignId, campaignId)).orderBy(asc(campaignInventoryTag.sortOrder)),
    db.select({ id: campaignInventoryItem.itemId, sortOrder: campaignInventoryItem.sortOrder }).from(campaignInventoryItem).where(eq(campaignInventoryItem.campaignId, campaignId)).orderBy(asc(campaignInventoryItem.sortOrder)),
  ]);
  const inventorySelection = restoreCampaignInventoryPersistence(tags, items);
  return {
    id: core.id,
    name: core.name,
    attributePoints: core.attributePoints,
    skillPoints: core.skillPoints,
    maxStartingSkill: core.maxStartingSkill,
    pointsToUnlockNextTier: core.pointsToUnlockNextTier,
    maxPointsInSkill: core.maxPointsInSkill,
    startingCreditAmount: core.startingCreditAmount,
    currencySystem: core.currencySystem,
    fatePointMethod: core.fatePointMethod,
    assignedFatePoints: core.assignedFatePoints,
    allowedSystems: systems.map(({ system }) => system),
    derivedCurrencies: currencies.map(({ id, name, description, creditsPerUnit }) => ({ id, name, description, creditsPerUnit })),
    allowedRaceIds: races.map(({ raceId }) => raceId),
    allowedDerivedAbilityIds: derivedAbilities.map(({ derivedAbilityId }) => derivedAbilityId),
    inventoryTagIds: inventorySelection.tagIds,
    inventoryItemIds: inventorySelection.itemIds,
  };
}

export async function getCampaignReferenceData(campaignId: number): Promise<CampaignReferenceData> {
  await requireOwner(campaignId);
  return readCampaignReferenceData();
}

export async function getCampaignCreationReferenceData(): Promise<CampaignReferenceData> {
  await requireGod();
  return readCampaignReferenceData();
}

async function readCampaignReferenceData(): Promise<CampaignReferenceData> {
  const [races, tags, derivedAbilityRows] = await Promise.all([
    db.select({ id: race.id, name: race.name, size: race.size }).from(race).orderBy(asc(race.name), asc(race.id)),
    db.select({ id: itemTagCatalog.id, name: itemTagCatalog.name, tagGroup: itemTagCatalog.tagGroup, description: itemTagCatalog.description }).from(itemTagCatalog),
    db.select({
      id: derivedAbility.id,
      name: derivedAbility.name,
      description: derivedAbility.description,
      mechanicalEffect: derivedAbility.mechanicalEffect,
      sourceSystem: derivedAbility.sourceSystem,
      sourceExternalId: derivedAbility.sourceExternalId,
      triggerId: derivedAbilityTrigger.id,
      triggerType: derivedAbilityTrigger.triggerType,
      attributeKey: derivedAbilityTrigger.attributeKey,
      minimumScore: derivedAbilityTrigger.minimumScore,
      triggerSortOrder: derivedAbilityTrigger.sortOrder,
    }).from(derivedAbility)
      .innerJoin(derivedAbilityTrigger, eq(derivedAbilityTrigger.derivedAbilityId, derivedAbility.id))
      .orderBy(asc(derivedAbility.name), asc(derivedAbility.id), asc(derivedAbilityTrigger.sortOrder)),
  ]);
  const derivedAbilities = groupDerivedAbilityRows(derivedAbilityRows).map((ability) => ({
    ...ability,
    requirementSummary: getDerivedAbilityRequirementSummary(ability),
  }));
  return { races, derivedAbilities, tags: sortCampaignInventoryTags(tags) };
}

const campaignInventoryItemFields = {
  id: item.id,
  canonicalId: item.canonicalId,
  name: item.name,
  catalogScope: item.catalogScope,
  equipmentGroup: item.equipmentGroup,
  recordType: item.recordType,
  family: item.family,
  category: item.category,
  credits: item.credits,
};

type CampaignInventoryItemQueryRow = {
  id: number;
  canonicalId: string;
  name: string;
  catalogScope: string;
  equipmentGroup: string | null;
  recordType: string;
  family: string;
  category: string;
  credits: number | null;
};

function toCampaignInventoryItem(
  row: CampaignInventoryItemQueryRow,
): CampaignInventoryItemRecord {
  return {
    id: row.id,
    canonicalId: row.canonicalId,
    name: row.name,
    catalogScope: row.catalogScope === "inventory" ? "inventory" : "equipment",
    equipmentGroup:
      row.equipmentGroup === "weapon" ||
      row.equipmentGroup === "armor" ||
      row.equipmentGroup === "general"
        ? row.equipmentGroup
        : null,
    recordType: row.recordType,
    family: row.family,
    category: row.category,
    credits: row.credits,
  };
}

export async function getCampaignInventoryItems(input: {
  campaignId: number | null;
  selectedTagIds: number[];
  selectedItemIds: number[];
}): Promise<CampaignInventoryPoolItem[]> {
  if (input.campaignId === null) {
    await requireGod();
  } else {
    if (!Number.isInteger(input.campaignId) || input.campaignId <= 0) {
      throw new Error("Campaign is invalid.");
    }
    await requireOwner(input.campaignId);
  }

  const selection = createCampaignInventoryPersistence(
    input.selectedTagIds,
    input.selectedItemIds,
  );
  const [taggedRows, selectedRows] = await Promise.all([
    selection.tagIds.length
      ? db
          .select({ tagId: itemTagLink.tagId, ...campaignInventoryItemFields })
          .from(itemTagLink)
          .innerJoin(item, eq(item.id, itemTagLink.itemId))
          .where(inArray(itemTagLink.tagId, selection.tagIds))
      : [],
    selection.itemIds.length
      ? db
          .select(campaignInventoryItemFields)
          .from(item)
          .where(inArray(item.id, selection.itemIds))
      : [],
  ]);

  const taggedItemsByTag = new Map<number, CampaignInventoryItemRecord[]>();
  for (const row of taggedRows) {
    const group = taggedItemsByTag.get(row.tagId) ?? [];
    group.push(toCampaignInventoryItem(row));
    taggedItemsByTag.set(row.tagId, group);
  }

  return buildCampaignInventoryPool(
    selection.tagIds.map((tagId) => taggedItemsByTag.get(tagId) ?? []),
    selectedRows.map(toCampaignInventoryItem),
  );
}

export async function getCampaignMembers(campaignId: number): Promise<CampaignMemberData> {
  const session = await requireOwner(campaignId);
  const [playerRows, identityRoleRows, characterRows, npcRows] = await Promise.all([
    db.select({ userId: user.id, username: user.username, displayName: user.name, addedAt: campaignPlayer.createdAt }).from(campaignPlayer).innerJoin(user, eq(user.id, campaignPlayer.userId)).where(and(eq(campaignPlayer.campaignId, campaignId), eq(campaignPlayer.isNpcController, false))).orderBy(asc(user.username), asc(user.name)),
    db.select({ userId: user.id, username: user.username, displayName: user.name, role: userRole.role }).from(user).leftJoin(userRole, eq(userRole.userId, user.id)).orderBy(asc(user.username), asc(user.name)),
    db.select({ id: campaignCharacter.id, campaignId: campaignCharacter.campaignId, playerUserId: campaignCharacter.playerUserId, playerName: user.username, displayName: user.name, name: campaignCharacter.name, creationCompletedAt: campaignCharacterProfile.creationCompletedAt }).from(campaignCharacter).innerJoin(user, eq(user.id, campaignCharacter.playerUserId)).leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id)).where(and(eq(campaignCharacter.campaignId, campaignId), eq(campaignCharacter.isNpc, false))).orderBy(asc(user.username), asc(campaignCharacter.name)),
    db.select({ id: campaignCharacter.id, name: campaignCharacter.name, npcKind: campaignCharacter.npcKind, creationCompletedAt: campaignCharacterProfile.creationCompletedAt }).from(campaignCharacter).leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id)).where(and(eq(campaignCharacter.campaignId, campaignId), eq(campaignCharacter.isNpc, true))).orderBy(asc(campaignCharacter.name)),
  ]);
  const memberIds = new Set(playerRows.map(({ userId }) => userId));
  const candidates = buildCampaignPlayerCandidates(
    identityRoleRows.map((row) => ({
      ...row,
      username: row.username ?? row.displayName,
    })),
    [...memberIds],
    session.user.id,
  );
  return {
    players: playerRows.map((row) => ({ userId: row.userId, username: row.username ?? row.displayName, displayName: row.displayName, addedAt: row.addedAt.toISOString() })),
    candidates,
    characters: characterRows.map((row) => ({ id: row.id, campaignId: row.campaignId, playerUserId: row.playerUserId, playerName: row.playerName ?? row.displayName, name: row.name, creationCompletedAt: row.creationCompletedAt?.toISOString() ?? null })),
    npcs: npcRows.map((row) => ({ id: row.id, name: row.name, npcKind: row.npcKind === "creature" ? "creature" : "race", creationCompletedAt: row.creationCompletedAt?.toISOString() ?? null })),
  };
}

export async function saveCampaignAdmin(input: CampaignAdminDraft): Promise<CampaignAdminDraft> {
  await requireOwner(input.id);
  const name = required(input.name, "Campaign Name");
  const allowedSystems = [...new Set(input.allowedSystems)];
  for (const system of allowedSystems) {
    if (!campaignSystem.enumValues.includes(system)) throw new Error(`Unsupported Campaign system: ${system}.`);
  }
  const raceIds = [...new Set(input.allowedRaceIds.filter((id) => Number.isInteger(id) && id > 0))];
  const requestedDerivedAbilityIds = normalizeCampaignDerivedAbilityIds(
    input.allowedDerivedAbilityIds,
  );
  const inventorySelection = createCampaignInventoryPersistence(
    input.inventoryTagIds,
    input.inventoryItemIds,
  );
  let assignedFatePoints: number | null = null;
  if (input.fatePointMethod === "Assigned") {
    if (!Number.isInteger(input.assignedFatePoints) || (input.assignedFatePoints ?? -1) < 0) throw new Error("Assigned Fate Points must be a whole number zero or greater.");
    assignedFatePoints = input.assignedFatePoints;
  }
  const currencies = input.currencySystem === "Derived Currency" ? input.derivedCurrencies.map((entry, index) => {
    const currencyName = required(entry.name, `Currency ${index + 1} Name`);
    const description = required(entry.description, `Currency ${index + 1} Description`);
    if (!Number.isFinite(entry.creditsPerUnit) || entry.creditsPerUnit <= 0) throw new Error(`Currency ${index + 1} Credit Value must be greater than zero.`);
    return { ...entry, name: currencyName, description };
  }) : [];
  if (input.currencySystem === "Derived Currency" && !currencies.length) throw new Error("Derived Currency requires at least one currency.");

  const [validTags, validItems, validDerivedAbilities] = await Promise.all([
    inventorySelection.tagIds.length
      ? db.select({ id: itemTagCatalog.id }).from(itemTagCatalog).where(inArray(itemTagCatalog.id, inventorySelection.tagIds))
      : [],
    inventorySelection.itemIds.length
      ? db.select({ id: item.id }).from(item).where(inArray(item.id, inventorySelection.itemIds))
      : [],
    requestedDerivedAbilityIds.length
      ? db.select({ id: derivedAbility.id }).from(derivedAbility).where(inArray(derivedAbility.id, requestedDerivedAbilityIds))
      : [],
  ]);
  if (validTags.length !== inventorySelection.tagIds.length) throw new Error("An Inventory Tag is no longer available.");
  if (validItems.length !== inventorySelection.itemIds.length) throw new Error("An Equipment or Inventory record is no longer available.");
  const derivedAbilityIds = validateCampaignDerivedAbilitySelection(
    requestedDerivedAbilityIds,
    validDerivedAbilities.map(({ id }) => id),
  );

  await db.transaction(async (tx) => {
    await tx.update(campaign).set({
      name,
      attributePoints: nonNegative(input.attributePoints, "Attribute Points"),
      skillPoints: nonNegative(input.skillPoints, "Skill Points"),
      maxStartingSkill: nonNegative(input.maxStartingSkill, "Max Starting Skill"),
      pointsToUnlockNextTier: nonNegative(input.pointsToUnlockNextTier, "Points to Unlock Next Tier"),
      maxPointsInSkill: nonNegative(input.maxPointsInSkill, "Max Points in Skill"),
      startingCreditAmount: nonNegative(input.startingCreditAmount, "Starting Credits"),
      currencySystem: input.currencySystem,
      fatePointMethod: input.fatePointMethod,
      assignedFatePoints,
      updatedAt: new Date(),
    }).where(eq(campaign.id, input.id));

    await tx.delete(campaignAllowedSystem).where(eq(campaignAllowedSystem.campaignId, input.id));
    if (allowedSystems.length) await tx.insert(campaignAllowedSystem).values(allowedSystems.map((system, sortOrder) => ({ campaignId: input.id, system, sortOrder })));

    const existingCurrencies = await tx.select({ id: campaignDerivedCurrency.id }).from(campaignDerivedCurrency).where(eq(campaignDerivedCurrency.campaignId, input.id));
    const incomingIds = new Set(currencies.map(({ id }) => id).filter((id): id is number => Boolean(id)));
    for (const existing of existingCurrencies) {
      if (!incomingIds.has(existing.id)) {
        const [references] = await tx.select({ value: count() }).from(campaignCharacterProfile)
          .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignCharacterProfile.characterId))
          .where(eq(campaignCharacter.campaignId, input.id));
        if (Number(references?.value ?? 0) > 0) throw new Error("Derived Currencies cannot be removed after Characters exist. Edit the existing currency instead.");
        await tx.delete(campaignDerivedCurrency).where(eq(campaignDerivedCurrency.id, existing.id));
      }
    }
    for (let sortOrder = 0; sortOrder < currencies.length; sortOrder += 1) {
      const entry = currencies[sortOrder]!;
      if (entry.id) await tx.update(campaignDerivedCurrency).set({ name: entry.name, description: entry.description, creditsPerUnit: entry.creditsPerUnit, sortOrder }).where(and(eq(campaignDerivedCurrency.id, entry.id), eq(campaignDerivedCurrency.campaignId, input.id)));
      else await tx.insert(campaignDerivedCurrency).values({ campaignId: input.id, name: entry.name, description: entry.description, creditsPerUnit: entry.creditsPerUnit, sortOrder });
    }

    await tx.delete(campaignAllowedRace).where(eq(campaignAllowedRace.campaignId, input.id));
    if (raceIds.length) await tx.insert(campaignAllowedRace).values(raceIds.map((raceId, sortOrder) => ({ campaignId: input.id, raceId, sortOrder })));
    await tx.delete(campaignAllowedDerivedAbility).where(eq(campaignAllowedDerivedAbility.campaignId, input.id));
    if (derivedAbilityIds.length) await tx.insert(campaignAllowedDerivedAbility).values(derivedAbilityIds.map((derivedAbilityId, sortOrder) => ({ campaignId: input.id, derivedAbilityId, sortOrder })));
    await tx.delete(campaignInventoryTag).where(eq(campaignInventoryTag.campaignId, input.id));
    if (inventorySelection.tagIds.length) await tx.insert(campaignInventoryTag).values(inventorySelection.tagIds.map((tagId, sortOrder) => ({ campaignId: input.id, tagId, sortOrder })));
    await tx.delete(campaignInventoryItem).where(eq(campaignInventoryItem.campaignId, input.id));
    if (inventorySelection.itemIds.length) await tx.insert(campaignInventoryItem).values(inventorySelection.itemIds.map((itemId, sortOrder) => ({ campaignId: input.id, itemId, sortOrder })));
  });

  revalidatePath("/heavens/campaigns");
  revalidatePath("/realms");
  return getCampaignAdmin(input.id);
}

export async function addCampaignPlayer(campaignId: number, userId: string) {
  await requireOwner(campaignId);
  const [[targetUser], [playerRole]] = await Promise.all([
    db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1),
    db.select({ userId: userRole.userId }).from(userRole).where(and(eq(userRole.userId, userId), eq(userRole.role, "player"))).limit(1),
  ]);
  if (!targetUser) throw new Error("That registered account no longer exists.");
  if (!playerRole) throw new Error("That account does not have Player permission.");
  await db.insert(campaignPlayer).values({ campaignId, userId, isNpcController: false }).onConflictDoUpdate({ target: [campaignPlayer.campaignId, campaignPlayer.userId], set: { isNpcController: false } });
  revalidatePath("/heavens/campaigns");
  revalidatePath("/heavens");
  revalidatePath("/realms");
  return getCampaignMembers(campaignId);
}

export async function removeCampaignPlayer(campaignId: number, userId: string) {
  await requireOwner(campaignId);
  const [characters] = await db.select({ value: count() }).from(campaignCharacter).where(and(eq(campaignCharacter.campaignId, campaignId), eq(campaignCharacter.playerUserId, userId), eq(campaignCharacter.isNpc, false)));
  if (Number(characters?.value ?? 0) > 0) throw new Error("A Player cannot be removed while they still have Characters in the Campaign.");
  await db.delete(campaignPlayer).where(and(eq(campaignPlayer.campaignId, campaignId), eq(campaignPlayer.userId, userId), eq(campaignPlayer.isNpcController, false)));
  revalidatePath("/heavens/campaigns");
  revalidatePath("/heavens");
  revalidatePath("/realms");
  return getCampaignMembers(campaignId);
}

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
import { item, itemTagCatalog, itemTagLink } from "@/db/item-schema";
import { race } from "@/db/race-schema";
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
  inventoryTagIds: number[];
  inventoryItemIds: number[];
};

export type CampaignReferenceData = {
  races: Array<{ id: number; name: string; size: string }>;
  tags: Array<{ id: number; name: string; tagGroup: string; description: string }>;
  items: Array<{
    id: number;
    canonicalId: string;
    name: string;
    catalogScope: string;
    equipmentGroup: string | null;
    recordType: string;
    family: string;
    category: string;
    credits: number | null;
  }>;
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
    isMember: boolean;
  }>;
  characters: Array<{
    id: number;
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
  const [owned] = await db.select({ id: campaign.id }).from(campaign).where(and(eq(campaign.id, campaignId), eq(campaign.createdByUserId, session.user.id))).limit(1);
  if (!owned) throw new Error("Only the Campaign creator can manage this Campaign.");
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
  const [systems, currencies, races, tags, items] = await Promise.all([
    db.select({ system: campaignAllowedSystem.system }).from(campaignAllowedSystem).where(eq(campaignAllowedSystem.campaignId, campaignId)).orderBy(asc(campaignAllowedSystem.sortOrder)),
    db.select().from(campaignDerivedCurrency).where(eq(campaignDerivedCurrency.campaignId, campaignId)).orderBy(asc(campaignDerivedCurrency.sortOrder), asc(campaignDerivedCurrency.id)),
    db.select({ raceId: campaignAllowedRace.raceId }).from(campaignAllowedRace).where(eq(campaignAllowedRace.campaignId, campaignId)).orderBy(asc(campaignAllowedRace.sortOrder)),
    db.select({ tagId: campaignInventoryTag.tagId }).from(campaignInventoryTag).where(eq(campaignInventoryTag.campaignId, campaignId)).orderBy(asc(campaignInventoryTag.sortOrder)),
    db.select({ itemId: campaignInventoryItem.itemId }).from(campaignInventoryItem).where(eq(campaignInventoryItem.campaignId, campaignId)).orderBy(asc(campaignInventoryItem.sortOrder)),
  ]);
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
    inventoryTagIds: tags.map(({ tagId }) => tagId),
    inventoryItemIds: items.map(({ itemId }) => itemId),
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
  const [races, tags, items] = await Promise.all([
    db.select({ id: race.id, name: race.name, size: race.size }).from(race).orderBy(asc(race.name), asc(race.id)),
    db.select({ id: itemTagCatalog.id, name: itemTagCatalog.name, tagGroup: itemTagCatalog.tagGroup, description: itemTagCatalog.description }).from(itemTagCatalog).orderBy(asc(itemTagCatalog.tagGroup), asc(itemTagCatalog.name)),
    db.select({ id: item.id, canonicalId: item.canonicalId, name: item.name, catalogScope: item.catalogScope, equipmentGroup: item.equipmentGroup, recordType: item.recordType, family: item.family, category: item.category, credits: item.credits }).from(item).orderBy(asc(item.name), asc(item.id)),
  ]);
  return { races, tags, items };
}

export async function getCampaignMembers(campaignId: number): Promise<CampaignMemberData> {
  await requireOwner(campaignId);
  const [playerRows, candidateRows, characterRows, npcRows] = await Promise.all([
    db.select({ userId: user.id, username: user.username, displayName: user.name, addedAt: campaignPlayer.createdAt }).from(campaignPlayer).innerJoin(user, eq(user.id, campaignPlayer.userId)).where(and(eq(campaignPlayer.campaignId, campaignId), eq(campaignPlayer.isNpcController, false))).orderBy(asc(user.username), asc(user.name)),
    db.selectDistinct({ userId: user.id, username: user.username, displayName: user.name }).from(userRole).innerJoin(user, eq(user.id, userRole.userId)).where(eq(userRole.role, "player")).orderBy(asc(user.username), asc(user.name)),
    db.select({ id: campaignCharacter.id, playerUserId: campaignCharacter.playerUserId, playerName: user.username, displayName: user.name, name: campaignCharacter.name, creationCompletedAt: campaignCharacterProfile.creationCompletedAt }).from(campaignCharacter).innerJoin(user, eq(user.id, campaignCharacter.playerUserId)).leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id)).where(and(eq(campaignCharacter.campaignId, campaignId), eq(campaignCharacter.isNpc, false))).orderBy(asc(user.username), asc(campaignCharacter.name)),
    db.select({ id: campaignCharacter.id, name: campaignCharacter.name, npcKind: campaignCharacter.npcKind, creationCompletedAt: campaignCharacterProfile.creationCompletedAt }).from(campaignCharacter).leftJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id)).where(and(eq(campaignCharacter.campaignId, campaignId), eq(campaignCharacter.isNpc, true))).orderBy(asc(campaignCharacter.name)),
  ]);
  const memberIds = new Set(playerRows.map(({ userId }) => userId));
  return {
    players: playerRows.map((row) => ({ userId: row.userId, username: row.username ?? row.displayName, displayName: row.displayName, addedAt: row.addedAt.toISOString() })),
    candidates: candidateRows.map((row) => ({ userId: row.userId, username: row.username ?? row.displayName, displayName: row.displayName, isMember: memberIds.has(row.userId) })),
    characters: characterRows.map((row) => ({ id: row.id, playerUserId: row.playerUserId, playerName: row.playerName ?? row.displayName, name: row.name, creationCompletedAt: row.creationCompletedAt?.toISOString() ?? null })),
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
  const tagIds = [...new Set(input.inventoryTagIds.filter((id) => Number.isInteger(id) && id > 0))];
  const explicitItemIds = [...new Set(input.inventoryItemIds.filter((id) => Number.isInteger(id) && id > 0))];
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

  const taggedItemRows = tagIds.length ? await db.selectDistinct({ itemId: itemTagLink.itemId }).from(itemTagLink).where(inArray(itemTagLink.tagId, tagIds)) : [];
  const authorizedItemIds = [...new Set([...explicitItemIds, ...taggedItemRows.map(({ itemId }) => itemId)])];

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
    await tx.delete(campaignInventoryTag).where(eq(campaignInventoryTag.campaignId, input.id));
    if (tagIds.length) await tx.insert(campaignInventoryTag).values(tagIds.map((tagId, sortOrder) => ({ campaignId: input.id, tagId, sortOrder })));
    await tx.delete(campaignInventoryItem).where(eq(campaignInventoryItem.campaignId, input.id));
    if (authorizedItemIds.length) await tx.insert(campaignInventoryItem).values(authorizedItemIds.map((itemId, sortOrder) => ({ campaignId: input.id, itemId, sortOrder })));
  });

  revalidatePath("/heavens/campaigns");
  revalidatePath("/realms");
  return getCampaignAdmin(input.id);
}

export async function addCampaignPlayer(campaignId: number, userId: string) {
  await requireOwner(campaignId);
  const [playerRole] = await db.select({ userId: userRole.userId }).from(userRole).where(and(eq(userRole.userId, userId), eq(userRole.role, "player"))).limit(1);
  if (!playerRole) throw new Error("That account does not have Player permission.");
  await db.insert(campaignPlayer).values({ campaignId, userId, isNpcController: false }).onConflictDoUpdate({ target: [campaignPlayer.campaignId, campaignPlayer.userId], set: { isNpcController: false } });
  revalidatePath("/heavens/campaigns");
  revalidatePath("/realms");
}

export async function removeCampaignPlayer(campaignId: number, userId: string) {
  await requireOwner(campaignId);
  const [characters] = await db.select({ value: count() }).from(campaignCharacter).where(and(eq(campaignCharacter.campaignId, campaignId), eq(campaignCharacter.playerUserId, userId), eq(campaignCharacter.isNpc, false)));
  if (Number(characters?.value ?? 0) > 0) throw new Error("A Player cannot be removed while they still have Characters in the Campaign.");
  await db.delete(campaignPlayer).where(and(eq(campaignPlayer.campaignId, campaignId), eq(campaignPlayer.userId, userId), eq(campaignPlayer.isNpcController, false)));
  revalidatePath("/heavens/campaigns");
  revalidatePath("/realms");
}

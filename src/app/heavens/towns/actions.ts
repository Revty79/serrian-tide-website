"use server";

import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign } from "@/db/campaign-schema";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { shop, shopStaffAssignment } from "@/db/shop-schema";
import {
  campaignSessionPreparedTown,
  campaignSessionSceneTown,
  campaignSessionSceneTownPlace,
} from "@/db/tabletop-location-schema";
import {
  town,
  townNpcAssociation,
  townPlace,
  townShopMembership,
} from "@/db/town-schema";
import { buildCampaignAccessDesignation } from "@/features/campaigns/campaign-access-designation";
import {
  assertExactConfirmation,
  assertOwnedRootManager,
  assertPermanentDeletionEnabled,
  isPermanentDeletionEnabled,
} from "@/features/lifecycle/policy";
import {
  isEligibleTownNpc,
  normalizeTownArchiveReason,
  normalizeTownCoreValues,
  normalizeTownNpcAssociationValues,
  normalizeTownPlaceValues,
  type TownArchiveStatus,
  type TownCoreValues,
  type TownNpcAssociationValues,
  type TownPlaceValues,
} from "@/features/towns/town-builder";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

const assignedTown = alias(town, "assigned_town");

export type TownCampaignSummary = {
  id: number;
  name: string;
  archived: boolean;
  ownerLabel?: string;
};

export type TownSummary = {
  id: number;
  campaignId: number;
  name: string;
  category: string;
  overview: string;
  locationNotes: string;
  shopCount: number;
  npcCount: number;
  placeCount: number;
  archivedAt: string | null;
  archiveReason: string;
};

export type TownShopRecord = {
  membershipId: number;
  shopId: number;
  name: string;
  category: string;
  archived: boolean;
  staffCount: number;
  sortOrder: number;
};

export type AvailableTownShop = {
  id: number;
  name: string;
  category: string;
  staffCount: number;
  assignedTownId: number | null;
  assignedTownName: string | null;
};

export type TownNpcRecord = {
  associationId: number;
  npcCharacterId: number;
  name: string;
  npcKind: "race" | "creature";
  npcBuildMode: "simple" | "detailed";
  roleLabel: string;
  archived: boolean;
  relationshipLabel: string;
  townNote: string;
  sortOrder: number;
};

export type AvailableTownNpc = {
  id: number;
  name: string;
  npcKind: "race" | "creature";
  npcBuildMode: "simple" | "detailed";
  roleLabel: string;
};

export type TownPlaceRecord = {
  id: number;
  name: string;
  category: string;
  description: string;
  locationNotes: string;
  godNotes: string;
  sortOrder: number;
  archivedAt: string | null;
  archiveReason: string;
  createdAt: string;
  updatedAt: string;
};

export type TownDetail = {
  town: {
    id: number;
    campaignId: number;
    name: string;
    category: string;
    overview: string;
    locationNotes: string;
    godNotes: string;
    archivedAt: string | null;
    archiveReason: string;
    createdAt: string;
    updatedAt: string;
  };
  campaign: {
    id: number;
    name: string;
    archived: boolean;
  };
  shops: TownShopRecord[];
  availableShops: AvailableTownShop[];
  npcs: TownNpcRecord[];
  availableNpcs: AvailableTownNpc[];
  places: TownPlaceRecord[];
};

export type TownLifecyclePreview = {
  townId: number;
  townName: string;
  archived: boolean;
  permanentDeletionEnabled: boolean;
  canArchive: boolean;
  canRestore: boolean;
  canDelete: boolean;
  dependencies: Array<{ label: string; count: number }>;
};

export type CreateTownValues = TownCoreValues;
export type SaveTownValues = TownCoreValues & { townId: number };
export type AddTownNpcValues = TownNpcAssociationValues;
export type UpdateTownNpcValues = TownNpcAssociationValues & { associationId: number };
export type CreateTownPlaceValues = TownPlaceValues;
export type UpdateTownPlaceValues = TownPlaceValues & { placeId: number };

type ManagerContext = {
  actorUserId: string;
  ownerUserId: string;
  campaignArchivedAt: Date | null;
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must identify a saved record.`);
  return value;
}

function isDuplicateError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

async function requireCampaignManager(campaignId: number): Promise<ManagerContext> {
  positiveId(campaignId, "Campaign");
  const access = await requireGodOrAdminAccessContext();
  const [campaignRow] = await db.select({
    createdByUserId: campaign.createdByUserId,
    archivedAt: campaign.archivedAt,
  }).from(campaign).where(eq(campaign.id, campaignId)).limit(1);
  if (!campaignRow) throw new Error("Campaign not found.");
  assertOwnedRootManager(
    { userId: access.session.user.id, roles: access.roles },
    campaignRow.createdByUserId,
    "Campaign",
  );
  return {
    actorUserId: access.session.user.id,
    ownerUserId: campaignRow.createdByUserId,
    campaignArchivedAt: campaignRow.archivedAt,
  };
}

async function requireEditableTown(townId: number, campaignId: number) {
  const manager = await requireCampaignManager(campaignId);
  if (manager.campaignArchivedAt) throw new Error("Restore this Campaign before editing its Towns.");
  const [townRow] = await db.select({ id: town.id, name: town.name, archivedAt: town.archivedAt })
    .from(town)
    .where(and(eq(town.id, positiveId(townId, "Town")), eq(town.campaignId, campaignId)))
    .limit(1);
  if (!townRow) throw new Error("Town not found in this Campaign.");
  if (townRow.archivedAt) throw new Error("Restore this Town before changing it.");
  return { manager, town: townRow };
}

function revalidateTownPaths(): void {
  revalidatePath("/heavens/towns");
  revalidatePath("/heavens/shops");
  revalidatePath("/heavens/npcs");
  revalidatePath("/heavens/campaigns");
  revalidatePath("/heavens");
}

export async function listTownCampaigns(): Promise<TownCampaignSummary[]> {
  const access = await requireGodOrAdminAccessContext();
  const rows = await db.select({
    id: campaign.id,
    name: campaign.name,
    archivedAt: campaign.archivedAt,
    ownerUserId: campaign.createdByUserId,
    ownerName: user.name,
    ownerUsername: user.username,
    ownerDisplayUsername: user.displayUsername,
  }).from(campaign)
    .innerJoin(user, eq(user.id, campaign.createdByUserId))
    .where(and(
      access.roles.includes("admin") ? undefined : eq(campaign.createdByUserId, access.session.user.id),
      access.roles.includes("admin") ? undefined : isNull(campaign.archivedAt),
    ))
    .orderBy(asc(campaign.name), asc(campaign.id));
  return rows.map((entry) => ({
    id: entry.id,
    name: entry.name,
    archived: entry.archivedAt !== null,
    ...buildCampaignAccessDesignation({
      actingUserId: access.session.user.id,
      ownerUserId: entry.ownerUserId,
      ownerName: entry.ownerName,
      ownerUsername: entry.ownerUsername,
      ownerDisplayUsername: entry.ownerDisplayUsername,
    }),
  }));
}

export async function listTowns(campaignId: number, status: TownArchiveStatus): Promise<TownSummary[]> {
  await requireCampaignManager(campaignId);
  if (status !== "active" && status !== "archived") throw new Error("Town archive status must be active or archived.");
  const roots = await db.select().from(town).where(and(
    eq(town.campaignId, campaignId),
    status === "archived" ? isNotNull(town.archivedAt) : isNull(town.archivedAt),
  )).orderBy(asc(town.name), asc(town.id));
  if (!roots.length) return [];
  const townIds = roots.map(({ id }) => id);
  const shopCounts = await db.select({ townId: townShopMembership.townId, value: count() })
    .from(townShopMembership).where(inArray(townShopMembership.townId, townIds)).groupBy(townShopMembership.townId);
  const npcCounts = await db.select({ townId: townNpcAssociation.townId, value: count() })
    .from(townNpcAssociation).where(inArray(townNpcAssociation.townId, townIds)).groupBy(townNpcAssociation.townId);
  const placeCounts = await db.select({ townId: townPlace.townId, value: count() })
    .from(townPlace).where(inArray(townPlace.townId, townIds)).groupBy(townPlace.townId);
  const shopCountMap = new Map(shopCounts.map((entry) => [entry.townId, Number(entry.value)]));
  const npcCountMap = new Map(npcCounts.map((entry) => [entry.townId, Number(entry.value)]));
  const placeCountMap = new Map(placeCounts.map((entry) => [entry.townId, Number(entry.value)]));
  return roots.map((entry) => ({
    id: entry.id,
    campaignId: entry.campaignId,
    name: entry.name,
    category: entry.category,
    overview: entry.overview,
    locationNotes: entry.locationNotes,
    shopCount: shopCountMap.get(entry.id) ?? 0,
    npcCount: npcCountMap.get(entry.id) ?? 0,
    placeCount: placeCountMap.get(entry.id) ?? 0,
    archivedAt: entry.archivedAt?.toISOString() ?? null,
    archiveReason: entry.archiveReason,
  }));
}

export async function getTown(townId: number, campaignId: number): Promise<TownDetail> {
  await requireCampaignManager(campaignId);
  const [root] = await db.select({
    id: town.id,
    campaignId: town.campaignId,
    name: town.name,
    category: town.category,
    overview: town.overview,
    locationNotes: town.locationNotes,
    godNotes: town.godNotes,
    archivedAt: town.archivedAt,
    archiveReason: town.archiveReason,
    createdAt: town.createdAt,
    updatedAt: town.updatedAt,
    campaignName: campaign.name,
    campaignArchivedAt: campaign.archivedAt,
  }).from(town)
    .innerJoin(campaign, eq(campaign.id, town.campaignId))
    .where(and(eq(town.id, positiveId(townId, "Town")), eq(town.campaignId, campaignId)))
    .limit(1);
  if (!root) throw new Error("Town not found in this Campaign.");

  const shopRows = await db.select({
    membershipId: townShopMembership.id,
    shopId: shop.id,
    name: shop.name,
    category: shop.category,
    archivedAt: shop.archivedAt,
    sortOrder: townShopMembership.sortOrder,
  }).from(townShopMembership)
    .innerJoin(shop, eq(shop.id, townShopMembership.shopId))
    .where(and(eq(townShopMembership.townId, root.id), eq(townShopMembership.campaignId, campaignId)))
    .orderBy(asc(townShopMembership.sortOrder), asc(townShopMembership.id));
  const campaignStaff = await db.select({ shopId: shopStaffAssignment.shopId })
    .from(shopStaffAssignment).where(eq(shopStaffAssignment.campaignId, campaignId));
  const staffCounts = new Map<number, number>();
  for (const entry of campaignStaff) staffCounts.set(entry.shopId, (staffCounts.get(entry.shopId) ?? 0) + 1);

  const availableShopRows = await db.select({
    id: shop.id,
    name: shop.name,
    category: shop.category,
    assignedTownId: townShopMembership.townId,
    assignedTownName: assignedTown.name,
  }).from(shop)
    .leftJoin(townShopMembership, eq(townShopMembership.shopId, shop.id))
    .leftJoin(assignedTown, eq(assignedTown.id, townShopMembership.townId))
    .where(and(eq(shop.campaignId, campaignId), isNull(shop.archivedAt)))
    .orderBy(asc(shop.name), asc(shop.id));

  const npcRows = await db.select({
    associationId: townNpcAssociation.id,
    npcCharacterId: campaignCharacter.id,
    name: campaignCharacter.name,
    npcKind: campaignCharacter.npcKind,
    npcBuildMode: campaignCharacter.npcBuildMode,
    roleLabel: campaignCharacter.npcRoleLabel,
    archivedAt: campaignCharacter.archivedAt,
    relationshipLabel: townNpcAssociation.relationshipLabel,
    townNote: townNpcAssociation.townNote,
    sortOrder: townNpcAssociation.sortOrder,
  }).from(townNpcAssociation)
    .innerJoin(campaignCharacter, eq(campaignCharacter.id, townNpcAssociation.npcCharacterId))
    .where(and(eq(townNpcAssociation.townId, root.id), eq(townNpcAssociation.campaignId, campaignId)))
    .orderBy(asc(townNpcAssociation.sortOrder), asc(townNpcAssociation.id));

  const availableNpcRows = await db.select({
    id: campaignCharacter.id,
    campaignId: campaignCharacter.campaignId,
    name: campaignCharacter.name,
    isNpc: campaignCharacter.isNpc,
    npcKind: campaignCharacter.npcKind,
    npcBuildMode: campaignCharacter.npcBuildMode,
    roleLabel: campaignCharacter.npcRoleLabel,
    archivedAt: campaignCharacter.archivedAt,
  }).from(campaignCharacter).where(and(
    eq(campaignCharacter.campaignId, campaignId),
    eq(campaignCharacter.isNpc, true),
    inArray(campaignCharacter.npcKind, ["race", "creature"]),
    inArray(campaignCharacter.npcBuildMode, ["simple", "detailed"]),
    isNull(campaignCharacter.archivedAt),
  )).orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));

  const placeRows = await db.select().from(townPlace).where(and(
    eq(townPlace.townId, root.id),
    eq(townPlace.campaignId, campaignId),
  )).orderBy(asc(townPlace.sortOrder), asc(townPlace.id));

  return {
    town: {
      id: root.id,
      campaignId: root.campaignId,
      name: root.name,
      category: root.category,
      overview: root.overview,
      locationNotes: root.locationNotes,
      godNotes: root.godNotes,
      archivedAt: root.archivedAt?.toISOString() ?? null,
      archiveReason: root.archiveReason,
      createdAt: root.createdAt.toISOString(),
      updatedAt: root.updatedAt.toISOString(),
    },
    campaign: { id: campaignId, name: root.campaignName, archived: root.campaignArchivedAt !== null },
    shops: shopRows.map((entry) => ({
      membershipId: entry.membershipId,
      shopId: entry.shopId,
      name: entry.name,
      category: entry.category,
      archived: entry.archivedAt !== null,
      staffCount: staffCounts.get(entry.shopId) ?? 0,
      sortOrder: entry.sortOrder,
    })),
    availableShops: availableShopRows.map((entry) => ({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      staffCount: staffCounts.get(entry.id) ?? 0,
      assignedTownId: entry.assignedTownId,
      assignedTownName: entry.assignedTownName,
    })),
    npcs: npcRows.map((entry) => ({
      associationId: entry.associationId,
      npcCharacterId: entry.npcCharacterId,
      name: entry.name,
      npcKind: entry.npcKind as "race" | "creature",
      npcBuildMode: entry.npcBuildMode as "simple" | "detailed",
      roleLabel: entry.roleLabel,
      archived: entry.archivedAt !== null,
      relationshipLabel: entry.relationshipLabel,
      townNote: entry.townNote,
      sortOrder: entry.sortOrder,
    })),
    availableNpcs: availableNpcRows
      .filter((entry) => isEligibleTownNpc(entry, campaignId))
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        npcKind: entry.npcKind as "race" | "creature",
        npcBuildMode: entry.npcBuildMode as "simple" | "detailed",
        roleLabel: entry.roleLabel,
      })),
    places: placeRows.map((entry) => ({
      id: entry.id,
      name: entry.name,
      category: entry.category,
      description: entry.description,
      locationNotes: entry.locationNotes,
      godNotes: entry.godNotes,
      sortOrder: entry.sortOrder,
      archivedAt: entry.archivedAt?.toISOString() ?? null,
      archiveReason: entry.archiveReason,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    })),
  };
}

export async function createTown(input: CreateTownValues): Promise<TownDetail> {
  const normalized = normalizeTownCoreValues(input);
  const manager = await requireCampaignManager(normalized.campaignId);
  if (manager.campaignArchivedAt) throw new Error("Restore this Campaign before creating a Town.");
  const [created] = await db.insert(town).values({
    campaignId: normalized.campaignId,
    name: normalized.name,
    category: normalized.category,
    overview: normalized.overview,
    locationNotes: normalized.locationNotes,
    godNotes: normalized.godNotes,
  }).returning({ id: town.id });
  revalidateTownPaths();
  return getTown(created!.id, normalized.campaignId);
}

export async function saveTown(input: SaveTownValues): Promise<TownDetail> {
  const normalized = normalizeTownCoreValues(input);
  await requireEditableTown(input.townId, normalized.campaignId);
  const updated = await db.update(town).set({
    name: normalized.name,
    category: normalized.category,
    overview: normalized.overview,
    locationNotes: normalized.locationNotes,
    godNotes: normalized.godNotes,
    updatedAt: new Date(),
  }).where(and(eq(town.id, positiveId(input.townId, "Town")), eq(town.campaignId, normalized.campaignId))).returning({ id: town.id });
  if (updated.length !== 1) throw new Error("Town could not be saved.");
  revalidateTownPaths();
  return getTown(input.townId, normalized.campaignId);
}

async function requireActiveShop(shopId: number, campaignId: number) {
  const [shopRow] = await db.select({ id: shop.id, name: shop.name, archivedAt: shop.archivedAt })
    .from(shop).where(and(eq(shop.id, positiveId(shopId, "Shop")), eq(shop.campaignId, campaignId))).limit(1);
  if (!shopRow) throw new Error("Shop not found in this Campaign.");
  if (shopRow.archivedAt) throw new Error("Only an active Shop may be attached to a Town.");
  return shopRow;
}

export async function attachTownShop(townId: number, campaignId: number, shopId: number): Promise<TownDetail> {
  await requireEditableTown(townId, campaignId);
  const shopRow = await requireActiveShop(shopId, campaignId);
  const [existing] = await db.select({ townId: townShopMembership.townId, townName: town.name })
    .from(townShopMembership)
    .innerJoin(town, eq(town.id, townShopMembership.townId))
    .where(eq(townShopMembership.shopId, shopRow.id)).limit(1);
  if (existing) {
    if (existing.townId === townId) throw new Error("This Shop is already attached to the Town.");
    throw new Error(`${shopRow.name} belongs to ${existing.townName}. Use the explicit reassign action to move it.`);
  }
  const [maximum] = await db.select({ value: max(townShopMembership.sortOrder) })
    .from(townShopMembership).where(eq(townShopMembership.townId, townId));
  try {
    await db.insert(townShopMembership).values({
      townId,
      campaignId,
      shopId: shopRow.id,
      sortOrder: (maximum?.value ?? -1) + 1,
    });
  } catch (error) {
    if (isDuplicateError(error)) throw new Error("This Shop is already assigned to a Town.");
    throw error;
  }
  revalidateTownPaths();
  return getTown(townId, campaignId);
}

export async function detachTownShop(townId: number, campaignId: number, membershipId: number): Promise<TownDetail> {
  await requireEditableTown(townId, campaignId);
  const removed = await db.delete(townShopMembership).where(and(
    eq(townShopMembership.id, positiveId(membershipId, "Town Shop membership")),
    eq(townShopMembership.townId, townId),
    eq(townShopMembership.campaignId, campaignId),
  )).returning({ id: townShopMembership.id });
  if (removed.length !== 1) throw new Error("Town Shop membership not found.");
  revalidateTownPaths();
  return getTown(townId, campaignId);
}

export async function reassignTownShop(
  sourceTownId: number,
  targetTownId: number,
  campaignId: number,
  shopId: number,
): Promise<TownDetail> {
  positiveId(sourceTownId, "Source Town");
  positiveId(targetTownId, "Target Town");
  positiveId(shopId, "Shop");
  if (sourceTownId === targetTownId) throw new Error("Choose a different Town for reassignment.");
  const manager = await requireCampaignManager(campaignId);
  if (manager.campaignArchivedAt) throw new Error("Restore this Campaign before reassigning Shops.");
  await db.transaction(async (tx) => {
    const townRows = await tx.select({ id: town.id, archivedAt: town.archivedAt }).from(town).where(and(
      eq(town.campaignId, campaignId),
      inArray(town.id, [sourceTownId, targetTownId]),
    )).orderBy(asc(town.id)).for("update");
    if (townRows.length !== 2) throw new Error("Both Towns must exist in the same Campaign.");
    if (townRows.some((entry) => entry.archivedAt !== null)) throw new Error("Both Towns must be active for reassignment.");
    const [shopRow] = await tx.select({ id: shop.id, archivedAt: shop.archivedAt }).from(shop).where(and(
      eq(shop.id, shopId),
      eq(shop.campaignId, campaignId),
    )).limit(1).for("update");
    if (!shopRow || shopRow.archivedAt) throw new Error("The reassigned Shop must be active in this Campaign.");
    const [membership] = await tx.select({ id: townShopMembership.id, townId: townShopMembership.townId })
      .from(townShopMembership).where(eq(townShopMembership.shopId, shopId)).limit(1).for("update");
    if (!membership || membership.townId !== sourceTownId) throw new Error("The Shop is no longer assigned to the expected source Town.");
    const [maximum] = await tx.select({ value: max(townShopMembership.sortOrder) })
      .from(townShopMembership).where(eq(townShopMembership.townId, targetTownId));
    const updated = await tx.update(townShopMembership).set({
      townId: targetTownId,
      sortOrder: (maximum?.value ?? -1) + 1,
      updatedAt: new Date(),
    }).where(and(eq(townShopMembership.id, membership.id), eq(townShopMembership.townId, sourceTownId)))
      .returning({ id: townShopMembership.id });
    if (updated.length !== 1) throw new Error("Shop reassignment lost a concurrent update.");
  });
  revalidateTownPaths();
  return getTown(targetTownId, campaignId);
}

async function reorderTownChildren(
  townId: number,
  campaignId: number,
  orderedIds: number[],
  kind: "shops" | "npcs",
): Promise<TownDetail> {
  await requireEditableTown(townId, campaignId);
  const normalizedIds = orderedIds.map((id) => positiveId(id, kind === "shops" ? "Town Shop membership" : "Town NPC association"));
  if (new Set(normalizedIds).size !== normalizedIds.length) throw new Error("Town order contains duplicate records.");
  await db.transaction(async (tx) => {
    const existing = kind === "shops"
      ? await tx.select({ id: townShopMembership.id }).from(townShopMembership).where(and(eq(townShopMembership.townId, townId), eq(townShopMembership.campaignId, campaignId))).orderBy(asc(townShopMembership.id))
      : await tx.select({ id: townNpcAssociation.id }).from(townNpcAssociation).where(and(eq(townNpcAssociation.townId, townId), eq(townNpcAssociation.campaignId, campaignId))).orderBy(asc(townNpcAssociation.id));
    const existingIds = existing.map(({ id }) => id).sort((left, right) => left - right);
    const submittedIds = [...normalizedIds].sort((left, right) => left - right);
    if (JSON.stringify(existingIds) !== JSON.stringify(submittedIds)) throw new Error("Town order must include every current record exactly once.");
    for (let sortOrder = 0; sortOrder < normalizedIds.length; sortOrder += 1) {
      if (kind === "shops") {
        await tx.update(townShopMembership).set({ sortOrder, updatedAt: new Date() }).where(and(eq(townShopMembership.id, normalizedIds[sortOrder]!), eq(townShopMembership.townId, townId)));
      } else {
        await tx.update(townNpcAssociation).set({ sortOrder, updatedAt: new Date() }).where(and(eq(townNpcAssociation.id, normalizedIds[sortOrder]!), eq(townNpcAssociation.townId, townId)));
      }
    }
  });
  revalidateTownPaths();
  return getTown(townId, campaignId);
}

export async function reorderTownShops(townId: number, campaignId: number, orderedMembershipIds: number[]): Promise<TownDetail> {
  return reorderTownChildren(townId, campaignId, orderedMembershipIds, "shops");
}

export async function addTownNpc(input: AddTownNpcValues): Promise<TownDetail> {
  const normalized = normalizeTownNpcAssociationValues(input);
  await requireEditableTown(normalized.townId, normalized.campaignId);
  const [npc] = await db.select().from(campaignCharacter).where(and(
    eq(campaignCharacter.id, normalized.npcCharacterId),
    eq(campaignCharacter.campaignId, normalized.campaignId),
  )).limit(1);
  if (!npc || !isEligibleTownNpc(npc, normalized.campaignId)) {
    throw new Error("Town NPCs must be active persistent Simple or Detailed Race or Creature NPCs from this Campaign.");
  }
  const [maximum] = await db.select({ value: max(townNpcAssociation.sortOrder) })
    .from(townNpcAssociation).where(eq(townNpcAssociation.townId, normalized.townId));
  try {
    await db.insert(townNpcAssociation).values({
      ...normalized,
      sortOrder: (maximum?.value ?? -1) + 1,
    });
  } catch (error) {
    if (isDuplicateError(error)) throw new Error("This NPC is already associated with the Town.");
    throw error;
  }
  revalidateTownPaths();
  return getTown(normalized.townId, normalized.campaignId);
}

export async function updateTownNpc(input: UpdateTownNpcValues): Promise<TownDetail> {
  const normalized = normalizeTownNpcAssociationValues(input);
  await requireEditableTown(normalized.townId, normalized.campaignId);
  const updated = await db.update(townNpcAssociation).set({
    relationshipLabel: normalized.relationshipLabel,
    townNote: normalized.townNote,
    updatedAt: new Date(),
  }).where(and(
    eq(townNpcAssociation.id, positiveId(input.associationId, "Town NPC association")),
    eq(townNpcAssociation.townId, normalized.townId),
    eq(townNpcAssociation.campaignId, normalized.campaignId),
    eq(townNpcAssociation.npcCharacterId, normalized.npcCharacterId),
  )).returning({ id: townNpcAssociation.id });
  if (updated.length !== 1) throw new Error("Town NPC association not found.");
  revalidateTownPaths();
  return getTown(normalized.townId, normalized.campaignId);
}

export async function removeTownNpc(townId: number, campaignId: number, associationId: number): Promise<TownDetail> {
  await requireEditableTown(townId, campaignId);
  const removed = await db.delete(townNpcAssociation).where(and(
    eq(townNpcAssociation.id, positiveId(associationId, "Town NPC association")),
    eq(townNpcAssociation.townId, townId),
    eq(townNpcAssociation.campaignId, campaignId),
  )).returning({ id: townNpcAssociation.id });
  if (removed.length !== 1) throw new Error("Town NPC association not found.");
  revalidateTownPaths();
  return getTown(townId, campaignId);
}

export async function reorderTownNpcs(townId: number, campaignId: number, orderedAssociationIds: number[]): Promise<TownDetail> {
  return reorderTownChildren(townId, campaignId, orderedAssociationIds, "npcs");
}

export async function createTownPlace(input: CreateTownPlaceValues): Promise<TownDetail> {
  const normalized = normalizeTownPlaceValues(input);
  await requireEditableTown(normalized.townId, normalized.campaignId);
  const [maximum] = await db.select({ value: max(townPlace.sortOrder) }).from(townPlace).where(and(
    eq(townPlace.townId, normalized.townId),
    isNull(townPlace.archivedAt),
  ));
  await db.insert(townPlace).values({ ...normalized, sortOrder: (maximum?.value ?? -1) + 1 });
  revalidateTownPaths();
  return getTown(normalized.townId, normalized.campaignId);
}

export async function updateTownPlace(input: UpdateTownPlaceValues): Promise<TownDetail> {
  const normalized = normalizeTownPlaceValues(input);
  await requireEditableTown(normalized.townId, normalized.campaignId);
  const updated = await db.update(townPlace).set({
    name: normalized.name,
    category: normalized.category,
    description: normalized.description,
    locationNotes: normalized.locationNotes,
    godNotes: normalized.godNotes,
    updatedAt: new Date(),
  }).where(and(
    eq(townPlace.id, positiveId(input.placeId, "Town place")),
    eq(townPlace.townId, normalized.townId),
    eq(townPlace.campaignId, normalized.campaignId),
    isNull(townPlace.archivedAt),
  )).returning({ id: townPlace.id });
  if (updated.length !== 1) throw new Error("Active Town place not found.");
  revalidateTownPaths();
  return getTown(normalized.townId, normalized.campaignId);
}

export async function reorderTownPlaces(
  townId: number,
  campaignId: number,
  status: TownArchiveStatus,
  orderedPlaceIds: number[],
): Promise<TownDetail> {
  await requireEditableTown(townId, campaignId);
  if (status !== "active" && status !== "archived") throw new Error("Place archive status must be active or archived.");
  const normalizedIds = orderedPlaceIds.map((id) => positiveId(id, "Town place"));
  if (new Set(normalizedIds).size !== normalizedIds.length) throw new Error("Town place order contains duplicate records.");
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: townPlace.id }).from(townPlace).where(and(
      eq(townPlace.townId, townId),
      eq(townPlace.campaignId, campaignId),
      status === "archived" ? isNotNull(townPlace.archivedAt) : isNull(townPlace.archivedAt),
    )).orderBy(asc(townPlace.id));
    const existingIds = existing.map(({ id }) => id).sort((left, right) => left - right);
    const submittedIds = [...normalizedIds].sort((left, right) => left - right);
    if (JSON.stringify(existingIds) !== JSON.stringify(submittedIds)) throw new Error("Place order must include every place in the current archive view exactly once.");
    for (let sortOrder = 0; sortOrder < normalizedIds.length; sortOrder += 1) {
      await tx.update(townPlace).set({ sortOrder, updatedAt: new Date() }).where(and(
        eq(townPlace.id, normalizedIds[sortOrder]!),
        eq(townPlace.townId, townId),
      ));
    }
  });
  revalidateTownPaths();
  return getTown(townId, campaignId);
}

export async function archiveTownPlace(townId: number, campaignId: number, placeId: number, reason?: string): Promise<TownDetail> {
  const { manager } = await requireEditableTown(townId, campaignId);
  const archiveReason = normalizeTownArchiveReason(reason);
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ id: townPlace.id, name: townPlace.name, archivedAt: townPlace.archivedAt })
      .from(townPlace).where(and(eq(townPlace.id, positiveId(placeId, "Town place")), eq(townPlace.townId, townId), eq(townPlace.campaignId, campaignId))).limit(1).for("update");
    if (!current) throw new Error("Town place not found.");
    if (current.archivedAt) throw new Error("This Town place is already archived.");
    await tx.update(townPlace).set({ archivedAt: new Date(), archivedByUserId: manager.actorUserId, archiveReason, updatedAt: new Date() }).where(eq(townPlace.id, current.id));
    await tx.insert(lifecycleAuditEvent).values({ action: "archive", entityKind: "town-place", targetId: String(current.id), targetName: current.name, campaignIdSnapshot: campaignId, ownerUserIdSnapshot: manager.ownerUserId, actorUserId: manager.actorUserId, reason: archiveReason, dependencySummaryJson: { townId } });
  });
  revalidateTownPaths();
  return getTown(townId, campaignId);
}

export async function restoreTownPlace(townId: number, campaignId: number, placeId: number): Promise<TownDetail> {
  const { manager } = await requireEditableTown(townId, campaignId);
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ id: townPlace.id, name: townPlace.name, archivedAt: townPlace.archivedAt })
      .from(townPlace).where(and(eq(townPlace.id, positiveId(placeId, "Town place")), eq(townPlace.townId, townId), eq(townPlace.campaignId, campaignId))).limit(1).for("update");
    if (!current) throw new Error("Town place not found.");
    if (!current.archivedAt) throw new Error("This Town place is already active.");
    await tx.update(townPlace).set({ archivedAt: null, archivedByUserId: null, archiveReason: "", updatedAt: new Date() }).where(eq(townPlace.id, current.id));
    await tx.insert(lifecycleAuditEvent).values({ action: "restore", entityKind: "town-place", targetId: String(current.id), targetName: current.name, campaignIdSnapshot: campaignId, ownerUserIdSnapshot: manager.ownerUserId, actorUserId: manager.actorUserId, reason: "", dependencySummaryJson: { townId } });
  });
  revalidateTownPaths();
  return getTown(townId, campaignId);
}

export async function deleteTownPlace(townId: number, campaignId: number, placeId: number, confirmationName?: string): Promise<TownDetail> {
  assertPermanentDeletionEnabled();
  const { manager } = await requireEditableTown(townId, campaignId);
  await db.transaction(async (tx) => {
    assertPermanentDeletionEnabled();
    const [current] = await tx.select({ id: townPlace.id, name: townPlace.name }).from(townPlace).where(and(
      eq(townPlace.id, positiveId(placeId, "Town place")),
      eq(townPlace.townId, townId),
      eq(townPlace.campaignId, campaignId),
    )).limit(1).for("update");
    if (!current) throw new Error("Town place not found.");
    assertExactConfirmation(current.name, confirmationName);
    const [placement] = await tx.select({ sceneId: campaignSessionSceneTownPlace.sceneId })
      .from(campaignSessionSceneTownPlace)
      .where(eq(campaignSessionSceneTownPlace.placeId, current.id))
      .limit(1);
    if (placement) throw new Error("This Place is retained by a Scene placement. Refresh or detach that Town placement before permanent deletion.");
    await tx.insert(lifecycleAuditEvent).values({ action: "delete", entityKind: "town-place", targetId: String(current.id), targetName: current.name, campaignIdSnapshot: campaignId, ownerUserIdSnapshot: manager.ownerUserId, actorUserId: manager.actorUserId, reason: "", dependencySummaryJson: { townId } });
    const removed = await tx.delete(townPlace).where(and(eq(townPlace.id, current.id), eq(townPlace.townId, townId))).returning({ id: townPlace.id });
    if (removed.length !== 1) throw new Error("Town place could not be permanently deleted.");
  });
  revalidateTownPaths();
  return getTown(townId, campaignId);
}

export async function previewTownLifecycle(townId: number, campaignId: number): Promise<TownLifecyclePreview> {
  const manager = await requireCampaignManager(campaignId);
  const [current] = await db.select({ id: town.id, name: town.name, archivedAt: town.archivedAt })
    .from(town).where(and(eq(town.id, positiveId(townId, "Town")), eq(town.campaignId, campaignId))).limit(1);
  if (!current) throw new Error("Town not found in this Campaign.");
  const [shops] = await db.select({ value: count() }).from(townShopMembership).where(eq(townShopMembership.townId, current.id));
  const [npcs] = await db.select({ value: count() }).from(townNpcAssociation).where(eq(townNpcAssociation.townId, current.id));
  const [activePlaces] = await db.select({ value: count() }).from(townPlace).where(and(eq(townPlace.townId, current.id), isNull(townPlace.archivedAt)));
  const [archivedPlaces] = await db.select({ value: count() }).from(townPlace).where(and(eq(townPlace.townId, current.id), isNotNull(townPlace.archivedAt)));
  const [preparedSessions] = await db.select({ value: count() }).from(campaignSessionPreparedTown).where(eq(campaignSessionPreparedTown.townId, current.id));
  const [scenePlacements] = await db.select({ value: count() }).from(campaignSessionSceneTown).where(eq(campaignSessionSceneTown.townId, current.id));
  const permanentDeletionEnabled = isPermanentDeletionEnabled();
  const retainedReferences = Number(preparedSessions?.value ?? 0) + Number(scenePlacements?.value ?? 0);
  return {
    townId: current.id,
    townName: current.name,
    archived: current.archivedAt !== null,
    permanentDeletionEnabled,
    canArchive: manager.campaignArchivedAt === null && current.archivedAt === null,
    canRestore: manager.campaignArchivedAt === null && current.archivedAt !== null,
    canDelete: permanentDeletionEnabled && retainedReferences === 0,
    dependencies: [
      { label: "Attached Shops (survive as standalone Shops)", count: Number(shops?.value ?? 0) },
      { label: "Associated NPCs (survive)", count: Number(npcs?.value ?? 0) },
      { label: "Active Town-owned places (deleted)", count: Number(activePlaces?.value ?? 0) },
      { label: "Archived Town-owned places (deleted)", count: Number(archivedPlaces?.value ?? 0) },
      { label: "Prepared Session references (block deletion)", count: Number(preparedSessions?.value ?? 0) },
      { label: "Scene placements (block deletion)", count: Number(scenePlacements?.value ?? 0) },
    ],
  };
}

export async function archiveTown(townId: number, campaignId: number, reason?: string): Promise<void> {
  const manager = await requireCampaignManager(campaignId);
  if (manager.campaignArchivedAt) throw new Error("Restore this Campaign before archiving its Towns.");
  const archiveReason = normalizeTownArchiveReason(reason);
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ id: town.id, name: town.name, archivedAt: town.archivedAt }).from(town).where(and(
      eq(town.id, positiveId(townId, "Town")), eq(town.campaignId, campaignId),
    )).limit(1).for("update");
    if (!current) throw new Error("Town not found in this Campaign.");
    if (current.archivedAt) throw new Error("This Town is already archived.");
    await tx.update(town).set({ archivedAt: new Date(), archivedByUserId: manager.actorUserId, archiveReason, updatedAt: new Date() }).where(eq(town.id, current.id));
    await tx.insert(lifecycleAuditEvent).values({ action: "archive", entityKind: "town", targetId: String(current.id), targetName: current.name, campaignIdSnapshot: campaignId, ownerUserIdSnapshot: manager.ownerUserId, actorUserId: manager.actorUserId, reason: archiveReason, dependencySummaryJson: {} });
  });
  revalidateTownPaths();
}

export async function restoreTown(townId: number, campaignId: number): Promise<void> {
  const manager = await requireCampaignManager(campaignId);
  if (manager.campaignArchivedAt) throw new Error("Restore this Campaign before restoring its Towns.");
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ id: town.id, name: town.name, archivedAt: town.archivedAt }).from(town).where(and(
      eq(town.id, positiveId(townId, "Town")), eq(town.campaignId, campaignId),
    )).limit(1).for("update");
    if (!current) throw new Error("Town not found in this Campaign.");
    if (!current.archivedAt) throw new Error("This Town is already active.");
    await tx.update(town).set({ archivedAt: null, archivedByUserId: null, archiveReason: "", updatedAt: new Date() }).where(eq(town.id, current.id));
    await tx.insert(lifecycleAuditEvent).values({ action: "restore", entityKind: "town", targetId: String(current.id), targetName: current.name, campaignIdSnapshot: campaignId, ownerUserIdSnapshot: manager.ownerUserId, actorUserId: manager.actorUserId, reason: "", dependencySummaryJson: {} });
  });
  revalidateTownPaths();
}

export async function deleteTown(townId: number, campaignId: number, confirmationName?: string): Promise<void> {
  assertPermanentDeletionEnabled();
  const manager = await requireCampaignManager(campaignId);
  await db.transaction(async (tx) => {
    assertPermanentDeletionEnabled();
    const [current] = await tx.select({ id: town.id, name: town.name }).from(town).where(and(
      eq(town.id, positiveId(townId, "Town")), eq(town.campaignId, campaignId),
    )).limit(1).for("update");
    if (!current) throw new Error("Town not found in this Campaign.");
    assertExactConfirmation(current.name, confirmationName);
    const [preparedReference] = await tx.select({ sessionId: campaignSessionPreparedTown.sessionId })
      .from(campaignSessionPreparedTown).where(eq(campaignSessionPreparedTown.townId, current.id)).limit(1);
    const [sceneReference] = await tx.select({ sceneId: campaignSessionSceneTown.sceneId })
      .from(campaignSessionSceneTown).where(eq(campaignSessionSceneTown.townId, current.id)).limit(1);
    if (preparedReference || sceneReference) {
      throw new Error("This Town is retained by Session preparation or a Scene placement. Detach those references before permanent deletion.");
    }
    const [shops] = await tx.select({ value: count() }).from(townShopMembership).where(eq(townShopMembership.townId, current.id));
    const [npcs] = await tx.select({ value: count() }).from(townNpcAssociation).where(eq(townNpcAssociation.townId, current.id));
    const [places] = await tx.select({ value: count() }).from(townPlace).where(eq(townPlace.townId, current.id));
    await tx.insert(lifecycleAuditEvent).values({ action: "delete", entityKind: "town", targetId: String(current.id), targetName: current.name, campaignIdSnapshot: campaignId, ownerUserIdSnapshot: manager.ownerUserId, actorUserId: manager.actorUserId, reason: "", dependencySummaryJson: { shopMemberships: Number(shops?.value ?? 0), npcAssociations: Number(npcs?.value ?? 0), ownedPlaces: Number(places?.value ?? 0) } });
    const removed = await tx.delete(town).where(and(eq(town.id, current.id), eq(town.campaignId, campaignId))).returning({ id: town.id });
    if (removed.length !== 1) throw new Error("Town could not be permanently deleted.");
  });
  revalidateTownPaths();
}

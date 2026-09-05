"use server";

import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  max,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign, campaignDerivedCurrency } from "@/db/campaign-schema";
import { item } from "@/db/item-schema";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import { campaignCharacter, campaignInventoryItem } from "@/db/realm-schema";
import { shop, shopOffering, shopStaffAssignment } from "@/db/shop-schema";
import { buildCampaignAccessDesignation } from "@/features/campaigns/campaign-access-designation";
import { assertOwnedRootManager } from "@/features/lifecycle/policy";
import {
  assertShopEditable,
  isEligibleShopNpc,
  normalizeShopArchiveReason,
  normalizeShopCoreValues,
  normalizeShopOfferingValues,
  normalizeShopStaffValues,
  type ShopArchiveStatus,
  type ShopCatalogItem,
  type ShopChangedSaleConfirmationMode,
  type ShopCharacterPurchaseMode,
  type ShopCoreValues,
  type ShopFulfillmentKind,
  type ShopOfferingValues,
  type ShopSoldItemHandling,
  type ShopStaffValues,
  type ShopStorefrontState,
} from "@/features/shops/shop-builder";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

export type ShopCampaignSummary = {
  id: number;
  name: string;
  archived: boolean;
  ownerLabel?: string;
};

export type ShopSummary = {
  id: number;
  campaignId: number;
  name: string;
  category: string;
  description: string;
  locationNotes: string;
  storefrontState: ShopStorefrontState;
  balanceCredits: number;
  staffCount: number;
  offeringCount: number;
  archivedAt: string | null;
  archiveReason: string;
};

export type ShopStaffRecord = {
  id: number;
  npcCharacterId: number;
  npcName: string;
  npcKind: "race" | "creature";
  npcBuildMode: "simple" | "detailed";
  npcArchived: boolean;
  responsibilityLabel: string;
  isPrimaryContact: boolean;
  sortOrder: number;
};

export type EligibleShopNpc = {
  id: number;
  name: string;
  npcKind: "race" | "creature";
  npcBuildMode: "simple" | "detailed";
  roleLabel: string;
};

export type ShopOfferingRecord = {
  id: number;
  itemId: number;
  canonicalId: string;
  itemName: string;
  catalogScope: "equipment" | "inventory";
  equipmentGroup: "weapon" | "armor" | "general" | null;
  recordType: string;
  family: string;
  category: string;
  description: string;
  canonicalPriceCredits: number | null;
  priceBasis: string;
  itemArchived: boolean;
  campaignAuthorized: boolean;
  fulfillmentKind: ShopFulfillmentKind;
  enabled: boolean;
  unlimitedStock: boolean;
  limitedQuantity: number | null;
  sellingPriceOverrideCredits: number | null;
  buyingPriceOverrideCredits: number | null;
  sortOrder: number;
  shopNote: string;
};

export type ShopDetail = {
  shop: {
    id: number;
    campaignId: number;
    name: string;
    category: string;
    description: string;
    locationNotes: string;
    balanceCredits: number;
    storefrontState: ShopStorefrontState;
    characterPurchaseMode: ShopCharacterPurchaseMode;
    soldItemHandling: ShopSoldItemHandling;
    changedSaleConfirmationMode: ShopChangedSaleConfirmationMode;
    archivedAt: string | null;
    archiveReason: string;
  };
  campaign: {
    id: number;
    name: string;
    archived: boolean;
    currencySystem: "Credits" | "Derived Currency";
    derivedCurrencies: Array<{
      id: number;
      campaignId: number;
      name: string;
      description: string;
      creditsPerUnit: number;
      sortOrder: number;
    }>;
  };
  staff: ShopStaffRecord[];
  eligibleNpcs: EligibleShopNpc[];
  offerings: ShopOfferingRecord[];
  authorizedItems: ShopCatalogItem[];
};

export type CreateShopValues = Pick<
  ShopCoreValues,
  "campaignId" | "name" | "category" | "description" | "locationNotes" | "balanceCredits"
>;

export type SaveShopCoreValues = ShopCoreValues & { shopId: number };
export type AddShopStaffValues = ShopStaffValues;
export type UpdateShopStaffValues = ShopStaffValues & { assignmentId: number };
export type AddShopOfferingValues = ShopOfferingValues;
export type UpdateShopOfferingValues = ShopOfferingValues & { offeringId: number };

type ManagerContext = {
  actorUserId: string;
  ownerUserId: string;
  campaignName: string;
  campaignArchivedAt: Date | null;
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must identify a saved record.`);
  }
  return value;
}

async function requireCampaignManager(campaignId: number): Promise<ManagerContext> {
  positiveId(campaignId, "Campaign");
  const access = await requireGodOrAdminAccessContext();
  const [campaignRow] = await db.select({
    createdByUserId: campaign.createdByUserId,
    name: campaign.name,
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
    campaignName: campaignRow.name,
    campaignArchivedAt: campaignRow.archivedAt,
  };
}

async function requireEditableShop(shopId: number, campaignId: number) {
  const manager = await requireCampaignManager(campaignId);
  if (manager.campaignArchivedAt) {
    throw new Error("Restore this Campaign before editing its Shops.");
  }
  const [shopRow] = await db.select({
    id: shop.id,
    name: shop.name,
    archivedAt: shop.archivedAt,
  }).from(shop).where(and(
    eq(shop.id, positiveId(shopId, "Shop")),
    eq(shop.campaignId, campaignId),
  )).limit(1);
  if (!shopRow) throw new Error("Shop not found in this Campaign.");
  assertShopEditable(shopRow.archivedAt);
  return { manager, shop: shopRow };
}

function revalidateShopPaths(): void {
  revalidatePath("/heavens/shops");
  revalidatePath("/heavens");
  revalidatePath("/heavens/campaigns");
}

function isDuplicateError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}

export async function listShopCampaigns(): Promise<ShopCampaignSummary[]> {
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

export async function listShops(
  campaignId: number,
  status: ShopArchiveStatus,
): Promise<ShopSummary[]> {
  await requireCampaignManager(campaignId);
  if (status !== "active" && status !== "archived") {
    throw new Error("Shop archive status must be active or archived.");
  }
  const rows = await db.select().from(shop).where(and(
    eq(shop.campaignId, campaignId),
    status === "archived" ? isNotNull(shop.archivedAt) : isNull(shop.archivedAt),
  )).orderBy(asc(shop.name), asc(shop.id));
  if (!rows.length) return [];
  const shopIds = rows.map(({ id }) => id);
  const [staffRows, offeringRows] = await Promise.all([
    db.select({ shopId: shopStaffAssignment.shopId })
      .from(shopStaffAssignment)
      .where(inArray(shopStaffAssignment.shopId, shopIds)),
    db.select({ shopId: shopOffering.shopId })
      .from(shopOffering)
      .where(inArray(shopOffering.shopId, shopIds)),
  ]);
  const staffCounts = new Map<number, number>();
  const offeringCounts = new Map<number, number>();
  for (const row of staffRows) staffCounts.set(row.shopId, (staffCounts.get(row.shopId) ?? 0) + 1);
  for (const row of offeringRows) offeringCounts.set(row.shopId, (offeringCounts.get(row.shopId) ?? 0) + 1);
  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    category: row.category,
    description: row.description,
    locationNotes: row.locationNotes,
    storefrontState: row.storefrontState as ShopStorefrontState,
    balanceCredits: row.balanceCredits,
    staffCount: staffCounts.get(row.id) ?? 0,
    offeringCount: offeringCounts.get(row.id) ?? 0,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    archiveReason: row.archiveReason,
  }));
}

export async function getShop(shopId: number, campaignId: number): Promise<ShopDetail> {
  await requireCampaignManager(campaignId);
  const [root] = await db.select({
    id: shop.id,
    campaignId: shop.campaignId,
    name: shop.name,
    category: shop.category,
    description: shop.description,
    locationNotes: shop.locationNotes,
    balanceCredits: shop.balanceCredits,
    storefrontState: shop.storefrontState,
    characterPurchaseMode: shop.characterPurchaseMode,
    soldItemHandling: shop.soldItemHandling,
    changedSaleConfirmationMode: shop.changedSaleConfirmationMode,
    archivedAt: shop.archivedAt,
    archiveReason: shop.archiveReason,
    campaignName: campaign.name,
    campaignArchivedAt: campaign.archivedAt,
    currencySystem: campaign.currencySystem,
  }).from(shop)
    .innerJoin(campaign, eq(campaign.id, shop.campaignId))
    .where(and(
      eq(shop.id, positiveId(shopId, "Shop")),
      eq(shop.campaignId, campaignId),
    ))
    .limit(1);
  if (!root) throw new Error("Shop not found in this Campaign.");

  const [currencyRows, staffRows, npcRows, offeringRows, authorizedItemRows] = await Promise.all([
    db.select().from(campaignDerivedCurrency)
      .where(eq(campaignDerivedCurrency.campaignId, campaignId))
      .orderBy(asc(campaignDerivedCurrency.sortOrder), asc(campaignDerivedCurrency.id)),
    db.select({
      id: shopStaffAssignment.id,
      npcCharacterId: shopStaffAssignment.npcCharacterId,
      npcName: campaignCharacter.name,
      npcKind: campaignCharacter.npcKind,
      npcBuildMode: campaignCharacter.npcBuildMode,
      npcArchivedAt: campaignCharacter.archivedAt,
      responsibilityLabel: shopStaffAssignment.responsibilityLabel,
      isPrimaryContact: shopStaffAssignment.isPrimaryContact,
      sortOrder: shopStaffAssignment.sortOrder,
    }).from(shopStaffAssignment)
      .innerJoin(campaignCharacter, eq(campaignCharacter.id, shopStaffAssignment.npcCharacterId))
      .where(and(
        eq(shopStaffAssignment.shopId, root.id),
        eq(shopStaffAssignment.campaignId, campaignId),
      ))
      .orderBy(asc(shopStaffAssignment.sortOrder), asc(shopStaffAssignment.id)),
    db.select({
      id: campaignCharacter.id,
      campaignId: campaignCharacter.campaignId,
      name: campaignCharacter.name,
      isNpc: campaignCharacter.isNpc,
      npcKind: campaignCharacter.npcKind,
      npcBuildMode: campaignCharacter.npcBuildMode,
      roleLabel: campaignCharacter.npcRoleLabel,
      archivedAt: campaignCharacter.archivedAt,
    }).from(campaignCharacter)
      .where(and(
        eq(campaignCharacter.campaignId, campaignId),
        eq(campaignCharacter.isNpc, true),
        isNull(campaignCharacter.archivedAt),
      ))
      .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id)),
    db.select({
      id: shopOffering.id,
      itemId: shopOffering.itemId,
      canonicalId: item.canonicalId,
      itemName: item.name,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      recordType: item.recordType,
      family: item.family,
      category: item.category,
      description: item.description,
      canonicalPriceCredits: item.credits,
      priceBasis: item.priceBasis,
      itemArchivedAt: item.archivedAt,
      authorizationItemId: campaignInventoryItem.itemId,
      fulfillmentKind: shopOffering.fulfillmentKind,
      enabled: shopOffering.enabled,
      unlimitedStock: shopOffering.unlimitedStock,
      limitedQuantity: shopOffering.limitedQuantity,
      sellingPriceOverrideCredits: shopOffering.sellingPriceOverrideCredits,
      buyingPriceOverrideCredits: shopOffering.buyingPriceOverrideCredits,
      sortOrder: shopOffering.sortOrder,
      shopNote: shopOffering.shopNote,
    }).from(shopOffering)
      .innerJoin(item, eq(item.id, shopOffering.itemId))
      .leftJoin(campaignInventoryItem, and(
        eq(campaignInventoryItem.campaignId, shopOffering.campaignId),
        eq(campaignInventoryItem.itemId, shopOffering.itemId),
      ))
      .where(and(
        eq(shopOffering.shopId, root.id),
        eq(shopOffering.campaignId, campaignId),
      ))
      .orderBy(asc(shopOffering.sortOrder), asc(shopOffering.id)),
    db.select({
      id: item.id,
      canonicalId: item.canonicalId,
      name: item.name,
      catalogScope: item.catalogScope,
      equipmentGroup: item.equipmentGroup,
      recordType: item.recordType,
      family: item.family,
      category: item.category,
      description: item.description,
      credits: item.credits,
      priceBasis: item.priceBasis,
      archivedAt: item.archivedAt,
    }).from(campaignInventoryItem)
      .innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
      .where(and(
        eq(campaignInventoryItem.campaignId, campaignId),
        isNull(item.archivedAt),
      ))
      .orderBy(asc(campaignInventoryItem.sortOrder), asc(item.name), asc(item.id)),
  ]);

  return {
    shop: {
      id: root.id,
      campaignId: root.campaignId,
      name: root.name,
      category: root.category,
      description: root.description,
      locationNotes: root.locationNotes,
      balanceCredits: root.balanceCredits,
      storefrontState: root.storefrontState as ShopStorefrontState,
      characterPurchaseMode: root.characterPurchaseMode as ShopCharacterPurchaseMode,
      soldItemHandling: root.soldItemHandling as ShopSoldItemHandling,
      changedSaleConfirmationMode: root.changedSaleConfirmationMode as ShopChangedSaleConfirmationMode,
      archivedAt: root.archivedAt?.toISOString() ?? null,
      archiveReason: root.archiveReason,
    },
    campaign: {
      id: root.campaignId,
      name: root.campaignName,
      archived: root.campaignArchivedAt !== null,
      currencySystem: root.currencySystem,
      derivedCurrencies: currencyRows,
    },
    staff: staffRows.map((row) => ({
      id: row.id,
      npcCharacterId: row.npcCharacterId,
      npcName: row.npcName,
      npcKind: row.npcKind === "creature" ? "creature" : "race",
      npcBuildMode: row.npcBuildMode === "simple" ? "simple" : "detailed",
      npcArchived: row.npcArchivedAt !== null,
      responsibilityLabel: row.responsibilityLabel,
      isPrimaryContact: row.isPrimaryContact,
      sortOrder: row.sortOrder,
    })),
    eligibleNpcs: npcRows.filter((row) => isEligibleShopNpc({
      requestedCampaignId: campaignId,
      npcCampaignId: row.campaignId,
      isNpc: row.isNpc,
      npcKind: row.npcKind,
      npcBuildMode: row.npcBuildMode,
      archivedAt: row.archivedAt,
    })).map((row) => ({
      id: row.id,
      name: row.name,
      npcKind: row.npcKind === "creature" ? "creature" : "race",
      npcBuildMode: row.npcBuildMode === "simple" ? "simple" : "detailed",
      roleLabel: row.roleLabel,
    })),
    offerings: offeringRows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      canonicalId: row.canonicalId,
      itemName: row.itemName,
      catalogScope: row.catalogScope === "inventory" ? "inventory" : "equipment",
      equipmentGroup: row.equipmentGroup === "weapon" || row.equipmentGroup === "armor" || row.equipmentGroup === "general"
        ? row.equipmentGroup
        : null,
      recordType: row.recordType,
      family: row.family,
      category: row.category,
      description: row.description,
      canonicalPriceCredits: row.canonicalPriceCredits,
      priceBasis: row.priceBasis,
      itemArchived: row.itemArchivedAt !== null,
      campaignAuthorized: row.authorizationItemId !== null,
      fulfillmentKind: row.fulfillmentKind as ShopFulfillmentKind,
      enabled: row.enabled,
      unlimitedStock: row.unlimitedStock,
      limitedQuantity: row.limitedQuantity,
      sellingPriceOverrideCredits: row.sellingPriceOverrideCredits,
      buyingPriceOverrideCredits: row.buyingPriceOverrideCredits,
      sortOrder: row.sortOrder,
      shopNote: row.shopNote,
    })),
    authorizedItems: authorizedItemRows.map((row) => ({
      id: row.id,
      canonicalId: row.canonicalId,
      name: row.name,
      catalogScope: row.catalogScope === "inventory" ? "inventory" : "equipment",
      equipmentGroup: row.equipmentGroup === "weapon" || row.equipmentGroup === "armor" || row.equipmentGroup === "general"
        ? row.equipmentGroup
        : null,
      recordType: row.recordType,
      family: row.family,
      category: row.category,
      description: row.description,
      credits: row.credits,
      priceBasis: row.priceBasis,
      archived: false,
    })),
  };
}

export async function createShop(input: CreateShopValues): Promise<ShopDetail> {
  const normalized = normalizeShopCoreValues({
    ...input,
    storefrontState: "closed",
    characterPurchaseMode: "god-approval-required",
    soldItemHandling: "add-to-shop-stock",
    changedSaleConfirmationMode: "character-owner-accepts",
  });
  const manager = await requireCampaignManager(normalized.campaignId);
  if (manager.campaignArchivedAt) throw new Error("Restore this Campaign before creating a Shop.");
  const [created] = await db.insert(shop).values(normalized).returning({ id: shop.id });
  if (!created) throw new Error("The Shop could not be created.");
  revalidateShopPaths();
  return getShop(created.id, normalized.campaignId);
}

export async function saveShopCore(input: SaveShopCoreValues): Promise<ShopDetail> {
  const shopId = positiveId(input.shopId, "Shop");
  const normalized = normalizeShopCoreValues(input);
  await requireEditableShop(shopId, normalized.campaignId);
  const [updated] = await db.update(shop).set({
    name: normalized.name,
    category: normalized.category,
    description: normalized.description,
    locationNotes: normalized.locationNotes,
    balanceCredits: normalized.balanceCredits,
    storefrontState: normalized.storefrontState,
    characterPurchaseMode: normalized.characterPurchaseMode,
    soldItemHandling: normalized.soldItemHandling,
    changedSaleConfirmationMode: normalized.changedSaleConfirmationMode,
    updatedAt: new Date(),
  }).where(and(eq(shop.id, shopId), eq(shop.campaignId, normalized.campaignId)))
    .returning({ id: shop.id });
  if (!updated) throw new Error("The Shop changed before it could be saved.");
  revalidateShopPaths();
  return getShop(shopId, normalized.campaignId);
}

export async function addShopStaff(input: AddShopStaffValues): Promise<ShopDetail> {
  const normalized = normalizeShopStaffValues(input);
  await requireEditableShop(normalized.shopId, normalized.campaignId);
  const [npc] = await db.select({
    campaignId: campaignCharacter.campaignId,
    isNpc: campaignCharacter.isNpc,
    npcKind: campaignCharacter.npcKind,
    npcBuildMode: campaignCharacter.npcBuildMode,
    archivedAt: campaignCharacter.archivedAt,
  }).from(campaignCharacter).where(and(
    eq(campaignCharacter.id, normalized.npcCharacterId),
    eq(campaignCharacter.campaignId, normalized.campaignId),
  )).limit(1);
  if (!npc || !isEligibleShopNpc({
    requestedCampaignId: normalized.campaignId,
    npcCampaignId: npc.campaignId,
    isNpc: npc.isNpc,
    npcKind: npc.npcKind,
    npcBuildMode: npc.npcBuildMode,
    archivedAt: npc.archivedAt,
  })) {
    throw new Error("Shop staff must be an active persistent Race or Creature NPC from this Campaign.");
  }
  const [existing] = await db.select({ id: shopStaffAssignment.id })
    .from(shopStaffAssignment)
    .where(and(
      eq(shopStaffAssignment.shopId, normalized.shopId),
      eq(shopStaffAssignment.npcCharacterId, normalized.npcCharacterId),
    )).limit(1);
  if (existing) throw new Error("This NPC is already assigned to the Shop.");
  try {
    await db.transaction(async (tx) => {
      if (normalized.isPrimaryContact) {
        await tx.update(shopStaffAssignment).set({
          isPrimaryContact: false,
          updatedAt: new Date(),
        }).where(eq(shopStaffAssignment.shopId, normalized.shopId));
      }
      const [maximum] = await tx.select({ value: max(shopStaffAssignment.sortOrder) })
        .from(shopStaffAssignment)
        .where(eq(shopStaffAssignment.shopId, normalized.shopId));
      await tx.insert(shopStaffAssignment).values({
        ...normalized,
        sortOrder: (maximum?.value ?? -1) + 1,
      });
    });
  } catch (error) {
    if (isDuplicateError(error)) throw new Error("This NPC is already assigned to the Shop.");
    throw error;
  }
  revalidateShopPaths();
  return getShop(normalized.shopId, normalized.campaignId);
}

export async function updateShopStaff(input: UpdateShopStaffValues): Promise<ShopDetail> {
  const assignmentId = positiveId(input.assignmentId, "Staff Assignment");
  const normalized = normalizeShopStaffValues(input);
  await requireEditableShop(normalized.shopId, normalized.campaignId);
  const [existing] = await db.select({ npcCharacterId: shopStaffAssignment.npcCharacterId })
    .from(shopStaffAssignment)
    .where(and(
      eq(shopStaffAssignment.id, assignmentId),
      eq(shopStaffAssignment.shopId, normalized.shopId),
      eq(shopStaffAssignment.campaignId, normalized.campaignId),
    )).limit(1);
  if (!existing) throw new Error("Staff assignment not found in this Shop.");
  if (existing.npcCharacterId !== normalized.npcCharacterId) {
    throw new Error("A Staff Assignment cannot be moved to a different NPC.");
  }
  await db.transaction(async (tx) => {
    if (normalized.isPrimaryContact) {
      await tx.update(shopStaffAssignment).set({
        isPrimaryContact: false,
        updatedAt: new Date(),
      }).where(eq(shopStaffAssignment.shopId, normalized.shopId));
    }
    await tx.update(shopStaffAssignment).set({
      responsibilityLabel: normalized.responsibilityLabel,
      isPrimaryContact: normalized.isPrimaryContact,
      updatedAt: new Date(),
    }).where(and(
      eq(shopStaffAssignment.id, assignmentId),
      eq(shopStaffAssignment.shopId, normalized.shopId),
      eq(shopStaffAssignment.campaignId, normalized.campaignId),
    ));
  });
  revalidateShopPaths();
  return getShop(normalized.shopId, normalized.campaignId);
}

export async function removeShopStaff(
  shopId: number,
  campaignId: number,
  assignmentId: number,
): Promise<ShopDetail> {
  await requireEditableShop(shopId, campaignId);
  const removed = await db.delete(shopStaffAssignment).where(and(
    eq(shopStaffAssignment.id, positiveId(assignmentId, "Staff Assignment")),
    eq(shopStaffAssignment.shopId, shopId),
    eq(shopStaffAssignment.campaignId, campaignId),
  )).returning({ id: shopStaffAssignment.id });
  if (!removed.length) throw new Error("Staff assignment not found in this Shop.");
  revalidateShopPaths();
  return getShop(shopId, campaignId);
}

async function requireEligibleOfferingItem(input: {
  campaignId: number;
  itemId: number;
}): Promise<void> {
  const [authorized] = await db.select({ id: item.id })
    .from(campaignInventoryItem)
    .innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
    .where(and(
      eq(campaignInventoryItem.campaignId, input.campaignId),
      eq(campaignInventoryItem.itemId, input.itemId),
      isNull(item.archivedAt),
      inArray(item.catalogScope, ["equipment", "inventory"]),
    )).limit(1);
  if (!authorized) {
    throw new Error("Shop offerings must use an active Equipment or Inventory Item authorized by this Campaign.");
  }
}

export async function addShopOffering(input: AddShopOfferingValues): Promise<ShopDetail> {
  const normalized = normalizeShopOfferingValues(input);
  await requireEditableShop(normalized.shopId, normalized.campaignId);
  await requireEligibleOfferingItem(normalized);
  const [existing] = await db.select({ id: shopOffering.id }).from(shopOffering).where(and(
    eq(shopOffering.shopId, normalized.shopId),
    eq(shopOffering.itemId, normalized.itemId),
  )).limit(1);
  if (existing) throw new Error("This Item already has a listing in the Shop.");
  try {
    const [maximum] = await db.select({ value: max(shopOffering.sortOrder) })
      .from(shopOffering)
      .where(eq(shopOffering.shopId, normalized.shopId));
    await db.insert(shopOffering).values({
      ...normalized,
      sortOrder: (maximum?.value ?? -1) + 1,
    });
  } catch (error) {
    if (isDuplicateError(error)) throw new Error("This Item already has a listing in the Shop.");
    throw error;
  }
  revalidateShopPaths();
  return getShop(normalized.shopId, normalized.campaignId);
}

export async function updateShopOffering(input: UpdateShopOfferingValues): Promise<ShopDetail> {
  const offeringId = positiveId(input.offeringId, "Shop Offering");
  const normalized = normalizeShopOfferingValues(input);
  await requireEditableShop(normalized.shopId, normalized.campaignId);
  const [existing] = await db.select({ itemId: shopOffering.itemId })
    .from(shopOffering)
    .where(and(
      eq(shopOffering.id, offeringId),
      eq(shopOffering.shopId, normalized.shopId),
      eq(shopOffering.campaignId, normalized.campaignId),
    )).limit(1);
  if (!existing) throw new Error("Shop offering not found.");
  if (existing.itemId !== normalized.itemId) {
    throw new Error("A Shop Offering cannot be moved to a different Item.");
  }
  if (normalized.enabled) await requireEligibleOfferingItem(normalized);
  await db.update(shopOffering).set({
    fulfillmentKind: normalized.fulfillmentKind,
    enabled: normalized.enabled,
    unlimitedStock: normalized.unlimitedStock,
    limitedQuantity: normalized.limitedQuantity,
    sellingPriceOverrideCredits: normalized.sellingPriceOverrideCredits,
    buyingPriceOverrideCredits: normalized.buyingPriceOverrideCredits,
    shopNote: normalized.shopNote,
    updatedAt: new Date(),
  }).where(and(
    eq(shopOffering.id, offeringId),
    eq(shopOffering.shopId, normalized.shopId),
    eq(shopOffering.campaignId, normalized.campaignId),
  ));
  revalidateShopPaths();
  return getShop(normalized.shopId, normalized.campaignId);
}

export async function removeShopOffering(
  shopId: number,
  campaignId: number,
  offeringId: number,
): Promise<ShopDetail> {
  await requireEditableShop(shopId, campaignId);
  const removed = await db.delete(shopOffering).where(and(
    eq(shopOffering.id, positiveId(offeringId, "Shop Offering")),
    eq(shopOffering.shopId, shopId),
    eq(shopOffering.campaignId, campaignId),
  )).returning({ id: shopOffering.id });
  if (!removed.length) throw new Error("Shop offering not found.");
  revalidateShopPaths();
  return getShop(shopId, campaignId);
}

export async function reorderShopOfferings(
  shopId: number,
  campaignId: number,
  orderedOfferingIds: number[],
): Promise<ShopDetail> {
  await requireEditableShop(shopId, campaignId);
  const normalizedIds = orderedOfferingIds.map((id) => positiveId(id, "Shop Offering"));
  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new Error("Shop Offering order contains duplicate records.");
  }
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: shopOffering.id }).from(shopOffering).where(and(
      eq(shopOffering.shopId, shopId),
      eq(shopOffering.campaignId, campaignId),
    )).orderBy(asc(shopOffering.id));
    const existingIds = existing.map(({ id }) => id).sort((left, right) => left - right);
    const submittedIds = [...normalizedIds].sort((left, right) => left - right);
    if (JSON.stringify(existingIds) !== JSON.stringify(submittedIds)) {
      throw new Error("Shop Offering order must include every current listing exactly once.");
    }
    for (let sortOrder = 0; sortOrder < normalizedIds.length; sortOrder += 1) {
      await tx.update(shopOffering).set({ sortOrder, updatedAt: new Date() }).where(and(
        eq(shopOffering.id, normalizedIds[sortOrder]!),
        eq(shopOffering.shopId, shopId),
        eq(shopOffering.campaignId, campaignId),
      ));
    }
  });
  revalidateShopPaths();
  return getShop(shopId, campaignId);
}

export async function archiveShop(
  shopId: number,
  campaignId: number,
  reason?: string,
): Promise<void> {
  const manager = await requireCampaignManager(campaignId);
  const archiveReason = normalizeShopArchiveReason(reason);
  await db.transaction(async (tx) => {
    const [current] = await tx.select({
      id: shop.id,
      name: shop.name,
      archivedAt: shop.archivedAt,
    }).from(shop).where(and(
      eq(shop.id, positiveId(shopId, "Shop")),
      eq(shop.campaignId, campaignId),
    )).limit(1).for("update");
    if (!current) throw new Error("Shop not found in this Campaign.");
    if (current.archivedAt) throw new Error("This Shop is already archived.");
    await tx.update(shop).set({
      storefrontState: "closed",
      archivedAt: new Date(),
      archivedByUserId: manager.actorUserId,
      archiveReason,
      updatedAt: new Date(),
    }).where(and(eq(shop.id, current.id), eq(shop.campaignId, campaignId)));
    await tx.insert(lifecycleAuditEvent).values({
      action: "archive",
      entityKind: "shop",
      targetId: String(current.id),
      targetName: current.name,
      campaignIdSnapshot: campaignId,
      ownerUserIdSnapshot: manager.ownerUserId,
      actorUserId: manager.actorUserId,
      reason: archiveReason,
      dependencySummaryJson: {},
    });
  });
  revalidateShopPaths();
}

export async function restoreShop(shopId: number, campaignId: number): Promise<void> {
  const manager = await requireCampaignManager(campaignId);
  if (manager.campaignArchivedAt) throw new Error("Restore this Campaign before restoring its Shops.");
  await db.transaction(async (tx) => {
    const [current] = await tx.select({
      id: shop.id,
      name: shop.name,
      archivedAt: shop.archivedAt,
    }).from(shop).where(and(
      eq(shop.id, positiveId(shopId, "Shop")),
      eq(shop.campaignId, campaignId),
    )).limit(1).for("update");
    if (!current) throw new Error("Shop not found in this Campaign.");
    if (!current.archivedAt) throw new Error("This Shop is already active.");
    const invalidOfferings = await tx.select({ name: item.name })
      .from(shopOffering)
      .innerJoin(item, eq(item.id, shopOffering.itemId))
      .leftJoin(campaignInventoryItem, and(
        eq(campaignInventoryItem.campaignId, shopOffering.campaignId),
        eq(campaignInventoryItem.itemId, shopOffering.itemId),
      ))
      .where(and(
        eq(shopOffering.shopId, current.id),
        eq(shopOffering.enabled, true),
        isNull(campaignInventoryItem.itemId),
      ));
    const archivedOfferings = await tx.select({ name: item.name })
      .from(shopOffering)
      .innerJoin(item, eq(item.id, shopOffering.itemId))
      .where(and(
        eq(shopOffering.shopId, current.id),
        eq(shopOffering.enabled, true),
        isNotNull(item.archivedAt),
      ));
    const blockers = [...invalidOfferings, ...archivedOfferings].map(({ name }) => name);
    if (blockers.length) {
      throw new Error(`This Shop cannot be restored because these enabled offerings are unavailable: ${[...new Set(blockers)].join(", ")}. Reauthorize the Items before restoring the Shop.`);
    }
    await tx.update(shop).set({
      storefrontState: "closed",
      archivedAt: null,
      archivedByUserId: null,
      archiveReason: "",
      updatedAt: new Date(),
    }).where(and(eq(shop.id, current.id), eq(shop.campaignId, campaignId)));
    await tx.insert(lifecycleAuditEvent).values({
      action: "restore",
      entityKind: "shop",
      targetId: String(current.id),
      targetName: current.name,
      campaignIdSnapshot: campaignId,
      ownerUserIdSnapshot: manager.ownerUserId,
      actorUserId: manager.actorUserId,
      reason: "",
      dependencySummaryJson: {},
    });
  });
  revalidateShopPaths();
}

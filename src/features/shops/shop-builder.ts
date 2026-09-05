import {
  canManageOwnedRoot,
  normalizeLifecycleReason,
} from "@/features/lifecycle/policy";

export const SHOP_STOREFRONT_STATES = ["open", "closed"] as const;
export const SHOP_CHARACTER_PURCHASE_MODES = [
  "immediate",
  "god-approval-required",
] as const;
export const SHOP_SOLD_ITEM_HANDLING_MODES = [
  "add-to-shop-stock",
  "remove-from-active-play",
] as const;
export const SHOP_CHANGED_SALE_CONFIRMATION_MODES = [
  "character-owner-accepts",
  "god-approval-finalizes",
] as const;
export const SHOP_FULFILLMENT_KINDS = [
  "inventory-transfer",
  "service-narrative",
] as const;
export const SHOP_ARCHIVE_STATUSES = ["active", "archived"] as const;

export type ShopStorefrontState = (typeof SHOP_STOREFRONT_STATES)[number];
export type ShopCharacterPurchaseMode = (typeof SHOP_CHARACTER_PURCHASE_MODES)[number];
export type ShopSoldItemHandling = (typeof SHOP_SOLD_ITEM_HANDLING_MODES)[number];
export type ShopChangedSaleConfirmationMode = (typeof SHOP_CHANGED_SALE_CONFIRMATION_MODES)[number];
export type ShopFulfillmentKind = (typeof SHOP_FULFILLMENT_KINDS)[number];
export type ShopArchiveStatus = (typeof SHOP_ARCHIVE_STATUSES)[number];
export type ShopCatalogFilter = "all" | "weapon" | "armor" | "general" | "inventory";
export type ShopManagerRole = "admin" | "god" | "player";

export type ShopCoreValues = {
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
};

export type ShopOfferingValues = {
  shopId: number;
  campaignId: number;
  itemId: number;
  fulfillmentKind: ShopFulfillmentKind;
  enabled: boolean;
  unlimitedStock: boolean;
  limitedQuantity: number | null;
  sellingPriceOverrideCredits: number | null;
  buyingPriceOverrideCredits: number | null;
  shopNote: string;
};

export type ShopStaffValues = {
  shopId: number;
  campaignId: number;
  npcCharacterId: number;
  responsibilityLabel: string;
  isPrimaryContact: boolean;
};

export type ShopCatalogItem = {
  id: number;
  canonicalId: string;
  name: string;
  catalogScope: "equipment" | "inventory";
  equipmentGroup: "weapon" | "armor" | "general" | null;
  recordType: string;
  family: string;
  category: string;
  description: string;
  credits: number | null;
  priceBasis: string;
  archived: boolean;
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must identify a saved record.`);
  }
  return value;
}

function textWithin(value: string, label: string, maximum: number, required = false): string {
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) {
    throw new Error(`${label} cannot exceed ${maximum.toLocaleString("en-US")} characters.`);
  }
  return normalized;
}

function nonNegativeNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return value;
}

function optionalNonNegativeNumber(value: number | null, label: string): number | null {
  return value === null ? null : nonNegativeNumber(value, label);
}

export function normalizeShopCoreValues(input: ShopCoreValues): ShopCoreValues {
  if (!SHOP_STOREFRONT_STATES.includes(input.storefrontState)) {
    throw new Error("Storefront State must be open or closed.");
  }
  if (!SHOP_CHARACTER_PURCHASE_MODES.includes(input.characterPurchaseMode)) {
    throw new Error("Character Purchase Mode is invalid.");
  }
  if (!SHOP_SOLD_ITEM_HANDLING_MODES.includes(input.soldItemHandling)) {
    throw new Error("Sold-Item Handling is invalid.");
  }
  if (!SHOP_CHANGED_SALE_CONFIRMATION_MODES.includes(input.changedSaleConfirmationMode)) {
    throw new Error("Changed-Sale Confirmation Mode is invalid.");
  }
  return {
    campaignId: positiveId(input.campaignId, "Campaign"),
    name: textWithin(input.name, "Shop Name", 120, true),
    category: textWithin(input.category, "Shop Type / Category", 120, true),
    description: textWithin(input.description, "Description", 5000),
    locationNotes: textWithin(input.locationNotes, "Location Notes", 1000),
    balanceCredits: nonNegativeNumber(input.balanceCredits, "Shop Balance"),
    storefrontState: input.storefrontState,
    characterPurchaseMode: input.characterPurchaseMode,
    soldItemHandling: input.soldItemHandling,
    changedSaleConfirmationMode: input.changedSaleConfirmationMode,
  };
}

export function normalizeShopStaffValues(input: ShopStaffValues): ShopStaffValues {
  if (typeof input.isPrimaryContact !== "boolean") {
    throw new Error("Primary Contact must be true or false.");
  }
  return {
    shopId: positiveId(input.shopId, "Shop"),
    campaignId: positiveId(input.campaignId, "Campaign"),
    npcCharacterId: positiveId(input.npcCharacterId, "NPC"),
    responsibilityLabel: textWithin(input.responsibilityLabel, "Responsibility / Role", 160),
    isPrimaryContact: input.isPrimaryContact,
  };
}

export function normalizeShopOfferingValues(input: ShopOfferingValues): ShopOfferingValues {
  if (!SHOP_FULFILLMENT_KINDS.includes(input.fulfillmentKind)) {
    throw new Error("Offering Fulfillment must transfer an Item or record a service / narrative offering.");
  }
  if (typeof input.enabled !== "boolean" || typeof input.unlimitedStock !== "boolean") {
    throw new Error("Offering state must use explicit true or false values.");
  }
  let limitedQuantity: number | null = null;
  if (!input.unlimitedStock) {
    if (!Number.isSafeInteger(input.limitedQuantity) || (input.limitedQuantity ?? -1) < 0) {
      throw new Error("Limited Stock Quantity must be a whole number zero or greater.");
    }
    limitedQuantity = input.limitedQuantity;
  }
  return {
    shopId: positiveId(input.shopId, "Shop"),
    campaignId: positiveId(input.campaignId, "Campaign"),
    itemId: positiveId(input.itemId, "Item"),
    fulfillmentKind: input.fulfillmentKind,
    enabled: input.enabled,
    unlimitedStock: input.unlimitedStock,
    limitedQuantity,
    sellingPriceOverrideCredits: optionalNonNegativeNumber(
      input.sellingPriceOverrideCredits,
      "Selling-Price Override",
    ),
    buyingPriceOverrideCredits: optionalNonNegativeNumber(
      input.buyingPriceOverrideCredits,
      "Buying-Price Override",
    ),
    shopNote: textWithin(input.shopNote, "Shop-Facing Note", 1000),
  };
}

export function getEffectiveShopPrice(
  canonicalPriceCredits: number | null,
  overrideCredits: number | null,
): number | null {
  if (overrideCredits !== null) return nonNegativeNumber(overrideCredits, "Price Override");
  if (canonicalPriceCredits === null) return null;
  return nonNegativeNumber(canonicalPriceCredits, "Canonical Item Price");
}

export function isEligibleShopNpc(input: {
  requestedCampaignId: number;
  npcCampaignId: number;
  isNpc: boolean;
  npcKind: string;
  npcBuildMode: string | null;
  archivedAt: Date | string | null;
}): boolean {
  return input.npcCampaignId === input.requestedCampaignId
    && input.isNpc
    && (input.npcKind === "race" || input.npcKind === "creature")
    && (input.npcBuildMode === "simple" || input.npcBuildMode === "detailed")
    && input.archivedAt === null;
}

export function canManageShop(input: {
  actorUserId: string;
  campaignOwnerUserId: string;
  roles: readonly ShopManagerRole[];
}): boolean {
  return canManageOwnedRoot(
    { userId: input.actorUserId, roles: input.roles },
    input.campaignOwnerUserId,
  );
}

export function assertShopEditable(archivedAt: Date | string | null): void {
  if (archivedAt !== null) {
    throw new Error("Archived Shops are read-only. Restore this Shop before editing it.");
  }
}

export function normalizeShopArchiveReason(reason?: string): string {
  return normalizeLifecycleReason(reason);
}

export function matchesShopSearch(
  shop: { name: string; category: string; description: string; locationNotes: string },
  rawSearch: string,
): boolean {
  const search = rawSearch.trim().toLocaleLowerCase("en-US");
  if (!search) return true;
  return [shop.name, shop.category, shop.description, shop.locationNotes]
    .some((value) => value.toLocaleLowerCase("en-US").includes(search));
}

export function filterShopCatalogItems(
  items: readonly ShopCatalogItem[],
  listedItemIds: readonly number[],
  filter: ShopCatalogFilter,
  rawSearch: string,
): ShopCatalogItem[] {
  const listed = new Set(listedItemIds);
  const search = rawSearch.trim().toLocaleLowerCase("en-US");
  return items.filter((catalogItem) => {
    if (catalogItem.archived || listed.has(catalogItem.id)) return false;
    const matchesFilter = filter === "all"
      || (filter === "inventory" && catalogItem.catalogScope === "inventory")
      || (catalogItem.catalogScope === "equipment" && catalogItem.equipmentGroup === filter);
    if (!matchesFilter) return false;
    if (!search) return true;
    return [
      catalogItem.name,
      catalogItem.canonicalId,
      catalogItem.recordType,
      catalogItem.family,
      catalogItem.category,
      catalogItem.description,
      catalogItem.equipmentGroup ?? "",
    ].some((value) => value.toLocaleLowerCase("en-US").includes(search));
  });
}

export function moveOrderedId(
  ids: readonly number[],
  targetId: number,
  direction: "up" | "down",
): number[] {
  const next = [...ids];
  const index = next.indexOf(targetId);
  if (index < 0) throw new Error("The ordered record is no longer available.");
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= next.length) return next;
  [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  return next;
}

export function selectPrimaryStaff<T extends { id: number; isPrimaryContact: boolean }>(
  staff: readonly T[],
  primaryId: number | null,
): T[] {
  if (primaryId !== null && !staff.some(({ id }) => id === primaryId)) {
    throw new Error("The selected primary contact is not assigned to this Shop.");
  }
  return staff.map((entry) => ({
    ...entry,
    isPrimaryContact: primaryId !== null && entry.id === primaryId,
  }));
}

import assert from "node:assert/strict";
import test from "node:test";

import { formatCampaignMoney } from "@/features/characters/currency-rules";

import {
  assertShopEditable,
  canManageShop,
  filterShopCatalogItems,
  getEffectiveShopPrice,
  isEligibleShopNpc,
  matchesShopSearch,
  moveOrderedId,
  normalizeShopCoreValues,
  normalizeShopOfferingValues,
  normalizeShopStaffValues,
  selectPrimaryStaff,
  type ShopCatalogItem,
  type ShopCoreValues,
  type ShopOfferingValues,
} from "./shop-builder";

const validCore: ShopCoreValues = {
  campaignId: 7,
  name: "  Brannan's Forge  ",
  category: "  Armorer  ",
  description: "  An old stone forge.  ",
  locationNotes: "  South gate.  ",
  balanceCredits: 125.5,
  storefrontState: "closed",
  characterPurchaseMode: "god-approval-required",
  soldItemHandling: "add-to-shop-stock",
  changedSaleConfirmationMode: "character-owner-accepts",
};

const validOffering: ShopOfferingValues = {
  shopId: 3,
  campaignId: 7,
  itemId: 11,
  fulfillmentKind: "inventory-transfer",
  enabled: true,
  unlimitedStock: true,
  limitedQuantity: 99,
  sellingPriceOverrideCredits: null,
  buyingPriceOverrideCredits: 8,
  shopNote: "  Ask about fitted grips.  ",
};

test("Shop root validation preserves policy choices and canonical nonnegative balance", () => {
  assert.deepEqual(normalizeShopCoreValues(validCore), {
    ...validCore,
    name: "Brannan's Forge",
    category: "Armorer",
    description: "An old stone forge.",
    locationNotes: "South gate.",
  });
  assert.throws(
    () => normalizeShopCoreValues({ ...validCore, balanceCredits: -0.01 }),
    /Shop Balance must be zero or greater/,
  );
  assert.throws(
    () => normalizeShopCoreValues({ ...validCore, characterPurchaseMode: "auto" as never }),
    /Character Purchase Mode is invalid/,
  );
});

test("Campaign ownership permits the owning G.O.D. and administrator but no unrelated actor", () => {
  assert.equal(canManageShop({ actorUserId: "owner", campaignOwnerUserId: "owner", roles: ["god"] }), true);
  assert.equal(canManageShop({ actorUserId: "admin", campaignOwnerUserId: "owner", roles: ["admin"] }), true);
  assert.equal(canManageShop({ actorUserId: "other", campaignOwnerUserId: "owner", roles: ["god"] }), false);
  assert.equal(canManageShop({ actorUserId: "owner", campaignOwnerUserId: "owner", roles: ["player"] }), false);
});

test("only active same-Campaign persistent Race or Creature NPCs are eligible as staff", () => {
  const base = {
    requestedCampaignId: 7,
    npcCampaignId: 7,
    isNpc: true,
    npcKind: "race",
    npcBuildMode: "simple",
    archivedAt: null,
  };
  assert.equal(isEligibleShopNpc(base), true);
  assert.equal(isEligibleShopNpc({ ...base, npcKind: "creature", npcBuildMode: "detailed" }), true);
  assert.equal(isEligibleShopNpc({ ...base, npcCampaignId: 8 }), false);
  assert.equal(isEligibleShopNpc({ ...base, isNpc: false }), false);
  assert.equal(isEligibleShopNpc({ ...base, npcBuildMode: null }), false);
  assert.equal(isEligibleShopNpc({ ...base, archivedAt: new Date() }), false);
});

test("staff responsibilities normalize and primary selection leaves at most one contact", () => {
  assert.deepEqual(normalizeShopStaffValues({
    shopId: 3,
    campaignId: 7,
    npcCharacterId: 19,
    responsibilityLabel: "  Proprietor  ",
    isPrimaryContact: true,
  }), {
    shopId: 3,
    campaignId: 7,
    npcCharacterId: 19,
    responsibilityLabel: "Proprietor",
    isPrimaryContact: true,
  });
  const staff = selectPrimaryStaff([
    { id: 1, isPrimaryContact: true, name: "One" },
    { id: 2, isPrimaryContact: false, name: "Two" },
    { id: 3, isPrimaryContact: false, name: "Three" },
  ], 3);
  assert.deepEqual(staff.map(({ isPrimaryContact }) => isPrimaryContact), [false, false, true]);
  assert.throws(() => selectPrimaryStaff(staff, 99), /not assigned/);
});

test("unlimited stock clears quantity while limited stock requires a nonnegative whole quantity", () => {
  assert.equal(normalizeShopOfferingValues(validOffering).limitedQuantity, null);
  assert.equal(normalizeShopOfferingValues({
    ...validOffering,
    unlimitedStock: false,
    limitedQuantity: 0,
  }).limitedQuantity, 0);
  assert.throws(
    () => normalizeShopOfferingValues({ ...validOffering, unlimitedStock: false, limitedQuantity: -1 }),
    /Limited Stock Quantity/,
  );
  assert.throws(
    () => normalizeShopOfferingValues({ ...validOffering, unlimitedStock: false, limitedQuantity: 1.5 }),
    /Limited Stock Quantity/,
  );
});

test("price overrides are nonnegative and canonical prices remain the buying and selling fallback", () => {
  assert.equal(getEffectiveShopPrice(12, null), 12);
  assert.equal(getEffectiveShopPrice(12, 9.5), 9.5);
  assert.equal(getEffectiveShopPrice(12, validOffering.buyingPriceOverrideCredits), 8);
  assert.equal(getEffectiveShopPrice(null, null), null);
  assert.equal(normalizeShopOfferingValues(validOffering).buyingPriceOverrideCredits, 8);
  assert.throws(
    () => normalizeShopOfferingValues({ ...validOffering, sellingPriceOverrideCredits: -1 }),
    /Selling-Price Override must be zero or greater/,
  );
});

test("Campaign-authorized catalog filtering follows Equipment and Inventory store concepts", () => {
  const items: ShopCatalogItem[] = [
    { id: 1, canonicalId: "ITEM-0001", name: "Iron Sword", catalogScope: "equipment", equipmentGroup: "weapon", recordType: "Weapon", family: "Blades", category: "Sword", description: "Sharp.", credits: 10, priceBasis: "each", archived: false },
    { id: 2, canonicalId: "ITEM-0002", name: "Field Kit", catalogScope: "equipment", equipmentGroup: "general", recordType: "Gear", family: "Kits", category: "Travel", description: "Useful.", credits: 4, priceBasis: "each", archived: false },
    { id: 3, canonicalId: "ITEM-0003", name: "Ferry Passage", catalogScope: "inventory", equipmentGroup: null, recordType: "Service", family: "Travel", category: "Passage", description: "River crossing.", credits: 2, priceBasis: "trip", archived: false },
    { id: 4, canonicalId: "ITEM-0004", name: "Old Stock", catalogScope: "inventory", equipmentGroup: null, recordType: "Supply", family: "Old", category: "Old", description: "Archived.", credits: 1, priceBasis: "each", archived: true },
  ];
  assert.deepEqual(filterShopCatalogItems(items, [2], "all", "").map(({ id }) => id), [1, 3]);
  assert.deepEqual(filterShopCatalogItems(items, [], "weapon", "iron").map(({ id }) => id), [1]);
  assert.deepEqual(filterShopCatalogItems(items, [], "inventory", "river").map(({ id }) => id), [3]);
});

test("Shop search and ordering support the critical library and offering interactions", () => {
  assert.equal(matchesShopSearch({
    name: "Moon Ferry",
    category: "Transport",
    description: "Night passage",
    locationNotes: "East dock",
  }, "dock"), true);
  assert.equal(matchesShopSearch({ name: "Moon Ferry", category: "Transport", description: "", locationNotes: "" }, "forge"), false);
  assert.deepEqual(moveOrderedId([10, 20, 30], 20, "up"), [20, 10, 30]);
  assert.deepEqual(moveOrderedId([10, 20, 30], 20, "down"), [10, 30, 20]);
  assert.deepEqual(moveOrderedId([10, 20, 30], 10, "up"), [10, 20, 30]);
});

test("archived Shops are read-only and balances use existing Campaign currency formatting", () => {
  assert.doesNotThrow(() => assertShopEditable(null));
  assert.throws(() => assertShopEditable("2026-09-05T12:00:00.000Z"), /Archived Shops are read-only/);
  assert.equal(formatCampaignMoney(125, "Credits", []), "125 Credits");
  assert.equal(formatCampaignMoney(125, "Derived Currency", [
    { id: 1, campaignId: 7, name: "Crowns", description: "Gold", creditsPerUnit: 100, sortOrder: 0 },
    { id: 2, campaignId: 7, name: "Marks", description: "Silver", creditsPerUnit: 25, sortOrder: 1 },
  ]), "1 Crowns, 1 Marks");
});

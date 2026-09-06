import "server-only";

import { createHash } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  campaign,
  campaignDerivedCurrency,
  campaignPlayer,
} from "@/db/campaign-schema";
import {
  item,
  itemRuntimeProfile,
  weaponProfile,
} from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterCurrencyHolding,
  campaignCharacterItem,
  campaignCharacterItemInstance,
  campaignCharacterProfile,
  campaignInventoryItem,
} from "@/db/realm-schema";
import { shop, shopOffering } from "@/db/shop-schema";
import {
  campaignSessionSceneShop,
  campaignSessionSceneTown,
  campaignSessionSceneTownShop,
} from "@/db/tabletop-location-schema";
import {
  campaignSessionSceneShopVisit,
  campaignSessionSceneShopVisitMember,
  shopCommerceOperation,
  shopMoneyEvent,
  shopResaleItemInstance,
  shopTransaction,
  shopTransactionLine,
  shopTransactionRequest,
  shopTransactionRequestLine,
} from "@/db/tabletop-shop-visit-schema";
import {
  campaignSession,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";
import { campaignCharacterFirearmState } from "@/db/tabletop-operations-schema";
import type { SerrianRole } from "@/db/authorization-schema";
import {
  getCampaignMoneyBreakdown,
  type CampaignMoneyFormatCurrency,
} from "@/features/characters/currency-rules";
import {
  getItemOwnershipStrategy,
  getStartingItemInstanceCharges,
} from "@/features/items/item-ownership";
import {
  reconcileEquipmentAfterOwnershipMutationInTransaction,
  validateEquipmentOwnershipMutationInTransaction,
} from "@/features/items/equipment-state-service";

export type ShopCommerceTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ShopCommerceActor = Readonly<{ userId: string; roles: readonly SerrianRole[] }>;
export type ShopCommerceRequestStatus = "pending" | "owner-review" | "completed" | "rejected" | "cancelled";

export type PurchaseLineInput = Readonly<{
  offeringId: number;
  quantity: number;
  expectedOfferingVersion: number;
  quotedUnitPriceCredits: number;
  quotedFulfillmentKind: "inventory-transfer" | "service-narrative";
}>;
export type SaleLineInput = Readonly<{
  itemId: number;
  quantity: number;
  itemInstanceId?: number | null;
}>;
export type RevisedRequestLineInput = Readonly<{
  requestLineId: number;
  quantity: number;
  unitPriceCredits: number;
}>;

export type ShopCommerceLineView = Readonly<{
  id: number;
  offeringId: number | null;
  itemId: number;
  itemInstanceId: number | null;
  canonicalId: string;
  name: string;
  fulfillmentKind: "inventory-transfer" | "service-narrative";
  quantity: number;
  quotedUnitPriceCredits: number;
  currentUnitPriceCredits: number;
  totalCredits: number;
}>;

export type ShopCommerceRequestView = Readonly<{
  id: number;
  kind: "purchase" | "sale";
  status: ShopCommerceRequestStatus;
  termsVersion: number;
  ownerAcceptedTermsVersion: number | null;
  godApprovedTermsVersion: number | null;
  narrativeNote: string;
  resolutionReason: string;
  transactionOverride: boolean;
  transactionOverrideReason: string;
  requestedByName: string;
  createdAt: string;
  updatedAt: string;
  lines: readonly ShopCommerceLineView[];
  totalCredits: number;
}>;

export type ShopCommerceHistoryView = Readonly<{
  id: number;
  requestId: number;
  kind: "purchase" | "sale";
  totalCredits: number;
  narrativeNote: string;
  transactionOverride: boolean;
  transactionOverrideReason: string;
  completedByName: string;
  completedAt: string;
  currencySnapshot: unknown;
  policySnapshot: unknown;
  lines: readonly {
    id: number;
    canonicalId: string;
    name: string;
    fulfillmentKind: "inventory-transfer" | "service-narrative";
    quantity: number;
    unitPriceCredits: number;
    totalCredits: number;
    sourceItemInstanceId: number | null;
    acquiredItemInstanceId: number | null;
  }[];
}>;

export type ShopCommerceView = Readonly<{
  campaignId: number;
  shopId: number;
  shopName: string;
  characterId: number;
  characterName: string;
  characterOwnerUserId: string;
  characterBalanceCredits: number;
  shopBalanceCredits: number | null;
  characterPurchaseMode: "immediate" | "god-approval-required";
  soldItemHandling: "add-to-shop-stock" | "remove-from-active-play";
  changedSaleConfirmationMode: "character-owner-accepts" | "god-approval-finalizes";
  currency: {
    currencySystem: "Credits" | "Derived Currency";
    derivedCurrencies: readonly CampaignMoneyFormatCurrency[];
  };
  ownedStacks: readonly {
    itemId: number;
    canonicalId: string;
    name: string;
    category: string;
    quantity: number;
    shopBuyingPriceCredits: number | null;
  }[];
  ownedInstances: readonly {
    id: number;
    itemId: number;
    canonicalId: string;
    name: string;
    category: string;
    currentCharges: number;
    equipmentState: string;
    shopBuyingPriceCredits: number | null;
  }[];
  requests: readonly ShopCommerceRequestView[];
  history: readonly ShopCommerceHistoryView[];
  moneyEvents: readonly {
    id: number;
    kind: MoneyEventKind;
    amountCredits: number;
    balanceBeforeCredits: number;
    balanceAfterCredits: number;
    reason: string;
    shopName: string | null;
    actorName: string;
    createdAt: string;
  }[];
}>;

type OperationKind = typeof shopCommerceOperation.$inferInsert.kind;
type MoneyEventKind = typeof shopMoneyEvent.$inferInsert.kind;
type ItemDefinition = Readonly<{
  id: number;
  canonicalId: string;
  name: string;
  archivedAt: Date | null;
  credits: number | null;
  useMode: "none" | "consume-item" | "charges" | "unlimited";
  maximumCharges: number | null;
  quantityPerUse: number | null;
  chargesPerUse: number | null;
  rechargeNotes: string;
  activationLabel: string;
  useNotes: string;
  isFirearm: boolean;
}>;

const MONEY_EPSILON = 0.000001;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function nonnegativeVersion(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid.`);
  return value;
}

function positiveQuantity(value: number, label = "Quantity"): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive whole number.`);
  return value;
}

function moneyAmount(value: number, label: string, allowZero = true): number {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value <= 0)) {
    throw new Error(`${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`);
  }
  return Math.round(value * 1_000_000) / 1_000_000;
}

function note(value: string | undefined, label: string, required = false): string {
  const normalized = (value ?? "").trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > 1000) throw new Error(`${label} cannot exceed 1,000 characters.`);
  return normalized;
}

function submissionKey(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) throw new Error("Submission identity is invalid.");
  return normalized;
}

function intentHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function claimOperation(
  tx: ShopCommerceTransaction,
  input: {
    campaignId: number;
    actorUserId: string;
    submissionKey: string;
    kind: OperationKind;
    intent: unknown;
  },
): Promise<{ id: number; reused: boolean }> {
  const key = submissionKey(input.submissionKey);
  const hash = intentHash(input.intent);
  const [created] = await tx.insert(shopCommerceOperation).values({
    campaignId: input.campaignId,
    actorUserId: input.actorUserId,
    submissionKey: key,
    intentHash: hash,
    kind: input.kind,
  }).onConflictDoNothing().returning({ id: shopCommerceOperation.id });
  if (created) return { id: created.id, reused: false };
  const [existing] = await tx.select({
    id: shopCommerceOperation.id,
    campaignId: shopCommerceOperation.campaignId,
    kind: shopCommerceOperation.kind,
    intentHash: shopCommerceOperation.intentHash,
  }).from(shopCommerceOperation).where(and(
    eq(shopCommerceOperation.actorUserId, input.actorUserId),
    eq(shopCommerceOperation.submissionKey, key),
  )).limit(1).for("update");
  if (!existing) throw new Error("The submission identity could not be claimed.");
  if (existing.campaignId !== input.campaignId || existing.kind !== input.kind || existing.intentHash !== hash) {
    throw new Error("That submission identity was already used for different transaction contents.");
  }
  return { id: existing.id, reused: true };
}

async function loadCurrencySnapshot(tx: ShopCommerceTransaction, campaignId: number) {
  const [campaignRow] = await tx.select({
    id: campaign.id,
    name: campaign.name,
    ownerUserId: campaign.createdByUserId,
    currencySystem: campaign.currencySystem,
    archivedAt: campaign.archivedAt,
  }).from(campaign).where(eq(campaign.id, positiveId(campaignId, "Campaign"))).limit(1);
  if (!campaignRow) throw new Error("Campaign not found.");
  const derivedCurrencies = campaignRow.currencySystem === "Derived Currency"
    ? await tx.select({
        id: campaignDerivedCurrency.id,
        campaignId: campaignDerivedCurrency.campaignId,
        name: campaignDerivedCurrency.name,
        description: campaignDerivedCurrency.description,
        creditsPerUnit: campaignDerivedCurrency.creditsPerUnit,
        sortOrder: campaignDerivedCurrency.sortOrder,
      }).from(campaignDerivedCurrency)
        .where(eq(campaignDerivedCurrency.campaignId, campaignRow.id))
        .orderBy(asc(campaignDerivedCurrency.sortOrder), asc(campaignDerivedCurrency.id))
    : [];
  return { ...campaignRow, derivedCurrencies };
}

function currencyJson(currency: Awaited<ReturnType<typeof loadCurrencySnapshot>>) {
  return {
    system: currency.currencySystem,
    denominations: currency.derivedCurrencies.map(({ id, name, creditsPerUnit, sortOrder }) => ({
      id,
      name,
      creditsPerUnit,
      sortOrder,
    })),
  };
}

function assertGodOwner(actor: ShopCommerceActor, campaignOwnerUserId: string): void {
  if (!actor.roles.includes("god") || actor.userId !== campaignOwnerUserId) {
    throw new Error("Only the Campaign-owning G.O.D. can manage Shop transactions.");
  }
}

async function writeCharacterMoneyEvent(
  tx: ShopCommerceTransaction,
  input: {
    operationId: number;
    transactionId?: number | null;
    campaignId: number;
    characterId: number;
    shopId?: number | null;
    kind: MoneyEventKind;
    amountCredits: number;
    reason: string;
    actorUserId: string;
    currency: Awaited<ReturnType<typeof loadCurrencySnapshot>>;
  },
): Promise<{ before: number; after: number }> {
  const [profile] = await tx.select({
    creditsRemaining: campaignCharacterProfile.creditsRemaining,
    commerceVersion: campaignCharacterProfile.commerceVersion,
  }).from(campaignCharacterProfile)
    .where(eq(campaignCharacterProfile.characterId, input.characterId))
    .limit(1)
    .for("update");
  if (!profile) throw new Error("Character purse not found.");
  if (!Number.isFinite(input.amountCredits)) throw new Error("Money event amount must be finite.");
  const amount = Math.round(input.amountCredits * 1_000_000) / 1_000_000;
  if (input.kind !== "character-balance-correction" && amount < 0) {
    throw new Error("Money event amount must be zero or greater.");
  }
  const signed = input.kind === "purchase-character-debit" ? -amount : amount;
  const rawAfter = profile.creditsRemaining + signed;
  if (rawAfter < -MONEY_EPSILON) throw new Error("The Character does not have enough money for this transaction.");
  const normalizedAfter = moneyAmount(Math.max(0, rawAfter), "Character balance");
  const breakdown = getCampaignMoneyBreakdown(
    normalizedAfter,
    input.currency.currencySystem,
    input.currency.derivedCurrencies,
  );
  if (input.currency.currencySystem === "Derived Currency" && !breakdown.fullyRepresented) {
    throw new Error("This amount cannot be represented by the Campaign's configured denominations. Adjust the amount or Currency setup before continuing.");
  }
  await tx.update(campaignCharacterProfile).set({
    creditsRemaining: normalizedAfter,
    commerceVersion: profile.commerceVersion + 1,
    updatedAt: new Date(),
  }).where(and(
    eq(campaignCharacterProfile.characterId, input.characterId),
    eq(campaignCharacterProfile.commerceVersion, profile.commerceVersion),
  ));
  await tx.delete(campaignCharacterCurrencyHolding)
    .where(eq(campaignCharacterCurrencyHolding.characterId, input.characterId));
  if (input.currency.currencySystem === "Derived Currency") {
    const holdings = breakdown.entries.filter(({ quantity }) => quantity > 0);
    if (holdings.length) await tx.insert(campaignCharacterCurrencyHolding).values(
      holdings.map((entry) => ({
        characterId: input.characterId,
        currencyId: entry.id,
        quantity: entry.quantity,
      })),
    );
  }
  await tx.insert(shopMoneyEvent).values({
    operationId: input.operationId,
    transactionId: input.transactionId ?? null,
    campaignId: input.campaignId,
    characterId: input.characterId,
    shopId: input.shopId ?? null,
    kind: input.kind,
    amountCredits: amount,
    balanceBeforeCredits: profile.creditsRemaining,
    balanceAfterCredits: normalizedAfter,
    reason: note(input.reason, "Money event reason", true),
    currencySnapshotJson: currencyJson(input.currency),
    actorUserId: input.actorUserId,
  });
  return { before: profile.creditsRemaining, after: normalizedAfter };
}

async function writeShopMoneyEvent(
  tx: ShopCommerceTransaction,
  input: {
    operationId: number;
    transactionId?: number | null;
    campaignId: number;
    characterId?: number | null;
    shopId: number;
    kind: MoneyEventKind;
    amountCredits: number;
    reason: string;
    actorUserId: string;
    currency: Awaited<ReturnType<typeof loadCurrencySnapshot>>;
  },
): Promise<{ before: number; after: number }> {
  const [shopRow] = await tx.select({
    balanceCredits: shop.balanceCredits,
    commerceVersion: shop.commerceVersion,
    archivedAt: shop.archivedAt,
  }).from(shop).where(and(
    eq(shop.id, input.shopId),
    eq(shop.campaignId, input.campaignId),
  )).limit(1).for("update");
  if (!shopRow) throw new Error("Shop not found in this Campaign.");
  if (shopRow.archivedAt) throw new Error("Archived Shops cannot complete transactions.");
  if (!Number.isFinite(input.amountCredits)) throw new Error("Money event amount must be finite.");
  const amount = Math.round(input.amountCredits * 1_000_000) / 1_000_000;
  if (input.kind !== "shop-balance-correction" && amount < 0) {
    throw new Error("Money event amount must be zero or greater.");
  }
  const signed = input.kind === "sale-shop-debit" ? -amount : amount;
  const rawAfter = shopRow.balanceCredits + signed;
  if (rawAfter < -MONEY_EPSILON) throw new Error("The Shop does not have enough money for this transaction.");
  const normalizedAfter = moneyAmount(Math.max(0, rawAfter), "Shop balance");
  await tx.update(shop).set({
    balanceCredits: normalizedAfter,
    commerceVersion: shopRow.commerceVersion + 1,
    updatedAt: new Date(),
  }).where(and(
    eq(shop.id, input.shopId),
    eq(shop.campaignId, input.campaignId),
    eq(shop.commerceVersion, shopRow.commerceVersion),
  ));
  await tx.insert(shopMoneyEvent).values({
    operationId: input.operationId,
    transactionId: input.transactionId ?? null,
    campaignId: input.campaignId,
    characterId: input.characterId ?? null,
    shopId: input.shopId,
    kind: input.kind,
    amountCredits: amount,
    balanceBeforeCredits: shopRow.balanceCredits,
    balanceAfterCredits: normalizedAfter,
    reason: note(input.reason, "Money event reason", true),
    currencySnapshotJson: currencyJson(input.currency),
    actorUserId: input.actorUserId,
  });
  return { before: shopRow.balanceCredits, after: normalizedAfter };
}

async function loadItemDefinitions(
  tx: ShopCommerceTransaction,
  campaignId: number,
  itemIds: readonly number[],
): Promise<Map<number, ItemDefinition>> {
  if (!itemIds.length) return new Map();
  const rows = await tx.select({
    id: item.id,
    canonicalId: item.canonicalId,
    name: item.name,
    archivedAt: item.archivedAt,
    credits: item.credits,
    useMode: itemRuntimeProfile.useMode,
    maximumCharges: itemRuntimeProfile.maximumCharges,
    quantityPerUse: itemRuntimeProfile.quantityPerUse,
    chargesPerUse: itemRuntimeProfile.chargesPerUse,
    rechargeNotes: itemRuntimeProfile.rechargeNotes,
    activationLabel: itemRuntimeProfile.activationLabel,
    useNotes: itemRuntimeProfile.useNotes,
    weaponProfileId: weaponProfile.id,
    weaponProfileRecordType: weaponProfile.profileRecordType,
    ammunitionItemId: weaponProfile.ammunitionItemId,
    isFirearm: sql<boolean>`coalesce(lower(trim(${weaponProfile.profileRecordType})) <> 'ammunition' and (${weaponProfile.ammunitionItemId} is not null or exists(select 1 from weapon_firing_modes where weapon_firing_modes.weapon_profile_id = ${weaponProfile.id})), false)`,
  }).from(campaignInventoryItem)
    .innerJoin(item, eq(item.id, campaignInventoryItem.itemId))
    .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
    .leftJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
    .where(and(
      eq(campaignInventoryItem.campaignId, campaignId),
      inArray(campaignInventoryItem.itemId, [...itemIds]),
    ));
  return new Map(rows.map((row) => [row.id, {
    id: row.id,
    canonicalId: row.canonicalId,
    name: row.name,
    archivedAt: row.archivedAt,
    credits: row.credits,
    useMode: row.useMode === "consume-item" || row.useMode === "charges" || row.useMode === "unlimited"
      ? row.useMode
      : "none",
    maximumCharges: row.maximumCharges,
    quantityPerUse: row.quantityPerUse,
    chargesPerUse: row.chargesPerUse,
    rechargeNotes: row.rechargeNotes ?? "",
    activationLabel: row.activationLabel ?? "Use",
    useNotes: row.useNotes ?? "",
    isFirearm: row.isFirearm,
  }]));
}

function runtimeProfile(definition: ItemDefinition) {
  return {
    useMode: definition.useMode,
    quantityPerUse: definition.quantityPerUse,
    maximumCharges: definition.maximumCharges,
    chargesPerUse: definition.chargesPerUse,
    rechargeNotes: definition.rechargeNotes,
    activationLabel: definition.activationLabel,
    useNotes: definition.useNotes,
  };
}

function ownershipStrategy(definition: ItemDefinition): "stack" | "instance" {
  return getItemOwnershipStrategy(runtimeProfile(definition), definition.isFirearm);
}

type LockedCommerceContext = Readonly<{
  campaignId: number;
  ownerUserId: string;
  campaignArchivedAt: Date | null;
  currencySystem: "Credits" | "Derived Currency";
  shopId: number;
  shopName: string;
  shopArchivedAt: Date | null;
  storefrontState: "open" | "closed";
  characterPurchaseMode: "immediate" | "god-approval-required";
  soldItemHandling: "add-to-shop-stock" | "remove-from-active-play";
  changedSaleConfirmationMode: "character-owner-accepts" | "god-approval-finalizes";
  characterId: number;
  characterName: string;
  characterOwnerUserId: string;
  characterArchivedAt: Date | null;
  isNpc: boolean;
}>;

async function lockCommerceContext(
  tx: ShopCommerceTransaction,
  campaignId: number,
  shopId: number,
  characterId: number,
): Promise<LockedCommerceContext> {
  const [campaignRow] = await tx.select({
    id: campaign.id,
    ownerUserId: campaign.createdByUserId,
    archivedAt: campaign.archivedAt,
    currencySystem: campaign.currencySystem,
  }).from(campaign).where(eq(campaign.id, positiveId(campaignId, "Campaign"))).limit(1);
  if (!campaignRow) throw new Error("Campaign not found.");
  const [shopRow] = await tx.select().from(shop).where(and(
    eq(shop.id, positiveId(shopId, "Shop")),
    eq(shop.campaignId, campaignRow.id),
  )).limit(1).for("update");
  if (!shopRow) throw new Error("Shop not found in this Campaign.");
  const [characterRow] = await tx.select().from(campaignCharacter).where(and(
    eq(campaignCharacter.id, positiveId(characterId, "Character")),
    eq(campaignCharacter.campaignId, campaignRow.id),
  )).limit(1).for("update");
  if (!characterRow) throw new Error("Character not found in this Campaign.");
  return {
    campaignId: campaignRow.id,
    ownerUserId: campaignRow.ownerUserId,
    campaignArchivedAt: campaignRow.archivedAt,
    currencySystem: campaignRow.currencySystem,
    shopId: shopRow.id,
    shopName: shopRow.name,
    shopArchivedAt: shopRow.archivedAt,
    storefrontState: shopRow.storefrontState as "open" | "closed",
    characterPurchaseMode: shopRow.characterPurchaseMode as "immediate" | "god-approval-required",
    soldItemHandling: shopRow.soldItemHandling as "add-to-shop-stock" | "remove-from-active-play",
    changedSaleConfirmationMode: shopRow.changedSaleConfirmationMode as "character-owner-accepts" | "god-approval-finalizes",
    characterId: characterRow.id,
    characterName: characterRow.name,
    characterOwnerUserId: characterRow.playerUserId,
    characterArchivedAt: characterRow.archivedAt,
    isNpc: characterRow.isNpc,
  };
}

function assertActiveCommerceContext(context: LockedCommerceContext): void {
  if (context.campaignArchivedAt) throw new Error("Archived Campaigns cannot complete Shop transactions.");
  if (context.shopArchivedAt) throw new Error("Archived Shops cannot complete transactions.");
  if (context.characterArchivedAt) throw new Error("Archived Characters cannot complete Shop transactions.");
  if (context.isNpc) throw new Error("Shop transactions require an active Player Character.");
}

type LockedVisitMembership = Readonly<{
  visitId: number;
  memberId: number;
  campaignId: number;
  sessionId: number;
  sceneId: number;
  shopId: number;
  characterId: number;
  placementKind: "town" | "independent";
  townId: number | null;
}>;

async function assertPlacementStillEligible(
  tx: ShopCommerceTransaction,
  visit: LockedVisitMembership,
): Promise<void> {
  if (visit.placementKind === "independent") {
    const [placement] = await tx.select({ shopId: campaignSessionSceneShop.shopId })
      .from(campaignSessionSceneShop)
      .where(and(
        eq(campaignSessionSceneShop.sceneId, visit.sceneId),
        eq(campaignSessionSceneShop.sessionId, visit.sessionId),
        eq(campaignSessionSceneShop.campaignId, visit.campaignId),
        eq(campaignSessionSceneShop.shopId, visit.shopId),
        eq(campaignSessionSceneShop.revealed, true),
      )).limit(1);
    if (!placement) throw new Error("The Shop placement is no longer revealed and eligible in the active Scene.");
    return;
  }
  const [placement] = await tx.select({ shopId: campaignSessionSceneTownShop.shopId })
    .from(campaignSessionSceneTownShop)
    .innerJoin(campaignSessionSceneTown, and(
      eq(campaignSessionSceneTown.sceneId, campaignSessionSceneTownShop.sceneId),
      eq(campaignSessionSceneTown.sessionId, campaignSessionSceneTownShop.sessionId),
      eq(campaignSessionSceneTown.campaignId, campaignSessionSceneTownShop.campaignId),
      eq(campaignSessionSceneTown.townId, campaignSessionSceneTownShop.townId),
    ))
    .where(and(
      eq(campaignSessionSceneTownShop.sceneId, visit.sceneId),
      eq(campaignSessionSceneTownShop.sessionId, visit.sessionId),
      eq(campaignSessionSceneTownShop.campaignId, visit.campaignId),
      eq(campaignSessionSceneTownShop.shopId, visit.shopId),
      eq(campaignSessionSceneTownShop.townId, visit.townId!),
      eq(campaignSessionSceneTown.revealed, true),
      eq(campaignSessionSceneTownShop.included, true),
      eq(campaignSessionSceneTownShop.revealed, true),
    )).limit(1);
  if (!placement) throw new Error("The Shop is no longer included and revealed beneath its active Town placement.");
}

async function lockActiveVisitMembership(
  tx: ShopCommerceTransaction,
  visitId: number,
  characterId: number,
): Promise<LockedVisitMembership> {
  const [visit] = await tx.select({
    id: campaignSessionSceneShopVisit.id,
    campaignId: campaignSessionSceneShopVisit.campaignId,
    sessionId: campaignSessionSceneShopVisit.sessionId,
    sceneId: campaignSessionSceneShopVisit.sceneId,
    shopId: campaignSessionSceneShopVisit.shopId,
    placementKind: campaignSessionSceneShopVisit.placementKind,
    townId: campaignSessionSceneShopVisit.townId,
    status: campaignSessionSceneShopVisit.status,
  }).from(campaignSessionSceneShopVisit)
    .where(eq(campaignSessionSceneShopVisit.id, positiveId(visitId, "Shop visit")))
    .limit(1)
    .for("update");
  if (!visit || visit.status !== "active") throw new Error("This Shop visit is no longer active.");
  const [member] = await tx.select({
    id: campaignSessionSceneShopVisitMember.id,
    status: campaignSessionSceneShopVisitMember.status,
  }).from(campaignSessionSceneShopVisitMember).where(and(
    eq(campaignSessionSceneShopVisitMember.visitId, visit.id),
    eq(campaignSessionSceneShopVisitMember.characterId, positiveId(characterId, "Character")),
    eq(campaignSessionSceneShopVisitMember.status, "active"),
  )).limit(1).for("update");
  if (!member) throw new Error("This Character is no longer an active member of the Shop visit.");
  const [hierarchy] = await tx.select({
    sessionStatus: campaignSession.status,
    sceneStatus: campaignSessionScene.status,
  }).from(campaignSessionScene)
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionScene.sessionId),
      eq(campaignSession.campaignId, campaignSessionScene.campaignId),
    ))
    .where(and(
      eq(campaignSessionScene.id, visit.sceneId),
      eq(campaignSessionScene.sessionId, visit.sessionId),
      eq(campaignSessionScene.campaignId, visit.campaignId),
    )).limit(1);
  if (!hierarchy || hierarchy.sessionStatus !== "active" || hierarchy.sceneStatus !== "active") {
    throw new Error("Normal Shop transactions require an active Session and active Scene.");
  }
  const locked: LockedVisitMembership = {
    visitId: visit.id,
    memberId: member.id,
    campaignId: visit.campaignId,
    sessionId: visit.sessionId,
    sceneId: visit.sceneId,
    shopId: visit.shopId,
    characterId,
    placementKind: visit.placementKind,
    townId: visit.townId,
  };
  await assertPlacementStillEligible(tx, locked);
  return locked;
}

async function assertPlayerAuthorization(
  tx: ShopCommerceTransaction,
  context: LockedCommerceContext,
  playerUserId: string,
): Promise<void> {
  if (context.characterOwnerUserId !== playerUserId) {
    throw new Error("Players may transact only for their own Character.");
  }
  const [membership] = await tx.select({ userId: campaignPlayer.userId })
    .from(campaignPlayer)
    .where(and(
      eq(campaignPlayer.campaignId, context.campaignId),
      eq(campaignPlayer.userId, playerUserId),
    )).limit(1);
  if (!membership) throw new Error("You no longer have access to this Campaign.");
}

async function assertNormalExecutionEligibility(
  tx: ShopCommerceTransaction,
  request: typeof shopTransactionRequest.$inferSelect,
  context: LockedCommerceContext,
): Promise<void> {
  if (request.transactionOverride) return;
  if (context.storefrontState !== "open") {
    throw new Error("Normal Shop transactions require the Shop to remain open through final approval and execution.");
  }
  if (request.requestedByUserId !== context.characterOwnerUserId) {
    throw new Error("The Character owner changed after this request was submitted. Cancel it and have the current owner start a new request.");
  }
  await assertPlayerAuthorization(tx, context, context.characterOwnerUserId);
  if (request.visitId === null || request.visitMemberId === null) {
    throw new Error("Normal Shop transactions require a current active visit membership.");
  }
  const visit = await lockActiveVisitMembership(tx, request.visitId, context.characterId);
  if (
    visit.memberId !== request.visitMemberId
    || visit.campaignId !== context.campaignId
    || visit.shopId !== context.shopId
  ) throw new Error("The transaction request no longer matches its active Shop visit membership.");
}

async function insertRequest(
  tx: ShopCommerceTransaction,
  input: {
    campaignId: number;
    shopId: number;
    characterId: number;
    visit?: LockedVisitMembership | null;
    operationId: number;
    kind: "purchase" | "sale";
    status?: "pending" | "owner-review";
    ownerAcceptedTermsVersion?: number | null;
    requestedByUserId: string;
    narrativeNote: string;
    transactionOverride?: boolean;
    transactionOverrideReason?: string;
    lines: readonly {
      offeringId?: number | null;
      itemId: number;
      itemInstanceId?: number | null;
      fulfillmentKind: "inventory-transfer" | "service-narrative";
      quantity: number;
      quotedUnitPriceCredits: number;
      currentUnitPriceCredits?: number;
      itemCanonicalIdSnapshot: string;
      itemNameSnapshot: string;
    }[];
  },
): Promise<number> {
  const [created] = await tx.insert(shopTransactionRequest).values({
    campaignId: input.campaignId,
    shopId: input.shopId,
    characterId: input.characterId,
    visitId: input.visit?.visitId ?? null,
    visitMemberId: input.visit?.memberId ?? null,
    originOperationId: input.operationId,
    kind: input.kind,
    status: input.status ?? "pending",
    ownerAcceptedTermsVersion: input.ownerAcceptedTermsVersion ?? null,
    requestedByUserId: input.requestedByUserId,
    narrativeNote: input.narrativeNote,
    transactionOverride: input.transactionOverride ?? false,
    transactionOverrideReason: input.transactionOverrideReason ?? "",
  }).returning({ id: shopTransactionRequest.id });
  if (!created) throw new Error("The transaction request could not be recorded.");
  await tx.insert(shopTransactionRequestLine).values(input.lines.map((line, sortOrder) => ({
    requestId: created.id,
    offeringId: line.offeringId ?? null,
    itemId: line.itemId,
    itemInstanceId: line.itemInstanceId ?? null,
    fulfillmentKind: line.fulfillmentKind,
    quantity: line.quantity,
    quotedUnitPriceCredits: line.quotedUnitPriceCredits,
    currentUnitPriceCredits: line.currentUnitPriceCredits ?? line.quotedUnitPriceCredits,
    itemCanonicalIdSnapshot: line.itemCanonicalIdSnapshot,
    itemNameSnapshot: line.itemNameSnapshot,
    sortOrder,
  })));
  return created.id;
}

async function requestIdForOriginOperation(
  tx: ShopCommerceTransaction,
  operationId: number,
): Promise<number | null> {
  const [request] = await tx.select({ id: shopTransactionRequest.id })
    .from(shopTransactionRequest)
    .where(eq(shopTransactionRequest.originOperationId, operationId))
    .limit(1);
  return request?.id ?? null;
}

async function addStackOwnership(
  tx: ShopCommerceTransaction,
  characterId: number,
  itemId: number,
  quantity: number,
  unitCostCredits: number,
): Promise<void> {
  const [existing] = await tx.select({
    quantity: campaignCharacterItem.quantity,
    unitCostCredits: campaignCharacterItem.unitCostCredits,
  }).from(campaignCharacterItem).where(and(
    eq(campaignCharacterItem.characterId, characterId),
    eq(campaignCharacterItem.itemId, itemId),
  )).limit(1).for("update");
  if (!existing) {
    await tx.insert(campaignCharacterItem).values({ characterId, itemId, quantity, unitCostCredits });
    return;
  }
  const nextQuantity = existing.quantity + quantity;
  const weightedCost = moneyAmount(
    ((existing.quantity * existing.unitCostCredits) + (quantity * unitCostCredits)) / nextQuantity,
    "Item acquisition cost",
  );
  await tx.update(campaignCharacterItem).set({
    quantity: nextQuantity,
    unitCostCredits: weightedCost,
  }).where(and(
    eq(campaignCharacterItem.characterId, characterId),
    eq(campaignCharacterItem.itemId, itemId),
  ));
}

async function createOwnedInstance(
  tx: ShopCommerceTransaction,
  input: {
    characterId: number;
    definition: ItemDefinition;
    unitCostCredits: number;
    currentCharges?: number;
    provenanceSourceInstanceId?: number | null;
  },
): Promise<number> {
  const [created] = await tx.insert(campaignCharacterItemInstance).values({
    characterId: input.characterId,
    itemId: input.definition.id,
    currentCharges: input.currentCharges ?? getStartingItemInstanceCharges(
      runtimeProfile(input.definition),
      input.definition.isFirearm,
    ),
    unitCostCredits: input.unitCostCredits,
    provenanceSourceInstanceId: input.provenanceSourceInstanceId ?? null,
  }).returning({ id: campaignCharacterItemInstance.id });
  if (!created) throw new Error("The purchased Item copy could not be created.");
  return created.id;
}

async function copyFirearmRuntimeState(
  tx: ShopCommerceTransaction,
  input: {
    sourceInstanceId: number;
    acquiredInstanceId: number;
    campaignId: number;
    characterId: number;
    actorUserId: string;
    provenanceKey: string;
  },
): Promise<void> {
  const [source] = await tx.select().from(campaignCharacterFirearmState)
    .where(eq(campaignCharacterFirearmState.itemInstanceId, input.sourceInstanceId))
    .limit(1)
    .for("update");
  if (!source) return;
  await tx.insert(campaignCharacterFirearmState).values({
    itemInstanceId: input.acquiredInstanceId,
    campaignId: input.campaignId,
    characterId: input.characterId,
    itemId: source.itemId,
    weaponProfileId: source.weaponProfileId,
    selectedFiringModeId: source.selectedFiringModeId,
    loadedAmmunitionItemId: source.loadedAmmunitionItemId,
    loadedAmmunitionProfileId: source.loadedAmmunitionProfileId,
    loadedAmmunitionUnitCostCredits: source.loadedAmmunitionUnitCostCredits,
    loadedRounds: source.loadedRounds,
    capacityRounds: source.capacityRounds,
    capacitySource: source.capacitySource,
    readinessMode: source.readinessMode,
    readinessModeSource: source.readinessModeSource,
    readied: source.readied,
    requiresCycling: source.requiresCycling,
    requiresRecoilRecovery: source.requiresRecoilRecovery,
    version: 1,
    initializationKey: input.provenanceKey,
    initializedByUserId: input.actorUserId,
    updatedByUserId: input.actorUserId,
  });
}

async function acquireExactCopy(
  tx: ShopCommerceTransaction,
  input: {
    campaignId: number;
    shopId: number;
    characterId: number;
    transactionId: number;
    definition: ItemDefinition;
    unitPriceCredits: number;
    actorUserId: string;
  },
): Promise<{ acquiredInstanceId: number; sourceInstanceId: number | null }> {
  const [resale] = await tx.select().from(shopResaleItemInstance).where(and(
    eq(shopResaleItemInstance.campaignId, input.campaignId),
    eq(shopResaleItemInstance.shopId, input.shopId),
    eq(shopResaleItemInstance.itemId, input.definition.id),
    eq(shopResaleItemInstance.status, "in-stock"),
  )).orderBy(asc(shopResaleItemInstance.id)).limit(1).for("update", { skipLocked: true });
  if (!resale) {
    return {
      acquiredInstanceId: await createOwnedInstance(tx, {
        characterId: input.characterId,
        definition: input.definition,
        unitCostCredits: input.unitPriceCredits,
      }),
      sourceInstanceId: null,
    };
  }
  const acquiredInstanceId = await createOwnedInstance(tx, {
    characterId: input.characterId,
    definition: input.definition,
    unitCostCredits: input.unitPriceCredits,
    currentCharges: resale.currentCharges,
    provenanceSourceInstanceId: resale.sourceItemInstanceId,
  });
  await copyFirearmRuntimeState(tx, {
    sourceInstanceId: resale.sourceItemInstanceId,
    acquiredInstanceId,
    campaignId: input.campaignId,
    characterId: input.characterId,
    actorUserId: input.actorUserId,
    provenanceKey: `shop-resale:${resale.id}:${input.transactionId}:${acquiredInstanceId}`,
  });
  await tx.update(shopResaleItemInstance).set({
    status: "sold",
    soldTransactionId: input.transactionId,
    updatedAt: new Date(),
  }).where(and(
    eq(shopResaleItemInstance.id, resale.id),
    eq(shopResaleItemInstance.status, "in-stock"),
  ));
  return { acquiredInstanceId, sourceInstanceId: resale.sourceItemInstanceId };
}

async function removeSoldOwnership(
  tx: ShopCommerceTransaction,
  input: {
    context: LockedCommerceContext;
    transactionId: number;
    actorUserId: string;
    lines: readonly (typeof shopTransactionRequestLine.$inferSelect)[];
    definitions: Map<number, ItemDefinition>;
  },
): Promise<Map<number, unknown>> {
  const currentStacks = await tx.select({
    itemId: campaignCharacterItem.itemId,
    quantity: campaignCharacterItem.quantity,
  }).from(campaignCharacterItem)
    .where(eq(campaignCharacterItem.characterId, input.context.characterId))
    .orderBy(asc(campaignCharacterItem.itemId))
    .for("update");
  const soldStackQuantities = new Map<number, number>();
  const instanceIds: number[] = [];
  for (const line of input.lines) {
    if (line.itemInstanceId === null) {
      soldStackQuantities.set(line.itemId, (soldStackQuantities.get(line.itemId) ?? 0) + line.quantity);
    } else {
      instanceIds.push(line.itemInstanceId);
    }
  }
  const nextStacks = currentStacks.map((entry) => ({
    itemId: entry.itemId,
    quantity: entry.quantity - (soldStackQuantities.get(entry.itemId) ?? 0),
  }));
  if (nextStacks.some(({ quantity }) => quantity < 0)) {
    throw new Error("The Character no longer owns the requested sale quantity.");
  }
  await validateEquipmentOwnershipMutationInTransaction(tx, {
    characterId: input.context.characterId,
    nextStackQuantities: nextStacks,
    removedInstanceIds: instanceIds,
  });
  for (const [itemId, soldQuantity] of soldStackQuantities) {
    const current = currentStacks.find((entry) => entry.itemId === itemId);
    if (!current || current.quantity < soldQuantity) {
      throw new Error("The Character no longer owns the requested sale quantity.");
    }
    if (current.quantity === soldQuantity) {
      await tx.delete(campaignCharacterItem).where(and(
        eq(campaignCharacterItem.characterId, input.context.characterId),
        eq(campaignCharacterItem.itemId, itemId),
      ));
    } else {
      await tx.update(campaignCharacterItem).set({ quantity: current.quantity - soldQuantity })
        .where(and(
          eq(campaignCharacterItem.characterId, input.context.characterId),
          eq(campaignCharacterItem.itemId, itemId),
        ));
    }
  }
  const ownershipSnapshots = new Map<number, unknown>();
  if (instanceIds.length) {
    const instances = await tx.select().from(campaignCharacterItemInstance).where(and(
      eq(campaignCharacterItemInstance.characterId, input.context.characterId),
      inArray(campaignCharacterItemInstance.id, instanceIds),
      isNull(campaignCharacterItemInstance.retiredAt),
    )).orderBy(asc(campaignCharacterItemInstance.id)).for("update");
    if (instances.length !== instanceIds.length) throw new Error("An exact Item copy is no longer owned by this Character.");
    const firearmStates = await tx.select().from(campaignCharacterFirearmState)
      .where(inArray(campaignCharacterFirearmState.itemInstanceId, instanceIds));
    const firearmByInstance = new Map(firearmStates.map((state) => [state.itemInstanceId, state]));
    for (const instance of instances) {
      const firearmState = firearmByInstance.get(instance.id) ?? null;
      const stateSnapshot = {
        currentCharges: instance.currentCharges,
        equipmentState: instance.equipmentState,
        unitCostCredits: instance.unitCostCredits,
        firearmState,
      };
      ownershipSnapshots.set(instance.id, stateSnapshot);
      await tx.update(campaignCharacterItemInstance).set({
        retiredAt: new Date(),
        retirementReason: `Sold in Shop transaction #${input.transactionId}.`,
        updatedAt: new Date(),
      }).where(and(
        eq(campaignCharacterItemInstance.id, instance.id),
        isNull(campaignCharacterItemInstance.retiredAt),
      ));
      if (input.context.soldItemHandling === "add-to-shop-stock") {
        await tx.insert(shopResaleItemInstance).values({
          campaignId: input.context.campaignId,
          shopId: input.context.shopId,
          itemId: instance.itemId,
          sourceCharacterId: input.context.characterId,
          sourceItemInstanceId: instance.id,
          acquiredTransactionId: input.transactionId,
          currentCharges: instance.currentCharges,
          stateSnapshotJson: stateSnapshot,
        });
      }
    }
  }
  await reconcileEquipmentAfterOwnershipMutationInTransaction(tx, input.context.characterId);
  return ownershipSnapshots;
}

async function ensureRestockListings(
  tx: ShopCommerceTransaction,
  context: LockedCommerceContext,
  lines: readonly (typeof shopTransactionRequestLine.$inferSelect)[],
): Promise<Map<number, number>> {
  const quantityByItem = new Map<number, number>();
  for (const line of lines) quantityByItem.set(line.itemId, (quantityByItem.get(line.itemId) ?? 0) + line.quantity);
  const itemIds = [...quantityByItem.keys()].sort((left, right) => left - right);
  const existing = itemIds.length ? await tx.select().from(shopOffering).where(and(
    eq(shopOffering.shopId, context.shopId),
    eq(shopOffering.campaignId, context.campaignId),
    inArray(shopOffering.itemId, itemIds),
  )).orderBy(asc(shopOffering.id)).for("update") : [];
  const byItem = new Map(existing.map((entry) => [entry.itemId, entry]));
  const offeringIds = new Map<number, number>();
  for (const itemId of itemIds) {
    const quantity = quantityByItem.get(itemId)!;
    const current = byItem.get(itemId);
    if (current) {
      offeringIds.set(itemId, current.id);
      if (!current.unlimitedStock) {
        await tx.update(shopOffering).set({
          limitedQuantity: (current.limitedQuantity ?? 0) + quantity,
          version: current.version + 1,
          updatedAt: new Date(),
        }).where(and(eq(shopOffering.id, current.id), eq(shopOffering.version, current.version)));
      }
      continue;
    }
    const [maximum] = await tx.select({ value: sql<number>`coalesce(max(${shopOffering.sortOrder}), -1)` })
      .from(shopOffering).where(eq(shopOffering.shopId, context.shopId));
    const [created] = await tx.insert(shopOffering).values({
      shopId: context.shopId,
      campaignId: context.campaignId,
      itemId,
      fulfillmentKind: "inventory-transfer",
      enabled: true,
      unlimitedStock: false,
      limitedQuantity: quantity,
      sortOrder: Number(maximum?.value ?? -1) + 1,
      shopNote: "Created from an approved Character sale.",
    }).returning({ id: shopOffering.id });
    if (!created) throw new Error("The restocked Shop Offering could not be created.");
    offeringIds.set(itemId, created.id);
  }
  return offeringIds;
}

async function lockPurchaseOfferings(
  tx: ShopCommerceTransaction,
  context: LockedCommerceContext,
  lines: readonly (typeof shopTransactionRequestLine.$inferSelect)[],
) {
  const offeringIds = [...new Set(lines.map(({ offeringId }) => offeringId).filter((id): id is number => id !== null))]
    .sort((left, right) => left - right);
  const offerings = offeringIds.length ? await tx.select({
    id: shopOffering.id,
    itemId: shopOffering.itemId,
    fulfillmentKind: shopOffering.fulfillmentKind,
    enabled: shopOffering.enabled,
    unlimitedStock: shopOffering.unlimitedStock,
    limitedQuantity: shopOffering.limitedQuantity,
    sellingPriceOverrideCredits: shopOffering.sellingPriceOverrideCredits,
    version: shopOffering.version,
    canonicalPriceCredits: item.credits,
    itemArchivedAt: item.archivedAt,
    campaignAuthorizationItemId: campaignInventoryItem.itemId,
  }).from(shopOffering)
    .innerJoin(item, eq(item.id, shopOffering.itemId))
    .leftJoin(campaignInventoryItem, and(
      eq(campaignInventoryItem.campaignId, shopOffering.campaignId),
      eq(campaignInventoryItem.itemId, shopOffering.itemId),
    ))
    .where(and(
      eq(shopOffering.shopId, context.shopId),
      eq(shopOffering.campaignId, context.campaignId),
      inArray(shopOffering.id, offeringIds),
    )).orderBy(asc(shopOffering.id)).for("update", { of: shopOffering }) : [];
  if (offerings.length !== offeringIds.length) throw new Error("A requested Shop Offering is no longer available.");
  for (const offering of offerings) {
    if (!offering.enabled || offering.itemArchivedAt || offering.campaignAuthorizationItemId === null) {
      throw new Error("A requested Shop Offering is no longer active and Campaign-authorized.");
    }
    const price = offering.sellingPriceOverrideCredits ?? offering.canonicalPriceCredits;
    if (price === null) throw new Error("A requested Shop Offering does not have a purchase price.");
    moneyAmount(price, "Offering price");
  }
  return offerings;
}

function currentOfferingPrice(offering: Awaited<ReturnType<typeof lockPurchaseOfferings>>[number]): number {
  const price = offering.sellingPriceOverrideCredits ?? offering.canonicalPriceCredits;
  if (price === null) throw new Error("A requested Shop Offering does not have a purchase price.");
  return moneyAmount(price, "Offering price");
}

async function refreshPurchaseTerms(
  tx: ShopCommerceTransaction,
  request: typeof shopTransactionRequest.$inferSelect,
  lines: readonly (typeof shopTransactionRequestLine.$inferSelect)[],
  context: LockedCommerceContext,
): Promise<{ changed: boolean; termsVersion: number }> {
  const offerings = await lockPurchaseOfferings(tx, context, lines);
  const byId = new Map(offerings.map((entry) => [entry.id, entry]));
  const changes = lines.flatMap((line) => {
    const offering = line.offeringId === null ? null : byId.get(line.offeringId);
    if (!offering || offering.itemId !== line.itemId) throw new Error("A requested Shop Offering no longer matches its Item.");
    const price = currentOfferingPrice(offering);
    const fulfillmentKind = offering.fulfillmentKind === "service-narrative"
      ? "service-narrative" as const
      : "inventory-transfer" as const;
    return Math.abs(price - line.currentUnitPriceCredits) > MONEY_EPSILON
      || fulfillmentKind !== line.fulfillmentKind
      ? [{ line, price, fulfillmentKind }]
      : [];
  });
  if (!changes.length) return { changed: false, termsVersion: request.termsVersion };
  const termsVersion = request.termsVersion + 1;
  for (const change of changes) {
    await tx.update(shopTransactionRequestLine).set({
      currentUnitPriceCredits: change.price,
      fulfillmentKind: change.fulfillmentKind,
    })
      .where(eq(shopTransactionRequestLine.id, change.line.id));
  }
  await tx.update(shopTransactionRequest).set({
    termsVersion,
    status: "owner-review",
    ownerAcceptedTermsVersion: null,
    godApprovedTermsVersion: null,
    updatedAt: new Date(),
  }).where(eq(shopTransactionRequest.id, request.id));
  return { changed: true, termsVersion };
}

async function executeRequest(
  tx: ShopCommerceTransaction,
  input: {
    request: typeof shopTransactionRequest.$inferSelect;
    context: LockedCommerceContext;
    currency: Awaited<ReturnType<typeof loadCurrencySnapshot>>;
    operationId: number;
    actorUserId: string;
  },
): Promise<number> {
  if (input.request.status === "completed") {
    const [existing] = await tx.select({ id: shopTransaction.id })
      .from(shopTransaction).where(eq(shopTransaction.requestId, input.request.id)).limit(1);
    if (!existing) throw new Error("Completed request history is incomplete.");
    return existing.id;
  }
  if (input.request.status === "rejected" || input.request.status === "cancelled") {
    throw new Error("This transaction request is no longer open.");
  }
  assertActiveCommerceContext(input.context);
  await assertNormalExecutionEligibility(tx, input.request, input.context);
  const lines = await tx.select().from(shopTransactionRequestLine)
    .where(eq(shopTransactionRequestLine.requestId, input.request.id))
    .orderBy(asc(shopTransactionRequestLine.sortOrder), asc(shopTransactionRequestLine.id))
    .for("update");
  if (!lines.length) throw new Error("The transaction request has no Items or services.");
  const definitions = await loadItemDefinitions(tx, input.context.campaignId, [...new Set(lines.map(({ itemId }) => itemId))]);
  if (definitions.size !== new Set(lines.map(({ itemId }) => itemId)).size || [...definitions.values()].some(({ archivedAt }) => archivedAt)) {
    throw new Error("A requested Item is archived, unavailable, or no longer authorized by this Campaign.");
  }
  let purchaseOfferings: Awaited<ReturnType<typeof lockPurchaseOfferings>> = [];
  if (input.request.kind === "purchase") {
    purchaseOfferings = await lockPurchaseOfferings(tx, input.context, lines);
    const offeringById = new Map(purchaseOfferings.map((entry) => [entry.id, entry]));
    for (const line of lines) {
      const offering = line.offeringId === null ? null : offeringById.get(line.offeringId);
      if (!offering || offering.itemId !== line.itemId) throw new Error("A requested Shop Offering is no longer available.");
      if (Math.abs(currentOfferingPrice(offering) - line.currentUnitPriceCredits) > MONEY_EPSILON) {
        throw new Error("The purchase price changed and must be reviewed before charging the Character.");
      }
    }
    const quantityByOffering = new Map<number, number>();
    for (const line of lines) quantityByOffering.set(line.offeringId!, (quantityByOffering.get(line.offeringId!) ?? 0) + line.quantity);
    for (const offering of purchaseOfferings) {
      const quantity = quantityByOffering.get(offering.id) ?? 0;
      if (!offering.unlimitedStock && (offering.limitedQuantity ?? 0) < quantity) {
        throw new Error("The Shop no longer has enough stock to complete this purchase.");
      }
    }
  }
  const totalCredits = moneyAmount(lines.reduce(
    (total, line) => total + line.quantity * line.currentUnitPriceCredits,
    0,
  ), "Transaction total");
  const [transaction] = await tx.insert(shopTransaction).values({
    requestId: input.request.id,
    executionOperationId: input.operationId,
    campaignId: input.context.campaignId,
    shopId: input.context.shopId,
    characterId: input.context.characterId,
    kind: input.request.kind,
    totalCredits,
    currencySystemSnapshot: input.currency.currencySystem,
    currencySnapshotJson: currencyJson(input.currency),
    policySnapshotJson: {
      characterPurchaseMode: input.context.characterPurchaseMode,
      soldItemHandling: input.context.soldItemHandling,
      changedSaleConfirmationMode: input.context.changedSaleConfirmationMode,
    },
    narrativeNote: input.request.narrativeNote,
    transactionOverride: input.request.transactionOverride,
    transactionOverrideReason: input.request.transactionOverrideReason,
    completedByUserId: input.actorUserId,
  }).returning({ id: shopTransaction.id });
  if (!transaction) throw new Error("The completed Shop transaction could not be recorded.");
  const moneyReason = input.request.narrativeNote || `${input.request.kind === "purchase" ? "Purchase from" : "Sale to"} ${input.context.shopName}.`;
  if (input.request.kind === "purchase") {
    await writeCharacterMoneyEvent(tx, {
      operationId: input.operationId,
      transactionId: transaction.id,
      campaignId: input.context.campaignId,
      characterId: input.context.characterId,
      shopId: input.context.shopId,
      kind: "purchase-character-debit",
      amountCredits: totalCredits,
      reason: moneyReason,
      actorUserId: input.actorUserId,
      currency: input.currency,
    });
    await writeShopMoneyEvent(tx, {
      operationId: input.operationId,
      transactionId: transaction.id,
      campaignId: input.context.campaignId,
      characterId: input.context.characterId,
      shopId: input.context.shopId,
      kind: "purchase-shop-credit",
      amountCredits: totalCredits,
      reason: moneyReason,
      actorUserId: input.actorUserId,
      currency: input.currency,
    });
    const quantityByOffering = new Map<number, number>();
    for (const line of lines) quantityByOffering.set(line.offeringId!, (quantityByOffering.get(line.offeringId!) ?? 0) + line.quantity);
    for (const offering of purchaseOfferings) {
      if (!offering.unlimitedStock) {
        const quantity = quantityByOffering.get(offering.id) ?? 0;
        const changed = await tx.update(shopOffering).set({
          limitedQuantity: (offering.limitedQuantity ?? 0) - quantity,
          version: offering.version + 1,
          updatedAt: new Date(),
        }).where(and(
          eq(shopOffering.id, offering.id),
          eq(shopOffering.version, offering.version),
          sql`${shopOffering.limitedQuantity} >= ${quantity}`,
        )).returning({ id: shopOffering.id });
        if (changed.length !== 1) throw new Error("Shop stock changed before this purchase could complete.");
      }
    }
    for (const line of lines) {
      const definition = definitions.get(line.itemId)!;
      let acquiredItemInstanceId: number | null = null;
      let sourceItemInstanceId: number | null = null;
      let ownershipSnapshot: unknown = {};
      if (line.fulfillmentKind === "inventory-transfer") {
        if (ownershipStrategy(definition) === "stack") {
          await addStackOwnership(tx, input.context.characterId, line.itemId, line.quantity, line.currentUnitPriceCredits);
          ownershipSnapshot = { strategy: "stack", quantity: line.quantity };
        } else {
          if (line.quantity !== 1) throw new Error("Exact Item copies must be fulfilled one at a time.");
          const acquired = await acquireExactCopy(tx, {
            campaignId: input.context.campaignId,
            shopId: input.context.shopId,
            characterId: input.context.characterId,
            transactionId: transaction.id,
            definition,
            unitPriceCredits: line.currentUnitPriceCredits,
            actorUserId: input.actorUserId,
          });
          acquiredItemInstanceId = acquired.acquiredInstanceId;
          sourceItemInstanceId = acquired.sourceInstanceId;
          ownershipSnapshot = { strategy: "instance", acquiredItemInstanceId, sourceItemInstanceId };
        }
      } else {
        ownershipSnapshot = { strategy: "service", narrativeNote: input.request.narrativeNote };
      }
      await tx.insert(shopTransactionLine).values({
        transactionId: transaction.id,
        requestLineId: line.id,
        offeringId: line.offeringId,
        itemId: line.itemId,
        sourceItemInstanceId,
        acquiredItemInstanceId,
        fulfillmentKind: line.fulfillmentKind,
        quantity: line.quantity,
        unitPriceCredits: line.currentUnitPriceCredits,
        totalCredits: moneyAmount(line.quantity * line.currentUnitPriceCredits, "Line total"),
        itemCanonicalIdSnapshot: line.itemCanonicalIdSnapshot,
        itemNameSnapshot: line.itemNameSnapshot,
        ownershipSnapshotJson: ownershipSnapshot,
        sortOrder: line.sortOrder,
      });
    }
  } else {
    await writeShopMoneyEvent(tx, {
      operationId: input.operationId,
      transactionId: transaction.id,
      campaignId: input.context.campaignId,
      characterId: input.context.characterId,
      shopId: input.context.shopId,
      kind: "sale-shop-debit",
      amountCredits: totalCredits,
      reason: moneyReason,
      actorUserId: input.actorUserId,
      currency: input.currency,
    });
    await writeCharacterMoneyEvent(tx, {
      operationId: input.operationId,
      transactionId: transaction.id,
      campaignId: input.context.campaignId,
      characterId: input.context.characterId,
      shopId: input.context.shopId,
      kind: "sale-character-credit",
      amountCredits: totalCredits,
      reason: moneyReason,
      actorUserId: input.actorUserId,
      currency: input.currency,
    });
    const snapshots = await removeSoldOwnership(tx, {
      context: input.context,
      transactionId: transaction.id,
      actorUserId: input.actorUserId,
      lines,
      definitions,
    });
    const restockedOfferingIds = input.context.soldItemHandling === "add-to-shop-stock"
      ? await ensureRestockListings(tx, input.context, lines)
      : new Map<number, number>();
    for (const line of lines) {
      await tx.insert(shopTransactionLine).values({
        transactionId: transaction.id,
        requestLineId: line.id,
        offeringId: restockedOfferingIds.get(line.itemId) ?? line.offeringId,
        itemId: line.itemId,
        sourceItemInstanceId: line.itemInstanceId,
        acquiredItemInstanceId: null,
        fulfillmentKind: "inventory-transfer",
        quantity: line.quantity,
        unitPriceCredits: line.currentUnitPriceCredits,
        totalCredits: moneyAmount(line.quantity * line.currentUnitPriceCredits, "Line total"),
        itemCanonicalIdSnapshot: line.itemCanonicalIdSnapshot,
        itemNameSnapshot: line.itemNameSnapshot,
        ownershipSnapshotJson: line.itemInstanceId === null
          ? { strategy: "stack", quantity: line.quantity }
          : snapshots.get(line.itemInstanceId) ?? { strategy: "instance" },
        sortOrder: line.sortOrder,
      });
    }
  }
  const now = new Date();
  const finalized = await tx.update(shopTransactionRequest).set({
    status: "completed",
    ownerAcceptedTermsVersion: input.request.termsVersion,
    godApprovedTermsVersion: input.request.termsVersion,
    resolvedByUserId: input.actorUserId,
    resolvedAt: now,
    resolutionReason: "Completed.",
    updatedAt: now,
  }).where(and(
    eq(shopTransactionRequest.id, input.request.id),
    inArray(shopTransactionRequest.status, ["pending", "owner-review"]),
  )).returning({ id: shopTransactionRequest.id });
  if (finalized.length !== 1) throw new Error("The request changed before it could be finalized.");
  return transaction.id;
}

function normalizePurchaseLines(lines: readonly PurchaseLineInput[]) {
  if (!Array.isArray(lines) || !lines.length) throw new Error("Choose at least one Shop Offering.");
  if (lines.length > 100) throw new Error("A purchase can contain at most 100 selected offerings.");
  const selections = new Map<number, {
    offeringId: number;
    quantity: number;
    expectedOfferingVersion: number;
    quotedUnitPriceCredits: number;
    quotedFulfillmentKind: "inventory-transfer" | "service-narrative";
  }>();
  for (const line of lines) {
    const offeringId = positiveId(line.offeringId, "Shop Offering");
    const expectedOfferingVersion = nonnegativeVersion(line.expectedOfferingVersion, "Displayed Shop Offering version");
    const quotedUnitPriceCredits = moneyAmount(line.quotedUnitPriceCredits, "Displayed offering price");
    if (line.quotedFulfillmentKind !== "inventory-transfer" && line.quotedFulfillmentKind !== "service-narrative") {
      throw new Error("Displayed offering fulfillment is invalid.");
    }
    const existing = selections.get(offeringId);
    if (existing && (
      existing.expectedOfferingVersion !== expectedOfferingVersion
      || Math.abs(existing.quotedUnitPriceCredits - quotedUnitPriceCredits) > MONEY_EPSILON
      || existing.quotedFulfillmentKind !== line.quotedFulfillmentKind
    )) throw new Error("One Shop Offering cannot be submitted with conflicting displayed terms.");
    selections.set(offeringId, {
      offeringId,
      quantity: (existing?.quantity ?? 0) + positiveQuantity(line.quantity),
      expectedOfferingVersion,
      quotedUnitPriceCredits,
      quotedFulfillmentKind: line.quotedFulfillmentKind,
    });
  }
  return [...selections.values()]
    .sort((left, right) => left.offeringId - right.offeringId);
}

async function buildPurchaseRequestLines(
  tx: ShopCommerceTransaction,
  context: LockedCommerceContext,
  requested: ReturnType<typeof normalizePurchaseLines>,
) {
  const offerings = await tx.select({
    id: shopOffering.id,
    version: shopOffering.version,
    itemId: shopOffering.itemId,
    fulfillmentKind: shopOffering.fulfillmentKind,
    enabled: shopOffering.enabled,
    unlimitedStock: shopOffering.unlimitedStock,
    limitedQuantity: shopOffering.limitedQuantity,
    sellingPriceOverrideCredits: shopOffering.sellingPriceOverrideCredits,
    canonicalPriceCredits: item.credits,
    canonicalId: item.canonicalId,
    itemName: item.name,
    itemArchivedAt: item.archivedAt,
    authorizedItemId: campaignInventoryItem.itemId,
  }).from(shopOffering)
    .innerJoin(item, eq(item.id, shopOffering.itemId))
    .leftJoin(campaignInventoryItem, and(
      eq(campaignInventoryItem.campaignId, shopOffering.campaignId),
      eq(campaignInventoryItem.itemId, shopOffering.itemId),
    ))
    .where(and(
      eq(shopOffering.shopId, context.shopId),
      eq(shopOffering.campaignId, context.campaignId),
      inArray(shopOffering.id, requested.map(({ offeringId }) => offeringId)),
    )).orderBy(asc(shopOffering.id));
  if (offerings.length !== requested.length) throw new Error("A selected Shop Offering is unavailable.");
  const definitions = await loadItemDefinitions(tx, context.campaignId, offerings.map(({ itemId }) => itemId));
  const byId = new Map(offerings.map((entry) => [entry.id, entry]));
  const result: Array<{
    offeringId: number;
    itemId: number;
    fulfillmentKind: "inventory-transfer" | "service-narrative";
    quantity: number;
    quotedUnitPriceCredits: number;
    currentUnitPriceCredits: number;
    itemCanonicalIdSnapshot: string;
    itemNameSnapshot: string;
  }> = [];
  let termsChanged = false;
  for (const selected of requested) {
    const offering = byId.get(selected.offeringId);
    const definition = offering ? definitions.get(offering.itemId) : null;
    if (!offering || !definition || offering.itemArchivedAt || offering.authorizedItemId === null || !offering.enabled) {
      throw new Error("A selected Shop Offering is archived, disabled, or no longer Campaign-authorized.");
    }
    const unitPrice = offering.sellingPriceOverrideCredits ?? offering.canonicalPriceCredits;
    if (unitPrice === null) throw new Error(`${offering.itemName} does not have a purchase price.`);
    const price = moneyAmount(unitPrice, `${offering.itemName} price`);
    if (!offering.unlimitedStock && (offering.limitedQuantity ?? 0) < selected.quantity) {
      throw new Error(`${offering.itemName} does not have enough stock for that quantity.`);
    }
    const fulfillmentKind = offering.fulfillmentKind === "service-narrative"
      ? "service-narrative" as const
      : "inventory-transfer" as const;
    if (
      offering.version !== selected.expectedOfferingVersion
      || Math.abs(price - selected.quotedUnitPriceCredits) > MONEY_EPSILON
      || fulfillmentKind !== selected.quotedFulfillmentKind
    ) termsChanged = true;
    const splitExact = fulfillmentKind === "inventory-transfer" && ownershipStrategy(definition) === "instance";
    for (let index = 0; index < (splitExact ? selected.quantity : 1); index += 1) {
      result.push({
        offeringId: offering.id,
        itemId: offering.itemId,
        fulfillmentKind,
        quantity: splitExact ? 1 : selected.quantity,
        quotedUnitPriceCredits: selected.quotedUnitPriceCredits,
        currentUnitPriceCredits: price,
        itemCanonicalIdSnapshot: offering.canonicalId,
        itemNameSnapshot: offering.itemName,
      });
    }
  }
  return { lines: result, termsChanged };
}

export async function submitPlayerPurchaseInTransaction(
  tx: ShopCommerceTransaction,
  input: {
    visitId: number;
    characterId: number;
    lines: readonly PurchaseLineInput[];
    narrativeNote?: string;
    submissionKey: string;
  },
  playerUserId: string,
): Promise<{ requestId: number; transactionId: number | null; status: ShopCommerceRequestStatus }> {
  const requested = normalizePurchaseLines(input.lines);
  const narrativeNote = note(input.narrativeNote, "Narrative note");
  const visit = await lockActiveVisitMembership(tx, input.visitId, input.characterId);
  const context = await lockCommerceContext(tx, visit.campaignId, visit.shopId, visit.characterId);
  assertActiveCommerceContext(context);
  await assertPlayerAuthorization(tx, context, playerUserId);
  if (context.storefrontState !== "open") throw new Error("Normal purchases require an open Shop. A G.O.D. transaction override is separate from entry permission.");
  const operation = await claimOperation(tx, {
    campaignId: context.campaignId,
    actorUserId: playerUserId,
    submissionKey: input.submissionKey,
    kind: "submit-purchase",
    intent: { visitId: visit.visitId, characterId: context.characterId, requested, narrativeNote },
  });
  if (operation.reused) {
    const requestId = await requestIdForOriginOperation(tx, operation.id);
    if (!requestId) throw new Error("The original purchase submission is incomplete.");
    const [request] = await tx.select({ status: shopTransactionRequest.status }).from(shopTransactionRequest)
      .where(eq(shopTransactionRequest.id, requestId)).limit(1);
    const [transaction] = await tx.select({ id: shopTransaction.id }).from(shopTransaction)
      .where(eq(shopTransaction.requestId, requestId)).limit(1);
    return { requestId, transactionId: transaction?.id ?? null, status: request?.status as ShopCommerceRequestStatus };
  }
  const built = await buildPurchaseRequestLines(tx, context, requested);
  const requestId = await insertRequest(tx, {
    campaignId: context.campaignId,
    shopId: context.shopId,
    characterId: context.characterId,
    visit,
    operationId: operation.id,
    kind: "purchase",
    status: built.termsChanged ? "owner-review" : "pending",
    ownerAcceptedTermsVersion: built.termsChanged ? null : 1,
    requestedByUserId: playerUserId,
    narrativeNote,
    lines: built.lines,
  });
  if (built.termsChanged) {
    return { requestId, transactionId: null, status: "owner-review" };
  }
  if (context.characterPurchaseMode === "god-approval-required") {
    return { requestId, transactionId: null, status: "pending" };
  }
  const [request] = await tx.select().from(shopTransactionRequest)
    .where(eq(shopTransactionRequest.id, requestId)).limit(1).for("update");
  const currency = await loadCurrencySnapshot(tx, context.campaignId);
  const transactionId = await executeRequest(tx, {
    request,
    context,
    currency,
    operationId: operation.id,
    actorUserId: playerUserId,
  });
  return { requestId, transactionId, status: "completed" };
}

export async function completeGodOverridePurchaseInTransaction(
  tx: ShopCommerceTransaction,
  input: {
    campaignId: number;
    shopId: number;
    characterId: number;
    lines: readonly PurchaseLineInput[];
    narrativeNote?: string;
    overrideReason: string;
    submissionKey: string;
  },
  actor: ShopCommerceActor,
): Promise<{ requestId: number; transactionId: number }> {
  const requested = normalizePurchaseLines(input.lines);
  const narrativeNote = note(input.narrativeNote, "Narrative note");
  const overrideReason = note(input.overrideReason, "Transaction override reason", true);
  const context = await lockCommerceContext(tx, input.campaignId, input.shopId, input.characterId);
  assertActiveCommerceContext(context);
  assertGodOwner(actor, context.ownerUserId);
  const operation = await claimOperation(tx, {
    campaignId: context.campaignId,
    actorUserId: actor.userId,
    submissionKey: input.submissionKey,
    kind: "god-purchase",
    intent: { campaignId: context.campaignId, shopId: context.shopId, characterId: context.characterId, requested, narrativeNote, overrideReason },
  });
  if (operation.reused) {
    const requestId = await requestIdForOriginOperation(tx, operation.id);
    if (!requestId) throw new Error("The original G.O.D. purchase is incomplete.");
    const [transaction] = await tx.select({ id: shopTransaction.id }).from(shopTransaction)
      .where(eq(shopTransaction.requestId, requestId)).limit(1);
    if (!transaction) throw new Error("The original G.O.D. purchase did not complete.");
    return { requestId, transactionId: transaction.id };
  }
  const built = await buildPurchaseRequestLines(tx, context, requested);
  if (built.termsChanged) {
    throw new Error("Shop terms changed after this override was displayed. Review the refreshed price and fulfillment before confirming again.");
  }
  const requestId = await insertRequest(tx, {
    campaignId: context.campaignId,
    shopId: context.shopId,
    characterId: context.characterId,
    operationId: operation.id,
    kind: "purchase",
    ownerAcceptedTermsVersion: 1,
    requestedByUserId: actor.userId,
    narrativeNote,
    transactionOverride: true,
    transactionOverrideReason: overrideReason,
    lines: built.lines,
  });
  const [request] = await tx.select().from(shopTransactionRequest)
    .where(eq(shopTransactionRequest.id, requestId)).limit(1).for("update");
  const transactionId = await executeRequest(tx, {
    request,
    context,
    currency: await loadCurrencySnapshot(tx, context.campaignId),
    operationId: operation.id,
    actorUserId: actor.userId,
  });
  return { requestId, transactionId };
}

function normalizeSaleLines(lines: readonly SaleLineInput[]) {
  if (!Array.isArray(lines) || !lines.length) throw new Error("Choose at least one owned Item to sell.");
  if (lines.length > 100) throw new Error("A sale request can contain at most 100 selected entries.");
  const stackQuantities = new Map<number, number>();
  const instances = new Map<number, { itemId: number; quantity: number; itemInstanceId: number }>();
  for (const line of lines) {
    const itemId = positiveId(line.itemId, "Item");
    const quantity = positiveQuantity(line.quantity);
    if (line.itemInstanceId !== null && line.itemInstanceId !== undefined) {
      const itemInstanceId = positiveId(line.itemInstanceId, "Item copy");
      if (quantity !== 1) throw new Error("An exact Item copy must be sold one at a time.");
      if (instances.has(itemInstanceId)) throw new Error("An exact Item copy can only appear once in a sale request.");
      instances.set(itemInstanceId, { itemId, quantity, itemInstanceId });
    } else {
      stackQuantities.set(itemId, (stackQuantities.get(itemId) ?? 0) + quantity);
    }
  }
  return [
    ...[...stackQuantities].map(([itemId, quantity]) => ({ itemId, quantity, itemInstanceId: null })),
    ...instances.values(),
  ].sort((left, right) => left.itemId - right.itemId || (left.itemInstanceId ?? 0) - (right.itemInstanceId ?? 0));
}

async function buildSaleRequestLines(
  tx: ShopCommerceTransaction,
  context: LockedCommerceContext,
  requested: ReturnType<typeof normalizeSaleLines>,
) {
  const itemIds = [...new Set(requested.map(({ itemId }) => itemId))];
  const definitions = await loadItemDefinitions(tx, context.campaignId, itemIds);
  if (definitions.size !== itemIds.length || [...definitions.values()].some(({ archivedAt }) => archivedAt)) {
    throw new Error("Sale requests require active Items authorized by this Campaign.");
  }
  const offerings = await tx.select({
    id: shopOffering.id,
    itemId: shopOffering.itemId,
    buyingPriceOverrideCredits: shopOffering.buyingPriceOverrideCredits,
  }).from(shopOffering).where(and(
    eq(shopOffering.shopId, context.shopId),
    eq(shopOffering.campaignId, context.campaignId),
    inArray(shopOffering.itemId, itemIds),
  ));
  const offeringByItem = new Map(offerings.map((entry) => [entry.itemId, entry]));
  const stackRows = await tx.select({
    itemId: campaignCharacterItem.itemId,
    quantity: campaignCharacterItem.quantity,
  }).from(campaignCharacterItem).where(and(
    eq(campaignCharacterItem.characterId, context.characterId),
    inArray(campaignCharacterItem.itemId, itemIds),
  ));
  const stackByItem = new Map(stackRows.map((entry) => [entry.itemId, entry.quantity]));
  const instanceIds = requested.flatMap(({ itemInstanceId }) => itemInstanceId === null ? [] : [itemInstanceId]);
  const instanceRows = instanceIds.length ? await tx.select({
    id: campaignCharacterItemInstance.id,
    itemId: campaignCharacterItemInstance.itemId,
    equipmentState: campaignCharacterItemInstance.equipmentState,
  }).from(campaignCharacterItemInstance).where(and(
    eq(campaignCharacterItemInstance.characterId, context.characterId),
    inArray(campaignCharacterItemInstance.id, instanceIds),
    isNull(campaignCharacterItemInstance.retiredAt),
  )) : [];
  const instanceById = new Map(instanceRows.map((entry) => [entry.id, entry]));
  return requested.map((selected) => {
    const definition = definitions.get(selected.itemId)!;
    const strategy = ownershipStrategy(definition);
    if (selected.itemInstanceId === null) {
      if (strategy !== "stack") throw new Error(`${definition.name} is exact-copy owned; choose the specific copy to sell.`);
      if ((stackByItem.get(selected.itemId) ?? 0) < selected.quantity) {
        throw new Error(`The Character does not own ${selected.quantity} available ${definition.name}.`);
      }
    } else {
      const owned = instanceById.get(selected.itemInstanceId);
      if (strategy !== "instance" || !owned || owned.itemId !== selected.itemId) {
        throw new Error("The selected exact Item copy is not available to this Character.");
      }
      if (owned.equipmentState !== "inactive") {
        throw new Error(`Set ${definition.name} copy #${owned.id} to Inactive before offering it for sale.`);
      }
    }
    const offering = offeringByItem.get(selected.itemId) ?? null;
    const rawPrice = offering?.buyingPriceOverrideCredits ?? definition.credits;
    if (rawPrice === null) throw new Error(`${definition.name} has no catalog buying price for this sale request.`);
    return {
      offeringId: offering?.id ?? null,
      itemId: selected.itemId,
      itemInstanceId: selected.itemInstanceId,
      fulfillmentKind: "inventory-transfer" as const,
      quantity: selected.quantity,
      quotedUnitPriceCredits: moneyAmount(rawPrice, `${definition.name} buying price`),
      itemCanonicalIdSnapshot: definition.canonicalId,
      itemNameSnapshot: definition.name,
    };
  });
}

export async function submitPlayerSaleInTransaction(
  tx: ShopCommerceTransaction,
  input: {
    visitId: number;
    characterId: number;
    lines: readonly SaleLineInput[];
    narrativeNote?: string;
    submissionKey: string;
  },
  playerUserId: string,
): Promise<{ requestId: number; status: "pending" }> {
  const requested = normalizeSaleLines(input.lines);
  const narrativeNote = note(input.narrativeNote, "Narrative note");
  const visit = await lockActiveVisitMembership(tx, input.visitId, input.characterId);
  const context = await lockCommerceContext(tx, visit.campaignId, visit.shopId, visit.characterId);
  assertActiveCommerceContext(context);
  await assertPlayerAuthorization(tx, context, playerUserId);
  if (context.storefrontState !== "open") throw new Error("Normal sales require an open Shop. Entry permission is not a transaction override.");
  const operation = await claimOperation(tx, {
    campaignId: context.campaignId,
    actorUserId: playerUserId,
    submissionKey: input.submissionKey,
    kind: "submit-sale",
    intent: { visitId: visit.visitId, characterId: context.characterId, requested, narrativeNote },
  });
  if (operation.reused) {
    const requestId = await requestIdForOriginOperation(tx, operation.id);
    if (!requestId) throw new Error("The original sale submission is incomplete.");
    return { requestId, status: "pending" };
  }
  const requestId = await insertRequest(tx, {
    campaignId: context.campaignId,
    shopId: context.shopId,
    characterId: context.characterId,
    visit,
    operationId: operation.id,
    kind: "sale",
    ownerAcceptedTermsVersion: 1,
    requestedByUserId: playerUserId,
    narrativeNote,
    lines: await buildSaleRequestLines(tx, context, requested),
  });
  return { requestId, status: "pending" };
}

async function lockRequestWithLifecycle(
  tx: ShopCommerceTransaction,
  requestId: number,
): Promise<{
  request: typeof shopTransactionRequest.$inferSelect;
  visit: LockedVisitMembership | null;
}> {
  const [candidate] = await tx.select({
    id: shopTransactionRequest.id,
    visitId: shopTransactionRequest.visitId,
    characterId: shopTransactionRequest.characterId,
    status: shopTransactionRequest.status,
  }).from(shopTransactionRequest)
    .where(eq(shopTransactionRequest.id, positiveId(requestId, "Transaction request")))
    .limit(1);
  if (!candidate) throw new Error("Transaction request not found.");
  let visit: LockedVisitMembership | null = null;
  if (candidate.visitId !== null && (candidate.status === "pending" || candidate.status === "owner-review")) {
    visit = await lockActiveVisitMembership(tx, candidate.visitId, candidate.characterId);
  }
  const [request] = await tx.select().from(shopTransactionRequest)
    .where(eq(shopTransactionRequest.id, candidate.id)).limit(1).for("update");
  if (!request) throw new Error("Transaction request not found.");
  if (visit && (
    request.visitId !== visit.visitId
    || request.visitMemberId !== visit.memberId
    || request.campaignId !== visit.campaignId
    || request.shopId !== visit.shopId
    || request.characterId !== visit.characterId
  )) throw new Error("The transaction request no longer matches its Shop visit membership.");
  return { request, visit };
}

async function existingTransactionId(tx: ShopCommerceTransaction, requestId: number): Promise<number | null> {
  const [existing] = await tx.select({ id: shopTransaction.id }).from(shopTransaction)
    .where(eq(shopTransaction.requestId, requestId)).limit(1);
  return existing?.id ?? null;
}

export async function reviewShopRequestInTransaction(
  tx: ShopCommerceTransaction,
  input: {
    requestId: number;
    expectedTermsVersion: number;
    decision: "approve" | "reject";
    revisedLines?: readonly RevisedRequestLineInput[];
    reason?: string;
    submissionKey: string;
  },
  actor: ShopCommerceActor,
): Promise<{ requestId: number; transactionId: number | null; status: ShopCommerceRequestStatus }> {
  const locked = await lockRequestWithLifecycle(tx, input.requestId);
  const context = await lockCommerceContext(
    tx,
    locked.request.campaignId,
    locked.request.shopId,
    locked.request.characterId,
  );
  assertGodOwner(actor, context.ownerUserId);
  const reason = note(input.reason, input.decision === "reject" ? "Rejection reason" : "Review note", input.decision === "reject");
  const expectedTermsVersion = positiveId(input.expectedTermsVersion, "Displayed terms version");
  const revisedLines = input.revisedLines?.map((line) => ({
    requestLineId: positiveId(line.requestLineId, "Request line"),
    quantity: positiveQuantity(line.quantity),
    unitPriceCredits: moneyAmount(line.unitPriceCredits, "Final unit price"),
  })).sort((left, right) => left.requestLineId - right.requestLineId) ?? [];
  const operation = await claimOperation(tx, {
    campaignId: context.campaignId,
    actorUserId: actor.userId,
    submissionKey: input.submissionKey,
    kind: input.decision === "reject" ? "reject-request" : "approve-request",
    intent: { requestId: locked.request.id, expectedTermsVersion, decision: input.decision, revisedLines, reason },
  });
  if (operation.reused) {
    return {
      requestId: locked.request.id,
      transactionId: locked.request.status === "completed" ? await existingTransactionId(tx, locked.request.id) : null,
      status: locked.request.status as ShopCommerceRequestStatus,
    };
  }
  if (
    (locked.request.status === "pending" || locked.request.status === "owner-review")
    && locked.request.termsVersion !== expectedTermsVersion
  ) throw new Error("These Shop terms changed after they were displayed. Review the refreshed terms before deciding again.");
  if (locked.request.status === "completed") {
    return { requestId: locked.request.id, transactionId: await existingTransactionId(tx, locked.request.id), status: "completed" };
  }
  if (locked.request.status === "rejected" || locked.request.status === "cancelled") {
    if (operation.reused && input.decision === "reject" && locked.request.status === "rejected") {
      return { requestId: locked.request.id, transactionId: null, status: "rejected" };
    }
    throw new Error("This transaction request is no longer open.");
  }
  if (input.decision === "reject") {
    const now = new Date();
    await tx.update(shopTransactionRequest).set({
      status: "rejected",
      resolvedByUserId: actor.userId,
      resolvedAt: now,
      resolutionReason: reason,
      updatedAt: now,
    }).where(and(
      eq(shopTransactionRequest.id, locked.request.id),
      inArray(shopTransactionRequest.status, ["pending", "owner-review"]),
    ));
    return { requestId: locked.request.id, transactionId: null, status: "rejected" };
  }
  assertActiveCommerceContext(context);
  let request = locked.request;
  let lines = await tx.select().from(shopTransactionRequestLine)
    .where(eq(shopTransactionRequestLine.requestId, request.id))
    .orderBy(asc(shopTransactionRequestLine.sortOrder), asc(shopTransactionRequestLine.id))
    .for("update");
  if (request.kind === "purchase") {
    if (revisedLines.length) throw new Error("Purchase approvals use the current authoritative Shop prices; manual price revisions are only for Character sales.");
    const refreshed = await refreshPurchaseTerms(tx, request, lines, context);
    if (refreshed.changed) {
      return { requestId: request.id, transactionId: null, status: "owner-review" };
    }
  } else if (revisedLines.length) {
    if (revisedLines.length !== lines.length) throw new Error("Revised sale terms must include every request line exactly once.");
    const revisedById = new Map(revisedLines.map((line) => [line.requestLineId, line]));
    if (revisedById.size !== lines.length || lines.some(({ id }) => !revisedById.has(id))) {
      throw new Error("Revised sale terms do not match the current request lines.");
    }
    let changed = false;
    for (const line of lines) {
      const revised = revisedById.get(line.id)!;
      if (line.itemInstanceId !== null && revised.quantity !== 1) {
        throw new Error("An exact Item copy must remain a quantity of one.");
      }
      if (line.quantity !== revised.quantity || Math.abs(line.currentUnitPriceCredits - revised.unitPriceCredits) > MONEY_EPSILON) {
        changed = true;
        await tx.update(shopTransactionRequestLine).set({
          quantity: revised.quantity,
          currentUnitPriceCredits: revised.unitPriceCredits,
        }).where(eq(shopTransactionRequestLine.id, line.id));
      }
    }
    if (changed) {
      const nextVersion = request.termsVersion + 1;
      await tx.update(shopTransactionRequest).set({
        termsVersion: nextVersion,
        ownerAcceptedTermsVersion: context.changedSaleConfirmationMode === "god-approval-finalizes" ? nextVersion : null,
        godApprovedTermsVersion: nextVersion,
        status: context.changedSaleConfirmationMode === "character-owner-accepts" ? "owner-review" : "pending",
        updatedAt: new Date(),
      }).where(eq(shopTransactionRequest.id, request.id));
      const [updated] = await tx.select().from(shopTransactionRequest)
        .where(eq(shopTransactionRequest.id, request.id)).limit(1).for("update");
      request = updated;
      lines = await tx.select().from(shopTransactionRequestLine)
        .where(eq(shopTransactionRequestLine.requestId, request.id))
        .orderBy(asc(shopTransactionRequestLine.sortOrder), asc(shopTransactionRequestLine.id))
        .for("update");
      if (context.changedSaleConfirmationMode === "character-owner-accepts") {
        return { requestId: request.id, transactionId: null, status: "owner-review" };
      }
    }
  }
  if (request.godApprovedTermsVersion !== request.termsVersion) {
    await tx.update(shopTransactionRequest).set({
      godApprovedTermsVersion: request.termsVersion,
      updatedAt: new Date(),
    }).where(eq(shopTransactionRequest.id, request.id));
    request = { ...request, godApprovedTermsVersion: request.termsVersion };
  }
  if (request.ownerAcceptedTermsVersion !== request.termsVersion) {
    await tx.update(shopTransactionRequest).set({ status: "owner-review", updatedAt: new Date() })
      .where(eq(shopTransactionRequest.id, request.id));
    return { requestId: request.id, transactionId: null, status: "owner-review" };
  }
  const transactionId = await executeRequest(tx, {
    request,
    context,
    currency: await loadCurrencySnapshot(tx, context.campaignId),
    operationId: operation.id,
    actorUserId: actor.userId,
  });
  return { requestId: request.id, transactionId, status: "completed" };
}

export async function acceptShopRequestTermsInTransaction(
  tx: ShopCommerceTransaction,
  input: { requestId: number; expectedTermsVersion: number; submissionKey: string },
  playerUserId: string,
): Promise<{ requestId: number; transactionId: number | null; status: ShopCommerceRequestStatus }> {
  const locked = await lockRequestWithLifecycle(tx, input.requestId);
  const context = await lockCommerceContext(tx, locked.request.campaignId, locked.request.shopId, locked.request.characterId);
  await assertPlayerAuthorization(tx, context, playerUserId);
  const expectedTermsVersion = positiveId(input.expectedTermsVersion, "Displayed terms version");
  const operation = await claimOperation(tx, {
    campaignId: context.campaignId,
    actorUserId: playerUserId,
    submissionKey: input.submissionKey,
    kind: "accept-terms",
    intent: { requestId: locked.request.id, termsVersion: expectedTermsVersion },
  });
  if (operation.reused) {
    return {
      requestId: locked.request.id,
      transactionId: locked.request.status === "completed" ? await existingTransactionId(tx, locked.request.id) : null,
      status: locked.request.status as ShopCommerceRequestStatus,
    };
  }
  if (
    (locked.request.status === "pending" || locked.request.status === "owner-review")
    && locked.request.termsVersion !== expectedTermsVersion
  ) throw new Error("These Shop terms changed after they were displayed. Review the refreshed terms before accepting again.");
  if (locked.request.status === "completed") {
    return { requestId: locked.request.id, transactionId: await existingTransactionId(tx, locked.request.id), status: "completed" };
  }
  if (locked.request.status !== "owner-review") throw new Error("This request is not awaiting Character-owner acceptance.");
  assertActiveCommerceContext(context);
  let request = locked.request;
  const lines = await tx.select().from(shopTransactionRequestLine)
    .where(eq(shopTransactionRequestLine.requestId, request.id))
    .orderBy(asc(shopTransactionRequestLine.sortOrder), asc(shopTransactionRequestLine.id))
    .for("update");
  if (request.kind === "purchase") {
    const refreshed = await refreshPurchaseTerms(tx, request, lines, context);
    if (refreshed.changed) {
      return { requestId: request.id, transactionId: null, status: "owner-review" };
    }
  }
  const requiresGodApproval = request.kind === "sale"
    || context.characterPurchaseMode === "god-approval-required";
  await tx.update(shopTransactionRequest).set({
    ownerAcceptedTermsVersion: request.termsVersion,
    status: requiresGodApproval && request.godApprovedTermsVersion !== request.termsVersion
      ? "pending"
      : request.status,
    updatedAt: new Date(),
  }).where(eq(shopTransactionRequest.id, request.id));
  request = { ...request, ownerAcceptedTermsVersion: request.termsVersion };
  if (requiresGodApproval && request.godApprovedTermsVersion !== request.termsVersion) {
    return { requestId: request.id, transactionId: null, status: "pending" };
  }
  const transactionId = await executeRequest(tx, {
    request,
    context,
    currency: await loadCurrencySnapshot(tx, context.campaignId),
    operationId: operation.id,
    actorUserId: playerUserId,
  });
  return { requestId: request.id, transactionId, status: "completed" };
}

export async function cancelShopRequestInTransaction(
  tx: ShopCommerceTransaction,
  input: { requestId: number; submissionKey: string },
  actor: ShopCommerceActor,
): Promise<void> {
  const locked = await lockRequestWithLifecycle(tx, input.requestId);
  const context = await lockCommerceContext(tx, locked.request.campaignId, locked.request.shopId, locked.request.characterId);
  const isOwner = context.characterOwnerUserId === actor.userId;
  const isGodOwner = actor.roles.includes("god") && context.ownerUserId === actor.userId;
  if (!isOwner && !isGodOwner) throw new Error("You cannot cancel this Shop transaction request.");
  await claimOperation(tx, {
    campaignId: context.campaignId,
    actorUserId: actor.userId,
    submissionKey: input.submissionKey,
    kind: "cancel-request",
    intent: { requestId: locked.request.id },
  });
  if (locked.request.status === "cancelled") return;
  if (locked.request.status !== "pending" && locked.request.status !== "owner-review") {
    throw new Error("Only an unfinished Shop request can be cancelled.");
  }
  const now = new Date();
  await tx.update(shopTransactionRequest).set({
    status: "cancelled",
    resolvedByUserId: actor.userId,
    resolvedAt: now,
    resolutionReason: "Cancelled by an authorized participant.",
    updatedAt: now,
  }).where(eq(shopTransactionRequest.id, locked.request.id));
}

export async function cancelOpenShopRequestsForMembershipsInTransaction(
  tx: ShopCommerceTransaction,
  input: {
    visitId: number;
    memberIds?: readonly number[];
    actorUserId: string;
    reason: string;
  },
): Promise<number[]> {
  const conditions = [
    eq(shopTransactionRequest.visitId, positiveId(input.visitId, "Shop visit")),
    inArray(shopTransactionRequest.status, ["pending", "owner-review"]),
  ];
  if (input.memberIds) {
    if (!input.memberIds.length) return [];
    conditions.push(inArray(shopTransactionRequest.visitMemberId, input.memberIds.map((id) => positiveId(id, "Shop visit membership"))));
  }
  const requests = await tx.select({
    id: shopTransactionRequest.id,
    characterId: shopTransactionRequest.characterId,
  }).from(shopTransactionRequest).where(and(...conditions))
    .orderBy(asc(shopTransactionRequest.id)).for("update");
  if (!requests.length) return [];
  const now = new Date();
  await tx.update(shopTransactionRequest).set({
    status: "cancelled",
    resolvedByUserId: input.actorUserId,
    resolvedAt: now,
    resolutionReason: note(input.reason, "Cancellation reason", true),
    updatedAt: now,
  }).where(inArray(shopTransactionRequest.id, requests.map(({ id }) => id)));
  return [...new Set(requests.map(({ characterId }) => characterId))];
}

async function lockOwnedCharacterForMoney(
  tx: ShopCommerceTransaction,
  campaignId: number,
  characterId: number,
) {
  const currency = await loadCurrencySnapshot(tx, campaignId);
  const [characterRow] = await tx.select({
    id: campaignCharacter.id,
    campaignId: campaignCharacter.campaignId,
    name: campaignCharacter.name,
    archivedAt: campaignCharacter.archivedAt,
    isNpc: campaignCharacter.isNpc,
  }).from(campaignCharacter).where(and(
    eq(campaignCharacter.id, positiveId(characterId, "Character")),
    eq(campaignCharacter.campaignId, currency.id),
  )).limit(1).for("update");
  if (!characterRow) throw new Error("Character not found in this Campaign.");
  if (currency.archivedAt || characterRow.archivedAt) throw new Error("Archived Campaigns or Characters cannot receive money changes.");
  if (characterRow.isNpc) throw new Error("Money actions require a Player Character.");
  return { currency, character: characterRow };
}

export async function giveCharacterMoneyInTransaction(
  tx: ShopCommerceTransaction,
  input: {
    campaignId: number;
    characterId: number;
    amountCredits: number;
    reason: string;
    submissionKey: string;
  },
  actor: ShopCommerceActor,
): Promise<void> {
  const amountCredits = moneyAmount(input.amountCredits, "Grant amount", false);
  const reason = note(input.reason, "Grant reason", true);
  const context = await lockOwnedCharacterForMoney(tx, input.campaignId, input.characterId);
  assertGodOwner(actor, context.currency.ownerUserId);
  const operation = await claimOperation(tx, {
    campaignId: context.currency.id,
    actorUserId: actor.userId,
    submissionKey: input.submissionKey,
    kind: "give-money",
    intent: { campaignId: context.currency.id, characterId: context.character.id, amountCredits, reason },
  });
  if (operation.reused) return;
  await writeCharacterMoneyEvent(tx, {
    operationId: operation.id,
    campaignId: context.currency.id,
    characterId: context.character.id,
    kind: "grant-character-credit",
    amountCredits,
    reason,
    actorUserId: actor.userId,
    currency: context.currency,
  });
}

export async function correctCharacterBalanceInTransaction(
  tx: ShopCommerceTransaction,
  input: {
    campaignId: number;
    characterId: number;
    newBalanceCredits: number;
    reason: string;
    submissionKey: string;
  },
  actor: ShopCommerceActor,
): Promise<void> {
  const newBalanceCredits = moneyAmount(input.newBalanceCredits, "Corrected Character balance");
  const reason = note(input.reason, "Correction reason", true);
  const context = await lockOwnedCharacterForMoney(tx, input.campaignId, input.characterId);
  assertGodOwner(actor, context.currency.ownerUserId);
  const [profile] = await tx.select({ creditsRemaining: campaignCharacterProfile.creditsRemaining })
    .from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId, context.character.id))
    .limit(1).for("update");
  if (!profile) throw new Error("Character purse not found.");
  const delta = moneyAmount(Math.abs(newBalanceCredits - profile.creditsRemaining), "Correction amount")
    * Math.sign(newBalanceCredits - profile.creditsRemaining);
  const operation = await claimOperation(tx, {
    campaignId: context.currency.id,
    actorUserId: actor.userId,
    submissionKey: input.submissionKey,
    kind: "character-balance-correction",
    intent: { campaignId: context.currency.id, characterId: context.character.id, newBalanceCredits, reason },
  });
  if (operation.reused) return;
  await writeCharacterMoneyEvent(tx, {
    operationId: operation.id,
    campaignId: context.currency.id,
    characterId: context.character.id,
    kind: "character-balance-correction",
    amountCredits: delta,
    reason,
    actorUserId: actor.userId,
    currency: context.currency,
  });
}

export async function correctShopBalanceInTransaction(
  tx: ShopCommerceTransaction,
  input: {
    campaignId: number;
    shopId: number;
    newBalanceCredits: number;
    reason: string;
    submissionKey: string;
  },
  actor: ShopCommerceActor,
): Promise<void> {
  const newBalanceCredits = moneyAmount(input.newBalanceCredits, "Corrected Shop balance");
  const reason = note(input.reason, "Correction reason", true);
  const currency = await loadCurrencySnapshot(tx, input.campaignId);
  assertGodOwner(actor, currency.ownerUserId);
  if (currency.archivedAt) throw new Error("Archived Campaigns cannot receive Shop balance corrections.");
  const [shopRow] = await tx.select({
    id: shop.id,
    balanceCredits: shop.balanceCredits,
    archivedAt: shop.archivedAt,
  }).from(shop).where(and(
    eq(shop.id, positiveId(input.shopId, "Shop")),
    eq(shop.campaignId, currency.id),
  )).limit(1).for("update");
  if (!shopRow) throw new Error("Shop not found in this Campaign.");
  if (shopRow.archivedAt) throw new Error("Archived Shops cannot receive balance corrections.");
  const delta = moneyAmount(Math.abs(newBalanceCredits - shopRow.balanceCredits), "Correction amount")
    * Math.sign(newBalanceCredits - shopRow.balanceCredits);
  const operation = await claimOperation(tx, {
    campaignId: currency.id,
    actorUserId: actor.userId,
    submissionKey: input.submissionKey,
    kind: "shop-balance-correction",
    intent: { campaignId: currency.id, shopId: shopRow.id, newBalanceCredits, reason },
  });
  if (operation.reused) return;
  await writeShopMoneyEvent(tx, {
    operationId: operation.id,
    campaignId: currency.id,
    shopId: shopRow.id,
    kind: "shop-balance-correction",
    amountCredits: delta,
    reason,
    actorUserId: actor.userId,
    currency,
  });
}

export async function readShopCommerceInTransaction(
  tx: ShopCommerceTransaction,
  input: {
    campaignId: number;
    shopId: number;
    characterId: number;
    viewerUserId: string;
    godView: boolean;
  },
): Promise<ShopCommerceView> {
  const [root] = await tx.select({
    campaignId: campaign.id,
    campaignOwnerUserId: campaign.createdByUserId,
    campaignArchivedAt: campaign.archivedAt,
    currencySystem: campaign.currencySystem,
    shopId: shop.id,
    shopName: shop.name,
    shopArchivedAt: shop.archivedAt,
    shopBalanceCredits: shop.balanceCredits,
    characterPurchaseMode: shop.characterPurchaseMode,
    soldItemHandling: shop.soldItemHandling,
    changedSaleConfirmationMode: shop.changedSaleConfirmationMode,
    characterId: campaignCharacter.id,
    characterName: campaignCharacter.name,
    characterOwnerUserId: campaignCharacter.playerUserId,
    characterArchivedAt: campaignCharacter.archivedAt,
    isNpc: campaignCharacter.isNpc,
    characterBalanceCredits: campaignCharacterProfile.creditsRemaining,
  }).from(campaign)
    .innerJoin(shop, and(eq(shop.campaignId, campaign.id), eq(shop.id, positiveId(input.shopId, "Shop"))))
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.campaignId, campaign.id),
      eq(campaignCharacter.id, positiveId(input.characterId, "Character")),
    ))
    .innerJoin(campaignCharacterProfile, eq(campaignCharacterProfile.characterId, campaignCharacter.id))
    .where(eq(campaign.id, positiveId(input.campaignId, "Campaign")))
    .limit(1);
  if (!root) throw new Error("Shop and Character do not share one Campaign.");
  if (input.godView) {
    if (root.campaignOwnerUserId !== input.viewerUserId) throw new Error("Only the Campaign-owning G.O.D. can read private Shop transaction details.");
  } else {
    if (root.characterOwnerUserId !== input.viewerUserId) throw new Error("Players may read only their own Shop transaction details.");
    const [membership] = await tx.select({ userId: campaignPlayer.userId }).from(campaignPlayer).where(and(
      eq(campaignPlayer.campaignId, root.campaignId),
      eq(campaignPlayer.userId, input.viewerUserId),
    )).limit(1);
    if (!membership) throw new Error("You no longer have access to this Campaign.");
  }
  const currency = await loadCurrencySnapshot(tx, root.campaignId);
  const ownedStacks = await tx.select({
      itemId: campaignCharacterItem.itemId,
      canonicalId: item.canonicalId,
      name: item.name,
      category: item.category,
      quantity: campaignCharacterItem.quantity,
      canonicalPriceCredits: item.credits,
      buyingPriceOverrideCredits: shopOffering.buyingPriceOverrideCredits,
    }).from(campaignCharacterItem)
      .innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
      .innerJoin(campaignInventoryItem, and(
        eq(campaignInventoryItem.campaignId, root.campaignId),
        eq(campaignInventoryItem.itemId, campaignCharacterItem.itemId),
      ))
      .leftJoin(shopOffering, and(
        eq(shopOffering.shopId, root.shopId),
        eq(shopOffering.itemId, campaignCharacterItem.itemId),
      ))
      .where(and(
        eq(campaignCharacterItem.characterId, root.characterId),
        isNull(item.archivedAt),
      ))
      .orderBy(asc(item.name), asc(item.id));
  const ownedInstances = await tx.select({
      id: campaignCharacterItemInstance.id,
      itemId: campaignCharacterItemInstance.itemId,
      canonicalId: item.canonicalId,
      name: item.name,
      category: item.category,
      currentCharges: campaignCharacterItemInstance.currentCharges,
      equipmentState: campaignCharacterItemInstance.equipmentState,
      canonicalPriceCredits: item.credits,
      buyingPriceOverrideCredits: shopOffering.buyingPriceOverrideCredits,
    }).from(campaignCharacterItemInstance)
      .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
      .innerJoin(campaignInventoryItem, and(
        eq(campaignInventoryItem.campaignId, root.campaignId),
        eq(campaignInventoryItem.itemId, campaignCharacterItemInstance.itemId),
      ))
      .leftJoin(shopOffering, and(
        eq(shopOffering.shopId, root.shopId),
        eq(shopOffering.itemId, campaignCharacterItemInstance.itemId),
      ))
      .where(and(
        eq(campaignCharacterItemInstance.characterId, root.characterId),
        isNull(campaignCharacterItemInstance.retiredAt),
        isNull(item.archivedAt),
      ))
      .orderBy(asc(item.name), asc(campaignCharacterItemInstance.id));
  const requestRows = await tx.select().from(shopTransactionRequest).where(and(
      eq(shopTransactionRequest.shopId, root.shopId),
      eq(shopTransactionRequest.characterId, root.characterId),
    )).orderBy(desc(shopTransactionRequest.createdAt), desc(shopTransactionRequest.id)).limit(50);
  const historyRows = await tx.select().from(shopTransaction).where(and(
      eq(shopTransaction.shopId, root.shopId),
      eq(shopTransaction.characterId, root.characterId),
    )).orderBy(desc(shopTransaction.completedAt), desc(shopTransaction.id)).limit(30);
  const moneyRows = await tx.select({
      id: shopMoneyEvent.id,
      kind: shopMoneyEvent.kind,
      amountCredits: shopMoneyEvent.amountCredits,
      balanceBeforeCredits: shopMoneyEvent.balanceBeforeCredits,
      balanceAfterCredits: shopMoneyEvent.balanceAfterCredits,
      reason: shopMoneyEvent.reason,
      shopName: shop.name,
      actorName: user.name,
      createdAt: shopMoneyEvent.createdAt,
    }).from(shopMoneyEvent)
      .innerJoin(user, eq(user.id, shopMoneyEvent.actorUserId))
      .leftJoin(shop, eq(shop.id, shopMoneyEvent.shopId))
      .where(and(
        eq(shopMoneyEvent.campaignId, root.campaignId),
        eq(shopMoneyEvent.characterId, root.characterId),
        input.godView ? undefined : inArray(shopMoneyEvent.kind, [
          "purchase-character-debit",
          "sale-character-credit",
          "grant-character-credit",
          "character-balance-correction",
        ]),
      )).orderBy(desc(shopMoneyEvent.createdAt), desc(shopMoneyEvent.id)).limit(40);
  const requestIds = requestRows.map(({ id }) => id);
  const historyIds = historyRows.map(({ id }) => id);
  const requestLines = requestIds.length ? await tx.select().from(shopTransactionRequestLine)
    .where(inArray(shopTransactionRequestLine.requestId, requestIds))
    .orderBy(asc(shopTransactionRequestLine.requestId), asc(shopTransactionRequestLine.sortOrder), asc(shopTransactionRequestLine.id)) : [];
  const transactionLines = historyIds.length ? await tx.select().from(shopTransactionLine)
    .where(inArray(shopTransactionLine.transactionId, historyIds))
    .orderBy(asc(shopTransactionLine.transactionId), asc(shopTransactionLine.sortOrder), asc(shopTransactionLine.id)) : [];
  const userIds = [...new Set([
    ...requestRows.map(({ requestedByUserId }) => requestedByUserId),
    ...historyRows.map(({ completedByUserId }) => completedByUserId),
  ])];
  const names = userIds.length ? await tx.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds)) : [];
  const nameById = new Map(names.map((entry) => [entry.id, entry.name]));
  const requestLinesByRequest = new Map<number, typeof requestLines>();
  for (const line of requestLines) requestLinesByRequest.set(line.requestId, [...(requestLinesByRequest.get(line.requestId) ?? []), line]);
  const transactionLinesByTransaction = new Map<number, typeof transactionLines>();
  for (const line of transactionLines) transactionLinesByTransaction.set(line.transactionId, [...(transactionLinesByTransaction.get(line.transactionId) ?? []), line]);
  return {
    campaignId: root.campaignId,
    shopId: root.shopId,
    shopName: root.shopName,
    characterId: root.characterId,
    characterName: root.characterName,
    characterOwnerUserId: root.characterOwnerUserId,
    characterBalanceCredits: root.characterBalanceCredits,
    shopBalanceCredits: input.godView ? root.shopBalanceCredits : null,
    characterPurchaseMode: root.characterPurchaseMode as "immediate" | "god-approval-required",
    soldItemHandling: root.soldItemHandling as "add-to-shop-stock" | "remove-from-active-play",
    changedSaleConfirmationMode: root.changedSaleConfirmationMode as "character-owner-accepts" | "god-approval-finalizes",
    currency: {
      currencySystem: currency.currencySystem,
      derivedCurrencies: currency.derivedCurrencies,
    },
    ownedStacks: ownedStacks.map((entry) => ({
      itemId: entry.itemId,
      canonicalId: entry.canonicalId,
      name: entry.name,
      category: entry.category,
      quantity: entry.quantity,
      shopBuyingPriceCredits: entry.buyingPriceOverrideCredits ?? entry.canonicalPriceCredits,
    })),
    ownedInstances: ownedInstances.map((entry) => ({
      id: entry.id,
      itemId: entry.itemId,
      canonicalId: entry.canonicalId,
      name: entry.name,
      category: entry.category,
      currentCharges: entry.currentCharges,
      equipmentState: entry.equipmentState,
      shopBuyingPriceCredits: entry.buyingPriceOverrideCredits ?? entry.canonicalPriceCredits,
    })),
    requests: requestRows.map((request) => {
      const lines = (requestLinesByRequest.get(request.id) ?? []).map((line) => ({
        id: line.id,
        offeringId: line.offeringId,
        itemId: line.itemId,
        itemInstanceId: line.itemInstanceId,
        canonicalId: line.itemCanonicalIdSnapshot,
        name: line.itemNameSnapshot,
        fulfillmentKind: line.fulfillmentKind as "inventory-transfer" | "service-narrative",
        quantity: line.quantity,
        quotedUnitPriceCredits: line.quotedUnitPriceCredits,
        currentUnitPriceCredits: line.currentUnitPriceCredits,
        totalCredits: moneyAmount(line.quantity * line.currentUnitPriceCredits, "Request line total"),
      }));
      return {
        id: request.id,
        kind: request.kind,
        status: request.status,
        termsVersion: request.termsVersion,
        ownerAcceptedTermsVersion: request.ownerAcceptedTermsVersion,
        godApprovedTermsVersion: request.godApprovedTermsVersion,
        narrativeNote: request.narrativeNote,
        resolutionReason: request.resolutionReason,
        transactionOverride: request.transactionOverride,
        transactionOverrideReason: request.transactionOverrideReason,
        requestedByName: nameById.get(request.requestedByUserId) ?? "Unknown user",
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        lines,
        totalCredits: moneyAmount(lines.reduce((total, line) => total + line.totalCredits, 0), "Request total"),
      };
    }),
    history: historyRows.map((transaction) => ({
      id: transaction.id,
      requestId: transaction.requestId,
      kind: transaction.kind,
      totalCredits: transaction.totalCredits,
      narrativeNote: transaction.narrativeNote,
      transactionOverride: transaction.transactionOverride,
      transactionOverrideReason: transaction.transactionOverrideReason,
      completedByName: nameById.get(transaction.completedByUserId) ?? "Unknown user",
      completedAt: transaction.completedAt.toISOString(),
      currencySnapshot: transaction.currencySnapshotJson,
      policySnapshot: transaction.policySnapshotJson,
      lines: (transactionLinesByTransaction.get(transaction.id) ?? []).map((line) => ({
        id: line.id,
        canonicalId: line.itemCanonicalIdSnapshot,
        name: line.itemNameSnapshot,
        fulfillmentKind: line.fulfillmentKind as "inventory-transfer" | "service-narrative",
        quantity: line.quantity,
        unitPriceCredits: line.unitPriceCredits,
        totalCredits: line.totalCredits,
        sourceItemInstanceId: line.sourceItemInstanceId,
        acquiredItemInstanceId: line.acquiredItemInstanceId,
      })),
    })),
    moneyEvents: moneyRows.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
  };
}

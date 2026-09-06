import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { campaign, campaignDerivedCurrency, campaignPlayer } from "@/db/campaign-schema";
import { user } from "@/db/auth-schema";
import { item } from "@/db/item-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { shop, shopOffering, shopStaffAssignment } from "@/db/shop-schema";
import {
  campaignSessionSceneShop,
  campaignSessionSceneTown,
  campaignSessionSceneTownNpc,
  campaignSessionSceneTownShop,
} from "@/db/tabletop-location-schema";
import {
  campaignSessionSceneShopVisit,
  campaignSessionSceneShopVisitMember,
} from "@/db/tabletop-shop-visit-schema";
import {
  campaignSession,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import { town } from "@/db/town-schema";
import type { SerrianRole } from "@/db/authorization-schema";
import {
  cancelOpenShopRequestsForMembershipsInTransaction,
  readShopCommerceInTransaction,
  type ShopCommerceView,
} from "./shop-commerce-service";

export type ShopVisitTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type ShopVisitMode = "roleplay" | "shopping";
export type ShopVisitPlacement = { kind: "town"; townId: number } | { kind: "independent" };

export type ShopVisitOfferingView = Readonly<{
  id: number;
  version: number;
  itemId: number;
  canonicalId: string;
  name: string;
  category: string;
  family: string;
  description: string;
  fulfillmentKind: "inventory-transfer" | "service-narrative";
  unlimitedStock: boolean;
  limitedQuantity: number | null;
  canonicalPriceCredits: number | null;
  sellingPriceCredits: number | null;
  buyingPriceCredits: number | null;
}>;

export type ShopVisitPublicShopView = Readonly<{
  id: number;
  name: string;
  category: string;
  description: string;
  storefrontState: "open" | "closed";
  staff: readonly {
    npcCharacterId: number;
    name: string;
    roleLabel: string;
    responsibilityLabel: string;
    isPrimaryContact: boolean;
  }[];
  offerings: readonly ShopVisitOfferingView[];
}>;

export type ShopVisitCurrencyView = Readonly<{
  currencySystem: "Credits" | "Derived Currency";
  derivedCurrencies: readonly {
    id: number;
    name: string;
    creditsPerUnit: number;
    sortOrder: number;
  }[];
}>;

export type ShopVisitView = Readonly<{
  id: number;
  campaignId: number;
  sessionId: number;
  sceneId: number;
  placement: ShopVisitPlacement;
  mode: ShopVisitMode;
  startedAt: string;
  currency: ShopVisitCurrencyView;
  shop: ShopVisitPublicShopView;
  visitors: readonly {
    characterId: number;
    name: string;
    playerName: string;
    enteredAt: string;
  }[];
}>;

export type GodShopVisitView = Readonly<ShopVisitView & {
  closedShopOverride: boolean;
  closedShopOverrideReason: string;
  commerce: readonly ShopCommerceView[];
}>;

export type GodShopVisitWorkspace = Readonly<{
  campaignId: number;
  sessionId: number;
  sceneId: number;
  canOperate: boolean;
  entryUnavailableReason: string | null;
  canTransact: boolean;
  currency: ShopVisitCurrencyView;
  eligiblePlayers: readonly { characterId: number; name: string; playerName: string }[];
  campaignCharacters: readonly { characterId: number; name: string; playerName: string }[];
  eligiblePlacements: readonly {
    shopId: number;
    shopName: string;
    shopCategory: string;
    storefrontState: "open" | "closed";
    shop: ShopVisitPublicShopView;
    placement: ShopVisitPlacement;
    placementLabel: string;
  }[];
  activeVisits: readonly GodShopVisitView[];
}>;

type Actor = { userId: string; roles: readonly SerrianRole[] };
type VisitContext = {
  sceneId: number;
  sessionId: number;
  campaignId: number;
  sessionStatus: "planned" | "active" | "completed";
  sceneStatus: "planned" | "active" | "completed";
  ownerUserId: string;
  shopId: number;
  shopName: string;
  shopCategory: string;
  shopDescription: string;
  storefrontState: "open" | "closed";
  shopArchivedAt: Date | null;
  campaignArchivedAt: Date | null;
  currencySystem: "Credits" | "Derived Currency";
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizedReason(value: string, label: string, required = true): string {
  const result = value.trim();
  if (required && !result) throw new Error(`${label} is required.`);
  if (result.length > 1000) throw new Error(`${label} cannot exceed 1,000 characters.`);
  return result;
}

function assertOwner(actor: Actor, ownerUserId: string): void {
  if (!actor.roles.includes("god") || actor.userId !== ownerUserId) {
    throw new Error("Only the Campaign-owning G.O.D. can manage Shop visits.");
  }
}

async function loadVisitContext(
  tx: ShopVisitTransaction,
  sceneId: number,
  shopId: number,
  lock = false,
): Promise<VisitContext> {
  let query = tx.select({
    sceneId: campaignSessionScene.id,
    sessionId: campaignSessionScene.sessionId,
    campaignId: campaignSessionScene.campaignId,
    sceneStatus: campaignSessionScene.status,
    sessionStatus: campaignSession.status,
    ownerUserId: campaign.createdByUserId,
    campaignArchivedAt: campaign.archivedAt,
    currencySystem: campaign.currencySystem,
    shopId: shop.id,
    shopName: shop.name,
    shopCategory: shop.category,
    shopDescription: shop.description,
    storefrontState: shop.storefrontState,
    shopArchivedAt: shop.archivedAt,
  }).from(campaignSessionScene)
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionScene.sessionId),
      eq(campaignSession.campaignId, campaignSessionScene.campaignId),
    ))
    .innerJoin(campaign, eq(campaign.id, campaignSessionScene.campaignId))
    .innerJoin(shop, and(
      eq(shop.id, positiveId(shopId, "Shop")),
      eq(shop.campaignId, campaignSessionScene.campaignId),
    ))
    .where(eq(campaignSessionScene.id, positiveId(sceneId, "Scene")))
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  if (!row) throw new Error("That Scene and Shop do not share one Campaign hierarchy.");
  return {
    ...row,
    storefrontState: row.storefrontState as "open" | "closed",
  };
}

function assertActiveContext(context: VisitContext): void {
  if (context.campaignArchivedAt) throw new Error("Archived Campaigns cannot start Shop visits.");
  if (context.sessionStatus !== "active" || context.sceneStatus !== "active") {
    throw new Error("Shop visits require an active Session and active Scene.");
  }
  if (context.shopArchivedAt) throw new Error("Archived Shops cannot start new visits.");
}

async function assertEligiblePlacement(
  tx: ShopVisitTransaction,
  context: VisitContext,
  placement: ShopVisitPlacement,
): Promise<void> {
  if (placement.kind === "independent") {
    const [row] = await tx.select({ shopId: campaignSessionSceneShop.shopId })
      .from(campaignSessionSceneShop)
      .where(and(
        eq(campaignSessionSceneShop.sceneId, context.sceneId),
        eq(campaignSessionSceneShop.sessionId, context.sessionId),
        eq(campaignSessionSceneShop.campaignId, context.campaignId),
        eq(campaignSessionSceneShop.shopId, context.shopId),
        eq(campaignSessionSceneShop.revealed, true),
      )).limit(1);
    if (!row) throw new Error("That independent Shop placement is not revealed in the active Scene.");
    return;
  }
  const [row] = await tx.select({ shopId: campaignSessionSceneTownShop.shopId })
    .from(campaignSessionSceneTownShop)
    .innerJoin(campaignSessionSceneTown, and(
      eq(campaignSessionSceneTown.sceneId, campaignSessionSceneTownShop.sceneId),
      eq(campaignSessionSceneTown.townId, campaignSessionSceneTownShop.townId),
      eq(campaignSessionSceneTown.sessionId, campaignSessionSceneTownShop.sessionId),
      eq(campaignSessionSceneTown.campaignId, campaignSessionSceneTownShop.campaignId),
    ))
    .innerJoin(town, and(
      eq(town.id, campaignSessionSceneTownShop.townId),
      eq(town.campaignId, campaignSessionSceneTownShop.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneTownShop.sceneId, context.sceneId),
      eq(campaignSessionSceneTownShop.sessionId, context.sessionId),
      eq(campaignSessionSceneTownShop.campaignId, context.campaignId),
      eq(campaignSessionSceneTownShop.townId, positiveId(placement.townId, "Town")),
      eq(campaignSessionSceneTownShop.shopId, context.shopId),
      eq(campaignSessionSceneTown.revealed, true),
      eq(campaignSessionSceneTownShop.included, true),
      eq(campaignSessionSceneTownShop.revealed, true),
      isNull(town.archivedAt),
    )).limit(1);
  if (!row) {
    throw new Error("That Shop is not included and revealed beneath the selected active Town placement.");
  }
}

async function loadEligiblePlayers(
  tx: ShopVisitTransaction,
  context: Pick<VisitContext, "sceneId" | "sessionId" | "campaignId">,
) {
  return tx.select({
    characterId: campaignCharacter.id,
    name: campaignCharacter.name,
    playerName: user.name,
  }).from(campaignSessionSceneMember)
    .innerJoin(campaignSessionRoster, and(
      eq(campaignSessionRoster.sessionId, campaignSessionSceneMember.sessionId),
      eq(campaignSessionRoster.characterId, campaignSessionSceneMember.characterId),
      eq(campaignSessionRoster.campaignId, campaignSessionSceneMember.campaignId),
    ))
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionSceneMember.characterId),
      eq(campaignCharacter.campaignId, campaignSessionSceneMember.campaignId),
    ))
    .innerJoin(user, eq(user.id, campaignCharacter.playerUserId))
    .where(and(
      eq(campaignSessionSceneMember.sceneId, context.sceneId),
      eq(campaignSessionSceneMember.sessionId, context.sessionId),
      eq(campaignSessionSceneMember.campaignId, context.campaignId),
      eq(campaignCharacter.isNpc, false),
      isNull(campaignCharacter.archivedAt),
    ))
    .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
}

async function readPublicShop(
  tx: ShopVisitTransaction,
  context: VisitContext,
  placement: ShopVisitPlacement,
): Promise<ShopVisitPublicShopView> {
  const staffConditions = [
    eq(shopStaffAssignment.shopId, context.shopId),
    eq(shopStaffAssignment.campaignId, context.campaignId),
    isNull(campaignCharacter.archivedAt),
  ];
  const baseStaff = tx.select({
    npcCharacterId: campaignCharacter.id,
    name: campaignCharacter.name,
    roleLabel: campaignCharacter.npcRoleLabel,
    responsibilityLabel: shopStaffAssignment.responsibilityLabel,
    isPrimaryContact: shopStaffAssignment.isPrimaryContact,
  }).from(shopStaffAssignment)
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, shopStaffAssignment.npcCharacterId),
      eq(campaignCharacter.campaignId, shopStaffAssignment.campaignId),
    ));
  const staff = placement.kind === "town"
    ? await baseStaff.innerJoin(campaignSessionSceneTownNpc, and(
        eq(campaignSessionSceneTownNpc.sceneId, context.sceneId),
        eq(campaignSessionSceneTownNpc.sessionId, context.sessionId),
        eq(campaignSessionSceneTownNpc.campaignId, context.campaignId),
        eq(campaignSessionSceneTownNpc.townId, placement.townId),
        eq(campaignSessionSceneTownNpc.npcCharacterId, campaignCharacter.id),
        eq(campaignSessionSceneTownNpc.included, true),
        eq(campaignSessionSceneTownNpc.revealed, true),
      )).where(and(...staffConditions))
      .orderBy(asc(shopStaffAssignment.sortOrder), asc(campaignCharacter.name), asc(campaignCharacter.id))
    : await baseStaff.where(and(...staffConditions))
      .orderBy(asc(shopStaffAssignment.sortOrder), asc(campaignCharacter.name), asc(campaignCharacter.id));
  const offerings = await tx.select({
    id: shopOffering.id,
    version: shopOffering.version,
    itemId: item.id,
    canonicalId: item.canonicalId,
    name: item.name,
    category: item.category,
    family: item.family,
    description: item.description,
    fulfillmentKind: shopOffering.fulfillmentKind,
    unlimitedStock: shopOffering.unlimitedStock,
    limitedQuantity: shopOffering.limitedQuantity,
    canonicalPriceCredits: item.credits,
    sellingPriceOverrideCredits: shopOffering.sellingPriceOverrideCredits,
    buyingPriceOverrideCredits: shopOffering.buyingPriceOverrideCredits,
  }).from(shopOffering)
    .innerJoin(item, eq(item.id, shopOffering.itemId))
    .where(and(
      eq(shopOffering.shopId, context.shopId),
      eq(shopOffering.campaignId, context.campaignId),
      eq(shopOffering.enabled, true),
      isNull(item.archivedAt),
    ))
    .orderBy(asc(shopOffering.sortOrder), asc(item.name), asc(shopOffering.id));
  return {
    id: context.shopId,
    name: context.shopName,
    category: context.shopCategory,
    description: context.shopDescription,
    storefrontState: context.storefrontState,
    staff,
    offerings: offerings.map((entry) => ({
      id: entry.id,
      version: entry.version,
      itemId: entry.itemId,
      canonicalId: entry.canonicalId,
      name: entry.name,
      category: entry.category,
      family: entry.family,
      description: entry.description,
      fulfillmentKind: entry.fulfillmentKind as "inventory-transfer" | "service-narrative",
      unlimitedStock: entry.unlimitedStock,
      limitedQuantity: entry.limitedQuantity,
      canonicalPriceCredits: entry.canonicalPriceCredits,
      sellingPriceCredits: entry.sellingPriceOverrideCredits ?? entry.canonicalPriceCredits,
      buyingPriceCredits: entry.buyingPriceOverrideCredits ?? entry.canonicalPriceCredits,
    })),
  };
}

async function readVisit(
  tx: ShopVisitTransaction,
  row: typeof campaignSessionSceneShopVisit.$inferSelect,
): Promise<ShopVisitView> {
  const context = await loadVisitContext(tx, row.sceneId, row.shopId);
  const placement: ShopVisitPlacement = row.placementKind === "town"
    ? { kind: "town", townId: row.townId! }
    : { kind: "independent" };
  const visitors = await tx.select({
    characterId: campaignCharacter.id,
    name: campaignCharacter.name,
    playerName: user.name,
    enteredAt: campaignSessionSceneShopVisitMember.enteredAt,
  }).from(campaignSessionSceneShopVisitMember)
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionSceneShopVisitMember.characterId),
      eq(campaignCharacter.campaignId, campaignSessionSceneShopVisitMember.campaignId),
    ))
    .innerJoin(user, eq(user.id, campaignCharacter.playerUserId))
    .where(and(
      eq(campaignSessionSceneShopVisitMember.visitId, row.id),
      eq(campaignSessionSceneShopVisitMember.status, "active"),
    )).orderBy(asc(campaignSessionSceneShopVisitMember.enteredAt), asc(campaignCharacter.name));
  const derivedCurrencies = context.currencySystem === "Derived Currency"
    ? await tx.select({
        id: campaignDerivedCurrency.id,
        name: campaignDerivedCurrency.name,
        creditsPerUnit: campaignDerivedCurrency.creditsPerUnit,
        sortOrder: campaignDerivedCurrency.sortOrder,
      }).from(campaignDerivedCurrency)
        .where(eq(campaignDerivedCurrency.campaignId, row.campaignId))
        .orderBy(asc(campaignDerivedCurrency.sortOrder), asc(campaignDerivedCurrency.id))
    : [];
  return {
    id: row.id,
    campaignId: row.campaignId,
    sessionId: row.sessionId,
    sceneId: row.sceneId,
    placement,
    mode: row.mode,
    startedAt: row.startedAt.toISOString(),
    currency: {
      currencySystem: context.currencySystem,
      derivedCurrencies,
    },
    shop: await readPublicShop(tx, context, placement),
    visitors: visitors.map((entry) => ({
      ...entry,
      enteredAt: entry.enteredAt.toISOString(),
    })),
  };
}

async function readGodVisit(
  tx: ShopVisitTransaction,
  row: typeof campaignSessionSceneShopVisit.$inferSelect,
  viewerUserId: string,
  includeCommerce: boolean,
): Promise<GodShopVisitView> {
  const visit = await readVisit(tx, row);
  const commerce: ShopCommerceView[] = [];
  if (includeCommerce) {
    for (const visitor of visit.visitors) {
      commerce.push(await readShopCommerceInTransaction(tx, {
        campaignId: visit.campaignId,
        shopId: visit.shop.id,
        characterId: visitor.characterId,
        viewerUserId,
        godView: true,
      }));
    }
  }
  return {
    ...visit,
    closedShopOverride: row.closedShopOverride,
    closedShopOverrideReason: row.closedShopOverrideReason,
    commerce,
  };
}

export async function readGodShopVisitWorkspaceInTransaction(
  tx: ShopVisitTransaction,
  sceneId: number,
  actor: Actor,
): Promise<GodShopVisitWorkspace> {
  const [scene] = await tx.select({
    sceneId: campaignSessionScene.id,
    sessionId: campaignSessionScene.sessionId,
    campaignId: campaignSessionScene.campaignId,
    sceneStatus: campaignSessionScene.status,
    sessionStatus: campaignSession.status,
    ownerUserId: campaign.createdByUserId,
    campaignArchivedAt: campaign.archivedAt,
    currencySystem: campaign.currencySystem,
  }).from(campaignSessionScene)
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionScene.sessionId),
      eq(campaignSession.campaignId, campaignSessionScene.campaignId),
    ))
    .innerJoin(campaign, eq(campaign.id, campaignSessionScene.campaignId))
    .where(eq(campaignSessionScene.id, positiveId(sceneId, "Scene"))).limit(1);
  if (!scene) throw new Error("That Scene no longer exists.");
  if (actor.userId !== scene.ownerUserId && !actor.roles.includes("admin")) {
    throw new Error("You do not have access to this Campaign's Shop visits.");
  }
  const canOperate = actor.roles.includes("god")
    && actor.userId === scene.ownerUserId
    && !scene.campaignArchivedAt
    && scene.sessionStatus === "active"
    && scene.sceneStatus === "active";
  const entryUnavailableReason = scene.campaignArchivedAt
    ? "Restore this Campaign before managing participant Shop visits."
    : scene.sessionStatus !== "active"
      ? "Shop entry is unavailable because this Session is not active."
      : scene.sceneStatus !== "active"
        ? "Shop entry is unavailable because this Scene is not active."
        : actor.userId !== scene.ownerUserId || !actor.roles.includes("god")
          ? "Only the Campaign-owning G.O.D. can manage participant Shop visits."
          : null;
  const canTransact = actor.roles.includes("god")
    && actor.userId === scene.ownerUserId
    && !scene.campaignArchivedAt;
  const directRows = await tx.select({
    shopId: shop.id,
    shopName: shop.name,
    shopCategory: shop.category,
    storefrontState: shop.storefrontState,
  }).from(campaignSessionSceneShop)
    .innerJoin(shop, and(
      eq(shop.id, campaignSessionSceneShop.shopId),
      eq(shop.campaignId, campaignSessionSceneShop.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneShop.sceneId, scene.sceneId),
      eq(campaignSessionSceneShop.sessionId, scene.sessionId),
      eq(campaignSessionSceneShop.campaignId, scene.campaignId),
      eq(campaignSessionSceneShop.revealed, true),
      isNull(shop.archivedAt),
    )).orderBy(asc(campaignSessionSceneShop.sortOrder), asc(shop.name));
  const townRows = await tx.select({
    townId: town.id,
    townName: town.name,
    shopId: shop.id,
    shopName: shop.name,
    shopCategory: shop.category,
    storefrontState: shop.storefrontState,
  }).from(campaignSessionSceneTownShop)
    .innerJoin(campaignSessionSceneTown, and(
      eq(campaignSessionSceneTown.sceneId, campaignSessionSceneTownShop.sceneId),
      eq(campaignSessionSceneTown.townId, campaignSessionSceneTownShop.townId),
      eq(campaignSessionSceneTown.sessionId, campaignSessionSceneTownShop.sessionId),
      eq(campaignSessionSceneTown.campaignId, campaignSessionSceneTownShop.campaignId),
    ))
    .innerJoin(town, and(
      eq(town.id, campaignSessionSceneTownShop.townId),
      eq(town.campaignId, campaignSessionSceneTownShop.campaignId),
    ))
    .innerJoin(shop, and(
      eq(shop.id, campaignSessionSceneTownShop.shopId),
      eq(shop.campaignId, campaignSessionSceneTownShop.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneTownShop.sceneId, scene.sceneId),
      eq(campaignSessionSceneTownShop.sessionId, scene.sessionId),
      eq(campaignSessionSceneTownShop.campaignId, scene.campaignId),
      eq(campaignSessionSceneTown.revealed, true),
      eq(campaignSessionSceneTownShop.included, true),
      eq(campaignSessionSceneTownShop.revealed, true),
      isNull(town.archivedAt),
      isNull(shop.archivedAt),
    )).orderBy(asc(campaignSessionSceneTown.sortOrder), asc(campaignSessionSceneTownShop.sortOrder), asc(shop.name));
  const visitRows = await tx.select().from(campaignSessionSceneShopVisit)
    .where(and(
      eq(campaignSessionSceneShopVisit.sceneId, scene.sceneId),
      eq(campaignSessionSceneShopVisit.sessionId, scene.sessionId),
      eq(campaignSessionSceneShopVisit.campaignId, scene.campaignId),
      eq(campaignSessionSceneShopVisit.status, "active"),
    )).orderBy(asc(campaignSessionSceneShopVisit.startedAt), asc(campaignSessionSceneShopVisit.id));
  const activeVisits: GodShopVisitView[] = [];
  for (const row of visitRows) activeVisits.push(await readGodVisit(tx, row, actor.userId, canOperate));
  const campaignCharacters = await tx.select({
    characterId: campaignCharacter.id,
    name: campaignCharacter.name,
    playerName: user.name,
  }).from(campaignCharacter)
    .innerJoin(user, eq(user.id, campaignCharacter.playerUserId))
    .where(and(
      eq(campaignCharacter.campaignId, scene.campaignId),
      eq(campaignCharacter.isNpc, false),
      isNull(campaignCharacter.archivedAt),
    )).orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
  const derivedCurrencies = scene.currencySystem === "Derived Currency"
    ? await tx.select({
        id: campaignDerivedCurrency.id,
        name: campaignDerivedCurrency.name,
        creditsPerUnit: campaignDerivedCurrency.creditsPerUnit,
        sortOrder: campaignDerivedCurrency.sortOrder,
      }).from(campaignDerivedCurrency)
        .where(eq(campaignDerivedCurrency.campaignId, scene.campaignId))
        .orderBy(asc(campaignDerivedCurrency.sortOrder), asc(campaignDerivedCurrency.id))
    : [];
  const eligiblePlacementRoots = [
    ...townRows.map((entry) => ({
      shopId: entry.shopId,
      shopName: entry.shopName,
      shopCategory: entry.shopCategory,
      storefrontState: entry.storefrontState as "open" | "closed",
      placement: { kind: "town" as const, townId: entry.townId },
      placementLabel: entry.townName,
    })),
    ...directRows.map((entry) => ({
      shopId: entry.shopId,
      shopName: entry.shopName,
      shopCategory: entry.shopCategory,
      storefrontState: entry.storefrontState as "open" | "closed",
      placement: { kind: "independent" as const },
      placementLabel: "Independent placement",
    })),
  ];
  const eligiblePlacements: Array<GodShopVisitWorkspace["eligiblePlacements"][number]> = [];
  for (const placement of eligiblePlacementRoots) {
    const context = await loadVisitContext(tx, scene.sceneId, placement.shopId);
    eligiblePlacements.push({
      ...placement,
      shop: await readPublicShop(tx, context, placement.placement),
    });
  }
  return {
    campaignId: scene.campaignId,
    sessionId: scene.sessionId,
    sceneId: scene.sceneId,
    canOperate,
    entryUnavailableReason,
    canTransact,
    currency: {
      currencySystem: scene.currencySystem,
      derivedCurrencies,
    },
    eligiblePlayers: await loadEligiblePlayers(tx, scene),
    campaignCharacters,
    eligiblePlacements,
    activeVisits,
  };
}

export async function startOrAddShopVisitInTransaction(
  tx: ShopVisitTransaction,
  input: {
    sceneId: number;
    shopId: number;
    placement: ShopVisitPlacement;
    characterIds: readonly number[];
    mode: ShopVisitMode;
    closedShopOverrideReason: string;
  },
  actor: Actor,
): Promise<{ visitId: number; addedCharacterIds: number[] }> {
  const context = await loadVisitContext(tx, input.sceneId, input.shopId, true);
  assertOwner(actor, context.ownerUserId);
  assertActiveContext(context);
  await assertEligiblePlacement(tx, context, input.placement);
  if (input.mode !== "roleplay" && input.mode !== "shopping") throw new Error("Shop visit mode is invalid.");
  const requestedIds = [...new Set(input.characterIds.map((id) => positiveId(id, "Character")))].sort((a, b) => a - b);
  if (!requestedIds.length) throw new Error("Select at least one Player Character to enter the Shop.");
  const overrideReason = context.storefrontState === "closed"
    ? normalizedReason(input.closedShopOverrideReason, "Closed-Shop override reason")
    : "";
  let [visit] = await tx.select().from(campaignSessionSceneShopVisit).where(and(
    eq(campaignSessionSceneShopVisit.sceneId, context.sceneId),
    eq(campaignSessionSceneShopVisit.shopId, context.shopId),
    eq(campaignSessionSceneShopVisit.status, "active"),
  )).limit(1).for("update");
  if (visit) {
    if (visit.placementKind !== input.placement.kind || (visit.townId ?? null) !== (input.placement.kind === "town" ? input.placement.townId : null)) {
      throw new Error("This Shop already has an active visit through a different Scene placement.");
    }
  } else {
    const [created] = await tx.insert(campaignSessionSceneShopVisit).values({
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      shopId: context.shopId,
      placementKind: input.placement.kind,
      townId: input.placement.kind === "town" ? input.placement.townId : null,
      mode: input.mode,
      closedShopOverride: context.storefrontState === "closed",
      closedShopOverrideReason: overrideReason,
      startedByUserId: actor.userId,
    }).onConflictDoNothing().returning();
    visit = created ?? (await tx.select().from(campaignSessionSceneShopVisit).where(and(
      eq(campaignSessionSceneShopVisit.sceneId, context.sceneId),
      eq(campaignSessionSceneShopVisit.shopId, context.shopId),
      eq(campaignSessionSceneShopVisit.status, "active"),
    )).limit(1).for("update"))[0];
    if (!visit) throw new Error("The Shop visit could not be started.");
    if (visit.placementKind !== input.placement.kind || (visit.townId ?? null) !== (input.placement.kind === "town" ? input.placement.townId : null)) {
      throw new Error("This Shop already has an active visit through a different Scene placement.");
    }
  }
  await tx.select({ id: campaignCharacter.id }).from(campaignCharacter)
    .where(inArray(campaignCharacter.id, requestedIds)).orderBy(asc(campaignCharacter.id)).for("update");
  const eligible = await loadEligiblePlayers(tx, context);
  const eligibleIds = new Set(eligible.map(({ characterId }) => characterId));
  if (requestedIds.some((id) => !eligibleIds.has(id))) {
    throw new Error("Shop visitors must be active Player Characters on this Scene's Session roster and Scene membership.");
  }
  const existing = await tx.select({
    characterId: campaignSessionSceneShopVisitMember.characterId,
    visitId: campaignSessionSceneShopVisitMember.visitId,
  }).from(campaignSessionSceneShopVisitMember).where(and(
    inArray(campaignSessionSceneShopVisitMember.characterId, requestedIds),
    eq(campaignSessionSceneShopVisitMember.status, "active"),
  )).for("update");
  const wrongVisit = existing.find(({ visitId }) => visitId !== visit.id);
  if (wrongVisit) {
    throw new Error("A selected Character is already in another active Shop visit. Leave or remove them before moving Shops.");
  }
  const existingIds = new Set(existing.map(({ characterId }) => characterId));
  const addedCharacterIds = requestedIds.filter((id) => !existingIds.has(id));
  if (addedCharacterIds.length) {
    await tx.insert(campaignSessionSceneShopVisitMember).values(addedCharacterIds.map((characterId) => ({
      visitId: visit!.id,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      characterId,
      enteredByUserId: actor.userId,
    }))).onConflictDoNothing();
    const confirmed = await tx.select({ characterId: campaignSessionSceneShopVisitMember.characterId })
      .from(campaignSessionSceneShopVisitMember).where(and(
        eq(campaignSessionSceneShopVisitMember.visitId, visit.id),
        eq(campaignSessionSceneShopVisitMember.status, "active"),
        inArray(campaignSessionSceneShopVisitMember.characterId, requestedIds),
      ));
    if (confirmed.length !== requestedIds.length) {
      throw new Error("A selected Character entered another Shop concurrently. Leave that visit before moving Shops.");
    }
  }
  if (visit.mode !== input.mode || (context.storefrontState === "closed" && !visit.closedShopOverride)) {
    await tx.update(campaignSessionSceneShopVisit).set({
      mode: input.mode,
      ...(context.storefrontState === "closed" ? {
        closedShopOverride: true,
        closedShopOverrideReason: overrideReason,
      } : {}),
      updatedAt: new Date(),
    })
      .where(and(eq(campaignSessionSceneShopVisit.id, visit.id), eq(campaignSessionSceneShopVisit.status, "active")));
  }
  return { visitId: visit.id, addedCharacterIds };
}

async function endMembership(
  tx: ShopVisitTransaction,
  visitId: number,
  characterId: number,
  actorUserId: string,
  exitKind: "player-left" | "god-removed" | "visit-ended" | "lifecycle-ended" | "permission-lost",
): Promise<boolean> {
  const [membership] = await tx.select({ id: campaignSessionSceneShopVisitMember.id })
    .from(campaignSessionSceneShopVisitMember)
    .where(and(
      eq(campaignSessionSceneShopVisitMember.visitId, visitId),
      eq(campaignSessionSceneShopVisitMember.characterId, characterId),
      eq(campaignSessionSceneShopVisitMember.status, "active"),
    )).limit(1).for("update");
  if (!membership) return false;
  await cancelOpenShopRequestsForMembershipsInTransaction(tx, {
    visitId,
    memberIds: [membership.id],
    actorUserId,
    reason: "The Character left the Shop visit before the request completed.",
  });
  const now = new Date();
  const ended = await tx.update(campaignSessionSceneShopVisitMember).set({
    status: "ended",
    exitedByUserId: actorUserId,
    exitedAt: now,
    exitKind,
    updatedAt: now,
  }).where(and(
    eq(campaignSessionSceneShopVisitMember.visitId, visitId),
    eq(campaignSessionSceneShopVisitMember.characterId, characterId),
    eq(campaignSessionSceneShopVisitMember.status, "active"),
  )).returning({ id: campaignSessionSceneShopVisitMember.id });
  return ended.length > 0;
}

async function closeVisitIfEmpty(
  tx: ShopVisitTransaction,
  visitId: number,
  actorUserId: string,
): Promise<void> {
  const [remaining] = await tx.select({ id: campaignSessionSceneShopVisitMember.id })
    .from(campaignSessionSceneShopVisitMember).where(and(
      eq(campaignSessionSceneShopVisitMember.visitId, visitId),
      eq(campaignSessionSceneShopVisitMember.status, "active"),
    )).limit(1);
  if (remaining) return;
  const now = new Date();
  await tx.update(campaignSessionSceneShopVisit).set({
    status: "ended",
    endedByUserId: actorUserId,
    endedAt: now,
    endReason: "The final visitor left the Shop.",
    updatedAt: now,
  }).where(and(
    eq(campaignSessionSceneShopVisit.id, visitId),
    eq(campaignSessionSceneShopVisit.status, "active"),
  ));
}

async function lockOwnedVisit(tx: ShopVisitTransaction, visitId: number, actor: Actor) {
  const [visit] = await tx.select({
    id: campaignSessionSceneShopVisit.id,
    sceneId: campaignSessionSceneShopVisit.sceneId,
    sessionId: campaignSessionSceneShopVisit.sessionId,
    campaignId: campaignSessionSceneShopVisit.campaignId,
    shopId: campaignSessionSceneShopVisit.shopId,
    status: campaignSessionSceneShopVisit.status,
  }).from(campaignSessionSceneShopVisit)
    .where(eq(campaignSessionSceneShopVisit.id, positiveId(visitId, "Shop visit")))
    .limit(1).for("update");
  if (!visit) throw new Error("That Shop visit no longer exists.");
  const [owner] = await tx.select({ ownerUserId: campaign.createdByUserId })
    .from(campaign)
    .where(eq(campaign.id, visit.campaignId))
    .limit(1);
  if (!owner) throw new Error("That Shop visit's Campaign no longer exists.");
  assertOwner(actor, owner.ownerUserId);
  return visit;
}

export async function setShopVisitModeInTransaction(
  tx: ShopVisitTransaction,
  visitId: number,
  mode: ShopVisitMode,
  actor: Actor,
): Promise<void> {
  const visit = await lockOwnedVisit(tx, visitId, actor);
  if (visit.status !== "active") return;
  if (mode !== "roleplay" && mode !== "shopping") throw new Error("Shop visit mode is invalid.");
  await tx.update(campaignSessionSceneShopVisit).set({ mode, updatedAt: new Date() })
    .where(and(eq(campaignSessionSceneShopVisit.id, visit.id), eq(campaignSessionSceneShopVisit.status, "active")));
}

export async function removeShopVisitorInTransaction(
  tx: ShopVisitTransaction,
  visitId: number,
  characterId: number,
  actor: Actor,
): Promise<void> {
  const visit = await lockOwnedVisit(tx, visitId, actor);
  if (visit.status !== "active") return;
  await endMembership(tx, visit.id, positiveId(characterId, "Character"), actor.userId, "god-removed");
  await closeVisitIfEmpty(tx, visit.id, actor.userId);
}

export async function endShopVisitInTransaction(
  tx: ShopVisitTransaction,
  visitId: number,
  reason: string,
  actor: Actor,
): Promise<void> {
  const visit = await lockOwnedVisit(tx, visitId, actor);
  if (visit.status !== "active") return;
  const normalized = normalizedReason(reason, "Visit end reason");
  const now = new Date();
  await cancelOpenShopRequestsForMembershipsInTransaction(tx, {
    visitId: visit.id,
    actorUserId: actor.userId,
    reason: `The Shop visit ended: ${normalized}`,
  });
  await tx.update(campaignSessionSceneShopVisitMember).set({
    status: "ended",
    exitedByUserId: actor.userId,
    exitedAt: now,
    exitKind: "visit-ended",
    updatedAt: now,
  }).where(and(
    eq(campaignSessionSceneShopVisitMember.visitId, visit.id),
    eq(campaignSessionSceneShopVisitMember.status, "active"),
  ));
  await tx.update(campaignSessionSceneShopVisit).set({
    status: "ended",
    endedByUserId: actor.userId,
    endedAt: now,
    endReason: normalized,
    updatedAt: now,
  }).where(and(
    eq(campaignSessionSceneShopVisit.id, visit.id),
    eq(campaignSessionSceneShopVisit.status, "active"),
  ));
}

export async function leaveOwnShopVisitInTransaction(
  tx: ShopVisitTransaction,
  characterId: number,
  playerUserId: string,
): Promise<{
  visitId: number | null;
  sceneId: number | null;
  campaignId: number | null;
  sessionId: number | null;
  affectedCharacterIds: number[];
}> {
  const validatedCharacterId = positiveId(characterId, "Character");
  const [candidate] = await tx.select({
    visitId: campaignSessionSceneShopVisitMember.visitId,
  }).from(campaignSessionSceneShopVisitMember)
    .where(and(
      eq(campaignSessionSceneShopVisitMember.characterId, validatedCharacterId),
      eq(campaignSessionSceneShopVisitMember.status, "active"),
    )).limit(1);
  if (!candidate) return { visitId: null, sceneId: null, campaignId: null, sessionId: null, affectedCharacterIds: [] };
  const [lockedVisit] = await tx.select({ id: campaignSessionSceneShopVisit.id })
    .from(campaignSessionSceneShopVisit)
    .where(eq(campaignSessionSceneShopVisit.id, candidate.visitId))
    .limit(1)
    .for("update");
  if (!lockedVisit) return { visitId: null, sceneId: null, campaignId: null, sessionId: null, affectedCharacterIds: [] };
  const [membership] = await tx.select({
    visitId: campaignSessionSceneShopVisitMember.visitId,
    sceneId: campaignSessionSceneShopVisitMember.sceneId,
    sessionId: campaignSessionSceneShopVisitMember.sessionId,
    campaignId: campaignSessionSceneShopVisitMember.campaignId,
    ownerUserId: campaignCharacter.playerUserId,
  }).from(campaignSessionSceneShopVisitMember)
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionSceneShopVisitMember.characterId),
      eq(campaignCharacter.campaignId, campaignSessionSceneShopVisitMember.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneShopVisitMember.visitId, lockedVisit.id),
      eq(campaignSessionSceneShopVisitMember.characterId, validatedCharacterId),
      eq(campaignSessionSceneShopVisitMember.status, "active"),
    )).limit(1).for("update");
  if (!membership) return { visitId: null, sceneId: null, campaignId: null, sessionId: null, affectedCharacterIds: [] };
  if (membership.ownerUserId !== playerUserId) throw new Error("Players may leave only their own Character's Shop visit.");
  const affected = await tx.select({ characterId: campaignSessionSceneShopVisitMember.characterId })
    .from(campaignSessionSceneShopVisitMember).where(and(
      eq(campaignSessionSceneShopVisitMember.visitId, membership.visitId),
      eq(campaignSessionSceneShopVisitMember.status, "active"),
    ));
  await endMembership(tx, membership.visitId, validatedCharacterId, playerUserId, "player-left");
  await closeVisitIfEmpty(tx, membership.visitId, playerUserId);
  return { ...membership, affectedCharacterIds: affected.map(({ characterId: affectedCharacterId }) => affectedCharacterId) };
}

export async function readPlayerShopVisitInTransaction(
  tx: ShopVisitTransaction,
  characterId: number,
  playerUserId: string,
): Promise<ShopVisitView | null> {
  const [membership] = await tx.select({
    visitId: campaignSessionSceneShopVisitMember.visitId,
    sceneId: campaignSessionSceneShopVisitMember.sceneId,
    sessionId: campaignSessionSceneShopVisitMember.sessionId,
    campaignId: campaignSessionSceneShopVisitMember.campaignId,
    ownerUserId: campaignCharacter.playerUserId,
  }).from(campaignSessionSceneShopVisitMember)
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionSceneShopVisitMember.characterId),
      eq(campaignCharacter.campaignId, campaignSessionSceneShopVisitMember.campaignId),
    ))
    .innerJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignSessionSceneShopVisitMember.campaignId),
      eq(campaignPlayer.userId, campaignCharacter.playerUserId),
    ))
    .innerJoin(campaignSessionSceneMember, and(
      eq(campaignSessionSceneMember.sceneId, campaignSessionSceneShopVisitMember.sceneId),
      eq(campaignSessionSceneMember.characterId, campaignSessionSceneShopVisitMember.characterId),
      eq(campaignSessionSceneMember.sessionId, campaignSessionSceneShopVisitMember.sessionId),
      eq(campaignSessionSceneMember.campaignId, campaignSessionSceneShopVisitMember.campaignId),
    ))
    .innerJoin(campaignSessionRoster, and(
      eq(campaignSessionRoster.sessionId, campaignSessionSceneShopVisitMember.sessionId),
      eq(campaignSessionRoster.characterId, campaignSessionSceneShopVisitMember.characterId),
      eq(campaignSessionRoster.campaignId, campaignSessionSceneShopVisitMember.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneShopVisitMember.characterId, positiveId(characterId, "Character")),
      eq(campaignSessionSceneShopVisitMember.status, "active"),
      eq(campaignCharacter.isNpc, false),
      isNull(campaignCharacter.archivedAt),
    )).limit(1);
  if (!membership || membership.ownerUserId !== playerUserId) return null;
  const [visit] = await tx.select().from(campaignSessionSceneShopVisit).where(and(
    eq(campaignSessionSceneShopVisit.id, membership.visitId),
    eq(campaignSessionSceneShopVisit.sceneId, membership.sceneId),
    eq(campaignSessionSceneShopVisit.sessionId, membership.sessionId),
    eq(campaignSessionSceneShopVisit.campaignId, membership.campaignId),
    eq(campaignSessionSceneShopVisit.status, "active"),
  )).limit(1);
  if (!visit) return null;
  const context = await loadVisitContext(tx, visit.sceneId, visit.shopId);
  if (context.sessionStatus !== "active" || context.sceneStatus !== "active" || context.campaignArchivedAt || context.shopArchivedAt) return null;
  const placement: ShopVisitPlacement = visit.placementKind === "town"
    ? { kind: "town", townId: visit.townId! }
    : { kind: "independent" };
  try {
    await assertEligiblePlacement(tx, context, placement);
  } catch {
    return null;
  }
  return readVisit(tx, visit);
}

async function endVisits(
  tx: ShopVisitTransaction,
  visitIds: readonly number[],
  actorUserId: string,
  reason: string,
): Promise<void> {
  if (!visitIds.length) return;
  const now = new Date();
  for (const visitId of visitIds) {
    await cancelOpenShopRequestsForMembershipsInTransaction(tx, {
      visitId,
      actorUserId,
      reason,
    });
  }
  await tx.update(campaignSessionSceneShopVisitMember).set({
    status: "ended",
    exitedByUserId: actorUserId,
    exitedAt: now,
    exitKind: "lifecycle-ended",
    updatedAt: now,
  }).where(and(
    inArray(campaignSessionSceneShopVisitMember.visitId, [...visitIds]),
    eq(campaignSessionSceneShopVisitMember.status, "active"),
  ));
  await tx.update(campaignSessionSceneShopVisit).set({
    status: "ended",
    endedByUserId: actorUserId,
    endedAt: now,
    endReason: reason,
    updatedAt: now,
  }).where(and(
    inArray(campaignSessionSceneShopVisit.id, [...visitIds]),
    eq(campaignSessionSceneShopVisit.status, "active"),
  ));
}

export async function endActiveShopVisitsForSceneInTransaction(
  tx: ShopVisitTransaction,
  sceneId: number,
  actorUserId: string,
): Promise<void> {
  const rows = await tx.select({ id: campaignSessionSceneShopVisit.id })
    .from(campaignSessionSceneShopVisit).where(and(
      eq(campaignSessionSceneShopVisit.sceneId, positiveId(sceneId, "Scene")),
      eq(campaignSessionSceneShopVisit.status, "active"),
    )).orderBy(asc(campaignSessionSceneShopVisit.id)).for("update");
  await endVisits(tx, rows.map(({ id }) => id), actorUserId, "The Scene was completed.");
}

export async function endActiveShopVisitsForSessionInTransaction(
  tx: ShopVisitTransaction,
  sessionId: number,
  actorUserId: string,
): Promise<void> {
  const rows = await tx.select({ id: campaignSessionSceneShopVisit.id })
    .from(campaignSessionSceneShopVisit).where(and(
      eq(campaignSessionSceneShopVisit.sessionId, positiveId(sessionId, "Session")),
      eq(campaignSessionSceneShopVisit.status, "active"),
    )).orderBy(asc(campaignSessionSceneShopVisit.id)).for("update");
  await endVisits(tx, rows.map(({ id }) => id), actorUserId, "The Session was completed.");
}

export async function assertNoActiveShopVisitForPlacementInTransaction(
  tx: ShopVisitTransaction,
  input: { sceneId: number; shopId?: number; townId?: number; placementKind?: "town" | "independent" },
): Promise<void> {
  const conditions = [
    eq(campaignSessionSceneShopVisit.sceneId, positiveId(input.sceneId, "Scene")),
    eq(campaignSessionSceneShopVisit.status, "active"),
  ];
  if (input.shopId !== undefined) conditions.push(eq(campaignSessionSceneShopVisit.shopId, positiveId(input.shopId, "Shop")));
  if (input.townId !== undefined) conditions.push(eq(campaignSessionSceneShopVisit.townId, positiveId(input.townId, "Town")));
  if (input.placementKind !== undefined) conditions.push(eq(campaignSessionSceneShopVisit.placementKind, input.placementKind));
  const [visit] = await tx.select({ id: campaignSessionSceneShopVisit.id })
    .from(campaignSessionSceneShopVisit).where(and(...conditions)).limit(1).for("update");
  if (visit) throw new Error("End the active Shop visit before hiding, excluding, refreshing, or detaching this placement.");
}

export async function assertNoActiveShopMembershipInTransaction(
  tx: ShopVisitTransaction,
  characterId: number,
): Promise<void> {
  const [membership] = await tx.select({ id: campaignSessionSceneShopVisitMember.id })
    .from(campaignSessionSceneShopVisitMember).where(and(
      eq(campaignSessionSceneShopVisitMember.characterId, positiveId(characterId, "Character")),
      eq(campaignSessionSceneShopVisitMember.status, "active"),
    )).limit(1).for("update");
  if (membership) throw new Error("Remove this Character from their active Shop visit before removing Scene membership.");
}

export async function assertNoActiveShopVisitForSourceInTransaction(
  tx: ShopVisitTransaction,
  input: { shopId?: number; townId?: number },
): Promise<void> {
  if (input.shopId === undefined && input.townId === undefined) throw new Error("Shop visit source is invalid.");
  const conditions = [eq(campaignSessionSceneShopVisit.status, "active")];
  if (input.shopId !== undefined) conditions.push(eq(campaignSessionSceneShopVisit.shopId, positiveId(input.shopId, "Shop")));
  if (input.townId !== undefined) conditions.push(eq(campaignSessionSceneShopVisit.townId, positiveId(input.townId, "Town")));
  const [visit] = await tx.select({ id: campaignSessionSceneShopVisit.id })
    .from(campaignSessionSceneShopVisit).where(and(...conditions)).limit(1).for("update");
  if (visit) throw new Error("End the active Shop visit before archiving this location.");
}

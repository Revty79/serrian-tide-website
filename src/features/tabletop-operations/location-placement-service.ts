import "server-only";

import { and, asc, eq, inArray, isNull, max } from "drizzle-orm";

import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { shop, shopStaffAssignment } from "@/db/shop-schema";
import {
  campaignSessionPreparedShop,
  campaignSessionPreparedTown,
  campaignSessionSceneShop,
  campaignSessionSceneTown,
  campaignSessionSceneTownNpc,
  campaignSessionSceneTownPlace,
  campaignSessionSceneTownShop,
} from "@/db/tabletop-location-schema";
import {
  campaignSession,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  town,
  townNpcAssociation,
  townPlace,
  townShopMembership,
} from "@/db/town-schema";
import { assertNoActiveShopVisitForPlacementInTransaction } from "./shop-visit-service";

import {
  assertParentSessionAllowsScenePreparation,
  assertSceneIsEditable,
} from "./scene-foundation";
import { assertCampaignSessionOwner } from "./session-foundation";
import { assertSessionRosterEditable } from "./session-roster";

export type LocationPlacementTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LocationStaffView = Readonly<{
  npcCharacterId: number;
  name: string;
  npcKind: "race" | "creature";
  npcBuildMode: "simple" | "detailed";
  roleLabel: string;
  responsibilityLabel: string;
  isPrimaryContact: boolean;
  shopId: number;
  archived: boolean;
}>;

export type LocationShopView = Readonly<{
  id: number;
  name: string;
  category: string;
  description: string;
  storefrontState: "open" | "closed";
  archived: boolean;
  townId: number | null;
  townName: string | null;
  staff: readonly LocationStaffView[];
}>;

export type LocationPlaceView = Readonly<{
  id: number;
  name: string;
  category: string;
  description: string;
  archived: boolean;
}>;

export type LocationNpcView = Readonly<{
  id: number;
  name: string;
  npcKind: "race" | "creature";
  npcBuildMode: "simple" | "detailed";
  roleLabel: string;
  archived: boolean;
  relationshipLabel: string;
  staff: readonly Pick<LocationStaffView, "shopId" | "responsibilityLabel" | "isPrimaryContact">[];
}>;

export type LocationTownOption = Readonly<{
  id: number;
  name: string;
  category: string;
  overview: string;
  archived: boolean;
  shops: readonly LocationShopView[];
  places: readonly LocationPlaceView[];
  npcs: readonly LocationNpcView[];
}>;

export type SceneTownPlacementView = Readonly<{
  town: Pick<LocationTownOption, "id" | "name" | "category" | "overview" | "archived">;
  sortOrder: number;
  revealed: boolean;
  shops: readonly (LocationShopView & { included: boolean; revealed: boolean; sortOrder: number })[];
  places: readonly (LocationPlaceView & { included: boolean; revealed: boolean; sortOrder: number })[];
  npcs: readonly (LocationNpcView & { included: boolean; revealed: boolean; sortOrder: number })[];
}>;

export type SceneShopPlacementView = Readonly<{
  shop: LocationShopView;
  sortOrder: number;
  revealed: boolean;
}>;

export type LocationPlacementWorkspace = Readonly<{
  sessionId: number;
  campaignId: number;
  sessionEditable: boolean;
  sceneEditable: boolean;
  preparedTownIds: readonly number[];
  preparedShopIds: readonly number[];
  towns: readonly LocationTownOption[];
  shops: readonly LocationShopView[];
  selectedSceneId: number | null;
  sceneTowns: readonly SceneTownPlacementView[];
  sceneShops: readonly SceneShopPlacementView[];
}>;

export type TownPlacementSelection = Readonly<{
  shopIds?: readonly number[];
  placeIds?: readonly number[];
  npcCharacterIds?: readonly number[];
}>;

export type TownRefreshPreview = Readonly<{
  townId: number;
  townName: string;
  shopAdditions: readonly { id: number; name: string }[];
  shopRemovals: readonly { id: number; name: string }[];
  placeAdditions: readonly { id: number; name: string }[];
  placeRemovals: readonly { id: number; name: string }[];
  npcAdditions: readonly { id: number; name: string }[];
  npcRemovals: readonly { id: number; name: string }[];
}>;

type SessionContext = {
  id: number;
  campaignId: number;
  status: "planned" | "active" | "completed";
  ownerUserId: string;
};

type SceneContext = SessionContext & {
  sceneId: number;
  sceneStatus: "planned" | "active" | "completed";
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function normalizeIds(values: readonly number[] | undefined, label: string): number[] | null {
  if (values === undefined) return null;
  const ids = values.map((value) => positiveId(value, label));
  if (new Set(ids).size !== ids.length) throw new Error(`${label} selection contains duplicates.`);
  return ids;
}

function assertSubset(selected: readonly number[] | null, eligible: ReadonlySet<number>, label: string): Set<number> {
  const ids = selected ?? [...eligible];
  if (ids.some((id) => !eligible.has(id))) {
    throw new Error(`${label} selection contains an unavailable or cross-Campaign record.`);
  }
  return new Set(ids);
}

async function lockOwnedSession(
  tx: LocationPlacementTransaction,
  sessionId: number,
  actingUserId: string,
): Promise<SessionContext> {
  const [row] = await tx.select({
    id: campaignSession.id,
    campaignId: campaignSession.campaignId,
    status: campaignSession.status,
    ownerUserId: campaign.createdByUserId,
  }).from(campaignSession)
    .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
    .where(eq(campaignSession.id, positiveId(sessionId, "Session")))
    .limit(1)
    .for("update");
  if (!row) throw new Error("That Session no longer exists.");
  assertCampaignSessionOwner(row.ownerUserId, actingUserId);
  return row;
}

async function lockOwnedScene(
  tx: LocationPlacementTransaction,
  sceneId: number,
  actingUserId: string,
): Promise<SceneContext> {
  const [row] = await tx.select({
    id: campaignSession.id,
    campaignId: campaignSession.campaignId,
    status: campaignSession.status,
    ownerUserId: campaign.createdByUserId,
    sceneId: campaignSessionScene.id,
    sceneStatus: campaignSessionScene.status,
  }).from(campaignSessionScene)
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionScene.sessionId),
      eq(campaignSession.campaignId, campaignSessionScene.campaignId),
    ))
    .innerJoin(campaign, eq(campaign.id, campaignSessionScene.campaignId))
    .where(eq(campaignSessionScene.id, positiveId(sceneId, "Scene")))
    .limit(1)
    .for("update");
  if (!row) throw new Error("That Scene no longer exists.");
  assertCampaignSessionOwner(row.ownerUserId, actingUserId);
  return row;
}

async function requireEligibleTown(
  tx: LocationPlacementTransaction,
  townId: number,
  campaignId: number,
) {
  const [row] = await tx.select({
    id: town.id,
    name: town.name,
    category: town.category,
    overview: town.overview,
  }).from(town).where(and(
    eq(town.id, positiveId(townId, "Town")),
    eq(town.campaignId, campaignId),
    isNull(town.archivedAt),
  )).limit(1);
  if (!row) throw new Error("Only an active Town from this Campaign can be prepared or placed.");
  return row;
}

async function requireEligibleShop(
  tx: LocationPlacementTransaction,
  shopId: number,
  campaignId: number,
) {
  const [row] = await tx.select({
    id: shop.id,
    name: shop.name,
    storefrontState: shop.storefrontState,
  }).from(shop).where(and(
    eq(shop.id, positiveId(shopId, "Shop")),
    eq(shop.campaignId, campaignId),
    isNull(shop.archivedAt),
  )).limit(1);
  if (!row) throw new Error("Only an active Shop from this Campaign can be prepared or placed.");
  return row;
}

async function ensurePreparedTown(
  tx: LocationPlacementTransaction,
  context: SessionContext,
  townId: number,
): Promise<void> {
  const [last] = await tx.select({ value: max(campaignSessionPreparedTown.sortOrder) })
    .from(campaignSessionPreparedTown)
    .where(eq(campaignSessionPreparedTown.sessionId, context.id));
  await tx.insert(campaignSessionPreparedTown).values({
    sessionId: context.id,
    campaignId: context.campaignId,
    townId,
    sortOrder: (last?.value ?? -1) + 1,
  }).onConflictDoNothing();
}

async function ensurePreparedShop(
  tx: LocationPlacementTransaction,
  context: SessionContext,
  shopId: number,
): Promise<void> {
  const [last] = await tx.select({ value: max(campaignSessionPreparedShop.sortOrder) })
    .from(campaignSessionPreparedShop)
    .where(eq(campaignSessionPreparedShop.sessionId, context.id));
  await tx.insert(campaignSessionPreparedShop).values({
    sessionId: context.id,
    campaignId: context.campaignId,
    shopId,
    sortOrder: (last?.value ?? -1) + 1,
  }).onConflictDoNothing();
}

type EligibleTownContents = {
  shops: { id: number; name: string; sortOrder: number }[];
  places: { id: number; name: string; sortOrder: number }[];
  npcs: { id: number; name: string; sortOrder: number }[];
};

async function loadEligibleTownContents(
  tx: LocationPlacementTransaction,
  townId: number,
  campaignId: number,
): Promise<EligibleTownContents> {
  const shopRows = await tx.select({
    id: shop.id,
    name: shop.name,
    sortOrder: townShopMembership.sortOrder,
  }).from(townShopMembership)
    .innerJoin(shop, and(
      eq(shop.id, townShopMembership.shopId),
      eq(shop.campaignId, townShopMembership.campaignId),
    ))
    .where(and(
      eq(townShopMembership.townId, townId),
      eq(townShopMembership.campaignId, campaignId),
      isNull(shop.archivedAt),
    )).orderBy(asc(townShopMembership.sortOrder), asc(shop.name), asc(shop.id));
  const placeRows = await tx.select({
    id: townPlace.id,
    name: townPlace.name,
    sortOrder: townPlace.sortOrder,
  }).from(townPlace).where(and(
    eq(townPlace.townId, townId),
    eq(townPlace.campaignId, campaignId),
    isNull(townPlace.archivedAt),
  )).orderBy(asc(townPlace.sortOrder), asc(townPlace.name), asc(townPlace.id));
  const directNpcs = await tx.select({
    id: campaignCharacter.id,
    name: campaignCharacter.name,
    sortOrder: townNpcAssociation.sortOrder,
  }).from(townNpcAssociation)
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, townNpcAssociation.npcCharacterId),
      eq(campaignCharacter.campaignId, townNpcAssociation.campaignId),
    ))
    .where(and(
      eq(townNpcAssociation.townId, townId),
      eq(townNpcAssociation.campaignId, campaignId),
      eq(campaignCharacter.isNpc, true),
      inArray(campaignCharacter.npcKind, ["race", "creature"]),
      inArray(campaignCharacter.npcBuildMode, ["simple", "detailed"]),
      isNull(campaignCharacter.archivedAt),
    )).orderBy(asc(townNpcAssociation.sortOrder), asc(campaignCharacter.name), asc(campaignCharacter.id));
  const linkedShopIds = shopRows.map(({ id }) => id);
  const staffNpcs = linkedShopIds.length ? await tx.select({
    id: campaignCharacter.id,
    name: campaignCharacter.name,
    shopOrder: townShopMembership.sortOrder,
    staffOrder: shopStaffAssignment.sortOrder,
  }).from(shopStaffAssignment)
    .innerJoin(townShopMembership, and(
      eq(townShopMembership.shopId, shopStaffAssignment.shopId),
      eq(townShopMembership.campaignId, shopStaffAssignment.campaignId),
    ))
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, shopStaffAssignment.npcCharacterId),
      eq(campaignCharacter.campaignId, shopStaffAssignment.campaignId),
    ))
    .where(and(
      eq(townShopMembership.townId, townId),
      eq(shopStaffAssignment.campaignId, campaignId),
      inArray(shopStaffAssignment.shopId, linkedShopIds),
      eq(campaignCharacter.isNpc, true),
      inArray(campaignCharacter.npcKind, ["race", "creature"]),
      inArray(campaignCharacter.npcBuildMode, ["simple", "detailed"]),
      isNull(campaignCharacter.archivedAt),
    )).orderBy(
      asc(townShopMembership.sortOrder),
      asc(shopStaffAssignment.sortOrder),
      asc(campaignCharacter.name),
      asc(campaignCharacter.id),
    ) : [];
  const npcs = new Map<number, { id: number; name: string; sortOrder: number }>();
  for (const row of directNpcs) npcs.set(row.id, row);
  let nextOrder = directNpcs.reduce((value, row) => Math.max(value, row.sortOrder + 1), 0);
  for (const row of staffNpcs) {
    if (!npcs.has(row.id)) npcs.set(row.id, { id: row.id, name: row.name, sortOrder: nextOrder++ });
  }
  return { shops: shopRows, places: placeRows, npcs: [...npcs.values()] };
}

async function ensureNpcMemberships(
  tx: LocationPlacementTransaction,
  context: SceneContext,
  npcCharacterIds: readonly number[],
): Promise<void> {
  if (!npcCharacterIds.length) return;
  const [rosterLast] = await tx.select({ value: max(campaignSessionRoster.sortOrder) })
    .from(campaignSessionRoster).where(eq(campaignSessionRoster.sessionId, context.id));
  let rosterOrder = (rosterLast?.value ?? -1) + 1;
  for (const characterId of npcCharacterIds) {
    const inserted = await tx.insert(campaignSessionRoster).values({
      sessionId: context.id,
      campaignId: context.campaignId,
      characterId,
      sortOrder: rosterOrder,
    }).onConflictDoNothing().returning({ characterId: campaignSessionRoster.characterId });
    if (inserted.length) rosterOrder += 1;
  }
  const [sceneLast] = await tx.select({ value: max(campaignSessionSceneMember.sortOrder) })
    .from(campaignSessionSceneMember).where(eq(campaignSessionSceneMember.sceneId, context.sceneId));
  let sceneOrder = (sceneLast?.value ?? -1) + 1;
  for (const characterId of npcCharacterIds) {
    const inserted = await tx.insert(campaignSessionSceneMember).values({
      sceneId: context.sceneId,
      sessionId: context.id,
      campaignId: context.campaignId,
      characterId,
      sortOrder: sceneOrder,
    }).onConflictDoNothing().returning({ characterId: campaignSessionSceneMember.characterId });
    if (inserted.length) sceneOrder += 1;
  }
}

export async function prepareTownInTransaction(
  tx: LocationPlacementTransaction,
  sessionId: number,
  townId: number,
  actingUserId: string,
): Promise<SessionContext> {
  const context = await lockOwnedSession(tx, sessionId, actingUserId);
  assertSessionRosterEditable(context.status);
  await requireEligibleTown(tx, townId, context.campaignId);
  await ensurePreparedTown(tx, context, townId);
  return context;
}

export async function prepareShopInTransaction(
  tx: LocationPlacementTransaction,
  sessionId: number,
  shopId: number,
  actingUserId: string,
): Promise<SessionContext> {
  const context = await lockOwnedSession(tx, sessionId, actingUserId);
  assertSessionRosterEditable(context.status);
  await requireEligibleShop(tx, shopId, context.campaignId);
  await ensurePreparedShop(tx, context, shopId);
  return context;
}

export async function removePreparedTownInTransaction(
  tx: LocationPlacementTransaction,
  sessionId: number,
  townId: number,
  actingUserId: string,
): Promise<SessionContext> {
  const context = await lockOwnedSession(tx, sessionId, actingUserId);
  assertSessionRosterEditable(context.status);
  const [placement] = await tx.select({ sceneId: campaignSessionSceneTown.sceneId })
    .from(campaignSessionSceneTown)
    .where(and(
      eq(campaignSessionSceneTown.sessionId, context.id),
      eq(campaignSessionSceneTown.townId, positiveId(townId, "Town")),
    )).limit(1);
  if (placement) throw new Error("This Town is placed in a Scene. Detach each Scene placement before removing it from Session preparation.");
  const removed = await tx.delete(campaignSessionPreparedTown).where(and(
    eq(campaignSessionPreparedTown.sessionId, context.id),
    eq(campaignSessionPreparedTown.townId, townId),
  )).returning({ townId: campaignSessionPreparedTown.townId });
  if (!removed.length) throw new Error("That Town is not prepared for this Session.");
  return context;
}

export async function removePreparedShopInTransaction(
  tx: LocationPlacementTransaction,
  sessionId: number,
  shopId: number,
  actingUserId: string,
): Promise<SessionContext> {
  const context = await lockOwnedSession(tx, sessionId, actingUserId);
  assertSessionRosterEditable(context.status);
  const [placement] = await tx.select({ sceneId: campaignSessionSceneShop.sceneId })
    .from(campaignSessionSceneShop)
    .where(and(
      eq(campaignSessionSceneShop.sessionId, context.id),
      eq(campaignSessionSceneShop.shopId, positiveId(shopId, "Shop")),
    )).limit(1);
  if (placement) throw new Error("This Shop is independently placed in a Scene. Detach each Scene placement before removing it from Session preparation.");
  const removed = await tx.delete(campaignSessionPreparedShop).where(and(
    eq(campaignSessionPreparedShop.sessionId, context.id),
    eq(campaignSessionPreparedShop.shopId, shopId),
  )).returning({ shopId: campaignSessionPreparedShop.shopId });
  if (!removed.length) throw new Error("That Shop is not prepared for this Session.");
  return context;
}

export async function placeTownInSceneInTransaction(
  tx: LocationPlacementTransaction,
  sceneId: number,
  townId: number,
  selection: TownPlacementSelection,
  actingUserId: string,
): Promise<SceneContext & { created: boolean }> {
  const context = await lockOwnedScene(tx, sceneId, actingUserId);
  assertSceneIsEditable(context.sceneStatus, context.status);
  await requireEligibleTown(tx, townId, context.campaignId);
  const contents = await loadEligibleTownContents(tx, townId, context.campaignId);
  const selectedShops = assertSubset(
    normalizeIds(selection.shopIds, "Town Shop"),
    new Set(contents.shops.map(({ id }) => id)),
    "Town Shop",
  );
  const selectedPlaces = assertSubset(
    normalizeIds(selection.placeIds, "Town place"),
    new Set(contents.places.map(({ id }) => id)),
    "Town place",
  );
  const selectedNpcs = assertSubset(
    normalizeIds(selection.npcCharacterIds, "Town NPC"),
    new Set(contents.npcs.map(({ id }) => id)),
    "Town NPC",
  );
  await ensurePreparedTown(tx, context, townId);
  const [last] = await tx.select({ value: max(campaignSessionSceneTown.sortOrder) })
    .from(campaignSessionSceneTown).where(eq(campaignSessionSceneTown.sceneId, context.sceneId));
  const inserted = await tx.insert(campaignSessionSceneTown).values({
    sceneId: context.sceneId,
    sessionId: context.id,
    campaignId: context.campaignId,
    townId,
    sortOrder: (last?.value ?? -1) + 1,
  }).onConflictDoNothing().returning({ townId: campaignSessionSceneTown.townId });
  if (!inserted.length) return { ...context, created: false };
  if (contents.shops.length) await tx.insert(campaignSessionSceneTownShop).values(contents.shops.map((entry) => ({
    sceneId: context.sceneId,
    sessionId: context.id,
    campaignId: context.campaignId,
    townId,
    shopId: entry.id,
    included: selectedShops.has(entry.id),
    sortOrder: entry.sortOrder,
  })));
  if (contents.places.length) await tx.insert(campaignSessionSceneTownPlace).values(contents.places.map((entry) => ({
    sceneId: context.sceneId,
    sessionId: context.id,
    campaignId: context.campaignId,
    townId,
    placeId: entry.id,
    included: selectedPlaces.has(entry.id),
    sortOrder: entry.sortOrder,
  })));
  if (contents.npcs.length) await tx.insert(campaignSessionSceneTownNpc).values(contents.npcs.map((entry) => ({
    sceneId: context.sceneId,
    sessionId: context.id,
    campaignId: context.campaignId,
    townId,
    npcCharacterId: entry.id,
    included: selectedNpcs.has(entry.id),
    sortOrder: entry.sortOrder,
  })));
  await ensureNpcMemberships(tx, context, contents.npcs.filter(({ id }) => selectedNpcs.has(id)).map(({ id }) => id));
  return { ...context, created: true };
}

export async function placeShopInSceneInTransaction(
  tx: LocationPlacementTransaction,
  sceneId: number,
  shopId: number,
  actingUserId: string,
): Promise<SceneContext & { created: boolean }> {
  const context = await lockOwnedScene(tx, sceneId, actingUserId);
  assertSceneIsEditable(context.sceneStatus, context.status);
  await requireEligibleShop(tx, shopId, context.campaignId);
  await ensurePreparedShop(tx, context, shopId);
  const [last] = await tx.select({ value: max(campaignSessionSceneShop.sortOrder) })
    .from(campaignSessionSceneShop).where(eq(campaignSessionSceneShop.sceneId, context.sceneId));
  const inserted = await tx.insert(campaignSessionSceneShop).values({
    sceneId: context.sceneId,
    sessionId: context.id,
    campaignId: context.campaignId,
    shopId,
    sortOrder: (last?.value ?? -1) + 1,
  }).onConflictDoNothing().returning({ shopId: campaignSessionSceneShop.shopId });
  return { ...context, created: inserted.length === 1 };
}

export async function createSceneFromTownInTransaction(
  tx: LocationPlacementTransaction,
  sessionId: number,
  townId: number,
  selection: TownPlacementSelection,
  actingUserId: string,
): Promise<{ sceneId: number; sessionId: number; campaignId: number }> {
  const session = await lockOwnedSession(tx, sessionId, actingUserId);
  assertParentSessionAllowsScenePreparation(session.status);
  const source = await requireEligibleTown(tx, townId, session.campaignId);
  const [last] = await tx.select({ value: max(campaignSessionScene.sequenceNumber) })
    .from(campaignSessionScene).where(eq(campaignSessionScene.sessionId, session.id));
  const [scene] = await tx.insert(campaignSessionScene).values({
    sessionId: session.id,
    campaignId: session.campaignId,
    sequenceNumber: (last?.value ?? 0) + 1,
    title: source.name,
    locationLabel: source.name,
    description: source.overview,
    godNotes: "",
  }).returning({ id: campaignSessionScene.id });
  if (!scene) throw new Error("The Scene could not be created from this Town.");
  await placeTownInSceneInTransaction(tx, scene.id, townId, selection, actingUserId);
  return { sceneId: scene.id, sessionId: session.id, campaignId: session.campaignId };
}

export async function detachTownFromSceneInTransaction(
  tx: LocationPlacementTransaction,
  sceneId: number,
  townId: number,
  actingUserId: string,
): Promise<SceneContext> {
  const context = await lockOwnedScene(tx, sceneId, actingUserId);
  assertSceneIsEditable(context.sceneStatus, context.status);
  await assertNoActiveShopVisitForPlacementInTransaction(tx, { sceneId: context.sceneId, townId });
  const removed = await tx.delete(campaignSessionSceneTown).where(and(
    eq(campaignSessionSceneTown.sceneId, context.sceneId),
    eq(campaignSessionSceneTown.townId, positiveId(townId, "Town")),
  )).returning({ townId: campaignSessionSceneTown.townId });
  if (!removed.length) throw new Error("That Town is not placed in this Scene.");
  return context;
}

export async function detachShopFromSceneInTransaction(
  tx: LocationPlacementTransaction,
  sceneId: number,
  shopId: number,
  actingUserId: string,
): Promise<SceneContext> {
  const context = await lockOwnedScene(tx, sceneId, actingUserId);
  assertSceneIsEditable(context.sceneStatus, context.status);
  await assertNoActiveShopVisitForPlacementInTransaction(tx, { sceneId: context.sceneId, shopId, placementKind: "independent" });
  const removed = await tx.delete(campaignSessionSceneShop).where(and(
    eq(campaignSessionSceneShop.sceneId, context.sceneId),
    eq(campaignSessionSceneShop.shopId, positiveId(shopId, "Shop")),
  )).returning({ shopId: campaignSessionSceneShop.shopId });
  if (!removed.length) throw new Error("That Shop is not independently placed in this Scene.");
  return context;
}

type TownChildKind = "shop" | "place" | "npc";

export async function setTownPlacementVisibilityInTransaction(
  tx: LocationPlacementTransaction,
  sceneId: number,
  townId: number,
  revealed: boolean,
  revealIncludedContents: boolean,
  actingUserId: string,
): Promise<SceneContext> {
  const context = await lockOwnedScene(tx, sceneId, actingUserId);
  assertSceneIsEditable(context.sceneStatus, context.status);
  if (!revealed) await assertNoActiveShopVisitForPlacementInTransaction(tx, { sceneId: context.sceneId, townId });
  const updated = await tx.update(campaignSessionSceneTown).set({ revealed, updatedAt: new Date() }).where(and(
    eq(campaignSessionSceneTown.sceneId, context.sceneId),
    eq(campaignSessionSceneTown.townId, positiveId(townId, "Town")),
  )).returning({ townId: campaignSessionSceneTown.townId });
  if (!updated.length) throw new Error("That Town is not placed in this Scene.");
  if (revealed && revealIncludedContents) {
    await tx.update(campaignSessionSceneTownShop).set({ revealed: true, updatedAt: new Date() }).where(and(
      eq(campaignSessionSceneTownShop.sceneId, context.sceneId),
      eq(campaignSessionSceneTownShop.townId, townId),
      eq(campaignSessionSceneTownShop.included, true),
    ));
    await tx.update(campaignSessionSceneTownPlace).set({ revealed: true, updatedAt: new Date() }).where(and(
      eq(campaignSessionSceneTownPlace.sceneId, context.sceneId),
      eq(campaignSessionSceneTownPlace.townId, townId),
      eq(campaignSessionSceneTownPlace.included, true),
    ));
    await tx.update(campaignSessionSceneTownNpc).set({ revealed: true, updatedAt: new Date() }).where(and(
      eq(campaignSessionSceneTownNpc.sceneId, context.sceneId),
      eq(campaignSessionSceneTownNpc.townId, townId),
      eq(campaignSessionSceneTownNpc.included, true),
    ));
  }
  return context;
}

export async function setTownChildStateInTransaction(
  tx: LocationPlacementTransaction,
  input: {
    sceneId: number;
    townId: number;
    kind: TownChildKind;
    childId: number;
    included: boolean;
    revealed: boolean;
  },
  actingUserId: string,
): Promise<SceneContext> {
  const context = await lockOwnedScene(tx, input.sceneId, actingUserId);
  assertSceneIsEditable(context.sceneStatus, context.status);
  positiveId(input.townId, "Town");
  positiveId(input.childId, input.kind === "npc" ? "NPC" : input.kind === "shop" ? "Shop" : "Place");
  if (input.kind === "shop" && (!input.included || !input.revealed)) {
    await assertNoActiveShopVisitForPlacementInTransaction(tx, { sceneId: context.sceneId, townId: input.townId, shopId: input.childId });
  }
  const values = { included: input.included, revealed: input.included && input.revealed, updatedAt: new Date() };
  const result = input.kind === "shop"
    ? await tx.update(campaignSessionSceneTownShop).set(values).where(and(
        eq(campaignSessionSceneTownShop.sceneId, context.sceneId),
        eq(campaignSessionSceneTownShop.townId, input.townId),
        eq(campaignSessionSceneTownShop.shopId, input.childId),
      )).returning({ id: campaignSessionSceneTownShop.shopId })
    : input.kind === "place"
      ? await tx.update(campaignSessionSceneTownPlace).set(values).where(and(
          eq(campaignSessionSceneTownPlace.sceneId, context.sceneId),
          eq(campaignSessionSceneTownPlace.townId, input.townId),
          eq(campaignSessionSceneTownPlace.placeId, input.childId),
        )).returning({ id: campaignSessionSceneTownPlace.placeId })
      : await tx.update(campaignSessionSceneTownNpc).set(values).where(and(
          eq(campaignSessionSceneTownNpc.sceneId, context.sceneId),
          eq(campaignSessionSceneTownNpc.townId, input.townId),
          eq(campaignSessionSceneTownNpc.npcCharacterId, input.childId),
        )).returning({ id: campaignSessionSceneTownNpc.npcCharacterId });
  if (!result.length) throw new Error("That Town content reference is not part of this Scene placement.");
  if (input.kind === "npc" && input.included) await ensureNpcMemberships(tx, context, [input.childId]);
  return context;
}

export async function setShopPlacementVisibilityInTransaction(
  tx: LocationPlacementTransaction,
  sceneId: number,
  shopId: number,
  revealed: boolean,
  actingUserId: string,
): Promise<SceneContext> {
  const context = await lockOwnedScene(tx, sceneId, actingUserId);
  assertSceneIsEditable(context.sceneStatus, context.status);
  if (!revealed) await assertNoActiveShopVisitForPlacementInTransaction(tx, { sceneId: context.sceneId, shopId, placementKind: "independent" });
  const updated = await tx.update(campaignSessionSceneShop).set({ revealed, updatedAt: new Date() }).where(and(
    eq(campaignSessionSceneShop.sceneId, context.sceneId),
    eq(campaignSessionSceneShop.shopId, positiveId(shopId, "Shop")),
  )).returning({ shopId: campaignSessionSceneShop.shopId });
  if (!updated.length) throw new Error("That Shop is not independently placed in this Scene.");
  return context;
}

async function loadRefreshPreview(
  tx: LocationPlacementTransaction,
  sceneId: number,
  townId: number,
  campaignId: number,
): Promise<TownRefreshPreview> {
  const [placement] = await tx.select({ name: town.name })
    .from(campaignSessionSceneTown)
    .innerJoin(town, and(
      eq(town.id, campaignSessionSceneTown.townId),
      eq(town.campaignId, campaignSessionSceneTown.campaignId),
    ))
    .where(and(
      eq(campaignSessionSceneTown.sceneId, sceneId),
      eq(campaignSessionSceneTown.townId, townId),
      eq(campaignSessionSceneTown.campaignId, campaignId),
    )).limit(1);
  if (!placement) throw new Error("That Town is not placed in this Scene.");
  const eligible = await loadEligibleTownContents(tx, townId, campaignId);
  const currentShops = await tx.select({ id: campaignSessionSceneTownShop.shopId, name: shop.name })
      .from(campaignSessionSceneTownShop)
      .innerJoin(shop, eq(shop.id, campaignSessionSceneTownShop.shopId))
      .where(and(eq(campaignSessionSceneTownShop.sceneId, sceneId), eq(campaignSessionSceneTownShop.townId, townId)));
  const currentPlaces = await tx.select({ id: campaignSessionSceneTownPlace.placeId, name: townPlace.name })
      .from(campaignSessionSceneTownPlace)
      .innerJoin(townPlace, eq(townPlace.id, campaignSessionSceneTownPlace.placeId))
      .where(and(eq(campaignSessionSceneTownPlace.sceneId, sceneId), eq(campaignSessionSceneTownPlace.townId, townId)));
  const currentNpcs = await tx.select({ id: campaignSessionSceneTownNpc.npcCharacterId, name: campaignCharacter.name })
      .from(campaignSessionSceneTownNpc)
      .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionSceneTownNpc.npcCharacterId))
      .where(and(eq(campaignSessionSceneTownNpc.sceneId, sceneId), eq(campaignSessionSceneTownNpc.townId, townId)));
  const diff = (
    next: readonly { id: number; name: string }[],
    current: readonly { id: number; name: string }[],
  ) => {
    const nextIds = new Set(next.map(({ id }) => id));
    const currentIds = new Set(current.map(({ id }) => id));
    return {
      additions: next.filter(({ id }) => !currentIds.has(id)),
      removals: current.filter(({ id }) => !nextIds.has(id)),
    };
  };
  const shopDiff = diff(eligible.shops, currentShops);
  const placeDiff = diff(eligible.places, currentPlaces);
  const npcDiff = diff(eligible.npcs, currentNpcs);
  return {
    townId,
    townName: placement.name,
    shopAdditions: shopDiff.additions,
    shopRemovals: shopDiff.removals,
    placeAdditions: placeDiff.additions,
    placeRemovals: placeDiff.removals,
    npcAdditions: npcDiff.additions,
    npcRemovals: npcDiff.removals,
  };
}

export async function previewTownRefreshInTransaction(
  tx: LocationPlacementTransaction,
  sceneId: number,
  townId: number,
  actingUserId: string,
): Promise<TownRefreshPreview> {
  const context = await lockOwnedScene(tx, sceneId, actingUserId);
  assertSceneIsEditable(context.sceneStatus, context.status);
  return loadRefreshPreview(tx, context.sceneId, positiveId(townId, "Town"), context.campaignId);
}

export async function applyTownRefreshInTransaction(
  tx: LocationPlacementTransaction,
  sceneId: number,
  townId: number,
  actingUserId: string,
): Promise<SceneContext & { preview: TownRefreshPreview }> {
  const context = await lockOwnedScene(tx, sceneId, actingUserId);
  assertSceneIsEditable(context.sceneStatus, context.status);
  const normalizedTownId = positiveId(townId, "Town");
  const preview = await loadRefreshPreview(tx, context.sceneId, normalizedTownId, context.campaignId);
  for (const entry of preview.shopRemovals) await assertNoActiveShopVisitForPlacementInTransaction(tx, {
    sceneId: context.sceneId,
    townId: normalizedTownId,
    shopId: entry.id,
  });
  const eligible = await loadEligibleTownContents(tx, normalizedTownId, context.campaignId);
  for (const entry of preview.shopRemovals) await tx.delete(campaignSessionSceneTownShop).where(and(
    eq(campaignSessionSceneTownShop.sceneId, context.sceneId),
    eq(campaignSessionSceneTownShop.townId, normalizedTownId),
    eq(campaignSessionSceneTownShop.shopId, entry.id),
  ));
  for (const entry of preview.placeRemovals) await tx.delete(campaignSessionSceneTownPlace).where(and(
    eq(campaignSessionSceneTownPlace.sceneId, context.sceneId),
    eq(campaignSessionSceneTownPlace.townId, normalizedTownId),
    eq(campaignSessionSceneTownPlace.placeId, entry.id),
  ));
  for (const entry of preview.npcRemovals) await tx.delete(campaignSessionSceneTownNpc).where(and(
    eq(campaignSessionSceneTownNpc.sceneId, context.sceneId),
    eq(campaignSessionSceneTownNpc.townId, normalizedTownId),
    eq(campaignSessionSceneTownNpc.npcCharacterId, entry.id),
  ));
  const shopById = new Map(eligible.shops.map((entry) => [entry.id, entry]));
  const placeById = new Map(eligible.places.map((entry) => [entry.id, entry]));
  const npcById = new Map(eligible.npcs.map((entry) => [entry.id, entry]));
  if (preview.shopAdditions.length) await tx.insert(campaignSessionSceneTownShop).values(preview.shopAdditions.map(({ id }) => ({
    sceneId: context.sceneId, sessionId: context.id, campaignId: context.campaignId,
    townId: normalizedTownId, shopId: id, included: true, revealed: false,
    sortOrder: shopById.get(id)?.sortOrder ?? 0,
  }))).onConflictDoNothing();
  if (preview.placeAdditions.length) await tx.insert(campaignSessionSceneTownPlace).values(preview.placeAdditions.map(({ id }) => ({
    sceneId: context.sceneId, sessionId: context.id, campaignId: context.campaignId,
    townId: normalizedTownId, placeId: id, included: true, revealed: false,
    sortOrder: placeById.get(id)?.sortOrder ?? 0,
  }))).onConflictDoNothing();
  if (preview.npcAdditions.length) await tx.insert(campaignSessionSceneTownNpc).values(preview.npcAdditions.map(({ id }) => ({
    sceneId: context.sceneId, sessionId: context.id, campaignId: context.campaignId,
    townId: normalizedTownId, npcCharacterId: id, included: true, revealed: false,
    sortOrder: npcById.get(id)?.sortOrder ?? 0,
  }))).onConflictDoNothing();
  await ensureNpcMemberships(tx, context, preview.npcAdditions.map(({ id }) => id));
  return { ...context, preview };
}

async function readCatalog(
  tx: LocationPlacementTransaction,
  campaignId: number,
): Promise<{ towns: LocationTownOption[]; shops: LocationShopView[] }> {
  const townRows = await tx.select({ id: town.id, name: town.name, category: town.category, overview: town.overview, archivedAt: town.archivedAt })
      .from(town).where(eq(town.campaignId, campaignId)).orderBy(asc(town.name), asc(town.id));
  const shopRows = await tx.select({ id: shop.id, name: shop.name, category: shop.category, description: shop.description, storefrontState: shop.storefrontState, archivedAt: shop.archivedAt })
      .from(shop).where(eq(shop.campaignId, campaignId)).orderBy(asc(shop.name), asc(shop.id));
  const memberships = await tx.select({ townId: townShopMembership.townId, shopId: townShopMembership.shopId, sortOrder: townShopMembership.sortOrder, townName: town.name })
      .from(townShopMembership).innerJoin(town, eq(town.id, townShopMembership.townId))
      .where(eq(townShopMembership.campaignId, campaignId)).orderBy(asc(townShopMembership.sortOrder), asc(townShopMembership.id));
  const placeRows = await tx.select({ id: townPlace.id, townId: townPlace.townId, name: townPlace.name, category: townPlace.category, description: townPlace.description, archivedAt: townPlace.archivedAt, sortOrder: townPlace.sortOrder })
      .from(townPlace).where(eq(townPlace.campaignId, campaignId)).orderBy(asc(townPlace.sortOrder), asc(townPlace.id));
  const associationRows = await tx.select({ townId: townNpcAssociation.townId, npcCharacterId: campaignCharacter.id, name: campaignCharacter.name, npcKind: campaignCharacter.npcKind, npcBuildMode: campaignCharacter.npcBuildMode, roleLabel: campaignCharacter.npcRoleLabel, archivedAt: campaignCharacter.archivedAt, relationshipLabel: townNpcAssociation.relationshipLabel, sortOrder: townNpcAssociation.sortOrder })
      .from(townNpcAssociation).innerJoin(campaignCharacter, and(eq(campaignCharacter.id, townNpcAssociation.npcCharacterId), eq(campaignCharacter.campaignId, townNpcAssociation.campaignId)))
      .where(eq(townNpcAssociation.campaignId, campaignId)).orderBy(asc(townNpcAssociation.sortOrder), asc(townNpcAssociation.id));
  const staffRows = await tx.select({ shopId: shopStaffAssignment.shopId, npcCharacterId: campaignCharacter.id, name: campaignCharacter.name, npcKind: campaignCharacter.npcKind, npcBuildMode: campaignCharacter.npcBuildMode, roleLabel: campaignCharacter.npcRoleLabel, archivedAt: campaignCharacter.archivedAt, responsibilityLabel: shopStaffAssignment.responsibilityLabel, isPrimaryContact: shopStaffAssignment.isPrimaryContact, sortOrder: shopStaffAssignment.sortOrder })
      .from(shopStaffAssignment).innerJoin(campaignCharacter, and(eq(campaignCharacter.id, shopStaffAssignment.npcCharacterId), eq(campaignCharacter.campaignId, shopStaffAssignment.campaignId)))
      .where(eq(shopStaffAssignment.campaignId, campaignId)).orderBy(asc(shopStaffAssignment.sortOrder), asc(shopStaffAssignment.id));
  const townMembershipByShop = new Map(memberships.map((row) => [row.shopId, row]));
  const staffByShop = new Map<number, LocationStaffView[]>();
  for (const row of staffRows) {
    if (row.npcBuildMode !== "simple" && row.npcBuildMode !== "detailed") continue;
    if (row.npcKind !== "race" && row.npcKind !== "creature") continue;
    const value: LocationStaffView = {
      npcCharacterId: row.npcCharacterId,
      name: row.name,
      npcKind: row.npcKind,
      npcBuildMode: row.npcBuildMode,
      roleLabel: row.roleLabel,
      responsibilityLabel: row.responsibilityLabel,
      isPrimaryContact: row.isPrimaryContact,
      shopId: row.shopId,
      archived: row.archivedAt !== null,
    };
    staffByShop.set(row.shopId, [...(staffByShop.get(row.shopId) ?? []), value]);
  }
  const shops = shopRows.map((row): LocationShopView => {
    const membership = townMembershipByShop.get(row.id);
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      storefrontState: row.storefrontState as "open" | "closed",
      archived: row.archivedAt !== null,
      townId: membership?.townId ?? null,
      townName: membership?.townName ?? null,
      staff: staffByShop.get(row.id) ?? [],
    };
  });
  const shopById = new Map(shops.map((entry) => [entry.id, entry]));
  const towns = townRows.map((townRow): LocationTownOption => {
    const townMemberships = memberships.filter(({ townId }) => townId === townRow.id);
    const townShops = townMemberships.flatMap(({ shopId }) => {
      const value = shopById.get(shopId);
      return value ? [value] : [];
    });
    const directNpcById = new Map<number, LocationNpcView>();
    for (const row of associationRows.filter(({ townId }) => townId === townRow.id)) {
      if (row.npcBuildMode !== "simple" && row.npcBuildMode !== "detailed") continue;
      if (row.npcKind !== "race" && row.npcKind !== "creature") continue;
      directNpcById.set(row.npcCharacterId, {
        id: row.npcCharacterId,
        name: row.name,
        npcKind: row.npcKind,
        npcBuildMode: row.npcBuildMode,
        roleLabel: row.roleLabel,
        archived: row.archivedAt !== null,
        relationshipLabel: row.relationshipLabel,
        staff: [],
      });
    }
    for (const townShop of townShops) {
      if (townShop.archived) continue;
      for (const member of townShop.staff) {
        const existing = directNpcById.get(member.npcCharacterId);
        const staffContext = {
          shopId: townShop.id,
          responsibilityLabel: member.responsibilityLabel,
          isPrimaryContact: member.isPrimaryContact,
        };
        directNpcById.set(member.npcCharacterId, existing
          ? { ...existing, staff: [...existing.staff, staffContext] }
          : {
              id: member.npcCharacterId,
              name: member.name,
              npcKind: member.npcKind,
              npcBuildMode: member.npcBuildMode,
              roleLabel: member.roleLabel,
              archived: member.archived,
              relationshipLabel: "",
              staff: [staffContext],
            });
      }
    }
    return {
      id: townRow.id,
      name: townRow.name,
      category: townRow.category,
      overview: townRow.overview,
      archived: townRow.archivedAt !== null,
      shops: townShops,
      places: placeRows.filter(({ townId }) => townId === townRow.id).map((entry) => ({
        id: entry.id,
        name: entry.name,
        category: entry.category,
        description: entry.description,
        archived: entry.archivedAt !== null,
      })),
      npcs: [...directNpcById.values()],
    };
  });
  return { towns, shops };
}

export async function readLocationPlacementWorkspaceInTransaction(
  tx: LocationPlacementTransaction,
  input: { sessionId: number; sceneId: number | null },
): Promise<LocationPlacementWorkspace> {
  const [session] = await tx.select({ id: campaignSession.id, campaignId: campaignSession.campaignId, status: campaignSession.status })
    .from(campaignSession).where(eq(campaignSession.id, positiveId(input.sessionId, "Session"))).limit(1);
  if (!session) throw new Error("That Session no longer exists.");
  const scene = input.sceneId === null ? null : (await tx.select({ id: campaignSessionScene.id, status: campaignSessionScene.status })
    .from(campaignSessionScene).where(and(
      eq(campaignSessionScene.id, positiveId(input.sceneId, "Scene")),
      eq(campaignSessionScene.sessionId, session.id),
      eq(campaignSessionScene.campaignId, session.campaignId),
    )).limit(1))[0] ?? null;
  if (input.sceneId !== null && !scene) throw new Error("That Scene is outside the selected Session.");
  const catalog = await readCatalog(tx, session.campaignId);
  const preparedTowns = await tx.select({ id: campaignSessionPreparedTown.townId }).from(campaignSessionPreparedTown)
      .where(eq(campaignSessionPreparedTown.sessionId, session.id)).orderBy(asc(campaignSessionPreparedTown.sortOrder), asc(campaignSessionPreparedTown.townId));
  const preparedShops = await tx.select({ id: campaignSessionPreparedShop.shopId }).from(campaignSessionPreparedShop)
      .where(eq(campaignSessionPreparedShop.sessionId, session.id)).orderBy(asc(campaignSessionPreparedShop.sortOrder), asc(campaignSessionPreparedShop.shopId));
  if (!scene) return {
    sessionId: session.id,
    campaignId: session.campaignId,
    sessionEditable: session.status !== "completed",
    sceneEditable: false,
    preparedTownIds: preparedTowns.map(({ id }) => id),
    preparedShopIds: preparedShops.map(({ id }) => id),
    ...catalog,
    selectedSceneId: null,
    sceneTowns: [],
    sceneShops: [],
  };
  const townPlacements = await tx.select().from(campaignSessionSceneTown).where(eq(campaignSessionSceneTown.sceneId, scene.id)).orderBy(asc(campaignSessionSceneTown.sortOrder), asc(campaignSessionSceneTown.townId));
  const placedTownShops = await tx.select().from(campaignSessionSceneTownShop).where(eq(campaignSessionSceneTownShop.sceneId, scene.id)).orderBy(asc(campaignSessionSceneTownShop.sortOrder), asc(campaignSessionSceneTownShop.shopId));
  const placedTownPlaces = await tx.select().from(campaignSessionSceneTownPlace).where(eq(campaignSessionSceneTownPlace.sceneId, scene.id)).orderBy(asc(campaignSessionSceneTownPlace.sortOrder), asc(campaignSessionSceneTownPlace.placeId));
  const placedTownNpcs = await tx.select({
    sceneId: campaignSessionSceneTownNpc.sceneId,
    townId: campaignSessionSceneTownNpc.townId,
    npcCharacterId: campaignSessionSceneTownNpc.npcCharacterId,
    included: campaignSessionSceneTownNpc.included,
    revealed: campaignSessionSceneTownNpc.revealed,
    sortOrder: campaignSessionSceneTownNpc.sortOrder,
    name: campaignCharacter.name,
    npcKind: campaignCharacter.npcKind,
    npcBuildMode: campaignCharacter.npcBuildMode,
    roleLabel: campaignCharacter.npcRoleLabel,
    archivedAt: campaignCharacter.archivedAt,
  }).from(campaignSessionSceneTownNpc)
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionSceneTownNpc.npcCharacterId),
      eq(campaignCharacter.campaignId, campaignSessionSceneTownNpc.campaignId),
    ))
    .where(eq(campaignSessionSceneTownNpc.sceneId, scene.id))
    .orderBy(asc(campaignSessionSceneTownNpc.sortOrder), asc(campaignSessionSceneTownNpc.npcCharacterId));
  const shopPlacements = await tx.select().from(campaignSessionSceneShop).where(eq(campaignSessionSceneShop.sceneId, scene.id)).orderBy(asc(campaignSessionSceneShop.sortOrder), asc(campaignSessionSceneShop.shopId));
  const townById = new Map(catalog.towns.map((entry) => [entry.id, entry]));
  const shopById = new Map(catalog.shops.map((entry) => [entry.id, entry]));
  const sceneTowns = townPlacements.flatMap((placement): SceneTownPlacementView[] => {
    const source = townById.get(placement.townId);
    if (!source) return [];
    const sourceShops = new Map(source.shops.map((entry) => [entry.id, entry]));
    const sourcePlaces = new Map(source.places.map((entry) => [entry.id, entry]));
    const sourceNpcs = new Map(source.npcs.map((entry) => [entry.id, entry]));
    return [{
      town: { id: source.id, name: source.name, category: source.category, overview: source.overview, archived: source.archived },
      sortOrder: placement.sortOrder,
      revealed: placement.revealed,
      shops: placedTownShops.filter(({ townId }) => townId === source.id).flatMap((entry) => {
        const value = sourceShops.get(entry.shopId) ?? shopById.get(entry.shopId);
        return value ? [{ ...value, included: entry.included, revealed: entry.revealed, sortOrder: entry.sortOrder }] : [];
      }),
      places: placedTownPlaces.filter(({ townId }) => townId === source.id).flatMap((entry) => {
        const value = sourcePlaces.get(entry.placeId);
        return value ? [{ ...value, included: entry.included, revealed: entry.revealed, sortOrder: entry.sortOrder }] : [];
      }),
      npcs: placedTownNpcs.filter(({ townId }) => townId === source.id).flatMap((entry) => {
        const value = sourceNpcs.get(entry.npcCharacterId);
        const historicalValue: LocationNpcView | null = (
          (entry.npcKind === "race" || entry.npcKind === "creature")
          && (entry.npcBuildMode === "simple" || entry.npcBuildMode === "detailed")
        ) ? {
          id: entry.npcCharacterId,
          name: entry.name,
          npcKind: entry.npcKind,
          npcBuildMode: entry.npcBuildMode,
          roleLabel: entry.roleLabel,
          archived: entry.archivedAt !== null,
          relationshipLabel: "",
          staff: [],
        } : null;
        const readable = value ?? historicalValue;
        return readable ? [{ ...readable, included: entry.included, revealed: entry.revealed, sortOrder: entry.sortOrder }] : [];
      }),
    }];
  });
  const sceneShops = shopPlacements.flatMap((placement): SceneShopPlacementView[] => {
    const source = shopById.get(placement.shopId);
    return source ? [{ shop: source, sortOrder: placement.sortOrder, revealed: placement.revealed }] : [];
  });
  return {
    sessionId: session.id,
    campaignId: session.campaignId,
    sessionEditable: session.status !== "completed",
    sceneEditable: session.status !== "completed" && scene.status !== "completed",
    preparedTownIds: preparedTowns.map(({ id }) => id),
    preparedShopIds: preparedShops.map(({ id }) => id),
    ...catalog,
    selectedSceneId: scene.id,
    sceneTowns,
    sceneShops,
  };
}

"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignSession } from "@/db/tabletop-operations-schema";
import { assertOwnedRootManager } from "@/features/lifecycle/policy";
import type { LifecycleActor } from "@/features/lifecycle/types";
import {
  applyTownRefreshInTransaction,
  createSceneFromTownInTransaction,
  detachShopFromSceneInTransaction,
  detachTownFromSceneInTransaction,
  placeShopInSceneInTransaction,
  placeTownInSceneInTransaction,
  prepareShopInTransaction,
  prepareTownInTransaction,
  previewTownRefreshInTransaction,
  readLocationPlacementWorkspaceInTransaction,
  removePreparedShopInTransaction,
  removePreparedTownInTransaction,
  setShopPlacementVisibilityInTransaction,
  setTownChildStateInTransaction,
  setTownPlacementVisibilityInTransaction,
  type LocationPlacementWorkspace,
  type TownPlacementSelection,
  type TownRefreshPreview,
} from "@/features/tabletop-operations/location-placement-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod, requireGodOrAdminAccessContext } from "@/lib/server-access";

function refreshLocations(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/realms/tabletop");
  revalidatePath("/heavens");
}

async function publishLocationChange(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  context: { campaignId: number; id: number; sceneId?: number },
  audience?: "all" | "god-only",
): Promise<void> {
  await publishTabletopInvalidationInTransaction(tx, {
    campaignId: context.campaignId,
    sessionId: context.id,
    sceneId: context.sceneId ?? null,
    encounterId: null,
    characterIds: [],
    category: "hierarchy",
    ...(audience ? { audience } : {}),
  });
}

export async function getLocationPlacementWorkspace(
  sessionId: number,
  sceneId: number | null,
): Promise<LocationPlacementWorkspace> {
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = { userId: access.session.user.id, roles: access.roles };
  return db.transaction(async (tx) => {
    const [root] = await tx.select({ ownerUserId: campaign.createdByUserId })
      .from(campaignSession)
      .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
      .where(eq(campaignSession.id, sessionId))
      .limit(1);
    if (!root) throw new Error("That Session no longer exists.");
    assertOwnedRootManager(actor, root.ownerUserId, "Session locations");
    return readLocationPlacementWorkspaceInTransaction(tx, { sessionId, sceneId });
  });
}

export async function prepareSessionTown(sessionId: number, townId: number): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    const context = await prepareTownInTransaction(tx, sessionId, townId, access.user.id);
    await publishLocationChange(tx, context, "god-only");
  });
  refreshLocations();
}

export async function prepareSessionShop(sessionId: number, shopId: number): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    const context = await prepareShopInTransaction(tx, sessionId, shopId, access.user.id);
    await publishLocationChange(tx, context, "god-only");
  });
  refreshLocations();
}

export async function removePreparedSessionTown(sessionId: number, townId: number): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    const context = await removePreparedTownInTransaction(tx, sessionId, townId, access.user.id);
    await publishLocationChange(tx, context, "god-only");
  });
  refreshLocations();
}

export async function removePreparedSessionShop(sessionId: number, shopId: number): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    const context = await removePreparedShopInTransaction(tx, sessionId, shopId, access.user.id);
    await publishLocationChange(tx, context, "god-only");
  });
  refreshLocations();
}

export async function addTownToScene(
  sceneId: number,
  townId: number,
  selection: TownPlacementSelection,
): Promise<{ created: boolean }> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await placeTownInSceneInTransaction(tx, sceneId, townId, selection, access.user.id);
    await publishLocationChange(tx, context);
    return { created: context.created };
  });
  refreshLocations();
  return result;
}

export async function addShopToScene(sceneId: number, shopId: number): Promise<{ created: boolean }> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await placeShopInSceneInTransaction(tx, sceneId, shopId, access.user.id);
    await publishLocationChange(tx, context);
    return { created: context.created };
  });
  refreshLocations();
  return result;
}

export async function createSceneFromTown(
  sessionId: number,
  townId: number,
  selection: TownPlacementSelection,
): Promise<{ sceneId: number }> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const created = await createSceneFromTownInTransaction(tx, sessionId, townId, selection, access.user.id);
    await publishLocationChange(tx, { ...created, id: created.sessionId });
    return { sceneId: created.sceneId };
  });
  refreshLocations();
  return result;
}

export async function detachTownFromScene(sceneId: number, townId: number): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    const context = await detachTownFromSceneInTransaction(tx, sceneId, townId, access.user.id);
    await publishLocationChange(tx, context);
  });
  refreshLocations();
}

export async function detachShopFromScene(sceneId: number, shopId: number): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    const context = await detachShopFromSceneInTransaction(tx, sceneId, shopId, access.user.id);
    await publishLocationChange(tx, context);
  });
  refreshLocations();
}

export async function setTownPlacementVisibility(
  sceneId: number,
  townId: number,
  revealed: boolean,
  revealIncludedContents = false,
): Promise<void> {
  const access = await requireGod();
  if (typeof revealed !== "boolean" || typeof revealIncludedContents !== "boolean") {
    throw new Error("Town visibility is invalid.");
  }
  await db.transaction(async (tx) => {
    const context = await setTownPlacementVisibilityInTransaction(
      tx,
      sceneId,
      townId,
      revealed,
      revealIncludedContents,
      access.user.id,
    );
    await publishLocationChange(tx, context);
  });
  refreshLocations();
}

export async function setTownChildState(input: {
  sceneId: number;
  townId: number;
  kind: "shop" | "place" | "npc";
  childId: number;
  included: boolean;
  revealed: boolean;
}): Promise<void> {
  const access = await requireGod();
  if (!["shop", "place", "npc"].includes(input.kind)) throw new Error("Town content type is invalid.");
  if (typeof input.included !== "boolean" || typeof input.revealed !== "boolean") {
    throw new Error("Town content state is invalid.");
  }
  await db.transaction(async (tx) => {
    const context = await setTownChildStateInTransaction(tx, input, access.user.id);
    await publishLocationChange(tx, context);
  });
  refreshLocations();
}

export async function setShopPlacementVisibility(
  sceneId: number,
  shopId: number,
  revealed: boolean,
): Promise<void> {
  const access = await requireGod();
  if (typeof revealed !== "boolean") throw new Error("Shop visibility is invalid.");
  await db.transaction(async (tx) => {
    const context = await setShopPlacementVisibilityInTransaction(tx, sceneId, shopId, revealed, access.user.id);
    await publishLocationChange(tx, context);
  });
  refreshLocations();
}

export async function previewTownPlacementRefresh(
  sceneId: number,
  townId: number,
): Promise<TownRefreshPreview> {
  const access = await requireGod();
  return db.transaction((tx) => previewTownRefreshInTransaction(tx, sceneId, townId, access.user.id));
}

export async function refreshTownPlacement(sceneId: number, townId: number): Promise<TownRefreshPreview> {
  const access = await requireGod();
  const preview = await db.transaction(async (tx) => {
    const context = await applyTownRefreshInTransaction(tx, sceneId, townId, access.user.id);
    await publishLocationChange(tx, context);
    return context.preview;
  });
  refreshLocations();
  return preview;
}

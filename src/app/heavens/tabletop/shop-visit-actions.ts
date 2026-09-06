"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaignSessionSceneShopVisitMember } from "@/db/tabletop-shop-visit-schema";
import {
  endShopVisitInTransaction,
  readGodShopVisitWorkspaceInTransaction,
  removeShopVisitorInTransaction,
  setShopVisitModeInTransaction,
  startOrAddShopVisitInTransaction,
  type GodShopVisitWorkspace,
  type ShopVisitMode,
  type ShopVisitPlacement,
} from "@/features/tabletop-operations/shop-visit-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGodOrAdminAccessContext } from "@/lib/server-access";

function actorFrom(access: Awaited<ReturnType<typeof requireGodOrAdminAccessContext>>) {
  return { userId: access.session.user.id, roles: access.roles };
}

function refreshShopVisits(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/realms/tabletop");
}

export async function getGodShopVisitWorkspace(sceneId: number): Promise<GodShopVisitWorkspace> {
  const access = await requireGodOrAdminAccessContext();
  return db.transaction((tx) => readGodShopVisitWorkspaceInTransaction(tx, sceneId, actorFrom(access)));
}

export async function enterShopVisit(input: {
  sceneId: number;
  shopId: number;
  placement: ShopVisitPlacement;
  characterIds: number[];
  mode: ShopVisitMode;
  closedShopOverrideReason: string;
}): Promise<{ visitId: number; addedCharacterIds: number[] }> {
  const access = await requireGodOrAdminAccessContext();
  const result = await db.transaction(async (tx) => {
    const mutation = await startOrAddShopVisitInTransaction(tx, input, actorFrom(access));
    const workspace = await readGodShopVisitWorkspaceInTransaction(tx, input.sceneId, actorFrom(access));
    const visit = workspace.activeVisits.find(({ id }) => id === mutation.visitId);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: workspace.campaignId,
      sessionId: workspace.sessionId,
      sceneId: workspace.sceneId,
      encounterId: null,
      characterIds: visit?.visitors.map(({ characterId }) => characterId) ?? [...new Set(input.characterIds)],
      category: "shop-visit",
    });
    return mutation;
  });
  refreshShopVisits();
  return result;
}

async function activeVisitAudience(visitId: number) {
  return db.transaction(async (tx) => {
    const rows = await tx.select({
      characterId: campaignSessionSceneShopVisitMember.characterId,
      campaignId: campaignSessionSceneShopVisitMember.campaignId,
      sessionId: campaignSessionSceneShopVisitMember.sessionId,
      sceneId: campaignSessionSceneShopVisitMember.sceneId,
    }).from(campaignSessionSceneShopVisitMember).where(and(
      eq(campaignSessionSceneShopVisitMember.visitId, visitId),
      eq(campaignSessionSceneShopVisitMember.status, "active"),
    ));
    return {
      characterIds: rows.map(({ characterId }) => characterId),
      campaignId: rows[0]?.campaignId ?? null,
      sessionId: rows[0]?.sessionId ?? null,
      sceneId: rows[0]?.sceneId ?? null,
    };
  });
}

export async function setShopVisitMode(visitId: number, mode: ShopVisitMode): Promise<void> {
  const access = await requireGodOrAdminAccessContext();
  const audience = await activeVisitAudience(visitId);
  await db.transaction(async (tx) => {
    await setShopVisitModeInTransaction(tx, visitId, mode, actorFrom(access));
    if (audience.campaignId && audience.sessionId && audience.sceneId) await publishTabletopInvalidationInTransaction(tx, {
      campaignId: audience.campaignId,
      sessionId: audience.sessionId,
      sceneId: audience.sceneId,
      encounterId: null,
      characterIds: audience.characterIds,
      category: "shop-visit",
    });
  });
  refreshShopVisits();
}

export async function removeShopVisitor(visitId: number, characterId: number): Promise<void> {
  const access = await requireGodOrAdminAccessContext();
  const audience = await activeVisitAudience(visitId);
  await db.transaction(async (tx) => {
    await removeShopVisitorInTransaction(tx, visitId, characterId, actorFrom(access));
    if (audience.campaignId && audience.sessionId && audience.sceneId) await publishTabletopInvalidationInTransaction(tx, {
      campaignId: audience.campaignId,
      sessionId: audience.sessionId,
      sceneId: audience.sceneId,
      encounterId: null,
      characterIds: audience.characterIds,
      category: "shop-visit",
    });
  });
  refreshShopVisits();
}

export async function endShopVisit(visitId: number, reason: string): Promise<void> {
  const access = await requireGodOrAdminAccessContext();
  const audience = await activeVisitAudience(visitId);
  await db.transaction(async (tx) => {
    await endShopVisitInTransaction(tx, visitId, reason, actorFrom(access));
    if (audience.campaignId && audience.sessionId && audience.sceneId) await publishTabletopInvalidationInTransaction(tx, {
      campaignId: audience.campaignId,
      sessionId: audience.sessionId,
      sceneId: audience.sceneId,
      encounterId: null,
      characterIds: audience.characterIds,
      category: "shop-visit",
    });
  });
  refreshShopVisits();
}

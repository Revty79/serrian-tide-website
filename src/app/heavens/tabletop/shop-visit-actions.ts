"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  campaignSessionSceneShopVisit,
  campaignSessionSceneShopVisitMember,
  shopTransactionRequest,
} from "@/db/tabletop-shop-visit-schema";
import { campaignSession, campaignSessionScene } from "@/db/tabletop-operations-schema";
import {
  completeGodOverridePurchaseInTransaction,
  correctCharacterBalanceInTransaction,
  giveCharacterMoneyInTransaction,
  reviewShopRequestInTransaction,
  type PurchaseLineInput,
  type RevisedRequestLineInput,
} from "@/features/tabletop-operations/shop-commerce-service";
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

async function publishCommerceInvalidation(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { requestId?: number; campaignId?: number; characterId: number },
): Promise<void> {
  if (input.requestId) {
    const [request] = await tx.select({
      campaignId: shopTransactionRequest.campaignId,
      visitId: shopTransactionRequest.visitId,
    }).from(shopTransactionRequest).where(eq(shopTransactionRequest.id, input.requestId)).limit(1);
    if (request?.visitId) {
      const [visit] = await tx.select({
        sessionId: campaignSessionSceneShopVisit.sessionId,
        sceneId: campaignSessionSceneShopVisit.sceneId,
      }).from(campaignSessionSceneShopVisit)
        .where(eq(campaignSessionSceneShopVisit.id, request.visitId)).limit(1);
      if (visit) {
        await publishTabletopInvalidationInTransaction(tx, {
          campaignId: request.campaignId,
          sessionId: visit.sessionId,
          sceneId: visit.sceneId,
          encounterId: null,
          characterIds: [input.characterId],
          category: "shop-commerce",
        });
        return;
      }
    }
  }
  if (!input.campaignId) return;
  const [active] = await tx.select({
    sessionId: campaignSession.id,
    sceneId: campaignSessionScene.id,
  }).from(campaignSession)
    .leftJoin(campaignSessionScene, and(
      eq(campaignSessionScene.sessionId, campaignSession.id),
      eq(campaignSessionScene.campaignId, campaignSession.campaignId),
      eq(campaignSessionScene.status, "active"),
    ))
    .where(and(
      eq(campaignSession.campaignId, input.campaignId),
      eq(campaignSession.status, "active"),
    )).orderBy(desc(campaignSession.startedAt), desc(campaignSession.id)).limit(1);
  if (!active) return;
  await publishTabletopInvalidationInTransaction(tx, {
    campaignId: input.campaignId,
    sessionId: active.sessionId,
    sceneId: active.sceneId,
    encounterId: null,
    characterIds: [input.characterId],
    category: "shop-commerce",
  });
}

export type ShopVisitActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function actionFailure(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "The Shop visit action failed.",
  };
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
}): Promise<ShopVisitActionResult<{ visitId: number; addedCharacterIds: number[] }>> {
  try {
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
    return { ok: true, value: result };
  } catch (error) {
    return actionFailure(error);
  }
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

export async function setShopVisitMode(visitId: number, mode: ShopVisitMode): Promise<ShopVisitActionResult> {
  try {
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
    return { ok: true, value: undefined };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function removeShopVisitor(visitId: number, characterId: number): Promise<ShopVisitActionResult> {
  try {
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
    return { ok: true, value: undefined };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function endShopVisit(visitId: number, reason: string): Promise<ShopVisitActionResult> {
  try {
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
    return { ok: true, value: undefined };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function reviewShopRequest(input: {
  requestId: number;
  characterId: number;
  expectedTermsVersion: number;
  decision: "approve" | "reject";
  revisedLines?: readonly RevisedRequestLineInput[];
  reason?: string;
  submissionKey: string;
}): Promise<ShopVisitActionResult<{ requestId: number; transactionId: number | null; status: string }>> {
  try {
    const access = await requireGodOrAdminAccessContext();
    const result = await db.transaction(async (tx) => {
      const reviewed = await reviewShopRequestInTransaction(tx, input, actorFrom(access));
      await publishCommerceInvalidation(tx, { requestId: reviewed.requestId, characterId: input.characterId });
      return reviewed;
    });
    refreshShopVisits();
    return { ok: true, value: result };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function completeGodOverridePurchase(input: {
  campaignId: number;
  shopId: number;
  characterId: number;
  lines: readonly PurchaseLineInput[];
  narrativeNote?: string;
  overrideReason: string;
  submissionKey: string;
}): Promise<ShopVisitActionResult<{ requestId: number; transactionId: number }>> {
  try {
    const access = await requireGodOrAdminAccessContext();
    const result = await db.transaction(async (tx) => {
      const completed = await completeGodOverridePurchaseInTransaction(tx, input, actorFrom(access));
      await publishCommerceInvalidation(tx, { requestId: completed.requestId, campaignId: input.campaignId, characterId: input.characterId });
      return completed;
    });
    refreshShopVisits();
    return { ok: true, value: result };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function giveCharacterMoney(input: {
  campaignId: number;
  characterId: number;
  amountCredits: number;
  reason: string;
  submissionKey: string;
}): Promise<ShopVisitActionResult> {
  try {
    const access = await requireGodOrAdminAccessContext();
    await db.transaction(async (tx) => {
      await giveCharacterMoneyInTransaction(tx, input, actorFrom(access));
      await publishCommerceInvalidation(tx, { campaignId: input.campaignId, characterId: input.characterId });
    });
    refreshShopVisits();
    return { ok: true, value: undefined };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function correctCharacterBalance(input: {
  campaignId: number;
  characterId: number;
  newBalanceCredits: number;
  reason: string;
  submissionKey: string;
}): Promise<ShopVisitActionResult> {
  try {
    const access = await requireGodOrAdminAccessContext();
    await db.transaction(async (tx) => {
      await correctCharacterBalanceInTransaction(tx, input, actorFrom(access));
      await publishCommerceInvalidation(tx, { campaignId: input.campaignId, characterId: input.characterId });
    });
    refreshShopVisits();
    return { ok: true, value: undefined };
  } catch (error) {
    return actionFailure(error);
  }
}

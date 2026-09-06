"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { eq } from "drizzle-orm";
import {
  campaignSessionSceneShopVisitMember,
  shopTransactionRequest,
} from "@/db/tabletop-shop-visit-schema";
import {
  acceptShopRequestTermsInTransaction,
  cancelShopRequestInTransaction,
  submitPlayerPurchaseInTransaction,
  submitPlayerSaleInTransaction,
  type PurchaseLineInput,
  type SaleLineInput,
} from "@/features/tabletop-operations/shop-commerce-service";
import { leaveOwnShopVisitInTransaction } from "@/features/tabletop-operations/shop-visit-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requirePlayer } from "@/lib/server-access";

export type PlayerShopCommerceActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "The Shop transaction failed." };
}

async function publishRequestInvalidation(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  requestId: number,
): Promise<void> {
  const [request] = await tx.select({
    campaignId: shopTransactionRequest.campaignId,
    characterId: shopTransactionRequest.characterId,
    visitId: shopTransactionRequest.visitId,
  }).from(shopTransactionRequest).where(eq(shopTransactionRequest.id, requestId)).limit(1);
  if (!request?.visitId) return;
  const [visit] = await tx.select({
    sessionId: campaignSessionSceneShopVisitMember.sessionId,
    sceneId: campaignSessionSceneShopVisitMember.sceneId,
  }).from(campaignSessionSceneShopVisitMember)
    .where(eq(campaignSessionSceneShopVisitMember.visitId, request.visitId)).limit(1);
  if (!visit) return;
  await publishTabletopInvalidationInTransaction(tx, {
    campaignId: request.campaignId,
    sessionId: visit.sessionId,
    sceneId: visit.sceneId,
    encounterId: null,
    characterIds: [request.characterId],
    category: "shop-commerce",
  });
}

export async function leaveShopVisit(characterId: number): Promise<void> {
  const access = await requirePlayer();
  await db.transaction(async (tx) => {
    const result = await leaveOwnShopVisitInTransaction(tx, characterId, access.user.id);
    if (result.campaignId && result.sessionId && result.sceneId) await publishTabletopInvalidationInTransaction(tx, {
      campaignId: result.campaignId,
      sessionId: result.sessionId,
      sceneId: result.sceneId,
      encounterId: null,
      characterIds: result.affectedCharacterIds,
      category: "shop-visit",
    });
  });
  revalidatePath("/realms/tabletop");
  revalidatePath("/heavens/tabletop");
}

export async function submitShopPurchase(input: {
  visitId: number;
  characterId: number;
  lines: readonly PurchaseLineInput[];
  narrativeNote?: string;
  submissionKey: string;
}): Promise<PlayerShopCommerceActionResult<{ requestId: number; transactionId: number | null; status: string }>> {
  try {
    const access = await requirePlayer();
    const result = await db.transaction(async (tx) => {
      const completed = await submitPlayerPurchaseInTransaction(tx, input, access.user.id);
      await publishRequestInvalidation(tx, completed.requestId);
      return completed;
    });
    revalidatePath("/realms/tabletop");
    revalidatePath(`/realms/characters/${input.characterId}`);
    revalidatePath("/heavens/tabletop");
    return { ok: true, value: result };
  } catch (error) {
    return failure(error);
  }
}

export async function submitShopSale(input: {
  visitId: number;
  characterId: number;
  lines: readonly SaleLineInput[];
  narrativeNote?: string;
  submissionKey: string;
}): Promise<PlayerShopCommerceActionResult<{ requestId: number; status: string }>> {
  try {
    const access = await requirePlayer();
    const result = await db.transaction(async (tx) => {
      const submitted = await submitPlayerSaleInTransaction(tx, input, access.user.id);
      await publishRequestInvalidation(tx, submitted.requestId);
      return submitted;
    });
    revalidatePath("/realms/tabletop");
    revalidatePath("/heavens/tabletop");
    return { ok: true, value: result };
  } catch (error) {
    return failure(error);
  }
}

export async function acceptShopTerms(input: {
  requestId: number;
  submissionKey: string;
}): Promise<PlayerShopCommerceActionResult<{ requestId: number; transactionId: number | null; status: string }>> {
  try {
    const access = await requirePlayer();
    const result = await db.transaction(async (tx) => {
      const accepted = await acceptShopRequestTermsInTransaction(tx, input, access.user.id);
      await publishRequestInvalidation(tx, accepted.requestId);
      return accepted;
    });
    revalidatePath("/realms/tabletop");
    revalidatePath("/heavens/tabletop");
    return { ok: true, value: result };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelShopRequest(input: {
  requestId: number;
  submissionKey: string;
}): Promise<PlayerShopCommerceActionResult> {
  try {
    const access = await requirePlayer();
    await db.transaction(async (tx) => {
      await cancelShopRequestInTransaction(tx, input, { userId: access.user.id, roles: [] });
      await publishRequestInvalidation(tx, input.requestId);
    });
    revalidatePath("/realms/tabletop");
    revalidatePath("/heavens/tabletop");
    return { ok: true, value: undefined };
  } catch (error) {
    return failure(error);
  }
}

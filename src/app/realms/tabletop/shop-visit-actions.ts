"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { leaveOwnShopVisitInTransaction } from "@/features/tabletop-operations/shop-visit-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requirePlayer } from "@/lib/server-access";

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

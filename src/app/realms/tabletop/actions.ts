"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  recordPlayerTabletopFreeRollInTransaction,
} from "@/features/tabletop-operations/player-tabletop-console-service";
import type { RollMethod, RollVisibility } from "@/features/tabletop-operations/roll-runtime";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requirePlayer } from "@/lib/server-access";

export async function recordPlayerTabletopFreeRoll(
  characterId: number,
  input: {
    method: RollMethod;
    visibility: Exclude<RollVisibility, "god-only">;
    enteredTotal?: number | null;
    label?: string;
    idempotencyKey: string;
  },
): Promise<{ rollId: number; resultTotal: number }> {
  const access = await requirePlayer();
  const result = await db.transaction(async (tx) => {
    const recorded = await recordPlayerTabletopFreeRollInTransaction(tx, {
      ...input,
      characterId,
      playerUserId: access.user.id,
    });
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: recorded.campaignId,
      sessionId: recorded.sessionId,
      sceneId: recorded.sceneId,
      encounterId: recorded.encounterId,
      characterIds: [characterId],
      category: "roll",
    });
    return { rollId: recorded.rollId, resultTotal: recorded.resultTotal };
  });
  revalidatePath("/realms/tabletop");
  revalidatePath(`/realms/characters/${characterId}`);
  return result;
}

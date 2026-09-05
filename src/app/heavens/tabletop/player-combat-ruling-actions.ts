"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  readGodCombatRulingRequestsInTransaction,
  ruleOnPlayerCombatRequestInTransaction,
  type PlayerCombatRulingRequestView,
} from "@/features/tabletop-operations/player-combat-ruling-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

export async function getGodPlayerCombatRulingRequests(encounterIdInput: number): Promise<PlayerCombatRulingRequestView[]> {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, positiveId(encounterIdInput, "Encounter"), access.user.id);
    return readGodCombatRulingRequestsInTransaction(tx, context.encounterId);
  });
}

export async function ruleGodPlayerCombatRequest(
  encounterIdInput: number,
  requestIdInput: number,
  input: {
    status: "approved" | "rejected" | "clarification-requested";
    response: string;
    calledShotPenalty?: number | null;
    rulingReason?: string;
  },
): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, positiveId(encounterIdInput, "Encounter"), access.user.id);
    const requests = await readGodCombatRulingRequestsInTransaction(tx, context.encounterId);
    const request = requests.find(({ id }) => id === positiveId(requestIdInput, "Combat ruling request"));
    if (!request) throw new Error("That Player combat request is not in this Encounter.");
    let ruling: Record<string, unknown> = {};
    if (input.status === "approved" && request.requestType === "called-shot") {
      if (typeof input.calledShotPenalty !== "number" || !Number.isFinite(input.calledShotPenalty) || input.calledShotPenalty < 0) {
        throw new Error("An approved Called Shot requires an authoritative numeric penalty.");
      }
      const reason = input.rulingReason?.trim() ?? "";
      if (!reason) throw new Error("An approved Called Shot requires a ruling reason.");
      ruling = { penalty: input.calledShotPenalty, reason };
    } else if (input.rulingReason?.trim()) {
      ruling = { reason: input.rulingReason.trim() };
    }
    await ruleOnPlayerCombatRequestInTransaction(tx, context, access.user.id, request.id, {
      status: input.status,
      response: input.response,
      ruling,
    });
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
      characterIds: [request.characterId],
      category: "action",
    });
  });
  revalidatePath("/heavens/tabletop");
  revalidatePath("/realms/tabletop");
}

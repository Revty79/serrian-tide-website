"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireGod } from "@/lib/server-access";
import { changeCombatParticipationInTransaction, type CombatParticipationCommand } from "@/features/tabletop-operations/combat-participation-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";

export async function changeCombatParticipation(encounterId: number, input: CombatParticipationCommand) {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    const result = await changeCombatParticipationInTransaction(tx, encounterId, { authority: "god-owner", userId: access.user.id }, input);
    await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId,
      characterIds: input.participantId > 0 ? [input.participantId] : [], category: "initiative" });
    return result;
  });
  revalidatePath("/heavens/tabletop"); revalidatePath("/realms/tabletop");
  return result;
}

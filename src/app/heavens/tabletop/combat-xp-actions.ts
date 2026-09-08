"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { awardCombatExperienceInTransaction, type CombatExperienceDecisionInput, type CombatExperienceReceipt } from "@/features/tabletop-operations/combat-xp-service";
import { lockEncounterCloseoutContextInTransaction } from "@/features/tabletop-operations/encounter-closeout-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

export async function awardCombatExperience(encounterId: number, input: CombatExperienceDecisionInput): Promise<CombatExperienceReceipt> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockEncounterCloseoutContextInTransaction(tx, encounterId, access.user.id);
    const award = await awardCombatExperienceInTransaction(tx, encounterId, { authority: "god-owner", userId: access.user.id }, input);
    await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId,
      encounterId, characterIds: [...input.recipientCharacterIds], category: "character-state" });
    return award;
  });
  revalidatePath("/heavens/tabletop");
  revalidatePath("/realms/tabletop");
  for (const characterId of input.recipientCharacterIds) {
    revalidatePath(`/heavens/characters/${characterId}`);
    revalidatePath(`/realms/characters/${characterId}`);
  }
  return result;
}

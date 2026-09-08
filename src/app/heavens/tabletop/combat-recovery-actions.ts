"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireGod } from "@/lib/server-access";
import { readCombatRecoveryInTransaction, settleCombatEffectRemainderInTransaction, withdrawCombatCheckpointInTransaction } from "@/features/tabletop-operations/combat-recovery-service";
import { lockEncounterCloseoutContextInTransaction } from "@/features/tabletop-operations/encounter-closeout-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { completeRetainedCombatEffectPlanInTransaction } from "@/features/tabletop-operations/action-effect-plan-service";

export async function completeRetainedCombatEffectPlan(encounterId: number, input: { planId: number; reason: string }) {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockEncounterCloseoutContextInTransaction(tx, encounterId, access.user.id);
    const result = await completeRetainedCombatEffectPlanInTransaction(tx, encounterId, { authority: "god-owner", userId: access.user.id }, input);
    await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId,
      encounterId, characterIds: [], category: "character-state" });
    return result;
  });
  revalidatePath("/heavens/tabletop"); revalidatePath("/realms/tabletop");
  return result;
}

export async function getCombatRecovery(encounterId: number) {
  const access = await requireGod();
  return db.transaction((tx) => readCombatRecoveryInTransaction(tx, encounterId, { authority: "god-owner", userId: access.user.id }));
}

export async function settleCombatEffectRemainder(encounterId: number, input: { planId: number; reason: string }) {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockEncounterCloseoutContextInTransaction(tx, encounterId, access.user.id);
    const result = await settleCombatEffectRemainderInTransaction(tx, encounterId, { authority: "god-owner", userId: access.user.id }, input);
    await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId,
      encounterId, characterIds: [], category: "action" });
    return result;
  });
  revalidatePath("/heavens/tabletop");
  revalidatePath("/realms/tabletop");
  return result;
}

export async function withdrawCombatCheckpoint(encounterId: number, input: { checkpointId: number; reason: string }) {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockEncounterCloseoutContextInTransaction(tx, encounterId, access.user.id);
    const result = await withdrawCombatCheckpointInTransaction(tx, encounterId, { authority: "god-owner", userId: access.user.id }, input);
    await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId,
      encounterId, characterIds: [], category: "action" });
    return result;
  });
}

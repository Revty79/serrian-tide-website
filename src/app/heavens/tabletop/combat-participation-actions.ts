"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireGod } from "@/lib/server-access";
import { changeCombatParticipationInTransaction, type CombatParticipationCommand } from "@/features/tabletop-operations/combat-participation-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { ruleCombatConditionInTransaction, type CombatConditionCommand } from "@/features/tabletop-operations/combat-condition-service";
import { resolveCombatSpellRecoveryInTransaction, resolveCombatRevivalExpirationInTransaction,
  type CombatSpellRecoveryRuling } from "@/features/tabletop-operations/combat-spell-recovery-service";

export async function resolveCombatSpellRecovery(encounterId: number, input: CombatSpellRecoveryRuling) {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    const result = await resolveCombatSpellRecoveryInTransaction(tx, encounterId, { authority: "god-owner", userId: access.user.id }, input);
    await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId,
      characterIds: [], category: "character-state" });
    return result;
  });
}

export async function resolveCombatRevivalExpiration(encounterId: number, input: { participantId: number; effectId: number; stabilized: boolean; reason: string }) {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    const result = await resolveCombatRevivalExpirationInTransaction(tx, encounterId, { authority: "god-owner", userId: access.user.id }, input);
    await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId,
      characterIds: input.participantId > 0 ? [input.participantId] : [], category: "character-state" });
    return result;
  });
}

export async function ruleCombatCondition(encounterId: number, input: CombatConditionCommand) {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    const result = await ruleCombatConditionInTransaction(tx, encounterId, { authority: "god-owner", userId: access.user.id }, input);
    await publishTabletopInvalidationInTransaction(tx, { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId,
      characterIds: input.participantId > 0 ? [input.participantId] : [], category: "initiative" });
    return result;
  });
  revalidatePath("/heavens/tabletop"); revalidatePath("/realms/tabletop");
  return result;
}

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

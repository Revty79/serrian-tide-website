import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { campaignSessionEncounterEffectPlan as plan, campaignSessionEncounterEffect as effect,
  campaignSessionEncounterEffectPlanEvent as event, campaignSessionEncounterDeclarationCheckpoint as checkpoint,
  campaignSessionEncounterReaction as reaction } from "@/db/tabletop-operations-schema";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { assertNoOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";
import { lockEncounterCloseoutContextInTransaction } from "./encounter-closeout-service";
import type { ActionDeclarationActor } from "./action-declaration-service";
import type { RuntimeIntegrationTransaction as Tx } from "./runtime-integration-service";
import { cancelActionDeclarationInTransaction } from "./action-declaration-service";

/** Withdraw a stranded simultaneous group without choosing for its absent members.
 * The closed timestamp frees the retained open-group unique index; the withdrawal
 * marker keeps its original choices and Rolls sealed permanently.
 */
export async function withdrawCombatCheckpointInTransaction(tx: Tx, encounterId: number, actor: ActionDeclarationActor,
  input: { checkpointId: number; reason: string }) {
  return tx.transaction(async (recoveryTx) => {
    if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may withdraw a declaration checkpoint.");
    const context = await lockEncounterCloseoutContextInTransaction(recoveryTx, encounterId, actor.userId);
    await assertCombatWritableInTransaction(recoveryTx, encounterId);
    const [row] = await recoveryTx.select().from(checkpoint).where(and(eq(checkpoint.id, input.checkpointId), eq(checkpoint.encounterId, encounterId))).for("update");
    if (!row) throw new Error("That exact checkpoint does not belong to this Encounter.");
    const before = row.beforeStateJson as Record<string, unknown>;
    if (before.withdrawal) return { reused: true };
    if (row.revealedAt) throw new Error("A revealed checkpoint cannot be withdrawn as an unrevealed group.");
    const reason = input.reason.trim();
    if (!reason || reason.length > 1000) throw new Error("Checkpoint recovery requires an explicit G.O.D. reason.");
    const now = new Date();
    await recoveryTx.update(checkpoint).set({ revealedAt: now, beforeStateJson: { ...before,
      withdrawal: { reason, actorUserId: actor.userId, withdrawnAt: now.toISOString(), resourcesRefunded: false } } }).where(eq(checkpoint.id, row.id));
    for (const choice of row.choicesJson) {
      if (choice.kind === "action" && choice.declarationId !== null) await cancelActionDeclarationInTransaction(recoveryTx, context, actor, choice.declarationId, reason);
      if (choice.reactionId !== null) await recoveryTx.update(reaction).set({ status: "cancelled", outcome: `Checkpoint withdrawn; committed costs retained. ${reason}`,
        reconciliationAppliedAt: now, resolvedAt: now, updatedAt: now }).where(eq(reaction.id, choice.reactionId));
    }
    return { reused: false };
  });
}

/** Available for retained completed Encounters too. Never executes historical effects. */
export async function readCombatRecoveryInTransaction(tx: Tx, encounterId: number, actor: ActionDeclarationActor) {
  if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may recover combat work.");
  await lockEncounterCloseoutContextInTransaction(tx, encounterId, actor.userId);
  await assertNoOpenDeclarationCheckpoint(tx, encounterId);
  const plans = await tx.select().from(plan).where(eq(plan.encounterId, encounterId)).orderBy(asc(plan.id));
  const effects = await tx.select().from(effect).where(eq(effect.encounterId, encounterId)).orderBy(asc(effect.id));
  return plans.filter(({ status }) => !["applied", "declined", "cancelled", "superseded"].includes(status))
    .map((row) => ({ ...row, effects: effects.filter(({ planId }) => planId === row.id) }));
}

export async function settleCombatEffectRemainderInTransaction(tx: Tx, encounterId: number, actor: ActionDeclarationActor,
  input: { planId: number; reason: string }) {
  return tx.transaction(async (recoveryTx) => {
    if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may recover combat work.");
    const context = await lockEncounterCloseoutContextInTransaction(recoveryTx, encounterId, actor.userId);
    await assertCombatWritableInTransaction(recoveryTx, encounterId);
    await assertNoOpenDeclarationCheckpoint(recoveryTx, encounterId);
    const reason = input.reason.trim();
    if (!reason || reason.length > 1000) throw new Error("Recovery requires a G.O.D. ruling of 1 to 1000 characters.");
    const [row] = await recoveryTx.select().from(plan).where(and(eq(plan.id, input.planId), eq(plan.encounterId, encounterId))).for("update");
    if (!row) throw new Error("That exact effect plan does not belong to this Encounter.");
    if (["applied", "declined", "cancelled", "superseded"].includes(row.status)) return { planId: row.id, reused: true };
    const rows = await recoveryTx.select().from(effect).where(eq(effect.planId, row.id)).for("update");
    const preserved = rows.filter(({ status, appliedAt }) => appliedAt !== null || ["applied", "manual-resolved"].includes(status));
    const remainingIds = rows.filter((candidate) => !preserved.includes(candidate) && candidate.status !== "declined").map(({ id }) => id);
    const now = new Date();
    if (remainingIds.length) await recoveryTx.update(effect).set({ status: "declined", amendmentReason: reason,
      amendedByUserId: actor.userId, updatedAt: now }).where(inArray(effect.id, remainingIds));
    await recoveryTx.update(plan).set({ status: "cancelled", updatedAt: now }).where(eq(plan.id, row.id));
    await recoveryTx.insert(event).values({ planId: row.id, encounterId, sceneId: context.sceneId, sessionId: context.sessionId,
      campaignId: context.campaignId, fromStatus: row.status, toStatus: "cancelled", eventKind: "unapplied-remainder-recovered",
      actorUserId: actor.userId, reason, metadata: { preservedEffectIds: preserved.map(({ id }) => id), declinedEffectIds: remainingIds,
        encounterStatus: context.encounterStatus, resourcesRefunded: false, consequencesReplayed: false } });
    return { planId: row.id, reused: false };
  });
}

import "server-only";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { lifecycleAuditEvent } from "@/db/lifecycle-schema";
import {
  campaignSessionEncounter as encounter, campaignSessionEncounterInitiative as initiative,
  campaignSessionEncounterDeclarationCheckpoint as checkpoint, campaignSessionEncounterActionDeclaration as declaration,
  campaignSessionEncounterActionDeclarationEvent as declarationEvent, campaignSessionEncounterPendingAction as pending,
  campaignSessionEncounterPendingActionSource as source, campaignSessionEncounterResponderOpportunity as opportunity,
  campaignSessionEncounterReaction as reaction, campaignSessionEncounterReactionEvent as reactionEvent,
  campaignSessionEncounterEffectPlan as plan, campaignSessionEncounterEffect as effect, campaignSessionEncounterEffectPlanEvent as planEvent,
  campaignCharacterFirearmPreparation as preparation, campaignSessionEncounterFirearmAttack as firearm,
  campaignSessionEncounterFirearmAttackEvent as firearmEvent,
} from "@/db/tabletop-operations-schema";
import type { ActionDeclarationActor } from "./action-declaration-service";
import { lockEncounterCloseoutContextInTransaction, type EncounterCloseoutTransaction as Tx } from "./encounter-closeout-service";
import { combatObject } from "./combat-condition-state";
import { publishTabletopInvalidationInTransaction } from "./tabletop-live-events";

/** Explicit owner override. Closing never executes a Roll, consequence, refund,
 * duration tick, or XP award, and is independent of ordinary completion gates. */
export async function forceEndCombatInTransaction(tx: Tx, encounterId: number, actor: ActionDeclarationActor, note = "") {
  if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may force end combat.");
  const context = await lockEncounterCloseoutContextInTransaction(tx, encounterId, actor.userId);
  if (context.encounterStatus === "completed") return { status: "completed" as const, reused: true };
  if (typeof note !== "string" || note.length > 1000) throw new Error("The optional end-combat note must be at most 1000 characters.");
  const now = new Date(), reason = `G.O.D. force-ended combat. Unfinished work cancelled; spent resources and applied results retained.${note.trim() ? ` ${note.trim()}` : ""}`;
  const scope = { encounterId, sceneId: context.sceneId, sessionId: context.sessionId, campaignId: context.campaignId };
  const audit = { ...scope, actorUserId: actor.userId, reason, eventKind: "combat-force-ended", metadata: { resourcesRefunded: false, consequencesApplied: false } };

  // Withdraw unrevealed choices using the existing permanent privacy marker.
  const groups = await tx.select().from(checkpoint).where(and(eq(checkpoint.encounterId, encounterId), isNull(checkpoint.revealedAt))).for("update");
  for (const group of groups) await tx.update(checkpoint).set({ revealedAt: now, beforeStateJson: { ...combatObject(group.beforeStateJson),
    withdrawal: { reason, actorUserId: actor.userId, withdrawnAt: now.toISOString(), resourcesRefunded: false } } }).where(eq(checkpoint.id, group.id));

  const declarations = await tx.select().from(declaration).where(and(eq(declaration.encounterId, encounterId), notInArray(declaration.status, ["resolved", "cancelled", "abandoned"]))).for("update");
  if (declarations.length) {
    await tx.update(declaration).set({ status: "cancelled", rulingReason: reason, endedAt: now, endedByUserId: actor.userId, updatedAt: now }).where(inArray(declaration.id, declarations.map((row) => row.id)));
    await tx.insert(declarationEvent).values(declarations.map((row) => ({ ...audit, declarationId: row.id, fromStatus: row.status, toStatus: "cancelled" as const })));
  }
  const endedActions = await tx.update(pending).set({ status: "ended", updatedAt: now }).where(and(eq(pending.encounterId, encounterId), inArray(pending.status, ["active", "interrupted"]))).returning({ id: pending.id });
  const endedSources = await tx.update(source).set({ resolutionStatus: "cancelled", resolvedAt: now, resolutionSummary: reason, updatedAt: now })
    .where(and(eq(source.encounterId, encounterId), inArray(source.resolutionStatus, ["pending", "needs-ruling"]))).returning({ id: source.id });
  await tx.update(opportunity).set({ status: "ineligible", rulingReason: reason, requiresGodConfirmation: false, reconciledByUserId: actor.userId, reconciledAt: now, updatedAt: now })
    .where(and(eq(opportunity.encounterId, encounterId), eq(opportunity.status, "pending")));
  const reactions = await tx.select().from(reaction).where(and(eq(reaction.encounterId, encounterId), inArray(reaction.status, ["declared", "needs-ruling"]))).for("update");
  if (reactions.length) {
    await tx.update(reaction).set({ status: "cancelled", outcome: reason, rulingReason: reason, ruledByUserId: actor.userId, ruledAt: now,
      reconciliationAppliedAt: now, resolvedAt: now, updatedAt: now }).where(inArray(reaction.id, reactions.map((row) => row.id)));
    await tx.insert(reactionEvent).values(reactions.map((row) => ({ ...audit, reactionId: row.id, fromStatus: row.status, toStatus: "cancelled" as const })));
  }
  const plans = await tx.select().from(plan).where(and(eq(plan.encounterId, encounterId), notInArray(plan.status, ["applied", "declined", "cancelled", "superseded"]))).for("update");
  if (plans.length) {
    const ids = plans.map((row) => row.id);
    await tx.update(effect).set({ status: "declined", amendmentReason: reason, amendedByUserId: actor.userId, updatedAt: now })
      .where(and(inArray(effect.planId, ids), isNull(effect.appliedAt), notInArray(effect.status, ["applied", "manual-resolved", "declined"])));
    await tx.update(plan).set({ status: "cancelled", updatedAt: now }).where(inArray(plan.id, ids));
    await tx.insert(planEvent).values(plans.map((row) => ({ ...audit, planId: row.id, fromStatus: row.status, toStatus: "cancelled" as const })));
  }
  const preparations = await tx.update(preparation).set({ status: "cancelled", reason, resolvedByUserId: actor.userId, resolvedAt: now, updatedAt: now })
    .where(and(eq(preparation.encounterId, encounterId), inArray(preparation.status, ["pending", "interrupted", "requires-god-ruling"]))).returning({ id: preparation.id });
  const firearms = await tx.select().from(firearm).where(and(eq(firearm.encounterId, encounterId), notInArray(firearm.status, ["cancelled", "consequence-planned"]))).for("update");
  if (firearms.length) {
    await tx.update(firearm).set({ status: "cancelled", cancelledByUserId: actor.userId, cancelledAt: now, updatedAt: now }).where(inArray(firearm.id, firearms.map((row) => row.id)));
    await tx.insert(firearmEvent).values(firearms.map((row) => ({ ...audit, attackId: row.id, fromStatus: row.status, toStatus: "cancelled" })));
  }
  await tx.update(initiative).set({ status: "closed", closedAt: now, updatedAt: now }).where(and(eq(initiative.encounterId, encounterId), eq(initiative.status, "active")));
  await tx.update(encounter).set({ status: "completed", startedAt: context.encounterStartedAt ?? now, completedAt: now, frozenAt: null,
    freezeRevision: sql`${encounter.freezeRevision} + 1`, updatedAt: now }).where(eq(encounter.id, encounterId));
  await tx.insert(lifecycleAuditEvent).values({ action: "archive", entityKind: "encounter", targetId: String(encounterId), targetName: context.encounterTitle,
    campaignIdSnapshot: context.campaignId, ownerUserIdSnapshot: context.ownerUserId, actorUserId: actor.userId, reason,
    dependencySummaryJson: { forced: true, previousStatus: context.encounterStatus, withdrawnCheckpointIds: groups.map((row) => row.id),
      cancelledDeclarationIds: declarations.map((row) => row.id), endedPendingActionIds: endedActions.map((row) => row.id), cancelledSourceIds: endedSources.map((row) => row.id),
      cancelledReactionIds: reactions.map((row) => row.id), cancelledPlanIds: plans.map((row) => row.id), cancelledPreparationIds: preparations.map((row) => row.id),
      cancelledFirearmAttackIds: firearms.map((row) => row.id), resourcesRefunded: false, consequencesApplied: false, xpAwarded: false } });
  await publishTabletopInvalidationInTransaction(tx, { ...scope, characterIds: [], category: "initiative" });
  return { status: "completed" as const, reused: false };
}

import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  campaignSessionEncounter,
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterActionDeclarationEvent,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterPendingActionSource,
  campaignSessionEncounterReaction,
  campaignSessionEncounterReactionEvent,
  campaignSessionEncounterResponderOpportunity,
} from "@/db/tabletop-operations-schema";

import {
  lockEncounterCloseoutContextInTransaction,
  type EncounterCloseoutTransaction,
} from "./encounter-closeout-service";
import { publishTabletopInvalidationInTransaction } from "./tabletop-live-events";

/** Emergency stop, not successful combat resolution. The caller supplies one transaction. */
export async function forceEndEncounterInTransaction(
  tx: EncounterCloseoutTransaction,
  encounterId: number,
  actingUserId: string,
  confirmation: { confirmed: boolean; reason?: string },
) {
  if (confirmation?.confirmed !== true) {
    throw new Error("Confirm that unfinished actions will be stopped before ending this Encounter.");
  }
  const reason = confirmation.reason?.trim() || "G.O.D. ended a stuck Encounter.";
  if (reason.length > 1000) throw new Error("The reason must be 1,000 characters or fewer.");

  // Lock and verify Campaign ownership before any write. Deliberately do not
  // require active parents, open Initiative, a readable rules snapshot, or Rolls.
  const context = await lockEncounterCloseoutContextInTransaction(tx, encounterId, actingUserId);
  const now = new Date();
  const scope = {
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
  };
  const stopReason = `Encounter force-ended by G.O.D.: ${reason}`;

  const declarations = await tx.update(campaignSessionEncounterActionDeclaration).set({
    status: "cancelled", endedAt: now, endedByUserId: actingUserId, updatedAt: now,
  }).where(and(
    eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
    inArray(campaignSessionEncounterActionDeclaration.status, [
      "draft", "locked", "committed", "rolling-ready", "rolling", "awaiting-god-ruling", "interrupted",
    ]),
  )).returning({ id: campaignSessionEncounterActionDeclaration.id });
  if (declarations.length) await tx.insert(campaignSessionEncounterActionDeclarationEvent).values(
    declarations.map(({ id }) => ({
      ...scope, declarationId: id, toStatus: "cancelled" as const,
      eventKind: "encounter-force-ended", reason: stopReason, actorUserId: actingUserId,
      metadata: { forced: true, noRollsInvented: true, noEffectsApplied: true },
    })),
  );

  const reactions = await tx.update(campaignSessionEncounterReaction).set({
    status: "cancelled", resolvedAt: now, outcome: stopReason, updatedAt: now,
  }).where(and(
    eq(campaignSessionEncounterReaction.encounterId, context.encounterId),
    inArray(campaignSessionEncounterReaction.status, ["declared", "needs-ruling"]),
  )).returning({ id: campaignSessionEncounterReaction.id });
  if (reactions.length) await tx.insert(campaignSessionEncounterReactionEvent).values(
    reactions.map(({ id }) => ({
      ...scope, reactionId: id, toStatus: "cancelled" as const,
      eventKind: "encounter-force-ended", reason: stopReason, actorUserId: actingUserId,
      metadata: { forced: true, noRollsInvented: true },
    })),
  );

  const opportunities = await tx.update(campaignSessionEncounterResponderOpportunity).set({
    status: "cancelled", reconciledAt: now, reconciledByUserId: actingUserId,
    rulingReason: stopReason, updatedAt: now,
  }).where(and(
    eq(campaignSessionEncounterResponderOpportunity.encounterId, context.encounterId),
    inArray(campaignSessionEncounterResponderOpportunity.status, ["pending", "response-declared"]),
  )).returning({ id: campaignSessionEncounterResponderOpportunity.id });

  const pendingActions = await tx.update(campaignSessionEncounterPendingAction).set({
    status: "abandoned", updatedAt: now,
  }).where(and(
    eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId),
    inArray(campaignSessionEncounterPendingAction.status, ["active", "interrupted"]),
  )).returning({ id: campaignSessionEncounterPendingAction.id });
  const sources = await tx.update(campaignSessionEncounterPendingActionSource).set({
    resolutionStatus: "cancelled", resolvedAt: now, resolutionSummary: stopReason, updatedAt: now,
  }).where(and(
    eq(campaignSessionEncounterPendingActionSource.encounterId, context.encounterId),
    inArray(campaignSessionEncounterPendingActionSource.resolutionStatus, ["pending", "needs-ruling"]),
  )).returning({ id: campaignSessionEncounterPendingActionSource.id });

  const initiatives = await tx.update(campaignSessionEncounterInitiative).set({
    status: "closed", closedAt: now, updatedAt: now,
  }).where(and(
    eq(campaignSessionEncounterInitiative.encounterId, context.encounterId),
    eq(campaignSessionEncounterInitiative.status, "active"),
  )).returning({ encounterId: campaignSessionEncounterInitiative.encounterId });

  const changed = context.encounterStatus !== "completed" || declarations.length > 0
    || reactions.length > 0 || opportunities.length > 0 || pendingActions.length > 0
    || sources.length > 0 || initiatives.length > 0;
  if (changed) {
    const note = `\n\n[${now.toISOString()}] ${stopReason} Acting User: ${actingUserId}. `
      + `Stopped ${declarations.length} declarations, ${reactions.length} defenses and ${pendingActions.length} pending actions. `
      + "No new Rolls, damage, rewards or refunds were generated. Existing history and applied effects were preserved.";
    await tx.update(campaignSessionEncounter).set({
      status: "completed",
      startedAt: context.encounterStartedAt ?? now,
      completedAt: context.encounterCompletedAt ?? now,
      godNotes: sql`coalesce(${campaignSessionEncounter.godNotes}, '') || ${note}`,
      updatedAt: now,
    }).where(eq(campaignSessionEncounter.id, context.encounterId));
  }

  const participants = await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .where(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId));
  await publishTabletopInvalidationInTransaction(tx, {
    ...scope, category: "hierarchy",
    characterIds: participants.map(({ characterId }) => characterId).filter((id) => id > 0),
  });
  return { ...scope, changed, stoppedActions: declarations.length, stoppedDefenses: reactions.length };
}

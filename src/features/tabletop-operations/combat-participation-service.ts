import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSessionSceneMember as sceneMember, campaignSessionEncounterParticipant as participant,
  campaignSessionEncounterActionDeclaration as declaration, campaignSessionEncounterActionDeclarationEvent as declarationEvent,
  campaignSessionEncounterResponderOpportunity as opportunity, campaignSessionEncounterReaction as reaction,
  campaignSessionEncounterDeclarationCheckpoint as checkpoint } from "@/db/tabletop-operations-schema";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { readOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";
import { cancelActionDeclarationInTransaction, type ActionDeclarationActor } from "./action-declaration-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, lockOwnedEncounterRuntimeInTransaction,
  type RuntimeIntegrationTransaction as Tx } from "./runtime-integration-service";
import { enrollLateInitiativeParticipant, endPendingInitiativeAction } from "./initiative-runtime";
import { resolveInitiativeCapacityInTransaction } from "./initiative-capacity-service";
import { parseLockedActionDeclarationSnapshot } from "./action-declaration";

export type CombatParticipationCommand = {
  participantId: number; operation: "arrive" | "withdraw" | "confirm-escape";
  requestKey: string; expectedRevision: number; reason: string; movementMode?: string;
};
export type CombatParticipationState = { revision: number; departed: boolean; reason: string; departureKind: string | null };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function combatParticipationState(local: unknown): CombatParticipationState {
  const state = object(object(local).combatParticipation);
  return { revision: typeof state.revision === "number" ? state.revision : 0, departed: state.departed === true,
    reason: typeof state.reason === "string" ? state.reason : "", departureKind: typeof state.departureKind === "string" ? state.departureKind : null };
}

export async function changeCombatParticipationInTransaction(tx: Tx, encounterId: number, actor: ActionDeclarationActor, input: CombatParticipationCommand) {
  return tx.transaction(async (changeTx) => {
    if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may confirm combat arrivals or departures.");
    const context = await lockOwnedEncounterRuntimeInTransaction(changeTx, encounterId, actor.userId);
    await assertCombatWritableInTransaction(changeTx, encounterId);
    if (context.encounterStatus !== "active" || context.sceneStatus !== "active" || context.sessionStatus !== "active") throw new Error("Combat participation requires an active Encounter, Scene and Session.");
    if (!Number.isSafeInteger(input.participantId) || input.participantId === 0 || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      || !input.requestKey.trim() || input.requestKey.length > 200 || !["arrive", "withdraw", "confirm-escape"].includes(input.operation)) throw new Error("Combat participation requires an exact identity, operation, revision and stable request identity.");
    const reason = input.reason.trim();
    if (!reason || reason.length > 1000) throw new Error("Record a concise G.O.D. arrival or departure reason.");
    const request = JSON.parse(JSON.stringify({ ...input, reason }));
    let [member] = await changeTx.select().from(participant).where(and(eq(participant.encounterId, encounterId), eq(participant.characterId, input.participantId))).for("update");
    const initialLocal = object(member?.localStateJson);
    const state = combatParticipationState(initialLocal);
    const history = Array.isArray(object(initialLocal.combatParticipation).history) ? object(initialLocal.combatParticipation).history as Record<string, unknown>[] : [];
    const prior = history.find((entry) => object(entry.request).requestKey === input.requestKey);
    if (prior) {
      if (!isDeepStrictEqual(prior.request, request)) throw new Error("That participation request already records a different decision.");
      return { participantId: input.participantId, ...state, reused: true };
    }
    if (input.expectedRevision !== state.revision) throw new Error("Combat participation changed. Refresh before confirming another arrival or departure.");
    if (input.operation === "arrive" && input.participantId > 0) {
      const [eligible] = await changeTx.select({ archivedAt: campaignCharacter.archivedAt }).from(sceneMember).innerJoin(campaignCharacter,
        and(eq(campaignCharacter.id, sceneMember.characterId), eq(campaignCharacter.campaignId, sceneMember.campaignId)))
        .where(and(eq(sceneMember.sceneId, context.sceneId), eq(sceneMember.characterId, input.participantId), eq(sceneMember.campaignId, context.campaignId)));
      if (!eligible || eligible.archivedAt) throw new Error("An arriving Character or NPC must be an unarchived member of this exact Scene.");
      if (!member) {
        const members = await changeTx.select({ order: participant.sortOrder }).from(participant).where(eq(participant.encounterId, encounterId));
        [member] = await changeTx.insert(participant).values({ encounterId, sceneId: context.sceneId, sessionId: context.sessionId, campaignId: context.campaignId,
          characterId: input.participantId, sortOrder: Math.max(-1, ...members.map(({ order }) => order)) + 1 }).returning();
      }
    }
    if (!member) throw new Error("The exact Creature occurrence or departing combatant must already belong to this Encounter.");
    const before = await loadInitiativeEngineInTransaction(changeTx, encounterId);
    const enrolled = before.participants.find(({ characterId }) => characterId === input.participantId);
    const departure = input.operation !== "arrive";
    const now = new Date();
    if (!departure) {
      if (object(member.localStateJson).defeat) throw new Error("This combatant has recorded defeat. Resolve that state explicitly before returning it to active combat.");
      if (!enrolled) {
        const capacity = await resolveInitiativeCapacityInTransaction(changeTx, input.participantId, context.campaignId, input.movementMode);
        await persistInitiativeEngineInTransaction(changeTx, context, before, enrollLateInitiativeParticipant(before, capacity));
      } else if (state.departed || enrolled.participationStatus === "suspended") {
        // Retained balances include elapsed spending, immediate effects and debt.
        await persistInitiativeEngineInTransaction(changeTx, context, before, { ...before, participants: before.participants.map((entry) => entry.characterId === input.participantId
          ? { ...entry, participationStatus: "active" as const } : entry) });
      }
    } else if (!state.departed) {
      const declarations = await changeTx.select().from(declaration).where(eq(declaration.encounterId, encounterId)).orderBy(asc(declaration.id));
      for (const row of declarations) {
        if (["resolved", "cancelled", "abandoned"].includes(row.status)) continue;
        const pending = before.pendingActions.find(({ id }) => id === row.pendingActionId);
        // Completed outcomes are independent of arrival order of Apply/Withdraw requests.
        if (pending?.status === "completed") continue;
        if (row.actorCharacterId === input.participantId) {
          await cancelActionDeclarationInTransaction(changeTx, context, actor, row.id, reason, true);
        } else if (row.lockedSnapshotJson && parseLockedActionDeclarationSnapshot(row.lockedSnapshotJson).targetCharacterIds.includes(input.participantId)) {
          if (row.pendingActionId !== null) {
            await changeTx.update(declaration).set({ status: "awaiting-god-ruling", rulingReason: `Target left active combat before this action completed. ${reason}`, updatedAt: now }).where(eq(declaration.id, row.id));
            await changeTx.insert(declarationEvent).values({ declarationId: row.id, encounterId, sceneId: context.sceneId, sessionId: context.sessionId, campaignId: context.campaignId,
              fromStatus: row.status, toStatus: "awaiting-god-ruling", eventKind: "target-departed", actorUserId: actor.userId, reason,
              metadata: { participantId: input.participantId, consequencesAlreadyDue: false } });
          }
        }
      }
      // Retained generic/source-bound actions have no rich declaration, but must
      // leave the same timeline and preserve their spent resources and debt.
      let remaining = await loadInitiativeEngineInTransaction(changeTx, encounterId);
      for (const pending of remaining.pendingActions.filter((entry) => entry.actorCharacterId === input.participantId && ["active", "interrupted"].includes(entry.status))) {
        await persistInitiativeEngineInTransaction(changeTx, context, remaining, endPendingInitiativeAction(remaining, pending.id), "correction");
        remaining = await loadInitiativeEngineInTransaction(changeTx, encounterId);
      }
      const stoppedSources = before.pendingActions.filter((entry) => entry.actorCharacterId === input.participantId && ["active", "interrupted"].includes(entry.status)).map(({ id }) => id);
      if (stoppedSources.length) await changeTx.update(reaction).set({ status: "cancelled", outcome: `Source combatant departed; committed response cost retained. ${reason}`,
        reconciliationAppliedAt: now, resolvedAt: now, updatedAt: now }).where(and(eq(reaction.encounterId, encounterId),
        inArray(reaction.pendingActionId, stoppedSources), inArray(reaction.status, ["declared", "needs-ruling"])));
      // No new defense is demanded from an absent combatant. Already committed
      // responses to due outcomes survive; future cancelled responses retain costs.
      const windows = await changeTx.select().from(opportunity).where(and(eq(opportunity.encounterId, encounterId), eq(opportunity.responderCharacterId, input.participantId)));
      for (const window of windows) {
        if (window.status === "pending") await changeTx.update(opportunity).set({ status: "ineligible", rulingReason: reason,
          reconciledByUserId: actor.userId, reconciledAt: now, updatedAt: now }).where(eq(opportunity.id, window.id));
        const pending = before.pendingActions.find(({ id }) => id === window.pendingActionId);
        if (window.reactionId !== null && pending?.status !== "completed") await changeTx.update(reaction).set({ status: "cancelled", outcome: `Departed; committed response cost retained. ${reason}`,
          reconciliationAppliedAt: now, resolvedAt: now, updatedAt: now }).where(and(eq(reaction.id, window.reactionId), eq(reaction.status, "declared")));
      }
      const current = await loadInitiativeEngineInTransaction(changeTx, encounterId);
      if (enrolled) await persistInitiativeEngineInTransaction(changeTx, context, current, { ...current,
        runtime: { ...current.runtime, stepNumber: before.runtime.stepNumber },
        participants: current.participants.map((entry) => entry.characterId === input.participantId ? { ...entry, participationStatus: "suspended" as const } : entry) }, "correction");
      const open = await readOpenDeclarationCheckpoint(changeTx, encounterId);
      if (open?.participantIdsJson.includes(input.participantId)) {
        const committed = open.choicesJson.some(({ participantId }) => participantId === input.participantId);
        const remaining = committed ? open.participantIdsJson : open.participantIdsJson.filter((id) => id !== input.participantId);
        const snapshot = object(open.beforeStateJson);
        const publicParticipants = Array.isArray(snapshot.participants) ? snapshot.participants.map((entry) => object(entry).characterId === input.participantId
          ? { ...object(entry), participationStatus: "suspended" } : entry) : [];
        const complete = remaining.every((id) => open.choicesJson.some(({ participantId }) => participantId === id));
        await changeTx.update(checkpoint).set({ participantIdsJson: remaining.length ? remaining : open.participantIdsJson,
          revealedAt: complete ? now : null, beforeStateJson: { ...snapshot, participants: publicParticipants,
            departures: [...(Array.isArray(snapshot.departures) ? snapshot.departures : []), { participantId: input.participantId, reason, actorUserId: actor.userId, departedAt: now.toISOString() }] } }).where(eq(checkpoint.id, open.id));
      }
    }
    const [latest] = await changeTx.select().from(participant).where(eq(participant.participantId, member.participantId));
    const local = object(latest.localStateJson);
    const next: CombatParticipationState = { revision: state.revision + 1, departed: departure, reason, departureKind: departure ? input.operation : null };
    await changeTx.update(participant).set({ localStateJson: { ...local, combatParticipation: { ...next,
      history: [...history, { request, actorUserId: actor.userId, changedAt: now.toISOString(), revision: next.revision,
        initiativeBefore: enrolled ?? null, roundNumber: before.runtime.roundNumber, stepNumber: before.runtime.stepNumber }] } }, updatedAt: now }).where(eq(participant.participantId, member.participantId));
    return { participantId: input.participantId, ...next, reused: false };
  });
}

import "server-only";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";

import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import {
  campaignSessionEncounterDeclarationCheckpoint as checkpoint,
  campaignSessionEncounterInitiative,
  campaignSessionRoll,
} from "@/db/tabletop-operations-schema";
import { getNextInitiativeTimelineEvent, type InitiativeEngineState } from "./initiative-runtime";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Choice = (typeof checkpoint.$inferSelect)["choicesJson"][number];

export async function hasUnresolvedCompletedActionsInTransaction(tx: Transaction, encounterId: number): Promise<boolean> {
  const unfinished = await tx.execute(sql`SELECT declaration.id FROM campaign_session_encounter_action_declaration declaration
    JOIN campaign_session_encounter_pending_action action ON action.id = declaration.pending_action_id
    WHERE declaration.encounter_id = ${encounterId} AND action.status = 'completed'
      AND declaration.status NOT IN ('resolved', 'cancelled', 'abandoned') LIMIT 1`);
  return unfinished.rows.length > 0;
}

export async function readOpenDeclarationCheckpoint(tx: Transaction, encounterId: number) {
  const [row] = await tx.select().from(checkpoint)
    .where(and(eq(checkpoint.encounterId, encounterId), isNull(checkpoint.revealedAt)))
    .limit(1);
  return row ?? null;
}

export async function beginDeclarationCheckpointInTransaction(
  tx: Transaction,
  encounterId: number,
  engine: InitiativeEngineState,
  participantId: number,
  response = false,
): Promise<number> {
  await assertCombatWritableInTransaction(tx, encounterId);
  // All choices serialize on the same runtime before capturing membership.
  await tx.select({ id: campaignSessionEncounterInitiative.encounterId }).from(campaignSessionEncounterInitiative)
    .where(eq(campaignSessionEncounterInitiative.encounterId, encounterId)).for("update");
  const existing = await readOpenDeclarationCheckpoint(tx, encounterId);
  if (existing) {
    if (!existing.participantIdsJson.includes(participantId)) throw new Error("Complete the current simultaneous declaration checkpoint before intervening.");
    if (existing.choicesJson.some((choice) => choice.participantId === participantId)) {
      throw new Error("This participant has already committed its choice at this declaration checkpoint.");
    }
    return existing.id;
  }
  if (!response) {
    if (await hasUnresolvedCompletedActionsInTransaction(tx, encounterId)) throw new Error("Resolve every action completing at this point before committing the next ordinary choice; simultaneous outcomes must remain intact.");
  }
  const next = getNextInitiativeTimelineEvent(engine);
  const currentIds = next.kind === "normal-opportunity" && next.initiative === engine.runtime.timelineInitiative
    ? next.characterIds
    : [];
  const participant = engine.participants.find(({ characterId }) => characterId === participantId);
  if (!participant || !["active", "holding"].includes(participant.participationStatus) || participant.currentInitiative <= 0) {
    throw new Error("That exact participant cannot currently commit an action or response.");
  }
  if (!currentIds.includes(participantId) && !response) {
    throw new Error("Advance to this participant's current declaration opportunity before committing.");
  }
  const manaBefore: Record<string, Awaited<ReturnType<typeof readActiveManaInTransaction>>> = {};
  const manaBeforeIssues: Record<string, string> = {};
  for (const participant of engine.participants) {
    if (participant.characterId <= 0) continue;
    try { manaBefore[String(participant.characterId)] = await readActiveManaInTransaction(tx, participant.characterId); }
    catch (error) { manaBeforeIssues[String(participant.characterId)] = error instanceof Error ? error.message : "Mana source is unavailable."; }
  }
  const [created] = await tx.insert(checkpoint).values({
    encounterId,
    roundNumber: engine.runtime.roundNumber,
    timelineInitiative: engine.runtime.timelineInitiative,
    participantIdsJson: currentIds.includes(participantId) ? [...currentIds].sort((a, b) => a - b) : [participantId],
    choicesJson: [],
    beforeStateJson: { participants: engine.participants, pendingActions: engine.pendingActions, manaBefore, manaBeforeIssues },
  }).returning({ id: checkpoint.id });
  if (!created) throw new Error("The simultaneous declaration checkpoint could not be created.");
  return created.id;
}

export async function finishDeclarationCheckpointChoiceInTransaction(tx: Transaction, checkpointId: number, choice: Choice): Promise<void> {
  const [row] = await tx.select().from(checkpoint).where(eq(checkpoint.id, checkpointId)).limit(1).for("update");
  if (!row || !row.participantIdsJson.includes(choice.participantId)) throw new Error("The choice does not belong to this exact checkpoint.");
  const previous = row.choicesJson.find((entry) => entry.participantId === choice.participantId);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(choice)) throw new Error("This checkpoint already contains a different locked choice.");
    return;
  }
  if (row.revealedAt) throw new Error("This declaration checkpoint is already revealed.");
  const choices = [...row.choicesJson, choice].sort((a, b) => a.participantId - b.participantId);
  const complete = row.participantIdsJson.every((id) => choices.some((entry) => entry.participantId === id));
  await tx.update(checkpoint).set({ choicesJson: choices, revealedAt: complete ? new Date() : null })
    .where(eq(checkpoint.id, row.id));
}

export async function assertDeclarationCheckpointRevealed(tx: Transaction, checkpointId: number | null): Promise<void> {
  if (checkpointId === null) return; // Retained historical declarations predate checkpoints.
  const [row] = await tx.select().from(checkpoint).where(eq(checkpoint.id, checkpointId)).limit(1);
  if (!row?.revealedAt || (row.beforeStateJson as { withdrawal?: unknown }).withdrawal) throw new Error("Declarations and Rolls remain sealed until every current participant commits its choice.");
}

export async function assertNoOpenDeclarationCheckpoint(tx: Transaction, encounterId: number): Promise<void> {
  if (await readOpenDeclarationCheckpoint(tx, encounterId)) {
    throw new Error("Complete the current simultaneous declaration checkpoint before advancing combat time.");
  }
}

// Applied before SQL pagination, to both Player and G.O.D. ledger projections.
export function revealedCombatRollPredicate() {
  return sql`NOT EXISTS (
    SELECT 1 FROM campaign_session_encounter_action_declaration declaration
    JOIN campaign_session_encounter_declaration_checkpoint boundary ON boundary.id = declaration.checkpoint_id
    WHERE declaration.pending_action_id = ${campaignSessionRoll.pendingActionId} AND (boundary.revealed_at IS NULL OR boundary.before_state_json ? 'withdrawal')
  ) AND NOT EXISTS (
    SELECT 1 FROM campaign_session_encounter_reaction reaction
    JOIN campaign_session_encounter_declaration_checkpoint boundary ON boundary.id = reaction.checkpoint_id
    WHERE reaction.id = ${campaignSessionRoll.reactionId} AND (boundary.revealed_at IS NULL OR boundary.before_state_json ? 'withdrawal')
  )`;
}

export async function projectRevealedInitiativeInTransaction(tx: Transaction, engine: InitiativeEngineState): Promise<InitiativeEngineState> {
  const open = await readOpenDeclarationCheckpoint(tx, engine.runtime.encounterId);
  if (!open) return engine;
  const before = open.beforeStateJson as Pick<InitiativeEngineState, "participants" | "pendingActions">;
  return { ...engine, participants: before.participants, pendingActions: before.pendingActions };
}

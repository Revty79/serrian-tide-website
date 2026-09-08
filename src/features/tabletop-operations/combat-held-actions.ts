import type { CombatProgression, CombatTask } from "./combat-progression";
import {
  canAdvanceInitiativeRound,
  canHoldingParticipantIntervene,
  getNextInitiativeTimelineEvent,
  type InitiativeEngineState,
} from "./initiative-runtime";

/** Hold remains a voluntary opening, not Pass and not an extra ordinary turn.
 * It must never allow a player to act retroactively after a due roll/result. */
export function withHeldCombatChoices(
  engine: InitiativeEngineState,
  progression: CombatProgression,
  identities: readonly { characterId: number; name: string }[],
): CombatProgression {
  if (engine.runtime.status !== "active") return progression;
  const safeKinds = new Set(["choose-action", "eligibility", "choose-response", "advance-time", "next-round", "blocked"]);
  if (progression.tasks.some(({ kind }) => !safeKinds.has(kind))) return progression;
  const next = getNextInitiativeTimelineEvent(engine);
  // Completion has precedence at the same point; never intervene in the past.
  if (next.kind === "pending-completion" && next.initiative >= engine.runtime.timelineInitiative) return progression;
  const held: CombatTask[] = engine.participants.filter((participant) => (
    participant.currentInitiative > 0
    && canHoldingParticipantIntervene(engine.runtime, participant)
    && !engine.pendingActions.some((action) => action.actorCharacterId === participant.characterId && action.status === "active")
  )).sort((left, right) => right.currentInitiative - left.currentInitiative || left.characterId - right.characterId)
    .map((participant) => ({
      key: `held:${participant.characterId}`,
      kind: "held-action",
      participantId: participant.characterId,
      declarationId: null,
      recordId: null,
      title: `${identities.find(({ characterId }) => characterId === participant.characterId)?.name ?? "Combatant"}: holding — act or keep waiting`,
      detail: `You still have ${participant.currentInitiative} Initiative. You may act from Hold, keep holding, or Pass this round. Your opening remains available after other combatants act; combat time never rewinds.`,
    }));
  return held.length ? { ...progression, tasks: [...held, ...progression.tasks] } : progression;
}

/** Holding an entire round preserves the pool. Asking to start the next round
 * is still an explicit G.O.D. decision; no holder is silently changed to Passed. */
export function canFinishRoundWithHolders(engine: InitiativeEngineState): boolean {
  if (engine.runtime.status !== "active") return false;
  return canAdvanceInitiativeRound({
    ...engine,
    participants: engine.participants.map((participant) => participant.participationStatus === "holding"
      && !engine.pendingActions.some((action) => action.actorCharacterId === participant.characterId && action.status === "active")
      ? { ...participant, participationStatus: "passed" as const } : participant),
  });
}

import "server-only";

import { and, eq } from "drizzle-orm";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { readActionDeclarationWorkspaceInTransaction, type ActionDeclarationActor } from "./action-declaration-service";
import { canAdvanceInitiativeRound, canHoldingParticipantIntervene, canParticipantReactToAction, getNextInitiativeTimelineEvent } from "./initiative-runtime";
import { loadInitiativeEngineInTransaction, type OwnedEncounterRuntimeContext, type RuntimeIntegrationTransaction } from "./runtime-integration-service";
import { hasUnresolvedCompletedActionsInTransaction, projectRevealedInitiativeInTransaction, readOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";
import { initiativeStateToken } from "./initiative-state-token";
import { combatParticipationState } from "./combat-participation-service";
import { combatConditionState, combatConditionMessage, combatObject } from "./combat-condition-state";
import { combatLimbConditions } from "./combat-limb-state";
import { combatConditionAlerts } from "./combat-condition-alerts";

/** One authorized, sealed-state-safe projection for the later combat cards.
 * Availability describes an opportunity, not approval of every possible source/cost.
 * Selecting a card never depends on that card's ability to act.
 */
export async function readCombatProjectionInTransaction(
  tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor,
) {
  const workspace = await readActionDeclarationWorkspaceInTransaction(tx, context, actor);
  const engine = await projectRevealedInitiativeInTransaction(tx, await loadInitiativeEngineInTransaction(tx, context.encounterId, true));
  const closed = engine.runtime.status !== "active" || context.encounterStatus === "completed";
  const next = closed ? null : getNextInitiativeTimelineEvent(engine);
  const checkpoint = workspace.checkpoint;
  const pendingOutcomes = await hasUnresolvedCompletedActionsInTransaction(tx, context.encounterId);
  const members = await tx.select({ id: campaignSessionEncounterParticipant.characterId, local: campaignSessionEncounterParticipant.localStateJson })
    .from(campaignSessionEncounterParticipant).where(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId));
  const entities = workspace.participants.map((entity) => {
    const participation = combatParticipationState(members.find(({ id }) => id === entity.characterId)?.local);
    const condition = combatConditionState(members.find(({ id }) => id === entity.characterId)?.local);
    const limbConditions = actor.authority === "god-owner" || actor.characterId === entity.characterId
      ? combatLimbConditions(members.find(({ id }) => id === entity.characterId)?.local).filter((limb) => !limb.recoveredAt).map(({ poolKey, name }) => ({ poolKey, name })) : [];
    const participant = engine.participants.find(({ characterId }) => characterId === entity.characterId)!;
    const canControl = actor.authority === "god-owner" ? entity.choiceOwner === "god" : actor.characterId === entity.characterId;
    const choicesSealed = checkpoint?.committedParticipantIds.includes(entity.characterId) ?? false;
    const capable = ["active", "holding"].includes(participant.participationStatus) && participant.currentInitiative > 0;
    const active = engine.pendingActions.find((action) => action.actorCharacterId === entity.characterId && ["active", "interrupted"].includes(action.status));
    const visibleAction = workspace.declarations.find((declaration) => declaration.pendingActionId === active?.id);
    const currentAction = active ? {
      declarationId: visibleAction?.id ?? null,
      label: visibleAction?.lockedSnapshot?.label ?? "Action underway",
      status: active.status, originalCost: active.originalInitiativeCost,
      elapsed: active.initiativeSpent, remaining: active.remainingInitiativeCost,
      expectedFinish: active.expectedCompletionInitiative,
    } : null;
    const normalNow = next?.kind === "normal-opportunity" && next.initiative === engine.runtime.timelineInitiative && next.characterIds.includes(entity.characterId);
    const heldInterventionAvailable = !closed && checkpoint == null && !active && canHoldingParticipantIntervene(engine.runtime, participant);
    const eligibleResponses = workspace.declarations.flatMap((declaration) => {
      if (closed) return [];
      const pending = engine.pendingActions.find(({ id }) => id === declaration.pendingActionId);
      if (!pending || !["active", "completed"].includes(pending.status)) return [];
      return declaration.opportunities.filter((opportunity) => opportunity.responderCharacterId === entity.characterId
        && opportunity.status === "pending" && opportunity.reactionId === null && !opportunity.requiresGodConfirmation
        && (opportunity.source === "god-exception" || canParticipantReactToAction(pending, participant.currentInitiative)
          || canHoldingParticipantIntervene(engine.runtime, participant)));
    });
    const checkpointBlocksResponse = checkpoint != null && (!checkpoint.participantIds.includes(entity.characterId) || choicesSealed);
    const common = (closed ? "Combat has ended. Actions and responses are closed; information and history remain available." : null)
      ?? workspace.pause.message ?? combatConditionMessage(condition) ?? (participation.departed ? `Left active combat: ${participation.reason}` : !capable ? participant.participationStatus === "suspended"
      ? "Unable to participate." : "No Initiative opportunity remains." : choicesSealed ? "Choice committed; waiting for simultaneous choices." : null);
    const actionReason = common ?? (heldInterventionAvailable ? null : pendingOutcomes ? "Resolve the outcomes completing at this point." : active ? "An action is underway."
      : participant.participationStatus === "holding" ? "Holding Initiative; waiting for a legitimate intervention point."
      : !normalNow ? "Waiting for this combatant's Initiative opportunity." : null);
    const responseReason = common ?? (checkpointBlocksResponse ? "Waiting for the simultaneous declaration checkpoint."
      : !eligibleResponses.length ? "No confirmed response opportunity is available now." : null);
    const canActNow = actionReason === null;
    const canRespondNow = responseReason === null;
    return { participantId: entity.characterId, name: entity.name, currentInitiative: entity.currentInitiative,
      participationStatus: participant.participationStatus, participation, condition, limbConditions, currentAction, canActNow, canRespondNow, canControl, heldInterventionAvailable: canActNow && heldInterventionAvailable,
      canInspect: true as const, actionReason, responseReason, mustChooseNow: canActNow && !heldInterventionAvailable && !!normalNow,
      statusText: canActNow && canRespondNow ? "Can choose an action or response." : canRespondNow ? "Can respond now."
        : canActNow && heldInterventionAvailable ? "Holding Initiative; may intervene when legitimate. No ordinary choice is required."
        : canActNow ? "Can choose an action now." : common ?? actionReason ?? responseReason!,
      responseOpportunityIds: canControl && canRespondNow ? eligibleResponses.map(({ id }) => id) : [],
    };
  });
  const canAdvanceTimeline = !closed && !workspace.pause.frozen && !checkpoint && !pendingOutcomes && next?.kind !== "none"
    && !(next?.kind === "normal-opportunity" && next.initiative === engine.runtime.timelineInitiative);
  const progression = { canAdvanceTimeline, canAdvanceRound: !closed && !workspace.pause.frozen && !checkpoint && !pendingOutcomes && canAdvanceInitiativeRound(engine),
    reason: closed ? "Combat has ended." : workspace.pause.message ?? (checkpoint ? "Waiting for the remaining simultaneous choices."
      : pendingOutcomes ? "Resolve the outcomes completing at this point." : canAdvanceTimeline ? "The G.O.D. can advance combat to the next engine event."
      : next?.kind === "none" ? "No further Initiative event is pending. Holding combatants may wait for a legitimate intervention or choose Pass; no automatic advancement is needed."
      : "Waiting for the remaining ordinary choices at this Initiative.") };
  return { context: workspace.context, runtime: { ...workspace.runtime, status: engine.runtime.status }, closed, stateToken: initiativeStateToken(engine), pause: workspace.pause, entities, progression,
    alerts: combatConditionAlerts(workspace.participants.map((entity) => ({ participantId: entity.characterId, name: entity.name,
      local: members.find(({ id }) => id === entity.characterId)?.local })), actor),
    checkpoint: checkpoint ?? null, declarations: workspace.declarations };
}

export async function readCombatEntityInformationInTransaction(
  tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor, participantId: number,
) {
  const projection = await readCombatProjectionInTransaction(tx, context, actor);
  const entity = projection.entities.find((entry) => entry.participantId === participantId);
  if (!entity) throw new Error("That entity does not belong to this Encounter.");
  const canReadResources = actor.authority === "god-owner" || actor.characterId === participantId;
  if (!canReadResources) return { entity, pause: projection.pause, resources: null };
  const [row] = await tx.select({ kind: campaignSessionEncounterParticipant.participantKind,
    snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson, localState: campaignSessionEncounterParticipant.localStateJson,
    npcKind: campaignCharacter.npcKind }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .where(and(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.characterId, participantId))).limit(1);
  if (!row) throw new Error("That entity no longer belongs to this Encounter.");
  const retained = combatObject(row.localState);
  // Owner-only audit details include exact source/effect IDs for recovery
  // rulings. Do not put these private records on the shared combatant cards.
  const combatHistory = actor.authority === "god-owner" ? {
    condition: combatObject(retained.combatCondition),
    damageOutcomes: Array.isArray(retained.damageOutcomes) ? retained.damageOutcomes : [],
    defeat: retained.defeat ?? null,
    revivals: Array.isArray(retained.combatRevivals) ? retained.combatRevivals : [],
  } : null;
  if (row.kind === "creature") {
    const local = row.localState as Record<string, unknown>;
    // Participation audit balances can include a response committed in the
    // currently sealed group. The card needs only the public participation state.
    const state = projection.checkpoint && local?.combatParticipation
      ? { ...local, combatParticipation: combatParticipationState(local) } : row.localState;
    return { entity, pause: projection.pause, combatHistory,
      resources: { kind: "creature" as const, anatomyAndStatistics: row.snapshot, state } };
  }
  const issues: string[] = [];
  const health = await readActiveHealthInTransaction(tx, participantId, row.npcKind ?? "race").catch((error: unknown) => {
    issues.push(error instanceof Error ? error.message : "Health information is incomplete."); return null;
  });
  const mana = await readActiveManaInTransaction(tx, participantId).catch((error: unknown) => {
    issues.push(error instanceof Error ? error.message : "Mana information is incomplete."); return null;
  });
  const effects = await readActiveEffectsInTransaction(tx, participantId);
  const checkpoint = await readOpenDeclarationCheckpoint(tx, context.encounterId);
  const before = checkpoint?.beforeStateJson as { manaBefore?: Record<string, typeof mana> } | undefined;
  return { entity, pause: projection.pause, combatHistory, resources: { kind: "character" as const,
    health: health?.view ?? null, mana: before?.manaBefore?.[String(participantId)] ?? (checkpoint ? null : mana), effects, issues } };
}

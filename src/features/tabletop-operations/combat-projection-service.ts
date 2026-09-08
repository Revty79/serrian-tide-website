import "server-only";

import { and, eq } from "drizzle-orm";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { readActiveManaInTransaction } from "@/features/active-state/active-mana-service";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { readActionDeclarationWorkspaceInTransaction, type ActionDeclarationActor } from "./action-declaration-service";
import { canHoldingParticipantIntervene, canParticipantReactToAction, getNextInitiativeTimelineEvent } from "./initiative-runtime";
import { loadInitiativeEngineInTransaction, type OwnedEncounterRuntimeContext, type RuntimeIntegrationTransaction } from "./runtime-integration-service";
import { hasUnresolvedCompletedActionsInTransaction, projectRevealedInitiativeInTransaction, readOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";

/** One authorized, sealed-state-safe projection for the later combat cards.
 * Availability describes an opportunity, not approval of every possible source/cost.
 * Selecting a card never depends on that card's ability to act.
 */
export async function readCombatProjectionInTransaction(
  tx: RuntimeIntegrationTransaction, context: OwnedEncounterRuntimeContext, actor: ActionDeclarationActor,
) {
  const workspace = await readActionDeclarationWorkspaceInTransaction(tx, context, actor);
  const engine = await projectRevealedInitiativeInTransaction(tx, await loadInitiativeEngineInTransaction(tx, context.encounterId));
  const next = getNextInitiativeTimelineEvent(engine);
  const checkpoint = workspace.checkpoint;
  const pendingOutcomes = await hasUnresolvedCompletedActionsInTransaction(tx, context.encounterId);
  const entities = workspace.participants.map((entity) => {
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
    const normalNow = next.kind === "normal-opportunity" && next.initiative === engine.runtime.timelineInitiative && next.characterIds.includes(entity.characterId);
    const heldInterventionAvailable = checkpoint == null && !active && canHoldingParticipantIntervene(engine.runtime, participant);
    const eligibleResponses = workspace.declarations.flatMap((declaration) => {
      const pending = engine.pendingActions.find(({ id }) => id === declaration.pendingActionId);
      if (!pending || !["active", "completed"].includes(pending.status)) return [];
      return declaration.opportunities.filter((opportunity) => opportunity.responderCharacterId === entity.characterId
        && opportunity.status === "pending" && opportunity.reactionId === null && !opportunity.requiresGodConfirmation
        && (opportunity.source === "god-exception" || canParticipantReactToAction(pending, participant.currentInitiative)
          || canHoldingParticipantIntervene(engine.runtime, participant)));
    });
    const checkpointBlocksResponse = checkpoint != null && (!checkpoint.participantIds.includes(entity.characterId) || choicesSealed);
    const common = workspace.pause.message ?? (!capable ? participant.participationStatus === "suspended"
      ? "Unable to participate." : "No Initiative opportunity remains." : choicesSealed ? "Choice committed; waiting for simultaneous choices." : null);
    const actionReason = common ?? (heldInterventionAvailable ? null : pendingOutcomes ? "Resolve the outcomes completing at this point." : active ? "An action is underway."
      : participant.participationStatus === "holding" ? "Holding Initiative; waiting for a legitimate intervention point."
      : !normalNow ? "Waiting for this combatant's Initiative opportunity." : null);
    const responseReason = common ?? (checkpointBlocksResponse ? "Waiting for the simultaneous declaration checkpoint."
      : !eligibleResponses.length ? "No confirmed response opportunity is available now." : null);
    const canActNow = actionReason === null;
    const canRespondNow = responseReason === null;
    return { participantId: entity.characterId, name: entity.name, currentInitiative: entity.currentInitiative,
      participationStatus: participant.participationStatus, currentAction, canActNow, canRespondNow, canControl, heldInterventionAvailable: canActNow && heldInterventionAvailable,
      canInspect: true as const, actionReason, responseReason,
      statusText: canActNow && canRespondNow ? "Can choose an action or response." : canRespondNow ? "Can respond now."
        : canActNow ? "Can choose an action now." : common ?? actionReason ?? responseReason!,
      responseOpportunityIds: canControl && canRespondNow ? eligibleResponses.map(({ id }) => id) : [],
    };
  });
  return { context: workspace.context, runtime: workspace.runtime, pause: workspace.pause, entities,
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
  if (row.kind === "creature") return { entity, pause: projection.pause,
    resources: { kind: "creature" as const, anatomyAndStatistics: row.snapshot, state: row.localState } };
  const health = await readActiveHealthInTransaction(tx, participantId, row.npcKind ?? "race");
  const mana = await readActiveManaInTransaction(tx, participantId);
  const effects = await readActiveEffectsInTransaction(tx, participantId);
  const checkpoint = await readOpenDeclarationCheckpoint(tx, context.encounterId);
  const before = checkpoint?.beforeStateJson as { manaBefore?: Record<string, typeof mana> } | undefined;
  return { entity, pause: projection.pause, resources: { kind: "character" as const,
    health: health.view, mana: before?.manaBefore?.[String(participantId)] ?? mana, effects } };
}

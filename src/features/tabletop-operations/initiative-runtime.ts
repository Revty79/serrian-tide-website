import { getMovementInitiative } from "@/features/characters/character-rules";

export const INITIATIVE_RUNTIME_STATUSES = ["active", "closed"] as const;
export const INITIATIVE_PARTICIPATION_STATUSES = ["active", "holding", "passed", "suspended"] as const;
export const PENDING_ACTION_STATUSES = ["active", "interrupted", "completed", "abandoned", "ended"] as const;

export type InitiativeRuntimeStatus = (typeof INITIATIVE_RUNTIME_STATUSES)[number];
export type InitiativeParticipationStatus = (typeof INITIATIVE_PARTICIPATION_STATUSES)[number];
export type PendingInitiativeActionStatus = (typeof PENDING_ACTION_STATUSES)[number];
export type CapacityChangeMode = "ordinary" | "penalty-recovery";

export type InitiativeRuntimeState = {
  encounterId: number;
  status: InitiativeRuntimeStatus;
  roundNumber: number;
  stepNumber: number;
  timelineInitiative: number;
  startedAt: Date;
  closedAt: Date | null;
};

export type InitiativeParticipantState = {
  encounterId: number;
  characterId: number;
  normalTotalInitiative: number;
  currentInitiative: number;
  participationStatus: InitiativeParticipationStatus;
  deferredInitiativeCost: number;
  lastSatisfiedStep: number;
  movementMode: string;
};

export type PendingInitiativeActionState = {
  id: number;
  encounterId: number;
  actorCharacterId: number;
  label: string;
  actionKind: string;
  allowsMultiRound: boolean;
  originalInitiativeCost: number;
  initiativeSpent: number;
  remainingInitiativeCost: number;
  startInitiative: number;
  startTimelineInitiative: number;
  expectedCompletionInitiative: number;
  status: PendingInitiativeActionStatus;
  startedRound: number;
  completedRound: number | null;
};

export type InitiativeEngineState = {
  runtime: InitiativeRuntimeState;
  participants: InitiativeParticipantState[];
  pendingActions: PendingInitiativeActionState[];
};

export type InitiativeTimelineEvent =
  | { kind: "pending-completion"; initiative: number; actionIds: number[] }
  | { kind: "normal-opportunity"; initiative: number; characterIds: number[] }
  | { kind: "pending-round-boundary"; initiative: 0; actionIds: number[] }
  | { kind: "none"; initiative: number; actionIds: []; characterIds: [] };

export type StartInitiativeActionInput = {
  id: number;
  actorCharacterId: number;
  label: string;
  actionKind?: string;
  initiativeCost: number;
  allowsMultiRound: boolean;
  heldIntervention?: boolean;
};

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

function positive(value: number, label: string): number {
  finite(value, label);
  if (value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function nonNegative(value: number, label: string): number {
  finite(value, label);
  if (value < 0) throw new Error(`${label} must be zero or greater.`);
  return value;
}

function positiveWhole(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive whole number.`);
  return value;
}

function requireActiveRuntime(state: InitiativeEngineState): void {
  if (state.runtime.status !== "active") throw new Error("Initiative Runtime is closed.");
}

function participantById(state: InitiativeEngineState, characterId: number): InitiativeParticipantState {
  const participant = state.participants.find((entry) => entry.characterId === characterId);
  if (!participant) throw new Error("That Character is not enrolled in this Initiative Runtime.");
  return participant;
}

function activeActionFor(state: InitiativeEngineState, characterId: number): PendingInitiativeActionState | null {
  return state.pendingActions.find((action) => action.actorCharacterId === characterId && action.status === "active") ?? null;
}

function actionById(state: InitiativeEngineState, actionId: number): PendingInitiativeActionState {
  const action = state.pendingActions.find((entry) => entry.id === actionId);
  if (!action) throw new Error("That pending Initiative action does not exist.");
  return action;
}

function replaceParticipant(
  state: InitiativeEngineState,
  changed: InitiativeParticipantState,
): InitiativeEngineState {
  return {
    ...state,
    participants: state.participants.map((entry) => entry.characterId === changed.characterId ? changed : entry),
  };
}

function replaceAction(state: InitiativeEngineState, changed: PendingInitiativeActionState): InitiativeEngineState {
  return {
    ...state,
    pendingActions: state.pendingActions.map((entry) => entry.id === changed.id ? changed : entry),
  };
}

function settleAllDeferredCost(
  participant: InitiativeParticipantState,
): InitiativeParticipantState {
  if (participant.deferredInitiativeCost === 0) return participant;
  return {
    ...participant,
    currentInitiative: participant.currentInitiative - participant.deferredInitiativeCost,
    deferredInitiativeCost: 0,
  };
}

function capableParticipantIds(state: InitiativeEngineState): number[] {
  const point = state.runtime.timelineInitiative;
  return state.participants
    .filter((participant) => (
      participant.participationStatus === "active"
      || participant.participationStatus === "holding"
    ) && participant.currentInitiative >= point)
    .map(({ characterId }) => characterId);
}

function reconcileCompletedCombatStep(state: InitiativeEngineState): InitiativeEngineState {
  const capable = capableParticipantIds(state);
  if (!capable.length) return state;
  if (!capable.every((characterId) => participantById(state, characterId).lastSatisfiedStep >= state.runtime.stepNumber)) {
    return state;
  }
  return {
    ...state,
    runtime: { ...state.runtime, stepNumber: state.runtime.stepNumber + 1 },
  };
}

export function calculateNormalTotalInitiative(dexterity: number, baseMovement: number): number {
  finite(dexterity, "Dexterity");
  positive(baseMovement, "Base Movement");
  const total = getMovementInitiative(dexterity, baseMovement);
  return positive(total, "Normal Total Initiative");
}

export function initializeInitiativeRuntime(
  encounterId: number,
  entrants: ReadonlyArray<{
    characterId: number;
    normalTotalInitiative: number;
    movementMode: string;
  }>,
  now = new Date(),
): InitiativeEngineState {
  positiveWhole(encounterId, "Encounter");
  if (!entrants.length) throw new Error("Initiative requires at least one Encounter Participant.");
  const seen = new Set<number>();
  const participants = entrants.map((entry): InitiativeParticipantState => {
    positiveWhole(entry.characterId, "Character");
    if (seen.has(entry.characterId)) throw new Error("Initiative Participants must be unique.");
    seen.add(entry.characterId);
    const normal = positive(entry.normalTotalInitiative, "Normal Total Initiative");
    return {
      encounterId,
      characterId: entry.characterId,
      normalTotalInitiative: normal,
      currentInitiative: normal,
      participationStatus: "active",
      deferredInitiativeCost: 0,
      lastSatisfiedStep: 0,
      movementMode: entry.movementMode.trim(),
    };
  });
  return {
    runtime: {
      encounterId,
      status: "active",
      roundNumber: 1,
      stepNumber: 1,
      timelineInitiative: Math.max(...participants.map(({ currentInitiative }) => currentInitiative)),
      startedAt: now,
      closedAt: null,
    },
    participants,
    pendingActions: [],
  };
}

export function enrollLateInitiativeParticipant(
  state: InitiativeEngineState,
  entrant: { characterId: number; normalTotalInitiative: number; movementMode: string },
): InitiativeEngineState {
  requireActiveRuntime(state);
  positiveWhole(entrant.characterId, "Character");
  if (state.participants.some(({ characterId }) => characterId === entrant.characterId)) {
    throw new Error("That Character is already enrolled in Initiative.");
  }
  const normal = positive(entrant.normalTotalInitiative, "Normal Total Initiative");
  return {
    ...state,
    participants: [...state.participants, {
      encounterId: state.runtime.encounterId,
      characterId: entrant.characterId,
      normalTotalInitiative: normal,
      currentInitiative: normal,
      participationStatus: "active",
      deferredInitiativeCost: 0,
      lastSatisfiedStep: 0,
      movementMode: entrant.movementMode.trim(),
    }],
  };
}

export function getNextInitiativeTimelineEvent(state: InitiativeEngineState): InitiativeTimelineEvent {
  requireActiveRuntime(state);
  const timeline = state.runtime.timelineInitiative;
  const completionCandidates = state.pendingActions.flatMap((action) => {
    if (action.status !== "active") return [];
    const actor = participantById(state, action.actorCharacterId);
    const availableThisRound = Math.max(0, actor.currentInitiative);
    if (action.remainingInitiativeCost <= availableThisRound) {
      return [{ id: action.id, initiative: availableThisRound - action.remainingInitiativeCost }];
    }
    return [];
  });
  const opportunityCandidates = state.participants.flatMap((participant) => {
    if (participant.participationStatus !== "active" || participant.currentInitiative <= 0) return [];
    if (activeActionFor(state, participant.characterId)) return [];
    return [{
      characterId: participant.characterId,
      initiative: Math.min(participant.currentInitiative, timeline),
    }];
  });
  const boundaryActionIds = state.pendingActions.flatMap((action) => {
    if (action.status !== "active") return [];
    const actor = participantById(state, action.actorCharacterId);
    return action.remainingInitiativeCost > Math.max(0, actor.currentInitiative)
      && actor.currentInitiative > 0
      ? [action.id]
      : [];
  });
  const nextCompletion = completionCandidates.length
    ? Math.max(...completionCandidates.map(({ initiative }) => initiative))
    : Number.NEGATIVE_INFINITY;
  const nextOpportunity = opportunityCandidates.length
    ? Math.max(...opportunityCandidates.map(({ initiative }) => initiative))
    : Number.NEGATIVE_INFINITY;
  const nextBoundary = boundaryActionIds.length ? 0 : Number.NEGATIVE_INFINITY;
  const next = Math.max(nextCompletion, nextOpportunity, nextBoundary);
  if (!Number.isFinite(next)) {
    return { kind: "none", initiative: timeline, actionIds: [], characterIds: [] };
  }
  if (nextCompletion === next) {
    return {
      kind: "pending-completion",
      initiative: next,
      actionIds: completionCandidates.filter(({ initiative }) => initiative === next).map(({ id }) => id).sort((a, b) => a - b),
    };
  }
  if (nextOpportunity === next) {
    return {
      kind: "normal-opportunity",
      initiative: next,
      characterIds: opportunityCandidates.filter(({ initiative }) => initiative === next).map(({ characterId }) => characterId).sort((a, b) => a - b),
    };
  }
  return { kind: "pending-round-boundary", initiative: 0, actionIds: [...boundaryActionIds].sort((a, b) => a - b) };
}

export function canParticipantReactToAction(
  action: Pick<PendingInitiativeActionState, "startTimelineInitiative" | "expectedCompletionInitiative">,
  participantCurrentInitiative: number,
): boolean {
  finite(participantCurrentInitiative, "Participant Current Initiative");
  return participantCurrentInitiative <= action.startTimelineInitiative
    && participantCurrentInitiative >= action.expectedCompletionInitiative;
}

export function canHoldingParticipantIntervene(
  runtime: InitiativeRuntimeState,
  participant: InitiativeParticipantState,
): boolean {
  return runtime.status === "active"
    && participant.participationStatus === "holding"
    && participant.currentInitiative >= runtime.timelineInitiative;
}

export function startInitiativeAction(
  state: InitiativeEngineState,
  input: StartInitiativeActionInput,
): InitiativeEngineState {
  requireActiveRuntime(state);
  positiveWhole(input.id, "Pending Action");
  const initiativeCost = positive(input.initiativeCost, "Initiative Cost");
  const label = input.label.trim();
  if (!label) throw new Error("Pending Action label is required.");
  if (state.pendingActions.some(({ id }) => id === input.id)) throw new Error("Pending Action identity already exists.");
  const participant = participantById(state, input.actorCharacterId);
  if (activeActionFor(state, input.actorCharacterId)) {
    throw new Error("This Participant is already committed to an active pending action.");
  }
  const heldIntervention = input.heldIntervention === true;
  if (heldIntervention) {
    if (!canHoldingParticipantIntervene(state.runtime, participant)) {
      throw new Error("Only an eligible Holding Participant may intervene.");
    }
  } else {
    if (participant.participationStatus !== "active") {
      throw new Error("Only an active Participant may begin a normal action.");
    }
    const event = getNextInitiativeTimelineEvent(state);
    if (event.kind === "pending-completion") {
      throw new Error("A pending action completion must resolve before a new action begins at this Initiative.");
    }
    if (event.kind !== "normal-opportunity" || !event.characterIds.includes(input.actorCharacterId)) {
      throw new Error("That Participant does not have the next normal Initiative opportunity.");
    }
  }
  if (!input.allowsMultiRound && initiativeCost > participant.currentInitiative) {
    throw new Error("An ordinary action cannot cost more than the Participant's Current Initiative.");
  }
  const activeParticipant = {
    ...participant,
    participationStatus: "active" as const,
    lastSatisfiedStep: state.runtime.stepNumber,
  };
  const action: PendingInitiativeActionState = {
    id: input.id,
    encounterId: state.runtime.encounterId,
    actorCharacterId: input.actorCharacterId,
    label,
    actionKind: input.actionKind?.trim() || "generic",
    allowsMultiRound: input.allowsMultiRound,
    originalInitiativeCost: initiativeCost,
    initiativeSpent: 0,
    remainingInitiativeCost: initiativeCost,
    startInitiative: participant.currentInitiative,
    startTimelineInitiative: state.runtime.timelineInitiative,
    expectedCompletionInitiative: participant.currentInitiative - initiativeCost,
    status: "active",
    startedRound: state.runtime.roundNumber,
    completedRound: null,
  };
  return {
    ...replaceParticipant(state, activeParticipant),
    pendingActions: [...state.pendingActions, action],
  };
}

export function advanceInitiativeTimeline(
  state: InitiativeEngineState,
  targetInitiative: number,
): InitiativeEngineState {
  requireActiveRuntime(state);
  finite(targetInitiative, "Timeline Initiative");
  if (targetInitiative < 0) throw new Error("The shared Round timeline cannot advance below zero.");
  if (targetInitiative > state.runtime.timelineInitiative) throw new Error("The Initiative timeline cannot rewind.");
  const participants = state.participants.map((entry) => ({ ...entry }));
  const pendingActions = state.pendingActions.map((entry) => ({ ...entry }));

  for (let index = 0; index < pendingActions.length; index += 1) {
    const action = pendingActions[index]!;
    if (action.status !== "active") continue;
    const participantIndex = participants.findIndex(({ characterId }) => characterId === action.actorCharacterId);
    if (participantIndex < 0) throw new Error("Pending Action actor is not enrolled in Initiative.");
    let actor = participants[participantIndex]!;
    const from = Math.max(0, actor.currentInitiative);
    const to = Math.max(0, Math.min(from, targetInitiative));
    const elapsed = Math.min(action.remainingInitiativeCost, from - to);
    if (elapsed > 0) {
      actor = {
        ...actor,
        currentInitiative: actor.currentInitiative - elapsed,
        lastSatisfiedStep: state.runtime.stepNumber,
      };
      action.initiativeSpent += elapsed;
      action.remainingInitiativeCost -= elapsed;
    }
    if (action.remainingInitiativeCost === 0) {
      actor = settleAllDeferredCost(actor);
      action.status = "completed";
      action.completedRound = state.runtime.roundNumber;
    }
    participants[participantIndex] = actor;
    pendingActions[index] = action;
  }

  return reconcileCompletedCombatStep({
    runtime: { ...state.runtime, timelineInitiative: targetInitiative },
    participants,
    pendingActions,
  });
}

export function advanceInitiativeToNextEvent(state: InitiativeEngineState): InitiativeEngineState {
  const event = getNextInitiativeTimelineEvent(state);
  if (event.kind === "none") throw new Error("There is no further Initiative event in this Round.");
  if (event.kind === "normal-opportunity" && event.initiative === state.runtime.timelineInitiative) {
    throw new Error("The current Initiative opportunity must act, Hold, Pass, or be resolved by the G.O.D. before time advances.");
  }
  if (event.kind === "pending-completion" && event.initiative > state.runtime.timelineInitiative) {
    let resolved = state;
    for (const actionId of event.actionIds) {
      const action = actionById(resolved, actionId);
      const actor = participantById(resolved, action.actorCharacterId);
      if (action.status !== "active" || action.remainingInitiativeCost > Math.max(0, actor.currentInitiative)) {
        throw new Error("The retained Initiative completion is no longer resolvable.");
      }
      const spent = action.remainingInitiativeCost;
      resolved = replaceParticipant(resolved, settleAllDeferredCost({
        ...actor,
        currentInitiative: actor.currentInitiative - spent,
        lastSatisfiedStep: resolved.runtime.stepNumber,
      }));
      resolved = replaceAction(resolved, {
        ...action,
        initiativeSpent: action.initiativeSpent + spent,
        remainingInitiativeCost: 0,
        status: "completed",
        completedRound: resolved.runtime.roundNumber,
      });
    }
    return reconcileCompletedCombatStep(resolved);
  }
  return advanceInitiativeTimeline(state, event.initiative);
}

export function holdInitiative(state: InitiativeEngineState, characterId: number): InitiativeEngineState {
  requireActiveRuntime(state);
  const participant = participantById(state, characterId);
  if (participant.participationStatus !== "active") throw new Error("Only an active Participant may Hold.");
  if (activeActionFor(state, characterId)) throw new Error("A Participant with an active pending action cannot Hold.");
  const event = getNextInitiativeTimelineEvent(state);
  if (event.kind === "pending-completion") throw new Error("A pending completion must resolve before Hold is declared.");
  if (event.kind !== "normal-opportunity" || !event.characterIds.includes(characterId)) {
    throw new Error("That Participant does not have the current normal Initiative opportunity.");
  }
  return replaceParticipant(state, {
    ...participant,
    participationStatus: "holding",
    lastSatisfiedStep: state.runtime.stepNumber,
  });
}

export function passInitiative(state: InitiativeEngineState, characterId: number): InitiativeEngineState {
  requireActiveRuntime(state);
  const participant = participantById(state, characterId);
  if (participant.participationStatus !== "active" && participant.participationStatus !== "holding") {
    throw new Error("Only an active or Holding Participant may Pass.");
  }
  if (activeActionFor(state, characterId)) throw new Error("A Participant with an active pending action cannot Pass.");
  return replaceParticipant(state, {
    ...participant,
    participationStatus: "passed",
    lastSatisfiedStep: state.runtime.stepNumber,
  });
}

export function setInitiativeParticipationStatus(
  state: InitiativeEngineState,
  characterId: number,
  status: InitiativeParticipationStatus,
): InitiativeEngineState {
  requireActiveRuntime(state);
  if (!INITIATIVE_PARTICIPATION_STATUSES.includes(status)) throw new Error("Initiative participation status is invalid.");
  const participant = participantById(state, characterId);
  if (status !== "active" && activeActionFor(state, characterId)) {
    throw new Error("Resolve the Participant's active pending action before changing this status.");
  }
  return replaceParticipant(state, {
    ...participant,
    participationStatus: status,
    lastSatisfiedStep: status === "holding" || status === "passed"
      ? state.runtime.stepNumber
      : participant.lastSatisfiedStep,
  });
}

export function setCurrentInitiative(
  state: InitiativeEngineState,
  characterId: number,
  currentInitiative: number,
): InitiativeEngineState {
  requireActiveRuntime(state);
  finite(currentInitiative, "Current Initiative");
  return replaceParticipant(state, { ...participantById(state, characterId), currentInitiative });
}

export function applyDirectInitiativeDelta(
  state: InitiativeEngineState,
  characterId: number,
  delta: number,
): InitiativeEngineState {
  requireActiveRuntime(state);
  finite(delta, "Initiative delta");
  const participant = participantById(state, characterId);
  return replaceParticipant(state, { ...participant, currentInitiative: participant.currentInitiative + delta });
}

export function changeNormalTotalInitiative(
  state: InitiativeEngineState,
  characterId: number,
  newNormalTotalInitiative: number,
  mode: CapacityChangeMode,
  movementMode?: string,
): InitiativeEngineState {
  requireActiveRuntime(state);
  const newTotal = positive(newNormalTotalInitiative, "Normal Total Initiative");
  if (mode !== "ordinary" && mode !== "penalty-recovery") throw new Error("Capacity change mode is invalid.");
  const participant = participantById(state, characterId);
  const difference = newTotal - participant.normalTotalInitiative;
  const deferRecovery = mode === "penalty-recovery" && difference > 0 && participant.currentInitiative < 0;
  return replaceParticipant(state, {
    ...participant,
    normalTotalInitiative: newTotal,
    currentInitiative: deferRecovery ? participant.currentInitiative : participant.currentInitiative + difference,
    movementMode: movementMode?.trim() || participant.movementMode,
  });
}

export function addDeferredInitiativeCost(
  state: InitiativeEngineState,
  characterId: number,
  amount: number,
): InitiativeEngineState {
  requireActiveRuntime(state);
  positive(amount, "Deferred Initiative Cost");
  const participant = participantById(state, characterId);
  return replaceParticipant(state, {
    ...participant,
    deferredInitiativeCost: participant.deferredInitiativeCost + amount,
  });
}

export function settleDeferredInitiativeCost(
  state: InitiativeEngineState,
  characterId: number,
  amount?: number,
): InitiativeEngineState {
  requireActiveRuntime(state);
  const participant = participantById(state, characterId);
  const settlement = amount === undefined
    ? participant.deferredInitiativeCost
    : positive(amount, "Deferred Initiative settlement");
  if (settlement > participant.deferredInitiativeCost) {
    throw new Error("Deferred Initiative settlement exceeds the committed cost.");
  }
  return replaceParticipant(state, {
    ...participant,
    currentInitiative: participant.currentInitiative - settlement,
    deferredInitiativeCost: participant.deferredInitiativeCost - settlement,
  });
}

function finalizePendingAction(
  state: InitiativeEngineState,
  actionId: number,
  status: Extract<PendingInitiativeActionStatus, "interrupted" | "completed" | "abandoned" | "ended">,
): InitiativeEngineState {
  requireActiveRuntime(state);
  const action = actionById(state, actionId);
  if (status === "interrupted" && action.status !== "active") throw new Error("Only an active action may be interrupted.");
  if ((status === "abandoned" || status === "ended") && action.status !== "active" && action.status !== "interrupted") {
    throw new Error("Only an active or interrupted action may be ended.");
  }
  if (status === "completed" && action.status !== "active" && action.status !== "interrupted") {
    throw new Error("Only an active or interrupted action may be completed manually.");
  }
  const participant = settleAllDeferredCost(participantById(state, action.actorCharacterId));
  const changedAction = {
    ...action,
    status,
    remainingInitiativeCost: status === "completed" ? 0 : action.remainingInitiativeCost,
    completedRound: status === "completed" ? state.runtime.roundNumber : action.completedRound,
  };
  return replaceAction(replaceParticipant(state, participant), changedAction);
}

export function interruptPendingInitiativeAction(state: InitiativeEngineState, actionId: number): InitiativeEngineState {
  return finalizePendingAction(state, actionId, "interrupted");
}

export function abandonPendingInitiativeAction(state: InitiativeEngineState, actionId: number): InitiativeEngineState {
  return finalizePendingAction(state, actionId, "abandoned");
}

export function endPendingInitiativeAction(state: InitiativeEngineState, actionId: number): InitiativeEngineState {
  return finalizePendingAction(state, actionId, "ended");
}

export function completePendingInitiativeActionManually(state: InitiativeEngineState, actionId: number): InitiativeEngineState {
  return finalizePendingAction(state, actionId, "completed");
}

function resumeAction(
  state: InitiativeEngineState,
  actionId: number,
  remainingInitiativeCost: number,
  restart: boolean,
): InitiativeEngineState {
  requireActiveRuntime(state);
  const action = actionById(state, actionId);
  if (action.status !== "interrupted") throw new Error("Only an interrupted action may be resumed or restarted.");
  if (activeActionFor(state, action.actorCharacterId)) throw new Error("The Participant already has an active pending action.");
  const remaining = positive(remainingInitiativeCost, "Remaining Initiative Cost");
  const participant = participantById(state, action.actorCharacterId);
  if (participant.participationStatus !== "active" && participant.participationStatus !== "holding") {
    throw new Error("The Participant must be active or Holding before the action can resume.");
  }
  return replaceAction(replaceParticipant(state, {
    ...participant,
    participationStatus: "active",
    lastSatisfiedStep: state.runtime.stepNumber,
  }), {
    ...action,
    status: "active",
    initiativeSpent: restart ? 0 : action.initiativeSpent,
    remainingInitiativeCost: remaining,
    startInitiative: participant.currentInitiative,
    startTimelineInitiative: state.runtime.timelineInitiative,
    expectedCompletionInitiative: participant.currentInitiative - remaining,
    startedRound: state.runtime.roundNumber,
    completedRound: null,
  });
}

export function resumePendingInitiativeAction(state: InitiativeEngineState, actionId: number): InitiativeEngineState {
  const action = actionById(state, actionId);
  return resumeAction(state, actionId, action.remainingInitiativeCost, false);
}

export function restartPendingInitiativeAction(state: InitiativeEngineState, actionId: number): InitiativeEngineState {
  const action = actionById(state, actionId);
  return resumeAction(state, actionId, action.originalInitiativeCost, true);
}

export function adjustPendingInitiativeActionRemainingCost(
  state: InitiativeEngineState,
  actionId: number,
  remainingInitiativeCost: number,
): InitiativeEngineState {
  requireActiveRuntime(state);
  const action = actionById(state, actionId);
  if (action.status !== "active" && action.status !== "interrupted") {
    throw new Error("Only an active or interrupted action may have its remaining Initiative Cost adjusted.");
  }
  const remaining = positive(remainingInitiativeCost, "Remaining Initiative Cost");
  const actor = participantById(state, action.actorCharacterId);
  return replaceAction(state, {
    ...action,
    remainingInitiativeCost: remaining,
    expectedCompletionInitiative: action.status === "active"
      ? actor.currentInitiative - remaining
      : action.expectedCompletionInitiative,
  });
}

export function resumePendingInitiativeActionWithAdjustedCost(
  state: InitiativeEngineState,
  actionId: number,
  remainingInitiativeCost: number,
): InitiativeEngineState {
  return resumeAction(state, actionId, remainingInitiativeCost, false);
}

export function canAdvanceInitiativeRound(state: InitiativeEngineState): boolean {
  requireActiveRuntime(state);
  return state.participants.every((participant) => {
    if (participant.participationStatus === "passed" || participant.participationStatus === "suspended") return true;
    if (participant.currentInitiative > 0) return false;
    return !activeActionFor(state, participant.characterId) || participant.currentInitiative <= 0;
  });
}

export function advanceInitiativeRound(
  state: InitiativeEngineState,
  force = false,
): InitiativeEngineState {
  requireActiveRuntime(state);
  if (!force && !canAdvanceInitiativeRound(state)) {
    throw new Error("Initiative Round cannot advance mechanically yet. The G.O.D. may explicitly force the boundary.");
  }
  const participants = state.participants.map((participant): InitiativeParticipantState => ({
    ...participant,
    currentInitiative: participant.currentInitiative + participant.normalTotalInitiative,
    participationStatus: participant.participationStatus === "suspended" ? "suspended" : "active",
  }));
  const eligible = participants.filter(({ participationStatus }) => participationStatus === "active");
  const timelineInitiative = Math.max(0, ...eligible.map(({ currentInitiative }) => currentInitiative));
  const runtime = {
    ...state.runtime,
    roundNumber: state.runtime.roundNumber + 1,
    stepNumber: state.runtime.stepNumber + 1,
    timelineInitiative,
  };
  const pendingActions = state.pendingActions.map((action) => {
    if (action.status !== "active") return action;
    const actor = participants.find(({ characterId }) => characterId === action.actorCharacterId)!;
    return {
      ...action,
      expectedCompletionInitiative: actor.currentInitiative - action.remainingInitiativeCost,
    };
  });
  return { runtime, participants, pendingActions };
}

export function correctInitiativeRuntimePosition(
  state: InitiativeEngineState,
  input: { roundNumber: number; stepNumber: number; timelineInitiative: number },
): InitiativeEngineState {
  requireActiveRuntime(state);
  positiveWhole(input.roundNumber, "Round Number");
  positiveWhole(input.stepNumber, "Combat Step Number");
  nonNegative(input.timelineInitiative, "Timeline Initiative");
  return { ...state, runtime: { ...state.runtime, ...input } };
}

export function closeInitiativeRuntime(state: InitiativeEngineState, now = new Date()): InitiativeEngineState {
  requireActiveRuntime(state);
  if (state.pendingActions.some(({ status }) => status === "active")) {
    throw new Error("Resolve all active pending actions before closing Initiative.");
  }
  return { ...state, runtime: { ...state.runtime, status: "closed", closedAt: now } };
}

export function getMaximumMovementDistance(baseMovement: number, initiativeSpent: number): number {
  positive(baseMovement, "Base Movement");
  nonNegative(initiativeSpent, "Initiative spent on movement");
  return baseMovement * initiativeSpent;
}

export function getDodgeInitiativeCost(): 1 {
  return 1;
}

export function resolveBlockParryInitiativeCosts(
  attackerInitiativeCost: number,
  defenderWeaponInitiativeCost: number,
  defenseSucceeded: boolean,
): { attackerCost: number; defenderCost: number } {
  positive(attackerInitiativeCost, "Attacker Initiative Cost");
  positive(defenderWeaponInitiativeCost, "Defender Weapon Initiative Cost");
  return defenseSucceeded
    ? { attackerCost: attackerInitiativeCost + defenderWeaponInitiativeCost, defenderCost: 1 }
    : { attackerCost: attackerInitiativeCost, defenderCost: defenderWeaponInitiativeCost };
}

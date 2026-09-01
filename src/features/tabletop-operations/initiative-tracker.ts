import type { SessionRosterEntityKind } from "./session-roster";
import {
  canAdvanceInitiativeRound,
  canHoldingParticipantIntervene,
  canParticipantReactToAction,
  getNextInitiativeTimelineEvent,
  type InitiativeEngineState,
  type InitiativeParticipantState,
  type InitiativeRuntimeState,
  type PendingInitiativeActionState,
} from "./initiative-runtime";

export type InitiativeTrackerRuntimeInput = {
  runtime: Omit<InitiativeRuntimeState, "startedAt" | "closedAt"> & {
    startedAt: string;
    closedAt: string | null;
  };
  participants: InitiativeParticipantState[];
  pendingActions: PendingInitiativeActionState[];
};

export type InitiativeTrackerIdentityInput = {
  characterId: number;
  name: string;
  kind: SessionRosterEntityKind;
  kindLabel: string;
  playerName: string | null;
  creatureTemplateName: string | null;
};

export type InitiativeTrackerCapacityInput = {
  characterId: number;
  movementModes: Array<{
    movementMode: string;
    baseMovement: number;
    normalTotalInitiative: number;
  }>;
  error: string | null;
};

export type InitiativeTrackerNextEvent = {
  kind: "normal-opportunity" | "pending-completion" | "round-boundary" | "none";
  initiative: number;
  eyebrow: string;
  summary: string;
  detail: string;
  characterIds: number[];
  actionIds: number[];
  canAdvance: boolean;
};

export type InitiativeTrackerParticipant = InitiativeParticipantState & InitiativeTrackerIdentityInput & {
  movementModes: InitiativeTrackerCapacityInput["movementModes"];
  capacityError: string | null;
  activeActionId: number | null;
  isCurrentOpportunity: boolean;
  canAct: boolean;
  canHold: boolean;
  canPass: boolean;
  canIntervene: boolean;
  isAboveTimeline: boolean;
};

export type InitiativeTrackerPendingAction = PendingInitiativeActionState & {
  actorName: string;
  reactionCharacterIds: number[];
  reactionNames: string[];
};

export type InitiativeTrackerReadModel = {
  encounter: {
    id: number;
    title: string;
    status: "planned" | "active" | "completed";
  };
  hierarchy: {
    sessionStatus: "planned" | "active" | "completed";
    sceneStatus: "planned" | "active" | "completed";
  };
  canInitialize: boolean;
  initializationBlockReason: string | null;
  runtime: InitiativeTrackerRuntimeInput | null;
  nextEvent: InitiativeTrackerNextEvent | null;
  participants: InitiativeTrackerParticipant[];
  availableToJoin: Array<InitiativeTrackerIdentityInput & {
    movementModes: InitiativeTrackerCapacityInput["movementModes"];
    capacityError: string | null;
  }>;
  pendingActions: InitiativeTrackerPendingAction[];
  canAdvanceRound: boolean;
};

function toEngineState(input: InitiativeTrackerRuntimeInput): InitiativeEngineState {
  return {
    runtime: {
      ...input.runtime,
      startedAt: new Date(input.runtime.startedAt),
      closedAt: input.runtime.closedAt ? new Date(input.runtime.closedAt) : null,
    },
    participants: input.participants,
    pendingActions: input.pendingActions,
  };
}

function joinNames(names: string[]): string {
  if (!names.length) return "No Participants";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function getInitializationBlockReason(input: {
  runtime: InitiativeTrackerRuntimeInput | null;
  encounterStatus: "planned" | "active" | "completed";
  sceneStatus: "planned" | "active" | "completed";
  sessionStatus: "planned" | "active" | "completed";
  participantCount: number;
}): string | null {
  if (input.runtime) return "Initiative has already been initialized for this Encounter.";
  if (input.sessionStatus !== "active" || input.sceneStatus !== "active" || input.encounterStatus !== "active") {
    return "Initiative requires an active Session, Scene, and Encounter.";
  }
  if (input.participantCount === 0) return "Add at least one Encounter Participant before initializing Initiative.";
  return null;
}

function presentNextEvent(
  engine: InitiativeEngineState,
  identities: Map<number, InitiativeTrackerIdentityInput>,
): InitiativeTrackerNextEvent {
  const event = getNextInitiativeTimelineEvent(engine);
  if (event.kind === "pending-completion") {
    const labels = event.actionIds.map((id) => {
      const action = engine.pendingActions.find((entry) => entry.id === id);
      if (!action) return `Action #${id}`;
      const actor = identities.get(action.actorCharacterId)?.name ?? `Character #${action.actorCharacterId}`;
      return `${actor} — ${action.label}`;
    });
    return {
      kind: "pending-completion",
      initiative: event.initiative,
      eyebrow: "PENDING COMPLETION",
      summary: `${joinNames(labels)} ${labels.length === 1 ? "completes" : "complete"} at ${event.initiative}`,
      detail: event.initiative > engine.runtime.timelineInitiative
        ? `This retained action completes above the shared timeline. The timeline remains ${engine.runtime.timelineInitiative}.`
        : "Pending completion takes precedence over a normal opportunity at the same Initiative.",
      characterIds: [],
      actionIds: event.actionIds,
      canAdvance: true,
    };
  }
  if (event.kind === "normal-opportunity") {
    const names = event.characterIds.map((id) => identities.get(id)?.name ?? `Character #${id}`);
    const current = event.initiative === engine.runtime.timelineInitiative;
    return {
      kind: "normal-opportunity",
      initiative: event.initiative,
      eyebrow: "NORMAL OPPORTUNITY",
      summary: `${joinNames(names)} at ${event.initiative}`,
      detail: current
        ? "Resolve this opportunity with Action, Hold, or Pass before advancing the shared timeline."
        : `The shared timeline may advance from ${engine.runtime.timelineInitiative} to ${event.initiative}.`,
      characterIds: event.characterIds,
      actionIds: [],
      canAdvance: !current,
    };
  }
  if (event.kind === "pending-round-boundary") {
    return {
      kind: "round-boundary",
      initiative: 0,
      eyebrow: "ROUND BOUNDARY",
      summary: "Long actions have reached 0",
      detail: "Advance the timeline to the Round boundary, then resolve Round advancement deliberately.",
      characterIds: [],
      actionIds: event.actionIds,
      canAdvance: true,
    };
  }
  return {
    kind: "none",
    initiative: event.initiative,
    eyebrow: "NO FURTHER AUTOMATIC EVENT",
    summary: "G.O.D. decision required",
    detail: "Resolve participation or advance the Round when the engine permits it.",
    characterIds: [],
    actionIds: [],
    canAdvance: false,
  };
}

export function buildInitiativeTrackerReadModel(input: {
  encounter: {
    id: number;
    title: string;
    status: "planned" | "active" | "completed";
  };
  sessionStatus: "planned" | "active" | "completed";
  sceneStatus: "planned" | "active" | "completed";
  identities: InitiativeTrackerIdentityInput[];
  capacities: InitiativeTrackerCapacityInput[];
  runtime: InitiativeTrackerRuntimeInput | null;
}): InitiativeTrackerReadModel {
  const identities = new Map(input.identities.map((entry) => [entry.characterId, entry]));
  const capacities = new Map(input.capacities.map((entry) => [entry.characterId, entry]));
  const enrolledIds = new Set(input.runtime?.participants.map(({ characterId }) => characterId) ?? []);
  const initializationBlockReason = getInitializationBlockReason({
    runtime: input.runtime,
    encounterStatus: input.encounter.status,
    sceneStatus: input.sceneStatus,
    sessionStatus: input.sessionStatus,
    participantCount: input.identities.length,
  });

  if (!input.runtime) {
    return {
      encounter: input.encounter,
      hierarchy: { sessionStatus: input.sessionStatus, sceneStatus: input.sceneStatus },
      canInitialize: initializationBlockReason === null,
      initializationBlockReason,
      runtime: null,
      nextEvent: null,
      participants: [],
      availableToJoin: input.identities.map((identity) => ({
        ...identity,
        movementModes: capacities.get(identity.characterId)?.movementModes ?? [],
        capacityError: capacities.get(identity.characterId)?.error ?? null,
      })),
      pendingActions: [],
      canAdvanceRound: false,
    };
  }

  const engine = toEngineState(input.runtime);
  const live = engine.runtime.status === "active";
  const nextEvent = live ? presentNextEvent(engine, identities) : null;
  const activeActions = new Map(
    engine.pendingActions
      .filter(({ status }) => status === "active")
      .map((action) => [action.actorCharacterId, action]),
  );
  const participants = engine.participants.map((participant): InitiativeTrackerParticipant => {
    const identity = identities.get(participant.characterId) ?? {
      characterId: participant.characterId,
      name: `Character #${participant.characterId}`,
      kind: "race-npc" as const,
      kindLabel: "Campaign Character",
      playerName: null,
      creatureTemplateName: null,
    };
    const capacity = capacities.get(participant.characterId);
    const activeAction = activeActions.get(participant.characterId) ?? null;
    const isCurrentOpportunity = nextEvent?.kind === "normal-opportunity"
      && nextEvent.characterIds.includes(participant.characterId);
    const canIntervene = live
      && !activeAction
      && canHoldingParticipantIntervene(engine.runtime, participant);
    return {
      ...participant,
      ...identity,
      movementModes: capacity?.movementModes ?? [],
      capacityError: capacity?.error ?? null,
      activeActionId: activeAction?.id ?? null,
      isCurrentOpportunity,
      canAct: live && isCurrentOpportunity && !activeAction,
      canHold: live && isCurrentOpportunity && !activeAction,
      canPass: live && !activeAction && (isCurrentOpportunity || participant.participationStatus === "holding"),
      canIntervene,
      isAboveTimeline: participant.currentInitiative > engine.runtime.timelineInitiative,
    };
  });
  participants.sort((left, right) => {
    const rank = (entry: InitiativeTrackerParticipant): number => {
      if (entry.isCurrentOpportunity) return 0;
      if (entry.canIntervene) return 1;
      if (entry.participationStatus === "active" && entry.activeActionId === null) return 2;
      if (entry.participationStatus === "active" || entry.participationStatus === "holding") return 3;
      return 4;
    };
    return rank(left) - rank(right)
      || right.currentInitiative - left.currentInitiative
      || left.name.localeCompare(right.name)
      || left.characterId - right.characterId;
  });

  const pendingActions = engine.pendingActions.map((action): InitiativeTrackerPendingAction => {
    const reactionParticipants = action.status === "active"
      ? engine.participants.filter((participant) => (
          participant.characterId !== action.actorCharacterId
          && (participant.participationStatus === "active" || participant.participationStatus === "holding")
          && canParticipantReactToAction(action, participant.currentInitiative)
        ))
      : [];
    return {
      ...action,
      actorName: identities.get(action.actorCharacterId)?.name ?? `Character #${action.actorCharacterId}`,
      reactionCharacterIds: reactionParticipants.map(({ characterId }) => characterId),
      reactionNames: reactionParticipants.map(({ characterId }) => (
        identities.get(characterId)?.name ?? `Character #${characterId}`
      )),
    };
  });

  return {
    encounter: input.encounter,
    hierarchy: { sessionStatus: input.sessionStatus, sceneStatus: input.sceneStatus },
    canInitialize: false,
    initializationBlockReason,
    runtime: input.runtime,
    nextEvent,
    participants,
    availableToJoin: input.identities
      .filter(({ characterId }) => !enrolledIds.has(characterId))
      .map((identity) => ({
        ...identity,
        movementModes: capacities.get(identity.characterId)?.movementModes ?? [],
        capacityError: capacities.get(identity.characterId)?.error ?? null,
      })),
    pendingActions,
    canAdvanceRound: live ? canAdvanceInitiativeRound(engine) : false,
  };
}

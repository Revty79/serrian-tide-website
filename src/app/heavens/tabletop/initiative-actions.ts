"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";
import { resolveInitiativeCapacityInTransaction } from "@/features/tabletop-operations/initiative-capacity-service";
import {
  addDeferredInitiativeCost,
  adjustPendingInitiativeActionRemainingCost,
  advanceInitiativeRound,
  advanceInitiativeToNextEvent,
  applyDirectInitiativeDelta,
  changeNormalTotalInitiative,
  closeInitiativeRuntime,
  completePendingInitiativeActionManually,
  correctInitiativeRuntimePosition,
  endPendingInitiativeAction,
  enrollLateInitiativeParticipant,
  holdInitiative,
  initializeInitiativeRuntime,
  interruptPendingInitiativeAction,
  passInitiative,
  restartPendingInitiativeAction,
  resumePendingInitiativeAction,
  resumePendingInitiativeActionWithAdjustedCost,
  setCurrentInitiative,
  setInitiativeParticipationStatus,
  settleDeferredInitiativeCost,
  startInitiativeAction,
  abandonPendingInitiativeAction,
  type CapacityChangeMode,
  type InitiativeEngineState,
  type InitiativeParticipationStatus,
  type InitiativeRuntimeStatus,
  type PendingInitiativeActionStatus,
} from "@/features/tabletop-operations/initiative-runtime";
import { assertCampaignSessionOwner } from "@/features/tabletop-operations/session-foundation";
import { requireGod } from "@/lib/server-access";

type TabletopTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type OwnedEncounterContext = {
  encounterId: number;
  sceneId: number;
  sessionId: number;
  campaignId: number;
  encounterStatus: "planned" | "active" | "completed";
  sceneStatus: "planned" | "active" | "completed";
  sessionStatus: "planned" | "active" | "completed";
  ownerUserId: string;
};

export type InitiativeRuntimeView = {
  runtime: {
    encounterId: number;
    status: InitiativeRuntimeStatus;
    roundNumber: number;
    stepNumber: number;
    timelineInitiative: number;
    startedAt: string;
    closedAt: string | null;
  };
  participants: Array<{
    encounterId: number;
    characterId: number;
    normalTotalInitiative: number;
    currentInitiative: number;
    participationStatus: InitiativeParticipationStatus;
    deferredInitiativeCost: number;
    lastSatisfiedStep: number;
    movementMode: string;
  }>;
  pendingActions: Array<{
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
  }>;
};

function assertPositiveId(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
}

function refreshInitiative(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
}

function assertActiveHierarchy(context: OwnedEncounterContext): void {
  if (context.sessionStatus !== "active" || context.sceneStatus !== "active" || context.encounterStatus !== "active") {
    throw new Error("Initiative requires an active Session, Scene, and Encounter.");
  }
}

async function lockOwnedEncounter(
  tx: TabletopTransaction,
  encounterId: number,
  actingUserId: string,
): Promise<OwnedEncounterContext> {
  const [context] = await tx
    .select({
      encounterId: campaignSessionEncounter.id,
      sceneId: campaignSessionEncounter.sceneId,
      sessionId: campaignSessionEncounter.sessionId,
      campaignId: campaignSessionEncounter.campaignId,
      encounterStatus: campaignSessionEncounter.status,
      sceneStatus: campaignSessionScene.status,
      sessionStatus: campaignSession.status,
      ownerUserId: campaign.createdByUserId,
    })
    .from(campaignSessionEncounter)
    .innerJoin(campaignSessionScene, and(
      eq(campaignSessionScene.id, campaignSessionEncounter.sceneId),
      eq(campaignSessionScene.sessionId, campaignSessionEncounter.sessionId),
      eq(campaignSessionScene.campaignId, campaignSessionEncounter.campaignId),
    ))
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionEncounter.sessionId),
      eq(campaignSession.campaignId, campaignSessionEncounter.campaignId),
    ))
    .innerJoin(campaign, eq(campaign.id, campaignSessionEncounter.campaignId))
    .where(eq(campaignSessionEncounter.id, encounterId))
    .limit(1)
    .for("update");
  if (!context) throw new Error("That Encounter no longer exists.");
  assertCampaignSessionOwner(context.ownerUserId, actingUserId);
  return context;
}

async function loadInitiativeEngine(
  tx: TabletopTransaction,
  encounterId: number,
  lock: boolean,
): Promise<InitiativeEngineState | null> {
  let runtimeQuery = tx
    .select({
      encounterId: campaignSessionEncounterInitiative.encounterId,
      status: campaignSessionEncounterInitiative.status,
      roundNumber: campaignSessionEncounterInitiative.roundNumber,
      stepNumber: campaignSessionEncounterInitiative.stepNumber,
      timelineInitiative: campaignSessionEncounterInitiative.timelineInitiative,
      startedAt: campaignSessionEncounterInitiative.startedAt,
      closedAt: campaignSessionEncounterInitiative.closedAt,
    })
    .from(campaignSessionEncounterInitiative)
    .where(eq(campaignSessionEncounterInitiative.encounterId, encounterId))
    .limit(1);
  if (lock) runtimeQuery = runtimeQuery.for("update") as typeof runtimeQuery;
  const [runtime] = await runtimeQuery;
  if (!runtime) return null;

  let participantQuery = tx
    .select({
      encounterId: campaignSessionEncounterInitiativeParticipant.encounterId,
      characterId: campaignSessionEncounterInitiativeParticipant.characterId,
      normalTotalInitiative: campaignSessionEncounterInitiativeParticipant.normalTotalInitiative,
      currentInitiative: campaignSessionEncounterInitiativeParticipant.currentInitiative,
      participationStatus: campaignSessionEncounterInitiativeParticipant.participationStatus,
      deferredInitiativeCost: campaignSessionEncounterInitiativeParticipant.deferredInitiativeCost,
      lastSatisfiedStep: campaignSessionEncounterInitiativeParticipant.lastSatisfiedStep,
      movementMode: campaignSessionEncounterInitiativeParticipant.movementMode,
    })
    .from(campaignSessionEncounterInitiativeParticipant)
    .where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, encounterId))
    .orderBy(
      asc(campaignSessionEncounterInitiativeParticipant.characterId),
    );
  if (lock) participantQuery = participantQuery.for("update") as typeof participantQuery;
  const participants = await participantQuery;

  let actionQuery = tx
    .select({
      id: campaignSessionEncounterPendingAction.id,
      encounterId: campaignSessionEncounterPendingAction.encounterId,
      actorCharacterId: campaignSessionEncounterPendingAction.actorCharacterId,
      label: campaignSessionEncounterPendingAction.label,
      actionKind: campaignSessionEncounterPendingAction.actionKind,
      allowsMultiRound: campaignSessionEncounterPendingAction.allowsMultiRound,
      originalInitiativeCost: campaignSessionEncounterPendingAction.originalInitiativeCost,
      initiativeSpent: campaignSessionEncounterPendingAction.initiativeSpent,
      remainingInitiativeCost: campaignSessionEncounterPendingAction.remainingInitiativeCost,
      startInitiative: campaignSessionEncounterPendingAction.startInitiative,
      startTimelineInitiative: campaignSessionEncounterPendingAction.startTimelineInitiative,
      expectedCompletionInitiative: campaignSessionEncounterPendingAction.expectedCompletionInitiative,
      status: campaignSessionEncounterPendingAction.status,
      startedRound: campaignSessionEncounterPendingAction.startedRound,
      completedRound: campaignSessionEncounterPendingAction.completedRound,
    })
    .from(campaignSessionEncounterPendingAction)
    .where(eq(campaignSessionEncounterPendingAction.encounterId, encounterId))
    .orderBy(asc(campaignSessionEncounterPendingAction.id));
  if (lock) actionQuery = actionQuery.for("update") as typeof actionQuery;
  const pendingActions = await actionQuery;

  return { runtime, participants, pendingActions };
}

function toView(state: InitiativeEngineState): InitiativeRuntimeView {
  return {
    runtime: {
      ...state.runtime,
      startedAt: state.runtime.startedAt.toISOString(),
      closedAt: state.runtime.closedAt?.toISOString() ?? null,
    },
    participants: state.participants,
    pendingActions: state.pendingActions,
  };
}

async function persistEngine(
  tx: TabletopTransaction,
  context: OwnedEncounterContext,
  before: InitiativeEngineState,
  after: InitiativeEngineState,
): Promise<void> {
  const now = new Date();
  await tx
    .update(campaignSessionEncounterInitiative)
    .set({
      status: after.runtime.status,
      roundNumber: after.runtime.roundNumber,
      stepNumber: after.runtime.stepNumber,
      timelineInitiative: after.runtime.timelineInitiative,
      closedAt: after.runtime.closedAt,
      updatedAt: now,
    })
    .where(and(
      eq(campaignSessionEncounterInitiative.encounterId, context.encounterId),
      eq(campaignSessionEncounterInitiative.status, before.runtime.status),
    ));

  const beforeParticipantIds = new Set(before.participants.map(({ characterId }) => characterId));
  for (const participant of after.participants) {
    const values = {
      normalTotalInitiative: participant.normalTotalInitiative,
      currentInitiative: participant.currentInitiative,
      participationStatus: participant.participationStatus,
      deferredInitiativeCost: participant.deferredInitiativeCost,
      lastSatisfiedStep: participant.lastSatisfiedStep,
      movementMode: participant.movementMode,
      updatedAt: now,
    };
    if (beforeParticipantIds.has(participant.characterId)) {
      await tx
        .update(campaignSessionEncounterInitiativeParticipant)
        .set(values)
        .where(and(
          eq(campaignSessionEncounterInitiativeParticipant.encounterId, context.encounterId),
          eq(campaignSessionEncounterInitiativeParticipant.characterId, participant.characterId),
        ));
    } else {
      await tx.insert(campaignSessionEncounterInitiativeParticipant).values({
        encounterId: context.encounterId,
        sceneId: context.sceneId,
        sessionId: context.sessionId,
        campaignId: context.campaignId,
        characterId: participant.characterId,
        ...values,
      });
    }
  }

  const beforeActionIds = new Set(before.pendingActions.map(({ id }) => id));
  for (const action of after.pendingActions) {
    const values = {
      label: action.label,
      actionKind: action.actionKind,
      allowsMultiRound: action.allowsMultiRound,
      originalInitiativeCost: action.originalInitiativeCost,
      initiativeSpent: action.initiativeSpent,
      remainingInitiativeCost: action.remainingInitiativeCost,
      startInitiative: action.startInitiative,
      startTimelineInitiative: action.startTimelineInitiative,
      expectedCompletionInitiative: action.expectedCompletionInitiative,
      status: action.status,
      startedRound: action.startedRound,
      completedRound: action.completedRound,
      updatedAt: now,
    };
    if (beforeActionIds.has(action.id)) {
      await tx
        .update(campaignSessionEncounterPendingAction)
        .set(values)
        .where(and(
          eq(campaignSessionEncounterPendingAction.id, action.id),
          eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId),
        ));
    } else {
      await tx.insert(campaignSessionEncounterPendingAction).values({
        id: action.id,
        encounterId: context.encounterId,
        sceneId: context.sceneId,
        sessionId: context.sessionId,
        campaignId: context.campaignId,
        actorCharacterId: action.actorCharacterId,
        ...values,
      });
    }
  }
}

async function mutateOwnedInitiative(
  encounterId: number,
  mutate: (
    state: InitiativeEngineState,
    context: OwnedEncounterContext,
    tx: TabletopTransaction,
  ) => Promise<InitiativeEngineState> | InitiativeEngineState,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(encounterId, "Encounter");
  const access = await requireGod();
  const next = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounter(tx, encounterId, access.user.id);
    assertActiveHierarchy(context);
    const current = await loadInitiativeEngine(tx, encounterId, true);
    if (!current) throw new Error("Initiative has not been initialized for this Encounter.");
    const changed = await mutate(current, context, tx);
    await persistEngine(tx, context, current, changed);
    return changed;
  });
  refreshInitiative();
  return toView(next);
}

export async function getEncounterInitiativeRuntime(encounterId: number): Promise<InitiativeRuntimeView | null> {
  assertPositiveId(encounterId, "Encounter");
  const access = await requireGod();
  const state = await db.transaction(async (tx) => {
    await lockOwnedEncounter(tx, encounterId, access.user.id);
    return loadInitiativeEngine(tx, encounterId, false);
  });
  return state ? toView(state) : null;
}

export async function initializeEncounterInitiative(
  encounterId: number,
  movementModes: ReadonlyArray<{ characterId: number; movementMode: string }> = [],
): Promise<InitiativeRuntimeView> {
  assertPositiveId(encounterId, "Encounter");
  const access = await requireGod();
  const requestedModes = new Map(movementModes.map((entry) => [entry.characterId, entry.movementMode]));
  const initialized = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounter(tx, encounterId, access.user.id);
    assertActiveHierarchy(context);
    if (await loadInitiativeEngine(tx, encounterId, true)) {
      throw new Error("Initiative has already been initialized for this Encounter.");
    }
    const encounterParticipants = await tx
      .select({ characterId: campaignSessionEncounterParticipant.characterId })
      .from(campaignSessionEncounterParticipant)
      .where(and(
        eq(campaignSessionEncounterParticipant.encounterId, encounterId),
        eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
        eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
        eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      ))
      .orderBy(
        asc(campaignSessionEncounterParticipant.sortOrder),
        asc(campaignSessionEncounterParticipant.characterId),
      )
      .for("update");
    const capacities = [];
    for (const participant of encounterParticipants) {
      capacities.push(await resolveInitiativeCapacityInTransaction(
        tx,
        participant.characterId,
        context.campaignId,
        requestedModes.get(participant.characterId),
      ));
    }
    const engine = initializeInitiativeRuntime(encounterId, capacities);
    await tx.insert(campaignSessionEncounterInitiative).values({
      encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      status: engine.runtime.status,
      roundNumber: engine.runtime.roundNumber,
      stepNumber: engine.runtime.stepNumber,
      timelineInitiative: engine.runtime.timelineInitiative,
      startedAt: engine.runtime.startedAt,
    });
    if (engine.participants.length) {
      await tx.insert(campaignSessionEncounterInitiativeParticipant).values(engine.participants.map((participant) => ({
        encounterId,
        sceneId: context.sceneId,
        sessionId: context.sessionId,
        campaignId: context.campaignId,
        characterId: participant.characterId,
        normalTotalInitiative: participant.normalTotalInitiative,
        currentInitiative: participant.currentInitiative,
        participationStatus: participant.participationStatus,
        deferredInitiativeCost: participant.deferredInitiativeCost,
        lastSatisfiedStep: participant.lastSatisfiedStep,
        movementMode: participant.movementMode,
      })));
    }
    return engine;
  });
  refreshInitiative();
  return toView(initialized);
}

export async function enrollLateEncounterInitiativeParticipant(
  encounterId: number,
  characterId: number,
  movementMode?: string,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, async (state, context, tx) => {
    const [encounterParticipant] = await tx
      .select({ characterId: campaignSessionEncounterParticipant.characterId })
      .from(campaignSessionEncounterParticipant)
      .where(and(
        eq(campaignSessionEncounterParticipant.encounterId, encounterId),
        eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
        eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
        eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
        eq(campaignSessionEncounterParticipant.characterId, characterId),
      ))
      .limit(1)
      .for("update");
    if (!encounterParticipant) throw new Error("Initiative enrollment requires an existing Encounter Participant.");
    const capacity = await resolveInitiativeCapacityInTransaction(tx, characterId, context.campaignId, movementMode);
    return enrollLateInitiativeParticipant(state, capacity);
  });
}

async function nextPendingActionId(tx: TabletopTransaction): Promise<number> {
  const result = await tx.execute(sql<{ id: number }>`
    select nextval(pg_get_serial_sequence('campaign_session_encounter_pending_action', 'id'))::integer as id
  `);
  const id = Number((result.rows[0] as { id?: number } | undefined)?.id);
  assertPositiveId(id, "Pending Action");
  return id;
}

export async function beginGenericInitiativeAction(
  encounterId: number,
  input: {
    actorCharacterId: number;
    label: string;
    actionKind?: string;
    initiativeCost: number;
    allowsMultiRound: boolean;
    heldIntervention?: boolean;
  },
): Promise<InitiativeRuntimeView> {
  assertPositiveId(input.actorCharacterId, "Character");
  return mutateOwnedInitiative(encounterId, async (state, _context, tx) => startInitiativeAction(state, {
    id: await nextPendingActionId(tx),
    ...input,
  }));
}

export async function advanceEncounterInitiativeTimeline(encounterId: number): Promise<InitiativeRuntimeView> {
  return mutateOwnedInitiative(encounterId, (state) => advanceInitiativeToNextEvent(state));
}

export async function holdEncounterInitiative(encounterId: number, characterId: number): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, (state) => holdInitiative(state, characterId));
}

export async function passEncounterInitiative(encounterId: number, characterId: number): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, (state) => passInitiative(state, characterId));
}

export async function setEncounterInitiativeParticipationStatus(
  encounterId: number,
  characterId: number,
  status: InitiativeParticipationStatus,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, (state) => setInitiativeParticipationStatus(state, characterId, status));
}

export async function resumeSuspendedEncounterInitiative(
  encounterId: number,
  characterId: number,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, (state) => {
    const participant = state.participants.find((entry) => entry.characterId === characterId);
    if (participant?.participationStatus !== "suspended") throw new Error("Only a suspended Initiative Participant may resume.");
    return setInitiativeParticipationStatus(state, characterId, "active");
  });
}

export async function overrideCurrentEncounterInitiative(
  encounterId: number,
  characterId: number,
  currentInitiative: number,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, (state) => setCurrentInitiative(state, characterId, currentInitiative));
}

export async function applyEncounterInitiativeDelta(
  encounterId: number,
  characterId: number,
  delta: number,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, (state) => applyDirectInitiativeDelta(state, characterId, delta));
}

export async function overrideNormalEncounterInitiative(
  encounterId: number,
  characterId: number,
  normalTotalInitiative: number,
  mode: CapacityChangeMode,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, (state) => changeNormalTotalInitiative(
    state,
    characterId,
    normalTotalInitiative,
    mode,
  ));
}

export async function refreshEncounterInitiativeCapacity(
  encounterId: number,
  characterId: number,
  mode: CapacityChangeMode,
  movementMode?: string,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, async (state, context, tx) => {
    const capacity = await resolveInitiativeCapacityInTransaction(tx, characterId, context.campaignId, movementMode);
    return changeNormalTotalInitiative(
      state,
      characterId,
      capacity.normalTotalInitiative,
      mode,
      capacity.movementMode,
    );
  });
}

export async function addEncounterDeferredInitiativeCost(
  encounterId: number,
  characterId: number,
  amount: number,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, (state) => addDeferredInitiativeCost(state, characterId, amount));
}

export async function settleEncounterDeferredInitiativeCost(
  encounterId: number,
  characterId: number,
  amount?: number,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(characterId, "Character");
  return mutateOwnedInitiative(encounterId, (state) => settleDeferredInitiativeCost(state, characterId, amount));
}

export async function interruptEncounterPendingAction(encounterId: number, actionId: number): Promise<InitiativeRuntimeView> {
  assertPositiveId(actionId, "Pending Action");
  return mutateOwnedInitiative(encounterId, (state) => interruptPendingInitiativeAction(state, actionId));
}

export async function abandonEncounterPendingAction(encounterId: number, actionId: number): Promise<InitiativeRuntimeView> {
  assertPositiveId(actionId, "Pending Action");
  return mutateOwnedInitiative(encounterId, (state) => abandonPendingInitiativeAction(state, actionId));
}

export async function endEncounterPendingAction(encounterId: number, actionId: number): Promise<InitiativeRuntimeView> {
  assertPositiveId(actionId, "Pending Action");
  return mutateOwnedInitiative(encounterId, (state) => endPendingInitiativeAction(state, actionId));
}

export async function resumeEncounterPendingAction(encounterId: number, actionId: number): Promise<InitiativeRuntimeView> {
  assertPositiveId(actionId, "Pending Action");
  return mutateOwnedInitiative(encounterId, (state) => resumePendingInitiativeAction(state, actionId));
}

export async function restartEncounterPendingAction(encounterId: number, actionId: number): Promise<InitiativeRuntimeView> {
  assertPositiveId(actionId, "Pending Action");
  return mutateOwnedInitiative(encounterId, (state) => restartPendingInitiativeAction(state, actionId));
}

export async function adjustEncounterPendingActionRemainingCost(
  encounterId: number,
  actionId: number,
  remainingInitiativeCost: number,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(actionId, "Pending Action");
  return mutateOwnedInitiative(encounterId, (state) => adjustPendingInitiativeActionRemainingCost(
    state,
    actionId,
    remainingInitiativeCost,
  ));
}

export async function resumeEncounterPendingActionWithAdjustedCost(
  encounterId: number,
  actionId: number,
  remainingInitiativeCost: number,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(actionId, "Pending Action");
  return mutateOwnedInitiative(encounterId, (state) => resumePendingInitiativeActionWithAdjustedCost(
    state,
    actionId,
    remainingInitiativeCost,
  ));
}

export async function completeEncounterPendingActionManually(
  encounterId: number,
  actionId: number,
): Promise<InitiativeRuntimeView> {
  assertPositiveId(actionId, "Pending Action");
  return mutateOwnedInitiative(encounterId, (state) => completePendingInitiativeActionManually(state, actionId));
}

export async function advanceEncounterInitiativeRound(
  encounterId: number,
  force = false,
): Promise<InitiativeRuntimeView> {
  return mutateOwnedInitiative(encounterId, (state) => advanceInitiativeRound(state, force));
}

export async function correctEncounterInitiativeRuntime(
  encounterId: number,
  input: { roundNumber: number; stepNumber: number; timelineInitiative: number },
): Promise<InitiativeRuntimeView> {
  return mutateOwnedInitiative(encounterId, (state) => correctInitiativeRuntimePosition(state, input));
}

export async function closeEncounterInitiative(encounterId: number): Promise<InitiativeRuntimeView> {
  return mutateOwnedInitiative(encounterId, (state) => closeInitiativeRuntime(state));
}

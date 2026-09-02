import "server-only";

import { randomInt } from "node:crypto";

import { and, asc, desc, eq, inArray, lt, or, type SQL } from "drizzle-orm";

import type { db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaignCharacter } from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionRoll,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";

import {
  canReadRollVisibility,
  normalizeRollRecordRequest,
  normalizeVoidReason,
  readableRollVisibilities,
  resolveRollOutcome,
  ROLL_METHODS,
  ROLL_PURPOSES,
  ROLL_STATUSES,
  ROLL_VISIBILITIES,
  type RollMethod,
  type RollPurpose,
  type RollRandomSource,
  type RollReadActor,
  type RollRecordRequest,
  type RollStatus,
  type RollVisibility,
} from "./roll-runtime";

export type RollRuntimeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuthorizedRollActor = {
  userId: string;
  campaignId: number;
  readAs: RollReadActor;
  canRecordGodOnly: boolean;
};

export type RollLedgerEntry = {
  id: number;
  campaignId: number;
  sessionId: number;
  sceneId: number | null;
  sceneTitle: string | null;
  encounterId: number | null;
  encounterTitle: string | null;
  rollerCharacterId: number | null;
  rollerCharacterName: string | null;
  targetCharacterId: number | null;
  targetCharacterName: string | null;
  pendingActionId: number | null;
  pendingActionLabel: string | null;
  reactionId: number | null;
  reactionType: string | null;
  recordedByUserId: string;
  recordedByName: string;
  method: RollMethod;
  visibility: RollVisibility;
  purposeKind: RollPurpose;
  label: string;
  resultTotal: number;
  targetNumber: number | null;
  notes: string;
  roundNumber: number | null;
  stepNumber: number | null;
  status: RollStatus;
  voidedAt: string | null;
  voidReason: string;
  voidedByUserId: string | null;
  voidedByName: string | null;
  createdAt: string;
};

export type RollLedgerFilters = {
  sceneId?: number | null;
  encounterId?: number | null;
  characterId?: number | null;
  method?: RollMethod | null;
  visibility?: RollVisibility | null;
  purposeKind?: RollPurpose | null;
  status?: RollStatus | null;
  beforeId?: number | null;
  limit?: number;
};

export type RollLedgerPage = {
  rolls: RollLedgerEntry[];
  nextBeforeId: number | null;
};

export type RollWorkspaceView = {
  session: {
    id: number;
    campaignId: number;
    title: string;
    status: "planned" | "active" | "completed";
  };
  selectedScene: {
    id: number;
    title: string;
    status: "planned" | "active" | "completed";
  } | null;
  selectedEncounter: {
    id: number;
    title: string;
    status: "planned" | "active" | "completed";
  } | null;
  characters: Array<{
    characterId: number;
    name: string;
    inScene: boolean;
    inEncounter: boolean;
  }>;
  pendingActions: Array<{
    id: number;
    actorCharacterId: number;
    label: string;
    status: string;
  }>;
  reactions: Array<{
    id: number;
    reactorCharacterId: number;
    reactionType: string;
    status: string;
  }>;
  initialHistory: RollLedgerPage;
};

function positiveId(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function optionalFilterId(value: number | null | undefined, label: string): number | null {
  return value === undefined || value === null ? null : positiveId(value, label);
}

function enumFilter<T extends string>(values: readonly T[], value: unknown, label: string): T | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

function secureRandomSource(minimumInclusive: number, maximumExclusive: number): number {
  return randomInt(minimumInclusive, maximumExclusive);
}

async function assertContextCharacters(
  tx: RollRuntimeTransaction,
  context: {
    campaignId: number;
    sessionId: number;
    sceneId: number | null;
    encounterId: number | null;
  },
  characterIds: readonly number[],
): Promise<void> {
  const expected = [...new Set(characterIds)];
  if (!expected.length) return;
  const rows = context.encounterId !== null
    ? await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
        .from(campaignSessionEncounterParticipant)
        .where(and(
          eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
          eq(campaignSessionEncounterParticipant.sceneId, context.sceneId!),
          eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
          eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
          inArray(campaignSessionEncounterParticipant.characterId, expected),
        ))
    : context.sceneId !== null
      ? await tx.select({ characterId: campaignSessionSceneMember.characterId })
          .from(campaignSessionSceneMember)
          .where(and(
            eq(campaignSessionSceneMember.sceneId, context.sceneId),
            eq(campaignSessionSceneMember.sessionId, context.sessionId),
            eq(campaignSessionSceneMember.campaignId, context.campaignId),
            inArray(campaignSessionSceneMember.characterId, expected),
          ))
      : await tx.select({ characterId: campaignSessionRoster.characterId })
          .from(campaignSessionRoster)
          .where(and(
            eq(campaignSessionRoster.sessionId, context.sessionId),
            eq(campaignSessionRoster.campaignId, context.campaignId),
            inArray(campaignSessionRoster.characterId, expected),
          ));
  const found = new Set(rows.map(({ characterId }) => characterId));
  if (found.size !== expected.length || expected.some((id) => !found.has(id))) {
    const scope = context.encounterId !== null ? "Encounter Participant" : context.sceneId !== null ? "Scene Member" : "Session Roster member";
    throw new Error(`Every Roll Character must be an exact ${scope}.`);
  }
}

export async function recordRollInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  input: RollRecordRequest,
  randomSource: RollRandomSource = secureRandomSource,
): Promise<RollLedgerEntry> {
  const request = normalizeRollRecordRequest(input);
  if (request.visibility === "god-only" && !actor.canRecordGodOnly) {
    throw new Error("This authorized actor cannot record G.O.D.-only Rolls.");
  }
  const [session] = await tx.select({
    id: campaignSession.id,
    campaignId: campaignSession.campaignId,
    status: campaignSession.status,
  }).from(campaignSession).where(and(
    eq(campaignSession.id, request.sessionId),
    eq(campaignSession.campaignId, actor.campaignId),
  )).limit(1).for("update", { of: campaignSession });
  if (!session) throw new Error("That Roll Session does not belong to the authorized Campaign.");
  if (session.status === "completed") throw new Error("Reopen the completed Session before recording another Roll.");

  let sceneStatus: "planned" | "active" | "completed" | null = null;
  if (request.sceneId !== null) {
    const [scene] = await tx.select({ status: campaignSessionScene.status })
      .from(campaignSessionScene)
      .where(and(
        eq(campaignSessionScene.id, request.sceneId),
        eq(campaignSessionScene.sessionId, session.id),
        eq(campaignSessionScene.campaignId, session.campaignId),
      )).limit(1);
    if (!scene) throw new Error("That Roll Scene does not belong to the selected Session.");
    sceneStatus = scene.status;
    if (scene.status === "completed") throw new Error("Reopen the completed Scene before recording a Scene-scoped Roll.");
  }

  if (request.encounterId !== null) {
    const [encounter] = await tx.select({ status: campaignSessionEncounter.status })
      .from(campaignSessionEncounter)
      .where(and(
        eq(campaignSessionEncounter.id, request.encounterId),
        eq(campaignSessionEncounter.sceneId, request.sceneId!),
        eq(campaignSessionEncounter.sessionId, session.id),
        eq(campaignSessionEncounter.campaignId, session.campaignId),
      )).limit(1);
    if (!encounter) throw new Error("That Roll Encounter does not belong to the selected Scene and Session.");
    if (encounter.status === "completed") throw new Error("Reopen the completed Encounter before recording an Encounter-scoped Roll.");
    if (sceneStatus === "completed") throw new Error("Reopen the completed Scene before recording an Encounter-scoped Roll.");
  }

  const context = {
    campaignId: session.campaignId,
    sessionId: session.id,
    sceneId: request.sceneId,
    encounterId: request.encounterId,
  };
  await assertContextCharacters(tx, context, [request.rollerCharacterId, request.targetCharacterId].filter((id): id is number => id !== null));

  if (request.pendingActionId !== null) {
    const [action] = await tx.select({ actorCharacterId: campaignSessionEncounterPendingAction.actorCharacterId })
      .from(campaignSessionEncounterPendingAction)
      .where(and(
        eq(campaignSessionEncounterPendingAction.id, request.pendingActionId),
        eq(campaignSessionEncounterPendingAction.encounterId, request.encounterId!),
        eq(campaignSessionEncounterPendingAction.sceneId, request.sceneId!),
        eq(campaignSessionEncounterPendingAction.sessionId, session.id),
        eq(campaignSessionEncounterPendingAction.campaignId, session.campaignId),
      )).limit(1);
    if (!action) throw new Error("That pending action does not belong to the exact Roll Encounter.");
    if (request.rollerCharacterId !== null && request.rollerCharacterId !== action.actorCharacterId) {
      throw new Error("A linked action Roll must use that action's actor Character.");
    }
  }

  if (request.reactionId !== null) {
    const [reaction] = await tx.select({ reactorCharacterId: campaignSessionEncounterReaction.reactorCharacterId })
      .from(campaignSessionEncounterReaction)
      .where(and(
        eq(campaignSessionEncounterReaction.id, request.reactionId),
        eq(campaignSessionEncounterReaction.encounterId, request.encounterId!),
        eq(campaignSessionEncounterReaction.sceneId, request.sceneId!),
        eq(campaignSessionEncounterReaction.sessionId, session.id),
        eq(campaignSessionEncounterReaction.campaignId, session.campaignId),
      )).limit(1);
    if (!reaction) throw new Error("That Reaction does not belong to the exact Roll Encounter.");
    if (request.rollerCharacterId === null || request.rollerCharacterId !== reaction.reactorCharacterId) {
      throw new Error("A linked Reaction Roll must use the reacting Character.");
    }
  }

  const initiative = request.encounterId === null ? null : (await tx.select({
    roundNumber: campaignSessionEncounterInitiative.roundNumber,
    stepNumber: campaignSessionEncounterInitiative.stepNumber,
  }).from(campaignSessionEncounterInitiative).where(and(
    eq(campaignSessionEncounterInitiative.encounterId, request.encounterId),
    eq(campaignSessionEncounterInitiative.status, "active"),
  )).limit(1))[0] ?? null;
  const outcome = resolveRollOutcome(request, randomSource);
  const [created] = await tx.insert(campaignSessionRoll).values({
    campaignId: session.campaignId,
    sessionId: session.id,
    sceneId: request.sceneId,
    encounterId: request.encounterId,
    rollerCharacterId: request.rollerCharacterId,
    targetCharacterId: request.targetCharacterId,
    pendingActionId: request.pendingActionId,
    reactionId: request.reactionId,
    recordedByUserId: actor.userId,
    method: request.method,
    visibility: request.visibility,
    purposeKind: request.purposeKind,
    label: request.label,
    resultTotal: outcome.resultTotal,
    targetNumber: request.targetNumber,
    notes: request.notes,
    roundNumber: initiative?.roundNumber ?? null,
    stepNumber: initiative?.stepNumber ?? null,
  }).returning({ id: campaignSessionRoll.id });
  if (!created) throw new Error("The Roll could not be recorded.");
  const page = await readRollLedgerInTransaction(tx, actor, session.id, { beforeId: created.id + 1, limit: 1 });
  const entry = page.rolls.find(({ id }) => id === created.id);
  if (!entry) throw new Error("The persisted Roll could not be reloaded.");
  return entry;
}

export async function voidRollInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  rollId: number,
  reason: string,
): Promise<RollLedgerEntry> {
  if (actor.readAs !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may void Rolls.");
  const normalizedReason = normalizeVoidReason(reason);
  const id = positiveId(rollId, "Roll");
  const [locked] = await tx.select({
    id: campaignSessionRoll.id,
    campaignId: campaignSessionRoll.campaignId,
    sessionId: campaignSessionRoll.sessionId,
    status: campaignSessionRoll.status,
  }).from(campaignSessionRoll).where(eq(campaignSessionRoll.id, id)).limit(1).for("update");
  if (!locked || locked.campaignId !== actor.campaignId) throw new Error("That Roll does not belong to the authorized Campaign.");
  if (locked.status !== "recorded") throw new Error("That Roll is already voided.");
  const [updated] = await tx.update(campaignSessionRoll).set({
    status: "voided",
    voidedAt: new Date(),
    voidReason: normalizedReason,
    voidedByUserId: actor.userId,
  }).where(and(
    eq(campaignSessionRoll.id, locked.id),
    eq(campaignSessionRoll.status, "recorded"),
  )).returning({ id: campaignSessionRoll.id });
  if (!updated) throw new Error("The Roll changed before it could be voided.");
  const page = await readRollLedgerInTransaction(tx, actor, locked.sessionId, { beforeId: id + 1, limit: 1 });
  const entry = page.rolls.find((roll) => roll.id === id);
  if (!entry) throw new Error("The voided Roll could not be reloaded.");
  return entry;
}

export async function readRollLedgerInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  sessionId: number,
  filters: RollLedgerFilters = {},
): Promise<RollLedgerPage> {
  const normalizedSessionId = positiveId(sessionId, "Session");
  const [session] = await tx.select({ id: campaignSession.id })
    .from(campaignSession)
    .where(and(eq(campaignSession.id, normalizedSessionId), eq(campaignSession.campaignId, actor.campaignId)))
    .limit(1);
  if (!session) throw new Error("That Roll Session does not belong to the authorized Campaign.");
  const sceneId = optionalFilterId(filters.sceneId, "Scene filter");
  const encounterId = optionalFilterId(filters.encounterId, "Encounter filter");
  const characterId = optionalFilterId(filters.characterId, "Character filter");
  const beforeId = optionalFilterId(filters.beforeId, "Roll cursor");
  const method = enumFilter(ROLL_METHODS, filters.method, "Roll method filter");
  const requestedVisibility = enumFilter(ROLL_VISIBILITIES, filters.visibility, "Roll visibility filter");
  const purposeKind = enumFilter(ROLL_PURPOSES, filters.purposeKind, "Roll purpose filter");
  const status = enumFilter(ROLL_STATUSES, filters.status, "Roll status filter");
  if (requestedVisibility !== null && !canReadRollVisibility(actor.readAs, requestedVisibility)) {
    throw new Error("That Roll visibility is not readable by this actor.");
  }
  const limit = filters.limit === undefined ? 50 : filters.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Roll history page size must be from 1 through 100.");
  const clauses: SQL[] = [
    eq(campaignSessionRoll.sessionId, normalizedSessionId),
    eq(campaignSessionRoll.campaignId, actor.campaignId),
    inArray(campaignSessionRoll.visibility, readableRollVisibilities(actor.readAs)),
  ];
  if (sceneId !== null) clauses.push(eq(campaignSessionRoll.sceneId, sceneId));
  if (encounterId !== null) clauses.push(eq(campaignSessionRoll.encounterId, encounterId));
  if (characterId !== null) clauses.push(or(
    eq(campaignSessionRoll.rollerCharacterId, characterId),
    eq(campaignSessionRoll.targetCharacterId, characterId),
  )!);
  if (method !== null) clauses.push(eq(campaignSessionRoll.method, method));
  if (requestedVisibility !== null) clauses.push(eq(campaignSessionRoll.visibility, requestedVisibility));
  if (purposeKind !== null) clauses.push(eq(campaignSessionRoll.purposeKind, purposeKind));
  if (status !== null) clauses.push(eq(campaignSessionRoll.status, status));
  if (beforeId !== null) clauses.push(lt(campaignSessionRoll.id, beforeId));
  const rows = await tx.select().from(campaignSessionRoll)
    .where(and(...clauses))
    .orderBy(desc(campaignSessionRoll.id))
    .limit(limit + 1);
  const pageRows = rows.slice(0, limit);
  const nextBeforeId = rows.length > limit ? pageRows[pageRows.length - 1]?.id ?? null : null;

  const characterIds = [...new Set(pageRows.flatMap((row) => [row.rollerCharacterId, row.targetCharacterId]).filter((id): id is number => id !== null))];
  const sceneIds = [...new Set(pageRows.map(({ sceneId: id }) => id).filter((id): id is number => id !== null))];
  const encounterIds = [...new Set(pageRows.map(({ encounterId: id }) => id).filter((id): id is number => id !== null))];
  const actionIds = [...new Set(pageRows.map(({ pendingActionId: id }) => id).filter((id): id is number => id !== null))];
  const reactionIds = [...new Set(pageRows.map(({ reactionId: id }) => id).filter((id): id is number => id !== null))];
  const userIds = [...new Set(pageRows.flatMap((row) => [row.recordedByUserId, row.voidedByUserId]).filter((id): id is string => id !== null))];
  const characterRows = characterIds.length ? await tx.select({ id: campaignCharacter.id, name: campaignCharacter.name })
    .from(campaignCharacter).where(inArray(campaignCharacter.id, characterIds)) : [];
  const sceneRows = sceneIds.length ? await tx.select({ id: campaignSessionScene.id, title: campaignSessionScene.title })
    .from(campaignSessionScene).where(inArray(campaignSessionScene.id, sceneIds)) : [];
  const encounterRows = encounterIds.length ? await tx.select({ id: campaignSessionEncounter.id, title: campaignSessionEncounter.title })
    .from(campaignSessionEncounter).where(inArray(campaignSessionEncounter.id, encounterIds)) : [];
  const actionRows = actionIds.length ? await tx.select({ id: campaignSessionEncounterPendingAction.id, label: campaignSessionEncounterPendingAction.label })
    .from(campaignSessionEncounterPendingAction).where(inArray(campaignSessionEncounterPendingAction.id, actionIds)) : [];
  const reactionRows = reactionIds.length ? await tx.select({ id: campaignSessionEncounterReaction.id, reactionType: campaignSessionEncounterReaction.reactionType })
    .from(campaignSessionEncounterReaction).where(inArray(campaignSessionEncounterReaction.id, reactionIds)) : [];
  const userRows = userIds.length ? await tx.select({ id: user.id, name: user.name, username: user.username })
    .from(user).where(inArray(user.id, userIds)) : [];
  const characterNames = new Map(characterRows.map((row) => [row.id, row.name]));
  const sceneTitles = new Map(sceneRows.map((row) => [row.id, row.title]));
  const encounterTitles = new Map(encounterRows.map((row) => [row.id, row.title]));
  const actionLabels = new Map(actionRows.map((row) => [row.id, row.label]));
  const reactionTypes = new Map(reactionRows.map((row) => [row.id, row.reactionType]));
  const userNames = new Map(userRows.map((row) => [row.id, row.username ?? row.name]));
  return {
    rolls: pageRows.map((row): RollLedgerEntry => ({
      id: row.id,
      campaignId: row.campaignId,
      sessionId: row.sessionId,
      sceneId: row.sceneId,
      sceneTitle: row.sceneId === null ? null : sceneTitles.get(row.sceneId) ?? null,
      encounterId: row.encounterId,
      encounterTitle: row.encounterId === null ? null : encounterTitles.get(row.encounterId) ?? null,
      rollerCharacterId: row.rollerCharacterId,
      rollerCharacterName: row.rollerCharacterId === null ? null : characterNames.get(row.rollerCharacterId) ?? null,
      targetCharacterId: row.targetCharacterId,
      targetCharacterName: row.targetCharacterId === null ? null : characterNames.get(row.targetCharacterId) ?? null,
      pendingActionId: row.pendingActionId,
      pendingActionLabel: row.pendingActionId === null ? null : actionLabels.get(row.pendingActionId) ?? null,
      reactionId: row.reactionId,
      reactionType: row.reactionId === null ? null : reactionTypes.get(row.reactionId) ?? null,
      recordedByUserId: row.recordedByUserId,
      recordedByName: userNames.get(row.recordedByUserId) ?? "Unknown user",
      method: row.method,
      visibility: row.visibility,
      purposeKind: row.purposeKind,
      label: row.label,
      resultTotal: row.resultTotal,
      targetNumber: row.targetNumber,
      notes: row.notes,
      roundNumber: row.roundNumber,
      stepNumber: row.stepNumber,
      status: row.status,
      voidedAt: row.voidedAt?.toISOString() ?? null,
      voidReason: row.voidReason,
      voidedByUserId: row.voidedByUserId,
      voidedByName: row.voidedByUserId === null ? null : userNames.get(row.voidedByUserId) ?? "Unknown user",
      createdAt: row.createdAt.toISOString(),
    })),
    nextBeforeId,
  };
}

export async function readRollWorkspaceInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  sessionId: number,
  selectedSceneId: number | null,
  selectedEncounterId: number | null,
): Promise<RollWorkspaceView> {
  const normalizedSessionId = positiveId(sessionId, "Session");
  const [session] = await tx.select({
    id: campaignSession.id,
    campaignId: campaignSession.campaignId,
    title: campaignSession.title,
    status: campaignSession.status,
  }).from(campaignSession).where(and(
    eq(campaignSession.id, normalizedSessionId),
    eq(campaignSession.campaignId, actor.campaignId),
  )).limit(1);
  if (!session) throw new Error("That Roll Session does not belong to the authorized Campaign.");
  const selectedScene = selectedSceneId === null ? null : (await tx.select({
    id: campaignSessionScene.id,
    title: campaignSessionScene.title,
    status: campaignSessionScene.status,
  }).from(campaignSessionScene).where(and(
    eq(campaignSessionScene.id, positiveId(selectedSceneId, "Scene")),
    eq(campaignSessionScene.sessionId, session.id),
    eq(campaignSessionScene.campaignId, session.campaignId),
  )).limit(1))[0] ?? null;
  if (selectedSceneId !== null && !selectedScene) throw new Error("That Scene does not belong to this Session.");
  const selectedEncounter = selectedEncounterId === null ? null : (await tx.select({
    id: campaignSessionEncounter.id,
    title: campaignSessionEncounter.title,
    status: campaignSessionEncounter.status,
  }).from(campaignSessionEncounter).where(and(
    eq(campaignSessionEncounter.id, positiveId(selectedEncounterId, "Encounter")),
    eq(campaignSessionEncounter.sceneId, selectedScene?.id ?? -1),
    eq(campaignSessionEncounter.sessionId, session.id),
    eq(campaignSessionEncounter.campaignId, session.campaignId),
  )).limit(1))[0] ?? null;
  if (selectedEncounterId !== null && !selectedEncounter) throw new Error("That Encounter does not belong to this Scene and Session.");
  const rosterRows = await tx.select({
    characterId: campaignSessionRoster.characterId,
    name: campaignCharacter.name,
  }).from(campaignSessionRoster)
    .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionRoster.characterId))
    .where(and(
      eq(campaignSessionRoster.sessionId, session.id),
      eq(campaignSessionRoster.campaignId, session.campaignId),
    )).orderBy(asc(campaignSessionRoster.sortOrder), asc(campaignSessionRoster.characterId));
  const sceneMemberRows = selectedScene === null ? [] : await tx.select({ characterId: campaignSessionSceneMember.characterId })
    .from(campaignSessionSceneMember).where(eq(campaignSessionSceneMember.sceneId, selectedScene.id));
  const encounterParticipantRows = selectedEncounter === null ? [] : await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant).where(eq(campaignSessionEncounterParticipant.encounterId, selectedEncounter.id));
  const sceneMembers = new Set(sceneMemberRows.map(({ characterId }) => characterId));
  const encounterParticipants = new Set(encounterParticipantRows.map(({ characterId }) => characterId));
  const pendingActions = selectedEncounter === null ? [] : await tx.select({
    id: campaignSessionEncounterPendingAction.id,
    actorCharacterId: campaignSessionEncounterPendingAction.actorCharacterId,
    label: campaignSessionEncounterPendingAction.label,
    status: campaignSessionEncounterPendingAction.status,
  }).from(campaignSessionEncounterPendingAction)
    .where(eq(campaignSessionEncounterPendingAction.encounterId, selectedEncounter.id))
    .orderBy(desc(campaignSessionEncounterPendingAction.id));
  const reactions = selectedEncounter === null ? [] : await tx.select({
    id: campaignSessionEncounterReaction.id,
    reactorCharacterId: campaignSessionEncounterReaction.reactorCharacterId,
    reactionType: campaignSessionEncounterReaction.reactionType,
    status: campaignSessionEncounterReaction.status,
  }).from(campaignSessionEncounterReaction)
    .where(eq(campaignSessionEncounterReaction.encounterId, selectedEncounter.id))
    .orderBy(desc(campaignSessionEncounterReaction.id));
  return {
    session,
    selectedScene,
    selectedEncounter,
    characters: rosterRows.map((row) => ({
      ...row,
      inScene: sceneMembers.has(row.characterId),
      inEncounter: encounterParticipants.has(row.characterId),
    })),
    pendingActions,
    reactions,
    initialHistory: await readRollLedgerInTransaction(tx, actor, session.id),
  };
}

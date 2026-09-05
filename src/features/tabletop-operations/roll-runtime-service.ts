import "server-only";

import { randomInt } from "node:crypto";

import { and, asc, desc, eq, exists, inArray, lt, notExists, or, type SQL } from "drizzle-orm";

import type { db } from "@/db";
import { user } from "@/db/auth-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterSkillAllocation,
} from "@/db/realm-schema";
import { skill } from "@/db/skill-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionRoll,
  campaignSessionRollAmendment,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  CHARACTER_ATTRIBUTE_KEYS,
  CHARACTER_ATTRIBUTE_LABELS,
  type CharacterAttributeKey,
} from "@/features/characters/models";

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
import {
  buildRollMechanicalSnapshot,
  normalizeRollMechanicalRequest,
  parseRollMechanicalSnapshot,
  type RollAmendmentKind,
  type RollGoverningSourceRequest,
  type RollGoverningSourceSnapshot,
  type RollMechanicalSnapshot,
} from "./roll-mechanical-snapshot";
import type { PercentileTargetModifier } from "./percentile-resolution";
import {
  assertActionRollAllowedInTransaction,
  assertResponseRollAllowedInTransaction,
  recordActionRollStateInTransaction,
} from "./action-declaration-service";
import { parseDefenseInterventionSnapshot } from "./defense-intervention";

export type RollRuntimeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuthorizedRollActor = {
  userId: string;
  campaignId: number;
  readAs: RollReadActor;
  canRecordGodOnly: boolean;
  characterId?: number | null;
};

export type RollLedgerAmendment = {
  id: number;
  previousAmendmentId: number | null;
  kind: RollAmendmentKind;
  reason: string;
  mechanicalSnapshot: RollMechanicalSnapshot | null;
  rulingText: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
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
  mechanicalSnapshot: RollMechanicalSnapshot | null;
  effectiveResultTotal: number;
  effectiveMechanicalSnapshot: RollMechanicalSnapshot | null;
  mechanicsRedacted: boolean;
  amendments: RollLedgerAmendment[];
  rulingText: string;
  targetNumber: number | null;
  notes: string;
  roundNumber: number | null;
  stepNumber: number | null;
  status: RollStatus;
  voidedAt: string | null;
  voidReason: string;
  voidedByUserId: string | null;
  voidedByName: string | null;
  legacyVoid: {
    voidedAt: string;
    reason: string;
    voidedByUserId: string;
    voidedByName: string;
  } | null;
  createdAt: string;
};

export type RollCorrectionRequest = {
  sessionId: number;
  rollId: number;
  reason: string;
  correctedResultTotal?: number | null;
  governingSource: RollGoverningSourceRequest;
  modifiers?: readonly PercentileTargetModifier[];
  rulingText?: string;
};

export type RollRulingRequest = {
  sessionId: number;
  rollId: number;
  reason: string;
  rulingText: string;
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

function boundedRequiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must be nonblank.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function boundedOptionalText(value: unknown, label: string, maximum: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function isAttributeKey(value: string): value is CharacterAttributeKey {
  return CHARACTER_ATTRIBUTE_KEYS.includes(value as CharacterAttributeKey);
}

async function resolveGoverningSourceSnapshot(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  rollerCharacterId: number | null,
  source: RollGoverningSourceRequest,
): Promise<RollGoverningSourceSnapshot> {
  if (source.kind === "manual") {
    if (actor.readAs !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may supply a manual Roll target.");
    return { kind: "manual", label: source.label, originalTarget: source.originalTarget };
  }
  if (rollerCharacterId === null || source.characterId !== rollerCharacterId) {
    throw new Error("A Character-governed Roll must use its authorized rolling Character.");
  }
  if (actor.readAs === "player" && actor.characterId !== source.characterId) {
    throw new Error("A Player cannot use another Character as a Roll governing source.");
  }
  if (source.kind === "attribute") {
    if (!isAttributeKey(source.attributeKey)) throw new Error("Roll governing Attribute is invalid.");
    const [row] = await tx.select({ value: campaignCharacterAttribute.value })
      .from(campaignCharacterAttribute)
      .innerJoin(campaignCharacter, and(
        eq(campaignCharacter.id, campaignCharacterAttribute.characterId),
        eq(campaignCharacter.campaignId, actor.campaignId),
      ))
      .where(and(
        eq(campaignCharacterAttribute.characterId, source.characterId),
        eq(campaignCharacterAttribute.attributeKey, source.attributeKey),
      )).limit(1);
    if (!row) throw new Error("That governing Attribute does not belong to the authorized Campaign Character.");
    return {
      kind: "attribute",
      characterId: source.characterId,
      attributeKey: source.attributeKey,
      attributeDisplayName: CHARACTER_ATTRIBUTE_LABELS[source.attributeKey],
      attributeValue: row.value,
      originalTarget: 100 - row.value,
    };
  }

  const rows = await tx.select({
    allocationId: campaignCharacterSkillAllocation.id,
    characterId: campaignCharacterSkillAllocation.characterId,
    parentAllocationId: campaignCharacterSkillAllocation.parentAllocationId,
    skillId: skill.id,
    skillName: skill.name,
    skillClassification: skill.classification,
    skillTier: skill.tier,
  }).from(campaignCharacterSkillAllocation)
    .innerJoin(skill, eq(skill.id, campaignCharacterSkillAllocation.skillId))
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignCharacterSkillAllocation.characterId),
      eq(campaignCharacter.campaignId, actor.campaignId),
    ))
    .where(eq(campaignCharacterSkillAllocation.characterId, source.characterId));
  const byAllocation = new Map(rows.map((row) => [row.allocationId, row]));
  const selected = byAllocation.get(source.allocationId);
  if (!selected) throw new Error("That Skill allocation does not belong to the authorized Campaign Character.");
  const reversedPath = [] as typeof rows;
  const seen = new Set<number>();
  let cursor: typeof selected | undefined = selected;
  while (cursor) {
    if (seen.has(cursor.allocationId)) throw new Error("The governing Skill allocation path is cyclic.");
    seen.add(cursor.allocationId);
    reversedPath.push(cursor);
    if (cursor.parentAllocationId === null) break;
    cursor = byAllocation.get(cursor.parentAllocationId);
    if (!cursor) throw new Error("The governing Skill allocation path is incomplete.");
  }
  return {
    kind: "skill",
    characterId: source.characterId,
    allocationId: selected.allocationId,
    skillId: selected.skillId,
    skillName: selected.skillName,
    skillClassification: selected.skillClassification,
    skillTier: selected.skillTier,
    skillPath: reversedPath.reverse().map((entry) => ({
      allocationId: entry.allocationId,
      skillId: entry.skillId,
      skillName: entry.skillName,
      skillTier: entry.skillTier,
    })),
    calculatedPercentage: source.calculatedPercentage,
    originalTarget: source.calculatedPercentage,
  };
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

async function recordRollInternal(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  input: RollRecordRequest,
  randomSource: RollRandomSource,
  frozenGoverningSource: RollGoverningSourceSnapshot | null,
): Promise<RollLedgerEntry> {
  const request = normalizeRollRecordRequest(input);
  if (request.visibility === "god-only" && !actor.canRecordGodOnly) {
    throw new Error("This authorized actor cannot record G.O.D.-only Rolls.");
  }
  if (request.visibility === "private" && request.rollerCharacterId === null) {
    throw new Error("A private Roll requires a rolling Character.");
  }
  if (
    actor.readAs === "player"
    && (actor.characterId === null || actor.characterId === undefined || actor.characterId !== request.rollerCharacterId)
  ) {
    throw new Error("A Player may record a Roll only as their authorized Character.");
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
    const declaration = await assertActionRollAllowedInTransaction(tx, request.pendingActionId);
    if (declaration) {
      const existing = await tx.select({ id: campaignSessionRoll.id }).from(campaignSessionRoll).where(
        eq(campaignSessionRoll.pendingActionId, request.pendingActionId),
      ).limit(1);
      if (existing[0]) throw new Error("This declaration's attack Roll slot already has immutable history.");
    }
  }

  if (request.reactionId !== null) {
    const [reaction] = await tx.select({
      reactorCharacterId: campaignSessionEncounterReaction.reactorCharacterId,
      status: campaignSessionEncounterReaction.status,
      declarationSnapshotJson: campaignSessionEncounterReaction.declarationSnapshotJson,
      rollRequired: campaignSessionEncounterReaction.rollRequired,
    })
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
    if (reaction.declarationSnapshotJson !== null) {
      const snapshot = parseDefenseInterventionSnapshot(reaction.declarationSnapshotJson);
      if (reaction.status !== "declared" || reaction.rollRequired !== true || !snapshot.rollRequired) {
        throw new Error("That defense/intervention declaration has no open Roll slot.");
      }
      await assertResponseRollAllowedInTransaction(tx, snapshot.actionDeclarationId);
      const existing = await tx.select({ id: campaignSessionRoll.id }).from(campaignSessionRoll)
        .where(eq(campaignSessionRoll.reactionId, request.reactionId)).limit(1);
      if (existing[0]) throw new Error("This response Roll slot already has immutable history.");
      if (request.targetCharacterId !== snapshot.targetCharacterId) {
        throw new Error("A response Roll must retain its locked target identity.");
      }
      const expectedMechanical = snapshot.source.governingSource === null ? null : normalizeRollMechanicalRequest({
        governingSource: snapshot.source.governingSource,
        modifiers: snapshot.explicitModifiers,
      });
      if (JSON.stringify(request.mechanical) !== JSON.stringify(expectedMechanical)) {
        throw new Error("A response Roll must use its locked server-authoritative governing source and modifiers.");
      }
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
  if (frozenGoverningSource !== null && request.mechanical === null) {
    throw new Error("A frozen governing source requires locked Roll mechanics.");
  }
  if (frozenGoverningSource !== null) {
    const sourceCharacterId = frozenGoverningSource.kind === "manual" ? null : frozenGoverningSource.characterId;
    if (sourceCharacterId !== request.rollerCharacterId) {
      throw new Error("Frozen Roll mechanics do not belong to the authorized rolling Character.");
    }
    if (actor.readAs === "player" && sourceCharacterId !== actor.characterId) {
      throw new Error("A Player cannot use another Character's frozen Roll mechanics.");
    }
    const requestedSource = request.mechanical!.governingSource;
    const sameIdentity = requestedSource.kind === frozenGoverningSource.kind && (
      requestedSource.kind === "manual" && frozenGoverningSource.kind === "manual"
        ? requestedSource.label === frozenGoverningSource.label && requestedSource.originalTarget === frozenGoverningSource.originalTarget
        : requestedSource.kind === "attribute" && frozenGoverningSource.kind === "attribute"
          ? requestedSource.characterId === frozenGoverningSource.characterId && requestedSource.attributeKey === frozenGoverningSource.attributeKey
          : requestedSource.kind === "skill" && frozenGoverningSource.kind === "skill"
            ? requestedSource.characterId === frozenGoverningSource.characterId
              && requestedSource.allocationId === frozenGoverningSource.allocationId
              && requestedSource.calculatedPercentage === frozenGoverningSource.calculatedPercentage
            : false
    );
    if (!sameIdentity) throw new Error("The Roll request does not match its frozen governing-source identity.");
  }
  const governingSource = request.mechanical === null
    ? null
    : frozenGoverningSource ?? await resolveGoverningSourceSnapshot(
      tx,
      actor,
      request.rollerCharacterId,
      request.mechanical.governingSource,
    );
  const mechanicalSnapshot = governingSource === null
    ? null
    : buildRollMechanicalSnapshot(
      governingSource,
      outcome.resultTotal,
      request.mechanical?.modifiers,
      "original-roll",
    );
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
    targetNumber: mechanicalSnapshot?.resolution.originalTarget ?? request.targetNumber,
    mechanicalSnapshot,
    notes: request.notes,
    roundNumber: initiative?.roundNumber ?? null,
    stepNumber: initiative?.stepNumber ?? null,
  }).returning({ id: campaignSessionRoll.id });
  if (!created) throw new Error("The Roll could not be recorded.");
  if (request.pendingActionId !== null) {
    await recordActionRollStateInTransaction(
      tx,
      request.pendingActionId,
      actor.userId,
      created.id,
      outcome.resultTotal === 1 || outcome.resultTotal === 100,
    );
  }
  const page = await readRollLedgerInTransaction(tx, actor, session.id, { beforeId: created.id + 1, limit: 1 });
  const entry = page.rolls.find(({ id }) => id === created.id);
  if (!entry) throw new Error("The persisted Roll could not be reloaded.");
  return entry;
}

export async function recordRollInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  input: RollRecordRequest,
  randomSource: RollRandomSource = secureRandomSource,
): Promise<RollLedgerEntry> {
  return recordRollInternal(tx, actor, input, randomSource, null);
}

/**
 * Records a normal immutable Roll while evaluating against mechanics frozen by
 * an earlier server-side declaration. This is intentionally an internal
 * service boundary: browser input never supplies the trusted snapshot.
 */
export async function recordFrozenRollInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  input: RollRecordRequest,
  frozenGoverningSource: RollGoverningSourceSnapshot,
  randomSource: RollRandomSource = secureRandomSource,
): Promise<RollLedgerEntry> {
  return recordRollInternal(tx, actor, input, randomSource, frozenGoverningSource);
}

async function lockRollForAmendment(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  sessionId: number,
  rollId: number,
) {
  if (actor.readAs !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may amend Rolls.");
  const normalizedSessionId = positiveId(sessionId, "Session");
  const id = positiveId(rollId, "Roll");
  const [locked] = await tx.select().from(campaignSessionRoll).where(and(
    eq(campaignSessionRoll.id, id),
    eq(campaignSessionRoll.sessionId, normalizedSessionId),
    eq(campaignSessionRoll.campaignId, actor.campaignId),
  )).limit(1).for("update");
  if (!locked) throw new Error("That Roll does not belong to the authorized Campaign and Session.");
  const amendments = await tx.select().from(campaignSessionRollAmendment)
    .where(and(
      eq(campaignSessionRollAmendment.rollId, locked.id),
      eq(campaignSessionRollAmendment.sessionId, locked.sessionId),
      eq(campaignSessionRollAmendment.campaignId, locked.campaignId),
    )).orderBy(asc(campaignSessionRollAmendment.id));
  return { locked, amendments };
}

async function insertRollAmendment(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  locked: typeof campaignSessionRoll.$inferSelect,
  previousAmendmentId: number | null,
  values: {
    kind: RollAmendmentKind;
    reason: string;
    mechanicalSnapshot?: RollMechanicalSnapshot | null;
    rulingText?: string;
  },
): Promise<void> {
  const [created] = await tx.insert(campaignSessionRollAmendment).values({
    rollId: locked.id,
    campaignId: locked.campaignId,
    sessionId: locked.sessionId,
    previousAmendmentId,
    kind: values.kind,
    reason: values.reason,
    mechanicalSnapshot: values.mechanicalSnapshot ?? null,
    rulingText: values.rulingText ?? "",
    createdByUserId: actor.userId,
  }).returning({ id: campaignSessionRollAmendment.id });
  if (!created) throw new Error("The Roll amendment could not be recorded.");
}

async function reloadAmendedRoll(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  sessionId: number,
  rollId: number,
): Promise<RollLedgerEntry> {
  const page = await readRollLedgerInTransaction(tx, actor, sessionId, { beforeId: rollId + 1, limit: 1 });
  const entry = page.rolls.find(({ id }) => id === rollId);
  if (!entry) throw new Error("The amended Roll could not be reloaded.");
  return entry;
}

export async function voidRollInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  sessionId: number,
  rollId: number,
  reason: string,
): Promise<RollLedgerEntry> {
  const normalizedReason = normalizeVoidReason(reason);
  const { locked, amendments } = await lockRollForAmendment(tx, actor, sessionId, rollId);
  if (locked.status === "voided" || amendments.some(({ kind }) => kind === "void")) {
    throw new Error("That Roll is already voided.");
  }
  await insertRollAmendment(
    tx,
    actor,
    locked,
    amendments.at(-1)?.id ?? null,
    { kind: "void", reason: normalizedReason },
  );
  return reloadAmendedRoll(tx, actor, locked.sessionId, locked.id);
}

export async function correctRollInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  input: RollCorrectionRequest,
): Promise<RollLedgerEntry> {
  const reason = boundedRequiredText(input.reason, "Correction reason", 500);
  const rulingText = boundedOptionalText(input.rulingText, "Correction ruling", 2000);
  const mechanical = normalizeRollMechanicalRequest({
    governingSource: input.governingSource,
    modifiers: input.modifiers,
  });
  if (mechanical === null) throw new Error("A correction requires a mechanical interpretation.");
  const { locked, amendments } = await lockRollForAmendment(tx, actor, input.sessionId, input.rollId);
  if (locked.status === "voided" || amendments.some(({ kind }) => kind === "void")) {
    throw new Error("A voided Roll cannot receive a mechanical correction.");
  }
  const previousCorrection = amendments.findLast(({ kind }) => kind === "correction");
  const previousSnapshot = parseRollMechanicalSnapshot(previousCorrection?.mechanicalSnapshot ?? locked.mechanicalSnapshot);
  const hasCorrectedResult = input.correctedResultTotal !== undefined && input.correctedResultTotal !== null;
  const resultTotal = hasCorrectedResult
    ? input.correctedResultTotal!
    : previousSnapshot?.resolution.resultTotal ?? locked.resultTotal;
  const governingSource = await resolveGoverningSourceSnapshot(
    tx,
    actor,
    locked.rollerCharacterId,
    mechanical.governingSource,
  );
  const snapshot = buildRollMechanicalSnapshot(
    governingSource,
    resultTotal,
    mechanical.modifiers,
    hasCorrectedResult || previousSnapshot?.rawResultSource === "corrected-result"
      ? "corrected-result"
      : "original-roll",
  );
  await insertRollAmendment(
    tx,
    actor,
    locked,
    amendments.at(-1)?.id ?? null,
    { kind: "correction", reason, mechanicalSnapshot: snapshot, rulingText },
  );
  return reloadAmendedRoll(tx, actor, locked.sessionId, locked.id);
}

export async function recordRollRulingInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  input: RollRulingRequest,
): Promise<RollLedgerEntry> {
  const reason = boundedRequiredText(input.reason, "Ruling reason", 500);
  const rulingText = boundedRequiredText(input.rulingText, "G.O.D. ruling", 2000);
  const { locked, amendments } = await lockRollForAmendment(tx, actor, input.sessionId, input.rollId);
  await insertRollAmendment(
    tx,
    actor,
    locked,
    amendments.at(-1)?.id ?? null,
    { kind: "ruling", reason, rulingText },
  );
  return reloadAmendedRoll(tx, actor, locked.sessionId, locked.id);
}

export async function readEffectiveRollSnapshotInTransaction(
  tx: RollRuntimeTransaction,
  actor: AuthorizedRollActor,
  rollId: number,
): Promise<Readonly<{
  id: number;
  rollerCharacterId: number | null;
  targetCharacterId: number | null;
  pendingActionId: number | null;
  reactionId: number | null;
  status: "recorded" | "voided";
  mechanicalSnapshot: RollMechanicalSnapshot | null;
}>> {
  const [row] = await tx.select().from(campaignSessionRoll).where(and(
    eq(campaignSessionRoll.id, positiveId(rollId, "Roll")),
    eq(campaignSessionRoll.campaignId, actor.campaignId),
  )).limit(1);
  if (!row) throw new Error("That immutable Roll does not belong to the authorized Campaign.");
  if (actor.readAs === "player" && actor.characterId !== row.rollerCharacterId && row.visibility !== "table") {
    throw new Error("A Player cannot inspect another Character's private Roll mechanics.");
  }
  const amendments = await tx.select().from(campaignSessionRollAmendment)
    .where(and(
      eq(campaignSessionRollAmendment.rollId, row.id),
      eq(campaignSessionRollAmendment.campaignId, actor.campaignId),
      eq(campaignSessionRollAmendment.sessionId, row.sessionId),
    ))
    .orderBy(asc(campaignSessionRollAmendment.id));
  const correction = [...amendments].reverse().find(({ kind }) => kind === "correction");
  const voided = row.status === "voided" || amendments.some(({ kind }) => kind === "void");
  return {
    id: row.id,
    rollerCharacterId: row.rollerCharacterId,
    targetCharacterId: row.targetCharacterId,
    pendingActionId: row.pendingActionId,
    reactionId: row.reactionId,
    status: voided ? "voided" : "recorded",
    mechanicalSnapshot: parseRollMechanicalSnapshot(correction?.mechanicalSnapshot ?? row.mechanicalSnapshot),
  };
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
  if (requestedVisibility !== null && !canReadRollVisibility(actor.readAs, requestedVisibility, {
    authorizedCharacterId: actor.characterId ?? null,
    rollerCharacterId: actor.characterId ?? null,
  })) {
    throw new Error("That Roll visibility is not readable by this actor.");
  }
  const limit = filters.limit === undefined ? 50 : filters.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Roll history page size must be from 1 through 100.");
  const clauses: SQL[] = [
    eq(campaignSessionRoll.sessionId, normalizedSessionId),
    eq(campaignSessionRoll.campaignId, actor.campaignId),
  ];
  if (actor.readAs === "god-owner") {
    clauses.push(inArray(campaignSessionRoll.visibility, readableRollVisibilities(actor.readAs)));
  } else {
    if (actor.characterId === null || actor.characterId === undefined) {
      clauses.push(eq(campaignSessionRoll.visibility, "table"));
    } else {
      clauses.push(or(
        eq(campaignSessionRoll.visibility, "table"),
        and(
          eq(campaignSessionRoll.visibility, "private"),
          eq(campaignSessionRoll.rollerCharacterId, actor.characterId),
        ),
      )!);
    }
  }
  if (sceneId !== null) clauses.push(eq(campaignSessionRoll.sceneId, sceneId));
  if (encounterId !== null) clauses.push(eq(campaignSessionRoll.encounterId, encounterId));
  if (characterId !== null) clauses.push(or(
    eq(campaignSessionRoll.rollerCharacterId, characterId),
    eq(campaignSessionRoll.targetCharacterId, characterId),
  )!);
  if (method !== null) clauses.push(eq(campaignSessionRoll.method, method));
  if (requestedVisibility !== null) clauses.push(eq(campaignSessionRoll.visibility, requestedVisibility));
  if (purposeKind !== null) clauses.push(eq(campaignSessionRoll.purposeKind, purposeKind));
  const voidAmendment = tx.select({ id: campaignSessionRollAmendment.id })
    .from(campaignSessionRollAmendment)
    .where(and(
      eq(campaignSessionRollAmendment.rollId, campaignSessionRoll.id),
      eq(campaignSessionRollAmendment.campaignId, campaignSessionRoll.campaignId),
      eq(campaignSessionRollAmendment.sessionId, campaignSessionRoll.sessionId),
      eq(campaignSessionRollAmendment.kind, "void"),
    ));
  if (status === "voided") clauses.push(or(
    eq(campaignSessionRoll.status, "voided"),
    exists(voidAmendment),
  )!);
  if (status === "recorded") clauses.push(and(
    eq(campaignSessionRoll.status, "recorded"),
    notExists(voidAmendment),
  )!);
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
  const rollIds = pageRows.map(({ id }) => id);
  const amendmentRows = rollIds.length ? await tx.select().from(campaignSessionRollAmendment)
    .where(inArray(campaignSessionRollAmendment.rollId, rollIds))
    .orderBy(asc(campaignSessionRollAmendment.rollId), asc(campaignSessionRollAmendment.id)) : [];
  const userIds = [...new Set([
    ...pageRows.flatMap((row) => [row.recordedByUserId, row.voidedByUserId]),
    ...amendmentRows.map(({ createdByUserId }) => createdByUserId),
  ].filter((id): id is string => id !== null))];
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
  const amendmentsByRoll = new Map<number, typeof amendmentRows>();
  for (const amendment of amendmentRows) {
    const entries = amendmentsByRoll.get(amendment.rollId) ?? [];
    entries.push(amendment);
    amendmentsByRoll.set(amendment.rollId, entries);
  }
  return {
    rolls: pageRows.map((row): RollLedgerEntry => {
      const sourceAmendments = amendmentsByRoll.get(row.id) ?? [];
      const mayReadMechanics = actor.readAs === "god-owner" || actor.characterId === row.rollerCharacterId;
      const originalSnapshot = parseRollMechanicalSnapshot(row.mechanicalSnapshot);
      const amendments = sourceAmendments.map((amendment): RollLedgerAmendment => ({
        id: amendment.id,
        previousAmendmentId: amendment.previousAmendmentId,
        kind: amendment.kind,
        reason: amendment.reason,
        mechanicalSnapshot: mayReadMechanics
          ? parseRollMechanicalSnapshot(amendment.mechanicalSnapshot)
          : null,
        rulingText: amendment.rulingText,
        createdByUserId: amendment.createdByUserId,
        createdByName: userNames.get(amendment.createdByUserId) ?? "Unknown user",
        createdAt: amendment.createdAt.toISOString(),
      }));
      const latestCorrection = [...sourceAmendments].reverse().find(({ kind }) => kind === "correction");
      const effectiveSnapshot = parseRollMechanicalSnapshot(
        latestCorrection?.mechanicalSnapshot ?? row.mechanicalSnapshot,
      );
      const appendOnlyVoid = sourceAmendments.find(({ kind }) => kind === "void") ?? null;
      const effectiveStatus: RollStatus = row.status === "voided" || appendOnlyVoid !== null
        ? "voided"
        : "recorded";
      const latestRuling = [...sourceAmendments].reverse().find(({ rulingText }) => rulingText.trim()) ?? null;
      const legacyVoid = row.status === "voided" && row.voidedAt !== null && row.voidedByUserId !== null
        ? {
          voidedAt: row.voidedAt.toISOString(),
          reason: row.voidReason,
          voidedByUserId: row.voidedByUserId,
          voidedByName: userNames.get(row.voidedByUserId) ?? "Unknown user",
        }
        : null;
      const effectiveVoid = appendOnlyVoid === null ? legacyVoid : {
        voidedAt: appendOnlyVoid.createdAt.toISOString(),
        reason: appendOnlyVoid.reason,
        voidedByUserId: appendOnlyVoid.createdByUserId,
        voidedByName: userNames.get(appendOnlyVoid.createdByUserId) ?? "Unknown user",
      };
      return {
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
        mechanicalSnapshot: mayReadMechanics ? originalSnapshot : null,
        effectiveResultTotal: effectiveSnapshot?.resolution.resultTotal ?? row.resultTotal,
        effectiveMechanicalSnapshot: mayReadMechanics ? effectiveSnapshot : null,
        mechanicsRedacted: !mayReadMechanics && (originalSnapshot !== null || latestCorrection !== undefined),
        amendments,
        rulingText: latestRuling?.rulingText ?? "",
        targetNumber: mayReadMechanics || originalSnapshot === null ? row.targetNumber : null,
        notes: row.notes,
        roundNumber: row.roundNumber,
        stepNumber: row.stepNumber,
        status: effectiveStatus,
        voidedAt: effectiveVoid?.voidedAt ?? null,
        voidReason: effectiveVoid?.reason ?? "",
        voidedByUserId: effectiveVoid?.voidedByUserId ?? null,
        voidedByName: effectiveVoid?.voidedByName ?? null,
        legacyVoid,
        createdAt: row.createdAt.toISOString(),
      };
    }),
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

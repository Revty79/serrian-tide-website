import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { db } from "@/db";
import { userRole } from "@/db/authorization-schema";
import { campaign, campaignPlayer } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import { skill, skillRelationship } from "@/db/skill-schema";
import {
  campaignSession,
  campaignSessionCalledCheckBatch,
  campaignSessionCalledCheckEvent,
  campaignSessionCalledCheckRequest,
  campaignSessionEncounter,
  campaignSessionHighLowEvent,
  campaignSessionHighLowRequest,
  campaignSessionRoster,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";
import { loadCharacterSkillLineageInputInTransaction } from "@/features/items/character-weapon-governance-service";

import {
  evaluateCalledCheck,
  getCalledCheckSkillPathAlternatives,
  resolveCalledCheckSource,
  resolveHighLow,
  summarizeCalledCheckBatch,
  type CalledCheckRequestedSource,
  type CalledCheckStatus,
  type HighLowMode,
  type HighLowResolution,
  type HighLowSide,
} from "./called-check";
import {
  parseRollGoverningSourceSnapshot,
  type RollGoverningSourceRequest,
  type RollGoverningSourceSnapshot,
} from "./roll-mechanical-snapshot";
import { resolvePercentileCheck, type PercentileResolution, type PercentileTargetModifier } from "./percentile-resolution";
import type { RollMethod, RollRandomSource, RollVisibility } from "./roll-runtime";
import {
  recordFrozenRollInTransaction,
  recordRollInTransaction,
  type AuthorizedRollActor,
} from "./roll-runtime-service";

export type CalledCheckTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CalledCheckIssueInput = Readonly<{
  sessionId: number;
  sceneId?: number | null;
  encounterId?: number | null;
  source: CalledCheckRequestedSource;
  purpose: string;
  instructions?: string;
  recipientScope: "one" | "selected" | "all-pcs";
  recipientCharacterIds?: readonly number[];
  visibility: RollVisibility;
  rollMethod: RollMethod;
  modifiers?: readonly PercentileTargetModifier[];
  idempotencyKey: string;
}>;

export type HighLowIssueInput = Readonly<{
  sessionId: number;
  sceneId?: number | null;
  encounterId?: number | null;
  mode: HighLowMode;
  participantCharacterId?: number | null;
  visibility: RollVisibility;
  rollMethod: RollMethod;
  purpose: string;
  idempotencyKey: string;
}>;

export type CalledCheckEventView = Readonly<{
  id: number;
  fromStatus: CalledCheckStatus | null;
  toStatus: CalledCheckStatus;
  eventKind: string;
  reason: string;
  actorUserId: string;
  createdAt: string;
}>;

export type CalledCheckRequestView = Readonly<{
  id: number;
  batchId: number;
  recipientCharacterId: number;
  recipientName: string;
  recipientKind: "pc" | "npc";
  status: CalledCheckStatus;
  governingSource: RollGoverningSourceSnapshot | null;
  sourceLabel: string;
  originalTarget: number | null;
  finalTarget: number | null;
  modifiers: readonly PercentileTargetModifier[];
  resolution: PercentileResolution | null;
  rollId: number | null;
  parentRequestId: number | null;
  cancellationReason: string;
  rerollReason: string;
  rulingText: string;
  revealedVisibility: RollVisibility | null;
  issuedAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  events: readonly CalledCheckEventView[];
}>;

export type CalledCheckBatchView = Readonly<{
  id: number;
  sessionId: number;
  sceneId: number | null;
  encounterId: number | null;
  sourceKind: "attribute" | "skill";
  attributeKey: string | null;
  endpointSkillId: number | null;
  selectedSkillPath: readonly number[] | null;
  sourceLabel: string;
  purpose: string;
  instructions: string;
  recipientScope: "one" | "selected" | "all-pcs";
  visibility: RollVisibility;
  rollMethod: RollMethod;
  createdAt: string;
  requests: readonly CalledCheckRequestView[];
  summary: ReturnType<typeof summarizeCalledCheckBatch>;
}>;

export type HighLowRequestView = Readonly<{
  id: number;
  mode: HighLowMode;
  participantCharacterId: number | null;
  participantName: string | null;
  visibility: RollVisibility;
  rollMethod: RollMethod;
  purpose: string;
  status: CalledCheckStatus;
  calledSide: HighLowSide | null;
  rollId: number | null;
  result: HighLowResolution | null;
  parentRequestId: number | null;
  cancellationReason: string;
  rerollReason: string;
  rulingText: string;
  calledAt: string | null;
  respondedAt: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  events: readonly CalledCheckEventView[];
}>;

export type CalledCheckWorkspaceView = Readonly<{
  session: { id: number; campaignId: number; title: string; status: "planned" | "active" | "completed" };
  recipients: readonly { characterId: number; name: string; kind: "pc" | "npc"; playerUserId: string }[];
  skillPaths: readonly { endpointSkillId: number; endpointName: string; rootToEndpointSkillIds: readonly number[]; pathLabel: string; valid: boolean; problem: string }[];
  batches: readonly CalledCheckBatchView[];
  highLow: readonly HighLowRequestView[];
}>;

export type PlayerCalledCheckWorkspaceView = Readonly<{
  characterId: number;
  session: CalledCheckWorkspaceView["session"];
  calledChecks: readonly (CalledCheckRequestView & Pick<CalledCheckBatchView, "purpose" | "instructions" | "visibility" | "rollMethod" | "sourceLabel">)[];
  highLow: readonly HighLowRequestView[];
}>;

type SessionContext = CalledCheckWorkspaceView["session"] & { ownerUserId: string };

function positiveId(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function optionalPositiveId(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : positiveId(value, label);
}

function requiredText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(`${label} must be nonblank and ${maximum} characters or fewer.`);
  return normalized;
}

function optionalText(value: unknown, label: string, maximum: number): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function enumValue<T extends string>(values: readonly T[], value: unknown, label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

function date(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function asModifiers(value: unknown): PercentileTargetModifier[] {
  if (!Array.isArray(value)) throw new Error("Stored Called Check modifiers are invalid.");
  return value as PercentileTargetModifier[];
}

function sourceLabel(snapshot: RollGoverningSourceSnapshot | null): string {
  if (!snapshot) return "G.O.D. ruling required";
  if (snapshot.kind === "attribute") return `${snapshot.attributeKey} straight Attribute (${snapshot.attributeValue})`;
  if (snapshot.kind === "manual") return snapshot.label;
  return `${snapshot.skillName} allocation #${snapshot.allocationId} via ${snapshot.skillPath.map(({ skillName, skillId }) => `${skillName} (#${skillId})`).join(" -> ")}`;
}

async function loadGodSession(
  tx: CalledCheckTransaction,
  sessionId: number,
  actorUserId: string,
  lock = false,
): Promise<SessionContext> {
  const query = tx.select({
    id: campaignSession.id,
    campaignId: campaignSession.campaignId,
    title: campaignSession.title,
    status: campaignSession.status,
    ownerUserId: campaign.createdByUserId,
  }).from(campaignSession)
    .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
    .innerJoin(userRole, and(eq(userRole.userId, actorUserId), eq(userRole.role, "god")))
    .where(and(eq(campaignSession.id, positiveId(sessionId, "Session")), eq(campaign.createdByUserId, actorUserId)))
    .limit(1);
  const rows = lock ? await query.for("update", { of: campaignSession }) : await query;
  const context = rows[0];
  if (!context) throw new Error("Only the Campaign-owning G.O.D. may manage Called Checks for this Session.");
  return context;
}

async function assertActiveContext(
  tx: CalledCheckTransaction,
  context: SessionContext,
  sceneId: number | null,
  encounterId: number | null,
): Promise<void> {
  if (context.status !== "active") throw new Error("Called Checks and High/Low require the active Session.");
  if (encounterId !== null && sceneId === null) throw new Error("An Encounter context requires its exact Scene.");
  if (sceneId !== null) {
    const [scene] = await tx.select({ id: campaignSessionScene.id }).from(campaignSessionScene).where(and(
      eq(campaignSessionScene.id, sceneId),
      eq(campaignSessionScene.sessionId, context.id),
      eq(campaignSessionScene.campaignId, context.campaignId),
    )).limit(1);
    if (!scene) throw new Error("That Scene does not belong to the active Session.");
  }
  if (encounterId !== null) {
    const [encounter] = await tx.select({ id: campaignSessionEncounter.id }).from(campaignSessionEncounter).where(and(
      eq(campaignSessionEncounter.id, encounterId),
      eq(campaignSessionEncounter.sceneId, sceneId!),
      eq(campaignSessionEncounter.sessionId, context.id),
      eq(campaignSessionEncounter.campaignId, context.campaignId),
    )).limit(1);
    if (!encounter) throw new Error("That Encounter does not belong to the exact Scene and Session.");
  }
}

async function sessionRecipients(
  tx: CalledCheckTransaction,
  context: SessionContext,
  scope: "one" | "selected" | "all-pcs",
  suppliedIds: readonly number[],
) {
  const ids = [...new Set(suppliedIds.map((id) => positiveId(id, "Recipient Character")))];
  if (scope === "one" && ids.length !== 1) throw new Error("One-recipient scope requires exactly one Character.");
  if (scope === "selected" && !ids.length) throw new Error("Selected-recipient scope requires at least one Character.");
  const conditions = [
    eq(campaignSessionRoster.sessionId, context.id),
    eq(campaignSessionRoster.campaignId, context.campaignId),
  ];
  if (scope === "all-pcs") conditions.push(eq(campaignCharacter.isNpc, false));
  else conditions.push(inArray(campaignSessionRoster.characterId, ids));
  const rows = await tx.select({
    characterId: campaignCharacter.id,
    name: campaignCharacter.name,
    playerUserId: campaignCharacter.playerUserId,
    isNpc: campaignCharacter.isNpc,
  }).from(campaignSessionRoster)
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionRoster.characterId),
      eq(campaignCharacter.campaignId, campaignSessionRoster.campaignId),
    ))
    .where(and(...conditions))
    .orderBy(asc(campaignSessionRoster.sortOrder), asc(campaignCharacter.id));
  if (!rows.length) throw new Error(scope === "all-pcs" ? "The active Session has no eligible Player Characters." : "No selected recipient belongs to this Session roster.");
  if (scope !== "all-pcs" && rows.length !== ids.length) throw new Error("Every selected recipient must belong to this Campaign and Session roster.");
  if (rows.some((recipient) => recipient.isNpc && recipient.playerUserId !== context.ownerUserId)) {
    throw new Error("Persistent NPC Called Checks require an NPC controlled by the Campaign-owning G.O.D.");
  }
  return rows;
}

async function insertCalledEvent(
  tx: CalledCheckTransaction,
  request: { id: number; campaignId: number; sessionId: number },
  actorUserId: string,
  fromStatus: CalledCheckStatus | null,
  toStatus: CalledCheckStatus,
  eventKind: string,
  reason = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(campaignSessionCalledCheckEvent).values({
    requestId: request.id,
    campaignId: request.campaignId,
    sessionId: request.sessionId,
    fromStatus,
    toStatus,
    eventKind,
    reason,
    metadataJson: metadata,
    actorUserId,
  });
}

async function insertHighLowEvent(
  tx: CalledCheckTransaction,
  request: { id: number; campaignId: number; sessionId: number },
  actorUserId: string,
  fromStatus: CalledCheckStatus | null,
  toStatus: CalledCheckStatus,
  eventKind: string,
  reason = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(campaignSessionHighLowEvent).values({
    requestId: request.id,
    campaignId: request.campaignId,
    sessionId: request.sessionId,
    fromStatus,
    toStatus,
    eventKind,
    reason,
    metadataJson: metadata,
    actorUserId,
  });
}

export async function issueCalledCheckInTransaction(
  tx: CalledCheckTransaction,
  actorUserId: string,
  input: CalledCheckIssueInput,
): Promise<number> {
  const sessionId = positiveId(input.sessionId, "Session");
  const context = await loadGodSession(tx, sessionId, actorUserId, true);
  const sceneId = optionalPositiveId(input.sceneId, "Scene");
  const encounterId = optionalPositiveId(input.encounterId, "Encounter");
  await assertActiveContext(tx, context, sceneId, encounterId);
  const idempotencyKey = requiredText(input.idempotencyKey, "Issue idempotency key", 200);
  const [existing] = await tx.select({ id: campaignSessionCalledCheckBatch.id }).from(campaignSessionCalledCheckBatch).where(and(
    eq(campaignSessionCalledCheckBatch.campaignId, context.campaignId),
    eq(campaignSessionCalledCheckBatch.issuedByUserId, actorUserId),
    eq(campaignSessionCalledCheckBatch.idempotencyKey, idempotencyKey),
  )).limit(1);
  if (existing) return existing.id;
  const recipientScope = enumValue(["one", "selected", "all-pcs"] as const, input.recipientScope, "Recipient scope");
  const recipients = await sessionRecipients(tx, context, recipientScope, input.recipientCharacterIds ?? []);
  const visibility = enumValue(["table", "private", "god-only"] as const, input.visibility, "Visibility");
  const rollMethod = enumValue(["random", "entered"] as const, input.rollMethod, "Roll method");
  const purpose = requiredText(input.purpose, "Purpose", 500);
  const instructions = optionalText(input.instructions, "Instructions", 2000);
  const modifiers = resolvePercentileCheck({
    resultTotal: 50,
    originalTarget: 0,
    modifiers: input.modifiers ?? [],
  }).modifiers;
  const source = input.source.kind === "attribute"
    ? { kind: "attribute" as const, attributeKey: enumValue(["STR", "DEX", "CON", "INT", "WIS", "CHR"] as const, input.source.attributeKey, "Attribute") }
    : {
        kind: "skill" as const,
        endpointSkillId: positiveId(input.source.endpointSkillId, "Endpoint Skill"),
        rootToEndpointSkillIds: input.source.rootToEndpointSkillIds.map((id) => positiveId(id, "Selected Skill path identity")),
      };
  const [batch] = await tx.insert(campaignSessionCalledCheckBatch).values({
    campaignId: context.campaignId,
    sessionId: context.id,
    sceneId,
    encounterId,
    issuedByUserId: actorUserId,
    sourceKind: source.kind,
    attributeKey: source.kind === "attribute" ? source.attributeKey : null,
    endpointSkillId: source.kind === "skill" ? source.endpointSkillId : null,
    selectedSkillPathJson: source.kind === "skill" ? [...source.rootToEndpointSkillIds] : null,
    purpose,
    instructions,
    recipientScope,
    visibility,
    rollMethod,
    modifiersJson: [...modifiers],
    idempotencyKey,
  }).returning({ id: campaignSessionCalledCheckBatch.id });
  if (!batch) throw new Error("The Called Check batch could not be created.");
  for (const recipient of recipients) {
    const lineage = await loadCharacterSkillLineageInputInTransaction(tx, recipient.characterId);
    const resolved = resolveCalledCheckSource(lineage, source, modifiers);
    const status: CalledCheckStatus = resolved.status === "resolved" ? "pending" : "requires-god-ruling";
    const [request] = await tx.insert(campaignSessionCalledCheckRequest).values({
      batchId: batch.id,
      campaignId: context.campaignId,
      sessionId: context.id,
      sceneId,
      encounterId,
      recipientCharacterId: recipient.characterId,
      recipientKind: recipient.isNpc ? "npc" : "pc",
      status,
      governingSourceJson: resolved.status === "resolved" ? resolved.governingSource : null,
      governingSnapshotJson: resolved.status === "resolved" ? resolved.governingSnapshot : null,
      originalTarget: resolved.status === "resolved" ? resolved.originalTarget : null,
      modifiersJson: resolved.status === "resolved" ? [...resolved.modifiers] : [...modifiers],
      finalTarget: resolved.status === "resolved" ? resolved.finalTarget : null,
      rulingText: resolved.status === "requires-god-ruling" ? resolved.explanation : "",
    }).returning({ id: campaignSessionCalledCheckRequest.id });
    if (!request) throw new Error("A per-recipient Called Check could not be created.");
    await insertCalledEvent(tx, { ...request, campaignId: context.campaignId, sessionId: context.id }, actorUserId, null, status, "issued", "", {
      recipientCharacterId: recipient.characterId,
      resolution: resolved.status,
    });
  }
  return batch.id;
}

async function lockCalledRequest(tx: CalledCheckTransaction, requestId: number) {
  const [request] = await tx.select().from(campaignSessionCalledCheckRequest)
    .where(eq(campaignSessionCalledCheckRequest.id, positiveId(requestId, "Called Check request")))
    .limit(1).for("update");
  if (!request) throw new Error("That Called Check request does not exist.");
  const [batch] = await tx.select().from(campaignSessionCalledCheckBatch)
    .where(and(
      eq(campaignSessionCalledCheckBatch.id, request.batchId),
      eq(campaignSessionCalledCheckBatch.campaignId, request.campaignId),
      eq(campaignSessionCalledCheckBatch.sessionId, request.sessionId),
    )).limit(1);
  if (!batch) throw new Error("The Called Check batch identity is invalid.");
  return { request, batch };
}

async function assertPlayerCharacter(
  tx: CalledCheckTransaction,
  characterId: number,
  actorUserId: string,
) {
  const [character] = await tx.select({
    characterId: campaignCharacter.id,
    campaignId: campaignCharacter.campaignId,
    name: campaignCharacter.name,
  }).from(campaignCharacter)
    .innerJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
      eq(campaignPlayer.userId, actorUserId),
    ))
    .innerJoin(userRole, and(eq(userRole.userId, actorUserId), eq(userRole.role, "player")))
    .where(and(
      eq(campaignCharacter.id, positiveId(characterId, "Character")),
      eq(campaignCharacter.playerUserId, actorUserId),
      eq(campaignCharacter.isNpc, false),
    )).limit(1);
  if (!character) throw new Error("A Player may act only as their own assigned Player Character.");
  return character;
}

function rollActor(userId: string, campaignId: number, readAs: "god-owner" | "player", characterId: number | null): AuthorizedRollActor {
  return { userId, campaignId, readAs, canRecordGodOnly: readAs === "god-owner", characterId };
}

export async function answerCalledCheckInTransaction(
  tx: CalledCheckTransaction,
  actor: { kind: "god" | "player"; userId: string; characterId?: number | null },
  input: { requestId: number; enteredTotal?: number | null; idempotencyKey: string },
  randomSource?: RollRandomSource,
): Promise<number> {
  const { request, batch } = await lockCalledRequest(tx, input.requestId);
  const idempotencyKey = requiredText(input.idempotencyKey, "Response idempotency key", 200);
  if (request.responseIdempotencyKey === idempotencyKey && request.rollId !== null) return request.rollId;
  if (request.status !== "pending" || request.rollId !== null) throw new Error("This Called Check no longer has an open Roll slot.");
  const session = actor.kind === "god"
    ? await loadGodSession(tx, request.sessionId, actor.userId, false)
    : null;
  if (actor.kind === "god") {
    if (batch.visibility !== "god-only" && request.recipientKind === "pc") {
      throw new Error("A non-secret Player Character Called Check must be rolled by its assigned Player.");
    }
  } else {
    const character = await assertPlayerCharacter(tx, request.recipientCharacterId, actor.userId);
    if (character.characterId !== actor.characterId || character.campaignId !== request.campaignId) throw new Error("A Player cannot answer another Character's Called Check.");
    if (batch.visibility === "god-only" || request.recipientKind !== "pc") throw new Error("This Called Check is not answerable by a Player.");
  }
  if (session && session.status !== "active") throw new Error("Reopen the Session before answering this Called Check.");
  const governingSnapshot = parseRollGoverningSourceSnapshot(request.governingSnapshotJson);
  const governingSource = request.governingSourceJson as RollGoverningSourceRequest;
  const modifiers = asModifiers(request.modifiersJson);
  const ledger = await recordFrozenRollInTransaction(
    tx,
    rollActor(actor.userId, request.campaignId, actor.kind === "god" ? "god-owner" : "player", actor.kind === "player" ? request.recipientCharacterId : null),
    {
      sessionId: request.sessionId,
      sceneId: request.sceneId,
      encounterId: request.encounterId,
      rollerCharacterId: request.recipientCharacterId,
      method: batch.rollMethod,
      visibility: batch.visibility,
      purposeKind: batch.sourceKind,
      enteredTotal: input.enteredTotal,
      label: batch.purpose,
      targetNumber: request.originalTarget,
      mechanical: { governingSource, modifiers },
      notes: batch.instructions,
    },
    governingSnapshot,
    randomSource,
  );
  const resolution = evaluateCalledCheck({
    originalTarget: governingSnapshot.originalTarget,
    modifiers,
  }, ledger.resultTotal);
  const status: CalledCheckStatus = resolution.requiresGodRuling ? "requires-god-ruling" : "resolved";
  const now = new Date();
  const [updated] = await tx.update(campaignSessionCalledCheckRequest).set({
    status,
    rollId: ledger.id,
    resolutionJson: resolution,
    responseIdempotencyKey: idempotencyKey,
    respondedAt: now,
    resolvedAt: status === "resolved" ? now : null,
  }).where(and(
    eq(campaignSessionCalledCheckRequest.id, request.id),
    eq(campaignSessionCalledCheckRequest.status, "pending"),
  )).returning({ id: campaignSessionCalledCheckRequest.id });
  if (!updated) throw new Error("This Called Check was answered concurrently.");
  await insertCalledEvent(tx, request, actor.userId, "pending", status, "answered", "", { rollId: ledger.id });
  return ledger.id;
}

export async function cancelCalledCheckInTransaction(
  tx: CalledCheckTransaction,
  actorUserId: string,
  requestId: number,
  reason: string,
): Promise<void> {
  const { request } = await lockCalledRequest(tx, requestId);
  await loadGodSession(tx, request.sessionId, actorUserId, false);
  const normalizedReason = requiredText(reason, "Cancellation reason", 500);
  if (request.status === "cancelled" && request.cancellationReason === normalizedReason) return;
  if (request.status !== "pending" && !(request.status === "requires-god-ruling" && request.rollId === null)) {
    throw new Error("Only an unanswered Called Check may be cancelled.");
  }
  const now = new Date();
  await tx.update(campaignSessionCalledCheckRequest).set({ status: "cancelled", cancellationReason: normalizedReason, cancelledAt: now })
    .where(eq(campaignSessionCalledCheckRequest.id, request.id));
  await insertCalledEvent(tx, request, actorUserId, request.status, "cancelled", "cancelled", normalizedReason);
}

export async function rerollCalledCheckInTransaction(
  tx: CalledCheckTransaction,
  actorUserId: string,
  requestId: number,
  reason: string,
): Promise<number> {
  const { request } = await lockCalledRequest(tx, requestId);
  await loadGodSession(tx, request.sessionId, actorUserId, false);
  const normalizedReason = requiredText(reason, "Reroll reason", 500);
  const [existing] = await tx.select({ id: campaignSessionCalledCheckRequest.id }).from(campaignSessionCalledCheckRequest)
    .where(eq(campaignSessionCalledCheckRequest.parentRequestId, request.id)).limit(1);
  if (existing) return existing.id;
  if (request.status !== "resolved" && !(request.status === "requires-god-ruling" && request.rollId !== null)) {
    throw new Error("This Called Check attempt cannot be rerolled in its current state.");
  }
  const nextStatus: CalledCheckStatus = request.governingSnapshotJson === null ? "requires-god-ruling" : "pending";
  const [created] = await tx.insert(campaignSessionCalledCheckRequest).values({
    batchId: request.batchId,
    campaignId: request.campaignId,
    sessionId: request.sessionId,
    sceneId: request.sceneId,
    encounterId: request.encounterId,
    recipientCharacterId: request.recipientCharacterId,
    recipientKind: request.recipientKind,
    status: nextStatus,
    governingSourceJson: request.governingSourceJson,
    governingSnapshotJson: request.governingSnapshotJson,
    originalTarget: request.originalTarget,
    modifiersJson: request.modifiersJson,
    finalTarget: request.finalTarget,
    parentRequestId: request.id,
    rerollReason: normalizedReason,
    rulingText: request.governingSnapshotJson === null ? request.rulingText : "",
  }).returning({ id: campaignSessionCalledCheckRequest.id });
  if (!created) throw new Error("The linked Called Check reroll could not be created.");
  await tx.update(campaignSessionCalledCheckRequest).set({ status: "superseded" }).where(eq(campaignSessionCalledCheckRequest.id, request.id));
  await insertCalledEvent(tx, request, actorUserId, request.status, "superseded", "reroll-ordered", normalizedReason, { successorRequestId: created.id });
  await insertCalledEvent(tx, { ...created, campaignId: request.campaignId, sessionId: request.sessionId }, actorUserId, null, nextStatus, "reroll-created", normalizedReason, { parentRequestId: request.id });
  return created.id;
}

export async function ruleCalledCheckInTransaction(
  tx: CalledCheckTransaction,
  actorUserId: string,
  requestId: number,
  rulingText: string,
): Promise<void> {
  const { request } = await lockCalledRequest(tx, requestId);
  await loadGodSession(tx, request.sessionId, actorUserId, false);
  const ruling = requiredText(rulingText, "G.O.D. ruling", 2000);
  if (request.status !== "requires-god-ruling") throw new Error("This Called Check is not awaiting a G.O.D. ruling.");
  const now = new Date();
  await tx.update(campaignSessionCalledCheckRequest).set({ status: "resolved", rulingText: ruling, resolvedAt: now })
    .where(eq(campaignSessionCalledCheckRequest.id, request.id));
  await insertCalledEvent(tx, request, actorUserId, "requires-god-ruling", "resolved", "god-ruling", ruling);
}

export async function revealCalledCheckInTransaction(
  tx: CalledCheckTransaction,
  actorUserId: string,
  requestId: number,
  visibility: "table" | "private",
): Promise<void> {
  const { request, batch } = await lockCalledRequest(tx, requestId);
  await loadGodSession(tx, request.sessionId, actorUserId, false);
  if (batch.visibility !== "god-only") throw new Error("Only a secret Called Check can be revealed.");
  if (request.rollId === null) throw new Error("Resolve the secret Called Check before revealing it.");
  if (request.revealedAt !== null) {
    if (request.revealedVisibility === visibility) return;
    throw new Error("A revealed Called Check cannot change its audited reveal visibility.");
  }
  await tx.update(campaignSessionCalledCheckRequest).set({
    revealedVisibility: visibility,
    revealedByUserId: actorUserId,
    revealedAt: new Date(),
  }).where(eq(campaignSessionCalledCheckRequest.id, request.id));
  await insertCalledEvent(tx, request, actorUserId, request.status, request.status, "revealed", "", { visibility });
}

export async function issueHighLowInTransaction(
  tx: CalledCheckTransaction,
  actorUserId: string,
  input: HighLowIssueInput,
): Promise<number> {
  const context = await loadGodSession(tx, input.sessionId, actorUserId, true);
  const sceneId = optionalPositiveId(input.sceneId, "Scene");
  const encounterId = optionalPositiveId(input.encounterId, "Encounter");
  await assertActiveContext(tx, context, sceneId, encounterId);
  const idempotencyKey = requiredText(input.idempotencyKey, "Issue idempotency key", 200);
  const [existing] = await tx.select({ id: campaignSessionHighLowRequest.id }).from(campaignSessionHighLowRequest).where(and(
    eq(campaignSessionHighLowRequest.campaignId, context.campaignId),
    eq(campaignSessionHighLowRequest.createdByUserId, actorUserId),
    eq(campaignSessionHighLowRequest.issueIdempotencyKey, idempotencyKey),
  )).limit(1);
  if (existing) return existing.id;
  const mode = enumValue(["neutral", "player-calls-rolls", "player-calls-god-rolls"] as const, input.mode, "High/Low mode");
  const visibility = enumValue(["table", "private", "god-only"] as const, input.visibility, "Visibility");
  const rollMethod = enumValue(["random", "entered"] as const, input.rollMethod, "Roll method");
  let participantCharacterId: number | null = null;
  if (mode !== "neutral") {
    participantCharacterId = positiveId(input.participantCharacterId, "High/Low Player Character");
    const [recipient] = await sessionRecipients(tx, context, "one", [participantCharacterId]);
    if (!recipient || recipient.isNpc) throw new Error("Player-called High/Low requires an exact assigned Player Character on the Session roster.");
    if (visibility === "god-only") throw new Error("A Player-called High/Low request cannot be secret from its caller.");
  } else if (visibility === "private") {
    throw new Error("Neutral High/Low without a Character may be table-visible or G.O.D.-only, not private.");
  }
  const [created] = await tx.insert(campaignSessionHighLowRequest).values({
    campaignId: context.campaignId,
    sessionId: context.id,
    sceneId,
    encounterId,
    mode,
    participantCharacterId,
    visibility,
    rollMethod,
    purpose: requiredText(input.purpose, "High/Low purpose", 500),
    issueIdempotencyKey: idempotencyKey,
    createdByUserId: actorUserId,
  }).returning({ id: campaignSessionHighLowRequest.id });
  if (!created) throw new Error("The High/Low request could not be created.");
  await insertHighLowEvent(tx, { ...created, campaignId: context.campaignId, sessionId: context.id }, actorUserId, null, "pending", "issued");
  return created.id;
}

async function lockHighLowRequest(tx: CalledCheckTransaction, requestId: number) {
  const [request] = await tx.select().from(campaignSessionHighLowRequest)
    .where(eq(campaignSessionHighLowRequest.id, positiveId(requestId, "High/Low request")))
    .limit(1).for("update");
  if (!request) throw new Error("That High/Low request does not exist.");
  return request;
}

export async function callHighLowInTransaction(
  tx: CalledCheckTransaction,
  actorUserId: string,
  characterId: number,
  input: { requestId: number; side: HighLowSide; idempotencyKey: string },
): Promise<void> {
  const request = await lockHighLowRequest(tx, input.requestId);
  const character = await assertPlayerCharacter(tx, characterId, actorUserId);
  if (request.participantCharacterId !== character.characterId || request.campaignId !== character.campaignId || request.mode === "neutral") {
    throw new Error("A Player may call High/Low only for their own assigned request.");
  }
  const idempotencyKey = requiredText(input.idempotencyKey, "Call idempotency key", 200);
  const side = enumValue(["low", "high"] as const, input.side, "High/Low call");
  if (request.callIdempotencyKey === idempotencyKey && request.calledSide === side) return;
  if (request.status !== "pending" || request.calledSide !== null || request.rollId !== null) throw new Error("This High/Low call is already locked or closed.");
  await tx.update(campaignSessionHighLowRequest).set({ calledSide: side, callerUserId: actorUserId, callIdempotencyKey: idempotencyKey, calledAt: new Date() })
    .where(eq(campaignSessionHighLowRequest.id, request.id));
  await insertHighLowEvent(tx, request, actorUserId, "pending", "pending", "call-locked", "", { calledSide: side });
}

export async function answerHighLowInTransaction(
  tx: CalledCheckTransaction,
  actor: { kind: "god" | "player"; userId: string; characterId?: number | null },
  input: { requestId: number; enteredTotal?: number | null; idempotencyKey: string },
  randomSource?: RollRandomSource,
): Promise<number> {
  const request = await lockHighLowRequest(tx, input.requestId);
  const idempotencyKey = requiredText(input.idempotencyKey, "Response idempotency key", 200);
  if (request.responseIdempotencyKey === idempotencyKey && request.rollId !== null) return request.rollId;
  if (request.status !== "pending" || request.rollId !== null) throw new Error("This High/Low request no longer has an open Roll slot.");
  if (request.mode !== "neutral" && request.calledSide === null) throw new Error("The Player must lock High or Low before the Roll.");
  if (actor.kind === "god") {
    await loadGodSession(tx, request.sessionId, actor.userId, false);
    if (request.mode === "player-calls-rolls") throw new Error("This High/Low Roll belongs to the assigned Player.");
  } else {
    const characterId = positiveId(actor.characterId, "Character");
    const character = await assertPlayerCharacter(tx, characterId, actor.userId);
    if (request.mode !== "player-calls-rolls" || request.participantCharacterId !== character.characterId || request.campaignId !== character.campaignId) {
      throw new Error("A Player may roll only their own player-called/player-rolled High/Low request.");
    }
  }
  const ledger = await recordRollInTransaction(tx, rollActor(
    actor.userId,
    request.campaignId,
    actor.kind === "god" ? "god-owner" : "player",
    actor.kind === "player" ? request.participantCharacterId : null,
  ), {
    sessionId: request.sessionId,
    sceneId: request.sceneId,
    encounterId: request.encounterId,
    rollerCharacterId: request.participantCharacterId,
    method: request.rollMethod,
    visibility: request.visibility,
    purposeKind: "other",
    enteredTotal: input.enteredTotal,
    label: `High/Low: ${request.purpose}`,
    notes: request.mode,
  }, randomSource);
  const result = resolveHighLow(ledger.resultTotal, request.calledSide);
  const status: CalledCheckStatus = result.requiresGodRuling ? "requires-god-ruling" : "resolved";
  const now = new Date();
  const [updated] = await tx.update(campaignSessionHighLowRequest).set({
    status,
    rollId: ledger.id,
    resultSnapshotJson: result,
    responseIdempotencyKey: idempotencyKey,
    respondedAt: now,
    resolvedAt: status === "resolved" ? now : null,
  }).where(and(eq(campaignSessionHighLowRequest.id, request.id), eq(campaignSessionHighLowRequest.status, "pending")))
    .returning({ id: campaignSessionHighLowRequest.id });
  if (!updated) throw new Error("This High/Low request was answered concurrently.");
  await insertHighLowEvent(tx, request, actor.userId, "pending", status, "answered", "", { rollId: ledger.id, rolledSide: result.rolledSide });
  return ledger.id;
}

export async function cancelHighLowInTransaction(tx: CalledCheckTransaction, actorUserId: string, requestId: number, reason: string): Promise<void> {
  const request = await lockHighLowRequest(tx, requestId);
  await loadGodSession(tx, request.sessionId, actorUserId, false);
  const normalizedReason = requiredText(reason, "Cancellation reason", 500);
  if (request.status === "cancelled" && request.cancellationReason === normalizedReason) return;
  if (request.status !== "pending") throw new Error("Only a pending High/Low request may be cancelled.");
  await tx.update(campaignSessionHighLowRequest).set({ status: "cancelled", cancellationReason: normalizedReason, cancelledAt: new Date() })
    .where(eq(campaignSessionHighLowRequest.id, request.id));
  await insertHighLowEvent(tx, request, actorUserId, "pending", "cancelled", "cancelled", normalizedReason);
}

export async function rerollHighLowInTransaction(tx: CalledCheckTransaction, actorUserId: string, requestId: number, reason: string): Promise<number> {
  const request = await lockHighLowRequest(tx, requestId);
  await loadGodSession(tx, request.sessionId, actorUserId, false);
  const normalizedReason = requiredText(reason, "Reroll reason", 500);
  const [existing] = await tx.select({ id: campaignSessionHighLowRequest.id }).from(campaignSessionHighLowRequest)
    .where(eq(campaignSessionHighLowRequest.parentRequestId, request.id)).limit(1);
  if (existing) return existing.id;
  if (request.status !== "resolved" && request.status !== "requires-god-ruling") {
    throw new Error("This High/Low attempt cannot be rerolled in its current state.");
  }
  const [created] = await tx.insert(campaignSessionHighLowRequest).values({
    campaignId: request.campaignId,
    sessionId: request.sessionId,
    sceneId: request.sceneId,
    encounterId: request.encounterId,
    mode: request.mode,
    participantCharacterId: request.participantCharacterId,
    visibility: request.visibility,
    rollMethod: request.rollMethod,
    purpose: request.purpose,
    status: "pending",
    calledSide: request.calledSide,
    callerUserId: request.callerUserId,
    parentRequestId: request.id,
    issueIdempotencyKey: `reroll:${request.id}`,
    callIdempotencyKey: request.callIdempotencyKey === null ? null : `reroll:${request.id}:locked-call`,
    rerollReason: normalizedReason,
    createdByUserId: actorUserId,
    calledAt: request.calledAt,
  }).returning({ id: campaignSessionHighLowRequest.id });
  if (!created) throw new Error("The linked High/Low reroll could not be created.");
  await tx.update(campaignSessionHighLowRequest).set({ status: "superseded" }).where(eq(campaignSessionHighLowRequest.id, request.id));
  await insertHighLowEvent(tx, request, actorUserId, request.status, "superseded", "reroll-ordered", normalizedReason, { successorRequestId: created.id });
  await insertHighLowEvent(tx, { ...created, campaignId: request.campaignId, sessionId: request.sessionId }, actorUserId, null, "pending", "reroll-created", normalizedReason, { parentRequestId: request.id });
  return created.id;
}

export async function ruleHighLowInTransaction(tx: CalledCheckTransaction, actorUserId: string, requestId: number, rulingText: string): Promise<void> {
  const request = await lockHighLowRequest(tx, requestId);
  await loadGodSession(tx, request.sessionId, actorUserId, false);
  const ruling = requiredText(rulingText, "G.O.D. ruling", 2000);
  if (request.status !== "requires-god-ruling") throw new Error("This High/Low result is not awaiting a G.O.D. ruling.");
  await tx.update(campaignSessionHighLowRequest).set({ status: "resolved", rulingText: ruling, resolvedAt: new Date() })
    .where(eq(campaignSessionHighLowRequest.id, request.id));
  await insertHighLowEvent(tx, request, actorUserId, "requires-god-ruling", "resolved", "god-ruling", ruling);
}

async function readCalledCheckData(
  tx: CalledCheckTransaction,
  session: CalledCheckWorkspaceView["session"],
): Promise<Pick<CalledCheckWorkspaceView, "batches" | "highLow">> {
  const batches = await tx.select().from(campaignSessionCalledCheckBatch).where(and(
    eq(campaignSessionCalledCheckBatch.sessionId, session.id),
    eq(campaignSessionCalledCheckBatch.campaignId, session.campaignId),
  )).orderBy(desc(campaignSessionCalledCheckBatch.id));
  const requests = await tx.select({
    request: campaignSessionCalledCheckRequest,
    recipientName: campaignCharacter.name,
  }).from(campaignSessionCalledCheckRequest)
    .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionCalledCheckRequest.recipientCharacterId))
    .where(and(
      eq(campaignSessionCalledCheckRequest.sessionId, session.id),
      eq(campaignSessionCalledCheckRequest.campaignId, session.campaignId),
    )).orderBy(asc(campaignSessionCalledCheckRequest.id));
  const calledEvents = await tx.select().from(campaignSessionCalledCheckEvent).where(and(
    eq(campaignSessionCalledCheckEvent.sessionId, session.id),
    eq(campaignSessionCalledCheckEvent.campaignId, session.campaignId),
  )).orderBy(asc(campaignSessionCalledCheckEvent.id));
  const highLowRows = await tx.select({
    request: campaignSessionHighLowRequest,
    participantName: campaignCharacter.name,
  }).from(campaignSessionHighLowRequest)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionHighLowRequest.participantCharacterId))
    .where(and(
      eq(campaignSessionHighLowRequest.sessionId, session.id),
      eq(campaignSessionHighLowRequest.campaignId, session.campaignId),
    )).orderBy(desc(campaignSessionHighLowRequest.id));
  const highLowEvents = await tx.select().from(campaignSessionHighLowEvent).where(and(
    eq(campaignSessionHighLowEvent.sessionId, session.id),
    eq(campaignSessionHighLowEvent.campaignId, session.campaignId),
  )).orderBy(asc(campaignSessionHighLowEvent.id));
  const eventView = (event: typeof calledEvents[number]): CalledCheckEventView => ({
    id: event.id,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    eventKind: event.eventKind,
    reason: event.reason,
    actorUserId: event.actorUserId,
    createdAt: event.createdAt.toISOString(),
  });
  const requestViews = requests.map(({ request, recipientName }): CalledCheckRequestView => {
    const governingSource = request.governingSnapshotJson === null ? null : parseRollGoverningSourceSnapshot(request.governingSnapshotJson);
    return {
      id: request.id,
      batchId: request.batchId,
      recipientCharacterId: request.recipientCharacterId,
      recipientName,
      recipientKind: request.recipientKind as "pc" | "npc",
      status: request.status,
      governingSource,
      sourceLabel: sourceLabel(governingSource),
      originalTarget: request.originalTarget,
      finalTarget: request.finalTarget,
      modifiers: asModifiers(request.modifiersJson),
      resolution: request.resolutionJson as PercentileResolution | null,
      rollId: request.rollId,
      parentRequestId: request.parentRequestId,
      cancellationReason: request.cancellationReason,
      rerollReason: request.rerollReason,
      rulingText: request.rulingText,
      revealedVisibility: request.revealedVisibility,
      issuedAt: request.issuedAt.toISOString(),
      respondedAt: date(request.respondedAt),
      resolvedAt: date(request.resolvedAt),
      cancelledAt: date(request.cancelledAt),
      events: calledEvents.filter(({ requestId }) => requestId === request.id).map(eventView),
    };
  });
  const batchViews = batches.map((batch): CalledCheckBatchView => {
    const batchRequests = requestViews.filter(({ batchId }) => batchId === batch.id);
    const parentIds = new Set(batchRequests.flatMap(({ parentRequestId }) => parentRequestId === null ? [] : [parentRequestId]));
    const currentAttempts = batchRequests.filter(({ id }) => !parentIds.has(id));
    const selectedSkillPath = batch.selectedSkillPathJson as number[] | null;
    return {
      id: batch.id,
      sessionId: batch.sessionId,
      sceneId: batch.sceneId,
      encounterId: batch.encounterId,
      sourceKind: batch.sourceKind,
      attributeKey: batch.attributeKey,
      endpointSkillId: batch.endpointSkillId,
      selectedSkillPath,
      sourceLabel: batch.sourceKind === "attribute"
        ? `${batch.attributeKey} Attribute`
        : requestViews.find(({ batchId }) => batchId === batch.id)?.governingSource?.kind === "skill"
          ? requestViews.find(({ batchId }) => batchId === batch.id)!.governingSource!.kind === "skill"
            ? (requestViews.find(({ batchId }) => batchId === batch.id)!.governingSource as Extract<RollGoverningSourceSnapshot, { kind: "skill" }>).skillPath.map(({ skillName }) => skillName).join(" -> ")
            : `Skill #${batch.endpointSkillId}`
          : `Skill #${batch.endpointSkillId}`,
      purpose: batch.purpose,
      instructions: batch.instructions,
      recipientScope: batch.recipientScope as CalledCheckBatchView["recipientScope"],
      visibility: batch.visibility,
      rollMethod: batch.rollMethod,
      createdAt: batch.createdAt.toISOString(),
      requests: batchRequests,
      summary: summarizeCalledCheckBatch(currentAttempts.map(({ status }) => status)),
    };
  });
  const highLow = highLowRows.map(({ request, participantName }): HighLowRequestView => ({
    id: request.id,
    mode: request.mode,
    participantCharacterId: request.participantCharacterId,
    participantName,
    visibility: request.visibility,
    rollMethod: request.rollMethod,
    purpose: request.purpose,
    status: request.status,
    calledSide: request.calledSide,
    rollId: request.rollId,
    result: request.resultSnapshotJson as HighLowResolution | null,
    parentRequestId: request.parentRequestId,
    cancellationReason: request.cancellationReason,
    rerollReason: request.rerollReason,
    rulingText: request.rulingText,
    calledAt: date(request.calledAt),
    respondedAt: date(request.respondedAt),
    resolvedAt: date(request.resolvedAt),
    cancelledAt: date(request.cancelledAt),
    createdAt: request.createdAt.toISOString(),
    events: highLowEvents.filter(({ requestId }) => requestId === request.id).map(eventView),
  }));
  return { batches: batchViews, highLow };
}

export async function readGodCalledCheckWorkspaceInTransaction(
  tx: CalledCheckTransaction,
  sessionId: number,
  actorUserId: string,
): Promise<CalledCheckWorkspaceView> {
  const context = await loadGodSession(tx, sessionId, actorUserId, false);
  const recipients = await tx.select({
    characterId: campaignCharacter.id,
    name: campaignCharacter.name,
    playerUserId: campaignCharacter.playerUserId,
    isNpc: campaignCharacter.isNpc,
  }).from(campaignSessionRoster)
    .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionRoster.characterId))
    .where(and(eq(campaignSessionRoster.sessionId, context.id), eq(campaignSessionRoster.campaignId, context.campaignId)))
    .orderBy(asc(campaignSessionRoster.sortOrder), asc(campaignCharacter.id));
  const [skills, relationships] = await Promise.all([
    tx.select({
      id: skill.id,
      name: skill.name,
      classification: skill.classification,
      tier: skill.tier,
      primaryAttribute: skill.primaryAttribute,
      secondaryAttribute: skill.secondaryAttribute,
      definition: skill.definition,
    }).from(skill).orderBy(asc(skill.name), asc(skill.id)),
    tx.select({
      skillId: skillRelationship.skillId,
      relatedSkillId: skillRelationship.relatedSkillId,
      relationshipType: skillRelationship.relationshipType,
      sortOrder: skillRelationship.sortOrder,
    }).from(skillRelationship).orderBy(asc(skillRelationship.id)),
  ]);
  const catalog = skills.map((entry) => ({ ...entry, spellLevel: null, manaCost: null, spellDocumentJson: null }));
  const skillPaths = catalog.flatMap((entry) => getCalledCheckSkillPathAlternatives(entry.id, catalog, relationships).map((path) => ({
    endpointSkillId: entry.id,
    endpointName: entry.name,
    rootToEndpointSkillIds: path.rootToEndpoint.map(({ id }) => id),
    pathLabel: path.rootToEndpoint.map(({ name, id }) => `${name} (#${id})`).join(" -> "),
    valid: path.valid,
    problem: path.problems.map(({ message }) => message).join(" "),
  })));
  return {
    session: { id: context.id, campaignId: context.campaignId, title: context.title, status: context.status },
    recipients: recipients.map(({ isNpc, ...recipient }) => ({ ...recipient, kind: isNpc ? "npc" : "pc" })),
    skillPaths,
    ...await readCalledCheckData(tx, context),
  };
}

function projectPlayerCalledCheckWorkspace(
  characterId: number,
  session: PlayerCalledCheckWorkspaceView["session"],
  data: Awaited<ReturnType<typeof readCalledCheckData>>,
): PlayerCalledCheckWorkspaceView {
  const character = { characterId };
  const calledChecks = data.batches.flatMap((batch) => batch.requests.flatMap((request) => {
    const visible = batch.visibility === "table"
      || batch.visibility === "private" && request.recipientCharacterId === character.characterId
      || batch.visibility === "god-only" && (
        request.revealedVisibility === "table"
        || request.revealedVisibility === "private" && request.recipientCharacterId === character.characterId
      );
    if (!visible) return [];
    return [{
      ...request,
      events: [],
      purpose: batch.purpose,
      instructions: batch.instructions,
      visibility: request.revealedVisibility ?? batch.visibility,
      rollMethod: batch.rollMethod,
      sourceLabel: request.sourceLabel,
    }];
  }));
  const highLow = data.highLow.filter((request) => request.visibility === "table"
    || request.visibility === "private" && request.participantCharacterId === character.characterId)
    .map((request) => ({ ...request, events: [] }));
  return { characterId, session, calledChecks, highLow };
}

export async function readPlayerCalledCheckSessionWorkspaceInTransaction(
  tx: CalledCheckTransaction,
  sessionId: number,
  characterId: number,
  actorUserId: string,
): Promise<PlayerCalledCheckWorkspaceView | null> {
  const character = await assertPlayerCharacter(tx, characterId, actorUserId);
  const [session] = await tx.select({
    id: campaignSession.id,
    campaignId: campaignSession.campaignId,
    title: campaignSession.title,
    status: campaignSession.status,
  }).from(campaignSessionRoster)
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionRoster.sessionId),
      eq(campaignSession.campaignId, campaignSessionRoster.campaignId),
    ))
    .where(and(
      eq(campaignSessionRoster.characterId, character.characterId),
      eq(campaignSessionRoster.campaignId, character.campaignId),
      eq(campaignSession.id, positiveId(sessionId, "Called Check Session")),
      inArray(campaignSession.status, ["active", "completed"]),
    )).limit(1);
  if (!session) return null;
  return projectPlayerCalledCheckWorkspace(
    character.characterId,
    session,
    await readCalledCheckData(tx, session),
  );
}

export async function readPlayerCalledCheckWorkspaceInTransaction(
  tx: CalledCheckTransaction,
  characterId: number,
  actorUserId: string,
): Promise<PlayerCalledCheckWorkspaceView | null> {
  const character = await assertPlayerCharacter(tx, characterId, actorUserId);
  const [active] = await tx.select({ id: campaignSession.id }).from(campaignSessionRoster)
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionRoster.sessionId),
      eq(campaignSession.campaignId, campaignSessionRoster.campaignId),
    ))
    .where(and(
      eq(campaignSessionRoster.characterId, character.characterId),
      eq(campaignSessionRoster.campaignId, character.campaignId),
      eq(campaignSession.status, "active"),
    )).limit(1);
  if (!active) return null;
  return readPlayerCalledCheckSessionWorkspaceInTransaction(
    tx,
    active.id,
    character.characterId,
    actorUserId,
  );
}

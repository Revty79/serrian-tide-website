import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterItem,
  campaignCharacterItemInstance,
  campaignCharacterSkillAllocation,
  campaignCharacterSpellDocument,
} from "@/db/realm-schema";
import { loadCharacterDerivedAbilitiesInTransaction } from "@/features/derived-abilities/character-derived-ability-service";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionPlayerRulingRequest,
  campaignSessionPlayerRulingRequestEvent,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
  type CampaignSessionPlayerRulingRequestStatus,
  type CampaignSessionPlayerRulingRequestType,
} from "@/db/tabletop-operations-schema";

import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";

export type PlayerCombatRulingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PlayerCombatRulingRequestView = Readonly<{
  id: number;
  requestType: CampaignSessionPlayerRulingRequestType;
  characterId: number;
  characterName: string;
  targetParticipantId: number | null;
  targetName: string | null;
  sourceKind: string;
  sourceRef: string;
  sourceInstanceId: number | null;
  intent: string;
  requestedTiming: string;
  blockedReason: string;
  frozenRequest: Record<string, unknown>;
  status: CampaignSessionPlayerRulingRequestStatus;
  godResponse: string;
  ruling: Record<string, unknown>;
  linkedDeclarationId: number | null;
  linkedReactionId: number | null;
  linkedFirearmAttackId: number | null;
  createdAt: string;
  resolvedAt: string | null;
  events: readonly Readonly<{
    id: number;
    fromStatus: CampaignSessionPlayerRulingRequestStatus | null;
    toStatus: CampaignSessionPlayerRulingRequestStatus;
    eventKind: string;
    reason: string;
    metadata: Record<string, unknown>;
    actorKind: "player" | "god";
    createdAt: string;
  }>[];
}>;

export type CreatePlayerCombatRulingRequest = Readonly<{
  requestType: CampaignSessionPlayerRulingRequestType;
  targetParticipantId?: number | null;
  sourceKind: string;
  sourceRef?: string;
  sourceInstanceId?: number | null;
  intent: string;
  requestedTiming?: string;
  blockedReason: string;
  frozenRequest: Record<string, unknown>;
  idempotencyKey: string;
}>;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function participantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value: unknown, label: string, maximum: number, required = true): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return structuredClone(value as Record<string, unknown>);
}

export async function lockPlayerCombatContextInTransaction(
  tx: PlayerCombatRulingTransaction,
  encounterIdInput: number,
  characterIdInput: number,
  playerUserId: string,
): Promise<OwnedEncounterRuntimeContext> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const characterId = positiveId(characterIdInput, "Player Character");
  const [context] = await tx.select({
    encounterId: campaignSessionEncounter.id,
    sceneId: campaignSessionEncounter.sceneId,
    sessionId: campaignSessionEncounter.sessionId,
    campaignId: campaignSessionEncounter.campaignId,
    encounterStatus: campaignSessionEncounter.status,
    sceneStatus: campaignSessionScene.status,
    sessionStatus: campaignSession.status,
    ownerUserId: campaign.createdByUserId,
  }).from(campaignSessionEncounter)
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
    .innerJoin(campaignCharacter, and(
      eq(campaignCharacter.id, characterId),
      eq(campaignCharacter.campaignId, campaignSessionEncounter.campaignId),
      eq(campaignCharacter.playerUserId, playerUserId),
      eq(campaignCharacter.isNpc, false),
    ))
    .innerJoin(campaignSessionRoster, and(
      eq(campaignSessionRoster.sessionId, campaignSessionEncounter.sessionId),
      eq(campaignSessionRoster.campaignId, campaignSessionEncounter.campaignId),
      eq(campaignSessionRoster.characterId, characterId),
    ))
    .innerJoin(campaignSessionSceneMember, and(
      eq(campaignSessionSceneMember.sceneId, campaignSessionEncounter.sceneId),
      eq(campaignSessionSceneMember.sessionId, campaignSessionEncounter.sessionId),
      eq(campaignSessionSceneMember.campaignId, campaignSessionEncounter.campaignId),
      eq(campaignSessionSceneMember.characterId, characterId),
    ))
    .innerJoin(campaignSessionEncounterParticipant, and(
      eq(campaignSessionEncounterParticipant.encounterId, campaignSessionEncounter.id),
      eq(campaignSessionEncounterParticipant.sceneId, campaignSessionEncounter.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, campaignSessionEncounter.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, campaignSessionEncounter.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, characterId),
      eq(campaignSessionEncounterParticipant.participantKind, "campaign-character"),
    ))
    .innerJoin(campaignSessionEncounterInitiativeParticipant, and(
      eq(campaignSessionEncounterInitiativeParticipant.encounterId, campaignSessionEncounter.id),
      eq(campaignSessionEncounterInitiativeParticipant.characterId, characterId),
    ))
    .where(eq(campaignSessionEncounter.id, encounterId))
    .limit(1)
    .for("update", { of: campaignSessionEncounter });
  if (!context) throw new Error("The assigned Player Character is not an exact active Initiative participant in this Encounter.");
  return context;
}

async function assertTarget(
  tx: PlayerCombatRulingTransaction,
  context: OwnedEncounterRuntimeContext,
  targetParticipantId: number | null,
): Promise<void> {
  if (targetParticipantId === null) return;
  const key = participantKey(targetParticipantId, "Target Encounter Participant");
  const [target] = await tx.select({ id: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, key),
    )).limit(1);
  if (!target) throw new Error("The requested target is not an exact participant in this Encounter.");
}

function refId(sourceRef: string, prefix: string, label: string): number {
  if (!sourceRef.startsWith(prefix)) throw new Error(`${label} identity is invalid.`);
  return positiveId(Number(sourceRef.slice(prefix.length)), label);
}

async function assertRequestedSource(
  tx: PlayerCombatRulingTransaction,
  player: { userId: string; characterId: number },
  input: CreatePlayerCombatRulingRequest,
): Promise<void> {
  const sourceRef = input.sourceRef?.trim() ?? "";
  const sourceKind = input.sourceKind.trim();
  if ((input.requestType === "called-shot" || input.requestType === "firearm-preparation") && sourceKind !== "weapon") {
    throw new Error("A firearm ruling request must reference an exact owned weapon source.");
  }
  if ((input.requestType === "called-shot" || input.requestType === "firearm-preparation") && input.sourceInstanceId == null) {
    throw new Error("This firearm request requires an exact owned Item instance.");
  }
  if (input.sourceInstanceId !== undefined && input.sourceInstanceId !== null) {
    const instanceId = positiveId(input.sourceInstanceId, "Requested source instance");
    if (!(["item", "weapon"] as const).includes(sourceKind as "item" | "weapon") || sourceRef !== `instance:${instanceId}`) {
      throw new Error("The requested exact Item source identity is invalid.");
    }
    const [ownedInstance] = await tx.select({ id: campaignCharacterItemInstance.id })
      .from(campaignCharacterItemInstance)
      .where(and(
        eq(campaignCharacterItemInstance.id, instanceId),
        eq(campaignCharacterItemInstance.characterId, player.characterId),
      )).limit(1);
    if (!ownedInstance) throw new Error("The requested exact Item instance is not owned by this Player Character.");
  }
  if ((sourceKind === "item" || sourceKind === "weapon") && input.sourceInstanceId == null) {
    const itemId = refId(sourceRef, "stack:", "Requested Item stack");
    const [ownedStack] = await tx.select({ itemId: campaignCharacterItem.itemId }).from(campaignCharacterItem).where(and(
      eq(campaignCharacterItem.characterId, player.characterId),
      eq(campaignCharacterItem.itemId, itemId),
    )).limit(1);
    if (!ownedStack) throw new Error("The requested Item stack is not owned by this Player Character.");
  }
  if (sourceKind === "spell") {
    if (sourceRef.startsWith("catalog:")) {
      const allocationId = refId(sourceRef, "catalog:", "Catalog Spell allocation");
      const [allocation] = await tx.select({ id: campaignCharacterSkillAllocation.id }).from(campaignCharacterSkillAllocation).where(and(
        eq(campaignCharacterSkillAllocation.id, allocationId),
        eq(campaignCharacterSkillAllocation.characterId, player.characterId),
      )).limit(1);
      if (!allocation) throw new Error("The requested Catalog Spell allocation is not owned by this Player Character.");
    } else if (sourceRef.startsWith("personal:")) {
      const spellId = refId(sourceRef, "personal:", "Personal Spell");
      const [spell] = await tx.select({ id: campaignCharacterSpellDocument.id }).from(campaignCharacterSpellDocument).where(and(
        eq(campaignCharacterSpellDocument.id, spellId),
        eq(campaignCharacterSpellDocument.characterId, player.characterId),
      )).limit(1);
      if (!spell) throw new Error("The requested personal Spell is not owned by this Player Character.");
    } else {
      throw new Error("The requested Spell source identity is invalid.");
    }
  } else if (sourceKind === "derived-ability") {
    const abilityId = refId(sourceRef, "derived-ability:", "Derived Ability");
    const state = await loadCharacterDerivedAbilitiesInTransaction(tx, player.characterId, player.userId, false);
    const status = state.resolution.statuses.find(({ abilityId: id }) => id === abilityId);
    if (!status?.possessed || !status.available) throw new Error("The requested Derived Ability is not possessed and currently available.");
  } else if (sourceKind === "skill") {
    const allocationId = refId(sourceRef, "allocation:", "Skill allocation");
    const [allocation] = await tx.select({ id: campaignCharacterSkillAllocation.id }).from(campaignCharacterSkillAllocation).where(and(
      eq(campaignCharacterSkillAllocation.id, allocationId),
      eq(campaignCharacterSkillAllocation.characterId, player.characterId),
    )).limit(1);
    if (!allocation) throw new Error("The requested exact Skill allocation is not owned by this Player Character.");
  } else if (sourceKind === "attribute") {
    if (!/^attribute:(STR|DEX|CON|INT|WIS|CHR)$/.test(sourceRef)) throw new Error("The requested Attribute source identity is invalid.");
  } else if (sourceKind === "manual") {
    if (sourceRef !== "player-stated-intent") throw new Error("The requested manual source identity is invalid.");
  } else if (sourceKind !== "item" && sourceKind !== "weapon") {
    throw new Error("The requested combat source kind is unsupported.");
  }
}

async function event(
  tx: PlayerCombatRulingTransaction,
  row: { id: number; encounterId: number; sceneId: number; sessionId: number; campaignId: number },
  fromStatus: CampaignSessionPlayerRulingRequestStatus | null,
  toStatus: CampaignSessionPlayerRulingRequestStatus,
  eventKind: string,
  actorUserId: string,
  reason = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(campaignSessionPlayerRulingRequestEvent).values({
    requestId: row.id,
    encounterId: row.encounterId,
    sceneId: row.sceneId,
    sessionId: row.sessionId,
    campaignId: row.campaignId,
    fromStatus,
    toStatus,
    eventKind: text(eventKind, "Ruling event kind", 160),
    reason: text(reason, "Ruling event reason", 2000, false),
    metadataJson: object(metadata, "Ruling event metadata"),
    actorUserId,
  });
}

export async function createPlayerCombatRulingRequestInTransaction(
  tx: PlayerCombatRulingTransaction,
  context: OwnedEncounterRuntimeContext,
  player: { userId: string; characterId: number },
  input: CreatePlayerCombatRulingRequest,
): Promise<{ requestId: number; reused: boolean }> {
  if (context.sessionStatus !== "active" || context.sceneStatus !== "active" || context.encounterStatus !== "active") {
    throw new Error("Combat ruling requests require an active Session, Scene, and Encounter.");
  }
  if (input.requestType === "called-shot" && input.targetParticipantId == null) {
    throw new Error("A Called Shot request requires an exact Encounter target.");
  }
  await lockPlayerCombatContextInTransaction(tx, context.encounterId, player.characterId, player.userId);
  const key = text(input.idempotencyKey, "Request identity", 200);
  if (!/^[a-f0-9]{32}$/.test(key)) throw new Error("Request identity must be a 16-byte lowercase hexadecimal value.");
  await assertTarget(tx, context, input.targetParticipantId ?? null);
  await assertRequestedSource(tx, player, input);
  const [existing] = await tx.select().from(campaignSessionPlayerRulingRequest).where(and(
    eq(campaignSessionPlayerRulingRequest.campaignId, context.campaignId),
    eq(campaignSessionPlayerRulingRequest.requestedByUserId, player.userId),
    eq(campaignSessionPlayerRulingRequest.idempotencyKey, key),
  )).limit(1);
  if (existing) {
    if (existing.characterId !== player.characterId
      || existing.encounterId !== context.encounterId
      || existing.requestType !== input.requestType
      || existing.targetParticipantId !== (input.targetParticipantId ?? null)
      || existing.sourceKind !== input.sourceKind.trim()
      || existing.sourceRef !== (input.sourceRef ?? "").trim()
      || existing.sourceInstanceId !== (input.sourceInstanceId ?? null)) {
      throw new Error("That request identity was already used for a different combat ruling request.");
    }
    return { requestId: existing.id, reused: true };
  }
  const [created] = await tx.insert(campaignSessionPlayerRulingRequest).values({
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    characterId: player.characterId,
    targetParticipantId: input.targetParticipantId ?? null,
    requestType: input.requestType,
    sourceKind: text(input.sourceKind, "Requested source kind", 120),
    sourceRef: text(input.sourceRef ?? "", "Requested source identity", 400, false),
    sourceInstanceId: input.sourceInstanceId ?? null,
    intent: text(input.intent, "Player intent", 2000),
    requestedTiming: text(input.requestedTiming ?? "", "Requested timing", 500, false),
    blockedReason: text(input.blockedReason, "Automation blocker", 2000),
    frozenRequestJson: object(input.frozenRequest, "Frozen request"),
    idempotencyKey: key,
    requestedByUserId: player.userId,
  }).returning();
  if (!created) throw new Error("The combat ruling request could not be persisted.");
  await event(tx, created, null, "pending", "player-request-created", player.userId, created.blockedReason, {
    requestType: created.requestType,
    sourceKind: created.sourceKind,
    targetParticipantId: created.targetParticipantId,
  });
  return { requestId: created.id, reused: false };
}

async function lockRequest(
  tx: PlayerCombatRulingTransaction,
  context: OwnedEncounterRuntimeContext,
  requestId: number,
) {
  const [request] = await tx.select().from(campaignSessionPlayerRulingRequest).where(and(
    eq(campaignSessionPlayerRulingRequest.id, positiveId(requestId, "Combat ruling request")),
    eq(campaignSessionPlayerRulingRequest.encounterId, context.encounterId),
    eq(campaignSessionPlayerRulingRequest.sceneId, context.sceneId),
    eq(campaignSessionPlayerRulingRequest.sessionId, context.sessionId),
    eq(campaignSessionPlayerRulingRequest.campaignId, context.campaignId),
  )).limit(1).for("update");
  if (!request) throw new Error("That combat ruling request does not belong to this Encounter.");
  return request;
}

export async function addPlayerCombatClarificationInTransaction(
  tx: PlayerCombatRulingTransaction,
  context: OwnedEncounterRuntimeContext,
  player: { userId: string; characterId: number },
  requestId: number,
  clarificationInput: string,
): Promise<void> {
  const request = await lockRequest(tx, context, requestId);
  if (request.characterId !== player.characterId || request.requestedByUserId !== player.userId) {
    throw new Error("A Player may clarify only their own Character's request.");
  }
  if (request.status !== "clarification-requested") throw new Error("This request is not awaiting Player clarification.");
  const clarification = text(clarificationInput, "Clarification", 2000);
  await tx.update(campaignSessionPlayerRulingRequest).set({ status: "pending", updatedAt: new Date() })
    .where(eq(campaignSessionPlayerRulingRequest.id, request.id));
  await event(tx, request, "clarification-requested", "pending", "player-clarification-added", player.userId, clarification, { clarification });
}

export async function cancelPlayerCombatRulingRequestInTransaction(
  tx: PlayerCombatRulingTransaction,
  context: OwnedEncounterRuntimeContext,
  player: { userId: string; characterId: number },
  requestId: number,
  reasonInput = "",
): Promise<void> {
  const request = await lockRequest(tx, context, requestId);
  if (request.characterId !== player.characterId || request.requestedByUserId !== player.userId) {
    throw new Error("A Player may cancel only their own Character's request.");
  }
  if (!["pending", "clarification-requested"].includes(request.status)) throw new Error("Only an open combat ruling request may be cancelled.");
  const reason = text(reasonInput, "Cancellation reason", 2000, false);
  await tx.update(campaignSessionPlayerRulingRequest).set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(campaignSessionPlayerRulingRequest.id, request.id));
  await event(tx, request, request.status, "cancelled", "player-request-cancelled", player.userId, reason);
}

export async function ruleOnPlayerCombatRequestInTransaction(
  tx: PlayerCombatRulingTransaction,
  context: OwnedEncounterRuntimeContext,
  godUserId: string,
  requestId: number,
  input: {
    status: "approved" | "rejected" | "clarification-requested";
    response: string;
    ruling?: Record<string, unknown>;
  },
): Promise<void> {
  if (godUserId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may rule on this request.");
  const request = await lockRequest(tx, context, requestId);
  if (!["pending", "clarification-requested"].includes(request.status)) throw new Error("Only an open combat ruling request may receive a ruling.");
  const response = text(input.response, "G.O.D. response", 2000);
  const ruling = object(input.ruling ?? {}, "G.O.D. ruling");
  const terminal = input.status === "approved" || input.status === "rejected";
  const now = new Date();
  await tx.update(campaignSessionPlayerRulingRequest).set({
    status: input.status,
    godResponse: response,
    rulingJson: ruling,
    resolvedByUserId: terminal ? godUserId : null,
    resolvedAt: terminal ? now : null,
    updatedAt: now,
  }).where(eq(campaignSessionPlayerRulingRequest.id, request.id));
  await event(tx, request, request.status, input.status, input.status === "clarification-requested"
    ? "god-clarification-requested"
    : input.status === "approved" ? "god-request-approved" : "god-request-rejected", godUserId, response, ruling);
}

export async function linkPlayerCombatRulingOutcomeInTransaction(
  tx: PlayerCombatRulingTransaction,
  context: OwnedEncounterRuntimeContext,
  godUserId: string,
  requestId: number,
  links: { declarationId?: number | null; reactionId?: number | null; firearmAttackId?: number | null },
): Promise<void> {
  if (godUserId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may link a ruling outcome.");
  const request = await lockRequest(tx, context, requestId);
  if (request.status !== "approved") throw new Error("Only an approved request may link an authoritative combat outcome.");
  await tx.update(campaignSessionPlayerRulingRequest).set({
    linkedDeclarationId: links.declarationId ?? request.linkedDeclarationId,
    linkedReactionId: links.reactionId ?? request.linkedReactionId,
    linkedFirearmAttackId: links.firearmAttackId ?? request.linkedFirearmAttackId,
    updatedAt: new Date(),
  }).where(eq(campaignSessionPlayerRulingRequest.id, request.id));
  await event(tx, request, "approved", "approved", "authoritative-outcome-linked", godUserId, "", links as Record<string, unknown>);
}

async function readRequests(
  tx: PlayerCombatRulingTransaction,
  where: ReturnType<typeof and>,
): Promise<PlayerCombatRulingRequestView[]> {
  const rows = await tx.select({
    request: campaignSessionPlayerRulingRequest,
    characterName: campaignCharacter.name,
  }).from(campaignSessionPlayerRulingRequest)
    .innerJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionPlayerRulingRequest.characterId))
    .where(where)
    .orderBy(desc(campaignSessionPlayerRulingRequest.createdAt), desc(campaignSessionPlayerRulingRequest.id))
    .limit(50);
  if (!rows.length) return [];
  const targetIds = [...new Set(rows.flatMap(({ request }) => request.targetParticipantId === null ? [] : [request.targetParticipantId]))];
  const targetRows = targetIds.length ? await tx.select({
    id: campaignSessionEncounterParticipant.characterId,
    label: campaignSessionEncounterParticipant.displayLabel,
    name: campaignCharacter.name,
    kind: campaignSessionEncounterParticipant.participantKind,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, rows[0]!.request.encounterId),
      inArray(campaignSessionEncounterParticipant.characterId, targetIds),
    )) : [];
  const targetNames = new Map(targetRows.map((target) => [target.id, target.kind === "creature" ? target.label : target.name ?? target.label]));
  const events = await tx.select().from(campaignSessionPlayerRulingRequestEvent)
    .where(inArray(campaignSessionPlayerRulingRequestEvent.requestId, rows.map(({ request }) => request.id)))
    .orderBy(asc(campaignSessionPlayerRulingRequestEvent.createdAt), asc(campaignSessionPlayerRulingRequestEvent.id));
  return rows.map(({ request, characterName }) => ({
    id: request.id,
    requestType: request.requestType,
    characterId: request.characterId,
    characterName,
    targetParticipantId: request.targetParticipantId,
    targetName: request.targetParticipantId === null ? null : targetNames.get(request.targetParticipantId) ?? "Encounter participant",
    sourceKind: request.sourceKind,
    sourceRef: request.sourceRef,
    sourceInstanceId: request.sourceInstanceId,
    intent: request.intent,
    requestedTiming: request.requestedTiming,
    blockedReason: request.blockedReason,
    frozenRequest: object(request.frozenRequestJson, "Stored frozen request"),
    status: request.status,
    godResponse: request.godResponse,
    ruling: object(request.rulingJson, "Stored ruling"),
    linkedDeclarationId: request.linkedDeclarationId,
    linkedReactionId: request.linkedReactionId,
    linkedFirearmAttackId: request.linkedFirearmAttackId,
    createdAt: request.createdAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    events: events.filter(({ requestId }) => requestId === request.id).map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      eventKind: entry.eventKind,
      reason: entry.reason,
      metadata: object(entry.metadataJson, "Stored ruling event metadata"),
      actorKind: entry.actorUserId === request.requestedByUserId ? "player" as const : "god" as const,
      createdAt: entry.createdAt.toISOString(),
    })),
  }));
}

export async function readPlayerCombatRulingRequestsInTransaction(
  tx: PlayerCombatRulingTransaction,
  encounterId: number,
  characterId: number,
  playerUserId: string,
): Promise<PlayerCombatRulingRequestView[]> {
  await lockPlayerCombatContextInTransaction(tx, encounterId, characterId, playerUserId);
  return readRequests(tx, and(
    eq(campaignSessionPlayerRulingRequest.encounterId, positiveId(encounterId, "Encounter")),
    eq(campaignSessionPlayerRulingRequest.characterId, positiveId(characterId, "Player Character")),
    eq(campaignSessionPlayerRulingRequest.requestedByUserId, playerUserId),
  ));
}

export function readGodCombatRulingRequestsInTransaction(
  tx: PlayerCombatRulingTransaction,
  encounterId: number,
): Promise<PlayerCombatRulingRequestView[]> {
  return readRequests(tx, and(
    eq(campaignSessionPlayerRulingRequest.encounterId, positiveId(encounterId, "Encounter")),
  ));
}

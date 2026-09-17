import "server-only";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import type { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { item, weaponFiringMode, weaponProfile } from "@/db/item-schema";
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
import { classifyWeaponRange, resolveWeaponRange, validateStructuredWeaponRange, type StructuredWeaponRange } from "@/features/items/weapon-range";

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

type WeaponDistanceRequestIdentity = Readonly<{
  sourceRef: string;
  sourceInstanceId: number | null;
  weaponItemId: number;
  weaponProfileId?: number | null;
  firingModeId: number | null;
  attackMode: "melee" | "ranged";
  targetParticipantId: number;
  distance: number;
  unit: string;
}>;

type WeaponDistanceApproval = WeaponDistanceRequestIdentity & Readonly<{
  kind: "weapon-distance";
  rangeProfile: StructuredWeaponRange;
  profileRevision: { itemUpdatedAt: string; weaponProfileUpdatedAt: string };
  band: string;
  adjustment: number;
  label: string;
  beyondLongModifier: number | null;
  beyondLongReason: string;
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

function finiteDistance(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
  return value;
}

function boundedUnit(value: unknown, label: string): string {
  return text(value, label, 80).toLocaleLowerCase("en-US");
}

function optionalPositiveId(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : positiveId(Number(value), label);
}

function rangeProfileFromFrozen(value: unknown): StructuredWeaponRange {
  const row = object(value, "Frozen Weapon range profile");
  const numberOrNull = (entry: unknown): number | null => entry === null || entry === undefined ? null : finiteDistance(entry, "Frozen range value");
  const mode = row.mode === "melee" || row.mode === "ranged" || row.mode === "hybrid" ? row.mode : null;
  return {
    mode,
    unit: typeof row.unit === "string" ? row.unit : null,
    reach: numberOrNull(row.reach),
    short: numberOrNull(row.short),
    medium: numberOrNull(row.medium),
    long: numberOrNull(row.long),
  };
}

function weaponDistanceApprovalFromRequest(request: { frozenRequestJson: unknown; rulingJson: unknown }, candidate: Record<string, unknown>): WeaponDistanceApproval {
  const frozen = object(request.frozenRequestJson, "Stored Weapon distance request");
  const profile = rangeProfileFromFrozen(frozen.rangeProfile);
  const sourceRef = text(frozen.sourceRef, "Frozen Weapon source", 400);
  const sourceInstanceId = optionalPositiveId(frozen.sourceInstanceId, "Frozen Weapon instance");
  const weaponItemId = positiveId(Number(frozen.weaponItemId), "Frozen Weapon Item");
  const weaponProfileId = positiveId(Number(frozen.weaponProfileId), "Frozen Weapon Profile");
  const firingModeId = optionalPositiveId(frozen.firingModeId, "Frozen Firing Mode");
  const attackMode = frozen.attackMode === "melee" || frozen.attackMode === "ranged" ? frozen.attackMode : (() => { throw new Error("Frozen Weapon attack mode is invalid."); })();
  const targetParticipantId = participantKey(Number(frozen.targetParticipantId), "Frozen Weapon target");
  const distance = finiteDistance(candidate.distance, "Approved distance");
  const unit = boundedUnit(candidate.unit, "Approved distance unit");
  const beyondLongModifier = candidate.beyondLongModifier === null || candidate.beyondLongModifier === undefined
    ? null
    : finiteDistance(candidate.beyondLongModifier, "Beyond Long modifier");
  const beyondLongReason = typeof candidate.beyondLongReason === "string" ? candidate.beyondLongReason.trim() : "";
  if (beyondLongReason.length > 2000) throw new Error("Beyond Long ruling reason must be 2000 characters or fewer.");
  const resolved = resolveWeaponRange({ profile, attackMode, distance, unit, beyondLongModifier, beyondLongReason });
  if (resolved.band !== "beyond-long" && beyondLongModifier !== null) throw new Error("A Beyond Long modifier is only valid for a Beyond Long ruling.");
  const revision = object(frozen.profileRevision, "Frozen Weapon Profile revision");
  const ruling: WeaponDistanceApproval = {
    kind: "weapon-distance",
    sourceRef,
    sourceInstanceId,
    weaponItemId,
    weaponProfileId,
    firingModeId,
    attackMode,
    targetParticipantId,
    distance,
    unit,
    rangeProfile: profile,
    profileRevision: { itemUpdatedAt: text(revision.itemUpdatedAt, "Frozen Item revision", 100), weaponProfileUpdatedAt: text(revision.weaponProfileUpdatedAt, "Frozen Weapon Profile revision", 100) },
    band: resolved.band,
    adjustment: resolved.adjustment,
    label: resolved.label,
    beyondLongModifier: resolved.band === "beyond-long" ? beyondLongModifier : null,
    beyondLongReason: resolved.band === "beyond-long" ? beyondLongReason : "",
  };
  return ruling;
}

async function normalizeWeaponDistanceRequest(
  tx: PlayerCombatRulingTransaction,
  context: OwnedEncounterRuntimeContext,
  player: { userId: string; characterId: number },
  input: CreatePlayerCombatRulingRequest,
): Promise<Record<string, unknown>> {
  if (input.sourceKind.trim() !== "weapon") throw new Error("A Weapon distance request must reference an exact Weapon source.");
  if (input.targetParticipantId === null || input.targetParticipantId === undefined) throw new Error("A Weapon distance request requires an exact target.");
  await assertTarget(tx, context, input.targetParticipantId);
  const sourceRef = text(input.sourceRef ?? "", "Weapon source identity", 400);
  const sourceInstanceId = input.sourceInstanceId === null || input.sourceInstanceId === undefined ? null : positiveId(input.sourceInstanceId, "Weapon instance");
  let weaponItemId: number;
  if (sourceInstanceId !== null) {
    if (sourceRef !== `instance:${sourceInstanceId}`) throw new Error("The Weapon source identity does not match its exact instance.");
    const [owned] = await tx.select({ itemId: campaignCharacterItemInstance.itemId }).from(campaignCharacterItemInstance).where(and(eq(campaignCharacterItemInstance.id, sourceInstanceId), eq(campaignCharacterItemInstance.characterId, player.characterId), isNull(campaignCharacterItemInstance.retiredAt))).limit(1);
    if (!owned) throw new Error("The exact Weapon instance is not owned by this Player Character.");
    weaponItemId = owned.itemId;
  } else {
    weaponItemId = refId(sourceRef, "stack:", "Weapon stack");
    const [owned] = await tx.select({ itemId: campaignCharacterItem.itemId }).from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, player.characterId), eq(campaignCharacterItem.itemId, weaponItemId))).limit(1);
    if (!owned) throw new Error("The Weapon stack is not owned by this Player Character.");
  }
  const [profile] = await tx.select({
    itemId: item.id,
    itemUpdatedAt: item.updatedAt,
    profileId: weaponProfile.id,
    profileUpdatedAt: weaponProfile.updatedAt,
    rangeMode: weaponProfile.rangeMode,
    distanceUnit: weaponProfile.distanceUnit,
    reachDistance: weaponProfile.reachDistance,
    shortRangeDistance: weaponProfile.shortRangeDistance,
    mediumRangeDistance: weaponProfile.mediumRangeDistance,
    longRangeDistance: weaponProfile.longRangeDistance,
  }).from(weaponProfile).innerJoin(item, eq(item.id, weaponProfile.itemId)).where(eq(weaponProfile.itemId, weaponItemId)).limit(1);
  if (!profile) throw new Error("The Weapon has no authoritative Weapon Profile.");
  const frozen = object(input.frozenRequest, "Weapon distance request");
  const attackMode = frozen.attackMode === "melee" || frozen.attackMode === "ranged" ? frozen.attackMode : (() => { throw new Error("Weapon attack mode is invalid."); })();
  const distance = finiteDistance(frozen.distance, "Requested distance");
  const unit = boundedUnit(frozen.unit, "Requested distance unit");
  const rangeProfile: StructuredWeaponRange = { mode: profile.rangeMode as StructuredWeaponRange["mode"], unit: profile.distanceUnit, reach: profile.reachDistance, short: profile.shortRangeDistance, medium: profile.mediumRangeDistance, long: profile.longRangeDistance };
  const classified = classifyWeaponRange({ profile: rangeProfile, attackMode, distance, unit });
  const firingModeId = optionalPositiveId(frozen.firingModeId, "Firing Mode");
  if (firingModeId !== null) {
    const [mode] = await tx.select({ id: weaponFiringMode.id }).from(weaponFiringMode).where(and(eq(weaponFiringMode.id, firingModeId), eq(weaponFiringMode.weaponProfileId, profile.profileId))).limit(1);
    if (!mode) throw new Error("The selected Firing Mode does not belong to the exact Weapon Profile.");
  }
  return {
    kind: "weapon-distance",
    sourceRef,
    sourceInstanceId,
    weaponItemId: profile.itemId,
    weaponProfileId: profile.profileId,
    firingModeId,
    attackMode,
    targetParticipantId: participantKey(input.targetParticipantId, "Target"),
    distance,
    unit,
    rangeBand: classified.band,
    rangeProfile,
    profileRevision: { itemUpdatedAt: profile.itemUpdatedAt.toISOString(), weaponProfileUpdatedAt: profile.profileUpdatedAt.toISOString() },
  };
}

export async function lockPlayerCombatContextInTransaction(
  tx: PlayerCombatRulingTransaction,
  encounterIdInput: number,
  characterIdInput: number,
  playerUserId: string,
  /** Read-only screen bootstrap; all combat mutations retain the enrolled default. */
  allowBeforeEnrollment = false,
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
    .leftJoin(campaignSessionEncounterInitiativeParticipant, and(
      eq(campaignSessionEncounterInitiativeParticipant.encounterId, campaignSessionEncounter.id),
      eq(campaignSessionEncounterInitiativeParticipant.characterId, characterId),
    ))
    .where(and(
      eq(campaignSessionEncounter.id, encounterId),
      ...(allowBeforeEnrollment ? [] : [eq(campaignSessionEncounterInitiativeParticipant.characterId, characterId)]),
      isNull(campaignCharacter.archivedAt),
      isNull(campaign.archivedAt),
    ))
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
  if (input.requestType === "firearm-preparation" && input.sourceInstanceId == null) {
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
        isNull(campaignCharacterItemInstance.retiredAt),
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
  const frozenRequest = input.requestType === "weapon-distance"
    ? await normalizeWeaponDistanceRequest(tx, context, player, input)
    : object(input.frozenRequest, "Frozen request");
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
      || existing.sourceInstanceId !== (input.sourceInstanceId ?? null)
      || (input.requestType === "weapon-distance" && JSON.stringify(existing.frozenRequestJson) !== JSON.stringify(frozenRequest))) {
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
    frozenRequestJson: frozenRequest,
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
  let ruling = object(input.ruling ?? {}, "G.O.D. ruling");
  if (input.status === "approved" && request.requestType === "weapon-distance") {
    ruling = weaponDistanceApprovalFromRequest(request, ruling) as unknown as Record<string, unknown>;
  }
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

export async function assertApprovedWeaponDistanceRequestInTransaction(
  tx: PlayerCombatRulingTransaction,
  context: OwnedEncounterRuntimeContext,
  player: { userId: string; characterId: number },
  requestIdInput: number,
  identity: WeaponDistanceRequestIdentity,
): Promise<WeaponDistanceApproval> {
  const request = await lockRequest(tx, context, positiveId(requestIdInput, "Weapon distance request"));
  if (request.requestType !== "weapon-distance" || request.status !== "approved") throw new Error("A current approved Weapon distance ruling is required before this Player attack.");
  if (request.characterId !== player.characterId || request.requestedByUserId !== player.userId) throw new Error("This Weapon distance ruling does not belong to the acting Player Character.");
  if (request.linkedDeclarationId !== null || request.linkedFirearmAttackId !== null || request.linkedReactionId !== null) throw new Error("This Weapon distance ruling was already consumed by another combat outcome.");
  const approval = weaponDistanceApprovalFromRequest(request, object(request.rulingJson, "Stored Weapon distance ruling"));
  if (approval.sourceRef !== identity.sourceRef || approval.sourceInstanceId !== identity.sourceInstanceId
    || approval.weaponItemId !== identity.weaponItemId || (identity.weaponProfileId !== undefined && identity.weaponProfileId !== null && approval.weaponProfileId !== identity.weaponProfileId) || approval.targetParticipantId !== identity.targetParticipantId
    || approval.attackMode !== identity.attackMode || approval.firingModeId !== identity.firingModeId
    || approval.distance !== identity.distance || approval.unit !== identity.unit) {
    throw new Error("The approved Weapon distance ruling does not match this exact target, Weapon, mode, distance, or unit.");
  }
  const profileId = positiveId(Number(approval.weaponProfileId), "Approved Weapon Profile");
  const [current] = await tx.select({
    itemUpdatedAt: item.updatedAt,
    profileUpdatedAt: weaponProfile.updatedAt,
    rangeMode: weaponProfile.rangeMode,
    distanceUnit: weaponProfile.distanceUnit,
    reachDistance: weaponProfile.reachDistance,
    shortRangeDistance: weaponProfile.shortRangeDistance,
    mediumRangeDistance: weaponProfile.mediumRangeDistance,
    longRangeDistance: weaponProfile.longRangeDistance,
  }).from(weaponProfile).innerJoin(item, eq(item.id, weaponProfile.itemId)).where(and(eq(weaponProfile.id, profileId), eq(weaponProfile.itemId, approval.weaponItemId))).limit(1);
  if (!current) throw new Error("The approved Weapon Profile no longer exists.");
  if (current.itemUpdatedAt.toISOString() !== approval.profileRevision.itemUpdatedAt || current.profileUpdatedAt.toISOString() !== approval.profileRevision.weaponProfileUpdatedAt) {
    throw new Error("The Weapon range Profile changed after approval. Request a new distance ruling.");
  }
  const currentProfile = validateStructuredWeaponRange({ mode: current.rangeMode as StructuredWeaponRange["mode"], unit: current.distanceUnit, reach: current.reachDistance, short: current.shortRangeDistance, medium: current.mediumRangeDistance, long: current.longRangeDistance });
  if (JSON.stringify(currentProfile) !== JSON.stringify(validateStructuredWeaponRange(approval.rangeProfile))) throw new Error("The approved Weapon range limits changed after approval. Request a new distance ruling.");
  if (approval.sourceInstanceId !== null) {
    const [owned] = await tx.select({ id: campaignCharacterItemInstance.id }).from(campaignCharacterItemInstance).where(and(eq(campaignCharacterItemInstance.id, approval.sourceInstanceId), eq(campaignCharacterItemInstance.characterId, player.characterId), eq(campaignCharacterItemInstance.itemId, approval.weaponItemId), isNull(campaignCharacterItemInstance.retiredAt))).limit(1);
    if (!owned) throw new Error("The approved exact Weapon instance is no longer owned.");
  } else {
    const [owned] = await tx.select({ itemId: campaignCharacterItem.itemId }).from(campaignCharacterItem).where(and(eq(campaignCharacterItem.characterId, player.characterId), eq(campaignCharacterItem.itemId, approval.weaponItemId))).limit(1);
    if (!owned) throw new Error("The approved Weapon stack is no longer owned.");
  }
  return approval;
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

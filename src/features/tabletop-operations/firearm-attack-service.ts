import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import "server-only";
import { assertNoOpenDeclarationCheckpoint } from "./declaration-checkpoint-service";
import { creatureProtectionValue } from "./creature-protection";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";

import type { db } from "@/db";
import {
  item,
  itemArmorDamageModifier,
  weaponFiringMode,
  weaponProfile,
} from "@/db/item-schema";
import {
  campaignCharacter,
  campaignCharacterAttribute,
  campaignCharacterItemInstance,
} from "@/db/realm-schema";
import {
  campaignCharacterFirearmEvent,
  campaignCharacterFirearmPreparation,
  campaignCharacterFirearmState,
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterEffect,
  campaignSessionEncounterEffectPlan,
  campaignSessionEncounterEffectPlanEvent,
  campaignSessionEncounterFirearmAttack,
  campaignSessionEncounterFirearmAttackEvent,
  campaignSessionEncounterFirearmBullet,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionEncounterResponderOpportunity,
  campaignSessionPlayerRulingRequest,
  campaignSessionRoll,
} from "@/db/tabletop-operations-schema";
import { getActiveModifierTotal } from "@/features/active-state/active-effects";
import { readActiveEffectsInTransaction } from "@/features/active-state/active-effects-service";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import type { ActiveHealthAnatomy } from "@/features/active-state/models";
import { getAttributeModifier } from "@/features/characters/character-rules";
import { getCharacterWeaponDamage } from "@/features/characters/character-sheet-rules";
import { resolveCharacterWeaponGovernanceInTransaction } from "@/features/items/character-weapon-governance-service";
import type { CharacterWeaponOneActionOverride } from "@/features/items/character-weapon-governance";
import { readCharacterEquipmentStateInTransaction } from "@/features/items/equipment-state-service";

import {
  cancelActionDeclarationInTransaction,
  commitActionDeclarationInTransaction,
  createActionDeclarationDraftInTransaction,
  lockActionDeclarationInTransaction,
  resolveActionDeclarationInTransaction,
  type ActionDeclarationActor,
  type DeclarationRollInput,
} from "./action-declaration-service";
import type { ActionDeclarationDraft } from "./action-declaration";
import type { DefenseGroupOutcome } from "./defense-intervention";
import {
  recordDeclaredAttackRollInTransaction,
  resolveDeclaredDefensesIfReadyInTransaction,
} from "./defense-intervention-service";
import {
  evaluateFirearmReadiness,
  resolveFirearmMode,
  type FirearmPreparationOperation,
  type FirearmReadinessBlocker,
} from "./firearm-readiness";
import {
  allocateFirearmBullets,
  calculateFirearmBulletDamage,
  firearmDeclarationModifiers,
  parseAuthoredBulletDamage,
  planFirearmDelivery,
  postShotReadinessFromAuthoredTiming,
  type FirearmAttackStatus,
  type FirearmBulletAllocation,
  type FirearmDefenseAllocationInput,
  type FirearmDeliveryPlan,
} from "./firearm-attack";
import { resolvePercentileCheck, type PercentileTargetModifier } from "./percentile-resolution";
import { getHitLocationFromPercentile, type RollMethod, type RollVisibility } from "./roll-runtime";
import { readEffectiveRollSnapshotInTransaction, type AuthorizedRollActor } from "./roll-runtime-service";
import type { RollGoverningSourceRequest, RollGoverningSourceSnapshot, RollMechanicalSnapshot } from "./roll-mechanical-snapshot";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";
import { lockPlayerCombatContextInTransaction } from "./player-combat-ruling-service";

export type FirearmAttackTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type GodActor = Extract<ActionDeclarationActor, { authority: "god-owner" }>;
type FirearmAttackActor = ActionDeclarationActor;
type FirearmAttackActorInput = string | FirearmAttackActor;

export type FirearmAttackCommand = Readonly<{
  actorParticipantId: number;
  targetParticipantId: number;
  itemInstanceId: number;
  firingModeId: number;
  aimInitiative: number;
  firingDurationInitiative?: number | null;
  calledShot: Readonly<{
    declared: boolean;
    objective: string;
    locationNumber: number | null;
    penalty: number | null;
    reason: string;
  }>;
  otherModifiers?: readonly Readonly<{ label: string; value: number }>[];
  manualGovernance?: Readonly<{ label: string; originalTarget: number; reason: string }> | null;
  playerRulingRequestId?: number | null;
}>;

export type DeclareFirearmAttackCommand = FirearmAttackCommand & Readonly<{ idempotencyKey: string; roll?: DeclarationRollInput }>;

export type FirearmAttackPreview = Readonly<{
  actor: { participantId: number; name: string };
  target: { participantId: number; name: string; participantKind: string; anatomy: ActiveHealthAnatomy | null; sourceSnapshot: unknown };
  firearm: {
    itemInstanceId: number;
    itemId: number;
    itemName: string;
    canonicalId: string;
    weaponProfileId: number;
    firingModeId: number;
    firingModeName: string;
    ammunitionItemId: number;
    ammunitionProfileId: number;
    ammunitionName: string;
    roundsLoaded: number;
    capacityRounds: number;
    stateVersion: number;
    effectiveCyclingInitiativeCost: number;
    effectiveRecoilResetInitiativeCost: number;
  };
  delivery: FirearmDeliveryPlan;
  readiness: { status: string; blockers: readonly FirearmReadinessBlocker[] };
  governing: {
    status: string;
    label: string;
    originalTarget: number;
    request: RollGoverningSourceRequest;
    snapshot: RollGoverningSourceSnapshot;
    explanation: string;
    oneActionOverride: CharacterWeaponOneActionOverride | null;
  };
  modifiers: readonly PercentileTargetModifier[];
  finalTarget: number;
  aim: { initiative: number; targetOffset: number };
  calledShot: FirearmAttackCommand["calledShot"] & { validAtPreview: boolean };
  authoredDamage: { value: string | null; numeric: number | null; damageType: string | null; sourceName: string | null };
  dexDamageModifier: number;
  rulingReasons: readonly string[];
}>;

export type FirearmAttackView = Readonly<{
  id: number;
  status: string;
  effectiveStatus: string;
  actorParticipantId: number;
  actorName: string;
  targetParticipantId: number;
  targetName: string;
  itemInstanceId: number;
  itemName: string;
  firingModeName: string;
  ammunitionName: string;
  governingLabel: string;
  originalTarget: number;
  aimInitiative: number;
  aimTargetOffset: number;
  calledShotDeclared: boolean;
  calledShotObjective: string;
  calledShotLocationNumber: number | null;
  calledShotPenalty: number | null;
  calledShotReason: string;
  firingDurationInitiative: number;
  firingPortionsResolved: number;
  roundsPerCadence: number;
  roundsDeclared: number;
  roundsConsumed: number;
  roundsLoadedBefore: number;
  roundsLoadedAfter: number | null;
  finalTarget: number;
  aimDeclarationId: number | null;
  aimDeclarationStatus: string | null;
  aimPendingActionId: number | null;
  aimTimingStatus: string | null;
  triggerDeclarationId: number;
  triggerDeclarationStatus: string;
  triggerPendingActionId: number | null;
  triggerTimingStatus: string | null;
  responderOpportunities: readonly Readonly<{
    id: number;
    phase: "aim" | "trigger";
    responderParticipantId: number;
    responderName: string;
    status: string;
    responseLabel: string;
  }>[];
  attackRollId: number | null;
  attackRoll: RollMechanicalSnapshot | null;
  attackFinalized: boolean;
  defenseResolution: unknown;
  bulletAllocation: FirearmBulletAllocation | null;
  damageResolution: unknown;
  postShotState: unknown;
  effectPlanId: number | null;
  effectPlanStatus: string | null;
  rulingReasons: readonly string[];
  bullets: readonly Readonly<{
    id: number;
    bulletIndex: number;
    status: string;
    cancelledByReactionId: number | null;
    hitLocationNumber: number | null;
    hitLocationName: string;
    hpPoolKey: string;
    authoredDamage: number | null;
    dexDamageModifier: number;
    additionalSuccessDamage: number;
    grossDamage: number | null;
    armor: number | null;
    soak: number | null;
    proposedNetDamage: number | null;
    armorSnapshot: unknown;
    rulingReasons: readonly string[];
  }>[];
  events: readonly Readonly<{ id: number; eventKind: string; reason: string; actorUserId: string; createdAt: string }>[];
  createdByUserId: string;
  createdAt: string;
  firedAt: string | null;
}>;

export type FirearmAttackWorkspaceView = Readonly<{
  context: { campaignId: number; sessionId: number; sceneId: number; encounterId: number };
  participants: readonly Readonly<{
    id: number;
    name: string;
    participantKind: string;
    hitLocations: readonly Readonly<{ result: number; name: string; poolKey: string | null }>[];
  }>[];
  attacks: readonly FirearmAttackView[];
}>;

type LoadedFoundation = Readonly<{
  actor: FirearmAttackActor;
  preview: FirearmAttackPreview;
  state: typeof campaignCharacterFirearmState.$inferSelect;
  mode: typeof weaponFiringMode.$inferSelect;
  profile: typeof weaponProfile.$inferSelect;
}>;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function participantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function nonnegativeWhole(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a nonnegative whole number.`);
  return value;
}

function boundedText(value: unknown, label: string, required = true, maximum = 1000): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function assertGod(context: OwnedEncounterRuntimeContext, actorUserId: string): GodActor {
  if (actorUserId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may govern firearm attacks.");
  return { authority: "god-owner", userId: actorUserId };
}

async function resolveFirearmActor(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  input: FirearmAttackActorInput,
  actorParticipantId: number,
): Promise<FirearmAttackActor> {
  const actor = typeof input === "string" ? assertGod(context, input) : input;
  if (actor.authority === "god-owner") return assertGod(context, actor.userId);
  if (actor.characterId !== actorParticipantId) {
    throw new Error("A Player may declare firearm actions only for their own exact assigned Character.");
  }
  const playerContext = await lockPlayerCombatContextInTransaction(tx, context.encounterId, actor.characterId, actor.userId);
  if (playerContext.campaignId !== context.campaignId
    || playerContext.sessionId !== context.sessionId
    || playerContext.sceneId !== context.sceneId) {
    throw new Error("The Player firearm action does not belong to the exact active Encounter hierarchy.");
  }
  return actor;
}

async function targetAnatomy(
  tx: FirearmAttackTransaction,
  participant: { id: number; participantKind: string; npcKind: string | null; creatureSnapshot: unknown },
): Promise<ActiveHealthAnatomy | null> {
  if (participant.participantKind === "creature") {
    if (!isRecord(participant.creatureSnapshot)) return null;
    const pools = Array.isArray(participant.creatureSnapshot.hpPools) ? participant.creatureSnapshot.hpPools : [];
    const locations = Array.isArray(participant.creatureSnapshot.hitLocations) ? participant.creatureSnapshot.hitLocations : [];
    return {
      kind: "creature",
      totalMaximumHp: null,
      maximumHpNote: "Frozen direct-Creature occurrence anatomy.",
      pools: pools.flatMap((entry, sortOrder) => isRecord(entry) && typeof entry.canonicalId === "string" && typeof entry.poolName === "string" ? [{
        key: entry.canonicalId,
        name: entry.poolName,
        maximumHp: typeof entry.maximumHp === "number" ? entry.maximumHp : null,
        percentage: typeof entry.hpPercentage === "number" ? entry.hpPercentage : null,
        sortOrder: typeof entry.sortOrder === "number" ? entry.sortOrder : sortOrder,
      }] : []),
      hitLocations: locations.flatMap((entry) => isRecord(entry) && Number.isSafeInteger(entry.hitLocationNumber) && typeof entry.locationName === "string" ? [{
        result: Number(entry.hitLocationNumber),
        name: entry.locationName,
        bodyParts: typeof entry.bodyPartsIncluded === "string" ? entry.bodyPartsIncluded : entry.locationName,
        poolKey: typeof entry.hpPoolCanonicalId === "string" ? entry.hpPoolCanonicalId : null,
        poolName: null,
      }] : []),
    };
  }
  try {
    return (await readActiveHealthInTransaction(tx, positiveId(participant.id, "Target Character"), participant.npcKind ?? "race")).anatomy;
  } catch {
    return null;
  }
}

async function loadFoundation(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: FirearmAttackActorInput,
  command: FirearmAttackCommand,
  lock: boolean,
): Promise<LoadedFoundation> {
  const actorParticipantId = positiveId(command.actorParticipantId, "Attacking participant");
  const actor = await resolveFirearmActor(tx, context, actorInput, actorParticipantId);
  const actorUserId = actor.userId;
  const targetParticipantId = participantKey(command.targetParticipantId, "Target participant");
  if (actorParticipantId === targetParticipantId) throw new Error("A firearm attack requires a distinct target participant.");
  const participants = await tx.select({
    id: campaignSessionEncounterParticipant.characterId,
    participantKind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    name: campaignCharacter.name,
    npcKind: campaignCharacter.npcKind,
    creatureSnapshot: campaignSessionEncounterParticipant.creatureSnapshotJson,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId),
      eq(campaignCharacter.campaignId, campaignSessionEncounterParticipant.campaignId),
    ))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      inArray(campaignSessionEncounterParticipant.characterId, [actorParticipantId, targetParticipantId]),
    ));
  const actorParticipant = participants.find(({ id }) => id === actorParticipantId);
  const targetParticipant = participants.find(({ id }) => id === targetParticipantId);
  if (!actorParticipant || actorParticipant.participantKind !== "campaign-character") {
    throw new Error("Manufactured firearms require an exact persistent Character or NPC Encounter participant.");
  }
  if (!targetParticipant) throw new Error("The exact target does not belong to this Encounter.");

  const stateQuery = tx.select().from(campaignCharacterFirearmState).where(and(
    eq(campaignCharacterFirearmState.itemInstanceId, positiveId(command.itemInstanceId, "Firearm Item instance")),
    eq(campaignCharacterFirearmState.characterId, actorParticipantId),
    eq(campaignCharacterFirearmState.campaignId, context.campaignId),
  )).limit(1);
  const states = lock ? await stateQuery.for("update") : await stateQuery;
  const state = states[0];
  if (!state) throw new Error("This exact owned firearm instance has no initialized runtime state.");
  if (state.selectedFiringModeId !== positiveId(command.firingModeId, "Firing Mode")) {
    throw new Error("The selected Firing Mode does not match this exact firearm's authoritative runtime state.");
  }
  const [owned] = await tx.select({
    equipmentState: campaignCharacterItemInstance.equipmentState,
    itemName: item.name,
    canonicalId: item.canonicalId,
  }).from(campaignCharacterItemInstance)
    .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
    .where(and(
      eq(campaignCharacterItemInstance.id, state.itemInstanceId),
      eq(campaignCharacterItemInstance.characterId, actorParticipantId),
      eq(campaignCharacterItemInstance.itemId, state.itemId),
      isNull(campaignCharacterItemInstance.retiredAt),
    )).limit(1);
  if (!owned) throw new Error("The exact firearm instance no longer belongs to the attacking Character.");
  const [profile] = await tx.select().from(weaponProfile).where(and(
    eq(weaponProfile.id, state.weaponProfileId),
    eq(weaponProfile.itemId, state.itemId),
  )).limit(1);
  if (!profile) throw new Error("The exact Weapon Profile no longer belongs to this firearm Item.");
  const [mode] = await tx.select().from(weaponFiringMode).where(and(
    eq(weaponFiringMode.id, state.selectedFiringModeId),
    eq(weaponFiringMode.weaponProfileId, state.weaponProfileId),
  )).limit(1);
  if (!mode) throw new Error("The selected Firing Mode no longer belongs to this Weapon Profile.");
  if (state.loadedAmmunitionItemId === null || state.loadedAmmunitionProfileId === null) {
    throw new Error("The exact firearm has no compatible loaded ammunition identity.");
  }
  const [ammunition] = await tx.select({
    itemId: item.id,
    itemName: item.name,
    profileId: weaponProfile.id,
    profileRecordType: weaponProfile.profileRecordType,
    damage: weaponProfile.damage,
    damageType: weaponProfile.damageType,
    cyclingModifier: weaponProfile.ammunitionCyclingInitiativeModifier,
    recoilModifier: weaponProfile.ammunitionRecoilResetInitiativeModifier,
  }).from(item).innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id)).where(and(
    eq(item.id, state.loadedAmmunitionItemId),
    eq(weaponProfile.id, state.loadedAmmunitionProfileId),
  )).limit(1);
  const selectedMode = resolveFirearmMode({
    mode: { ...mode, deliveryCadence: mode.deliveryCadence as "per-trigger" | "sustained-per-initiative" | null },
    ammunitionCyclingModifier: ammunition?.cyclingModifier ?? 0,
    ammunitionRecoilModifier: ammunition?.recoilModifier ?? 0,
  });
  const delivery = planFirearmDelivery({
    deliveryCadence: selectedMode.deliveryCadence,
    roundsPerCadence: selectedMode.roundsPerCadence,
    firingDurationInitiative: command.firingDurationInitiative,
    loadedRounds: state.loadedRounds,
    targetCount: 1,
  });
  const [openPreparation] = await tx.select({ operation: campaignCharacterFirearmPreparation.operation, status: campaignCharacterFirearmPreparation.status })
    .from(campaignCharacterFirearmPreparation).where(and(
      eq(campaignCharacterFirearmPreparation.itemInstanceId, state.itemInstanceId),
      inArray(campaignCharacterFirearmPreparation.status, ["pending", "interrupted", "requires-god-ruling"]),
    )).limit(1);
  const readiness = evaluateFirearmReadiness({
    initialized: true,
    exactOwnerValid: true,
    itemInstancePresent: true,
    weaponProfilePresent: true,
    firingModeValid: true,
    firingModeMechanicsResolved: selectedMode.timing !== null && selectedMode.deliveryCadence !== null && selectedMode.roundsPerCadence !== null,
    drawn: owned.equipmentState === "wielded",
    readied: state.readied,
    loadedRounds: state.loadedRounds,
    capacityRounds: state.capacityRounds,
    readinessRelationshipResolved: state.readinessMode === "draw-is-ready" || state.readinessMode === "separate-ready-action",
    ammunitionRelationshipResolved: profile.ammunitionItemId !== null && ammunition !== undefined,
    ammunitionRequired: true,
    ammunitionCompatible: Boolean(ammunition)
      && profile.ammunitionItemId === state.loadedAmmunitionItemId
      && ammunition!.profileId === state.loadedAmmunitionProfileId
      && ammunition!.profileRecordType.trim().toLocaleLowerCase("en-US") === "ammunition",
    roundsRequiredForSelectedDelivery: delivery.declaredRounds,
    requiresCycling: state.requiresCycling,
    requiresRecoilRecovery: state.requiresRecoilRecovery,
    pendingPreparation: openPreparation ? {
      operation: openPreparation.operation as FirearmPreparationOperation,
      status: openPreparation.status as "pending" | "interrupted" | "requires-god-ruling",
    } : null,
    requiredPreparationInitiativeCostKnown: true,
    staleCanonicalRuntimeDivergence: state.weaponProfileId !== profile.id
      || state.selectedFiringModeId !== mode.id
      || (state.capacitySource === "canonical" && state.capacityRounds !== profile.capacityRounds)
      || (state.readinessModeSource === "canonical" && state.readinessMode !== profile.readinessMode),
    directCreatureManufacturedFirearm: false,
  });
  if (readiness.status !== "ready") {
    throw new Error(readiness.blockers.map(({ message }) => message).join(" ") || "The exact firearm is not ready.");
  }
  if (command.aimInitiative > 0 && !profile.rangeText.trim()) throw new Error("Aim applies only to an authored ranged attack.");
  const aimInitiative = nonnegativeWhole(command.aimInitiative, "Aim Initiative");
  const calledShot = {
    declared: command.calledShot.declared === true,
    objective: command.calledShot.declared ? boundedText(command.calledShot.objective, "Called Shot objective", true, 240) : "",
    locationNumber: command.calledShot.declared && command.calledShot.locationNumber !== null
      ? nonnegativeWhole(command.calledShot.locationNumber, "Called Shot location")
      : null,
    penalty: command.calledShot.declared ? command.calledShot.penalty : null,
    reason: command.calledShot.declared ? boundedText(command.calledShot.reason, "Called Shot reason") : "",
  };
  if (actor.authority === "player" && command.manualGovernance) {
    throw new Error("A Player cannot supply a one-action weapon-governance ruling.");
  }
  if (actor.authority === "player" && calledShot.declared) {
    const rulingRequestId = positiveId(command.playerRulingRequestId ?? 0, "Approved Called Shot request");
    const [request] = await tx.select({
      ruling: campaignSessionPlayerRulingRequest.rulingJson,
      frozenRequest: campaignSessionPlayerRulingRequest.frozenRequestJson,
    }).from(campaignSessionPlayerRulingRequest).where(and(
      eq(campaignSessionPlayerRulingRequest.id, rulingRequestId),
      eq(campaignSessionPlayerRulingRequest.encounterId, context.encounterId),
      eq(campaignSessionPlayerRulingRequest.sceneId, context.sceneId),
      eq(campaignSessionPlayerRulingRequest.sessionId, context.sessionId),
      eq(campaignSessionPlayerRulingRequest.campaignId, context.campaignId),
      eq(campaignSessionPlayerRulingRequest.characterId, actor.characterId),
      eq(campaignSessionPlayerRulingRequest.targetParticipantId, targetParticipantId),
      eq(campaignSessionPlayerRulingRequest.sourceInstanceId, state.itemInstanceId),
      eq(campaignSessionPlayerRulingRequest.requestType, "called-shot"),
      eq(campaignSessionPlayerRulingRequest.status, "approved"),
    )).limit(1);
    const ruling = isRecord(request?.ruling) ? request.ruling : null;
    const frozen = isRecord(request?.frozenRequest) ? request.frozenRequest : null;
    if (!ruling
      || ruling.penalty !== calledShot.penalty
      || ruling.reason !== calledShot.reason
      || frozen?.objective !== calledShot.objective
      || (frozen.locationNumber ?? null) !== calledShot.locationNumber) {
      throw new Error("The Called Shot must exactly match its approved persistent G.O.D. ruling.");
    }
  }
  const modifiers = firearmDeclarationModifiers({ aimInitiative, calledShot: { declared: calledShot.declared, penalty: calledShot.penalty, reason: calledShot.reason }, other: command.otherModifiers });
  const oneActionOverride: CharacterWeaponOneActionOverride | null = command.manualGovernance ? {
    kind: "manual",
    label: boundedText(command.manualGovernance.label, "Manual governing label", true, 200),
    originalTarget: command.manualGovernance.originalTarget,
    reason: boundedText(command.manualGovernance.reason, "Manual governing reason"),
  } : null;
  const governance = await resolveCharacterWeaponGovernanceInTransaction(tx, { userId: actorUserId }, {
    campaignId: context.campaignId,
    characterId: actorParticipantId,
    itemId: state.itemId,
    firingModeId: state.selectedFiringModeId,
    oneActionOverride,
  });
  if (governance.status !== "resolved-normal"
    && governance.status !== "resolved-persistent-override"
    && governance.status !== "resolved-one-action-override") {
    throw new Error(`${governance.explanation} Supply an explicit one-action G.O.D. governing ruling before declaration.`);
  }
  const targetHealthAnatomy = await targetAnatomy(tx, targetParticipant);
  const validCalledLocation = calledShot.locationNumber === null
    || targetHealthAnatomy?.hitLocations.some(({ result }) => result === calledShot.locationNumber) === true;
  if (calledShot.declared && calledShot.locationNumber !== null && !validCalledLocation) {
    throw new Error("The requested Called Shot location is absent from the target's exact authored anatomy and requires a G.O.D. ruling before declaration.");
  }
  const rulingReasons = [...delivery.rulingReasons];
  if (calledShot.declared && calledShot.locationNumber === null) rulingReasons.push("The Called Shot objective does not identify an authored Hit Location.");
  if (!targetHealthAnatomy) rulingReasons.push("The exact target anatomy is unavailable.");
  const damage = getCharacterWeaponDamage({
    damageSource: profile.damageSource,
    damage: profile.damage,
    damageType: profile.damageType,
    ammunitionItemId: profile.ammunitionItemId,
    ammunitionItemName: ammunition?.itemName ?? null,
    ammunitionDamage: ammunition?.damage ?? null,
    ammunitionDamageType: ammunition?.damageType ?? null,
    weaponType: profile.weaponType,
    rangeText: profile.rangeText,
    reachText: profile.reachText,
  });
  const [dexterity] = await tx.select({ value: campaignCharacterAttribute.value }).from(campaignCharacterAttribute).where(and(
    eq(campaignCharacterAttribute.characterId, actorParticipantId),
    eq(campaignCharacterAttribute.attributeKey, "DEX"),
  )).limit(1);
  const originalTarget = governance.originalTarget;
  const finalTarget = resolvePercentileCheck({ resultTotal: 50, originalTarget, modifiers }).finalTarget;
  return {
    actor,
    state,
    mode,
    profile,
    preview: {
      actor: { participantId: actorParticipantId, name: actorParticipant.name ?? actorParticipant.displayLabel },
      target: {
        participantId: targetParticipantId,
        name: targetParticipant.participantKind === "creature" ? targetParticipant.displayLabel : targetParticipant.name ?? "Unknown target",
        participantKind: targetParticipant.participantKind,
        anatomy: targetHealthAnatomy,
        sourceSnapshot: targetParticipant.participantKind === "creature" ? structuredClone(targetParticipant.creatureSnapshot) : null,
      },
      firearm: {
        itemInstanceId: state.itemInstanceId,
        itemId: state.itemId,
        itemName: owned.itemName,
        canonicalId: owned.canonicalId,
        weaponProfileId: state.weaponProfileId,
        firingModeId: state.selectedFiringModeId,
        firingModeName: mode.name,
        ammunitionItemId: state.loadedAmmunitionItemId,
        ammunitionProfileId: state.loadedAmmunitionProfileId,
        ammunitionName: ammunition!.itemName,
        roundsLoaded: state.loadedRounds,
        capacityRounds: state.capacityRounds!,
        stateVersion: state.version,
        effectiveCyclingInitiativeCost: selectedMode.timing!.effectiveCyclingInitiativeCost,
        effectiveRecoilResetInitiativeCost: selectedMode.timing!.effectiveRecoilResetInitiativeCost,
      },
      delivery,
      readiness,
      governing: {
        status: governance.status,
        label: governance.source.kind === "skill" ? governance.source.skillName : governance.source.kind === "attribute" ? governance.source.attributeDisplayName : governance.source.label,
        originalTarget,
        request: governance.rollGoverningSource,
        snapshot: governance.rollGoverningSourceSnapshot,
        explanation: governance.explanation,
        oneActionOverride,
      },
      modifiers,
      finalTarget,
      aim: { initiative: aimInitiative, targetOffset: aimInitiative * 2 },
      calledShot: { ...calledShot, validAtPreview: validCalledLocation },
      authoredDamage: { value: damage.damage, numeric: parseAuthoredBulletDamage(damage.damage), damageType: damage.damageType, sourceName: damage.sourceName },
      dexDamageModifier: dexterity ? getAttributeModifier(dexterity.value) : 0,
      rulingReasons,
    },
  };
}

export async function previewFirearmAttackInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: FirearmAttackActorInput,
  command: FirearmAttackCommand,
): Promise<FirearmAttackPreview> {
  return (await loadFoundation(tx, context, actor, command, false)).preview;
}

function draftModifiers(modifiers: readonly PercentileTargetModifier[]): ActionDeclarationDraft["explicitModifiers"] {
  return modifiers.map((modifier) => ({ label: modifier.label, value: modifier.kind === "bonus" ? modifier.magnitude : -modifier.magnitude }));
}

async function recordAttackEvent(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  attackId: number,
  fromStatus: FirearmAttackStatus | null,
  toStatus: FirearmAttackStatus,
  eventKind: string,
  actorUserId: string,
  reason = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(campaignSessionEncounterFirearmAttackEvent).values({
    attackId,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    fromStatus,
    toStatus,
    eventKind,
    reason,
    metadataJson: metadata,
    actorUserId,
  });
}

async function assertNoOpenActorAction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorParticipantId: number,
): Promise<void> {
  const [open] = await tx.select({ id: campaignSessionEncounterActionDeclaration.id }).from(campaignSessionEncounterActionDeclaration).where(and(
    eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
    eq(campaignSessionEncounterActionDeclaration.actorCharacterId, actorParticipantId),
    inArray(campaignSessionEncounterActionDeclaration.status, ["draft", "locked", "committed", "rolling-ready", "rolling", "awaiting-god-ruling", "interrupted"]),
  )).limit(1);
  if (open) throw new Error(`The attacking participant already has unresolved action declaration #${open.id}.`);
}

export async function declareFirearmAttackInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: FirearmAttackActorInput,
  command: DeclareFirearmAttackCommand,
): Promise<{ attackId: number; status: FirearmAttackStatus; reused: boolean }> {
  return tx.transaction((declarationTx) => declareFirearmAttackInternal(declarationTx, context, actorInput, command));
}

async function declareFirearmAttackInternal(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: FirearmAttackActorInput,
  command: DeclareFirearmAttackCommand,
): Promise<{ attackId: number; status: FirearmAttackStatus; reused: boolean }> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  await resolveFirearmActor(tx, context, actorInput, command.actorParticipantId);
  const idempotencyKey = boundedText(command.idempotencyKey, "Firearm attack request ID", true, 200);
  const originalRequest = JSON.parse(JSON.stringify(command)) as Record<string, unknown>;
  const [existing] = await tx.select({
    id: campaignSessionEncounterFirearmAttack.id,
    status: campaignSessionEncounterFirearmAttack.status,
    actorParticipantId: campaignSessionEncounterFirearmAttack.actorParticipantId,
    targetParticipantId: campaignSessionEncounterFirearmAttack.targetParticipantId,
    itemInstanceId: campaignSessionEncounterFirearmAttack.itemInstanceId,
    firingModeId: campaignSessionEncounterFirearmAttack.firingModeId,
    encounterId: campaignSessionEncounterFirearmAttack.encounterId,
    frozenSnapshot: campaignSessionEncounterFirearmAttack.frozenSnapshotJson,
  }).from(campaignSessionEncounterFirearmAttack).where(and(
    eq(campaignSessionEncounterFirearmAttack.campaignId, context.campaignId),
    eq(campaignSessionEncounterFirearmAttack.idempotencyKey, idempotencyKey),
  )).limit(1);
  if (existing) {
    const snapshot = isRecord(existing.frozenSnapshot) ? existing.frozenSnapshot : {};
    if (existing.encounterId !== context.encounterId || existing.actorParticipantId !== command.actorParticipantId || existing.targetParticipantId !== command.targetParticipantId || existing.itemInstanceId !== command.itemInstanceId || existing.firingModeId !== command.firingModeId
      || (snapshot.originalRequest !== undefined && !isDeepStrictEqual(snapshot.originalRequest, originalRequest))) {
      throw new Error("That firearm attack request ID was already used for different exact identities.");
    }
    return { attackId: existing.id, status: existing.status as FirearmAttackStatus, reused: true };
  }
  await assertNoOpenActorAction(tx, context, command.actorParticipantId);
  const foundation = await loadFoundation(tx, context, actorInput, command, true);
  const actor = foundation.actor;
  const actorUserId = actor.userId;
  const preview = foundation.preview;
  const sequence = await tx.execute(sql<{ id: number }>`select nextval(pg_get_serial_sequence('campaign_session_encounter_firearm_attack', 'id'))::integer as id`);
  const attackId = positiveId(Number(sequence.rows[0]?.id), "Firearm Attack");
  const governancePayload = preview.governing.oneActionOverride === null ? {} : { weaponGovernanceOverride: preview.governing.oneActionOverride };
  const triggerDraft: ActionDeclarationDraft = {
    actorCharacterId: preview.actor.participantId,
    targetCharacterIds: [preview.target.participantId],
    label: `${preview.firearm.itemName} — ${preview.firearm.firingModeName} at ${preview.target.name}`,
    actionKind: `firearm-attack:${attackId}`,
    sourceKind: "weapon",
    sourceRef: `instance:${preview.firearm.itemInstanceId}`,
    sourceInstanceId: preview.firearm.itemInstanceId,
    sourcePayload: { firearmAttackId: attackId, ...governancePayload },
    weaponItemId: preview.firearm.itemId,
    firingModeId: preview.firearm.firingModeId,
    attackMode: preview.firearm.firingModeName,
    initiativeCost: preview.delivery.firingDurationInitiative,
    allowsMultiRound: preview.delivery.kind === "sustained",
    heldIntervention: false,
    windowKind: preview.delivery.kind === "sustained" ? "firearm-sustained" : "firearm-trigger",
    aimDeclared: preview.aim.initiative > 0,
    calledShot: {
      declared: preview.calledShot.declared,
      label: preview.calledShot.objective,
      assignedPenalty: preview.calledShot.penalty,
    },
    explicitModifiers: draftModifiers(preview.modifiers),
    preparesForDeclarationId: null,
    godNotes: preview.calledShot.reason,
  };
  const triggerDeclarationId = await createActionDeclarationDraftInTransaction(tx, context, actor, triggerDraft);
  await lockActionDeclarationInTransaction(tx, context, actor, triggerDeclarationId);
  let aimDeclarationId: number | null = null;
  let aimPendingActionId: number | null = null;
  let triggerPendingActionId: number | null = null;
  let status: FirearmAttackStatus;
  if (preview.aim.initiative > 0) {
    const aimDraft: ActionDeclarationDraft = {
      actorCharacterId: preview.actor.participantId,
      targetCharacterIds: [preview.target.participantId],
      label: `Aim ${preview.firearm.itemName} at ${preview.target.name}`,
      actionKind: `firearm-aim:${attackId}`,
      sourceKind: "no-roll",
      sourceRef: `firearm-aim:${attackId}`,
      sourceInstanceId: preview.firearm.itemInstanceId,
      sourcePayload: { instruction: `Aim with exact firearm instance #${preview.firearm.itemInstanceId} and mode #${preview.firearm.firingModeId}.` },
      weaponItemId: null,
      firingModeId: null,
      attackMode: "Aim",
      initiativeCost: preview.aim.initiative,
      allowsMultiRound: true,
      heldIntervention: false,
      windowKind: "preparation",
      aimDeclared: true,
      calledShot: { declared: false, label: "", assignedPenalty: null },
      explicitModifiers: [],
      preparesForDeclarationId: triggerDeclarationId,
      godNotes: "Aim Initiative is committed separately from the later one-Initiative trigger pull.",
    };
    aimDeclarationId = await createActionDeclarationDraftInTransaction(tx, context, actor, aimDraft);
    await lockActionDeclarationInTransaction(tx, context, actor, aimDeclarationId);
    aimPendingActionId = await commitActionDeclarationInTransaction(tx, context, actor, aimDeclarationId);
    status = "aiming";
  } else {
    triggerPendingActionId = await commitActionDeclarationInTransaction(tx, context, actor, triggerDeclarationId, command.roll);
    status = "committed";
  }
  await tx.insert(campaignSessionEncounterFirearmAttack).values({
    id: attackId,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    actorParticipantId: preview.actor.participantId,
    targetParticipantId: preview.target.participantId,
    itemInstanceId: preview.firearm.itemInstanceId,
    itemId: preview.firearm.itemId,
    weaponProfileId: preview.firearm.weaponProfileId,
    firingModeId: preview.firearm.firingModeId,
    ammunitionItemId: preview.firearm.ammunitionItemId,
    ammunitionProfileId: preview.firearm.ammunitionProfileId,
    aimDeclarationId,
    aimPendingActionId,
    triggerDeclarationId,
    triggerPendingActionId,
    status,
    stateVersionBefore: preview.firearm.stateVersion,
    aimInitiative: preview.aim.initiative,
    calledShotDeclared: preview.calledShot.declared,
    calledShotObjective: preview.calledShot.objective,
    calledShotLocationNumber: preview.calledShot.locationNumber,
    calledShotPenalty: preview.calledShot.penalty,
    calledShotReason: preview.calledShot.reason,
    firingDurationInitiative: preview.delivery.firingDurationInitiative,
    roundsPerCadence: preview.delivery.roundsPerCadence,
    roundsDeclared: preview.delivery.declaredRounds,
    roundsLoadedBefore: preview.firearm.roundsLoaded,
    finalTarget: preview.finalTarget,
    frozenSnapshotJson: { ...preview, originalRequest },
    governingSnapshotJson: { request: preview.governing.request, snapshot: preview.governing.snapshot },
    rulingReasonsJson: preview.rulingReasons,
    idempotencyKey,
    createdByUserId: actorUserId,
  });
  await recordAttackEvent(tx, context, attackId, null, status, "firearm-attack-declared", actorUserId, "", {
    aimDeclarationId,
    aimPendingActionId,
    triggerDeclarationId,
    triggerPendingActionId,
    roundsDeclared: preview.delivery.declaredRounds,
  });
  return { attackId, status, reused: false };
}

type LockedAttack = typeof campaignSessionEncounterFirearmAttack.$inferSelect;

async function lockAttack(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  attackId: number,
): Promise<LockedAttack> {
  const [attack] = await tx.select().from(campaignSessionEncounterFirearmAttack).where(and(
    eq(campaignSessionEncounterFirearmAttack.id, positiveId(attackId, "Firearm Attack")),
    eq(campaignSessionEncounterFirearmAttack.encounterId, context.encounterId),
    eq(campaignSessionEncounterFirearmAttack.sceneId, context.sceneId),
    eq(campaignSessionEncounterFirearmAttack.sessionId, context.sessionId),
    eq(campaignSessionEncounterFirearmAttack.campaignId, context.campaignId),
  )).limit(1).for("update");
  if (!attack) throw new Error("That firearm attack does not belong to the exact Encounter context.");
  return attack;
}

async function cancellationTransition(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actor: FirearmAttackActor,
  attack: LockedAttack,
  reason: string,
): Promise<void> {
  const mayStopSustained = (attack.frozenSnapshotJson as FirearmAttackPreview).delivery.kind === "sustained"
    && attack.firingPortionsResolved < attack.firingDurationInitiative;
  if (attack.firedAt !== null && !mayStopSustained) throw new Error("A fired attack cannot be cancelled or restore ammunition.");
  const declarations = await tx.select({ id: campaignSessionEncounterActionDeclaration.id, status: campaignSessionEncounterActionDeclaration.status })
    .from(campaignSessionEncounterActionDeclaration)
    .where(inArray(campaignSessionEncounterActionDeclaration.id, [attack.aimDeclarationId, attack.triggerDeclarationId].filter((id): id is number => id !== null)))
    .for("update");
  for (const declaration of declarations) {
    if (!["resolved", "cancelled", "abandoned"].includes(declaration.status)) {
      await cancelActionDeclarationInTransaction(tx, context, actor, declaration.id, reason);
    }
  }
  const now = new Date();
  await tx.update(campaignSessionEncounterFirearmAttack).set({
    status: "cancelled",
    cancelledByUserId: actor.userId,
    cancelledAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
  await recordAttackEvent(tx, context, attack.id, attack.status as FirearmAttackStatus, "cancelled", "firearm-attack-cancelled", actor.userId, reason, {
    ammunitionConsumed: attack.roundsConsumed,
    accumulatedAimInitiativeLost: attack.aimInitiative,
  });
}

export async function cancelFirearmAttackInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: FirearmAttackActorInput,
  attackId: number,
  reasonInput: string,
): Promise<void> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  const attack = await lockAttack(tx, context, attackId);
  const actor = await resolveFirearmActor(tx, context, actorInput, attack.actorParticipantId);
  if (attack.status === "cancelled") return;
  await cancellationTransition(tx, context, actor, attack, boundedText(reasonInput, "Cancellation reason"));
}

export async function commitFirearmAttackTriggerInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: FirearmAttackActorInput,
  attackId: number,
  roll?: DeclarationRollInput,
): Promise<number> {
  return tx.transaction((triggerTx) => commitFirearmAttackTriggerInternal(triggerTx, context, actorInput, attackId, roll));
}

async function commitFirearmAttackTriggerInternal(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: FirearmAttackActorInput,
  attackId: number,
  roll?: DeclarationRollInput,
): Promise<number> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  const attack = await lockAttack(tx, context, attackId);
  const actor = await resolveFirearmActor(tx, context, actorInput, attack.actorParticipantId);
  if (attack.triggerPendingActionId !== null) return attack.triggerPendingActionId;
  if (attack.status !== "aiming" || attack.aimDeclarationId === null || attack.aimPendingActionId === null) {
    throw new Error("Only an attack with completed declared Aim may commit its trigger pull.");
  }
  const [state] = await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, attack.itemInstanceId)).limit(1).for("update");
  const identityChanged = !state
    || state.campaignId !== attack.campaignId
    || state.characterId !== attack.actorParticipantId
    || state.itemId !== attack.itemId
    || state.weaponProfileId !== attack.weaponProfileId
    || state.selectedFiringModeId !== attack.firingModeId;
  if (identityChanged) {
    throw new Error("The exact firearm/Profile/mode identity changed after Aim. Cancel this declaration and declare the new choice; its accumulated Aim cannot transfer to a different identity.");
  }
  if (state.version !== attack.stateVersionBefore || state.loadedRounds !== attack.roundsLoadedBefore || !state.readied || state.requiresCycling || state.requiresRecoilRecovery) {
    throw new Error("The exact firearm readiness state changed after Aim. Review or cancel the declaration before committing the trigger.");
  }
  const [aimDeclaration] = await tx.select({ status: campaignSessionEncounterActionDeclaration.status })
    .from(campaignSessionEncounterActionDeclaration).where(eq(campaignSessionEncounterActionDeclaration.id, attack.aimDeclarationId)).limit(1).for("update");
  const [aimPending] = await tx.select({ status: campaignSessionEncounterPendingAction.status, remaining: campaignSessionEncounterPendingAction.remainingInitiativeCost })
    .from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, attack.aimPendingActionId)).limit(1).for("update");
  const opportunities = await tx.select({ status: campaignSessionEncounterResponderOpportunity.status })
    .from(campaignSessionEncounterResponderOpportunity).where(eq(campaignSessionEncounterResponderOpportunity.declarationId, attack.aimDeclarationId));
  if (!aimDeclaration || !aimPending || aimPending.status !== "completed" || aimPending.remaining !== 0 || opportunities.some(({ status }) => status === "pending")) {
    throw new Error("Aim must reach Initiative completion and reconcile every responder opportunity before the trigger pull is committed.");
  }
  if (aimDeclaration.status !== "resolved") {
    await resolveActionDeclarationInTransaction(tx, context, actor, attack.aimDeclarationId, "Declared Aim completed; the separately locked trigger pull may now commit.");
  }
  await tx.update(campaignSessionEncounterFirearmAttack).set({ status: "trigger-ready", updatedAt: new Date() })
    .where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
  await recordAttackEvent(tx, context, attack.id, "aiming", "trigger-ready", "aim-completed", actor.userId, "", {
    aimInitiative: attack.aimInitiative,
    aimPendingActionId: attack.aimPendingActionId,
  });
  const triggerPendingActionId = await commitActionDeclarationInTransaction(tx, context, actor, attack.triggerDeclarationId, roll);
  await tx.update(campaignSessionEncounterFirearmAttack).set({
    status: "committed",
    triggerPendingActionId,
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
  await recordAttackEvent(tx, context, attack.id, "trigger-ready", "committed", "trigger-pull-initiative-committed", actor.userId, "", {
    triggerPendingActionId,
    triggerInitiativeCost: 1,
  });
  return triggerPendingActionId;
}

type ProtectionResolution = Readonly<{
  armor: number | null;
  soak: number | null;
  supported: boolean;
  snapshot: Record<string, unknown>;
  rulingReasons: readonly string[];
}>;

function directCreatureProtection(
  preview: FirearmAttackPreview,
  hitLocationNumber: number | null,
): ProtectionResolution {
  const reasons: string[] = [];
  const snapshot = preview.target.sourceSnapshot;
  const locations = isRecord(snapshot) && Array.isArray(snapshot.hitLocations) ? snapshot.hitLocations : [];
  const location = hitLocationNumber === null ? null : locations.find((entry) => isRecord(entry) && entry.hitLocationNumber === hitLocationNumber);
  if (!isRecord(location)) reasons.push("The frozen direct-Creature anatomy does not contain the resolved Hit Location.");
  const armor = isRecord(location) ? creatureProtectionValue(location.naturalArmor) : null;
  const soak = isRecord(location) ? creatureProtectionValue(location.soak) : null;
  if (armor === null || soak === null) reasons.push("The exact Creature location needs authored numeric armor and Soak or a G.O.D. ruling.");
  if ((armor !== null && armor < 0) || (soak !== null && soak < 0)) reasons.push("Frozen Creature armor or soak is negative and requires a G.O.D. ruling.");
  if (isRecord(location) && typeof location.locationEffect === "string" && location.locationEffect.trim()) {
    reasons.push("The authored Creature Hit Location has an unsupported special location effect.");
  }
  return {
    armor: armor !== null && armor >= 0 ? armor : null,
    soak: soak !== null && soak >= 0 ? soak : null,
    supported: reasons.length === 0,
    snapshot: { participantKind: "creature", frozenLocation: location ?? null },
    rulingReasons: reasons,
  };
}

async function persistentCharacterProtection(
  tx: FirearmAttackTransaction,
  preview: FirearmAttackPreview,
  hitLocationNumber: number | null,
): Promise<ProtectionResolution> {
  const reasons: string[] = [];
  if (hitLocationNumber === null) {
    return { armor: null, soak: null, supported: false, snapshot: { participantKind: "campaign-character", hitLocationNumber: null }, rulingReasons: ["Armor and soak require an exact Hit Location."] };
  }
  const equipment = await readCharacterEquipmentStateInTransaction(tx, positiveId(preview.target.participantId, "Target Character"));
  const relevantArmor = equipment.wornArmor.filter(({ coveredLocationKeys }) => coveredLocationKeys.includes(String(hitLocationNumber)));
  const itemIds = [...new Set(relevantArmor.map(({ itemId }) => itemId))];
  const damageModifiers = itemIds.length ? await tx.select().from(itemArmorDamageModifier)
    .where(inArray(itemArmorDamageModifier.itemId, itemIds)).orderBy(asc(itemArmorDamageModifier.itemId), asc(itemArmorDamageModifier.sortOrder), asc(itemArmorDamageModifier.id)) : [];
  if (relevantArmor.length > 1) reasons.push("Multiple worn armor sources cover this Hit Location; no stacking rule was invented.");
  if (relevantArmor.some(({ baseSoak }) => baseSoak === null)) reasons.push("Location-relevant armor has no authored numeric base soak.");
  if (damageModifiers.length) reasons.push("Authored free-text armor damage-type modifiers require a G.O.D. ruling.");
  const activeEffects = await readActiveEffectsInTransaction(tx, preview.target.participantId);
  const activeSoak = getActiveModifierTotal(activeEffects.modifiers, "soak", "self");
  if (activeSoak < 0) reasons.push("A negative active soak modifier requires a G.O.D. ruling for firearm protection.");
  const armor = relevantArmor.length === 0 ? 0 : relevantArmor.length === 1 ? relevantArmor[0]!.baseSoak : null;
  return {
    armor,
    soak: activeSoak >= 0 ? activeSoak : null,
    supported: reasons.length === 0,
    snapshot: {
      participantKind: "campaign-character",
      hitLocationNumber,
      wornArmor: relevantArmor,
      activeSoakModifier: activeSoak,
      damageType: preview.authoredDamage.damageType,
      unsupportedDamageModifiers: damageModifiers,
    },
    rulingReasons: reasons,
  };
}

async function resolveProtection(
  tx: FirearmAttackTransaction,
  preview: FirearmAttackPreview,
  hitLocationNumber: number | null,
): Promise<ProtectionResolution> {
  return preview.target.participantKind === "creature"
    ? directCreatureProtection(preview, hitLocationNumber)
    : persistentCharacterProtection(tx, preview, hitLocationNumber);
}

async function ensureFirearmStillFireable(
  tx: FirearmAttackTransaction,
  attack: LockedAttack,
): Promise<typeof campaignCharacterFirearmState.$inferSelect> {
  const [state] = await tx.select().from(campaignCharacterFirearmState).where(and(
    eq(campaignCharacterFirearmState.itemInstanceId, attack.itemInstanceId),
    eq(campaignCharacterFirearmState.campaignId, attack.campaignId),
    eq(campaignCharacterFirearmState.characterId, attack.actorParticipantId),
    eq(campaignCharacterFirearmState.itemId, attack.itemId),
    eq(campaignCharacterFirearmState.weaponProfileId, attack.weaponProfileId),
  )).limit(1).for("update");
  if (!state) throw new Error("The exact owned firearm state no longer exists.");
  if (state.version !== attack.stateVersionBefore) throw new Error("The firearm runtime state changed after declaration; firing was rejected before Roll or ammunition consumption.");
  if (state.selectedFiringModeId !== attack.firingModeId) throw new Error("The exact Firing Mode changed after declaration; accumulated Aim is no longer valid.");
  if (!state.readied || state.requiresCycling || state.requiresRecoilRecovery) throw new Error("The firearm is no longer authoritatively ready.");
  if (state.loadedAmmunitionItemId !== attack.ammunitionItemId || state.loadedAmmunitionProfileId !== attack.ammunitionProfileId) {
    throw new Error("The exact loaded ammunition identity changed after declaration.");
  }
  if (state.loadedRounds !== attack.roundsLoadedBefore || state.loadedRounds < attack.roundsDeclared) {
    throw new Error("Loaded rounds changed after declaration or no longer cover the declared delivery.");
  }
  const [owned] = await tx.select({ equipmentState: campaignCharacterItemInstance.equipmentState }).from(campaignCharacterItemInstance).where(and(
    eq(campaignCharacterItemInstance.id, attack.itemInstanceId),
    eq(campaignCharacterItemInstance.characterId, attack.actorParticipantId),
    eq(campaignCharacterItemInstance.itemId, attack.itemId),
    isNull(campaignCharacterItemInstance.retiredAt),
  )).limit(1);
  if (!owned || owned.equipmentState !== "wielded") throw new Error("The exact firearm is no longer wielded by the attacker.");
  const [openPreparation] = await tx.select({ id: campaignCharacterFirearmPreparation.id }).from(campaignCharacterFirearmPreparation).where(and(
    eq(campaignCharacterFirearmPreparation.itemInstanceId, attack.itemInstanceId),
    inArray(campaignCharacterFirearmPreparation.status, ["pending", "interrupted", "requires-god-ruling"]),
  )).limit(1);
  if (openPreparation) throw new Error("An unresolved firearm preparation blocks firing.");
  return state;
}

async function createFirearmEffectPlan(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorUserId: string,
  attack: LockedAttack,
): Promise<number> {
  const sustained = (attack.frozenSnapshotJson as FirearmAttackPreview).delivery.kind === "sustained";
  const portion = sustained ? attack.firingPortionsResolved : 0;
  if (!sustained && attack.effectPlanId !== null) return attack.effectPlanId;
  if (attack.attackRollId === null || attack.attackRollSnapshotJson === null || attack.bulletAllocationJson === null || attack.triggerPendingActionId === null) {
    throw new Error("A firearm consequence plan requires the immutable attack Roll, allocation, and trigger action identities.");
  }
  const [existing] = await tx.select({ id: campaignSessionEncounterEffectPlan.id }).from(campaignSessionEncounterEffectPlan)
    .where(and(eq(campaignSessionEncounterEffectPlan.declarationId, attack.triggerDeclarationId), eq(campaignSessionEncounterEffectPlan.firearmPortion, portion))).limit(1).for("update");
  if (existing) {
    await tx.update(campaignSessionEncounterFirearmAttack).set({ effectPlanId: existing.id, updatedAt: new Date() })
      .where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
    return existing.id;
  }
  const [pending] = await tx.select().from(campaignSessionEncounterPendingAction).where(and(
    eq(campaignSessionEncounterPendingAction.id, attack.triggerPendingActionId),
    eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!pending || (sustained ? portion < 1 || pending.initiativeSpent < portion : pending.status !== "completed" || pending.remainingInitiativeCost !== 0)) {
    throw new Error("Firearm consequences remain recoverably pending until all original and defense-added Initiative Cost completes.");
  }
  const preview = attack.frozenSnapshotJson as FirearmAttackPreview;
  const allBulletRows = await tx.select().from(campaignSessionEncounterFirearmBullet)
    .where(eq(campaignSessionEncounterFirearmBullet.attackId, attack.id))
    .orderBy(asc(campaignSessionEncounterFirearmBullet.bulletIndex)).for("update");
  const bulletRows = sustained ? allBulletRows.filter(({ bulletIndex }) => Math.ceil(bulletIndex / attack.roundsPerCadence) === portion) : allBulletRows;
  const attackRulings = jsonArray(attack.rulingReasonsJson);
  const bulletRulings = bulletRows.flatMap(({ rulingReasonsJson }) => jsonArray(rulingReasonsJson));
  const requiresGodRuling = attackRulings.length > 0 || bulletRulings.length > 0;
  const planStatus = requiresGodRuling ? "requires-god-ruling" as const : "calculated" as const;
  const sourceIdentity = `firearm-attack:${attack.id};instance:${attack.itemInstanceId};profile:${attack.weaponProfileId};mode:${attack.firingModeId};ammo:${attack.ammunitionProfileId}`;
  const sourceSnapshot = {
    schemaVersion: 1 as const,
    kind: "weapon" as const,
    identity: sourceIdentity,
    sourceId: attack.weaponProfileId,
    sourceInstanceId: attack.itemInstanceId,
    ownerParticipantId: attack.actorParticipantId,
    displayName: `${preview.firearm.itemName} — ${preview.firearm.firingModeName}`,
    authoringHref: `/heavens/items?item=${attack.itemId}`,
    liveRevision: null,
    resolutionMode: "opposed-roll" as const,
    governingSource: preview.governing.request,
    governingSnapshot: preview.governing.snapshot,
    authoredData: {
      firearmAttackId: attack.id,
      frozenFirearmAttack: preview,
      bulletAllocation: attack.bulletAllocationJson,
      damageResolution: attack.damageResolutionJson,
      postShotState: attack.postShotStateJson,
    },
    resourceCosts: [],
    effects: [],
    warnings: [...new Set([...attackRulings, ...bulletRulings])],
  };
  const [created] = await tx.insert(campaignSessionEncounterEffectPlan).values({
    declarationId: attack.triggerDeclarationId,
    pendingActionId: attack.triggerPendingActionId,
    firearmPortion: portion,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    actorParticipantId: attack.actorParticipantId,
    sourceKind: "weapon",
    sourceIdentity,
    sourceId: String(attack.weaponProfileId),
    sourceInstanceId: attack.itemInstanceId,
    status: planStatus,
    targetSnapshotJson: [{ participantId: attack.targetParticipantId, kind: preview.target.participantKind, name: preview.target.name }],
    sourceSnapshotJson: sourceSnapshot,
    governingRollSnapshotJson: attack.attackRollSnapshotJson,
    defenseResolutionJson: attack.defenseResolutionJson,
    initiativeCommitmentJson: {
      status: pending.status,
      originalInitiativeCost: pending.originalInitiativeCost,
      additionalInitiativeCost: pending.additionalInitiativeCost,
      initiativeSpent: pending.initiativeSpent,
      remainingInitiativeCost: pending.remainingInitiativeCost,
      startInitiative: pending.startInitiative,
      startTimelineInitiative: pending.startTimelineInitiative,
      expectedCompletionInitiative: pending.expectedCompletionInitiative,
      startedRound: pending.startedRound,
      completedRound: pending.completedRound,
      triggerPullInitiativeCost: 1,
      firingPortion: portion,
      cumulativeRoundsConsumed: attack.roundsConsumed,
      aimInitiativeCost: attack.aimInitiative,
    },
    resourceCostsJson: [],
    sourceDivergenceJson: null,
    explanation: requiresGodRuling
      ? "The firearm attack is frozen and ammunition is consumed. At least one critical, anatomy, damage, armor, soak, or allocation fact requires an explicit G.O.D. ruling before application."
      : "Every proposed Health consequence is derived from the immutable attack Roll, independent defenses, frozen firearm/ammunition damage, Hit Location, and per-bullet protection.",
    createdByUserId: actorUserId,
  }).returning({ id: campaignSessionEncounterEffectPlan.id });
  if (!created) throw new Error("The firearm Action Effect Plan could not be saved.");

  const effects: Array<typeof campaignSessionEncounterEffect.$inferInsert> = [];
  for (const bullet of bulletRows.filter(({ status }) => status !== "cancelled-by-defense")) {
    const rulings = jsonArray(bullet.rulingReasonsJson);
    const application = bullet.hitLocationNumber === null ? {} : {
      hitLocationNumber: bullet.hitLocationNumber,
      ...(bullet.hpPoolKey ? { poolKey: bullet.hpPoolKey } : {}),
    };
    const metadata = {
      firearmAttackId: attack.id,
      bulletId: bullet.id,
      bulletIndex: bullet.bulletIndex,
      hitLocationNumber: bullet.hitLocationNumber,
      hitLocationName: bullet.hitLocationName,
      authoredDamage: bullet.authoredDamage,
      calledShotDexModifier: bullet.dexDamageModifier,
      additionalSuccessDamage: bullet.additionalSuccessDamage,
      grossDamage: bullet.grossDamage,
      armor: bullet.armor,
      soak: bullet.soak,
      proposedNetDamage: bullet.proposedNetDamage,
      armorSnapshot: bullet.armorSnapshotJson,
      rulingReasons: rulings,
    };
    if (bullet.proposedNetDamage !== null && bullet.proposedNetDamage > 0 && bullet.hitLocationNumber !== null && bullet.hpPoolKey) {
      effects.push({
        planId: created.id,
        encounterId: context.encounterId,
        sceneId: context.sceneId,
        sessionId: context.sessionId,
        campaignId: context.campaignId,
        targetParticipantId: attack.targetParticipantId,
        effectKey: `firearm-bullet:${bullet.bulletIndex}`,
        effectType: "health.damage",
        sourceKind: "weapon",
        sourceIdentity,
        authoredValueJson: metadata,
        calculatedValueJson: bullet.proposedNetDamage,
        finalValueJson: { effect: { kind: "health.damage", amount: bullet.proposedNetDamage, application: "localized" }, application },
        unit: "Health",
        resource: bullet.hpPoolKey,
        applicationSupported: rulings.length === 0,
        godReviewRequired: rulings.length > 0,
        status: rulings.length ? "requires-god-ruling" : "calculated",
        amendmentReason: "",
      });
    } else if (bullet.proposedNetDamage === 0 && rulings.length === 0) {
      effects.push({
        planId: created.id,
        encounterId: context.encounterId,
        sceneId: context.sceneId,
        sessionId: context.sessionId,
        campaignId: context.campaignId,
        targetParticipantId: attack.targetParticipantId,
        effectKey: `firearm-bullet:${bullet.bulletIndex}`,
        effectType: "firearm.bullet-fully-absorbed",
        sourceKind: "weapon",
        sourceIdentity,
        authoredValueJson: metadata,
        calculatedValueJson: 0,
        finalValueJson: null,
        unit: "Health",
        resource: bullet.hpPoolKey,
        applicationSupported: false,
        godReviewRequired: false,
        status: "declined",
        amendmentReason: "Objective per-bullet armor and soak reduced proposed net damage to zero.",
      });
    } else {
      effects.push({
        planId: created.id,
        encounterId: context.encounterId,
        sceneId: context.sceneId,
        sessionId: context.sessionId,
        campaignId: context.campaignId,
        targetParticipantId: attack.targetParticipantId,
        effectKey: `firearm-bullet:${bullet.bulletIndex}`,
        effectType: "manual",
        sourceKind: "weapon",
        sourceIdentity,
        authoredValueJson: metadata,
        calculatedValueJson: bullet.proposedNetDamage,
        finalValueJson: { effect: { kind: "manual", title: `Firearm bullet ${bullet.bulletIndex}`, description: rulings.join(" ") || "Firearm consequence requires review." }, application },
        unit: "instruction",
        resource: bullet.hpPoolKey,
        applicationSupported: false,
        godReviewRequired: true,
        status: "requires-god-ruling",
        amendmentReason: "",
      });
    }
  }
  const allocation = attack.bulletAllocationJson as FirearmBulletAllocation;
  if (allocation.overflowDamage > 0 && (!sustained || portion === attack.firingDurationInitiative)) {
    const firstLocation = allBulletRows.find(({ status, hitLocationNumber }) => status !== "cancelled-by-defense" && hitLocationNumber !== null);
    const supported = firstLocation?.hitLocationNumber !== null && Boolean(firstLocation?.hpPoolKey);
    effects.push({
      planId: created.id,
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      targetParticipantId: attack.targetParticipantId,
      effectKey: "firearm-overflow-damage",
      effectType: supported ? "health.damage" : "manual",
      sourceKind: "weapon",
      sourceIdentity,
      authoredValueJson: { overflowSuccesses: allocation.overflowSuccesses, overflowDamage: allocation.overflowDamage, separateFromBulletDamage: true },
      calculatedValueJson: allocation.overflowDamage,
      finalValueJson: supported ? {
        effect: { kind: "health.damage", amount: allocation.overflowDamage, application: "localized" },
        application: { hitLocationNumber: firstLocation!.hitLocationNumber, poolKey: firstLocation!.hpPoolKey },
      } : { effect: { kind: "manual", title: "Firearm overflow damage", description: "Overflow damage has no objectively resolved Hit Location." }, application: {} },
      unit: supported ? "Health" : "instruction",
      resource: firstLocation?.hpPoolKey ?? "",
      applicationSupported: supported,
      godReviewRequired: !supported,
      status: supported ? "calculated" : "requires-god-ruling",
      amendmentReason: "",
    });
  }
  if (attack.calledShotDeclared
    && (!sustained || portion === attack.firingDurationInitiative)
    && preview.delivery.kind !== "single"
    && allocation.survivingBulletHits > 0
    && preview.dexDamageModifier !== 0) {
    effects.push({
      planId: created.id,
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      targetParticipantId: attack.targetParticipantId,
      effectKey: "firearm-called-automatic-dex",
      effectType: "manual",
      sourceKind: "weapon",
      sourceIdentity,
      authoredValueJson: {
        calledShotObjective: attack.calledShotObjective,
        calledShotLocationNumber: attack.calledShotLocationNumber,
        dexDamageModifier: preview.dexDamageModifier,
        appliedPerBullet: false,
      },
      calculatedValueJson: preview.dexDamageModifier,
      finalValueJson: {
        effect: {
          kind: "manual",
          title: "Called burst/automatic DEX damage modifier",
          description: "The single DEX damage modifier is preserved once for G.O.D. placement and was not applied to each bullet.",
        },
        application: attack.calledShotLocationNumber === null
          ? {}
          : { hitLocationNumber: attack.calledShotLocationNumber },
      },
      unit: "instruction",
      resource: "",
      applicationSupported: false,
      godReviewRequired: true,
      status: "requires-god-ruling",
      amendmentReason: "",
    });
  }
  if (attackRulings.length) {
    effects.push({
      planId: created.id,
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      targetParticipantId: attack.targetParticipantId,
      effectKey: "firearm-ruling-boundary",
      effectType: "manual",
      sourceKind: "weapon",
      sourceIdentity,
      authoredValueJson: { criticalFacts: attack.bulletAllocationJson, rulingReasons: attackRulings },
      calculatedValueJson: null,
      finalValueJson: { effect: { kind: "manual", title: "Firearm attack ruling", description: attackRulings.join(" ") }, application: {} },
      unit: "instruction",
      resource: "",
      applicationSupported: false,
      godReviewRequired: true,
      status: "requires-god-ruling",
      amendmentReason: "",
    });
  }
  if (effects.length) await tx.insert(campaignSessionEncounterEffect).values(effects);
  await tx.insert(campaignSessionEncounterEffectPlanEvent).values({
    planId: created.id,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    fromStatus: null,
    toStatus: planStatus,
    eventKind: "firearm-effect-plan-generated",
    reason: "",
    metadata: { firearmAttackId: attack.id, attackRollId: attack.attackRollId, effectCount: effects.length },
    actorUserId,
  });
  const nextStatus: FirearmAttackStatus = requiresGodRuling ? "requires-god-ruling" : "consequence-planned";
  await tx.update(campaignSessionEncounterFirearmAttack).set({ effectPlanId: created.id, status: nextStatus, updatedAt: new Date() })
    .where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
  await recordAttackEvent(tx, context, attack.id, attack.status as FirearmAttackStatus, nextStatus, "firearm-effect-plan-generated", actorUserId, "", { effectPlanId: created.id });
  return created.id;
}

export type FirearmAttackRollCommand = Readonly<{
  method: RollMethod;
  enteredTotal?: number | null;
  visibility?: RollVisibility;
  notes?: string;
}>;

export type FirearmAttackFireResult = Readonly<{
  attackId: number;
  rollId: number;
  effectPlanId: number | null;
  status: FirearmAttackStatus;
  roundsConsumed: number;
  reused: boolean;
  waitingForDefenseRolls: boolean;
}>;

async function firearmDefenseAllocationInputs(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  defense: DefenseGroupOutcome,
): Promise<readonly FirearmDefenseAllocationInput[]> {
  const reactionIds = defense.outcomes.map(({ reactionId }) => reactionId);
  if (!reactionIds.length) return [];
  const reactions = await tx.select({
    id: campaignSessionEncounterReaction.id,
    defenderParticipantId: campaignSessionEncounterReaction.reactorCharacterId,
  }).from(campaignSessionEncounterReaction).where(and(
    eq(campaignSessionEncounterReaction.encounterId, context.encounterId),
    eq(campaignSessionEncounterReaction.sceneId, context.sceneId),
    eq(campaignSessionEncounterReaction.sessionId, context.sessionId),
    eq(campaignSessionEncounterReaction.campaignId, context.campaignId),
    inArray(campaignSessionEncounterReaction.id, reactionIds),
  )).orderBy(asc(campaignSessionEncounterReaction.id));
  const rolls = await tx.select({
    id: campaignSessionRoll.id,
    reactionId: campaignSessionRoll.reactionId,
  }).from(campaignSessionRoll).where(and(
    eq(campaignSessionRoll.encounterId, context.encounterId),
    eq(campaignSessionRoll.sceneId, context.sceneId),
    eq(campaignSessionRoll.sessionId, context.sessionId),
    eq(campaignSessionRoll.campaignId, context.campaignId),
    inArray(campaignSessionRoll.reactionId, reactionIds),
  )).orderBy(asc(campaignSessionRoll.id));
  const defenderByReaction = new Map(reactions.map((reaction) => [reaction.id, reaction.defenderParticipantId]));
  const rollByReaction = new Map(rolls.flatMap((roll) => roll.reactionId === null
    ? []
    : [[roll.reactionId, roll.id] as const]));
  return defense.outcomes.map((outcome) => {
    const defenderParticipantId = defenderByReaction.get(outcome.reactionId);
    if (defenderParticipantId === undefined) {
      throw new Error(`Defense Reaction #${outcome.reactionId} is outside the exact encounter hierarchy.`);
    }
    const rulingReasons = outcome.defenseSucceeded === null
      ? [
          `Defense Reaction #${outcome.reactionId} is ${outcome.status}; no bullet cancellation was guessed.`,
          ...(outcome.comparison?.rulingReasons ?? []).map((reason) => `Defense Reaction #${outcome.reactionId}: ${reason}.`),
        ]
      : [];
    return {
      reactionId: outcome.reactionId,
      defenderParticipantId,
      defenseRollId: rollByReaction.get(outcome.reactionId) ?? null,
      defenseTotalSuccesses: outcome.comparison?.defenseTotalSuccesses ?? null,
      applicable: outcome.defenseSucceeded,
      rulingReasons,
    };
  });
}

function unresolvedDefenseReasons(defense: DefenseGroupOutcome): string[] {
  const reasons: string[] = [];
  if (defense.status === "awaiting-god-ruling") {
    reasons.push("At least one defense or intervention has an unresolved critical or G.O.D. disposition.");
  }
  if (defense.status === "unresolved") {
    reasons.push("The independent defense group is unresolved.");
  }
  return reasons;
}

export async function fireFirearmAttackInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: FirearmAttackActorInput,
  attackId: number,
  input: FirearmAttackRollCommand,
  deferPortionApplication = false,
): Promise<FirearmAttackFireResult> {
  return tx.transaction((fireTx) => fireFirearmAttackInternal(fireTx, context, actorInput, attackId, input, deferPortionApplication));
}

async function fireFirearmAttackInternal(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: FirearmAttackActorInput,
  attackId: number,
  input: FirearmAttackRollCommand,
  deferPortionApplication: boolean,
): Promise<FirearmAttackFireResult> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  const attack = await lockAttack(tx, context, attackId);
  const actor = await resolveFirearmActor(tx, context, actorInput, attack.actorParticipantId);
  const actorUserId = actor.userId;
  if (attack.attackRollId !== null) {
    if ((attack.frozenSnapshotJson as FirearmAttackPreview).delivery.kind === "sustained" && attack.status !== "cancelled") {
      return continueSustainedFireInTransaction(tx, context, actor, attack, deferPortionApplication);
    }
    return {
      attackId: attack.id,
      rollId: attack.attackRollId,
      effectPlanId: attack.effectPlanId,
      status: attack.status as FirearmAttackStatus,
      roundsConsumed: attack.roundsConsumed,
      reused: true,
      waitingForDefenseRolls: false,
    };
  }
  if (attack.status !== "committed" || attack.triggerPendingActionId === null) {
    throw new Error("Only an exact committed trigger pull may fire this weapon.");
  }
  const state = await ensureFirearmStillFireable(tx, attack);
  const [pending] = await tx.select().from(campaignSessionEncounterPendingAction).where(and(
    eq(campaignSessionEncounterPendingAction.id, attack.triggerPendingActionId),
    eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId),
  )).limit(1).for("update");
  const sustained = (attack.frozenSnapshotJson as FirearmAttackPreview).delivery.kind === "sustained";
  if (!pending || (sustained ? pending.initiativeSpent < 1 || !["active", "completed"].includes(pending.status) : pending.status !== "completed" || pending.remainingInitiativeCost !== 0)) {
    throw new Error("The committed firearm action must finish before ammunition and bullet consequences are applied. Its declaration Roll is preserved.");
  }
  const firingPoint = pending.expectedCompletionInitiative + pending.remainingInitiativeCost;
  const opportunities = await tx.select({ status: campaignSessionEncounterResponderOpportunity.status, reachedAtInitiative: campaignSessionEncounterResponderOpportunity.reachedAtInitiative, source: campaignSessionEncounterResponderOpportunity.source })
    .from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, attack.triggerDeclarationId));
  if (opportunities.some(({ status, reachedAtInitiative, source }) => status === "pending" && (!sustained || source === "god-exception" || reachedAtInitiative >= firingPoint))) {
    throw new Error("Every trigger-pull responder opportunity must be reconciled before firing.");
  }

  const [stagedRoll] = await tx.select({ id: campaignSessionRoll.id }).from(campaignSessionRoll).where(and(
    eq(campaignSessionRoll.pendingActionId, attack.triggerPendingActionId),
    eq(campaignSessionRoll.encounterId, context.encounterId),
    eq(campaignSessionRoll.status, "recorded"),
  )).limit(1);
  const roll = stagedRoll
    ? await readEffectiveRollSnapshotInTransaction(tx, {
        userId: actor.userId,
        campaignId: context.campaignId,
        readAs: actor.authority,
        canRecordGodOnly: actor.authority === "god-owner",
        characterId: actor.authority === "player" ? actor.characterId : null,
      } satisfies AuthorizedRollActor, stagedRoll.id)
    : await recordDeclaredAttackRollInTransaction(tx, context, actor, attack.triggerDeclarationId, input);
  if (!roll.mechanicalSnapshot) throw new Error("The firearm Roll did not produce an immutable mechanical snapshot.");
  const defense = await resolveDeclaredDefensesIfReadyInTransaction(tx, context, actor, attack.triggerDeclarationId, sustained ? firingPoint : undefined);
  if (defense === null) {
    if (sustained) throw new Error("Resolve the responses at this firing point before sustained fire advances.");
    return {
      attackId: attack.id,
      rollId: roll.id,
      effectPlanId: null,
      status: "committed",
      roundsConsumed: 0,
      reused: false,
      waitingForDefenseRolls: true,
    };
  }
  if (defense.status === "unresolved") throw new Error("The complete independent defense group could not be resolved.");
  const defenseInputs = await firearmDefenseAllocationInputs(tx, context, defense);
  const preview = attack.frozenSnapshotJson as FirearmAttackPreview;
  const allocation = allocateFirearmBullets({
    delivery: preview.delivery,
    resolution: roll.mechanicalSnapshot.resolution,
    calledShot: attack.calledShotDeclared,
    defenses: defenseInputs,
  });
  const hitLocationNumber = attack.calledShotDeclared
    ? attack.calledShotLocationNumber
    : getHitLocationFromPercentile(roll.mechanicalSnapshot.resolution.resultTotal);
  const hitLocation = hitLocationNumber === null
    ? null
    : preview.target.anatomy?.hitLocations.find(({ result }) => result === hitLocationNumber) ?? null;
  const protection = await resolveProtection(tx, preview, hitLocationNumber);
  const postShot = postShotReadinessFromAuthoredTiming({
    effectiveCyclingInitiativeCost: preview.firearm.effectiveCyclingInitiativeCost,
    effectiveRecoilResetInitiativeCost: preview.firearm.effectiveRecoilResetInitiativeCost,
  });
  const defenseRulings = unresolvedDefenseReasons(defense);
  const locationRulings = hitLocation ? [] : ["The exact frozen target anatomy does not contain the resolved Hit Location."];
  const calledAutomaticDexRulings = attack.calledShotDeclared
    && preview.delivery.kind !== "single"
    && allocation.survivingBulletHits > 0
    && preview.dexDamageModifier !== 0
      ? ["The Called burst/automatic DEX damage modifier placement requires G.O.D. review; it was preserved once and was not applied per bullet."]
      : [];
  const attackRulings = [...new Set([
    ...jsonArray(attack.rulingReasonsJson),
    ...allocation.rulingReasons,
    ...defenseRulings,
    ...locationRulings,
    ...calledAutomaticDexRulings,
  ])];
  const cancelledReactionIds = allocation.defenseContributions.flatMap(({ reactionId, bulletsCancelled }) => (
    Array.from({ length: bulletsCancelled }, () => reactionId)
  ));
  const bullets: Array<typeof campaignSessionEncounterFirearmBullet.$inferInsert> = [];
  const damageRows: Array<Record<string, unknown>> = [];
  for (let index = 1; index <= allocation.initialBulletHits; index += 1) {
    const cancelledByReactionId = cancelledReactionIds[index - 1] ?? null;
    if (cancelledByReactionId !== null) {
      bullets.push({
        attackId: attack.id,
        encounterId: context.encounterId,
        sceneId: context.sceneId,
        sessionId: context.sessionId,
        campaignId: context.campaignId,
        bulletIndex: index,
        status: "cancelled-by-defense",
        cancelledByReactionId,
        hitLocationNumber,
        hitLocationName: hitLocation?.name ?? "",
        hpPoolKey: hitLocation?.poolKey ?? "",
        armorSnapshotJson: { cancelledBeforeDamage: true, defenseReactionId: cancelledByReactionId },
        rulingReasonsJson: [],
      });
      damageRows.push({ bulletIndex: index, cancelledByReactionId, proposedNetDamage: null });
      continue;
    }
    const damage = calculateFirearmBulletDamage({
      authoredBulletDamage: preview.authoredDamage.numeric,
      calledShot: attack.calledShotDeclared,
      deliveryKind: preview.delivery.kind,
      dexDamageModifier: preview.dexDamageModifier,
      additionalSuccesses: roll.mechanicalSnapshot.resolution.additionalSuccesses,
      armor: protection.armor,
      soak: protection.soak,
      protectionSupported: protection.supported && hitLocation !== null && Boolean(hitLocation.poolKey),
      rulingReasons: [...protection.rulingReasons, ...locationRulings],
    });
    bullets.push({
      attackId: attack.id,
      encounterId: context.encounterId,
      sceneId: context.sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      bulletIndex: index,
      status: damage.requiresGodRuling ? "requires-god-ruling" : "surviving",
      hitLocationNumber,
      hitLocationName: hitLocation?.name ?? "",
      hpPoolKey: hitLocation?.poolKey ?? "",
      authoredDamage: damage.authoredBulletDamage,
      dexDamageModifier: damage.calledShotDexModifier,
      additionalSuccessDamage: damage.calledShotAdditionalSuccessDamage,
      grossDamage: damage.grossDamage,
      armor: damage.armor,
      soak: damage.soak,
      proposedNetDamage: damage.netDamage,
      armorSnapshotJson: protection.snapshot,
      rulingReasonsJson: damage.rulingReasons,
    });
    damageRows.push({ bulletIndex: index, ...damage });
  }
  if (bullets.length) await tx.insert(campaignSessionEncounterFirearmBullet).values(bullets);

  const roundsForPortion = sustained ? Math.min(attack.roundsPerCadence, attack.roundsDeclared) : attack.roundsDeclared;
  const roundsLoadedAfter = state.loadedRounds - roundsForPortion;
  const now = new Date();
  const beforeState = { ...state };
  const afterState = {
    ...state,
    loadedAmmunitionItemId: roundsLoadedAfter === 0 ? null : state.loadedAmmunitionItemId,
    loadedAmmunitionProfileId: roundsLoadedAfter === 0 ? null : state.loadedAmmunitionProfileId,
    loadedAmmunitionUnitCostCredits: roundsLoadedAfter === 0 ? null : state.loadedAmmunitionUnitCostCredits,
    loadedRounds: roundsLoadedAfter,
    requiresCycling: !sustained || attack.firingDurationInitiative === 1 ? postShot.requiresCycling : false,
    requiresRecoilRecovery: !sustained || attack.firingDurationInitiative === 1 ? postShot.requiresRecoilRecovery : false,
    version: state.version + 1,
    updatedByUserId: actorUserId,
    updatedAt: now,
  };
  await tx.update(campaignCharacterFirearmState).set({
    loadedAmmunitionItemId: afterState.loadedAmmunitionItemId,
    loadedAmmunitionProfileId: afterState.loadedAmmunitionProfileId,
    loadedAmmunitionUnitCostCredits: afterState.loadedAmmunitionUnitCostCredits,
    loadedRounds: afterState.loadedRounds,
    requiresCycling: afterState.requiresCycling,
    requiresRecoilRecovery: afterState.requiresRecoilRecovery,
    version: afterState.version,
    updatedByUserId: actorUserId,
    updatedAt: now,
  }).where(and(
    eq(campaignCharacterFirearmState.itemInstanceId, state.itemInstanceId),
    eq(campaignCharacterFirearmState.version, state.version),
  ));
  await tx.insert(campaignCharacterFirearmEvent).values({
    itemInstanceId: state.itemInstanceId,
    campaignId: state.campaignId,
    characterId: state.characterId,
    eventKind: "firearm-attack-fired",
    beforeStateJson: beforeState,
    afterStateJson: afterState,
    metadataJson: {
      firearmAttackId: attack.id,
      attackRollId: roll.id,
      roundsConsumed: roundsForPortion,
      firingPortion: 1,
      hitLocationNumber,
      postShot,
    },
    actorUserId,
  });
  const damageResolution = {
    schemaVersion: 1,
    calledShotValidAtRoll: !attack.calledShotDeclared || (
      attack.calledShotLocationNumber !== null
      && hitLocation !== null
      && hitLocation.result === attack.calledShotLocationNumber
    ),
    hitLocation: hitLocation === null ? null : { result: hitLocation.result, name: hitLocation.name, poolKey: hitLocation.poolKey },
    authoredDamage: preview.authoredDamage,
    calledShotDexModifierApplied: attack.calledShotDeclared && preview.delivery.kind === "single" ? preview.dexDamageModifier : 0,
    calledAutomaticDexModifierReview: attack.calledShotDeclared
      && preview.delivery.kind !== "single"
      && allocation.survivingBulletHits > 0
      && preview.dexDamageModifier !== 0
        ? {
            amount: preview.dexDamageModifier,
            placement: "god-review-required",
            appliedPerBullet: false,
          }
        : null,
    additionalSuccessesApplied: attack.calledShotDeclared && preview.delivery.kind === "single" ? roll.mechanicalSnapshot.resolution.additionalSuccesses : 0,
    protection: protection.snapshot,
    bullets: damageRows,
    overflowDamage: allocation.overflowDamage,
  };
  await tx.update(campaignSessionEncounterFirearmAttack).set({
    attackRollId: roll.id,
    attackRollSnapshotJson: roll.mechanicalSnapshot,
    defenseResolutionJson: defense,
    bulletAllocationJson: allocation,
    damageResolutionJson: damageResolution,
    postShotStateJson: postShot,
    roundsConsumed: roundsForPortion,
    firingPortionsResolved: sustained ? 1 : 0,
    roundsLoadedAfter,
    rulingReasonsJson: attackRulings,
    status: "fired-awaiting-timing",
    firedByUserId: actorUserId,
    firedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
  await recordAttackEvent(tx, context, attack.id, "committed", "fired-awaiting-timing", "firearm-fired", actorUserId, "", {
    attackRollId: roll.id,
    roundsConsumed: roundsForPortion,
    firingPortion: 1,
    roundsLoadedAfter,
    bulletAllocation: allocation,
    postShot,
  });

  const [updatedPending] = await tx.select().from(campaignSessionEncounterPendingAction)
    .where(eq(campaignSessionEncounterPendingAction.id, attack.triggerPendingActionId)).limit(1);
  let effectPlanId: number | null = null;
  let status: FirearmAttackStatus = "fired-awaiting-timing";
  if (sustained || updatedPending?.status === "completed" && updatedPending.remainingInitiativeCost === 0) {
    const updatedAttack = await lockAttack(tx, context, attack.id);
    effectPlanId = await createFirearmEffectPlan(tx, context, actorUserId, updatedAttack);
    status = attackRulings.length || bullets.some((bullet) => bullet.status === "requires-god-ruling")
      ? "requires-god-ruling"
      : "consequence-planned";
  }
  if (sustained && effectPlanId !== null && !deferPortionApplication) {
    const { applyRoutineCombatConsequencesInTransaction } = await import("./action-effect-plan-service");
    await applyRoutineCombatConsequencesInTransaction(tx, context, actor, attack.triggerDeclarationId, effectPlanId);
  }
  return { attackId: attack.id, rollId: roll.id, effectPlanId, status, roundsConsumed: roundsForPortion, reused: false, waitingForDefenseRolls: false };
}

async function continueSustainedFireInTransaction(
  tx: FirearmAttackTransaction, context: OwnedEncounterRuntimeContext, actor: FirearmAttackActor, attack: LockedAttack,
  deferPortionApplication: boolean,
): Promise<FirearmAttackFireResult> {
  const receipt = (reused: boolean): FirearmAttackFireResult => ({ attackId: attack.id, rollId: attack.attackRollId!, effectPlanId: attack.effectPlanId,
    status: attack.status as FirearmAttackStatus, roundsConsumed: attack.roundsConsumed, reused, waitingForDefenseRolls: false });
  const [pending] = await tx.select().from(campaignSessionEncounterPendingAction).where(eq(campaignSessionEncounterPendingAction.id, attack.triggerPendingActionId!)).for("update");
  if (!pending || !["active", "completed"].includes(pending.status) || attack.firingPortionsResolved >= attack.firingDurationInitiative
    || Math.floor(pending.initiativeSpent) <= attack.firingPortionsResolved) return receipt(true);
  const portion = attack.firingPortionsResolved + 1;
  if (Math.floor(pending.initiativeSpent) !== portion) throw new Error("Resolve sustained fire at each completed Initiative point before advancing again.");
  const [unresolved] = await tx.select({ id: campaignSessionEncounterEffectPlan.id }).from(campaignSessionEncounterEffectPlan).where(and(
    eq(campaignSessionEncounterEffectPlan.declarationId, attack.triggerDeclarationId),
    inArray(campaignSessionEncounterEffectPlan.status, ["calculated", "requires-god-ruling", "approved", "partially-applied", "application-failed"]),
  )).limit(1);
  if (unresolved) throw new Error(`Resolve firearm portion consequences #${unresolved.id} before the next firing point.`);
  const firingPoint = pending.expectedCompletionInitiative + pending.remainingInitiativeCost;
  const defense = await resolveDeclaredDefensesIfReadyInTransaction(tx, context, actor, attack.triggerDeclarationId, firingPoint);
  if (!defense) throw new Error("Resolve the responses at this firing point before sustained fire advances.");
  const allocation = attack.bulletAllocationJson as FirearmBulletAllocation;
  const knownDefenses = new Set(allocation.defenseContributions.map(({ reactionId }) => reactionId));
  const newDefenses = (await firearmDefenseAllocationInputs(tx, context, defense)).filter(({ reactionId }) => !knownDefenses.has(reactionId));
  if (newDefenses.length) {
    const bullets = await tx.select().from(campaignSessionEncounterFirearmBullet).where(eq(campaignSessionEncounterFirearmBullet.attackId, attack.id))
      .orderBy(asc(campaignSessionEncounterFirearmBullet.bulletIndex)).for("update");
    const remaining = bullets.filter(({ bulletIndex, status }) => bulletIndex > attack.roundsConsumed && status !== "cancelled-by-defense");
    const originalRoll = attack.attackRollSnapshotJson as RollMechanicalSnapshot;
    const nextAllocation = allocateFirearmBullets({ delivery: { ...(attack.frozenSnapshotJson as FirearmAttackPreview).delivery, declaredRounds: Math.max(1, attack.roundsDeclared - attack.roundsConsumed) },
      resolution: { ...originalRoll.resolution, totalSuccesses: remaining.length, additionalSuccesses: Math.max(0, remaining.length - 1) }, calledShot: attack.calledShotDeclared, defenses: newDefenses });
    let cancelledIndex = 0;
    for (const contribution of nextAllocation.defenseContributions) {
      for (let index = 0; index < contribution.bulletsCancelled; index++) {
        const bullet = remaining[cancelledIndex++];
        await tx.update(campaignSessionEncounterFirearmBullet).set({ status: "cancelled-by-defense", cancelledByReactionId: contribution.reactionId })
          .where(eq(campaignSessionEncounterFirearmBullet.id, bullet.id));
      }
    }
    const combined = { ...allocation, defenseContributions: [...allocation.defenseContributions, ...nextAllocation.defenseContributions],
      applicableDefenseReactionIds: [...allocation.applicableDefenseReactionIds, ...nextAllocation.applicableDefenseReactionIds],
      defenseSuccesses: allocation.defenseSuccesses + nextAllocation.defenseSuccesses, bulletsCancelled: allocation.bulletsCancelled + cancelledIndex,
      survivingBulletHits: allocation.survivingBulletHits - cancelledIndex,
      rulingReasons: [...new Set([...allocation.rulingReasons, ...nextAllocation.rulingReasons])] };
    if (combined.survivingBulletHits === 0) combined.overflowDamage = 0;
    await tx.update(campaignSessionEncounterFirearmAttack).set({ bulletAllocationJson: combined, defenseResolutionJson: defense,
      rulingReasonsJson: [...new Set([...jsonArray(attack.rulingReasonsJson), ...unresolvedDefenseReasons(defense), ...nextAllocation.rulingReasons])] })
      .where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
    await recordAttackEvent(tx, context, attack.id, attack.status as FirearmAttackStatus, attack.status as FirearmAttackStatus, "later-sustained-defense-applied", actor.userId,
      "Only uncompleted bullet portions may be cancelled by a later response.", { firingPortion: portion, defenseContributions: nextAllocation.defenseContributions, previousAllocation: allocation });
  }
  const [state] = await tx.select().from(campaignCharacterFirearmState).where(eq(campaignCharacterFirearmState.itemInstanceId, attack.itemInstanceId)).for("update");
  if (!state || state.version !== attack.stateVersionBefore + attack.firingPortionsResolved || state.loadedRounds !== attack.roundsLoadedAfter
    || state.characterId !== attack.actorParticipantId || state.selectedFiringModeId !== attack.firingModeId || !state.readied) {
    throw new Error("The exact firearm changed during sustained fire. Interrupt the remaining firing before changing its readiness or ammunition.");
  }
  const rounds = Math.min(attack.roundsPerCadence, attack.roundsDeclared - attack.roundsConsumed);
  if (state.loadedRounds < rounds) throw new Error("The next firing portion no longer has its exact ammunition.");
  const loadedRounds = state.loadedRounds - rounds;
  const preview = attack.frozenSnapshotJson as FirearmAttackPreview;
  const postShot = postShotReadinessFromAuthoredTiming(preview.firearm);
  const last = portion === attack.firingDurationInitiative;
  const afterState = { ...state, loadedRounds, version: state.version + 1,
    loadedAmmunitionItemId: loadedRounds === 0 ? null : state.loadedAmmunitionItemId,
    loadedAmmunitionProfileId: loadedRounds === 0 ? null : state.loadedAmmunitionProfileId,
    loadedAmmunitionUnitCostCredits: loadedRounds === 0 ? null : state.loadedAmmunitionUnitCostCredits,
    requiresCycling: last && postShot.requiresCycling, requiresRecoilRecovery: last && postShot.requiresRecoilRecovery,
    updatedAt: new Date(), updatedByUserId: actor.userId };
  await tx.update(campaignCharacterFirearmState).set(afterState).where(eq(campaignCharacterFirearmState.itemInstanceId, state.itemInstanceId));
  await tx.insert(campaignCharacterFirearmEvent).values({ itemInstanceId: state.itemInstanceId, campaignId: context.campaignId, characterId: attack.actorParticipantId,
    eventKind: "firearm-portion-fired", beforeStateJson: state, afterStateJson: afterState,
    metadataJson: { firearmAttackId: attack.id, attackRollId: attack.attackRollId, firingPortion: portion, roundsConsumed: rounds }, actorUserId: actor.userId });
  await tx.update(campaignSessionEncounterFirearmAttack).set({ roundsConsumed: attack.roundsConsumed + rounds, roundsLoadedAfter: loadedRounds,
    firingPortionsResolved: portion, updatedAt: new Date() }).where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
  const updated = await lockAttack(tx, context, attack.id);
  const effectPlanId = await createFirearmEffectPlan(tx, context, actor.userId, updated);
  const { applyRoutineCombatConsequencesInTransaction } = await import("./action-effect-plan-service");
  if (!deferPortionApplication) await applyRoutineCombatConsequencesInTransaction(tx, context, actor, attack.triggerDeclarationId, effectPlanId);
  await recordAttackEvent(tx, context, attack.id, attack.status as FirearmAttackStatus, "consequence-planned", "sustained-portion-completed", actor.userId, "",
    { firingPortion: portion, roundsConsumed: rounds, cumulativeRoundsConsumed: updated.roundsConsumed, effectPlanId, originalRollId: attack.attackRollId });
  return { ...receipt(false), roundsConsumed: updated.roundsConsumed, effectPlanId, status: "consequence-planned" };
}

/** Runs at actual engine progress boundaries, inside the same Encounter transaction. */
export async function reconcileSustainedFireProgressInTransaction(
  tx: FirearmAttackTransaction, context: OwnedEncounterRuntimeContext,
  before: Awaited<ReturnType<typeof import("./runtime-integration-service").loadInitiativeEngineInTransaction>>,
  after: typeof before,
): Promise<void> {
  const completedPortions: { actor: FirearmAttackActor; declarationId: number; planId: number }[] = [];
  for (const pending of after.pendingActions) {
    const prior = before.pendingActions.find(({ id }) => id === pending.id);
    if (!prior || !pending.actionKind.startsWith("firearm-attack:") || pending.originalInitiativeCost <= 1
      || pending.initiativeSpent === prior.initiativeSpent && pending.status === prior.status) continue;
    const [attack] = await tx.select().from(campaignSessionEncounterFirearmAttack)
      .where(eq(campaignSessionEncounterFirearmAttack.triggerPendingActionId, pending.id)).for("update");
    if (!attack || (attack.frozenSnapshotJson as FirearmAttackPreview).delivery.kind !== "sustained" || attack.status === "cancelled") continue;
    if (["interrupted", "abandoned", "ended"].includes(pending.status)) {
      if (attack.roundsConsumed > 0) {
        const followUp = postShotReadinessFromAuthoredTiming((attack.frozenSnapshotJson as FirearmAttackPreview).firearm);
        await tx.update(campaignCharacterFirearmState).set({ requiresCycling: followUp.requiresCycling, requiresRecoilRecovery: followUp.requiresRecoilRecovery, updatedAt: new Date() })
          .where(eq(campaignCharacterFirearmState.itemInstanceId, attack.itemInstanceId));
      }
      await tx.update(campaignSessionEncounterFirearmAttack).set({ status: "cancelled", cancelledByUserId: context.ownerUserId, cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
      await recordAttackEvent(tx, context, attack.id, attack.status as FirearmAttackStatus, "cancelled", "remaining-sustained-fire-cancelled", context.ownerUserId,
        "Completed portions retain their ammunition and consequences; uncompleted portions do not fire.", { completedPortions: attack.firingPortionsResolved, roundsConsumed: attack.roundsConsumed });
      continue;
    }
    if (pending.initiativeSpent <= prior.initiativeSpent || pending.initiativeSpent > attack.firingDurationInitiative) continue;
    if (pending.initiativeSpent - prior.initiativeSpent > 1) throw new Error("Sustained fire must resolve one completed Initiative point at a time.");
    const [character] = await tx.select({ isNpc: campaignCharacter.isNpc }).from(campaignCharacter).where(eq(campaignCharacter.id, attack.actorParticipantId));
    const actor: FirearmAttackActor = character?.isNpc ? { authority: "god-owner", userId: context.ownerUserId }
      : { authority: "player", userId: attack.createdByUserId, characterId: attack.actorParticipantId };
    const receipt = await fireFirearmAttackInTransaction(tx, context, actor, attack.id, { method: "random" }, true);
    if (!receipt.reused && receipt.effectPlanId !== null) completedPortions.push({ actor, declarationId: attack.triggerDeclarationId, planId: receipt.effectPlanId });
  }
  // Every simultaneously matured portion has its own paid receipt before any
  // damage can interrupt another shooter's future work.
  const { applyRoutineCombatConsequencesInTransaction } = await import("./action-effect-plan-service");
  for (const portion of completedPortions) {
    await applyRoutineCombatConsequencesInTransaction(tx, context, portion.actor, portion.declarationId, portion.planId);
  }
}

export async function finalizeFirearmAttackConsequencesInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorUserId: string,
  attackId: number,
): Promise<number> {
  if (context.encounterId != null) await assertCombatWritableInTransaction(tx, context.encounterId);
  assertGod(context, actorUserId);
  const attack = await lockAttack(tx, context, attackId);
  if (attack.effectPlanId !== null) return attack.effectPlanId;
  if (attack.status !== "fired-awaiting-timing") {
    throw new Error("Only a fired attack awaiting defense-added Initiative completion may generate its consequences.");
  }
  return createFirearmEffectPlan(tx, context, actorUserId, attack);
}

export async function readFirearmAttackWorkspaceInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: FirearmAttackActorInput,
): Promise<FirearmAttackWorkspaceView> {
  await assertNoOpenDeclarationCheckpoint(tx, context.encounterId);
  const actor = typeof actorInput === "string" ? assertGod(context, actorInput) : actorInput;
  if (actor.authority === "god-owner") assertGod(context, actor.userId);
  else await resolveFirearmActor(tx, context, actor, actor.characterId);
  const participantRows = await tx.select({
    id: campaignSessionEncounterParticipant.characterId,
    participantKind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    name: campaignCharacter.name,
    npcKind: campaignCharacter.npcKind,
    creatureSnapshot: campaignSessionEncounterParticipant.creatureSnapshotJson,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId),
      eq(campaignCharacter.campaignId, campaignSessionEncounterParticipant.campaignId),
    ))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, context.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
    ))
    .orderBy(asc(campaignSessionEncounterParticipant.sortOrder), asc(campaignSessionEncounterParticipant.participantId));
  const participants: FirearmAttackWorkspaceView["participants"][number][] = [];
  for (const participant of participantRows) {
    const anatomy = await targetAnatomy(tx, participant);
    participants.push({
      id: participant.id,
      name: participant.participantKind === "creature" ? participant.displayLabel : participant.name ?? participant.displayLabel,
      participantKind: participant.participantKind,
      hitLocations: anatomy?.hitLocations.map(({ result, name, poolKey }) => ({ result, name, poolKey })) ?? [],
    });
  }
  const attacks = await tx.select().from(campaignSessionEncounterFirearmAttack)
    .where(and(
      eq(campaignSessionEncounterFirearmAttack.encounterId, context.encounterId),
      eq(campaignSessionEncounterFirearmAttack.sceneId, context.sceneId),
      eq(campaignSessionEncounterFirearmAttack.sessionId, context.sessionId),
      eq(campaignSessionEncounterFirearmAttack.campaignId, context.campaignId),
      actor.authority === "player"
        ? eq(campaignSessionEncounterFirearmAttack.actorParticipantId, actor.characterId)
        : undefined,
    ))
    .orderBy(desc(campaignSessionEncounterFirearmAttack.createdAt), desc(campaignSessionEncounterFirearmAttack.id));
  if (!attacks.length) return {
    context: { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId },
    participants,
    attacks: [],
  };
  const attackIds = attacks.map(({ id }) => id);
  const declarationIds = attacks.flatMap(({ aimDeclarationId, triggerDeclarationId }) => aimDeclarationId === null ? [triggerDeclarationId] : [aimDeclarationId, triggerDeclarationId]);
  const pendingIds = attacks.flatMap(({ aimPendingActionId, triggerPendingActionId }) => [aimPendingActionId, triggerPendingActionId].filter((id): id is number => id !== null));
  const planIds = attacks.flatMap(({ effectPlanId }) => effectPlanId === null ? [] : [effectPlanId]);
  const declarations = await tx.select({ id: campaignSessionEncounterActionDeclaration.id, status: campaignSessionEncounterActionDeclaration.status })
    .from(campaignSessionEncounterActionDeclaration).where(inArray(campaignSessionEncounterActionDeclaration.id, declarationIds));
  const responderOpportunities = await tx.select({
    id: campaignSessionEncounterResponderOpportunity.id,
    declarationId: campaignSessionEncounterResponderOpportunity.declarationId,
    responderParticipantId: campaignSessionEncounterResponderOpportunity.responderCharacterId,
    status: campaignSessionEncounterResponderOpportunity.status,
    responseLabel: campaignSessionEncounterResponderOpportunity.responseLabel,
  }).from(campaignSessionEncounterResponderOpportunity)
    .where(inArray(campaignSessionEncounterResponderOpportunity.declarationId, declarationIds))
    .orderBy(asc(campaignSessionEncounterResponderOpportunity.id));
  const pendingActions = pendingIds.length ? await tx.select({ id: campaignSessionEncounterPendingAction.id, status: campaignSessionEncounterPendingAction.status, remaining: campaignSessionEncounterPendingAction.remainingInitiativeCost })
    .from(campaignSessionEncounterPendingAction).where(inArray(campaignSessionEncounterPendingAction.id, pendingIds)) : [];
  const stagedAttackRolls = pendingIds.length ? await tx.select({
    id: campaignSessionRoll.id,
    pendingActionId: campaignSessionRoll.pendingActionId,
    status: campaignSessionRoll.status,
    mechanicalSnapshot: campaignSessionRoll.mechanicalSnapshot,
  }).from(campaignSessionRoll).where(and(
    eq(campaignSessionRoll.encounterId, context.encounterId),
    inArray(campaignSessionRoll.pendingActionId, pendingIds),
  )) : [];
  const bullets = await tx.select().from(campaignSessionEncounterFirearmBullet).where(inArray(campaignSessionEncounterFirearmBullet.attackId, attackIds))
    .orderBy(asc(campaignSessionEncounterFirearmBullet.attackId), asc(campaignSessionEncounterFirearmBullet.bulletIndex));
  const events = await tx.select().from(campaignSessionEncounterFirearmAttackEvent).where(inArray(campaignSessionEncounterFirearmAttackEvent.attackId, attackIds))
    .orderBy(asc(campaignSessionEncounterFirearmAttackEvent.attackId), asc(campaignSessionEncounterFirearmAttackEvent.createdAt), asc(campaignSessionEncounterFirearmAttackEvent.id));
  const plans = planIds.length ? await tx.select({ id: campaignSessionEncounterEffectPlan.id, status: campaignSessionEncounterEffectPlan.status })
    .from(campaignSessionEncounterEffectPlan).where(inArray(campaignSessionEncounterEffectPlan.id, planIds)) : [];
  const declarationById = new Map(declarations.map((row) => [row.id, row]));
  const pendingById = new Map(pendingActions.map((row) => [row.id, row]));
  const stagedRollByPendingId = new Map(stagedAttackRolls.filter(({ pendingActionId, status }) => pendingActionId !== null && status === "recorded").map((row) => [row.pendingActionId!, row]));
  const planById = new Map(plans.map((row) => [row.id, row]));
  const views: FirearmAttackView[] = attacks.map((attack) => {
    const preview = attack.frozenSnapshotJson as FirearmAttackPreview;
    const aimPending = attack.aimPendingActionId === null ? null : pendingById.get(attack.aimPendingActionId) ?? null;
    const triggerPending = attack.triggerPendingActionId === null ? null : pendingById.get(attack.triggerPendingActionId) ?? null;
    const stagedAttackRoll = attack.triggerPendingActionId === null ? null : stagedRollByPendingId.get(attack.triggerPendingActionId) ?? null;
    const effectiveStatus = attack.status === "aiming" && aimPending?.status === "completed" && aimPending.remaining === 0
      ? "trigger-ready"
      : attack.status;
    return {
      id: attack.id,
      status: attack.status,
      effectiveStatus,
      actorParticipantId: attack.actorParticipantId,
      actorName: preview.actor.name,
      targetParticipantId: attack.targetParticipantId,
      targetName: preview.target.name,
      itemInstanceId: attack.itemInstanceId,
      itemName: preview.firearm.itemName,
      firingModeName: preview.firearm.firingModeName,
      ammunitionName: preview.firearm.ammunitionName,
      governingLabel: preview.governing.label,
      originalTarget: preview.governing.originalTarget,
      aimInitiative: attack.aimInitiative,
      aimTargetOffset: preview.aim.targetOffset,
      calledShotDeclared: attack.calledShotDeclared,
      calledShotObjective: attack.calledShotObjective,
      calledShotLocationNumber: attack.calledShotLocationNumber,
      calledShotPenalty: attack.calledShotPenalty,
      calledShotReason: attack.calledShotReason,
      firingDurationInitiative: attack.firingDurationInitiative,
      firingPortionsResolved: attack.firingPortionsResolved,
      roundsPerCadence: attack.roundsPerCadence,
      roundsDeclared: attack.roundsDeclared,
      roundsConsumed: attack.roundsConsumed,
      roundsLoadedBefore: attack.roundsLoadedBefore,
      roundsLoadedAfter: attack.roundsLoadedAfter,
      finalTarget: attack.finalTarget,
      aimDeclarationId: attack.aimDeclarationId,
      aimDeclarationStatus: attack.aimDeclarationId === null ? null : declarationById.get(attack.aimDeclarationId)?.status ?? null,
      aimPendingActionId: attack.aimPendingActionId,
      aimTimingStatus: aimPending?.status ?? null,
      triggerDeclarationId: attack.triggerDeclarationId,
      triggerDeclarationStatus: declarationById.get(attack.triggerDeclarationId)?.status ?? "missing",
      triggerPendingActionId: attack.triggerPendingActionId,
      triggerTimingStatus: triggerPending?.status ?? null,
      responderOpportunities: responderOpportunities.filter(({ declarationId }) => declarationId === attack.triggerDeclarationId || declarationId === attack.aimDeclarationId).map((opportunity) => ({
        id: opportunity.id,
        phase: opportunity.declarationId === attack.aimDeclarationId ? "aim" : "trigger",
        responderParticipantId: opportunity.responderParticipantId,
        responderName: participants.find(({ id }) => id === opportunity.responderParticipantId)?.name ?? "Unknown combatant",
        status: opportunity.status,
        responseLabel: opportunity.responseLabel,
      })),
      attackRollId: attack.attackRollId ?? stagedAttackRoll?.id ?? null,
      attackRoll: (attack.attackRollSnapshotJson ?? stagedAttackRoll?.mechanicalSnapshot ?? null) as RollMechanicalSnapshot | null,
      attackFinalized: attack.attackRollId !== null && ((attack.frozenSnapshotJson as FirearmAttackPreview).delivery.kind !== "sustained" || attack.firingPortionsResolved >= attack.firingDurationInitiative || attack.status === "cancelled"),
      defenseResolution: attack.defenseResolutionJson,
      bulletAllocation: attack.bulletAllocationJson as FirearmBulletAllocation | null,
      damageResolution: attack.damageResolutionJson,
      postShotState: attack.postShotStateJson,
      effectPlanId: attack.effectPlanId,
      effectPlanStatus: attack.effectPlanId === null ? null : planById.get(attack.effectPlanId)?.status ?? null,
      rulingReasons: jsonArray(attack.rulingReasonsJson),
      bullets: bullets.filter(({ attackId: rowAttackId }) => rowAttackId === attack.id).map((bullet) => ({
        id: bullet.id,
        bulletIndex: bullet.bulletIndex,
        status: bullet.status,
        cancelledByReactionId: bullet.cancelledByReactionId,
        hitLocationNumber: bullet.hitLocationNumber,
        hitLocationName: bullet.hitLocationName,
        hpPoolKey: bullet.hpPoolKey,
        authoredDamage: bullet.authoredDamage,
        dexDamageModifier: bullet.dexDamageModifier,
        additionalSuccessDamage: bullet.additionalSuccessDamage,
        grossDamage: bullet.grossDamage,
        armor: bullet.armor,
        soak: bullet.soak,
        proposedNetDamage: bullet.proposedNetDamage,
        armorSnapshot: bullet.armorSnapshotJson,
        rulingReasons: jsonArray(bullet.rulingReasonsJson),
      })),
      events: events.filter(({ attackId: eventAttackId }) => eventAttackId === attack.id).map((event) => ({
        id: event.id,
        eventKind: event.eventKind,
        reason: event.reason,
        actorUserId: actor.authority === "god-owner" ? event.actorUserId : "",
        createdAt: event.createdAt.toISOString(),
      })),
      createdByUserId: actor.authority === "god-owner" ? attack.createdByUserId : "",
      createdAt: attack.createdAt.toISOString(),
      firedAt: attack.firedAt?.toISOString() ?? null,
    };
  });
  return {
    context: { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId },
    participants,
    attacks: views,
  };
}

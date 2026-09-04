import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

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
  campaignSessionEncounterResponderOpportunity,
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
} from "./action-declaration-service";
import type { ActionDeclarationDraft } from "./action-declaration";
import type { DefenseGroupOutcome } from "./defense-intervention";
import {
  recordDeclaredAttackRollInTransaction,
  resolveDeclaredDefensesInTransaction,
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
  type FirearmDeliveryPlan,
} from "./firearm-attack";
import { resolvePercentileCheck, type PercentileTargetModifier } from "./percentile-resolution";
import { getHitLocationFromPercentile, type RollMethod, type RollVisibility } from "./roll-runtime";
import type { RollGoverningSourceRequest, RollGoverningSourceSnapshot, RollMechanicalSnapshot } from "./roll-mechanical-snapshot";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";

export type FirearmAttackTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type GodActor = Extract<ActionDeclarationActor, { authority: "god-owner" }>;

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
}>;

export type DeclareFirearmAttackCommand = FirearmAttackCommand & Readonly<{ idempotencyKey: string }>;

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
    status: string;
    responseLabel: string;
  }>[];
  attackRollId: number | null;
  attackRoll: RollMechanicalSnapshot | null;
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
  actorUserId: string,
  command: FirearmAttackCommand,
  lock: boolean,
): Promise<LoadedFoundation> {
  assertGod(context, actorUserId);
  const actorParticipantId = positiveId(command.actorParticipantId, "Attacking participant");
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
  if (calledShot.declared && delivery.kind !== "single") rulingReasons.push("Called Shot burst or sustained-fire damage requires a G.O.D. ruling.");
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
  actorUserId: string,
  command: FirearmAttackCommand,
): Promise<FirearmAttackPreview> {
  return (await loadFoundation(tx, context, actorUserId, command, false)).preview;
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
  actorUserId: string,
  command: DeclareFirearmAttackCommand,
): Promise<{ attackId: number; status: FirearmAttackStatus; reused: boolean }> {
  const actor = assertGod(context, actorUserId);
  const idempotencyKey = boundedText(command.idempotencyKey, "Firearm attack request ID", true, 200);
  const [existing] = await tx.select({
    id: campaignSessionEncounterFirearmAttack.id,
    status: campaignSessionEncounterFirearmAttack.status,
    actorParticipantId: campaignSessionEncounterFirearmAttack.actorParticipantId,
    targetParticipantId: campaignSessionEncounterFirearmAttack.targetParticipantId,
    itemInstanceId: campaignSessionEncounterFirearmAttack.itemInstanceId,
    firingModeId: campaignSessionEncounterFirearmAttack.firingModeId,
  }).from(campaignSessionEncounterFirearmAttack).where(and(
    eq(campaignSessionEncounterFirearmAttack.campaignId, context.campaignId),
    eq(campaignSessionEncounterFirearmAttack.idempotencyKey, idempotencyKey),
  )).limit(1);
  if (existing) {
    if (existing.actorParticipantId !== command.actorParticipantId || existing.targetParticipantId !== command.targetParticipantId || existing.itemInstanceId !== command.itemInstanceId || existing.firingModeId !== command.firingModeId) {
      throw new Error("That firearm attack request ID was already used for different exact identities.");
    }
    return { attackId: existing.id, status: existing.status as FirearmAttackStatus, reused: true };
  }
  await assertNoOpenActorAction(tx, context, command.actorParticipantId);
  const foundation = await loadFoundation(tx, context, actorUserId, command, true);
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
    initiativeCost: 1,
    allowsMultiRound: false,
    heldIntervention: false,
    windowKind: "firearm-trigger",
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
    triggerPendingActionId = await commitActionDeclarationInTransaction(tx, context, actor, triggerDeclarationId);
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
    frozenSnapshotJson: preview,
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
  actor: GodActor,
  attack: LockedAttack,
  reason: string,
): Promise<void> {
  if (attack.firedAt !== null) throw new Error("A fired attack cannot be cancelled or restore ammunition.");
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
    ammunitionConsumed: false,
    accumulatedAimInitiativeLost: attack.aimInitiative,
  });
}

export async function cancelFirearmAttackInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorUserId: string,
  attackId: number,
  reasonInput: string,
): Promise<void> {
  const actor = assertGod(context, actorUserId);
  const attack = await lockAttack(tx, context, attackId);
  if (attack.status === "cancelled") return;
  await cancellationTransition(tx, context, actor, attack, boundedText(reasonInput, "Cancellation reason"));
}

export async function commitFirearmAttackTriggerInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorUserId: string,
  attackId: number,
): Promise<number> {
  const actor = assertGod(context, actorUserId);
  const attack = await lockAttack(tx, context, attackId);
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
    await cancellationTransition(tx, context, actor, attack, "The exact target/firearm/Profile/mode identity changed after Aim; accumulated Aim was cancelled without ammunition consumption.");
    throw new Error("The exact firearm/Profile/mode identity changed after Aim. The Aim and attack were cancelled without consuming ammunition.");
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
  const triggerPendingActionId = await commitActionDeclarationInTransaction(tx, context, actor, attack.triggerDeclarationId);
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
  const armor = isRecord(location) && typeof location.naturalArmor === "number" && Number.isFinite(location.naturalArmor) ? location.naturalArmor : isRecord(location) ? 0 : null;
  const soak = isRecord(location) && typeof location.soak === "number" && Number.isFinite(location.soak) ? location.soak : isRecord(location) ? 0 : null;
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
  if (attack.effectPlanId !== null) return attack.effectPlanId;
  if (attack.attackRollId === null || attack.attackRollSnapshotJson === null || attack.bulletAllocationJson === null || attack.triggerPendingActionId === null) {
    throw new Error("A firearm consequence plan requires the immutable attack Roll, allocation, and trigger action identities.");
  }
  const [existing] = await tx.select({ id: campaignSessionEncounterEffectPlan.id }).from(campaignSessionEncounterEffectPlan)
    .where(eq(campaignSessionEncounterEffectPlan.declarationId, attack.triggerDeclarationId)).limit(1).for("update");
  if (existing) {
    await tx.update(campaignSessionEncounterFirearmAttack).set({ effectPlanId: existing.id, updatedAt: new Date() })
      .where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
    return existing.id;
  }
  const [pending] = await tx.select().from(campaignSessionEncounterPendingAction).where(and(
    eq(campaignSessionEncounterPendingAction.id, attack.triggerPendingActionId),
    eq(campaignSessionEncounterPendingAction.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!pending || pending.status !== "completed" || pending.remainingInitiativeCost !== 0) {
    throw new Error("Firearm consequences remain recoverably pending until all original and defense-added Initiative Cost completes.");
  }
  const preview = attack.frozenSnapshotJson as FirearmAttackPreview;
  const bulletRows = await tx.select().from(campaignSessionEncounterFirearmBullet)
    .where(eq(campaignSessionEncounterFirearmBullet.attackId, attack.id))
    .orderBy(asc(campaignSessionEncounterFirearmBullet.bulletIndex)).for("update");
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
  if (allocation.overflowDamage > 0) {
    const firstLocation = bulletRows.find(({ status, hitLocationNumber }) => status !== "cancelled-by-defense" && hitLocationNumber !== null);
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
}>;

function applicableDefenseResults(defense: DefenseGroupOutcome): readonly Readonly<{
  reactionId: number;
  defenseSucceeded: boolean;
}>[] {
  return defense.outcomes.flatMap((outcome) => outcome.defenseSucceeded === null ? [] : [{
    reactionId: outcome.reactionId,
    defenseSucceeded: outcome.defenseSucceeded,
  }]);
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
  actorUserId: string,
  attackId: number,
  input: FirearmAttackRollCommand,
): Promise<FirearmAttackFireResult> {
  const actor = assertGod(context, actorUserId);
  const attack = await lockAttack(tx, context, attackId);
  if (attack.attackRollId !== null) {
    return {
      attackId: attack.id,
      rollId: attack.attackRollId,
      effectPlanId: attack.effectPlanId,
      status: attack.status as FirearmAttackStatus,
      roundsConsumed: attack.roundsConsumed,
      reused: true,
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
  if (!pending || pending.status !== "completed" || pending.remainingInitiativeCost !== 0) {
    throw new Error("The one-Initiative trigger pull must complete before the firearm Roll is recorded.");
  }
  const opportunities = await tx.select({ status: campaignSessionEncounterResponderOpportunity.status })
    .from(campaignSessionEncounterResponderOpportunity)
    .where(eq(campaignSessionEncounterResponderOpportunity.declarationId, attack.triggerDeclarationId));
  if (opportunities.some(({ status }) => status === "pending")) {
    throw new Error("Every trigger-pull responder opportunity must be reconciled before firing.");
  }

  const roll = await recordDeclaredAttackRollInTransaction(tx, context, actor, attack.triggerDeclarationId, input);
  if (!roll.mechanicalSnapshot) throw new Error("The firearm Roll did not produce an immutable mechanical snapshot.");
  const defense = await resolveDeclaredDefensesInTransaction(tx, context, actor, attack.triggerDeclarationId);
  if (defense.status === "unresolved") throw new Error("All required independent defense Rolls must resolve before the firearm can fire.");
  const allocation = allocateFirearmBullets({
    delivery: (attack.frozenSnapshotJson as FirearmAttackPreview).delivery,
    resolution: roll.mechanicalSnapshot.resolution,
    applicableDefenses: applicableDefenseResults(defense),
  });
  const preview = attack.frozenSnapshotJson as FirearmAttackPreview;
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
  const attackRulings = [...new Set([
    ...jsonArray(attack.rulingReasonsJson),
    ...allocation.rulingReasons,
    ...defenseRulings,
    ...locationRulings,
  ])];
  const cancelledReactionIds = allocation.applicableDefenseReactionIds.slice(0, allocation.bulletsCancelled);
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

  const roundsLoadedAfter = state.loadedRounds - attack.roundsDeclared;
  const now = new Date();
  const beforeState = { ...state };
  const afterState = {
    ...state,
    loadedAmmunitionItemId: roundsLoadedAfter === 0 ? null : state.loadedAmmunitionItemId,
    loadedAmmunitionProfileId: roundsLoadedAfter === 0 ? null : state.loadedAmmunitionProfileId,
    loadedAmmunitionUnitCostCredits: roundsLoadedAfter === 0 ? null : state.loadedAmmunitionUnitCostCredits,
    loadedRounds: roundsLoadedAfter,
    requiresCycling: postShot.requiresCycling,
    requiresRecoilRecovery: postShot.requiresRecoilRecovery,
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
      roundsConsumed: attack.roundsDeclared,
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
    roundsConsumed: attack.roundsDeclared,
    roundsLoadedAfter,
    rulingReasonsJson: attackRulings,
    status: "fired-awaiting-timing",
    firedByUserId: actorUserId,
    firedAt: now,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterFirearmAttack.id, attack.id));
  await recordAttackEvent(tx, context, attack.id, "committed", "fired-awaiting-timing", "firearm-fired", actorUserId, "", {
    attackRollId: roll.id,
    roundsConsumed: attack.roundsDeclared,
    roundsLoadedAfter,
    bulletAllocation: allocation,
    postShot,
  });

  const [updatedPending] = await tx.select().from(campaignSessionEncounterPendingAction)
    .where(eq(campaignSessionEncounterPendingAction.id, attack.triggerPendingActionId)).limit(1);
  let effectPlanId: number | null = null;
  let status: FirearmAttackStatus = "fired-awaiting-timing";
  if (updatedPending?.status === "completed" && updatedPending.remainingInitiativeCost === 0) {
    const updatedAttack = await lockAttack(tx, context, attack.id);
    effectPlanId = await createFirearmEffectPlan(tx, context, actorUserId, updatedAttack);
    status = attackRulings.length || bullets.some((bullet) => bullet.status === "requires-god-ruling")
      ? "requires-god-ruling"
      : "consequence-planned";
  }
  return { attackId: attack.id, rollId: roll.id, effectPlanId, status, roundsConsumed: attack.roundsDeclared, reused: false };
}

export async function finalizeFirearmAttackConsequencesInTransaction(
  tx: FirearmAttackTransaction,
  context: OwnedEncounterRuntimeContext,
  actorUserId: string,
  attackId: number,
): Promise<number> {
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
  actorUserId: string,
): Promise<FirearmAttackWorkspaceView> {
  assertGod(context, actorUserId);
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
  const bullets = await tx.select().from(campaignSessionEncounterFirearmBullet).where(inArray(campaignSessionEncounterFirearmBullet.attackId, attackIds))
    .orderBy(asc(campaignSessionEncounterFirearmBullet.attackId), asc(campaignSessionEncounterFirearmBullet.bulletIndex));
  const events = await tx.select().from(campaignSessionEncounterFirearmAttackEvent).where(inArray(campaignSessionEncounterFirearmAttackEvent.attackId, attackIds))
    .orderBy(asc(campaignSessionEncounterFirearmAttackEvent.attackId), asc(campaignSessionEncounterFirearmAttackEvent.createdAt), asc(campaignSessionEncounterFirearmAttackEvent.id));
  const plans = planIds.length ? await tx.select({ id: campaignSessionEncounterEffectPlan.id, status: campaignSessionEncounterEffectPlan.status })
    .from(campaignSessionEncounterEffectPlan).where(inArray(campaignSessionEncounterEffectPlan.id, planIds)) : [];
  const declarationById = new Map(declarations.map((row) => [row.id, row]));
  const pendingById = new Map(pendingActions.map((row) => [row.id, row]));
  const planById = new Map(plans.map((row) => [row.id, row]));
  const views: FirearmAttackView[] = attacks.map((attack) => {
    const preview = attack.frozenSnapshotJson as FirearmAttackPreview;
    const aimPending = attack.aimPendingActionId === null ? null : pendingById.get(attack.aimPendingActionId) ?? null;
    const triggerPending = attack.triggerPendingActionId === null ? null : pendingById.get(attack.triggerPendingActionId) ?? null;
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
        status: opportunity.status,
        responseLabel: opportunity.responseLabel,
      })),
      attackRollId: attack.attackRollId,
      attackRoll: attack.attackRollSnapshotJson as RollMechanicalSnapshot | null,
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
        actorUserId: event.actorUserId,
        createdAt: event.createdAt.toISOString(),
      })),
      createdByUserId: attack.createdByUserId,
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

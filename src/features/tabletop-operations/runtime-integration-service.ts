import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterPendingActionSource,
  campaignSessionEncounterReaction,
  campaignSessionScene,
} from "@/db/tabletop-operations-schema";
import {
  addInjuryInTransaction,
  applyLocalizedDamageInTransaction,
  healAreaInTransaction,
  healFullBodyInTransaction,
  resolveInjuryInTransaction,
  type AddInjuryCommand,
  type ActiveHealthTransaction,
} from "@/features/active-state/active-health-service";
import type { ActiveHealthView } from "@/features/active-state/models";
import {
  applyConditionInTransaction,
  applyModifierInTransaction,
  endModifierInTransaction,
  readActiveEffectsInTransaction,
  resolveConditionInTransaction,
} from "@/features/active-state/active-effects-service";
import {
  readActiveManaInTransaction,
  restoreActiveManaInTransaction,
  restoreActiveManaPoolInTransaction,
  spendActiveManaInTransaction,
} from "@/features/active-state/active-mana-service";
import type { CharacterMagicSystem } from "@/features/characters/character-rules";
import {
  executeCharacterSpellCastInCallerTransaction,
  prepareCharacterSpellCastInTransaction,
} from "@/features/characters/character-spell-runtime-service";
import type {
  SpellCastExecutionResult,
  SpellCastRequest,
} from "@/features/characters/character-spell-runtime";
import {
  executeCreatureAbilityUseInCallerTransaction,
  prepareCreatureAbilityUseInTransaction,
  type CreatureAbilityUsePreparation,
} from "@/features/creatures/creature-ability-runtime-service";
import type {
  CreatureAbilityUseRequest,
  CreatureAbilityUseResult,
} from "@/features/creatures/creature-ability-runtime";
import {
  readCharacterEquipmentStateInTransaction,
  setInstanceEquipmentStateInTransaction,
  setStackEquipmentStateInTransaction,
} from "@/features/items/equipment-state-service";
import {
  ACTIVE_EQUIPMENT_STATES,
  type EquipmentState,
  type WieldedWeaponRuntimeContext,
} from "@/features/items/equipment-state";
import type { ItemUseExecutionResult, ItemUseRequest } from "@/features/items/item-use";
import type { RuntimeDuration, TemporaryModifierChannel } from "@/features/mechanical-effects";
import {
  executeCharacterItemUseInCallerTransaction,
  prepareCharacterItemUseInTransaction,
} from "@/app/characters/item-use-actions";

import {
  applyDirectInitiativeDelta,
  canHoldingParticipantIntervene,
  canParticipantReactToAction,
  holdInitiative,
  passInitiative,
  startInitiativeAction,
  type InitiativeEngineState,
  type PendingInitiativeActionState,
} from "./initiative-runtime";
import {
  assertDurableAuthoredActionPayload,
  getReactionCommitment,
  parseDirectNumericDamage,
  parseDurablePayload,
  reconcileReaction,
  requireReadyAuthoredAction,
  resolveCreatureAttackInitiativeCost,
  type AuthoredActionBinding,
  type AuthoredActionSourceKind,
  type CreatureAttackActionPayload,
  type EncounterReactionType,
  type WeaponActionPayload,
} from "./runtime-integration";
import { resolveInitiativeCapacityInTransaction } from "./initiative-capacity-service";
import { enrollLateInitiativeParticipant } from "./initiative-runtime";
import { assertCampaignSessionOwner } from "./session-foundation";
import {
  applyInitiativeDurationTransitionInTransaction,
  bindPersistedEffectDurationInTransaction,
  closeDurationBindingForEffectInTransaction,
} from "./duration-lifecycle-service";

export type RuntimeIntegrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type OwnedEncounterRuntimeContext = {
  encounterId: number;
  sceneId: number;
  sessionId: number;
  campaignId: number;
  encounterStatus: "planned" | "active" | "completed";
  sceneStatus: "planned" | "active" | "completed";
  sessionStatus: "planned" | "active" | "completed";
  ownerUserId: string;
};

export type StartAuthoredActionInput = {
  sourceCharacterId: number;
  sourceKind: AuthoredActionSourceKind;
  sourceRef: string;
  sourceInstanceId?: number | null;
  label: string;
  initiativeCost: number;
  allowsMultiRound: boolean;
  heldIntervention?: boolean;
  payload: Record<string, unknown>;
  targetCharacterIds: readonly number[];
};

export type AttackOutcome = "miss" | "hit" | "dodged" | "blocked" | "parried" | "other";

export type ResolveAuthoredActionInput = {
  outcome?: AttackOutcome;
  finalDamage?: number | null;
  hitLocationNumber?: number | null;
  poolKey?: string | null;
  injuryName?: string;
  injuryNotes?: string;
  rulingSummary?: string;
};

export type ResolveAuthoredActionResult = {
  bindingId: number;
  sourceCharacterId: number;
  targetCharacterIds: number[];
  sourceKind: AuthoredActionSourceKind;
  summary: string;
  health: ActiveHealthView | null;
  spell: SpellCastExecutionResult | null;
  item: ItemUseExecutionResult | null;
  creatureAbility: CreatureAbilityUseResult | null;
  manualEffects: readonly unknown[];
};

type CreatureAttackSnapshot = {
  canonicalId?: unknown;
  attackName?: unknown;
  attackPercentage?: unknown;
  damage?: unknown;
  damageType?: unknown;
  rangeReach?: unknown;
  requiredAnatomy?: unknown;
  requirements?: unknown;
};

export type EncounterCreatureAttack = {
  canonicalId: string;
  attackName: string;
  attackPercentage: number | null;
  damage: string | null;
  initiativeCost: number | null;
  initiativeCostSource: "natural" | "damage" | "god" | "structured" | "missing";
  damageType: string;
  rangeReach: string;
  requiredAnatomy: string;
  requirements: string;
};

export type EncounterCreatureAbility = {
  canonicalId: string;
  abilityName: string;
  abilityType: string;
  activation: string;
  requirements: string;
  usesRecharge: string;
};

export type DirectCreatureAbilityRuling = {
  status: "needs-god-ruling";
  sourceKind: "creature-ability";
  sourceRef: string;
  ability: EncounterCreatureAbility;
  explanation: string;
};

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function runtimeParticipantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function positiveAmount(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

function cleanText(value: string, label: string): string {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(`${label} is required.`);
  return cleaned;
}

export async function lockOwnedEncounterRuntimeInTransaction(
  tx: RuntimeIntegrationTransaction,
  encounterIdInput: number,
  actingUserId: string,
): Promise<OwnedEncounterRuntimeContext> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
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
    .where(eq(campaignSessionEncounter.id, encounterId))
    .limit(1)
    .for("update", { of: campaignSessionEncounter });
  if (!context) throw new Error("That Encounter no longer exists.");
  assertCampaignSessionOwner(context.ownerUserId, actingUserId);
  return context;
}

function assertLiveEncounter(context: OwnedEncounterRuntimeContext): void {
  if (context.encounterStatus === "completed") throw new Error("Completed Encounter history cannot be mutated.");
  if (context.sessionStatus === "completed" || context.sceneStatus === "completed") {
    throw new Error("Historical Session or Scene state cannot be mutated through this Encounter.");
  }
}

function assertActiveInitiativeHierarchy(context: OwnedEncounterRuntimeContext): void {
  if (context.sessionStatus !== "active" || context.sceneStatus !== "active" || context.encounterStatus !== "active") {
    throw new Error("Authored Initiative actions require an active Session, Scene, and Encounter.");
  }
}

async function requireEncounterParticipant(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  characterIdInput: number,
  lock = false,
): Promise<{ characterId: number; npcKind: "race" | "creature"; name: string }> {
  const characterId = runtimeParticipantKey(characterIdInput, "Encounter Participant");
  const query = tx.select({
    characterId: campaignSessionEncounterParticipant.characterId,
    participantKind: campaignSessionEncounterParticipant.participantKind,
    displayLabel: campaignSessionEncounterParticipant.displayLabel,
    npcKind: campaignCharacter.npcKind,
    name: campaignCharacter.name,
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
      eq(campaignSessionEncounterParticipant.characterId, characterId),
    )).limit(1);
  const rows = lock ? await query.for("update", { of: campaignSessionEncounterParticipant }) : await query;
  const participant = rows[0];
  if (!participant) throw new Error("Source and target Characters must be current Encounter Participants.");
  return {
    characterId: participant.characterId,
    npcKind: participant.participantKind === "creature" || participant.npcKind === "creature" ? "creature" : "race",
    name: participant.participantKind === "creature" ? participant.displayLabel : participant.name ?? `Character #${participant.characterId}`,
  };
}

async function requireEncounterParticipants(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  characterIds: readonly number[],
): Promise<void> {
  for (const characterId of [...new Set(characterIds)].sort((left, right) => left - right)) {
    await requireEncounterParticipant(tx, context, characterId, true);
  }
}

export async function loadInitiativeEngineInTransaction(
  tx: RuntimeIntegrationTransaction,
  encounterId: number,
): Promise<InitiativeEngineState> {
  const [runtime] = await tx.select({
    encounterId: campaignSessionEncounterInitiative.encounterId,
    status: campaignSessionEncounterInitiative.status,
    roundNumber: campaignSessionEncounterInitiative.roundNumber,
    stepNumber: campaignSessionEncounterInitiative.stepNumber,
    timelineInitiative: campaignSessionEncounterInitiative.timelineInitiative,
    startedAt: campaignSessionEncounterInitiative.startedAt,
    closedAt: campaignSessionEncounterInitiative.closedAt,
  }).from(campaignSessionEncounterInitiative)
    .where(eq(campaignSessionEncounterInitiative.encounterId, encounterId))
    .limit(1)
    .for("update");
  if (!runtime || runtime.status !== "active") throw new Error("This Encounter has no active Initiative runtime.");
  const participants = await tx.select({
      encounterId: campaignSessionEncounterInitiativeParticipant.encounterId,
      characterId: campaignSessionEncounterInitiativeParticipant.characterId,
      normalTotalInitiative: campaignSessionEncounterInitiativeParticipant.normalTotalInitiative,
      currentInitiative: campaignSessionEncounterInitiativeParticipant.currentInitiative,
      participationStatus: campaignSessionEncounterInitiativeParticipant.participationStatus,
      deferredInitiativeCost: campaignSessionEncounterInitiativeParticipant.deferredInitiativeCost,
      lastSatisfiedStep: campaignSessionEncounterInitiativeParticipant.lastSatisfiedStep,
      movementMode: campaignSessionEncounterInitiativeParticipant.movementMode,
    }).from(campaignSessionEncounterInitiativeParticipant)
      .where(eq(campaignSessionEncounterInitiativeParticipant.encounterId, encounterId))
      .orderBy(asc(campaignSessionEncounterInitiativeParticipant.characterId))
      .for("update");
  const pendingActions = await tx.select({
      id: campaignSessionEncounterPendingAction.id,
      encounterId: campaignSessionEncounterPendingAction.encounterId,
      actorCharacterId: campaignSessionEncounterPendingAction.actorCharacterId,
      label: campaignSessionEncounterPendingAction.label,
      actionKind: campaignSessionEncounterPendingAction.actionKind,
      allowsMultiRound: campaignSessionEncounterPendingAction.allowsMultiRound,
      originalInitiativeCost: campaignSessionEncounterPendingAction.originalInitiativeCost,
      additionalInitiativeCost: campaignSessionEncounterPendingAction.additionalInitiativeCost,
      initiativeSpent: campaignSessionEncounterPendingAction.initiativeSpent,
      remainingInitiativeCost: campaignSessionEncounterPendingAction.remainingInitiativeCost,
      startInitiative: campaignSessionEncounterPendingAction.startInitiative,
      startTimelineInitiative: campaignSessionEncounterPendingAction.startTimelineInitiative,
      expectedCompletionInitiative: campaignSessionEncounterPendingAction.expectedCompletionInitiative,
      status: campaignSessionEncounterPendingAction.status,
      startedRound: campaignSessionEncounterPendingAction.startedRound,
      completedRound: campaignSessionEncounterPendingAction.completedRound,
    }).from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.encounterId, encounterId))
      .orderBy(asc(campaignSessionEncounterPendingAction.id))
      .for("update");
  return { runtime, participants, pendingActions };
}

export async function persistInitiativeEngineInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  before: InitiativeEngineState,
  after: InitiativeEngineState,
): Promise<void> {
  const now = new Date();
  await tx.update(campaignSessionEncounterInitiative).set({
    status: after.runtime.status,
    roundNumber: after.runtime.roundNumber,
    stepNumber: after.runtime.stepNumber,
    timelineInitiative: after.runtime.timelineInitiative,
    closedAt: after.runtime.closedAt,
    updatedAt: now,
  }).where(eq(campaignSessionEncounterInitiative.encounterId, context.encounterId));
  const beforeParticipants = new Set(before.participants.map(({ characterId }) => characterId));
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
    if (beforeParticipants.has(participant.characterId)) {
      await tx.update(campaignSessionEncounterInitiativeParticipant).set(values).where(and(
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
  const beforeActions = new Set(before.pendingActions.map(({ id }) => id));
  for (const action of after.pendingActions) {
    const values = {
      label: action.label,
      actionKind: action.actionKind,
      allowsMultiRound: action.allowsMultiRound,
      originalInitiativeCost: action.originalInitiativeCost,
      additionalInitiativeCost: action.additionalInitiativeCost ?? 0,
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
    if (beforeActions.has(action.id)) {
      await tx.update(campaignSessionEncounterPendingAction).set(values).where(and(
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
  await applyInitiativeDurationTransitionInTransaction(tx, context, before.runtime, after.runtime);
}

async function nextPendingActionId(tx: RuntimeIntegrationTransaction): Promise<number> {
  const result = await tx.execute(sql<{ id: number }>`
    select nextval(pg_get_serial_sequence('campaign_session_encounter_pending_action', 'id'))::integer as id
  `);
  return positiveId(Number((result.rows[0] as { id?: number } | undefined)?.id), "Pending Action");
}

/** Player and G.O.D. controllers share the authoritative Initiative engine. */
export async function holdParticipantInitiativeInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  characterId: number,
): Promise<void> {
  assertActiveInitiativeHierarchy(context);
  await requireEncounterParticipant(tx, context, characterId, true);
  const state = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const changed = holdInitiative(state, characterId);
  await persistInitiativeEngineInTransaction(tx, context, state, changed);
}

/** Player and G.O.D. controllers share the authoritative Initiative engine. */
export async function passParticipantInitiativeInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  characterId: number,
): Promise<void> {
  assertActiveInitiativeHierarchy(context);
  await requireEncounterParticipant(tx, context, characterId, true);
  const state = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const changed = passInitiative(state, characterId);
  await persistInitiativeEngineInTransaction(tx, context, state, changed);
}

/**
 * Pays an already-preflighted immediate runtime cost through the authoritative
 * Initiative engine. Derived Ability execution uses this only inside its final
 * transaction; it does not create a parallel Initiative pool or pending action.
 */
export async function spendImmediateInitiativeInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  characterId: number,
  amount: number,
): Promise<void> {
  assertActiveInitiativeHierarchy(context);
  const cost = positiveAmount(amount, "Initiative Cost");
  await requireEncounterParticipant(tx, context, characterId, true);
  const state = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const participant = state.participants.find(
    (entry) => entry.characterId === characterId,
  );
  if (!participant || participant.currentInitiative < cost) {
    throw new Error("The Character does not have enough Current Initiative for this Derived Ability.");
  }
  const changed = applyDirectInitiativeDelta(state, characterId, -cost);
  await persistInitiativeEngineInTransaction(tx, context, state, changed);
}

export async function startAuthoredActionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  input: StartAuthoredActionInput,
): Promise<AuthoredActionBinding<Record<string, unknown>>> {
  assertActiveInitiativeHierarchy(context);
  await requireEncounterParticipant(tx, context, input.sourceCharacterId, true);
  await requireEncounterParticipants(tx, context, input.targetCharacterIds);
  assertDurableAuthoredActionPayload(input.payload);
  const sourceRef = cleanText(input.sourceRef, "Authored action source");
  const state = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const actionId = await nextPendingActionId(tx);
  const changed = startInitiativeAction(state, {
    id: actionId,
    actorCharacterId: input.sourceCharacterId,
    label: cleanText(input.label, "Authored action label"),
    actionKind: input.sourceKind,
    initiativeCost: positiveAmount(input.initiativeCost, "Initiative Cost"),
    allowsMultiRound: input.allowsMultiRound,
    heldIntervention: input.heldIntervention,
  });
  await persistInitiativeEngineInTransaction(tx, context, state, changed);
  const [created] = await tx.insert(campaignSessionEncounterPendingActionSource).values({
    pendingActionId: actionId,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    sourceCharacterId: input.sourceCharacterId,
    sourceKind: input.sourceKind,
    sourceRef,
    sourceInstanceId: input.sourceInstanceId ?? null,
    payloadJson: JSON.stringify(input.payload),
  }).returning();
  if (!created) throw new Error("The authored action binding could not be saved.");
  return {
    id: created.id,
    pendingActionId: created.pendingActionId,
    encounterId: created.encounterId,
    sourceCharacterId: created.sourceCharacterId,
    sourceKind: created.sourceKind,
    sourceRef: created.sourceRef,
    sourceInstanceId: created.sourceInstanceId,
    payload: input.payload,
    resolutionStatus: created.resolutionStatus,
    resolvedAt: created.resolvedAt,
    resolutionSummary: created.resolutionSummary,
  };
}

function requireWieldedWeapon(
  weapons: readonly WieldedWeaponRuntimeContext[],
  itemId: number,
  instanceId: number | null,
): WieldedWeaponRuntimeContext {
  const weapon = weapons.find((entry) => entry.itemId === itemId && entry.instanceId === instanceId);
  if (!weapon) throw new Error("That authoritative Weapon is no longer wielded by the source Character.");
  return weapon;
}

export async function startWeaponActionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  input: {
    sourceCharacterId: number;
    targetCharacterId: number;
    itemId: number;
    instanceId: number | null;
    godSuppliedInitiativeCost?: number | null;
    heldIntervention?: boolean;
  },
): Promise<AuthoredActionBinding<WeaponActionPayload>> {
  const equipment = await readCharacterEquipmentStateInTransaction(tx, input.sourceCharacterId);
  const weapon = requireWieldedWeapon(equipment.wieldedWeapons, input.itemId, input.instanceId);
  const initiativeCost = weapon.initiativeCost ?? input.godSuppliedInitiativeCost ?? null;
  if (initiativeCost === null) throw new Error("This Weapon has no authored Initiative Cost. The G.O.D. must supply one.");
  const payload: WeaponActionPayload = {
    targetCharacterId: input.targetCharacterId,
    itemId: input.itemId,
    instanceId: input.instanceId,
  };
  return startAuthoredActionInTransaction(tx, context, {
    sourceCharacterId: input.sourceCharacterId,
    sourceKind: "weapon",
    sourceRef: weapon.ownershipKey,
    sourceInstanceId: input.instanceId,
    label: `${weapon.itemName} Attack`,
    initiativeCost,
    allowsMultiRound: false,
    heldIntervention: input.heldIntervention,
    payload,
    targetCharacterIds: [input.targetCharacterId],
  }) as Promise<AuthoredActionBinding<WeaponActionPayload>>;
}

function parseCreatureAttacks(snapshotJson: string): EncounterCreatureAttack[] {
  let parsed: unknown;
  try { parsed = JSON.parse(snapshotJson); } catch { throw new Error("Creature NPC current snapshot is invalid JSON."); }
  const attacks = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as { attacks?: unknown }).attacks
    : null;
  if (!Array.isArray(attacks)) throw new Error("Creature NPC current snapshot has no valid Attack list.");
  return attacks.flatMap((candidate): EncounterCreatureAttack[] => {
    const row = candidate as CreatureAttackSnapshot;
    if (typeof row.canonicalId !== "string" || typeof row.attackName !== "string") return [];
    const damage = typeof row.damage === "string" ? row.damage : typeof row.damage === "number" ? String(row.damage) : null;
    const initiative = resolveCreatureAttackInitiativeCost({ attackName: row.attackName, damage });
    return [{
      canonicalId: row.canonicalId,
      attackName: row.attackName,
      attackPercentage: typeof row.attackPercentage === "number" ? row.attackPercentage : null,
      damage,
      initiativeCost: initiative.cost,
      initiativeCostSource: initiative.source,
      damageType: typeof row.damageType === "string" ? row.damageType : "",
      rangeReach: typeof row.rangeReach === "string" ? row.rangeReach : "",
      requiredAnatomy: typeof row.requiredAnatomy === "string" ? row.requiredAnatomy : "",
      requirements: typeof row.requirements === "string" ? row.requirements : "",
    }];
  });
}

async function readEncounterCreatureSnapshotInTransaction(
  tx: RuntimeIntegrationTransaction,
  characterId: number,
  lock = false,
): Promise<unknown> {
  const query = characterId < 0
    ? tx.select({ snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson })
      .from(campaignSessionEncounterParticipant)
      .where(and(
        eq(campaignSessionEncounterParticipant.characterId, runtimeParticipantKey(characterId, "Encounter Creature")),
        eq(campaignSessionEncounterParticipant.participantKind, "creature"),
      )).limit(1)
    : tx.select({ snapshot: campaignCreatureNpcProfile.currentSnapshotJson })
      .from(campaignCreatureNpcProfile)
      .where(eq(campaignCreatureNpcProfile.characterId, positiveId(characterId, "Creature NPC")))
      .limit(1);
  const rows = lock ? await query.for("update") : await query;
  if (!rows[0]?.snapshot) throw new Error("Creature encounter snapshot was not found.");
  return rows[0].snapshot;
}

export async function readEncounterCreatureAttacksInTransaction(
  tx: RuntimeIntegrationTransaction,
  characterId: number,
  lock = false,
): Promise<EncounterCreatureAttack[]> {
  const snapshot = await readEncounterCreatureSnapshotInTransaction(tx, characterId, lock);
  return parseCreatureAttacks(typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot));
}

export async function readEncounterCreatureAbilitiesInTransaction(
  tx: RuntimeIntegrationTransaction,
  characterId: number,
): Promise<EncounterCreatureAbility[]> {
  const snapshot = await readEncounterCreatureSnapshotInTransaction(tx, characterId);
  let parsed: unknown;
  try { parsed = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot; } catch { throw new Error("Creature encounter snapshot is invalid JSON."); }
  const abilities = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as { abilities?: unknown }).abilities
    : null;
  if (!Array.isArray(abilities)) return [];
  return abilities.flatMap((candidate): EncounterCreatureAbility[] => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return [];
    const row = candidate as Record<string, unknown>;
    if (typeof row.canonicalId !== "string" || typeof row.abilityName !== "string") return [];
    return [{
      canonicalId: row.canonicalId,
      abilityName: row.abilityName,
      abilityType: typeof row.abilityType === "string" ? row.abilityType : "",
      activation: typeof row.activation === "string" ? row.activation : "",
      requirements: typeof row.requirements === "string" ? row.requirements : "",
      usesRecharge: typeof row.usesRecharge === "string" ? row.usesRecharge : "",
    }];
  });
}

export async function startCreatureAttackInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  input: {
    sourceCharacterId: number;
    targetCharacterId: number;
    attackCanonicalId: string;
    godSuppliedInitiativeCost?: number | null;
    heldIntervention?: boolean;
  },
): Promise<AuthoredActionBinding<CreatureAttackActionPayload>> {
  const attacks = await readEncounterCreatureAttacksInTransaction(tx, input.sourceCharacterId, true);
  const attack = attacks.find(({ canonicalId }) => canonicalId === input.attackCanonicalId);
  if (!attack) throw new Error("The selected Creature Attack is no longer available.");
  const cost = resolveCreatureAttackInitiativeCost({
    attackName: attack.attackName,
    damage: attack.damage,
    godSuppliedInitiativeCost: input.godSuppliedInitiativeCost,
  });
  if (cost.cost === null) throw new Error("This Creature Attack needs an explicit G.O.D. Initiative Cost.");
  const payload: CreatureAttackActionPayload = {
    targetCharacterId: input.targetCharacterId,
    attackCanonicalId: attack.canonicalId,
  };
  return startAuthoredActionInTransaction(tx, context, {
    sourceCharacterId: input.sourceCharacterId,
    sourceKind: "creature-attack",
    sourceRef: attack.canonicalId,
    label: `${attack.attackName} Attack`,
    initiativeCost: cost.cost,
    allowsMultiRound: false,
    heldIntervention: input.heldIntervention,
    payload,
    targetCharacterIds: [input.targetCharacterId],
  }) as Promise<AuthoredActionBinding<CreatureAttackActionPayload>>;
}

function spellTargetIds(request: SpellCastRequest): number[] {
  return Object.values(request.selections.targetGroups).flat();
}

export async function prepareEncounterSpellActionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  request: SpellCastRequest,
  actingUserId: string,
) {
  assertLiveEncounter(context);
  await requireEncounterParticipants(tx, context, [request.casterCharacterId, ...spellTargetIds(request)]);
  const preparation = await prepareCharacterSpellCastInTransaction(tx, request, actingUserId);
  const allowed = new Set((await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .where(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId))).map(({ characterId }) => characterId));
  return {
    ...preparation,
    targetOptions: preparation.targetOptions.filter(({ characterId }) => allowed.has(characterId)),
  };
}

export async function startSpellActionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  request: SpellCastRequest,
  actingUserId: string,
  heldIntervention = false,
): Promise<{ binding: AuthoredActionBinding<SpellCastRequest>; preview: Awaited<ReturnType<typeof prepareCharacterSpellCastInTransaction>> }> {
  if (request.source.kind === "raw-formula") {
    throw new Error("Unsaved Raw Formula casting has no durable combat identity. Save it first or use Generic Initiative.");
  }
  const preview = await prepareCharacterSpellCastInTransaction(tx, request, actingUserId);
  if (preview.plan.status !== "ready") throw new Error(preview.plan.issues[0] ?? "The Spell is not ready to cast.");
  const binding = await startAuthoredActionInTransaction(tx, context, {
    sourceCharacterId: request.casterCharacterId,
    sourceKind: "spell",
    sourceRef: preview.plan.source.identity,
    label: `Cast ${preview.plan.spell.name}`,
    initiativeCost: preview.plan.finalInitiativeCost,
    allowsMultiRound: true,
    heldIntervention,
    payload: request as unknown as Record<string, unknown>,
    targetCharacterIds: spellTargetIds(request),
  });
  return { binding: binding as AuthoredActionBinding<SpellCastRequest>, preview };
}

export async function startItemActionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  request: ItemUseRequest,
  initiativeCost: number,
  actingUserId: string,
  heldIntervention = false,
): Promise<{ binding: AuthoredActionBinding<ItemUseRequest>; preview: Awaited<ReturnType<typeof prepareCharacterItemUseInTransaction>> }> {
  const targetCharacterId = request.targetCharacterId ?? request.sourceCharacterId;
  await requireEncounterParticipants(tx, context, [request.sourceCharacterId, targetCharacterId]);
  const preview = await prepareCharacterItemUseInTransaction(tx, request, actingUserId);
  if (!preview.plan.ready) throw new Error(preview.plan.issues[0] ?? "The Item is not ready to use.");
  const binding = await startAuthoredActionInTransaction(tx, context, {
    sourceCharacterId: request.sourceCharacterId,
    sourceKind: "item",
    sourceRef: `item:${request.itemId}`,
    sourceInstanceId: request.itemInstanceId,
    label: `${preview.plan.item.name} — ${preview.plan.item.activationLabel}`,
    initiativeCost,
    allowsMultiRound: false,
    heldIntervention,
    payload: request as unknown as Record<string, unknown>,
    targetCharacterIds: [targetCharacterId],
  });
  return { binding: binding as AuthoredActionBinding<ItemUseRequest>, preview };
}

export async function prepareEncounterItemActionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  request: ItemUseRequest,
  actingUserId: string,
) {
  assertLiveEncounter(context);
  const targetId = request.targetCharacterId ?? request.sourceCharacterId;
  await requireEncounterParticipants(tx, context, [request.sourceCharacterId, targetId]);
  const preparation = await prepareCharacterItemUseInTransaction(tx, request, actingUserId);
  const allowed = new Set((await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .where(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId))).map(({ characterId }) => characterId));
  return {
    ...preparation,
    targetOptions: preparation.targetOptions.filter(({ characterId }) => allowed.has(characterId)),
  };
}

export async function startCreatureAbilityActionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  request: CreatureAbilityUseRequest,
  initiativeCost: number,
  actingUserId: string,
  heldIntervention = false,
): Promise<{ binding: AuthoredActionBinding<CreatureAbilityUseRequest>; preview: Awaited<ReturnType<typeof prepareCreatureAbilityUseInTransaction>> }> {
  if (request.sourceCharacterId < 0) {
    const ruling = await prepareEncounterCreatureAbilityActionInTransaction(tx, context, request, actingUserId);
    if ("status" in ruling) throw new Error(`CREATURE_GOD_RULING_REQUIRED: ${ruling.explanation}`);
  }
  const preview = await prepareCreatureAbilityUseInTransaction(tx, request, actingUserId);
  if (preview.plan.status !== "ready") throw new Error(preview.plan.issues[0] ?? "The Creature Ability is not ready.");
  const durableRequest: CreatureAbilityUseRequest = {
    ...request,
    previewFingerprint: preview.plan.fingerprint,
  };
  const binding = await startAuthoredActionInTransaction(tx, context, {
    sourceCharacterId: request.sourceCharacterId,
    sourceKind: "creature-ability",
    sourceRef: request.abilityCanonicalId,
    label: preview.plan.ability.abilityName,
    initiativeCost,
    allowsMultiRound: false,
    heldIntervention,
    payload: durableRequest as unknown as Record<string, unknown>,
    targetCharacterIds: request.targetCharacterIds,
  });
  return { binding: binding as AuthoredActionBinding<CreatureAbilityUseRequest>, preview };
}

export async function prepareEncounterCreatureAbilityActionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  request: CreatureAbilityUseRequest,
  actingUserId: string,
): Promise<CreatureAbilityUsePreparation | DirectCreatureAbilityRuling> {
  assertLiveEncounter(context);
  await requireEncounterParticipants(tx, context, [request.sourceCharacterId, ...request.targetCharacterIds]);
  if (request.sourceCharacterId < 0) {
    const abilities = await readEncounterCreatureAbilitiesInTransaction(tx, request.sourceCharacterId);
    const ability = abilities.find(({ canonicalId }) => canonicalId === request.abilityCanonicalId);
    if (!ability) throw new Error("The selected authored Creature Ability is no longer present in this encounter snapshot.");
    return {
      status: "needs-god-ruling",
      sourceKind: "creature-ability",
      sourceRef: ability.canonicalId,
      ability,
      explanation: "The exact authored Creature Ability is preserved, but this direct encounter Creature has no Character-backed ability executor. The G.O.D. must rule its governing Roll and effects; no Character Skill, inventory, weapon governance, or Health state was inferred.",
    };
  }
  const preparation = await prepareCreatureAbilityUseInTransaction(tx, request, actingUserId);
  const allowed = new Set((await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .where(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId))).map(({ characterId }) => characterId));
  return {
    ...preparation,
    targetOptions: preparation.targetOptions.filter(({ characterId }) => allowed.has(characterId)),
  };
}

type LockedBinding = {
  id: number;
  pendingActionId: number;
  sourceCharacterId: number;
  sourceKind: AuthoredActionSourceKind;
  sourceRef: string;
  sourceInstanceId: number | null;
  payloadJson: string;
  resolutionStatus: "pending" | "resolved" | "cancelled" | "needs-ruling";
  action: PendingInitiativeActionState;
};

async function lockAuthoredBinding(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  bindingId: number,
): Promise<LockedBinding> {
  const [row] = await tx.select({
    id: campaignSessionEncounterPendingActionSource.id,
    pendingActionId: campaignSessionEncounterPendingActionSource.pendingActionId,
    sourceCharacterId: campaignSessionEncounterPendingActionSource.sourceCharacterId,
    sourceKind: campaignSessionEncounterPendingActionSource.sourceKind,
    sourceRef: campaignSessionEncounterPendingActionSource.sourceRef,
    sourceInstanceId: campaignSessionEncounterPendingActionSource.sourceInstanceId,
    payloadJson: campaignSessionEncounterPendingActionSource.payloadJson,
    resolutionStatus: campaignSessionEncounterPendingActionSource.resolutionStatus,
    actionId: campaignSessionEncounterPendingAction.id,
    actionEncounterId: campaignSessionEncounterPendingAction.encounterId,
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
    actionStatus: campaignSessionEncounterPendingAction.status,
    startedRound: campaignSessionEncounterPendingAction.startedRound,
    completedRound: campaignSessionEncounterPendingAction.completedRound,
  }).from(campaignSessionEncounterPendingActionSource)
    .innerJoin(campaignSessionEncounterPendingAction, and(
      eq(campaignSessionEncounterPendingAction.id, campaignSessionEncounterPendingActionSource.pendingActionId),
      eq(campaignSessionEncounterPendingAction.encounterId, campaignSessionEncounterPendingActionSource.encounterId),
    ))
    .where(and(
      eq(campaignSessionEncounterPendingActionSource.id, positiveId(bindingId, "Authored Action")),
      eq(campaignSessionEncounterPendingActionSource.encounterId, context.encounterId),
      eq(campaignSessionEncounterPendingActionSource.sceneId, context.sceneId),
      eq(campaignSessionEncounterPendingActionSource.sessionId, context.sessionId),
      eq(campaignSessionEncounterPendingActionSource.campaignId, context.campaignId),
    )).limit(1)
    .for("update", {
      of: [
        campaignSessionEncounterPendingActionSource,
        campaignSessionEncounterPendingAction,
      ],
    });
  if (!row) throw new Error("That authored Encounter action no longer exists.");
  return {
    id: row.id,
    pendingActionId: row.pendingActionId,
    sourceCharacterId: row.sourceCharacterId,
    sourceKind: row.sourceKind,
    sourceRef: row.sourceRef,
    sourceInstanceId: row.sourceInstanceId,
    payloadJson: row.payloadJson,
    resolutionStatus: row.resolutionStatus,
    action: {
      id: row.actionId,
      encounterId: row.actionEncounterId,
      actorCharacterId: row.actorCharacterId,
      label: row.label,
      actionKind: row.actionKind,
      allowsMultiRound: row.allowsMultiRound,
      originalInitiativeCost: row.originalInitiativeCost,
      initiativeSpent: row.initiativeSpent,
      remainingInitiativeCost: row.remainingInitiativeCost,
      startInitiative: row.startInitiative,
      startTimelineInitiative: row.startTimelineInitiative,
      expectedCompletionInitiative: row.expectedCompletionInitiative,
      status: row.actionStatus,
      startedRound: row.startedRound,
      completedRound: row.completedRound,
    },
  };
}

function targetIdsForBinding(binding: LockedBinding): number[] {
  if (binding.sourceKind === "weapon") {
    return [parseDurablePayload<WeaponActionPayload>(binding.payloadJson).targetCharacterId];
  }
  if (binding.sourceKind === "creature-attack") {
    return [parseDurablePayload<CreatureAttackActionPayload>(binding.payloadJson).targetCharacterId];
  }
  if (binding.sourceKind === "spell") {
    return spellTargetIds(parseDurablePayload<SpellCastRequest>(binding.payloadJson));
  }
  if (binding.sourceKind === "item") {
    const request = parseDurablePayload<ItemUseRequest>(binding.payloadJson);
    return [request.targetCharacterId ?? request.sourceCharacterId];
  }
  return parseDurablePayload<CreatureAbilityUseRequest>(binding.payloadJson).targetCharacterIds;
}

async function markBindingFinished(
  tx: RuntimeIntegrationTransaction,
  binding: LockedBinding,
  status: "resolved" | "cancelled" | "needs-ruling",
  summary: string,
): Promise<void> {
  const updated = await tx.update(campaignSessionEncounterPendingActionSource).set({
    resolutionStatus: status,
    resolutionSummary: summary.trim(),
    resolvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(campaignSessionEncounterPendingActionSource.id, binding.id),
    eq(campaignSessionEncounterPendingActionSource.resolutionStatus, binding.resolutionStatus),
  )).returning({ id: campaignSessionEncounterPendingActionSource.id });
  if (!updated.length) throw new Error("The authored action changed before resolution completed.");
}

async function successfulReactionForAction(
  tx: RuntimeIntegrationTransaction,
  binding: LockedBinding,
): Promise<{ type: string } | null> {
  const reactions = await tx.select({
    type: campaignSessionEncounterReaction.reactionType,
    status: campaignSessionEncounterReaction.status,
    outcome: campaignSessionEncounterReaction.outcome,
  }).from(campaignSessionEncounterReaction)
    .where(eq(campaignSessionEncounterReaction.pendingActionId, binding.pendingActionId))
    .orderBy(asc(campaignSessionEncounterReaction.id))
    .for("update");
  if (reactions.some(({ status }) => status === "declared")) {
    throw new Error("Resolve every declared Reaction before resolving the attack.");
  }
  const successful = reactions.find(({ status, outcome }) => status === "resolved" && outcome === "success");
  return successful ? { type: successful.type } : null;
}

export async function resolveAuthoredActionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  bindingId: number,
  actingUserId: string,
  input: ResolveAuthoredActionInput,
): Promise<ResolveAuthoredActionResult> {
  assertLiveEncounter(context);
  const binding = await lockAuthoredBinding(tx, context, bindingId);
  requireReadyAuthoredAction(binding.action, binding.resolutionStatus);
  await requireEncounterParticipant(tx, context, binding.sourceCharacterId, true);
  await requireEncounterParticipants(tx, context, targetIdsForBinding(binding));

  let summary = "";
  let health: ActiveHealthView | null = null;
  let spell: SpellCastExecutionResult | null = null;
  let itemResult: ItemUseExecutionResult | null = null;
  let creatureAbility: CreatureAbilityUseResult | null = null;
  let manualEffects: readonly unknown[] = [];

  if (binding.sourceKind === "weapon" || binding.sourceKind === "creature-attack") {
    const outcome = input.outcome;
    if (!outcome) throw new Error("The G.O.D. must record the attack outcome.");
    const reaction = await successfulReactionForAction(tx, binding);
    if (reaction && outcome === "hit") {
      throw new Error(`A successful ${reaction.type} already prevented this attack from hitting.`);
    }
    const targetCharacterId = binding.sourceKind === "weapon"
      ? parseDurablePayload<WeaponActionPayload>(binding.payloadJson).targetCharacterId
      : parseDurablePayload<CreatureAttackActionPayload>(binding.payloadJson).targetCharacterId;
    if (binding.sourceKind === "weapon") {
      const payload = parseDurablePayload<WeaponActionPayload>(binding.payloadJson);
      const equipment = await readCharacterEquipmentStateInTransaction(tx, binding.sourceCharacterId);
      requireWieldedWeapon(equipment.wieldedWeapons, payload.itemId, payload.instanceId);
    } else {
      const payload = parseDurablePayload<CreatureAttackActionPayload>(binding.payloadJson);
      const attacks = await readEncounterCreatureAttacksInTransaction(tx, binding.sourceCharacterId, true);
      if (!attacks.some(({ canonicalId }) => canonicalId === payload.attackCanonicalId)) {
        throw new Error("The selected Creature Attack is no longer present in the current snapshot.");
      }
    }
    if (outcome === "hit") {
      const damage = parseDirectNumericDamage(input.finalDamage);
      if (damage === null) throw new Error("A damaging Hit requires final direct numeric damage.");
      const target = await requireEncounterParticipant(tx, context, targetCharacterId, true);
      health = await applyLocalizedDamageInTransaction(tx, {
        characterId: target.characterId,
        amount: damage,
        hitLocationNumber: input.hitLocationNumber,
        poolKey: input.poolKey,
        injuryName: input.injuryName,
        injuryNotes: input.injuryNotes,
      }, target.npcKind);
      summary = `${binding.action.label}: Hit for ${damage} direct damage.`;
    } else if (outcome === "other") {
      summary = cleanText(input.rulingSummary ?? "", "G.O.D. ruling summary");
    } else {
      summary = `${binding.action.label}: ${outcome}. No damage applied.`;
    }
  } else if (binding.sourceKind === "spell") {
    const request = parseDurablePayload<SpellCastRequest>(binding.payloadJson);
    spell = await executeCharacterSpellCastInCallerTransaction(
      tx as ActiveHealthTransaction,
      request,
      actingUserId,
      true,
      (effect) => bindPersistedEffectDurationInTransaction(tx, context, effect).then(() => undefined),
    );
    manualEffects = spell.manualEffects;
    summary = `${spell.spell.name} cast for ${spell.finalManaCost} Mana.`;
  } else if (binding.sourceKind === "item") {
    const request = parseDurablePayload<ItemUseRequest>(binding.payloadJson);
    itemResult = await executeCharacterItemUseInCallerTransaction(
      tx as ActiveHealthTransaction,
      request,
      actingUserId,
      (effect) => bindPersistedEffectDurationInTransaction(tx, context, effect).then(() => undefined),
    );
    manualEffects = itemResult.manualEffects;
    summary = `${itemResult.item.name} used on ${itemResult.target.name}.`;
  } else {
    const request = parseDurablePayload<CreatureAbilityUseRequest>(binding.payloadJson);
    creatureAbility = await executeCreatureAbilityUseInCallerTransaction(
      tx as ActiveHealthTransaction,
      request,
      actingUserId,
      true,
      (effect) => bindPersistedEffectDurationInTransaction(tx, context, effect).then(() => undefined),
    );
    manualEffects = creatureAbility.manualEffects;
    summary = `${creatureAbility.ability.abilityName} resolved.`;
  }

  await markBindingFinished(tx, binding, "resolved", summary);
  return {
    bindingId: binding.id,
    sourceCharacterId: binding.sourceCharacterId,
    targetCharacterIds: targetIdsForBinding(binding),
    sourceKind: binding.sourceKind,
    summary,
    health,
    spell,
    item: itemResult,
    creatureAbility,
    manualEffects,
  };
}

export async function cancelAuthoredActionBindingInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  pendingActionId: number,
  summary: string,
): Promise<void> {
  await tx.update(campaignSessionEncounterPendingActionSource).set({
    resolutionStatus: "cancelled",
    resolutionSummary: summary.trim(),
    resolvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(campaignSessionEncounterPendingActionSource.pendingActionId, pendingActionId),
    eq(campaignSessionEncounterPendingActionSource.encounterId, context.encounterId),
    eq(campaignSessionEncounterPendingActionSource.resolutionStatus, "pending"),
  ));
  await tx.update(campaignSessionEncounterReaction).set({
    status: "needs-ruling",
    outcome: "Source action ended before Reaction resolution.",
    resolvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(campaignSessionEncounterReaction.pendingActionId, pendingActionId),
    eq(campaignSessionEncounterReaction.status, "declared"),
  ));
}

export async function declareEncounterReactionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  input: {
    pendingActionId: number;
    reactorCharacterId: number;
    reactionType: Extract<EncounterReactionType, "dodge" | "block" | "parry">;
    defendingItemId?: number | null;
    defendingInstanceId?: number | null;
  },
): Promise<{ id: number; committedInitiativeCost: number }> {
  assertActiveInitiativeHierarchy(context);
  await requireEncounterParticipant(tx, context, input.reactorCharacterId, true);
  const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const action = engine.pendingActions.find(({ id }) => id === input.pendingActionId);
  if (!action || action.status !== "active") throw new Error("Reaction requires an active Pending Action window.");
  if (action.actorCharacterId === input.reactorCharacterId) throw new Error("An actor cannot react to their own action.");
  const reactor = engine.participants.find(({ characterId }) => characterId === input.reactorCharacterId);
  if (!reactor) throw new Error("Reaction source is not enrolled in Initiative.");
  const eligible = canParticipantReactToAction(action, reactor.currentInitiative)
    || canHoldingParticipantIntervene(engine.runtime, reactor);
  if (!eligible) throw new Error("This Participant has no valid Reaction opportunity for that action.");
  const bindingRows = await tx.select({ id: campaignSessionEncounterPendingActionSource.id })
    .from(campaignSessionEncounterPendingActionSource)
    .where(and(
      eq(campaignSessionEncounterPendingActionSource.pendingActionId, action.id),
      eq(campaignSessionEncounterPendingActionSource.encounterId, context.encounterId),
      eq(campaignSessionEncounterPendingActionSource.resolutionStatus, "pending"),
    )).limit(1)
    .for("update");
  if (!bindingRows[0]) throw new Error("Reactions currently require an unresolved authored Encounter action.");

  let defendingItemId: number | null = null;
  let defendingInstanceId: number | null = null;
  let weaponCost: number | null = null;
  if (input.reactionType === "block" || input.reactionType === "parry") {
    defendingItemId = positiveId(input.defendingItemId ?? 0, "Defending Weapon");
    defendingInstanceId = input.defendingInstanceId ?? null;
    const equipment = await readCharacterEquipmentStateInTransaction(tx, input.reactorCharacterId);
    const weapon = requireWieldedWeapon(equipment.wieldedWeapons, defendingItemId, defendingInstanceId);
    if (weapon.initiativeCost === null) throw new Error("The defending Weapon needs an authored Initiative Cost.");
    weaponCost = weapon.initiativeCost;
  }
  const committedInitiativeCost = getReactionCommitment(input.reactionType, weaponCost);
  const changed = applyDirectInitiativeDelta(engine, input.reactorCharacterId, -committedInitiativeCost);
  await persistInitiativeEngineInTransaction(tx, context, engine, changed);
  const [created] = await tx.insert(campaignSessionEncounterReaction).values({
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    pendingActionId: action.id,
    reactorCharacterId: input.reactorCharacterId,
    reactionType: input.reactionType,
    defendingItemId,
    defendingInstanceId,
    committedInitiativeCost,
  }).returning({ id: campaignSessionEncounterReaction.id });
  if (!created) throw new Error("The Reaction could not be recorded.");
  return { id: created.id, committedInitiativeCost };
}

export async function resolveEncounterReactionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  reactionId: number,
  succeeded: boolean,
): Promise<{ defenderFinalCost: number; attackerAdditionalCost: number; attackPrevented: boolean }> {
  const [reaction] = await tx.select().from(campaignSessionEncounterReaction).where(and(
    eq(campaignSessionEncounterReaction.id, positiveId(reactionId, "Reaction")),
    eq(campaignSessionEncounterReaction.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!reaction || reaction.status !== "declared") throw new Error("That Reaction is not awaiting resolution.");
  const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const action = engine.pendingActions.find(({ id }) => id === reaction.pendingActionId);
  if (!action) throw new Error("The Reaction source action no longer exists.");
  if (action.status === "interrupted" || action.status === "abandoned" || action.status === "ended") {
    await tx.update(campaignSessionEncounterReaction).set({
      status: "needs-ruling",
      outcome: "Source action ended before Reaction resolution.",
      resolvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(campaignSessionEncounterReaction.id, reaction.id));
    throw new Error("The source action ended. This Reaction now needs an explicit keep/refund ruling.");
  }
  if (reaction.reactionType === "no-reaction") throw new Error("No Reaction has no resolution cost.");
  const result = reconcileReaction({
    reactionType: reaction.reactionType,
    committedInitiativeCost: reaction.committedInitiativeCost,
    attackerInitiativeCost: action.originalInitiativeCost,
    succeeded,
  });
  let changed = engine;
  if (result.defenderRefund > 0) {
    changed = applyDirectInitiativeDelta(changed, reaction.reactorCharacterId, result.defenderRefund);
  }
  if (result.attackerAdditionalCost > 0) {
    changed = applyDirectInitiativeDelta(changed, action.actorCharacterId, -result.attackerAdditionalCost);
  }
  await persistInitiativeEngineInTransaction(tx, context, engine, changed);
  await tx.update(campaignSessionEncounterReaction).set({
    status: "resolved",
    outcome: succeeded ? "success" : "failure",
    defenderFinalCost: result.defenderFinalCost,
    attackerAdditionalCost: result.attackerAdditionalCost,
    resolvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterReaction.id, reaction.id));
  return result;
}

export async function ruleOnInterruptedReactionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  reactionId: number,
  ruling: "keep" | "refund",
): Promise<void> {
  const [reaction] = await tx.select().from(campaignSessionEncounterReaction).where(and(
    eq(campaignSessionEncounterReaction.id, positiveId(reactionId, "Reaction")),
    eq(campaignSessionEncounterReaction.encounterId, context.encounterId),
  )).limit(1).for("update");
  if (!reaction || reaction.status !== "needs-ruling") throw new Error("That Reaction does not need a ruling.");
  if (ruling === "refund") {
    const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
    const changed = applyDirectInitiativeDelta(engine, reaction.reactorCharacterId, reaction.committedInitiativeCost);
    await persistInitiativeEngineInTransaction(tx, context, engine, changed);
  }
  await tx.update(campaignSessionEncounterReaction).set({
    status: "resolved",
    outcome: ruling === "refund" ? "Interrupted source — committed cost refunded." : "Interrupted source — committed cost kept.",
    defenderFinalCost: ruling === "refund" ? 0 : reaction.committedInitiativeCost,
    attackerAdditionalCost: 0,
    resolvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(campaignSessionEncounterReaction.id, reaction.id));
}

export async function enrollSpawnedCreatureInInitiativeInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  characterId: number,
  movementMode?: string,
): Promise<void> {
  const engine = await loadInitiativeEngineInTransaction(tx, context.encounterId);
  const capacity = await resolveInitiativeCapacityInTransaction(tx, characterId, context.campaignId, movementMode);
  const changed = enrollLateInitiativeParticipant(engine, capacity);
  await persistInitiativeEngineInTransaction(tx, context, engine, changed);
}

export async function applyEncounterDamageInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  input: {
    targetCharacterId: number;
    amount: number;
    hitLocationNumber?: number | null;
    poolKey?: string | null;
    injuryName?: string;
    injuryNotes?: string;
  },
): Promise<ActiveHealthView> {
  assertLiveEncounter(context);
  const target = await requireEncounterParticipant(tx, context, input.targetCharacterId, true);
  return applyLocalizedDamageInTransaction(tx, {
    characterId: target.characterId,
    amount: input.amount,
    hitLocationNumber: input.hitLocationNumber,
    poolKey: input.poolKey,
    injuryName: input.injuryName,
    injuryNotes: input.injuryNotes,
  }, target.npcKind);
}

export async function healEncounterParticipantInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  input: { targetCharacterId: number; amount: number; scope: "whole-body" | "area"; poolKey?: string | null },
): Promise<ActiveHealthView> {
  assertLiveEncounter(context);
  const target = await requireEncounterParticipant(tx, context, input.targetCharacterId, true);
  return input.scope === "whole-body"
    ? healFullBodyInTransaction(tx, target.characterId, target.npcKind, input.amount)
    : healAreaInTransaction(tx, target.characterId, target.npcKind, cleanText(input.poolKey ?? "", "HP Pool"), input.amount);
}

export async function addEncounterInjuryInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  input: Omit<AddInjuryCommand, "characterId"> & { targetCharacterId: number },
): Promise<ActiveHealthView> {
  assertLiveEncounter(context);
  const target = await requireEncounterParticipant(tx, context, input.targetCharacterId, true);
  return addInjuryInTransaction(tx, { ...input, characterId: target.characterId }, target.npcKind);
}

export async function resolveEncounterInjuryInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  targetCharacterId: number,
  injuryId: number,
): Promise<ActiveHealthView> {
  assertLiveEncounter(context);
  const target = await requireEncounterParticipant(tx, context, targetCharacterId, true);
  return resolveInjuryInTransaction(tx, target.characterId, target.npcKind, injuryId);
}

export async function mutateEncounterManaInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  input: { targetCharacterId: number; system: CharacterMagicSystem; operation: "spend" | "restore" | "restore-pool"; amount?: number },
) {
  assertLiveEncounter(context);
  await requireEncounterParticipant(tx, context, input.targetCharacterId, true);
  if (input.operation === "restore-pool") {
    await restoreActiveManaPoolInTransaction(tx, { characterId: input.targetCharacterId, system: input.system });
  } else {
    const amount = positiveAmount(input.amount ?? 0, "Mana amount");
    const command = { characterId: input.targetCharacterId, system: input.system, amount };
    if (input.operation === "spend") await spendActiveManaInTransaction(tx, command);
    else await restoreActiveManaInTransaction(tx, command);
  }
  return readActiveManaInTransaction(tx, input.targetCharacterId);
}

export async function addEncounterConditionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  actingUserId: string,
  input: { targetCharacterId: number; name: string; description: string; duration: RuntimeDuration },
) {
  assertLiveEncounter(context);
  await requireEncounterParticipant(tx, context, input.targetCharacterId, true);
  const created = await applyConditionInTransaction(tx, {
    characterId: input.targetCharacterId,
    effect: { kind: "condition.apply", name: input.name, description: input.description, duration: input.duration },
    source: { kind: "god", id: actingUserId, name: "G.O.D. Tabletop Operations" },
  });
  await bindPersistedEffectDurationInTransaction(tx, context, {
    kind: "condition",
    id: created.id,
    characterId: created.characterId,
    duration: created.duration,
  });
  return readActiveEffectsInTransaction(tx, input.targetCharacterId, false);
}

export async function resolveEncounterConditionInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  targetCharacterId: number,
  conditionId: number,
  note = "",
) {
  assertLiveEncounter(context);
  await requireEncounterParticipant(tx, context, targetCharacterId, true);
  await resolveConditionInTransaction(tx, targetCharacterId, conditionId, note);
  await closeDurationBindingForEffectInTransaction(tx, {
    effectKind: "condition",
    effectId: conditionId,
    characterId: targetCharacterId,
    reason: note.trim() || "Condition resolved manually in Tabletop Operations.",
  });
  return readActiveEffectsInTransaction(tx, targetCharacterId, false);
}

export async function addEncounterModifierInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  actingUserId: string,
  input: { targetCharacterId: number; label: string; channel: TemporaryModifierChannel; targetKey: string; amount: number; duration: RuntimeDuration },
) {
  assertLiveEncounter(context);
  await requireEncounterParticipant(tx, context, input.targetCharacterId, true);
  const created = await applyModifierInTransaction(tx, {
    characterId: input.targetCharacterId,
    effect: { kind: "modifier.apply", label: input.label, channel: input.channel, targetKey: input.targetKey, amount: input.amount, duration: input.duration },
    source: { kind: "god", id: actingUserId, name: "G.O.D. Tabletop Operations" },
  });
  await bindPersistedEffectDurationInTransaction(tx, context, {
    kind: "modifier",
    id: created.id,
    characterId: created.characterId,
    duration: created.duration,
  });
  return readActiveEffectsInTransaction(tx, input.targetCharacterId, false);
}

export async function endEncounterModifierInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  targetCharacterId: number,
  modifierId: number,
  note = "",
) {
  assertLiveEncounter(context);
  await requireEncounterParticipant(tx, context, targetCharacterId, true);
  await endModifierInTransaction(tx, targetCharacterId, modifierId, note);
  await closeDurationBindingForEffectInTransaction(tx, {
    effectKind: "modifier",
    effectId: modifierId,
    characterId: targetCharacterId,
    reason: note.trim() || "Modifier ended manually in Tabletop Operations.",
  });
  return readActiveEffectsInTransaction(tx, targetCharacterId, false);
}

export async function setEncounterEquipmentStateInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  input:
    | { kind: "stack"; targetCharacterId: number; itemId: number; state: EquipmentState; quantity: number }
    | { kind: "instance"; targetCharacterId: number; instanceId: number; state: EquipmentState },
) {
  assertLiveEncounter(context);
  await requireEncounterParticipant(tx, context, input.targetCharacterId, true);
  if (input.kind === "instance") {
    return setInstanceEquipmentStateInTransaction(tx, {
      characterId: input.targetCharacterId,
      instanceId: input.instanceId,
      state: input.state,
    });
  }
  if (input.state !== "inactive") {
    return setStackEquipmentStateInTransaction(tx, {
      characterId: input.targetCharacterId,
      itemId: input.itemId,
      state: input.state,
      quantity: input.quantity,
    });
  }
  let result = null;
  for (const state of ACTIVE_EQUIPMENT_STATES) {
    result = await setStackEquipmentStateInTransaction(tx, {
      characterId: input.targetCharacterId,
      itemId: input.itemId,
      state,
      quantity: 0,
    });
  }
  if (!result) throw new Error("No active stack Equipment States are configured.");
  return result;
}

async function assertNoActiveInitiative(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
): Promise<void> {
  const [runtime] = await tx.select({ status: campaignSessionEncounterInitiative.status })
    .from(campaignSessionEncounterInitiative)
    .where(eq(campaignSessionEncounterInitiative.encounterId, context.encounterId))
    .limit(1)
    .for("update");
  if (runtime?.status === "active") {
    throw new Error("This Encounter has active Initiative. Start a timed authored action instead.");
  }
}

export async function executeImmediateEncounterSpellInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  actingUserId: string,
  request: SpellCastRequest,
): Promise<SpellCastExecutionResult> {
  assertLiveEncounter(context);
  await assertNoActiveInitiative(tx, context);
  await requireEncounterParticipants(tx, context, [request.casterCharacterId, ...spellTargetIds(request)]);
  return executeCharacterSpellCastInCallerTransaction(
    tx as ActiveHealthTransaction,
    request,
    actingUserId,
    true,
    (effect) => bindPersistedEffectDurationInTransaction(tx, context, effect).then(() => undefined),
  );
}

export async function executeImmediateEncounterItemInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  actingUserId: string,
  request: ItemUseRequest,
): Promise<ItemUseExecutionResult> {
  assertLiveEncounter(context);
  await assertNoActiveInitiative(tx, context);
  await requireEncounterParticipants(tx, context, [
    request.sourceCharacterId,
    request.targetCharacterId ?? request.sourceCharacterId,
  ]);
  return executeCharacterItemUseInCallerTransaction(
    tx as ActiveHealthTransaction,
    request,
    actingUserId,
    (effect) => bindPersistedEffectDurationInTransaction(tx, context, effect).then(() => undefined),
  );
}

export async function executeImmediateEncounterCreatureAbilityInTransaction(
  tx: RuntimeIntegrationTransaction,
  context: OwnedEncounterRuntimeContext,
  actingUserId: string,
  request: CreatureAbilityUseRequest,
): Promise<CreatureAbilityUseResult> {
  assertLiveEncounter(context);
  await assertNoActiveInitiative(tx, context);
  await requireEncounterParticipants(tx, context, [request.sourceCharacterId, ...request.targetCharacterIds]);
  return executeCreatureAbilityUseInCallerTransaction(
    tx as ActiveHealthTransaction,
    request,
    actingUserId,
    true,
    (effect) => bindPersistedEffectDurationInTransaction(tx, context, effect).then(() => undefined),
  );
}

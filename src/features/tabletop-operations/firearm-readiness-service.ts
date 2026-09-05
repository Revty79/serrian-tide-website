import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { item, itemRuntimeProfile, weaponFiringMode, weaponProfile } from "@/db/item-schema";
import { campaignPlayer } from "@/db/campaign-schema";
import {
  campaignCharacter,
  campaignCharacterItem,
  campaignCharacterItemInstance,
} from "@/db/realm-schema";
import {
  campaignCharacterFirearmEvent,
  campaignCharacterFirearmPreparation,
  campaignCharacterFirearmState,
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterActionDeclarationEvent,
  campaignSessionEncounterParticipant,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterResponderOpportunity,
} from "@/db/tabletop-operations-schema";
import type { ResolvedFirearmFiringMode } from "@/features/items/firearm-timing";
import { setInstanceEquipmentStateInTransaction } from "@/features/items/equipment-state-service";

import type { ActionDeclarationActor } from "./action-declaration-service";
import type { InitiativeEngineState } from "./initiative-runtime";
import type {
  OwnedEncounterRuntimeContext,
  RuntimeIntegrationTransaction,
} from "./runtime-integration-service";
import {
  evaluateFirearmReadiness,
  planFirearmAmmunitionTransition,
  resolveFirearmMode,
  resolveFirearmPreparationTiming,
  type FirearmPartialLoadDisposition,
  type FirearmPreparationOperation,
  type FirearmReadinessBlocker,
  type FirearmReadinessStatus,
} from "./firearm-readiness";

export type FirearmReadinessTransaction = RuntimeIntegrationTransaction;

export type InitializeFirearmStateCommand = Readonly<{
  characterId: number;
  itemId: number;
  itemInstanceId: number | null;
  selectedFiringModeId: number;
  capacityRuling?: number | null;
  readinessModeRuling?: "draw-is-ready" | "separate-ready-action" | null;
  reason: string;
  idempotencyKey: string;
}>;

export type StartFirearmPreparationCommand = Readonly<{
  characterId: number;
  itemInstanceId: number;
  operation: FirearmPreparationOperation;
  requestedRounds?: number | null;
  replaceCurrentLoad?: boolean;
  partialLoadDisposition?: FirearmPartialLoadDisposition;
  targetFiringModeId?: number | null;
  godInitiativeCost?: number | null;
  godReason?: string;
  idempotencyKey: string;
}>;

export type FirearmStateCorrectionCommand = Readonly<{
  characterId: number;
  itemInstanceId: number;
  capacityRounds?: number | null;
  readinessMode?: "draw-is-ready" | "separate-ready-action" | null;
  readied?: boolean;
  requiresCycling?: boolean;
  requiresRecoilRecovery?: boolean;
  reason: string;
}>;

export type FirearmWorkspaceView = Readonly<{
  context: { campaignId: number; sessionId: number; sceneId: number; encounterId: number };
  characters: readonly { id: number; name: string; isNpc: boolean; npcKind: string | null; participantKind: string }[];
  selectedCharacterId: number | null;
  selectedItemInstanceId: number | null;
  legacyStacks: readonly {
    itemId: number;
    itemName: string;
    canonicalId: string;
    weaponProfileId: number;
    quantity: number;
    firingModes: readonly { id: number; name: string; mechanicsReviewRequired: boolean }[];
  }[];
  firearms: readonly FirearmInstanceView[];
}>;

export type FirearmInstanceView = Readonly<{
  itemInstanceId: number;
  itemId: number;
  itemName: string;
  canonicalId: string;
  weaponProfileId: number;
  equipmentState: string;
  canonical: {
    ammunitionItemId: number | null;
    ammunitionName: string | null;
    capacityRounds: number | null;
    legacyCapacityText: string;
    readinessMode: string | null;
    drawInitiativeCost: number | null;
    readyInitiativeCost: number | null;
    reloadInitiativeCost: number | null;
    unloadInitiativeCost: number | null;
    firingModeChangeInitiativeCost: number | null;
  };
  modes: readonly ResolvedFirearmFiringMode[];
  inventoryAmmunitionQuantity: number;
  state: null | {
    selectedFiringModeId: number;
    loadedAmmunitionItemId: number | null;
    loadedAmmunitionName: string | null;
    loadedRounds: number;
    capacityRounds: number | null;
    capacitySource: string | null;
    readinessMode: string | null;
    readinessModeSource: string | null;
    readied: boolean;
    requiresCycling: boolean;
    requiresRecoilRecovery: boolean;
    version: number;
    updatedAt: string;
  };
  readiness: { status: FirearmReadinessStatus; blockers: readonly FirearmReadinessBlocker[] };
  preparation: null | {
    id: number;
    operation: string;
    status: string;
    initiativeCost: number;
    timingSource: string;
    pendingActionId: number | null;
    actionDeclarationId: number | null;
    expectedCompletionInitiative: number | null;
    remainingInitiativeCost: number | null;
    reason: string;
    createdAt: string;
  };
  history: readonly {
    id: number;
    eventKind: string;
    reason: string;
    actorUserId: string;
    createdAt: string;
  }[];
}>;

type LockedState = typeof campaignCharacterFirearmState.$inferSelect;

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must reference a saved positive record.`);
  return value;
}

function boundedText(value: string, label: string, required = true, maximum = 1000): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function stateSnapshot(state: LockedState): Record<string, unknown> {
  return {
    itemInstanceId: state.itemInstanceId,
    campaignId: state.campaignId,
    characterId: state.characterId,
    itemId: state.itemId,
    weaponProfileId: state.weaponProfileId,
    selectedFiringModeId: state.selectedFiringModeId,
    loadedAmmunitionItemId: state.loadedAmmunitionItemId,
    loadedAmmunitionProfileId: state.loadedAmmunitionProfileId,
    loadedAmmunitionUnitCostCredits: state.loadedAmmunitionUnitCostCredits,
    loadedRounds: state.loadedRounds,
    capacityRounds: state.capacityRounds,
    capacitySource: state.capacitySource,
    readinessMode: state.readinessMode,
    readinessModeSource: state.readinessModeSource,
    readied: state.readied,
    requiresCycling: state.requiresCycling,
    requiresRecoilRecovery: state.requiresRecoilRecovery,
    version: state.version,
  };
}

async function recordFirearmEvent(
  tx: FirearmReadinessTransaction,
  state: LockedState,
  input: {
    preparationId?: number | null;
    eventKind: string;
    reason?: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
    actorUserId: string;
  },
): Promise<void> {
  await tx.insert(campaignCharacterFirearmEvent).values({
    itemInstanceId: state.itemInstanceId,
    campaignId: state.campaignId,
    characterId: state.characterId,
    preparationId: input.preparationId ?? null,
    eventKind: boundedText(input.eventKind, "Firearm event kind", true, 160),
    reason: boundedText(input.reason ?? "", "Firearm event reason", false),
    beforeStateJson: input.before ?? null,
    afterStateJson: input.after ?? null,
    metadataJson: input.metadata ?? {},
    actorUserId: input.actorUserId,
  });
}

async function assertPersistentParticipant(
  tx: FirearmReadinessTransaction,
  context: OwnedEncounterRuntimeContext,
  characterId: number,
): Promise<void> {
  positiveId(characterId, "Firearm Character");
  const [participant] = await tx.select({ characterId: campaignSessionEncounterParticipant.characterId })
    .from(campaignSessionEncounterParticipant)
    .innerJoin(campaignCharacter, and(
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
  if (!participant) throw new Error("Firearm state requires a persistent Character or NPC in the exact Encounter context.");
}

async function resolvePreparationActor(
  tx: FirearmReadinessTransaction,
  context: OwnedEncounterRuntimeContext,
  input: string | ActionDeclarationActor,
  characterId: number,
): Promise<ActionDeclarationActor> {
  const actor: ActionDeclarationActor = typeof input === "string"
    ? { authority: "god-owner", userId: input }
    : input;
  if (actor.authority === "god-owner") {
    if (actor.userId !== context.ownerUserId) throw new Error("Only the Campaign-owning G.O.D. may govern another participant's firearm preparation.");
    return actor;
  }
  if (actor.characterId !== characterId) throw new Error("A Player may prepare only their own exact firearm instance.");
  const [owned] = await tx.select({ id: campaignCharacter.id }).from(campaignCharacter)
    .innerJoin(campaignPlayer, and(
      eq(campaignPlayer.campaignId, campaignCharacter.campaignId),
      eq(campaignPlayer.userId, actor.userId),
    ))
    .where(and(
      eq(campaignCharacter.id, characterId),
      eq(campaignCharacter.campaignId, context.campaignId),
      eq(campaignCharacter.playerUserId, actor.userId),
      eq(campaignCharacter.isNpc, false),
    )).limit(1);
  if (!owned) throw new Error("A Player may prepare only their assigned non-NPC Character's firearm.");
  return actor;
}

async function lockState(
  tx: FirearmReadinessTransaction,
  context: OwnedEncounterRuntimeContext,
  characterId: number,
  itemInstanceId: number,
): Promise<LockedState> {
  const [state] = await tx.select().from(campaignCharacterFirearmState).where(and(
    eq(campaignCharacterFirearmState.itemInstanceId, positiveId(itemInstanceId, "Firearm Item instance")),
    eq(campaignCharacterFirearmState.characterId, positiveId(characterId, "Firearm Character")),
    eq(campaignCharacterFirearmState.campaignId, context.campaignId),
  )).limit(1).for("update");
  if (!state) throw new Error("This exact owned firearm instance has no initialized runtime state.");
  return state;
}

async function loadProfileAndModes(
  tx: FirearmReadinessTransaction,
  itemId: number,
  weaponProfileId: number,
) {
  const [profile] = await tx.select({
    id: weaponProfile.id,
    itemId: weaponProfile.itemId,
    ammunitionItemId: weaponProfile.ammunitionItemId,
    capacityRounds: weaponProfile.capacityRounds,
    capacity: weaponProfile.capacity,
    readinessMode: weaponProfile.readinessMode,
    drawInitiativeCost: weaponProfile.drawInitiativeCost,
    readyInitiativeCost: weaponProfile.readyInitiativeCost,
    reloadInitiativeCost: weaponProfile.reloadInitiativeCost,
    unloadInitiativeCost: weaponProfile.unloadInitiativeCost,
    firingModeChangeInitiativeCost: weaponProfile.firingModeChangeInitiativeCost,
    updatedAt: weaponProfile.updatedAt,
  }).from(weaponProfile).where(and(eq(weaponProfile.id, weaponProfileId), eq(weaponProfile.itemId, itemId))).limit(1);
  if (!profile) throw new Error("The exact Weapon Profile no longer belongs to this firearm Item.");
  const modes = await tx.select().from(weaponFiringMode)
    .where(eq(weaponFiringMode.weaponProfileId, profile.id))
    .orderBy(asc(weaponFiringMode.sortOrder), asc(weaponFiringMode.id));
  return { profile, modes };
}

async function loadAmmunitionDefinition(
  tx: FirearmReadinessTransaction,
  ammunitionItemId: number | null,
) {
  if (ammunitionItemId === null) return null;
  const [row] = await tx.select({
    itemId: item.id,
    itemName: item.name,
    profileId: weaponProfile.id,
    cyclingModifier: weaponProfile.ammunitionCyclingInitiativeModifier,
    recoilModifier: weaponProfile.ammunitionRecoilResetInitiativeModifier,
  }).from(item).innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
    .where(and(
      eq(item.id, ammunitionItemId),
      sql`lower(trim(${weaponProfile.profileRecordType})) = 'ammunition'`,
    )).limit(1);
  return row ?? null;
}

export async function initializeFirearmStateInTransaction(
  tx: FirearmReadinessTransaction,
  context: OwnedEncounterRuntimeContext,
  actorUserId: string,
  command: InitializeFirearmStateCommand,
): Promise<{ itemInstanceId: number; stateVersion: number; reused: boolean }> {
  await assertPersistentParticipant(tx, context, command.characterId);
  positiveId(command.itemId, "Firearm Item");
  positiveId(command.selectedFiringModeId, "Selected Firing Mode");
  const idempotencyKey = boundedText(command.idempotencyKey, "Initialization request ID", true, 200);
  const reason = boundedText(command.reason, "Initialization reason");
  const [reused] = await tx.select({
    itemInstanceId: campaignCharacterFirearmState.itemInstanceId,
    version: campaignCharacterFirearmState.version,
    characterId: campaignCharacterFirearmState.characterId,
    itemId: campaignCharacterFirearmState.itemId,
    selectedFiringModeId: campaignCharacterFirearmState.selectedFiringModeId,
  }).from(campaignCharacterFirearmState).where(and(
    eq(campaignCharacterFirearmState.campaignId, context.campaignId),
    eq(campaignCharacterFirearmState.initializationKey, idempotencyKey),
  )).limit(1);
  if (reused) {
    if (reused.characterId !== command.characterId || reused.itemId !== command.itemId || reused.selectedFiringModeId !== command.selectedFiringModeId) {
      throw new Error("That initialization request ID was already used for a different firearm state.");
    }
    return { itemInstanceId: reused.itemInstanceId, stateVersion: reused.version, reused: true };
  }

  const [catalog] = await tx.select({
    itemName: item.name,
    weaponProfileId: weaponProfile.id,
    profileRecordType: weaponProfile.profileRecordType,
    capacityRounds: weaponProfile.capacityRounds,
    readinessMode: weaponProfile.readinessMode,
    runtimeUseMode: itemRuntimeProfile.useMode,
    maximumCharges: itemRuntimeProfile.maximumCharges,
  }).from(item).innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
    .leftJoin(itemRuntimeProfile, eq(itemRuntimeProfile.itemId, item.id))
    .where(eq(item.id, command.itemId)).limit(1);
  if (!catalog) throw new Error("The selected Item has no exact Weapon Profile.");
  if (catalog.profileRecordType.trim().toLowerCase() === "ammunition") {
    throw new Error("An Ammunition Profile cannot be initialized as an owned firearm.");
  }
  const [mode] = await tx.select({ id: weaponFiringMode.id }).from(weaponFiringMode).where(and(
    eq(weaponFiringMode.id, command.selectedFiringModeId),
    eq(weaponFiringMode.weaponProfileId, catalog.weaponProfileId),
  )).limit(1);
  if (!mode) throw new Error("The selected Firing Mode does not belong to this Weapon Profile.");

  const capacityRounds = catalog.capacityRounds ?? command.capacityRuling ?? null;
  if (capacityRounds !== null && (!Number.isSafeInteger(capacityRounds) || capacityRounds <= 0)) {
    throw new Error("A runtime firearm capacity ruling must be a positive whole number.");
  }
  if (catalog.capacityRounds === null && capacityRounds !== null && !reason) throw new Error("A G.O.D.-assigned capacity requires a reason.");
  const readinessMode = catalog.readinessMode === "draw-is-ready" || catalog.readinessMode === "separate-ready-action"
    ? catalog.readinessMode
    : command.readinessModeRuling ?? null;
  if (catalog.readinessMode === null && readinessMode !== null && !reason) throw new Error("A G.O.D.-assigned readiness relationship requires a reason.");

  let itemInstanceId = command.itemInstanceId;
  let equipmentState = "inactive";
  if (itemInstanceId === null) {
    const [stack] = await tx.select({
      quantity: campaignCharacterItem.quantity,
      unitCostCredits: campaignCharacterItem.unitCostCredits,
    }).from(campaignCharacterItem).where(and(
      eq(campaignCharacterItem.characterId, command.characterId),
      eq(campaignCharacterItem.itemId, command.itemId),
    )).limit(1).for("update");
    if (!stack) throw new Error("No legacy owned firearm copy is available to assign an exact instance identity.");
    if (stack.quantity === 1) {
      const deleted = await tx.delete(campaignCharacterItem).where(and(
        eq(campaignCharacterItem.characterId, command.characterId),
        eq(campaignCharacterItem.itemId, command.itemId),
        eq(campaignCharacterItem.quantity, stack.quantity),
      )).returning({ itemId: campaignCharacterItem.itemId });
      if (!deleted.length) throw new Error("Owned firearm quantity changed before exact instance assignment.");
    } else {
      const updated = await tx.update(campaignCharacterItem).set({ quantity: stack.quantity - 1 }).where(and(
        eq(campaignCharacterItem.characterId, command.characterId),
        eq(campaignCharacterItem.itemId, command.itemId),
        eq(campaignCharacterItem.quantity, stack.quantity),
      )).returning({ itemId: campaignCharacterItem.itemId });
      if (!updated.length) throw new Error("Owned firearm quantity changed before exact instance assignment.");
    }
    const [created] = await tx.insert(campaignCharacterItemInstance).values({
      characterId: command.characterId,
      itemId: command.itemId,
      currentCharges: catalog.runtimeUseMode === "charges" ? catalog.maximumCharges ?? 0 : 0,
      equipmentState,
      unitCostCredits: stack.unitCostCredits,
    }).returning({ id: campaignCharacterItemInstance.id });
    itemInstanceId = created.id;
  } else {
    const [owned] = await tx.select({
      id: campaignCharacterItemInstance.id,
      equipmentState: campaignCharacterItemInstance.equipmentState,
    }).from(campaignCharacterItemInstance).where(and(
      eq(campaignCharacterItemInstance.id, positiveId(itemInstanceId, "Firearm Item instance")),
      eq(campaignCharacterItemInstance.characterId, command.characterId),
      eq(campaignCharacterItemInstance.itemId, command.itemId),
    )).limit(1).for("update");
    if (!owned) throw new Error("The exact Item instance is not owned by this Character and firearm Item.");
    equipmentState = owned.equipmentState;
    const [existing] = await tx.select({ id: campaignCharacterFirearmState.itemInstanceId })
      .from(campaignCharacterFirearmState)
      .where(eq(campaignCharacterFirearmState.itemInstanceId, owned.id)).limit(1);
    if (existing) throw new Error("This exact firearm copy already has runtime state.");
  }

  const [createdState] = await tx.insert(campaignCharacterFirearmState).values({
    itemInstanceId: itemInstanceId!,
    campaignId: context.campaignId,
    characterId: command.characterId,
    itemId: command.itemId,
    weaponProfileId: catalog.weaponProfileId,
    selectedFiringModeId: command.selectedFiringModeId,
    loadedRounds: 0,
    capacityRounds,
    capacitySource: capacityRounds === null ? null : catalog.capacityRounds === null ? "god-ruling" : "canonical",
    readinessMode,
    readinessModeSource: readinessMode === null ? null : catalog.readinessMode === null ? "god-ruling" : "canonical",
    readied: false,
    requiresCycling: false,
    requiresRecoilRecovery: false,
    initializationKey: idempotencyKey,
    initializedByUserId: actorUserId,
    updatedByUserId: actorUserId,
  }).returning();
  await recordFirearmEvent(tx, createdState, {
    eventKind: "runtime-initialized",
    reason,
    before: null,
    after: stateSnapshot(createdState),
    metadata: {
      explicitBaseline: "empty-not-readied",
      equipmentState,
      ownershipConversion: command.itemInstanceId === null ? "legacy-stack-to-exact-instance" : "existing-exact-instance",
    },
    actorUserId,
  });
  return { itemInstanceId: createdState.itemInstanceId, stateVersion: createdState.version, reused: false };
}

async function ammunitionInventoryRow(
  tx: FirearmReadinessTransaction,
  characterId: number,
  ammunitionItemId: number,
  lock: boolean,
) {
  const query = tx.select({
    quantity: campaignCharacterItem.quantity,
    unitCostCredits: campaignCharacterItem.unitCostCredits,
  }).from(campaignCharacterItem).where(and(
    eq(campaignCharacterItem.characterId, characterId),
    eq(campaignCharacterItem.itemId, ammunitionItemId),
  )).limit(1);
  const rows = lock ? await query.for("update") : await query;
  return rows[0] ?? null;
}

async function updateAmmunitionInventory(
  tx: FirearmReadinessTransaction,
  characterId: number,
  ammunitionItemId: number,
  current: { quantity: number; unitCostCredits: number } | null,
  nextQuantity: number,
  fallbackUnitCostCredits: number,
): Promise<void> {
  if (nextQuantity < 0) throw new Error("Ammunition inventory cannot become negative.");
  if (current && nextQuantity === 0) {
    const deleted = await tx.delete(campaignCharacterItem).where(and(
      eq(campaignCharacterItem.characterId, characterId),
      eq(campaignCharacterItem.itemId, ammunitionItemId),
      eq(campaignCharacterItem.quantity, current.quantity),
    )).returning({ itemId: campaignCharacterItem.itemId });
    if (!deleted.length) throw new Error("Ammunition inventory changed before the firearm operation could complete.");
  } else if (current) {
    const updated = await tx.update(campaignCharacterItem).set({ quantity: nextQuantity }).where(and(
      eq(campaignCharacterItem.characterId, characterId),
      eq(campaignCharacterItem.itemId, ammunitionItemId),
      eq(campaignCharacterItem.quantity, current.quantity),
    )).returning({ itemId: campaignCharacterItem.itemId });
    if (!updated.length) throw new Error("Ammunition inventory changed before the firearm operation could complete.");
  } else if (nextQuantity > 0) {
    await tx.insert(campaignCharacterItem).values({
      characterId,
      itemId: ammunitionItemId,
      quantity: nextQuantity,
      unitCostCredits: fallbackUnitCostCredits,
    });
  }
}

async function completeFirearmPreparationById(
  tx: FirearmReadinessTransaction,
  preparationId: number,
  actorUserId: string,
): Promise<boolean> {
  const [preparation] = await tx.select().from(campaignCharacterFirearmPreparation)
    .where(eq(campaignCharacterFirearmPreparation.id, preparationId)).limit(1).for("update");
  if (!preparation || preparation.status === "completed") return Boolean(preparation);
  if (preparation.status !== "pending") return false;
  if (preparation.pendingActionId !== null) {
    const [pending] = await tx.select({ status: campaignSessionEncounterPendingAction.status })
      .from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.id, preparation.pendingActionId)).limit(1);
    if (pending?.status !== "completed") return false;
    const [openOpportunity] = await tx.select({ id: campaignSessionEncounterResponderOpportunity.id })
      .from(campaignSessionEncounterResponderOpportunity)
      .where(and(
        eq(campaignSessionEncounterResponderOpportunity.declarationId, preparation.actionDeclarationId!),
        eq(campaignSessionEncounterResponderOpportunity.status, "pending"),
      )).limit(1);
    if (openOpportunity) return false;
  }
  const state = await lockState(tx, {
    campaignId: preparation.campaignId,
    sessionId: preparation.sessionId,
    sceneId: preparation.sceneId,
    encounterId: preparation.encounterId,
    ownerUserId: actorUserId,
    encounterStatus: "active",
    sceneStatus: "active",
    sessionStatus: "active",
  }, preparation.characterId, preparation.itemInstanceId);
  if (state.version !== preparation.stateVersion) throw new Error("Firearm state changed after preparation began; completion requires a G.O.D. ruling.");
  const before = stateSnapshot(state);
  const { profile } = await loadProfileAndModes(tx, state.itemId, state.weaponProfileId);
  const updates: Partial<typeof campaignCharacterFirearmState.$inferInsert> = {
    version: state.version + 1,
    updatedByUserId: actorUserId,
    updatedAt: new Date(),
  };

  if (preparation.operation === "draw") {
    await setInstanceEquipmentStateInTransaction(tx, {
      characterId: state.characterId,
      instanceId: state.itemInstanceId,
      state: "wielded",
    });
    updates.readied = state.readinessMode === "draw-is-ready";
  } else if (preparation.operation === "ready") {
    updates.readied = true;
  } else if (preparation.operation === "change-mode") {
    if (preparation.targetFiringModeId === null) throw new Error("A mode-change preparation lost its exact target Firing Mode.");
    updates.selectedFiringModeId = preparation.targetFiringModeId;
  } else if (preparation.operation === "cycle") {
    updates.requiresCycling = false;
  } else if (preparation.operation === "recover-recoil") {
    updates.requiresRecoilRecovery = false;
  } else {
    const ammunitionItemId = preparation.operation === "unload"
      ? state.loadedAmmunitionItemId
      : preparation.ammunitionItemId;
    if (ammunitionItemId === null) throw new Error("The firearm preparation lost its exact ammunition identity.");
    const inventory = await ammunitionInventoryRow(tx, state.characterId, ammunitionItemId, true);
    const transition = planFirearmAmmunitionTransition({
      operation: preparation.operation as "load" | "reload" | "unload",
      loadedRounds: state.loadedRounds,
      inventoryRounds: inventory?.quantity ?? 0,
      capacityRounds: state.capacityRounds,
      requestedRounds: preparation.requestedRounds,
      replaceCurrentLoad: preparation.replaceCurrentLoad,
      disposition: preparation.partialLoadDisposition as FirearmPartialLoadDisposition,
      loadedAmmunitionItemId: state.loadedAmmunitionItemId,
      requestedAmmunitionItemId: preparation.ammunitionItemId,
      canonicalAmmunitionItemId: profile.ammunitionItemId,
    });
    const sourceUnitCost = inventory?.unitCostCredits ?? state.loadedAmmunitionUnitCostCredits ?? 0;
    await updateAmmunitionInventory(
      tx,
      state.characterId,
      ammunitionItemId,
      inventory,
      transition.inventoryRounds,
      sourceUnitCost,
    );
    updates.loadedRounds = transition.loadedRounds;
    updates.loadedAmmunitionItemId = transition.loadedRounds > 0 ? preparation.ammunitionItemId : null;
    updates.loadedAmmunitionProfileId = transition.loadedRounds > 0 ? preparation.ammunitionProfileId : null;
    updates.loadedAmmunitionUnitCostCredits = transition.loadedRounds > 0 ? sourceUnitCost : null;
  }

  const [afterState] = await tx.update(campaignCharacterFirearmState).set(updates).where(and(
    eq(campaignCharacterFirearmState.itemInstanceId, state.itemInstanceId),
    eq(campaignCharacterFirearmState.version, state.version),
  )).returning();
  if (!afterState) throw new Error("Firearm state changed before preparation could complete.");
  const now = new Date();
  await tx.update(campaignCharacterFirearmPreparation).set({
    status: "completed",
    resolvedByUserId: actorUserId,
    resolvedAt: now,
    updatedAt: now,
  }).where(and(
    eq(campaignCharacterFirearmPreparation.id, preparation.id),
    eq(campaignCharacterFirearmPreparation.status, "pending"),
  ));
  await recordFirearmEvent(tx, afterState, {
    preparationId: preparation.id,
    eventKind: `${preparation.operation}-completed`,
    reason: preparation.reason,
    before,
    after: stateSnapshot(afterState),
    metadata: preparation.frozenSnapshotJson as Record<string, unknown>,
    actorUserId,
  });

  if (preparation.actionDeclarationId !== null) {
    const [declaration] = await tx.select({ status: campaignSessionEncounterActionDeclaration.status })
      .from(campaignSessionEncounterActionDeclaration)
      .where(eq(campaignSessionEncounterActionDeclaration.id, preparation.actionDeclarationId)).limit(1).for("update");
    if (declaration && !["resolved", "cancelled", "abandoned"].includes(declaration.status)) {
      await tx.update(campaignSessionEncounterActionDeclaration).set({
        status: "resolved",
        endedByUserId: actorUserId,
        endedAt: now,
        updatedAt: now,
      }).where(eq(campaignSessionEncounterActionDeclaration.id, preparation.actionDeclarationId));
      await tx.insert(campaignSessionEncounterActionDeclarationEvent).values({
        declarationId: preparation.actionDeclarationId,
        encounterId: preparation.encounterId,
        sceneId: preparation.sceneId,
        sessionId: preparation.sessionId,
        campaignId: preparation.campaignId,
        fromStatus: declaration.status,
        toStatus: "resolved",
        eventKind: "firearm-preparation-completed",
        metadata: { firearmPreparationId: preparation.id, itemInstanceId: preparation.itemInstanceId },
        actorUserId,
      });
    }
  }
  return true;
}

export async function startFirearmPreparationInTransaction(
  tx: FirearmReadinessTransaction,
  context: OwnedEncounterRuntimeContext,
  actorInput: string | ActionDeclarationActor,
  command: StartFirearmPreparationCommand,
): Promise<{ preparationId: number; status: string; pendingActionId: number | null; reused: boolean }> {
  await assertPersistentParticipant(tx, context, command.characterId);
  const actor = await resolvePreparationActor(tx, context, actorInput, command.characterId);
  const actorUserId = actor.userId;
  if (actor.authority === "player" && command.godInitiativeCost !== undefined && command.godInitiativeCost !== null) {
    throw new Error("A Player cannot supply a missing firearm Initiative Cost.");
  }
  const idempotencyKey = boundedText(command.idempotencyKey, "Firearm preparation request ID", true, 200);
  const [reused] = await tx.select({
    id: campaignCharacterFirearmPreparation.id,
    itemInstanceId: campaignCharacterFirearmPreparation.itemInstanceId,
    operation: campaignCharacterFirearmPreparation.operation,
    status: campaignCharacterFirearmPreparation.status,
    pendingActionId: campaignCharacterFirearmPreparation.pendingActionId,
  }).from(campaignCharacterFirearmPreparation).where(and(
    eq(campaignCharacterFirearmPreparation.campaignId, context.campaignId),
    eq(campaignCharacterFirearmPreparation.idempotencyKey, idempotencyKey),
  )).limit(1);
  if (reused) {
    if (reused.itemInstanceId !== command.itemInstanceId || reused.operation !== command.operation) {
      throw new Error("That request ID was already used for a different firearm operation.");
    }
    return { preparationId: reused.id, status: reused.status, pendingActionId: reused.pendingActionId, reused: true };
  }

  const state = await lockState(tx, context, command.characterId, command.itemInstanceId);
  const [open] = await tx.select({ id: campaignCharacterFirearmPreparation.id })
    .from(campaignCharacterFirearmPreparation)
    .where(and(
      eq(campaignCharacterFirearmPreparation.itemInstanceId, state.itemInstanceId),
      inArray(campaignCharacterFirearmPreparation.status, ["pending", "interrupted", "requires-god-ruling"]),
    )).limit(1);
  if (open) throw new Error("This exact firearm already has an open preparation action.");
  const [owned] = await tx.select({ equipmentState: campaignCharacterItemInstance.equipmentState })
    .from(campaignCharacterItemInstance)
    .where(and(
      eq(campaignCharacterItemInstance.id, state.itemInstanceId),
      eq(campaignCharacterItemInstance.characterId, state.characterId),
      eq(campaignCharacterItemInstance.itemId, state.itemId),
    )).limit(1).for("update");
  if (!owned) throw new Error("The exact firearm instance is no longer owned by this Character.");
  const { profile, modes } = await loadProfileAndModes(tx, state.itemId, state.weaponProfileId);
  const ammunition = await loadAmmunitionDefinition(tx, profile.ammunitionItemId);
  const resolvedModes = modes.map((mode) => resolveFirearmMode({
    mode: { ...mode, deliveryCadence: mode.deliveryCadence as Parameters<typeof resolveFirearmMode>[0]["mode"]["deliveryCadence"] },
    ammunitionCyclingModifier: ammunition?.cyclingModifier ?? 0,
    ammunitionRecoilModifier: ammunition?.recoilModifier ?? 0,
  }));
  const currentMode = resolvedModes.find(({ id }) => id === state.selectedFiringModeId) ?? null;
  const targetMode = command.operation === "change-mode"
    ? resolvedModes.find(({ id }) => id === command.targetFiringModeId) ?? null
    : currentMode;
  if (!currentMode) throw new Error("The persisted selected Firing Mode no longer belongs to this Weapon Profile.");
  if (command.operation === "change-mode" && (!targetMode || targetMode.id === state.selectedFiringModeId)) {
    throw new Error("Choose a different exact Firing Mode from this Weapon Profile.");
  }
  if (command.operation === "draw" && owned.equipmentState === "wielded") throw new Error("This exact firearm is already drawn or wielded.");
  if ((command.operation === "draw" || command.operation === "ready") && state.readinessMode === null) {
    throw new Error("The firearm readiness relationship requires a G.O.D. ruling before this operation.");
  }
  if (command.operation === "ready" && owned.equipmentState !== "wielded") throw new Error("Draw the exact firearm before readying it.");
  if (command.operation === "ready" && state.readinessMode !== "separate-ready-action") throw new Error("This firearm has no authored separate ready action.");
  if (command.operation === "cycle" && !state.requiresCycling) throw new Error("This firearm does not currently require cycling.");
  if (command.operation === "recover-recoil" && !state.requiresRecoilRecovery) throw new Error("This firearm does not currently require recoil recovery.");
  if (command.operation === "change-mode" && (!targetMode?.timing || !targetMode.deliveryCadence || !targetMode.roundsPerCadence)) {
    throw new Error("The target Firing Mode delivery and follow-up timing are still review-required.");
  }

  if (command.operation === "load" || command.operation === "reload" || command.operation === "unload") {
    const ammoItemId = command.operation === "unload" ? state.loadedAmmunitionItemId : profile.ammunitionItemId;
    if (ammoItemId === null || !ammunition) throw new Error("The Weapon Profile has no exact supported ammunition Profile relationship.");
    const inventory = await ammunitionInventoryRow(tx, state.characterId, ammoItemId, false);
    planFirearmAmmunitionTransition({
      operation: command.operation,
      loadedRounds: state.loadedRounds,
      inventoryRounds: inventory?.quantity ?? 0,
      capacityRounds: state.capacityRounds,
      requestedRounds: command.requestedRounds,
      replaceCurrentLoad: command.replaceCurrentLoad,
      disposition: command.partialLoadDisposition,
      loadedAmmunitionItemId: state.loadedAmmunitionItemId,
      requestedAmmunitionItemId: command.operation === "unload" ? null : ammunition.itemId,
      canonicalAmmunitionItemId: profile.ammunitionItemId,
    });
  }

  const timing = resolveFirearmPreparationTiming({
    operation: command.operation,
    authored: {
      drawInitiativeCost: profile.drawInitiativeCost,
      readyInitiativeCost: profile.readyInitiativeCost,
      reloadInitiativeCost: profile.reloadInitiativeCost,
      unloadInitiativeCost: profile.unloadInitiativeCost,
      firingModeChangeInitiativeCost: profile.firingModeChangeInitiativeCost,
      selectedMode: targetMode,
    },
    godInitiativeCost: command.godInitiativeCost,
    godReason: command.godReason,
  });
  if (timing.status === "requires-god-ruling") throw new Error(`${timing.reason} Supply an explicit nonnegative cost and reason.`);
  const reason = boundedText(timing.reason || command.godReason || "", "Firearm preparation reason", false);
  const disposition = command.partialLoadDisposition ?? "none";
  if (disposition === "discard" && !reason) throw new Error("Deliberately discarding ammunition requires an explicit reason.");
  const frozenSnapshot = {
    schemaVersion: 1,
    operation: command.operation,
    state: stateSnapshot(state),
    canonical: {
      weaponProfileId: profile.id,
      ammunitionItemId: profile.ammunitionItemId,
      capacityRounds: profile.capacityRounds,
      readinessMode: profile.readinessMode,
      firingModeId: targetMode?.id ?? state.selectedFiringModeId,
      firingModeName: targetMode?.name ?? currentMode.name,
      deliveryCadence: targetMode?.deliveryCadence ?? null,
      roundsPerCadence: targetMode?.roundsPerCadence ?? null,
    },
    request: {
      requestedRounds: command.requestedRounds ?? null,
      replaceCurrentLoad: command.replaceCurrentLoad === true,
      partialLoadDisposition: disposition,
      targetFiringModeId: command.targetFiringModeId ?? null,
    },
    timing: { initiativeCost: timing.initiativeCost, source: timing.source, reason },
  };

  let actionDeclarationId: number | null = null;
  let pendingActionId: number | null = null;
  if (timing.initiativeCost > 0) {
    const {
      commitActionDeclarationInTransaction,
      createActionDeclarationDraftInTransaction,
      lockActionDeclarationInTransaction,
    } = await import("./action-declaration-service");
    actionDeclarationId = await createActionDeclarationDraftInTransaction(tx, context, actor, {
      actorCharacterId: state.characterId,
      targetCharacterIds: [],
      label: `${command.operation.replaceAll("-", " ")} ${currentMode.name}`,
      actionKind: `firearm-preparation:${command.operation}`,
      sourceKind: "weapon",
      sourceRef: `instance:${state.itemInstanceId}`,
      sourceInstanceId: state.itemInstanceId,
      sourcePayload: frozenSnapshot,
      weaponItemId: state.itemId,
      firingModeId: targetMode?.id ?? state.selectedFiringModeId,
      attackMode: targetMode?.name ?? currentMode.name,
      initiativeCost: timing.initiativeCost,
      allowsMultiRound: true,
      heldIntervention: false,
      windowKind: "preparation",
      aimDeclared: false,
      calledShot: { declared: false, label: "", assignedPenalty: null },
      explicitModifiers: [],
      preparesForDeclarationId: null,
      godNotes: reason,
    });
    await lockActionDeclarationInTransaction(tx, context, actor, actionDeclarationId);
    pendingActionId = await commitActionDeclarationInTransaction(tx, context, actor, actionDeclarationId);
  }

  const [preparation] = await tx.insert(campaignCharacterFirearmPreparation).values({
    itemInstanceId: state.itemInstanceId,
    campaignId: state.campaignId,
    characterId: state.characterId,
    itemId: state.itemId,
    weaponProfileId: state.weaponProfileId,
    encounterId: context.encounterId,
    sceneId: context.sceneId,
    sessionId: context.sessionId,
    actionDeclarationId,
    pendingActionId,
    operation: command.operation,
    status: "pending",
    stateVersion: state.version,
    targetFiringModeId: command.targetFiringModeId ?? null,
    ammunitionItemId: command.operation === "unload" ? state.loadedAmmunitionItemId : ammunition?.itemId ?? null,
    ammunitionProfileId: command.operation === "unload" ? state.loadedAmmunitionProfileId : ammunition?.profileId ?? null,
    requestedRounds: command.requestedRounds ?? null,
    replaceCurrentLoad: command.replaceCurrentLoad === true,
    partialLoadDisposition: disposition,
    initiativeCost: timing.initiativeCost,
    timingSource: timing.source,
    frozenSnapshotJson: frozenSnapshot,
    reason,
    idempotencyKey,
    createdByUserId: actorUserId,
  }).returning();
  await recordFirearmEvent(tx, state, {
    preparationId: preparation.id,
    eventKind: "preparation-started",
    reason,
    before: stateSnapshot(state),
    after: stateSnapshot(state),
    metadata: frozenSnapshot,
    actorUserId,
  });
  if (timing.initiativeCost === 0) await completeFirearmPreparationById(tx, preparation.id, actorUserId);
  return {
    preparationId: preparation.id,
    status: timing.initiativeCost === 0 ? "completed" : "pending",
    pendingActionId,
    reused: false,
  };
}

export async function correctFirearmStateInTransaction(
  tx: FirearmReadinessTransaction,
  context: OwnedEncounterRuntimeContext,
  actorUserId: string,
  command: FirearmStateCorrectionCommand,
): Promise<number> {
  await assertPersistentParticipant(tx, context, command.characterId);
  const reason = boundedText(command.reason, "Firearm correction reason");
  const state = await lockState(tx, context, command.characterId, command.itemInstanceId);
  const [open] = await tx.select({ id: campaignCharacterFirearmPreparation.id })
    .from(campaignCharacterFirearmPreparation)
    .where(and(
      eq(campaignCharacterFirearmPreparation.itemInstanceId, state.itemInstanceId),
      inArray(campaignCharacterFirearmPreparation.status, ["pending", "interrupted", "requires-god-ruling"]),
    )).limit(1);
  if (open) throw new Error("Resolve or cancel the open firearm preparation before correcting state.");
  const capacityRounds = command.capacityRounds === undefined ? state.capacityRounds : command.capacityRounds;
  if (capacityRounds !== null && (!Number.isSafeInteger(capacityRounds) || capacityRounds <= 0)) {
    throw new Error("Corrected capacity must be a positive whole number or explicitly unresolved.");
  }
  if (capacityRounds !== null && state.loadedRounds > capacityRounds) throw new Error("Corrected capacity cannot be less than currently loaded rounds.");
  const readinessMode = command.readinessMode === undefined ? state.readinessMode : command.readinessMode;
  const nextReadied = command.readied ?? state.readied;
  const [owned] = await tx.select({ equipmentState: campaignCharacterItemInstance.equipmentState })
    .from(campaignCharacterItemInstance)
    .where(and(
      eq(campaignCharacterItemInstance.id, state.itemInstanceId),
      eq(campaignCharacterItemInstance.characterId, state.characterId),
      eq(campaignCharacterItemInstance.itemId, state.itemId),
    )).limit(1).for("update");
  if (!owned) throw new Error("The exact firearm instance is no longer owned by this Character.");
  if (nextReadied && owned.equipmentState !== "wielded") throw new Error("A stowed firearm cannot be corrected directly to readied state.");
  if (nextReadied && readinessMode === null) throw new Error("Readied state requires an authoritative readiness relationship.");
  const before = stateSnapshot(state);
  const [after] = await tx.update(campaignCharacterFirearmState).set({
    capacityRounds,
    capacitySource: command.capacityRounds === undefined
      ? state.capacitySource
      : capacityRounds === null ? null : "god-ruling",
    readinessMode,
    readinessModeSource: command.readinessMode === undefined
      ? state.readinessModeSource
      : readinessMode === null ? null : "god-ruling",
    readied: nextReadied,
    requiresCycling: command.requiresCycling ?? state.requiresCycling,
    requiresRecoilRecovery: command.requiresRecoilRecovery ?? state.requiresRecoilRecovery,
    version: state.version + 1,
    updatedByUserId: actorUserId,
    updatedAt: new Date(),
  }).where(and(
    eq(campaignCharacterFirearmState.itemInstanceId, state.itemInstanceId),
    eq(campaignCharacterFirearmState.version, state.version),
  )).returning();
  if (!after) throw new Error("Firearm state changed before the correction could be applied.");
  await recordFirearmEvent(tx, after, {
    eventKind: "state-corrected-by-god",
    reason,
    before,
    after: stateSnapshot(after),
    actorUserId,
  });
  return after.version;
}

export async function recordFirearmManualHandlingInTransaction(
  tx: FirearmReadinessTransaction,
  context: OwnedEncounterRuntimeContext,
  actorUserId: string,
  command: { characterId: number; itemInstanceId: number; reason: string },
): Promise<void> {
  await assertPersistentParticipant(tx, context, command.characterId);
  const reason = boundedText(command.reason, "Manual-handling reason");
  const state = await lockState(tx, context, command.characterId, command.itemInstanceId);
  await recordFirearmEvent(tx, state, {
    eventKind: "manual-handling-required",
    reason,
    before: stateSnapshot(state),
    after: stateSnapshot(state),
    metadata: { encounterId: context.encounterId },
    actorUserId,
  });
}

export async function reconcileFirearmInitiativeTransitionsInTransaction(
  tx: FirearmReadinessTransaction,
  before: InitiativeEngineState,
  after: InitiativeEngineState,
  actorUserId: string,
): Promise<void> {
  const beforeById = new Map(before.pendingActions.map((action) => [action.id, action]));
  for (const action of after.pendingActions) {
    const prior = beforeById.get(action.id);
    if (!prior || prior.status === action.status) continue;
    const [preparation] = await tx.select().from(campaignCharacterFirearmPreparation)
      .where(eq(campaignCharacterFirearmPreparation.pendingActionId, action.id)).limit(1).for("update");
    if (!preparation) continue;
    if (action.status === "completed") {
      await completeFirearmPreparationById(tx, preparation.id, actorUserId);
      continue;
    }
    const nextStatus = action.status === "interrupted"
      ? "interrupted"
      : action.status === "active" && preparation.status === "interrupted"
        ? "pending"
        : action.status === "abandoned" || action.status === "ended"
          ? "cancelled"
          : null;
    if (!nextStatus) continue;
    const terminal = nextStatus === "cancelled";
    await tx.update(campaignCharacterFirearmPreparation).set({
      status: nextStatus,
      resolvedByUserId: terminal ? actorUserId : null,
      resolvedAt: terminal ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(campaignCharacterFirearmPreparation.id, preparation.id));
    const state = await lockState(tx, {
      campaignId: preparation.campaignId,
      sessionId: preparation.sessionId,
      sceneId: preparation.sceneId,
      encounterId: preparation.encounterId,
      ownerUserId: actorUserId,
      encounterStatus: "active",
      sceneStatus: "active",
      sessionStatus: "active",
    }, preparation.characterId, preparation.itemInstanceId);
    await recordFirearmEvent(tx, state, {
      preparationId: preparation.id,
      eventKind: nextStatus === "pending" ? "preparation-resumed" : `preparation-${nextStatus}`,
      before: stateSnapshot(state),
      after: stateSnapshot(state),
      actorUserId,
    });
  }
}

export async function reconcileFirearmPreparationAfterResponderInTransaction(
  tx: FirearmReadinessTransaction,
  declarationId: number,
  actorUserId: string,
): Promise<void> {
  const [preparation] = await tx.select({ id: campaignCharacterFirearmPreparation.id })
    .from(campaignCharacterFirearmPreparation)
    .where(and(
      eq(campaignCharacterFirearmPreparation.actionDeclarationId, declarationId),
      eq(campaignCharacterFirearmPreparation.status, "pending"),
    )).limit(1);
  if (preparation) await completeFirearmPreparationById(tx, preparation.id, actorUserId);
}

export async function readFirearmWorkspaceInTransaction(
  tx: FirearmReadinessTransaction,
  context: OwnedEncounterRuntimeContext,
  selectedCharacterIdInput: number | null,
  selectedItemInstanceIdInput: number | null,
): Promise<FirearmWorkspaceView> {
  const characters = await tx.select({
    id: campaignSessionEncounterParticipant.characterId,
    name: sql<string>`case when ${campaignSessionEncounterParticipant.participantKind} = 'creature' then ${campaignSessionEncounterParticipant.displayLabel} else ${campaignCharacter.name} end`,
    isNpc: sql<boolean>`case when ${campaignSessionEncounterParticipant.participantKind} = 'creature' then true else coalesce(${campaignCharacter.isNpc}, false) end`,
    npcKind: campaignCharacter.npcKind,
    participantKind: campaignSessionEncounterParticipant.participantKind,
  }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, and(
      eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId),
      eq(campaignCharacter.campaignId, campaignSessionEncounterParticipant.campaignId),
    ))
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, context.encounterId),
      eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
    )).orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id));
  const selectedCharacterId = characters.some(({ id }) => id === selectedCharacterIdInput)
    ? selectedCharacterIdInput
    : characters[0]?.id ?? null;
  if (selectedCharacterId === null) return {
    context: { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId },
    characters,
    selectedCharacterId: null,
    selectedItemInstanceId: null,
    legacyStacks: [],
    firearms: [],
  };
  if (selectedCharacterId < 0) return {
    context: { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId },
    characters,
    selectedCharacterId,
    selectedItemInstanceId: null,
    legacyStacks: [],
    firearms: [],
  };

  const instanceRows = await tx.select({
    itemInstanceId: campaignCharacterItemInstance.id,
    itemId: item.id,
    itemName: item.name,
    canonicalId: item.canonicalId,
    equipmentState: campaignCharacterItemInstance.equipmentState,
    weaponProfileId: weaponProfile.id,
    ammunitionItemId: weaponProfile.ammunitionItemId,
    capacityRounds: weaponProfile.capacityRounds,
    capacity: weaponProfile.capacity,
    readinessMode: weaponProfile.readinessMode,
    drawInitiativeCost: weaponProfile.drawInitiativeCost,
    readyInitiativeCost: weaponProfile.readyInitiativeCost,
    reloadInitiativeCost: weaponProfile.reloadInitiativeCost,
    unloadInitiativeCost: weaponProfile.unloadInitiativeCost,
    firingModeChangeInitiativeCost: weaponProfile.firingModeChangeInitiativeCost,
  }).from(campaignCharacterItemInstance)
    .innerJoin(item, eq(item.id, campaignCharacterItemInstance.itemId))
    .innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
    .where(and(
      eq(campaignCharacterItemInstance.characterId, selectedCharacterId),
      sql`lower(trim(${weaponProfile.profileRecordType})) <> 'ammunition'`,
      sql`(${weaponProfile.ammunitionItemId} is not null or exists(select 1 from ${weaponFiringMode} firearm_mode where firearm_mode.weapon_profile_id = ${weaponProfile.id}))`,
    ))
    .orderBy(asc(item.name), asc(campaignCharacterItemInstance.id));
  const legacyRows = await tx.select({
    itemId: item.id,
    itemName: item.name,
    canonicalId: item.canonicalId,
    weaponProfileId: weaponProfile.id,
    quantity: campaignCharacterItem.quantity,
  }).from(campaignCharacterItem)
    .innerJoin(item, eq(item.id, campaignCharacterItem.itemId))
    .innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id))
    .where(and(
      eq(campaignCharacterItem.characterId, selectedCharacterId),
      sql`lower(trim(${weaponProfile.profileRecordType})) <> 'ammunition'`,
      sql`(${weaponProfile.ammunitionItemId} is not null or exists(select 1 from ${weaponFiringMode} firearm_mode where firearm_mode.weapon_profile_id = ${weaponProfile.id}))`,
    ))
    .orderBy(asc(item.name), asc(item.id));
  const profileIds = [...new Set([...instanceRows, ...legacyRows].map(({ weaponProfileId }) => weaponProfileId))];
  const modeRows = profileIds.length ? await tx.select().from(weaponFiringMode)
    .where(inArray(weaponFiringMode.weaponProfileId, profileIds))
    .orderBy(asc(weaponFiringMode.weaponProfileId), asc(weaponFiringMode.sortOrder), asc(weaponFiringMode.id)) : [];
  const modesByProfile = new Map<number, typeof modeRows>();
  for (const mode of modeRows) modesByProfile.set(mode.weaponProfileId, [...(modesByProfile.get(mode.weaponProfileId) ?? []), mode]);
  const stateRows = instanceRows.length ? await tx.select().from(campaignCharacterFirearmState)
    .where(inArray(campaignCharacterFirearmState.itemInstanceId, instanceRows.map(({ itemInstanceId }) => itemInstanceId))) : [];
  const states = new Map(stateRows.map((state) => [state.itemInstanceId, state]));
  const preparationRows = instanceRows.length ? await tx.select({
    id: campaignCharacterFirearmPreparation.id,
    itemInstanceId: campaignCharacterFirearmPreparation.itemInstanceId,
    operation: campaignCharacterFirearmPreparation.operation,
    status: campaignCharacterFirearmPreparation.status,
    initiativeCost: campaignCharacterFirearmPreparation.initiativeCost,
    timingSource: campaignCharacterFirearmPreparation.timingSource,
    pendingActionId: campaignCharacterFirearmPreparation.pendingActionId,
    actionDeclarationId: campaignCharacterFirearmPreparation.actionDeclarationId,
    reason: campaignCharacterFirearmPreparation.reason,
    createdAt: campaignCharacterFirearmPreparation.createdAt,
    expectedCompletionInitiative: campaignSessionEncounterPendingAction.expectedCompletionInitiative,
    remainingInitiativeCost: campaignSessionEncounterPendingAction.remainingInitiativeCost,
  }).from(campaignCharacterFirearmPreparation)
    .leftJoin(campaignSessionEncounterPendingAction, eq(campaignSessionEncounterPendingAction.id, campaignCharacterFirearmPreparation.pendingActionId))
    .where(and(
      inArray(campaignCharacterFirearmPreparation.itemInstanceId, instanceRows.map(({ itemInstanceId }) => itemInstanceId)),
      inArray(campaignCharacterFirearmPreparation.status, ["pending", "interrupted", "requires-god-ruling"]),
    )).orderBy(desc(campaignCharacterFirearmPreparation.createdAt), desc(campaignCharacterFirearmPreparation.id)) : [];
  const preparations = new Map(preparationRows.map((preparation) => [preparation.itemInstanceId, preparation]));
  const historyRows = instanceRows.length ? await tx.select({
    id: campaignCharacterFirearmEvent.id,
    itemInstanceId: campaignCharacterFirearmEvent.itemInstanceId,
    eventKind: campaignCharacterFirearmEvent.eventKind,
    reason: campaignCharacterFirearmEvent.reason,
    actorUserId: campaignCharacterFirearmEvent.actorUserId,
    createdAt: campaignCharacterFirearmEvent.createdAt,
  }).from(campaignCharacterFirearmEvent)
    .where(inArray(campaignCharacterFirearmEvent.itemInstanceId, instanceRows.map(({ itemInstanceId }) => itemInstanceId)))
    .orderBy(desc(campaignCharacterFirearmEvent.createdAt), desc(campaignCharacterFirearmEvent.id)) : [];
  const historyByInstance = new Map<number, typeof historyRows>();
  for (const history of historyRows) {
    const current = historyByInstance.get(history.itemInstanceId) ?? [];
    if (current.length < 20) historyByInstance.set(history.itemInstanceId, [...current, history]);
  }
  const ammoIds = [...new Set(instanceRows.flatMap(({ ammunitionItemId }) => ammunitionItemId === null ? [] : [ammunitionItemId]))];
  const ammoRows = ammoIds.length ? await tx.select({
    itemId: item.id,
    itemName: item.name,
    profileId: weaponProfile.id,
    cyclingModifier: weaponProfile.ammunitionCyclingInitiativeModifier,
    recoilModifier: weaponProfile.ammunitionRecoilResetInitiativeModifier,
  }).from(item).innerJoin(weaponProfile, eq(weaponProfile.itemId, item.id)).where(and(
    inArray(item.id, ammoIds),
    sql`lower(trim(${weaponProfile.profileRecordType})) = 'ammunition'`,
  )) : [];
  const ammoById = new Map(ammoRows.map((row) => [row.itemId, row]));
  const inventoryRows = ammoIds.length ? await tx.select({ itemId: campaignCharacterItem.itemId, quantity: campaignCharacterItem.quantity })
    .from(campaignCharacterItem).where(and(
      eq(campaignCharacterItem.characterId, selectedCharacterId),
      inArray(campaignCharacterItem.itemId, ammoIds),
    )) : [];
  const inventoryById = new Map(inventoryRows.map((row) => [row.itemId, row.quantity]));

  const firearms = instanceRows.map((row): FirearmInstanceView => {
    const state = states.get(row.itemInstanceId) ?? null;
    const ammunition = row.ammunitionItemId === null ? null : ammoById.get(row.ammunitionItemId) ?? null;
    const modes = (modesByProfile.get(row.weaponProfileId) ?? []).map((mode) => resolveFirearmMode({
      mode: { ...mode, deliveryCadence: mode.deliveryCadence as Parameters<typeof resolveFirearmMode>[0]["mode"]["deliveryCadence"] },
      ammunitionCyclingModifier: ammunition?.cyclingModifier ?? 0,
      ammunitionRecoilModifier: ammunition?.recoilModifier ?? 0,
    }));
    const selectedMode = state ? modes.find(({ id }) => id === state.selectedFiringModeId) ?? null : null;
    const preparation = preparations.get(row.itemInstanceId) ?? null;
    const nextCostKnown = !state
      ? true
      : row.equipmentState !== "wielded"
        ? row.drawInitiativeCost !== null
        : !state.readied && state.readinessMode === "separate-ready-action"
          ? row.readyInitiativeCost !== null
          : state.loadedRounds === 0 && row.ammunitionItemId !== null
            ? row.reloadInitiativeCost !== null
            : state.requiresCycling
              ? selectedMode?.timing?.effectiveCyclingInitiativeCost !== undefined && selectedMode?.timing?.effectiveCyclingInitiativeCost !== null
              : state.requiresRecoilRecovery
                ? selectedMode?.timing?.effectiveRecoilResetInitiativeCost !== undefined && selectedMode?.timing?.effectiveRecoilResetInitiativeCost !== null
                : true;
    const readiness = evaluateFirearmReadiness({
      initialized: state !== null,
      exactOwnerValid: true,
      itemInstancePresent: true,
      weaponProfilePresent: true,
      firingModeValid: state === null || selectedMode !== null,
      firingModeMechanicsResolved: state === null || Boolean(selectedMode?.timing && selectedMode.deliveryCadence && selectedMode.roundsPerCadence),
      drawn: row.equipmentState === "wielded",
      readied: state?.readied ?? false,
      loadedRounds: state?.loadedRounds ?? 0,
      capacityRounds: state?.capacityRounds ?? null,
      readinessRelationshipResolved: state?.readinessMode === "draw-is-ready" || state?.readinessMode === "separate-ready-action",
      ammunitionRelationshipResolved: row.ammunitionItemId !== null && ammunition !== null,
      ammunitionRequired: row.ammunitionItemId !== null,
      ammunitionCompatible: state?.loadedRounds
        ? state.loadedAmmunitionItemId === row.ammunitionItemId && state.loadedAmmunitionProfileId === ammunition?.profileId
        : true,
      roundsRequiredForSelectedDelivery: selectedMode?.roundsPerCadence ?? null,
      requiresCycling: state?.requiresCycling ?? false,
      requiresRecoilRecovery: state?.requiresRecoilRecovery ?? false,
      pendingPreparation: preparation ? {
        operation: preparation.operation as FirearmPreparationOperation,
        status: preparation.status as "pending" | "interrupted" | "requires-god-ruling",
      } : null,
      requiredPreparationInitiativeCostKnown: nextCostKnown,
      staleCanonicalRuntimeDivergence: Boolean(state && (
        state.weaponProfileId !== row.weaponProfileId
        || (state.capacitySource === "canonical" && state.capacityRounds !== row.capacityRounds)
        || (state.readinessModeSource === "canonical" && state.readinessMode !== row.readinessMode)
      )),
      directCreatureManufacturedFirearm: false,
    });
    const loadedAmmunitionName = state?.loadedAmmunitionItemId === null || state?.loadedAmmunitionItemId === undefined
      ? null
      : ammoById.get(state.loadedAmmunitionItemId)?.itemName ?? null;
    return {
      itemInstanceId: row.itemInstanceId,
      itemId: row.itemId,
      itemName: row.itemName,
      canonicalId: row.canonicalId,
      weaponProfileId: row.weaponProfileId,
      equipmentState: row.equipmentState,
      canonical: {
        ammunitionItemId: row.ammunitionItemId,
        ammunitionName: ammunition?.itemName ?? null,
        capacityRounds: row.capacityRounds,
        legacyCapacityText: row.capacity,
        readinessMode: row.readinessMode,
        drawInitiativeCost: row.drawInitiativeCost,
        readyInitiativeCost: row.readyInitiativeCost,
        reloadInitiativeCost: row.reloadInitiativeCost,
        unloadInitiativeCost: row.unloadInitiativeCost,
        firingModeChangeInitiativeCost: row.firingModeChangeInitiativeCost,
      },
      modes,
      inventoryAmmunitionQuantity: row.ammunitionItemId === null ? 0 : inventoryById.get(row.ammunitionItemId) ?? 0,
      state: state ? {
        selectedFiringModeId: state.selectedFiringModeId,
        loadedAmmunitionItemId: state.loadedAmmunitionItemId,
        loadedAmmunitionName,
        loadedRounds: state.loadedRounds,
        capacityRounds: state.capacityRounds,
        capacitySource: state.capacitySource,
        readinessMode: state.readinessMode,
        readinessModeSource: state.readinessModeSource,
        readied: state.readied,
        requiresCycling: state.requiresCycling,
        requiresRecoilRecovery: state.requiresRecoilRecovery,
        version: state.version,
        updatedAt: state.updatedAt.toISOString(),
      } : null,
      readiness,
      preparation: preparation ? {
        ...preparation,
        createdAt: preparation.createdAt.toISOString(),
      } : null,
      history: (historyByInstance.get(row.itemInstanceId) ?? []).map((history) => ({
        id: history.id,
        eventKind: history.eventKind,
        reason: history.reason,
        actorUserId: history.actorUserId,
        createdAt: history.createdAt.toISOString(),
      })),
    };
  });
  const selectedItemInstanceId = firearms.some(({ itemInstanceId }) => itemInstanceId === selectedItemInstanceIdInput)
    ? selectedItemInstanceIdInput
    : firearms[0]?.itemInstanceId ?? null;
  return {
    context: { campaignId: context.campaignId, sessionId: context.sessionId, sceneId: context.sceneId, encounterId: context.encounterId },
    characters,
    selectedCharacterId,
    selectedItemInstanceId,
    legacyStacks: legacyRows.map((row) => ({
      ...row,
      firingModes: (modesByProfile.get(row.weaponProfileId) ?? []).map(({ id, name, mechanicsReviewRequired }) => ({ id, name, mechanicsReviewRequired })),
    })),
    firearms,
  };
}

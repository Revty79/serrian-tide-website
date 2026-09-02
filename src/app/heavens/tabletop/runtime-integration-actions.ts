"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import type { CharacterMagicSystem } from "@/features/characters/character-rules";
import type { SpellCastRequest } from "@/features/characters/character-spell-runtime";
import type { CreatureAbilityUseRequest } from "@/features/creatures/creature-ability-runtime";
import type { EquipmentState } from "@/features/items/equipment-state";
import type { ItemUseRequest } from "@/features/items/item-use";
import type { RuntimeDuration, TemporaryModifierChannel } from "@/features/mechanical-effects";
import {
  listCreatureCatalogInTransaction,
  spawnEncounterCreaturesInTransaction,
  type CreatureCatalogEntry,
  type SpawnEncounterCreaturesInput,
  type SpawnEncounterCreaturesResult,
} from "@/features/tabletop-operations/creature-spawn-service";
import {
  addEncounterConditionInTransaction,
  addEncounterInjuryInTransaction,
  addEncounterModifierInTransaction,
  applyEncounterDamageInTransaction,
  declareEncounterReactionInTransaction,
  endEncounterModifierInTransaction,
  executeImmediateEncounterCreatureAbilityInTransaction,
  executeImmediateEncounterItemInTransaction,
  executeImmediateEncounterSpellInTransaction,
  healEncounterParticipantInTransaction,
  lockOwnedEncounterRuntimeInTransaction,
  mutateEncounterManaInTransaction,
  prepareEncounterCreatureAbilityActionInTransaction,
  prepareEncounterItemActionInTransaction,
  prepareEncounterSpellActionInTransaction,
  resolveAuthoredActionInTransaction,
  resolveEncounterConditionInTransaction,
  resolveEncounterInjuryInTransaction,
  resolveEncounterReactionInTransaction,
  ruleOnInterruptedReactionInTransaction,
  setEncounterEquipmentStateInTransaction,
  startCreatureAbilityActionInTransaction,
  startCreatureAttackInTransaction,
  startItemActionInTransaction,
  startSpellActionInTransaction,
  startWeaponActionInTransaction,
  type ResolveAuthoredActionInput,
} from "@/features/tabletop-operations/runtime-integration-service";
import {
  publishTabletopInvalidationInTransaction,
  type TabletopInvalidationCategory,
} from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

function refreshRuntime(characterIds: readonly number[] = []): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
  for (const characterId of new Set(characterIds)) {
    revalidatePath(`/realms/characters/${characterId}`);
    revalidatePath(`/heavens/characters/${characterId}`);
    revalidatePath(`/heavens/npcs/${characterId}`);
  }
}

async function mutateEncounter<T>(
  encounterId: number,
  operation: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    context: Awaited<ReturnType<typeof lockOwnedEncounterRuntimeInTransaction>>,
    actingUserId: string,
  ) => Promise<T>,
  category: TabletopInvalidationCategory | null = "character-state",
): Promise<T> {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    const result = await operation(tx, context, access.user.id);
    if (category) {
      await publishTabletopInvalidationInTransaction(tx, {
        campaignId: context.campaignId,
        sessionId: context.sessionId,
        sceneId: context.sceneId,
        encounterId: context.encounterId,
        characterIds: [],
        category,
      });
    }
    return result;
  });
}

export async function getEncounterCreatureCatalog(encounterId: number): Promise<CreatureCatalogEntry[]> {
  return mutateEncounter(encounterId, (tx) => listCreatureCatalogInTransaction(tx), null);
}

export async function spawnEncounterCreatures(
  encounterId: number,
  input: SpawnEncounterCreaturesInput,
): Promise<SpawnEncounterCreaturesResult> {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => (
    spawnEncounterCreaturesInTransaction(tx, context, actingUserId, input)
  ));
  refreshRuntime(result.created.map(({ characterId }) => characterId));
  return result;
}

export async function applyEncounterDamage(
  encounterId: number,
  input: {
    targetCharacterId: number;
    amount: number;
    hitLocationNumber?: number | null;
    poolKey?: string | null;
    injuryName?: string;
    injuryNotes?: string;
  },
) {
  const result = await mutateEncounter(encounterId, (tx, context) => applyEncounterDamageInTransaction(tx, context, input));
  refreshRuntime([input.targetCharacterId]);
  return result;
}

export async function healEncounterParticipant(
  encounterId: number,
  input: { targetCharacterId: number; amount: number; scope: "whole-body" | "area"; poolKey?: string | null },
) {
  const result = await mutateEncounter(encounterId, (tx, context) => healEncounterParticipantInTransaction(tx, context, input));
  refreshRuntime([input.targetCharacterId]);
  return result;
}

export async function addEncounterInjury(
  encounterId: number,
  input: {
    targetCharacterId: number;
    hitLocationNumber?: number | null;
    poolKey?: string | null;
    name: string;
    notes?: string;
    damageAmount?: number | null;
  },
) {
  const result = await mutateEncounter(encounterId, (tx, context) => addEncounterInjuryInTransaction(tx, context, input));
  refreshRuntime([input.targetCharacterId]);
  return result;
}

export async function resolveEncounterInjury(
  encounterId: number,
  targetCharacterId: number,
  injuryId: number,
) {
  const result = await mutateEncounter(encounterId, (tx, context) => resolveEncounterInjuryInTransaction(
    tx,
    context,
    targetCharacterId,
    injuryId,
  ));
  refreshRuntime([targetCharacterId]);
  return result;
}

export async function mutateEncounterMana(
  encounterId: number,
  input: {
    targetCharacterId: number;
    system: CharacterMagicSystem;
    operation: "spend" | "restore" | "restore-pool";
    amount?: number;
  },
) {
  const result = await mutateEncounter(encounterId, (tx, context) => mutateEncounterManaInTransaction(tx, context, input));
  refreshRuntime([input.targetCharacterId]);
  return result;
}

export async function addEncounterCondition(
  encounterId: number,
  input: { targetCharacterId: number; name: string; description: string; duration: RuntimeDuration },
) {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => addEncounterConditionInTransaction(
    tx,
    context,
    actingUserId,
    input,
  ));
  refreshRuntime([input.targetCharacterId]);
  return result;
}

export async function resolveEncounterCondition(
  encounterId: number,
  targetCharacterId: number,
  conditionId: number,
  note = "",
) {
  const result = await mutateEncounter(encounterId, (tx, context) => resolveEncounterConditionInTransaction(
    tx,
    context,
    targetCharacterId,
    conditionId,
    note,
  ));
  refreshRuntime([targetCharacterId]);
  return result;
}

export async function addEncounterModifier(
  encounterId: number,
  input: {
    targetCharacterId: number;
    label: string;
    channel: TemporaryModifierChannel;
    targetKey: string;
    amount: number;
    duration: RuntimeDuration;
  },
) {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => addEncounterModifierInTransaction(
    tx,
    context,
    actingUserId,
    input,
  ));
  refreshRuntime([input.targetCharacterId]);
  return result;
}

export async function endEncounterModifier(
  encounterId: number,
  targetCharacterId: number,
  modifierId: number,
  note = "",
) {
  const result = await mutateEncounter(encounterId, (tx, context) => endEncounterModifierInTransaction(
    tx,
    context,
    targetCharacterId,
    modifierId,
    note,
  ));
  refreshRuntime([targetCharacterId]);
  return result;
}

export async function setEncounterEquipmentState(
  encounterId: number,
  input:
    | { kind: "stack"; targetCharacterId: number; itemId: number; state: EquipmentState; quantity: number }
    | { kind: "instance"; targetCharacterId: number; instanceId: number; state: EquipmentState },
) {
  const result = await mutateEncounter(encounterId, (tx, context) => setEncounterEquipmentStateInTransaction(tx, context, input));
  refreshRuntime([input.targetCharacterId]);
  return result;
}

export async function startEncounterWeaponAction(
  encounterId: number,
  input: Parameters<typeof startWeaponActionInTransaction>[2],
) {
  const result = await mutateEncounter(encounterId, (tx, context) => startWeaponActionInTransaction(tx, context, input));
  refreshRuntime([input.sourceCharacterId, input.targetCharacterId]);
  return result;
}

export async function prepareEncounterSpellAction(encounterId: number, request: SpellCastRequest) {
  return mutateEncounter(encounterId, (tx, context, actingUserId) => prepareEncounterSpellActionInTransaction(
    tx,
    context,
    request,
    actingUserId,
  ), null);
}

export async function prepareEncounterItemAction(encounterId: number, request: ItemUseRequest) {
  return mutateEncounter(encounterId, (tx, context, actingUserId) => prepareEncounterItemActionInTransaction(
    tx,
    context,
    request,
    actingUserId,
  ), null);
}

export async function prepareEncounterCreatureAbilityAction(encounterId: number, request: CreatureAbilityUseRequest) {
  return mutateEncounter(encounterId, (tx, context, actingUserId) => prepareEncounterCreatureAbilityActionInTransaction(
    tx,
    context,
    request,
    actingUserId,
  ), null);
}

export async function startEncounterCreatureAttack(
  encounterId: number,
  input: Parameters<typeof startCreatureAttackInTransaction>[2],
) {
  const result = await mutateEncounter(encounterId, (tx, context) => startCreatureAttackInTransaction(tx, context, input));
  refreshRuntime([input.sourceCharacterId, input.targetCharacterId]);
  return result;
}

export async function startEncounterSpellAction(
  encounterId: number,
  request: SpellCastRequest,
  heldIntervention = false,
) {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => startSpellActionInTransaction(
    tx,
    context,
    request,
    actingUserId,
    heldIntervention,
  ));
  refreshRuntime([request.casterCharacterId, ...Object.values(request.selections.targetGroups).flat()]);
  return result;
}

export async function startEncounterItemAction(
  encounterId: number,
  request: ItemUseRequest,
  initiativeCost: number,
  heldIntervention = false,
) {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => startItemActionInTransaction(
    tx,
    context,
    request,
    initiativeCost,
    actingUserId,
    heldIntervention,
  ));
  refreshRuntime([request.sourceCharacterId, request.targetCharacterId ?? request.sourceCharacterId]);
  return result;
}

export async function startEncounterCreatureAbilityAction(
  encounterId: number,
  request: CreatureAbilityUseRequest,
  initiativeCost: number,
  heldIntervention = false,
) {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => startCreatureAbilityActionInTransaction(
    tx,
    context,
    request,
    initiativeCost,
    actingUserId,
    heldIntervention,
  ));
  refreshRuntime([request.sourceCharacterId, ...request.targetCharacterIds]);
  return result;
}

export async function resolveEncounterAuthoredAction(
  encounterId: number,
  bindingId: number,
  input: ResolveAuthoredActionInput,
) {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => resolveAuthoredActionInTransaction(
    tx,
    context,
    bindingId,
    actingUserId,
    input,
  ));
  refreshRuntime([result.sourceCharacterId, ...result.targetCharacterIds]);
  return result;
}

export async function declareEncounterReaction(
  encounterId: number,
  input: Parameters<typeof declareEncounterReactionInTransaction>[2],
) {
  const result = await mutateEncounter(encounterId, (tx, context) => declareEncounterReactionInTransaction(tx, context, input));
  refreshRuntime([input.reactorCharacterId]);
  return result;
}

export async function resolveEncounterReaction(
  encounterId: number,
  reactionId: number,
  succeeded: boolean,
) {
  const result = await mutateEncounter(encounterId, (tx, context) => resolveEncounterReactionInTransaction(
    tx,
    context,
    reactionId,
    succeeded,
  ));
  refreshRuntime();
  return result;
}

export async function ruleOnInterruptedEncounterReaction(
  encounterId: number,
  reactionId: number,
  ruling: "keep" | "refund",
): Promise<void> {
  await mutateEncounter(encounterId, (tx, context) => ruleOnInterruptedReactionInTransaction(
    tx,
    context,
    reactionId,
    ruling,
  ));
  refreshRuntime();
}

export async function executeImmediateEncounterSpell(encounterId: number, request: SpellCastRequest) {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => executeImmediateEncounterSpellInTransaction(
    tx,
    context,
    actingUserId,
    request,
  ));
  refreshRuntime([request.casterCharacterId, ...Object.values(request.selections.targetGroups).flat()]);
  return result;
}

export async function executeImmediateEncounterItem(encounterId: number, request: ItemUseRequest) {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => executeImmediateEncounterItemInTransaction(
    tx,
    context,
    actingUserId,
    request,
  ));
  refreshRuntime([request.sourceCharacterId, request.targetCharacterId ?? request.sourceCharacterId]);
  return result;
}

export async function executeImmediateEncounterCreatureAbility(encounterId: number, request: CreatureAbilityUseRequest) {
  const result = await mutateEncounter(encounterId, (tx, context, actingUserId) => executeImmediateEncounterCreatureAbilityInTransaction(
    tx,
    context,
    actingUserId,
    request,
  ));
  refreshRuntime([request.sourceCharacterId, ...request.targetCharacterIds]);
  return result;
}

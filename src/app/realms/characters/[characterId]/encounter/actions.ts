"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import type { SpellCastRequest } from "@/features/characters/character-spell-runtime";
import {
  readPlayerEncounterInTransaction,
  resolveActivePlayerEncounterInTransaction,
} from "@/features/tabletop-operations/player-encounter-service";
import {
  assertPlayerEncounterCapability,
  authorizePlayerEncounterActor,
  type PlayerEncounterCapability,
} from "@/features/tabletop-operations/player-encounter-policy";
import type { RollMethod, RollPurpose } from "@/features/tabletop-operations/roll-runtime";
import { recordRollInTransaction } from "@/features/tabletop-operations/roll-runtime-service";
import {
  declareEncounterReactionInTransaction,
  holdParticipantInitiativeInTransaction,
  passParticipantInitiativeInTransaction,
  prepareEncounterSpellActionInTransaction,
  startSpellActionInTransaction,
  startWeaponActionInTransaction,
} from "@/features/tabletop-operations/runtime-integration-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requirePlayer } from "@/lib/server-access";

function refreshPlayerEncounter(characterId: number): void {
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/realms/characters/${characterId}/encounter`);
}

export async function getPlayerEncounter(characterId: number) {
  const access = await requirePlayer();
  return db.transaction((tx) => readPlayerEncounterInTransaction(tx, characterId, access.user.id));
}

async function mutatePlayerEncounter<T>(
  characterId: number,
  capability: PlayerEncounterCapability,
  category: "initiative" | "action" | "reaction" | "roll",
  mutate: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    context: NonNullable<Awaited<ReturnType<typeof resolveActivePlayerEncounterInTransaction>>>,
    playerUserId: string,
  ) => Promise<T>,
): Promise<T> {
  const access = await requirePlayer();
  const result = await db.transaction(async (tx) => {
    const context = await resolveActivePlayerEncounterInTransaction(tx, characterId, access.user.id, true);
    if (!context) throw new Error("This Character is not a Participant in an active Encounter.");
    const actor = authorizePlayerEncounterActor({
      playerUserId: access.user.id,
      campaignId: context.campaignId,
      characterId,
      ownedCharacterId: context.characterId,
    });
    assertPlayerEncounterCapability(actor, capability);
    const changed = await mutate(tx, context, access.user.id);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
      characterIds: [],
      category,
    });
    return changed;
  });
  refreshPlayerEncounter(characterId);
  return result;
}

export async function holdPlayerInitiative(characterId: number): Promise<void> {
  await mutatePlayerEncounter(characterId, "initiative.hold", "initiative", (tx, context) => (
    holdParticipantInitiativeInTransaction(tx, context, characterId)
  ));
}

export async function passPlayerInitiative(characterId: number): Promise<void> {
  await mutatePlayerEncounter(characterId, "initiative.pass", "initiative", (tx, context) => (
    passParticipantInitiativeInTransaction(tx, context, characterId)
  ));
}

export async function startPlayerWeaponAction(
  characterId: number,
  input: { targetCharacterId: number; itemId: number; instanceId: number | null; heldIntervention?: boolean },
): Promise<void> {
  await mutatePlayerEncounter(characterId, "action.weapon", "action", async (tx, context) => {
    await startWeaponActionInTransaction(tx, context, {
      sourceCharacterId: characterId,
      targetCharacterId: input.targetCharacterId,
      itemId: input.itemId,
      instanceId: input.instanceId,
      heldIntervention: input.heldIntervention,
    });
  });
}

export async function startPlayerSpellAction(
  characterId: number,
  request: SpellCastRequest,
  heldIntervention = false,
): Promise<void> {
  if (request.casterCharacterId !== characterId) throw new Error("A Player may cast only as their own Character.");
  await mutatePlayerEncounter(characterId, "action.spell", "action", async (tx, context, playerUserId) => {
    await startSpellActionInTransaction(tx, context, request, playerUserId, heldIntervention);
  });
}

export async function preparePlayerSpellAction(characterId: number, request: SpellCastRequest) {
  if (request.casterCharacterId !== characterId) throw new Error("A Player may cast only as their own Character.");
  const access = await requirePlayer();
  return db.transaction(async (tx) => {
    const context = await resolveActivePlayerEncounterInTransaction(tx, characterId, access.user.id);
    if (!context) throw new Error("This Character is not a Participant in an active Encounter.");
    return prepareEncounterSpellActionInTransaction(tx, context, request, access.user.id);
  });
}

export async function declarePlayerReaction(
  characterId: number,
  input: {
    pendingActionId: number;
    reactionType: "dodge" | "block" | "parry";
    defendingItemId?: number | null;
    defendingInstanceId?: number | null;
  },
): Promise<void> {
  await mutatePlayerEncounter(characterId, "reaction.declare", "reaction", async (tx, context) => {
    await declareEncounterReactionInTransaction(tx, context, {
      ...input,
      reactorCharacterId: characterId,
    });
  });
}

export async function recordPlayerEncounterRoll(
  characterId: number,
  input: {
    method: RollMethod;
    purposeKind: RollPurpose;
    enteredTotal?: number | null;
    targetCharacterId?: number | null;
    pendingActionId?: number | null;
    reactionId?: number | null;
    label?: string;
    targetNumber?: number | null;
    notes?: string;
  },
) {
  return mutatePlayerEncounter(characterId, "roll.record", "roll", (tx, context, playerUserId) => recordRollInTransaction(
    tx,
    {
      userId: playerUserId,
      campaignId: context.campaignId,
      readAs: "player",
      canRecordGodOnly: false,
      characterId,
    },
    {
      method: input.method,
      purposeKind: input.purposeKind,
      enteredTotal: input.enteredTotal,
      targetCharacterId: input.targetCharacterId,
      pendingActionId: input.pendingActionId,
      reactionId: input.reactionId,
      label: input.label,
      targetNumber: input.targetNumber,
      notes: input.notes,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
      rollerCharacterId: characterId,
      visibility: "table",
    },
  ));
}

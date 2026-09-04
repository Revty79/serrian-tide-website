"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  correctFirearmStateInTransaction,
  initializeFirearmStateInTransaction,
  readFirearmWorkspaceInTransaction,
  recordFirearmManualHandlingInTransaction,
  startFirearmPreparationInTransaction,
  type FirearmStateCorrectionCommand,
  type FirearmWorkspaceView,
  type InitializeFirearmStateCommand,
  type StartFirearmPreparationCommand,
} from "@/features/tabletop-operations/firearm-readiness-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function refresh(characterIds: readonly number[] = []): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
  for (const characterId of characterIds) {
    revalidatePath(`/heavens/characters/${characterId}`);
    revalidatePath(`/realms/characters/${characterId}`);
  }
}

async function mutate<T>(
  encounterIdInput: number,
  characterIds: readonly number[],
  operation: (
    tx: Transaction,
    context: Awaited<ReturnType<typeof lockOwnedEncounterRuntimeInTransaction>>,
    actorUserId: string,
  ) => Promise<T>,
): Promise<T> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    const changed = await operation(tx, context, access.user.id);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
      characterIds: [...characterIds],
      category: "action",
    });
    return changed;
  });
  refresh(characterIds);
  return result;
}

export async function getFirearmReadinessWorkspace(
  encounterIdInput: number,
  selectedCharacterId: number | null,
  selectedItemInstanceId: number | null,
): Promise<FirearmWorkspaceView> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    return readFirearmWorkspaceInTransaction(tx, context, selectedCharacterId, selectedItemInstanceId);
  });
}

export async function initializeFirearmState(
  encounterId: number,
  command: InitializeFirearmStateCommand,
): Promise<{ itemInstanceId: number; stateVersion: number; reused: boolean }> {
  return mutate(encounterId, [command.characterId], (tx, context, actorUserId) => (
    initializeFirearmStateInTransaction(tx, context, actorUserId, command)
  ));
}

export async function startFirearmPreparation(
  encounterId: number,
  command: StartFirearmPreparationCommand,
): Promise<{ preparationId: number; status: string; pendingActionId: number | null; reused: boolean }> {
  return mutate(encounterId, [command.characterId], (tx, context, actorUserId) => (
    startFirearmPreparationInTransaction(tx, context, actorUserId, command)
  ));
}

export async function correctFirearmState(
  encounterId: number,
  command: FirearmStateCorrectionCommand,
): Promise<number> {
  return mutate(encounterId, [command.characterId], (tx, context, actorUserId) => (
    correctFirearmStateInTransaction(tx, context, actorUserId, command)
  ));
}

export async function recordFirearmManualHandling(
  encounterId: number,
  command: { characterId: number; itemInstanceId: number; reason: string },
): Promise<void> {
  return mutate(encounterId, [command.characterId], (tx, context, actorUserId) => (
    recordFirearmManualHandlingInTransaction(tx, context, actorUserId, command)
  ));
}

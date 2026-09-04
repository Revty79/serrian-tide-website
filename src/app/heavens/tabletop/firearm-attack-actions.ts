"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  cancelFirearmAttackInTransaction,
  commitFirearmAttackTriggerInTransaction,
  declareFirearmAttackInTransaction,
  finalizeFirearmAttackConsequencesInTransaction,
  fireFirearmAttackInTransaction,
  previewFirearmAttackInTransaction,
  readFirearmAttackWorkspaceInTransaction,
  type DeclareFirearmAttackCommand,
  type FirearmAttackCommand,
  type FirearmAttackFireResult,
  type FirearmAttackPreview,
  type FirearmAttackRollCommand,
  type FirearmAttackWorkspaceView,
} from "@/features/tabletop-operations/firearm-attack-service";
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
  for (const characterId of characterIds.filter((id) => id > 0)) {
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
      characterIds: characterIds.filter((id) => id > 0),
      category: "action",
    });
    return changed;
  });
  refresh(characterIds);
  return result;
}

export async function getFirearmAttackWorkspace(encounterIdInput: number): Promise<FirearmAttackWorkspaceView> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    return readFirearmAttackWorkspaceInTransaction(tx, context, access.user.id);
  });
}

export async function previewFirearmAttack(
  encounterId: number,
  command: FirearmAttackCommand,
): Promise<FirearmAttackPreview> {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, positiveId(encounterId, "Encounter"), access.user.id);
    return previewFirearmAttackInTransaction(tx, context, access.user.id, command);
  });
}

export async function declareFirearmAttack(
  encounterId: number,
  command: DeclareFirearmAttackCommand,
): Promise<{ attackId: number; status: string; reused: boolean }> {
  return mutate(encounterId, [command.actorParticipantId, command.targetParticipantId], (tx, context, actorUserId) => (
    declareFirearmAttackInTransaction(tx, context, actorUserId, command)
  ));
}

export async function commitFirearmAttackTrigger(
  encounterId: number,
  attackId: number,
  actorParticipantId: number,
): Promise<number> {
  return mutate(encounterId, [actorParticipantId], (tx, context, actorUserId) => (
    commitFirearmAttackTriggerInTransaction(tx, context, actorUserId, positiveId(attackId, "Firearm Attack"))
  ));
}

export async function fireFirearmAttack(
  encounterId: number,
  attackId: number,
  characterIds: readonly number[],
  command: FirearmAttackRollCommand,
): Promise<FirearmAttackFireResult> {
  return mutate(encounterId, characterIds, (tx, context, actorUserId) => (
    fireFirearmAttackInTransaction(tx, context, actorUserId, positiveId(attackId, "Firearm Attack"), command)
  ));
}

export async function finalizeFirearmAttackConsequences(
  encounterId: number,
  attackId: number,
  characterIds: readonly number[],
): Promise<number> {
  return mutate(encounterId, characterIds, (tx, context, actorUserId) => (
    finalizeFirearmAttackConsequencesInTransaction(tx, context, actorUserId, positiveId(attackId, "Firearm Attack"))
  ));
}

export async function cancelFirearmAttack(
  encounterId: number,
  attackId: number,
  actorParticipantId: number,
  reason: string,
): Promise<void> {
  await mutate(encounterId, [actorParticipantId], (tx, context, actorUserId) => (
    cancelFirearmAttackInTransaction(tx, context, actorUserId, positiveId(attackId, "Firearm Attack"), reason)
  ));
}

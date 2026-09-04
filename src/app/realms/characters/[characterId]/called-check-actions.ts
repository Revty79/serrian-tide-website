"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  answerCalledCheckInTransaction,
  answerHighLowInTransaction,
  callHighLowInTransaction,
  readPlayerCalledCheckWorkspaceInTransaction,
} from "@/features/tabletop-operations/called-check-service";
import type { HighLowSide } from "@/features/tabletop-operations/called-check";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requirePlayer } from "@/lib/server-access";

function refreshCharacter(characterId: number): void {
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/realms/characters/${characterId}/encounter`);
}

async function mutatePlayerCalledCheck<T>(
  characterId: number,
  work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string) => Promise<T>,
): Promise<T> {
  const access = await requirePlayer();
  const result = await db.transaction(async (tx) => {
    const changed = await work(tx, access.user.id);
    const view = await readPlayerCalledCheckWorkspaceInTransaction(tx, characterId, access.user.id);
    if (view) await publishTabletopInvalidationInTransaction(tx, {
      campaignId: view.session.campaignId,
      sessionId: view.session.id,
      sceneId: null,
      encounterId: null,
      characterIds: [characterId],
      category: "called-check",
    });
    return changed;
  });
  refreshCharacter(characterId);
  return result;
}

export async function getPlayerCalledCheckWorkspace(characterId: number) {
  const access = await requirePlayer();
  return db.transaction((tx) => readPlayerCalledCheckWorkspaceInTransaction(tx, characterId, access.user.id));
}

export async function answerPlayerCalledCheck(characterId: number, input: { requestId: number; enteredTotal?: number | null; idempotencyKey: string }): Promise<number> {
  return mutatePlayerCalledCheck(characterId, (tx, userId) => answerCalledCheckInTransaction(
    tx,
    { kind: "player", userId, characterId },
    input,
  ));
}

export async function lockPlayerHighLowCall(characterId: number, input: { requestId: number; side: HighLowSide; idempotencyKey: string }): Promise<void> {
  await mutatePlayerCalledCheck(characterId, (tx, userId) => callHighLowInTransaction(tx, userId, characterId, input));
}

export async function answerPlayerHighLow(characterId: number, input: { requestId: number; enteredTotal?: number | null; idempotencyKey: string }): Promise<number> {
  return mutatePlayerCalledCheck(characterId, (tx, userId) => answerHighLowInTransaction(
    tx,
    { kind: "player", userId, characterId },
    input,
  ));
}

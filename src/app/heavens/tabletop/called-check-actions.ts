"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import type { CalledCheckIssueInput, HighLowIssueInput } from "@/features/tabletop-operations/called-check-service";
import {
  answerCalledCheckInTransaction,
  answerHighLowInTransaction,
  cancelCalledCheckInTransaction,
  cancelHighLowInTransaction,
  issueCalledCheckInTransaction,
  issueHighLowInTransaction,
  readGodCalledCheckWorkspaceInTransaction,
  rerollCalledCheckInTransaction,
  rerollHighLowInTransaction,
  revealCalledCheckInTransaction,
  ruleCalledCheckInTransaction,
  ruleHighLowInTransaction,
} from "@/features/tabletop-operations/called-check-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

function refreshWorkspace(): void {
  revalidatePath("/heavens/tabletop");
}

async function mutateSession<T>(sessionId: number, work: (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
) => Promise<T>, audience: (view: Awaited<ReturnType<typeof readGodCalledCheckWorkspaceInTransaction>>, changed: T) => number[], belongsToSession?: (view: Awaited<ReturnType<typeof readGodCalledCheckWorkspaceInTransaction>>) => boolean): Promise<T> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    if (belongsToSession) {
      const current = await readGodCalledCheckWorkspaceInTransaction(tx, sessionId, access.user.id);
      if (!belongsToSession(current)) throw new Error("That table request does not belong to the selected Session.");
    }
    const changed = await work(tx, access.user.id);
    const view = await readGodCalledCheckWorkspaceInTransaction(tx, sessionId, access.user.id);
    const characterIds = audience(view, changed);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: view.session.campaignId,
      sessionId: view.session.id,
      sceneId: null,
      encounterId: null,
      characterIds: [...new Set(characterIds)],
      category: "called-check",
      audience: characterIds.length ? "all" : "god-only",
    });
    return changed;
  });
  refreshWorkspace();
  return result;
}

function calledAudience(view: Awaited<ReturnType<typeof readGodCalledCheckWorkspaceInTransaction>>, requestId: number): number[] {
  const tablePlayerIds = view.recipients.filter(({ kind }) => kind === "pc").map(({ characterId }) => characterId);
  for (const batch of view.batches) {
    const request = batch.requests.find(({ id }) => id === requestId);
    if (!request) continue;
    const visibility = request.revealedVisibility ?? batch.visibility;
    if (visibility === "table") return tablePlayerIds;
    if (visibility === "private" && request.recipientKind === "pc") return [request.recipientCharacterId];
  }
  return [];
}

function batchAudience(view: Awaited<ReturnType<typeof readGodCalledCheckWorkspaceInTransaction>>, batchId: number): number[] {
  const batch = view.batches.find(({ id }) => id === batchId);
  if (!batch || batch.visibility === "god-only") return [];
  if (batch.visibility === "table") return view.recipients.filter(({ kind }) => kind === "pc").map(({ characterId }) => characterId);
  return batch.requests.filter(({ recipientKind }) => recipientKind === "pc").map(({ recipientCharacterId }) => recipientCharacterId);
}

function highLowAudience(view: Awaited<ReturnType<typeof readGodCalledCheckWorkspaceInTransaction>>, requestId: number): number[] {
  const request = view.highLow.find(({ id }) => id === requestId);
  if (!request || request.visibility === "god-only") return [];
  if (request.visibility === "table") return view.recipients.filter(({ kind }) => kind === "pc").map(({ characterId }) => characterId);
  return request.participantCharacterId === null ? [] : [request.participantCharacterId];
}

export async function getGodCalledCheckWorkspace(sessionId: number) {
  const access = await requireGod();
  return db.transaction((tx) => readGodCalledCheckWorkspaceInTransaction(tx, sessionId, access.user.id));
}

export async function issueCalledCheck(input: CalledCheckIssueInput): Promise<number> {
  return mutateSession(input.sessionId, (tx, userId) => issueCalledCheckInTransaction(tx, userId, input), batchAudience);
}

export async function answerGodCalledCheck(sessionId: number, input: { requestId: number; enteredTotal?: number | null; idempotencyKey: string }): Promise<number> {
  return mutateSession(sessionId, (tx, userId) => answerCalledCheckInTransaction(tx, { kind: "god", userId }, input), (view) => calledAudience(view, input.requestId), (view) => view.batches.some(({ requests }) => requests.some(({ id }) => id === input.requestId)));
}

export async function cancelCalledCheck(sessionId: number, requestId: number, reason: string): Promise<void> {
  await mutateSession(sessionId, (tx, userId) => cancelCalledCheckInTransaction(tx, userId, requestId, reason), (view) => calledAudience(view, requestId), (view) => view.batches.some(({ requests }) => requests.some(({ id }) => id === requestId)));
}

export async function rerollCalledCheck(sessionId: number, requestId: number, reason: string): Promise<number> {
  return mutateSession(sessionId, (tx, userId) => rerollCalledCheckInTransaction(tx, userId, requestId, reason), (view, changed) => calledAudience(view, changed), (view) => view.batches.some(({ requests }) => requests.some(({ id }) => id === requestId)));
}

export async function ruleCalledCheck(sessionId: number, requestId: number, ruling: string): Promise<void> {
  await mutateSession(sessionId, (tx, userId) => ruleCalledCheckInTransaction(tx, userId, requestId, ruling), (view) => calledAudience(view, requestId), (view) => view.batches.some(({ requests }) => requests.some(({ id }) => id === requestId)));
}

export async function revealCalledCheck(sessionId: number, requestId: number, visibility: "table" | "private"): Promise<void> {
  await mutateSession(sessionId, (tx, userId) => revealCalledCheckInTransaction(tx, userId, requestId, visibility), (view) => calledAudience(view, requestId), (view) => view.batches.some(({ requests }) => requests.some(({ id }) => id === requestId)));
}

export async function issueHighLow(input: HighLowIssueInput): Promise<number> {
  return mutateSession(input.sessionId, (tx, userId) => issueHighLowInTransaction(tx, userId, input), highLowAudience);
}

export async function answerGodHighLow(sessionId: number, input: { requestId: number; enteredTotal?: number | null; idempotencyKey: string }): Promise<number> {
  return mutateSession(sessionId, (tx, userId) => answerHighLowInTransaction(tx, { kind: "god", userId }, input), (view) => highLowAudience(view, input.requestId), (view) => view.highLow.some(({ id }) => id === input.requestId));
}

export async function cancelHighLow(sessionId: number, requestId: number, reason: string): Promise<void> {
  await mutateSession(sessionId, (tx, userId) => cancelHighLowInTransaction(tx, userId, requestId, reason), (view) => highLowAudience(view, requestId), (view) => view.highLow.some(({ id }) => id === requestId));
}

export async function rerollHighLow(sessionId: number, requestId: number, reason: string): Promise<number> {
  return mutateSession(sessionId, (tx, userId) => rerollHighLowInTransaction(tx, userId, requestId, reason), (view, changed) => highLowAudience(view, changed), (view) => view.highLow.some(({ id }) => id === requestId));
}

export async function ruleHighLow(sessionId: number, requestId: number, ruling: string): Promise<void> {
  await mutateSession(sessionId, (tx, userId) => ruleHighLowInTransaction(tx, userId, requestId, ruling), (view) => highLowAudience(view, requestId), (view) => view.highLow.some(({ id }) => id === requestId));
}

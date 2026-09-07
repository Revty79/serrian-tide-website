"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaignSessionEncounterActionDeclaration } from "@/db/tabletop-operations-schema";
import {
  abandonActionDeclarationInTransaction,
  addExceptionalResponderOpportunityInTransaction,
  cancelActionDeclarationInTransaction,
  commitActionDeclarationInTransaction,
  completeActionDeclarationTimingInTransaction,
  continueActionDeclarationAfterRulingInTransaction,
  correctActionDeclarationRemainingCostInTransaction,
  createActionDeclarationDraftInTransaction,
  editActionDeclarationDraftInTransaction,
  interruptActionDeclarationInTransaction,
  lockActionDeclarationInTransaction,
  markActionDeclarationAwaitingRulingInTransaction,
  readActionDeclarationWorkspaceInTransaction,
  reconcileResponderOpportunityInTransaction,
  resolveActionDeclarationInTransaction,
  restartInterruptedActionDeclarationInTransaction,
  resumeInterruptedActionDeclarationInTransaction,
  reviseLockedActionDeclarationInTransaction,
  type ActionDeclarationWorkspaceView,
} from "@/features/tabletop-operations/action-declaration-service";
import {
  parseActionDeclarationDraft,
  type ActionDeclarationDraft,
} from "@/features/tabletop-operations/action-declaration";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function participantKey(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error(`${label} is invalid.`);
  return value;
}

function submissionKey(value: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9]{32}$/.test(normalized)) throw new Error("The action submission identity is invalid.");
  return normalized;
}

function refreshDeclarations(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
}

async function mutateDeclaration<T>(
  encounterIdInput: number,
  mutation: (
    tx: Transaction,
    context: Awaited<ReturnType<typeof lockOwnedEncounterRuntimeInTransaction>>,
    actor: { authority: "god-owner"; userId: string },
  ) => Promise<T>,
): Promise<T> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    const actor = { authority: "god-owner" as const, userId: access.user.id };
    const changed = await mutation(tx, context, actor);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: context.campaignId,
      sessionId: context.sessionId,
      sceneId: context.sceneId,
      encounterId: context.encounterId,
      characterIds: [],
      category: "action",
    });
    return changed;
  });
  refreshDeclarations();
  return result;
}

export async function getActionDeclarationWorkspace(encounterIdInput: number): Promise<ActionDeclarationWorkspaceView | null> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    try {
      return await readActionDeclarationWorkspaceInTransaction(tx, context, {
        authority: "god-owner",
        userId: access.user.id,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "This Encounter has no active Initiative runtime.") return null;
      throw error;
    }
  });
}

export async function createActionDeclarationDraft(encounterId: number, draft: ActionDeclarationDraft): Promise<number> {
  return mutateDeclaration(encounterId, (tx, context, actor) => (
    createActionDeclarationDraftInTransaction(tx, context, actor, draft)
  ));
}

export async function declareGodAction(
  encounterId: number,
  draft: ActionDeclarationDraft,
  idempotencyKey: string,
): Promise<number> {
  return mutateDeclaration(encounterId, async (tx, context, actor) => {
    const submissionId = submissionKey(idempotencyKey);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`serrian-tide:god-action:${context.campaignId}:${actor.userId}:${submissionId}`}))`);
    const submitted = parseActionDeclarationDraft({
      ...draft,
      sourcePayload: { ...draft.sourcePayload, submissionId },
    });
    const existing = await tx.select({
      id: campaignSessionEncounterActionDeclaration.id,
      draft: campaignSessionEncounterActionDeclaration.draftJson,
    }).from(campaignSessionEncounterActionDeclaration).where(and(
      eq(campaignSessionEncounterActionDeclaration.encounterId, context.encounterId),
      eq(campaignSessionEncounterActionDeclaration.actorCharacterId, submitted.actorCharacterId),
      eq(campaignSessionEncounterActionDeclaration.createdByUserId, actor.userId),
    ));
    const reused = existing.find(({ draft: stored }) => parseActionDeclarationDraft(stored).sourcePayload?.submissionId === submissionId);
    if (reused) {
      if (JSON.stringify(parseActionDeclarationDraft(reused.draft)) !== JSON.stringify(submitted)) {
        throw new Error("That action submission identity was already used for a different exact declaration.");
      }
      return reused.id;
    }
    const declarationId = await createActionDeclarationDraftInTransaction(tx, context, actor, submitted);
    await lockActionDeclarationInTransaction(tx, context, actor, declarationId);
    await commitActionDeclarationInTransaction(tx, context, actor, declarationId);
    return declarationId;
  });
}

export async function editActionDeclarationDraft(encounterId: number, declarationId: number, draft: ActionDeclarationDraft): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => (
    editActionDeclarationDraftInTransaction(tx, context, actor, positiveId(declarationId, "Action declaration"), draft)
  ));
}

export async function lockActionDeclaration(encounterId: number, declarationId: number): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => (
    lockActionDeclarationInTransaction(tx, context, actor, positiveId(declarationId, "Action declaration"))
  ));
}

export async function reviseLockedActionDeclaration(encounterId: number, declarationId: number): Promise<number> {
  return mutateDeclaration(encounterId, (tx, context, actor) => (
    reviseLockedActionDeclarationInTransaction(tx, context, actor, positiveId(declarationId, "Action declaration"))
  ));
}

export async function commitActionDeclaration(encounterId: number, declarationId: number): Promise<number> {
  return mutateDeclaration(encounterId, (tx, context, actor) => (
    commitActionDeclarationInTransaction(tx, context, actor, positiveId(declarationId, "Action declaration"))
  ));
}

export async function reconcileResponderOpportunity(
  encounterId: number,
  opportunityId: number,
  input: { decision: "allow" } | { decision: "ineligible"; reason: string },
): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => (
    reconcileResponderOpportunityInTransaction(tx, context, actor, positiveId(opportunityId, "Responder opportunity"), input)
  ));
}

export async function addExceptionalResponder(
  encounterId: number,
  declarationId: number,
  responderCharacterId: number,
  reason: string,
): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => addExceptionalResponderOpportunityInTransaction(
    tx,
    context,
    actor,
    positiveId(declarationId, "Action declaration"),
    participantKey(responderCharacterId, "Responder Participant"),
    reason,
  ));
}

export async function markActionDeclarationAwaitingRuling(encounterId: number, declarationId: number, reason: string, notes = ""): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => markActionDeclarationAwaitingRulingInTransaction(
    tx, context, actor, positiveId(declarationId, "Action declaration"), reason, notes,
  ));
}

export async function continueActionDeclarationAfterRuling(encounterId: number, declarationId: number, reason: string): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => continueActionDeclarationAfterRulingInTransaction(
    tx, context, actor, positiveId(declarationId, "Action declaration"), reason,
  ));
}

export async function interruptActionDeclaration(encounterId: number, declarationId: number, reason: string): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => interruptActionDeclarationInTransaction(
    tx, context, actor, positiveId(declarationId, "Action declaration"), reason,
  ));
}

export async function cancelActionDeclaration(encounterId: number, declarationId: number, reason = ""): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => cancelActionDeclarationInTransaction(
    tx, context, actor, positiveId(declarationId, "Action declaration"), reason,
  ));
}

export async function abandonActionDeclaration(encounterId: number, declarationId: number, reason: string): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => abandonActionDeclarationInTransaction(
    tx, context, actor, positiveId(declarationId, "Action declaration"), reason,
  ));
}

export async function resolveActionDeclaration(encounterId: number, declarationId: number, reason = ""): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => resolveActionDeclarationInTransaction(
    tx, context, actor, positiveId(declarationId, "Action declaration"), reason,
  ));
}

export async function resumeInterruptedActionDeclaration(encounterId: number, declarationId: number, reason: string): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => resumeInterruptedActionDeclarationInTransaction(
    tx, context, actor, positiveId(declarationId, "Action declaration"), reason,
  ));
}

export async function restartInterruptedActionDeclaration(encounterId: number, declarationId: number, reason: string): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => restartInterruptedActionDeclarationInTransaction(
    tx, context, actor, positiveId(declarationId, "Action declaration"), reason,
  ));
}

export async function correctActionDeclarationRemainingCost(
  encounterId: number,
  declarationId: number,
  remainingInitiativeCost: number,
  reason: string,
): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => correctActionDeclarationRemainingCostInTransaction(
    tx,
    context,
    actor,
    positiveId(declarationId, "Action declaration"),
    remainingInitiativeCost,
    reason,
  ));
}

export async function completeActionDeclarationTiming(
  encounterId: number,
  declarationId: number,
  reason: string,
): Promise<void> {
  return mutateDeclaration(encounterId, (tx, context, actor) => completeActionDeclarationTimingInTransaction(
    tx,
    context,
    actor,
    positiveId(declarationId, "Action declaration"),
    reason,
  ));
}

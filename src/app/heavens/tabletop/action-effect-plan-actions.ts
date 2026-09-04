"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  addManualActionEffectInTransaction,
  amendActionEffectAmountInTransaction,
  applyActionEffectPlanInTransaction,
  approveActionEffectPlanInTransaction,
  declineActionEffectInTransaction,
  declineActionEffectPlanInTransaction,
  generateActionEffectPlanInTransaction,
  readActionEffectWorkspaceInTransaction,
  resolveManualActionEffectInTransaction,
  type ActionEffectWorkspaceView,
} from "@/features/tabletop-operations/action-effect-plan-service";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function positiveId(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
  return value;
}

function refresh(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
}

async function mutate<T>(encounterIdInput: number, operation: (
  tx: Transaction,
  context: Awaited<ReturnType<typeof lockOwnedEncounterRuntimeInTransaction>>,
  actor: { authority: "god-owner"; userId: string },
) => Promise<T>): Promise<T> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    const changed = await operation(tx, context, { authority: "god-owner", userId: access.user.id });
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
  refresh();
  return result;
}

export async function getActionEffectWorkspace(encounterIdInput: number): Promise<ActionEffectWorkspaceView | null> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    try {
      return await readActionEffectWorkspaceInTransaction(tx, context);
    } catch (error) {
      if (error instanceof Error && error.message === "This Encounter has no active Initiative runtime.") return null;
      throw error;
    }
  });
}

export async function generateActionEffectPlan(encounterId: number, declarationId: number): Promise<number> {
  return mutate(encounterId, (tx, context, actor) => generateActionEffectPlanInTransaction(
    tx,
    context,
    actor,
    positiveId(declarationId, "Action declaration"),
  ));
}

export async function approveActionEffectPlan(encounterId: number, planId: number, reason = ""): Promise<void> {
  await mutate(encounterId, (tx, context, actor) => approveActionEffectPlanInTransaction(
    tx,
    context,
    actor,
    positiveId(planId, "Action Effect Plan"),
    reason,
  ));
}

export async function amendActionEffectAmount(encounterId: number, planId: number, effectId: number, amount: number, reason: string): Promise<void> {
  await mutate(encounterId, (tx, context, actor) => amendActionEffectAmountInTransaction(
    tx,
    context,
    actor,
    positiveId(planId, "Action Effect Plan"),
    positiveId(effectId, "Action Effect"),
    amount,
    reason,
  ));
}

export async function declineActionEffect(encounterId: number, planId: number, effectId: number, reason: string): Promise<void> {
  await mutate(encounterId, (tx, context, actor) => declineActionEffectInTransaction(
    tx,
    context,
    actor,
    positiveId(planId, "Action Effect Plan"),
    positiveId(effectId, "Action Effect"),
    reason,
  ));
}

export async function addManualActionEffect(encounterId: number, planId: number, targetParticipantId: number, instruction: string, reason: string): Promise<number> {
  return mutate(encounterId, (tx, context, actor) => addManualActionEffectInTransaction(
    tx,
    context,
    actor,
    positiveId(planId, "Action Effect Plan"),
    targetParticipantId,
    instruction,
    reason,
  ));
}

export async function resolveManualActionEffect(encounterId: number, planId: number, effectId: number, outcome: string, reason: string): Promise<void> {
  await mutate(encounterId, (tx, context, actor) => resolveManualActionEffectInTransaction(
    tx,
    context,
    actor,
    positiveId(planId, "Action Effect Plan"),
    positiveId(effectId, "Action Effect"),
    outcome,
    reason,
  ));
}

export async function declineActionEffectPlan(encounterId: number, planId: number, reason: string): Promise<void> {
  await mutate(encounterId, (tx, context, actor) => declineActionEffectPlanInTransaction(
    tx,
    context,
    actor,
    positiveId(planId, "Action Effect Plan"),
    reason,
  ));
}

export async function applyActionEffectPlan(encounterId: number, planId: number): Promise<string> {
  return mutate(encounterId, (tx, context, actor) => applyActionEffectPlanInTransaction(
    tx,
    context,
    actor,
    positiveId(planId, "Action Effect Plan"),
  ));
}

export async function retryActionEffectPlan(encounterId: number, planId: number): Promise<string> {
  return applyActionEffectPlan(encounterId, planId);
}

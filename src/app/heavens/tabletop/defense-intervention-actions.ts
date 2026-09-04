"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import type { OriginalActionDisposition } from "@/features/tabletop-operations/defense-intervention";
import {
  cancelDeclaredResponseInTransaction,
  declareDefenseInterventionInTransaction,
  readDefenseInterventionWorkspaceInTransaction,
  recordDeclaredAttackRollInTransaction,
  recordDeclaredResponseRollInTransaction,
  resolveDeclaredDefensesInTransaction,
  saveDodgeSkillPathMappingInTransaction,
  removeDodgeSkillPathMappingInTransaction,
  ruleOnDefenseInterventionInTransaction,
  type DefenseDeclarationInput,
  type DefenseInterventionWorkspaceView,
} from "@/features/tabletop-operations/defense-intervention-service";
import type { RollMethod } from "@/features/tabletop-operations/roll-runtime";
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

async function mutate<T>(encounterIdInput: number, work: (
  tx: Transaction,
  context: Awaited<ReturnType<typeof lockOwnedEncounterRuntimeInTransaction>>,
  actor: { authority: "god-owner"; userId: string },
) => Promise<T>): Promise<T> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    const actor = { authority: "god-owner" as const, userId: access.user.id };
    const changed = await work(tx, context, actor);
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

export async function getDefenseInterventionWorkspace(encounterIdInput: number): Promise<DefenseInterventionWorkspaceView | null> {
  const encounterId = positiveId(encounterIdInput, "Encounter");
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    try {
      return await readDefenseInterventionWorkspaceInTransaction(tx, context, { authority: "god-owner", userId: access.user.id });
    } catch (error) {
      if (error instanceof Error && error.message === "This Encounter has no active Initiative runtime.") return null;
      throw error;
    }
  });
}

export async function declareDefenseIntervention(encounterId: number, input: DefenseDeclarationInput): Promise<number> {
  return mutate(encounterId, (tx, context, actor) => declareDefenseInterventionInTransaction(tx, context, actor, input));
}

export async function recordDeclaredAttackRoll(encounterId: number, declarationId: number, input: {
  method: RollMethod;
  enteredTotal?: number | null;
  manualTarget?: number | null;
  manualLabel?: string;
}): Promise<number> {
  return mutate(encounterId, async (tx, context, actor) => (
    await recordDeclaredAttackRollInTransaction(tx, context, actor, positiveId(declarationId, "Action declaration"), input)
  ).id);
}

export async function recordDeclaredResponseRoll(encounterId: number, reactionId: number, input: {
  method: RollMethod;
  enteredTotal?: number | null;
}): Promise<number> {
  return mutate(encounterId, async (tx, context, actor) => (
    await recordDeclaredResponseRollInTransaction(tx, context, actor, positiveId(reactionId, "Response declaration"), input)
  ).id);
}

export async function resolveDeclaredDefenses(encounterId: number, declarationId: number): Promise<void> {
  await mutate(encounterId, async (tx, context, actor) => {
    await resolveDeclaredDefensesInTransaction(tx, context, actor, positiveId(declarationId, "Action declaration"));
  });
}

export async function ruleOnDefenseIntervention(encounterId: number, reactionId: number, input: {
  disposition: Exclude<OriginalActionDisposition, "stopped" | "target-removed" | "awaiting-god-ruling">;
  reason: string;
  modifiedOutcome?: string;
  defenseSucceeded?: boolean;
}): Promise<void> {
  await mutate(encounterId, (tx, context, actor) => ruleOnDefenseInterventionInTransaction(
    tx,
    context,
    actor,
    positiveId(reactionId, "Response declaration"),
    input,
  ));
}

export async function cancelDeclaredResponse(encounterId: number, reactionId: number, reason: string, refundByExplicitRuling = false): Promise<void> {
  await mutate(encounterId, (tx, context, actor) => cancelDeclaredResponseInTransaction(
    tx,
    context,
    actor,
    positiveId(reactionId, "Response declaration"),
    reason,
    refundByExplicitRuling,
  ));
}

export async function saveDodgeSkillPathMapping(encounterId: number, input: {
  id?: number | null;
  endpointSkillId: number;
  conditional: boolean;
  circumstanceLabel?: string;
  reviewState: "review-required" | "approved";
  notes?: string;
}): Promise<number> {
  return mutate(encounterId, (tx, context, actor) => saveDodgeSkillPathMappingInTransaction(tx, context, actor, input));
}

export async function removeDodgeSkillPathMapping(encounterId: number, mappingId: number): Promise<void> {
  await mutate(encounterId, (tx, context, actor) => removeDodgeSkillPathMappingInTransaction(
    tx,
    context,
    actor,
    positiveId(mappingId, "Dodge path mapping"),
  ));
}

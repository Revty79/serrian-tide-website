import "server-only";

import { and, eq } from "drizzle-orm";

import type { db } from "@/db";
import {
  campaignSessionEncounterActionDeclaration,
  campaignSessionEncounterEffectPlan,
  campaignSessionEncounterInitiative,
  campaignSessionEncounterPendingAction,
  campaignSessionEncounterReaction,
  campaignSessionEncounterResponderOpportunity,
  campaignSessionRoll,
} from "@/db/tabletop-operations-schema";

import { closeInitiativeRuntime, type InitiativeEngineState } from "./initiative-runtime";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";

export type InitiativeCloseGuardTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type UnfinishedEncounterCombatWork = Readonly<{
  declarationId: number;
  pendingActionId: number;
  actorParticipantId: number;
  label: string;
  declarationStatus: string;
  timingStatus: string;
  remaining: readonly string[];
}>;

const TERMINAL_DECLARATION_STATUSES = new Set(["resolved", "cancelled", "abandoned"]);
const TERMINAL_PLAN_STATUSES = new Set(["applied", "declined", "cancelled", "superseded"]);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function declarationLabel(lockedSnapshot: unknown, draft: unknown, declarationId: number): string {
  const lockedLabel = record(lockedSnapshot)?.label;
  if (typeof lockedLabel === "string" && lockedLabel.trim()) return lockedLabel.trim();
  const draftLabel = record(draft)?.label;
  if (typeof draftLabel === "string" && draftLabel.trim()) return draftLabel.trim();
  return `Action declaration #${declarationId}`;
}

function resolutionMode(lockedSnapshot: unknown): string | null {
  const authoredSource = record(record(lockedSnapshot)?.authoredSource);
  return typeof authoredSource?.resolutionMode === "string" ? authoredSource.resolutionMode : null;
}

export async function readUnfinishedEncounterCombatWorkInTransaction(
  tx: InitiativeCloseGuardTransaction,
  encounterId: number,
): Promise<UnfinishedEncounterCombatWork[]> {
  const declarationRows = await tx.select({
    id: campaignSessionEncounterActionDeclaration.id,
    pendingActionId: campaignSessionEncounterActionDeclaration.pendingActionId,
    actorParticipantId: campaignSessionEncounterActionDeclaration.actorCharacterId,
    status: campaignSessionEncounterActionDeclaration.status,
    draft: campaignSessionEncounterActionDeclaration.draftJson,
    lockedSnapshot: campaignSessionEncounterActionDeclaration.lockedSnapshotJson,
    defenseResolution: campaignSessionEncounterActionDeclaration.defenseResolutionJson,
    committedAt: campaignSessionEncounterActionDeclaration.committedAt,
  }).from(campaignSessionEncounterActionDeclaration)
    .where(eq(campaignSessionEncounterActionDeclaration.encounterId, encounterId))
    .for("update");
  const declarations = declarationRows.filter((row) => (
    row.pendingActionId !== null
    && row.committedAt !== null
    && !TERMINAL_DECLARATION_STATUSES.has(row.status)
  ));
  if (!declarations.length) return [];

  const pendingRows = await tx.select({
      id: campaignSessionEncounterPendingAction.id,
      status: campaignSessionEncounterPendingAction.status,
      remainingInitiativeCost: campaignSessionEncounterPendingAction.remainingInitiativeCost,
    }).from(campaignSessionEncounterPendingAction)
      .where(eq(campaignSessionEncounterPendingAction.encounterId, encounterId))
      .for("update");
  const opportunityRows = await tx.select({
      declarationId: campaignSessionEncounterResponderOpportunity.declarationId,
      reactionId: campaignSessionEncounterResponderOpportunity.reactionId,
      status: campaignSessionEncounterResponderOpportunity.status,
      requiresGodConfirmation: campaignSessionEncounterResponderOpportunity.requiresGodConfirmation,
    }).from(campaignSessionEncounterResponderOpportunity)
      .where(eq(campaignSessionEncounterResponderOpportunity.encounterId, encounterId))
      .for("update");
  const reactionRows = await tx.select({
      id: campaignSessionEncounterReaction.id,
      pendingActionId: campaignSessionEncounterReaction.pendingActionId,
      status: campaignSessionEncounterReaction.status,
      rollRequired: campaignSessionEncounterReaction.rollRequired,
    }).from(campaignSessionEncounterReaction)
      .where(eq(campaignSessionEncounterReaction.encounterId, encounterId))
      .for("update");
  const rollRows = await tx.select({
      pendingActionId: campaignSessionRoll.pendingActionId,
      reactionId: campaignSessionRoll.reactionId,
      status: campaignSessionRoll.status,
    }).from(campaignSessionRoll)
      .where(eq(campaignSessionRoll.encounterId, encounterId))
      .for("update");
  const planRows = await tx.select({
      declarationId: campaignSessionEncounterEffectPlan.declarationId,
      status: campaignSessionEncounterEffectPlan.status,
    }).from(campaignSessionEncounterEffectPlan)
      .where(eq(campaignSessionEncounterEffectPlan.encounterId, encounterId))
      .for("update");
  const pendingById = new Map(pendingRows.map((row) => [row.id, row]));
  const recordedReactionIds = new Set(rollRows.flatMap((row) => (
    row.status === "recorded" && row.reactionId !== null ? [row.reactionId] : []
  )));

  return declarations.map((declaration) => {
    const pendingActionId = declaration.pendingActionId!;
    const pending = pendingById.get(pendingActionId);
    const opportunities = opportunityRows.filter((row) => row.declarationId === declaration.id);
    const reactions = reactionRows.filter((row) => row.pendingActionId === pendingActionId);
    const pendingEligibilityCount = opportunities.filter((row) => row.status === "pending" && row.requiresGodConfirmation).length;
    const pendingResponseCount = opportunities.filter((row) => row.status === "pending" && !row.requiresGodConfirmation).length;
    const reactionRulingCount = reactions.filter((row) => row.status === "needs-ruling").length;
    const missingResponseRollCount = reactions.filter((row) => (
      row.status === "declared" && row.rollRequired === true && !recordedReactionIds.has(row.id)
    )).length;
    const attackRollRecorded = rollRows.some((row) => (
      row.pendingActionId === pendingActionId && row.reactionId === null && row.status === "recorded"
    ));
    const plan = planRows.find((row) => row.declarationId === declaration.id);
    const automaticNoRoll = resolutionMode(declaration.lockedSnapshot) === "automatic-no-roll";
    const remaining: string[] = [];

    if (!pending) remaining.push("the committed Initiative action record is missing and needs a G.O.D. ruling");
    else if (pending.status === "active") remaining.push(`${pending.remainingInitiativeCost} Initiative timing remains`);
    else if (pending.status !== "completed") remaining.push(`Initiative timing is ${pending.status}`);
    if (declaration.status === "interrupted") remaining.push("the interrupted declaration must be resumed or explicitly cancelled");
    if (declaration.status === "awaiting-god-ruling") remaining.push("a G.O.D. ruling is required");
    if (pendingEligibilityCount) remaining.push(`${pendingEligibilityCount} responder eligibility ruling${pendingEligibilityCount === 1 ? "" : "s"}`);
    if (pendingResponseCount) remaining.push(`${pendingResponseCount} responder choice${pendingResponseCount === 1 ? "" : "s"}`);
    if (reactionRulingCount) remaining.push(`${reactionRulingCount} response ruling${reactionRulingCount === 1 ? "" : "s"}`);
    if (missingResponseRollCount) remaining.push(`${missingResponseRollCount} response Roll${missingResponseRollCount === 1 ? "" : "s"}`);
    if (!automaticNoRoll && !attackRollRecorded && (declaration.status === "rolling-ready" || declaration.status === "rolling")) {
      remaining.push("the attack Roll");
    }
    if (
      declaration.defenseResolution === null
      && pendingEligibilityCount === 0
      && pendingResponseCount === 0
      && reactionRulingCount === 0
      && missingResponseRollCount === 0
      && (automaticNoRoll || attackRollRecorded)
    ) {
      remaining.push(automaticNoRoll ? "the explicit no-Roll resolution" : "the attack and response resolution");
    }
    if (declaration.defenseResolution !== null && !plan) remaining.push("consequence-plan generation and review");
    if (plan && !TERMINAL_PLAN_STATUSES.has(plan.status)) remaining.push(`the consequence plan is ${plan.status}`);
    if (!remaining.length) remaining.push(`the declaration remains ${declaration.status} and needs explicit completion or cancellation`);

    return {
      declarationId: declaration.id,
      pendingActionId,
      actorParticipantId: declaration.actorParticipantId,
      label: declarationLabel(declaration.lockedSnapshot, declaration.draft, declaration.id),
      declarationStatus: declaration.status,
      timingStatus: pending?.status ?? "missing",
      remaining,
    };
  });
}

export function formatInitiativeCloseBlocker(work: readonly UnfinishedEncounterCombatWork[]): string {
  const details = work.map((entry) => (
    `Open exchange #${entry.declarationId} (${entry.label}) in Pending exchanges: ${entry.remaining.join("; ")}.`
  )).join(" ");
  return `Initiative cannot close while committed combat work remains. ${details}`;
}

export async function closeGuardedInitiativeRuntimeInTransaction(
  tx: InitiativeCloseGuardTransaction,
  current: InitiativeEngineState,
): Promise<InitiativeEngineState> {
  const unfinished = await readUnfinishedEncounterCombatWorkInTransaction(tx, current.runtime.encounterId);
  if (unfinished.length) throw new Error(formatInitiativeCloseBlocker(unfinished));
  return closeInitiativeRuntime(current);
}

export async function recoverUnfinishedInitiativeRuntimeInTransaction(
  tx: InitiativeCloseGuardTransaction,
  context: OwnedEncounterRuntimeContext,
  current: InitiativeEngineState,
): Promise<InitiativeEngineState> {
  if (current.runtime.status !== "closed") throw new Error("Only a closed Initiative runtime may be recovered.");
  const unfinished = await readUnfinishedEncounterCombatWorkInTransaction(tx, context.encounterId);
  if (!unfinished.length) {
    throw new Error("This closed Initiative runtime has no unfinished committed exchange to recover. Normal closed-runtime restrictions remain in effect.");
  }
  const now = new Date();
  const [recovered] = await tx.update(campaignSessionEncounterInitiative).set({
    status: "active",
    closedAt: null,
    updatedAt: now,
  }).where(and(
    eq(campaignSessionEncounterInitiative.encounterId, context.encounterId),
    eq(campaignSessionEncounterInitiative.sceneId, context.sceneId),
    eq(campaignSessionEncounterInitiative.sessionId, context.sessionId),
    eq(campaignSessionEncounterInitiative.campaignId, context.campaignId),
    eq(campaignSessionEncounterInitiative.status, "closed"),
  )).returning({ encounterId: campaignSessionEncounterInitiative.encounterId });
  if (!recovered) throw new Error("Initiative recovery lost its closed-runtime lock. Refresh before trying again.");
  return {
    runtime: { ...current.runtime, status: "active", closedAt: null },
    participants: current.participants,
    pendingActions: current.pendingActions,
  };
}

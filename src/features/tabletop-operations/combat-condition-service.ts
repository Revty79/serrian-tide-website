import "server-only";
import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { campaignCharacter, campaignCharacterActiveCondition } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as participant, campaignSessionEncounterInitiative as initiative } from "@/db/tabletop-operations-schema";
import { readActiveHealthInTransaction } from "@/features/active-state/active-health-service";
import { combatConditionState, combatConditionMessage, combatBlockers, combatObject as object } from "./combat-condition-state";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { suspendCombatantInTransaction } from "./combat-participation-service";
import { loadInitiativeEngineInTransaction, lockOwnedEncounterRuntimeInTransaction, persistInitiativeEngineInTransaction,
  type OwnedEncounterRuntimeContext, type RuntimeIntegrationTransaction as Tx } from "./runtime-integration-service";
import type { ActionDeclarationActor } from "./action-declaration-service";

export type CombatConditionCommand = {
  participantId: number; status: "dead" | "incapacitated" | "able";
  requestKey: string; expectedRevision: number; reason: string;
  /** Incapacity does not have one universal Initiative treatment. */
  initiativeTreatment?: "preserve" | "zero";
  /** Optional exact existing condition; its duration/resolution stays with its owning service. */
  conditionId?: number;
};

export async function assertCombatantCanChooseInTransaction(tx: Tx, encounterId: number, participantId: number) {
  const [runtime] = await tx.select({ status: initiative.status }).from(initiative).where(eq(initiative.encounterId, encounterId));
  if (runtime?.status !== "active") throw new Error("Combat has ended or has no active Initiative; new choices are closed.");
  const [row] = await tx.select({ local: participant.localStateJson }).from(participant)
    .where(and(eq(participant.encounterId, encounterId), eq(participant.characterId, participantId)));
  if (!row) throw new Error("The combatant is not an exact Encounter member.");
  const message = combatConditionMessage(combatConditionState(row.local));
  if (message) throw new Error(message);
}

async function assertBoundConditionEnded(tx: Tx, participantId: number, local: Record<string, unknown>, conditionId: number) {
  if (participantId > 0) {
    const [condition] = await tx.select().from(campaignCharacterActiveCondition)
      .where(and(eq(campaignCharacterActiveCondition.characterId, participantId), eq(campaignCharacterActiveCondition.id, conditionId)));
    if (!condition || !condition.resolvedAt) throw new Error("Resolve the exact bound condition through its existing lifecycle before restoring combat participation.");
  } else {
    const condition = (Array.isArray(local.conditions) ? local.conditions.map(object) : []).find((entry) => entry.effectPlanEffectId === conditionId);
    if (!condition || !condition.expiredAt && !condition.endedAt) throw new Error("Resolve the exact bound Creature condition through its existing lifecycle before restoring combat participation.");
  }
}

/** Internal effect receipt path, also used by the explicit owner ruling below. */
export async function recordCombatConditionInTransaction(tx: Tx, context: OwnedEncounterRuntimeContext,
  input: { participantId: number; status: "dead" | "incapacitated" | "able"; reason: string; requestKey: string;
    initiativeTreatment?: "preserve" | "zero"; conditionId?: number; evidence?: Record<string, unknown> }) {
  await assertCombatWritableInTransaction(tx, context.encounterId);
  const [member] = await tx.select().from(participant).where(and(eq(participant.encounterId, context.encounterId), eq(participant.characterId, input.participantId))).for("update");
  if (!member) throw new Error("The condition requires an exact Encounter member.");
  const local = object(member.localStateJson), previous = object(local.combatCondition);
  const state = combatConditionState(local);
  const history = Array.isArray(previous.history) ? previous.history.map(object) : [];
  if (history.some((entry) => object(entry.request).requestKey === input.requestKey)) return state;
  if (input.status !== "able") await suspendCombatantInTransaction(tx, context,
    { authority: "god-owner", userId: context.ownerUserId }, input.participantId, input.reason);
  if (input.initiativeTreatment === "zero" && context.encounterStatus === "active") {
    const before = await loadInitiativeEngineInTransaction(tx, context.encounterId, true);
    if (before.runtime.status === "active") await persistInitiativeEngineInTransaction(tx, context, before, { ...before,
      participants: before.participants.map((entry) => entry.characterId === input.participantId
        ? { ...entry, currentInitiative: Math.min(0, entry.currentInitiative) } : entry) }, "correction");
  }
  const [latest] = await tx.select().from(participant).where(eq(participant.participantId, member.participantId));
  const blockers = combatBlockers(local);
  if (input.status === "able") for (const blocker of blockers) { if (!blocker.resolvedAt) { blocker.resolvedAt = new Date().toISOString(); blocker.resolution = input.reason; } }
  else blockers.push({ key: input.requestKey, status: input.status, reason: input.reason, conditionId: input.conditionId, evidence: input.evidence });
  const status = blockers.some((blocker) => !blocker.resolvedAt && blocker.status === "dead") ? "dead" as const : input.status;
  const next = { status, reason: blockers.filter((blocker) => !blocker.resolvedAt).map(({ reason }) => reason).join(" ") || input.reason, revision: state.revision + 1 };
  await tx.update(participant).set({ localStateJson: { ...object(latest.localStateJson), combatCondition: { ...next,
    conditionId: input.status === "able" ? null : input.conditionId ?? null, evidence: input.evidence ?? null, blockers,
    history: [...history, { request: input, actorUserId: context.ownerUserId, recordedAt: new Date().toISOString(), previous: state }] } }, updatedAt: new Date() })
    .where(eq(participant.participantId, member.participantId));
  return next;
}

/** Specific G.O.D. condition/recovery decisions, never a generic return toggle. */
export async function ruleCombatConditionInTransaction(tx: Tx, encounterId: number, actor: ActionDeclarationActor, input: CombatConditionCommand) {
  return tx.transaction(async (changeTx) => {
    if (actor.authority !== "god-owner") throw new Error("Only the Campaign-owning G.O.D. may rule on combat death, incapacity or recovery.");
    const context = await lockOwnedEncounterRuntimeInTransaction(changeTx, encounterId, actor.userId);
    await assertCombatWritableInTransaction(changeTx, encounterId);
    if (!Number.isSafeInteger(input.participantId) || input.participantId === 0 || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      || !["dead", "incapacitated", "able"].includes(input.status) || !input.requestKey?.trim() || input.requestKey.length > 200
      || !input.reason?.trim() || input.reason.length > 1000 || input.initiativeTreatment !== undefined && !["preserve", "zero"].includes(input.initiativeTreatment)
      || input.status === "incapacitated" && input.initiativeTreatment === undefined
      || input.conditionId !== undefined && (!Number.isSafeInteger(input.conditionId) || input.conditionId <= 0)) throw new Error("Record an exact condition, reason, revision and retry identity; incapacity also requires its Initiative treatment.");
    const [member] = await changeTx.select({ local: participant.localStateJson, npcKind: campaignCharacter.npcKind, snapshot: participant.creatureSnapshotJson }).from(participant)
      .leftJoin(campaignCharacter, eq(campaignCharacter.id, participant.characterId))
      .where(and(eq(participant.encounterId, encounterId), eq(participant.characterId, input.participantId))).for("update", { of: participant });
    if (!member) throw new Error("The condition requires an exact Encounter member.");
    const local = object(member.local), previous = object(local.combatCondition), state = combatConditionState(local);
    const request = JSON.parse(JSON.stringify({ ...input, expectedRevision: undefined }));
    const history = Array.isArray(previous.history) ? previous.history.map(object) : [];
    const prior = history.find((entry) => object(entry.request).requestKey === input.requestKey);
    if (prior) {
      if (!isDeepStrictEqual(prior.request, request)) throw new Error("This condition request already records a different immutable decision.");
      return { ...state, reused: true };
    }
    if (state.revision !== input.expectedRevision) throw new Error("The combat condition changed. Refresh before ruling again.");
    if (input.status === "able") {
      if (state.status === "able") throw new Error("This combatant has no unresolved mechanical condition.");
      if (state.status === "dead" || state.status === "defeated") throw new Error("Recorded death requires an explicit source-linked revival effect; a generic condition ruling cannot bypass it.");
      for (const blocker of combatBlockers(local).filter((entry) => !entry.resolvedAt)) {
        if (blocker.conditionId !== undefined) await assertBoundConditionEnded(changeTx, input.participantId, local, blocker.conditionId);
        if (blocker.evidence?.rule === "temporary-revival-expired") throw new Error("Resolve the source-linked stabilization ruling before restoring participation.");
      }
      const health = input.participantId > 0 ? await readActiveHealthInTransaction(changeTx, input.participantId, member.npcKind ?? "race") : null;
      const maximum = health?.anatomy.totalMaximumHp ?? object(object(member.snapshot).core).totalHp;
      const damage = health?.view.totalDamage ?? object(local.health).totalDamage ?? 0;
      if (typeof maximum === "number" && Number(damage) >= maximum) throw new Error("Restore the combatant's Health through the existing Health service before resolving its condition.");
      const evidence = object(previous.evidence);
      if (evidence.rule === "fatal-head") {
        const poolDamage = health?.state.pools.find(({ poolKey }) => poolKey === evidence.poolKey)?.damage ?? object(object(local.health).poolDamage)[String(evidence.poolKey)] ?? 0;
        if (Number(poolDamage) > 2 * Number(evidence.locationMaximumHp)) throw new Error("Resolve the recorded fatal head damage before ruling that the combatant can return.");
      }
    } else if (state.status === "dead" && input.status === "incapacitated") {
      throw new Error("Resolve the recorded death explicitly before applying a nonfatal condition.");
    }
    if (input.conditionId !== undefined) {
      if (input.participantId > 0) {
        const [condition] = await changeTx.select().from(campaignCharacterActiveCondition).where(and(eq(campaignCharacterActiveCondition.characterId, input.participantId), eq(campaignCharacterActiveCondition.id, input.conditionId)));
        if (!condition || condition.resolvedAt) throw new Error("Choose an exact unresolved Character condition.");
      } else if (!(Array.isArray(local.conditions) ? local.conditions.map(object) : []).some((entry) => entry.effectPlanEffectId === input.conditionId && !entry.expiredAt && !entry.endedAt)) throw new Error("Choose an exact active Creature condition.");
    }
    if (input.status === "dead" && !local.defeat) await changeTx.update(participant).set({ localStateJson: { ...local, defeat: {
      reason: input.reason, recordedByUserId: actor.userId, recordedAt: new Date().toISOString(), defeatValueXp: null, credit: null, distribution: null, awards: [] } } })
      .where(and(eq(participant.encounterId, encounterId), eq(participant.characterId, input.participantId)));
    return { ...await recordCombatConditionInTransaction(changeTx, context, request), reused: false };
  });
}

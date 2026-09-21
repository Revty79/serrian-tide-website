import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant as participant, campaignSessionEncounterRewardDecision as decision,
  campaignSessionEncounterEffect as effect, campaignSessionEncounterEffectPlan as plan } from "@/db/tabletop-operations-schema";
import type { RuntimeIntegrationTransaction as Tx } from "./runtime-integration-service";
import { assertCombatWritableInTransaction } from "./combat-freeze-service";
import { combatConditionState, combatObject as object } from "./combat-condition-state";
import { creatureDefeatFameEvidence } from "./combat-xp";

type Context = { encounterId: number; sceneId: number; sessionId: number; campaignId: number; ownerUserId: string };
export type FameAward = { characterId: number; amount: number; before: number; after: number };
export function fameAmount(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error("Fame must be a finite, nonnegative amount within the supported range.");
  return value;
}

/** Called only inside an authorized, encounter-locked reward transaction.
 * The caller stores these before/after receipts in the immutable reward decision. */
export async function applyCombatFameAwardsInTransaction(tx: Tx, context: Context, awards: readonly { characterId: number; amount: number }[]): Promise<FameAward[]> {
  await assertCombatWritableInTransaction(tx, context.encounterId);
  const ids = awards.map(({ characterId }) => characterId);
  if (new Set(ids).size !== ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error("Choose each exact Fame recipient once.");
  awards.forEach(({ amount }) => fameAmount(amount));
  if (!ids.length) return [];
  const rows = await tx.select({ id: campaignCharacterProfile.characterId, fame: campaignCharacterProfile.fame }).from(campaignCharacterProfile)
    .innerJoin(participant, and(eq(participant.characterId, campaignCharacterProfile.characterId), eq(participant.encounterId, context.encounterId), eq(participant.campaignId, context.campaignId)))
    .where(inArray(campaignCharacterProfile.characterId, ids)).orderBy(asc(campaignCharacterProfile.characterId)).for("update", { of: campaignCharacterProfile });
  if (rows.length !== ids.length) throw new Error("Every Fame recipient must be an exact Encounter Character with an authoritative profile.");
  const receipts = rows.map((row) => ({ characterId: row.id, amount: awards.find(({ characterId }) => characterId === row.id)!.amount, before: row.fame,
    after: fameAmount(row.fame + awards.find(({ characterId }) => characterId === row.id)!.amount) }));
  for (const receipt of receipts) if (receipt.amount > 0) await tx.update(campaignCharacterProfile).set({ fame: receipt.after, updatedAt: new Date() })
    .where(eq(campaignCharacterProfile.characterId, receipt.characterId));
  return receipts;
}

/** Automatic defeats use the exact applied effect's actor. A later explicit
 * attribution can complete missing credit; later death never pays twice. */
export async function recordCreatureDefeatFameInTransaction(tx: Tx, context: Context, input: {
  participantId: number; requestKey: string; effectId?: number; killerId?: number; reason: string; automatic?: boolean;
}) {
  await assertCombatWritableInTransaction(tx, context.encounterId);
  const [target] = await tx.select({ local: participant.localStateJson, snapshot: participant.creatureSnapshotJson, kind: participant.participantKind,
    npcKind: campaignCharacter.npcKind, persistent: campaignCreatureNpcProfile.currentSnapshotJson }).from(participant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, participant.characterId))
    .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, participant.characterId))
    .where(and(eq(participant.encounterId, context.encounterId), eq(participant.characterId, input.participantId)))
    .for("update", { of: participant });
  if (!target || target.kind !== "creature" && target.npcKind !== "creature") {
    if (input.automatic) return null;
    throw new Error("Defeat Fame requires the exact Creature occurrence.");
  }
  const local = structuredClone(object(target.local)), previousDefeat = creatureDefeatFameEvidence(local);
  if (!previousDefeat) {
    if (input.automatic) return null;
    throw new Error("Creature Fame requires recorded incapacitation or death. A limb injury or surrender alone does not qualify.");
  }
  // Keep the historical key so old death awards and new incapacity awards
  // share the same immutable once-per-occurrence identity.
  const sourceKey = "creature-kill-fame:" + input.participantId;
  const [existing] = await tx.select().from(decision).where(and(eq(decision.encounterId, context.encounterId), eq(decision.sourceKey, sourceKey)));
  if (existing) {
    const frozen = object(existing.frozenDecisionJson);
    if (input.killerId !== undefined && frozen.killerId !== input.killerId) throw new Error("This Creature already awarded Fame to its credited Character.");
    return { decisionId: existing.id, fameAwards: frozen.fameAwards as FameAward[], reused: true };
  }
  let killerId = input.killerId ?? (typeof previousDefeat.killerId === "number" ? previousDefeat.killerId : undefined);
  if (killerId === undefined && input.effectId !== undefined) {
    const [source] = await tx.select({ actorId: plan.actorParticipantId }).from(effect).innerJoin(plan, eq(plan.id, effect.planId))
      .where(and(eq(effect.id, input.effectId), eq(effect.encounterId, context.encounterId), eq(effect.targetParticipantId, input.participantId)));
    killerId = source?.actorId;
  }
  const credit = object(object(local.defeat).credit);
  killerId ??= typeof credit.characterId === "number" ? credit.characterId : undefined;
  let snapshot: unknown = target.snapshot;
  if (!snapshot && target.persistent) { try { snapshot = JSON.parse(target.persistent); } catch { snapshot = null; } }
  const authoredCr = object(object(snapshot).core).challengeRating;
  const challengeRating = typeof previousDefeat.challengeRating === "number" ? previousDefeat.challengeRating : authoredCr;
  local.defeatFame = { ...previousDefeat, condition: previousDefeat.condition ?? combatConditionState(local).status,
    effectId: previousDefeat.effectId ?? input.effectId ?? null, killerId: killerId ?? null, challengeRating: challengeRating ?? null,
    reason: input.reason, recordedAt: previousDefeat.recordedAt ?? new Date().toISOString(), recordedByUserId: context.ownerUserId };
  if (killerId !== undefined) local.defeat = { ...object(local.defeat), credit: { characterId: killerId, reason: input.reason, effectId: input.effectId ?? null,
    ruledByUserId: input.automatic ? null : context.ownerUserId } };
  await tx.update(participant).set({ localStateJson: local, updatedAt: new Date() })
    .where(and(eq(participant.encounterId, context.encounterId), eq(participant.characterId, input.participantId)));
  const [killer] = killerId !== undefined && killerId > 0 ? await tx.select({ id: campaignCharacter.id, isNpc: campaignCharacter.isNpc }).from(campaignCharacter)
    .innerJoin(participant, and(eq(participant.characterId, campaignCharacter.id), eq(participant.encounterId, context.encounterId)))
    .where(and(eq(campaignCharacter.id, killerId), eq(campaignCharacter.campaignId, context.campaignId))) : [];
  if (!killer || killer.isNpc) {
    if (input.automatic) return { pending: true, reason: "No Player Character is credited for this Creature's defeat." };
    throw new Error("Credit an exact Player Character for Creature defeat Fame.");
  }
  if (typeof challengeRating !== "number" || !Number.isFinite(challengeRating) || challengeRating < 0) {
    if (input.automatic) return { pending: true, reason: "The defeated Creature has no authored numeric CR; review its source before awarding Fame." };
    throw new Error("The defeated Creature has no authored numeric CR; review its source before awarding Fame.");
  }
  const fameAwards = await applyCombatFameAwardsInTransaction(tx, context, [{ characterId: killer.id, amount: challengeRating }]);
  const [saved] = await tx.insert(decision).values({ encounterId: context.encounterId, sceneId: context.sceneId, sessionId: context.sessionId, campaignId: context.campaignId,
    sourceKey, requestKey: input.requestKey, defeatedParticipantId: input.participantId, awardedByUserId: context.ownerUserId,
    frozenDecisionJson: { kind: "creature-kill-fame", killerId: killer.id, challengeRating, awards: [], fameAwards, sourceSnapshot: snapshot,
      defeatEvidence: local.defeatFame, automatic: input.automatic === true, reason: input.reason } }).returning({ id: decision.id });
  return { decisionId: saved.id, fameAwards, reused: false };
}

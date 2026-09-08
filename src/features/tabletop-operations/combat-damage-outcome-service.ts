import "server-only";
import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { campaignCharacter } from "@/db/realm-schema";
import { campaignSessionEncounterActionDeclaration, campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { readActiveHealthInTransaction, addInjuryInTransaction } from "@/features/active-state/active-health-service";
import { loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction, type OwnedEncounterRuntimeContext } from "./runtime-integration-service";
import { setInitiativeParticipationStatus } from "./initiative-runtime";
import { interruptActionDeclarationInTransaction } from "./action-declaration-service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function recordCombatDamageOutcomeInTransaction(tx: Transaction, context: OwnedEncounterRuntimeContext,
  effect: { id: number; targetParticipantId: number; finalValueJson: unknown }, result: Record<string, unknown>) {
  const final = object(effect.finalValueJson);
  if (object(final.effect).kind !== "health.damage") return result;
  const application = object(final.application);
  const ordinary = object(application.ordinaryAttack);
  const ruling = object(ordinary.ruling);
  const [participant] = await tx.select({ local: campaignSessionEncounterParticipant.localStateJson, snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson,
    npcKind: campaignCharacter.npcKind }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .where(and(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId), eq(campaignSessionEncounterParticipant.characterId, effect.targetParticipantId)))
    .limit(1).for("update", { of: campaignSessionEncounterParticipant });
  if (!participant) throw new Error("Damage outcome requires the exact Encounter participant.");
  const local = structuredClone(object(participant.local));
  let totalDamage: number;
  let totalMaximumHp: number | null;
  if (effect.targetParticipantId < 0) {
    totalDamage = Number(object(local.health).totalDamage ?? 0);
    const maximum = object(object(participant.snapshot).core).totalHp;
    totalMaximumHp = typeof maximum === "number" ? maximum : null;
  } else {
    const health = await readActiveHealthInTransaction(tx, effect.targetParticipantId, participant.npcKind ?? "race");
    totalDamage = health.view.totalDamage;
    totalMaximumHp = health.anatomy.totalMaximumHp;
  }
  const injuries = Array.isArray(local.injuries) ? [...local.injuries] : [];
  if (typeof ruling.injuryName === "string" && ruling.injuryName.trim()) {
    if (effect.targetParticipantId > 0) await addInjuryInTransaction(tx, { characterId: effect.targetParticipantId,
      name: ruling.injuryName, notes: String(ruling.reason), poolKey: String(application.poolKey),
      hitLocationNumber: Number(application.hitLocationNumber), damageAmount: Number(object(final.effect).amount) }, participant.npcKind ?? "race");
    injuries.push({ effectId: effect.id, name: ruling.injuryName, reason: ruling.reason, damageAmount: object(final.effect).amount,
      hitLocationNumber: application.hitLocationNumber, poolKey: application.poolKey, recordedByUserId: context.ownerUserId });
    local.injuries = injuries;
  }
  const defeated = ruling.defeated === true || totalMaximumHp !== null && totalDamage >= totalMaximumHp;
  const evidence = { effectId: effect.id, damageAmount: object(final.effect).amount, totalDamage, totalMaximumHp,
    location: application.hitLocationNumber, poolKey: application.poolKey, locationMaximumHp: ordinary.poolMaximumHp ?? null,
    ruling: Object.keys(ruling).length ? ruling : null, defeated };
  const outcomes = Array.isArray(local.damageOutcomes) ? [...local.damageOutcomes] : [];
  outcomes.push(evidence);
  local.damageOutcomes = outcomes;
  if (defeated && !local.defeat) local.defeat = { effectId: effect.id, recordedByUserId: context.ownerUserId,
    reason: ruling.reason ?? "Total accumulated damage reached the authored HP maximum.",
    defeatValueXp: typeof ruling.defeatValueXp === "number" ? ruling.defeatValueXp : null,
    credit: null, distribution: null, awards: [], recordedAt: new Date().toISOString() };
  await tx.update(campaignSessionEncounterParticipant).set({ localStateJson: local, updatedAt: new Date() })
    .where(and(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId), eq(campaignSessionEncounterParticipant.characterId, effect.targetParticipantId)));
  if (defeated && context.encounterStatus === "active") {
    const before = await loadInitiativeEngineInTransaction(tx, context.encounterId);
    const actor = before.participants.find(({ characterId }) => characterId === effect.targetParticipantId);
    if (actor && actor.participationStatus !== "suspended") await persistInitiativeEngineInTransaction(tx, context, before,
      setInitiativeParticipationStatus(before, actor.characterId, "suspended"));
    // Already completed actions at this same point retain their independent results.
    for (const action of before.pendingActions.filter((entry) => entry.actorCharacterId === effect.targetParticipantId && entry.status === "active"
      && entry.expectedCompletionInitiative < before.runtime.timelineInitiative)) {
      const [declaration] = await tx.select({ id: campaignSessionEncounterActionDeclaration.id }).from(campaignSessionEncounterActionDeclaration)
        .where(eq(campaignSessionEncounterActionDeclaration.pendingActionId, action.id)).limit(1);
      if (declaration) await interruptActionDeclarationInTransaction(tx, context, { authority: "god-owner", userId: context.ownerUserId }, declaration.id, "Combatant defeated before this future action completed; prior resources and Roll are retained.");
    }
  }
  return { ...result, combatOutcome: evidence };
}

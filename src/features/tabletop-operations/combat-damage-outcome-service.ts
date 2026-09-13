import "server-only";
import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { readActiveHealthInTransaction, addInjuryInTransaction } from "@/features/active-state/active-health-service";
import type { OwnedEncounterRuntimeContext } from "./runtime-integration-service";
import { combatConditionState, headDamageCondition, wholeBodyDamageCondition } from "./combat-condition-state";
import { recordCombatConditionInTransaction } from "./combat-condition-service";
import { combatLimbConditions, limbDamageIncapacitates } from "./combat-limb-state";

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
    npcKind: campaignCharacter.npcKind, persistentSnapshot: campaignCreatureNpcProfile.currentSnapshotJson }).from(campaignSessionEncounterParticipant)
    .leftJoin(campaignCharacter, eq(campaignCharacter.id, campaignSessionEncounterParticipant.characterId))
    .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignSessionEncounterParticipant.characterId))
    .where(and(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId), eq(campaignSessionEncounterParticipant.characterId, effect.targetParticipantId)))
    .limit(1).for("update", { of: campaignSessionEncounterParticipant });
  if (!participant) throw new Error("Damage outcome requires the exact Encounter participant.");
  const local = structuredClone(object(participant.local));
  const previousOutcome = (Array.isArray(local.damageOutcomes) ? local.damageOutcomes.map(object) : []).find((entry) => entry.effectId === effect.id);
  if (previousOutcome) return { ...result, combatOutcome: previousOutcome };
  let totalDamage: number;
  let totalMaximumHp: number | null;
  let poolMaximumHp: number | null = null;
  let poolDamage = 0;
  let poolCount = 0;
  let poolName = "";
  let locations: { number: number; name: string; poolKey: string | null; specialEffect?: unknown }[] = [];
  const poolKey = typeof application.poolKey === "string" ? application.poolKey : typeof result.poolKey === "string" ? result.poolKey : null;
  if (effect.targetParticipantId < 0) {
    totalDamage = Number(object(local.health).totalDamage ?? 0);
    const maximum = object(object(participant.snapshot).core).totalHp;
    totalMaximumHp = typeof maximum === "number" ? maximum : null;
    const snapshot = object(participant.snapshot);
    const pools = Array.isArray(snapshot.hpPools) ? snapshot.hpPools.map(object) : [];
    poolCount = pools.length;
    const pool = pools.find((entry) => entry.canonicalId === poolKey);
    poolMaximumHp = typeof pool?.maximumHp === "number" ? pool.maximumHp : null;
    poolDamage = Number(object(object(local.health).poolDamage)[String(poolKey)] ?? 0);
    poolName = String(pool?.poolName ?? "");
    locations = (Array.isArray(snapshot.hitLocations) ? snapshot.hitLocations.map(object) : []).map((entry) => ({
      number: Number(entry.hitLocationNumber), name: String(entry.locationName ?? ""),
      poolKey: typeof entry.hpPoolCanonicalId === "string" ? entry.hpPoolCanonicalId : null, specialEffect: entry.locationEffect,
    }));
  } else {
    const health = await readActiveHealthInTransaction(tx, effect.targetParticipantId, participant.npcKind ?? "race");
    totalDamage = health.view.totalDamage;
    totalMaximumHp = health.anatomy.totalMaximumHp;
    poolCount = health.anatomy.pools.length;
    const pool = health.anatomy.pools.find((entry) => entry.key === poolKey);
    poolMaximumHp = pool?.maximumHp ?? null;
    poolDamage = health.state.pools.find((entry) => entry.poolKey === poolKey)?.damage ?? 0;
    poolName = pool?.name ?? "";
    locations = health.anatomy.hitLocations.map((entry) => ({ number: entry.result, name: entry.name, poolKey: entry.poolKey }));
    if (participant.npcKind === "creature" && participant.persistentSnapshot) {
      const snapshot = object(JSON.parse(participant.persistentSnapshot));
      const authored = Array.isArray(snapshot.hitLocations) ? snapshot.hitLocations.map(object) : [];
      locations = locations.map((location) => ({ ...location, specialEffect: authored.find((entry) => entry.hitLocationNumber === location.number)?.locationEffect }));
    }
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
  const headCondition = headDamageCondition({ poolDamage, poolKey, poolName, maximumHp: poolMaximumHp,
    location: locations.find((entry) => entry.number === application.hitLocationNumber), locations });
  const fatalHead = headCondition === "dead";
  const wholeBodyCondition = effect.targetParticipantId < 0 || participant.npcKind === "creature"
    ? wholeBodyDamageCondition({ poolKey, poolCount, poolDamage, maximumHp: poolMaximumHp, totalMaximumHp, locations }) : null;
  const fatalBody = wholeBodyCondition === "dead";
  const limbIncapacitated = limbDamageIncapacitates({ poolKey, poolName, poolDamage, maximumHp: poolMaximumHp, locations });
  const limbConditions = combatLimbConditions(local);
  if (limbIncapacitated && !limbConditions.some((entry) => entry.poolKey === poolKey && !entry.recoveredAt)) {
    local.limbConditions = [...limbConditions, { poolKey: poolKey!, name: poolName,
      sourceEffectId: effect.id, incapacitatedAt: new Date().toISOString() }];
  }
  const defeated = ruling.defeated === true || fatalHead || fatalBody;
  const unconscious = !defeated && headCondition === "unconscious";
  const incapacitated = !defeated && (unconscious || wholeBodyCondition === "incapacitated" || totalMaximumHp !== null && totalDamage >= totalMaximumHp);
  const reason = fatalHead ? "Accumulated head damage reduced head HP to -1 or lower; the combatant is dead."
    : fatalBody ? "The creature's whole-body HP reached -1 or lower; the combatant is dead."
    : defeated ? String(ruling.reason) : unconscious ? "Head HP reached 0; the combatant is unconscious."
    : wholeBodyCondition === "incapacitated" ? "The creature's whole-body HP reached 0; the combatant is incapacitated."
    : "Total accumulated damage reached the authored HP maximum; unable to participate. Death requires a supported fatal rule or specific ruling.";
  const evidence = { effectId: effect.id, damageAmount: object(final.effect).amount, totalDamage, totalMaximumHp,
    location: application.hitLocationNumber, poolKey, locationMaximumHp: poolMaximumHp, locationDamage: poolDamage,
    locationRemainingHp: poolMaximumHp === null ? null : poolMaximumHp - poolDamage,
    rule: fatalHead ? "fatal-head" : fatalBody ? "fatal-whole-body" : defeated ? "god-ruling" : unconscious ? "head-hp-zero"
      : wholeBodyCondition === "incapacitated" ? "whole-body-hp-zero" : incapacitated ? "total-hp-exhausted" : null,
    ruling: Object.keys(ruling).length ? ruling : null, defeated, dead: defeated, incapacitated, unconscious,
    limbIncapacitated, limbName: limbIncapacitated ? poolName : null,
    locationConsequenceRequiresGodRuling: !defeated && !unconscious && !wholeBodyCondition && !limbIncapacitated && poolMaximumHp !== null && poolDamage >= poolMaximumHp };
  const outcomes = Array.isArray(local.damageOutcomes) ? [...local.damageOutcomes] : [];
  outcomes.push(evidence);
  local.damageOutcomes = outcomes;
  if (defeated && !local.defeat) local.defeat = { effectId: effect.id, recordedByUserId: context.ownerUserId,
    reason,
    defeatValueXp: typeof ruling.defeatValueXp === "number" ? ruling.defeatValueXp : null,
    credit: null, distribution: null, awards: [], recordedAt: new Date().toISOString() };
  await tx.update(campaignSessionEncounterParticipant).set({ localStateJson: local, updatedAt: new Date() })
    .where(and(eq(campaignSessionEncounterParticipant.encounterId, context.encounterId), eq(campaignSessionEncounterParticipant.characterId, effect.targetParticipantId)));
  if ((defeated || incapacitated) && combatConditionState(participant.local).status !== "dead") await recordCombatConditionInTransaction(tx, context, {
    participantId: effect.targetParticipantId, status: defeated ? "dead" : "incapacitated", reason,
    requestKey: `damage-effect:${effect.id}`, initiativeTreatment: unconscious ? "zero" : "preserve", evidence,
  });
  if (defeated && combatConditionState(participant.local).status !== "dead") {
    const { recordCreatureKillFameInTransaction } = await import("./combat-fame-service");
    await recordCreatureKillFameInTransaction(tx, context, { participantId: effect.targetParticipantId, effectId: effect.id,
      requestKey: "automatic-kill-fame:" + effect.id, reason, automatic: true });
  }
  return { ...result, combatOutcome: evidence };
}

import "server-only";

import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function poolKeyForSelection(snapshot: JsonObject, poolKey: string | null | undefined, hitLocationNumber: number | null | undefined): string {
  const explicit = poolKey?.trim();
  if (explicit) return explicit;
  if (Number.isSafeInteger(hitLocationNumber)) {
    const locations = Array.isArray(snapshot.hitLocations) ? snapshot.hitLocations.map(object) : [];
    const location = locations.find((entry) => entry.hitLocationNumber === hitLocationNumber);
    if (typeof location?.hpPoolCanonicalId === "string" && location.hpPoolCanonicalId.trim()) return location.hpPoolCanonicalId.trim();
  }
  throw new Error("Direct Creature Health application requires the exact HP Pool or Hit Location selection.");
}

function assertPool(snapshot: JsonObject, poolKey: string): void {
  const pools = Array.isArray(snapshot.hpPools) ? snapshot.hpPools.map(object) : [];
  if (!pools.some((entry) => entry.canonicalId === poolKey)) {
    throw new Error("The selected HP Pool is not part of this direct Creature occurrence's frozen anatomy.");
  }
}

export async function resolveDirectCreaturePoolInTransaction(
  tx: Transaction,
  input: { encounterId: number; sceneId: number; sessionId: number; campaignId: number; participantId: number; poolKey?: string | null; hitLocationNumber?: number | null },
): Promise<string> {
  const [participant] = await tx.select({ kind: campaignSessionEncounterParticipant.participantKind, snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson })
    .from(campaignSessionEncounterParticipant)
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, input.encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, input.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, input.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, input.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, input.participantId),
    )).limit(1).for("update");
  if (!participant || participant.kind !== "creature" || !object(participant.snapshot)) throw new Error("The direct Creature occurrence anatomy is missing or malformed.");
  const key = poolKeyForSelection(object(participant.snapshot), input.poolKey, input.hitLocationNumber);
  assertPool(object(participant.snapshot), key);
  return key;
}

export async function applyDirectCreatureHealthInTransaction(
  tx: Transaction,
  input: { encounterId: number; sceneId: number; sessionId: number; campaignId: number; participantId: number; effectKind: "health.damage" | "health.heal"; amount: number; application: "area" | "full-body"; poolKey?: string | null; hitLocationNumber?: number | null },
): Promise<Record<string, unknown>> {
  if (input.participantId >= 0) throw new Error("Direct Creature state requires its negative occurrence-local participant key.");
  const [participant] = await tx.select({ kind: campaignSessionEncounterParticipant.participantKind, snapshot: campaignSessionEncounterParticipant.creatureSnapshotJson, localState: campaignSessionEncounterParticipant.localStateJson })
    .from(campaignSessionEncounterParticipant)
    .where(and(
      eq(campaignSessionEncounterParticipant.encounterId, input.encounterId),
      eq(campaignSessionEncounterParticipant.sceneId, input.sceneId),
      eq(campaignSessionEncounterParticipant.sessionId, input.sessionId),
      eq(campaignSessionEncounterParticipant.campaignId, input.campaignId),
      eq(campaignSessionEncounterParticipant.characterId, input.participantId),
    )).limit(1).for("update");
  if (!participant || participant.kind !== "creature" || !object(participant.snapshot) || !object(participant.localState)) throw new Error("The direct Creature occurrence-local state is missing or malformed.");
  const snapshot = object(participant.snapshot);
  const next = structuredClone(object(participant.localState));
  const health = object(next.health);
  const totalDamage = typeof health.totalDamage === "number" && Number.isFinite(health.totalDamage) && health.totalDamage >= 0 ? health.totalDamage : 0;
  const rawPoolDamage = object(health.poolDamage);
  const poolDamage: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawPoolDamage)) if (typeof value === "number" && Number.isFinite(value) && value >= 0) poolDamage[key] = value;

  let result: Record<string, unknown>;
  if (input.application === "full-body") {
    const before = totalDamage;
    const after = input.effectKind === "health.damage" ? before + input.amount : Math.max(0, before - input.amount);
    health.totalDamage = after;
    if (input.effectKind === "health.heal") {
      health.poolDamage = Object.fromEntries(Object.entries(poolDamage).map(([key, damage]) => [key, Math.max(0, damage - input.amount)]));
    }
    result = { kind: input.effectKind, scope: "full-body", before, after };
  } else {
    const key = poolKeyForSelection(snapshot, input.poolKey, input.hitLocationNumber);
    assertPool(snapshot, key);
    const before = poolDamage[key] ?? 0;
    const after = input.effectKind === "health.damage" ? before + input.amount : Math.max(0, before - input.amount);
    health.poolDamage = { ...poolDamage, [key]: after };
    health.totalDamage = input.effectKind === "health.damage"
      ? totalDamage + (after - before)
      : Math.max(0, totalDamage - (before - after));
    result = { kind: input.effectKind, poolKey: key, before, after, totalDamage: health.totalDamage };
  }
  next.health = health;
  const updated = await tx.update(campaignSessionEncounterParticipant).set({ localStateJson: next, updatedAt: new Date() }).where(and(
    eq(campaignSessionEncounterParticipant.encounterId, input.encounterId),
    eq(campaignSessionEncounterParticipant.sceneId, input.sceneId),
    eq(campaignSessionEncounterParticipant.sessionId, input.sessionId),
    eq(campaignSessionEncounterParticipant.campaignId, input.campaignId),
    eq(campaignSessionEncounterParticipant.characterId, input.participantId),
  )).returning({ characterId: campaignSessionEncounterParticipant.characterId });
  if (!updated.length) throw new Error("The direct Creature occurrence changed before Health could be applied.");
  return result;
}
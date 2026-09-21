import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { raceNaturalProtection, raceNaturalProtectionLocation } from "@/db/race-schema";
import { normalizeRaceNaturalProtection, type RaceNaturalProtection } from "./race-natural-protection";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function readRaceNaturalProtectionInTransaction(tx: Transaction, raceId: number): Promise<RaceNaturalProtection[]> {
  const definitions = await tx.select().from(raceNaturalProtection).where(eq(raceNaturalProtection.raceId, raceId))
    .orderBy(asc(raceNaturalProtection.sortOrder), asc(raceNaturalProtection.id));
  if (!definitions.length) return [];
  const locations = await tx.select().from(raceNaturalProtectionLocation).where(inArray(raceNaturalProtectionLocation.protectionId, definitions.map(({ id }) => id)));
  return normalizeRaceNaturalProtection(definitions.map((definition) => ({
    key: definition.key, name: definition.name, naturalArmor: definition.naturalArmor, naturalSoak: definition.naturalSoak, sortOrder: definition.sortOrder,
    coverage: definition.coverageKind === "all" ? { kind: "all" } : { kind: "locations", locationKeys: locations.filter(({ protectionId }) => protectionId === definition.id).map(({ locationKey }) => locationKey) },
  })));
}

/** Caller owns Race authorization and the enclosing save transaction. Keys retain source identity across edits. */
export async function saveRaceNaturalProtectionInTransaction(tx: Transaction, raceId: number, input: readonly RaceNaturalProtection[]) {
  const definitions = normalizeRaceNaturalProtection(input);
  const existing = await tx.select({ id: raceNaturalProtection.id, key: raceNaturalProtection.key }).from(raceNaturalProtection).where(eq(raceNaturalProtection.raceId, raceId));
  const removed = existing.filter(({ key }) => !definitions.some((definition) => definition.key === key));
  if (removed.length) await tx.delete(raceNaturalProtection).where(inArray(raceNaturalProtection.id, removed.map(({ id }) => id)));
  for (const definition of definitions) {
    const values = { raceId, key: definition.key, name: definition.name, naturalArmor: definition.naturalArmor, naturalSoak: definition.naturalSoak, coverageKind: definition.coverage.kind, sortOrder: definition.sortOrder };
    const [saved] = await tx.insert(raceNaturalProtection).values(values).onConflictDoUpdate({ target: [raceNaturalProtection.raceId, raceNaturalProtection.key], set: values }).returning({ id: raceNaturalProtection.id });
    await tx.delete(raceNaturalProtectionLocation).where(eq(raceNaturalProtectionLocation.protectionId, saved.id));
    if (definition.coverage.kind === "locations") await tx.insert(raceNaturalProtectionLocation).values(definition.coverage.locationKeys.map((locationKey) => ({ protectionId: saved.id, locationKey })));
  }
}

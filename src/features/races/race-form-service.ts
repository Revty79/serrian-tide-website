import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { raceForm } from "@/db/race-schema";
import { normalizeRaceForms, type RaceForm, type SavedRaceForm } from "./race-forms";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller supplies authorized Race access; this reads only that exact Race's Forms. */
export async function readRaceFormsInTransaction(tx: Transaction, raceId: number): Promise<SavedRaceForm[]> {
  return tx.select().from(raceForm).where(eq(raceForm.raceId, raceId))
    .orderBy(asc(raceForm.sortOrder), asc(raceForm.id));
}

/** Caller authorizes and locks the Race. Editing/reordering retains each surviving row ID. */
export async function saveRaceFormsInTransaction(tx: Transaction, raceId: number, input: readonly RaceForm[]) {
  const definitions = normalizeRaceForms(input);
  const keys = new Set(definitions.map(row => row.key));
  const existing = await tx.select({ id: raceForm.id, key: raceForm.key }).from(raceForm).where(eq(raceForm.raceId, raceId));
  const removed = existing.filter(row => !keys.has(row.key));
  if (removed.length) await tx.delete(raceForm).where(inArray(raceForm.id, removed.map(row => row.id)));
  for (const definition of definitions) {
    const values = { ...definition, raceId };
    await tx.insert(raceForm).values(values).onConflictDoUpdate({ target: [raceForm.raceId, raceForm.key], set: values });
  }
}

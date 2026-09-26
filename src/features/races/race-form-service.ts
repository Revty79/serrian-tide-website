import "server-only";
import { normalizeRaceFormTransformation } from "./race-form-transformation";
import { asc, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { raceForm } from "@/db/race-schema";
import { normalizeRaceForms, type RaceForm, type SavedRaceForm } from "./race-forms";
import { emptyRaceFormMechanics, normalizeRaceFormMechanics, raceFormMechanicsProfile, type FormRaceDefinition } from "./race-form-mechanics";
import { cloneFormMechanicsInTransaction, readFormMechanicsInTransaction, saveFormMechanicsInTransaction } from "./race-form-mechanics-service";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller supplies authorized Race access; this reads only that exact Race's Forms. */
export async function readRaceFormsInTransaction(tx: Transaction, raceId: number): Promise<SavedRaceForm[]> {
  const forms = await tx.select().from(raceForm).where(eq(raceForm.raceId, raceId))
    .orderBy(asc(raceForm.sortOrder), asc(raceForm.id));
  const mechanics = await readFormMechanicsInTransaction(tx, forms);
  return forms.map(row => ({ ...row, mechanics: mechanics.get(row.id)! }));
}

/** Caller authorizes and locks the Race. Editing/reordering retains each surviving row ID. */
export async function saveRaceFormsInTransaction(tx: Transaction, raceId: number, input: readonly RaceForm[], race: FormRaceDefinition) {
  const definitions = normalizeRaceForms(input);
  const savedForms = await readRaceFormsInTransaction(tx, raceId);
  const mechanics = definitions.map((row, index) => {
    try { return normalizeRaceFormMechanics(input[index].mechanics === undefined ? savedForms.find(form => form.key === row.key)?.mechanics ?? emptyRaceFormMechanics() : input[index].mechanics!, race); }
    catch (error) { throw new Error(`${row.name}: ${error instanceof Error ? error.message : "Invalid Form mechanics."}`); }
  });
  const transformations = definitions.map((row, index) => {
    try { return normalizeRaceFormTransformation(input[index].transformation === undefined ? savedForms.find(form => form.key === row.key)?.transformation ?? null : input[index].transformation); }
    catch (error) { throw new Error(`${row.name}: ${error instanceof Error ? error.message : "Invalid transformation definition."}`); }
  });
  const keys = new Set(definitions.map(row => row.key));
  const existing = await tx.select({ id: raceForm.id, key: raceForm.key }).from(raceForm).where(eq(raceForm.raceId, raceId));
  const removed = existing.filter(row => !keys.has(row.key));
  if (removed.length) await tx.delete(raceForm).where(inArray(raceForm.id, removed.map(row => row.id)));
  for (const [index, definition] of definitions.entries()) {
    const values = { ...definition, raceId, mechanics: raceFormMechanicsProfile(mechanics[index]), transformation: transformations[index] };
    const [saved] = await tx.insert(raceForm).values(values).onConflictDoUpdate({ target: [raceForm.raceId, raceForm.key], set: values }).returning({ id: raceForm.id });
    await saveFormMechanicsInTransaction(tx, saved.id, mechanics[index]);
  }
}

export async function cloneRaceFormsInTransaction(tx: Transaction, parentRaceId: number, raceId: number) {
  const forms = await tx.select().from(raceForm).where(eq(raceForm.raceId, parentRaceId)).orderBy(asc(raceForm.sortOrder), asc(raceForm.id));
  for (const form of forms) {
    const [saved] = await tx.insert(raceForm).values({ ...form, id: undefined, raceId }).returning({ id: raceForm.id });
    await cloneFormMechanicsInTransaction(tx, form.id, saved.id);
  }
}

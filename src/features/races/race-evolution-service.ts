import { raceEvolutionEvent } from "@/db/evolution-event-schema";
import "server-only";
import { and, asc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { race } from "@/db/race-schema";
import { raceEvolutionPath as path } from "@/db/race-evolution-schema";
import { assertCanEditSharedLibraryRoot, canEditSharedLibraryRoot, type SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { catalogBrowseWhere, getCatalogBrowseState } from "@/features/catalog-visibility/catalog-query";
import { normalizeEvolutionPath, requireEvolutionId, type RaceEvolutionPath, type EvolutionDestination, type EvolutionPathInput } from "./race-evolutions";
import { cloneEvolutionRequirementRows, evolutionSourceChoices, readEvolutionRequirements, saveEvolutionRequirementRows, validateEvolutionReferences } from "./evolution-requirement-service";
import type { EvolutionRequirements } from "@/features/evolutions/evolution-requirements";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const parent = alias(race, "evolution_destination_parent");
const destinationColumns = {
  id: race.id, name: race.name,
  parentRaceId: race.parentRaceId, parentRaceName: parent.name,
  archived: sql<boolean>`${race.archivedAt} is not null`,
};

/** Exact source lookup, deliberately no parent-chain merge or runtime mutations. */
export async function readRaceEvolutionsInTransaction(tx: Transaction, sourceRaceId: number): Promise<RaceEvolutionPath[]> {
  return tx.select({
    id: path.id, sourceRaceId: path.sourceRaceId, destinationRaceId: path.destinationRaceId,
    name: path.name, description: path.description, notes: path.notes, sortOrder: path.sortOrder, version: path.version,
    requirementMode: path.requirementMode, transition: path.transition,
    destination: destinationColumns,
  }).from(path).innerJoin(race, eq(race.id, path.destinationRaceId))
    .leftJoin(parent, eq(parent.id, race.parentRaceId))
    .where(eq(path.sourceRaceId, sourceRaceId)).orderBy(asc(path.sortOrder), asc(path.id));
}

export async function readRaceEvolutionAuthoring(sourceRaceId: number, actor: SharedLibraryActor) {
  requireEvolutionId(sourceRaceId, "Source Race");
  return db.transaction(async tx => {
    const [source] = await tx.select().from(race).where(eq(race.id, sourceRaceId));
    if (!source) throw new Error("Source Race no longer exists.");
    return { paths: await readRaceEvolutionsInTransaction(tx, sourceRaceId), canEdit: !source.archivedAt && canEditSharedLibraryRoot(actor, source) };
  });
}

export async function findEvolutionDestinations(sourceRaceId: number, search: string, actor: SharedLibraryActor): Promise<EvolutionDestination[]> {
  requireEvolutionId(sourceRaceId, "Source Race");
  const visibility = await getCatalogBrowseState(actor.userId, "race");
  const term = search.trim();
  return db.select(destinationColumns).from(race).leftJoin(parent, eq(parent.id, race.parentRaceId))
    .where(catalogBrowseWhere(race, actor.userId, visibility, isNull(race.archivedAt), ne(race.id, sourceRaceId),
      term ? or(ilike(race.name, `%${term}%`)) : undefined))
    .orderBy(asc(race.name), asc(race.id)).limit(30);
}

async function lockSource(tx: Transaction, sourceRaceId: number, actor: SharedLibraryActor, destinationRaceId?: number) {
  requireEvolutionId(sourceRaceId, "Source Race");
  // Deterministic order also handles simultaneous opposing branches without lock inversion.
  const roots = await tx.select().from(race).where(inArray(race.id, [sourceRaceId, ...(destinationRaceId ? [destinationRaceId] : [])]))
    .orderBy(asc(race.id)).for("no key update");
  const source = roots.find(row => row.id === sourceRaceId);
  if (!source) throw new Error("Source Race no longer exists.");
  assertCanEditSharedLibraryRoot(actor, source, "Race");
  if (source.archivedAt) throw new Error("Restore this Race before editing its Evolutions.");
  return roots.find(row => row.id === destinationRaceId);
}

function assertVersion(stored: { version: number } | undefined, expectedVersion: number) {
  requireEvolutionId(expectedVersion, "Evolution version");
  if (!stored || stored.version !== expectedVersion) throw new Error("This Evolution path changed or was removed. Reload Evolutions before continuing.");
}

export async function saveRaceEvolution(input: EvolutionPathInput, actor: SharedLibraryActor) {
  const values = normalizeEvolutionPath(input);
  const visibility = await getCatalogBrowseState(actor.userId, "race");
  return db.transaction(async tx => {
    const target = await lockSource(tx, values.sourceRaceId, actor, values.destinationRaceId);
    const [stored] = input.id === undefined ? [] : await tx.select().from(path).where(and(eq(path.id, input.id), eq(path.sourceRaceId, values.sourceRaceId)));
    if (input.id !== undefined) assertVersion(stored, input.expectedVersion!);
    if (!target) throw new Error("Destination Race no longer exists.");
    if (stored?.destinationRaceId !== values.destinationRaceId) {
      if (target.archivedAt) throw new Error("Archived Races cannot be newly selected as Evolution destinations.");
      const [available] = await tx.select({ id: race.id }).from(race).where(catalogBrowseWhere(race, actor.userId, visibility, eq(race.id, target.id)));
      if (!available) throw new Error("Choose a destination available in your Race catalog view.");
    }
    if (stored) {
      await tx.update(path).set({ ...values, version: stored.version + 1, updatedAt: new Date() }).where(eq(path.id, stored.id));
    } else {
      const [order] = await tx.select({ next: sql<number>`coalesce(max(${path.sortOrder}), -1) + 1` }).from(path).where(eq(path.sourceRaceId, values.sourceRaceId));
      await tx.insert(path).values({ ...values, sortOrder: order.next });
    }
    return readRaceEvolutionsInTransaction(tx, values.sourceRaceId);
  });
}

export async function removeRaceEvolution(input: { sourceRaceId: number; id: number; expectedVersion: number }, actor: SharedLibraryActor) {
  requireEvolutionId(input.id, "Evolution path");
  return db.transaction(async tx => {
    await lockSource(tx, input.sourceRaceId, actor);
    const [stored] = await tx.select().from(path).where(and(eq(path.id, input.id), eq(path.sourceRaceId, input.sourceRaceId)));
    assertVersion(stored, input.expectedVersion);
    const [history] = await tx.select({ id: raceEvolutionEvent.id }).from(raceEvolutionEvent).where(eq(raceEvolutionEvent.pathId, stored.id)).limit(1);
    if (history) throw new Error("This Evolution path is referenced by persistent individual history and cannot be removed. Its past events must remain readable.");
    await tx.delete(path).where(eq(path.id, stored.id));
    return readRaceEvolutionsInTransaction(tx, input.sourceRaceId);
  });
}

export async function reorderRaceEvolutions(input: { sourceRaceId: number; paths: Array<{ id: number; version: number }> }, actor: SharedLibraryActor) {
  return db.transaction(async tx => {
    await lockSource(tx, input.sourceRaceId, actor);
    const existing = await tx.select().from(path).where(eq(path.sourceRaceId, input.sourceRaceId));
    if (!Array.isArray(input.paths) || existing.length !== input.paths.length || new Set(input.paths.map(row => row.id)).size !== existing.length) {
      throw new Error("The Evolution list changed. Reload Evolutions before reordering.");
    }
    for (const [sortOrder, row] of input.paths.entries()) {
      requireEvolutionId(row.id, "Evolution path");
      assertVersion(existing.find(stored => stored.id === row.id), row.version);
      await tx.update(path).set({ sortOrder, version: row.version + 1, updatedAt: new Date() }).where(eq(path.id, row.id));
    }
    return readRaceEvolutionsInTransaction(tx, input.sourceRaceId);
  });
}

/** Source clone is authorized by the existing variant action. Keep destinations, including retained archives. */
export async function cloneRaceEvolutionsInTransaction(tx: Transaction, sourceRaceId: number, newSourceRaceId: number) {
  const paths = await tx.select().from(path).where(eq(path.sourceRaceId, sourceRaceId)).orderBy(asc(path.sortOrder), asc(path.id));
  for (const original of paths) {
    const [copied] = await tx.insert(path).values({ sourceRaceId: newSourceRaceId, destinationRaceId: original.destinationRaceId, name: original.name, description: original.description, notes: original.notes, sortOrder: original.sortOrder, requirementMode: original.requirementMode, transition: original.transition }).returning({ id: path.id });
    await cloneEvolutionRequirementRows(tx, original.id, copied.id);
  }
}

export async function readEvolutionRequirementAuthoring(sourceRaceId: number, pathId: number, actor: SharedLibraryActor) {
  requireEvolutionId(sourceRaceId, "Source Race"); requireEvolutionId(pathId, "Evolution path");
  return db.transaction(async tx => {
    const [source] = await tx.select().from(race).where(eq(race.id, sourceRaceId));
    if (!source) throw new Error("Source Race no longer exists.");
    const selected = (await readRaceEvolutionsInTransaction(tx, sourceRaceId)).find(row => row.id === pathId);
    if (!selected) throw new Error("Evolution path no longer exists on this source Race.");
    return { path: selected, canEdit: !source.archivedAt && canEditSharedLibraryRoot(actor, source), ...await readEvolutionRequirements(tx, selected.id, selected.requirementMode), ...await evolutionSourceChoices(tx, sourceRaceId) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function saveEvolutionRequirements(input: { sourceRaceId: number; pathId: number; expectedVersion: number; requirements: EvolutionRequirements }, actor: SharedLibraryActor) {
  requireEvolutionId(input.pathId, "Evolution path");
  return db.transaction(async tx => {
    await lockSource(tx, input.sourceRaceId, actor);
    const [stored] = await tx.select().from(path).where(and(eq(path.id, input.pathId), eq(path.sourceRaceId, input.sourceRaceId)));
    assertVersion(stored, input.expectedVersion);
    const previous = await readEvolutionRequirements(tx, stored.id, stored.requirementMode);
    const value = await validateEvolutionReferences(tx, input.sourceRaceId, input.requirements, previous, actor.userId);
    await saveEvolutionRequirementRows(tx, stored.id, value);
    await tx.update(path).set({ requirementMode: value.mode, version: stored.version + 1, updatedAt: new Date() }).where(eq(path.id, stored.id));
    return readRaceEvolutionsInTransaction(tx, input.sourceRaceId);
  });
}

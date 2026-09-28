import "server-only";
import { and, asc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { creature, creatureEvolutionPath as path } from "@/db/creature-schema";
import { assertCanEditSharedLibraryRoot, canEditSharedLibraryRoot, type SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { catalogBrowseWhere, getCatalogBrowseState } from "@/features/catalog-visibility/catalog-query";
import { normalizeEvolutionPath, requireEvolutionId, type CreatureEvolutionPath, type EvolutionDestination, type EvolutionPathInput } from "./creature-evolutions";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const parent = alias(creature, "evolution_destination_parent");
const destinationColumns = {
  id: creature.id, canonicalId: creature.canonicalId, canonicalName: creature.canonicalName,
  parentCreatureId: creature.parentCreatureId, parentCreatureName: parent.canonicalName,
  archived: sql<boolean>`${creature.archivedAt} is not null`,
};

/** Exact source lookup, deliberately no parent-chain merge or runtime mutations. */
export async function readCreatureEvolutionsInTransaction(tx: Transaction, sourceCreatureId: number): Promise<CreatureEvolutionPath[]> {
  return tx.select({
    id: path.id, sourceCreatureId: path.sourceCreatureId, destinationCreatureId: path.destinationCreatureId,
    name: path.name, description: path.description, notes: path.notes, sortOrder: path.sortOrder, version: path.version,
    destination: destinationColumns,
  }).from(path).innerJoin(creature, eq(creature.id, path.destinationCreatureId))
    .leftJoin(parent, eq(parent.id, creature.parentCreatureId))
    .where(eq(path.sourceCreatureId, sourceCreatureId)).orderBy(asc(path.sortOrder), asc(path.id));
}

export async function readCreatureEvolutionAuthoring(sourceCreatureId: number, actor: SharedLibraryActor) {
  requireEvolutionId(sourceCreatureId, "Source Creature");
  return db.transaction(async tx => {
    const [source] = await tx.select().from(creature).where(eq(creature.id, sourceCreatureId));
    if (!source) throw new Error("Source Creature no longer exists.");
    return { paths: await readCreatureEvolutionsInTransaction(tx, sourceCreatureId), canEdit: !source.archivedAt && canEditSharedLibraryRoot(actor, source) };
  });
}

export async function findEvolutionDestinations(sourceCreatureId: number, search: string, actor: SharedLibraryActor): Promise<EvolutionDestination[]> {
  requireEvolutionId(sourceCreatureId, "Source Creature");
  const visibility = await getCatalogBrowseState(actor.userId, "creature");
  const term = search.trim();
  return db.select(destinationColumns).from(creature).leftJoin(parent, eq(parent.id, creature.parentCreatureId))
    .where(catalogBrowseWhere(creature, actor.userId, visibility, isNull(creature.archivedAt), ne(creature.id, sourceCreatureId),
      term ? or(ilike(creature.canonicalName, `%${term}%`), ilike(creature.canonicalId, `%${term}%`)) : undefined))
    .orderBy(asc(creature.canonicalName), asc(creature.id)).limit(30);
}

async function lockSource(tx: Transaction, sourceCreatureId: number, actor: SharedLibraryActor, destinationCreatureId?: number) {
  requireEvolutionId(sourceCreatureId, "Source Creature");
  // Deterministic order also handles simultaneous opposing branches without lock inversion.
  const roots = await tx.select().from(creature).where(inArray(creature.id, [sourceCreatureId, ...(destinationCreatureId ? [destinationCreatureId] : [])]))
    .orderBy(asc(creature.id)).for("no key update");
  const source = roots.find(row => row.id === sourceCreatureId);
  if (!source) throw new Error("Source Creature no longer exists.");
  assertCanEditSharedLibraryRoot(actor, source, "Creature");
  if (source.archivedAt) throw new Error("Restore this Creature before editing its Evolutions.");
  return roots.find(row => row.id === destinationCreatureId);
}

function assertVersion(stored: { version: number } | undefined, expectedVersion: number) {
  requireEvolutionId(expectedVersion, "Evolution version");
  if (!stored || stored.version !== expectedVersion) throw new Error("This Evolution path changed or was removed. Reload Evolutions before continuing.");
}

export async function saveCreatureEvolution(input: EvolutionPathInput, actor: SharedLibraryActor) {
  const values = normalizeEvolutionPath(input);
  const visibility = await getCatalogBrowseState(actor.userId, "creature");
  return db.transaction(async tx => {
    const target = await lockSource(tx, values.sourceCreatureId, actor, values.destinationCreatureId);
    const [stored] = input.id === undefined ? [] : await tx.select().from(path).where(and(eq(path.id, input.id), eq(path.sourceCreatureId, values.sourceCreatureId)));
    if (input.id !== undefined) assertVersion(stored, input.expectedVersion!);
    if (!target) throw new Error("Destination Creature no longer exists.");
    if (stored?.destinationCreatureId !== values.destinationCreatureId) {
      if (target.archivedAt) throw new Error("Archived Creatures cannot be newly selected as Evolution destinations.");
      const [available] = await tx.select({ id: creature.id }).from(creature).where(catalogBrowseWhere(creature, actor.userId, visibility, eq(creature.id, target.id)));
      if (!available) throw new Error("Choose a destination available in your Creature catalog view.");
    }
    if (stored) {
      await tx.update(path).set({ ...values, version: stored.version + 1, updatedAt: new Date() }).where(eq(path.id, stored.id));
    } else {
      const [order] = await tx.select({ next: sql<number>`coalesce(max(${path.sortOrder}), -1) + 1` }).from(path).where(eq(path.sourceCreatureId, values.sourceCreatureId));
      await tx.insert(path).values({ ...values, sortOrder: order.next });
    }
    return readCreatureEvolutionsInTransaction(tx, values.sourceCreatureId);
  });
}

export async function removeCreatureEvolution(input: { sourceCreatureId: number; id: number; expectedVersion: number }, actor: SharedLibraryActor) {
  requireEvolutionId(input.id, "Evolution path");
  return db.transaction(async tx => {
    await lockSource(tx, input.sourceCreatureId, actor);
    const [stored] = await tx.select().from(path).where(and(eq(path.id, input.id), eq(path.sourceCreatureId, input.sourceCreatureId)));
    assertVersion(stored, input.expectedVersion);
    await tx.delete(path).where(eq(path.id, stored.id));
    return readCreatureEvolutionsInTransaction(tx, input.sourceCreatureId);
  });
}

export async function reorderCreatureEvolutions(input: { sourceCreatureId: number; paths: Array<{ id: number; version: number }> }, actor: SharedLibraryActor) {
  return db.transaction(async tx => {
    await lockSource(tx, input.sourceCreatureId, actor);
    const existing = await tx.select().from(path).where(eq(path.sourceCreatureId, input.sourceCreatureId));
    if (!Array.isArray(input.paths) || existing.length !== input.paths.length || new Set(input.paths.map(row => row.id)).size !== existing.length) {
      throw new Error("The Evolution list changed. Reload Evolutions before reordering.");
    }
    for (const [sortOrder, row] of input.paths.entries()) {
      requireEvolutionId(row.id, "Evolution path");
      assertVersion(existing.find(stored => stored.id === row.id), row.version);
      await tx.update(path).set({ sortOrder, version: row.version + 1, updatedAt: new Date() }).where(eq(path.id, row.id));
    }
    return readCreatureEvolutionsInTransaction(tx, input.sourceCreatureId);
  });
}

/** Source clone is authorized by the existing variant action. Keep destinations, including retained archives. */
export async function cloneCreatureEvolutionsInTransaction(tx: Transaction, sourceCreatureId: number, newSourceCreatureId: number) {
  await tx.execute(sql`insert into creature_evolution_paths (source_creature_id, destination_creature_id, name, description, notes, sort_order)
    select ${newSourceCreatureId}, destination_creature_id, name, description, notes, sort_order
    from creature_evolution_paths where source_creature_id = ${sourceCreatureId} order by sort_order, id`);
}

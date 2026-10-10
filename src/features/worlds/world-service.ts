import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { itemTagCatalog } from "@/db/item-schema";
import { world, worldEra, worldEntry, worldEntryEra, worldTag } from "@/db/world-schema";
import { entryDraftSchema, eraDraftSchema, worldDraftSchema, type EntryRecord, type EraRecord, type Tone, type WorldBundle, type WorldRecord } from "./history";

export class WorldError extends Error { constructor(message: string, public status: number) { super(message); } }
const notFound = () => new WorldError("This world or historical record is unavailable.", 404);
const conflict = () => new WorldError("A newer version was saved in another tab. Your draft is still here. Load the latest version before editing again.", 409);
const idSchema = z.string().uuid();
const revisionSchema = z.number().int().positive();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function actor(userId: string) {
  const roles = await db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId));
  if (!roles.some(({role}) => role === "god" || role === "admin")) throw new WorldError("G.O.D. or administrator access is required.", 403);
  return { userId, admin: roles.some(({role}) => role === "admin") };
}
async function readWorld(userId: string, worldId: string, review: boolean) {
  const access = await actor(userId);
  if (!idSchema.safeParse(worldId).success) throw notFound();
  const [row] = await db.select().from(world).where(and(eq(world.id, worldId), review && access.admin ? undefined : eq(world.ownerId, userId))).limit(1);
  if (!row) throw notFound();
  return row;
}
async function lockOwned(tx: Tx, userId: string, worldId: string, allowArchived = false) {
  if (!idSchema.safeParse(worldId).success) throw notFound();
  const [row] = await tx.select().from(world).where(and(eq(world.id, worldId), eq(world.ownerId, userId))).for("update");
  if (!row) throw notFound();
  if (row.archivedAt && !allowArchived) throw new WorldError("Restore this world before editing its history.", 400);
  return row;
}
async function tags(tx: Tx, worldId: string, tagIds: number[]) {
  const ids = [...new Set(tagIds)];
  if (ids.length) {
    const matches = await tx.select({ id: itemTagCatalog.id }).from(itemTagCatalog).where(and(inArray(itemTagCatalog.id, ids), sql`lower(trim(${itemTagCatalog.tagGroup})) in ('era','genre')`));
    if (matches.length !== ids.length) throw new WorldError("Choose existing Era or Genre classification tags.", 400);
  }
  await tx.delete(worldTag).where(eq(worldTag.worldId, worldId));
  if (ids.length) await tx.insert(worldTag).values(ids.map((tagId) => ({ worldId, tagId })));
}
function worldDto(row: typeof world.$inferSelect, ownerName: string, tagIds: number[], eraCount: number, entryCount: number): WorldRecord {
  return { id: row.id, ownerId: row.ownerId, ownerName, name: row.name, description: row.description, introduction: row.introduction, historicalOverview: row.historicalOverview, tone: row.tone as Tone, revision: row.revision, archived: !!row.archivedAt, updatedAt: row.updatedAt.toISOString(), tagIds, eraCount, entryCount };
}
function eraDto(row: typeof worldEra.$inferSelect): EraRecord { return { id: row.id, worldId: row.worldId, name: row.name, description: row.description, startYear: row.startYear, endYear: row.endYear, tone: row.tone as Tone, revision: row.revision, archived: !!row.archivedAt }; }
function entryDto(row: typeof worldEntry.$inferSelect, eraIds: string[]): EntryRecord { return { id: row.id, worldId: row.worldId, title: row.title, account: row.account, notes: row.notes, time: row.time, accuracy: row.accuracy as EntryRecord["accuracy"], narrative: row.narrative as EntryRecord["narrative"], revision: row.revision, archived: !!row.archivedAt, updatedAt: row.updatedAt.toISOString(), eraIds }; }
export async function listWorlds(userId: string, scope: "mine" | "review" = "mine") {
  const access = await actor(userId);
  if (scope === "review" && !access.admin) throw new WorldError("Administrator review requires administrator access.", 403);
  const rows = await db.select({ row: world, ownerName: user.name,
    eraCount: sql<number>`(select count(*)::integer from world_historical_era e where e.world_id = ${world.id} and e.archived_at is null)`,
    entryCount: sql<number>`(select count(*)::integer from world_historical_entry e where e.world_id = ${world.id} and e.archived_at is null)`,
  }).from(world).innerJoin(user, eq(user.id, world.ownerId)).where(scope === "review" ? ne(world.ownerId, userId) : eq(world.ownerId, userId)).orderBy(desc(world.updatedAt), asc(world.id));
  const associations = rows.length ? await db.select().from(worldTag).where(inArray(worldTag.worldId, rows.map(({row}) => row.id))) : [];
  return rows.map(({row, ownerName, eraCount, entryCount}) => worldDto(row, ownerName, associations.filter((tag) => tag.worldId === row.id).map((tag) => tag.tagId), eraCount, entryCount));
}
export async function worldReferences(userId: string) {
  await actor(userId);
  return db.select({ id: itemTagCatalog.id, name: itemTagCatalog.name, tagGroup: itemTagCatalog.tagGroup, description: itemTagCatalog.description }).from(itemTagCatalog).where(sql`lower(trim(${itemTagCatalog.tagGroup})) in ('era','genre')`).orderBy(asc(itemTagCatalog.tagGroup), asc(itemTagCatalog.name));
}
export async function getWorld(userId: string, worldId: string, review = false): Promise<WorldBundle> {
  const row = await readWorld(userId, worldId, review);
  // Read one consistent snapshot even while another tab saves associations.
  return db.transaction(async (tx) => {
    const [fresh] = await tx.select().from(world).where(eq(world.id, row.id));
    const [owner] = await tx.select({ name: user.name }).from(user).where(eq(user.id, fresh.ownerId));
    const eras = await tx.select().from(worldEra).where(eq(worldEra.worldId, worldId)).orderBy(asc(worldEra.name), asc(worldEra.id));
    const entries = await tx.select().from(worldEntry).where(eq(worldEntry.worldId, worldId)).orderBy(desc(worldEntry.updatedAt), asc(worldEntry.id));
    const memberships = await tx.select().from(worldEntryEra).where(eq(worldEntryEra.worldId, worldId));
    const classifications = await tx.select().from(worldTag).where(eq(worldTag.worldId, worldId));
    return { world: worldDto(fresh, owner.name, classifications.map((tag) => tag.tagId), eras.filter((era) => !era.archivedAt).length, entries.filter((entry) => !entry.archivedAt).length), eras: eras.map(eraDto), entries: entries.map((entry) => entryDto(entry, memberships.filter((m) => m.entryId === entry.id).map((m) => m.eraId))), canEdit: fresh.ownerId === userId && !fresh.archivedAt };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function createWorld(userId: string, input: unknown) {
  await actor(userId);
  const { tagIds, ...draft } = worldDraftSchema.parse(input);
  const id = randomUUID();
  await db.transaction(async (tx) => { await tx.insert(world).values({ id, ownerId: userId, ...draft }); await tags(tx, id, tagIds); });
  return id;
}
export async function changeWorld(userId: string, worldId: string, input: unknown) {
  await actor(userId);
  const command = z.discriminatedUnion("action", [
    z.object({ action: z.literal("save"), revision: revisionSchema, draft: worldDraftSchema }).strict(),
    z.object({ action: z.enum(["archive","restore"]), revision: revisionSchema }).strict(),
  ]).parse(input);
  await db.transaction(async (tx) => {
    const current = await lockOwned(tx, userId, worldId, command.action !== "save");
    if (current.revision !== command.revision) throw conflict();
    if (command.action === "save") {
      const { tagIds, ...draft } = command.draft;
      await tx.update(world).set({ ...draft, revision: current.revision + 1, updatedAt: new Date() }).where(eq(world.id, worldId));
      await tags(tx, worldId, tagIds);
    } else await tx.update(world).set({ archivedAt: command.action === "archive" ? new Date() : null, revision: current.revision + 1, updatedAt: new Date() }).where(eq(world.id, worldId));
  });
}
const historyCommand = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("era"), id: idSchema.optional(), revision: revisionSchema.optional(), action: z.enum(["save","archive","restore"]), draft: eraDraftSchema.optional() }).strict(),
  z.object({ entity: z.literal("entry"), id: idSchema.optional(), revision: revisionSchema.optional(), action: z.enum(["save","archive","restore"]), draft: entryDraftSchema.optional() }).strict(),
]);
export async function changeHistory(userId: string, worldId: string, input: unknown) {
  await actor(userId);
  const command = historyCommand.parse(input);
  const id = command.id ?? randomUUID();
  await db.transaction(async (tx) => {
    await lockOwned(tx, userId, worldId);
    const table = command.entity === "era" ? worldEra : worldEntry;
    const [current] = command.id ? await tx.select({ revision: table.revision, archivedAt: table.archivedAt }).from(table).where(and(eq(table.id, id), eq(table.worldId, worldId))).for("update") : [];
    if (command.id && !current) throw notFound();
    if (current && current.revision !== command.revision) throw conflict();
    if (command.action !== "save") {
      if (!current) throw new WorldError("Choose a saved historical record.", 400);
      await tx.update(table).set({ archivedAt: command.action === "archive" ? new Date() : null, revision: current.revision + 1, updatedAt: new Date() }).where(and(eq(table.id, id), eq(table.worldId, worldId)));
    } else {
      if (current?.archivedAt) throw new WorldError("Restore this historical record before editing it.", 400);
      if (!command.draft) throw new WorldError("Enter the historical record's details.", 400);
      const lifecycle = { revision: (current?.revision ?? 0) + 1, updatedAt: new Date() };
      if (command.entity === "era") {
        if (current) await tx.update(worldEra).set({ ...command.draft, ...lifecycle }).where(and(eq(worldEra.id, id), eq(worldEra.worldId, worldId)));
        else await tx.insert(worldEra).values({ id, worldId, ...command.draft });
      } else {
        const { eraIds, ...draft } = command.draft;
        const ids = [...new Set(eraIds)];
        if (ids.length) {
          const matches = await tx.select({ id: worldEra.id, archivedAt: worldEra.archivedAt }).from(worldEra).where(and(inArray(worldEra.id, ids), eq(worldEra.worldId, worldId)));
          if (matches.length !== ids.length) throw new WorldError("Every historical era must belong to this world.", 400);
          const retained = current ? await tx.select().from(worldEntryEra).where(eq(worldEntryEra.entryId, id)) : [];
          if (matches.some((era) => era.archivedAt && !retained.some((link) => link.eraId === era.id))) throw new WorldError("Restore an archived era before assigning new entries to it.", 400);
        }
        if (current) await tx.update(worldEntry).set({ ...draft, ...lifecycle }).where(and(eq(worldEntry.id, id), eq(worldEntry.worldId, worldId)));
        else await tx.insert(worldEntry).values({ id, worldId, ...draft });
        await tx.delete(worldEntryEra).where(eq(worldEntryEra.entryId, id));
        if (ids.length) await tx.insert(worldEntryEra).values(ids.map((eraId) => ({ worldId, entryId: id, eraId })));
      }
    }
    await tx.update(world).set({ updatedAt: new Date() }).where(eq(world.id, worldId));
  });
  return id;
}

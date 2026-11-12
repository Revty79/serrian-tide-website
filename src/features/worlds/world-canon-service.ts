import "server-only";
import {assertWorldSourceUse,recordSourceUse,worldRightsSources} from "./source-rights-store";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { world, worldEra, worldEntry, worldEntryEra } from "@/db/world-schema";
import { worldAccessAudit as audit, worldEditorLease as leases } from "@/db/world-collaboration-schema";
import { worldCanonCopy, worldCanonCopyIdentity } from "@/db/world-canon-copy-schema";
import { acceptCanonGeography, canonCopyAvailable, canonIdentityMap, prepareCanonGeography, registerCanonIdentities, type PersonalCanonResult } from "./world-canon-geography-copy";
import { activeWorldSession, authorizeWorldRead, collaborationAvailable, databaseClock, editorTokenHash, worldActor, type WorldTransaction } from "./world-access-service";
import { capturePrimaryVersion, effectiveHistory, selectedTimeline } from "./history-version-service";
import { worldRequestAuthority } from "./world-authorization-context";
import { readWorldCanon, worldCanonStateSql } from "./world-canon-state";
import { personalCanonWorldSchema, worldCanonCommandSchema, type CanonSource, type CanonWorldCard } from "./world-canon";
import { WorldError, worldUnavailable } from "./world-errors";

async function currentSession(tx: WorldTransaction, userId: string) {
  const authority = worldRequestAuthority();
  if (!authority || authority.userId !== userId || !await activeWorldSession(tx, userId, authority.sessionId, await databaseClock(tx))) throw new WorldError("Sign in again before changing canon settings.", 401);
}
async function exactReceipt(tx: WorldTransaction, worldId: string, userId: string, requestId: string, command: unknown) {
  const [old] = await tx.select().from(audit).where(and(eq(audit.worldId, worldId), eq(audit.actorId, userId), eq(audit.requestId, requestId)));
  if (old && old.inputHash !== editorTokenHash(JSON.stringify(command))) throw new WorldError("This request identity has different original details.", 409);
  return old;
}
/** Separate administrative decision. Never content editing or owner impersonation. */
export async function changeWorldCanon(userId: string, worldId: string, input: unknown) {
  const command = worldCanonCommandSchema.parse(input);
  return db.transaction(async tx => {
    if (!(await worldActor(userId, tx)).admin) throw new WorldError("Only an Administrator may mark a World as canon.", 403);
    if (!await collaborationAvailable(tx)) throw new WorldError("Migration 0159 is required for canon management.", 503);
    const [parent] = await tx.select().from(world).where(eq(world.id, worldId)).for("update");
    if (!parent) throw worldUnavailable();
    await currentSession(tx, userId);
    const old = await exactReceipt(tx, worldId, userId, command.requestId, command);
    if (old) return old.result;
    const before = await readWorldCanon(tx, worldId);
    if (before.revision !== command.revision) throw new WorldError("Canon status changed. Load its current revision before deciding again.", 409);
    if (parent.archivedAt && command.isCanon) throw new WorldError("Restore this World before marking it as canon.", 400);
    if(command.isCanon)await assertWorldSourceUse(tx,worldId,["display","customer-access","editable-data"],true);
    const after = { isCanon: command.isCanon, revision: before.revision + 1, note: command.note }, now = await databaseClock(tx);
    await tx.update(leases).set({ fence: sql`${leases.fence}+1`, holderId: null, sessionId: null, clientId: null, tokenHash: null, expiresAt: null, updatedAt: now }).where(eq(leases.worldId, worldId));
    await tx.insert(audit).values({ id: randomUUID(), worldId, actorId: userId, action: "world-canon", requestId: command.requestId, inputHash: editorTokenHash(JSON.stringify(command)), outcome: "accepted", before, after, result: after, createdAt: now });
    if (!(await worldActor(userId, tx)).admin) throw new WorldError("Administrator access changed.", 403);
    await currentSession(tx, userId);
    return after;
  });
}

/** Signed-in, ordinary-content catalog. No protected notes, counts, or Campaign links. */
export async function canonWorldPage(userId: string, input: unknown = {}) {
  const query = z.object({ offset: z.coerce.number().int().min(0).max(1000000).default(0), search: z.string().trim().max(160).default("") }).parse(input);
  await worldActor(userId);
  if (!await collaborationAvailable()) return { worlds: [] as CanonWorldCard[], hasMore: false };
  // Keep the outer reference qualified inside the correlated subquery. Drizzle
  // unqualifies Column chunks in a single-table SELECT, where bare id would
  // otherwise resolve to the inner audit row instead of the outer World.
  const predicate = worldCanonStateSql(sql`"world"."id"`);
  const rows = await db.select({ id: world.id, name: world.name, description: world.description, ownerName: user.name, state: predicate }).from(world).innerJoin(user, eq(user.id, world.ownerId)).where(and(sql`(${predicate}->>'isCanon')::boolean`, sql`${world.archivedAt} is null`, query.search ? sql`${world.name} ilike ${query.search.replace(/[\\%_]/g,"\\$&")+"%"} escape chr(92)` : undefined)).orderBy(world.name, world.id).limit(51).offset(query.offset);
  const worlds: CanonWorldCard[] = [];
  const currentStates=rows.length?await db.select({id:world.id,state:predicate}).from(world).where(and(inArray(world.id,rows.map(row=>row.id)),sql`${world.archivedAt} is null`)):[];
  for (const row of rows.slice(0,50)) {
    const state = row.state as { revision: number };
    const current = currentStates.find(value=>value.id===row.id)?.state as {isCanon:boolean;revision:number}|undefined;
    if (current?.isCanon && current.revision === state.revision){
      try{await assertWorldSourceUse(db,row.id,["display","customer-access"],true);}catch(error){if(error instanceof WorldError&&error.status===409)continue;throw error;}
      worlds.push({ id: row.id, name: row.name, description: row.description, ownerName: row.ownerName, revision: state.revision });
    }
  }
  await worldActor(userId);
  return { worlds, hasMore: rows.length > 50 };
}

/** Preparation is durable and private. The final transaction creates the World,
 * independent native heads/history and the exact receipt together. */
export async function createPersonalCanonWorld(userId: string, worldId: string, input: unknown, options:{editableGeography?:boolean}={editableGeography:true}):Promise<PersonalCanonResult> {
  const command = personalCanonWorldSchema.parse(input);
  await worldActor(userId);
  return db.transaction(async tx => {
    await tx.select({ id: world.id }).from(world).where(eq(world.id, worldId)).for("update");
    await currentSession(tx, userId);
    await worldActor(userId, tx);
    const old = await exactReceipt(tx, worldId, userId, command.requestId, command);
    if (old) return old.result as { id: string };
    const source = await authorizeWorldRead(userId, worldId, false, "overview", tx, true);
    await assertWorldSourceUse(tx,worldId,["display","modify","customer-access","editable-data"],true);
    if (!source.permission.canon || source.permission.canonRevision !== command.revision) throw new WorldError("This canon source changed or is no longer available. Reload it before creating a personal World.", 409);
    if(!options.editableGeography)throw new WorldError("Refresh Worlds before creating inherited geography. Your original request is retained.",409);
    if(!await canonCopyAvailable(tx))throw new WorldError("Migration 0160 is required to prepare an editable personal geography. Your original request is retained.",503);
    let [job]=await tx.select().from(worldCanonCopy).where(eq(worldCanonCopy.requestId,command.requestId)).for("update");
    const inputHash=editorTokenHash(JSON.stringify(command)),sourceTimeline=await selectedTimeline(tx,worldId);
    if(job&&(job.actorId!==userId||job.sourceWorldId!==worldId||job.inputHash!==inputHash))throw new WorldError("This request identity has different original details.",409);
    if(!job){
      [job]=await tx.insert(worldCanonCopy).values({requestId:command.requestId,sourceWorldId:worldId,actorId:userId,inputHash,targetWorldId:randomUUID(),targetTimelineId:randomUUID()}).returning();
      await tx.insert(worldCanonCopyIdentity).values([{requestId:job.requestId,sourceId:worldId,targetId:job.targetWorldId},{requestId:job.requestId,sourceId:sourceTimeline.id,targetId:job.targetTimelineId}]);
      const history=await effectiveHistory(tx,worldId,sourceTimeline,true);
      await registerCanonIdentities(tx,job.requestId,[...history.eras,...history.entries].filter(record=>!record.archived).map(record=>record.id));
    }
    const pending=await prepareCanonGeography(tx,job,source.permission);
    if(pending){await worldActor(userId,tx);await currentSession(tx,userId);return pending;}
    const id = job.targetWorldId, now = await databaseClock(tx);
    await tx.insert(world).values({ id, ownerId: userId, name: command.name, description: source.description, introduction: source.introduction, historicalOverview: source.historicalOverview, tone: source.tone });
    const targetTimeline = await selectedTimeline(tx, id);
    const history = await effectiveHistory(tx, worldId, sourceTimeline, true), eraIds = new Map<string,string>();
    const historyIds=await canonIdentityMap(tx,job.requestId,[...history.eras,...history.entries].map(record=>record.id));
    for (const era of history.eras.filter(era=>!era.archived)) {
      const eraId = historyIds.get(era.id)!; eraIds.set(era.id,eraId);
      const copied = { ...era, id: eraId, worldId: id, revision: 1, datingSystemId: null, sourceDating: undefined, datingSystemRevision: undefined, historyContext: undefined };
      await tx.insert(worldEra).values({ id:eraId, worldId:id, timelineId:targetTimeline.id, name:era.name, description:era.description, startYear:era.startYear, endYear:era.endYear, tone:era.tone });
      await capturePrimaryVersion(tx,targetTimeline.id,copied);
    }
    for (const entry of history.entries.filter(entry=>!entry.archived)) {
      const entryId = historyIds.get(entry.id)!, copied = { ...entry, id:entryId, worldId:id, revision:1, notes:"", visibility:undefined, datingSystemId:null, sourceDating:undefined, datingSystemRevision:undefined, calendarSource:null, historyContext:undefined, eraIds:entry.eraIds.flatMap(eraId=>eraIds.has(eraId)?[eraIds.get(eraId)!]:[]) };
      await tx.insert(worldEntry).values({ id:entryId, worldId:id, timelineId:targetTimeline.id, title:entry.title, account:entry.account, notes:"", time:entry.time, accuracy:entry.accuracy, narrative:entry.narrative, eventType:entry.eventType, prominence:entry.prominence });
      if(copied.eraIds.length)await tx.insert(worldEntryEra).values(copied.eraIds.map(eraId=>({worldId:id,entryId,eraId})));
      await capturePrimaryVersion(tx,targetTimeline.id,copied);
    }
    const geographyFeatures=await acceptCanonGeography(tx,job,targetTimeline.id);
    for(const use of (await worldRightsSources(tx,worldId)).usages)await recordSourceUse(tx,id,use.sourceId,"inherited-world",worldId,use.version,`Inherited source use: ${use.note}`);
    const reference: CanonSource = { worldId, name: source.name, canonRevision: command.revision, worldRevision: source.revision, geography:"independent-native-v1" };
    await tx.insert(audit).values([
      { id: randomUUID(), worldId, actorId: userId, action: "canon-personal-world", requestId: command.requestId, inputHash: editorTokenHash(JSON.stringify(command)), outcome: "accepted", before: null, after: { personalWorldId: id, ...reference }, result: { id }, createdAt: now },
      { id: randomUUID(), worldId: id, actorId: userId, action: "canon-source", requestId: command.requestId, inputHash: editorTokenHash(JSON.stringify(command)), outcome: "accepted", before: null, after: { ...reference, geographyFeatures, primaryTimelineId: sourceTimeline.id, historySources: [...history.eras,...history.entries].filter(record=>!record.archived).map(record=>({id:record.id,versionId:record.historyContext?.versionId??null})) }, result: { id }, createdAt: now },
    ]);
    await worldActor(userId, tx);
    await currentSession(tx, userId);
    return { id };
  });
}

export async function personalWorldCanonSource(userId: string, worldId: string): Promise<CanonSource | null> {
  await authorizeWorldRead(userId, worldId, worldRequestAuthority()?.review, "overview");
  if (!await collaborationAvailable()) return null;
  const [record] = await db.select({ source: audit.after }).from(audit).where(and(eq(audit.worldId, worldId), eq(audit.action, "canon-source"))).limit(1);
  if(!record)return null;
  const source=record.source as CanonSource;
  return {worldId:source.worldId,name:source.name,canonRevision:source.canonRevision,worldRevision:source.worldRevision,...source.geography?{geography:source.geography}:{}};
}

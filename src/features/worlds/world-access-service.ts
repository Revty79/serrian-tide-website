import "server-only";
import { worldCanonStateSql, type WorldCanonState } from "./world-canon-state";
import {retainedWorldSourceRead} from "./world-retained-source-authority";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { session } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { world } from "@/db/world-schema";
import { worldAccessAudit, worldEditorLease, worldParticipant } from "@/db/world-collaboration-schema";
import { WorldError, worldUnavailable } from "./world-errors";
import { worldRequestAuthority } from "./world-authorization-context";
import { hasWorldScope, worldScopes, type WorldEditorProof, type WorldOperationScope, type WorldPermission, type WorldScope } from "./world-permissions";

export type WorldTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type WorldConnection = typeof db | WorldTransaction;
export type AuthorizedWorld = typeof world.$inferSelect & { permission: WorldPermission };
export const editorTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function sameEditorToken(token: string, digest: string | null): boolean {
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) return false;
  return timingSafeEqual(Buffer.from(editorTokenHash(token), "hex"), Buffer.from(digest, "hex"));
}
export async function collaborationAvailable(connection: Pick<WorldConnection, "execute"> = db) {
  const result = await connection.execute<{ available: boolean }>(sql`select to_regclass('public.world_access_participant') is not null and to_regclass('public.world_access_invitation') is not null and to_regclass('public.world_editor_lease') is not null and to_regclass('public.world_access_audit') is not null available`);
  return !!result.rows[0]?.available;
}
export async function databaseClock(connection: Pick<WorldConnection, "execute">): Promise<Date> {
  const result = await connection.execute<{ clock: Date | string }>(sql`select clock_timestamp() as clock`);
  return new Date(result.rows[0].clock);
}
export async function worldActor(userId: string, connection: WorldConnection = db) {
  const authority = worldRequestAuthority();
  if (authority && authority.userId !== userId) throw worldUnavailable();
  const roles = (await connection.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId))).map(row => row.role);
  if (!roles.some(role => ["god", "admin", "player"].includes(role))) throw new WorldError("This account is not eligible to access Worlds.", 403);
  return { userId, roles, admin: roles.includes("admin"), canCreate: roles.includes("god") || roles.includes("admin") };
}
export async function requireWorldCreator(userId: string) {
  const actor = await worldActor(userId);
  if (!actor.canCreate) throw new WorldError("G.O.D. or administrator access is required to create Worlds.", 403);
  return actor;
}
export async function activeWorldSession(connection: WorldConnection, userId: string, sessionId: string, now: Date) {
  return !!(await connection.select({ id: session.id }).from(session).where(and(eq(session.id, sessionId), eq(session.userId, userId), sql`${session.expiresAt} at time zone 'UTC' > ${now.toISOString()}::timestamptz`)).limit(1)).length;
}
export async function editorLeaseAlive(connection: WorldConnection, parent: typeof world.$inferSelect, lease: typeof worldEditorLease.$inferSelect | undefined, now: Date) {
  if (!lease?.holderId || !lease.sessionId || !lease.expiresAt || lease.expiresAt <= now || parent.archivedAt) return false;
  if (!await activeWorldSession(connection, lease.holderId, lease.sessionId, now)) return false;
  const roles = await connection.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, lease.holderId));
  if (!roles.some(row=>["god","admin","player"].includes(row.role))) return false;
  if (lease.holderId === parent.ownerId) return true;
  const [grant] = await connection.select().from(worldParticipant).where(and(eq(worldParticipant.worldId, parent.id), eq(worldParticipant.userId, lease.holderId)));
  return grant?.state === "active" && grant.role === "editor";
}
export function editorProofMatches(lease: typeof worldEditorLease.$inferSelect, userId: string, sessionId: string, proof: WorldEditorProof | null | undefined, requireFence = true) {
  return !!proof && lease.holderId === userId && lease.sessionId === sessionId && lease.clientId === proof.clientId && (!requireFence || lease.fence === proof.fence) && sameEditorToken(proof.token, lease.tokenHash);
}
export async function authorizeWorldRead(userId: string, worldId: string, review = false, requested: WorldOperationScope | readonly WorldOperationScope[] = "owner", connection: WorldConnection = db, fresh=false): Promise<AuthorizedWorld> {
  const retained=retainedWorldSourceRead(worldId,userId);if(retained)return retained;
  const authority=worldRequestAuthority(),scopes=typeof requested==="string"?[requested]:requested,cached=authority?.reads.get(worldId);
  if(connection===db&&!fresh&&authority?.userId===userId&&cached?.row&&review===(cached.permission.role==="administrator-review")){
    for(const scope of scopes)if(!hasWorldScope(cached.permission,scope))throw worldUnavailable();
    for(const scope of scopes)cached.scopes.add(scope);return{...cached.row,permission:cached.permission};
  }
  const actor = await worldActor(userId, connection);
  if (!/^[0-9a-f-]{36}$/i.test(worldId)) throw worldUnavailable();
  if (review && !actor.admin) throw new WorldError("Administrator review requires administrator access.", 403);
  const available = await collaborationAvailable(connection);
  const [record] = await connection.select({ parent:world, canon:available?worldCanonStateSql(sql`"world"."id"`):sql<WorldCanonState>`'{"isCanon":false,"revision":0}'::jsonb` }).from(world).where(eq(world.id, worldId)).limit(1);
  if (!record) throw worldUnavailable();
  const {parent,canon}=record;
  let permission: WorldPermission;
  if (review && actor.admin) permission = { actorId:userId,role: "administrator-review", scopes: [...worldScopes], protectedContent: true, canEdit: false, canCreateWorld: actor.canCreate, grantRevision: null };
  else if (parent.ownerId === userId) permission = { actorId:userId,role: "owner", scopes: [...worldScopes], protectedContent: true, canEdit: !parent.archivedAt && !authority, canCreateWorld: actor.canCreate, grantRevision: null };
  else {
    if (!authority) throw worldUnavailable();
    const [participant] = available ? await connection.select().from(worldParticipant).where(and(eq(worldParticipant.worldId, worldId), eq(worldParticipant.userId, userId))).limit(1) : [];
    const grant=participant?.state==="active"?participant:undefined;
    if (parent.archivedAt || !grant && !canon.isCanon) throw worldUnavailable();
    // Canon has one ordinary, read-only audience for every Player. Retain the
    // private invitation settings for withdrawal; never expand a narrow
    // protected grant across the whole published World.
    permission = grant && !canon.isCanon
      ? { actorId:userId,role: grant.role as "editor" | "viewer", scopes: grant.scopes, protectedContent: grant.protectedContent, canEdit: false, canCreateWorld: actor.canCreate, grantRevision: grant.revision }
      : { actorId:userId,role:"viewer",scopes:worldScopes.filter(scope=>scope!=="campaigns"),protectedContent:false,canEdit:false,canCreateWorld:actor.canCreate,grantRevision:participant?.revision??0 };
  }
  if (canon.revision) permission = { ...permission, canon: canon.isCanon, canonRevision: canon.revision };
  if (canon.isCanon) permission.canEdit = false;
  for (const scope of scopes) if (!hasWorldScope(permission, scope)) throw worldUnavailable();
  if (available && !canon.isCanon && authority?.proof && !review && !authority.review && permission.role !== "viewer") {
    const [lease] = await connection.select().from(worldEditorLease).where(eq(worldEditorLease.worldId, worldId));
    const now = await databaseClock(connection);
    permission.canEdit = !!lease && editorProofMatches(lease, userId, authority.sessionId, authority.proof) && await editorLeaseAlive(connection, parent, lease, now);
  }
  if (authority) {
    const used = authority.reads.get(worldId);
    authority.reads.set(worldId, { scopes: new Set([...(used?.scopes ?? []), ...scopes]), permission,row:parent });
  }
  return { ...parent, permission };
}
export function worldContentEditor(parent: AuthorizedWorld, userId: string): boolean {
  void userId;
  return parent.permission.canEdit && !parent.archivedAt;
}
export function worldScopeAllowed(worldId: string, scope: WorldScope): boolean {
  if(retainedWorldSourceRead(worldId))return true;
  const used = worldRequestAuthority()?.reads.get(worldId);
  return !used || used.permission.scopes.includes(scope);
}
export function worldProtectedContent(worldId: string): boolean {
  if(retainedWorldSourceRead(worldId))return true;
  return worldRequestAuthority()?.reads.get(worldId)?.permission.protectedContent ?? true;
}
export function worldOrdinaryContent(worldId: string, requested = false): boolean { return requested || !worldProtectedContent(worldId); }
export async function lockWorldForWrite(tx: WorldTransaction, userId: string, worldId: string, scope: WorldOperationScope | readonly WorldOperationScope[] = "owner", allowArchived = false): Promise<AuthorizedWorld> {
  if(retainedWorldSourceRead(worldId,userId))throw new WorldError("Retained source construction is read-only.",403);
  const [locked] = await tx.select().from(world).where(eq(world.id, worldId)).for("update");
  if (!locked) throw worldUnavailable();
  const access = await authorizeWorldRead(userId, worldId, false, scope, tx);
  if (access.permission.canon) throw new WorldError("This canon World is locked. Create a personal World to author your own maps and stories.", 403);
  if (access.archivedAt && !allowArchived) throw new WorldError("Restore this World before editing.", 400);
  if (access.permission.role === "viewer" || access.permission.role === "administrator-review") throw new WorldError("This World access is read-only.", 403);
  const authority = worldRequestAuthority();
  if (authority?.review) throw new WorldError("Administrator review is read-only.", 403);
  if (!await collaborationAvailable(tx)) {
    if (authority || access.ownerId !== userId) throw new WorldError("Migration 0159 is required for safe World editing. Existing work is retained.", 503);
    return access;
  }
  const [lease] = await tx.select().from(worldEditorLease).where(eq(worldEditorLease.worldId, worldId));
  const now = await databaseClock(tx);
  if (!authority) {
    // Trusted internal owner operations remain serialized by the same World
    // lock. They cannot run through an active browser editing lease.
    if (access.ownerId !== userId || await editorLeaseAlive(tx, locked, lease, now)) throw new WorldError("Another editing session holds this World. Your work is retained.", 409);
    return access;
  }
  if (!lease || !editorProofMatches(lease, userId, authority.sessionId, authority.proof) || !await editorLeaseAlive(tx, locked, lease, now)) throw new WorldError("Editing control changed or expired. Your draft is retained. Request control and load the latest accepted state before saving.", 409);
  return access;
}
export async function authorizedWorldWrite<T>(userId: string, worldId: string, run: (tx: WorldTransaction, parent: AuthorizedWorld) => Promise<T>, scope: WorldOperationScope | readonly WorldOperationScope[] = "owner"): Promise<T> {
  return db.transaction(async tx => {
    const parent = await lockWorldForWrite(tx, userId, worldId, scope);
    const result = await run(tx, parent);
    await finishWorldContentWrite(tx,userId,worldId,scope,result);
    return result;
  });
}
export async function finishWorldContentWrite(tx:WorldTransaction,userId:string,worldId:string,scope:WorldOperationScope|readonly WorldOperationScope[],result?:unknown){
  if (await collaborationAvailable(tx)) {
      await tx.update(world).set({updatedAt:await databaseClock(tx)}).where(eq(world.id,worldId));
      const requestId = worldRequestAuthority()?.operationId ?? randomUUID();
      await tx.insert(worldAccessAudit).values({ id: randomUUID(), worldId, actorId: userId, action: "content-write", requestId, inputHash: editorTokenHash(JSON.stringify(scope)), outcome: "accepted", before: null, after: { scopes: scope, contributions:worldRequestAuthority()?.contributions?.filter(value=>value.worldId===worldId).map(({worldId:_,...value})=>{void _;return value;}),resource:contentReceipt(result) }, result: { saved: true },createdAt:await databaseClock(tx) }).onConflictDoNothing();
    }
    // Check again after slow work: an expired session or lease cannot commit
    // merely because it was valid before a long operation began.
    await lockWorldForWrite(tx, userId, worldId, scope);

}
export async function revalidateWorldResponse() {
  const authority = worldRequestAuthority();
  if (!authority) return;
  const reads = [...authority.reads.entries()].map(([id, used]) => ({ id, scopes: [...used.scopes], permission: { ...used.permission } }));
  for (const used of reads) {
    const current = await authorizeWorldRead(authority.userId, used.id, used.permission.role === "administrator-review", used.scopes,db,true);
    if (current.permission.grantRevision !== used.permission.grantRevision || current.permission.protectedContent !== used.permission.protectedContent || current.permission.canonRevision !== used.permission.canonRevision) throw worldUnavailable();
  }
  if (!await activeWorldSession(db, authority.userId, authority.sessionId, await databaseClock(db))) throw new WorldError("Sign in again. Your local draft is retained.", 401);
}


/** Attribution receipts retain canonical identities/counters, never content or credentials. */
function contentReceipt(value:unknown):Record<string,string|number>|string|null{if(typeof value==="string"&&/^[a-f0-9-]{36}$/i.test(value))return value;if(!value||typeof value!=="object"||Array.isArray(value))return null;const safe:Record<string,string|number>={};for(const [key,entry]of Object.entries(value))if((key==="id"||key.endsWith("Id")||key.toLowerCase().endsWith("revision"))&&(typeof entry==="string"&&/^[a-f0-9-]{36}$/i.test(entry)||typeof entry==="number"&&Number.isSafeInteger(entry)))safe[key]=entry;return safe;}

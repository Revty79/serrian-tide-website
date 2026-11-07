import "server-only";
import { readWorldCanon } from "./world-canon-state";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { userRole } from "@/db/authorization-schema";
import { world } from "@/db/world-schema";
import { worldAccessAudit as audit, worldEditorLease as leases, worldInvitation as invitations, worldParticipant as participants } from "@/db/world-collaboration-schema";
import { activeWorldSession, authorizeWorldRead, collaborationAvailable, databaseClock, editorLeaseAlive, editorProofMatches, editorTokenHash, worldActor, type WorldTransaction } from "./world-access-service";
import { worldRequestAuthority } from "./world-authorization-context";
import { WorldError, worldUnavailable } from "./world-errors";
import { WORLD_LEASE_SECONDS, WORLD_PARTICIPANT_LIMIT, WORLD_PENDING_INVITATION_LIMIT, type WorldEditorProof } from "./world-permissions";
import { administratorWorldReviewSchema, collaborationCommandSchema, invitationDecisionSchema, type WorldAccessAuditView, type WorldCollaborationView, type WorldInvitationView, type WorldParticipantView } from "./world-collaboration";

const managementActions = new Set(["invite", "permissions", "revoke", "withdraw", "approve-control", "reclaim-control"]);
const hash = (value: unknown) => editorTokenHash(JSON.stringify(value));
function authorityFor(userId: string) {
  const authority = worldRequestAuthority();
  if (!authority || authority.userId !== userId || authority.review) throw new WorldError("Use your signed-in account outside Administrator review for this action.", 403);
  return authority;
}
async function requireTables(tx: WorldTransaction) {
  if (!await collaborationAvailable(tx)) throw new WorldError("Migration 0159 is required for World sharing. Existing Worlds remain private.", 503);
}
async function lockWorld(tx: WorldTransaction, worldId: string) {
  const [parent] = await tx.select().from(world).where(eq(world.id, worldId)).for("update");
  if (!parent) throw worldUnavailable();
  return parent;
}
const participantState = (grant: typeof participants.$inferSelect) => ({ userId: grant.userId, role: grant.role, scopes: grant.scopes, protectedContent: grant.protectedContent, state: grant.state, revision: grant.revision });
function participantView(row: { grant: typeof participants.$inferSelect; account: { name: string; username: string | null } }): WorldParticipantView {
  return { ...participantState(row.grant), role: row.grant.role as "viewer" | "editor", name: row.account.name, username: row.account.username, requestedAt: row.grant.requestedAt?.toISOString() ?? null, controlRequestId: row.grant.controlRequestId };
}
function invitationView(row: typeof invitations.$inferSelect, worldName: string, ownerName: string, now: Date): WorldInvitationView {
  return { id: row.id, worldId: row.worldId, worldName, ownerName, role: row.role as "viewer" | "editor", scopes: row.scopes, protectedContent: row.protectedContent, state: row.state === "pending" && row.expiresAt <= now ? "expired" : row.state, revision: row.revision, expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString() };
}
async function invalidateHolder(tx: WorldTransaction, worldId: string, targetId?: string) {
  await tx.update(leases).set({ fence: sql`${leases.fence}+1`, holderId: null, sessionId: null, clientId: null, tokenHash: null, expiresAt: null, updatedAt: new Date() }).where(and(eq(leases.worldId, worldId), targetId ? eq(leases.holderId, targetId) : undefined));
}
async function storeLease(tx: WorldTransaction, worldId: string, userId: string, sessionId: string, proof: WorldEditorProof, now: Date) {
  await tx.insert(leases).values({ worldId, fence: 1, holderId: userId, sessionId, clientId: proof.clientId, tokenHash: editorTokenHash(proof.token), expiresAt: new Date(now.getTime() + WORLD_LEASE_SECONDS * 1000), updatedAt: now }).onConflictDoUpdate({ target: leases.worldId, set: { fence: sql`${leases.fence}+1`, holderId: userId, sessionId, clientId: proof.clientId, tokenHash: editorTokenHash(proof.token), expiresAt: new Date(now.getTime() + WORLD_LEASE_SECONDS * 1000), updatedAt: now } });
}
async function receipt(tx: WorldTransaction, worldId: string, actorId: string, requestId: string, command: unknown) {
  const [previous] = await tx.select().from(audit).where(and(eq(audit.worldId, worldId), eq(audit.actorId, actorId), eq(audit.requestId, requestId)));
  if (!previous) return null;
  if (previous.inputHash !== hash(command)) throw new WorldError("That request identity already belongs to different access details. Review the current state before trying again.", 409);
  return previous;
}
async function writeAudit(tx: WorldTransaction, values: { worldId: string; actorId: string; requestId: string; command: unknown; action: string; targetId?: string | null; before?: unknown; after?: unknown; result: unknown; outcome?: "accepted" | "denied" }) {
  const { command, ...fields } = values;
  await tx.insert(audit).values({ id: randomUUID(), ...fields, targetId: values.targetId ?? null, before: values.before ?? null, after: values.after ?? null, inputHash: hash(command), outcome: values.outcome ?? "accepted",createdAt:await databaseClock(tx) });
}
/** Archive is owner management, never a collaborator content write. */
export async function changeWorldLifecycle(userId:string,worldId:string,action:"archive"|"restore",revision:number){
  const authority=worldRequestAuthority();if(authority&&(authority.userId!==userId||authority.review))throw new WorldError("World archive settings require the actual owner's normal management context.",403);
  await db.transaction(async tx=>{
    const available=await collaborationAvailable(tx);if(authority&&!available)await requireTables(tx);
    const parent=await lockWorld(tx,worldId);
    if(available&&(await readWorldCanon(tx,worldId)).isCanon)throw new WorldError("An Administrator must remove canon status before this World can be archived or restored.",403);
    await authorizeWorldRead(userId,worldId,false,"owner",tx,true);
    if(parent.revision!==revision)throw new WorldError("This World changed. Reload its current revision before changing its archive status.",409);
    const now=await databaseClock(tx);
    if(authority&&!await activeWorldSession(tx,userId,authority.sessionId,now))throw new WorldError("Sign in again. Your draft is retained.",401);
    await tx.update(world).set({archivedAt:action==="archive"?now:null,revision:revision+1,updatedAt:now}).where(eq(world.id,worldId));
    if(available){await invalidateHolder(tx,worldId);await writeAudit(tx,{worldId,actorId:userId,requestId:authority?.operationId??randomUUID(),command:{action,revision},action:`world-${action}`,before:{archived:!!parent.archivedAt,revision},after:{archived:action==="archive",revision:revision+1},result:{saved:true}});}
  });
}

function previousError(result: unknown): WorldError | null {
  if (result && typeof result === "object" && "error" in result && "status" in result && typeof result.error === "string" && typeof result.status === "number") return new WorldError(result.error, result.status);
  return null;
}

export async function worldInvitationInbox(userId: string): Promise<WorldInvitationView[]> {
  await worldActor(userId);
  if (!await collaborationAvailable()) return [];
  const rows = await db.select({ invitation: invitations, worldName: invitations.worldName, ownerName: invitations.inviterName }).from(invitations).where(eq(invitations.inviteeId, userId)).orderBy(sql`case when ${invitations.state}='pending' and ${invitations.expiresAt}>clock_timestamp() then 0 else 1 end`,desc(invitations.createdAt), desc(invitations.id)).limit(200);
  const now = await databaseClock(db);
  return rows.map(row => invitationView(row.invitation, row.worldName, row.ownerName, now));
}
export async function hasWorldsInvitationAccess(userId: string): Promise<boolean> {
  if (!await collaborationAvailable()) return false;
  const result = await db.execute<{ allowed: boolean }>(sql`select exists(select 1 from world_access_invitation i where i.invitee_id=${userId} and i.state='pending' and i.expires_at>clock_timestamp()) or exists(select 1 from world_access_participant p join world w on w.id=p.world_id where p.user_id=${userId} and p.state='active' and w.archived_at is null) or exists(select 1 from world w where w.owner_id=${userId}) or exists(select 1 from world w where w.archived_at is null and coalesce((select (a.after_state->>'isCanon')::boolean from world_access_audit a where a.world_id=w.id and a.action='world-canon' and a.outcome='accepted' order by (a.after_state->>'revision')::integer desc limit 1),false)) as allowed`);
  return !!result.rows[0].allowed;
}
export async function getWorldCollaboration(userId: string, worldId: string, review = false, details = false): Promise<WorldCollaborationView> {
  const parent = await authorizeWorldRead(userId, worldId, review, "shell"), available = await collaborationAvailable(), manager = parent.permission.role === "owner" || parent.permission.role === "administrator-review";
  const base: WorldCollaborationView = { worldId, worldName: parent.name, ownerId: parent.ownerId, permission: parent.permission, archived: !!parent.archivedAt, canManage: parent.permission.role === "owner" && !review, available, editor: { holder: null, expiresAt: null, fence: null, yours: false, available: false, requestPending: false }, participants: [], invitations: [], pendingControlRequests: [] };
  if (!available) return base;
  const now = await databaseClock(db), [lease] = await db.select().from(leases).where(eq(leases.worldId, worldId));
  const alive = !parent.permission.canon && await editorLeaseAlive(db, parent, lease, now), authority = worldRequestAuthority(), yours = !!lease && !!authority && editorProofMatches(lease, userId, authority.sessionId, authority.proof, false) && alive;
  const [holder] = alive && lease?.holderId ? await db.select({ userId: user.id, name: user.name, username: user.username }).from(user).where(eq(user.id, lease.holderId)) : [];
  const grants = await db.select({ grant: participants, account: { name: user.name, username: user.username } }).from(participants).innerJoin(user, eq(user.id, participants.userId)).where(and(eq(participants.worldId, worldId), manager && details ? undefined : eq(participants.userId, userId))).limit(WORLD_PARTICIPANT_LIMIT);
  base.editor = { holder: holder ?? null, expiresAt: alive ? lease!.expiresAt!.toISOString() : null, fence: yours ? lease!.fence : null, yours, available: !parent.permission.canon && !alive && !parent.archivedAt && !review && parent.permission.role !== "viewer", requestPending: grants.some(row => row.grant.userId === userId && !!row.grant.controlRequestId) };
  base.permission = { ...parent.permission, canEdit: yours && !review };
  if (manager && details) {
    base.participants = grants.map(participantView);
    const invited = await db.select({ invitation: invitations, name: user.name, username: user.username }).from(invitations).innerJoin(user, eq(user.id, invitations.inviteeId)).where(eq(invitations.worldId, worldId)).orderBy(sql`case when ${invitations.state}='pending' and ${invitations.expiresAt}>clock_timestamp() then 0 else 1 end`,desc(invitations.createdAt), desc(invitations.id)).limit(200);
    base.invitations = invited.map(row => ({ ...invitationView(row.invitation, parent.name, "", now), inviteeName: row.name, inviteeUsername: row.username }));
  }
  if (manager) {
    const requests = details ? grants : await db.select({ grant: participants, account: { name: user.name, username: user.username } }).from(participants).innerJoin(user, eq(user.id, participants.userId)).where(and(eq(participants.worldId, worldId), eq(participants.state, "active"), sql`${participants.controlRequestId} is not null`, gt(participants.requestedAt, new Date(now.getTime() - 600_000)))).limit(20);
    base.pendingControlRequests = requests.filter(row => row.grant.state === "active" && row.grant.role === "editor" && row.grant.controlRequestId && row.grant.requestedAt && row.grant.requestedAt.getTime() > now.getTime() - 600_000).map(participantView);
  }
  return base;
}
export async function changeWorldCollaboration(userId: string, worldId: string, input: unknown) {
  const command = collaborationCommandSchema.parse(input), authority = authorityFor(userId);
  const outcome = await db.transaction(async tx => {
    await requireTables(tx);
    // Serialize the protected exact-username workflow across all of this
    // actor's Worlds, so simultaneous Worlds cannot bypass its rate limit.
    if (command.action === "invite") await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'world-invitation:'+userId},0))`);
    await lockWorld(tx, worldId);
    const parent = await authorizeWorldRead(userId, worldId, false, managementActions.has(command.action) ? "owner" : "shell", tx), now = await databaseClock(tx);
    if (!await activeWorldSession(tx, userId, authority.sessionId, now)) throw new WorldError("Sign in again. Your draft is retained.", 401);
    if (parent.permission.role === "viewer") throw new WorldError("Viewer access cannot change sharing or editing control.", 403);
    const previous = await receipt(tx, worldId, userId, command.requestId, command);
    if (previous) return previous.result;
    if(parent.permission.canon&&["acquire-control","renew-control","request-control","approve-control","reclaim-control"].includes(command.action))throw new WorldError("Canon Worlds are locked. Create a personal World for your own maps and stories.",403);
    let targetId: string | null = null, before: unknown = null, after: unknown = null, result: object = { saved: true };
    try {
      if (parent.archivedAt && !["revoke", "withdraw", "release-control"].includes(command.action)) throw new WorldError("Restore this World before inviting participants or starting editing.", 400);
      if (command.action === "invite") {
        const recent = await tx.select({ n: sql<number>`count(*)::int` }).from(audit).where(and(eq(audit.actorId, userId), eq(audit.action, "invite"), gt(audit.createdAt, new Date(now.getTime() - 3_600_000))));
        if (recent[0].n >= 20) throw new WorldError("Too many invitation attempts. Try again in an hour.", 429);
        const [target] = await tx.select({ id: user.id }).from(user).where(sql`lower(${user.username})=${command.username.toLowerCase()}`).limit(1).for("update");
        if (!target || target.id === parent.ownerId || !(await tx.select().from(userRole).where(and(eq(userRole.userId, target.id), inArray(userRole.role, ["god", "player", "admin"])))).length) throw new WorldError("The invitation could not be created. Check the exact registered username and account eligibility.", 400);
        targetId = target.id;
        const [inboxPending]=await tx.select({n:sql<number>`count(*)::int`}).from(invitations).where(and(eq(invitations.inviteeId,target.id),eq(invitations.state,"pending"),gt(invitations.expiresAt,now)));if(inboxPending.n>=200)throw new WorldError("The invitation could not be created. This account needs to resolve its pending invitations first.",429);
        const [existing] = await tx.select().from(participants).where(and(eq(participants.worldId, worldId), eq(participants.userId, target.id)));
        if (existing && existing.state !== "revoked") throw new WorldError("This participant already has access settings. Use Manage Permissions.", 409);
        await tx.update(invitations).set({ state: "expired", resolvedAt: now, revision: sql`${invitations.revision}+1` }).where(and(eq(invitations.worldId, worldId), eq(invitations.state, "pending"), sql`${invitations.expiresAt}<=${now}`));
        const pending = await tx.select({ n: sql<number>`count(*)::int` }).from(invitations).where(and(eq(invitations.worldId, worldId), eq(invitations.state, "pending")));
        if (pending[0].n >= WORLD_PENDING_INVITATION_LIMIT) throw new WorldError("This World has 100 pending invitations. Resolve or withdraw invitations first.", 413);
        const duplicate = await tx.select({ id: invitations.id }).from(invitations).where(and(eq(invitations.worldId, worldId), eq(invitations.inviteeId, target.id), eq(invitations.state, "pending")));
        if (duplicate.length) throw new WorldError("An invitation is already pending for this account.", 409);
        const id = randomUUID();
        const [inviter]=await tx.select({name:user.name}).from(user).where(eq(user.id,userId));
        await tx.insert(invitations).values({ id, worldId, worldName:parent.name, inviterName:inviter.name, inviterId: userId, inviteeId: target.id, role: command.role, scopes: command.scopes, protectedContent: command.protectedContent, expiresAt: new Date(now.getTime() + 7*86_400_000), createdAt: now });
        after = { invitationId: id, inviteeId: target.id, role: command.role, scopes: command.scopes, protectedContent: command.protectedContent, state: "pending" }; result = { saved: true, invitationId: id };
      } else if (command.action === "permissions" || command.action === "revoke") {
        const [grant] = await tx.select().from(participants).where(and(eq(participants.worldId, worldId), eq(participants.userId, command.userId)));
        if (!grant || grant.state === "revoked" || grant.revision !== command.revision) throw new WorldError("These access settings changed. Reload before saving permissions.", 409);
        targetId = grant.userId; before = participantState(grant);
        const next = command.action === "revoke" ? { state: "revoked" } : { role: command.role, scopes: command.scopes, protectedContent: command.protectedContent, state: command.state };
        await tx.update(participants).set({ ...next, revision: grant.revision+1, updatedAt: now, controlRequestId: null, requestedAt: null, requestClientId: null, requestSessionId: null, requestTokenHash: null }).where(and(eq(participants.worldId, worldId), eq(participants.userId, command.userId)));
        if(command.action==="revoke")await tx.update(invitations).set({state:"revoked",revision:sql`${invitations.revision}+1`,resolvedAt:now}).where(and(eq(invitations.id,grant.invitationId),eq(invitations.worldId,worldId),eq(invitations.state,"accepted")));
        await invalidateHolder(tx, worldId, command.userId); after = { ...participantState(grant), ...next, revision: grant.revision+1 };
      } else if (command.action === "withdraw") {
        const [invitation] = await tx.select().from(invitations).where(and(eq(invitations.id, command.invitationId), eq(invitations.worldId, worldId)));
        if (!invitation || invitation.state !== "pending" || invitation.revision !== command.revision) throw new WorldError("This invitation is no longer pending. Reload the access list.", 409);
        targetId = invitation.inviteeId; before = { id: invitation.id, state: invitation.state };
        await tx.update(invitations).set({ state: "revoked", revision: invitation.revision+1, resolvedAt: now }).where(eq(invitations.id, invitation.id)); after = { id: invitation.id, state: "revoked" };
      } else {
        const [lease] = await tx.select().from(leases).where(eq(leases.worldId, worldId)), alive = await editorLeaseAlive(tx, parent, lease, now);
        before = { holderId: alive ? lease!.holderId : null, fence: lease?.fence ?? 0 };
        if (command.action === "request-control") {
          if (parent.permission.role !== "editor") throw new WorldError("The owner may start or explicitly reclaim editing control.", 400);
          await tx.update(participants).set({ controlRequestId: command.requestId, requestedAt: now, requestClientId: command.proof.clientId, requestSessionId: authority.sessionId, requestTokenHash: editorTokenHash(command.proof.token) }).where(and(eq(participants.worldId, worldId), eq(participants.userId, userId), eq(participants.state, "active"), eq(participants.role, "editor")));
          after = { requestedBy: userId, requestId: command.requestId };
        } else if (command.action === "approve-control") {
          const [target] = await tx.select().from(participants).where(and(eq(participants.worldId, worldId), eq(participants.userId, command.userId)));
          if (!target || target.state !== "active" || target.role !== "editor" || target.controlRequestId !== command.controlRequestId || !target.requestedAt || target.requestedAt.getTime() <= now.getTime()-600_000 || !target.requestClientId || !target.requestTokenHash || !target.requestSessionId || !await activeWorldSession(tx, target.userId, target.requestSessionId, now)) throw new WorldError("That editing request changed or expired. Ask the participant to request control again.", 409);
          targetId = target.userId;
          await tx.insert(leases).values({ worldId, fence: 1, holderId: target.userId, sessionId: target.requestSessionId, clientId: target.requestClientId, tokenHash: target.requestTokenHash, expiresAt: new Date(now.getTime()+WORLD_LEASE_SECONDS*1000), updatedAt: now }).onConflictDoUpdate({ target: leases.worldId, set: { fence: sql`${leases.fence}+1`, holderId: target.userId, sessionId: target.requestSessionId, clientId: target.requestClientId, tokenHash: target.requestTokenHash, expiresAt: new Date(now.getTime()+WORLD_LEASE_SECONDS*1000), updatedAt: now } });
          await tx.update(participants).set({ controlRequestId: null, requestedAt: null, requestSessionId: null, requestClientId: null, requestTokenHash: null }).where(and(eq(participants.worldId, worldId), eq(participants.userId, target.userId))); after = { holderId: target.userId, handoff: true };
        } else if (command.action === "renew-control" || command.action === "release-control") {
          if (!alive || !lease || !editorProofMatches(lease, userId, authority.sessionId, command.proof)) throw new WorldError("Editing control changed or expired. Your draft remains on this device.", 409);
          if (command.action === "renew-control") await tx.update(leases).set({ expiresAt: new Date(now.getTime()+WORLD_LEASE_SECONDS*1000), updatedAt: now }).where(eq(leases.worldId, worldId));
          else await invalidateHolder(tx, worldId, userId);
          after = { holderId: command.action === "renew-control" ? userId : null, released: command.action === "release-control" };
        } else {
          if (command.action !== "reclaim-control" && alive && (!lease || !editorProofMatches(lease, userId, authority.sessionId, command.proof, false))) throw new WorldError("Another session is editing. Request a handoff or wait for editing control to expire.", 409);
          if(command.action==="acquire-control"&&alive&&lease&&editorProofMatches(lease,userId,authority.sessionId,command.proof,false))await tx.update(leases).set({expiresAt:new Date(now.getTime()+WORLD_LEASE_SECONDS*1000),updatedAt:now}).where(eq(leases.worldId,worldId));
          else await storeLease(tx, worldId, userId, authority.sessionId, command.proof, now);
          await tx.update(participants).set({controlRequestId:null,requestedAt:null,requestClientId:null,requestSessionId:null,requestTokenHash:null}).where(and(eq(participants.worldId,worldId),eq(participants.userId,userId)));
          after = { holderId: userId, override: command.action === "reclaim-control" };
        }
      }
      if(command.action!=="renew-control")await writeAudit(tx, { worldId, actorId: userId, requestId: command.requestId, command, action: command.action, targetId, before, after, result });
      return result;
    } catch (error) {
      if (!(error instanceof WorldError)) throw error;
      const result = { error: error.message, status: error.status };
      await writeAudit(tx, { worldId, actorId: userId, requestId: command.requestId, command, action: command.action, targetId, before, outcome: "denied", result });
      return result;
    }
  });
  const failure = previousError(outcome); if (failure) throw failure;
  return { saved: true, access: await getWorldCollaboration(userId, worldId, false, true) };
}

export async function decideWorldInvitation(userId: string, input: unknown) {
  const command = invitationDecisionSchema.parse(input), authority = authorityFor(userId); await worldActor(userId);
  const outcome = await db.transaction(async tx => {
    await requireTables(tx);
    const [found] = await tx.select().from(invitations).where(and(eq(invitations.id, command.invitationId), eq(invitations.inviteeId, userId)));
    if (!found) throw worldUnavailable();
    const parent = await lockWorld(tx, found.worldId), now = await databaseClock(tx);
    if (!await activeWorldSession(tx, userId, authority.sessionId, now)) throw new WorldError("Sign in again before answering an invitation.", 401);
    const [invitation] = await tx.select().from(invitations).where(and(eq(invitations.id, found.id), eq(invitations.inviteeId, userId)));
    const [grant] = await tx.select().from(participants).where(and(eq(participants.worldId, parent.id), eq(participants.userId, userId)));
    const previous = await receipt(tx, parent.id, userId, command.requestId, command);
    if (previous) {
      if (command.action === "accept" && (invitation.state !== "accepted" || grant?.state !== "active" || grant.invitationId !== invitation.id)) throw worldUnavailable();
      return previous.result;
    }
    try {
      if (invitation.state !== "pending" || invitation.revision !== command.revision || invitation.expiresAt <= now || command.action === "accept" && parent.archivedAt) throw new WorldError("This invitation changed, expired or was withdrawn. Ask the owner for a new invitation.", 409);
      if (command.action === "accept") {
        if (grant && grant.state !== "revoked") throw new WorldError("This World already has access settings for your account.", 409);
        const count = await tx.select({ n: sql<number>`count(*)::int` }).from(participants).where(and(eq(participants.worldId, parent.id), inArray(participants.state, ["active", "suspended"])));
        if (count[0].n >= WORLD_PARTICIPANT_LIMIT) throw new WorldError("This World has reached 200 participants. Contact its owner.", 413);
        const values = { worldId: parent.id, userId, invitationId: invitation.id, role: invitation.role, scopes: invitation.scopes, protectedContent: invitation.protectedContent, state: "active", revision: (grant?.revision ?? 0)+1, grantedBy: invitation.inviterId, updatedAt: now };
        await tx.insert(participants).values(values).onConflictDoUpdate({ target: [participants.worldId, participants.userId], set: values });
      }
      const next = command.action === "accept" ? "accepted" : "declined";
      await tx.update(invitations).set({ state: next, revision: invitation.revision+1, resolvedAt: now }).where(eq(invitations.id, invitation.id));
      const result = { saved: true, accepted: command.action === "accept", worldId: parent.id };
      await writeAudit(tx, { worldId: parent.id, actorId: userId, targetId: userId, requestId: command.requestId, command, action: "invitation-"+command.action, before: { invitationId: invitation.id, state: invitation.state }, after: { invitationId: invitation.id, state: next, role: invitation.role, scopes: invitation.scopes, protectedContent: invitation.protectedContent }, result });
      return result;
    } catch (error) {
      if (!(error instanceof WorldError)) throw error;
      const result = { error: error.message, status: error.status };
      await writeAudit(tx, { worldId: parent.id, actorId: userId, targetId: userId, requestId: command.requestId, command, action: "invitation-"+command.action, outcome: "denied", result }); return result;
    }
  });
  const failure = previousError(outcome); if (failure) throw failure;
  return { saved: true, invitations: await worldInvitationInbox(userId) };
}
export async function worldAccessAuditHistory(userId: string, worldId: string, review = false, offset = 0): Promise<{ events: WorldAccessAuditView[]; hasMore: boolean }> {
  const parent = await authorizeWorldRead(userId, worldId, review, "shell");
  if (parent.permission.role !== "owner" && parent.permission.role !== "administrator-review") throw worldUnavailable();
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new WorldError("Choose an available audit page.", 400);
  if (!await collaborationAvailable()) return { events: [], hasMore: false };
  const rows = await db.select({ event: audit, actorName: user.name }).from(audit).innerJoin(user, eq(user.id, audit.actorId)).where(eq(audit.worldId, worldId)).orderBy(desc(audit.createdAt), desc(audit.id)).limit(51).offset(offset);
  return { events: rows.slice(0,50).map(({ event, actorName }) => ({ id: event.id, actorId: event.actorId, actorName, targetId: event.targetId, action: event.action, outcome: event.outcome, before: event.before, after: event.after, requestId: event.requestId, createdAt: event.createdAt.toISOString() })), hasMore: rows.length > 50 };
}
export async function recordAdministratorWorldReview(userId: string, worldId: string, input: unknown) {
  const command = administratorWorldReviewSchema.parse(input), actor = await worldActor(userId), authority = worldRequestAuthority();
  if (!actor.admin || !authority || authority.userId !== userId) throw new WorldError("Administrator access is required.", 403);
  await db.transaction(async tx => {
    await requireTables(tx); await lockWorld(tx, worldId); await authorizeWorldRead(userId, worldId, true, "shell", tx);
    if (!await activeWorldSession(tx, userId, authority.sessionId, await databaseClock(tx))) throw new WorldError("Sign in again.", 401);
    const previous = await receipt(tx, worldId, userId, command.requestId, command); if (previous) return;
    await writeAudit(tx, { worldId, actorId: userId, requestId: command.requestId, command, action: "administrator-access-review", after: { note: command.note, reviewed: true }, result: { saved: true } });
  });
  return { saved: true };
}


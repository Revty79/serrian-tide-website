import { sql, type SQLWrapper } from "drizzle-orm";
import { bigint, boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { world } from "./world-schema";
import type { WorldScope } from "@/features/worlds/world-permissions";
const validScopes=(column:SQLWrapper)=>sql`jsonb_typeof(${column})='array' and jsonb_array_length(${column}) between 1 and 17 and ${column} <@ '["overview","history","timekeeping","peoples","individuals","politics","organizations","cosmology","stories","settlements","atlas","interiors","underground","craft","appearances","assets","campaigns"]'::jsonb and (not (${column} @> '["appearances"]'::jsonb) or ${column} @> '["history"]'::jsonb)`;

export const worldInvitation = pgTable("world_access_invitation", {
  id: text("id").primaryKey(), worldId: text("world_id").notNull().references(() => world.id, { onDelete: "restrict" }),
  inviterId: text("inviter_id").notNull().references(() => user.id, { onDelete: "restrict" }), inviteeId: text("invitee_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  worldName: text("world_name").notNull(), inviterName: text("inviter_name").notNull(),
  role: text("role").notNull(), scopes: jsonb("scopes").$type<WorldScope[]>().notNull(), protectedContent: boolean("protected_content").notNull().default(false),
  state: text("state").notNull().default("pending"), revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(), expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(), resolvedAt: timestamp("resolved_at",{withTimezone:true}),
}, t => [unique("world_access_invitation_world_identity").on(t.worldId, t.id,t.inviteeId),foreignKey({columns:[t.worldId,t.inviterId],foreignColumns:[world.id,world.ownerId],name:"world_access_invitation_owner_fk"}).onDelete("restrict"), uniqueIndex("world_access_invitation_pending_target").on(t.worldId,t.inviteeId).where(sql`${t.state}='pending'`), index("world_access_invitation_inbox").on(t.inviteeId, t.state, t.createdAt), index("world_access_invitation_world").on(t.worldId, t.state), check("world_access_invitation_scopes",validScopes(t.scopes)), check("world_access_invitation_role", sql`${t.role} in ('viewer','editor')`), check("world_access_invitation_state", sql`${t.state} in ('pending','accepted','declined','revoked','expired')`), check("world_access_invitation_revision", sql`${t.revision}>0`), check("world_access_invitation_expiry", sql`${t.expiresAt}>${t.createdAt}`)]);

export const worldParticipant = pgTable("world_access_participant", {
  worldId: text("world_id").notNull().references(() => world.id, { onDelete: "restrict" }), userId: text("user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  invitationId: text("invitation_id").notNull(), role: text("role").notNull(), scopes: jsonb("scopes").$type<WorldScope[]>().notNull(), protectedContent: boolean("protected_content").notNull().default(false),
  state: text("state").notNull().default("active"), revision: integer("revision").notNull().default(1), grantedBy: text("granted_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
  requestedAt: timestamp("requested_at",{withTimezone:true}), controlRequestId: text("control_request_id"), requestClientId: text("request_client_id"), requestSessionId: text("request_session_id"), requestTokenHash: text("request_token_hash"),
}, t => [primaryKey({ columns: [t.worldId, t.userId] }), foreignKey({ columns: [t.worldId, t.invitationId,t.userId], foreignColumns: [worldInvitation.worldId, worldInvitation.id,worldInvitation.inviteeId], name: "world_access_participant_invitation_fk" }).onDelete("restrict"), foreignKey({columns:[t.worldId,t.grantedBy],foreignColumns:[world.id,world.ownerId],name:"world_access_participant_owner_fk"}).onDelete("restrict"),index("world_access_participant_user").on(t.userId, t.state, t.worldId), check("world_access_participant_scopes",validScopes(t.scopes)), check("world_access_participant_role", sql`${t.role} in ('viewer','editor')`), check("world_access_participant_state", sql`${t.state} in ('active','suspended','revoked')`), check("world_access_participant_revision", sql`${t.revision}>0`), check("world_access_participant_control_request",sql`(${t.controlRequestId} is null and ${t.requestedAt} is null and ${t.requestClientId} is null and ${t.requestSessionId} is null and ${t.requestTokenHash} is null) or (${t.controlRequestId} is not null and ${t.requestedAt} is not null and ${t.requestClientId} is not null and ${t.requestSessionId} is not null and ${t.requestTokenHash} is not null and ${t.requestTokenHash} ~ '^[a-f0-9]{64}$')`)]);

export const worldEditorLease = pgTable("world_editor_lease", {
  worldId: text("world_id").primaryKey().references(() => world.id, { onDelete: "restrict" }), fence: bigint("fence", { mode: "number" }).notNull().default(0),
  holderId: text("holder_id").references(() => user.id, { onDelete: "restrict" }), sessionId: text("session_id"), clientId: text("client_id"), tokenHash: text("token_hash"),
  expiresAt: timestamp("expires_at",{withTimezone:true}), updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
}, t => [check("world_editor_lease_fence", sql`${t.fence}>=0 and ${t.fence}<9007199254740991`), check("world_editor_lease_identity", sql`(${t.holderId} is null and ${t.sessionId} is null and ${t.clientId} is null and ${t.tokenHash} is null and ${t.expiresAt} is null) or (${t.holderId} is not null and ${t.sessionId} is not null and ${t.clientId} is not null and ${t.tokenHash} is not null and ${t.tokenHash} ~ '^[a-f0-9]{64}$' and ${t.expiresAt} is not null)`)]);

export const worldAccessAudit = pgTable("world_access_audit", {
  id: text("id").primaryKey(), worldId: text("world_id").notNull().references(() => world.id, { onDelete: "restrict" }), actorId: text("actor_id").notNull().references(() => user.id, { onDelete: "restrict" }), targetId: text("target_id").references(() => user.id, { onDelete: "restrict" }),
  action: text("action").notNull(), requestId: text("request_id").notNull(), inputHash: text("input_hash").notNull(), outcome: text("outcome").notNull(), before: jsonb("before_state").$type<unknown>(), after: jsonb("after_state").$type<unknown>(), result: jsonb("result").$type<unknown>().notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
}, t => [unique("world_access_audit_request").on(t.worldId, t.actorId, t.requestId), index("world_access_audit_world_time").on(t.worldId, t.createdAt, t.id), index("world_access_audit_invitation_rate").on(t.actorId,t.action,t.createdAt), check("world_access_audit_outcome", sql`${t.outcome} in ('accepted','denied')`), check("world_access_audit_hash",sql`${t.inputHash} ~ '^[a-f0-9]{64}$'`)]);


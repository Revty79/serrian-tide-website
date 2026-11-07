import { z } from "zod";
import { worldEditorProofSchema, worldScopesSchema, type WorldPermission } from "./world-permissions";

const request = { requestId: z.string().uuid() }, identity = z.string().min(1).max(128), revision = z.number().int().positive();
const grant = { role: z.enum(["viewer", "editor"]), scopes: worldScopesSchema, protectedContent: z.boolean() };
export const collaborationCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...request, ...grant, action: z.literal("invite"), username: z.string().trim().min(3).max(64) }).strict(),
  z.object({ ...request, ...grant, action: z.literal("permissions"), userId: identity, revision, state: z.enum(["active", "suspended"]) }).strict(),
  z.object({ ...request, action: z.literal("revoke"), userId: identity, revision }).strict(),
  z.object({ ...request, action: z.literal("withdraw"), invitationId: z.string().uuid(), revision }).strict(),
  z.object({ ...request, action: z.enum(["acquire-control", "request-control"]), proof: worldEditorProofSchema }).strict(),
  z.object({ ...request, action: z.enum(["renew-control", "release-control"]), proof: worldEditorProofSchema.extend({ fence: z.number().int().nonnegative().safe() }) }).strict(),
  z.object({ ...request, action: z.literal("approve-control"), userId: identity, controlRequestId: z.string().uuid(), confirm: z.literal(true) }).strict(),
  z.object({ ...request, action: z.literal("reclaim-control"), proof: worldEditorProofSchema, confirm: z.literal(true) }).strict(),
]);
export const invitationDecisionSchema = z.object({ ...request, action: z.enum(["accept", "decline"]), invitationId: z.string().uuid(), revision }).strict();
export const administratorWorldReviewSchema = z.object({ ...request, note: z.string().trim().min(1).max(2000) }).strict();
export type WorldParticipantView = { userId: string; name: string; username: string | null; role: "viewer" | "editor"; scopes: WorldPermission["scopes"]; protectedContent: boolean; state: string; revision: number; requestedAt: string | null; controlRequestId: string | null };
export type WorldInvitationView = { id: string; worldId: string; worldName: string; ownerName: string; role: "viewer" | "editor"; scopes: WorldPermission["scopes"]; protectedContent: boolean; state: string; revision: number; expiresAt: string; createdAt: string; inviteeName?: string; inviteeUsername?: string | null };
export type WorldEditorStatus = { holder: { userId: string; name: string; username: string | null } | null; expiresAt: string | null; fence: number | null; yours: boolean; available: boolean; requestPending: boolean };
export type WorldCollaborationView = { worldId: string; worldName: string; ownerId: string; permission: WorldPermission; archived: boolean; canManage: boolean; editor: WorldEditorStatus; participants: WorldParticipantView[]; invitations: WorldInvitationView[]; pendingControlRequests: WorldParticipantView[]; available: boolean };
export type WorldAccessAuditView = { id: string; actorId: string; actorName: string; targetId: string | null; action: string; outcome: string; before: unknown; after: unknown; requestId: string; createdAt: string };


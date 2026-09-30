import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { companionProfileEvent as event } from "@/db/companion-profile-schema";
import { ROLE_LABELS, CONTROL_LABELS, COMBAT_PREFERENCE_LABELS } from "./companion-profile";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Application commands use camelCase; automatic ownership snapshots use SQL names.
function describe(state: Record<string, unknown> | null) {
  if (!state) return ["No Companion Profile recorded."];
  const control = state.controlModel ?? state.control_model;
  const combat = state.combatPreference ?? state.combat_preference;
  const roles = Array.isArray(state.roles) ? state.roles as Record<string, unknown>[] : [];
  const details = [
    `Roles: ${roles.map(row => `${ROLE_LABELS[row.role as keyof typeof ROLE_LABELS] ?? "Unknown role"}${row.role === "other" ? ` (${row.otherLabel ?? row.other_label ?? ""})` : ""}`).join(" · ") || "None selected"}`,
    `Control: ${CONTROL_LABELS[control as keyof typeof CONTROL_LABELS] ?? "Not configured"}`,
    `Combat: ${COMBAT_PREFERENCE_LABELS[combat as keyof typeof COMBAT_PREFERENCE_LABELS] ?? "Not configured"}`,
  ];
  const mount = roles.find(row => row.role === "mount");
  if (mount) details.push(`Mount: ${mount.maximumRiders ?? mount.maximum_riders} intended riders; ${mount.mountNotes ?? mount.mount_notes ?? ""}`);
  details.push(`Relationship notes: ${state.relationshipNotes ?? state.relationship_notes ?? ""}`);
  details.push(`Owner review: ${(state.requiresOwnerReview ?? state.requires_owner_review) ? "Required" : "Not pending"}`);
  return details;
}

/** Caller must authorize the exact persistent Creature. No raw snapshots leave this projection. */
export async function readCompanionProfileHistoryInTransaction(tx: Transaction, characterId: number) {
  const history = await tx.select({ id: event.id, revision: event.revision, actor: user.name, createdAt: event.createdAt,
    command: event.command, before: event.before, after: event.after })
    .from(event).leftJoin(user, eq(user.id, event.actorUserId)).where(eq(event.characterId, characterId)).orderBy(desc(event.revision)).limit(30);
  return history.map(row => ({ id: row.id, revision: row.revision, actor: row.actor ?? "Actor not recorded (automatic ownership event)",
    createdAt: row.createdAt.toISOString(), summary: row.command.operation === "notes" ? "Relationship notes updated."
      : row.command.operation === "ownership-review" ? `Ownership changed from ${row.command.previousOwnerCharacterId === null ? "unassigned" : `Character #${row.command.previousOwnerCharacterId}`} to ${row.command.ownerCharacterId === null ? "unassigned" : `Character #${row.command.ownerCharacterId}`}; authored profile retained for G.O.D. review.`
      : row.command.confirmOwnerReview ? "Profile configured and reviewed for the current owner." : "Companion roles and intended behavior configured.",
    before: describe(row.before), after: describe(row.after) }));
}

import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { serrianRole, userRole, type SerrianRole } from "@/db/authorization-schema";
import { publishChatDirectoryInvalidationInTransaction } from "@/features/chat/chat-live-events";

export type UserRoleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SetUserRoleInput = {
  targetUserId: unknown;
  requestedRole: unknown;
  enabled: unknown;
};

export async function setUserRoleInTransaction(
  tx: UserRoleTransaction,
  actingUserId: string,
  input: SetUserRoleInput,
): Promise<{ changed: boolean; role: SerrianRole; enabled: boolean }> {
  const [adminAccess] = await tx
    .select({ role: userRole.role })
    .from(userRole)
    .where(and(eq(userRole.userId, actingUserId), eq(userRole.role, "admin")))
    .limit(1);
  if (!adminAccess) throw new Error("Administrator access is required.");

  if (
    typeof input.targetUserId !== "string"
    || typeof input.requestedRole !== "string"
    || typeof input.enabled !== "string"
  ) {
    throw new Error("Invalid role request.");
  }
  if (!serrianRole.enumValues.includes(input.requestedRole as SerrianRole)) {
    throw new Error("Invalid Serrian Tide role.");
  }

  const role = input.requestedRole as SerrianRole;
  const enabled = input.enabled === "true";
  if (input.targetUserId === actingUserId && role === "admin" && !enabled) {
    throw new Error("You cannot remove your own administrator access.");
  }

  const changedRows = enabled
    ? await tx
        .insert(userRole)
        .values({ userId: input.targetUserId, role })
        .onConflictDoNothing()
        .returning({ userId: userRole.userId })
    : await tx
        .delete(userRole)
        .where(and(eq(userRole.userId, input.targetUserId), eq(userRole.role, role)))
        .returning({ userId: userRole.userId });

  if (changedRows.length > 0) {
    await publishChatDirectoryInvalidationInTransaction(tx);
  }
  return { changed: changedRows.length > 0, role, enabled };
}

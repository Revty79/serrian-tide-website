import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { userRole } from "@/db/authorization-schema";

export type AdminRosterTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/**
 * Rejects non-Administrators before they can contend on the global roster
 * lock. Destructive writers must still reauthorize after acquiring that lock.
 */
export async function assertPreliminaryAdministratorAccess(
  actingUserId: string,
): Promise<void> {
  const [administrator] = await db
    .select({ userId: userRole.userId })
    .from(userRole)
    .where(and(eq(userRole.userId, actingUserId), eq(userRole.role, "admin")))
    .limit(1);
  if (!administrator) {
    throw new Error("Administrator access is required.");
  }
}

/**
 * Serializes administrator-account deletion with administrator-role changes.
 * Every writer must acquire this lock before authorizing against the current
 * administrator roster and must retain it through its write.
 */
export async function lockAdministratorRosterInTransaction(
  tx: AdminRosterTransaction,
): Promise<string[]> {
  await tx.execute(sql`select pg_advisory_xact_lock(19372026, 1)`);
  const result = await tx.execute(sql<{ user_id: string }>`
    select user_id
    from user_role
    where role = 'admin'
    order by user_id
    for update
  `);
  return (result.rows as Array<{ user_id: string }>).map(
    ({ user_id }) => user_id,
  );
}

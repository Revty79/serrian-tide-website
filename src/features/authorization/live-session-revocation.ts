import { sql } from "drizzle-orm";

import type { db } from "@/db";

export const LIVE_SESSION_REVOCATION_CHANNEL = "serrian_tide_live_session_revocation";

export type LiveSessionRevocation = {
  userId: string;
};

type LiveSessionRevocationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function hasExactKeys(row: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(row).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

export function parseLiveSessionRevocation(value: unknown): LiveSessionRevocation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    !hasExactKeys(row, ["userId"])
    || typeof row.userId !== "string"
    || !row.userId.trim()
    || row.userId.length > 255
  ) return null;
  return { userId: row.userId };
}

export function parseLiveSessionRevocationPayload(
  payload: string | undefined,
): LiveSessionRevocation | null {
  if (!payload) return null;
  try {
    return parseLiveSessionRevocation(JSON.parse(payload));
  } catch {
    return null;
  }
}

export function liveSessionRevocationMatchesUser(
  event: LiveSessionRevocation,
  authenticatedUserId: string,
): boolean {
  return event.userId === authenticatedUserId;
}

/** PostgreSQL delivers pg_notify only if the caller-owned transaction commits. */
export async function publishLiveSessionRevocationInTransaction(
  tx: LiveSessionRevocationTransaction,
  userId: string,
): Promise<void> {
  const event = parseLiveSessionRevocation({ userId });
  if (!event) throw new Error("Live session revocation is invalid.");
  await tx.execute(sql`select pg_notify(${LIVE_SESSION_REVOCATION_CHANNEL}, ${JSON.stringify(event)})`);
}

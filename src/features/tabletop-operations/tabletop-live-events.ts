import { sql } from "drizzle-orm";

import type { db } from "@/db";

export const TABLETOP_LIVE_CHANNEL = "serrian_tide_tabletop";
export const TABLETOP_INVALIDATION_CATEGORIES = [
  "hierarchy",
  "initiative",
  "action",
  "reaction",
  "roll",
  "called-check",
  "character-state",
] as const;

export type TabletopInvalidationCategory = (typeof TABLETOP_INVALIDATION_CATEGORIES)[number];
export type TabletopInvalidation = {
  campaignId: number;
  sessionId: number;
  sceneId: number | null;
  encounterId: number | null;
  characterIds: number[];
  category: TabletopInvalidationCategory;
  audience?: "all" | "god-only";
};

type LiveEventTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function optionalPositiveId(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

export function parseTabletopInvalidation(value: unknown): TabletopInvalidation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const campaignId = optionalPositiveId(row.campaignId);
  const sessionId = optionalPositiveId(row.sessionId);
  const sceneId = row.sceneId === null ? null : optionalPositiveId(row.sceneId);
  const encounterId = row.encounterId === null ? null : optionalPositiveId(row.encounterId);
  const characterIds = Array.isArray(row.characterIds)
    ? [...new Set(row.characterIds.map(optionalPositiveId).filter((id): id is number => id !== null))]
    : [];
  if (
    campaignId === null
    || sessionId === null
    || (row.sceneId !== null && sceneId === null)
    || (row.encounterId !== null && encounterId === null)
    || typeof row.category !== "string"
    || !TABLETOP_INVALIDATION_CATEGORIES.includes(row.category as TabletopInvalidationCategory)
    || (row.audience !== undefined && row.audience !== "all" && row.audience !== "god-only")
  ) return null;
  return {
    campaignId,
    sessionId,
    sceneId,
    encounterId,
    characterIds,
    category: row.category as TabletopInvalidationCategory,
    ...(row.audience === undefined ? {} : { audience: row.audience as "all" | "god-only" }),
  };
}

export function eventMatchesGodSubscription(event: TabletopInvalidation, campaignId: number): boolean {
  return event.campaignId === campaignId;
}

export function eventMatchesPlayerSubscription(
  event: TabletopInvalidation,
  subscription: { campaignId: number; encounterId: number | null; characterId: number },
): boolean {
  if (event.audience === "god-only") return false;
  if (event.campaignId !== subscription.campaignId) return false;
  if (
    subscription.encounterId !== null
    && event.encounterId !== null
    && event.encounterId !== subscription.encounterId
  ) return false;
  return event.characterIds.length === 0 || event.characterIds.includes(subscription.characterId);
}

/** PostgreSQL delivers pg_notify only when the caller-owned transaction commits. */
export async function publishTabletopInvalidationInTransaction(
  tx: LiveEventTransaction,
  input: TabletopInvalidation,
): Promise<void> {
  const event = parseTabletopInvalidation(input);
  if (!event) throw new Error("Tabletop live invalidation is invalid.");
  await tx.execute(sql`select pg_notify(${TABLETOP_LIVE_CHANNEL}, ${JSON.stringify(event)})`);
}

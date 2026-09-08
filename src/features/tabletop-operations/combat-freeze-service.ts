import "server-only";

import { and, asc, eq } from "drizzle-orm";
import type { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignSessionEncounter, campaignSessionEncounterParticipant } from "@/db/tabletop-operations-schema";
import { publishTabletopInvalidationInTransaction } from "./tabletop-live-events";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const COMBAT_PAUSED_MESSAGE = "Combat is paused by the G.O.D.";
export class CombatPausedError extends Error {
  readonly code = "COMBAT_PAUSED";
  constructor() { super(COMBAT_PAUSED_MESSAGE); this.name = "CombatPausedError"; }
}

/** Acquire this before any combat write, including retained integration paths.
 * The lock lasts until the caller's entire transaction commits or rolls back.
 * Read projections must not use this guard: pausing never disables inspection.
 */
export async function assertCombatWritableInTransaction(tx: Transaction, encounterId: number): Promise<void> {
  const [encounter] = await tx.select({ frozenAt: campaignSessionEncounter.frozenAt })
    .from(campaignSessionEncounter).where(eq(campaignSessionEncounter.id, encounterId))
    .limit(1).for("update");
  if (!encounter) throw new Error("That Encounter no longer exists.");
  if (encounter.frozenAt !== null) throw new CombatPausedError();
}

/** Character sheets and retained resource APIs share the same live combat resources. */
export async function assertCharacterCombatWritableInTransaction(tx: Transaction, characterId: number): Promise<void> {
  const encounters = await tx.select({ frozenAt: campaignSessionEncounter.frozenAt })
    .from(campaignSessionEncounter).innerJoin(campaignSessionEncounterParticipant,
      eq(campaignSessionEncounterParticipant.encounterId, campaignSessionEncounter.id))
    .where(and(eq(campaignSessionEncounterParticipant.characterId, characterId), eq(campaignSessionEncounter.status, "active")))
    .orderBy(asc(campaignSessionEncounter.id)).for("update", { of: campaignSessionEncounter });
  if (encounters.some(({ frozenAt }) => frozenAt !== null)) throw new CombatPausedError();
}

export type CombatPauseState = {
  frozen: boolean;
  frozenAt: string | null;
  revision: number;
  canFreeze: boolean;
  canResume: boolean;
  message: string | null;
};

/** Internal projection; callers first authorize encounter visibility. */
export async function readCombatPauseStateInTransaction(
  tx: Transaction, encounterId: number, viewer: { userId: string; authority: string },
): Promise<CombatPauseState> {
  const [row] = await tx.select({ frozenAt: campaignSessionEncounter.frozenAt, revision: campaignSessionEncounter.freezeRevision,
    status: campaignSessionEncounter.status, ownerUserId: campaign.createdByUserId })
    .from(campaignSessionEncounter).innerJoin(campaign, eq(campaign.id, campaignSessionEncounter.campaignId))
    .where(eq(campaignSessionEncounter.id, encounterId)).limit(1);
  if (!row) throw new Error("That Encounter no longer exists.");
  const controls = viewer.authority === "god-owner" && viewer.userId === row.ownerUserId && row.status === "active";
  return { frozen: row.frozenAt !== null, frozenAt: row.frozenAt?.toISOString() ?? null, revision: row.revision,
    canFreeze: controls && row.frozenAt === null, canResume: controls && row.frozenAt !== null,
    message: row.frozenAt !== null ? COMBAT_PAUSED_MESSAGE : null };
}

export async function setCombatFrozenInTransaction(
  tx: Transaction, encounterId: number, actor: { userId: string; authority: string },
  input: { frozen: boolean; expectedRevision: number },
): Promise<CombatPauseState> {
  if (typeof input.frozen !== "boolean" || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new Error("The requested combat pause state is invalid.");
  }
  const [row] = await tx.select({ id: campaignSessionEncounter.id, frozenAt: campaignSessionEncounter.frozenAt,
    revision: campaignSessionEncounter.freezeRevision, status: campaignSessionEncounter.status,
    campaignId: campaignSessionEncounter.campaignId, sessionId: campaignSessionEncounter.sessionId,
    sceneId: campaignSessionEncounter.sceneId, ownerUserId: campaign.createdByUserId })
    .from(campaignSessionEncounter).innerJoin(campaign, eq(campaign.id, campaignSessionEncounter.campaignId))
    .where(eq(campaignSessionEncounter.id, encounterId)).limit(1).for("update", { of: campaignSessionEncounter });
  if (!row || actor.authority !== "god-owner" || actor.userId !== row.ownerUserId) {
    throw new Error("Only the Campaign-owning G.O.D. may freeze or resume this Encounter.");
  }
  if (row.status !== "active") throw new Error("Only an active Encounter may be frozen or resumed.");
  // Explicit desired state, never a toggle. A retry cannot reverse a newer change.
  if ((row.frozenAt !== null) !== input.frozen) {
    if (row.revision !== input.expectedRevision) throw new Error("Combat pause state changed. Refresh before freezing or resuming.");
    await tx.update(campaignSessionEncounter).set({ frozenAt: input.frozen ? new Date() : null,
      freezeRevision: row.revision + 1, updatedAt: new Date() }).where(eq(campaignSessionEncounter.id, encounterId));
    await publishTabletopInvalidationInTransaction(tx, { campaignId: row.campaignId, sessionId: row.sessionId,
      sceneId: row.sceneId, encounterId, characterIds: [], category: "initiative" });
  }
  return readCombatPauseStateInTransaction(tx, encounterId, actor);
}

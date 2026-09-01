"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignSession } from "@/db/tabletop-operations-schema";
import {
  assertCampaignSessionOwner,
  assertNoOtherActiveSession,
  assertSessionMayBeDeleted,
  normalizeSessionMetadata,
  transitionSession,
  type SessionMetadataInput,
  type SessionStatus,
  type SessionTransition,
} from "@/features/tabletop-operations/session-foundation";
import { requireGod } from "@/lib/server-access";

export type TabletopCampaignSummary = {
  id: number;
  name: string;
  overview: string;
};

export type CampaignSessionSummary = {
  id: number;
  campaignId: number;
  title: string;
  sequenceNumber: number;
  status: SessionStatus;
  plannedFor: string | null;
  godNotes: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TabletopWorkspaceData = {
  campaigns: TabletopCampaignSummary[];
  selectedCampaignId: number | null;
  sessions: CampaignSessionSummary[];
};

export type SaveSessionMetadataInput = SessionMetadataInput & {
  id: number;
};

export type CreateSessionInput = SessionMetadataInput & {
  campaignId: number;
};

const sessionFields = {
  id: campaignSession.id,
  campaignId: campaignSession.campaignId,
  title: campaignSession.title,
  sequenceNumber: campaignSession.sequenceNumber,
  status: campaignSession.status,
  plannedFor: campaignSession.plannedFor,
  godNotes: campaignSession.godNotes,
  startedAt: campaignSession.startedAt,
  completedAt: campaignSession.completedAt,
  createdAt: campaignSession.createdAt,
  updatedAt: campaignSession.updatedAt,
};

type SessionRow = {
  id: number;
  campaignId: number;
  title: string;
  sequenceNumber: number;
  status: SessionStatus;
  plannedFor: string | null;
  godNotes: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toSessionSummary(row: SessionRow): CampaignSessionSummary {
  return {
    ...row,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertPositiveId(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
}

function isUniqueViolation(error: unknown): boolean {
  let candidate = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof candidate !== "object" || candidate === null) return false;
    if ("code" in candidate && candidate.code === "23505") return true;
    candidate = "cause" in candidate ? candidate.cause : null;
  }
  return false;
}

function refreshTabletop(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
}

async function requireOwnedCampaign(campaignId: number, userId: string): Promise<void> {
  assertPositiveId(campaignId, "Campaign");
  const [owned] = await db
    .select({ id: campaign.id })
    .from(campaign)
    .where(and(eq(campaign.id, campaignId), eq(campaign.createdByUserId, userId)))
    .limit(1);
  if (!owned) throw new Error("Only the Campaign creator can manage its Sessions.");
}

export async function getTabletopWorkspace(
  requestedCampaignId: number | null,
): Promise<TabletopWorkspaceData> {
  const access = await requireGod();
  const campaigns = await db
    .select({ id: campaign.id, name: campaign.name, overview: campaign.overview })
    .from(campaign)
    .where(eq(campaign.createdByUserId, access.user.id))
    .orderBy(asc(campaign.name), asc(campaign.id));
  const selectedCampaignId = campaigns.some(({ id }) => id === requestedCampaignId)
    ? requestedCampaignId
    : campaigns[0]?.id ?? null;
  const sessions = selectedCampaignId === null
    ? []
    : await db
        .select(sessionFields)
        .from(campaignSession)
        .where(eq(campaignSession.campaignId, selectedCampaignId))
        .orderBy(asc(campaignSession.sequenceNumber), asc(campaignSession.id));
  return {
    campaigns,
    selectedCampaignId,
    sessions: sessions.map(toSessionSummary),
  };
}

export async function createCampaignSession(
  input: CreateSessionInput,
): Promise<CampaignSessionSummary> {
  const access = await requireGod();
  await requireOwnedCampaign(input.campaignId, access.user.id);
  const metadata = normalizeSessionMetadata(input);
  try {
    const [created] = await db
      .insert(campaignSession)
      .values({ campaignId: input.campaignId, ...metadata })
      .returning(sessionFields);
    if (!created) throw new Error("The Session could not be created.");
    refreshTabletop();
    return toSessionSummary(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Session ${metadata.sequenceNumber} already exists in this Campaign.`);
    }
    throw error;
  }
}

export async function updateCampaignSession(
  input: SaveSessionMetadataInput,
): Promise<CampaignSessionSummary> {
  const access = await requireGod();
  assertPositiveId(input.id, "Session");
  const metadata = normalizeSessionMetadata(input);
  const [owned] = await db
    .select({ campaignId: campaignSession.campaignId, ownerUserId: campaign.createdByUserId })
    .from(campaignSession)
    .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
    .where(eq(campaignSession.id, input.id))
    .limit(1);
  if (!owned) throw new Error("That Session no longer exists.");
  assertCampaignSessionOwner(owned.ownerUserId, access.user.id);
  try {
    const [updated] = await db
      .update(campaignSession)
      .set({ ...metadata, updatedAt: new Date() })
      .where(and(eq(campaignSession.id, input.id), eq(campaignSession.campaignId, owned.campaignId)))
      .returning(sessionFields);
    if (!updated) throw new Error("That Session no longer exists.");
    refreshTabletop();
    return toSessionSummary(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Session ${metadata.sequenceNumber} already exists in this Campaign.`);
    }
    throw error;
  }
}

async function applyLifecycleTransition(
  sessionId: number,
  transition: SessionTransition,
): Promise<CampaignSessionSummary> {
  const access = await requireGod();
  assertPositiveId(sessionId, "Session");
  try {
    const updated = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ ...sessionFields, ownerUserId: campaign.createdByUserId })
        .from(campaignSession)
        .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
        .where(eq(campaignSession.id, sessionId))
        .limit(1)
        .for("update");
      if (!locked) throw new Error("That Session no longer exists.");
      assertCampaignSessionOwner(locked.ownerUserId, access.user.id);
      const next = transitionSession(locked, transition);
      if (next.status === "active") {
        const activeRows = await tx
          .select({ id: campaignSession.id })
          .from(campaignSession)
          .where(and(
            eq(campaignSession.campaignId, locked.campaignId),
            eq(campaignSession.status, "active"),
          ));
        assertNoOtherActiveSession(activeRows.map(({ id }) => id), sessionId);
      }
      const [saved] = await tx
        .update(campaignSession)
        .set({ ...next, updatedAt: new Date() })
        .where(and(
          eq(campaignSession.id, sessionId),
          eq(campaignSession.status, locked.status),
        ))
        .returning(sessionFields);
      if (!saved) throw new Error("The Session changed before this action completed. Refresh and try again.");
      return saved;
    });
    refreshTabletop();
    return toSessionSummary(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("This Campaign already has an active Session. Complete it before starting another.");
    }
    throw error;
  }
}

export async function startCampaignSession(sessionId: number): Promise<CampaignSessionSummary> {
  return applyLifecycleTransition(sessionId, "start");
}

export async function completeCampaignSession(sessionId: number): Promise<CampaignSessionSummary> {
  return applyLifecycleTransition(sessionId, "complete");
}

export async function reopenCampaignSession(sessionId: number): Promise<CampaignSessionSummary> {
  return applyLifecycleTransition(sessionId, "reopen");
}

export async function deleteCampaignSession(sessionId: number): Promise<{ id: number; campaignId: number }> {
  const access = await requireGod();
  assertPositiveId(sessionId, "Session");
  const deleted = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({
        id: campaignSession.id,
        campaignId: campaignSession.campaignId,
        status: campaignSession.status,
        ownerUserId: campaign.createdByUserId,
      })
      .from(campaignSession)
      .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
      .where(eq(campaignSession.id, sessionId))
      .limit(1)
      .for("update");
    if (!locked) throw new Error("That Session no longer exists.");
    assertCampaignSessionOwner(locked.ownerUserId, access.user.id);
    assertSessionMayBeDeleted(locked.status);
    const [removed] = await tx
      .delete(campaignSession)
      .where(and(eq(campaignSession.id, sessionId), eq(campaignSession.status, "planned")))
      .returning({ id: campaignSession.id, campaignId: campaignSession.campaignId });
    if (!removed) throw new Error("The Session changed before deletion. Refresh and try again.");
    return removed;
  });
  refreshTabletop();
  return deleted;
}

"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { user } from "@/db/auth-schema";
import { campaign } from "@/db/campaign-schema";
import { creature } from "@/db/creature-schema";
import { campaignCharacter, campaignCreatureNpcProfile } from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionRoll,
  campaignSessionRoster,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  assertCampaignSessionOwner,
  assertNoOtherActiveSession,
  assertSessionMayBeDeleted,
  assertSessionIsEditable,
  normalizeSessionMetadata,
  transitionSession,
  type SessionMetadataInput,
  type SessionStatus,
  type SessionTransition,
} from "@/features/tabletop-operations/session-foundation";
import {
  assertRosterCampaignIntegrity,
  assertSessionRosterEditable,
  classifySessionRosterEntity,
  getSessionRosterEntityLabel,
  moveRosterEntry,
  normalizeRosterOrder,
  normalizeRosterPrepNotes,
  type SessionRosterEntityKind,
} from "@/features/tabletop-operations/session-roster";
import { readSessionCloseoutInTransaction } from "@/features/tabletop-operations/session-closeout-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
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

export type SessionRosterEntityView = {
  characterId: number;
  name: string;
  kind: SessionRosterEntityKind;
  kindLabel: string;
  playerName: string | null;
  creatureTemplateName: string | null;
};

export type SessionRosterEntryView = SessionRosterEntityView & {
  sortOrder: number;
  prepNotes: string;
};

export type SessionPrepWorkspaceData = {
  sessionId: number;
  campaignId: number;
  status: SessionStatus;
  editable: boolean;
  roster: SessionRosterEntryView[];
  available: SessionRosterEntityView[];
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

type TabletopTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockOwnedEditableSession(
  tx: TabletopTransaction,
  sessionId: number,
  userId: string,
) {
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
  assertCampaignSessionOwner(locked.ownerUserId, userId);
  assertSessionRosterEditable(locked.status);
  return locked;
}

async function normalizePersistedRosterOrder(
  tx: TabletopTransaction,
  sessionId: number,
): Promise<void> {
  const rows = await tx
    .select({ characterId: campaignSessionRoster.characterId, sortOrder: campaignSessionRoster.sortOrder })
    .from(campaignSessionRoster)
    .where(eq(campaignSessionRoster.sessionId, sessionId));
  for (const entry of normalizeRosterOrder(rows)) {
    await tx
      .update(campaignSessionRoster)
      .set({ sortOrder: entry.sortOrder, updatedAt: new Date() })
      .where(and(
        eq(campaignSessionRoster.sessionId, sessionId),
        eq(campaignSessionRoster.characterId, entry.characterId),
      ));
  }
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

export async function getSessionPrepWorkspace(
  sessionId: number,
): Promise<SessionPrepWorkspaceData> {
  const access = await requireGod();
  assertPositiveId(sessionId, "Session");
  const [context] = await db
    .select({
      sessionId: campaignSession.id,
      campaignId: campaignSession.campaignId,
      status: campaignSession.status,
      ownerUserId: campaign.createdByUserId,
    })
    .from(campaignSession)
    .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
    .where(eq(campaignSession.id, sessionId))
    .limit(1);
  if (!context) throw new Error("That Session no longer exists.");
  assertCampaignSessionOwner(context.ownerUserId, access.user.id);

  const [entityRows, rosterRows] = await Promise.all([
    db
      .select({
        characterId: campaignCharacter.id,
        name: campaignCharacter.name,
        isNpc: campaignCharacter.isNpc,
        npcKind: campaignCharacter.npcKind,
        playerName: user.name,
        playerUsername: user.username,
        creatureTemplateName: creature.canonicalName,
      })
      .from(campaignCharacter)
      .innerJoin(user, eq(user.id, campaignCharacter.playerUserId))
      .leftJoin(campaignCreatureNpcProfile, eq(campaignCreatureNpcProfile.characterId, campaignCharacter.id))
      .leftJoin(creature, eq(creature.id, campaignCreatureNpcProfile.creatureId))
      .where(eq(campaignCharacter.campaignId, context.campaignId))
      .orderBy(asc(campaignCharacter.name), asc(campaignCharacter.id)),
    db
      .select({
        characterId: campaignSessionRoster.characterId,
        sortOrder: campaignSessionRoster.sortOrder,
        prepNotes: campaignSessionRoster.prepNotes,
      })
      .from(campaignSessionRoster)
      .where(eq(campaignSessionRoster.sessionId, sessionId))
      .orderBy(asc(campaignSessionRoster.sortOrder), asc(campaignSessionRoster.createdAt), asc(campaignSessionRoster.characterId)),
  ]);
  const entities = entityRows.map((row): SessionRosterEntityView => {
    const kind = classifySessionRosterEntity(row);
    return {
      characterId: row.characterId,
      name: row.name,
      kind,
      kindLabel: getSessionRosterEntityLabel(kind),
      playerName: kind === "pc" ? row.playerUsername ?? row.playerName : null,
      creatureTemplateName: kind === "creature-npc" ? row.creatureTemplateName : null,
    };
  });
  const entityById = new Map(entities.map((entry) => [entry.characterId, entry]));
  const roster = rosterRows.flatMap((row) => {
    const entity = entityById.get(row.characterId);
    return entity ? [{ ...entity, sortOrder: row.sortOrder, prepNotes: row.prepNotes }] : [];
  });
  const rosteredIds = new Set(roster.map(({ characterId }) => characterId));
  return {
    sessionId,
    campaignId: context.campaignId,
    status: context.status,
    editable: context.status !== "completed",
    roster,
    available: entities.filter(({ characterId }) => !rosteredIds.has(characterId)),
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
  try {
    const updated = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ campaignId: campaignSession.campaignId, status: campaignSession.status, ownerUserId: campaign.createdByUserId })
        .from(campaignSession)
        .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
        .where(eq(campaignSession.id, input.id))
        .limit(1)
        .for("update");
      if (!locked) throw new Error("That Session no longer exists.");
      assertCampaignSessionOwner(locked.ownerUserId, access.user.id);
      assertSessionIsEditable(locked.status);
      const [saved] = await tx
        .update(campaignSession)
        .set({ ...metadata, updatedAt: new Date() })
        .where(and(
          eq(campaignSession.id, input.id),
          eq(campaignSession.campaignId, locked.campaignId),
          eq(campaignSession.status, locked.status),
        ))
        .returning(sessionFields);
      if (!saved) throw new Error("The Session changed before this update completed. Refresh and try again.");
      return saved;
    });
    refreshTabletop();
    return toSessionSummary(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Session ${metadata.sequenceNumber} already exists in this Campaign.`);
    }
    throw error;
  }
}

export async function addSessionRosterMember(
  sessionId: number,
  characterId: number,
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(sessionId, "Session");
  assertPositiveId(characterId, "Character");
  await db.transaction(async (tx) => {
    const locked = await lockOwnedEditableSession(tx, sessionId, access.user.id);
    const [characterRow] = await tx
      .select({ id: campaignCharacter.id, campaignId: campaignCharacter.campaignId })
      .from(campaignCharacter)
      .where(eq(campaignCharacter.id, characterId))
      .limit(1);
    if (!characterRow) throw new Error("That Character or NPC no longer exists.");
    assertRosterCampaignIntegrity(locked.campaignId, characterRow.campaignId);
    const [existing] = await tx
      .select({ characterId: campaignSessionRoster.characterId })
      .from(campaignSessionRoster)
      .where(and(
        eq(campaignSessionRoster.sessionId, sessionId),
        eq(campaignSessionRoster.characterId, characterId),
      ))
      .limit(1);
    if (existing) throw new Error("That Character or NPC is already in this Session roster.");
    const [last] = await tx
      .select({ sortOrder: campaignSessionRoster.sortOrder })
      .from(campaignSessionRoster)
      .where(eq(campaignSessionRoster.sessionId, sessionId))
      .orderBy(desc(campaignSessionRoster.sortOrder))
      .limit(1);
    await tx.insert(campaignSessionRoster).values({
      sessionId,
      campaignId: locked.campaignId,
      characterId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    });
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: locked.campaignId,
      sessionId,
      sceneId: null,
      encounterId: null,
      characterIds: [],
      category: "hierarchy",
    });
  });
  refreshTabletop();
}

export async function removeSessionRosterMember(
  sessionId: number,
  characterId: number,
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(sessionId, "Session");
  assertPositiveId(characterId, "Character");
  await db.transaction(async (tx) => {
    const locked = await lockOwnedEditableSession(tx, sessionId, access.user.id);
    const [sceneReference] = await tx
      .select({ sceneId: campaignSessionSceneMember.sceneId })
      .from(campaignSessionSceneMember)
      .where(and(
        eq(campaignSessionSceneMember.sessionId, sessionId),
        eq(campaignSessionSceneMember.characterId, characterId),
      ))
      .limit(1);
    if (sceneReference) {
      throw new Error("This roster member is used by a Scene. Remove them from editable Scenes first; completed Scene history cannot be erased.");
    }
    const removed = await tx
      .delete(campaignSessionRoster)
      .where(and(
        eq(campaignSessionRoster.sessionId, sessionId),
        eq(campaignSessionRoster.characterId, characterId),
      ))
      .returning({ characterId: campaignSessionRoster.characterId });
    if (!removed.length) throw new Error("That Character or NPC is not in this Session roster.");
    await normalizePersistedRosterOrder(tx, sessionId);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: locked.campaignId,
      sessionId,
      sceneId: null,
      encounterId: null,
      characterIds: [],
      category: "hierarchy",
    });
  });
  refreshTabletop();
}

export async function updateSessionRosterPrepNotes(
  sessionId: number,
  characterId: number,
  prepNotes: string,
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(sessionId, "Session");
  assertPositiveId(characterId, "Character");
  const normalizedNotes = normalizeRosterPrepNotes(prepNotes);
  await db.transaction(async (tx) => {
    await lockOwnedEditableSession(tx, sessionId, access.user.id);
    const updated = await tx
      .update(campaignSessionRoster)
      .set({ prepNotes: normalizedNotes, updatedAt: new Date() })
      .where(and(
        eq(campaignSessionRoster.sessionId, sessionId),
        eq(campaignSessionRoster.characterId, characterId),
      ))
      .returning({ characterId: campaignSessionRoster.characterId });
    if (!updated.length) throw new Error("That Character or NPC is not in this Session roster.");
  });
  refreshTabletop();
}

export async function moveSessionRosterMember(
  sessionId: number,
  characterId: number,
  direction: "up" | "down",
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(sessionId, "Session");
  assertPositiveId(characterId, "Character");
  if (direction !== "up" && direction !== "down") throw new Error("Roster movement is invalid.");
  await db.transaction(async (tx) => {
    await lockOwnedEditableSession(tx, sessionId, access.user.id);
    const rows = await tx
      .select({ characterId: campaignSessionRoster.characterId, sortOrder: campaignSessionRoster.sortOrder })
      .from(campaignSessionRoster)
      .where(eq(campaignSessionRoster.sessionId, sessionId));
    for (const entry of moveRosterEntry(rows, characterId, direction)) {
      await tx
        .update(campaignSessionRoster)
        .set({ sortOrder: entry.sortOrder, updatedAt: new Date() })
        .where(and(
          eq(campaignSessionRoster.sessionId, sessionId),
          eq(campaignSessionRoster.characterId, entry.characterId),
        ));
    }
  });
  refreshTabletop();
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
      if (transition === "complete") {
        const closeout = await readSessionCloseoutInTransaction(tx, {
          sessionId: locked.id,
          campaignId: locked.campaignId,
          title: locked.title,
          sequenceNumber: locked.sequenceNumber,
          status: locked.status,
          startedAt: locked.startedAt,
          completedAt: locked.completedAt,
          ownerUserId: locked.ownerUserId,
        });
        if (closeout.blockers.length) {
          throw new Error(`Session closeout is blocked: ${closeout.blockers.map(({ message }) => message).join(" ")}`);
        }
      }
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
      await publishTabletopInvalidationInTransaction(tx, {
        campaignId: locked.campaignId,
        sessionId: locked.id,
        sceneId: null,
        encounterId: null,
        characterIds: [],
        category: "hierarchy",
      });
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
    const [rollHistory] = await tx.select({ id: campaignSessionRoll.id })
      .from(campaignSessionRoll)
      .where(eq(campaignSessionRoll.sessionId, sessionId))
      .limit(1);
    if (rollHistory) throw new Error("This Session contains Roll history and cannot be deleted.");
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

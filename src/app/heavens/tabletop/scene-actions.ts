"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { assertCampaignRuntimeOperator } from "@/features/active-state/authorization";
import { campaign } from "@/db/campaign-schema";
import { campaignCharacter } from "@/db/realm-schema";
import {
  campaignSession,
  campaignSessionEncounter,
  campaignSessionEncounterParticipant,
  campaignSessionRoll,
  campaignSessionRoster,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  assertNoOtherActiveScene,
  assertParentSessionAllowsScenePreparation,
  assertSceneIsEditable,
  assertSceneMayBeDeleted,
  assertSceneMayComplete,
  assertSceneMayReopen,
  assertSceneMayStart,
  moveSceneMember,
  normalizeSceneMemberOrder,
  normalizeSceneMetadata,
  transitionScene,
  type SceneMetadataInput,
  type SceneStatus,
  type SceneTransition,
} from "@/features/tabletop-operations/scene-foundation";
import {
  assertCampaignSessionOwner,
  type SessionStatus,
} from "@/features/tabletop-operations/session-foundation";
import {
  assertOwnedRootManager,
  assertPermanentDeletionEnabled,
} from "@/features/lifecycle/policy";
import {
  assertTabletopPermanentDeletionAllowed,
  prepareTabletopLifecycleMutationInTransaction,
  recordTabletopLifecycleAuditInTransaction,
} from "@/features/lifecycle/tabletop-lifecycle-service";
import type { LifecycleActor } from "@/features/lifecycle/types";
import {
  requireGod,
  requireGodOrAdminAccessContext,
} from "@/lib/server-access";
import { expireSceneDurationsInTransaction } from "@/features/tabletop-operations/duration-lifecycle-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";

import {
  getSessionPrepWorkspace,
  type SessionRosterEntityView,
} from "./actions";

export type CampaignSceneSummary = {
  id: number;
  sessionId: number;
  campaignId: number;
  sequenceNumber: number;
  title: string;
  status: SceneStatus;
  locationLabel: string;
  description: string;
  godNotes: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
};

export type SceneMemberView = SessionRosterEntityView & {
  sortOrder: number;
};

export type CampaignSceneDetail = CampaignSceneSummary & {
  editable: boolean;
  members: SceneMemberView[];
  availableRosterMembers: SessionRosterEntityView[];
};

export type SceneWorkspaceData = {
  sessionId: number;
  campaignId: number;
  sessionStatus: SessionStatus;
  canCreate: boolean;
  canOperate: boolean;
  scenes: CampaignSceneSummary[];
  selectedSceneId: number | null;
  selectedScene: CampaignSceneDetail | null;
};

export type CreateSceneInput = SceneMetadataInput & {
  sessionId: number;
};

export type UpdateSceneInput = SceneMetadataInput & {
  id: number;
};

const sceneFields = {
  id: campaignSessionScene.id,
  sessionId: campaignSessionScene.sessionId,
  campaignId: campaignSessionScene.campaignId,
  sequenceNumber: campaignSessionScene.sequenceNumber,
  title: campaignSessionScene.title,
  status: campaignSessionScene.status,
  locationLabel: campaignSessionScene.locationLabel,
  description: campaignSessionScene.description,
  godNotes: campaignSessionScene.godNotes,
  startedAt: campaignSessionScene.startedAt,
  completedAt: campaignSessionScene.completedAt,
  createdAt: campaignSessionScene.createdAt,
  updatedAt: campaignSessionScene.updatedAt,
};

type SceneRow = {
  id: number;
  sessionId: number;
  campaignId: number;
  sequenceNumber: number;
  title: string;
  status: SceneStatus;
  locationLabel: string;
  description: string;
  godNotes: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TabletopTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toSceneSummary(row: SceneRow, memberCount = 0): CampaignSceneSummary {
  return {
    ...row,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    memberCount,
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

function refreshScenes(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
}

async function lockOwnedSession(
  tx: TabletopTransaction,
  sessionId: number,
  actingUserId: string,
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
  assertCampaignSessionOwner(locked.ownerUserId, actingUserId);
  return locked;
}

async function lockOwnedScene(
  tx: TabletopTransaction,
  sceneId: number,
  actor: string | LifecycleActor,
) {
  const [locked] = await tx
    .select({
      ...sceneFields,
      sessionStatus: campaignSession.status,
      ownerUserId: campaign.createdByUserId,
    })
    .from(campaignSessionScene)
    .innerJoin(campaignSession, eq(campaignSession.id, campaignSessionScene.sessionId))
    .innerJoin(campaign, eq(campaign.id, campaignSessionScene.campaignId))
    .where(and(
      eq(campaignSessionScene.id, sceneId),
      eq(campaignSession.campaignId, campaignSessionScene.campaignId),
    ))
    .limit(1)
    .for("update");
  if (!locked) throw new Error("That Scene no longer exists.");
  if (typeof actor === "string") {
    assertCampaignSessionOwner(locked.ownerUserId, actor);
  } else {
    assertOwnedRootManager(actor, locked.ownerUserId, "Scene");
  }
  return locked;
}

async function normalizePersistedMemberOrder(
  tx: TabletopTransaction,
  sceneId: number,
): Promise<void> {
  const rows = await tx
    .select({ characterId: campaignSessionSceneMember.characterId, sortOrder: campaignSessionSceneMember.sortOrder })
    .from(campaignSessionSceneMember)
    .where(eq(campaignSessionSceneMember.sceneId, sceneId));
  for (const entry of normalizeSceneMemberOrder(rows)) {
    await tx
      .update(campaignSessionSceneMember)
      .set({ sortOrder: entry.sortOrder, updatedAt: new Date() })
      .where(and(
        eq(campaignSessionSceneMember.sceneId, sceneId),
        eq(campaignSessionSceneMember.characterId, entry.characterId),
      ));
  }
}

export async function getSessionSceneWorkspace(
  sessionId: number,
  requestedSceneId: number | null,
): Promise<SceneWorkspaceData> {
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = {
    userId: access.session.user.id,
    roles: access.roles,
  };
  assertPositiveId(sessionId, "Session");
  const [context] = await db
    .select({
      sessionId: campaignSession.id,
      campaignId: campaignSession.campaignId,
      sessionStatus: campaignSession.status,
      ownerUserId: campaign.createdByUserId,
    })
    .from(campaignSession)
    .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
    .where(eq(campaignSession.id, sessionId))
    .limit(1);
  if (!context) throw new Error("That Session no longer exists.");
  assertOwnedRootManager(actor, context.ownerUserId, "Session");
  const canAuthor = actor.roles.includes("god") && context.ownerUserId === actor.userId;

  const [sceneRows, allMemberRows] = await Promise.all([
    db
      .select(sceneFields)
      .from(campaignSessionScene)
      .where(and(
        eq(campaignSessionScene.sessionId, sessionId),
        eq(campaignSessionScene.campaignId, context.campaignId),
      ))
      .orderBy(asc(campaignSessionScene.sequenceNumber), asc(campaignSessionScene.id)),
    db
      .select({
        sceneId: campaignSessionSceneMember.sceneId,
        characterId: campaignSessionSceneMember.characterId,
        sortOrder: campaignSessionSceneMember.sortOrder,
      })
      .from(campaignSessionSceneMember)
      .where(and(
        eq(campaignSessionSceneMember.sessionId, sessionId),
        eq(campaignSessionSceneMember.campaignId, context.campaignId),
      ))
      .orderBy(
        asc(campaignSessionSceneMember.sceneId),
        asc(campaignSessionSceneMember.sortOrder),
        asc(campaignSessionSceneMember.characterId),
      ),
  ]);
  const memberCounts = new Map<number, number>();
  for (const row of allMemberRows) memberCounts.set(row.sceneId, (memberCounts.get(row.sceneId) ?? 0) + 1);
  const scenes = sceneRows.map((row) => toSceneSummary(row, memberCounts.get(row.id) ?? 0));
  const selectedSceneId = scenes.some(({ id }) => id === requestedSceneId)
    ? requestedSceneId
    : scenes[0]?.id ?? null;
  if (selectedSceneId === null) {
    return {
      sessionId,
      campaignId: context.campaignId,
      sessionStatus: context.sessionStatus,
      canCreate: canAuthor && context.sessionStatus !== "completed",
      canOperate: canAuthor,
      scenes,
      selectedSceneId: null,
      selectedScene: null,
    };
  }

  const rosterWorkspace = await getSessionPrepWorkspace(sessionId);
  const rosterByCharacterId = new Map(
    rosterWorkspace.roster.map((entry) => [entry.characterId, entry]),
  );
  const selectedMemberRows = allMemberRows.filter(({ sceneId }) => sceneId === selectedSceneId);
  const members = selectedMemberRows.flatMap((row): SceneMemberView[] => {
    const rosterEntity = rosterByCharacterId.get(row.characterId);
    if (!rosterEntity) return [];
    return [{
      characterId: rosterEntity.characterId,
      name: rosterEntity.name,
      kind: rosterEntity.kind,
      kindLabel: rosterEntity.kindLabel,
      playerName: rosterEntity.playerName,
      creatureTemplateName: rosterEntity.creatureTemplateName,
      archived: rosterEntity.archived,
      sortOrder: row.sortOrder,
    }];
  });
  const memberIds = new Set(members.map(({ characterId }) => characterId));
  const selectedSummary = scenes.find(({ id }) => id === selectedSceneId)!;
  return {
    sessionId,
    campaignId: context.campaignId,
    sessionStatus: context.sessionStatus,
    canCreate: canAuthor && context.sessionStatus !== "completed",
    canOperate: canAuthor,
    scenes,
    selectedSceneId,
    selectedScene: {
      ...selectedSummary,
      editable: canAuthor
        && context.sessionStatus !== "completed"
        && selectedSummary.status !== "completed",
      members,
      availableRosterMembers: rosterWorkspace.roster
        .filter(({ characterId, archived }) => !archived && !memberIds.has(characterId))
        .map((entry) => ({
          characterId: entry.characterId,
          name: entry.name,
          archived: entry.archived,
          kind: entry.kind,
          kindLabel: entry.kindLabel,
          playerName: entry.playerName,
          creatureTemplateName: entry.creatureTemplateName,
        })),
    },
  };
}

export async function createCampaignSessionScene(
  input: CreateSceneInput,
): Promise<CampaignSceneSummary> {
  const access = await requireGod();
  assertPositiveId(input.sessionId, "Session");
  const metadata = normalizeSceneMetadata(input);
  try {
    const created = await db.transaction(async (tx) => {
      const session = await lockOwnedSession(tx, input.sessionId, access.user.id);
      assertParentSessionAllowsScenePreparation(session.status);
      const [row] = await tx
        .insert(campaignSessionScene)
        .values({
          sessionId: session.id,
          campaignId: session.campaignId,
          ...metadata,
        })
        .returning(sceneFields);
      if (!row) throw new Error("The Scene could not be created.");
      return row;
    });
    refreshScenes();
    return toSceneSummary(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Scene ${metadata.sequenceNumber} already exists in this Session.`);
    }
    throw error;
  }
}

export async function updateCampaignSessionScene(
  input: UpdateSceneInput,
): Promise<CampaignSceneSummary> {
  const access = await requireGod();
  assertPositiveId(input.id, "Scene");
  const metadata = normalizeSceneMetadata(input);
  try {
    const updated = await db.transaction(async (tx) => {
      const locked = await lockOwnedScene(tx, input.id, access.user.id);
      assertSceneIsEditable(locked.status, locked.sessionStatus);
      const [row] = await tx
        .update(campaignSessionScene)
        .set({ ...metadata, updatedAt: new Date() })
        .where(and(
          eq(campaignSessionScene.id, input.id),
          eq(campaignSessionScene.sessionId, locked.sessionId),
          eq(campaignSessionScene.status, locked.status),
        ))
        .returning(sceneFields);
      if (!row) throw new Error("The Scene changed before this update completed. Refresh and try again.");
      return row;
    });
    refreshScenes();
    return toSceneSummary(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Scene ${metadata.sequenceNumber} already exists in this Session.`);
    }
    throw error;
  }
}

async function applySceneLifecycleTransition(
  sceneId: number,
  transition: SceneTransition,
): Promise<CampaignSceneSummary> {
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = {
    userId: access.session.user.id,
    roles: access.roles,
  };
  assertPositiveId(sceneId, "Scene");
  try {
    const updated = await db.transaction(async (tx) => {
      const lifecycle = await prepareTabletopLifecycleMutationInTransaction(
        tx,
        { entityKind: "scene", entityId: sceneId },
        actor,
      );
      const locked = await lockOwnedScene(tx, sceneId, actor);
      assertCampaignRuntimeOperator(actor, locked.ownerUserId, "Scene");
      if (transition === "start") assertSceneMayStart(locked.sessionStatus);
      if (transition === "complete") {
        assertSceneMayComplete(locked.sessionStatus);
        const [activeEncounter] = await tx
          .select({ id: campaignSessionEncounter.id })
          .from(campaignSessionEncounter)
          .where(and(
            eq(campaignSessionEncounter.sceneId, sceneId),
            eq(campaignSessionEncounter.status, "active"),
          ))
          .limit(1);
        if (activeEncounter) {
          throw new Error("Complete the active Encounter before completing this Scene.");
        }
      }
      if (transition === "reopen") assertSceneMayReopen(locked.sessionStatus);
      const next = transitionScene(locked, transition);
      if (next.status === "active") {
        const activeRows = await tx
          .select({ id: campaignSessionScene.id })
          .from(campaignSessionScene)
          .where(and(
            eq(campaignSessionScene.sessionId, locked.sessionId),
            eq(campaignSessionScene.status, "active"),
          ));
        assertNoOtherActiveScene(activeRows.map(({ id }) => id), sceneId);
      }
      const [row] = await tx
        .update(campaignSessionScene)
        .set({ ...next, updatedAt: new Date() })
        .where(and(
          eq(campaignSessionScene.id, sceneId),
          eq(campaignSessionScene.status, locked.status),
        ))
        .returning(sceneFields);
      if (!row) throw new Error("The Scene changed before this action completed. Refresh and try again.");
      if (next.status === "completed") {
        await expireSceneDurationsInTransaction(tx, sceneId, locked.sequenceNumber);
      }
      await publishTabletopInvalidationInTransaction(tx, {
        campaignId: locked.campaignId,
        sessionId: locked.sessionId,
        sceneId,
        encounterId: null,
        characterIds: [],
        category: "hierarchy",
      });
      if (transition === "complete" || transition === "reopen") {
        await recordTabletopLifecycleAuditInTransaction(
          tx,
          actor,
          transition === "complete" ? "archive" : "restore",
          lifecycle.root,
          lifecycle.preview,
        );
      }
      return row;
    });
    refreshScenes();
    return toSceneSummary(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("This Session already has an active Scene. Complete it before starting another.");
    }
    throw error;
  }
}

export async function startCampaignSessionScene(sceneId: number): Promise<CampaignSceneSummary> {
  return applySceneLifecycleTransition(sceneId, "start");
}

export async function completeCampaignSessionScene(sceneId: number): Promise<CampaignSceneSummary> {
  return applySceneLifecycleTransition(sceneId, "complete");
}

export async function reopenCampaignSessionScene(sceneId: number): Promise<CampaignSceneSummary> {
  return applySceneLifecycleTransition(sceneId, "reopen");
}

export async function deleteCampaignSessionScene(sceneId: number): Promise<{ id: number; sessionId: number }> {
  assertPermanentDeletionEnabled();
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = {
    userId: access.session.user.id,
    roles: access.roles,
  };
  assertPositiveId(sceneId, "Scene");
  const deleted = await db.transaction(async (tx) => {
    assertPermanentDeletionEnabled();
    const lifecycle = await prepareTabletopLifecycleMutationInTransaction(
      tx,
      { entityKind: "scene", entityId: sceneId },
      actor,
    );
    assertTabletopPermanentDeletionAllowed(lifecycle.preview);
    const locked = await lockOwnedScene(tx, sceneId, actor);
    assertParentSessionAllowsScenePreparation(locked.sessionStatus);
    assertSceneMayBeDeleted(locked.status);
    const [rollHistory] = await tx.select({ id: campaignSessionRoll.id })
      .from(campaignSessionRoll)
      .where(eq(campaignSessionRoll.sceneId, sceneId))
      .limit(1);
    if (rollHistory) throw new Error("This Scene contains Roll history and cannot be deleted.");
    await recordTabletopLifecycleAuditInTransaction(
      tx,
      actor,
      "delete",
      lifecycle.root,
      lifecycle.preview,
    );
    const [row] = await tx
      .delete(campaignSessionScene)
      .where(and(
        eq(campaignSessionScene.id, sceneId),
        eq(campaignSessionScene.status, "planned"),
      ))
      .returning({ id: campaignSessionScene.id, sessionId: campaignSessionScene.sessionId });
    if (!row) throw new Error("The Scene changed before deletion. Refresh and try again.");
    return row;
  });
  refreshScenes();
  return deleted;
}

export async function addCampaignSessionSceneMember(
  sceneId: number,
  characterId: number,
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(sceneId, "Scene");
  assertPositiveId(characterId, "Character");
  await db.transaction(async (tx) => {
    const locked = await lockOwnedScene(tx, sceneId, access.user.id);
    assertSceneIsEditable(locked.status, locked.sessionStatus);
    const [rosterEntry] = await tx
      .select({
        characterId: campaignSessionRoster.characterId,
        archivedAt: campaignCharacter.archivedAt,
      })
      .from(campaignSessionRoster)
      .innerJoin(campaignCharacter, and(
        eq(campaignCharacter.id, campaignSessionRoster.characterId),
        eq(campaignCharacter.campaignId, campaignSessionRoster.campaignId),
      ))
      .where(and(
        eq(campaignSessionRoster.sessionId, locked.sessionId),
        eq(campaignSessionRoster.campaignId, locked.campaignId),
        eq(campaignSessionRoster.characterId, characterId),
      ))
      .limit(1);
    if (!rosterEntry) throw new Error("A Scene member must already belong to that Session's Roster.");
    if (rosterEntry.archivedAt) {
      throw new Error("Archived Characters and NPCs cannot be added to a Scene. Restore this record first.");
    }
    const [existing] = await tx
      .select({ characterId: campaignSessionSceneMember.characterId })
      .from(campaignSessionSceneMember)
      .where(and(
        eq(campaignSessionSceneMember.sceneId, sceneId),
        eq(campaignSessionSceneMember.characterId, characterId),
      ))
      .limit(1);
    if (existing) throw new Error("That Character or NPC is already in this Scene.");
    const [last] = await tx
      .select({ sortOrder: campaignSessionSceneMember.sortOrder })
      .from(campaignSessionSceneMember)
      .where(eq(campaignSessionSceneMember.sceneId, sceneId))
      .orderBy(desc(campaignSessionSceneMember.sortOrder))
      .limit(1);
    await tx.insert(campaignSessionSceneMember).values({
      sceneId,
      sessionId: locked.sessionId,
      campaignId: locked.campaignId,
      characterId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    });
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: locked.campaignId,
      sessionId: locked.sessionId,
      sceneId,
      encounterId: null,
      characterIds: [],
      category: "hierarchy",
    });
  });
  refreshScenes();
}

export async function removeCampaignSessionSceneMember(
  sceneId: number,
  characterId: number,
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(sceneId, "Scene");
  assertPositiveId(characterId, "Character");
  await db.transaction(async (tx) => {
    const locked = await lockOwnedScene(tx, sceneId, access.user.id);
    assertSceneIsEditable(locked.status, locked.sessionStatus);
    const [encounterUse] = await tx
      .select({ encounterId: campaignSessionEncounterParticipant.encounterId })
      .from(campaignSessionEncounterParticipant)
      .where(and(
        eq(campaignSessionEncounterParticipant.sceneId, sceneId),
        eq(campaignSessionEncounterParticipant.characterId, characterId),
      ))
      .limit(1);
    if (encounterUse) {
      throw new Error("This Scene member is used by an Encounter. Remove them from editable Encounters first; completed Encounter history cannot be erased.");
    }
    const removed = await tx
      .delete(campaignSessionSceneMember)
      .where(and(
        eq(campaignSessionSceneMember.sceneId, sceneId),
        eq(campaignSessionSceneMember.characterId, characterId),
      ))
      .returning({ characterId: campaignSessionSceneMember.characterId });
    if (!removed.length) throw new Error("That Character or NPC is not in this Scene.");
    await normalizePersistedMemberOrder(tx, sceneId);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: locked.campaignId,
      sessionId: locked.sessionId,
      sceneId,
      encounterId: null,
      characterIds: [],
      category: "hierarchy",
    });
  });
  refreshScenes();
}

export async function moveCampaignSessionSceneMember(
  sceneId: number,
  characterId: number,
  direction: "up" | "down",
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(sceneId, "Scene");
  assertPositiveId(characterId, "Character");
  if (direction !== "up" && direction !== "down") throw new Error("Scene member movement is invalid.");
  await db.transaction(async (tx) => {
    const locked = await lockOwnedScene(tx, sceneId, access.user.id);
    assertSceneIsEditable(locked.status, locked.sessionStatus);
    const rows = await tx
      .select({ characterId: campaignSessionSceneMember.characterId, sortOrder: campaignSessionSceneMember.sortOrder })
      .from(campaignSessionSceneMember)
      .where(eq(campaignSessionSceneMember.sceneId, sceneId));
    for (const entry of moveSceneMember(rows, characterId, direction)) {
      await tx
        .update(campaignSessionSceneMember)
        .set({ sortOrder: entry.sortOrder, updatedAt: new Date() })
        .where(and(
          eq(campaignSessionSceneMember.sceneId, sceneId),
          eq(campaignSessionSceneMember.characterId, entry.characterId),
        ));
    }
  });
  refreshScenes();
}

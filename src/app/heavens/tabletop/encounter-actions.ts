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
  campaignSessionEncounterInitiative,
  campaignSessionEncounterInitiativeParticipant,
  campaignSessionEncounterParticipant,
  campaignSessionRoll,
  campaignSessionScene,
  campaignSessionSceneMember,
} from "@/db/tabletop-operations-schema";
import {
  assertEncounterIsEditable,
  assertEncounterMayBeDeleted,
  assertNoOtherActiveEncounter,
  assertParentsAllowEncounterPreparation,
  assertParentsAllowLiveEncounter,
  moveParticipant,
  normalizeEncounterMetadata,
  normalizeParticipantOrder,
  normalizeParticipantPrepNotes,
  transitionEncounter,
  type EncounterMetadataInput,
  type EncounterStatus,
  type EncounterTransition,
  type EncounterType,
} from "@/features/tabletop-operations/encounter-foundation";
import { assertCampaignSessionOwner, type SessionStatus } from "@/features/tabletop-operations/session-foundation";
import type { SceneStatus } from "@/features/tabletop-operations/scene-foundation";
import {
  finalizeEncounterCloseoutInTransaction,
  lockEncounterCloseoutContextInTransaction,
} from "@/features/tabletop-operations/encounter-closeout-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import {
  assertOwnedRootManager,
  assertPermanentDeletionEnabled,
  canManageOwnedRoot,
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

import { getSessionSceneWorkspace, type SceneMemberView } from "./scene-actions";

export type CampaignEncounterSummary = {
  id: number;
  sceneId: number;
  sessionId: number;
  campaignId: number;
  sequenceNumber: number;
  title: string;
  status: EncounterStatus;
  encounterType: EncounterType;
  description: string;
  godNotes: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  participantCount: number;
};

export type EncounterParticipantView = {
  participantId: number;
  characterId: number;
  creatureId: number | null;
  name: string;
  kind: SceneMemberView["kind"] | "creature";
  kindLabel: string;
  playerName: string | null;
  creatureTemplateName: string | null;
  sortOrder: number;
  prepNotes: string;
};

export type CampaignEncounterDetail = CampaignEncounterSummary & {
  editable: boolean;
  participants: EncounterParticipantView[];
  availableSceneMembers: SceneMemberView[];
};

export type EncounterWorkspaceData = {
  sceneId: number;
  sessionId: number;
  campaignId: number;
  sceneStatus: SceneStatus;
  sessionStatus: SessionStatus;
  canCreate: boolean;
  canManagePersistent: boolean;
  canOperate: boolean;
  encounters: CampaignEncounterSummary[];
  selectedEncounterId: number | null;
  selectedEncounter: CampaignEncounterDetail | null;
};

export type CreateEncounterInput = EncounterMetadataInput & { sceneId: number };
export type UpdateEncounterInput = EncounterMetadataInput & { id: number };

const encounterFields = {
  id: campaignSessionEncounter.id,
  sceneId: campaignSessionEncounter.sceneId,
  sessionId: campaignSessionEncounter.sessionId,
  campaignId: campaignSessionEncounter.campaignId,
  sequenceNumber: campaignSessionEncounter.sequenceNumber,
  title: campaignSessionEncounter.title,
  status: campaignSessionEncounter.status,
  encounterType: campaignSessionEncounter.encounterType,
  description: campaignSessionEncounter.description,
  godNotes: campaignSessionEncounter.godNotes,
  startedAt: campaignSessionEncounter.startedAt,
  completedAt: campaignSessionEncounter.completedAt,
  createdAt: campaignSessionEncounter.createdAt,
  updatedAt: campaignSessionEncounter.updatedAt,
};

type EncounterRow = {
  id: number;
  sceneId: number;
  sessionId: number;
  campaignId: number;
  sequenceNumber: number;
  title: string;
  status: EncounterStatus;
  encounterType: EncounterType;
  description: string;
  godNotes: string;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TabletopTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function assertPositiveId(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} is invalid.`);
}

function assertParticipantKey(value: number): void {
  if (!Number.isSafeInteger(value) || value === 0) throw new Error("Encounter Participant is invalid.");
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

function toEncounterSummary(row: EncounterRow, participantCount = 0): CampaignEncounterSummary {
  return {
    ...row,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    participantCount,
  };
}

function refreshEncounters(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
}

async function publishEncounterHierarchy(
  tx: TabletopTransaction,
  context: { campaignId: number; sessionId: number; sceneId: number; id?: number; encounterId?: number },
  characterIds: number[] = [],
): Promise<void> {
  await publishTabletopInvalidationInTransaction(tx, {
    campaignId: context.campaignId,
    sessionId: context.sessionId,
    sceneId: context.sceneId,
    encounterId: context.encounterId ?? context.id ?? null,
    characterIds,
    category: "hierarchy",
  });
}

async function lockOwnedScene(tx: TabletopTransaction, sceneId: number, actingUserId: string) {
  const [locked] = await tx
    .select({
      id: campaignSessionScene.id,
      sessionId: campaignSessionScene.sessionId,
      campaignId: campaignSessionScene.campaignId,
      status: campaignSessionScene.status,
      sessionStatus: campaignSession.status,
      ownerUserId: campaign.createdByUserId,
    })
    .from(campaignSessionScene)
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionScene.sessionId),
      eq(campaignSession.campaignId, campaignSessionScene.campaignId),
    ))
    .innerJoin(campaign, eq(campaign.id, campaignSessionScene.campaignId))
    .where(eq(campaignSessionScene.id, sceneId))
    .limit(1)
    .for("update");
  if (!locked) throw new Error("That Scene no longer exists.");
  assertCampaignSessionOwner(locked.ownerUserId, actingUserId);
  return locked;
}

async function lockOwnedEncounter(
  tx: TabletopTransaction,
  encounterId: number,
  actor: string | LifecycleActor,
) {
  const [locked] = await tx
    .select({
      ...encounterFields,
      sceneStatus: campaignSessionScene.status,
      sessionStatus: campaignSession.status,
      ownerUserId: campaign.createdByUserId,
    })
    .from(campaignSessionEncounter)
    .innerJoin(campaignSessionScene, and(
      eq(campaignSessionScene.id, campaignSessionEncounter.sceneId),
      eq(campaignSessionScene.sessionId, campaignSessionEncounter.sessionId),
      eq(campaignSessionScene.campaignId, campaignSessionEncounter.campaignId),
    ))
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionEncounter.sessionId),
      eq(campaignSession.campaignId, campaignSessionEncounter.campaignId),
    ))
    .innerJoin(campaign, eq(campaign.id, campaignSessionEncounter.campaignId))
    .where(eq(campaignSessionEncounter.id, encounterId))
    .limit(1)
    .for("update");
  if (!locked) throw new Error("That Encounter no longer exists.");
  if (typeof actor === "string") {
    assertCampaignSessionOwner(locked.ownerUserId, actor);
  } else {
    assertOwnedRootManager(actor, locked.ownerUserId, "Encounter");
  }
  return locked;
}

async function normalizePersistedParticipantOrder(
  tx: TabletopTransaction,
  encounterId: number,
): Promise<void> {
  const rows = await tx
    .select({
      characterId: campaignSessionEncounterParticipant.characterId,
      sortOrder: campaignSessionEncounterParticipant.sortOrder,
    })
    .from(campaignSessionEncounterParticipant)
    .where(eq(campaignSessionEncounterParticipant.encounterId, encounterId));
  for (const entry of normalizeParticipantOrder(rows)) {
    await tx
      .update(campaignSessionEncounterParticipant)
      .set({ sortOrder: entry.sortOrder, updatedAt: new Date() })
      .where(and(
        eq(campaignSessionEncounterParticipant.encounterId, encounterId),
        eq(campaignSessionEncounterParticipant.characterId, entry.characterId),
      ));
  }
}

export async function getSceneEncounterWorkspace(
  sceneId: number,
  requestedEncounterId: number | null,
): Promise<EncounterWorkspaceData> {
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = {
    userId: access.session.user.id,
    roles: access.roles,
  };
  assertPositiveId(sceneId, "Scene");
  const [context] = await db
    .select({
      sceneId: campaignSessionScene.id,
      sceneStatus: campaignSessionScene.status,
      sessionId: campaignSessionScene.sessionId,
      sessionStatus: campaignSession.status,
      campaignId: campaignSessionScene.campaignId,
      ownerUserId: campaign.createdByUserId,
    })
    .from(campaignSessionScene)
    .innerJoin(campaignSession, and(
      eq(campaignSession.id, campaignSessionScene.sessionId),
      eq(campaignSession.campaignId, campaignSessionScene.campaignId),
    ))
    .innerJoin(campaign, eq(campaign.id, campaignSessionScene.campaignId))
    .where(eq(campaignSessionScene.id, sceneId))
    .limit(1);
  if (!context) throw new Error("That Scene no longer exists.");
  assertOwnedRootManager(actor, context.ownerUserId, "Scene");
  const canAuthor = actor.roles.includes("god") && context.ownerUserId === actor.userId;

  const [encounterRows, participantRows] = await Promise.all([
    db
      .select(encounterFields)
      .from(campaignSessionEncounter)
      .where(and(
        eq(campaignSessionEncounter.sceneId, sceneId),
        eq(campaignSessionEncounter.sessionId, context.sessionId),
        eq(campaignSessionEncounter.campaignId, context.campaignId),
      ))
      .orderBy(asc(campaignSessionEncounter.sequenceNumber), asc(campaignSessionEncounter.id)),
    db
      .select({
        participantId: campaignSessionEncounterParticipant.participantId,
        encounterId: campaignSessionEncounterParticipant.encounterId,
        characterId: campaignSessionEncounterParticipant.characterId,
        participantKind: campaignSessionEncounterParticipant.participantKind,
        creatureId: campaignSessionEncounterParticipant.creatureId,
        displayLabel: campaignSessionEncounterParticipant.displayLabel,
        sortOrder: campaignSessionEncounterParticipant.sortOrder,
        prepNotes: campaignSessionEncounterParticipant.prepNotes,
      })
      .from(campaignSessionEncounterParticipant)
      .where(and(
        eq(campaignSessionEncounterParticipant.sceneId, sceneId),
        eq(campaignSessionEncounterParticipant.sessionId, context.sessionId),
        eq(campaignSessionEncounterParticipant.campaignId, context.campaignId),
      ))
      .orderBy(
        asc(campaignSessionEncounterParticipant.encounterId),
        asc(campaignSessionEncounterParticipant.sortOrder),
        asc(campaignSessionEncounterParticipant.characterId),
      ),
  ]);
  const participantCounts = new Map<number, number>();
  for (const row of participantRows) {
    participantCounts.set(row.encounterId, (participantCounts.get(row.encounterId) ?? 0) + 1);
  }
  const encounters = encounterRows.map((row) => toEncounterSummary(row, participantCounts.get(row.id) ?? 0));
  const selectedEncounterId = encounters.some(({ id }) => id === requestedEncounterId)
    ? requestedEncounterId
    : encounters[0]?.id ?? null;
  if (selectedEncounterId === null) {
    return {
      sceneId,
      sessionId: context.sessionId,
      campaignId: context.campaignId,
      sceneStatus: context.sceneStatus,
      sessionStatus: context.sessionStatus,
      canCreate: canAuthor
        && context.sessionStatus !== "completed"
        && context.sceneStatus !== "completed",
      canManagePersistent: canManageOwnedRoot(actor, context.ownerUserId),
      canOperate: canAuthor,
      encounters,
      selectedEncounterId: null,
      selectedEncounter: null,
    };
  }

  const sceneWorkspace = await getSessionSceneWorkspace(context.sessionId, sceneId);
  const scene = sceneWorkspace.selectedScene;
  if (!scene || scene.id !== sceneId) throw new Error("That Scene is no longer available.");
  const membersByCharacterId = new Map(scene.members.map((entry) => [entry.characterId, entry]));
  const selectedParticipantRows = participantRows.filter(({ encounterId }) => encounterId === selectedEncounterId);
  const participants = selectedParticipantRows
    .flatMap((row): EncounterParticipantView[] => {
      if (row.participantKind === "creature" && row.creatureId !== null) {
        return [{
          participantId: row.participantId,
          characterId: row.characterId,
          creatureId: row.creatureId,
          name: row.displayLabel,
          kind: "creature",
          kindLabel: "Encounter Creature",
          playerName: null,
          creatureTemplateName: row.displayLabel.replace(/ \d+$/, ""),
          sortOrder: row.sortOrder,
          prepNotes: row.prepNotes,
        }];
      }
      const member = membersByCharacterId.get(row.characterId);
      return member ? [{ participantId: row.participantId, creatureId: null, ...member, sortOrder: row.sortOrder, prepNotes: row.prepNotes }] : [];
    });
  const participantIds = new Set(participants.map(({ characterId }) => characterId));
  const selectedSummary = encounters.find(({ id }) => id === selectedEncounterId)!;
  return {
    sceneId,
    sessionId: context.sessionId,
    campaignId: context.campaignId,
    sceneStatus: context.sceneStatus,
    sessionStatus: context.sessionStatus,
    canCreate: canAuthor
      && context.sessionStatus !== "completed"
      && context.sceneStatus !== "completed",
    canManagePersistent: canManageOwnedRoot(actor, context.ownerUserId),
    canOperate: canAuthor,
    encounters,
    selectedEncounterId,
    selectedEncounter: {
      ...selectedSummary,
      editable: canAuthor
        && context.sessionStatus !== "completed"
        && context.sceneStatus !== "completed"
        && selectedSummary.status !== "completed",
      participants,
      availableSceneMembers: scene.members.filter(({ characterId, archived }) => (
        !archived && !participantIds.has(characterId)
      )),
    },
  };
}

export async function createCampaignSessionEncounter(
  input: CreateEncounterInput,
): Promise<CampaignEncounterSummary> {
  const access = await requireGod();
  assertPositiveId(input.sceneId, "Scene");
  const metadata = normalizeEncounterMetadata(input);
  try {
    const created = await db.transaction(async (tx) => {
      const scene = await lockOwnedScene(tx, input.sceneId, access.user.id);
      assertParentsAllowEncounterPreparation(scene.sessionStatus, scene.status);
      const [row] = await tx
        .insert(campaignSessionEncounter)
        .values({
          sceneId: scene.id,
          sessionId: scene.sessionId,
          campaignId: scene.campaignId,
          ...metadata,
        })
        .returning(encounterFields);
      if (!row) throw new Error("The Encounter could not be created.");
      return row;
    });
    refreshEncounters();
    return toEncounterSummary(created);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Encounter ${metadata.sequenceNumber} already exists in this Scene.`);
    }
    throw error;
  }
}

export async function updateCampaignSessionEncounter(
  input: UpdateEncounterInput,
): Promise<CampaignEncounterSummary> {
  const access = await requireGod();
  assertPositiveId(input.id, "Encounter");
  const metadata = normalizeEncounterMetadata(input);
  try {
    const updated = await db.transaction(async (tx) => {
      const locked = await lockOwnedEncounter(tx, input.id, access.user.id);
      assertEncounterIsEditable(locked.status, locked.sessionStatus, locked.sceneStatus);
      const [row] = await tx
        .update(campaignSessionEncounter)
        .set({ ...metadata, updatedAt: new Date() })
        .where(and(
          eq(campaignSessionEncounter.id, input.id),
          eq(campaignSessionEncounter.status, locked.status),
        ))
        .returning(encounterFields);
      if (!row) throw new Error("The Encounter changed before this update completed. Refresh and try again.");
      await publishEncounterHierarchy(tx, locked);
      return row;
    });
    refreshEncounters();
    return toEncounterSummary(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`Encounter ${metadata.sequenceNumber} already exists in this Scene.`);
    }
    throw error;
  }
}

async function applyEncounterLifecycleTransition(
  encounterId: number,
  transition: EncounterTransition,
): Promise<CampaignEncounterSummary> {
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = {
    userId: access.session.user.id,
    roles: access.roles,
  };
  assertPositiveId(encounterId, "Encounter");
  try {
    const updated = await db.transaction(async (tx) => {
      const lifecycle = await prepareTabletopLifecycleMutationInTransaction(
        tx,
        { entityKind: "encounter", entityId: encounterId },
        actor,
      );
      const locked = await lockOwnedEncounter(tx, encounterId, actor);
      assertCampaignRuntimeOperator(actor, locked.ownerUserId, "Encounter");
      assertParentsAllowLiveEncounter(locked.sessionStatus, locked.sceneStatus);
      const next = transitionEncounter(locked, transition);
      if (next.status === "active") {
        const activeRows = await tx
          .select({ id: campaignSessionEncounter.id })
          .from(campaignSessionEncounter)
          .where(and(
            eq(campaignSessionEncounter.sceneId, locked.sceneId),
            eq(campaignSessionEncounter.status, "active"),
          ));
        assertNoOtherActiveEncounter(activeRows.map(({ id }) => id), encounterId);
      }
      if (next.status === "completed") {
        const [activeInitiative] = await tx
          .select({ encounterId: campaignSessionEncounterInitiative.encounterId })
          .from(campaignSessionEncounterInitiative)
          .where(and(
            eq(campaignSessionEncounterInitiative.encounterId, encounterId),
            eq(campaignSessionEncounterInitiative.status, "active"),
          ))
          .limit(1);
        if (activeInitiative) {
          throw new Error("Close the active Initiative Runtime before completing this Encounter.");
        }
      }
      const [row] = await tx
        .update(campaignSessionEncounter)
        .set({ ...next, updatedAt: new Date() })
        .where(and(
          eq(campaignSessionEncounter.id, encounterId),
          eq(campaignSessionEncounter.status, locked.status),
        ))
        .returning(encounterFields);
      if (!row) throw new Error("The Encounter changed before this action completed. Refresh and try again.");
      await publishEncounterHierarchy(tx, locked);
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
    refreshEncounters();
    return toEncounterSummary(updated);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("This Scene already has an active Encounter. Complete it before starting another.");
    }
    throw error;
  }
}

export async function startCampaignSessionEncounter(encounterId: number): Promise<CampaignEncounterSummary> {
  return applyEncounterLifecycleTransition(encounterId, "start");
}

export async function completeCampaignSessionEncounter(encounterId: number): Promise<CampaignEncounterSummary> {
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = {
    userId: access.session.user.id,
    roles: access.roles,
  };
  assertPositiveId(encounterId, "Encounter");
  const completed = await db.transaction(async (tx) => {
    const lifecycle = await prepareTabletopLifecycleMutationInTransaction(
      tx,
      { entityKind: "encounter", entityId: encounterId },
      actor,
    );
    const context = await lockEncounterCloseoutContextInTransaction(tx, encounterId, actor);
    assertCampaignRuntimeOperator(actor, context.ownerUserId, "Encounter closeout");
    await finalizeEncounterCloseoutInTransaction(tx, context, { awards: [] });
    await publishEncounterHierarchy(tx, context);
    await recordTabletopLifecycleAuditInTransaction(
      tx,
      actor,
      "archive",
      lifecycle.root,
      lifecycle.preview,
    );
    const [row] = await tx.select(encounterFields).from(campaignSessionEncounter)
      .where(eq(campaignSessionEncounter.id, encounterId)).limit(1);
    if (!row) throw new Error("That Encounter no longer exists.");
    return row;
  });
  refreshEncounters();
  return toEncounterSummary(completed);
}

export async function reopenCampaignSessionEncounter(encounterId: number): Promise<CampaignEncounterSummary> {
  return applyEncounterLifecycleTransition(encounterId, "reopen");
}

export async function deleteCampaignSessionEncounter(
  encounterId: number,
): Promise<{ id: number; sceneId: number }> {
  assertPermanentDeletionEnabled();
  const access = await requireGodOrAdminAccessContext();
  const actor: LifecycleActor = {
    userId: access.session.user.id,
    roles: access.roles,
  };
  assertPositiveId(encounterId, "Encounter");
  const deleted = await db.transaction(async (tx) => {
    assertPermanentDeletionEnabled();
    const lifecycle = await prepareTabletopLifecycleMutationInTransaction(
      tx,
      { entityKind: "encounter", entityId: encounterId },
      actor,
    );
    assertTabletopPermanentDeletionAllowed(lifecycle.preview);
    const locked = await lockOwnedEncounter(tx, encounterId, actor);
    assertParentsAllowEncounterPreparation(locked.sessionStatus, locked.sceneStatus);
    assertEncounterMayBeDeleted(locked.status);
    const [initiativeHistory] = await tx
      .select({ encounterId: campaignSessionEncounterInitiative.encounterId })
      .from(campaignSessionEncounterInitiative)
      .where(eq(campaignSessionEncounterInitiative.encounterId, encounterId))
      .limit(1);
    if (initiativeHistory) {
      throw new Error("This Encounter has Initiative history and cannot be deleted.");
    }
    const [rollHistory] = await tx.select({ id: campaignSessionRoll.id })
      .from(campaignSessionRoll)
      .where(eq(campaignSessionRoll.encounterId, encounterId))
      .limit(1);
    if (rollHistory) throw new Error("This Encounter contains Roll history and cannot be deleted.");
    await recordTabletopLifecycleAuditInTransaction(
      tx,
      actor,
      "delete",
      lifecycle.root,
      lifecycle.preview,
    );
    const [row] = await tx
      .delete(campaignSessionEncounter)
      .where(and(
        eq(campaignSessionEncounter.id, encounterId),
        eq(campaignSessionEncounter.status, "planned"),
      ))
      .returning({ id: campaignSessionEncounter.id, sceneId: campaignSessionEncounter.sceneId });
    if (!row) throw new Error("The Encounter changed before deletion. Refresh and try again.");
    return row;
  });
  refreshEncounters();
  return deleted;
}

export async function addCampaignSessionEncounterParticipant(
  encounterId: number,
  characterId: number,
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(encounterId, "Encounter");
  assertPositiveId(characterId, "Character");
  await db.transaction(async (tx) => {
    const locked = await lockOwnedEncounter(tx, encounterId, access.user.id);
    assertEncounterIsEditable(locked.status, locked.sessionStatus, locked.sceneStatus);
    const [sceneMember] = await tx
      .select({
        characterId: campaignSessionSceneMember.characterId,
        archivedAt: campaignCharacter.archivedAt,
      })
      .from(campaignSessionSceneMember)
      .innerJoin(campaignCharacter, and(
        eq(campaignCharacter.id, campaignSessionSceneMember.characterId),
        eq(campaignCharacter.campaignId, campaignSessionSceneMember.campaignId),
      ))
      .where(and(
        eq(campaignSessionSceneMember.sceneId, locked.sceneId),
        eq(campaignSessionSceneMember.sessionId, locked.sessionId),
        eq(campaignSessionSceneMember.campaignId, locked.campaignId),
        eq(campaignSessionSceneMember.characterId, characterId),
      ))
      .limit(1);
    if (!sceneMember) throw new Error("An Encounter Participant must already belong to that Scene.");
    if (sceneMember.archivedAt) {
      throw new Error("Archived Characters and NPCs cannot be added to an Encounter. Restore this record first.");
    }
    const [existing] = await tx
      .select({ characterId: campaignSessionEncounterParticipant.characterId })
      .from(campaignSessionEncounterParticipant)
      .where(and(
        eq(campaignSessionEncounterParticipant.encounterId, encounterId),
        eq(campaignSessionEncounterParticipant.characterId, characterId),
      ))
      .limit(1);
    if (existing) throw new Error("That Character or NPC is already participating in this Encounter.");
    const [last] = await tx
      .select({ sortOrder: campaignSessionEncounterParticipant.sortOrder })
      .from(campaignSessionEncounterParticipant)
      .where(eq(campaignSessionEncounterParticipant.encounterId, encounterId))
      .orderBy(desc(campaignSessionEncounterParticipant.sortOrder))
      .limit(1);
    await tx.insert(campaignSessionEncounterParticipant).values({
      encounterId,
      sceneId: locked.sceneId,
      sessionId: locked.sessionId,
      campaignId: locked.campaignId,
      characterId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    });
    await publishEncounterHierarchy(tx, locked, [characterId]);
  });
  refreshEncounters();
}

export async function removeCampaignSessionEncounterParticipant(
  encounterId: number,
  characterId: number,
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(encounterId, "Encounter");
  assertParticipantKey(characterId);
  await db.transaction(async (tx) => {
    const locked = await lockOwnedEncounter(tx, encounterId, access.user.id);
    assertEncounterIsEditable(locked.status, locked.sessionStatus, locked.sceneStatus);
    const [initiativeHistory] = await tx
      .select({ characterId: campaignSessionEncounterInitiativeParticipant.characterId })
      .from(campaignSessionEncounterInitiativeParticipant)
      .where(and(
        eq(campaignSessionEncounterInitiativeParticipant.encounterId, encounterId),
        eq(campaignSessionEncounterInitiativeParticipant.characterId, characterId),
      ))
      .limit(1);
    if (initiativeHistory) {
      throw new Error("This Encounter Participant has Initiative runtime or history attached and cannot be removed.");
    }
    const removed = await tx
      .delete(campaignSessionEncounterParticipant)
      .where(and(
        eq(campaignSessionEncounterParticipant.encounterId, encounterId),
        eq(campaignSessionEncounterParticipant.characterId, characterId),
      ))
      .returning({ characterId: campaignSessionEncounterParticipant.characterId });
    if (!removed.length) throw new Error("That Character or NPC is not an Encounter Participant.");
    await normalizePersistedParticipantOrder(tx, encounterId);
    await publishEncounterHierarchy(tx, locked, characterId > 0 ? [characterId] : []);
  });
  refreshEncounters();
}

export async function moveCampaignSessionEncounterParticipant(
  encounterId: number,
  characterId: number,
  direction: "up" | "down",
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(encounterId, "Encounter");
  assertParticipantKey(characterId);
  if (direction !== "up" && direction !== "down") throw new Error("Encounter Participant movement is invalid.");
  await db.transaction(async (tx) => {
    const locked = await lockOwnedEncounter(tx, encounterId, access.user.id);
    assertEncounterIsEditable(locked.status, locked.sessionStatus, locked.sceneStatus);
    const rows = await tx
      .select({
        characterId: campaignSessionEncounterParticipant.characterId,
        sortOrder: campaignSessionEncounterParticipant.sortOrder,
      })
      .from(campaignSessionEncounterParticipant)
      .where(eq(campaignSessionEncounterParticipant.encounterId, encounterId));
    for (const entry of moveParticipant(rows, characterId, direction)) {
      await tx
        .update(campaignSessionEncounterParticipant)
        .set({ sortOrder: entry.sortOrder, updatedAt: new Date() })
        .where(and(
          eq(campaignSessionEncounterParticipant.encounterId, encounterId),
          eq(campaignSessionEncounterParticipant.characterId, entry.characterId),
        ));
    }
  });
  refreshEncounters();
}

export async function updateEncounterParticipantPrepNotes(
  encounterId: number,
  characterId: number,
  prepNotes: string,
): Promise<void> {
  const access = await requireGod();
  assertPositiveId(encounterId, "Encounter");
  assertParticipantKey(characterId);
  const normalizedNotes = normalizeParticipantPrepNotes(prepNotes);
  await db.transaction(async (tx) => {
    const locked = await lockOwnedEncounter(tx, encounterId, access.user.id);
    assertEncounterIsEditable(locked.status, locked.sessionStatus, locked.sceneStatus);
    const updated = await tx
      .update(campaignSessionEncounterParticipant)
      .set({ prepNotes: normalizedNotes, updatedAt: new Date() })
      .where(and(
        eq(campaignSessionEncounterParticipant.encounterId, encounterId),
        eq(campaignSessionEncounterParticipant.characterId, characterId),
      ))
      .returning({ characterId: campaignSessionEncounterParticipant.characterId });
    if (!updated.length) throw new Error("That Character or NPC is not an Encounter Participant.");
  });
  refreshEncounters();
}

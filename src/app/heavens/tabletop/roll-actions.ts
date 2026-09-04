"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignSession } from "@/db/tabletop-operations-schema";
import {
  readRollLedgerInTransaction,
  readRollWorkspaceInTransaction,
  correctRollInTransaction,
  recordRollRulingInTransaction,
  recordRollInTransaction,
  voidRollInTransaction,
  type AuthorizedRollActor,
  type RollLedgerFilters,
  type RollLedgerPage,
  type RollLedgerEntry,
  type RollWorkspaceView,
  type RollCorrectionRequest,
  type RollRulingRequest,
} from "@/features/tabletop-operations/roll-runtime-service";
import type { RollRecordRequest } from "@/features/tabletop-operations/roll-runtime";
import {
  recordGodWeaponGovernanceRollInTransaction,
  type GodWeaponGovernanceRollRequest,
} from "@/features/items/weapon-governance-management-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function refreshRolls(): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath("/heavens");
}

async function getGodRollActor(
  tx: Transaction,
  sessionId: number,
  userId: string,
): Promise<AuthorizedRollActor> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) throw new Error("Session is invalid.");
  const [context] = await tx.select({
    campaignId: campaignSession.campaignId,
    ownerUserId: campaign.createdByUserId,
  }).from(campaignSession)
    .innerJoin(campaign, eq(campaign.id, campaignSession.campaignId))
    .where(and(eq(campaignSession.id, sessionId), eq(campaign.createdByUserId, userId)))
    .limit(1);
  if (!context) throw new Error("Only the Campaign-owning G.O.D. may use this Session Roll Ledger.");
  return {
    userId,
    campaignId: context.campaignId,
    readAs: "god-owner",
    canRecordGodOnly: true,
    characterId: null,
  };
}

export async function getGodRollWorkspace(
  sessionId: number,
  selectedSceneId: number | null,
  selectedEncounterId: number | null,
): Promise<RollWorkspaceView> {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const actor = await getGodRollActor(tx, sessionId, access.user.id);
    return readRollWorkspaceInTransaction(tx, actor, sessionId, selectedSceneId, selectedEncounterId);
  });
}

export async function getGodRollHistory(
  sessionId: number,
  filters: RollLedgerFilters,
): Promise<RollLedgerPage> {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const actor = await getGodRollActor(tx, sessionId, access.user.id);
    return readRollLedgerInTransaction(tx, actor, sessionId, filters);
  });
}

export async function recordGodRoll(input: RollRecordRequest): Promise<RollLedgerEntry> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const actor = await getGodRollActor(tx, input.sessionId, access.user.id);
    const recorded = await recordRollInTransaction(tx, actor, input);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: actor.campaignId,
      sessionId: input.sessionId,
      sceneId: recorded.sceneId,
      encounterId: recorded.encounterId,
      characterIds: [recorded.rollerCharacterId, recorded.targetCharacterId].filter((id): id is number => id !== null),
      category: "roll",
    });
    return recorded;
  });
  refreshRolls();
  return result;
}

export async function recordGodWeaponGovernanceRoll(
  input: GodWeaponGovernanceRollRequest,
): Promise<RollLedgerEntry> {
  const access = await requireGod();
  const recorded = await db.transaction(async (tx) => {
    const actor = await getGodRollActor(tx, input.sessionId, access.user.id);
    const created = await recordGodWeaponGovernanceRollInTransaction(tx, actor, input);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: actor.campaignId,
      sessionId: input.sessionId,
      sceneId: created.sceneId,
      encounterId: created.encounterId,
      characterIds: [created.rollerCharacterId, created.targetCharacterId].filter((id): id is number => id !== null),
      category: "roll",
    });
    return created;
  });
  refreshRolls();
  return recorded;
}

export async function voidGodRoll(
  sessionId: number,
  rollId: number,
  reason: string,
): Promise<RollLedgerEntry> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const actor = await getGodRollActor(tx, sessionId, access.user.id);
    const voided = await voidRollInTransaction(tx, actor, sessionId, rollId, reason);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: actor.campaignId,
      sessionId,
      sceneId: voided.sceneId,
      encounterId: voided.encounterId,
      characterIds: [voided.rollerCharacterId, voided.targetCharacterId].filter((id): id is number => id !== null),
      category: "roll",
    });
    return voided;
  });
  refreshRolls();
  return result;
}

async function publishRollAmendment(
  sessionId: number,
  mutate: (tx: Transaction, actor: AuthorizedRollActor) => Promise<RollLedgerEntry>,
): Promise<RollLedgerEntry> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const actor = await getGodRollActor(tx, sessionId, access.user.id);
    const amended = await mutate(tx, actor);
    await publishTabletopInvalidationInTransaction(tx, {
      campaignId: actor.campaignId,
      sessionId,
      sceneId: amended.sceneId,
      encounterId: amended.encounterId,
      characterIds: [amended.rollerCharacterId, amended.targetCharacterId].filter((id): id is number => id !== null),
      category: "roll",
    });
    return amended;
  });
  refreshRolls();
  return result;
}

export async function correctGodRoll(input: RollCorrectionRequest): Promise<RollLedgerEntry> {
  return publishRollAmendment(input.sessionId, (tx, actor) => correctRollInTransaction(tx, actor, input));
}

export async function recordGodRollRuling(input: RollRulingRequest): Promise<RollLedgerEntry> {
  return publishRollAmendment(input.sessionId, (tx, actor) => recordRollRulingInTransaction(tx, actor, input));
}

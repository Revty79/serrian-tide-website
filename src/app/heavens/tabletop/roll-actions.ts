"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaign } from "@/db/campaign-schema";
import { campaignSession } from "@/db/tabletop-operations-schema";
import {
  readRollLedgerInTransaction,
  readRollWorkspaceInTransaction,
  recordRollInTransaction,
  voidRollInTransaction,
  type AuthorizedRollActor,
  type RollLedgerFilters,
  type RollLedgerPage,
  type RollLedgerEntry,
  type RollWorkspaceView,
} from "@/features/tabletop-operations/roll-runtime-service";
import type { RollRecordRequest } from "@/features/tabletop-operations/roll-runtime";
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
    return recordRollInTransaction(tx, actor, input);
  });
  refreshRolls();
  return result;
}

export async function voidGodRoll(
  sessionId: number,
  rollId: number,
  reason: string,
): Promise<RollLedgerEntry> {
  const access = await requireGod();
  const result = await db.transaction(async (tx) => {
    const actor = await getGodRollActor(tx, sessionId, access.user.id);
    return voidRollInTransaction(tx, actor, rollId, reason);
  });
  refreshRolls();
  return result;
}

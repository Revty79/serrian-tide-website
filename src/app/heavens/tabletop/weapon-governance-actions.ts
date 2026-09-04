"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { campaignSession } from "@/db/tabletop-operations-schema";
import type {
  CharacterWeaponGoverningSelection,
  CharacterWeaponOneActionOverride,
} from "@/features/items/character-weapon-governance";
import {
  previewGodCharacterWeaponOneActionInTransaction,
  readGodWeaponGovernanceWorkspaceInTransaction,
  removeGodCharacterWeaponOverrideInTransaction,
  saveGodCharacterWeaponOverrideInTransaction,
  type GodWeaponGovernanceWorkspaceView,
} from "@/features/items/weapon-governance-management-service";
import { publishTabletopInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
import { requireGod } from "@/lib/server-access";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type GodWeaponGovernanceWorkspaceRequest = Readonly<{
  campaignId: number;
  characterId: number | null;
  itemId: number | null;
  firingModeId: number | null;
}>;

async function publishGovernanceChange(
  tx: Transaction,
  campaignId: number,
  characterId: number,
): Promise<void> {
  const [session] = await tx.select({ id: campaignSession.id })
    .from(campaignSession)
    .where(eq(campaignSession.campaignId, campaignId))
    .orderBy(desc(campaignSession.id))
    .limit(1);
  if (!session) return;
  await publishTabletopInvalidationInTransaction(tx, {
    campaignId,
    sessionId: session.id,
    sceneId: null,
    encounterId: null,
    characterIds: [characterId],
    category: "character-state",
  });
}

function refreshGovernance(characterId: number): void {
  revalidatePath("/heavens/tabletop");
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/realms/characters/${characterId}/encounter`);
}

export async function getGodWeaponGovernanceWorkspace(
  request: GodWeaponGovernanceWorkspaceRequest,
): Promise<GodWeaponGovernanceWorkspaceView> {
  const access = await requireGod();
  return db.transaction((tx) => readGodWeaponGovernanceWorkspaceInTransaction(
    tx,
    { userId: access.user.id },
    request,
  ));
}

export async function saveGodWeaponGovernanceOverride(input: {
  campaignId: number;
  characterId: number;
  itemId: number;
  firingModeId: number | null;
  selection: CharacterWeaponGoverningSelection;
  reason: string;
}): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    await saveGodCharacterWeaponOverrideInTransaction(tx, { userId: access.user.id }, input);
    await publishGovernanceChange(tx, input.campaignId, input.characterId);
  });
  refreshGovernance(input.characterId);
}

export async function removeGodWeaponGovernanceOverride(input: {
  campaignId: number;
  characterId: number;
  itemId: number;
  firingModeId: number | null;
}): Promise<void> {
  const access = await requireGod();
  await db.transaction(async (tx) => {
    await removeGodCharacterWeaponOverrideInTransaction(tx, { userId: access.user.id }, input);
    await publishGovernanceChange(tx, input.campaignId, input.characterId);
  });
  refreshGovernance(input.characterId);
}

export async function previewGodWeaponGovernanceOneAction(input: {
  campaignId: number;
  characterId: number;
  itemId: number;
  firingModeId: number | null;
  oneActionOverride: CharacterWeaponOneActionOverride;
}) {
  const access = await requireGod();
  return db.transaction((tx) => previewGodCharacterWeaponOneActionInTransaction(
    tx,
    { userId: access.user.id },
    input,
  ));
}

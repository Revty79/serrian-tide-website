"use server";

import { db } from "@/db";
import {
  readPlayerWeaponGovernanceInTransaction,
  type PlayerWeaponGovernanceView,
} from "@/features/items/weapon-governance-management-service";
import { requirePlayer } from "@/lib/server-access";

export async function getPlayerWeaponGovernance(
  characterId: number,
): Promise<PlayerWeaponGovernanceView> {
  const access = await requirePlayer();
  return db.transaction((tx) => readPlayerWeaponGovernanceInTransaction(
    tx,
    { userId: access.user.id },
    characterId,
  ));
}

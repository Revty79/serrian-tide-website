"use server";

import { db } from "@/db";
import { requirePlayer } from "@/lib/server-access";
import { lockPlayerCombatContextInTransaction } from "@/features/tabletop-operations/player-combat-ruling-service";
import { readCombatEntityInformationInTransaction, readCombatProjectionInTransaction } from "@/features/tabletop-operations/combat-projection-service";

export async function getPlayerCombatProjection(encounterId: number, characterId: number) {
  const access = await requirePlayer();
  return db.transaction(async (tx) => {
    const context = await lockPlayerCombatContextInTransaction(tx, encounterId, characterId, access.user.id);
    return readCombatProjectionInTransaction(tx, context, { authority: "player", characterId, userId: access.user.id });
  });
}

export async function getPlayerCombatEntityInformation(encounterId: number, characterId: number, participantId: number) {
  const access = await requirePlayer();
  return db.transaction(async (tx) => {
    const context = await lockPlayerCombatContextInTransaction(tx, encounterId, characterId, access.user.id);
    return readCombatEntityInformationInTransaction(tx, context, { authority: "player", characterId, userId: access.user.id }, participantId);
  });
}

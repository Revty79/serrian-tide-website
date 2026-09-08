"use server";

import { db } from "@/db";
import { requireGod } from "@/lib/server-access";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readCombatEntityInformationInTransaction, readCombatProjectionInTransaction } from "@/features/tabletop-operations/combat-projection-service";

export async function getGodCombatProjection(encounterId: number) {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    return readCombatProjectionInTransaction(tx, context, { authority: "god-owner", userId: access.user.id });
  });
}

export async function getGodCombatEntityInformation(encounterId: number, participantId: number) {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    return readCombatEntityInformationInTransaction(tx, context, { authority: "god-owner", userId: access.user.id }, participantId);
  });
}

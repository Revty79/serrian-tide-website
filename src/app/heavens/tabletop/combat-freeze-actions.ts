"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireGod } from "@/lib/server-access";
import { setCombatFrozenInTransaction } from "@/features/tabletop-operations/combat-freeze-service";

export async function setEncounterCombatFrozen(encounterId: number, frozen: boolean, expectedRevision: number) {
  if (!Number.isSafeInteger(encounterId) || encounterId <= 0) throw new Error("Encounter is invalid.");
  const access = await requireGod();
  const state = await db.transaction((tx) => setCombatFrozenInTransaction(tx, encounterId,
    { authority: "god-owner", userId: access.user.id }, { frozen, expectedRevision }));
  revalidatePath("/heavens/tabletop");
  revalidatePath("/realms/tabletop");
  return state;
}

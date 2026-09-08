"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { forceEndEncounterInTransaction } from "@/features/tabletop-operations/force-end-encounter-service";
import { requireGod } from "@/lib/server-access";

export async function forceEndEncounter(
  encounterId: number,
  confirmation: { confirmed: boolean; reason?: string },
) {
  const session = await requireGod();
  if (!Number.isSafeInteger(encounterId) || encounterId <= 0) {
    throw new Error("Select a saved Encounter before ending it.");
  }
  const result = await db.transaction((tx) => forceEndEncounterInTransaction(
    tx, encounterId, session.user.id, confirmation,
  ));
  revalidatePath("/heavens/tabletop");
  revalidatePath("/realms/tabletop");
  revalidatePath("/heavens");
  return result;
}

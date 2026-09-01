"use server";

import { db } from "@/db";
import {
  readCombatAidEncounterInTransaction,
  type CombatAidEncounterView,
} from "@/features/tabletop-operations/combat-aid-service";
import { requireGod } from "@/lib/server-access";

export async function getEncounterCombatAid(encounterId: number): Promise<CombatAidEncounterView> {
  const access = await requireGod();
  return db.transaction(
    (tx) => readCombatAidEncounterInTransaction(tx, encounterId, access.user.id),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

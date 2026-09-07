"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireGod } from "@/lib/server-access";
import { lockOwnedEncounterRuntimeInTransaction } from "@/features/tabletop-operations/runtime-integration-service";
import { readCombatRunnerInTransaction, continueCombatRunnerInTransaction } from "@/features/tabletop-operations/combat-runner-service";

export async function getGodCombatRunner(encounterId: number) {
  const access = await requireGod();
  return db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    return (await readCombatRunnerInTransaction(tx, context)).snapshot;
  });
}

export async function continueGodCombatRunner(encounterId: number, input: {
  revision: string; command: "continue" | "round"; automatic?: boolean;
}) {
  const access = await requireGod();
  if (!input || typeof input.revision !== "string" || !/^[a-f0-9]{64}$/.test(input.revision)
    || !["continue", "round"].includes(input.command)
    || input.automatic !== undefined && typeof input.automatic !== "boolean") throw new Error("Refresh combat before continuing.");
  const result = await db.transaction(async (tx) => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, encounterId, access.user.id);
    return continueCombatRunnerInTransaction(tx, context, input);
  });
  if (result.changed) {
    revalidatePath("/heavens/tabletop");
    revalidatePath("/realms/tabletop");
  }
  return result;
}

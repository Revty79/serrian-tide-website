import "server-only";
import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { ownedCreatureDisposition as disposition } from "@/db/companion-schema";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Destructive management paths call this before doing any work; DB triggers are the final backstop. */
export async function assertCreatureVesselsUnboundInTransaction(tx: Transaction, instanceIds: readonly number[]) {
  for (const instanceId of instanceIds) {
    const [row] = await tx.select({ id: disposition.characterId }).from(disposition).where(eq(disposition.vesselInstanceId, instanceId));
    if (row) throw new Error("Unbind the Creature in Animals & Companions before removing, retiring, destroying, or selling its Creature Vessel copy.");
  }
}

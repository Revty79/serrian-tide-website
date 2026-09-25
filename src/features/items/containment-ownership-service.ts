import "server-only";
import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { inventoryInstanceLocation, inventoryStackLocation } from "@/db/container-schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller holds the shared Character lock. SQL triggers backstop every other writer. */
export async function validateContainmentOwnershipMutationInTransaction(tx: Transaction, input: {
  characterId: number;
  nextStackQuantities: readonly { itemId: number; quantity: number }[];
  removedInstanceIds: readonly number[];
}) {
  const stacks = await tx.select().from(inventoryStackLocation).where(eq(inventoryStackLocation.characterId, input.characterId));
  const instances = await tx.select().from(inventoryInstanceLocation).where(eq(inventoryInstanceLocation.characterId, input.characterId));
  const removed = new Set(input.removedInstanceIds);
  if (stacks.some(row => removed.has(row.containerInstanceId)) || instances.some(row => removed.has(row.containerInstanceId))) {
    throw new Error("Empty the container before removing or retiring its owned copy.");
  }
  if (instances.some(row => removed.has(row.instanceId))) {
    throw new Error("Move this owned copy to loose before removing or retiring it.");
  }
  const next = new Map(input.nextStackQuantities.map(row => [row.itemId, row.quantity]));
  const allocated = new Map<number, number>();
  for (const row of stacks) allocated.set(row.itemId, (allocated.get(row.itemId) ?? 0) + row.quantity);
  for (const [itemId, quantity] of allocated) {
    if (quantity > (next.get(itemId) ?? 0)) throw new Error("Move the allocated stack quantity to loose before removing or consuming it.");
  }
}

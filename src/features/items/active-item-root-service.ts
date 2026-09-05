import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { item } from "@/db/item-schema";

export type ActiveItemRootTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function positiveItemId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Item use requires a saved Item.");
  }
  return value;
}

/**
 * Mutation-only lock shared with Item lifecycle operations. Callers hold this
 * row lock until their transaction commits, so an archive or permanent delete
 * cannot cross a new durable Item reference.
 */
export async function lockActiveItemRootInTransaction(
  tx: ActiveItemRootTransaction,
  itemId: number,
): Promise<void> {
  const [activeItem] = await tx
    .select({ id: item.id })
    .from(item)
    .where(and(
      eq(item.id, positiveItemId(itemId)),
      isNull(item.archivedAt),
    ))
    .limit(1)
    .for("update", { of: item });
  if (!activeItem) {
    throw new Error("That Item is archived or no longer exists.");
  }
}

import "server-only";
import type { db } from "@/db";
import type { SharedLibraryActor } from "@/features/authorization/shared-library-access";
import { readInventoryAccessInTransaction } from "@/features/items/inventory-access-service";
import { availableLooseQuantity, resolveInventoryAvailability } from "@/features/items/inventory-access";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function usableEvolutionItems(tx: Transaction, characterId: number): Promise<ReadonlySet<number> | null> {
  try {
    const graph = await readInventoryAccessInTransaction(tx, characterId), ids = new Set<number>();
    for (const stack of graph.stacks) if (availableLooseQuantity(graph, stack.itemId) > 0) ids.add(stack.itemId);
    for (const copy of graph.instances) if (resolveInventoryAvailability(graph, { instanceId: copy.instanceId }).usable) ids.add(copy.itemId);
    return ids;
  } catch { return null; } // Invalid ancestry/custody cannot qualify as available inventory.
}
export function requireEvolutionGod(actor: SharedLibraryActor) {
  if (!actor.roles.includes("god")) throw new Error("Only the Campaign G.O.D. may preview individual Evolution eligibility.");
}

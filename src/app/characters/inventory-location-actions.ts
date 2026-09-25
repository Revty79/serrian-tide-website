"use server";

import { db } from "@/db";
import { requireSession } from "@/lib/server-access";
import { moveInventoryContentInTransaction, readPhysicalInventory, readPhysicalInventoryInTransaction, type ContainmentCommand } from "@/features/items/inventory-containment-service";

export async function getPhysicalInventoryAction(characterId: number) { return readPhysicalInventory(characterId); }
export async function moveInventoryLocationAction(command: ContainmentCommand) {
  const session = await requireSession();
  return db.transaction(async tx => {
    await moveInventoryContentInTransaction(tx, session.user.id, command);
    return readPhysicalInventoryInTransaction(tx, session.user.id, command.characterId);
  });
}

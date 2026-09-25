"use server";

import { db } from "@/db";
import { requireSession } from "@/lib/server-access";
import { moveInventoryContentInTransaction, readPhysicalInventory, readPhysicalInventoryInTransaction, type ContainmentCommand } from "@/features/items/inventory-containment-service";
import { changeContainerSubstanceInTransaction, type SubstanceCommand } from "@/features/items/inventory-containment-service";
import { handleInventoryInTransaction, type InventoryHandlingCommand } from "@/features/items/inventory-custody-service";

export async function handleInventoryAction(command: InventoryHandlingCommand) {
  const session = await requireSession();
  return db.transaction(async tx => {
    await handleInventoryInTransaction(tx, session.user.id, command);
    return readPhysicalInventoryInTransaction(tx, session.user.id, command.characterId);
  });
}

export async function getPhysicalInventoryAction(characterId: number) { return readPhysicalInventory(characterId); }
export async function moveInventoryLocationAction(command: ContainmentCommand) {
  const session = await requireSession();
  return db.transaction(async tx => {
    await moveInventoryContentInTransaction(tx, session.user.id, command);
    return readPhysicalInventoryInTransaction(tx, session.user.id, command.characterId);
  });
}
export async function changeContainerSubstanceAction(command: SubstanceCommand) {
  const session = await requireSession();
  return db.transaction(async tx => {
    const adjustment = await changeContainerSubstanceInTransaction(tx, session.user.id, command);
    return { adjustment, view: await readPhysicalInventoryInTransaction(tx, session.user.id, command.characterId) };
  });
}

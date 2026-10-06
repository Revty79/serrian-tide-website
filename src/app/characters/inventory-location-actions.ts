"use server";

import { db } from "@/db";
import { requireSession } from "@/lib/server-access";
import { moveInventoryContentInTransaction, readPhysicalInventory, readPhysicalInventoryInTransaction, type ContainmentCommand } from "@/features/items/inventory-containment-service";
import { changeContainerSubstanceInTransaction, type SubstanceCommand } from "@/features/items/inventory-containment-service";
import { handleInventoryInTransaction, type InventoryHandlingCommand } from "@/features/items/inventory-custody-service";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };
// Production Next.js redacts messages of thrown Server Function errors, so rule failures are returned as data.
async function guarded<T>(run: () => Promise<T>, fallback: string): Promise<ActionResult<T>> {
  try { return { ok: true, value: await run() }; }
  catch (caught) { return { ok: false, error: caught instanceof Error && caught.message ? caught.message : fallback }; }
}

export async function handleInventoryAction(command: InventoryHandlingCommand) {
  return guarded(() => handleInventory(command), "Inventory handling failed.");
}
async function handleInventory(command: InventoryHandlingCommand) {
  const session = await requireSession();
  return db.transaction(async tx => {
    await handleInventoryInTransaction(tx, session.user.id, command);
    return readPhysicalInventoryInTransaction(tx, session.user.id, command.characterId);
  });
}

export async function getPhysicalInventoryAction(characterId: number) { return readPhysicalInventory(characterId); }
export async function moveInventoryLocationAction(command: ContainmentCommand) {
  return guarded(() => moveInventory(command), "The Item could not be moved.");
}
async function moveInventory(command: ContainmentCommand) {
  const session = await requireSession();
  return db.transaction(async tx => {
    await moveInventoryContentInTransaction(tx, session.user.id, command);
    return readPhysicalInventoryInTransaction(tx, session.user.id, command.characterId);
  });
}
export async function changeContainerSubstanceAction(command: SubstanceCommand) {
  return guarded(() => changeSubstance(command), "Substance could not be changed.");
}
async function changeSubstance(command: SubstanceCommand) {
  const session = await requireSession();
  return db.transaction(async tx => {
    const adjustment = await changeContainerSubstanceInTransaction(tx, session.user.id, command);
    return { adjustment, view: await readPhysicalInventoryInTransaction(tx, session.user.id, command.characterId) };
  });
}

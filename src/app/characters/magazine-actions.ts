"use server";
import { db } from "@/db";
import { requireSession } from "@/lib/server-access";
import { handleMagazineInTransaction, readMagazineInventoryInTransaction, type MagazineCommand } from "@/features/items/magazine-inventory-service";
import { publishCharacterStateInvalidationInTransaction } from "@/features/tabletop-operations/tabletop-live-events";
export async function readMagazineInventory(characterId: number) {
  const session = await requireSession();
  return db.transaction((tx) => readMagazineInventoryInTransaction(tx, characterId, session.user.id));
}
export async function handleMagazine(command: MagazineCommand) {
  const session = await requireSession();
  return db.transaction(async (tx) => {
    await handleMagazineInTransaction(tx, session.user.id, command);
    await publishCharacterStateInvalidationInTransaction(tx, command.characterId);
    return readMagazineInventoryInTransaction(tx, command.characterId, session.user.id);
  });
}

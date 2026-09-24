"use server";

import { revalidatePath } from "next/cache";
import { adjustOwnerInventory, getOwnerGrantItems, type OwnerInventoryCommand } from "@/features/items/owner-inventory-service";

export async function getOwnerGrantItemsAction(characterId: number) {
  return getOwnerGrantItems(characterId);
}

export async function adjustOwnerInventoryAction(command: OwnerInventoryCommand) {
  await adjustOwnerInventory(command);
  revalidatePath(`/realms/characters/${command.characterId}`);
  revalidatePath(`/heavens/characters/${command.characterId}`);
}

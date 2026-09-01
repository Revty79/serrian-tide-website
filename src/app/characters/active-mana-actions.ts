"use server";

import { revalidatePath } from "next/cache";

import {
  getActiveMana,
  restoreAllCharacterMana,
  restoreCharacterMana,
  restoreCharacterManaPool,
  spendCharacterMana,
  type ActiveManaMutationCommand,
  type ActiveManaPoolCommand,
} from "@/features/active-state/active-mana-service";

function refreshActiveMana(characterId: number): void {
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/heavens/characters/${characterId}`);
  revalidatePath(`/heavens/npcs/${characterId}`);
}

export { getActiveMana };

export async function spendManaAction(command: ActiveManaMutationCommand) {
  const result = await spendCharacterMana(command);
  refreshActiveMana(command.characterId);
  return result;
}

export async function restoreManaAction(command: ActiveManaMutationCommand) {
  const result = await restoreCharacterMana(command);
  refreshActiveMana(command.characterId);
  return result;
}

export async function restoreManaPoolAction(command: ActiveManaPoolCommand) {
  const result = await restoreCharacterManaPool(command);
  refreshActiveMana(command.characterId);
  return result;
}

export async function restoreAllManaAction(characterId: number, confirmed: boolean) {
  if (!confirmed) throw new Error("Restore All Mana requires confirmation.");
  const result = await restoreAllCharacterMana(characterId);
  refreshActiveMana(characterId);
  return result;
}

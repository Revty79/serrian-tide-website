"use server";

import { revalidatePath } from "next/cache";

import {
  getCharacterItemChargeState,
  restoreItemChargesForCharacter,
  restoreItemChargesFullForCharacter,
  setItemCurrentChargesForCharacter,
  type ItemChargeInstanceIdentity,
  type RestoreItemChargesCommand,
  type SetItemCurrentChargesCommand,
} from "@/features/items/item-charge-service";

function refresh(characterId: number) {
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/heavens/characters/${characterId}`);
  revalidatePath(`/heavens/npcs/${characterId}`);
}

export { getCharacterItemChargeState };

export async function restoreItemChargesAction(command: RestoreItemChargesCommand) {
  const state = await restoreItemChargesForCharacter(command);
  refresh(command.characterId);
  return state;
}

export async function restoreItemChargesFullAction(identity: ItemChargeInstanceIdentity) {
  const state = await restoreItemChargesFullForCharacter(identity);
  refresh(identity.characterId);
  return state;
}

export async function setItemCurrentChargesAction(command: SetItemCurrentChargesCommand) {
  const state = await setItemCurrentChargesForCharacter(command);
  refresh(command.characterId);
  return state;
}

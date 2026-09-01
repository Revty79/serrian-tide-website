"use server";

import { revalidatePath } from "next/cache";

import {
  getCharacterEquipmentState,
  setInstanceEquipmentState,
  setStackEquipmentState,
  type SetInstanceEquipmentStateCommand,
  type SetStackEquipmentStateCommand,
} from "@/features/items/equipment-state-service";

function refresh(characterId: number) {
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/heavens/characters/${characterId}`);
  revalidatePath(`/heavens/npcs/${characterId}`);
}

export { getCharacterEquipmentState };

export async function setStackEquipmentStateAction(command: SetStackEquipmentStateCommand) {
  const state = await setStackEquipmentState(command);
  refresh(command.characterId);
  return state;
}

export async function setInstanceEquipmentStateAction(command: SetInstanceEquipmentStateCommand) {
  const state = await setInstanceEquipmentState(command);
  refresh(command.characterId);
  return state;
}

"use server";

import { revalidatePath } from "next/cache";

import {
  getCharacterEquipmentState,
  setInstanceEquipmentState,
  setStackEquipmentState,
  setStackEquipmentRole,
  readyOwnedWeapon,
  type ReadyOwnedWeaponCommand,
  type SetInstanceEquipmentStateCommand,
  type SetStackEquipmentStateCommand,
} from "@/features/items/equipment-state-service";

function refresh(characterId: number) {
  revalidatePath("/realms/tabletop");
  revalidatePath("/heavens/tabletop");
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/heavens/characters/${characterId}`);
  revalidatePath(`/heavens/npcs/${characterId}`);
}

export { getCharacterEquipmentState };

export async function setStackEquipmentRoleAction(command: Parameters<typeof setStackEquipmentRole>[0]) {
  const result = await setStackEquipmentRole(command);
  refresh(command.characterId);
  return result;
}

export async function readyOwnedWeaponAction(command: ReadyOwnedWeaponCommand) {
  const state = await readyOwnedWeapon(command);
  refresh(command.characterId);
  return state;
}

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

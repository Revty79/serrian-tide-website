"use server";

import { revalidatePath } from "next/cache";

import {
  addCharacterInjury,
  applyLocalizedDamageToCharacter,
  getActiveHealth,
  healCharacterArea,
  healCharacterFullBody,
  resolveCharacterInjury,
  restoreCharacterHealth,
  type AddInjuryCommand,
  type ApplyLocalizedDamageCommand,
} from "@/features/active-state/active-health-service";

function refreshActiveHealth(characterId: number) {
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/heavens/characters/${characterId}`);
  revalidatePath(`/heavens/npcs/${characterId}`);
}

export { getActiveHealth };

export async function applyLocalizedDamageAction(command: ApplyLocalizedDamageCommand) {
  const result = await applyLocalizedDamageToCharacter(command);
  refreshActiveHealth(command.characterId);
  return result;
}

export async function healFullBodyAction(characterId: number, amount: number) {
  const result = await healCharacterFullBody(characterId, amount);
  refreshActiveHealth(characterId);
  return result;
}

export async function healAreaAction(characterId: number, poolKey: string, amount: number) {
  const result = await healCharacterArea(characterId, poolKey, amount);
  refreshActiveHealth(characterId);
  return result;
}

export async function addInjuryAction(command: AddInjuryCommand) {
  const result = await addCharacterInjury(command);
  refreshActiveHealth(command.characterId);
  return result;
}

export async function resolveInjuryAction(characterId: number, injuryId: number) {
  const result = await resolveCharacterInjury(characterId, injuryId);
  refreshActiveHealth(characterId);
  return result;
}

export async function restoreAllHealthAction(characterId: number, confirmed: boolean) {
  if (!confirmed) throw new Error("Restore All Health requires confirmation.");
  const result = await restoreCharacterHealth(characterId);
  refreshActiveHealth(characterId);
  return result;
}

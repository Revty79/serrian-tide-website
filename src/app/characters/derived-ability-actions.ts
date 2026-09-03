"use server";

import { revalidatePath } from "next/cache";

import {
  executeCharacterDerivedAbilityUse,
  grantCharacterDerivedAbility,
  learnCharacterDerivedAbility,
  prepareCharacterDerivedAbilityUse,
  rechargeCharacterDerivedAbility,
  reportDerivedAbilityRechargeEvent,
  revokeCharacterDerivedAbility,
  synchronizeCharacterDerivedAbilityPassives,
  type CharacterDerivedAbilityUseRequest,
} from "@/features/derived-abilities/character-derived-ability-service";

function revalidateCharacter(characterId: number): void {
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/heavens/characters/${characterId}`);
  revalidatePath(`/heavens/npcs/${characterId}`);
}

export async function learnDerivedAbility(input: {
  characterId: number;
  derivedAbilityId: number;
  notes?: string;
  manualConfirmed?: boolean;
}) {
  const result = await learnCharacterDerivedAbility(input);
  revalidateCharacter(input.characterId);
  return result;
}

export async function grantDerivedAbility(input: {
  characterId: number;
  derivedAbilityId: number;
  notes?: string;
  manualConfirmed?: boolean;
}) {
  const result = await grantCharacterDerivedAbility(input);
  revalidateCharacter(input.characterId);
  return result;
}

export async function revokeDerivedAbility(input: {
  characterId: number;
  derivedAbilityId: number;
  notes?: string;
}) {
  const result = await revokeCharacterDerivedAbility(input);
  revalidateCharacter(input.characterId);
  return result;
}

export async function prepareDerivedAbilityUse(input: CharacterDerivedAbilityUseRequest) {
  return prepareCharacterDerivedAbilityUse(input);
}

export async function useDerivedAbility(input: CharacterDerivedAbilityUseRequest) {
  const result = await executeCharacterDerivedAbilityUse(input);
  revalidateCharacter(input.characterId);
  return result;
}

export async function rechargeDerivedAbility(input: {
  characterId: number;
  derivedAbilityId: number;
  refreshScope: "manual" | "event";
  refreshKey?: string | null;
  notes?: string;
}) {
  const result = await rechargeCharacterDerivedAbility(input);
  revalidateCharacter(input.characterId);
  return result;
}

export async function reportDerivedAbilityEvent(input: {
  characterId: number;
  derivedAbilityId: number;
  eventKey: string;
  notes?: string;
}) {
  const result = await reportDerivedAbilityRechargeEvent(input);
  revalidateCharacter(input.characterId);
  return result;
}

export async function syncDerivedAbilityPassives(characterId: number) {
  const result = await synchronizeCharacterDerivedAbilityPassives(characterId);
  revalidateCharacter(characterId);
  return result;
}

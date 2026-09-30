"use server";
import { getCharacterSpecialAbilityMechanics } from "./read-service";

/** Inspection only: authorization and READ ONLY transaction are inside the reader. */
export async function readSavedSpecialAbilityMechanics(characterId: number) {
  return getCharacterSpecialAbilityMechanics(characterId);
}

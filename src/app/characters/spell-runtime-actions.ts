"use server";

import { revalidatePath } from "next/cache";

import {
  executeCharacterSpellCast,
  prepareCharacterSpellCast,
} from "@/features/characters/character-spell-runtime-service";
import type { SpellCastRequest } from "@/features/characters/character-spell-runtime";

export { prepareCharacterSpellCast };

function refreshCharacterRuntime(characterId: number): void {
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/realms/characters/${characterId}/spellbook`);
  revalidatePath(`/realms/characters/${characterId}/magic`);
  revalidatePath(`/heavens/characters/${characterId}`);
  revalidatePath(`/heavens/npcs/${characterId}`);
}

export async function executeCharacterSpellCastAction(
  request: SpellCastRequest,
  confirmed: boolean,
) {
  const result = await executeCharacterSpellCast(request, confirmed);
  refreshCharacterRuntime(request.casterCharacterId);
  for (const target of result.targetResults) {
    refreshCharacterRuntime(target.characterId);
  }
  return result;
}

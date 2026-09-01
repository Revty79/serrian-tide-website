"use server";

import { revalidatePath } from "next/cache";

import {
  executeCreatureAbilityUse,
  prepareCreatureAbilityUse,
} from "@/features/creatures/creature-ability-runtime-service";
import type { CreatureAbilityUseRequest } from "@/features/creatures/creature-ability-runtime";

export { prepareCreatureAbilityUse };

export async function executeCreatureAbilityUseAction(request: CreatureAbilityUseRequest) {
  const result = await executeCreatureAbilityUse(request, true);
  for (const characterId of new Set(result.automaticEffects.map(({ targetCharacterId }) => targetCharacterId))) {
    revalidatePath(`/realms/characters/${characterId}`);
    revalidatePath(`/heavens/characters/${characterId}`);
    revalidatePath(`/heavens/npcs/${characterId}`);
  }
  revalidatePath(`/heavens/npcs/${request.sourceCharacterId}`);
  return result;
}

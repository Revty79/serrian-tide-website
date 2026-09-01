"use server";

import { revalidatePath } from "next/cache";

import {
  addManualCondition,
  addManualModifier,
  endManualModifier,
  getActiveEffects,
  resolveManualCondition,
  type AddManualConditionCommand,
  type AddManualModifierCommand,
} from "@/features/active-state/active-effects-service";

function refresh(characterId: number) {
  revalidatePath(`/realms/characters/${characterId}`);
  revalidatePath(`/heavens/characters/${characterId}`);
  revalidatePath(`/heavens/npcs/${characterId}`);
}

export { getActiveEffects };
export async function addConditionAction(command: AddManualConditionCommand) { const result = await addManualCondition(command); refresh(command.characterId); return result; }
export async function addModifierAction(command: AddManualModifierCommand) { const result = await addManualModifier(command); refresh(command.characterId); return result; }
export async function resolveConditionAction(characterId: number, conditionId: number, note = "") { const result = await resolveManualCondition(characterId, conditionId, note); refresh(characterId); return result; }
export async function endModifierAction(characterId: number, modifierId: number, note = "") { const result = await endManualModifier(characterId, modifierId, note); refresh(characterId); return result; }

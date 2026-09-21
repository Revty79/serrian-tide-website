import { normalizeExperienceAwards, type ExperienceAwardInput } from "./encounter-closeout";
import { combatConditionState, combatObject } from "./combat-condition-state";

/** Existing defeat records and recorded incapacity both support an XP decision.
 * This reads evidence only; an XP award never changes the combatant's condition. */
export function creatureExperienceEvidence(localState: unknown): Record<string, unknown> | null {
  const local = combatObject(localState), defeat = combatObject(local.defeat);
  if (Object.keys(defeat).length) return defeat;
  const condition = combatConditionState(local);
  if (condition.status !== "incapacitated" && condition.status !== "dead") return null;
  return { reason: condition.reason, conditionEvidence: structuredClone(local.combatCondition) };
}

/** Fame follows a recorded whole-actor incapacitation or death, never a limb
 * injury alone. Retained evidence keeps credit available after recovery. */
export function creatureDefeatFameEvidence(localState: unknown): Record<string, unknown> | null {
  const local = combatObject(localState);
  for (const recorded of [local.defeatFame, local.kill]) {
    const evidence = combatObject(recorded);
    if (Object.keys(evidence).length) return evidence;
  }
  const condition = combatConditionState(local);
  return condition.status === "incapacitated" || condition.status === "dead"
    ? { condition: condition.status, reason: condition.reason } : null;
}

export type CreatureExperienceMode = "killer-only" | "full-to-each" | "shared-split";

export function wholeExperience(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("XP must be a nonnegative whole number within the supported range.");
  return value;
}

export function experienceRecipients(ids: readonly number[]): number[] {
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error("Select each eligible Character exactly once for the XP award.");
  }
  return [...ids].sort((a, b) => a - b);
}

export function allocateCreatureExperience(input: {
  value: number; mode: CreatureExperienceMode; recipientCharacterIds: readonly number[]; killerCharacterId: number | null;
}): ExperienceAwardInput[] {
  const value = wholeExperience(input.value);
  const ids = experienceRecipients(input.recipientCharacterIds);
  if (!["killer-only", "full-to-each", "shared-split"].includes(input.mode)) throw new Error("Choose an explicit Creature XP distribution mode.");
  if (input.mode === "killer-only") {
    if (input.killerCharacterId === null) throw new Error("Credit the Character who incapacitated or killed the Creature before awarding XP only to that Character.");
    if (ids.length !== 1 || ids[0] !== input.killerCharacterId) throw new Error("This XP mode has exactly the credited Character as its recipient.");
    return [{ characterId: ids[0], amount: value }];
  }
  if (input.mode === "full-to-each") return ids.map((characterId) => ({ characterId, amount: value }));
  const share = Math.floor(value / ids.length);
  const remainder = value % ids.length;
  if (remainder && (input.killerCharacterId === null || !ids.includes(input.killerCharacterId))) {
    throw new Error("An uneven shared split requires the credited Character among the selected eligible Characters to receive the remainder.");
  }
  return ids.map((characterId) => ({ characterId, amount: share + (characterId === input.killerCharacterId ? remainder : 0) }));
}

export function allocateEncounterExperience(amount: number, recipientCharacterIds: readonly number[]): ExperienceAwardInput[] {
  const value = wholeExperience(amount);
  return experienceRecipients(recipientCharacterIds).map((characterId) => ({ characterId, amount: value }));
}

export function positiveExperienceAwards(awards: readonly ExperienceAwardInput[]): ExperienceAwardInput[] {
  for (const award of awards) wholeExperience(award.amount);
  return normalizeExperienceAwards(awards);
}


export function npcRewardEvidence(localState: unknown): Record<string, unknown> | null {
  const local = combatObject(localState), condition = combatConditionState(local), participation = combatObject(local.combatParticipation);
  if (["dead", "incapacitated"].includes(condition.status) || participation.departed === true && participation.departureKind === "surrender") {
    return { condition: structuredClone(local.combatCondition), participation: structuredClone(local.combatParticipation) };
  }
  return null;
}

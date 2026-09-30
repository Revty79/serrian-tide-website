import { getCharacterSkillPointsById } from "@/features/characters/character-rules";
import type { CharacterDraft } from "@/features/characters/models";

/** Provisional interpretation, NOT approved universal Special Ability canon.
 * Rules refer to self progression; this adapter alone chooses the saved source.
 * A deliberate later semantic revision must update this identifier and review
 * existing authored thresholds. Never silently reinterpret saved documents.
 */
export const SPECIAL_ABILITY_PROGRESSION_CONTRACT = "provisional-v1-saved-purchased-points" as const;
export type SpecialAbilityProgression = {
  source: typeof SPECIAL_ABILITY_PROGRESSION_CONTRACT;
  label: string;
  provisional: true;
  value: number | null;
};
export function resolveSpecialAbilityProgression(skillId: number, saved: Pick<CharacterDraft, "skillAllocations"> | null): SpecialAbilityProgression {
  return { source: SPECIAL_ABILITY_PROGRESSION_CONTRACT, label: "Saved purchased points (provisional v1 source)", provisional: true,
    value: saved === null ? null : getCharacterSkillPointsById(saved).get(skillId) ?? 0 };
}

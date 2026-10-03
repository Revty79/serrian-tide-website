import { specialAbilityScore, validSpecialAbilityScore, type SpecialAbilityAllocation, type SpecialAbilityGrant } from "./score";

/** Approved score contract; saved mechanics documents are not rewritten. */
export const SPECIAL_ABILITY_PROGRESSION_CONTRACT = "core-v1-special-ability-score" as const;
export type SpecialAbilityScoreFacts = {
  skillAllocations: readonly SpecialAbilityAllocation[];
  racialSkillLinks?: readonly SpecialAbilityGrant[];
};
export type SpecialAbilityProgression = {
  source: typeof SPECIAL_ABILITY_PROGRESSION_CONTRACT;
  label: string;
  value: number | null;
};
export function resolveSpecialAbilityProgression(skillId: number, saved: SpecialAbilityScoreFacts | null): SpecialAbilityProgression {
  const value = saved === null ? null : specialAbilityScore(skillId, saved.skillAllocations, saved.racialSkillLinks);
  return { source: SPECIAL_ABILITY_PROGRESSION_CONTRACT, label: "Current Special Ability score (0–100)",
    value: value !== null && validSpecialAbilityScore(value) ? value : null };
}

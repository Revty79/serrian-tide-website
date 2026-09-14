export type RaceSkillEligibility = {
  name: string;
  classification: string;
  tier: number | null;
};

export function isRaceSkillEligible(candidate: Pick<RaceSkillEligibility, "classification" | "tier">) {
  return candidate.tier === 1 || candidate.classification.trim().toLowerCase() === "special ability";
}

export function assertRaceSkillsEligible(candidates: readonly RaceSkillEligibility[]) {
  const invalid = candidates.find((candidate) => !isRaceSkillEligible(candidate));
  if (invalid) {
    throw new Error(`${invalid.name} cannot be assigned to a Race. Choose a Tier 1 Skill or Special Ability.`);
  }
}

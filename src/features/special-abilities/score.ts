/** Approved core score. This is a Skill number, not an Attribute/parent Rank. */
export const SPECIAL_ABILITY_SCORE_MAXIMUM = 100;
export type SpecialAbilityAllocation = { skillId: number; points: number; specialAbilityGranted?: boolean };
export type SpecialAbilityGrant = { skillId: number; value?: number | null };
export function specialAbilityPossession(skillId: number, allocations: readonly SpecialAbilityAllocation[], grants: readonly SpecialAbilityGrant[] = []) {
  const purchased = allocations.some(row => row.skillId === skillId && row.points > 0);
  const assigned = allocations.some(row => row.skillId === skillId && row.specialAbilityGranted === true);
  const racial = grants.some(row => row.skillId === skillId);
  return { purchased, assigned, racial, possessed: purchased || assigned || racial };
}
export function specialAbilityScore(skillId: number, allocations: readonly SpecialAbilityAllocation[], grants: readonly SpecialAbilityGrant[] = []): number {
  return Math.max(0, ...allocations.filter(row => row.skillId === skillId).map(row => row.points))
    + grants.filter(row => row.skillId === skillId).reduce((total, row) => total + Math.max(0, row.value ?? 0), 0);
}
export function validSpecialAbilityScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= SPECIAL_ABILITY_SCORE_MAXIMUM;
}

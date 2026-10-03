import { isSpecialAbilitySkill } from "./character-rules";
import type { CharacterSkillAllocationDraft, CharacterSkillReference } from "./models";
import { specialAbilityScore, validSpecialAbilityScore, type SpecialAbilityAllocation, type SpecialAbilityGrant } from "@/features/special-abilities/score";

/** Shared save boundary, including owner adjustments. Clients cannot invent grants. */
export function assertSpecialAbilityAllocations(input: {
  allocations: readonly CharacterSkillAllocationDraft[];
  stored: readonly (SpecialAbilityAllocation & { id: number })[];
  catalog: readonly Pick<CharacterSkillReference, "id" | "name" | "classification">[];
  raceGrants: readonly SpecialAbilityGrant[];
  canAssign: boolean;
}) {
  if (!input.canAssign && input.stored.some(row => row.specialAbilityGranted && !input.allocations.some(draft => draft.draftId === row.id && draft.specialAbilityGranted))) throw new Error("Only the owning G.O.D. may remove a Special Ability assignment.");
  for (const allocation of input.allocations) {
    const definition = input.catalog.find(row => row.id === allocation.skillId);
    const stored = input.stored.find(row => row.id === allocation.draftId && row.skillId === allocation.skillId);
    if (allocation.specialAbilityGranted !== undefined && typeof allocation.specialAbilityGranted !== "boolean") throw new Error("Special Ability assignment must be true or false.");
    if (Boolean(allocation.specialAbilityGranted) !== Boolean(stored?.specialAbilityGranted) && !input.canAssign) throw new Error("Only the owning G.O.D. may assign or remove a Special Ability grant.");
    if (allocation.specialAbilityGranted && (!definition || !isSpecialAbilitySkill(definition))) throw new Error("Only Special Abilities support this explicit assignment.");
  }
  for (const definition of input.catalog.filter(isSpecialAbilitySkill)) {
    const value = specialAbilityScore(definition.id, input.allocations, input.raceGrants);
    if (!validSpecialAbilityScore(value)) throw new Error(`${definition.name}: Special Ability score must be from 0 to 100, including Race-granted points.`);
  }
}

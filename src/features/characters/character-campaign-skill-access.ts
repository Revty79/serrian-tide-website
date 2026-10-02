import { buildRecursiveSkillLibrary } from "@/features/skills/recursive-skill-library";
import { allocationSkillPath, createCampaignSkillAccess } from "@/features/campaigns/campaign-skill-access";
import type { CharacterAggregate, CharacterSkillAllocationDraft } from "./models";

const cache = new WeakMap<CharacterAggregate, ReturnType<typeof createCampaignSkillAccess>>();
export function characterCampaignSkillAccess(aggregate: CharacterAggregate) {
  let access = cache.get(aggregate);
  if (!access) {
    const library = buildRecursiveSkillLibrary(aggregate.skillCatalog, aggregate.skillRelationships.map((row, index) => ({ ...row, id: index + 1 })));
    access = createCampaignSkillAccess(library, aggregate.campaign.allowedSystems, aggregate.campaign.skillExclusions);
    cache.set(aggregate, access);
  }
  return access;
}

export function draftSkillAllocations(allocations: readonly CharacterSkillAllocationDraft[]) {
  return allocations.map(row => ({ id: row.draftId, skillId: row.skillId, parentAllocationId: row.parentDraftId, points: row.points }));
}

export function characterSkillChoiceAccess(aggregate: CharacterAggregate, allocations: readonly CharacterSkillAllocationDraft[], skillId: number, parentId: number | null) {
  const parentPath = parentId === null ? [] : allocationSkillPath(parentId, draftSkillAllocations(allocations));
  return characterCampaignSkillAccess(aggregate).resolve(parentPath === null ? [] : [...parentPath, skillId]);
}

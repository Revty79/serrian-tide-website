import {
  canAccessSupernaturalSkillAtLevel,
  characterAggregateToDraft,
  getAttributeModifier,
  getCharacterMagicSystem,
  getCharacterManaProfiles,
  getCharacterSkillGroupKey,
  getCharacterSkillRanks,
  getEffectiveSkillMaximum,
  getEffectiveSkillPoints,
  getPurchasedSkillMaximum,
  getRacialSkillGrant,
  getSkillRank,
  getSkillRollTarget,
  getSkillTierLabel,
  getSkillUnlockThreshold,
  getSpecialAbilityRollTarget,
  hasSkillPoints,
  isSkillAllowedByCampaign,
  isSpecialAbilitySkill,
  normalizeSkillAttributeKey,
  type CharacterSkillGroupKey,
} from "./character-rules";
import type {
  CharacterAggregate,
  CharacterSkillAllocationDraft,
  CharacterSkillReference,
} from "./models";

const EPSILON = 0.000_001;

export type CharacterSkillAdvancementRequest = {
  planId: string;
  skillId: number;
  parentAllocationId: number | null;
  parentPlanId: string | null;
  pointsToAdd: number;
};

export type CharacterAdvancementTreeEntry = {
  key: string;
  skill: CharacterSkillReference;
  rootSkill: CharacterSkillReference;
  allocationDraftId: number | null;
  parentDraftId: number | null;
  depth: number;
  group: CharacterSkillGroupKey;
  path: string[];
  tierLabel: string;
  permanentAllocationPoints: number;
  projectedAllocationPoints: number;
  currentSkillNumber: number;
  projectedSkillNumber: number;
  currentRank: number;
  projectedRank: number;
  projectedRollTarget: number | null;
  plannedPoints: number;
  experienceCost: number;
  maximumSkillNumber: number;
  permanentlyOwned: boolean;
};

export type CharacterAdvancementPlanEntry = {
  key: string;
  path: string;
  skillName: string;
  before: number;
  after: number;
  experienceCost: number;
  request: CharacterSkillAdvancementRequest;
};

export type CharacterAdvancementPlan = {
  entries: CharacterAdvancementPlanEntry[];
  totalExperienceCost: number;
  experienceRemaining: number;
  lifetimeExperienceAfter: number;
};

export function getExperienceSpendingLedger(
  availableExperience: number,
  lifetimeExperience: number,
  amountSpent: number,
) {
  if (amountSpent < 0 || amountSpent > availableExperience + EPSILON) {
    throw new Error("The Character does not have enough Experience for this plan.");
  }
  return {
    experience: Math.max(0, availableExperience - amountSpent),
    totalExperience: lifetimeExperience + amountSpent,
  };
}

export function getSkillAdvancementCost(
  currentSkillNumber: number,
  pointsToAdd = 1,
): number {
  if (!Number.isInteger(pointsToAdd) || pointsToAdd <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  let cost = 0;
  let projectedSkillNumber = currentSkillNumber;
  for (let point = 0; point < pointsToAdd; point += 1) {
    cost += projectedSkillNumber > EPSILON ? projectedSkillNumber : 10;
    projectedSkillNumber += 1;
  }
  return cost;
}

export function getMaximumAffordableSkillPoints(
  currentSkillNumber: number,
  availableExperience: number,
  maximumSkillNumber: number,
): number {
  const maximumIncreases = Math.max(
    0,
    Math.floor(maximumSkillNumber - currentSkillNumber + EPSILON),
  );
  let points = 0;
  let spent = 0;
  while (points < maximumIncreases) {
    const nextCost = getSkillAdvancementCost(currentSkillNumber + points);
    if (spent + nextCost > availableExperience + EPSILON) break;
    spent += nextCost;
    points += 1;
  }
  return points;
}

function allocationFor(
  allocations: readonly CharacterSkillAllocationDraft[],
  skillId: number,
  parentDraftId: number | null,
) {
  return allocations.find(
    (allocation) =>
      allocation.skillId === skillId &&
      allocation.parentDraftId === parentDraftId,
  ) ?? null;
}

function permanentAllocations(aggregate: CharacterAggregate) {
  return aggregate.skillAllocations.map((allocation) => ({
    draftId: allocation.id,
    skillId: allocation.skillId,
    parentDraftId: allocation.parentAllocationId,
    points: allocation.points,
  }));
}

export function getInitialAdvancementAllocations(
  aggregate: CharacterAggregate,
): CharacterSkillAllocationDraft[] {
  return permanentAllocations(aggregate);
}

export function buildCharacterAdvancementTree(
  aggregate: CharacterAggregate,
  projectedAllocations: readonly CharacterSkillAllocationDraft[],
): CharacterAdvancementTreeEntry[] {
  const permanent = permanentAllocations(aggregate);
  const permanentDraft = {
    ...characterAggregateToDraft(aggregate),
    skillAllocations: permanent,
  };
  const projectedDraft = {
    ...permanentDraft,
    skillAllocations: [...projectedAllocations],
  };
  const permanentRanks = getCharacterSkillRanks(
    permanentDraft,
    aggregate.skillCatalog,
    aggregate.selectedRace,
  );
  const projectedRanks = getCharacterSkillRanks(
    projectedDraft,
    aggregate.skillCatalog,
    aggregate.selectedRace,
  );
  const projectedManaProfiles = getCharacterManaProfiles(
    projectedDraft,
    aggregate.skillCatalog,
    aggregate.selectedRace,
  );
  const catalog = new Map(
    aggregate.skillCatalog.map((skill) => [skill.id, skill]),
  );
  const childrenByParent = new Map<number, CharacterSkillReference[]>();
  const childIds = new Set<number>();
  for (const relationship of aggregate.skillRelationships) {
    if (relationship.relationshipType.trim().toLowerCase() !== "parent") continue;
    const child = catalog.get(relationship.skillId);
    if (!child) continue;
    childIds.add(child.id);
    const children = childrenByParent.get(relationship.relatedSkillId) ?? [];
    if (!children.some((candidate) => candidate.id === child.id)) {
      children.push(child);
    }
    childrenByParent.set(relationship.relatedSkillId, children);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.name.localeCompare(right.name));
  }

  const roots = aggregate.skillCatalog
    .filter(
      (skill) =>
        !childIds.has(skill.id) && (skill.tier === null || skill.tier === 1),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const result: CharacterAdvancementTreeEntry[] = [];

  function visit(
    skill: CharacterSkillReference,
    rootSkill: CharacterSkillReference,
    parentDraftId: number | null,
    currentParentRank: number | null,
    projectedParentRank: number | null,
    parentPath: readonly string[],
    depth: number,
    visited: ReadonlySet<number>,
  ) {
    if (visited.has(skill.id)) return;
    const permanentAllocation = allocationFor(permanent, skill.id, parentDraftId);
    const projectedAllocation = allocationFor(
      projectedAllocations,
      skill.id,
      parentDraftId,
    );
    const racialGrant = getRacialSkillGrant(aggregate.selectedRace, skill.id);
    const permanentlyOwned = hasSkillPoints(
      getEffectiveSkillPoints(
        permanentAllocation?.points ?? 0,
        aggregate.selectedRace,
        skill.id,
      ),
    );
    if (
      !permanentAllocation &&
      !isSkillAllowedByCampaign(
        skill,
        rootSkill,
        aggregate.campaign.allowedSystems,
        false,
        racialGrant.granted,
      )
    ) {
      return;
    }

    const magicSystem = getCharacterMagicSystem(rootSkill);
    const spellAccessLevel = magicSystem
      ? projectedManaProfiles.find((profile) => profile.system === magicSystem)
          ?.spellAccessLevel ?? null
      : null;
    if (
      !permanentAllocation &&
      !canAccessSupernaturalSkillAtLevel(skill, rootSkill, spellAccessLevel)
    ) {
      return;
    }

    const permanentAllocationPoints = permanentAllocation?.points ?? 0;
    const projectedAllocationPoints = projectedAllocation?.points ?? 0;
    const currentSkillNumber = getEffectiveSkillPoints(
      permanentAllocationPoints,
      aggregate.selectedRace,
      skill.id,
    );
    const projectedSkillNumber = getEffectiveSkillPoints(
      projectedAllocationPoints,
      aggregate.selectedRace,
      skill.id,
    );
    const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
    const attributeScore = attributeKey ? projectedDraft.attributes[attributeKey] : 0;
    const currentRank = permanentAllocation
      ? permanentRanks.get(permanentAllocation.draftId) ?? 0
      : hasSkillPoints(currentSkillNumber)
        ? getSkillRank(
            currentSkillNumber,
            attributeKey ? getAttributeModifier(attributeScore) : 0,
            currentParentRank,
            skill.tier,
          )
        : 0;
    const projectedRank = projectedAllocation
      ? projectedRanks.get(projectedAllocation.draftId) ?? 0
      : hasSkillPoints(projectedSkillNumber)
        ? getSkillRank(
            projectedSkillNumber,
            attributeKey ? getAttributeModifier(attributeScore) : 0,
            projectedParentRank,
            skill.tier,
          )
        : 0;
    const projectedRollTarget = !hasSkillPoints(projectedSkillNumber)
      ? null
      : attributeKey
        ? getSkillRollTarget(attributeScore, projectedRank)
        : isSpecialAbilitySkill(skill)
          ? getSpecialAbilityRollTarget(projectedRank)
          : null;
    const plannedPoints = Math.max(
      0,
      projectedAllocationPoints - permanentAllocationPoints,
    );
    const path = [...parentPath, skill.name];
    result.push({
      key: `${parentDraftId ?? "root"}:${skill.id}`,
      skill,
      rootSkill,
      allocationDraftId: projectedAllocation?.draftId ?? null,
      parentDraftId,
      depth,
      group: getCharacterSkillGroupKey(rootSkill),
      path,
      tierLabel: getSkillTierLabel(skill),
      permanentAllocationPoints,
      projectedAllocationPoints,
      currentSkillNumber,
      projectedSkillNumber,
      currentRank,
      projectedRank,
      projectedRollTarget,
      plannedPoints,
      experienceCost:
        plannedPoints > 0
          ? getSkillAdvancementCost(currentSkillNumber, plannedPoints)
          : 0,
      maximumSkillNumber: getEffectiveSkillMaximum(
        skill,
        aggregate.campaign.maxPointsInSkill,
      ),
      permanentlyOwned,
    });

    if (!projectedAllocation) return;
    const unlockThreshold = getSkillUnlockThreshold(
      rootSkill,
      aggregate.campaign.pointsToUnlockNextTier,
    );
    const nextVisited = new Set(visited).add(skill.id);
    for (const child of childrenByParent.get(skill.id) ?? []) {
      const permanentChild = allocationFor(
        permanent,
        child.id,
        projectedAllocation.draftId,
      );
      const childGrant = getRacialSkillGrant(aggregate.selectedRace, child.id);
      if (
        !permanentChild &&
        projectedSkillNumber + EPSILON < unlockThreshold &&
        !childGrant.granted
      ) {
        continue;
      }
      visit(
        child,
        rootSkill,
        projectedAllocation.draftId,
        currentRank,
        projectedRank,
        path,
        depth + 1,
        nextVisited,
      );
    }
  }

  for (const root of roots) {
    visit(root, root, null, null, null, [], 0, new Set());
  }
  return result;
}

export function pruneUnavailableProjectedAllocations(
  aggregate: CharacterAggregate,
  projectedAllocations: readonly CharacterSkillAllocationDraft[],
): CharacterSkillAllocationDraft[] {
  const permanentIds = new Set(
    aggregate.skillAllocations.map((allocation) => allocation.id),
  );
  let current = [...projectedAllocations];
  while (true) {
    const visibleKeys = new Set(
      buildCharacterAdvancementTree(aggregate, current).map((entry) => entry.key),
    );
    const next = current.filter(
      (allocation) =>
        permanentIds.has(allocation.draftId) ||
        visibleKeys.has(
          `${allocation.parentDraftId ?? "root"}:${allocation.skillId}`,
        ),
    );
    if (next.length === current.length) return next;
    current = next;
  }
}

export function setProjectedSkillNumber(input: {
  aggregate: CharacterAggregate;
  projectedAllocations: readonly CharacterSkillAllocationDraft[];
  skillId: number;
  parentDraftId: number | null;
  requestedSkillNumber: number;
  newDraftId: number;
}): CharacterSkillAllocationDraft[] {
  const skill = input.aggregate.skillCatalog.find(
    (candidate) => candidate.id === input.skillId,
  );
  if (!skill) return [...input.projectedAllocations];
  const racialPoints = getRacialSkillGrant(
    input.aggregate.selectedRace,
    input.skillId,
  ).minimum;
  const maximumAllocationPoints = getPurchasedSkillMaximum(
    skill,
    input.aggregate.campaign.maxPointsInSkill,
    racialPoints,
  );
  const permanent = input.aggregate.skillAllocations.find(
    (allocation) =>
      allocation.skillId === input.skillId &&
      allocation.parentAllocationId === input.parentDraftId,
  );
  const minimumAllocationPoints = permanent?.points ?? 0;
  const requestedAllocationPoints = Math.min(
    maximumAllocationPoints,
    Math.max(
      minimumAllocationPoints,
      Math.max(0, input.requestedSkillNumber - racialPoints),
    ),
  );
  const existing = allocationFor(
    input.projectedAllocations,
    input.skillId,
    input.parentDraftId,
  );
  let allocations = [...input.projectedAllocations];
  if (!existing && requestedAllocationPoints > 0) {
    allocations.push({
      draftId: input.newDraftId,
      skillId: input.skillId,
      parentDraftId: input.parentDraftId,
      points: requestedAllocationPoints,
    });
  } else if (existing && requestedAllocationPoints <= 0 && !permanent) {
    allocations = allocations.filter(
      (allocation) => allocation.draftId !== existing.draftId,
    );
  } else if (existing) {
    allocations = allocations.map((allocation) =>
      allocation.draftId === existing.draftId
        ? { ...allocation, points: requestedAllocationPoints }
        : allocation,
    );
  }
  return pruneUnavailableProjectedAllocations(input.aggregate, allocations);
}

export function buildCharacterAdvancementPlan(
  aggregate: CharacterAggregate,
  projectedAllocations: readonly CharacterSkillAllocationDraft[],
): CharacterAdvancementPlan {
  const tree = buildCharacterAdvancementTree(aggregate, projectedAllocations);
  const entries = tree.flatMap<CharacterAdvancementPlanEntry>((entry) => {
    if (entry.plannedPoints <= 0 || entry.allocationDraftId === null) return [];
    const parentIsNew = entry.parentDraftId !== null && entry.parentDraftId < 0;
    const planId = `allocation:${entry.allocationDraftId}`;
    return [{
      key: entry.key,
      path: entry.path.join(" → "),
      skillName: entry.skill.name,
      before: entry.currentSkillNumber,
      after: entry.projectedSkillNumber,
      experienceCost: entry.experienceCost,
      request: {
        planId,
        skillId: entry.skill.id,
        parentAllocationId:
          entry.parentDraftId !== null && !parentIsNew
            ? entry.parentDraftId
            : null,
        parentPlanId: parentIsNew
          ? `allocation:${entry.parentDraftId}`
          : null,
        pointsToAdd: entry.plannedPoints,
      },
    }];
  });
  const totalExperienceCost = entries.reduce(
    (total, entry) => total + entry.experienceCost,
    0,
  );
  return {
    entries,
    totalExperienceCost,
    experienceRemaining: aggregate.profile.experience - totalExperienceCost,
    lifetimeExperienceAfter:
      aggregate.profile.totalExperience + totalExperienceCost,
  };
}

import type { CampaignSystem } from "@/db/campaign-schema";

import { getCampaignMoneyBreakdown } from "./currency-rules";

import {
  CHARACTER_ATTRIBUTE_KEYS,
  type CharacterAggregate,
  type CharacterAttributeKey,
  type CharacterDraft,
  type CharacterRaceAggregate,
  type CharacterReadiness,
  type CharacterSkillAllocationDraft,
  type CharacterSkillReference,
} from "./models";

const EPSILON = 0.000001;
export const SPECIAL_ABILITY_EFFECTIVE_MAXIMUM = 100;

export const CHARACTER_SPELL_ACCESS_LEVELS = [
  { name: "Apprentice", minimumMana: 1 },
  { name: "Novice", minimumMana: 12 },
  { name: "Master", minimumMana: 32 },
  { name: "High Master", minimumMana: 72 },
  { name: "Grand Master", minimumMana: 142 },
] as const;

export type CharacterSpellAccessLevel =
  (typeof CHARACTER_SPELL_ACCESS_LEVELS)[number]["name"];

export type CharacterMagicSystem =
  | "Spellcraft"
  | "Talismanism"
  | "Faith"
  | "Psyonics"
  | "Bardic Resonance";

const MAGIC_SYSTEM_MANA_SKILLS: Record<CharacterMagicSystem, string> = {
  Spellcraft: "Channeling",
  Talismanism: "Channeling",
  Faith: "Devotion",
  Psyonics: "Psionic Channeling",
  "Bardic Resonance": "Resonance Attunement",
};

export function getAttributeModifier(score: number): number {
  if (score <= 1) return -5;
  if (score <= 5) return -4;
  if (score <= 10) return -3;
  if (score <= 15) return -2;
  if (score <= 20) return -1;
  if (score <= 29) return 0;
  return 1 + Math.floor((score - 30) / 5);
}

export function getAttributeRollTarget(score: number): number {
  return 100 - score;
}

export function getCharacterHp(constitution: number): number {
  return constitution * 2 + getAttributeModifier(constitution);
}

export const CHARACTER_HUMANOID_HP_POOLS = [
  { key: "head", name: "Head", percentage: 10 },
  { key: "rightArm", name: "Right Arm", percentage: 15 },
  { key: "leftArm", name: "Left Arm", percentage: 15 },
  { key: "rightLeg", name: "Right Leg", percentage: 15 },
  { key: "leftLeg", name: "Left Leg", percentage: 15 },
  { key: "torso", name: "Torso", percentage: 30 },
] as const;

export const CHARACTER_HUMANOID_HIT_LOCATIONS = [
  { result: 0, name: "Head", poolKey: "head" },
  { result: 1, name: "Right Arm", poolKey: "rightArm" },
  { result: 2, name: "Left Arm", poolKey: "leftArm" },
  { result: 3, name: "Right Lower Leg", poolKey: "rightLeg" },
  { result: 4, name: "Right Upper Leg", poolKey: "rightLeg" },
  { result: 5, name: "Left Lower Leg", poolKey: "leftLeg" },
  { result: 6, name: "Left Upper Leg", poolKey: "leftLeg" },
  { result: 7, name: "Groin", poolKey: "torso" },
  { result: 8, name: "Stomach", poolKey: "torso" },
  { result: 9, name: "Chest", poolKey: "torso" },
] as const;

export function getCharacterHpBreakdown(totalHp: number) {
  const normalizedTotal = Number.isFinite(totalHp) ? Math.max(0, totalHp) : 0;
  const pools = CHARACTER_HUMANOID_HP_POOLS.map((pool) => ({
    ...pool,
    hp: Math.ceil((normalizedTotal * pool.percentage) / 100),
  }));
  const poolsByKey = new Map(pools.map((pool) => [pool.key, pool]));

  return {
    totalHp: normalizedTotal,
    pools,
    locations: CHARACTER_HUMANOID_HIT_LOCATIONS.map((location) => {
      const pool = poolsByKey.get(location.poolKey);
      if (!pool) throw new Error(`Missing Character HP Pool ${location.poolKey}.`);
      return {
        ...location,
        poolName: pool.name,
        hp: pool.hp,
      };
    }),
  };
}

export function getBaseInitiative(dexterity: number): number {
  return dexterity < 5 ? 1 : 1 + Math.floor(dexterity / 5);
}

export function getMovementInitiative(
  dexterity: number,
  movementModeBaseValue: number,
): number {
  return getBaseInitiative(dexterity) * movementModeBaseValue;
}

export function normalizeSkillAttributeKey(
  value: string | null,
): CharacterAttributeKey | null {
  const key = value?.trim().toUpperCase();
  if (key === "CHA") return "CHR";
  return CHARACTER_ATTRIBUTE_KEYS.includes(key as CharacterAttributeKey)
    ? (key as CharacterAttributeKey)
    : null;
}

export function isSpecialAbilitySkill(skill: CharacterSkillReference): boolean {
  const classification = skill.classification.trim().toLowerCase();
  return classification === "special ability" || classification === "special abilities";
}

export function isSpellSkill(skill: CharacterSkillReference): boolean {
  const classification = skill.classification.trim().toLowerCase();
  return (
    classification === "spell" ||
    classification === "psionic skill" ||
    classification === "reverberation"
  );
}

export function getEffectiveSkillMaximum(
  skill: CharacterSkillReference,
  campaignMaximum: number,
): number {
  return isSpecialAbilitySkill(skill)
    ? SPECIAL_ABILITY_EFFECTIVE_MAXIMUM
    : campaignMaximum;
}

export function getRacialSkillGrant(
  race: CharacterRaceAggregate | null,
  skillId: number,
) {
  const links = race?.skillLinks.filter((link) => link.skillId === skillId) ?? [];
  return {
    granted: links.length > 0,
    minimum: links.reduce(
      (total, link) => total + Math.max(0, link.value ?? 0),
      0,
    ),
  };
}

export function getEffectiveSkillPoints(
  purchasedPoints: number,
  race: CharacterRaceAggregate | null,
  skillId: number,
) {
  return purchasedPoints + getRacialSkillGrant(race, skillId).minimum;
}

export function getPurchasedSkillMaximum(
  skill: CharacterSkillReference,
  campaignMaximum: number,
  racialPoints: number,
) {
  return Math.max(
    0,
    getEffectiveSkillMaximum(skill, campaignMaximum) - racialPoints,
  );
}

export function getCreationPurchasedSkillMaximum(
  skill: CharacterSkillReference,
  maxStartingSkill: number,
  campaignMaximum: number,
  racialPoints: number,
) {
  return Math.min(
    maxStartingSkill,
    getPurchasedSkillMaximum(skill, campaignMaximum, racialPoints),
  );
}

export function getSkillRank(
  pointsInvested: number,
  attributeModifier: number,
  parentRank: number | null,
  tier: number | null,
): number {
  if (!Number.isFinite(pointsInvested) || pointsInvested <= EPSILON) return 0;
  return tier !== null && tier > 1
    ? (parentRank ?? 0) + pointsInvested
    : pointsInvested + attributeModifier;
}

export function getSkillRollTarget(
  attributeScore: number,
  skillRank: number,
) {
  return 100 - (attributeScore + skillRank);
}

export function getAttributePointsUsed(draft: CharacterDraft) {
  return CHARACTER_ATTRIBUTE_KEYS.reduce(
    (total, key) => total + draft.attributes[key],
    0,
  );
}

export function getSkillPointsUsed(draft: CharacterDraft) {
  return draft.skillAllocations.reduce(
    (total, allocation) => total + allocation.points,
    0,
  );
}

export function getStartingFundsSpent(draft: CharacterDraft) {
  return draft.items.reduce(
    (total, entry) => total + entry.quantity * entry.unitCostCredits,
    0,
  );
}

export function getStartingFundsRemaining(
  draft: CharacterDraft,
  startingCredits: number,
) {
  return Math.max(0, startingCredits - getStartingFundsSpent(draft));
}

export function getRaceAttributeCap(
  race: CharacterRaceAggregate | null,
  key: CharacterAttributeKey,
) {
  const longName: Record<CharacterAttributeKey, string> = {
    STR: "Strength",
    DEX: "Dexterity",
    CON: "Constitution",
    INT: "Intelligence",
    WIS: "Wisdom",
    CHR: "Charisma",
  };
  return (
    race?.attributeCaps.find(
      (cap) =>
        cap.attributeKey.toUpperCase() === key ||
        cap.attributeKey.toLowerCase() === longName[key].toLowerCase(),
    )?.maxValue ?? null
  );
}

export function getRecordedSpellLevel(
  skill: CharacterSkillReference,
): CharacterSpellAccessLevel | null {
  const level = skill.spellLevel?.trim().toLowerCase();
  return (
    CHARACTER_SPELL_ACCESS_LEVELS.find(
      (candidate) => candidate.name.toLowerCase() === level,
    )?.name ?? null
  );
}

export function getSpellAccessLevelForManaPool(
  manaPool: number,
): CharacterSpellAccessLevel | null {
  let result: CharacterSpellAccessLevel | null = null;
  for (const level of CHARACTER_SPELL_ACCESS_LEVELS) {
    if (manaPool + EPSILON < level.minimumMana) break;
    result = level.name;
  }
  return result;
}

export function getCharacterMagicSystem(
  rootSkill: CharacterSkillReference,
): CharacterMagicSystem | null {
  const name = rootSkill.name.trim().toLowerCase();
  if (name === "spellcraft") return "Spellcraft";
  if (name === "talismanism") return "Talismanism";
  if (["faith", "prayer"].includes(name)) return "Faith";
  if (name === "psionic focus") return "Psyonics";
  if (name === "resonant performance") return "Bardic Resonance";
  return null;
}

function rootSystems(skill: CharacterSkillReference): CampaignSystem[] | null {
  const name = skill.name.trim().toLowerCase();
  const classification = skill.classification.trim().toLowerCase();
  if (classification === "standard") return [];
  if (isSpecialAbilitySkill(skill)) return ["Special Abilities"];
  if (name === "spellcraft") return ["Spellcraft"];
  if (name === "talismanism") return ["Talismanism"];
  if (["faith", "prayer", "devotion"].includes(name)) return ["Faith"];
  if (["psionic focus", "psionic meditation", "psionic channeling"].includes(name)) {
    return ["Psyonics"];
  }
  if (["resonant performance", "resonance attunement", "harmonic awareness"].includes(name)) {
    return ["Bardic Resonance"];
  }
  if (["channeling", "meditation"].includes(name)) {
    return ["Spellcraft", "Talismanism"];
  }
  return null;
}

const ONE_POINT_UNLOCK_SYSTEMS = new Set<CampaignSystem>([
  "Spellcraft",
  "Talismanism",
  "Faith",
  "Psyonics",
  "Bardic Resonance",
]);

export function getSkillUnlockThreshold(
  rootSkill: CharacterSkillReference,
  campaignThreshold: number,
) {
  const systems = rootSystems(rootSkill);
  return systems?.some((system) => ONE_POINT_UNLOCK_SYSTEMS.has(system))
    ? 1
    : campaignThreshold;
}

export function isSkillAllowedByCampaign(
  skill: CharacterSkillReference,
  rootSkill: CharacterSkillReference,
  allowedSystems: readonly CampaignSystem[],
  raciallyGranted = false,
) {
  if (raciallyGranted) return true;
  if (
    skill.tier !== null &&
    !allowedSystems.includes(`Tier ${skill.tier}` as CampaignSystem)
  ) {
    return false;
  }
  const systems = rootSystems(rootSkill);
  return (
    systems !== null &&
    (systems.length === 0 ||
      systems.some((system) => allowedSystems.includes(system)))
  );
}

export function canAccessSpellAtLevel(
  skill: CharacterSkillReference,
  spellAccessLevel: CharacterSpellAccessLevel | null,
) {
  if (!isSpellSkill(skill)) return true;
  const spellLevel = getRecordedSpellLevel(skill);
  if (!spellLevel || !spellAccessLevel) return false;
  const spellIndex = CHARACTER_SPELL_ACCESS_LEVELS.findIndex(
    (level) => level.name === spellLevel,
  );
  const accessIndex = CHARACTER_SPELL_ACCESS_LEVELS.findIndex(
    (level) => level.name === spellAccessLevel,
  );
  return spellIndex >= 0 && accessIndex >= spellIndex;
}

export function requiresCastingLevel(
  skill: CharacterSkillReference,
  rootSkill: CharacterSkillReference,
): boolean {
  return (
    isSpellSkill(skill) ||
    (skill.tier === 3 && getCharacterMagicSystem(rootSkill) !== null)
  );
}

export function canAccessSupernaturalSkillAtLevel(
  skill: CharacterSkillReference,
  rootSkill: CharacterSkillReference,
  spellAccessLevel: CharacterSpellAccessLevel | null,
): boolean {
  if (!requiresCastingLevel(skill, rootSkill)) return true;
  const spellLevel = getRecordedSpellLevel(skill);
  if (!spellLevel || !spellAccessLevel) return false;
  const requiredIndex = CHARACTER_SPELL_ACCESS_LEVELS.findIndex(
    (level) => level.name === spellLevel,
  );
  const accessIndex = CHARACTER_SPELL_ACCESS_LEVELS.findIndex(
    (level) => level.name === spellAccessLevel,
  );
  return requiredIndex >= 0 && accessIndex >= requiredIndex;
}

export function reconcileRacialSkillAnchors(
  allocations: readonly CharacterSkillAllocationDraft[],
  race: CharacterRaceAggregate | null,
  relationships: ReadonlyArray<CharacterAggregate["skillRelationships"][number]>,
  createDraftId: () => number,
): CharacterSkillAllocationDraft[] {
  let result = allocations.map((allocation) => ({ ...allocation }));
  const required = new Set<number>();
  const parentsBySkill = new Map<number, number[]>();
  for (const relationship of relationships) {
    if (relationship.relationshipType.trim().toLocaleLowerCase() !== "parent") {
      continue;
    }
    const parents = parentsBySkill.get(relationship.skillId) ?? [];
    if (!parents.includes(relationship.relatedSkillId)) {
      parents.push(relationship.relatedSkillId);
    }
    parentsBySkill.set(relationship.skillId, parents);
  }

  function ensurePath(
    skillId: number,
    visiting = new Set<number>(),
  ): CharacterSkillAllocationDraft | null {
    if (visiting.has(skillId)) return null;
    const parents = parentsBySkill.get(skillId) ?? [];
    if (parents.length > 1) return null;
    const nextVisiting = new Set(visiting).add(skillId);
    const parent =
      parents.length === 1 ? ensurePath(parents[0], nextVisiting) : null;
    if (parents.length === 1 && !parent) return null;
    const parentDraftId = parent?.draftId ?? null;
    let allocation = result.find(
      (candidate) =>
        candidate.skillId === skillId &&
        candidate.parentDraftId === parentDraftId,
    );
    if (!allocation) {
      allocation = {
        draftId: createDraftId(),
        skillId,
        parentDraftId,
        points: 0,
      };
      result.push(allocation);
    }
    required.add(allocation.draftId);
    return allocation;
  }

  for (const link of race?.skillLinks ?? []) {
    if ((link.value ?? 0) > 0) ensurePath(link.skillId);
  }

  let removed = true;
  while (removed) {
    removed = false;
    const parentIds = new Set(
      result.map((allocation) => allocation.parentDraftId),
    );
    const filtered = result.filter((allocation) => {
      const removable =
        allocation.points === 0 &&
        !required.has(allocation.draftId) &&
        !parentIds.has(allocation.draftId);
      if (removable) removed = true;
      return !removable;
    });
    result = filtered;
  }
  return result;
}

export function getCharacterManaProfiles(
  draft: Pick<CharacterDraft, "skillAllocations">,
  skillCatalog: readonly CharacterSkillReference[],
  race: CharacterRaceAggregate | null,
) {
  const baseMagic = Math.max(0, race?.race.baseMagic ?? 0);
  const effectivePoints = (skill: CharacterSkillReference) =>
    draft.skillAllocations
      .filter((allocation) => allocation.skillId === skill.id)
      .reduce(
        (maximum, allocation) =>
          Math.max(
            maximum,
            getEffectiveSkillPoints(allocation.points, race, skill.id),
          ),
        getRacialSkillGrant(race, skill.id).minimum,
      );

  return (
    Object.entries(MAGIC_SYSTEM_MANA_SKILLS) as Array<
      [CharacterMagicSystem, string]
    >
  ).flatMap(([system, sourceSkillName]) => {
    const accessSkill = skillCatalog.find(
      (skill) => getCharacterMagicSystem(skill) === system,
    );
    if (!accessSkill || effectivePoints(accessSkill) <= EPSILON) return [];

    const sourceSkill = skillCatalog.find(
      (skill) =>
        skill.name.trim().toLowerCase() === sourceSkillName.toLowerCase(),
    );
    const sourceSkillPoints = sourceSkill ? effectivePoints(sourceSkill) : 0;
    const manaPool = sourceSkillPoints * baseMagic;
    const spellAccessLevel = getSpellAccessLevelForManaPool(manaPool);
    const next = CHARACTER_SPELL_ACCESS_LEVELS.find(
      (level) => level.minimumMana > manaPool + EPSILON,
    );
    return [
      {
        system,
        sourceSkillName,
        sourceSkillPoints,
        baseMagic,
        manaPool,
        spellAccessLevel,
        nextLevel: next?.name ?? null,
        nextRequiredMana: next?.minimumMana ?? null,
      },
    ];
  });
}

export function characterAggregateToDraft(
  aggregate: CharacterAggregate,
): CharacterDraft {
  const attributes = Object.fromEntries(
    CHARACTER_ATTRIBUTE_KEYS.map((key) => [
      key,
      aggregate.attributes.find((attribute) => attribute.attributeKey === key)
        ?.value ?? 25,
    ]),
  ) as Record<CharacterAttributeKey, number>;

  const profile: CharacterDraft["profile"] = {
    raceId: aggregate.profile.raceId,
    age: aggregate.profile.age,
    sex: aggregate.profile.sex,
    heightFeet: aggregate.profile.heightFeet,
    heightInches: aggregate.profile.heightInches,
    weight: aggregate.profile.weight,
    skinColor: aggregate.profile.skinColor,
    eyeColor: aggregate.profile.eyeColor,
    hairColor: aggregate.profile.hairColor,
    deity: aggregate.profile.deity,
    definingMarks: aggregate.profile.definingMarks,
    personality: aggregate.profile.personality,
    goals: aggregate.profile.goals,
    secrets: aggregate.profile.secrets,
    backstory: aggregate.profile.backstory,
    motivations: aggregate.profile.motivations,
    fame: aggregate.profile.fame,
    experience: aggregate.profile.experience,
    totalExperience: aggregate.profile.totalExperience,
    quintessence: aggregate.profile.quintessence,
    totalQuintessence: aggregate.profile.totalQuintessence,
    fatePoints: aggregate.profile.fatePoints,
    creditsRemaining: aggregate.profile.creditsRemaining,
  };

  const currencyHoldings = aggregate.currencyHoldings.length
    ? aggregate.currencyHoldings.map((holding) => ({
        currencyId: holding.currencyId,
        quantity: holding.quantity,
      }))
    : aggregate.campaign.currencySystem === "Derived Currency"
      ? getCampaignMoneyBreakdown(
          aggregate.profile.creditsRemaining,
          aggregate.campaign.currencySystem,
          aggregate.campaign.derivedCurrencies,
        ).entries
          .filter((entry) => entry.quantity > 0)
          .map((entry) => ({ currencyId: entry.id, quantity: entry.quantity }))
      : [];

  return {
    name: aggregate.character.name,
    profile,
    attributes,
    skillAllocations: aggregate.skillAllocations.map((allocation) => ({
      draftId: allocation.id,
      skillId: allocation.skillId,
      parentDraftId: allocation.parentAllocationId,
      points: allocation.points,
    })),
    items: aggregate.items.map((entry) => ({
      itemId: entry.itemId,
      quantity: entry.quantity,
      unitCostCredits: entry.unitCostCredits,
    })),
    currencyHoldings,
  };
}

export function getCharacterSkillRanks(
  draft: CharacterDraft,
  skillCatalog: readonly CharacterSkillReference[],
  race: CharacterRaceAggregate | null = null,
) {
  const skills = new Map(skillCatalog.map((skill) => [skill.id, skill]));
  const allocations = new Map(
    draft.skillAllocations.map((allocation) => [allocation.draftId, allocation]),
  );
  const ranks = new Map<number, number>();
  const visiting = new Set<number>();

  function resolve(allocation: CharacterSkillAllocationDraft): number {
    const existing = ranks.get(allocation.draftId);
    if (existing !== undefined) return existing;
    if (visiting.has(allocation.draftId)) return 0;
    visiting.add(allocation.draftId);

    const skill = skills.get(allocation.skillId);
    if (!skill) {
      visiting.delete(allocation.draftId);
      return 0;
    }
    const attributeKey = normalizeSkillAttributeKey(skill.primaryAttribute);
    const attributeScore = attributeKey ? draft.attributes[attributeKey] : 0;
    const parent =
      allocation.parentDraftId === null
        ? null
        : allocations.get(allocation.parentDraftId) ?? null;
    const parentRank = parent ? resolve(parent) : null;
    const rank = getSkillRank(
      getEffectiveSkillPoints(allocation.points, race, allocation.skillId),
      attributeKey ? getAttributeModifier(attributeScore) : 0,
      parentRank,
      skill.tier,
    );
    visiting.delete(allocation.draftId);
    ranks.set(allocation.draftId, rank);
    return rank;
  }

  for (const allocation of draft.skillAllocations) resolve(allocation);
  return ranks;
}

export function evaluateCharacterReadiness(
  draft: CharacterDraft,
  aggregate: CharacterAggregate,
  race: CharacterRaceAggregate | null,
): CharacterReadiness {
  const issues: string[] = [];

  const identityComplete = Boolean(
    draft.name.trim() &&
      draft.name.trim().toLowerCase() !== "new character" &&
      draft.profile.age !== null &&
      draft.profile.age >= 0 &&
      draft.profile.sex.trim() &&
      (draft.profile.heightFeet ?? 0) * 12 +
        (draft.profile.heightInches ?? 0) >
        0 &&
      draft.profile.weight !== null &&
      draft.profile.weight > 0 &&
      draft.profile.skinColor.trim() &&
      draft.profile.eyeColor.trim() &&
      draft.profile.hairColor.trim() &&
      draft.profile.deity.trim() &&
      draft.profile.definingMarks.trim() &&
      (aggregate.campaign.fatePointMethod !== "Rolled" ||
        draft.profile.fatePoints !== null),
  );
  if (!identityComplete) issues.push("Required Identity fields are incomplete.");

  const raceComplete = draft.profile.raceId !== null && race !== null;
  if (!raceComplete) issues.push("Choose a Campaign-allowed Race.");

  const attributesUsed = getAttributePointsUsed(draft);
  let capsValid = true;
  for (const key of CHARACTER_ATTRIBUTE_KEYS) {
    const cap = getRaceAttributeCap(race, key);
    if (cap !== null && draft.attributes[key] > cap + EPSILON) {
      capsValid = false;
    }
  }
  const attributesComplete =
    Math.abs(attributesUsed - aggregate.campaign.attributePoints) <= EPSILON &&
    capsValid;
  if (Math.abs(attributesUsed - aggregate.campaign.attributePoints) > EPSILON) {
    issues.push("Allocate the exact Campaign Attribute Point budget.");
  }
  if (!capsValid) {
    issues.push("One or more Attributes exceed the selected Race cap.");
  }

  const skillPointsUsed = getSkillPointsUsed(draft);
  const skillCatalog = new Map(
    aggregate.skillCatalog.map((skill) => [skill.id, skill]),
  );
  const allocationMap = new Map(
    draft.skillAllocations.map((allocation) => [allocation.draftId, allocation]),
  );
  const relationshipKeys = new Set(
    aggregate.skillRelationships
      .filter(
        (relationship) => relationship.relationshipType.toLowerCase() === "parent",
      )
      .map(
        (relationship) =>
          `${relationship.skillId}:${relationship.relatedSkillId}`,
      ),
  );
  const manaProfiles = getCharacterManaProfiles(
    draft,
    aggregate.skillCatalog,
    race,
  );
  let skillRulesValid = true;
  const pathKeys = new Set<string>();
  const childCounts = new Map<number, number>();
  for (const allocation of draft.skillAllocations) {
    if (allocation.parentDraftId !== null) {
      childCounts.set(
        allocation.parentDraftId,
        (childCounts.get(allocation.parentDraftId) ?? 0) + 1,
      );
    }
  }

  for (const allocation of draft.skillAllocations) {
    const skill = skillCatalog.get(allocation.skillId);
    if (!skill || allocation.points < 0) {
      skillRulesValid = false;
      continue;
    }

    const racial = getRacialSkillGrant(race, allocation.skillId);
    const maximum = getCreationPurchasedSkillMaximum(
      skill,
      aggregate.campaign.maxStartingSkill,
      aggregate.campaign.maxPointsInSkill,
      racial.minimum,
    );
    if (allocation.points > maximum + EPSILON) {
      skillRulesValid = false;
    }
    if (
      allocation.points <= EPSILON &&
      !racial.granted &&
      !childCounts.has(allocation.draftId)
    ) {
      skillRulesValid = false;
    }

    const pathKey = `${allocation.parentDraftId ?? "root"}:${allocation.skillId}`;
    if (pathKeys.has(pathKey)) skillRulesValid = false;
    pathKeys.add(pathKey);

    if (
      allocation.parentDraftId === null &&
      skill.tier !== null &&
      skill.tier !== 1
    ) {
      skillRulesValid = false;
    }

    let cursor = allocation;
    let rootSkill = skill;
    const visited = new Set<number>();
    const parentEdges: Array<{
      child: CharacterSkillAllocationDraft;
      parent: CharacterSkillAllocationDraft;
    }> = [];

    while (cursor.parentDraftId !== null) {
      if (visited.has(cursor.draftId)) {
        skillRulesValid = false;
        break;
      }
      visited.add(cursor.draftId);
      const parent = allocationMap.get(cursor.parentDraftId);
      if (
        !parent ||
        !relationshipKeys.has(`${cursor.skillId}:${parent.skillId}`)
      ) {
        skillRulesValid = false;
        break;
      }
      parentEdges.push({ child: cursor, parent });
      const parentSkill = skillCatalog.get(parent.skillId);
      const cursorSkill = skillCatalog.get(cursor.skillId);
      if (!parentSkill) {
        skillRulesValid = false;
        break;
      }
      if (
        parentSkill.tier !== null &&
        cursorSkill?.tier !== null &&
        cursorSkill?.tier !== undefined &&
        cursorSkill.tier !== parentSkill.tier + 1
      ) {
        skillRulesValid = false;
      }
      cursor = parent;
      rootSkill = parentSkill;
    }

    if (
      parentEdges.some(
        ({ child, parent }) =>
          !getRacialSkillGrant(race, child.skillId).granted &&
          getEffectiveSkillPoints(parent.points, race, parent.skillId) +
            EPSILON <
            getSkillUnlockThreshold(
              rootSkill,
              aggregate.campaign.pointsToUnlockNextTier,
            ),
      )
    ) {
      skillRulesValid = false;
    }

    if (
      !isSkillAllowedByCampaign(
        skill,
        rootSkill,
        aggregate.campaign.allowedSystems,
        racial.granted,
      )
    ) {
      skillRulesValid = false;
    }

    if (requiresCastingLevel(skill, rootSkill)) {
      const magicSystem = getCharacterMagicSystem(rootSkill);
      const accessLevel = magicSystem
        ? manaProfiles.find((profile) => profile.system === magicSystem)
            ?.spellAccessLevel ?? null
        : null;
      if (
        !magicSystem ||
        !canAccessSupernaturalSkillAtLevel(
          skill,
          rootSkill,
          accessLevel,
        )
      ) {
        skillRulesValid = false;
      }
    }
  }

  const skillsComplete =
    Math.abs(skillPointsUsed - aggregate.campaign.skillPoints) <= EPSILON &&
    skillRulesValid;
  if (Math.abs(skillPointsUsed - aggregate.campaign.skillPoints) > EPSILON) {
    issues.push("Allocate the exact Campaign Skill Point budget.");
  }
  if (!skillRulesValid) {
    issues.push("One or more Skill allocations violate Campaign rules.");
  }

  const storyComplete = Boolean(
    draft.profile.personality.trim() &&
      draft.profile.goals.trim() &&
      draft.profile.secrets.trim() &&
      draft.profile.backstory.trim() &&
      draft.profile.motivations.trim(),
  );
  if (!storyComplete) {
    issues.push("Complete every Story & Personality field.");
  }

  const spent = getStartingFundsSpent(draft);
  const fundsRemaining = Math.max(
    0,
    aggregate.campaign.startingCreditAmount - spent,
  );
  const authorized = new Map(
    aggregate.authorizedItems.map((entry) => [entry.id, entry]),
  );
  const seen = new Set<number>();
  const itemRulesValid =
    draft.items.every((entry) => {
      const source = authorized.get(entry.itemId);
      if (
        !source ||
        source.credits === null ||
        seen.has(entry.itemId) ||
        !Number.isInteger(entry.quantity) ||
        entry.quantity <= 0 ||
        Math.abs(source.credits - entry.unitCostCredits) > EPSILON
      ) {
        return false;
      }
      seen.add(entry.itemId);
      return true;
    }) && spent <= aggregate.campaign.startingCreditAmount + EPSILON;

  if (!itemRulesValid) {
    issues.push(
      "Starting possessions must be priced and authorized by this Campaign.",
    );
  }
  const equipmentComplete =
    itemRulesValid &&
    draft.items.some(
      (entry) =>
        authorized.get(entry.itemId)?.catalogScope.toLowerCase() === "equipment",
    );
  if (!equipmentComplete) {
    issues.push("Purchase at least one Campaign-authorized Equipment item.");
  }

  return {
    ready:
      identityComplete &&
      raceComplete &&
      attributesComplete &&
      skillsComplete &&
      storyComplete &&
      equipmentComplete,
    identityComplete,
    raceComplete,
    attributesComplete,
    skillsComplete,
    storyComplete,
    equipmentComplete,
    attributesUsed,
    skillPointsUsed,
    fundsRemaining,
    issues,
  };
}

/**
 * Compatibility export for older character UI code.
 * Advancement itself imports the dedicated quintessence-rules module.
 */
export function getQuintessenceCost(
  purchaseType: "attribute" | "fatePoints" | "experience",
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (purchaseType === "attribute") return quantity * 5;
  if (purchaseType === "fatePoints") return quantity * 10;
  return quantity;
}

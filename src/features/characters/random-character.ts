import type { CampaignSystem } from "@/db/campaign-schema";

import {
  CHARACTER_ATTRIBUTE_KEYS,
  type CharacterAggregate,
  type CharacterAttributeKey,
  type CharacterDraft,
  type CharacterRaceAggregate,
  type CharacterSkillAllocationDraft,
  type CharacterSkillReference,
} from "./models";
import {
  canAccessSupernaturalSkillAtLevel,
  getCharacterMagicSystem,
  getCharacterManaProfiles,
  getCreationPurchasedSkillMaximum,
  getEffectiveSkillPoints,
  getRaceAttributeCap,
  getRacialSkillGrant,
  getSkillUnlockThreshold,
  isSkillAllowedByCampaign,
  normalizeSkillAttributeKey,
  reconcileRacialSkillAnchors,
  requiresCastingLevel,
  type CharacterMagicSystem,
} from "./character-rules";

export type CharacterGenerationMode = "guided" | "complete";
export type RandomCharacterFocus = "vanguard" | "scout" | "scholar" | "envoy" | "balanced";
export type RandomCharacterMagic = CharacterMagicSystem | "none" | "surprise";
export type RandomCharacterEquipment = "armed" | "armored" | "prepared" | "mixed";
export type RandomCharacterTemperament = "bold" | "compassionate" | "cunning" | "curious" | "stoic";

export type GuidedRandomCharacterAnswers = {
  name: string;
  raceId: number | null;
  focus: RandomCharacterFocus;
  magic: RandomCharacterMagic;
  equipment: RandomCharacterEquipment;
  temperament: RandomCharacterTemperament;
};

export type RandomCharacterResult = {
  draft: CharacterDraft;
  warnings: string[];
};

export const RANDOM_CHARACTER_FOCUS_OPTIONS = [
  { value: "vanguard", label: "Vanguard", description: "Strength, toughness, and direct action." },
  { value: "scout", label: "Scout", description: "Speed, awareness, and careful movement." },
  { value: "scholar", label: "Scholar", description: "Knowledge, reason, and mystical study." },
  { value: "envoy", label: "Envoy", description: "Presence, empathy, and social influence." },
  { value: "balanced", label: "Adaptable", description: "An even spread without one dominant approach." },
] as const;

export const RANDOM_CHARACTER_EQUIPMENT_OPTIONS = [
  { value: "armed", label: "Ready for a Fight", description: "Favor a Campaign-authorized weapon." },
  { value: "armored", label: "Protected", description: "Favor Campaign-authorized armor." },
  { value: "prepared", label: "Well Prepared", description: "Favor general adventuring equipment." },
  { value: "mixed", label: "Surprise Me", description: "Choose from all available Equipment." },
] as const;

export const RANDOM_CHARACTER_TEMPERAMENT_OPTIONS = [
  { value: "bold", label: "Bold", description: "Decisive, daring, and eager to act." },
  { value: "compassionate", label: "Compassionate", description: "Protective, patient, and people-focused." },
  { value: "cunning", label: "Cunning", description: "Careful, private, and strategically minded." },
  { value: "curious", label: "Curious", description: "Restless, observant, and drawn to mysteries." },
  { value: "stoic", label: "Stoic", description: "Steady, disciplined, and difficult to rattle." },
] as const;

const MAGIC_SYSTEMS: CharacterMagicSystem[] = [
  "Spellcraft",
  "Talismanism",
  "Faith",
  "Psyonics",
  "Bardic Resonance",
];

const MAGIC_SOURCE_SKILLS: Record<CharacterMagicSystem, string> = {
  Spellcraft: "Channeling",
  Talismanism: "Channeling",
  Faith: "Devotion",
  Psyonics: "Psionic Channeling",
  "Bardic Resonance": "Resonance Attunement",
};

const ROLE_ATTRIBUTE_WEIGHTS: Record<RandomCharacterFocus, Record<CharacterAttributeKey, number>> = {
  vanguard: { STR: 6, DEX: 2, CON: 6, INT: 1, WIS: 2, CHR: 1 },
  scout: { STR: 2, DEX: 6, CON: 3, INT: 2, WIS: 5, CHR: 1 },
  scholar: { STR: 1, DEX: 2, CON: 2, INT: 6, WIS: 5, CHR: 2 },
  envoy: { STR: 1, DEX: 2, CON: 2, INT: 3, WIS: 5, CHR: 6 },
  balanced: { STR: 3, DEX: 3, CON: 3, INT: 3, WIS: 3, CHR: 3 },
};

const NAMES = [
  "Alden", "Briala", "Caelis", "Dorian", "Elira", "Fenric", "Ilyra", "Joren",
  "Kael", "Liora", "Marek", "Neris", "Orin", "Rhea", "Sable", "Tavian",
  "Veyra", "Wren", "Ysra", "Zorin",
];
const FAMILY_NAMES = [
  "Ashfall", "Brightwater", "Dawnward", "Emberlane", "Farstride", "Greywake",
  "Hollowmere", "Ironwood", "Moonbrook", "Nightwind", "Stormbound", "Valewalker",
];
const SKIN_COLORS = ["Bronze", "Brown", "Deep brown", "Fair", "Olive", "Pale", "Russet", "Umber"];
const EYE_COLORS = ["Amber", "Blue", "Brown", "Gold", "Green", "Grey", "Hazel", "Violet"];
const HAIR_COLORS = ["Auburn", "Black", "Blonde", "Brown", "Copper", "Grey", "Red", "White"];
const SEXES = ["Female", "Male", "Nonbinary"];

function randomIndex(length: number, random: () => number): number {
  if (length <= 1) return 0;
  return Math.min(length - 1, Math.floor(Math.max(0, random()) * length));
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[randomIndex(values.length, random)]!;
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1, random);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function weightedChoice<T>(values: readonly T[], weight: (value: T) => number, random: () => number): T {
  const weights = values.map((value) => Math.max(0.01, weight(value)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = Math.max(0, random()) * total;
  for (let index = 0; index < values.length; index += 1) {
    cursor -= weights[index]!;
    if (cursor <= 0) return values[index]!;
  }
  return values[values.length - 1]!;
}

function randomWholeBetween(minimum: number, maximum: number, random: () => number): number {
  const low = Math.ceil(Math.min(minimum, maximum));
  const high = Math.floor(Math.max(minimum, maximum));
  return low + randomIndex(Math.max(1, high - low + 1), random);
}

export function availableRandomMagicSystems(allowedSystems: readonly CampaignSystem[]): CharacterMagicSystem[] {
  return MAGIC_SYSTEMS.filter((system) => allowedSystems.includes(system));
}

export function createCompletelyRandomAnswers(
  aggregate: CharacterAggregate,
  random: () => number = Math.random,
): GuidedRandomCharacterAnswers {
  const magicSystems = availableRandomMagicSystems(aggregate.campaign.allowedSystems);
  const magicChoices: RandomCharacterMagic[] = ["none", ...magicSystems];
  return {
    name: "",
    raceId: aggregate.allowedRaces.length > 0 ? pick(aggregate.allowedRaces, random).id : null,
    focus: pick(RANDOM_CHARACTER_FOCUS_OPTIONS, random).value,
    magic: pick(magicChoices, random),
    equipment: pick(RANDOM_CHARACTER_EQUIPMENT_OPTIONS, random).value,
    temperament: pick(RANDOM_CHARACTER_TEMPERAMENT_OPTIONS, random).value,
  };
}

export function resolveRandomCharacterRaceId(
  allowedRaces: readonly CharacterAggregate["allowedRaces"][number][],
  requestedRaceId: number | null,
  random: () => number = Math.random,
): number | null {
  if (requestedRaceId !== null) {
    return allowedRaces.some((race) => race.id === requestedRaceId)
      ? requestedRaceId
      : null;
  }
  return allowedRaces.length > 0 ? pick(allowedRaces, random).id : null;
}

function generatedName(requested: string, random: () => number): string {
  const name = requested.trim();
  return name || `${pick(NAMES, random)} ${pick(FAMILY_NAMES, random)}`;
}

function generateAttributes(
  aggregate: CharacterAggregate,
  race: CharacterRaceAggregate,
  focus: RandomCharacterFocus,
  random: () => number,
): { attributes: CharacterDraft["attributes"]; unspent: number } {
  const attributes = Object.fromEntries(
    CHARACTER_ATTRIBUTE_KEYS.map((key) => [key, 0]),
  ) as CharacterDraft["attributes"];
  let remaining = Math.max(0, aggregate.campaign.attributePoints);
  while (remaining > 0.000001) {
    const available = CHARACTER_ATTRIBUTE_KEYS.filter((key) => {
      const cap = getRaceAttributeCap(race, key) ?? Number.POSITIVE_INFINITY;
      return attributes[key] + 0.000001 < cap;
    });
    if (available.length === 0) break;
    const key = weightedChoice(
      available,
      (candidate) => ROLE_ATTRIBUTE_WEIGHTS[focus][candidate],
      random,
    );
    const cap = getRaceAttributeCap(race, key) ?? Number.POSITIVE_INFINITY;
    const amount = Math.min(1, remaining, cap - attributes[key]);
    attributes[key] += amount;
    remaining -= amount;
  }
  return { attributes, unspent: remaining };
}

type SkillCandidate = {
  skill: CharacterSkillReference;
  parentDraftId: number | null;
  rootSkill: CharacterSkillReference;
  allocation?: CharacterSkillAllocationDraft;
};

function generateSkills(
  aggregate: CharacterAggregate,
  race: CharacterRaceAggregate,
  baseDraft: CharacterDraft,
  focus: RandomCharacterFocus,
  magicPreference: RandomCharacterMagic,
  random: () => number,
): { allocations: CharacterSkillAllocationDraft[]; unspent: number } {
  let nextDraftId = -1;
  let allocations = reconcileRacialSkillAnchors(
    [],
    race,
    aggregate.skillRelationships,
    () => nextDraftId--,
  );
  const skillsById = new Map(aggregate.skillCatalog.map((skill) => [skill.id, skill]));
  const childIds = new Set(aggregate.skillRelationships
    .filter(({ relationshipType }) => relationshipType.toLowerCase() === "parent")
    .map(({ skillId }) => skillId));
  const childrenByParent = new Map<number, CharacterSkillReference[]>();
  for (const relationship of aggregate.skillRelationships) {
    if (relationship.relationshipType.toLowerCase() !== "parent") continue;
    const child = skillsById.get(relationship.skillId);
    if (!child) continue;
    const children = childrenByParent.get(relationship.relatedSkillId) ?? [];
    if (!children.some(({ id }) => id === child.id)) children.push(child);
    childrenByParent.set(relationship.relatedSkillId, children);
  }

  function rootFor(allocation: CharacterSkillAllocationDraft): CharacterSkillReference | null {
    let cursor = allocation;
    const visited = new Set<number>();
    while (cursor.parentDraftId !== null) {
      if (!visited.add(cursor.draftId)) return null;
      const parent = allocations.find(({ draftId }) => draftId === cursor.parentDraftId);
      if (!parent) return null;
      cursor = parent;
    }
    return skillsById.get(cursor.skillId) ?? null;
  }

  function eligibleCandidates(): SkillCandidate[] {
    const draft = { ...baseDraft, skillAllocations: allocations };
    const manaProfiles = getCharacterManaProfiles(draft, aggregate.skillCatalog, race);
    const candidates: SkillCandidate[] = [];
    const roots = aggregate.skillCatalog.filter((skill) =>
      !childIds.has(skill.id) && (skill.tier === null || skill.tier === 1));

    for (const skill of roots) {
      const allocation = allocations.find(({ skillId, parentDraftId }) =>
        skillId === skill.id && parentDraftId === null);
      const racial = getRacialSkillGrant(race, skill.id);
      if (!isSkillAllowedByCampaign(skill, skill, aggregate.campaign.allowedSystems, true, racial.granted)) continue;
      const maximum = getCreationPurchasedSkillMaximum(
        skill,
        aggregate.campaign.maxStartingSkill,
        aggregate.campaign.maxPointsInSkill,
        racial.minimum,
      );
      if ((allocation?.points ?? 0) + 0.000001 < maximum) {
        candidates.push({ skill, parentDraftId: null, rootSkill: skill, allocation });
      }
    }

    for (const parent of allocations) {
      const parentSkill = skillsById.get(parent.skillId);
      const rootSkill = rootFor(parent);
      if (!parentSkill || !rootSkill) continue;
      for (const skill of childrenByParent.get(parent.skillId) ?? []) {
        const allocation = allocations.find(({ skillId, parentDraftId }) =>
          skillId === skill.id && parentDraftId === parent.draftId);
        const racial = getRacialSkillGrant(race, skill.id);
        const threshold = getSkillUnlockThreshold(rootSkill, aggregate.campaign.pointsToUnlockNextTier);
        if (!racial.granted
          && getEffectiveSkillPoints(parent.points, race, parent.skillId) + 0.000001 < threshold) {
          continue;
        }
        if (!isSkillAllowedByCampaign(skill, rootSkill, aggregate.campaign.allowedSystems, true, racial.granted)) continue;
        if (requiresCastingLevel(skill, rootSkill)) {
          const magicSystem = getCharacterMagicSystem(rootSkill);
          const accessLevel = magicSystem
            ? manaProfiles.find(({ system }) => system === magicSystem)?.spellAccessLevel ?? null
            : null;
          if (!magicSystem || !canAccessSupernaturalSkillAtLevel(skill, rootSkill, accessLevel)) continue;
        }
        const maximum = getCreationPurchasedSkillMaximum(
          skill,
          aggregate.campaign.maxStartingSkill,
          aggregate.campaign.maxPointsInSkill,
          racial.minimum,
        );
        if ((allocation?.points ?? 0) + 0.000001 < maximum) {
          candidates.push({ skill, parentDraftId: parent.draftId, rootSkill, allocation });
        }
      }
    }
    return candidates;
  }

  function candidateWeight(candidate: SkillCandidate): number {
    const attribute = normalizeSkillAttributeKey(candidate.skill.primaryAttribute);
    let weight = attribute ? ROLE_ATTRIBUTE_WEIGHTS[focus][attribute] : 1.5;
    const system = getCharacterMagicSystem(candidate.rootSkill);
    const sourceName = magicPreference !== "none" && magicPreference !== "surprise"
      ? MAGIC_SOURCE_SKILLS[magicPreference]
      : null;
    if (magicPreference === "none") {
      if (system || MAGIC_SYSTEMS.some((magic) => MAGIC_SOURCE_SKILLS[magic] === candidate.skill.name)) {
        weight *= 0.12;
      }
    } else if (magicPreference !== "surprise") {
      if (system === magicPreference) weight += 14;
      else if (system) weight *= 0.18;
      if (candidate.skill.name === sourceName) weight += 14;
    }
    if (candidate.allocation) weight += 2.5;
    if (candidate.skill.tier === 2) weight += 1;
    if (candidate.skill.tier === 3) weight += 0.5;
    return weight;
  }

  let remaining = Math.max(0, aggregate.campaign.skillPoints);
  while (remaining > 0.000001) {
    const candidates = eligibleCandidates();
    if (candidates.length === 0) break;
    const candidate = weightedChoice(candidates, candidateWeight, random);
    const racial = getRacialSkillGrant(race, candidate.skill.id);
    const maximum = getCreationPurchasedSkillMaximum(
      candidate.skill,
      aggregate.campaign.maxStartingSkill,
      aggregate.campaign.maxPointsInSkill,
      racial.minimum,
    );
    const currentPoints = candidate.allocation?.points ?? 0;
    const amount = Math.min(1, remaining, maximum - currentPoints);
    if (amount <= 0) break;
    if (candidate.allocation) {
      allocations = allocations.map((allocation) => allocation.draftId === candidate.allocation!.draftId
        ? { ...allocation, points: allocation.points + amount }
        : allocation);
    } else {
      allocations = [...allocations, {
        draftId: nextDraftId--,
        skillId: candidate.skill.id,
        parentDraftId: candidate.parentDraftId,
        points: amount,
      }];
    }
    remaining -= amount;
  }
  return { allocations, unspent: remaining };
}

function generateItems(
  aggregate: CharacterAggregate,
  preference: RandomCharacterEquipment,
  random: () => number,
): CharacterDraft["items"] {
  const budget = Math.max(0, aggregate.campaign.startingCreditAmount);
  const equipment = aggregate.authorizedItems.filter((item) =>
    item.catalogScope.toLowerCase() === "equipment"
    && item.credits !== null
    && item.credits >= 0
    && item.credits <= budget);
  if (equipment.length === 0) return [];
  const preferredGroup = preference === "armed"
    ? "weapon"
    : preference === "armored"
      ? "armor"
      : preference === "prepared"
        ? "general"
        : null;
  const preferred = preferredGroup
    ? equipment.filter(({ equipmentGroup }) => equipmentGroup?.toLowerCase() === preferredGroup)
    : equipment;
  const first = pick(preferred.length > 0 ? preferred : equipment, random);
  const chosen = [first];
  let spent = first.credits ?? 0;
  const additional = shuffled(
    aggregate.authorizedItems.filter((item) =>
      item.id !== first.id && item.credits !== null && item.credits >= 0),
    random,
  );
  for (const item of additional) {
    if (chosen.length >= 3) break;
    if (spent + item.credits! > budget) continue;
    if (random() < 0.48) {
      chosen.push(item);
      spent += item.credits!;
    }
  }
  return chosen.map((item) => ({ itemId: item.id, quantity: 1, unitCostCredits: item.credits ?? 0 }));
}

function sizeIdentity(size: string, random: () => number) {
  const profiles: Record<string, { inches: number; weight: number }> = {
    Minuscule: { inches: 6, weight: 1 },
    Tiny: { inches: 18, weight: 8 },
    Small: { inches: 42, weight: 55 },
    Medium: { inches: 66, weight: 155 },
    Large: { inches: 90, weight: 340 },
    Huge: { inches: 144, weight: 1400 },
    Gargantuan: { inches: 240, weight: 4800 },
    Colossal: { inches: 420, weight: 15000 },
  };
  const profile = profiles[size] ?? profiles.Medium!;
  const heightInches = Math.max(1, profile.inches + randomWholeBetween(-4, 5, random));
  const weight = Math.max(1, Math.round(profile.weight * (0.85 + random() * 0.3)));
  return {
    heightFeet: Math.floor(heightInches / 12),
    heightInches: heightInches % 12,
    weight,
  };
}

function storyFor(temperament: RandomCharacterTemperament, raceName: string) {
  const stories: Record<RandomCharacterTemperament, {
    personality: string;
    goals: string;
    secrets: string;
    backstory: string;
    motivations: string;
  }> = {
    bold: {
      personality: "Decisive and daring, with a habit of stepping forward when others hesitate.",
      goals: "Earn a reputation for meeting impossible dangers head-on.",
      secrets: "Quietly fears that courage will one day become recklessness.",
      backstory: `Raised among ${raceName} traditions, this adventurer learned that action can change a story before fear takes hold.`,
      motivations: "Protect companions, confront threats, and prove that decisive action matters.",
    },
    compassionate: {
      personality: "Patient, protective, and quick to notice when someone is being overlooked.",
      goals: "Build a safer future for the people and places encountered along the journey.",
      secrets: "Carries guilt over someone they could not help in the past.",
      backstory: `Life among the ${raceName} taught this adventurer that strength is measured by who benefits from it.`,
      motivations: "Ease suffering, preserve trust, and keep the group from losing its humanity.",
    },
    cunning: {
      personality: "Observant, private, and always considering what has been left unsaid.",
      goals: "Gain enough knowledge and leverage to remain one step ahead of every rival.",
      secrets: "Maintains a hidden connection to someone the group may not trust.",
      backstory: `Navigating competing expectations within ${raceName} society taught this adventurer to survive through preparation and careful words.`,
      motivations: "Uncover motives, control risks, and ensure no enemy dictates the terms.",
    },
    curious: {
      personality: "Restless, inquisitive, and delighted by mysteries that resist easy answers.",
      goals: "Discover something that changes how the world understands itself.",
      secrets: "Once opened a forbidden path and has never revealed what answered.",
      backstory: `The unanswered questions of ${raceName} history drew this adventurer away from familiar ground and into the wider world.`,
      motivations: "Explore the unknown, preserve discoveries, and follow every worthwhile question.",
    },
    stoic: {
      personality: "Disciplined, dependable, and sparing with words even under pressure.",
      goals: "Complete a long-standing duty without sacrificing the people who now share it.",
      secrets: "Bears a private grief that is acknowledged only in solitary moments.",
      backstory: `A demanding duty within ${raceName} culture shaped this adventurer into someone others can rely upon when conditions worsen.`,
      motivations: "Honor commitments, endure hardship, and leave every place more stable than it was found.",
    },
  };
  return stories[temperament];
}

export function generateRandomCharacterDraft(
  aggregate: CharacterAggregate,
  race: CharacterRaceAggregate,
  baseDraft: CharacterDraft,
  answers: GuidedRandomCharacterAnswers,
  random: () => number = Math.random,
): RandomCharacterResult {
  const warnings: string[] = [];
  const attributes = generateAttributes(aggregate, race, answers.focus, random);
  const skills = generateSkills(aggregate, race, baseDraft, answers.focus, answers.magic, random);
  const items = generateItems(aggregate, answers.equipment, random);
  const identity = sizeIdentity(race.race.size, random);
  const ageMinimum = race.race.ageMin ?? 18;
  const ageMaximum = race.race.ageMax ?? Math.max(ageMinimum, 65);
  const story = storyFor(answers.temperament, race.race.name);

  if (attributes.unspent > 0.000001) {
    warnings.push(`${attributes.unspent} Attribute Points could not be assigned within this Race's caps.`);
  }
  if (skills.unspent > 0.000001) {
    warnings.push(`${skills.unspent} Skill Points could not be assigned without breaking Campaign rules.`);
  }
  if (items.length === 0) {
    warnings.push("No priced Campaign-authorized Equipment was available, so starting Equipment still needs attention.");
  }
  if (aggregate.campaign.fatePointMethod === "Rolled" && baseDraft.profile.fatePoints === null) {
    warnings.push("Rolled Fate Points remain blank because this Campaign does not define a die formula for the generator.");
  }

  const draft: CharacterDraft = {
    ...baseDraft,
    name: generatedName(answers.name, random),
    profile: {
      ...baseDraft.profile,
      raceId: race.race.id,
      age: randomWholeBetween(ageMinimum, ageMaximum, random),
      sex: pick(SEXES, random),
      ...identity,
      skinColor: pick(SKIN_COLORS, random),
      eyeColor: pick(EYE_COLORS, random),
      hairColor: pick(HAIR_COLORS, random),
      deity: "None",
      definingMarks: "No immediately distinguishing marks.",
      ...story,
      fatePoints: aggregate.campaign.fatePointMethod === "Assigned"
        ? aggregate.campaign.assignedFatePoints ?? 0
        : baseDraft.profile.fatePoints,
    },
    attributes: attributes.attributes,
    skillAllocations: skills.allocations,
    items,
  };
  return { draft, warnings };
}

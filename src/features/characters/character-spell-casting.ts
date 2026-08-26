import type {
  SpellCastingSystem,
  SpellDocument,
} from "@/features/spell-construction/models/spell";

import {
  characterAggregateToDraft,
  getCharacterMagicSystem,
  getCharacterManaProfiles,
} from "./character-rules";
import type {
  CharacterAggregate,
  CharacterSkillAllocation,
} from "./models";

export type CharacterSpellCastingContext = {
  system: SpellCastingSystem;
  profile: ReturnType<typeof getCharacterManaProfiles>[number];
};

function rootSystemForAllocation(
  aggregate: CharacterAggregate,
  allocation: CharacterSkillAllocation,
): SpellCastingSystem | null {
  const allocationsById = new Map(
    aggregate.skillAllocations.map((candidate) => [candidate.id, candidate]),
  );
  const skillsById = new Map(
    aggregate.skillCatalog.map((skill) => [skill.id, skill]),
  );
  let cursor = allocation;
  const visited = new Set<number>();
  while (cursor.parentAllocationId !== null) {
    if (!visited.add(cursor.id)) return null;
    const parent = allocationsById.get(cursor.parentAllocationId);
    if (!parent) return null;
    cursor = parent;
  }
  const rootSkill = skillsById.get(cursor.skillId);
  return rootSkill
    ? (getCharacterMagicSystem(rootSkill) as SpellCastingSystem | null)
    : null;
}

export function getAvailableSpellCastingContexts(
  aggregate: CharacterAggregate,
  spell: SpellDocument,
): CharacterSpellCastingContext[] {
  const profiles = getCharacterManaProfiles(
    characterAggregateToDraft(aggregate),
    aggregate.skillCatalog,
    aggregate.selectedRace,
  );
  const allowedSystems: SpellCastingSystem[] =
    spell.tradition === "Psionics"
      ? ["Psyonics"]
      : spell.tradition === "Bardic Resonance"
        ? ["Bardic Resonance"]
        : ["Spellcraft", "Talismanism", "Faith"];
  return profiles
    .filter((profile) => allowedSystems.includes(profile.system))
    .map((profile) => ({ system: profile.system, profile }));
}

export function resolveCharacterSpellCastingContext(
  aggregate: CharacterAggregate,
  spell: SpellDocument,
  allocationId?: number,
): CharacterSpellCastingContext | null {
  const contexts = getAvailableSpellCastingContexts(aggregate, spell);
  let system = spell.castingSystem;
  if (allocationId !== undefined) {
    const allocation = aggregate.skillAllocations.find(
      ({ id }) => id === allocationId,
    );
    system = allocation
      ? rootSystemForAllocation(aggregate, allocation) ?? undefined
      : undefined;
  }
  if (!system && spell.frameworkSkillId) {
    const frameworkSystems = new Set(
      aggregate.skillAllocations
        .filter(
          ({ skillId, points }) =>
            skillId === spell.frameworkSkillId && points > 0,
        )
        .map((allocation) => rootSystemForAllocation(aggregate, allocation))
        .filter(
          (candidate): candidate is SpellCastingSystem => candidate !== null,
        ),
    );
    if (frameworkSystems.size === 1) system = [...frameworkSystems][0];
  }
  if (!system && contexts.length === 1) system = contexts[0]?.system;
  return contexts.find((context) => context.system === system) ?? null;
}

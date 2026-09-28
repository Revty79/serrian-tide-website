import { CHARACTER_ATTRIBUTE_KEYS, CHARACTER_ATTRIBUTE_LABELS, type CharacterAggregate, type CharacterAttributeKey } from "@/features/characters/models";
import { getCharacterSkillPointsById, getRacialSkillGrant } from "@/features/characters/character-rules";
import { resolveEffectiveCreatureStatistics } from "@/features/creatures/creature-size-rules";
import type { CreatureDraft } from "@/features/creatures/models";
import { evaluateFormAccess, type FormAccess, type FormAccessContext, type FormAccessEvaluation } from "./form-access";

type NormalCharacter = Pick<CharacterAggregate, "attributes" | "skillAllocations" | "selectedRace" | "derivedAbilityStatuses" | "profile">;

/** Saved aggregate only: unsaved edits and preview mechanics cannot grant access. */
export function characterFormAccessContext(aggregate: NormalCharacter): FormAccessContext {
  const skillPoints = getCharacterSkillPointsById({ skillAllocations: aggregate.skillAllocations.map(row => ({ draftId: row.id, skillId: row.skillId, points: row.points, parentDraftId: row.parentAllocationId })) });
  return characterFormAccessContextFromFacts({ attributes: aggregate.attributes, skillPoints,
    racialSkillIds: (aggregate.selectedRace?.skillLinks ?? []).filter(link => getRacialSkillGrant(aggregate.selectedRace, link.skillId).granted).map(link => link.skillId),
    possessedDerivedAbilityIds: new Set((aggregate.derivedAbilityStatuses ?? []).filter(row => row.possessed).map(row => row.abilityId)) });
}

/** Same Normal-state access facts for aggregate previews and transaction-scoped readers. */
export function characterFormAccessContextFromFacts(facts: {
  attributes: readonly { attributeKey: string; value: number | null }[];
  skillPoints: ReadonlyMap<number, number>; racialSkillIds: readonly number[]; possessedDerivedAbilityIds: ReadonlySet<number>;
}): FormAccessContext {
  const attributes = Object.fromEntries(CHARACTER_ATTRIBUTE_KEYS.map(key => [key, facts.attributes.find(row => row.attributeKey === key)?.value ?? null]));
  const possessedSkillIds = new Set(facts.racialSkillIds);
  for (const [id, points] of facts.skillPoints) if (points > 0) possessedSkillIds.add(id);
  return { owner: "race", attributes, skillPoints: facts.skillPoints, possessedSkillIds, possessedDerivedAbilityIds: facts.possessedDerivedAbilityIds };
}

export function evaluateCharacterFormAccess(aggregate: NormalCharacter, raceId: number, access: FormAccess | undefined): FormAccessEvaluation {
  if (access?.mode === "requirements" && (aggregate.profile.raceId !== raceId || aggregate.selectedRace?.race.id !== raceId)) return { status: "manual-review", explanation: "Save the selected Race before evaluating its Form Access against the Character's Normal state.", groups: [] };
  return evaluateFormAccess(access, characterFormAccessContext(aggregate));
}

/** Only native Normal snapshot facts, never current library data or Form overrides. */
export function creatureFormAccessContext(normal: CreatureDraft): FormAccessContext {
  const statistics = resolveEffectiveCreatureStatistics(normal);
  const attributes: Partial<Record<CharacterAttributeKey, number | null>> = {};
  for (const key of CHARACTER_ATTRIBUTE_KEYS) attributes[key] = statistics.attributes.find(row => row.attributeKey === CHARACTER_ATTRIBUTE_LABELS[key])?.effectiveValue ?? null;
  return { owner: "creature", attributes, possessedSkillIds: new Set(normal.skillLinks.map(row => row.skillId)), creatureAbilityCanonicalIds: new Set(normal.abilities.map(row => row.canonicalId)) };
}

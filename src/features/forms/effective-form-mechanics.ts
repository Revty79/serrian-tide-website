import { CHARACTER_ATTRIBUTE_KEYS, type CharacterDraft, type CharacterRaceAggregate, type CharacterSkillReference } from '@/features/characters/models';
import type { RaceFormMechanics } from '@/features/races/race-form-mechanics';
import type { InteractionRuleProfile } from '@/features/interaction-rules/interaction-rules';

/** Source-local rule keys survive in provenance; the combined runtime profile has
 * distinct keys and one order, even when Normal and Form both use the same key. */
export function resolveFormInteractionRules(normal: InteractionRuleProfile | null | undefined, form: InteractionRuleProfile | null | undefined, mode: string) {
  if (mode === 'race' || mode === 'creature') return structuredClone(normal ?? null);
  if (mode === 'replace' || !normal?.rules.length) return structuredClone(form ?? null);
  if (!form?.rules.length) return structuredClone(normal ?? null);
  const sources = [{ source: 'normal', profile: normal }, { source: 'form', profile: form }];
  return { schemaVersion: 1 as const, rules: sources.flatMap(({ source, profile }) => (profile?.rules ?? []).map(rule => ({
    ...structuredClone(rule), key: `${source}:${rule.key}`, provenance: { source, key: rule.key, sortOrder: rule.sortOrder },
  }))).map((rule, sortOrder) => ({ ...rule, sortOrder })) };
}

export function resolveRaceFormAttribute(normal: number, key: keyof CharacterDraft['attributes'], mechanics: RaceFormMechanics) {
  return normal + mechanics.attributeAdjustments[key];
}

/** Shared mechanical projection. It never modifies saved Character facts, applies
 * creation caps, or applies active Modifiers (those retain their runtime owner). */
export function resolveRaceFormMechanics(normal: CharacterRaceAggregate, attributes: CharacterDraft['attributes'], mechanics: RaceFormMechanics) {
  const effectiveAttributes = { ...attributes };
  for (const key of CHARACTER_ATTRIBUTE_KEYS) effectiveAttributes[key] = resolveRaceFormAttribute(attributes[key], key, mechanics);
  const additions = mechanics.skillsMode === 'add' ? mechanics.skillLinks : [];
  const anatomy = mechanics.anatomyMode === 'override' ? mechanics.anatomy : normal.race.anatomy;
  const movement = mechanics.movementMode === 'override' ? mechanics.movement : normal.movementModes;
  const protections = mechanics.protectionMode === 'override' ? mechanics.protections : normal.formPreview?.naturalProtections ?? [];
  const attacks = mechanics.attacksMode === 'override' ? mechanics.attacks : normal.formPreview?.naturalAttacks ?? [];
  const interactionRules = resolveFormInteractionRules(normal.formPreview?.interactionRules, mechanics.interactionRules, mechanics.interactionMode);
  return structuredClone({ attributes: effectiveAttributes, anatomy, movement, protections, attacks, interactionRules, additions,
    race: { ...normal, race: { ...normal.race, size: mechanics.size ?? normal.race.size, anatomy },
      movementModes: movement, skillLinks: [...normal.skillLinks, ...additions] },
  });
}

/** A temporary Tier 1 predisposition can stand alone. These are calculation
 * inputs, never saved allocations. Stable negative keys cannot collide with rows. */
export function resolveFormSkillInputs(allocations: CharacterDraft['skillAllocations'], additions: RaceFormMechanics['skillLinks'], catalog: readonly CharacterSkillReference[]) {
  const result = allocations.map(row => ({ ...row }));
  for (const addition of additions) {
    const skill = catalog.find(row => row.id === addition.skillId);
    if (addition.linkType === 'Skill' && skill?.tier === 1 && !result.some(row => row.skillId === skill.id)) {
      result.push({ draftId: -skill.id, skillId: skill.id, parentDraftId: null, points: 0 });
    }
  }
  return result;
}

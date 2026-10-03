import { adaptSpellToMechanicalEffects, spellEffectSourceMetadata } from '@/features/spell-construction/mechanical-effects-adapter';
import { analyzeSpellTargetGroups } from '@/features/spell-construction/spell-target-groups';
import { hasProgressiveSpellModifier, resolveProgressiveSpellForLevel } from '@/features/spell-construction/engine/progressiveSpell';
import type { SpellDocument } from '@/features/spell-construction/models/spell';
import type { FrozenActionAuthoredEffect } from './action-effect-bridge';
import { resolveSpellCombatRange } from '@/features/spell-construction/combat-range';

/** Owner supplies targets and hit/activation authority. This never spends a resource. */
export function attachedMagicEffects(input: {
  document: SpellDocument | null | undefined;
  namespace: string;
  actorId: number;
  targets: readonly number[];
  owner: 'attack' | 'ability';
  aoe?: boolean;
  ownerDistanceFeet?: number;
}): FrozenActionAuthoredEffect[] {
  if (!input.document) return [];
  const manual = (key: string, description: string): FrozenActionAuthoredEffect => ({ key: `${input.namespace}:magic:${key}`,
    effect: { kind: 'manual', title: 'Attached Magic — Manual G.O.D. Resolution', description },
    instruction: { construction: true, attachedMagicHit: input.owner === 'attack' },
    applicationSupported: false, requiresGodReview: true, targetParticipantIds: [...input.targets] });
  const progressive = hasProgressiveSpellModifier(input.document);
  if (progressive && !input.document.practitionerLevel) return [manual('tier', 'Progressive attached Magic needs an explicitly authored practitioner level. The owner supplies no implicit Spell tier.')];
  const spell = progressive ? resolveProgressiveSpellForLevel(input.document, input.document.practitionerLevel!).resolvedSpell : input.document;
  const adapted = adaptSpellToMechanicalEffects(spell);
  if (!adapted.valid) return [manual('invalid', adapted.issues.map(issue => issue.message).join(' '))];
  if (!adapted.effects.length) return [manual('empty', 'The attached construction has no authored effects. No constructed consequence was invented.')];
  const analysis = analyzeSpellTargetGroups(spell, adapted.effects);
  return adapted.effects.map(entry => {
    const group = analysis.groups.find(group => group.id === analysis.groupByEffectId.get(entry.spellEffectId));
    const incompatible = !group ? 'The construction has no Target/AoE ancestor.'
      : group.selfTargeted && input.targets.some(id => id !== input.actorId) ? 'Self construction conflicts with the owner’s locked target set.'
      : group.kind === 'aoe' && !input.aoe ? 'AoE construction needs explicit affected-participant confirmation from its owner.'
      : group.capacity !== null && input.targets.length > group.capacity ? 'The owner’s locked targets exceed this construction’s capacity.' : null;
    if (incompatible) return manual(entry.spellEffectId, incompatible);
    let range;
    try { range = resolveSpellCombatRange(group!, input.ownerDistanceFeet === undefined ? undefined : { distanceFeet: input.ownerDistanceFeet }, true); }
    catch (error) { return manual(entry.spellEffectId, error instanceof Error ? error.message : 'Construction range conflicts with the owner range.'); }
    const effect = structuredClone(entry.definition.effect);
    return { key: `${input.namespace}:magic:${entry.spellEffectId}`, effect, scaling: entry.scaling,
      instruction: { ...spellEffectSourceMetadata(entry), attachedMagicHit: input.owner === 'attack',
        activeProgressiveTier: progressive ? spell.practitionerLevel : null, targetGroup: group, spellRange: { ruleId: group?.rangeRuleId ?? null, ...range } },
      applicationSupported: effect.kind !== 'manual', requiresGodReview: effect.kind === 'manual' || range.requiresRuling, targetParticipantIds: [...input.targets] };
  });
}

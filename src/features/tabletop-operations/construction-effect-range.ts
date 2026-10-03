import type { FrozenActionAuthoredEffect } from './action-effect-bridge';
import type { SpellTargetGroup } from '@/features/spell-construction/spell-target-groups';
import { resolveSpellCombatRange, type SpellRangeSelections } from '@/features/spell-construction/combat-range';

export function freezeConstructionEffectRanges(effects: readonly FrozenActionAuthoredEffect[], groups: readonly SpellTargetGroup[], ranges: SpellRangeSelections, godAuthority: boolean): FrozenActionAuthoredEffect[] {
  return effects.map(effect => {
    const group = groups.find(group => group.id === effect.instruction.targetGroupId);
    if (!group) return effect;
    const target = group.kind === 'aoe' ? 'area' : effect.targetParticipantIds[0];
    const range = resolveSpellCombatRange(group, ranges[`${group.id}:${target}`], godAuthority);
    return { ...effect, requiresGodReview: effect.requiresGodReview || range.requiresRuling,
      instruction: { ...effect.instruction, spellRange: { ruleId: group.rangeRuleId ?? null, ...range } } };
  });
}

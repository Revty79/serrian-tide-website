import { createContainer, createEmptySpell } from '@/features/spell-construction/utilities/spellFactory';
import type { SpellDocument } from '@/features/spell-construction/models/spell';

export function magicCompletionDocument(all = true): SpellDocument {
  return { ...createEmptySpell(), frameworkSkillId: 1, sphere: 'Fire', name: 'Explicit Combat Magic', containers: [{ ...createContainer('target'), id: 'magic-target',
    effects: [{ id: 'magic-damage', ruleId: 'damage', quantity: 2, damageType: 'Fire' }, ...(all ? [
      { id: 'magic-heal', ruleId: 'healing', quantity: 1, healingScope: 'full-body' as const },
      { id: 'magic-condition', ruleId: 'buff', quantity: 1, runtimeApplication: { harmful: false, durationSource: 'construction' as const,
        effect: { kind: 'condition.apply' as const, name: 'Constructed Mark', description: 'Recorded condition only', duration: { kind: 'combat-steps' as const, value: 1 } } } },
      { id: 'magic-modifier', ruleId: 'buff', quantity: 1, runtimeApplication: { harmful: false, durationSource: 'construction' as const,
        effect: { kind: 'modifier.apply' as const, label: 'Constructed Strength', channel: 'attribute' as const, targetKey: 'STR', amount: 1, duration: { kind: 'combat-steps' as const, value: 1 } } } },
    ] : [])], durations: [{ id: 'magic-duration', ruleId: 'combat-step', quantity: 0 }] }] };
}

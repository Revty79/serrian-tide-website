import { calculateSpell, type SpellCalculation } from '../engine/calculateSpell';
import { createEmptyProgressiveSpellData } from '../data/progressiveRules';
import {
  SPELL_SCHEMA_VERSION,
  type ProgressiveChange,
  type ProgressiveSpellData,
  type ModifierSelection,
  type SpellContainer,
  type SpellDocument,
} from '../models/spell';
import { serrianTideRules } from '../data/spellRules';
import { createStableId } from './ids';

export function createContainer(containerRuleId = 'target'): SpellContainer {
  return {
    id: createStableId('container'),
    containerRuleId,
    effects: [],
    modifiers: [],
    durations: [],
    children: [],
  };
}

export function createModifierSelection(ruleId: string): ModifierSelection {
  return { id: createStableId('modifier'), ruleId, quantity: 1, description: '' };
}

function cloneId(id: string, prefix: string, idMap: Map<string, string>): string {
  const existing = idMap.get(id);
  if (existing) return existing;
  const next = createStableId(prefix);
  idMap.set(id, next);
  return next;
}

export function cloneModifierWithNewId(
  modifier: ModifierSelection,
  idMap: Map<string, string> = new Map(),
): ModifierSelection {
  return { ...modifier, id: cloneId(modifier.id, 'modifier', idMap) };
}

export function cloneContainerWithNewIds(
  container: SpellContainer,
  idMap: Map<string, string> = new Map(),
): SpellContainer {
  return {
    ...container,
    id: cloneId(container.id, 'container', idMap),
    effects: container.effects.map((effect) => ({ ...effect, id: cloneId(effect.id, 'effect', idMap) })),
    modifiers: container.modifiers.map((modifier) => cloneModifierWithNewId(modifier, idMap)),
    shape: container.shape ? { ...container.shape, id: cloneId(container.shape.id, 'addon', idMap) } : undefined,
    durations: container.durations.map((duration) => ({ ...duration, id: cloneId(duration.id, 'addon', idMap) })),
    multiTarget: container.multiTarget ? { ...container.multiTarget } : undefined,
    children: container.children.map((child) => cloneContainerWithNewIds(child, idMap)),
  };
}

export function cloneProgressiveDataWithNewIds(
  progressive: ProgressiveSpellData,
  idMap: Map<string, string>,
): ProgressiveSpellData {
  return {
    ...progressive,
    milestones: progressive.milestones.map((tier) => ({
      ...tier,
      changes: tier.changes.map((change) => cloneProgressiveChange(change, idMap)),
    })),
  };
}

function cloneProgressiveChange(
  change: ProgressiveChange,
  idMap: Map<string, string>,
): ProgressiveChange {
  switch (change.kind) {
    case 'add-container': return {
      ...change,
      parentContainerId: change.parentContainerId
        ? cloneId(change.parentContainerId, 'container', idMap)
        : undefined,
      container: cloneContainerWithNewIds(change.container, idMap),
    };
    case 'remove-container': return { ...change, containerId: cloneId(change.containerId, 'container', idMap) };
    case 'set-container-rule': return { ...change, containerId: cloneId(change.containerId, 'container', idMap) };
    case 'add-effect':
    case 'set-effect': return {
      ...change,
      containerId: cloneId(change.containerId, 'container', idMap),
      effect: { ...change.effect, id: cloneId(change.effect.id, 'effect', idMap) },
    };
    case 'remove-effect': return {
      ...change,
      containerId: cloneId(change.containerId, 'container', idMap),
      effectId: cloneId(change.effectId, 'effect', idMap),
    };
    case 'set-range': return { ...change, containerId: cloneId(change.containerId, 'container', idMap) };
    case 'set-shape': return {
      ...change,
      containerId: cloneId(change.containerId, 'container', idMap),
      shape: change.shape ? { ...change.shape, id: cloneId(change.shape.id, 'addon', idMap) } : undefined,
    };
    case 'add-duration':
    case 'set-duration': return {
      ...change,
      containerId: cloneId(change.containerId, 'container', idMap),
      duration: { ...change.duration, id: cloneId(change.duration.id, 'addon', idMap) },
    };
    case 'remove-duration': return {
      ...change,
      containerId: cloneId(change.containerId, 'container', idMap),
      durationId: cloneId(change.durationId, 'addon', idMap),
    };
    case 'set-multi-target': return {
      ...change,
      containerId: cloneId(change.containerId, 'container', idMap),
      multiTarget: change.multiTarget ? { ...change.multiTarget } : undefined,
    };
    case 'add-modifier':
    case 'set-modifier': return { ...change, modifier: cloneModifierWithNewId(change.modifier, idMap) };
    case 'remove-modifier': return { ...change, modifierId: cloneId(change.modifierId, 'modifier', idMap) };
  }
}

export function createEmptySpell(): SpellDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: SPELL_SCHEMA_VERSION,
    id: createStableId('spell'),
    name: '',
    tradition: 'Spellcraft/Talismanism/Faith',
    castingSystem: undefined,
    frameworkSkillId: undefined,
    sphere: '',
    discipline: '',
    resonance: '',
    containers: [createContainer()],
    modifiers: [],
    description: '',
    notes: '',
    flavorLine: '',
    progressive: createEmptyProgressiveSpellData(),
    createdAt: now,
    modifiedAt: now,
  };
}

export function withCalculationSnapshot(
  spell: SpellDocument,
  calculation: SpellCalculation = calculateSpell(spell),
): SpellDocument {
  const progressiveEnabled = spell.modifiers.some(
    (modifier) => modifier.ruleId === 'progressive-spell' && modifier.quantity > 0,
  );
  return {
    ...spell,
    progressive: { ...spell.progressive, enabled: progressiveEnabled },
    calculation: {
      totalMana: calculation.totalMana,
      castingTime: calculation.castingTime,
      spellMastery: calculation.spellMastery,
      calculatedAt: new Date().toISOString(),
      ruleProfileId: serrianTideRules.id,
      ruleProfileVersion: serrianTideRules.version,
    },
    modifiedAt: new Date().toISOString(),
  };
}

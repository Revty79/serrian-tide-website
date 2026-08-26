import { PROGRESSIVE_LEVELS, progressiveLevelIndex } from '../data/progressiveRules';
import { serrianTideRules } from '../data/spellRules';
import type { PractitionerLevel } from '../models/rules';
import type {
  EffectSelection,
  ModifierSelection,
  ProgressiveChange,
  ProgressiveMilestone,
  ProgressiveSpellStructure,
  ScaledAddOnSelection,
  SpellContainer,
  SpellDocument,
} from '../models/spell';
import { findContainer, removeContainer, updateContainer } from '../utilities/spellTree';
import { calculateSpell, type SpellCalculation } from './calculateSpell';
import { validateSpell, type ValidationIssue, type ValidationResult } from './validateSpell';

const PROGRESSIVE_MODIFIER_ID = 'progressive-spell';

export interface ProgressiveTierResolution {
  level: PractitionerLevel;
  tier: ProgressiveMilestone;
  resolvedSpell: SpellDocument;
  inheritedStructure: ProgressiveSpellStructure;
  resolvedStructure: ProgressiveSpellStructure;
  originalCalculation: SpellCalculation;
  castingCalculation: SpellCalculation;
  resolvedConstructionCalculation: SpellCalculation;
  validation: ValidationResult;
  progressionIssues: ValidationIssue[];
}

export function hasProgressiveSpellModifier(spell: Pick<SpellDocument, 'modifiers'>): boolean {
  return spell.modifiers.some(
    (modifier) => modifier.ruleId === PROGRESSIVE_MODIFIER_ID && modifier.quantity > 0,
  );
}

export function hasProgressiveTierData(spell: Pick<SpellDocument, 'progressive'>): boolean {
  return spell.progressive.milestones.some((tier) =>
    tier.changes.length > 0 ||
    tier.condition.trim().length > 0 ||
    tier.description.trim().length > 0 ||
    tier.notes.trim().length > 0 ||
    tier.flavorLine.trim().length > 0 ||
    (tier.tierName.trim().length > 0 && tier.tierName !== `${tier.level} Version`),
  );
}

export function progressiveStructureFromSpell(
  spell: Pick<SpellDocument, 'containers' | 'modifiers'>,
): ProgressiveSpellStructure {
  return {
    containers: spell.containers.map(cloneContainer),
    modifiers: spell.modifiers
      .filter((modifier) => modifier.ruleId !== PROGRESSIVE_MODIFIER_ID)
      .map(cloneModifier),
  };
}

export function cloneProgressiveStructure(
  structure: ProgressiveSpellStructure,
): ProgressiveSpellStructure {
  return {
    containers: structure.containers.map(cloneContainer),
    modifiers: structure.modifiers.map(cloneModifier),
  };
}

export function resolveProgressiveSpellForLevel(
  spell: SpellDocument,
  level: PractitionerLevel,
): ProgressiveTierResolution {
  const originalCalculation = calculateSpell(spell);
  let structure = progressiveStructureFromSpell(spell);
  let inheritedStructure = cloneProgressiveStructure(structure);
  const progressionIssues: ValidationIssue[] = [];
  const targetIndex = hasProgressiveSpellModifier(spell) ? progressiveLevelIndex(level) : -1;

  for (let index = 0; index <= targetIndex; index += 1) {
    const currentLevel = PROGRESSIVE_LEVELS[index]!;
    const tier = getTier(spell, currentLevel);
    if (index === targetIndex) inheritedStructure = cloneProgressiveStructure(structure);
    const result = applyProgressiveChanges(structure, tier.changes, currentLevel);
    structure = result.structure;
    progressionIssues.push(...result.issues);
  }

  const progressiveModifier = spell.modifiers
    .filter((modifier) => modifier.ruleId === PROGRESSIVE_MODIFIER_ID)
    .map(cloneModifier);
  const resolvedSpell: SpellDocument = {
    ...spell,
    practitionerLevel: level,
    containers: structure.containers.map(cloneContainer),
    modifiers: [...progressiveModifier, ...structure.modifiers.map(cloneModifier)],
  };
  const resolvedConstructionCalculation = calculateSpell(resolvedSpell);
  const castingCalculation: SpellCalculation = { ...originalCalculation };
  const normalValidation = validateSpell(
    resolvedSpell,
    undefined,
    resolvedConstructionCalculation,
  );
  const issues = [...normalValidation.issues, ...progressionIssues];

  return {
    level,
    tier: getTier(spell, level),
    resolvedSpell,
    inheritedStructure,
    resolvedStructure: cloneProgressiveStructure(structure),
    originalCalculation,
    castingCalculation,
    resolvedConstructionCalculation,
    validation: {
      status: issues.some((issue) => issue.severity === 'ERROR')
        ? 'ERROR'
        : issues.some((issue) => issue.severity === 'WARNING')
          ? 'WARNING'
          : 'VALID',
      issues,
    },
    progressionIssues,
  };
}

export function diffProgressiveStructures(
  inherited: ProgressiveSpellStructure,
  edited: ProgressiveSpellStructure,
): ProgressiveChange[] {
  const changes: ProgressiveChange[] = [];
  diffContainerLists(inherited.containers, edited.containers, undefined, changes);
  diffModifiers(inherited.modifiers, edited.modifiers, changes);
  return changes;
}

export function describeProgressiveChange(change: ProgressiveChange): string {
  const containerName = (ruleId: string) =>
    serrianTideRules.containers.find((rule) => rule.id === ruleId)?.name ?? ruleId;
  const effectName = (ruleId: string) =>
    serrianTideRules.effects.find((rule) => rule.id === ruleId)?.name ?? ruleId;
  const modifierName = (ruleId: string) =>
    serrianTideRules.modifiers.find((rule) => rule.id === ruleId)?.name ?? ruleId;
  const rangeName = (ruleId?: string) =>
    ruleId ? serrianTideRules.ranges.find((rule) => rule.id === ruleId)?.name ?? ruleId : 'no Range';
  const shapeName = (ruleId?: string) =>
    ruleId ? serrianTideRules.shapes.find((rule) => rule.id === ruleId)?.name ?? ruleId : 'no Shape';
  const durationName = (ruleId: string) =>
    serrianTideRules.durations.find((rule) => rule.id === ruleId)?.name ?? ruleId;

  switch (change.kind) {
    case 'add-container': return `Add ${containerName(change.container.containerRuleId)} container`;
    case 'remove-container': return 'Remove inherited container';
    case 'set-container-rule': return `Change container to ${containerName(change.containerRuleId)}`;
    case 'add-effect': return `Add ${effectName(change.effect.ruleId)}`;
    case 'remove-effect': return 'Remove inherited effect';
    case 'set-effect': return `Change ${effectName(change.effect.ruleId)} (quantity or description)`;
    case 'set-range': return `Set Range to ${rangeName(change.rangeRuleId)}`;
    case 'set-shape': return `Set Shape to ${shapeName(change.shape?.ruleId)}`;
    case 'add-duration': return `Add ${durationName(change.duration.ruleId)} Duration`;
    case 'remove-duration': return 'Remove inherited Duration';
    case 'set-duration': return `Change ${durationName(change.duration.ruleId)} Duration`;
    case 'set-multi-target': return change.multiTarget
      ? `Set Multi-Target to ${change.multiTarget.additionalTargets} additional target${change.multiTarget.additionalTargets === 1 ? '' : 's'}`
      : 'Remove inherited Multi-Target';
    case 'add-modifier': return `Add ${modifierName(change.modifier.ruleId)} modifier`;
    case 'remove-modifier': return 'Remove inherited modifier';
    case 'set-modifier': return `Change ${modifierName(change.modifier.ruleId)} modifier`;
  }
}

export function listProgressiveStructureComponents(
  structure: ProgressiveSpellStructure,
): string[] {
  const lines: string[] = [];
  const visit = (container: SpellContainer, depth: number) => {
    const prefix = depth > 0 ? `${'  '.repeat(depth)}↳ ` : '';
    const containerRule = serrianTideRules.containers.find((rule) => rule.id === container.containerRuleId);
    lines.push(`${prefix}${containerRule?.name ?? container.containerRuleId} container`);
    container.effects.forEach((effect) => {
      const rule = serrianTideRules.effects.find((candidate) => candidate.id === effect.ruleId);
      lines.push(`${prefix}  ${rule?.name ?? effect.ruleId}${effect.quantity > 1 ? ` ×${effect.quantity}` : ''}`);
    });
    if (container.rangeRuleId) {
      const rule = serrianTideRules.ranges.find((candidate) => candidate.id === container.rangeRuleId);
      lines.push(`${prefix}  Range: ${rule?.name ?? container.rangeRuleId}`);
    }
    if (container.shape) {
      const rule = serrianTideRules.shapes.find((candidate) => candidate.id === container.shape?.ruleId);
      lines.push(`${prefix}  Shape: ${rule?.name ?? container.shape.ruleId}${container.shape.quantity > 0 ? ` +${container.shape.quantity}` : ''}`);
    }
    container.durations.forEach((duration) => {
      const rule = serrianTideRules.durations.find((candidate) => candidate.id === duration.ruleId);
      lines.push(`${prefix}  Duration: ${rule?.name ?? duration.ruleId}${duration.quantity > 1 ? ` ×${duration.quantity}` : ''}`);
    });
    if (container.multiTarget) {
      lines.push(`${prefix}  Multi-Target: +${container.multiTarget.additionalTargets}`);
    }
    container.children.forEach((child) => visit(child, depth + 1));
  };
  structure.containers.forEach((container) => visit(container, 0));
  structure.modifiers.forEach((modifier) => {
    const rule = serrianTideRules.modifiers.find((candidate) => candidate.id === modifier.ruleId);
    lines.push(`Modifier: ${rule?.name ?? modifier.ruleId}${modifier.quantity > 1 ? ` ×${modifier.quantity}` : ''}`);
  });
  return lines;
}

function getTier(spell: SpellDocument, level: PractitionerLevel): ProgressiveMilestone {
  const tier = spell.progressive.milestones.find((candidate) => candidate.level === level);
  if (!tier) {
    return {
      level,
      tierName: `${level} Version`,
      condition: '',
      description: '',
      notes: '',
      flavorLine: '',
      changes: [],
    };
  }
  return tier;
}

function applyProgressiveChanges(
  source: ProgressiveSpellStructure,
  changes: readonly ProgressiveChange[],
  level: PractitionerLevel,
): { structure: ProgressiveSpellStructure; issues: ValidationIssue[] } {
  let structure = cloneProgressiveStructure(source);
  const issues: ValidationIssue[] = [];

  const missing = (index: number, message: string, componentId?: string) => {
    issues.push({
      id: `progressive-orphan:${level}:${index}:${componentId ?? 'component'}`,
      severity: 'WARNING',
      message: `${level} tier contains an inherited change that could not be applied`,
      explanation: message,
      componentId,
      path: [`${level} Progressive Tier`],
    });
  };

  changes.forEach((change, index) => {
    if (change.kind === 'add-container') {
      if (!change.parentContainerId) {
        structure = { ...structure, containers: [...structure.containers, cloneContainer(change.container)] };
      } else if (findContainer(structure.containers, change.parentContainerId)) {
        structure = {
          ...structure,
          containers: updateContainer(structure.containers, change.parentContainerId, (container) => ({
            ...container,
            children: [...container.children, cloneContainer(change.container)],
          })),
        };
      } else {
        missing(index, 'The parent container was removed or replaced in an earlier tier.', change.parentContainerId);
      }
      return;
    }

    if (change.kind === 'remove-container') {
      if (!findContainer(structure.containers, change.containerId)) {
        missing(index, 'The container was already removed in an earlier tier.', change.containerId);
      } else {
        structure = { ...structure, containers: removeContainer(structure.containers, change.containerId) };
      }
      return;
    }

    if (change.kind === 'add-modifier') {
      structure = { ...structure, modifiers: [...structure.modifiers, cloneModifier(change.modifier)] };
      return;
    }
    if (change.kind === 'remove-modifier') {
      if (!structure.modifiers.some((modifier) => modifier.id === change.modifierId)) {
        missing(index, 'The modifier was already removed in an earlier tier.', change.modifierId);
      } else {
        structure = { ...structure, modifiers: structure.modifiers.filter((modifier) => modifier.id !== change.modifierId) };
      }
      return;
    }
    if (change.kind === 'set-modifier') {
      if (!structure.modifiers.some((modifier) => modifier.id === change.modifier.id)) {
        missing(index, 'The modifier to change no longer exists in the inherited tier.', change.modifier.id);
      } else {
        structure = {
          ...structure,
          modifiers: structure.modifiers.map((modifier) =>
            modifier.id === change.modifier.id ? cloneModifier(change.modifier) : modifier,
          ),
        };
      }
      return;
    }

    const containerId = change.containerId;
    const targetContainer = findContainer(structure.containers, containerId);
    if (!targetContainer) {
      missing(index, 'The target container no longer exists in the inherited tier.', containerId);
      return;
    }
    if (
      (change.kind === 'remove-effect' && !targetContainer.effects.some((effect) => effect.id === change.effectId)) ||
      (change.kind === 'set-effect' && !targetContainer.effects.some((effect) => effect.id === change.effect.id))
    ) {
      missing(
        index,
        'The target effect no longer exists in the inherited tier.',
        change.kind === 'remove-effect' ? change.effectId : change.effect.id,
      );
      return;
    }
    if (
      (change.kind === 'remove-duration' && !targetContainer.durations.some((duration) => duration.id === change.durationId)) ||
      (change.kind === 'set-duration' && !targetContainer.durations.some((duration) => duration.id === change.duration.id))
    ) {
      missing(
        index,
        'The target Duration no longer exists in the inherited tier.',
        change.kind === 'remove-duration' ? change.durationId : change.duration.id,
      );
      return;
    }

    structure = {
      ...structure,
      containers: updateContainer(structure.containers, containerId, (container) => {
        switch (change.kind) {
          case 'set-container-rule': return { ...container, containerRuleId: change.containerRuleId };
          case 'add-effect': return { ...container, effects: [...container.effects, cloneEffect(change.effect)] };
          case 'remove-effect': return { ...container, effects: container.effects.filter((effect) => effect.id !== change.effectId) };
          case 'set-effect': return {
            ...container,
            effects: container.effects.map((effect) => effect.id === change.effect.id ? cloneEffect(change.effect) : effect),
          };
          case 'set-range': return {
            ...container,
            rangeRuleId: change.rangeRuleId,
            rangeDescription: change.rangeDescription ?? '',
          };
          case 'set-shape': return { ...container, shape: change.shape ? cloneScaled(change.shape) : undefined };
          case 'add-duration': return { ...container, durations: [...container.durations, cloneScaled(change.duration)] };
          case 'remove-duration': return { ...container, durations: container.durations.filter((duration) => duration.id !== change.durationId) };
          case 'set-duration': return {
            ...container,
            durations: container.durations.map((duration) =>
              duration.id === change.duration.id ? cloneScaled(change.duration) : duration,
            ),
          };
          case 'set-multi-target': return {
            ...container,
            multiTarget: change.multiTarget ? { ...change.multiTarget } : undefined,
          };
          default: return container;
        }
      }),
    };
  });

  return { structure, issues };
}

function diffContainerLists(
  inherited: readonly SpellContainer[],
  edited: readonly SpellContainer[],
  parentContainerId: string | undefined,
  changes: ProgressiveChange[],
) {
  const editedById = new Map(edited.map((container) => [container.id, container]));
  const inheritedById = new Map(inherited.map((container) => [container.id, container]));

  for (const container of inherited) {
    const editedContainer = editedById.get(container.id);
    if (!editedContainer) {
      changes.push({ kind: 'remove-container', containerId: container.id });
      continue;
    }
    diffContainer(container, editedContainer, changes);
  }

  for (const container of edited) {
    if (!inheritedById.has(container.id)) {
      changes.push({ kind: 'add-container', parentContainerId, container: cloneContainer(container) });
    }
  }
}

function diffContainer(
  inherited: SpellContainer,
  edited: SpellContainer,
  changes: ProgressiveChange[],
) {
  if (inherited.containerRuleId !== edited.containerRuleId) {
    changes.push({ kind: 'set-container-rule', containerId: inherited.id, containerRuleId: edited.containerRuleId });
  }
  diffEffects(inherited.id, inherited.effects, edited.effects, changes);

  if (
    inherited.rangeRuleId !== edited.rangeRuleId ||
    (inherited.rangeDescription ?? '') !== (edited.rangeDescription ?? '')
  ) {
    changes.push({
      kind: 'set-range',
      containerId: inherited.id,
      rangeRuleId: edited.rangeRuleId,
      rangeDescription: edited.rangeDescription ?? '',
    });
  }
  if (!sameValue(inherited.shape, edited.shape)) {
    changes.push({ kind: 'set-shape', containerId: inherited.id, shape: edited.shape ? cloneScaled(edited.shape) : undefined });
  }
  diffDurations(inherited.id, inherited.durations, edited.durations, changes);
  if (!sameValue(inherited.multiTarget, edited.multiTarget)) {
    changes.push({
      kind: 'set-multi-target',
      containerId: inherited.id,
      multiTarget: edited.multiTarget ? { ...edited.multiTarget } : undefined,
    });
  }
  diffContainerLists(inherited.children, edited.children, inherited.id, changes);
}

function diffEffects(
  containerId: string,
  inherited: readonly EffectSelection[],
  edited: readonly EffectSelection[],
  changes: ProgressiveChange[],
) {
  const editedById = new Map(edited.map((effect) => [effect.id, effect]));
  const inheritedById = new Map(inherited.map((effect) => [effect.id, effect]));
  inherited.forEach((effect) => {
    const next = editedById.get(effect.id);
    if (!next) changes.push({ kind: 'remove-effect', containerId, effectId: effect.id });
    else if (!sameValue(effect, next)) changes.push({ kind: 'set-effect', containerId, effect: cloneEffect(next) });
  });
  edited.forEach((effect) => {
    if (!inheritedById.has(effect.id)) changes.push({ kind: 'add-effect', containerId, effect: cloneEffect(effect) });
  });
}

function diffDurations(
  containerId: string,
  inherited: readonly ScaledAddOnSelection[],
  edited: readonly ScaledAddOnSelection[],
  changes: ProgressiveChange[],
) {
  const editedById = new Map(edited.map((duration) => [duration.id, duration]));
  const inheritedById = new Map(inherited.map((duration) => [duration.id, duration]));
  inherited.forEach((duration) => {
    const next = editedById.get(duration.id);
    if (!next) changes.push({ kind: 'remove-duration', containerId, durationId: duration.id });
    else if (!sameValue(duration, next)) changes.push({ kind: 'set-duration', containerId, duration: cloneScaled(next) });
  });
  edited.forEach((duration) => {
    if (!inheritedById.has(duration.id)) changes.push({ kind: 'add-duration', containerId, duration: cloneScaled(duration) });
  });
}

function diffModifiers(
  inherited: readonly ModifierSelection[],
  edited: readonly ModifierSelection[],
  changes: ProgressiveChange[],
) {
  const editedById = new Map(edited.map((modifier) => [modifier.id, modifier]));
  const inheritedById = new Map(inherited.map((modifier) => [modifier.id, modifier]));
  inherited.forEach((modifier) => {
    const next = editedById.get(modifier.id);
    if (!next) changes.push({ kind: 'remove-modifier', modifierId: modifier.id });
    else if (!sameValue(modifier, next)) changes.push({ kind: 'set-modifier', modifier: cloneModifier(next) });
  });
  edited.forEach((modifier) => {
    if (!inheritedById.has(modifier.id)) changes.push({ kind: 'add-modifier', modifier: cloneModifier(modifier) });
  });
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneEffect(effect: EffectSelection): EffectSelection {
  return { ...effect };
}

function cloneModifier(modifier: ModifierSelection): ModifierSelection {
  return { ...modifier };
}

function cloneScaled(selection: ScaledAddOnSelection): ScaledAddOnSelection {
  return { ...selection };
}

function cloneContainer(container: SpellContainer): SpellContainer {
  return {
    ...container,
    effects: container.effects.map(cloneEffect),
    modifiers: container.modifiers.map(cloneModifier),
    shape: container.shape ? cloneScaled(container.shape) : undefined,
    durations: container.durations.map(cloneScaled),
    multiTarget: container.multiTarget ? { ...container.multiTarget } : undefined,
    children: container.children.map(cloneContainer),
  };
}

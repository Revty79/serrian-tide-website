import { serrianTideRules } from '../data/spellRules';
import type { CostFormula, ModifierRule, SpellRuleProfile } from '../models/rules';
import type { ModifierSelection, SpellContainer, SpellDocument } from '../models/spell';
import { getCastingTime, getOutOfCombatCastingTime, getSpellMastery } from './mastery';

export type BreakdownCategory = 'container' | 'effect' | 'addon' | 'modifier';

export interface CostBreakdownLine {
  id: string;
  label: string;
  detail?: string;
  componentDescription?: string;
  category: BreakdownCategory;
  cost: number;
  depth: number;
  containerId?: string;
  path: readonly string[];
}

export interface SpellCalculation {
  baseSpellManaCost: number;
  baseSpellMastery: ReturnType<typeof getSpellMastery>;
  baseCombatCastingTime: number;
  baseOutOfCombatCastingTimeSeconds: number;
  combatCastingTime: number;
  outOfCombatCastingTimeSeconds: number;
  totalMana: number;
  castingTime: number;
  baseCastingTime: number;
  castingTimeAdjustment: number;
  spellMastery: ReturnType<typeof getSpellMastery>;
  totals: {
    containers: number;
    effects: number;
    addons: number;
    modifiers: number;
  };
  breakdown: CostBreakdownLine[];
}

export function calculateRuleCost(formula: CostFormula, quantity = 1): number {
  if (formula.kind === 'flat') return formula.cost;
  if (formula.kind === 'behavior') {
    throw new Error(`Unsupported cost behavior: ${formula.behaviorKey}`);
  }

  const safeQuantity = Math.max(formula.baseQuantity, Number.isFinite(quantity) ? quantity : formula.baseQuantity);
  const additionalQuantity = Math.max(0, safeQuantity - formula.baseQuantity);
  const increments = Math.ceil(additionalQuantity / Math.max(1, formula.quantityIncrement));
  return formula.baseCost + increments * formula.additionalIncrementCost;
}

export function calculateModifierCost(rule: ModifierRule, quantity: number): number {
  const safeQuantity = Math.max(0, quantity);
  const unitCost = calculateRuleCost(rule.cost);
  if (rule.quantityMode === 'multiply') return unitCost * safeQuantity;
  if (rule.quantityMode === 'formula') return calculateRuleCost(rule.cost, safeQuantity);
  return safeQuantity > 0 ? unitCost : 0;
}

function modifierLines(
  selections: readonly ModifierSelection[],
  depth: number,
  path: readonly string[],
  profile: SpellRuleProfile,
  scopeLabel: string,
  containerId?: string,
): CostBreakdownLine[] {
  const byId = new Map(profile.modifiers.map((rule) => [rule.id, rule]));
  return selections.flatMap((selection) => {
    const rule = byId.get(selection.ruleId);
    if (!rule) return [];
    const quantity = Math.max(0, selection.quantity);
    const cost = calculateModifierCost(rule, quantity);
    return [
      {
        id: selection.id,
        label: rule.name,
        detail: rule.initiativePerQuantity !== undefined
          ? `${scopeLabel} · ${quantity} concentration point${quantity === 1 ? '' : 's'} · +${quantity * rule.initiativePerQuantity} Initiative`
          : `${scopeLabel}${quantity > 1 ? ` · ×${quantity}` : ''}`,
        componentDescription: selection.description,
        category: 'modifier' as const,
        cost,
        depth,
        containerId,
        path,
      },
    ];
  });
}

function calculateContainer(
  container: SpellContainer,
  depth: number,
  ancestorPath: readonly string[],
  profile: SpellRuleProfile,
): CostBreakdownLine[] {
  const containersById = new Map(profile.containers.map((rule) => [rule.id, rule]));
  const effectsById = new Map(profile.effects.map((rule) => [rule.id, rule]));
  const rangesById = new Map(profile.ranges.map((rule) => [rule.id, rule]));
  const shapesById = new Map(profile.shapes.map((rule) => [rule.id, rule]));
  const durationsById = new Map(profile.durations.map((rule) => [rule.id, rule]));
  const containerRule = containersById.get(container.containerRuleId);
  const containerName = containerRule?.name ?? 'Unknown container';
  const path = [...ancestorPath, containerName];
  const lines: CostBreakdownLine[] = [];

  if (containerRule) {
    lines.push({
      id: container.id,
      label: `${containerName} container`,
      category: 'container',
      cost: calculateRuleCost(containerRule.cost),
      depth,
      containerId: container.id,
      path,
    });
  }

  for (const selection of container.effects) {
    const rule = effectsById.get(selection.ruleId);
    if (!rule) continue;
    const scalable = rule.cost.kind === 'scalable';
    lines.push({
      id: selection.id,
      label: rule.name,
      detail: scalable ? `${rule.quantityLabel ?? 'Quantity'}: ${selection.quantity}` : undefined,
      componentDescription: selection.description,
      category: 'effect',
      cost: calculateRuleCost(rule.cost, selection.quantity),
      depth: depth + 1,
      containerId: container.id,
      path,
    });
  }

  if (container.rangeRuleId) {
    const rule = rangesById.get(container.rangeRuleId);
    if (rule) {
      lines.push({
        id: `${container.id}:range`,
        label: rule.name,
        detail: 'Range',
        componentDescription: container.rangeDescription,
        category: 'addon',
        cost: calculateRuleCost(rule.cost),
        depth: depth + 1,
        containerId: container.id,
        path,
      });
    }
  }

  if (container.shape) {
    const rule = shapesById.get(container.shape.ruleId);
    if (rule) {
      lines.push({
        id: `${container.id}:shape`,
        label: rule.name,
        detail:
          container.shape.quantity > 0
            ? `${rule.incrementLabel ?? 'Increment'} ×${container.shape.quantity}`
            : 'Base shape',
        componentDescription: container.shape.description,
        category: 'addon',
        cost: calculateRuleCost(rule.cost, container.shape.quantity),
        depth: depth + 1,
        containerId: container.id,
        path,
      });
    }
  }

  for (const duration of container.durations) {
    const rule = durationsById.get(duration.ruleId);
    if (rule) {
      lines.push({
        id: duration.id,
        label: rule.name,
        detail: rule.quantitySemantics === 'total-quantity'
          ? `${rule.incrementLabel ?? 'Quantity'}: ${duration.quantity}`
          : 'Duration',
        componentDescription: duration.description,
        category: 'addon',
        cost: calculateRuleCost(rule.cost, duration.quantity),
        depth: depth + 1,
        containerId: container.id,
        path,
      });
    }
  }

  if (container.multiTarget && container.multiTarget.additionalTargets > 0) {
    lines.push({
      id: `${container.id}:multi-target`,
      label: profile.multiTarget.name,
      detail: `Additional targets: ${container.multiTarget.additionalTargets}`,
      componentDescription: container.multiTarget.description,
      category: 'addon',
      cost: calculateRuleCost(profile.multiTarget.cost, container.multiTarget.additionalTargets),
      depth: depth + 1,
      containerId: container.id,
      path,
    });
  }

  lines.push(...modifierLines(container.modifiers, depth + 1, path, profile, 'Container modifier', container.id));

  for (const child of container.children) {
    lines.push(...calculateContainer(child, depth + 1, path, profile));
  }

  return lines;
}

export function calculateSpell(
  spell: SpellDocument,
  profile: SpellRuleProfile = serrianTideRules,
): SpellCalculation {
  const breakdown = [
    ...spell.containers.flatMap((container) => calculateContainer(container, 0, [], profile)),
    ...modifierLines(spell.modifiers, 0, ['Spell'], profile, 'Global modifier'),
  ];

  const totals = breakdown.reduce(
    (sum, line) => {
      if (line.category === 'container') sum.containers += line.cost;
      if (line.category === 'effect') sum.effects += line.cost;
      if (line.category === 'addon') sum.addons += line.cost;
      if (line.category === 'modifier') sum.modifiers += line.cost;
      return sum;
    },
    { containers: 0, effects: 0, addons: 0, modifiers: 0 },
  );
  const totalMana = totals.containers + totals.effects + totals.addons + totals.modifiers;
  const baseSpellMastery = getSpellMastery(totalMana, profile.masteryBands);
  const baseCastingTime = getCastingTime(totalMana);
  const baseOutOfCombatCastingTimeSeconds = getOutOfCombatCastingTime(totalMana);
  const castingTimeAdjustment = modifierInitiativeAdjustment(spell, profile);
  const combatCastingTime = baseCastingTime + castingTimeAdjustment;

  return {
    baseSpellManaCost: totalMana,
    baseSpellMastery,
    baseCombatCastingTime: baseCastingTime,
    baseOutOfCombatCastingTimeSeconds,
    combatCastingTime,
    outOfCombatCastingTimeSeconds: baseOutOfCombatCastingTimeSeconds,
    totalMana,
    castingTime: combatCastingTime,
    baseCastingTime,
    castingTimeAdjustment,
    spellMastery: baseSpellMastery,
    totals,
    breakdown,
  };
}

function modifierInitiativeAdjustment(
  spell: SpellDocument,
  profile: SpellRuleProfile,
): number {
  const rules = new Map(profile.modifiers.map((rule) => [rule.id, rule]));
  const containerSelections = (containers: readonly SpellContainer[]): ModifierSelection[] =>
    containers.flatMap((container) => [
      ...container.modifiers,
      ...containerSelections(container.children),
    ]);

  return [...spell.modifiers, ...containerSelections(spell.containers)].reduce((total, selection) => {
    const initiativePerQuantity = rules.get(selection.ruleId)?.initiativePerQuantity;
    if (initiativePerQuantity === undefined) return total;
    const initiative = Number.isFinite(selection.quantity) ? Math.floor(selection.quantity) : 0;
    return total + Math.max(0, initiative) * initiativePerQuantity;
  }, 0);
}

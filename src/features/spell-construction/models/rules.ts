export const PRACTITIONER_LEVELS = [
  'Apprentice',
  'Novice',
  'Master',
  'High Master',
  'Grand Master',
] as const;

export type PractitionerLevel = (typeof PRACTITIONER_LEVELS)[number];
export type SpellMastery = PractitionerLevel;
export type RuleCategory =
  | 'container'
  | 'effect'
  | 'range'
  | 'shape'
  | 'duration'
  | 'multi-target'
  | 'modifier';

export type StackingMode = 'single' | 'multiple' | 'scalable' | 'scoped' | 'unspecified';

export interface RelatedComponentRequirement {
  id: string;
  kind: 'required' | 'recommended';
  category: RuleCategory;
  ruleIds?: readonly string[];
  scope: 'same-container' | 'spell';
  guidance: string;
}

export type CostFormula =
  | { kind: 'flat'; cost: number }
  | {
      kind: 'scalable';
      baseCost: number;
      baseQuantity: number;
      quantityIncrement: number;
      additionalIncrementCost: number;
    }
  | {
      kind: 'behavior';
      behaviorKey: string;
      parameters: Readonly<Record<string, number>>;
    };

export interface PlacementRule {
  allowedContainerTypeIds?: readonly string[];
  recommendedContainerTypeIds?: readonly string[];
  guidance: string;
}

export interface RuleDefinition {
  id: string;
  name: string;
  category: RuleCategory;
  definition: string;
  usageGuidance: string;
  componentMastery?: PractitionerLevel;
  minimumPractitionerLevel?: PractitionerLevel;
  relatedRequirements: readonly RelatedComponentRequirement[];
  placement: PlacementRule;
  stacking: StackingMode;
  maximumQuantity?: number;
}

export interface CostedRuleDefinition extends RuleDefinition {
  cost: CostFormula;
}

export interface ContainerRule extends CostedRuleDefinition {
  category: 'container';
}

export interface EffectRule extends CostedRuleDefinition {
  category: 'effect';
  quantityLabel?: string;
}

export interface AddOnRule extends CostedRuleDefinition {
  category: 'range' | 'shape' | 'duration' | 'multi-target';
  quantityLabel?: string;
  incrementLabel?: string;
  quantitySemantics: 'none' | 'additional-increments' | 'total-quantity';
}

export interface ModifierRule extends CostedRuleDefinition {
  category: 'modifier';
  allowedScopes: readonly ('spell' | 'container')[];
  quantityMode: 'multiply' | 'formula' | 'once';
  quantityLabel?: string;
  initiativePerQuantity?: number;
}

export interface MasteryBand {
  name: SpellMastery;
  minimumMana: number;
  maximumMana: number | null;
}

export interface SpellRuleProfile {
  id: string;
  name: string;
  version: number;
  sourceNote: string;
  containers: readonly ContainerRule[];
  effects: readonly EffectRule[];
  ranges: readonly AddOnRule[];
  shapes: readonly AddOnRule[];
  durations: readonly AddOnRule[];
  multiTarget: AddOnRule;
  modifiers: readonly ModifierRule[];
  masteryBands: readonly MasteryBand[];
}


import type { PractitionerLevel, SpellMastery } from './rules';

export const SPELL_SCHEMA_VERSION = 7;

export const TRADITIONS = [
  'Spellcraft/Talismanism/Faith',
  'Psionics',
  'Bardic Resonance',
] as const;

export type Tradition = (typeof TRADITIONS)[number];

export const SPELL_CASTING_SYSTEMS = [
  'Spellcraft',
  'Talismanism',
  'Faith',
  'Psyonics',
  'Bardic Resonance',
] as const;

export type SpellCastingSystem = (typeof SPELL_CASTING_SYSTEMS)[number];

export interface EffectSelection {
  id: string;
  ruleId: string;
  quantity: number;
  description?: string;
  healingScope?: 'full-body' | 'area';
}

export interface ScaledAddOnSelection {
  id: string;
  ruleId: string;
  quantity: number;
  description?: string;
}

export interface MultiTargetSelection {
  ruleId: string;
  additionalTargets: number;
  description?: string;
}

export interface ModifierSelection {
  id: string;
  ruleId: string;
  quantity: number;
  description?: string;
}

export interface SpellContainer {
  id: string;
  containerRuleId: string;
  effects: EffectSelection[];
  rangeRuleId?: string;
  rangeDescription?: string;
  shape?: ScaledAddOnSelection;
  durations: ScaledAddOnSelection[];
  multiTarget?: MultiTargetSelection;
  modifiers: ModifierSelection[];
  children: SpellContainer[];
}

export interface ProgressiveSpellStructure {
  containers: SpellContainer[];
  modifiers: ModifierSelection[];
}

export type ProgressiveChange =
  | { kind: 'add-container'; parentContainerId?: string; container: SpellContainer }
  | { kind: 'remove-container'; containerId: string }
  | { kind: 'set-container-rule'; containerId: string; containerRuleId: string }
  | { kind: 'add-effect'; containerId: string; effect: EffectSelection }
  | { kind: 'remove-effect'; containerId: string; effectId: string }
  | { kind: 'set-effect'; containerId: string; effect: EffectSelection }
  | { kind: 'set-range'; containerId: string; rangeRuleId?: string; rangeDescription?: string }
  | { kind: 'set-shape'; containerId: string; shape?: ScaledAddOnSelection }
  | { kind: 'add-duration'; containerId: string; duration: ScaledAddOnSelection }
  | { kind: 'remove-duration'; containerId: string; durationId: string }
  | { kind: 'set-duration'; containerId: string; duration: ScaledAddOnSelection }
  | { kind: 'set-multi-target'; containerId: string; multiTarget?: MultiTargetSelection }
  | { kind: 'add-modifier'; modifier: ModifierSelection }
  | { kind: 'remove-modifier'; modifierId: string }
  | { kind: 'set-modifier'; modifier: ModifierSelection };

export interface ProgressiveMilestone {
  level: PractitionerLevel;
  tierName: string;
  condition: string;
  description: string;
  notes: string;
  flavorLine: string;
  changes: ProgressiveChange[];
}

export interface ProgressiveSpellData {
  enabled: boolean;
  costMode: 'original-base';
  milestones: ProgressiveMilestone[];
}

export interface CalculationSnapshot {
  totalMana: number;
  castingTime: number;
  spellMastery: SpellMastery;
  calculatedAt: string;
  ruleProfileId: string;
  ruleProfileVersion: number;
}

export interface SpellDocument {
  schemaVersion: number;
  id: string;
  name: string;
  tradition: Tradition;
  castingSystem?: SpellCastingSystem;
  frameworkSkillId?: number;
  sphere: string;
  discipline: string;
  resonance: string;
  practitionerLevel?: PractitionerLevel;
  containers: SpellContainer[];
  modifiers: ModifierSelection[];
  description: string;
  notes: string;
  flavorLine: string;
  progressive: ProgressiveSpellData;
  calculation?: CalculationSnapshot;
  createdAt: string;
  modifiedAt: string;
}

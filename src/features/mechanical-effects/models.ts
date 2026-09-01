import type {
  ActiveHealthAnatomy,
  ActiveHealthState,
  ActiveHealthView,
} from "../active-state/models";

export const MECHANICAL_EFFECT_SCHEMA_VERSION = 2 as const;

export const RUNTIME_DURATION_KINDS = [
  "until-removed",
  "combat-steps",
  "combat-rounds",
  "scene",
] as const;
export type RuntimeDuration = {
  kind: (typeof RUNTIME_DURATION_KINDS)[number];
  value?: number | null;
  label?: string;
};

export const TEMPORARY_MODIFIER_CHANNELS = [
  "attribute",
  "skill",
  "movement",
  "initiative",
  "soak",
  "damage",
] as const;
export type TemporaryModifierChannel = (typeof TEMPORARY_MODIFIER_CHANNELS)[number];
export const MODIFIER_ATTRIBUTE_KEYS = ["STR", "DEX", "CON", "INT", "WIS", "CHR"] as const;
export type ModifierAttributeKey = (typeof MODIFIER_ATTRIBUTE_KEYS)[number];

export type HealthHealEffect = {
  kind: "health.heal";
  amount: number;
  scope: "full-body" | "area";
};

export type HealthDamageEffect = {
  kind: "health.damage";
  amount: number;
  application: "localized";
};

export type ManualEffect = {
  kind: "manual";
  title: string;
  description: string;
};

export type ConditionApplyEffect = {
  kind: "condition.apply";
  name: string;
  description: string;
  duration: RuntimeDuration;
};

export type ModifierApplyEffect = {
  kind: "modifier.apply";
  label: string;
  channel: TemporaryModifierChannel;
  targetKey: string;
  amount: number;
  duration: RuntimeDuration;
};

export type MechanicalEffect =
  | HealthHealEffect
  | HealthDamageEffect
  | ConditionApplyEffect
  | ModifierApplyEffect
  | ManualEffect;

export type MechanicalEffectSource =
  | { kind: "item"; id: number; name: string }
  | { kind: "spell"; id: string; name: string }
  | { kind: "creature-ability"; id: string; name: string }
  | { kind: "god"; id: string; name: string }
  | { kind: "system"; id: string; name: string };

export type MechanicalEffectDefinition = {
  schemaVersion: typeof MECHANICAL_EFFECT_SCHEMA_VERSION;
  effect: MechanicalEffect;
  source?: MechanicalEffectSource;
};

export type MechanicalEffectApplication = {
  targetCharacterId?: number | null;
  poolKey?: string | null;
  hitLocationNumber?: number | null;
};

export type MechanicalEffectHealthContext = {
  anatomy: ActiveHealthAnatomy;
  state: ActiveHealthState;
};

export type MechanicalEffectSelectionRequirement =
  | "target-character"
  | "hp-pool"
  | "hit-location-or-hp-pool";

export type MechanicalEffectPlanStatus =
  | "ready"
  | "needs-selection"
  | "manual"
  | "invalid";

export type MechanicalEffectValidationIssue = {
  code:
    | "invalid-effect"
    | "unsupported-kind"
    | "invalid-amount"
    | "unsupported-scope"
    | "unsupported-application"
    | "empty-manual-title"
    | "empty-manual-description"
    | "empty-condition-name"
    | "invalid-condition-description"
    | "empty-modifier-label"
    | "unsupported-modifier-channel"
    | "invalid-modifier-target"
    | "invalid-modifier-amount"
    | "invalid-duration"
    | "invalid-target-character"
    | "invalid-pool-key"
    | "invalid-hit-location"
    | "target-state-mismatch"
    | "health-resolution-failed";
  path: string;
  message: string;
};

export type MechanicalEffectValidationResult =
  | { valid: true; effect: MechanicalEffect; issues: [] }
  | { valid: false; effect: null; issues: MechanicalEffectValidationIssue[] };

export type MechanicalEffectDamageChange = {
  before: number;
  after: number;
};

export type MechanicalEffectPoolDamageChange = MechanicalEffectDamageChange & {
  poolKey: string;
  poolName: string;
};

export type MechanicalEffectHealthResult = {
  previousState: ActiveHealthState;
  nextState: ActiveHealthState;
  before: ActiveHealthView;
  after: ActiveHealthView;
  totalDamage: MechanicalEffectDamageChange;
  poolDamage: MechanicalEffectPoolDamageChange[];
};

export type MechanicalEffectPlan = {
  status: MechanicalEffectPlanStatus;
  effect: MechanicalEffect | null;
  source: MechanicalEffectSource | null;
  summary: string;
  requirements: MechanicalEffectSelectionRequirement[];
  missingSelections: MechanicalEffectSelectionRequirement[];
  issues: MechanicalEffectValidationIssue[];
  healthResult: MechanicalEffectHealthResult | null;
};

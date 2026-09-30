import type { MechanicalEffect, ModifierApplyEffect, ModifierAttributeKey, RuntimeDuration } from "@/features/mechanical-effects/models";
import type { InteractionCondition, InteractionRule } from "@/features/interaction-rules/interaction-rules";
import type { DerivedAbilityActivationType, DerivedAbilityCostType, DerivedAbilityRefreshScope } from "@/features/derived-abilities/models";
import type { MechanicsConditions } from "./models";

export const V2_RULE_KINDS = ["resource", "modifier", "interaction", "activated", "override", "choice"] as const;
export type DefinitionAmount = { kind: "fixed"; amount: number } | { kind: "manual"; guidance: string }
  | { kind: "progression-threshold"; threshold: number; contribution: number };
export type ResourceChange = { key: string; when: MechanicsConditions; amount: DefinitionAmount; notes: string };
export type ResourceRecovery = { key: string; scope: DerivedAbilityRefreshScope; event: string; amount: DefinitionAmount | { kind: "full" }; notes: string };
export type DefinitionCost = { key: string; amount: DefinitionAmount; notes: string } & (
  | { kind: Exclude<DerivedAbilityCostType, "resource"> }
  | { kind: "resource"; resource: { kind: "local"; resourceKey: string } | { kind: "manual"; name: string; guidance: string } }
);
export type DefinitionUseLimit = { key: string; maximumUses: number; refreshScope: DerivedAbilityRefreshScope; event: string; notes: string };
export type IntrinsicEffect = { key: string; effect: MechanicalEffect };
export const OUTCOME_KINDS = ["success", "failure", "critical-success", "critical-failure", "manual"] as const;
export type OutcomeBranch = { key: string; kind: typeof OUTCOME_KINDS[number]; description: string; effectKeys: string[]; adjudication: string; limitations: string; notes: string };
export type ChoiceDefinition = { kind: "attribute"; attributeKeys: ModifierAttributeKey[] }
  | { kind: "skill"; skillIds: number[] } | { kind: "derived-ability"; derivedAbilityIds: number[] }
  | { kind: "manual"; guidance: string };
export type AbilityInteractionCondition = Exclude<InteractionCondition, { kind: "item-tag" | "item-property" }>;
export type AbilityInteraction = Pick<InteractionRule, "ruleType" | "scope" | "match" | "percentage"> & { conditions: AbilityInteractionCondition[] };
export const OVERRIDE_SUBSYSTEMS = ["spellcasting", "attack-protection", "movement-timing", "skill-roll", "other"] as const;
export type OverrideIntent = { mode: "manual"; subsystem: typeof OVERRIDE_SUBSYSTEMS[number]; proposedChange: string; conflictGuidance: string };
export type MechanicsV2Fields =
  | { kind: "resource"; unit: string; grantsResource: boolean; maximum: DefinitionAmount; maximumChanges: ResourceChange[]; recovery: ResourceRecovery[] }
  | { kind: "modifier"; effect: ModifierApplyEffect; adjudication: string }
  | { kind: "interaction"; interaction: AbilityInteraction; adjudication: string }
  | { kind: "activated"; activationType: Exclude<DerivedAbilityActivationType, "passive">; trigger: string; costs: DefinitionCost[]; useLimits: DefinitionUseLimit[];
      duration: RuntimeDuration | null; target: { kind: "self" | "other" | "multiple" | "manual"; description: string }; choiceKeys: string[]; effects: IntrinsicEffect[]; outcomes: OutcomeBranch[] }
  | { kind: "override"; override: OverrideIntent; outcomes: OutcomeBranch[] }
  | { kind: "choice"; selection: ChoiceDefinition; minimum: number; maximum: number; reselection: "never" | "god-approval" | "allowed"; restrictions: string };

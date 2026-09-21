import type { InteractionRule, InteractionRuleProfile } from "@/features/interaction-rules/interaction-rules";
import type { MechanicalEffect } from "@/features/mechanical-effects/models";
import type { ProtectionLayers } from "@/features/protection/protection-layers";
import type { ActionEffectSourceKind } from "@/features/tabletop-operations/action-effect-bridge";

/** Finished authoritative facts. Null means unknown, [] means known to have none.
 * No adapter, name inference, or Weapon/Ammunition inheritance happens here. */
export type IncomingSourceFacts = {
  damageType: string | null;
  magical: boolean | null;
  sourceKind: ActionEffectSourceKind | null;
  /** null = unknown, "none" = explicitly not a firearm. */
  weaponFamily: "firearm" | "none" | null;
  itemProperties: Array<{ name: string; value: string | null; relatedCreatureCanonicalId?: string | null }> | null;
  itemTags: string[] | null;
  mechanicalEffectKind: MechanicalEffect["kind"];
  conditionName: string | null;
};

export type IncomingEffectTarget = {
  protection: ProtectionLayers;
  ruleSource: { kind: "race" | "creature-snapshot" | "none"; id: string; name: string };
  /** Absent legacy profiles mean no authored rules, never a master lookup. */
  interactionRules: InteractionRuleProfile | null;
};

export type IncomingEffectInput = {
  effect: { label: string; amount: number | null; harmful: boolean | null };
  source: IncomingSourceFacts;
  target: IncomingEffectTarget;
  hitLocationKey: string | null;
  /** Optional authoritative context for a proposed healing cap only. */
  health?: { currentHp: number; maximumHp: number };
};

export type MatchOutcome = "match" | "no-match" | "unknown";
export type ConditionMatch = { key: string; outcome: MatchOutcome; description: string; reason: string };
export type RuleMatch = {
  rule: InteractionRule;
  inScope: boolean;
  outcome: MatchOutcome;
  conditions: ConditionMatch[];
};
export type ResolutionStageKey = "source" | "worn" | "interaction" | "natural" | "temporary" | "final";
export type ResolutionIssue = { code: string; stage: ResolutionStageKey; message: string; sourceIds: string[] };
export type ResolutionEntry = {
  operation: string;
  sourceId?: string;
  before?: number | null;
  after?: number | null;
  value?: number | null;
  exactBefore?: string | null;
  exactAfter?: string | null;
  message: string;
};
export type ResolutionStage = {
  key: ResolutionStageKey;
  status: "completed" | "skipped" | "blocked";
  damageBefore: number | null;
  damageAfter: number | null;
  healingBefore: number | null;
  healingAfter: number | null;
  exactDamageBefore: string | null;
  exactDamageAfter: string | null;
  exactHealingBefore: string | null;
  exactHealingAfter: string | null;
  entries: ResolutionEntry[];
};
export type InteractionCandidate = {
  ruleKeys: string[];
  basisDamage: number | null;
  damage: number | null;
  healing: number | null;
  exactDamage: string | null;
  exactHealing: string | null;
  description: string;
};
export type IncomingEffectResolution = {
  schemaVersion: 1;
  status: "resolved" | "prevented" | "absorbed" | "requires-god-ruling" | "invalid";
  /** Owned copy: later edits to live data or caller objects cannot change this plan. */
  input: IncomingEffectInput;
  stages: ResolutionStage[];
  ruleMatches: RuleMatch[];
  matchedRules: InteractionRule[];
  candidates: InteractionCandidate[];
  issues: ResolutionIssue[];
  /** Null while unresolved: never mistake an unfinished plan for zero damage. */
  finalEffect: null | {
    kind: IncomingSourceFacts["mechanicalEffectKind"];
    disposition: "allowed" | "prevented" | "absorbed";
    damage: number;
    healing: number;
    cappedHealing: number | null;
    damageBeforeRounding: number;
    healingBeforeRounding: number;
    exactDamageBeforeRounding: string;
    exactHealingBeforeRounding: string;
  };
  explanation: string[];
};

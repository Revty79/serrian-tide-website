import { formatMechanicalEffectSummary } from "@/features/mechanical-effects/summaries";
import type { MechanicsReference, MechanicsRule } from "./models";
import type { MechanicalEffect, RuntimeDuration } from "@/features/mechanical-effects/models";
import type { DefinitionAmount } from "./v2-models";
export function definitionAmountSummary(amount: DefinitionAmount | { kind: "full" }): string {
  return amount.kind === "full" ? "Full refill definition" : amount.kind === "fixed" ? String(amount.amount) : amount.kind === "manual" ? `G.O.D.: ${amount.guidance}`
    : `Provisional progression threshold ${amount.threshold}, contribution ${amount.contribution}; meaning not finalized`;
}
const durationSummary = (duration: RuntimeDuration) => `${duration.kind.replaceAll("-", " ")}${duration.value ? ` (${duration.value})` : ""}${duration.label ? `; ${duration.label}` : ""}`;
type ReferenceLabel = (reference: MechanicsReference) => string;
function effectSummary(effect: MechanicalEffect, label: ReferenceLabel): string {
  const summary = formatMechanicalEffectSummary(effect);
  if (effect.kind === "manual") return `${summary}: ${effect.description}`;
  if (effect.kind === "condition.apply") return `${summary}: ${effect.description}; duration: ${durationSummary(effect.duration)}`;
  if (effect.kind === "modifier.apply") return `${summary}; ${effect.channel} target: ${effect.channel === "skill" ? label({ kind: "skill", skillId: Number(effect.targetKey.slice(6)) }) : effect.targetKey}; duration: ${durationSummary(effect.duration)}`;
  return `${summary}${effect.timing?.mode === "over-time" ? `; first application: ${effect.timing.firstApplication?.replaceAll("-", " ")}` : "; immediate"}`;
}
export function v2RuleSummary(rule: MechanicsRule, rules: readonly MechanicsRule[] = [], label: ReferenceLabel = ref => ref.kind === "skill" ? "Skill definition" : "Derived Ability definition"): string[] {
  const localName = (key: string) => rules.find(row => row.key === key)?.title || "Local definition (unavailable or untitled)";
  const outcomes = rule.kind === "activated" || rule.kind === "override" ? rule.outcomes.map(outcome => `${outcome.kind.replaceAll("-", " ")}: ${outcome.description}${outcome.adjudication ? `; G.O.D.: ${outcome.adjudication}` : ""}${outcome.effectKeys.length ? `; linked intrinsic effects: ${outcome.effectKeys.map(key => {
    const effect = rule.kind === "activated" ? rule.effects.find(row => row.key === key)?.effect : null;
    return effect ? effectSummary(effect, label) : "Missing intrinsic effect";
  }).join(" / ")}` : "; no linked effects"}${outcome.limitations ? `; limitations: ${outcome.limitations}` : ""}${outcome.notes ? `; notes: ${outcome.notes}` : ""}`) : [];
  switch (rule.kind) {
    case "resource": return [`Resource definition: ${rule.grantsResource ? "describes granting this resource" : "defines only"}; unit: ${rule.unit || "unspecified"}`, `Maximum: ${definitionAmountSummary(rule.maximum)}`,
      ...rule.maximumChanges.map(change => `Maximum contribution: ${definitionAmountSummary(change.amount)}; ${change.when.mode === "always" ? "always when possessed" : `${change.when.groups.length} qualification way(s)`}; ${change.notes}`),
      ...rule.recovery.map(recovery => `Recovery (${recovery.scope}${recovery.event ? `: ${recovery.event}` : ""}): ${definitionAmountSummary(recovery.amount)}; ${recovery.notes}`), "No current balance is stored."];
    case "modifier": return [effectSummary(rule.effect, label), rule.adjudication && `G.O.D.: ${rule.adjudication}`, "Intrinsic contribution only; no Form body replacement or modifier application."].filter(Boolean);
    case "interaction": return [`${rule.interaction.ruleType} · ${rule.interaction.scope}${rule.interaction.percentage === null ? "" : ` · ${rule.interaction.percentage}%`}; match ${rule.interaction.match}`, ...rule.interaction.conditions.map(condition => {
      if (condition.kind === "damage-type") return `Damage type: ${condition.damageType}`;
      if (condition.kind === "magical") return `Magical: ${condition.magical ? "Yes" : "No"}`;
      if (condition.kind === "source-kind") return `Source: ${condition.sourceKind}${condition.weaponFamily ? ` (${condition.weaponFamily})` : ""}`;
      if (condition.kind === "mechanical-effect-kind") return `Effect kind: ${condition.effectKind}`;
      return `Condition name: ${condition.conditionName}`;
    }), rule.adjudication && `G.O.D.: ${rule.adjudication}`, "Shared Interaction semantics; no incoming effect is changed."].filter(Boolean);
    case "activated": return [`${rule.activationType}; ${rule.trigger || "intentional use"}`, `Target intent: ${rule.target.kind}; ${rule.target.description}`,
      ...(rule.duration ? [`Duration: ${durationSummary(rule.duration)}`] : []),
      ...rule.costs.map(cost => `${cost.kind === "resource" ? cost.resource.kind === "local" ? localName(cost.resource.resourceKey) : `${cost.resource.name} (manual identity: ${cost.resource.guidance})` : cost.kind} cost: ${definitionAmountSummary(cost.amount)}; ${cost.notes}`),
      ...rule.useLimits.map(limit => `${limit.maximumUses} uses; refresh ${limit.refreshScope}${limit.event ? `: ${limit.event}` : ""}; ${limit.notes}`),
      ...rule.choiceKeys.map(key => `Required choice: ${localName(key)}`), ...rule.effects.map(row => effectSummary(row.effect, label)), ...outcomes, "Authoring only: no affordability, event handling, costs, effects or outcomes are executed."];
    case "override": return [`Manual / G.O.D. override intent · ${rule.override.subsystem}`, rule.override.proposedChange, `Conflict/precedence guidance for G.O.D. review: ${rule.override.conflictGuidance}`, ...outcomes, "No registered executable override slot."];
    case "choice": return [`${rule.selection.kind} choice; select ${rule.minimum}–${rule.maximum}; reselection: ${rule.reselection}`, rule.selection.kind === "manual" ? rule.selection.guidance : rule.selection.kind === "attribute" ? `Allowed Attributes: ${rule.selection.attributeKeys.join(", ")}` : rule.selection.kind === "skill" ? `Allowed Skills: ${rule.selection.skillIds.map(skillId => label({ kind: "skill", skillId })).join(", ")}` : `Allowed Derived Abilities: ${rule.selection.derivedAbilityIds.map(derivedAbilityId => label({ kind: "derived-ability", derivedAbilityId })).join(", ")}`, rule.restrictions, "Definition only; no Character choice is stored."].filter(Boolean);
    default: return [];
  }
}

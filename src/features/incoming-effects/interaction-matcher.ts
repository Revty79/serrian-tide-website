import type { InteractionCondition, InteractionRule } from "@/features/interaction-rules/interaction-rules";
import type { ConditionMatch, IncomingSourceFacts, MatchOutcome } from "./models";

const categorical = (value: string) => value.trim().toLowerCase();
const equal = (left: string, right: string) => categorical(left) === categorical(right);

/** Text is normalized only for comparison. Canonical identities are compared byte-for-byte. */
export function matchInteractionCondition(condition: InteractionCondition, facts: IncomingSourceFacts): ConditionMatch {
  let value: boolean | null;
  let description: string;
  switch (condition.kind) {
    case "damage-type":
      description = `Damage Type = ${condition.damageType}`;
      value = facts.damageType === null ? null : equal(facts.damageType, condition.damageType);
      break;
    case "magical":
      description = `Magical = ${condition.magical}`;
      value = facts.magical === null ? null : facts.magical === condition.magical;
      break;
    case "source-kind":
      description = `Source Kind = ${condition.sourceKind}${condition.weaponFamily ? `; Weapon Family = ${condition.weaponFamily}` : ""}`;
      value = facts.sourceKind === null ? null : equal(facts.sourceKind, condition.sourceKind);
      if (value !== false && condition.weaponFamily) {
        const family = facts.weaponFamily === null ? null : equal(facts.weaponFamily, condition.weaponFamily);
        value = family === false ? false : value === null || family === null ? null : true;
      }
      break;
    case "item-property":
      description = `${condition.propertyName}${condition.value == null ? " (any value)" : ` = ${condition.value}`}${condition.relatedCreatureCanonicalId ? `; Related Creature = ${condition.relatedCreatureCanonicalId}` : ""}`;
      value = facts.itemProperties === null ? null : facts.itemProperties.some((property) =>
        equal(property.name, condition.propertyName)
        && (condition.value == null || property.value !== null && equal(property.value, condition.value))
        && (!condition.relatedCreatureCanonicalId || property.relatedCreatureCanonicalId === condition.relatedCreatureCanonicalId));
      break;
    case "item-tag":
      description = `Item Tag = ${condition.tagCanonicalId}`;
      value = facts.itemTags === null ? null : facts.itemTags.includes(condition.tagCanonicalId);
      break;
    case "mechanical-effect-kind":
      description = `Mechanical Effect Kind = ${condition.effectKind}`;
      value = equal(facts.mechanicalEffectKind, condition.effectKind);
      break;
    case "condition-name":
      description = `Condition Name = ${condition.conditionName}`;
      value = facts.conditionName === null ? null : equal(facts.conditionName, condition.conditionName);
      break;
  }
  return { key: condition.key, outcome: value === null ? "unknown" : value ? "match" : "no-match", description,
    reason: value === null ? `Authoritative source fact missing: ${description}.` : value ? `Source satisfies ${description}.` : `Source does not satisfy ${description}.` };
}

export function matchInteractionRule(rule: InteractionRule, facts: IncomingSourceFacts) {
  const conditions = rule.conditions.map((condition) => matchInteractionCondition(condition, facts));
  const outcomes = conditions.map(({ outcome }) => outcome);
  const outcome: MatchOutcome = rule.match === "ALL"
    ? outcomes.includes("no-match") ? "no-match" : outcomes.includes("unknown") ? "unknown" : "match"
    : outcomes.includes("match") ? "match" : outcomes.includes("unknown") ? "unknown" : "no-match";
  return { outcome, conditions };
}

/** Mechanical Effect scope includes every effect kind; Condition scope includes condition.apply. */
export function interactionRuleInScope(rule: InteractionRule, facts: IncomingSourceFacts): boolean {
  return rule.scope === "mechanical-effect"
    || rule.scope === "damage" && facts.mechanicalEffectKind === "health.damage"
    || rule.scope === "condition" && facts.mechanicalEffectKind === "condition.apply";
}

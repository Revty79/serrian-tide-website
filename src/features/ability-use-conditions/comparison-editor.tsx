"use client";

import { DERIVED_ABILITY_REQUIREMENT_OPERATORS, type DerivedAbilityRequirementOperator, type DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";
import { ABILITY_COMPARISON_OPERATORS, ABILITY_CONDITION_OPERATOR_LABELS as labels, abilityConditionFactType } from "./authoring";

export function AbilityConditionComparison({ condition, onChange }: {
  condition: DerivedAbilityUseConditionDefinition; onChange: (change: Partial<DerivedAbilityUseConditionDefinition>) => void;
}) {
  const type = abilityConditionFactType(condition);
  const manual = condition.conditionType === "manual", event = condition.conditionType === "event";
  const contextual = !manual && !event && type !== null;
  const custom = !manual && type === null;
  const showNumber = contextual && type === "number", showText = contextual && type === "text";
  const operators = type ? ABILITY_COMPARISON_OPERATORS[type] : [];
  const savedOperator = condition.operator !== null && (!contextual || !operators.includes(condition.operator));
  const retained = manual && condition.conditionKey !== null || savedOperator
    || !showNumber && condition.numericValue !== null || !showText && condition.textValue !== null;
  const operatorControl = (all = false, label = all ? "Comparison Operator" : type === "boolean" ? "Required State" : "Comparison") => <select className="st-control" aria-label={label} value={condition.operator ?? ""}
    onChange={(e) => onChange({ operator: (e.target.value || null) as DerivedAbilityRequirementOperator | null })}>
    <option value="">{all ? "Unspecified" : type === "boolean" ? "Choose required state" : "Choose comparison"}</option>
    {!all && savedOperator && <option value={condition.operator!}>Saved comparison: {labels[condition.operator!]}</option>}
    {(all ? DERIVED_ABILITY_REQUIREMENT_OPERATORS : operators).map((op) => <option key={op} value={op}>{labels[op]}</option>)}
  </select>;
  const numberControl = <input className="st-control" type="number" step="any" value={condition.numericValue ?? ""}
    onChange={(e) => onChange({ numericValue: e.target.value === "" ? null : Number(e.target.value) })} />;
  const textControl = <input className="st-control" value={condition.textValue ?? ""}
    onChange={(e) => onChange({ textValue: e.target.value || null })} />;
  return <>
    {event && <p>Match: Exact Event. The event must come from an authoritative response window or an explicit G.O.D. ruling. No operator is needed.</p>}
    {contextual && <>
      <label className="st-field">{type === "boolean" ? "Required State" : "Comparison"}{operatorControl()}</label>
      {showNumber && <label className="st-field">Number to Compare{numberControl}</label>}
      {showText && <label className="st-field">Text to Compare{textControl}</label>}
      {savedOperator && <p>The saved comparison does not match this fact type. Choose a supported comparison to correct it.</p>}
    </>}
    {custom && <details className="derived-ability-field is-wide"><summary>Advanced Comparison</summary>
      <p>The runtime cannot determine the type of this custom key until a matching authoritative fact exists. If it cannot be resolved at use, the G.O.D. must rule.</p>
      <label className="st-field">Comparison Operator{operatorControl(true)}</label>
      <label className="st-field">Number to Compare{numberControl}</label>
      <label className="st-field">Text to Compare{textControl}</label>
    </details>}
    {!manual && (condition.operator === "eq" || condition.operator === "neq") && condition.numericValue !== null && condition.textValue !== null && <p>
      Both a number and text are saved. This comparison requires a G.O.D. ruling until you deliberately clear the unwanted value.
    </p>}
    {showNumber && condition.operator !== null && ["gte", "gt", "lte", "lt"].includes(condition.operator) && condition.textValue && <p>
      A saved text value makes this numeric comparison require a G.O.D. ruling. Clear it in Saved Condition Details to use the number alone.
    </p>}
    {retained && !custom && <details className="derived-ability-field is-wide"><summary>Saved Condition Details</summary>
      <p>These values are preserved outside the current comparison. Edit or clear them deliberately; changing the fact or condition type does not erase them.</p>
      {manual && condition.conditionKey !== null && <label className="st-field">Saved Condition Key<input className="st-control" value={condition.conditionKey}
        onChange={(e) => onChange({ conditionKey: e.target.value || null })} /></label>}
      {savedOperator && <label className="st-field">Saved Comparison Operator{operatorControl(true, "Saved Comparison Operator")}</label>}
      {!showNumber && condition.numericValue !== null && <label className="st-field">Saved Number to Compare{numberControl}</label>}
      {!showText && condition.textValue !== null && <label className="st-field">Saved Text to Compare{textControl}</label>}
    </details>}
  </>;
}

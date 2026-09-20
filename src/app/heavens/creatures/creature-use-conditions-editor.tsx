"use client";

import { cloneElement, useId, useState, type ReactElement, type ReactNode } from "react";
import {
  DERIVED_ABILITY_REQUIREMENT_OPERATORS,
  type DerivedAbilityRequirementOperator,
  type DerivedAbilityUseConditionDefinition,
  type DerivedAbilityUseConditionType,
} from "@/features/derived-abilities/models";
import styles from "./creature-use-conditions-editor.module.css";

const operatorLabels: Record<DerivedAbilityRequirementOperator, string> = {
  gte: "Greater than or equal to", gt: "Greater than",
  lte: "Less than or equal to", lt: "Less than",
  eq: "Equal to", neq: "Not equal to",
  possessed: "Present / possessed", "not-possessed": "Not present / not possessed",
};
const typeLabels: Record<DerivedAbilityUseConditionType, string> = {
  manual: "Manual Ruling", event: "Event", equipment: "Equipment", state: "State",
};
const operatorHelp = <>
  <p>The Operator tells Serrian Tide how to compare the current value of the condition with the value you enter.</p>
  <p>Examples: Health Percentage → Greater than → 50; State → Equal to → Enraged; Equipment → Present / possessed.</p>
  <p>Numeric and text comparisons are authored for later runtime integration; they are not fully evaluated today.</p>
</>;
const numberHelp = <>
  <p>Use this when the selected Operator compares numbers.</p>
  <p>Examples: Greater than or equal to 50; Less than 25; Equal to 3.</p>
  <p>Leave this blank when the condition does not compare a number.</p>
</>;
const textHelp = <>
  <p>Use this when the condition compares text instead of a number.</p>
  <p>Examples: Equal to &apos;enraged&apos;; Not equal to &apos;broken&apos;.</p>
  <p>Leave this blank when the condition does not compare text.</p>
</>;
const notesHelp = <>
  <p>Optional explanation for the G.O.D. This does not change how the condition is evaluated.</p>
  <p>Example: This reaction only applies to the first successful parry each round.</p>
</>;

function HelpLabel({ name, label, help }: { name: string; label: ReactNode; help: ReactNode }) {
  const [open, setOpen] = useState(false);
  const helpId = useId();
  return <div className={styles.helpLabel}>
    {label}
    <button type="button" className={styles.helpButton} aria-label={`Help for ${name}`} aria-expanded={open}
      aria-controls={helpId} onClick={() => setOpen(!open)}>?</button>
    <div className={styles.helpText} id={helpId} hidden={!open} role="note">{help}</div>
  </div>;
}

export function CreatureAuthoringHelpField({ name, help, children }: {
  name: string; help: ReactNode; children: ReactElement<{ id?: string }>;
}) {
  const inputId = useId();
  return <div className="st-field">
    <HelpLabel name={name} label={<label htmlFor={inputId}>{name}</label>} help={help} />
    {cloneElement(children, { id: inputId })}
  </div>;
}

export const creatureActivationHelp = <>
  <p><strong>Passive:</strong> Always applies while its Use Conditions are satisfied. It is not chosen as an action.</p>
  <p><strong>Activated:</strong> The creature deliberately chooses to use this Ability.</p>
  <p><strong>Triggered:</strong> The Ability becomes relevant when its authored trigger/event conditions occur.</p>
  <p><strong>Reaction:</strong> The Ability may be used in response to an appropriate event or opportunity.</p>
  <p>These describe the authored intent. Creature activation and Use Condition integration is planned for a later combat/runtime step.</p>
</>;

function conditionTypeHelp(type: DerivedAbilityUseConditionType) {
  switch (type) {
    case "manual": return <>
      <p>The G.O.D. decides whether this condition is satisfied.</p>
      <p>Example: Only while standing in moonlight.</p>
      <p>Use this when Serrian Tide does not currently track the condition automatically.</p>
    </>;
    case "event": return <>
      <p>Checks whether a specific event has occurred or is currently being evaluated.</p>
      <p>Example Event Key: successful-parry. This condition matches when Serrian Tide reports the event named successful-parry.</p>
      <p>Typing a new Event Key does NOT automatically create that event. Later runtime work will provide supported Event Keys/selectors where possible.</p>
    </>;
    case "equipment": return <>
      <p>Checks an equipment-related fact. The Condition Key identifies the equipment fact.</p>
      <p>Examples: shield-equipped, ancestral-weapon, wearing-heavy-armor.</p>
      <p>Later runtime integration will provide these facts from Character/Creature equipment. These examples are not a supported equipment catalog.</p>
    </>;
    case "state": return <>
      <p>Checks a current Character or Creature state. The Condition Key identifies the state being checked.</p>
      <p>Examples: enraged, flying, prone, invisible.</p>
      <p>Later runtime integration will connect this to authoritative Character/Creature state information. Typing a new key by itself does not create a new tracked state.</p>
    </>;
  }
}

function ConditionEditor({ condition, onChange, onRemove }: {
  condition: DerivedAbilityUseConditionDefinition;
  onChange: (condition: DerivedAbilityUseConditionDefinition) => void;
  onRemove: () => void;
}) {
  // A presentation choice only: switching views must never clear either saved value.
  const [comparisonChoice, setComparisonChoice] = useState<"number" | "text" | null>(null);
  const compareAs = comparisonChoice ?? (condition.textValue !== null && condition.numericValue === null ? "text" : "number");
  const update = (change: Partial<DerivedAbilityUseConditionDefinition>) => onChange({ ...condition, ...change });
  const manual = condition.conditionType === "manual";
  const event = condition.conditionType === "event";
  const equality = condition.operator === "eq" || condition.operator === "neq";
  const ordered = condition.operator !== null && ["gte", "gt", "lte", "lt"].includes(condition.operator);
  const showNumber = !manual && (ordered || (equality && compareAs === "number"));
  const showText = !manual && equality && compareAs === "text";
  const advancedOperator = condition.operator !== null && !["possessed", "not-possessed"].includes(condition.operator);
  const retained = [
    ...(manual && condition.conditionKey !== null ? [{ label: "Condition Key", value: condition.conditionKey }] : []),
    ...(manual && condition.operator !== null ? [{ label: "Operator", value: operatorLabels[condition.operator] }] : []),
    ...(!showNumber && condition.numericValue !== null ? [{ label: "Number to Compare", value: String(condition.numericValue) }] : []),
    ...(!showText && condition.textValue !== null ? [{ label: "Text to Compare", value: condition.textValue }] : []),
  ];
  return <div className={styles.condition} data-use-condition>
    <CreatureAuthoringHelpField name="Condition Type" help={conditionTypeHelp(condition.conditionType)}>
      <select className="st-control" value={condition.conditionType} onChange={(e) => update({ conditionType: e.target.value as DerivedAbilityUseConditionType })}>
        {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </CreatureAuthoringHelpField>
    {!manual ? <>
      <CreatureAuthoringHelpField name={`${typeLabels[condition.conditionType]} Key`} help={<>
        <p>Condition Key is the system-readable name of the event, equipment fact, or state being checked.</p>
        <p>Examples: successful-parry, shield-equipped, enraged.</p>
        <p>The key must eventually match a fact supplied by Serrian Tide&apos;s runtime. Typing a key does not create a tracked fact or event.</p>
        <p>Future runtime integration should replace known raw keys with selectable system options wherever possible.</p>
      </>}>
        <input className="st-control" value={condition.conditionKey ?? ""} onChange={(e) => update({ conditionKey: e.target.value || null })} />
      </CreatureAuthoringHelpField>
      {event ? <p><strong>Match: Exact Event.</strong> Currently matches only when the supplied event key matches this Event Key.</p> : <>
        <CreatureAuthoringHelpField name="Operator" help={operatorHelp}>
          <select className="st-control" value={condition.operator ?? ""} onChange={(e) => update({ operator: e.target.value as DerivedAbilityRequirementOperator || null })}>
            <option value="">Unspecified</option>
            <option value="possessed">{operatorLabels.possessed}</option>
            <option value="not-possessed">{operatorLabels["not-possessed"]}</option>
            {advancedOperator && <option value={condition.operator!}>{operatorLabels[condition.operator!]}</option>}
          </select>
        </CreatureAuthoringHelpField>
        <p>Equipment and State facts are not yet fully supplied by the normal Character runtime. Richer comparisons are under Advanced Comparison.</p>
      </>}
      <details className={styles.details}>
        <summary>Advanced Comparison</summary>
        <p>For later runtime integration. {event ? "Current Event matching ignores these comparison settings." : "Current Equipment/State evaluation uses supplied yes/no facts, not numeric or text comparisons."} Saved values are kept when you change views or operators.</p>
        <CreatureAuthoringHelpField name="Comparison Operator" help={operatorHelp}>
          <select className="st-control" value={condition.operator ?? ""} onChange={(e) => update({ operator: e.target.value as DerivedAbilityRequirementOperator || null })}>
            <option value="">Unspecified</option>
            {DERIVED_ABILITY_REQUIREMENT_OPERATORS.map((operator) => <option key={operator} value={operator}>{operatorLabels[operator]}</option>)}
          </select>
        </CreatureAuthoringHelpField>
        {equality && <CreatureAuthoringHelpField name="Compare As" help={<p>Choose whether to author a number or text comparison. This changes the fields shown, not stored values. Any other saved value remains in Saved Condition Details.</p>}>
          <select className="st-control" value={compareAs} onChange={(e) => setComparisonChoice(e.target.value as "number" | "text")}>
            <option value="number">Number</option><option value="text">Text</option>
          </select>
        </CreatureAuthoringHelpField>}
        {showNumber && <CreatureAuthoringHelpField name="Number to Compare" help={numberHelp}>
          <input className="st-control" type="number" step="any" value={condition.numericValue ?? ""} onChange={(e) => update({ numericValue: e.target.value === "" ? null : Number(e.target.value) })} />
        </CreatureAuthoringHelpField>}
        {showText && <CreatureAuthoringHelpField name="Text to Compare" help={textHelp}>
          <input className="st-control" value={condition.textValue ?? ""} onChange={(e) => update({ textValue: e.target.value || null })} />
        </CreatureAuthoringHelpField>}
      </details>
    </> : null}
    <CreatureAuthoringHelpField name={manual ? "Description / Notes" : "Notes"} help={<>
      {manual && <p>Describe the condition for the G.O.D., for example: Only while standing in moonlight. A Manual Ruling needs this description. Description and notes share one saved explanation.</p>}
      {notesHelp}
    </>}>
      <textarea className="st-control" rows={2} value={condition.notes} onChange={(e) => update({ notes: e.target.value })} />
    </CreatureAuthoringHelpField>
    {retained.length > 0 && <details className={styles.details}>
      <summary>Saved Condition Details</summary>
      <p>These existing values are preserved outside the current comparison view. No value is removed automatically. Select the corresponding type or comparison to edit it.</p>
      <dl>{retained.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </details>}
    <button type="button" className="st-button" onClick={onRemove}>Remove Condition</button>
  </div>;
}

export function CreatureUseConditionsEditor({ conditions, onChange }: {
  conditions: DerivedAbilityUseConditionDefinition[];
  onChange: (conditions: DerivedAbilityUseConditionDefinition[]) => void;
}) {
  const headingId = useId();
  return <fieldset className={styles.editor} aria-labelledby={headingId}>
    <HelpLabel name="Use Conditions" label={<h4 id={headingId}>Use Conditions</h4>} help={<>
      <p>Use Conditions describe when an Ability can be used, becomes active, or becomes relevant.</p>
      <p>Some conditions can already be evaluated from runtime information. Others are being authored now for later runtime integration.</p>
      <p>A Condition Key is the system-readable name of the fact or event being checked.</p>
      <p>Eventually known Condition Keys should be supplied by Serrian Tide as selectable options. Until that runtime catalog exists, some keys must be entered manually.</p>
      <p><strong>Current runtime support:</strong> Event conditions support exact Event Key matching when an event key is supplied. Equipment / State support boolean condition maps in the domain, but the normal Character Derived Ability runtime does not yet provide a complete system-backed Equipment/State catalog and facts.</p>
      <p>Numeric / text comparisons are preserved by the authoring model; full comparison support belongs to later runtime integration. Creature Use Conditions remain authoring metadata at this step.</p>
      <p>Some advanced Use Conditions are being authored now for later runtime integration. Serrian Tide will not silently pretend to know a state or value it does not currently track.</p>
    </>} />
    <p>Describe when this Ability applies. Automatic support varies; open ? for current limits.</p>
    {conditions.map((condition, index) => <ConditionEditor key={index} condition={condition}
      onChange={(changed) => onChange(conditions.map((entry, i) => i === index ? changed : entry))}
      onRemove={() => onChange(conditions.filter((_, i) => i !== index))} />)}
    <button type="button" className="st-button" onClick={() => onChange([...conditions, {
      conditionType: "manual", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "", sortOrder: conditions.length,
    }])}>Add Use Condition</button>
  </fieldset>;
}

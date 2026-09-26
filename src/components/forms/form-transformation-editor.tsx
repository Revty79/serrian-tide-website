"use client";

import { GuidedField } from "@/components/field-guidance";
import { AbilityFactSelector } from "@/features/ability-use-conditions/fact-selector";
import { ABILITY_CONDITION_OPERATOR_LABELS } from "@/features/ability-use-conditions/authoring";
import { DERIVED_ABILITY_COST_TYPES, DERIVED_ABILITY_REFRESH_SCOPES, DERIVED_ABILITY_USE_CONDITION_TYPES, type DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";
import { emptyFormTransformation, FORM_DURATION_MODES, FORM_ENTRY_METHODS, FORM_EXIT_METHODS, FORM_TIMING_MODES, normalizeFormTransformation, type FormCosts, type FormTiming, type FormTransformation } from "@/features/forms/form-transformation";
import styles from "./forms.module.css";

import { formChoiceLabel as transformationLabel, formRefreshLabel } from "@/features/forms/form-language";
export { transformationLabel };
function Text({ label, value, onChange, help }: { label: string; value: string; onChange: (value: string) => void; help: string }) {
  return <GuidedField className="st-field" label={label} help={help}><textarea className="st-control" rows={2} value={value} onChange={event => onChange(event.target.value)} /></GuidedField>;
}
function Select<T extends string>({ label, value, options, onChange, help, allowUnspecified = true }: { label: string; value: T | null; options: readonly T[]; onChange: (value: T | null) => void; help: string; allowUnspecified?: boolean }) {
  return <GuidedField className="st-field" label={label} help={help}><select className="st-control" value={value ?? ""} onChange={event => onChange(event.target.value as T || null)}>{allowUnspecified && <option value="">Not decided</option>}{options.map(option => <option key={option} value={option}>{label === "When do uses return?" ? formRefreshLabel(option) : transformationLabel(option)}</option>)}</select></GuidedField>;
}
function Timing({ title, value, onChange }: { title: string; value: FormTiming; onChange: (value: FormTiming) => void }) {
  return <fieldset className={styles.sectionBody}><legend>Time needed for {title.toLowerCase()}</legend>
    <Select label={`How long does ${title.toLowerCase()} take?`} value={value.mode} options={FORM_TIMING_MODES} onChange={mode => onChange({ ...value, mode, initiativeCost: mode === "initiative" ? value.initiativeCost : null })} help="Choose an Initiative cost, elapsed time, an instant change, or a G.O.D. ruling. Leave undecided if the timing is unknown. Changing away from Initiative clears that cost. Preview never spends it." />
    {value.mode === "initiative" && <GuidedField className="st-field" label={`${title} Initiative`} help="A positive Initiative cost. No Initiative is spent by the Form viewer; use Instant for an explicitly instant change."><input className="st-control" type="number" min={0} step="any" value={value.initiativeCost ?? ""} onChange={event => onChange({ ...value, initiativeCost: event.target.value === "" ? null : Number(event.target.value) })} /></GuidedField>}
    <Text label={`Time for ${title.toLowerCase()} outside combat`} value={value.time} onChange={time => onChange({ ...value, time })} help="Describe elapsed time outside combat, for example one minute of concentration. May accompany an Initiative cost." />
    <Text label={`${title} timing notes`} value={value.notes} onChange={notes => onChange({ ...value, notes })} help="Explain timing exceptions or the custom G.O.D. ruling. Required for Custom timing." />
  </fieldset>;
}
function Costs({ title, value, onChange }: { title: string; value: FormCosts; onChange: (value: FormCosts) => void }) {
  return <fieldset className={styles.sectionBody}><legend>{title} resource costs</legend>
    <GuidedField className="st-field" label={`Does ${title.toLowerCase()} cost resources?`} help="Leave undecided if the cost is unknown. Choose No cost for a free change, or List resource costs to enter amounts. Leaving the list option clears its costs."><select className="st-control" value={value.mode} onChange={event => onChange({ mode: event.target.value as FormCosts["mode"], costs: event.target.value === "costs" ? value.costs : [] })}><option value="unspecified">Not decided</option><option value="none">No cost</option><option value="costs">List resource costs</option></select></GuidedField>
    {value.mode === "costs" && <>{value.costs.map((cost, index) => {
      const update = (patch: Partial<typeof cost>) => onChange({ ...value, costs: value.costs.map((row, i) => i === index ? { ...row, ...patch } : row) });
      return <div className={styles.card} key={index}>
        <Select allowUnspecified={false} label="Resource" value={cost.costType} options={DERIVED_ABILITY_COST_TYPES.filter(type => type !== "initiative")} onChange={costType => update({ costType: costType ?? "mana" })} help="Choose what is paid. HP means health. Choose Named resource for Quintessence or another resource, or a G.O.D. ruling for an unusual cost." />
        <GuidedField className="st-field" label="Cost amount" help="A positive amount; use No cost instead of a zero amount. This is never spent by preview."><input className="st-control" type="number" min={0} step="any" value={cost.amount} onChange={event => update({ amount: Number(event.target.value) })} /></GuidedField>
        <Text label="Resource name" value={cost.resourceKey ?? ""} onChange={resourceKey => update({ resourceKey: resourceKey || null })} help="Required for a named Resource, for example Quintessence. Naming it does not create or spend a resource." />
        <Text label="Cost notes" value={cost.notes} onChange={notes => update({ notes })} help="Describe how this cost is intended to be paid and any ruling needed." />
        <button className="st-button" type="button" onClick={() => onChange({ ...value, costs: value.costs.filter((_, i) => i !== index) })}>Remove cost</button>
      </div>;
    })}<button className="st-button" type="button" onClick={() => onChange({ ...value, costs: [...value.costs, { costType: "mana", amount: 1, resourceKey: null, notes: "", sortOrder: value.costs.length }] })}>Add {title.toLowerCase()} cost</button></>}
  </fieldset>;
}
function Conditions({ title, value, onChange }: { title: string; value: DerivedAbilityUseConditionDefinition[]; onChange: (value: DerivedAbilityUseConditionDefinition[]) => void }) {
  return <fieldset className={styles.sectionBody}><legend>{title}</legend><p>Describe when changing is allowed or forced. Use G.O.D. ruling for moon phases, environment, concentration or story events. Explain in notes whether several conditions must happen together or any one is enough. With no entries, no conditions are recorded here.</p>
    {value.map((condition, index) => {
      const update = (patch: Partial<typeof condition>) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row));
      return <div className={styles.card} key={index}>
        <Select allowUnspecified={false} label="Condition type" value={condition.conditionType} options={DERIVED_ABILITY_USE_CONDITION_TYPES} onChange={conditionType => update({ conditionType: conditionType ?? "manual" })} help="Choose equipment, an event, current circumstances or a G.O.D. ruling. Explain rulings in notes. These conditions are recorded for reference and are not checked automatically." />
        {condition.conditionType !== "manual" && <GuidedField className="st-field" label="What circumstance matters?" help="Choose a known circumstance, or describe a custom one. Preview records the choice without checking whether it is currently true."><AbilityFactSelector category={condition.conditionType} value={condition.conditionKey} onChange={conditionKey => update({ conditionKey })} /></GuidedField>}
        <GuidedField className="st-field" label="What should be true?" help="Choose how to check the circumstance, or leave undecided. Enter the number or text needed below and explain any unusual check in notes."><select className="st-control" value={condition.operator ?? ""} onChange={event => update({ operator: event.target.value as typeof condition.operator || null })}><option value="">Not decided</option>{Object.entries(ABILITY_CONDITION_OPERATOR_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></GuidedField>
        <GuidedField className="st-field" label="Condition number" help="The number being compared, such as 25 for a health percentage threshold. Blank means no number."><input className="st-control" type="number" step="any" value={condition.numericValue ?? ""} onChange={event => update({ numericValue: event.target.value === "" ? null : Number(event.target.value) })} /></GuidedField>
        <Text label="Condition text" value={condition.textValue ?? ""} onChange={textValue => update({ textValue: textValue || null })} help="Text for a comparison where appropriate. Leave blank for a numeric condition." />
        <Text label="Condition notes" value={condition.notes} onChange={notes => update({ notes })} help="Describe the requirement or trigger. Required for a Manual condition; include any alternative or combined conditions." />
        <button className="st-button" type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove condition</button>
      </div>;
    })}<button className="st-button" type="button" onClick={() => onChange([...value, { conditionType: "manual", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "", sortOrder: value.length }])}>{title === "Conditions needed before changing" ? "Add a condition for changing" : "Add a trigger for a forced change"}</button>
  </fieldset>;
}
export function FormTransformationEditor({ value, onChange }: { value?: FormTransformation | null; onChange: (value: FormTransformation | null) => void }) {
  const data = value ?? emptyFormTransformation();
  const patch = (change: Partial<FormTransformation>) => onChange({ ...data, ...change });
  let validation = "";
  try { normalizeFormTransformation(data); } catch (error) { validation = error instanceof Error ? error.message : "Check transformation fields."; }
  return <details className={styles.section}><summary>Transformation · {value ? "Rules recorded" : "No rules recorded"}</summary><div className={styles.sectionBody}>
    <p>Describe changing into this Form and returning from it. Leaving a rule undecided does not mean the change is free or instant. The viewer never transforms anyone, spends resources or tracks uses.</p>
    {validation && <p className={styles.error} role="alert">{validation}</p>}
    <Select label="Who controls changing into this Form?" value={data.entryMethod} options={FORM_ENTRY_METHODS} onChange={entryMethod => patch({ entryMethod })} help="Choose whether changing is voluntary, forced by a trigger, or either. A G.O.D. ruling needs an explanation. Leave undecided if no entry rule is known." />
    <Text label="Entry notes" value={data.entryNotes} onChange={entryNotes => patch({ entryNotes })} help="Describe who chooses entry and any exceptions." />
    <Timing title="Entry" value={data.entryTiming} onChange={entryTiming => patch({ entryTiming })} /><Costs title="Entry" value={data.entryCosts} onChange={entryCosts => patch({ entryCosts })} />
    <Conditions title="Conditions needed before changing" value={data.requirements} onChange={requirements => patch({ requirements })} />
    <Conditions title="What can force the change?" value={data.involuntaryTriggers} onChange={involuntaryTriggers => patch({ involuntaryTriggers })} />
    <Select label="How long does this Form last?" value={data.duration.mode} options={FORM_DURATION_MODES} onChange={mode => patch({ duration: { ...data.duration, mode } })} help="Choose what ends the time in this Form. Explain a set length, ending condition or G.O.D. ruling below. Leave undecided if unknown; preview starts no timer." />
    <Text label="Duration description" value={data.duration.description} onChange={description => patch({ duration: { ...data.duration, description } })} help="For example ten minutes, until sunlight returns, or the G.O.D.'s duration ruling." />
    <fieldset className={styles.sectionBody}><legend>Ways to return from this Form</legend><p>Select each way to leave this Form, then explain how they work together. No selection means return rules are not yet recorded.</p>{FORM_EXIT_METHODS.map(method => <label key={method}><input type="checkbox" checked={data.exitMethods.includes(method)} onChange={event => patch({ exitMethods: event.target.checked ? [...data.exitMethods, method] : data.exitMethods.filter(value => value !== method) })} /> {transformationLabel(method)}</label>)}</fieldset>
    <Text label="Exit notes" value={data.exitNotes} onChange={exitNotes => patch({ exitNotes })} help="Describe return actions, depletion rules, ending conditions, or G.O.D. control. These rules do not execute." />
    <Timing title="Exit" value={data.exitTiming} onChange={exitTiming => patch({ exitTiming })} /><Costs title="Exit" value={data.exitCosts} onChange={exitCosts => patch({ exitCosts })} />
    <GuidedField className="st-field" label="How often can this change happen?" help="Leave undecided if unknown. Choose No limit on uses, or Limit the number of uses to record how many changes are allowed and when they return. Leaving that option clears the list."><select className="st-control" value={data.limitMode} onChange={event => patch({ limitMode: event.target.value as typeof data.limitMode, useLimits: event.target.value === "limited" ? data.useLimits : [] })}><option value="unspecified">Not decided</option><option value="unlimited">No limit on uses</option><option value="limited">Limit the number of uses</option><option value="custom">G.O.D. ruling described below</option></select></GuidedField>
    {data.limitMode === "limited" && <>{data.useLimits.map((limit, index) => {
      const update = (patch: Partial<typeof limit>) => onChange({ ...data, useLimits: data.useLimits.map((row, i) => i === index ? { ...row, ...patch } : row) });
      return <div className={styles.card} key={index}>
        <GuidedField className="st-field" label="Maximum uses" help="A positive whole number before the authored refresh. One use with Scene or Encounter represents once per scene or encounter."><input className="st-control" type="number" min={1} step={1} value={limit.maximumUses} onChange={event => update({ maximumUses: Number(event.target.value) })} /></GuidedField>
        <Select allowUnspecified={false} label="When do uses return?" value={limit.refreshScope} options={DERIVED_ABILITY_REFRESH_SCOPES} onChange={refreshScope => update({ refreshScope: refreshScope ?? "manual" })} help="Choose when spent uses return. Explain an event or G.O.D. ruling below. Preview does not count or restore uses." />
        <Text label="Event that restores uses" value={limit.refreshKey ?? ""} onChange={refreshKey => update({ refreshKey: refreshKey || null })} help="Name the event or ruling that restores uses, if needed. Leave blank when the choice above is enough. Nothing happens automatically." />
        <Text label="Limit notes" value={limit.notes} onChange={notes => update({ notes })} help="Explain this use limit and any refresh ruling." />
        <button className="st-button" type="button" onClick={() => patch({ useLimits: data.useLimits.filter((_, i) => i !== index) })}>Remove limit</button>
      </div>;
    })}<button className="st-button" type="button" onClick={() => patch({ useLimits: [...data.useLimits, { maximumUses: 1, refreshScope: "scene", refreshKey: null, notes: "", sortOrder: data.useLimits.length }] })}>Add use limit</button></>}
    <Text label="Waiting time between changes or other limits" value={data.cooldown} onChange={cooldown => patch({ cooldown })} help="Describe time between changes or a custom use-limit ruling. This is descriptive; no cooldown is enforced." />
    <Text label="What happens to equipment when changing?" value={data.equipmentEntryNotes} onChange={equipmentEntryNotes => patch({ equipmentEntryNotes })} help="Explain how the Equipment in this Form choice works when changing. Leave blank if that choice is enough. No equipment changes automatically." />
    <Text label="What happens to equipment when returning?" value={data.equipmentExitNotes} onChange={equipmentExitNotes => patch({ equipmentExitNotes })} help="Explain what happens to equipment on return. This adds detail to the Form equipment choice; it does not change Items." />
    <Text label="Transformation notes" value={data.notes} onChange={notes => patch({ notes })} help="Other transformation rulings for the player and G.O.D." />
    <button className="st-button" type="button" onClick={() => onChange(null)}>Clear transformation rules</button>
  </div></details>;
}

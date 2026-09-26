"use client";

import { GuidedField } from "@/components/field-guidance";
import { AbilityFactSelector } from "@/features/ability-use-conditions/fact-selector";
import { ABILITY_CONDITION_OPERATOR_LABELS } from "@/features/ability-use-conditions/authoring";
import { DERIVED_ABILITY_COST_TYPES, DERIVED_ABILITY_REFRESH_SCOPES, DERIVED_ABILITY_USE_CONDITION_TYPES, type DerivedAbilityUseConditionDefinition } from "@/features/derived-abilities/models";
import { emptyRaceFormTransformation, FORM_DURATION_MODES, FORM_ENTRY_METHODS, FORM_EXIT_METHODS, FORM_TIMING_MODES, normalizeRaceFormTransformation, type FormCosts, type FormTiming, type RaceFormTransformation } from "@/features/races/race-form-transformation";
import styles from "./race-forms-editor.module.css";

export const transformationLabel = (value: string) => value.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
function Text({ label, value, onChange, help }: { label: string; value: string; onChange: (value: string) => void; help: string }) {
  return <GuidedField className="st-field" label={label} help={help}><textarea className="st-control" rows={2} value={value} onChange={event => onChange(event.target.value)} /></GuidedField>;
}
function Select<T extends string>({ label, value, options, onChange, help, allowUnspecified = true }: { label: string; value: T | null; options: readonly T[]; onChange: (value: T | null) => void; help: string; allowUnspecified?: boolean }) {
  return <GuidedField className="st-field" label={label} help={help}><select className="st-control" value={value ?? ""} onChange={event => onChange(event.target.value as T || null)}>{allowUnspecified && <option value="">Unspecified</option>}{options.map(option => <option key={option} value={option}>{transformationLabel(option)}</option>)}</select></GuidedField>;
}
function Timing({ title, value, onChange }: { title: string; value: FormTiming; onChange: (value: FormTiming) => void }) {
  return <fieldset className={styles.sectionBody}><legend>{title} timing</legend>
    <Select label={`${title} timing method`} value={value.mode} options={FORM_TIMING_MODES} onChange={mode => onChange({ ...value, mode, initiativeCost: mode === "initiative" ? value.initiativeCost : null })} help="Author Initiative, elapsed time, an explicitly instant change, or a G.O.D. ruling. Changing away from Initiative clears that cost. Nothing is executed." />
    {value.mode === "initiative" && <GuidedField className="st-field" label={`${title} Initiative`} help="A positive Initiative cost. No Initiative is spent by the Form viewer; use Instant for an explicitly instant change."><input className="st-control" type="number" min={0} step="any" value={value.initiativeCost ?? ""} onChange={event => onChange({ ...value, initiativeCost: event.target.value === "" ? null : Number(event.target.value) })} /></GuidedField>}
    <Text label={`${title} non-combat time`} value={value.time} onChange={time => onChange({ ...value, time })} help="Describe elapsed time outside combat, for example one minute of concentration. May accompany an Initiative cost." />
    <Text label={`${title} timing notes`} value={value.notes} onChange={notes => onChange({ ...value, notes })} help="Explain timing exceptions or the custom G.O.D. ruling. Required for Custom timing." />
  </fieldset>;
}
function Costs({ title, value, onChange }: { title: string; value: FormCosts; onChange: (value: FormCosts) => void }) {
  return <fieldset className={styles.sectionBody}><legend>{title} resource costs</legend>
    <GuidedField className="st-field" label={`${title} costs`} help="Unspecified leaves the rule undecided. No cost explicitly authors no resource cost. Authored costs use the shared Ability resource vocabulary. Changing away from Authored costs clears those rows."><select className="st-control" value={value.mode} onChange={event => onChange({ mode: event.target.value as FormCosts["mode"], costs: event.target.value === "costs" ? value.costs : [] })}><option value="unspecified">Unspecified</option><option value="none">No cost</option><option value="costs">Authored costs</option></select></GuidedField>
    {value.mode === "costs" && <>{value.costs.map((cost, index) => {
      const update = (patch: Partial<typeof cost>) => onChange({ ...value, costs: value.costs.map((row, i) => i === index ? { ...row, ...patch } : row) });
      return <div className={styles.card} key={index}>
        <Select allowUnspecified={false} label="Resource" value={cost.costType} options={DERIVED_ABILITY_COST_TYPES.filter(type => type !== "initiative")} onChange={costType => update({ costType: costType ?? "mana" })} help="Health means HP. Use Resource with a name for Quintessence or another authored resource; use Custom for a G.O.D. cost." />
        <GuidedField className="st-field" label="Cost amount" help="A positive amount; use No cost instead of a zero amount. This is never spent by preview."><input className="st-control" type="number" min={0} step="any" value={cost.amount} onChange={event => update({ amount: Number(event.target.value) })} /></GuidedField>
        <Text label="Resource name" value={cost.resourceKey ?? ""} onChange={resourceKey => update({ resourceKey: resourceKey || null })} help="Required for a named Resource, for example Quintessence. The name does not create a runtime resource." />
        <Text label="Cost notes" value={cost.notes} onChange={notes => update({ notes })} help="Describe how this cost is intended to be paid and any ruling needed." />
        <button className="st-button" type="button" onClick={() => onChange({ ...value, costs: value.costs.filter((_, i) => i !== index) })}>Remove cost</button>
      </div>;
    })}<button className="st-button" type="button" onClick={() => onChange({ ...value, costs: [...value.costs, { costType: "mana", amount: 1, resourceKey: null, notes: "", sortOrder: value.costs.length }] })}>Add {title.toLowerCase()} cost</button></>}
  </fieldset>;
}
function Conditions({ title, value, onChange }: { title: string; value: DerivedAbilityUseConditionDefinition[]; onChange: (value: DerivedAbilityUseConditionDefinition[]) => void }) {
  return <fieldset className={styles.sectionBody}><legend>{title}</legend><p>Authored conditions only. Use Manual for moon phases, environment, concentration, an ability, or narrative rulings. Explain combined requirements or alternative triggers in the notes.</p>
    {value.map((condition, index) => {
      const update = (patch: Partial<typeof condition>) => onChange(value.map((row, i) => i === index ? { ...row, ...patch } : row));
      return <div className={styles.card} key={index}>
        <Select allowUnspecified={false} label="Condition type" value={condition.conditionType} options={DERIVED_ABILITY_USE_CONDITION_TYPES} onChange={conditionType => update({ conditionType: conditionType ?? "manual" })} help="Reuse shared Equipment, Event, and State definitions when they fit. Manual conditions need a written G.O.D. ruling. No Form condition is automatically evaluated." />
        {condition.conditionType !== "manual" && <GuidedField className="st-field" label="Condition fact" help="Select an existing fact or a custom key. This identifies authoring data; preview never checks the Character's live state."><AbilityFactSelector category={condition.conditionType} value={condition.conditionKey} onChange={conditionKey => update({ conditionKey })} /></GuidedField>}
        <GuidedField className="st-field" label="Comparison" help="Choose the intended comparison, or leave unspecified. Numeric and text values are retained independently; explain ambiguous comparisons in notes."><select className="st-control" value={condition.operator ?? ""} onChange={event => update({ operator: event.target.value as typeof condition.operator || null })}><option value="">Unspecified</option>{Object.entries(ABILITY_CONDITION_OPERATOR_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></GuidedField>
        <GuidedField className="st-field" label="Condition number" help="The number being compared, such as 25 for a health percentage threshold. Blank means no number."><input className="st-control" type="number" step="any" value={condition.numericValue ?? ""} onChange={event => update({ numericValue: event.target.value === "" ? null : Number(event.target.value) })} /></GuidedField>
        <Text label="Condition text" value={condition.textValue ?? ""} onChange={textValue => update({ textValue: textValue || null })} help="Text for a comparison where appropriate. Leave blank for a numeric condition." />
        <Text label="Condition notes" value={condition.notes} onChange={notes => update({ notes })} help="Describe the requirement or trigger. Required for a Manual condition; include any alternative or combined conditions." />
        <button className="st-button" type="button" onClick={() => onChange(value.filter((_, i) => i !== index))}>Remove condition</button>
      </div>;
    })}<button className="st-button" type="button" onClick={() => onChange([...value, { conditionType: "manual", conditionKey: null, operator: null, numericValue: null, textValue: null, notes: "", sortOrder: value.length }])}>Add {title.toLowerCase()}</button>
  </fieldset>;
}
export function RaceFormTransformationEditor({ value, onChange }: { value?: RaceFormTransformation | null; onChange: (value: RaceFormTransformation | null) => void }) {
  const data = value ?? emptyRaceFormTransformation();
  const patch = (change: Partial<RaceFormTransformation>) => onChange({ ...data, ...change });
  let validation = "";
  try { normalizeRaceFormTransformation(data); } catch (error) { validation = error instanceof Error ? error.message : "Check transformation fields."; }
  return <details className={styles.section}><summary>Transformation · {value ? "Authored definition" : "Unspecified"}</summary><div className={styles.sectionBody}>
    <p>How this Form is entered and exited. These definitions are authoring data only; the Character viewer does not transform, spend resources, trigger changes, or track limits.</p>
    {validation && <p className={styles.error} role="alert">{validation}</p>}
    <Select label="Entry method" value={data.entryMethod} options={FORM_ENTRY_METHODS} onChange={entryMethod => patch({ entryMethod })} help="Either allows voluntary or involuntary entry. Custom leaves control to the G.O.D. Unspecified authors no entry rule." />
    <Text label="Entry notes" value={data.entryNotes} onChange={entryNotes => patch({ entryNotes })} help="Describe who chooses entry and any exceptions." />
    <Timing title="Entry" value={data.entryTiming} onChange={entryTiming => patch({ entryTiming })} /><Costs title="Entry" value={data.entryCosts} onChange={entryCosts => patch({ entryCosts })} />
    <Conditions title="Entry requirements" value={data.requirements} onChange={requirements => patch({ requirements })} />
    <Conditions title="Involuntary triggers" value={data.involuntaryTriggers} onChange={involuntaryTriggers => patch({ involuntaryTriggers })} />
    <Select label="Form duration" value={data.duration.mode} options={FORM_DURATION_MODES} onChange={mode => patch({ duration: { ...data.duration, mode } })} help="Describe how long the Form lasts. Fixed, Condition End, and Custom require a description. No timer is started." />
    <Text label="Duration description" value={data.duration.description} onChange={description => patch({ duration: { ...data.duration, description } })} help="For example ten minutes, until sunlight returns, or the G.O.D.'s duration ruling." />
    <fieldset className={styles.sectionBody}><legend>Exit rules</legend><p>Select each authored way to leave this Form; explain their relationship below.</p>{FORM_EXIT_METHODS.map(method => <label key={method}><input type="checkbox" checked={data.exitMethods.includes(method)} onChange={event => patch({ exitMethods: event.target.checked ? [...data.exitMethods, method] : data.exitMethods.filter(value => value !== method) })} /> {transformationLabel(method)}</label>)}</fieldset>
    <Text label="Exit notes" value={data.exitNotes} onChange={exitNotes => patch({ exitNotes })} help="Describe return actions, depletion rules, ending conditions, or G.O.D. control. These rules do not execute." />
    <Timing title="Exit" value={data.exitTiming} onChange={exitTiming => patch({ exitTiming })} /><Costs title="Exit" value={data.exitCosts} onChange={exitCosts => patch({ exitCosts })} />
    <GuidedField className="st-field" label="Use limits" help="Unspecified leaves the rule open. Unlimited explicitly authors no use limit. Authored limits reuse Ability use counts and refresh scopes. Changing away from Authored limits clears the rows."><select className="st-control" value={data.limitMode} onChange={event => patch({ limitMode: event.target.value as typeof data.limitMode, useLimits: event.target.value === "limited" ? data.useLimits : [] })}><option value="unspecified">Unspecified</option><option value="unlimited">Unlimited</option><option value="limited">Authored limits</option><option value="custom">Custom / G.O.D.</option></select></GuidedField>
    {data.limitMode === "limited" && <>{data.useLimits.map((limit, index) => {
      const update = (patch: Partial<typeof limit>) => onChange({ ...data, useLimits: data.useLimits.map((row, i) => i === index ? { ...row, ...patch } : row) });
      return <div className={styles.card} key={index}>
        <GuidedField className="st-field" label="Maximum uses" help="A positive whole number before the authored refresh. One use with Scene or Encounter represents once per scene or encounter."><input className="st-control" type="number" min={1} step={1} value={limit.maximumUses} onChange={event => update({ maximumUses: Number(event.target.value) })} /></GuidedField>
        <Select allowUnspecified={false} label="Refresh scope" value={limit.refreshScope} options={DERIVED_ABILITY_REFRESH_SCOPES} onChange={refreshScope => update({ refreshScope: refreshScope ?? "manual" })} help="The existing Ability refresh vocabulary. Event and Manual refreshes should be explained. Nothing is counted or refreshed by preview." />
        <Text label="Refresh key" value={limit.refreshKey ?? ""} onChange={refreshKey => update({ refreshKey: refreshKey || null })} help="Optional named refresh event or manual reference. This does not create a runtime event." />
        <Text label="Limit notes" value={limit.notes} onChange={notes => update({ notes })} help="Explain this use limit and any refresh ruling." />
        <button className="st-button" type="button" onClick={() => patch({ useLimits: data.useLimits.filter((_, i) => i !== index) })}>Remove limit</button>
      </div>;
    })}<button className="st-button" type="button" onClick={() => patch({ useLimits: [...data.useLimits, { maximumUses: 1, refreshScope: "scene", refreshKey: null, notes: "", sortOrder: data.useLimits.length }] })}>Add use limit</button></>}
    <Text label="Cooldown / custom limit" value={data.cooldown} onChange={cooldown => patch({ cooldown })} help="Describe time between changes or a custom use-limit ruling. This is descriptive; no cooldown is enforced." />
    <Text label="Equipment entry notes" value={data.equipmentEntryNotes} onChange={equipmentEntryNotes => patch({ equipmentEntryNotes })} help="Supplement the Form's existing equipment intent with entry details. This does not drop, merge, or change equipment." />
    <Text label="Equipment exit notes" value={data.equipmentExitNotes} onChange={equipmentExitNotes => patch({ equipmentExitNotes })} help="Describe equipment on return. The existing Form equipment setting remains the single equipment intent definition." />
    <Text label="Transformation notes" value={data.notes} onChange={notes => patch({ notes })} help="Other transformation rulings for the player and G.O.D." />
    <button className="st-button" type="button" onClick={() => onChange(null)}>Clear transformation definition</button>
  </div></details>;
}

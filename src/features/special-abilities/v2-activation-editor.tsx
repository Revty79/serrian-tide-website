"use client";
import { DERIVED_ABILITY_COST_TYPES, DERIVED_ABILITY_REFRESH_SCOPES } from "@/features/derived-abilities/models";
import type { MechanicsRule } from "./models";
import type { DefinitionCost, DefinitionUseLimit, IntrinsicEffect, OutcomeBranch } from "./v2-models";
import { OUTCOME_KINDS } from "./v2-models";
import { newMechanicsKey, type MechanicsEditorReferences } from "./authoring";
import { newCost, newIntrinsicEffect, newOutcome } from "./v2-authoring";
import { AmountEditor, ChildList, DurationEditor, humanOptions, NumberField, SelectField, TextField } from "./v2-fields";
import { EFFECT_LABELS, IntrinsicEffectEditor } from "./v2-effect-editor";

export function LocalLinks({ label, value, options, onChange }: { label: string; value: string[]; options: { key: string; title: string }[]; onChange: (value: string[]) => void }) {
  return <fieldset className="mechanics-group"><legend>{label}</legend>
    <p>Choose definitions by identity. Renaming or reordering preserves links. Clear a link before removing its definition.</p>
    {options.map(option => <label className="mechanics-check" key={option.key}><input type="checkbox" checked={value.includes(option.key)} onChange={event => onChange(event.target.checked ? [...value, option.key] : value.filter(key => key !== option.key))} />{option.title || "Untitled definition"}</label>)}
    {value.filter(key => !options.some(option => option.key === key)).map(key => <div key={key} role="alert">Referenced definition was removed. Restore it or <button className="st-button" type="button" onClick={() => onChange(value.filter(item => item !== key))}>Remove Missing Link</button></div>)}
    {!options.length && !value.length && <p>No compatible local definitions yet.</p>}
  </fieldset>;
}
export function OutcomesEditor({ value, effects, onChange }: { value: OutcomeBranch[]; effects: IntrinsicEffect[]; onChange: (value: OutcomeBranch[]) => void }) {
  return <div className="mechanics-rule-fields"><p>Outcome branches describe consequences after the existing roll/result system determines the outcome. They do not define critical rules, roll dice or execute effects.</p>
    <ChildList label="Outcome branches" singular="Outcome" rows={value} onChange={onChange} create={newOutcome}>{(outcome, change) => <>
      <SelectField label="Outcome kind" value={outcome.kind} options={humanOptions(OUTCOME_KINDS)} onChange={kind => change({ ...outcome, kind })} help="Choose the result this branch describes. Manual/other outcomes require G.O.D. guidance." />
      <TextField label="Outcome description" value={outcome.description} onChange={description => change({ ...outcome, description })} help="Describe what this branch means after a result is determined." />
      <LocalLinks label="Outcome intrinsic effects" value={outcome.effectKeys} options={effects.map(({ key, effect }, i) => ({ key, title: `Effect ${i + 1}: ${effect.kind === "manual" ? effect.title : effect.kind === "condition.apply" ? effect.name : effect.kind === "modifier.apply" ? effect.label : EFFECT_LABELS[effect.kind]}` }))} onChange={effectKeys => change({ ...outcome, effectKeys })} />
      <TextField label="Outcome G.O.D. guidance" value={outcome.adjudication} onChange={adjudication => change({ ...outcome, adjudication })} help="Required for manual outcomes. Explain unresolved handling without executable formulas." />
      <TextField label="Outcome limitations" value={outcome.limitations} onChange={limitations => change({ ...outcome, limitations })} help="Optional restrictions specific to this outcome." />
      <TextField label="Outcome notes" value={outcome.notes} onChange={notes => change({ ...outcome, notes })} help="Optional reader guidance specific to this outcome." />
    </>}</ChildList>
  </div>;
}
function CostEditor({ value, onChange, rules }: { value: DefinitionCost; onChange: (value: DefinitionCost) => void; rules: MechanicsRule[] }) {
  return <>
    <SelectField label="Cost kind" value={value.kind} options={humanOptions(DERIVED_ABILITY_COST_TYPES)} onChange={kind => {
      const base = { key: value.key, amount: value.amount, notes: value.notes };
      onChange(kind === "resource" ? { ...base, kind, resource: { kind: "manual", name: "", guidance: "" } } : { ...base, kind });
    }} help="Describe the cost with shared Derived Ability vocabulary. Nothing is spent and affordability is not checked." />
    {value.kind === "resource" && <>
      <SelectField label="Resource identity" value={value.resource.kind} options={[{ value: "manual", label: "Named resource / G.O.D." }, { value: "local", label: "Resource in this document" }]} onChange={kind => onChange({ ...value, resource: kind === "local" ? { kind, resourceKey: "" } : { kind, name: "", guidance: "" } })} help="Use a stable local reference for a resource defined here. A named resource remains manual and implies no runtime pool." />
      {value.resource.kind === "local" ? <SelectField label="Local resource" value={value.resource.resourceKey} options={[
        { value: "", label: "Choose resource definition" }, ...rules.filter(rule => rule.kind === "resource").map(rule => ({ value: rule.key, label: rule.title || "Untitled resource" })),
        ...(value.resource.resourceKey && !rules.some(rule => rule.key === (value.resource.kind === "local" ? value.resource.resourceKey : "") && rule.kind === "resource") ? [{ value: value.resource.resourceKey, label: "Missing resource — choose a replacement", disabled: true }] : []),
      ]} onChange={resourceKey => onChange({ ...value, resource: { kind: "local", resourceKey } })} help="The selected resource must exist in this document. A missing link prevents saving." />
        : <><TextField label="Resource name" short value={value.resource.name} onChange={name => { if (value.resource.kind === "manual") onChange({ ...value, resource: { ...value.resource, name } }); }} help="A descriptive name only. It does not identify a Character balance." /><TextField label="Resource identity guidance" value={value.resource.guidance} onChange={guidance => { if (value.resource.kind === "manual") onChange({ ...value, resource: { ...value.resource, guidance } }); }} help="Explain how the G.O.D. identifies this resource. Required until a typed runtime identity exists." /></>}
    </>}
    <AmountEditor label="Cost" value={value.amount} onChange={amount => { if (amount.kind !== "full") onChange({ ...value, amount }); }} />
    <TextField label="Cost notes" value={value.notes} onChange={notes => onChange({ ...value, notes })} help="Describe ammunition, custom payment or other handling that remains with its owner subsystem." />
  </>;
}
export function ActivationDefinitionEditor({ rule, rules, onChange, references }: { rule: Extract<MechanicsRule, { kind: "activated" }>; rules: MechanicsRule[]; onChange: (rule: MechanicsRule) => void; references: MechanicsEditorReferences | null }) {
  return <div className="mechanics-rule-fields">
    <SelectField label="Activation type" value={rule.activationType} options={humanOptions(["activated", "reaction", "triggered"] as const)} onChange={activationType => onChange({ ...rule, activationType })} help="Describe intentional use, a reaction or a trigger. This neither creates a Derived Ability nor subscribes to events." />
    <TextField label="Trigger or event" value={rule.trigger} onChange={trigger => onChange({ ...rule, trigger })} help="Required for Reaction and Triggered definitions. Describe the event; no event handler is installed." />
    <SelectField label="Target intent" value={rule.target.kind} options={humanOptions(["self", "other", "multiple", "manual"] as const)} onChange={kind => onChange({ ...rule, target: { ...rule.target, kind } })} help="Describe who the intrinsic effect concerns. No Character, token or target is selected." />
    <TextField label="Target guidance" value={rule.target.description} onChange={description => onChange({ ...rule, target: { ...rule.target, description } })} help="Explain target intent, restrictions and G.O.D. decisions. Required for Manual target intent." />
    <SelectField label="Duration definition" value={rule.duration ? "defined" : "unspecified"} options={humanOptions(["unspecified", "defined"] as const)} onChange={kind => onChange({ ...rule, duration: kind === "defined" ? { kind: "until-removed" } : null })} help="Optionally describe duration with the shared vocabulary. Leaving this unspecified does not imply an instantaneous duration." />
    {rule.duration && <DurationEditor value={rule.duration} onChange={duration => onChange({ ...rule, duration })} />}
    <ChildList label="Costs" singular="Cost" rows={rule.costs} onChange={costs => onChange({ ...rule, costs })} create={newCost}>{(cost, change) => <CostEditor value={cost} onChange={change} rules={rules} />}</ChildList>
    <ChildList<DefinitionUseLimit> label="Use limits" singular="Use Limit" rows={rule.useLimits} onChange={useLimits => onChange({ ...rule, useLimits })} create={() => ({ key: newMechanicsKey(), maximumUses: 0, refreshScope: "manual", event: "", notes: "" })}>{(limit, change) => <>
      <NumberField label="Maximum uses" value={limit.maximumUses} min={1} whole onChange={maximumUses => change({ ...limit, maximumUses })} help="Define a positive whole-number limit. No usage counter or history is created." />
      <SelectField label="Use refresh scope" value={limit.refreshScope} options={humanOptions(DERIVED_ABILITY_REFRESH_SCOPES)} onChange={refreshScope => change({ ...limit, refreshScope })} help="Uses existing refresh vocabulary; no recharge runs." />
      <TextField label="Use refresh event" value={limit.event} onChange={event => change({ ...limit, event })} help="Required for Event refresh. Explain the event without subscribing to it." />
      <TextField label="Use limit notes" value={limit.notes} onChange={notes => change({ ...limit, notes })} help="Optional guidance for G.O.D. handling of this use limit." />
    </>}</ChildList>
    <LocalLinks label="Required choice definitions" value={rule.choiceKeys} options={rules.filter(rule => rule.kind === "choice")} onChange={choiceKeys => onChange({ ...rule, choiceKeys })} />
    <ChildList label="Intrinsic effects" singular="Intrinsic Effect" rows={rule.effects} onChange={effects => onChange({ ...rule, effects })} create={newIntrinsicEffect}>{(row, change) => <IntrinsicEffectEditor value={row.effect} references={references} onChange={effect => change({ ...row, effect })} />}</ChildList>
    <OutcomesEditor value={rule.outcomes} effects={rule.effects} onChange={outcomes => onChange({ ...rule, outcomes })} />
  </div>;
}

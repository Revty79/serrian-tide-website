"use client";
import { DERIVED_ABILITY_REFRESH_SCOPES } from "@/features/derived-abilities/models";
import { MODIFIER_ATTRIBUTE_KEYS } from "@/features/mechanical-effects/models";
import type { MechanicsRule } from "./models";
import { OVERRIDE_SUBSYSTEMS, type ChoiceDefinition, type ResourceChange, type ResourceRecovery } from "./v2-models";
import { newMechanicsKey, type MechanicsEditorReferences } from "./authoring";
import { RULE_FAMILY_HELP, manualAmount } from "./v2-authoring";
import { AmountEditor, ChildList, humanOptions, NumberField, SelectField, TextField } from "./v2-fields";
import { ModifierDefinitionEditor } from "./v2-effect-editor";
import { InteractionDefinitionEditor } from "./v2-interaction-editor";
import { ActivationDefinitionEditor, OutcomesEditor } from "./v2-activation-editor";
import { MechanicsConditionsEditor } from "./mechanics-conditions-editor";
import { MechanicsReferencePicker } from "./mechanics-reference-picker";

function ChoiceCandidates({ value, onChange, references }: { value: ChoiceDefinition; onChange: (value: ChoiceDefinition) => void; references: MechanicsEditorReferences | null }) {
  return <div className="mechanics-rule-fields">
    <SelectField label="Choice type" value={value.kind} options={humanOptions(["attribute", "skill", "derived-ability", "manual"] as const)} help="Select only identities protected by this authoring system. Items, Forms, spells and other choices remain Manual/G.O.D."
      onChange={kind => onChange(kind === "attribute" ? { kind, attributeKeys: [] } : kind === "skill" ? { kind, skillIds: [] } : kind === "derived-ability" ? { kind, derivedAbilityIds: [] } : { kind, guidance: "" })} />
    {value.kind === "attribute" && <fieldset className="mechanics-group"><legend>Allowed Attributes</legend><p>Choose candidates the owner may later select. No Character selection is stored here.</p>{MODIFIER_ATTRIBUTE_KEYS.map(key => <label className="mechanics-check" key={key}><input type="checkbox" checked={value.attributeKeys.includes(key)} onChange={event => onChange({ ...value, attributeKeys: event.target.checked ? [...value.attributeKeys, key] : value.attributeKeys.filter(item => item !== key) })} />{key}</label>)}</fieldset>}
    {value.kind === "manual" && <TextField label="Choice G.O.D. guidance" value={value.guidance} onChange={guidance => onChange({ ...value, guidance })} help="Describe what may be chosen and how the G.O.D. determines valid candidates. Do not enter an individual Character's choice." />}
    {(value.kind === "skill" || value.kind === "derived-ability") && (() => {
      const ids = value.kind === "skill" ? value.skillIds : value.derivedAbilityIds;
      const write = (next: number[]) => onChange(value.kind === "skill" ? { ...value, skillIds: next } : { ...value, derivedAbilityIds: next });
      return <fieldset className="mechanics-group"><legend>Allowed definitions</legend><p>List exact allowed candidates. Links do not grant or execute these definitions.</p>
        {ids.map((id, index) => <div className="mechanics-condition" key={index}>
          <MechanicsReferencePicker kind={value.kind} value={value.kind === "skill" ? { kind: value.kind, skillId: id } : { kind: value.kind, derivedAbilityId: id }} references={references} onChange={ref => write(ids.map((item, at) => at === index ? ref.kind === "skill" ? ref.skillId : ref.derivedAbilityId : item))} />
          <button type="button" className="st-button is-danger" onClick={() => write(ids.filter((_, at) => at !== index))}>Remove Candidate</button>
        </div>)}
        <button type="button" className="st-button" disabled={ids.length >= 50} onClick={() => write([...ids, 0])}>Add Candidate</button>
      </fieldset>;
    })()}
  </div>;
}
export function V2RuleEditor({ rule, rules, onChange, references }: { rule: MechanicsRule; rules: MechanicsRule[]; onChange: (rule: MechanicsRule) => void; references: MechanicsEditorReferences | null }) {
  if (rule.kind === "capability" || rule.kind === "manual") return null;
  return <section className="mechanics-rule-fields" aria-label={`${rule.kind} definition`}>
    <p className="mechanics-notice">{RULE_FAMILY_HELP[rule.kind]}</p>
    {rule.kind === "resource" && <>
      <TextField label="Resource unit" short value={rule.unit} onChange={unit => onChange({ ...rule, unit })} help="Optional unit or label, such as charges. The Rule Title names the resource and its stable identity is preserved when renamed." />
      <SelectField label="Resource grant definition" value={rule.grantsResource ? "grants" : "definition"} options={[{ value: "definition", label: "Definition only" }, { value: "grants", label: "Describes granting this resource" }]} onChange={value => onChange({ ...rule, grantsResource: value === "grants" })} help="State whether the ability is intended to grant this resource. Saving creates no Character pool or current amount." />
      <AmountEditor label="Maximum" value={rule.maximum} onChange={maximum => { if (maximum.kind !== "full") onChange({ ...rule, maximum }); }} />
      <ChildList<ResourceChange> label="Maximum changes" singular="Maximum Change" rows={rule.maximumChanges} onChange={maximumChanges => onChange({ ...rule, maximumChanges })} create={() => ({ key: newMechanicsKey(), when: { mode: "requirements", groups: [] }, amount: manualAmount(), notes: "" })}>{(change, write) => <>
        <AmountEditor label="Maximum contribution" value={change.amount} signed onChange={amount => { if (amount.kind !== "full") write({ ...change, amount }); }} />
        <MechanicsConditionsEditor when={change.when} references={references} onChange={when => write({ ...change, when })} />
        <TextField label="Maximum change notes" value={change.notes} onChange={notes => write({ ...change, notes })} help="Explain unresolved handling. This definition does not establish stacking, rounding or current-balance rules." />
      </>}</ChildList>
      <ChildList<ResourceRecovery> label="Recovery definitions" singular="Recovery" rows={rule.recovery} onChange={recovery => onChange({ ...rule, recovery })} create={() => ({ key: newMechanicsKey(), scope: "manual", event: "", amount: manualAmount(), notes: "" })}>{(recovery, write) => <>
        <SelectField label="Recovery scope" value={recovery.scope} options={humanOptions(DERIVED_ABILITY_REFRESH_SCOPES)} onChange={scope => write({ ...recovery, scope })} help="Use shared refresh vocabulary to describe recovery. No pool is refilled and no event is subscribed to." />
        <TextField label="Recovery event" value={recovery.event} onChange={event => write({ ...recovery, event })} help="Required for Event recovery. Describe the event without inventing timing or execution." />
        <AmountEditor label="Recovery" value={recovery.amount} allowFull onChange={amount => write({ ...recovery, amount })} />
        <TextField label="Recovery notes" value={recovery.notes} onChange={notes => write({ ...recovery, notes })} help="Optional G.O.D. handling and refill restrictions." />
      </>}</ChildList>
    </>}
    {rule.kind === "modifier" && <ModifierDefinitionEditor value={rule.effect} references={references} onChange={effect => onChange({ ...rule, effect })} />}
    {rule.kind === "interaction" && <InteractionDefinitionEditor value={rule.interaction} onChange={interaction => onChange({ ...rule, interaction })} />}
    {(rule.kind === "modifier" || rule.kind === "interaction") && <TextField label="Unresolved behavior / G.O.D." value={rule.adjudication} onChange={adjudication => onChange({ ...rule, adjudication })} help="Optional guidance on behavior that requires G.O.D. determination. Shared subsystem rules remain authoritative, and this definition does not execute." />}
    {rule.kind === "activated" && <ActivationDefinitionEditor rule={rule} rules={rules} references={references} onChange={onChange} />}
    {rule.kind === "override" && <>
      <SelectField label="Override subsystem for review" value={rule.override.subsystem} options={humanOptions(OVERRIDE_SUBSYSTEMS)} onChange={subsystem => onChange({ ...rule, override: { ...rule.override, subsystem } })} help="Organizes a Manual/G.O.D. proposal. There are no safe registered definition-level override slots; choosing a subsystem grants no override authority." />
      <TextField label="Proposed rule exception" value={rule.override.proposedChange} onChange={proposedChange => onChange({ ...rule, override: { ...rule.override, proposedChange } })} help="Describe the requested intrinsic exception for G.O.D. handling. Do not copy the target subsystem's mechanics." />
      <TextField label="Conflict and precedence guidance" value={rule.override.conflictGuidance} onChange={conflictGuidance => onChange({ ...rule, override: { ...rule.override, conflictGuidance } })} help="Explain what the G.O.D. must determine when rules conflict. This does not set runtime precedence." />
      <OutcomesEditor value={rule.outcomes} effects={[]} onChange={outcomes => onChange({ ...rule, outcomes })} />
    </>}
    {rule.kind === "choice" && <>
      <ChoiceCandidates value={rule.selection} onChange={selection => onChange({ ...rule, selection })} references={references} />
      <NumberField label="Minimum selections" value={rule.minimum} min={1} whole onChange={minimum => onChange({ ...rule, minimum })} help="Positive whole-number minimum the future owner must select. No binding is made now." />
      <NumberField label="Maximum selections" value={rule.maximum} min={rule.minimum} whole onChange={maximum => onChange({ ...rule, maximum })} help="At least the minimum, no more than the available candidates or the authoring limit of 50." />
      <SelectField label="Reselection policy" value={rule.reselection} options={[{ value: "never", label: "Reselection not permitted" }, { value: "god-approval", label: "Requires G.O.D. approval" }, { value: "allowed", label: "Reselection permitted" }]} onChange={reselection => onChange({ ...rule, reselection })} help="Describe the intended policy. No Character selection or re-selection workflow is created here." />
      <TextField label="Choice restrictions" value={rule.restrictions} onChange={restrictions => onChange({ ...rule, restrictions })} help="Optional restrictions and manual handling for the candidate selection." />
    </>}
  </section>;
}

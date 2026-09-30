"use client";
import { MODIFIER_ATTRIBUTE_KEYS, TEMPORARY_MODIFIER_CHANNELS, type MechanicalEffect, type ModifierApplyEffect } from "@/features/mechanical-effects/models";
import type { MechanicsEditorReferences } from "./authoring";
import { DurationEditor, humanOptions, NumberField, SelectField, TextField } from "./v2-fields";
import { MechanicsReferencePicker } from "./mechanics-reference-picker";
export const EFFECT_LABELS = { "health.damage": "Health damage", "health.heal": "Health healing", "condition.apply": "Condition", "modifier.apply": "Modifier", manual: "Manual / G.O.D." } as const;
export function ModifierDefinitionEditor({ value, onChange, references }: { value: ModifierApplyEffect; onChange: (effect: ModifierApplyEffect) => void; references: MechanicsEditorReferences | null }) {
  return <div className="mechanics-rule-fields">
    <TextField label="Modifier label" short value={value.label} onChange={label => onChange({ ...value, label })} help="Name the intrinsic contribution. A Form's body changes remain on the Form." />
    <SelectField label="Modifier channel" value={value.channel} options={humanOptions(TEMPORARY_MODIFIER_CHANNELS)} help="Shared modifier channels only. This defines an additive contribution; it does not replace Form movement, anatomy, Size or protection."
      onChange={channel => onChange({ ...value, channel, targetKey: channel === "skill" ? "skill:0" : channel === "movement" ? "movement:" : channel === "attribute" ? "" : "self" })} />
    {value.channel === "attribute" && <SelectField label="Target Attribute" value={value.targetKey} options={[{ value: "", label: "Choose Attribute" }, ...humanOptions(MODIFIER_ATTRIBUTE_KEYS)]} onChange={targetKey => onChange({ ...value, targetKey })} help="Select the exact shared Attribute key. This is an intrinsic contribution, not a Form Attribute replacement." />}
    {value.channel === "skill" && <MechanicsReferencePicker kind="skill" value={{ kind: "skill", skillId: Number(value.targetKey.slice(6)) || 0 }} references={references} onChange={ref => { if (ref.kind === "skill") onChange({ ...value, targetKey: `skill:${ref.skillId}` }); }} />}
    {value.channel === "movement" && <TextField label="Movement mode" short value={value.targetKey.startsWith("movement:") ? value.targetKey.slice(9) : ""} onChange={mode => onChange({ ...value, targetKey: `movement:${mode}` })} help="Name the movement mode matched by the shared modifier vocabulary. This neither creates a mode nor replaces a Form's movement configuration." />}
    <NumberField label="Modifier amount" value={value.amount} onChange={amount => onChange({ ...value, amount })} whole help="Enter a nonzero signed whole-number contribution. Stacking and rounding remain with the target subsystem; nothing is applied here." />
    <DurationEditor value={value.duration} onChange={duration => onChange({ ...value, duration })} />
  </div>;
}
export function IntrinsicEffectEditor({ value, onChange, references }: { value: MechanicalEffect; onChange: (effect: MechanicalEffect) => void; references: MechanicsEditorReferences | null }) {
  function choose(kind: MechanicalEffect["kind"]) {
    if (kind === "manual") onChange({ kind, title: "", description: "" });
    if (kind === "health.damage") onChange({ kind, amount: 0, application: "localized" });
    if (kind === "health.heal") onChange({ kind, amount: 0, scope: "full-body" });
    if (kind === "condition.apply") onChange({ kind, name: "", description: "", duration: { kind: "until-removed" } });
    if (kind === "modifier.apply") onChange({ kind, label: "", channel: "attribute", targetKey: "", amount: 0, duration: { kind: "until-removed" } });
  }
  return <div className="mechanics-rule-fields">
    <SelectField label="Intrinsic effect type" value={value.kind} options={Object.entries(EFFECT_LABELS).map(([kind, label]) => ({ value: kind as MechanicalEffect["kind"], label }))} onChange={choose} help="Use an effect genuinely owned by this Special Ability. Existing attacks, spells and Item effects stay with their owners. This definition does not execute." />
    {value.kind === "manual" && <><TextField label="Effect title" value={value.title} short onChange={title => onChange({ ...value, title })} help="Name the intrinsic effect for G.O.D. handling." /><TextField label="Effect description" value={value.description} onChange={description => onChange({ ...value, description })} help="Describe the effect; this text is never executed." /></>}
    {value.kind === "modifier.apply" && <ModifierDefinitionEditor value={value} references={references} onChange={onChange} />}
    {value.kind === "condition.apply" && <><TextField label="Condition name" short value={value.name} onChange={name => onChange({ ...value, name })} help="Name the Condition as used by the shared effect vocabulary." /><TextField label="Condition description" value={value.description} onChange={description => onChange({ ...value, description })} help="Describe this Condition. No Character Condition is applied." /><DurationEditor value={value.duration} onChange={duration => onChange({ ...value, duration })} /></>}
    {(value.kind === "health.damage" || value.kind === "health.heal") && <>
      <NumberField label="Health effect amount" value={value.amount} onChange={amount => onChange({ ...value, amount })} min={0} help="Author a fixed positive amount intrinsic to the ability. Do not copy an existing attack or spell's damage or healing." />
      {value.kind === "health.damage" ? <SelectField label="Damage application" value={value.application} options={humanOptions(["localized", "area", "full-body"] as const)} onChange={application => onChange({ ...value, application })} help="Uses the shared health damage application vocabulary. No target or hit location is selected now." />
        : <SelectField label="Healing scope" value={value.scope} options={humanOptions(["full-body", "area"] as const)} onChange={scope => onChange({ ...value, scope })} help="Uses shared healing scope; no healing is performed." />}
      <SelectField label="Health effect timing" value={value.timing?.mode ?? "immediate"} options={humanOptions(["immediate", "over-time"] as const)} onChange={mode => onChange({ ...value, timing: mode === "immediate" ? { mode } : { mode, frequency: "combat-rounds", applications: 0, firstApplication: "next-interval" } })} help="Describe immediate or repeated application using existing health timing semantics; no ticking state is created." />
      {value.timing?.mode === "over-time" && <>
        <SelectField label="Effect frequency" value={value.timing.frequency!} options={humanOptions(["combat-steps", "combat-rounds"] as const)} onChange={frequency => onChange({ ...value, timing: { ...value.timing!, frequency } })} help="Existing combat units only." />
        <NumberField label="Effect applications" value={value.timing.applications ?? 0} onChange={applications => onChange({ ...value, timing: { ...value.timing!, applications } })} min={1} whole help="Enter the authored number of applications. No applications are scheduled." />
        <SelectField label="First application" value={value.timing.firstApplication!} options={humanOptions(["immediate", "next-interval"] as const)} onChange={firstApplication => onChange({ ...value, timing: { ...value.timing!, firstApplication } })} help="Describe when the first application would occur; this does not execute it." />
      </>}
    </>}
  </div>;
}

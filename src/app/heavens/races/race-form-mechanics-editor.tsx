"use client";

import type { ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
import { RACE_SIZE_OPTIONS } from "@/db/race-schema";
import { CHARACTER_ATTRIBUTE_KEYS, CHARACTER_ATTRIBUTE_LABELS } from "@/features/characters/models";
import { emptyRaceFormMechanics, FORM_EQUIPMENT, FORM_MANIPULATION, FORM_SPEECH, normalizeRaceFormMechanics, type RaceFormMechanics } from "@/features/races/race-form-mechanics";
import { raceHitLocations } from "@/features/races/race-anatomy";
import { InteractionRulesEditor } from "../interaction-rules-editor";
import { RaceAnatomyEditor } from "./race-anatomy-editor";
import { RaceNaturalProtectionEditor } from "./race-natural-protection-editor";
import { RaceNaturalAttacksEditor } from "./race-natural-attacks-editor";
import { RaceMovementEditor } from "./race-movement-editor";
import { RaceSkillLinksEditor } from "./race-skill-links-editor";
import type { RaceDraft } from "./actions";
import styles from "./race-forms-editor.module.css";

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <GuidedField className="st-field" label={label} help={help}>{children}</GuidedField>;
}
function Source({ label, value, onChange, options = { race: "Use Race definition", override: "Override for this Form" }, help }: {
  label: string; value: string; onChange: (value: string) => void; options?: Record<string, string>; help: string;
}) {
  return <Field label={label} help={help}><select className="st-control" value={value} onChange={event => onChange(event.target.value)}>{Object.entries(options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>;
}
function Section({ title, status, children }: { title: string; status: string; children: ReactNode }) {
  return <details className={styles.section}><summary>{title} · {status}</summary><div className={styles.sectionBody}>{children}</div></details>;
}

export function RaceFormMechanicsEditor({ value, race, onChange }: { value?: RaceFormMechanics; race: RaceDraft; onChange: (value: RaceFormMechanics) => void }) {
  const mechanics = value ?? emptyRaceFormMechanics();
  const patch = (change: Partial<RaceFormMechanics>) => onChange({ ...mechanics, ...change });
  const anatomy = mechanics.anatomyMode === "override" ? mechanics.anatomy : race.core.anatomy ?? null;
  const status = (mode: string) => mode === "race" ? "Using Race definition" : mode === "add" ? "Form additions" : "Overridden for this Form";
  const replacementHelp = "Use the Race collection unchanged, or define the complete collection for this Form. An empty override means none. Choosing Use Race clears this Form's saved override for this section.";
  let validation = "";
  try { normalizeRaceFormMechanics(mechanics, { anatomy: race.core.anatomy ?? null, naturalAttacks: race.naturalAttacks ?? [], naturalProtections: race.naturalProtections ?? [] }); }
  catch (error) { validation = error instanceof Error ? error.message : "Check Form mechanics."; }
  const adjustments = CHARACTER_ATTRIBUTE_KEYS.filter(key => mechanics.attributeAdjustments[key] !== 0).map(key => `${key} ${mechanics.attributeAdjustments[key] > 0 ? "+" : ""}${mechanics.attributeAdjustments[key]}`).join(", ");
  return <div className={styles.mechanics}>
    {validation && <p role="alert" className={styles.error}>{validation}</p>}
    <Section title="Body" status={`${mechanics.size ?? "Use Race Size"}; ${status(mechanics.anatomyMode)}`}>
      <Field label="Form Size" help="Use the Race Size unchanged, or author one of the existing Race sizes for this Form. This does not apply Creature size scaling."><select className="st-control" value={mechanics.size ?? ""} onChange={event => patch({ size: event.target.value ? event.target.value as RaceFormMechanics["size"] : null })}><option value="">Use Race Size</option>{RACE_SIZE_OPTIONS.map(size => <option key={size}>{size}</option>)}</select></Field>
      <Source label="Form Anatomy source" value={mechanics.anatomyMode} help="Use Race Anatomy unchanged, or edit an independent Form body using the shared Anatomy model. Choosing Use Race clears the Form body override." onChange={mode => patch({ anatomyMode: mode as RaceFormMechanics["anatomyMode"], anatomy: mode === "race" ? null : structuredClone(race.core.anatomy ?? null) })} />
      {mechanics.anatomyMode === "override" && <RaceAnatomyEditor authoringOnly value={mechanics.anatomy} onChange={anatomy => patch({ anatomy })} />}
    </Section>
    <Section title="Attributes" status={adjustments || "No changes"}>
      <p>Author signed changes to the six Attribute scores. Zero means no change. These values are stored only; Character Attributes and Race Caps remain unchanged.</p>
      <div className={styles.attributeGrid}>{CHARACTER_ATTRIBUTE_KEYS.map(key => <Field key={key} label={`${CHARACTER_ATTRIBUTE_LABELS[key]} adjustment`} help={`Enter the authored change to ${CHARACTER_ATTRIBUTE_LABELS[key]}, such as +5 or -5. Zero or blank means no change. This is an Attribute score adjustment, not a roll modifier.`}><input className="st-control" type="number" step="any" value={mechanics.attributeAdjustments[key]} onChange={event => patch({ attributeAdjustments: { ...mechanics.attributeAdjustments, [key]: event.target.value === "" ? 0 : Number(event.target.value) } })} /></Field>)}</div>
    </Section>
    <Section title="Movement" status={status(mechanics.movementMode)}>
      <Source label="Form Movement source" value={mechanics.movementMode} help={replacementHelp} onChange={mode => patch({ movementMode: mode as RaceFormMechanics["movementMode"], movement: mode === "race" ? [] : mechanics.movement })} />
      {mechanics.movementMode === "override" && <RaceMovementEditor value={mechanics.movement} onChange={movement => patch({ movement: movement.map(row => ({ ...row, key: row.key! })) })} />}
    </Section>
    <Section title="Protection" status={status(mechanics.protectionMode)}>
      <Source label="Form Natural Protection source" value={mechanics.protectionMode} help={replacementHelp} onChange={mode => patch({ protectionMode: mode as RaceFormMechanics["protectionMode"], protections: mode === "race" ? [] : mechanics.protections })} />
      {mechanics.protectionMode === "override" && <RaceNaturalProtectionEditor authoringOnly value={mechanics.protections} locations={raceHitLocations(anatomy)} onChange={protections => patch({ protections })} />}
    </Section>
    <Section title="Natural Attacks" status={status(mechanics.attacksMode)}>
      <Source label="Form Natural Attacks source" value={mechanics.attacksMode} help={replacementHelp} onChange={mode => patch({ attacksMode: mode as RaceFormMechanics["attacksMode"], attacks: mode === "race" ? [] : mechanics.attacks })} />
      {mechanics.attacksMode === "override" && <RaceNaturalAttacksEditor owner="form" value={mechanics.attacks} anatomy={anatomy} skillOptions={[...race.skillLinks, ...mechanics.skillLinks].map(row => ({ id: row.skillId, name: row.skillName }))} onChange={attacks => patch({ attacks })} />}
    </Section>
    <Section title="Skills / Abilities" status={status(mechanics.skillsMode)}>
      <Source label="Form Skills source" value={mechanics.skillsMode} options={{ race: "Use Race Skills / Abilities", add: "Add Form Skills / Abilities" }} help="Add Form-specific Skill links or inherent Special Abilities alongside Race grants. This does not suppress or replace learned Character Skills. Choosing Use Race removes the Form additions." onChange={mode => patch({ skillsMode: mode as RaceFormMechanics["skillsMode"], skillLinks: mode === "race" ? [] : mechanics.skillLinks })} />
      {mechanics.skillsMode === "add" && <RaceSkillLinksEditor authoringOnly draft={{ skillLinks: mechanics.skillLinks }} onChange={({ skillLinks }) => patch({ skillLinks })} />}
    </Section>
    <Section title="Interaction Rules" status={status(mechanics.interactionMode)}>
      <Source label="Form Interaction Rules source" value={mechanics.interactionMode} options={{ race: "Use Race Interaction Rules", add: "Add Form Interaction Rules", replace: "Override Race Interaction Rules" }} help="Use Race rules, add Form rules after the Race rules, or replace the Race rule collection for this Form. An empty override means no rules. Additions keep each source identity; they do not introduce new stacking rules. Choosing Use Race clears this Form's rules. No Form rules execute yet." onChange={mode => patch({ interactionMode: mode as RaceFormMechanics["interactionMode"], interactionRules: mode === "race" ? null : mechanics.interactionRules ?? { schemaVersion: 1, rules: [] } })} />
      {mechanics.interactionMode !== "race" && <InteractionRulesEditor authoringOnly owner="race" value={mechanics.interactionRules} onChange={interactionRules => patch({ interactionRules })} />}
    </Section>
    <Section title="Physical capabilities / equipment" status={[mechanics.manipulation.state, mechanics.speech.state, mechanics.equipment.state].every(state => state === "race") && !mechanics.restrictions.length ? "Unchanged" : "Form-specific intent"}>
      <p>These choices describe the intended Form. They do not change speech, spellcasting, equipment access or inventory now.</p>
      {([ ["manipulation", "Manipulation", FORM_MANIPULATION], ["speech", "Speech", FORM_SPEECH], ["equipment", "Equipment interaction", FORM_EQUIPMENT] ] as const).map(([key, label, options]) => <div key={key} className={styles.capability}>
        <Source label={label} value={mechanics[key].state} options={options} help={`Choose the authored ${label.toLowerCase()} state. Use unchanged when this Form adds no rule. Explain unusual cases in Notes. These choices are authoring data only.`} onChange={state => patch({ [key]: { ...mechanics[key], state } })} />
        <Field label={`${label} Notes`} help="Explain limitations or unusual cases. Notes are reference text and do not execute rules."><textarea className="st-control" rows={2} value={mechanics[key].notes} onChange={event => patch({ [key]: { ...mechanics[key], notes: event.target.value } })} /></Field>
      </div>)}
      <h4>Other physical restrictions</h4>
      {mechanics.restrictions.map((restriction, index) => <div className={styles.capability} key={restriction.key}>
        <Field label="Restriction Name" help="Name another physical restriction that does not fit the sections above. This identifies authoring intent only."><input className="st-control" value={restriction.name} onChange={event => patch({ restrictions: mechanics.restrictions.map((row, i) => i === index ? { ...row, name: event.target.value } : row) })} /></Field>
        <Field label="Restriction Notes" help="Describe the limitation and any exceptions without assuming automated consequences."><textarea className="st-control" rows={2} value={restriction.notes} onChange={event => patch({ restrictions: mechanics.restrictions.map((row, i) => i === index ? { ...row, notes: event.target.value } : row) })} /></Field>
        <button className="st-button is-danger" type="button" onClick={() => patch({ restrictions: mechanics.restrictions.filter((_, i) => i !== index) })}>Remove Restriction</button>
      </div>)}
      <button className="st-button" type="button" onClick={() => patch({ restrictions: [...mechanics.restrictions, { key: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join(""), name: "", notes: "" }] })}>Add Restriction</button>
    </Section>
  </div>;
}

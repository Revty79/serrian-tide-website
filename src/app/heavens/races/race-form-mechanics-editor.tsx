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
import styles from "@/components/forms/forms.module.css";

function Field({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return <GuidedField className="st-field" label={label} help={help}>{children}</GuidedField>;
}
function Source({ label, value, onChange, options, help }: {
  label: string; value: string; onChange: (value: string) => void; options?: Record<string, string>; help: string;
}) {
  const subject = label.replace(" in this Form", "").toLowerCase();
  const choices = options ?? { race: `Use the Race's normal ${subject}`, override: `Define different ${subject} for this Form` };
  return <Field label={label} help={help}><select className="st-control" value={value} onChange={event => onChange(event.target.value)}>{Object.entries(choices).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>;
}
function Section({ title, status, children }: { title: string; status: string; children: ReactNode }) {
  return <details className={styles.section}><summary>{title} · {status}</summary><div className={styles.sectionBody}>{children}</div></details>;
}

export function RaceFormMechanicsEditor({ value, race, onChange }: { value?: RaceFormMechanics; race: RaceDraft; onChange: (value: RaceFormMechanics) => void }) {
  const mechanics = value ?? emptyRaceFormMechanics();
  const patch = (change: Partial<RaceFormMechanics>) => onChange({ ...mechanics, ...change });
  const anatomy = mechanics.anatomyMode === "override" ? mechanics.anatomy : race.core.anatomy ?? null;
  const status = (mode: string) => mode === "race" ? "Same as the normal Race" : mode === "add" ? "Extra choices in this Form" : "Different in this Form";
  const replacementHelp = "Keep the Race's normal choices, or write the whole list for this Form. A different list with no entries means this Form has none. Returning to the Race's choices clears the Form's list.";
  let validation = "";
  try { normalizeRaceFormMechanics(mechanics, { anatomy: race.core.anatomy ?? null, naturalAttacks: race.naturalAttacks ?? [], naturalProtections: race.naturalProtections ?? [] }); }
  catch (error) { validation = error instanceof Error ? error.message : "Check Form mechanics."; }
  const adjustments = CHARACTER_ATTRIBUTE_KEYS.filter(key => mechanics.attributeAdjustments[key] !== 0).map(key => `${key} ${mechanics.attributeAdjustments[key] > 0 ? "+" : ""}${mechanics.attributeAdjustments[key]}`).join(", ");
  return <div className={styles.mechanics}>
    {validation && <p role="alert" className={styles.error}>{validation}</p>}
    <Section title="Body" status={`${mechanics.size ?? "Use Race Size"}; ${status(mechanics.anatomyMode)}`}>
      <Field label="Form Size" help="Use the Race Size unchanged, or author one of the existing Race sizes for this Form. This does not apply Creature size scaling."><select className="st-control" value={mechanics.size ?? ""} onChange={event => patch({ size: event.target.value ? event.target.value as RaceFormMechanics["size"] : null })}><option value="">Use Race Size</option>{RACE_SIZE_OPTIONS.map(size => <option key={size}>{size}</option>)}</select></Field>
      <Source label="Body and hit locations in this Form" value={mechanics.anatomyMode} help="Keep the normal Race body, or describe a different body for this Form. Returning to the Race body clears these Form changes." onChange={mode => patch({ anatomyMode: mode as RaceFormMechanics["anatomyMode"], anatomy: mode === "race" ? null : structuredClone(race.core.anatomy ?? null) })} />
      {mechanics.anatomyMode === "override" && <RaceAnatomyEditor authoringOnly value={mechanics.anatomy} onChange={anatomy => patch({ anatomy })} />}
    </Section>
    <Section title="Attributes" status={adjustments || "No changes"}>
      <p>Enter how much each score changes from the Character&apos;s normal score, such as +5 or -5. Zero means no change. These are not replacement scores or Race Caps; actual Character scores stay unchanged.</p>
      <div className={styles.attributeGrid}>{CHARACTER_ATTRIBUTE_KEYS.map(key => <Field key={key} label={`${CHARACTER_ATTRIBUTE_LABELS[key]} change while in this Form`} help={`Enter the authored change to ${CHARACTER_ATTRIBUTE_LABELS[key]}, such as +5 or -5. Zero or blank means no change. This is an Attribute score adjustment, not a roll modifier.`}><input className="st-control" type="number" step="any" value={mechanics.attributeAdjustments[key]} onChange={event => patch({ attributeAdjustments: { ...mechanics.attributeAdjustments, [key]: event.target.value === "" ? 0 : Number(event.target.value) } })} /></Field>)}</div>
    </Section>
    <Section title="Movement" status={status(mechanics.movementMode)}>
      <Source label="Movement in this Form" value={mechanics.movementMode} help={replacementHelp} onChange={mode => patch({ movementMode: mode as RaceFormMechanics["movementMode"], movement: mode === "race" ? [] : mechanics.movement })} />
      {mechanics.movementMode === "override" && <RaceMovementEditor value={mechanics.movement} onChange={movement => patch({ movement: movement.map(row => ({ ...row, key: row.key! })) })} />}
    </Section>
    <Section title="Protection" status={status(mechanics.protectionMode)}>
      <Source label="Natural Protection in this Form" value={mechanics.protectionMode} help={replacementHelp} onChange={mode => patch({ protectionMode: mode as RaceFormMechanics["protectionMode"], protections: mode === "race" ? [] : mechanics.protections })} />
      {mechanics.protectionMode === "override" && <RaceNaturalProtectionEditor authoringOnly value={mechanics.protections} locations={raceHitLocations(anatomy)} onChange={protections => patch({ protections })} />}
    </Section>
    <Section title="Natural Attacks" status={status(mechanics.attacksMode)}>
      <Source label="Natural Attacks in this Form" value={mechanics.attacksMode} help={replacementHelp} onChange={mode => patch({ attacksMode: mode as RaceFormMechanics["attacksMode"], attacks: mode === "race" ? [] : mechanics.attacks })} />
      {mechanics.attacksMode === "override" && <RaceNaturalAttacksEditor owner="form" value={mechanics.attacks} anatomy={anatomy} skillOptions={[...race.skillLinks, ...mechanics.skillLinks].map(row => ({ id: row.skillId, name: row.skillName }))} onChange={attacks => patch({ attacks })} />}
    </Section>
    <Section title="Skills / Abilities" status={status(mechanics.skillsMode)}>
      <Source label="Skills and Abilities in this Form" value={mechanics.skillsMode} options={{ race: "Use the Race's normal Skills and Abilities", add: "Keep the normal Skills and Abilities and add more" }} help="Keep everything the Race grants and add Skills or Special Abilities for this Form. Learned Character Skills remain. Returning to the Race's choices removes these additions." onChange={mode => patch({ skillsMode: mode as RaceFormMechanics["skillsMode"], skillLinks: mode === "race" ? [] : mechanics.skillLinks })} />
      {mechanics.skillsMode === "add" && <RaceSkillLinksEditor authoringOnly draft={{ skillLinks: mechanics.skillLinks }} onChange={({ skillLinks }) => patch({ skillLinks })} />}
    </Section>
    <Section title="Interaction Rules" status={status(mechanics.interactionMode)}>
      <Source label="Interaction Rules in this Form" value={mechanics.interactionMode} options={{ race: "Use the Race's normal rules", add: "Keep the normal rules and add more", replace: "Use only these rules while in this Form" }} help="Keep the Race's normal rules, add more after them, or use only the rules below. An empty Form-only list means no rules. Returning to the normal rules clears this list. Preview lists these rules without applying them." onChange={mode => patch({ interactionMode: mode as RaceFormMechanics["interactionMode"], interactionRules: mode === "race" ? null : mechanics.interactionRules ?? { schemaVersion: 1, rules: [] } })} />
      {mechanics.interactionMode !== "race" && <InteractionRulesEditor authoringOnly owner="race" value={mechanics.interactionRules} onChange={interactionRules => patch({ interactionRules })} />}
    </Section>
    <Section title="Using the body and equipment" status={[mechanics.manipulation.state, mechanics.speech.state, mechanics.equipment.state].every(state => state === "race") && !mechanics.restrictions.length ? "Unchanged" : "Different in this Form"}>
      <p>These choices describe the intended Form. They do not change speech, spellcasting, equipment access or inventory now.</p>
      {([ ["manipulation", "Using hands, tools & objects", FORM_MANIPULATION], ["speech", "Speech", FORM_SPEECH], ["equipment", "Equipment interaction", FORM_EQUIPMENT] ] as const).map(([key, label, options]) => <div key={key} className={styles.capability}>
        <Source label={label} value={mechanics[key].state} options={options} help={`Describe ${label.toLowerCase()} in this Form. Leave unchanged to keep the normal behavior. Explain unusual cases in Notes; nothing is applied automatically.`} onChange={state => patch({ [key]: { ...mechanics[key], state } })} />
        <Field label={`${label} Notes`} help="Explain limitations or unusual cases. Notes are reference text and do not execute rules."><textarea className="st-control" rows={2} value={mechanics[key].notes} onChange={event => patch({ [key]: { ...mechanics[key], notes: event.target.value } })} /></Field>
      </div>)}
      <h4>Other physical restrictions</h4>
      {!mechanics.restrictions.length && <p>No extra restrictions are recorded. The choices above still apply.</p>}
      {mechanics.restrictions.map((restriction, index) => <div className={styles.capability} key={restriction.key}>
        <Field label="Restriction Name" help="Name another physical restriction that does not fit the sections above. This is a description for the player and G.O.D."><input className="st-control" value={restriction.name} onChange={event => patch({ restrictions: mechanics.restrictions.map((row, i) => i === index ? { ...row, name: event.target.value } : row) })} /></Field>
        <Field label="Restriction Notes" help="Describe the limitation and any exceptions without assuming automated consequences."><textarea className="st-control" rows={2} value={restriction.notes} onChange={event => patch({ restrictions: mechanics.restrictions.map((row, i) => i === index ? { ...row, notes: event.target.value } : row) })} /></Field>
        <button className="st-button is-danger" type="button" onClick={() => patch({ restrictions: mechanics.restrictions.filter((_, i) => i !== index) })}>Remove Restriction</button>
      </div>)}
      <button className="st-button" type="button" onClick={() => patch({ restrictions: [...mechanics.restrictions, { key: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join(""), name: "", notes: "" }] })}>Add Restriction</button>
    </Section>
  </div>;
}

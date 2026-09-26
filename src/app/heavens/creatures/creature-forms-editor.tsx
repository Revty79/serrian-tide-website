"use client";
import { FormAccessEditor } from "@/components/forms/form-access-editor";

import type { ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
import { FormTransformationEditor } from "@/components/forms/form-transformation-editor";
import { InteractionRulesEditor } from "@/app/heavens/interaction-rules-editor";
import { CREATURE_SIZE_OPTIONS, CREATURE_CR_IMPACTS } from "@/db/creature-schema";
import { createCreatureCanonicalIdentity } from "@/features/creatures/creature-canonical-ids";
import { CREATURE_ATTRIBUTE_NAMES } from "@/features/creatures/creature-size-rules";
import type { CreatureDraft } from "@/features/creatures/models";
import { CREATURE_FORM_COLLECTIONS, CREATURE_FORM_MANIPULATION, CREATURE_FORM_SPEECH, CREATURE_FORM_EQUIPMENT, emptyCreatureFormMechanics, normalizeCreatureForm, projectCreatureFormDefinition, type CreatureForm, type CreatureFormMechanics } from "@/features/creatures/creature-forms";
import { Stats, HpAndLocations, Combat, Special, CreatureSkills } from "./creature-mechanics-editors";
import styles from "@/components/forms/forms.module.css";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <details className={styles.section}><summary>{title}</summary><div className={styles.sectionBody}>{children}</div></details>;
}
function Text({ label, value, help, onChange }: { label: string; value: string; help: string; onChange: (value: string) => void }) {
  return <GuidedField className="st-field" label={label} help={help}><textarea className="st-control" rows={2} value={value} onChange={event => onChange(event.target.value)} /></GuidedField>;
}
function Source({ label, value, onChange, additional = false }: { label: string; value: string; onChange: (value: string) => void; additional?: boolean }) {
  return <GuidedField className="st-field" label={`${label[0].toUpperCase() + label.slice(1)} in this Form`} help={additional ? "Keep normal Creature Skills, keep them and add more, or use only the Skills listed here. When adding the same Skill, this Form's Rank is used. A Form-only list with no Skills means none. Returning to normal clears this list." : "Keep the Creature's normal choices, or write the whole list for this Form. A different list with no entries means this Form has none. Returning to normal clears the Form's list."}><select className="st-control" value={value} onChange={event => onChange(event.target.value)}><option value="creature">Use the Creature&apos;s normal choices</option>{additional ? <><option value="add">Keep the normal choices and add more</option><option value="replace">Use only these choices while in this Form</option></> : <option value="override">Define different choices for this Form</option>}</select></GuidedField>;
}

function Mechanics({ draft, form, onChange }: { draft: CreatureDraft; form: CreatureForm; onChange: (mechanics: CreatureFormMechanics) => void }) {
  const m = form.mechanics;
  const patch = (change: Partial<CreatureFormMechanics>) => onChange({ ...m, ...change });
  const effective = projectCreatureFormDefinition(draft, m);
  return <div className={styles.mechanics}>
    <Section title="Size and exceptional steps"><p>Blank keeps the normal Creature value. Enter 0 to remove its exceptional steps in this Form. Creature Form Attributes are replacement base scores, then scaled by Size; they are not changes added to normal scores.</p>
      <GuidedField className="st-field" label="Form Size" help="Keep the Creature's normal Size or choose a different Size. Size scales the Attribute scores shown in preview; it does not change the actual NPC."><select className="st-control" value={m.size ?? ""} onChange={event => patch({ size: event.target.value || null })}><option value="">Use Creature Size</option>{CREATURE_SIZE_OPTIONS.map(size => <option key={size}>{size}</option>)}</select></GuidedField>
      {([ ["hpMultiplierSteps", "HP Multiplier Steps"], ["baseMovementSteps", "Base Movement Steps"], ["baseMagicSteps", "Base Magic Steps"] ] as const).map(([key, label]) => <GuidedField key={key} className="st-field" label={`Form ${label}`} help="Leave blank to keep the normal Creature's steps. Enter a whole number of zero or more to use that many steps in this Form preview."><input className="st-control" type="number" min={0} step={1} value={m[key] ?? ""} onChange={event => patch({ [key]: event.target.value === "" ? null : Number(event.target.value) })} /></GuidedField>)}
    </Section>
    {CREATURE_FORM_COLLECTIONS.map(key => <Section key={key} title={key[0].toUpperCase() + key.slice(1)}>
      <Source label={key} value={m[key].mode} onChange={mode => patch({ [key]: { mode, rows: mode === "creature" ? [] : structuredClone(key === "attributes" ? CREATURE_ATTRIBUTE_NAMES.map((attributeKey, sortOrder) => draft.attributes.find(row => row.attributeKey === attributeKey) ?? { attributeKey, value: null, notes: "", sortOrder }) : draft[key]) } })} />
      {m[key].mode === "override" && <>
        {key === "attributes" && <p>Enter this Form&apos;s base Attribute scores, not bonuses or penalties. These replace the normal base scores before the Creature Size multiplier is applied. Blank means the score is unknown.</p>}
        {key === "attributes" || key === "movement" ? <Stats only={key} draft={effective} onChange={next => patch({ [key]: { mode: "override", rows: next[key] } })} /> : null}
        {key === "attacks" && <Combat attacksOnly draft={effective} onChange={next => patch({ attacks: { mode: "override", rows: next.attacks } })} />}
        {key === "abilities" && <Special abilitiesOnly draft={effective} onChange={next => patch({ abilities: { mode: "override", rows: next.abilities } })} />}
        {key === "defenses" && <><p>Describe defenses for this Form. CR impact is recorded for reference; preview does not change the actual CR.</p>{m.defenses.rows.map((row, index) => {
          const update = (change: Partial<typeof row>) => patch({ defenses: { mode: "override", rows: m.defenses.rows.map((entry, i) => i === index ? { ...entry, ...change } : entry) } });
          return <div className={styles.card} key={index}>{(["defenseType", "against", "value", "notes"] as const).map(field => <Text key={field} label={{ defenseType: "Defense type", against: "What does it protect against?", value: "Protection amount", notes: "Defense notes" }[field]} value={row[field] ?? ""} help="Describe what this defense protects against and how much protection it gives. This is shown for reference, not applied automatically." onChange={value => update({ [field]: field === "value" ? value || null : value })} />)}<GuidedField className="st-field" label="Defense CR impact" help="Record how much this defense affects difficulty. Preview does not change CR or XP."><select className="st-control" value={row.crImpact} onChange={event => update({ crImpact: event.target.value as typeof row.crImpact })}>{CREATURE_CR_IMPACTS.map(impact => <option key={impact}>{impact}</option>)}</select></GuidedField><button type="button" className="st-button" onClick={() => patch({ defenses: { mode: "override", rows: m.defenses.rows.filter((_, i) => i !== index) } })}>Remove defense</button></div>;
        })}<button type="button" className="st-button" onClick={() => patch({ defenses: { mode: "override", rows: [...m.defenses.rows, { seedIdentity: null, defenseType: "", against: "", value: null, notes: "", crImpact: "None", sortOrder: m.defenses.rows.length }] } })}>Add defense</button></>}
      </>}
    </Section>)}
    <Section title="HP pools and hit locations"><Source label="Body" value={m.body.mode} onChange={mode => patch({ body: mode === "creature" ? { mode, hpPools: [], hitLocations: [] } : { mode: "override", hpPools: structuredClone(draft.hpPools), hitLocations: structuredClone(draft.hitLocations) } })} /><p>A different body needs its own HP pools and hit locations. Each location must use a pool in this body. Describe any body parts an attack needs in its Required anatomy field.</p>{m.body.mode === "override" && <HpAndLocations draft={effective} onChange={next => patch({ body: { mode: "override", hpPools: next.hpPools, hitLocations: next.hitLocations } })} />}</Section>
    <Section title="Skills"><Source label="Skills" value={m.skills.mode} additional onChange={mode => patch({ skills: { mode: mode as typeof m.skills.mode, rows: [] } })} />{m.skills.mode !== "creature" && <CreatureSkills draft={{ ...effective, skillLinks: m.skills.rows }} onChange={next => patch({ skills: { ...m.skills, rows: next.skillLinks } })} />}</Section>
    <Section title="Interaction Rules"><GuidedField className="st-field" label="Interaction Rules in this Form" help="Keep normal Creature rules, add more after them, or use only the rules below. An empty Form-only list means no rules. Preview shows these rules without applying them."><select className="st-control" value={m.interactionMode} onChange={event => patch({ interactionMode: event.target.value as typeof m.interactionMode, interactionRules: null })}><option value="creature">Use the Creature&apos;s normal choices</option><option value="add">Keep the normal rules and add more</option><option value="replace">Use only these rules while in this Form</option></select></GuidedField>{m.interactionMode !== "creature" && <InteractionRulesEditor authoringOnly owner="creature" value={m.interactionRules} onChange={interactionRules => patch({ interactionRules })} />}</Section>
    <Section title="Physical capabilities and restrictions">
      {!m.restrictions.length && <p>No extra restrictions are recorded. The capability and equipment choices below still apply.</p>}
      {([ ["manipulation", CREATURE_FORM_MANIPULATION], ["speech", CREATURE_FORM_SPEECH], ["equipment", CREATURE_FORM_EQUIPMENT] ] as const).map(([key, choices]) => <div className={styles.capability} key={key}><GuidedField className="st-field" label={{ manipulation: "Using hands, tools & objects", speech: "Speech in this Form", equipment: "Equipment in this Form" }[key]} help="Describe what this body can do or what should happen to equipment. Leave unchanged for normal behavior. Preview never changes owned Items."><select className="st-control" value={m[key].state} onChange={event => patch({ [key]: { ...m[key], state: event.target.value } })}>{Object.entries(choices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></GuidedField><Text label={`${key === "manipulation" ? "Hands, tools & objects" : key === "speech" ? "Speech" : "Equipment"} notes`} value={m[key].notes} help="Describe the physical limitation or G.O.D. ruling for this Form." onChange={notes => patch({ [key]: { ...m[key], notes } })} /></div>)}
      {m.restrictions.map((row, index) => <div className={styles.card} key={row.key}><Text label="Restriction name" value={row.name} help="Name the restriction; this is an authored rule, never automatically applied." onChange={name => patch({ restrictions: m.restrictions.map((r, i) => i === index ? { ...r, name } : r) })} /><Text label="Restriction notes" value={row.notes} help="Explain what this Form cannot do and any required G.O.D. resolution." onChange={notes => patch({ restrictions: m.restrictions.map((r, i) => i === index ? { ...r, notes } : r) })} /><button type="button" className="st-button" onClick={() => patch({ restrictions: m.restrictions.filter((_, i) => i !== index) })}>Remove restriction</button></div>)}
      <button type="button" className="st-button" onClick={() => patch({ restrictions: [...m.restrictions, { key: createCreatureCanonicalIdentity(), name: "", notes: "" }] })}>Add restriction</button>
    </Section>
  </div>;
}

export function CreatureFormsEditor({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const forms = draft.forms ?? [];
  const set = (rows: CreatureForm[]) => onChange({ ...draft, forms: rows.map((row, sortOrder) => ({ ...row, sortOrder })) });
  const move = (index: number, offset: number) => { const rows = [...forms]; [rows[index], rows[index + offset]] = [rows[index + offset], rows[index]]; set(rows); };
  return <div className={styles.editor} aria-label="Creature Forms editor"><p><strong>Creature itself is the Normal state.</strong> Forms belong to this Creature, including if it is a Variant. Later changes to a parent Creature do not change these Forms.</p><p>You can describe Forms and preview them. Changing into a Form during play is not automated yet.</p>
    {!forms.length && <p>No alternate Forms. This Creature uses its normal body and abilities.</p>}
    {forms.map((form, index) => {
      const patch = (change: Partial<CreatureForm>) => set(forms.map((row, i) => i === index ? { ...row, ...change } : row));
      let error = ""; try { normalizeCreatureForm(form, draft, index); } catch (failure) { error = failure instanceof Error ? failure.message : "Check Form fields."; }
      return <article className={styles.card} key={form.key} data-creature-form><header><h3>{form.name || `Form ${index + 1}`}</h3><div className={styles.actions}><button className="st-button" type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move up</button><button className="st-button" type="button" disabled={index === forms.length - 1} onClick={() => move(index, 1)}>Move down</button><button className="st-button" type="button" onClick={() => set(forms.filter((_, i) => i !== index))}>Remove Form</button></div></header>
        <Text label="Form Name" value={form.name} help="A name for an alternate state of this Creature, not a Variant or Evolution." onChange={name => patch({ name })} /><Text label="Form Description" value={form.description} help="Describe the Form's appearance and purpose." onChange={description => patch({ description })} /><Text label="Form Notes" value={form.notes} help="Additional authoring notes for the G.O.D." onChange={notes => patch({ notes })} />
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <FormAccessEditor owner="creature" value={form.access} creatureAbilities={draft.abilities} onChange={access => patch({ access })} />
        <Mechanics draft={draft} form={form} onChange={mechanics => patch({ mechanics })} />
        <FormTransformationEditor value={form.transformation} onChange={transformation => patch({ transformation })} />
      </article>;
    })}<button className="st-button" type="button" onClick={() => set([...forms, { key: createCreatureCanonicalIdentity(), name: "", description: "", notes: "", sortOrder: forms.length, mechanics: emptyCreatureFormMechanics(), transformation: null }])}>Add Form</button>
  </div>;
}

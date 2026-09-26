"use client";

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
  return <GuidedField className="st-field" label={`${label} source`} help={additional ? "Use Creature retains the Normal definition. Add retains unrelated entries and uses this Form's rank for the same Skill. Replace intentionally removes the Creature collection, including when empty. Choosing Use Creature clears the Form rows." : "Use Creature follows the Normal definition. Override replaces this entire category; an empty override means none. Choosing Use Creature clears the Form rows."}><select className="st-control" value={value} onChange={event => onChange(event.target.value)}><option value="creature">Use Creature definition</option>{additional ? <><option value="add">Add to Creature definition</option><option value="replace">Replace Creature definition</option></> : <option value="override">Override for this Form</option>}</select></GuidedField>;
}

function Mechanics({ draft, form, onChange }: { draft: CreatureDraft; form: CreatureForm; onChange: (mechanics: CreatureFormMechanics) => void }) {
  const m = form.mechanics;
  const patch = (change: Partial<CreatureFormMechanics>) => onChange({ ...m, ...change });
  const effective = projectCreatureFormDefinition(draft, m);
  return <div className={styles.mechanics}>
    <Section title="Size and exceptional steps"><p>Creature-native values. Blank uses Creature; zero explicitly overrides steps to zero. Attributes use absolute base values, then the existing Creature Size multiplier. No Race caps or Character adjustments.</p>
      <GuidedField className="st-field" label="Form Size" help="Use the Creature's Size or override it for preview. The existing Creature Size multiplier scales effective Attributes."><select className="st-control" value={m.size ?? ""} onChange={event => patch({ size: event.target.value || null })}><option value="">Use Creature Size</option>{CREATURE_SIZE_OPTIONS.map(size => <option key={size}>{size}</option>)}</select></GuidedField>
      {([ ["hpMultiplierSteps", "HP Multiplier Steps"], ["baseMovementSteps", "Base Movement Steps"], ["baseMagicSteps", "Base Magic Steps"] ] as const).map(([key, label]) => <GuidedField key={key} className="st-field" label={`Form ${label}`} help="Blank uses Creature. A nonnegative whole number overrides this native exceptional-step value in preview only."><input className="st-control" type="number" min={0} step={1} value={m[key] ?? ""} onChange={event => patch({ [key]: event.target.value === "" ? null : Number(event.target.value) })} /></GuidedField>)}
    </Section>
    {CREATURE_FORM_COLLECTIONS.map(key => <Section key={key} title={key[0].toUpperCase() + key.slice(1)}>
      <Source label={key} value={m[key].mode} onChange={mode => patch({ [key]: { mode, rows: mode === "creature" ? [] : structuredClone(key === "attributes" ? CREATURE_ATTRIBUTE_NAMES.map((attributeKey, sortOrder) => draft.attributes.find(row => row.attributeKey === attributeKey) ?? { attributeKey, value: null, notes: "", sortOrder }) : draft[key]) } })} />
      {m[key].mode === "override" && <>
        {key === "attributes" || key === "movement" ? <Stats only={key} draft={effective} onChange={next => patch({ [key]: { mode: "override", rows: next[key] } })} /> : null}
        {key === "attacks" && <Combat attacksOnly draft={effective} onChange={next => patch({ attacks: { mode: "override", rows: next.attacks } })} />}
        {key === "abilities" && <Special abilitiesOnly draft={effective} onChange={next => patch({ abilities: { mode: "override", rows: next.abilities } })} />}
        {key === "defenses" && <><p>Native legacy defense definitions. CR impact is authoring metadata; Form preview never recalculates runtime CR.</p>{m.defenses.rows.map((row, index) => {
          const update = (change: Partial<typeof row>) => patch({ defenses: { mode: "override", rows: m.defenses.rows.map((entry, i) => i === index ? { ...entry, ...change } : entry) } });
          return <div className={styles.card} key={index}>{(["defenseType", "against", "value", "notes"] as const).map(field => <Text key={field} label={`Defense ${field}`} value={row[field] ?? ""} help="Creature-native defense authoring. Describe the protection, affected source and value; this does not execute a defense." onChange={value => update({ [field]: field === "value" ? value || null : value })} />)}<GuidedField className="st-field" label="Defense CR impact" help="Stored metadata only. Form preview does not change CR or XP."><select className="st-control" value={row.crImpact} onChange={event => update({ crImpact: event.target.value as typeof row.crImpact })}>{CREATURE_CR_IMPACTS.map(impact => <option key={impact}>{impact}</option>)}</select></GuidedField><button type="button" className="st-button" onClick={() => patch({ defenses: { mode: "override", rows: m.defenses.rows.filter((_, i) => i !== index) } })}>Remove defense</button></div>;
        })}<button type="button" className="st-button" onClick={() => patch({ defenses: { mode: "override", rows: [...m.defenses.rows, { seedIdentity: null, defenseType: "", against: "", value: null, notes: "", crImpact: "None", sortOrder: m.defenses.rows.length }] } })}>Add defense</button></>}
      </>}
    </Section>)}
    <Section title="HP pools and hit locations"><Source label="Body" value={m.body.mode} onChange={mode => patch({ body: mode === "creature" ? { mode, hpPools: [], hitLocations: [] } : { mode: "override", hpPools: structuredClone(draft.hpPools), hitLocations: structuredClone(draft.hitLocations) } })} /><p>Body overrides replace pools and hit locations together. Pool references must belong to this body. Attack required anatomy remains the existing Creature descriptive text; no new anatomy vocabulary is inferred.</p>{m.body.mode === "override" && <HpAndLocations draft={effective} onChange={next => patch({ body: { mode: "override", hpPools: next.hpPools, hitLocations: next.hitLocations } })} />}</Section>
    <Section title="Skills"><Source label="Skills" value={m.skills.mode} additional onChange={mode => patch({ skills: { mode: mode as typeof m.skills.mode, rows: [] } })} />{m.skills.mode !== "creature" && <CreatureSkills draft={{ ...effective, skillLinks: m.skills.rows }} onChange={next => patch({ skills: { ...m.skills, rows: next.skillLinks } })} />}</Section>
    <Section title="Interaction Rules"><GuidedField className="st-field" label="Interaction Rules source" help="Use Creature keeps Normal rules. Add displays Creature rules followed by Form rules as separate sources. Replace uses only Form rules, including none. No rules execute in preview."><select className="st-control" value={m.interactionMode} onChange={event => patch({ interactionMode: event.target.value as typeof m.interactionMode, interactionRules: null })}><option value="creature">Use Creature definition</option><option value="add">Add to Creature rules</option><option value="replace">Replace Creature rules</option></select></GuidedField>{m.interactionMode !== "creature" && <InteractionRulesEditor owner="creature" value={m.interactionRules} onChange={interactionRules => patch({ interactionRules })} />}</Section>
    <Section title="Physical capabilities and restrictions">
      {([ ["manipulation", CREATURE_FORM_MANIPULATION], ["speech", CREATURE_FORM_SPEECH], ["equipment", CREATURE_FORM_EQUIPMENT] ] as const).map(([key, choices]) => <div className={styles.capability} key={key}><GuidedField className="st-field" label={`Form ${key}`} help="Author the intended capability or equipment behavior. This preview never moves, drops, equips or hides owned Items."><select className="st-control" value={m[key].state} onChange={event => patch({ [key]: { ...m[key], state: event.target.value } })}>{Object.entries(choices).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></GuidedField><Text label={`${key} notes`} value={m[key].notes} help="Describe the physical limitation or G.O.D. ruling for this Form." onChange={notes => patch({ [key]: { ...m[key], notes } })} /></div>)}
      {m.restrictions.map((row, index) => <div className={styles.card} key={row.key}><Text label="Restriction name" value={row.name} help="Name the restriction; this is an authored rule, never automatically applied." onChange={name => patch({ restrictions: m.restrictions.map((r, i) => i === index ? { ...r, name } : r) })} /><Text label="Restriction notes" value={row.notes} help="Explain what this Form cannot do and any required G.O.D. resolution." onChange={notes => patch({ restrictions: m.restrictions.map((r, i) => i === index ? { ...r, notes } : r) })} /><button type="button" className="st-button" onClick={() => patch({ restrictions: m.restrictions.filter((_, i) => i !== index) })}>Remove restriction</button></div>)}
      <button type="button" className="st-button" onClick={() => patch({ restrictions: [...m.restrictions, { key: createCreatureCanonicalIdentity(), name: "", notes: "" }] })}>Add restriction</button>
    </Section>
  </div>;
}

export function CreatureFormsEditor({ draft, onChange }: { draft: CreatureDraft; onChange: (draft: CreatureDraft) => void }) {
  const forms = draft.forms ?? [];
  const set = (rows: CreatureForm[]) => onChange({ ...draft, forms: rows.map((row, sortOrder) => ({ ...row, sortOrder })) });
  const move = (index: number, offset: number) => { const rows = [...forms]; [rows[index], rows[index + offset]] = [rows[index + offset], rows[index]]; set(rows); };
  return <div className={styles.editor} aria-label="Creature Forms editor"><p><strong>Creature itself is the Normal state.</strong> Forms belong to this exact Creature, including when it is a Variant. No parent-chain inheritance.</p><p>Forms are authoring data; active transformation runtime is not implemented.</p>
    {forms.map((form, index) => {
      const patch = (change: Partial<CreatureForm>) => set(forms.map((row, i) => i === index ? { ...row, ...change } : row));
      let error = ""; try { normalizeCreatureForm(form, draft, index); } catch (failure) { error = failure instanceof Error ? failure.message : "Check Form fields."; }
      return <article className={styles.card} key={form.key} data-creature-form><header><h3>{form.name || `Form ${index + 1}`}</h3><div className={styles.actions}><button className="st-button" type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move up</button><button className="st-button" type="button" disabled={index === forms.length - 1} onClick={() => move(index, 1)}>Move down</button><button className="st-button" type="button" onClick={() => set(forms.filter((_, i) => i !== index))}>Remove Form</button></div></header>
        <Text label="Form Name" value={form.name} help="A name for an alternate state of this Creature, not a Variant or Evolution." onChange={name => patch({ name })} /><Text label="Form Description" value={form.description} help="Describe the Form's appearance and purpose." onChange={description => patch({ description })} /><Text label="Form Notes" value={form.notes} help="Additional authoring notes for the G.O.D." onChange={notes => patch({ notes })} />
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <Mechanics draft={draft} form={form} onChange={mechanics => patch({ mechanics })} />
        <FormTransformationEditor value={form.transformation} onChange={transformation => patch({ transformation })} />
      </article>;
    })}<button className="st-button" type="button" onClick={() => set([...forms, { key: createCreatureCanonicalIdentity(), name: "", description: "", notes: "", sortOrder: forms.length, mechanics: emptyCreatureFormMechanics(), transformation: null }])}>Add Form</button>
  </div>;
}

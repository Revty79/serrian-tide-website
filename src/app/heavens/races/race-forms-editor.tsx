"use client";
import { FormAccessEditor } from "@/components/forms/form-access-editor";

import { RaceFormTransformationEditor } from "./race-form-transformation-editor";
import { GuidedField } from "@/components/field-guidance";
import { emptyRaceForm, normalizeRaceForms, type RaceForm } from "@/features/races/race-forms";
import { RaceFormMechanicsEditor } from "./race-form-mechanics-editor";
import type { RaceDraft } from "./actions";
import styles from "@/components/forms/forms.module.css";

export function RaceFormsEditor({ value, race, onChange }: { value: RaceForm[]; race: RaceDraft; onChange: (forms: RaceForm[]) => void }) {
  const update = (rows: RaceForm[]) => onChange(rows.map((row, sortOrder) => ({ ...row, sortOrder })));
  const patch = (key: string, change: Partial<RaceForm>) => update(value.map(row => row.key === key ? { ...row, ...change } : row));
  const move = (index: number, delta: number) => {
    const rows = [...value];
    [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]];
    update(rows);
  };
  let validation = "";
  try { normalizeRaceForms(value); } catch (error) { validation = error instanceof Error ? error.message : "Check the Forms below."; }
  return <section className={styles.editor} aria-label="Race Forms">
    <p>The Race itself is the normal state. Forms are alternate states available to this Race.</p>
    <p>Forms are authoring data only. Runtime transformation support is not implemented yet.</p>
    <button type="button" className="st-button" onClick={() => {
      const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
      update([...value, emptyRaceForm(key)]);
    }}>Add Form</button>
    {!value.length ? <p>No Forms authored. This Race uses its normal definition.</p> : null}
    {validation ? <p role="alert" className={styles.error}>{validation}</p> : null}
    {value.map((form, index) => <article key={form.key} className={styles.card} aria-label={`Form ${index + 1}`}>
      <header>
        <h3>{form.name || `Form ${index + 1}`}</h3>
        <div className={styles.actions}>
          <button type="button" className="st-button" disabled={index === 0} onClick={() => move(index, -1)}>Move Up</button>
          <button type="button" className="st-button" disabled={index === value.length - 1} onClick={() => move(index, 1)}>Move Down</button>
          <button type="button" className="st-button is-danger" onClick={() => update(value.filter(row => row.key !== form.key))}>Remove Form</button>
        </div>
      </header>
      <GuidedField className="st-field" label="Form Name" help="Give this alternate state a name, such as Wolf Form or Aquatic Form. A name is required.">
        <input className="st-control" value={form.name} onChange={event => patch(form.key, { name: event.target.value })} />
      </GuidedField>
      <GuidedField className="st-field" label="Form Description" help="Describe this alternate state and its appearance. This text does not change Attributes, Anatomy or other mechanics. Leave blank if no description is needed.">
        <textarea className="st-control" rows={3} value={form.description} onChange={event => patch(form.key, { description: event.target.value })} />
      </GuidedField>
      <GuidedField className="st-field" label="Form Notes" help="Record additional authoring notes for this Form. Notes do not create transformation rules or runtime effects. Leave blank if no notes are needed.">
        <textarea className="st-control" rows={3} value={form.notes} onChange={event => patch(form.key, { notes: event.target.value })} />
      </GuidedField>
      <FormAccessEditor owner="race" value={form.access} onChange={access => patch(form.key, { access })} />
      <RaceFormMechanicsEditor value={form.mechanics} race={race} onChange={mechanics => patch(form.key, { mechanics })} />
      <RaceFormTransformationEditor value={form.transformation} onChange={transformation => patch(form.key, { transformation })} />
    </article>)}
  </section>;
}

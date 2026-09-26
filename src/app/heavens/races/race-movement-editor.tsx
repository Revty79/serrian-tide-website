"use client";

import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";
import type { FormMovement } from "@/features/races/race-form-mechanics";

export type MovementDraft = Omit<FormMovement, "key"> & { key?: string };
export function RaceMovementEditor({ value, onChange }: { value: MovementDraft[]; onChange: (rows: MovementDraft[]) => void }) {
  const update = (rows: MovementDraft[]) => onChange(rows.map((row, sortOrder) => ({ ...row, sortOrder })));
  return <section className="race-section" aria-label="Movement Modes">
    <div className="race-subheading"><h3>Movement Modes</h3><button className="st-button" type="button" onClick={() => update([...value, { key: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join(""), movementMode: "Land", baseValue: 0, notes: "", sortOrder: value.length }])}>Add Movement</button></div>
    <div className="race-row-list">{value.map((movement, index) => {
      const patch = (change: Partial<MovementDraft>) => update(value.map((row, i) => i === index ? { ...row, ...change } : row));
      return <div className="race-repeat-row race-repeat-row--movement" key={movement.key ?? index}>
        <GuidedField className="race-field" label="Movement Mode" help={fieldHelp("race", "Movement Mode")}><input value={movement.movementMode} onChange={event => patch({ movementMode: event.target.value })} /></GuidedField>
        <GuidedField className="race-field" label="Base Movement" help={fieldHelp("race", "Base Movement")}><input type="number" step="any" value={movement.baseValue} onChange={event => patch({ baseValue: Number(event.target.value) })} /></GuidedField>
        <GuidedField className="race-field" label="Notes" help="Describe this movement mode. Notes do not create runtime rules."><input value={movement.notes} onChange={event => patch({ notes: event.target.value })} /></GuidedField>
        <button className="st-button is-danger" type="button" onClick={() => update(value.filter((_, i) => i !== index))}>Remove Movement</button>
      </div>;
    })}</div>
  </section>;
}

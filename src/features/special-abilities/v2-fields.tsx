"use client";
import type { ReactNode } from "react";
import { GuidedField } from "@/components/field-guidance";
import { moveMechanicsChild, progressionComparisonLabels } from "./authoring";
import type { DefinitionAmount } from "./v2-models";
import { RUNTIME_DURATION_KINDS, type RuntimeDuration } from "@/features/mechanical-effects/models";
export function TextField({ label, value, onChange, help, short = false }: { label: string; value: string; onChange: (value: string) => void; help: string; short?: boolean }) {
  return <GuidedField label={label} help={help}>{short ? <input className="st-control" maxLength={240} value={value} onChange={event => onChange(event.target.value)} /> : <textarea className="st-control" rows={3} maxLength={16000} value={value} onChange={event => onChange(event.target.value)} />}</GuidedField>;
}
export function NumberField({ label, value, onChange, help, min, whole = false }: { label: string; value: number; onChange: (value: number) => void; help: string; min?: number; whole?: boolean }) {
  return <GuidedField label={label} help={help}><input className="st-control" type="number" step={whole ? 1 : "any"} min={min} value={Number.isFinite(value) ? value : ""} onChange={event => onChange(event.target.value === "" ? NaN : Number(event.target.value))} /></GuidedField>;
}
export function SelectField<T extends string>({ label, value, options, onChange, help }: { label: string; value: T; options: readonly { value: T; label: string; disabled?: boolean }[]; onChange: (value: T) => void; help: string }) {
  return <GuidedField label={label} help={help}><select className="st-control" value={value} onChange={event => onChange(event.target.value as T)}>{options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></GuidedField>;
}
export const humanOptions = <T extends string,>(values: readonly T[]) => values.map(value => ({ value, label: value.replaceAll("-", " ").replace(/\b\w/g, letter => letter.toUpperCase()) }));
export function ChildList<T extends { key: string }>({ label, singular, rows, onChange, create, children }: {
  label: string; singular: string; rows: T[]; onChange: (rows: T[]) => void; create: () => T; children: (row: T, onChange: (row: T) => void) => ReactNode;
}) {
  return <fieldset className="mechanics-group"><legend>{label}</legend>
    {rows.length === 0 && <p>No {label.toLowerCase()} authored.</p>}
    {rows.map((row, index) => <div className="mechanics-condition" key={row.key} data-child-key={row.key}>
      {children(row, next => onChange(rows.map(item => item.key === row.key ? next : item)))}
      <div className="mechanics-actions">
        <button className="st-button" type="button" disabled={index === 0} onClick={() => onChange(moveMechanicsChild(rows, index, -1))}>Move {singular} Up</button>
        <button className="st-button" type="button" disabled={index === rows.length - 1} onClick={() => onChange(moveMechanicsChild(rows, index, 1))}>Move {singular} Down</button>
        <button className="st-button is-danger" type="button" onClick={() => onChange(rows.filter(item => item.key !== row.key))}>Remove {singular}</button>
      </div>
    </div>)}
    <button className="st-button" type="button" disabled={rows.length >= 50} onClick={() => onChange([...rows, create()])}>Add {singular}</button>
  </fieldset>;
}
export function AmountEditor({ label, value, onChange, signed = false, allowFull = false }: {
  label: string; value: DefinitionAmount | { kind: "full" }; onChange: (value: DefinitionAmount | { kind: "full" }) => void; signed?: boolean; allowFull?: boolean;
}) {
  return <div className="mechanics-rule-fields">
    <SelectField label={`${label} definition`} value={value.kind} options={[
      { value: "manual", label: "Manual / G.O.D." }, { value: "fixed", label: "Fixed amount" },
      ...(allowFull ? [{ value: "full" as const, label: "Full refill" }] : []),
      ...(value.kind === "progression-threshold" ? [{ value: "progression-threshold" as const, label: "Score-based amount (preserved)", disabled: true }] : []),
    ]} help="Author a fixed amount or describe G.O.D. determination. To qualify this rule by score, use Current Special Ability Score in its conditions. No balance is stored or changed."
      onChange={kind => { if (kind === "manual") onChange({ kind, guidance: "" }); else if (kind === "fixed") onChange({ kind, amount: 0 }); else if (kind === "full" && allowFull) onChange({ kind }); }} />
    {value.kind === "fixed" && <NumberField label={`${label} amount`} value={value.amount} min={signed ? undefined : 0} onChange={amount => onChange({ ...value, amount })} help={signed ? "Author the signed contribution to the maximum. This does not decide stacking, rounding or current-balance behavior." : "Enter the authored amount. This is a definition, not a Character's current amount."} />}
    {value.kind === "manual" && <TextField label={`${label} G.O.D. guidance`} value={value.guidance} onChange={guidance => onChange({ ...value, guidance })} help="Explain how the G.O.D. determines this amount. Nonblank guidance is required; no formula is evaluated." />}
    {value.kind === "progression-threshold" && <p className="mechanics-notice" role="status">Current Special Ability Score threshold: {progressionComparisonLabels.gte} {value.threshold}; contribution: {value.contribution}. This saved amount definition is preserved. Amount execution remains unsupported; use the rule’s score conditions to author qualification.</p>}
  </div>;
}
export function DurationEditor({ value, onChange }: { value: RuntimeDuration; onChange: (value: RuntimeDuration) => void }) {
  return <div className="mechanics-rule-fields">
    <SelectField label="Duration" value={value.kind} options={humanOptions(RUNTIME_DURATION_KINDS)} help="Uses the shared duration vocabulary. This describes duration only; no timer or expiration is started."
      onChange={kind => onChange({ ...value, kind, value: kind === "combat-rounds" || kind === "combat-steps" ? 0 : null })} />
    {(value.kind === "combat-steps" || value.kind === "combat-rounds") && <NumberField label="Duration count" value={value.value ?? 0} onChange={count => onChange({ ...value, value: count })} min={1} whole help="Enter a positive whole number of the chosen combat units." />}
    <TextField label="Duration explanation" short value={value.label ?? ""} onChange={label => onChange({ ...value, label })} help="Optional explanation for readers. This does not introduce a new duration unit." />
  </div>;
}

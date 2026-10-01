"use client";

import { useId, type AriaAttributes } from "react";
import { DAMAGE_TYPES, parseDamageTypes } from "@/features/damage-types/damage-types";
import styles from "./damage-type-select.module.css";

type Props = AriaAttributes & {
  value: string;
  onChange: (value: string) => void;
  multiple?: boolean;
  className?: string;
};

/** Native dropdowns work with keyboard, touch, and the shared GuidedField labels. */
export function DamageTypeSelect({ value, onChange, multiple = true, className, ...aria }: Props) {
  const id = useId();
  const parsed = parseDamageTypes(value);
  const invalid = parsed.unrecognized.length > 0 || (!multiple && parsed.types.length > 1);
  const selected = invalid ? [value] : parsed.types;
  const rows = selected.length ? selected : [""];
  const update = (index: number, next: string) => {
    const result = invalid ? (next ? [next] : []) : rows.flatMap((type, i) => (i === index ? next : type) || []);
    onChange(DAMAGE_TYPES.filter(type => result.includes(type)).join(" / "));
  };
  const describedBy = [aria["aria-describedby"], invalid ? `${id}-review` : null, multiple ? `${id}-help` : null].filter(Boolean).join(" ") || undefined;
  return <div className={styles.control} data-damage-type-control="true">
    {rows.map((type, index) => <div className={styles.row} key={index}>
      <select {...aria} aria-label={aria["aria-labelledby"] ? undefined : aria["aria-label"] ?? "Damage Type"}
        aria-describedby={describedBy} aria-invalid={invalid || undefined} className={className ?? "st-control"}
        value={type} onChange={event => update(index, event.target.value)}>
        <option value="">Unspecified</option>
        {invalid && <option value={value} disabled>{value} — needs review</option>}
        {DAMAGE_TYPES.filter(candidate => candidate === type || !selected.includes(candidate)).map(candidate => <option key={candidate} value={candidate}>{candidate}</option>)}
      </select>
      {multiple && selected.length > 1 && <button type="button" className="st-button" aria-label={`Remove ${type} damage type`} onClick={() => update(index, "")}>Remove</button>}
    </div>)}
    {multiple && !invalid && selected.length > 0 && selected.length < DAMAGE_TYPES.length && <select className={className ?? "st-control"} aria-label="Add damage type" aria-describedby={describedBy} value="" onChange={event => {
      if (event.target.value) onChange(DAMAGE_TYPES.filter(type => selected.includes(type) || type === event.target.value).join(" / "));
    }}><option value="">Add damage type…</option>{DAMAGE_TYPES.filter(type => !selected.includes(type)).map(type => <option key={type}>{type}</option>)}</select>}
    {multiple && <small id={`${id}-help`}>Use Add damage type to select more than one.</small>}
    {invalid && <small id={`${id}-review`} role="alert">This saved value needs review. It can be retained unchanged; new or revised entries must use approved types. Keep any special rule in the notes.</small>}
  </div>;
}

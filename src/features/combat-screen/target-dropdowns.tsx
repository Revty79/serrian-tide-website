"use client";
import styles from "./combat-screen.module.css";

export function TargetDropdowns({ label, roster, selected, maximum, disabled, onChange }: {
  label: string; roster: readonly { participantId: number; name: string }[]; selected: readonly number[];
  maximum?: number; disabled?: boolean; onChange: (ids: number[]) => void;
}) {
  const slots = [...selected, ...(selected.length < (maximum ?? roster.length) ? [null] : [])];
  return <div className={styles.fields}>{slots.map((id, index) => <label className="st-field" key={index}>{label} {index + 1}<select className="st-control" disabled={disabled} value={id ?? ""} onChange={(event) => {
    const updated = [...selected];
    if (event.target.value) updated[index] = Number(event.target.value); else updated.splice(index, 1);
    onChange([...new Set(updated)]);
  }}><option value="">{id === null ? "Choose a target" : "Remove this target"}</option>{roster.map((entry) => <option key={entry.participantId} value={entry.participantId} disabled={entry.participantId !== id && selected.includes(entry.participantId)}>{entry.name}</option>)}</select></label>)}</div>;
}

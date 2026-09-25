"use client";

import { useId } from "react";
import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";
import { NATURAL_PROTECTION_LOCATIONS, type RaceNaturalProtection } from "@/features/races/race-natural-protection";
import styles from "./race-natural-protection-editor.module.css";

function createProtectionKey() {
  // Unlike randomUUID, getRandomValues is also available on plain HTTP LAN hosts.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ProtectionRow({ value, locations, onChange, onRemove }: { value: RaceNaturalProtection; locations: Array<{ key: string; name: string }>; onChange: (value: RaceNaturalProtection) => void; onRemove: () => void }) {
  const id = useId();
  return <article className={styles.row} aria-label="Natural Protection entry">
    <div className={styles.fields}>
      <GuidedField className="st-field" label="Protection Name" help={fieldHelp("race", "Protection Name")}><input id={`${id}-name`} className="st-control" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></GuidedField>
      <GuidedField className="st-field" label="Soak" help={fieldHelp("race", "Soak")}><input id={`${id}-soak`} className="st-control" type="number" min={0} step="any" value={value.naturalSoak} onChange={(e) => onChange({ ...value, naturalSoak: Number(e.target.value) })} /></GuidedField>
      <GuidedField className="st-field" label="Coverage" help={fieldHelp("race", "Coverage")}><select id={`${id}-coverage`} className="st-control" value={value.coverage.kind} onChange={(e) => onChange({ ...value, coverage: e.target.value === "all" ? { kind: "all" } : { kind: "locations", locationKeys: [] } })}>
        <option value="all">All locations</option><option value="locations">Selected locations</option>
      </select></GuidedField>
    </div>
    {value.coverage.kind === "locations" && <fieldset className={styles.locations}><legend>Covered locations</legend>
      {locations.map(({ key, name }) => <label key={key}><input type="checkbox" checked={value.coverage.kind === "locations" && value.coverage.locationKeys.includes(key)} onChange={(e) => {
        const current = value.coverage.kind === "locations" ? value.coverage.locationKeys : [];
        onChange({ ...value, coverage: { kind: "locations", locationKeys: e.target.checked ? [...current, key] : current.filter((entry) => entry !== key) } });
      }} />{name}</label>)}
    </fieldset>}
    <button type="button" className="st-button" onClick={onRemove}>Remove Protection</button>
  </article>;
}

export function RaceNaturalProtectionEditor({ value, locations = NATURAL_PROTECTION_LOCATIONS, onChange }: { value: RaceNaturalProtection[]; locations?: Array<{ key: string; name: string }>; onChange: (value: RaceNaturalProtection[]) => void }) {
  return <section className={styles.editor} aria-label="Natural Protection">
    <h3>Natural Protection</h3>
    <p>Protection from the body, such as scales or a shell. Worn armor stays separate. Characters use their assigned Race&apos;s current protection.</p>
    {value.map((entry, index) => <ProtectionRow key={entry.key} value={entry} locations={locations} onChange={(changed) => onChange(value.map((row, i) => i === index ? changed : row))} onRemove={() => onChange(value.filter((_, i) => i !== index))} />)}
    <button className="st-button" type="button" onClick={() => onChange([...value, { key: createProtectionKey(), name: "", naturalSoak: 0, coverage: { kind: "all" }, sortOrder: value.length }])}>Add Natural Protection</button>
  </section>;
}

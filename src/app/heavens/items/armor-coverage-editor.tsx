"use client";

import { useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { fieldHelp } from "@/features/guidance/field-help";
import { ARMOR_BODY_LOCATION_CHOICES, armorCoverageEntries, normalizeArmorCoverageKeys, otherArmorLocationKeys, type ArmorLocationReference } from "@/features/items/armor-coverage";
import styles from "./armor-coverage-editor.module.css";

export function ArmorCoverageEditor({ value, references, onChange }: {
  value: string[]; references: ArmorLocationReference[]; onChange: (keys: string[]) => void;
}) {
  const [selection, setSelection] = useState<string>("head");
  const [other, setOther] = useState("");
  const [error, setError] = useState("");
  function add() {
    try {
      const selected = selection === "other" ? otherArmorLocationKeys(other) : [...ARMOR_BODY_LOCATION_CHOICES.find((entry) => entry.key === selection)!.locationKeys];
      const updated = normalizeArmorCoverageKeys([...value, ...selected]);
      if (updated.length === normalizeArmorCoverageKeys(value).length) throw new Error("That body location is already in the coverage list.");
      onChange(updated); setOther(""); setError("");
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Choose a body location to add."); }
  }
  return <div className={styles.editor} data-armor-coverage>
    <p className="item-muted">Choose a body location and select Add. A whole leg covers its upper and lower hit locations. Save the Item to keep this list.</p>
    <div className={styles.controls}>
      <GuidedField label="Body location" help={fieldHelp("item", "Body location")} className="st-field">
        <select className="st-control" value={selection} onChange={(event) => { setSelection(event.target.value); setError(""); }}>
          {ARMOR_BODY_LOCATION_CHOICES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          <option value="other">Other</option>
        </select>
      </GuidedField>
      {selection === "other" ? <GuidedField label="Other body location" help={fieldHelp("item", "Other body location")} className="st-field">
        <input className="st-control" value={other} maxLength={80} placeholder="For example, Tail" onChange={(event) => { setOther(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      </GuidedField> : null}
      <button type="button" className="st-button is-secondary" onClick={add}>Add</button>
    </div>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    {value.length ? <ul className={styles.list} aria-label="Covered body locations">
      {armorCoverageEntries(value, references).map((entry) => <li key={entry.keys.join("|")}>
        <span>{entry.label}</span>
        <button type="button" className="st-button is-danger" aria-label={`Remove ${entry.label} coverage`} onClick={() => { onChange(value.filter((key) => !entry.keys.includes(key))); setError(""); }}>Remove</button>
      </li>)}
    </ul> : <p className="item-muted">No body locations added yet.</p>}
  </div>;
}

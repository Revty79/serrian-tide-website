"use client";

import { useId } from "react";
import type { CatalogKey, CatalogVisibilityMode } from "./catalog-visibility";
import styles from "./catalog-visibility-control.module.css";

export const CATALOG_VISIBILITY_CHOICES: ReadonlyArray<{ mode: CatalogVisibilityMode; label: string; description: string }> = [
  { mode: "canon", label: "Canon Only", description: "Official Serrian Tide content." },
  { mode: "canon-and-mine", label: "Canon + Mine", description: "Official Serrian Tide content plus content you created." },
  { mode: "mine", label: "Mine Only", description: "Content you created." },
];

/** Controlled native radio group; persistence belongs to the caller. */
export function CatalogVisibilityControl({ catalog, mode, label, description, onChange, pending = false, status, error }: {
  catalog: CatalogKey;
  mode: CatalogVisibilityMode;
  label: string;
  description?: string;
  onChange: (mode: CatalogVisibilityMode) => void;
  pending?: boolean;
  status?: string;
  error?: string;
}) {
  const id = useId();
  return <fieldset className={styles.control} disabled={pending} aria-busy={pending} aria-describedby={`${id}-feedback${description ? ` ${id}-description` : ""}`}>
    <legend>{label}</legend>
    {description ? <p className={styles.description} id={`${id}-description`}>{description}</p> : null}
    <div className={styles.choices}>
      {CATALOG_VISIBILITY_CHOICES.map((choice) => <label key={choice.mode} className={styles.option}>
        <input type="radio" name={`${catalog}-${id}`} value={choice.mode} checked={mode === choice.mode}
          aria-labelledby={`${id}-${choice.mode}-label`}
          aria-describedby={`${id}-${choice.mode}-meaning`} onChange={() => onChange(choice.mode)} />
        <span id={`${id}-${choice.mode}-label`}>{choice.label}</span>
        <span className="sr-only" id={`${id}-${choice.mode}-meaning`}>{choice.description}</span>
      </label>)}
    </div>
    <div id={`${id}-feedback`} className={styles.feedback}>
      {error ? <p role="alert" className={styles.error}>{error}</p> : <p role="status">{pending ? "Saving…" : status || "Changes save automatically."}</p>}
    </div>
  </fieldset>;
}

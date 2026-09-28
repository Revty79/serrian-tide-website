"use client";
import { useRef, useState } from "react";
import { setSystemCanon } from "./actions";
import type { SystemCanonRoot } from "./system-canon-service";
import styles from "./catalog-visibility-control.module.css";

export function CanonDesignationControl({ root, id, isSystemCanon, disabled, onChanged }: {
  root: SystemCanonRoot; id: number; isSystemCanon: boolean; disabled?: boolean;
  onChanged: (isSystemCanon: boolean, id: number) => Promise<void> | void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const saving = useRef(false);
  async function change() {
    if (saving.current) return;
    saving.current = true;
    setPending(true); setError(""); setStatus("");
    try {
      const saved = await setSystemCanon({ root, id, isSystemCanon: !isSystemCanon });
      setStatus(saved.isSystemCanon ? "Marked as System Canon." : "System Canon removed.");
      await onChanged(saved.isSystemCanon, saved.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Canon could not be updated. Reload and try again.");
    } finally { saving.current = false; setPending(false); }
  }
  return <div className={styles.canonControl}>
    <button className="st-button is-secondary" type="button" disabled={disabled || pending} onClick={() => void change()}>
      {pending ? "Updating Canon…" : isSystemCanon ? "Remove System Canon" : "Mark System Canon"}
    </button>
    <span>Administrator designation. Authorship and existing game references stay unchanged.</span>
    {status ? <span role="status">{status}</span> : null}
    {error ? <span role="alert" className={styles.canonError}>{error}</span> : null}
  </div>;
}

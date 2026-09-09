"use client";
import { useRef, useState } from "react";
import styles from "./combat-screen.module.css";

export function ForceEndDialog({ disabled, onEnd }: { disabled: boolean; onEnd: (note: string) => Promise<boolean> }) {
  const dialog = useRef<HTMLDialogElement>(null), running = useRef(false);
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <>
    <button className="st-button is-danger" disabled={disabled} onClick={() => dialog.current?.showModal()}>Force end combat</button>
    <dialog className={styles.forceEndDialog} ref={dialog} aria-labelledby="force-end-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <h2 id="force-end-title">End combat now?</h2>
      <p>This overrides unfinished actions, responses, rulings, and Freeze.</p>
      <p>Unfinished work is cancelled. Damage already applied, spent resources, Rolls, and history are preserved. No new damage or XP is applied.</p>
      <label className="st-field">End-combat note (optional)<textarea className="st-control" maxLength={1000} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} /></label>
      <div className={styles.actions}><button className="st-button" disabled={busy} onClick={() => dialog.current?.close()}>Keep fighting</button>
        <button className="st-button is-danger" disabled={disabled || busy} onClick={async () => {
          if (running.current) return; running.current = true; setBusy(true); setMessage("");
          try { if (await onEnd(note)) dialog.current?.close(); else setMessage("Combat could not be ended. Check the connection and try again."); }
          finally { running.current = false; setBusy(false); }
        }}>{busy ? "Ending combat…" : "End combat now"}</button></div>
      {message ? <p role="status">{message}</p> : null}
    </dialog>
  </>;
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { forceEndEncounter } from "./force-end-encounter-action";

/** Independent of the combat form's selected actor, Roll state and pending lock. */
export function ForceEndEncounterControl({ encounterId }: { encounterId: number }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await forceEndEncounter(encounterId, { confirmed: true, reason });
      const query = new URLSearchParams({
        campaign: String(result.campaignId), session: String(result.sessionId), scene: String(result.sceneId),
      });
      router.replace(`/heavens/tabletop?${query.toString()}`);
      router.refresh();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Encounter could not be ended. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section aria-label="End encounter" style={{ marginBlock: "1rem" }}>
    <button type="button" onClick={() => { setOpen(true); setError(null); }}
      aria-expanded={open} disabled={busy}>End encounter</button>
    {open ? <div role="group" aria-label="Confirm ending the encounter"
      style={{ border: "1px solid var(--border)", padding: "1rem", marginTop: "0.5rem" }}>
      <h3>End this encounter now?</h3>
      <p>G.O.D. override: stop unfinished actions and defenses, close Initiative, and return to the Scene.
        You do not need to finish any Rolls first.</p>
      <p>Existing Rolls, damage and history are kept. Unfinished results will not be applied.
        This does not award XP or refund resources already spent.</p>
      <label>Reason (optional)
        <input type="text" value={reason} maxLength={1000} disabled={busy}
          onChange={(event) => setReason(event.target.value)} />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
        <button type="button" disabled={busy} onClick={() => void finish()}>
          {busy ? "Ending encounter…" : "End encounter anyway"}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>Keep fighting</button>
      </div>
    </div> : null}
  </section>;
}

"use client";

import { Check, Dices } from "lucide-react";
import { useRef, useState } from "react";

import { emptyRoll, RollFields, rollInput, type RollDraft } from "@/features/combat-screen/form-controls";
import type { CalledRollAnswerInput } from "./called-check-service";
import styles from "./called-roll-control.module.css";

export function CalledRollControl({ requestId, disabled = false, onSubmit, onRecorded }: {
  requestId: number;
  disabled?: boolean;
  onSubmit: (input: CalledRollAnswerInput) => Promise<unknown>;
  onRecorded: () => void;
}) {
  const [draft, setDraft] = useState<RollDraft>(emptyRoll);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const attempt = useRef<CalledRollAnswerInput | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const input = { requestId, ...rollInput(draft) };
      if (!attempt.current || attempt.current.requestId !== requestId || attempt.current.method !== input.method
        || (attempt.current.enteredTotal ?? null) !== (input.enteredTotal ?? null)) {
        attempt.current = { ...input, idempotencyKey: crypto.randomUUID() };
      }
      await onSubmit(attempt.current);
      attempt.current = null;
      onRecorded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Roll could not be confirmed.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return <form className={styles.form} onSubmit={submit}>
    <RollFields value={draft} onChange={setDraft} disabled={disabled || busy} />
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <button className="st-button is-primary" type="submit" disabled={disabled || busy}>
      {draft.method === "physical" ? <Check size={16} aria-hidden="true" /> : <Dices size={16} aria-hidden="true" />}
      {busy ? "Recording..." : draft.method === "physical" ? "Record Physical Result" : "Roll Percentile"}
    </button>
  </form>;
}

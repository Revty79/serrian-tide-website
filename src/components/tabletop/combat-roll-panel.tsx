"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { parsePhysicalPercentileInput } from "@/features/tabletop-operations/roll-runtime";
import { selectCombatRollPrompt, type CombatRollPrompt } from "@/features/tabletop-operations/combat-roll-prompts";
import { BattleStage } from "./battle-layout";

export type CombatRollInput = {
  method: "random" | "entered";
  enteredTotal?: number;
  manualLabel?: string;
  manualTarget?: number;
};

export type CombatRollRecorded = { text: string; rollId?: number; resultTotal?: number };

/** Always mounted in battle mode, even before a declaration becomes rollable. */
export function CombatRollPanel({
  prompts,
  onSubmit,
  emptyMessage,
  unavailableReason,
  rolls = [],
}: {
  prompts: readonly CombatRollPrompt[];
  onSubmit: (prompt: CombatRollPrompt, input: CombatRollInput) => Promise<CombatRollRecorded>;
  emptyMessage: string;
  unavailableReason?: string | null;
  rolls?: readonly { id: number; effectiveResultTotal: number }[];
}) {
  const router = useRouter();
  const inputId = useId();
  const [requestedKey, setRequestedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { entered: string; label: string; target: string }>>({});
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<CombatRollRecorded & { error: boolean } | null>(null);
  const lastResult = message?.resultTotal ?? rolls.find(({ id }) => id === message?.rollId)?.effectiveResultTotal;
  const prompt = selectCombatRollPrompt(prompts, requestedKey);
  const key = prompt?.key ?? "none";
  const draft = drafts[key] ?? { entered: "", label: "", target: "" };
  const continuation = prompt?.kind === "firearm-trigger" || prompt?.kind === "firearm-finish";
  const blocked = !prompt?.ready || Boolean(unavailableReason && prompt?.kind !== "free") || submittedKey === key;

  function changeDraft(patch: Partial<typeof draft>) {
    setDrafts((current) => ({ ...current, [key]: { ...draft, ...patch } }));
  }

  async function submit(method: "random" | "entered") {
    if (!prompt || blocked || inFlight.current) return;
    setMessage(null);
    let input: CombatRollInput;
    try {
      input = { method };
      if (method === "entered" && !continuation) input.enteredTotal = parsePhysicalPercentileInput(draft.entered);
      if (prompt.manualTargetRequired) {
        if (!draft.label.trim() || !draft.target.trim() || !Number.isFinite(Number(draft.target))) {
          throw new Error("Enter the G.O.D. ruling label and a finite Roll target for this action.");
        }
        input.manualLabel = draft.label.trim();
        input.manualTarget = Number(draft.target);
      }
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : "Enter a valid percentile result." });
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      const recorded = await onSubmit(prompt, input);
      setMessage({ error: false, ...recorded });
      if (prompt.kind !== "free") setSubmittedKey(prompt.key);
      setDrafts((current) => ({ ...current, [key]: { ...draft, entered: "" } }));
      router.refresh();
    } catch (error) {
      // Keep the physical result and target on failure. Never silently generate a replacement Roll.
      setMessage({ error: true, text: error instanceof Error ? error.message : "The Roll could not be recorded. Refresh combat before retrying an uncertain submission." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <BattleStage eyebrow="DICE" title="Combat rolls" detail="Roll here without leaving combat. Choose the named action or defense to resolve it; Other d100 is only a general Roll.">
    <div aria-busy={busy}>
      {prompts.length > 1 ? <label className="st-field" htmlFor={`${inputId}-choice`}>
        <span>Roll for</span>
        <select id={`${inputId}-choice`} className="st-control" value={key} disabled={busy} onChange={(event) => setRequestedKey(event.target.value)}>
          {prompts.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}{entry.ready ? "" : " — not ready yet"}</option>)}
        </select>
      </label> : prompt ? <strong>{prompt.label}</strong> : null}
      <p role="status">{prompt?.detail ?? emptyMessage}</p>
      {unavailableReason ? <p role="status">{unavailableReason}</p> : null}
      {prompt?.manualTargetRequired ? <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <label className="st-field"><span>G.O.D. ruling label</span><input className="st-control" disabled={busy} value={draft.label} onChange={(event) => changeDraft({ label: event.target.value })} /></label>
        <label className="st-field"><span>Roll target</span><input className="st-control" disabled={busy} inputMode="decimal" value={draft.target} onChange={(event) => changeDraft({ target: event.target.value })} /></label>
      </div> : null}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "end" }}>
        {continuation ? <button className="st-button is-primary" type="button" disabled={busy || blocked} onClick={() => void submit("random")}>{prompt?.kind === "firearm-trigger" ? "Pull trigger" : "Finish firing — use recorded Roll"}</button> : <>
          <button className="st-button is-primary" type="button" disabled={busy || blocked} onClick={() => void submit("random")}>{busy ? "Recording…" : "Roll d100"}</button>
          <label className="st-field" htmlFor={`${inputId}-physical`}><span>Physical Roll (1–100; 00 = 100)</span><input id={`${inputId}-physical`} className="st-control" inputMode="numeric" pattern="[0-9]{1,3}" placeholder="01–99, 00 or 100" disabled={busy || blocked} value={draft.entered} onChange={(event) => changeDraft({ entered: event.target.value })} /></label>
          <button className="st-button is-secondary" type="button" disabled={busy || blocked || !draft.entered.trim()} onClick={() => void submit("entered")}>Enter roll</button>
        </>}
        <button className="st-button is-secondary" type="button" disabled={busy} onClick={() => router.refresh()}>Refresh combat</button>
      </div>
      {submittedKey === key ? <p role="status">Recorded for this action. Refreshing combat; this Roll will not be submitted again.</p> : null}
      {lastResult !== undefined ? <p><output aria-label="Recorded percentile result"><strong>Roll: {lastResult}</strong></output></p> : null}
      {message ? <p role={message.error ? "alert" : "status"}>{message.text}</p> : null}
    </div>
  </BattleStage>;
}

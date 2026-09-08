"use client";

import { useMemo, useState } from "react";

import {
  PERCENTILE_ROLL_LABEL,
  type RollMethod,
  type RollPurpose,
  type RollVisibility,
} from "@/features/tabletop-operations/roll-runtime";
import type {
  RollLedgerEntry,
  RollWorkspaceView,
} from "@/features/tabletop-operations/roll-runtime-service";
import type { PercentileTargetModifier } from "@/features/tabletop-operations/percentile-resolution";
import { resolvePercentileCheck } from "@/features/tabletop-operations/percentile-resolution";
import { TABLETOP_ROLL_PURPOSES } from "@/features/tabletop-operations/tabletop-ui-policy";

import { recordGodRoll } from "./roll-actions";

type RollTrayScope = "session" | "scene";

function methodLabel(method: RollMethod): string {
  return method === "random" ? "Website Roll" : "Physical Roll";
}

function parseModifiers(value: string, kind: "bonus" | "penalty"): PercentileTargetModifier[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const separator = line.lastIndexOf(":");
    const label = separator < 0 ? "" : line.slice(0, separator).trim();
    const magnitude = separator < 0 ? Number.NaN : Number(line.slice(separator + 1).trim());
    if (!label || !Number.isFinite(magnitude) || magnitude < 0) {
      throw new Error(`${kind === "bonus" ? "Bonus" : "Penalty"} line ${index + 1} must use Label: magnitude.`);
    }
    return { kind, label, magnitude };
  });
}

export function RollTray({
  workspace,
  defaultScope = "session",
  onRecorded,
}: {
  workspace: RollWorkspaceView;
  defaultScope?: RollTrayScope;
  onRecorded?: (roll: RollLedgerEntry) => void;
}) {
  const availableDefaultScope = defaultScope === "scene" && workspace.selectedScene ? "scene" : "session";
  const [scope, setScope] = useState<RollTrayScope>(availableDefaultScope);
  const [method, setMethod] = useState<RollMethod>("random");
  const [purposeKind, setPurposeKind] = useState<RollPurpose>("free");
  const [rollerCharacterId, setRollerCharacterId] = useState("");
  const [label, setLabel] = useState("");
  const [targetNumber, setTargetNumber] = useState("");
  const [targetReason, setTargetReason] = useState("");
  const [bonuses, setBonuses] = useState("");
  const [penalties, setPenalties] = useState("");
  const [visibility, setVisibility] = useState<RollVisibility>("god-only");
  const [notes, setNotes] = useState("");
  const [enteredTotal, setEnteredTotal] = useState("");
  const [lastRoll, setLastRoll] = useState<RollLedgerEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const targetPreview = useMemo(() => {
    const originalTarget = targetNumber === "" ? null : Number(targetNumber);
    if (originalTarget === null || !Number.isFinite(originalTarget)) return null;
    try {
      return resolvePercentileCheck({
        resultTotal: 50,
        originalTarget,
        modifiers: [
          ...parseModifiers(bonuses, "bonus"),
          ...parseModifiers(penalties, "penalty"),
        ],
      });
    } catch {
      return null;
    }
  }, [bonuses, penalties, targetNumber]);

  const characters = useMemo(() => workspace.characters.filter((character) => (
    scope === "scene" ? character.inScene : true
  )), [scope, workspace.characters]);
  const contextCompleted = workspace.session.status === "completed"
    || scope === "scene" && workspace.selectedScene?.status === "completed";

  function numericId(value: string): number | null {
    return value ? Number(value) : null;
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const rollRequest = {
        sessionId: workspace.session.id,
        sceneId: scope === "session" ? null : workspace.selectedScene?.id ?? null,
        encounterId: null,
        rollerCharacterId: numericId(rollerCharacterId),
        targetCharacterId: null,
        pendingActionId: null,
        reactionId: null,
        method,
        visibility,
        purposeKind,
        enteredTotal: method === "entered" ? Number(enteredTotal) : null,
        label,
        notes,
      };
      const modifiers = [
        ...parseModifiers(bonuses, "bonus"),
        ...parseModifiers(penalties, "penalty"),
      ];
      const roll = await recordGodRoll({
            ...rollRequest,
            targetNumber: null,
            mechanical: targetNumber === "" ? null : {
              governingSource: {
                kind: "manual",
                label: targetReason,
                originalTarget: Number(targetNumber),
              },
              modifiers,
            },
          });
      setLastRoll(roll);
      setFeedback({ kind: "success", message: roll.mechanicalSnapshot
        ? `Roll #${roll.id} and its objective mechanical snapshot were recorded.`
        : `Free Roll #${roll.id} was recorded without a mechanical interpretation.` });
      if (method === "entered") setEnteredTotal("");
      onRecorded?.(roll);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Roll could not be recorded." });
    } finally {
      setBusy(false);
    }
  }

  return <section className="roll-tray" aria-label="Shared Serrian Tide Roll Tray" aria-busy={busy}>
    <header>
      <div><span>SHARED ROLL RUNTIME</span><h6 className="font-sans">Roll Tray</h6><p>Record evidence for the table. The Roll never decides or executes an outcome.</p></div>
      <strong>{scope === "scene" ? workspace.selectedScene?.title : workspace.session.title}</strong>
    </header>

    {lastRoll ? <aside className={`roll-tray-result is-${lastRoll.status}`}>
      <strong>{lastRoll.resultTotal}</strong>
      <span>{PERCENTILE_ROLL_LABEL} · {methodLabel(lastRoll.method)}</span>
      <small>{lastRoll.method === "random" ? "Canonical result generated securely by the server." : "Physical/external result recorded as entered."}</small>
    </aside> : null}
    {feedback ? <p className={`tabletop-feedback is-${feedback.kind}`} role="status">{feedback.message}</p> : null}
    {contextCompleted ? <p className="tabletop-readonly-notice">This context is completed and its Roll history is read-only. Reopen it before recording a new scoped Roll.</p> : null}

    <div className="roll-tray-methods" aria-label="Roll method">
      <button type="button" className={method === "random" ? "is-selected" : ""} onClick={() => setMethod("random")}>Random</button>
      <button type="button" className={method === "entered" ? "is-selected" : ""} onClick={() => setMethod("entered")}>Enter Physical</button>
    </div>

    <div className="roll-tray-grid">
      <label><span>Scope</span><select value={scope} onChange={(event) => setScope(event.target.value as RollTrayScope)}>
        <option value="session">Current Session</option>
        {workspace.selectedScene ? <option value="scene">Current Scene</option> : null}
      </select></label>
      <label><span>Purpose</span><select value={purposeKind} onChange={(event) => setPurposeKind(event.target.value as RollPurpose)}>{TABLETOP_ROLL_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose[0].toUpperCase() + purpose.slice(1)}</option>)}</select></label>
      <div className="roll-tray-percentile-note"><span>Roll</span><strong>Serrian Tide Percentile</strong><small>One result from 1–100 for a free Roll or a recorded check.</small></div>
      {method === "entered" ? <label><span>Result</span><input type="number" min={1} max={100} step="1" value={enteredTotal} onChange={(event) => setEnteredTotal(event.target.value)} placeholder="73" /><small>Enter 100 for a physical percentile 00 result.</small></label> : <div className="roll-tray-random-note"><span>Result</span><strong>Generated securely by the server</strong><small>The browser cannot submit the random result.</small></div>}
      <label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as RollVisibility)}><option value="god-only">G.O.D. Only</option><option value="private">Private: Roller + G.O.D.</option><option value="table">Show to Table</option></select></label>
      <label><span>Character</span><select value={rollerCharacterId} onChange={(event) => setRollerCharacterId(event.target.value)}><option value="">No Character context</option>{characters.map((character) => <option key={character.characterId} value={character.characterId}>{character.name}</option>)}</select></label>
      <label className="is-wide"><span>Label</span><input maxLength={200} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Stealth, research, G.O.D. reference…" /></label>
      <label><span>Manual Roll-over Target</span><input type="number" step="any" value={targetNumber} onChange={(event) => setTargetNumber(event.target.value)} placeholder="Leave blank for a free Roll" /><small>A supplied target is evaluated once by the shared percentile engine.</small></label>
      {targetNumber !== "" ? <label><span>Target label / reason</span><input maxLength={200} value={targetReason} onChange={(event) => setTargetReason(event.target.value)} placeholder="G.O.D.-set target" /></label> : null}
      {targetNumber !== "" ? <label><span>Bonuses</span><textarea rows={2} value={bonuses} onChange={(event) => setBonuses(event.target.value)} placeholder={"Explicit bonus: 10"} /><small>One Label: magnitude per line. Bonuses lower the target.</small></label> : null}
      {targetNumber !== "" ? <label><span>Penalties</span><textarea rows={2} value={penalties} onChange={(event) => setPenalties(event.target.value)} placeholder="Explicit penalty: 20" /><small>One Label: magnitude per line. Penalties raise the target.</small></label> : null}
      {targetPreview ? <div className="roll-tray-target-preview"><span>Target preview</span><strong>{targetPreview.originalTarget} - {targetPreview.totalBonuses} + {targetPreview.totalPenalties} = {targetPreview.finalTarget}</strong><small>Original target - bonuses + penalties = final roll-over target. Pass 1 recalculates the recorded result on the server.</small></div> : null}
      <label className="is-wide"><span>Notes</span><textarea rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional table context." /></label>
    </div>
    <footer><button type="button" className="is-primary" disabled={busy || contextCompleted || method === "entered" && enteredTotal === ""} onClick={() => void submit()}>{busy ? "Recording…" : method === "random" ? "ROLL" : "RECORD PHYSICAL ROLL"}</button><span>Recorded Rolls remain in the Session ledger.</span></footer>
  </section>;
}

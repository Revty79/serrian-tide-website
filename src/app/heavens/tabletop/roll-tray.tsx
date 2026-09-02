"use client";

import { useMemo, useState } from "react";

import {
  ROLL_PURPOSES,
  ROLL_TYPES,
  rollTypeLabel,
  type RollMethod,
  type RollPurpose,
  type RollType,
  type RollVisibility,
} from "@/features/tabletop-operations/roll-runtime";
import type {
  RollLedgerEntry,
  RollWorkspaceView,
} from "@/features/tabletop-operations/roll-runtime-service";

import { recordGodRoll } from "./roll-actions";

export type RollTrayScope = "session" | "scene" | "encounter";

export type RollTrayPrefill = {
  scope?: RollTrayScope;
  rollerCharacterId?: number | null;
  targetCharacterId?: number | null;
  pendingActionId?: number | null;
  reactionId?: number | null;
  purposeKind?: RollPurpose;
  label?: string;
  rollType?: RollType;
};

function methodLabel(method: RollMethod): string {
  return method === "random" ? "System Random" : "Entered / Physical";
}

export function RollTray({
  workspace,
  defaultScope = "session",
  prefill = {},
  onRecorded,
}: {
  workspace: RollWorkspaceView;
  defaultScope?: RollTrayScope;
  prefill?: RollTrayPrefill;
  onRecorded?: (roll: RollLedgerEntry) => void;
}) {
  const availableDefaultScope = prefill.scope === "encounter" && workspace.selectedEncounter
    ? "encounter"
    : prefill.scope === "scene" && workspace.selectedScene
      ? "scene"
      : defaultScope === "encounter" && workspace.selectedEncounter
        ? "encounter"
        : defaultScope === "scene" && workspace.selectedScene
          ? "scene"
          : "session";
  const [scope, setScope] = useState<RollTrayScope>(availableDefaultScope);
  const [method, setMethod] = useState<RollMethod>("random");
  const [rollType, setRollType] = useState<RollType>(prefill.rollType ?? "percentile");
  const [purposeKind, setPurposeKind] = useState<RollPurpose>(prefill.purposeKind ?? "free");
  const [rollerCharacterId, setRollerCharacterId] = useState(prefill.rollerCharacterId ? String(prefill.rollerCharacterId) : "");
  const [targetCharacterId, setTargetCharacterId] = useState(prefill.targetCharacterId ? String(prefill.targetCharacterId) : "");
  const [pendingActionId, setPendingActionId] = useState(prefill.pendingActionId ? String(prefill.pendingActionId) : "");
  const [reactionId, setReactionId] = useState(prefill.reactionId ? String(prefill.reactionId) : "");
  const [label, setLabel] = useState(prefill.label ?? "");
  const [targetNumber, setTargetNumber] = useState("");
  const [visibility, setVisibility] = useState<RollVisibility>("god-only");
  const [notes, setNotes] = useState("");
  const [enteredTotal, setEnteredTotal] = useState("");
  const [lastRoll, setLastRoll] = useState<RollLedgerEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const characters = useMemo(() => workspace.characters.filter((character) => (
    scope === "encounter" ? character.inEncounter : scope === "scene" ? character.inScene : true
  )), [scope, workspace.characters]);
  const contextCompleted = workspace.session.status === "completed"
    || scope === "scene" && workspace.selectedScene?.status === "completed"
    || scope === "encounter" && workspace.selectedEncounter?.status === "completed";

  function numericId(value: string): number | null {
    return value ? Number(value) : null;
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const roll = await recordGodRoll({
        sessionId: workspace.session.id,
        sceneId: scope === "session" ? null : workspace.selectedScene?.id ?? null,
        encounterId: scope === "encounter" ? workspace.selectedEncounter?.id ?? null : null,
        rollerCharacterId: numericId(rollerCharacterId),
        targetCharacterId: numericId(targetCharacterId),
        pendingActionId: scope === "encounter" ? numericId(pendingActionId) : null,
        reactionId: scope === "encounter" ? numericId(reactionId) : null,
        method,
        rollType,
        visibility,
        purposeKind,
        enteredTotal: method === "entered" ? Number(enteredTotal) : null,
        label,
        targetNumber: targetNumber === "" ? null : Number(targetNumber),
        notes,
      });
      setLastRoll(roll);
      setFeedback({ kind: "success", message: `Roll #${roll.id} was recorded without adjudicating an outcome.` });
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
      <strong>{scope === "encounter" ? workspace.selectedEncounter?.title : scope === "scene" ? workspace.selectedScene?.title : workspace.session.title}</strong>
    </header>

    {lastRoll ? <aside className={`roll-tray-result is-${lastRoll.status}`}>
      <strong>{lastRoll.resultTotal}</strong>
      <span>{rollTypeLabel(lastRoll.rollType)} · {methodLabel(lastRoll.method)}</span>
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
        {workspace.selectedEncounter ? <option value="encounter">Current Encounter</option> : null}
      </select></label>
      <label><span>Purpose</span><select value={purposeKind} onChange={(event) => setPurposeKind(event.target.value as RollPurpose)}>{ROLL_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose[0].toUpperCase() + purpose.slice(1)}</option>)}</select></label>
      <label className="is-wide"><span>Roll Type</span><div className="roll-tray-dice-presets">{ROLL_TYPES.map((type) => <button type="button" className={rollType === type ? "is-selected" : ""} key={type} onClick={() => setRollType(type)}>{rollTypeLabel(type)}</button>)}</div><small>Serrian Tide supports percentile checks and canonical 0–9 hit-location rolls. Damage and Initiative are never rolled here.</small></label>
      {method === "entered" ? <label><span>Result</span><input type="number" min={rollType === "percentile" ? 1 : 0} max={rollType === "percentile" ? 100 : 9} step="1" value={enteredTotal} onChange={(event) => setEnteredTotal(event.target.value)} placeholder={rollType === "percentile" ? "73" : "0–9"} /><small>{rollType === "percentile" ? "Enter 100 for a physical percentile 00 result." : "Preserve the canonical hit-location value exactly as 0–9."}</small></label> : <div className="roll-tray-random-note"><span>Result</span><strong>Generated securely by the server</strong><small>The browser cannot submit the random result.</small></div>}
      <label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as RollVisibility)}><option value="god-only">G.O.D. Only</option><option value="table">Show to Table</option></select></label>
      <label><span>Character</span><select value={rollerCharacterId} onChange={(event) => setRollerCharacterId(event.target.value)}><option value="">No Character context</option>{characters.map((character) => <option key={character.characterId} value={character.characterId}>{character.name}</option>)}</select></label>
      <label><span>Target Character</span><select value={targetCharacterId} onChange={(event) => setTargetCharacterId(event.target.value)}><option value="">No target Character</option>{characters.map((character) => <option key={character.characterId} value={character.characterId}>{character.name}</option>)}</select></label>
      {scope === "encounter" ? <label><span>Pending Action</span><select value={pendingActionId} onChange={(event) => { setPendingActionId(event.target.value); if (event.target.value) setReactionId(""); }}><option value="">No action link</option>{workspace.pendingActions.map((action) => <option key={action.id} value={action.id}>#{action.id} · {action.label} · {action.status}</option>)}</select></label> : null}
      {scope === "encounter" ? <label><span>Reaction</span><select value={reactionId} onChange={(event) => { setReactionId(event.target.value); if (event.target.value) setPendingActionId(""); }}><option value="">No Reaction link</option>{workspace.reactions.map((reaction) => <option key={reaction.id} value={reaction.id}>#{reaction.id} · {reaction.reactionType} · {reaction.status}</option>)}</select></label> : null}
      <label className="is-wide"><span>Label</span><input maxLength={200} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Longsword Attack, Stealth, G.O.D. reference…" /></label>
      <label><span>Target Number</span><input type="number" step="any" value={targetNumber} onChange={(event) => setTargetNumber(event.target.value)} placeholder="Optional reference only" /><small>No success calculation is performed.</small></label>
      <label className="is-wide"><span>Notes</span><textarea rows={3} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional table context." /></label>
    </div>
    <footer><button type="button" className="is-primary" disabled={busy || contextCompleted || method === "entered" && enteredTotal === ""} onClick={() => void submit()}>{busy ? "Recording…" : method === "random" ? "ROLL" : "RECORD PHYSICAL ROLL"}</button><span>Target Number, action links, and Reaction links are context only.</span></footer>
  </section>;
}

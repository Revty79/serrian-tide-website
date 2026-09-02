"use client";

import { useState } from "react";

import type {
  RollLedgerEntry,
  RollLedgerFilters,
  RollWorkspaceView,
} from "@/features/tabletop-operations/roll-runtime-service";
import {
  rollTypeLabel,
  type RollMethod,
  type RollPurpose,
  type RollStatus,
  type RollType,
  type RollVisibility,
} from "@/features/tabletop-operations/roll-runtime";

import { getGodRollHistory, voidGodRoll } from "./roll-actions";
import { RollTray } from "./roll-tray";

type ScopeFilter = "session" | "scene" | "encounter";

function methodLabel(method: RollMethod): string {
  return method === "random" ? "System Random" : "Entered / Physical";
}

function visibilityLabel(visibility: RollVisibility): string {
  return visibility === "table" ? "Table-visible" : "G.O.D. Only";
}

function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function RollCard({
  roll,
  onVoided,
}: {
  roll: RollLedgerEntry;
  onVoided: (roll: RollLedgerEntry) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function voidRoll(): Promise<void> {
    const reason = window.prompt("Why is this Roll being voided? The original record will remain in history.");
    if (reason === null) return;
    setBusy(true);
    try {
      onVoided(await voidGodRoll(roll.sessionId, roll.id, reason));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The Roll could not be voided.");
    } finally {
      setBusy(false);
    }
  }
  return <article className={`roll-ledger-card is-${roll.status}`}>
    <header>
      <div><strong>{roll.resultTotal}</strong><span>{rollTypeLabel(roll.rollType)}</span></div>
      <div><b>{roll.label || "Unlabeled Roll"}</b><small>{roll.purposeKind} · {methodLabel(roll.method)} · {visibilityLabel(roll.visibility)}</small></div>
      <em>{roll.status}</em>
    </header>
    <div className="roll-ledger-context">
      <span>{roll.rollerCharacterName ?? "No Character"}{roll.targetCharacterName ? ` → ${roll.targetCharacterName}` : ""}</span>
      <span>{roll.encounterTitle ? `Encounter: ${roll.encounterTitle}` : roll.sceneTitle ? `Scene: ${roll.sceneTitle}` : "Session Roll"}</span>
      {roll.roundNumber !== null ? <span>Round {roll.roundNumber} / Step {roll.stepNumber}</span> : null}
      {roll.pendingActionId !== null ? <span>Action #{roll.pendingActionId} · {roll.pendingActionLabel}</span> : null}
      {roll.reactionId !== null ? <span>Reaction #{roll.reactionId} · {roll.reactionType}</span> : null}
    </div>
    <dl>
      <div><dt>Target Number</dt><dd>{roll.targetNumber ?? "Not supplied"}</dd></div>
      <div><dt>Recorded by</dt><dd>{roll.recordedByName}</dd></div>
      <div><dt>Recorded</dt><dd>{timestamp(roll.createdAt)}</dd></div>
    </dl>
    {roll.notes ? <p>{roll.notes}</p> : null}
    {roll.status === "voided" ? <aside><strong>VOIDED</strong><span>{roll.voidReason}</span><small>{roll.voidedAt ? timestamp(roll.voidedAt) : "Unknown time"} · {roll.voidedByName}</small></aside> : <footer><button type="button" disabled={busy} onClick={() => void voidRoll()}>{busy ? "Voiding…" : "Void Roll"}</button></footer>}
  </article>;
}

export function SessionRollWorkspace({ workspace }: { workspace: RollWorkspaceView }) {
  const [rolls, setRolls] = useState(workspace.initialHistory.rolls);
  const [nextBeforeId, setNextBeforeId] = useState(workspace.initialHistory.nextBeforeId);
  const [scope, setScope] = useState<ScopeFilter>("session");
  const [characterId, setCharacterId] = useState("");
  const [method, setMethod] = useState<RollMethod | "">("");
  const [rollType, setRollType] = useState<RollType | "">("");
  const [visibility, setVisibility] = useState<RollVisibility | "">("");
  const [purposeKind, setPurposeKind] = useState<RollPurpose | "">("");
  const [status, setStatus] = useState<RollStatus | "">("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  function filters(beforeId: number | null = null): RollLedgerFilters {
    return {
      sceneId: scope === "scene" || scope === "encounter" ? workspace.selectedScene?.id ?? null : null,
      encounterId: scope === "encounter" ? workspace.selectedEncounter?.id ?? null : null,
      characterId: characterId ? Number(characterId) : null,
      method: method || null,
      rollType: rollType || null,
      visibility: visibility || null,
      purposeKind: purposeKind || null,
      status: status || null,
      beforeId,
      limit: 50,
    };
  }

  async function applyFilters(): Promise<void> {
    setBusy(true);
    setFeedback("");
    try {
      const page = await getGodRollHistory(workspace.session.id, filters());
      setRolls(page.rolls);
      setNextBeforeId(page.nextBeforeId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Roll history could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function loadOlder(): Promise<void> {
    if (nextBeforeId === null) return;
    setBusy(true);
    setFeedback("");
    try {
      const page = await getGodRollHistory(workspace.session.id, filters(nextBeforeId));
      setRolls((current) => [...current, ...page.rolls.filter((roll) => !current.some(({ id }) => id === roll.id))]);
      setNextBeforeId(page.nextBeforeId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Older Rolls could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  function updateVoided(updated: RollLedgerEntry): void {
    setRolls((current) => current.map((roll) => roll.id === updated.id ? updated : roll));
  }

  return <section className="session-roll-workspace">
    <RollTray workspace={workspace} defaultScope="session" onRecorded={(roll) => setRolls((current) => [roll, ...current.filter(({ id }) => id !== roll.id)])} />
    <section className="roll-ledger">
      <header><div><span>IMMUTABLE TABLE HISTORY</span><h3 className="font-sans">Session Roll Ledger</h3><p>Latest 50 per page. Voids preserve the original Roll and context.</p></div><strong>{rolls.length} loaded</strong></header>
      <div className="roll-ledger-filters">
        <label><span>Context</span><select value={scope} onChange={(event) => setScope(event.target.value as ScopeFilter)}><option value="session">Current Session</option>{workspace.selectedScene ? <option value="scene">Current Scene</option> : null}{workspace.selectedEncounter ? <option value="encounter">Current Encounter</option> : null}</select></label>
        <label><span>Character</span><select value={characterId} onChange={(event) => setCharacterId(event.target.value)}><option value="">All Characters</option>{workspace.characters.map((character) => <option key={character.characterId} value={character.characterId}>{character.name}</option>)}</select></label>
        <label><span>Method</span><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="">All methods</option><option value="random">System Random</option><option value="entered">Entered / Physical</option></select></label>
        <label><span>Roll Type</span><select value={rollType} onChange={(event) => setRollType(event.target.value as typeof rollType)}><option value="">All Roll types</option><option value="percentile">Percentile / d100</option><option value="hit-location">Hit Location / d10 (0–9)</option></select></label>
        <label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="">All visibility</option><option value="table">Table-visible</option><option value="god-only">G.O.D. Only</option></select></label>
        <label><span>Purpose</span><select value={purposeKind} onChange={(event) => setPurposeKind(event.target.value as typeof purposeKind)}><option value="">All purposes</option>{["free", "attribute", "skill", "attack", "defense", "ability", "other"].map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="">Active and voided</option><option value="recorded">Recorded</option><option value="voided">Voided</option></select></label>
        <button type="button" disabled={busy || scope === "scene" && !workspace.selectedScene || scope === "encounter" && !workspace.selectedEncounter} onClick={() => void applyFilters()}>{busy ? "Loading…" : "Apply Filters"}</button>
      </div>
      {feedback ? <p className="tabletop-feedback is-error">{feedback}</p> : null}
      <div className="roll-ledger-list">{rolls.map((roll) => <RollCard key={roll.id} roll={roll} onVoided={updateVoided} />)}{!rolls.length ? <p className="tabletop-empty">No Rolls match the selected ledger filters.</p> : null}</div>
      {nextBeforeId !== null ? <button type="button" className="roll-ledger-load" disabled={busy} onClick={() => void loadOlder()}>{busy ? "Loading…" : "Load Older"}</button> : null}
    </section>
  </section>;
}

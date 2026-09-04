"use client";

import { useState } from "react";

import type { PercentileTargetModifier } from "@/features/tabletop-operations/percentile-resolution";
import type { RollMechanicalSnapshot } from "@/features/tabletop-operations/roll-mechanical-snapshot";
import type {
  RollLedgerEntry,
  RollLedgerFilters,
  RollWorkspaceView,
} from "@/features/tabletop-operations/roll-runtime-service";
import {
  getHitLocationFromPercentile,
  PERCENTILE_ROLL_LABEL,
  type RollMethod,
  type RollPurpose,
  type RollStatus,
  type RollVisibility,
} from "@/features/tabletop-operations/roll-runtime";

import {
  correctGodRoll,
  getGodRollHistory,
  recordGodRollRuling,
  voidGodRoll,
} from "./roll-actions";
import { RollTray } from "./roll-tray";

type ScopeFilter = "session" | "scene" | "encounter";

function methodLabel(method: RollMethod): string {
  return method === "random" ? "Website Roll" : "Physical Roll";
}

function visibilityLabel(visibility: RollVisibility): string {
  if (visibility === "table") return "Table-visible";
  if (visibility === "private") return "Private: Roller + G.O.D.";
  return "G.O.D. Only";
}

function timestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function governingSourceLabel(snapshot: RollMechanicalSnapshot): string {
  const source = snapshot.governingSource;
  if (source.kind === "manual") return `Manual: ${source.label}`;
  if (source.kind === "attribute") {
    return `${source.attributeDisplayName} (${source.attributeKey}) value ${source.attributeValue}`;
  }
  return `${source.skillPath.map(({ skillName }) => skillName).join(" → ")} · allocation #${source.allocationId} · ${source.calculatedPercentage}%`;
}

function SnapshotView({ snapshot, label }: { snapshot: RollMechanicalSnapshot; label: string }) {
  const result = snapshot.resolution;
  return <section className="roll-ledger-snapshot">
    <h5>{label}</h5>
    <p><strong>{governingSourceLabel(snapshot)}</strong></p>
    <dl>
      <div><dt>Raw Roll</dt><dd>{result.resultTotal} ({snapshot.rawResultSource === "original-roll" ? "original" : "corrected"})</dd></div>
      <div><dt>Original target</dt><dd>{result.originalTarget}</dd></div>
      <div><dt>Bonuses / penalties</dt><dd>−{result.totalBonuses} / +{result.totalPenalties}</dd></div>
      <div><dt>Final target</dt><dd>{result.finalTarget}</dd></div>
      <div><dt>Outcome</dt><dd>{result.outcome}</dd></div>
      <div><dt>Successes</dt><dd>{result.basicSuccess ? "1 basic" : "0 basic"} + {result.additionalSuccesses} additional = {result.totalSuccesses}</dd></div>
    </dl>
    {result.modifiers.length ? <ul>{result.modifiers.map((modifier, index) => <li key={`${modifier.kind}-${index}`}>{modifier.kind === "bonus" ? "Bonus" : "Penalty"}: {modifier.label} ({modifier.kind === "bonus" ? "−" : "+"}{modifier.magnitude})</li>)}</ul> : <small>No modifiers.</small>}
    <p>{[
      result.automaticSuccess ? "Automatic-success target" : null,
      result.impossibleTarget ? "Impossible target" : null,
      result.criticalFailure ? "Critical failure (01)" : null,
      result.doubleOtt ? "Double ott / critical success (100)" : null,
      result.requiresGodRuling ? "G.O.D. ruling required" : null,
    ].filter(Boolean).join(" · ") || "No exceptional flags."}</p>
    {result.rulingReasons.length ? <small>Ruling reasons: {result.rulingReasons.join(", ")}</small> : null}
  </section>;
}

function parseCorrectionModifiers(value: string): PercentileTargetModifier[] {
  if (!value.trim()) return [];
  return value.split(";").map((part, index) => {
    const [kind, label, rawMagnitude, ...extra] = part.split("|").map((entry) => entry.trim());
    const magnitude = Number(rawMagnitude);
    if ((kind !== "bonus" && kind !== "penalty") || !label || extra.length || !Number.isFinite(magnitude) || magnitude < 0) {
      throw new Error(`Modifier ${index + 1} must use bonus|label|magnitude or penalty|label|magnitude.`);
    }
    return { kind, label, magnitude };
  });
}

function RollCard({ roll, onChanged }: { roll: RollLedgerEntry; onChanged: (roll: RollLedgerEntry) => void }) {
  const [busy, setBusy] = useState(false);

  async function run(operation: () => Promise<RollLedgerEntry>): Promise<void> {
    setBusy(true);
    try {
      onChanged(await operation());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "The Roll could not be amended.");
    } finally {
      setBusy(false);
    }
  }

  async function voidRoll(): Promise<void> {
    const reason = window.prompt("Why is this Roll being voided? The original record will remain in history.");
    if (reason === null) return;
    await run(() => voidGodRoll(roll.sessionId, roll.id, reason));
  }

  async function correctRoll(): Promise<void> {
    const current = roll.effectiveMechanicalSnapshot;
    const reason = window.prompt("Why is this mechanical interpretation being corrected?");
    if (reason === null) return;
    const raw = window.prompt("Corrected raw percentile result. Leave blank to preserve the current effective raw result.", "");
    if (raw === null) return;
    const target = window.prompt("Corrected original roll-over target:", String(current?.resolution.originalTarget ?? roll.targetNumber ?? ""));
    if (target === null) return;
    const sourceLabel = window.prompt("Manual governing-source label or reason:", current ? governingSourceLabel(current) : "G.O.D. correction");
    if (sourceLabel === null) return;
    const modifierText = window.prompt("Modifiers separated by semicolons. Format: bonus|label|10; penalty|label|5", current?.resolution.modifiers.map((modifier) => `${modifier.kind}|${modifier.label}|${modifier.magnitude}`).join("; ") ?? "");
    if (modifierText === null) return;
    const rulingText = window.prompt("Optional G.O.D. ruling to record with this correction:", "");
    if (rulingText === null) return;
    await run(() => correctGodRoll({
      sessionId: roll.sessionId,
      rollId: roll.id,
      reason,
      correctedResultTotal: raw.trim() ? Number(raw) : null,
      governingSource: { kind: "manual", label: sourceLabel, originalTarget: Number(target) },
      modifiers: parseCorrectionModifiers(modifierText),
      rulingText,
    }));
  }

  async function addRuling(): Promise<void> {
    const reason = window.prompt("Why is this ruling being recorded?");
    if (reason === null) return;
    const rulingText = window.prompt("Enter the G.O.D. ruling or note:");
    if (rulingText === null) return;
    await run(() => recordGodRollRuling({ sessionId: roll.sessionId, rollId: roll.id, reason, rulingText }));
  }

  const hasCorrection = roll.amendments.some(({ kind }) => kind === "correction");
  return <article className={`roll-ledger-card is-${roll.status}`}>
    <header>
      <div><strong>{roll.effectiveResultTotal}</strong><span>{PERCENTILE_ROLL_LABEL}</span></div>
      <div><b>{roll.label || "Unlabeled Roll"}</b><small>{roll.purposeKind} · {methodLabel(roll.method)} · {visibilityLabel(roll.visibility)}</small>{roll.purposeKind === "attack" ? <small>Original Hit Location: {getHitLocationFromPercentile(roll.resultTotal)}{roll.effectiveResultTotal !== roll.resultTotal ? ` · Effective: ${getHitLocationFromPercentile(roll.effectiveResultTotal)}` : ""}</small> : null}</div>
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
      <div><dt>Original raw Roll</dt><dd>{roll.resultTotal}</dd></div>
      <div><dt>Compatibility target reference</dt><dd>{roll.targetNumber ?? "Not supplied"}</dd></div>
      <div><dt>Recorded by</dt><dd>{roll.recordedByName}</dd></div>
      <div><dt>Recorded</dt><dd>{timestamp(roll.createdAt)}</dd></div>
    </dl>
    {roll.mechanicalSnapshot ? <SnapshotView snapshot={roll.mechanicalSnapshot} label="Original mechanical snapshot" /> : <p>Unresolved/free historical Roll. No mechanical snapshot has been fabricated.</p>}
    {hasCorrection && roll.effectiveMechanicalSnapshot ? <SnapshotView snapshot={roll.effectiveMechanicalSnapshot} label="Latest effective interpretation" /> : null}
    {roll.notes ? <p>{roll.notes}</p> : null}
    {roll.rulingText ? <aside><strong>Latest G.O.D. ruling</strong><span>{roll.rulingText}</span></aside> : null}
    {roll.amendments.length ? <section><h5>Append-only amendment history</h5><ol>{roll.amendments.map((amendment) => <li key={amendment.id}><strong>#{amendment.id} · {amendment.kind}</strong> — {amendment.reason} <small>{timestamp(amendment.createdAt)} · {amendment.createdByName}</small>{amendment.rulingText ? <p>Ruling: {amendment.rulingText}</p> : null}{amendment.mechanicalSnapshot ? <SnapshotView snapshot={amendment.mechanicalSnapshot} label="Correction snapshot" /> : null}</li>)}</ol></section> : null}
    {roll.status === "voided" ? <aside><strong>VOIDED</strong><span>{roll.voidReason}</span><small>{roll.voidedAt ? timestamp(roll.voidedAt) : "Unknown time"} · {roll.voidedByName}{roll.legacyVoid ? " · legacy void metadata" : " · append-only void"}</small></aside> : null}
    <footer>
      {roll.status !== "voided" ? <button type="button" disabled={busy} onClick={() => void correctRoll()}>{busy ? "Working…" : "Correct Interpretation"}</button> : null}
      <button type="button" disabled={busy} onClick={() => void addRuling()}>{busy ? "Working…" : "Add Ruling"}</button>
      {roll.status !== "voided" ? <button type="button" disabled={busy} onClick={() => void voidRoll()}>{busy ? "Working…" : "Void Roll"}</button> : null}
    </footer>
  </article>;
}

export function SessionRollWorkspace({ workspace }: { workspace: RollWorkspaceView }) {
  const [rolls, setRolls] = useState(workspace.initialHistory.rolls);
  const [nextBeforeId, setNextBeforeId] = useState(workspace.initialHistory.nextBeforeId);
  const [scope, setScope] = useState<ScopeFilter>("session");
  const [characterId, setCharacterId] = useState("");
  const [method, setMethod] = useState<RollMethod | "">("");
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

  function updateRoll(updated: RollLedgerEntry): void {
    setRolls((current) => current.map((roll) => roll.id === updated.id ? updated : roll));
  }

  return <section className="session-roll-workspace">
    <RollTray workspace={workspace} defaultScope="session" onRecorded={(roll) => setRolls((current) => [roll, ...current.filter(({ id }) => id !== roll.id)])} />
    <section className="roll-ledger">
      <header><div><span>IMMUTABLE TABLE HISTORY</span><h3 className="font-sans">Session Roll Ledger</h3><p>Latest 50 per page. Corrections, rulings, and voids preserve the untouched original Roll.</p></div><strong>{rolls.length} loaded</strong></header>
      <div className="roll-ledger-filters">
        <label><span>Context</span><select value={scope} onChange={(event) => setScope(event.target.value as ScopeFilter)}><option value="session">Current Session</option>{workspace.selectedScene ? <option value="scene">Current Scene</option> : null}{workspace.selectedEncounter ? <option value="encounter">Current Encounter</option> : null}</select></label>
        <label><span>Character</span><select value={characterId} onChange={(event) => setCharacterId(event.target.value)}><option value="">All Characters</option>{workspace.characters.map((character) => <option key={character.characterId} value={character.characterId}>{character.name}</option>)}</select></label>
        <label><span>Method</span><select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="">All methods</option><option value="random">Website Roll</option><option value="entered">Physical Roll</option></select></label>
        <label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="">All visibility</option><option value="table">Table-visible</option><option value="private">Private</option><option value="god-only">G.O.D. Only</option></select></label>
        <label><span>Purpose</span><select value={purposeKind} onChange={(event) => setPurposeKind(event.target.value as typeof purposeKind)}><option value="">All purposes</option>{["free", "attribute", "skill", "attack", "defense", "ability", "other"].map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="">Active and voided</option><option value="recorded">Recorded</option><option value="voided">Voided</option></select></label>
        <button type="button" disabled={busy || scope === "scene" && !workspace.selectedScene || scope === "encounter" && !workspace.selectedEncounter} onClick={() => void applyFilters()}>{busy ? "Loading…" : "Apply Filters"}</button>
      </div>
      {feedback ? <p className="tabletop-feedback is-error">{feedback}</p> : null}
      <div className="roll-ledger-list">{rolls.map((roll) => <RollCard key={roll.id} roll={roll} onChanged={updateRoll} />)}{!rolls.length ? <p className="tabletop-empty">No Rolls match the selected ledger filters.</p> : null}</div>
      {nextBeforeId !== null ? <button type="button" className="roll-ledger-load" disabled={busy} onClick={() => void loadOlder()}>{busy ? "Loading…" : "Load Older"}</button> : null}
    </section>
  </section>;
}

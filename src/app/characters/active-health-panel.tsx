"use client";

import { useMemo, useState, type FormEvent } from "react";

import {
  addInjuryAction,
  applyLocalizedDamageAction,
  healAreaAction,
  healFullBodyAction,
  resolveInjuryAction,
  restoreAllHealthAction,
} from "./active-health-actions";
import {
  applyAreaHealing,
  applyFullBodyHealing,
  applyLocalizedDamage,
  resolveActiveHealthView,
} from "@/features/active-state/health-rules";
import type {
  ActiveHealthInjury,
  ActiveHealthTrack,
  ActiveHealthView,
} from "@/features/active-state/models";

import "./active-health-panel.css";

type Props = {
  health: ActiveHealthView;
  onHealthChange: (health: ActiveHealthView) => void;
  context?: "character" | "creature";
  disabled?: boolean;
};

type Feedback = { kind: "success" | "error"; message: string } | null;

function displayNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function numericInput(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function trackPrimary(track: Pick<ActiveHealthTrack, "maximumHp" | "remainingHp" | "damage">) {
  if (track.maximumHp === null || track.remainingHp === null) {
    return `Maximum unavailable · ${displayNumber(track.damage)} damage`;
  }
  return `${displayNumber(track.remainingHp)} / ${displayNumber(track.maximumHp)}`;
}

function trackDetail(track: Pick<ActiveHealthTrack, "damage" | "overDamage">) {
  const over = track.overDamage ?? 0;
  if (over > 0) return `${displayNumber(track.damage)} Damage · ${displayNumber(over)} Over`;
  if (track.damage > 0) return `${displayNumber(track.damage)} Damage`;
  return "Healthy";
}

function injuryLocation(injury: ActiveHealthInjury) {
  const exact = injury.hitLocationNameSnapshot
    ? `${injury.hitLocationNumber ?? "—"} · ${injury.hitLocationNameSnapshot}`
    : null;
  return [exact, injury.poolNameSnapshot].filter(Boolean).join(" → ");
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function ActiveHealthPanel({ health, onHealthChange, context = "character", disabled = false }: Props) {
  const [managing, setManaging] = useState(context === "creature" && !disabled);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [damageAmount, setDamageAmount] = useState("1");
  const [damageLocation, setDamageLocation] = useState("");
  const [damagePool, setDamagePool] = useState(health.anatomy.pools[0]?.key ?? "");
  const [damageInjuryName, setDamageInjuryName] = useState("");
  const [damageInjuryNotes, setDamageInjuryNotes] = useState("");
  const [fullHealAmount, setFullHealAmount] = useState("1");
  const [areaHealAmount, setAreaHealAmount] = useState("1");
  const [areaHealPool, setAreaHealPool] = useState(health.anatomy.pools[0]?.key ?? "");
  const [injuryName, setInjuryName] = useState("");
  const [injuryNotes, setInjuryNotes] = useState("");
  const [injuryDamage, setInjuryDamage] = useState("");
  const [injuryLocationNumber, setInjuryLocationNumber] = useState("");
  const [injuryPool, setInjuryPool] = useState(health.anatomy.pools[0]?.key ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const unresolved = health.injuries.filter((injury) => !injury.resolved);
  const history = health.injuries.filter((injury) => injury.resolved);
  const selectedDamageLocation = damageLocation === ""
    ? null
    : health.anatomy.hitLocations.find((entry) => entry.result === Number(damageLocation)) ?? null;
  const selectedInjuryLocation = injuryLocationNumber === ""
    ? null
    : health.anatomy.hitLocations.find((entry) => entry.result === Number(injuryLocationNumber)) ?? null;

  const damagePreview = useMemo(() => {
    try {
      const state = applyLocalizedDamage(health, health.anatomy, {
        amount: numericInput(damageAmount),
        hitLocationNumber: selectedDamageLocation?.result ?? null,
        poolKey: selectedDamageLocation ? null : damagePool,
      });
      return resolveActiveHealthView(health.anatomy, state);
    } catch {
      return null;
    }
  }, [damageAmount, damagePool, health, selectedDamageLocation]);
  const fullHealPreview = useMemo(() => {
    try {
      return resolveActiveHealthView(
        health.anatomy,
        applyFullBodyHealing(health, numericInput(fullHealAmount)),
      );
    } catch {
      return null;
    }
  }, [fullHealAmount, health]);
  const areaHealPreview = useMemo(() => {
    try {
      return resolveActiveHealthView(
        health.anatomy,
        applyAreaHealing(health, health.anatomy, areaHealPool, numericInput(areaHealAmount)),
      );
    } catch {
      return null;
    }
  }, [areaHealAmount, areaHealPool, health]);

  async function run(label: string, operation: () => Promise<ActiveHealthView>) {
    if (busy || disabled) return false;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await operation();
      onHealthChange(result);
      setFeedback({ kind: "success", message: label });
      return true;
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Active Health could not be updated.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitDamage(event: FormEvent) {
    event.preventDefault();
    const saved = await run("Damage was applied to Total Health and the selected HP Pool.", () =>
      applyLocalizedDamageAction({
        characterId: health.characterId,
        amount: numericInput(damageAmount),
        hitLocationNumber: selectedDamageLocation?.result ?? null,
        poolKey: selectedDamageLocation ? null : damagePool,
        injuryName: damageInjuryName,
        injuryNotes: damageInjuryNotes,
      }),
    );
    if (saved) {
      setDamageInjuryName("");
      setDamageInjuryNotes("");
    }
  }

  async function submitManualInjury(event: FormEvent) {
    event.preventDefault();
    const saved = await run("The Injury was added without changing damage tracks.", () =>
      addInjuryAction({
        characterId: health.characterId,
        hitLocationNumber: selectedInjuryLocation?.result ?? null,
        poolKey: selectedInjuryLocation ? null : injuryPool,
        name: injuryName,
        notes: injuryNotes,
        damageAmount: injuryDamage.trim() ? numericInput(injuryDamage) : null,
      }),
    );
    if (saved) {
      setInjuryName("");
      setInjuryNotes("");
      setInjuryDamage("");
    }
  }

  const damagePreviewPool = damagePreview?.tracks.find((track) =>
    track.key === (selectedDamageLocation?.poolKey ?? damagePool));
  const currentDamagePool = health.tracks.find((track) => track.key === damagePreviewPool?.key);
  const areaCurrent = health.tracks.find((track) => track.key === areaHealPool);
  const areaPreview = areaHealPreview?.tracks.find((track) => track.key === areaHealPool);

  return (
    <section className={`active-health active-health--${context}`} aria-labelledby={`active-health-${health.characterId}`}>
      <header className="active-health__heading">
        <div>
          <p>ACTIVE STATE · PHASE 1</p>
          <h3 id={`active-health-${health.characterId}`}>Current State</h3>
          <span>Persistent Campaign health · Damage is stored independently from permanent maximums.</span>
        </div>
        <button type="button" disabled={disabled} onClick={() => setManaging((value) => !value)}>
          {managing ? "Close Health Manager" : "Manage Health"}
        </button>
      </header>

      <div className="active-health__summary">
        <article className={health.total.overDamage && health.total.overDamage > 0 ? "is-over" : health.total.damage > 0 ? "is-damaged" : ""}>
          <span>Total Health</span>
          <strong>{trackPrimary(health.total)}</strong>
          <small>{trackDetail(health.total)}</small>
        </article>
        {health.tracks.map((track) => (
          <article key={track.key} className={track.overDamage && track.overDamage > 0 ? "is-over" : track.damage > 0 ? "is-damaged" : ""}>
            <span>{track.name}{track.orphaned ? " · Preserved" : ""}</span>
            <strong>{trackPrimary(track)}</strong>
            <small>{trackDetail(track)}{track.percentage !== null ? ` · ${displayNumber(track.percentage)}%` : ""}</small>
          </article>
        ))}
        <article className={health.unresolvedInjuryCount ? "is-damaged" : ""}>
          <span>Unresolved Injuries</span>
          <strong>{health.unresolvedInjuryCount}</strong>
          <small>{health.injuries.length} historical record{health.injuries.length === 1 ? "" : "s"}</small>
        </article>
      </div>
      {health.anatomy.maximumHpNote ? <p className="active-health__canon-note">{health.anatomy.maximumHpNote}</p> : null}

      {managing && !disabled ? (
        <div className="active-health__manager">
          {feedback ? <p className={`active-health__feedback is-${feedback.kind}`} aria-live="polite">{feedback.message}</p> : null}

          <div className="active-health__operations">
            <form onSubmit={submitDamage}>
              <header><p>DAMAGE</p><h4>Apply Localized Damage</h4></header>
              <label><span>Damage Amount</span><input required type="number" min="0.01" step="any" value={damageAmount} onChange={(event) => setDamageAmount(event.target.value)} /></label>
              <label><span>Exact d10 Hit Location</span><select value={damageLocation} onChange={(event) => setDamageLocation(event.target.value)}><option value="">Target an HP Pool directly</option>{health.anatomy.hitLocations.map((location) => <option key={location.result} value={location.result}>{location.result} · {location.name}{location.poolName ? ` → ${location.poolName}` : " · Unmapped"}</option>)}</select></label>
              {selectedDamageLocation ? <p className="active-health__mapping"><strong>{selectedDamageLocation.name}</strong> maps to <strong>{selectedDamageLocation.poolName ?? "no HP Pool"}</strong>.</p> : <label><span>HP Pool / Area</span><select required value={damagePool} onChange={(event) => setDamagePool(event.target.value)}>{health.anatomy.pools.map((pool) => <option key={pool.key} value={pool.key}>{pool.name}</option>)}</select></label>}
              <fieldset><legend>Optional Injury Record</legend><label><span>Injury Name</span><input value={damageInjuryName} maxLength={160} onChange={(event) => setDamageInjuryName(event.target.value)} placeholder="Puncture wound" /></label><label><span>Notes</span><textarea rows={3} value={damageInjuryNotes} onChange={(event) => setDamageInjuryNotes(event.target.value)} /></label></fieldset>
              <div className="active-health__preview"><span>Preview</span><strong>Total Damage: {displayNumber(health.totalDamage)} → {damagePreview ? displayNumber(damagePreview.totalDamage) : "—"}</strong><small>{currentDamagePool && damagePreviewPool ? `${currentDamagePool.name}: ${displayNumber(currentDamagePool.damage)} → ${displayNumber(damagePreviewPool.damage)} damage` : "Select a mapped location or HP Pool."}</small></div>
              <button disabled={busy || !damagePreview} type="submit">{busy ? "Saving…" : "Confirm Damage"}</button>
            </form>

            <form onSubmit={(event) => { event.preventDefault(); void run("Full-body healing was applied to Total Health and every damaged HP Pool.", () => healFullBodyAction(health.characterId, numericInput(fullHealAmount))); }}>
              <header><p>HEALING · FULL BODY</p><h4>Heal Every Track</h4></header>
              <label><span>Healing Amount</span><input required type="number" min="0.01" step="any" value={fullHealAmount} onChange={(event) => setFullHealAmount(event.target.value)} /></label>
              <div className="active-health__preview"><span>Preview</span><strong>Total Damage: {displayNumber(health.totalDamage)} → {fullHealPreview ? displayNumber(fullHealPreview.totalDamage) : "—"}</strong>{health.tracks.filter((track) => track.damage > 0).map((track) => <small key={track.key}>{track.name}: {displayNumber(track.damage)} → {displayNumber(fullHealPreview?.tracks.find((candidate) => candidate.key === track.key)?.damage ?? track.damage)}</small>)}</div>
              <button disabled={busy || !fullHealPreview} type="submit">{busy ? "Saving…" : "Confirm Full Body Heal"}</button>
            </form>

            <form onSubmit={(event) => { event.preventDefault(); void run("Area healing was applied without changing Total Damage.", () => healAreaAction(health.characterId, areaHealPool, numericInput(areaHealAmount))); }}>
              <header><p>HEALING · AREA</p><h4>Heal One HP Pool</h4></header>
              <label><span>HP Pool / Area</span><select required value={areaHealPool} onChange={(event) => setAreaHealPool(event.target.value)}>{health.anatomy.pools.map((pool) => <option key={pool.key} value={pool.key}>{pool.name}</option>)}</select></label>
              <label><span>Healing Amount</span><input required type="number" min="0.01" step="any" value={areaHealAmount} onChange={(event) => setAreaHealAmount(event.target.value)} /></label>
              <div className="active-health__preview"><span>Preview</span><strong>Total Damage remains {displayNumber(health.totalDamage)}</strong><small>{areaCurrent && areaPreview ? `${areaCurrent.name}: ${displayNumber(areaCurrent.damage)} → ${displayNumber(areaPreview.damage)} damage` : "Select an HP Pool."}</small></div>
              <button disabled={busy || !areaHealPreview} type="submit">{busy ? "Saving…" : "Confirm Area Heal"}</button>
            </form>
          </div>

          <section className="active-health__injuries">
            <header><div><p>PERSISTENT RECORD</p><h4>Injuries</h4></div><span>Healing does not automatically resolve an Injury.</span></header>
            <form className="active-health__manual-injury" onSubmit={submitManualInjury}>
              <label><span>Injury Name</span><input required maxLength={160} value={injuryName} onChange={(event) => setInjuryName(event.target.value)} /></label>
              <label><span>Exact Location</span><select value={injuryLocationNumber} onChange={(event) => setInjuryLocationNumber(event.target.value)}><option value="">Choose an HP Pool directly</option>{health.anatomy.hitLocations.map((location) => <option key={location.result} value={location.result}>{location.result} · {location.name}{location.poolName ? ` → ${location.poolName}` : " · Unmapped"}</option>)}</select></label>
              {selectedInjuryLocation ? <p className="active-health__mapping"><strong>{selectedInjuryLocation.name}</strong> maps to <strong>{selectedInjuryLocation.poolName ?? "no HP Pool"}</strong>.</p> : <label><span>HP Pool</span><select required value={injuryPool} onChange={(event) => setInjuryPool(event.target.value)}>{health.anatomy.pools.map((pool) => <option key={pool.key} value={pool.key}>{pool.name}</option>)}</select></label>}
              <label><span>Associated Damage · Optional</span><input type="number" min="0" step="any" value={injuryDamage} onChange={(event) => setInjuryDamage(event.target.value)} /></label>
              <label className="is-wide"><span>Notes</span><textarea rows={3} value={injuryNotes} onChange={(event) => setInjuryNotes(event.target.value)} /></label>
              <button disabled={busy} type="submit">Add Injury Without Changing HP</button>
            </form>
            <div className="active-health__injury-list">
              <h5>Unresolved · {unresolved.length}</h5>
              {unresolved.length ? unresolved.map((injury) => <InjuryCard key={injury.id} injury={injury} action={<button disabled={busy} type="button" onClick={() => void run(`${injury.name} was resolved and retained in history.`, () => resolveInjuryAction(health.characterId, injury.id))}>Resolve Injury</button>} />) : <p>No unresolved Injuries.</p>}
              <button className="active-health__history-toggle" type="button" onClick={() => setShowHistory((value) => !value)}>{showHistory ? "Hide" : "Show"} Resolved History · {history.length}</button>
              {showHistory ? history.map((injury) => <InjuryCard key={injury.id} injury={injury} />) : null}
            </div>
          </section>

          <section className="active-health__restore">
            <div><p>FULL RESET</p><h4>Restore All Health</h4><span>Sets Total and every HP Pool Damage to zero. All unresolved Injuries become resolved; Injury history is retained.</span></div>
            {!confirmRestore ? <button type="button" onClick={() => setConfirmRestore(true)}>Restore All Health…</button> : <div role="alertdialog" aria-label="Confirm Restore All Health"><strong>Confirm complete health restoration?</strong><button type="button" onClick={() => setConfirmRestore(false)}>Cancel</button><button className="is-danger" disabled={busy} type="button" onClick={() => void run("All health was restored. Injury history was retained.", async () => { const result = await restoreAllHealthAction(health.characterId, true); setConfirmRestore(false); return result; })}>Yes, Restore All</button></div>}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function InjuryCard({ injury, action }: { injury: ActiveHealthInjury; action?: React.ReactNode }) {
  return <article className={injury.resolved ? "is-resolved" : ""}><header><div><strong>{injury.name}</strong><span>{injuryLocation(injury)}</span></div>{action}</header><dl><div><dt>Associated Damage</dt><dd>{injury.damageAmount === null ? "Not recorded" : displayNumber(injury.damageAmount)}</dd></div><div><dt>Created</dt><dd>{formatTimestamp(injury.createdAt)}</dd></div>{injury.resolvedAt ? <div><dt>Resolved</dt><dd>{formatTimestamp(injury.resolvedAt)}</dd></div> : null}</dl>{injury.notes ? <p>{injury.notes}</p> : null}</article>;
}

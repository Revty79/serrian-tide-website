"use client";
import { useState } from "react";
import { readCompanionTravelHistory, readVesselCompanion } from "./companion-profile-actions";
import styles from "./companion-profile-editor.module.css";
import type { readCompanionProfile } from "./companion-profile-actions";
import { VesselBindingControl } from "./vessel-binding-control";

export function CompanionProfileHistory({ rows }: { rows: Awaited<ReturnType<typeof readCompanionProfile>>["history"] }) {
  return <details><summary>Companion Profile change history</summary><p>Latest 30 profile changes. Refresh the profile to update this list.</p>
    {rows.length ? <ol>{rows.map(row => <li key={row.id}><p>{row.summary}</p><small>{row.actor} · {new Date(row.createdAt).toLocaleString()} · Revision {row.revision}</small>
      <details><summary>Before and after</summary><strong>Before</strong>{row.before.map((line, i) => <p key={i}>{line}</p>)}<strong>After</strong>{row.after.map((line, i) => <p key={i}>{line}</p>)}</details>
    </li>)}</ol> : <p>No profile changes recorded.</p>}
  </details>;
}

export function CompanionTravelHistoryRows({ rows }: { rows: Awaited<ReturnType<typeof readCompanionTravelHistory>> }) {
  return rows.length ? <ol>{rows.map(row => <li key={row.id}><p>{row.before} → {row.after}</p><small>{row.actor} · {new Date(row.createdAt).toLocaleString()} · Revision {row.revision}</small></li>)}</ol> : <p>No travel changes recorded.</p>;
}

export function CompanionTravelHistory({ ownerCharacterId, creatureCharacterId }: { ownerCharacterId: number; creatureCharacterId: number }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof readCompanionTravelHistory>> | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError("");
    try { setRows(await readCompanionTravelHistory(ownerCharacterId, creatureCharacterId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read travel history."); }
    finally { setBusy(false); }
  }
  return <details><summary>Travel and Vessel change history</summary><p>Latest 30 saved changes. Item names reflect their current definitions when still available.</p>
    <button className="st-button is-secondary" type="button" disabled={busy} onClick={() => void load()}>Refresh travel history</button>
    {rows ? <CompanionTravelHistoryRows rows={rows} /> : null}
    {error ? <p role="alert">{error}</p> : null}
  </details>;
}

export function VesselCompanionLookup({ holderCharacterId, instanceId, disabled }: { holderCharacterId: number; instanceId: number; disabled?: boolean }) {
  const [view, setView] = useState<Awaited<ReturnType<typeof readVesselCompanion>> | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError("");
    try { setView(await readVesselCompanion(holderCharacterId, instanceId)); }
    catch (reason) { setView(null); setError(reason instanceof Error ? reason.message : "Could not read Vessel binding."); }
    finally { setBusy(false); }
  }
  return <div className={styles.lookup}><button className="st-button is-secondary" type="button" disabled={busy} onClick={() => void load()}>View Vessel binding</button>
    {view ? <p role="status">{view.label}: {view.creatureName ? `Bound to ${view.creatureName} · ${view.creatureIdentity}. Custody does not change Creature ownership.` : "No Creature bound."}</p> : null}
    {view?.canBind ? <VesselBindingControl ownerCharacterId={holderCharacterId} instanceId={instanceId} disabled={disabled} onBound={async () => {
      const result = await readVesselCompanion(holderCharacterId, instanceId); setView(result);
    }} /> : null}
    {view?.canBind && disabled ? <p>Save or discard inventory edits before binding a Creature.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

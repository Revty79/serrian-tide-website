"use client";
import { useState } from "react";
import { readCompanionTravelHistory, readVesselCompanion } from "./companion-profile-actions";
import styles from "./companion-profile-editor.module.css";

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
    {rows ? rows.length ? <ol>{rows.map(row => <li key={row.id}><p>{row.before} → {row.after}</p><small>{row.actor} · {new Date(row.createdAt).toLocaleString()} · Revision {row.revision}</small></li>)}</ol> : <p>No travel changes recorded.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </details>;
}

export function VesselCompanionLookup({ holderCharacterId, instanceId }: { holderCharacterId: number; instanceId: number }) {
  const [view, setView] = useState<Awaited<ReturnType<typeof readVesselCompanion>> | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setError("");
    try { setView(await readVesselCompanion(holderCharacterId, instanceId)); }
    catch (reason) { setView(null); setError(reason instanceof Error ? reason.message : "Could not read Vessel binding."); }
    finally { setBusy(false); }
  }
  return <div className={styles.lookup}><button className="st-button is-secondary" type="button" disabled={busy} onClick={() => void load()}>View Vessel binding</button>
    {view ? <p role="status">{view.label}: {view.creatureName ? `Bound to ${view.creatureName}. Custody does not change Creature ownership.` : "No Creature bound."}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

"use client";
import { useEffect, useState } from "react";
import { readUnownedCompanion } from "./companion-profile-actions";
import { CompanionProfileSummary } from "./companion-profile-summary";
import { CompanionProfileHistory, CompanionTravelHistoryRows } from "./companion-management-history";
import styles from "./companion-profile-editor.module.css";

export function UnownedCompanionInspector({ creatureCharacterId }: { creatureCharacterId: number }) {
  const [view, setView] = useState<Awaited<ReturnType<typeof readUnownedCompanion>> | null>(null);
  const [error, setError] = useState(""), [version, setVersion] = useState(0), [busy, setBusy] = useState(true);
  useEffect(() => {
    let current = true;
    void readUnownedCompanion(creatureCharacterId).then(result => { if (current) { setView(result); setError(""); } })
      .catch(reason => { if (current) { setView(null); setError(reason instanceof Error ? reason.message : "Could not inspect retained profile."); } })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [creatureCharacterId, version]);
  return <section className={styles.editor} aria-label="Retained companion management">
    <h4>Retained companion management</h4>
    <p>Unassigned Creature. The Campaign-owning G.O.D. can inspect retained settings and history here. Assign a valid owner before editing or confirming review.</p>
    {view ? <>
      <p><strong>{view.name}</strong> · {view.identity}{view.archived ? " · Archived" : ""}</p>
      <p>Normal travel: Not Yet Set. Previous travel and Vessel relationships remain in history.</p>
      <CompanionProfileSummary profile={view.profile} ownerAssigned={false} />
      <CompanionProfileHistory rows={view.profileHistory} />
      <details><summary>Travel and Vessel change history</summary><p>Latest 30 saved changes. Item names reflect their current definitions when still available.</p><CompanionTravelHistoryRows rows={view.travelHistory} /></details>
    </> : busy ? <p>Loading retained settings…</p> : null}
    <button type="button" className="st-button is-secondary" disabled={busy} onClick={() => { setBusy(true); setVersion(value => value + 1); }}>Refresh retained profile</button>
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </section>;
}

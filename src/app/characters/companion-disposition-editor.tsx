"use client";
import { useEffect, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { COMPANION_DISPOSITIONS, COMPANION_DISPOSITION_LABELS, type CompanionDisposition, type CompanionDispositionCommand } from "@/features/creatures/companion-disposition";
import { changeCompanionDisposition, readCompanionDisposition } from "./owned-creature-actions";
import styles from "./companion-disposition-editor.module.css";

type View = Awaited<ReturnType<typeof readCompanionDisposition>>;
export function CompanionDispositionEditor({ ownerCharacterId, creatureCharacterId, disabled, onChanged }: {
  ownerCharacterId: number; creatureCharacterId: number; disabled?: boolean; onChanged?: () => Promise<void>;
}) {
  const [view, setView] = useState<View | null>(null);
  const [choice, setChoice] = useState<CompanionDisposition | "">("");
  const [awayNote, setAwayNote] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [attempt, setAttempt] = useState<CompanionDispositionCommand | null>(null);
  function accept(result: View) {
    setView(result); setChoice(result.disposition ?? ""); setAwayNote(result.awayNote);
    setInstanceId(result.vessel ? String(result.vessel.instanceId) : ""); setAcknowledged(false); setAttempt(null);
  }
  useEffect(() => {
    let active = true;
    void readCompanionDisposition(ownerCharacterId, creatureCharacterId).then(result => { if (active) accept(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load travel disposition."); });
    return () => { active = false; };
  }, [ownerCharacterId, creatureCharacterId]);
  async function refresh() {
    setBusy(true); setError("");
    try { accept(await readCompanionDisposition(ownerCharacterId, creatureCharacterId)); await onChanged?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not refresh travel disposition."); }
    finally { setBusy(false); }
  }
  const unbinding = !!view?.vessel && (choice !== "vessel-bound" || instanceId !== String(view.vessel.instanceId));
  async function save() {
    if (!view || !choice) return;
    const command = attempt ?? { ownerCharacterId, creatureCharacterId, disposition: choice,
      awayNote: choice === "away" ? awayNote : "", vesselInstanceId: choice === "vessel-bound" ? Number(instanceId) : null,
      expectedRevision: view.revision, acknowledgeUnbind: acknowledged,
      requestKey: Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("") };
    setAttempt(command); setBusy(true); setError(""); setSaved("");
    try {
      await changeCompanionDisposition(command);
      accept(await readCompanionDisposition(ownerCharacterId, creatureCharacterId));
      await onChanged?.(); setSaved("Travel disposition saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save. Retry the same change or refresh to check its status."); }
    finally { setBusy(false); }
  }
  const locked = busy || disabled || !view?.canChange || !!attempt;
  return <section className={styles.editor} aria-label="Companion travel disposition">
    <h4>Travel disposition</h4>
    <p>This describes how the Creature normally travels with its owner. It does not change Scene presence or encounter participation.</p>
    {!view ? <p>Loading travel disposition…</p> : <>
      <p><strong>{view.disposition ? COMPANION_DISPOSITION_LABELS[view.disposition] : "Travel disposition not set"}</strong>{view.awayNote ? ` · ${view.awayNote}` : ""}</p>
      {view.vessel ? <p>{view.vessel.label}<br />{view.vessel.custody}</p> : null}
      {view.blockedReason ? <p>{view.blockedReason}</p> : null}
      {disabled ? <p>Save or discard Character edits before managing travel disposition.</p> : null}
      <GuidedField className="st-field" label="Normal travel" help="Accompanying means normally traveling with the owner. Away means normally elsewhere. Vessel-bound associates this individual with one exact Creature Vessel copy; actual release and recall come later.">
        <select className="st-control" value={choice} disabled={locked} onChange={e => { setChoice(e.target.value as CompanionDisposition); setAcknowledged(false); setSaved(""); }}>
          <option value="" disabled>Not yet set — choose deliberately</option>
          {COMPANION_DISPOSITIONS.map(value => <option key={value} value={value}>{COMPANION_DISPOSITION_LABELS[value]}</option>)}
        </select>
      </GuidedField>
      {choice === "away" ? <GuidedField className="st-field" label="Away location or note" help="Optional description, up to 240 characters, such as Stable at Greyhaven. This does not place the Creature on a map."><input className="st-control" maxLength={240} value={awayNote} disabled={locked} onChange={e => setAwayNote(e.target.value)} /></GuidedField> : null}
      {choice === "vessel-bound" ? <>
        <GuidedField className="st-field" label="Creature Vessel copy" help="Choose an unbound, enabled exact copy carried in the owner's inventory. Copies in accessible open containers are eligible. Existing bindings remain attached if custody later changes.">
          <select className="st-control" value={instanceId} disabled={locked} onChange={e => { setInstanceId(e.target.value); setAcknowledged(false); }}>
            <option value="">Choose an exact copy</option>
            {view.vessel ? <option value={view.vessel.instanceId}>{view.vessel.label} · current binding</option> : null}
            {view.vessels.map(vessel => <option key={vessel.instanceId} value={vessel.instanceId}>{vessel.label}</option>)}
          </select>
        </GuidedField>
        {!view.vessels.length ? <p>No other eligible Vessel copies are available. Enable Creature Vessel on an Item and obtain an exact copy for the owner.</p> : null}
      </> : null}
      {unbinding ? <label className="st-field"><span>This change will unbind {view.vessel!.label}. The Creature and Item will keep their identities and ownership.</span><span><input type="checkbox" checked={acknowledged} disabled={locked} onChange={e => setAcknowledged(e.target.checked)} /> I confirm unbinding the current Vessel.</span></label> : null}
      <div className={styles.actions}><button type="button" className="st-button is-primary" disabled={busy || disabled || !view.canChange || !choice || (choice === "vessel-bound" && !instanceId) || (unbinding && !acknowledged)} onClick={() => void save()}>{attempt ? "Retry same travel change" : "Save travel disposition"}</button><button type="button" className="st-button is-secondary" disabled={busy} onClick={() => void refresh()}>Refresh travel disposition</button></div>
      {attempt && !busy ? <p>The last change is retained for a safe retry. Refresh to read the saved state before editing again.</p> : null}
    </>}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{saved ? <p role="status">{saved}</p> : null}
  </section>;
}

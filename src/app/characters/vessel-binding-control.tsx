"use client";
import { useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { COMPANION_DISPOSITION_LABELS, type CompanionDispositionCommand } from "@/features/creatures/companion-disposition";
import { readVesselBindingOptions } from "./companion-profile-actions";
import { changeCompanionDisposition } from "./owned-creature-actions";
import styles from "./companion-profile-editor.module.css";

export function VesselBindingControl({ ownerCharacterId, instanceId, disabled, onBound }: {
  ownerCharacterId: number; instanceId: number; disabled?: boolean; onBound: () => Promise<void>;
}) {
  const [options, setOptions] = useState<Awaited<ReturnType<typeof readVesselBindingOptions>> | null>(null);
  const [selected, setSelected] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [attempt, setAttempt] = useState<CompanionDispositionCommand | null>(null);
  async function refresh() {
    setBusy(true); setError("");
    try { setOptions(await readVesselBindingOptions(ownerCharacterId, instanceId)); setSelected(""); setAttempt(null); }
    catch (reason) { setOptions(null); setError(reason instanceof Error ? reason.message : "Could not read eligible companions."); }
    finally { setBusy(false); }
  }
  const creature = options?.find(row => String(row.characterId) === selected);
  async function bind() {
    if (!creature && !attempt) return;
    const command: CompanionDispositionCommand = attempt ?? { ownerCharacterId, creatureCharacterId: creature!.characterId,
      expectedRevision: creature!.revision, requestKey: Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join(""),
      disposition: "vessel-bound", vesselInstanceId: instanceId, awayNote: "", acknowledgeUnbind: false };
    setAttempt(command); setBusy(true); setError("");
    try { await changeCompanionDisposition(command); await onBound(); setAttempt(null); setOptions(null); setSelected(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not bind. Retry this change or refresh before editing."); }
    finally { setBusy(false); }
  }
  return <div className={styles.binding} aria-label="Bind Creature to this Vessel">
    <button type="button" className="st-button is-secondary" disabled={busy || disabled} onClick={() => void refresh()}>{options || attempt ? "Refresh eligible Creatures" : "Bind Creature"}</button>
    {options ? options.length ? <>
      <GuidedField className="st-field" label="Owned Creature to bind" help="Choose an exact owned Creature. Already-bound Creatures are excluded. Binding changes normal travel only; it does not release, recall or deploy the Creature.">
        <select className="st-control" disabled={busy || disabled || !!attempt} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose an individual</option>{options.map(row => <option key={row.characterId} value={row.characterId}>{row.label}</option>)}</select>
      </GuidedField>
      {creature ? <p>Binding {creature.label} will change its normal travel disposition from {creature.disposition ? COMPANION_DISPOSITION_LABELS[creature.disposition] : "Not Yet Set"} to Vessel-bound, using this exact copy.</p> : null}
    </> : <p>No eligible unbound owned Creatures for this copy. The owner, Creature and Vessel must be active, the Vessel accessible, and both Characters outside active encounters.</p> : null}
    {creature || attempt ? <button type="button" className="st-button is-primary" disabled={busy || disabled} onClick={() => void bind()}>{attempt ? "Retry same Vessel binding" : "Save Vessel binding"}</button> : null}
    {attempt && !busy ? <p>The attempted change is retained for a safe retry. Refresh before choosing again.</p> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </div>;
}

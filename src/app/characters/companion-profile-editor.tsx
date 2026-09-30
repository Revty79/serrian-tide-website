"use client";
import { useEffect, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { COMPANION_ROLES, ROLE_LABELS, CONTROL_LABELS, COMBAT_PREFERENCE_LABELS, type CompanionRole, type CompanionRoleData, type CompanionProfileCommand, type CompanionControl, type CompanionCombatPreference } from "@/features/creatures/companion-profile";
import { changeCompanionProfile, readCompanionProfile } from "./companion-profile-actions";
import { CompanionProfileSummary } from "./companion-profile-summary";
import { CompanionTravelHistory, CompanionProfileHistory } from "./companion-management-history";
import styles from "./companion-profile-editor.module.css";
type View = Awaited<ReturnType<typeof readCompanionProfile>>;

export function CompanionProfileEditor({ ownerCharacterId, creatureCharacterId, disabled, onChanged }: {
  ownerCharacterId: number; creatureCharacterId: number; disabled?: boolean; onChanged?: () => Promise<void>;
}) {
  const [view, setView] = useState<View | null>(null), [selected, setSelected] = useState<CompanionRole[]>([]);
  const [roleData, setRoleData] = useState<CompanionRoleData[]>([]);
  const [control, setControl] = useState<CompanionControl | "">(""), [combat, setCombat] = useState<CompanionCombatPreference | "">("");
  const [notes, setNotes] = useState(""), [clear, setClear] = useState(false), [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState("");
  const [attempt, setAttempt] = useState<CompanionProfileCommand | null>(null);
  function accept(result: View) {
    setView(result); setSelected(result.roles.map(row => row.role)); setRoleData(result.roles);
    setControl(result.controlModel ?? ""); setCombat(result.combatPreference ?? ""); setNotes(result.relationshipNotes);
    setClear(false); setReview(false); setAttempt(null);
  }
  useEffect(() => {
    let active = true;
    void readCompanionProfile(ownerCharacterId, creatureCharacterId).then(result => { if (active) accept(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not read Companion Profile."); });
    return () => { active = false; };
  }, [ownerCharacterId, creatureCharacterId]);
  async function refresh() {
    setBusy(true); setError(""); setSaved("");
    try { accept(await readCompanionProfile(ownerCharacterId, creatureCharacterId)); await onChanged?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not refresh Companion Profile."); }
    finally { setBusy(false); }
  }
  function data(role: CompanionRole): CompanionRoleData {
    return roleData.find(row => row.role === role) ?? { role, otherLabel: "", maximumRiders: role === "mount" ? 1 : null, mountNotes: "" };
  }
  function editRole(role: CompanionRole, patch: Partial<CompanionRoleData>) {
    setRoleData(current => [...current.filter(row => row.role !== role), { ...data(role), ...patch }]); setSaved("");
  }
  const removingData = !!view?.roles.some(row => (row.role === "mount" || row.role === "other") && !selected.includes(row.role));
  const roleFingerprint = (roles: CompanionRoleData[]) => JSON.stringify([...roles].sort((a, b) => a.role.localeCompare(b.role)));
  const settingsChanged = !!view && (control !== (view.controlModel ?? "") || combat !== (view.combatPreference ?? "")
    || roleFingerprint(selected.map(data)) !== roleFingerprint(view.roles));
  async function save(operation: "configure" | "notes") {
    if (!view || (operation === "configure" && (!control || !combat))) return;
    const base = { ownerCharacterId, creatureCharacterId, expectedRevision: view.revision, relationshipNotes: notes,
      requestKey: Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("") };
    const command: CompanionProfileCommand = attempt ?? (operation === "notes" ? { ...base, operation } : {
      ...base, operation, controlModel: control as CompanionControl, combatPreference: combat as CompanionCombatPreference,
      roles: selected.map(data), acknowledgeRoleDataClear: clear, confirmOwnerReview: review });
    setAttempt(command); setBusy(true); setError(""); setSaved("");
    try {
      await changeCompanionProfile(command); accept(await readCompanionProfile(ownerCharacterId, creatureCharacterId));
      await onChanged?.(); setSaved("Companion Profile saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save. Retry the same change or refresh to check its status."); }
    finally { setBusy(false); }
  }
  const locked = busy || !!disabled || !!attempt;
  return <section className={styles.editor} aria-label="Companion Profile">
    <h4>Companion Profile</h4><p>Roles and preferences describe intended behavior. They grant no mechanics or control of gameplay actions.</p>
    {!view ? <p>Loading Companion Profile…</p> : <>
      <CompanionProfileSummary profile={view} />
      {view.blockedReason ? <p>{view.blockedReason}</p> : null}
      {disabled ? <p>Save or discard Character edits before changing this profile.</p> : null}
      {view.canConfigure ? <>
        <fieldset disabled={locked}><legend>Roles</legend><p>Choose any combination. Familiar grants no powers; Pack / Working uses existing Creature inventory and carrying rules.</p>
          <div className={styles.roles}>{COMPANION_ROLES.map(role => <label key={role}><input type="checkbox" checked={selected.includes(role)} onChange={event => {
            const checked = event.target.checked;
            if (checked && !roleData.some(row => row.role === role)) setRoleData(current => [...current, data(role)]);
            setSelected(current => checked ? [...current, role] : current.filter(value => value !== role)); setClear(false); setSaved("");
          }} />{ROLE_LABELS[role]}</label>)}</div>
        </fieldset>
        {selected.includes("other") ? <GuidedField className="st-field" label="Other role label" help="A meaningful narrative label, up to 120 characters, such as Messenger. It grants no mechanics."><input className="st-control" disabled={locked} maxLength={120} value={data("other").otherLabel} onChange={event => editRole("other", { otherLabel: event.target.value })} /></GuidedField> : null}
        <GuidedField className="st-field" label="Control Model" help="Player Directed records intended owner decision-making; Owner Commands records broad owner intent with G.O.D. adjudication; G.O.D. Directed records intended NPC control. None enables commands or actions here."><select className="st-control" disabled={locked} value={control} onChange={event => setControl(event.target.value as CompanionControl)}><option value="" disabled>Choose deliberately</option>{Object.entries(CONTROL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></GuidedField>
        <GuidedField className="st-field" label="Combat Preference" help="This records normal intent, not a hard restriction. It neither enrolls the Creature nor prevents attacks or self-defense. Every role/control/preference combination is allowed."><select className="st-control" disabled={locked} value={combat} onChange={event => setCombat(event.target.value as CompanionCombatPreference)}><option value="" disabled>Choose deliberately</option>{Object.entries(COMBAT_PREFERENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></GuidedField>
        {selected.includes("mount") ? <fieldset disabled={locked}><legend>Intended Mount capability</legend>
          <GuidedField className="st-field" label="Maximum intended riders" help="A positive whole rider count. Adding Mount starts at 1 for you to review. Size, strength and species never set capacity automatically; this does not mount anyone or calculate carrying weight."><input className="st-control" type="number" min={1} step={1} value={data("mount").maximumRiders ?? ""} onChange={event => editRole("mount", { maximumRiders: event.target.value ? Number(event.target.value) : null })} /></GuidedField>
          <GuidedField className="st-field" label="Mount notes" help="Optional narrative detail, up to 500 characters. No riding or equipment rules are inferred."><textarea className="st-control" maxLength={500} value={data("mount").mountNotes} onChange={event => editRole("mount", { mountNotes: event.target.value })} /></GuidedField>
        </fieldset> : null}
        {removingData ? <label><input type="checkbox" checked={clear} disabled={locked} onChange={event => setClear(event.target.checked)} /> I confirm clearing the removed role’s Mount fields or Other label.</label> : null}
        {view.requiresOwnerReview ? <label><input type="checkbox" checked={review} disabled={locked} onChange={event => setReview(event.target.checked)} /> I reviewed these settings for the current owner.</label> : null}
      </> : <p>Behavior settings are configured by the Campaign-owning G.O.D.</p>}
      <GuidedField className="st-field" label="Relationship notes" help="Optional narrative relationship detail, up to 1,000 characters. The owning Player may edit these notes. Text is never interpreted as mechanics."><textarea className="st-control" rows={3} maxLength={1000} disabled={locked || !view.canEditNotes} value={notes} onChange={event => { setNotes(event.target.value); setSaved(""); }} /></GuidedField>
      <div className={styles.actions}>
        {attempt ? <button className="st-button is-primary" type="button" disabled={busy || disabled} onClick={() => void save(attempt.operation)}>Retry same profile change</button> : <>
          {view.canConfigure ? <button className="st-button is-primary" type="button" disabled={locked || !control || !combat || (removingData && !clear) || (view.requiresOwnerReview && !review)} onClick={() => void save("configure")}>Save Companion Profile</button> : null}
          {view.canEditNotes ? <button className="st-button is-secondary" type="button" disabled={locked || settingsChanged} onClick={() => void save("notes")}>Save relationship notes only</button> : null}
        </>}
        <button className="st-button is-secondary" type="button" disabled={busy} onClick={() => void refresh()}>Refresh Companion Profile</button>
      </div>
      {settingsChanged ? <p>Use Save Companion Profile to save your role or behavior edits together with the notes.</p> : null}
      {attempt && !busy ? <p>The attempted change is retained for a safe retry. Refresh to read the saved state before editing again.</p> : null}
      <CompanionProfileHistory rows={view.history} />
    </>}
    <CompanionTravelHistory ownerCharacterId={ownerCharacterId} creatureCharacterId={creatureCharacterId} />
    {error ? <p className={styles.error} role="alert">{error}</p> : null}{saved ? <p role="status">{saved}</p> : null}
  </section>;
}

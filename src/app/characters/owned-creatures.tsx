"use client";
import { useEffect, useRef, useState } from "react";
import { GuidedField } from "@/components/field-guidance";
import { listCreatureOwners, setCreatureNpcOwner } from "@/app/heavens/npcs/actions";
import { readOwnedCreatures, renameOwnedCreature } from "./owned-creature-actions";
import { OwnedCreatureEquipment } from "./owned-creature-equipment";
import { CompanionProfileEditor } from "./companion-profile-editor";
import { CompanionProfileSummary } from "./companion-profile-summary";
import { CompanionDispositionEditor } from "./companion-disposition-editor";
import { COMPANION_DISPOSITION_LABELS } from "@/features/creatures/companion-disposition";
import styles from "./owned-creatures.module.css";

type View = Awaited<ReturnType<typeof readOwnedCreatures>>;
type Individual = View["individuals"][number];
function health(row: Individual) { return row.health.maximum === null ? `${row.health.damage} damage; maximum HP not authored` : `${row.health.current} / ${row.health.maximum} HP`; }
export function OwnedCreatures({ characterId, revision, onInventoryChange, equipmentDisabled }: { characterId: number; revision: string; equipmentDisabled?: boolean; onInventoryChange?: () => void | Promise<void> }) {
  const [view, setView] = useState<View | null>(null);
  const [selected, setSelected] = useState<Individual | null>(null);
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [owners, setOwners] = useState<Awaited<ReturnType<typeof listCreatureOwners>>>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    void readOwnedCreatures(characterId).then(result => { if (active) { setView(result); setSelected(current => current ? result.individuals.find(row => row.characterId === current.characterId) ?? null : null); setError(""); } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load companions."); });
    return () => { active = false; };
  }, [characterId, revision]);
  async function open(row: Individual) {
    setSelected(row); setName(row.name); setOwnerId(String(characterId)); setError(""); dialog.current?.showModal();
    if (view?.canManage) try { setOwners(await listCreatureOwners(view.campaignId)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load owners."); }
  }
  async function change(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); setView(await readOwnedCreatures(characterId)); dialog.current?.close(); setSelected(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The companion could not be updated."); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-label="Animals & Companions">
    <h3>Animals &amp; Companions</h3><p>Each is a separate living individual. Their body weight and abilities do not become your carried weight or abilities.</p>
    {error ? <p role="alert">{error}</p> : null}
    {!view ? <p>Loading companions…</p> : !view.individuals.length ? <p>No Creatures are assigned to this Character.</p> : <ul className={styles.list}>{view.individuals.map(row => <li key={row.characterId}>
      <div><strong>{row.name}</strong><span>{row.definitionName} · Individual #{row.characterId}</span><span>{health(row)} · {row.archivedAt ? "Archived" : row.health.injuries || row.health.damage ? "Injured" : "Active"}{row.conditions.length ? ` · ${row.conditions.map(condition => condition.name).join(", ")}` : ""}</span></div>
      <div><span>{row.travel.disposition ? COMPANION_DISPOSITION_LABELS[row.travel.disposition] : "Travel disposition not set"}{row.travel.awayNote ? ` · ${row.travel.awayNote}` : ""}</span>{row.travel.vessel ? <><span>{row.travel.vessel.label}</span><span>{row.travel.vessel.custody}</span></> : null}</div>
      <CompanionProfileSummary profile={row.companionProfile} />
      <button className="st-button is-secondary" type="button" onClick={() => void open(row)}>View companion</button>
    </li>)}</ul>}
    <dialog className={styles.dialog} ref={dialog} onClose={() => setSelected(null)} onCancel={event => { if (busy) event.preventDefault(); }}>
      {selected ? <section><h3>{selected.name}</h3><p>{selected.definitionName} ({selected.canonicalId}) · Individual #{selected.characterId}</p><p>{health(selected)} · {selected.health.injuries} unresolved injuries{selected.archivedAt ? " · Archived" : ""}</p>
        {selected.conditions.map((condition, index) => <p key={index}><strong>{condition.name}</strong>{condition.description ? ` — ${condition.description}` : ""}</p>)}
        <GuidedField className="st-field" label="Individual name" help="Changes only this Creature's name. Its identity, health, ownership, and history stay with it."><input className="st-control" value={name} maxLength={120} disabled={busy || !selected.canRename} onChange={event => setName(event.target.value)} /></GuidedField>
        {selected.canRename ? <button type="button" className="st-button is-primary" disabled={busy || !name.trim()} onClick={() => void change(() => renameOwnedCreature({ ownerCharacterId: characterId, creatureCharacterId: selected.characterId, name }))}>Save name</button> : null}
        {view?.canManage && !selected.archivedAt ? <><GuidedField className="st-field" label="Owning Character" help="G.O.D. transfer: moves this exact individual with its existing health and history. Unassigned removes ownership."><select className="st-control" disabled={busy} value={ownerId} onChange={event => setOwnerId(event.target.value)}><option value="">Unassigned</option>{owners.map(owner => <option key={owner.id} value={owner.id} disabled={owner.archived}>{owner.name} (#{owner.id}){owner.archived ? " · Archived" : ""}</option>)}</select></GuidedField><button type="button" className="st-button is-secondary" disabled={busy || ownerId === String(characterId)} onClick={() => void change(() => setCreatureNpcOwner({ campaignId: view.campaignId, characterId: selected.characterId, ownerCharacterId: ownerId ? Number(ownerId) : null, expectedOwnerCharacterId: characterId }))}>Assign owner</button></> : null}
        <OwnedCreatureEquipment disabled={equipmentDisabled} key={selected.characterId} ownerCharacterId={characterId} creatureCharacterId={selected.characterId} onChanged={onInventoryChange} />
        <CompanionDispositionEditor key={`travel-${selected.characterId}`} disabled={equipmentDisabled} ownerCharacterId={characterId} creatureCharacterId={selected.characterId} onChanged={async () => {
          const next = await readOwnedCreatures(characterId); setView(next);
          setSelected(current => current ? next.individuals.find(row => row.characterId === current.characterId) ?? null : null);
        }} />
        <CompanionProfileEditor key={`profile-${selected.characterId}`} disabled={equipmentDisabled} ownerCharacterId={characterId} creatureCharacterId={selected.characterId} onChanged={async () => {
          const next = await readOwnedCreatures(characterId); setView(next);
          setSelected(current => current ? next.individuals.find(row => row.characterId === current.characterId) ?? null : null);
        }} />
        {view?.canManage ? <a href={`/heavens/npcs/${selected.characterId}`}>Open NPC editor</a> : null}
        {error ? <p role="alert">{error}</p> : null}<footer><button className="st-button is-secondary" type="button" disabled={busy} onClick={() => dialog.current?.close()}>Close</button></footer>
      </section> : null}
    </dialog>
  </section>;
}

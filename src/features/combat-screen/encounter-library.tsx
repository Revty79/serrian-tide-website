"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignSessionEncounter, addCampaignSessionEncounterParticipant, type EncounterWorkspaceData } from "@/app/heavens/tabletop/encounter-actions";
import { ENCOUNTER_TYPES, type EncounterType } from "@/features/tabletop-operations/encounter-foundation";
import styles from "./encounter-library.module.css";
import { CreaturePicker } from "./creature-picker";

export function EncounterLibrary({ data }: { data: EncounterWorkspaceData }) {
  const router = useRouter();
  const [title, setTitle] = useState(""), [kind, setKind] = useState<EncounterType>("combat");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [arrival, setArrival] = useState("");
  const sceneLink = (id: number) => `/heavens/tabletop?campaign=${data.campaignId}&session=${data.sessionId}&scene=${data.sceneId}&workspace=scenes&encounter=${id}`;
  const selected = data.selectedEncounter;
  return <section className={styles.library} aria-label="Encounter library">
    <section className="tabletop-scene-library" aria-label="Encounter selector">
      <header><div><span>ENCOUNTER LIBRARY</span><h3 className="font-sans">Scene Encounters</h3></div></header>
      <div>{data.encounters.map((entry) => <Link key={entry.id} scroll={false} href={sceneLink(entry.id)} className={selected?.id === entry.id ? "is-selected" : undefined} aria-current={selected?.id === entry.id ? "true" : undefined}>
        <span><b>Encounter {entry.sequenceNumber}</b><em className={`is-${entry.status}`}>{entry.status}</em></span><strong>{entry.title}</strong><small>{entry.encounterType}</small>
      </Link>)}</div>
      {!data.encounters.length ? <p className="tabletop-empty">No encounters are prepared for this Scene.</p> : null}
    </section>
    {selected ? <article className="tabletop-scene-editor">
      <header><div><span>ENCOUNTER RECORD</span><h3 className="font-sans">{selected.title}</h3></div><em className={`tabletop-status is-${selected.status}`}>{selected.status}</em></header>
      {selected.description ? <p className={styles.description}>{selected.description}</p> : null}
      {data.canOperate ? <div className={styles.actions}><Link className="st-button is-primary" href={`/heavens/tabletop?combat=${selected.id}`}>{selected.status === "completed" ? "Inspect Combat" : "Open Combat"}</Link></div> : <p className="tabletop-readonly-notice">Only the Campaign-owning G.O.D. operates combat.</p>}
      <section className="tabletop-scene-members">
        <header><div><span>ENCOUNTER ROSTER</span><h4 className="font-sans">Combatants</h4></div><strong>{selected.participants.length} {selected.participants.length === 1 ? "combatant" : "combatants"}</strong></header>
        <div className="tabletop-scene-member-list">{selected.participants.map((entry) => <article className="tabletop-scene-member" key={entry.participantId}><div><span>{entry.kindLabel}</span><strong>{entry.name}</strong></div></article>)}</div>
        {!selected.participants.length ? <p className="tabletop-empty">No combatants added yet.</p> : null}
      </section>
      {selected.editable && data.canOperate ? <div className="tabletop-scene-available"><header><div><span>SCENE MEMBERS</span><h4 className="font-sans">Add to this Encounter</h4></div></header><form className={styles.addMember} onSubmit={async (event) => {
        event.preventDefault(); if (busy || !arrival) return; setBusy(true); setMessage("");
        try { await addCampaignSessionEncounterParticipant(selected.id, Number(arrival)); setMessage("Combatant added to the Encounter."); router.refresh(); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Combatant could not be added."); }
        finally { setBusy(false); }
      }}><label className="st-field">Scene member<select className="st-control" value={arrival} onChange={(event) => setArrival(event.target.value)}><option value="">Choose a Character or NPC</option>{selected.availableSceneMembers.map((entry) => <option key={entry.characterId} value={entry.characterId}>{entry.name}</option>)}</select></label><button className="st-button" disabled={busy || !arrival}>Add to encounter</button></form></div> : null}
      {selected.editable && data.canOperate ? <div className="tabletop-scene-available"><CreaturePicker key={selected.id} encounterId={selected.id} disabled={busy} onAdded={() => router.refresh()} /></div> : null}
    </article> : null}
    {data.canCreate ? <details className="tabletop-scene-editor"><summary>Prepare an encounter</summary><form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
      try { const entry = await createCampaignSessionEncounter({ sceneId: data.sceneId, title, encounterType: kind, sequenceNumber: Math.max(0, ...data.encounters.map((item) => item.sequenceNumber)) + 1, description: "", godNotes: "" }); router.push(sceneLink(entry.id), { scroll: false }); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Encounter could not be prepared."); }
      finally { setBusy(false); }
    }}><div className={styles.fields}><label className="st-field">Encounter title<input className="st-control" required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="st-field">Type<select className="st-control" value={kind} onChange={(event) => setKind(event.target.value as EncounterType)}>{ENCOUNTER_TYPES.map((entry) => <option key={entry}>{entry}</option>)}</select></label></div><button className="st-button is-primary" disabled={busy}>Prepare encounter</button></form></details> : null}
    {message ? <p className="tabletop-readonly-notice" role="status">{message}</p> : null}
  </section>;
}

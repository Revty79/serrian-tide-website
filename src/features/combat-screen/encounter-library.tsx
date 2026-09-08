"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCampaignSessionEncounter, addCampaignSessionEncounterParticipant, type EncounterWorkspaceData } from "@/app/heavens/tabletop/encounter-actions";
import { ENCOUNTER_TYPES, type EncounterType } from "@/features/tabletop-operations/encounter-foundation";
import styles from "./combat-screen.module.css";

export function EncounterLibrary({ data }: { data: EncounterWorkspaceData }) {
  const router = useRouter();
  const [title, setTitle] = useState(""), [kind, setKind] = useState<EncounterType>("combat");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [arrival, setArrival] = useState("");
  const sceneLink = (id: number) => `/heavens/tabletop?campaign=${data.campaignId}&session=${data.sessionId}&scene=${data.sceneId}&workspace=scenes&encounter=${id}`;
  const selected = data.selectedEncounter;
  return <section className={styles.library} aria-label="Encounter library"><h2>Encounters</h2>
    <ul>{data.encounters.map((entry) => <li key={entry.id}><span><strong>{entry.title}</strong> · {entry.encounterType} · {entry.status}</span><Link scroll={false} href={sceneLink(entry.id)} aria-current={selected?.id === entry.id ? "true" : undefined}>Select encounter</Link></li>)}</ul>
    {!data.encounters.length ? <p>No encounters are prepared for this Scene.</p> : null}
    {selected ? <article className={styles.window}><div className={styles.header}><div><p className={styles.eyebrow}>SCENE ENCOUNTER · {selected.status}</p><h3>{selected.title}</h3></div>{data.canOperate ? <Link className="st-button is-primary" href={`/heavens/tabletop?combat=${selected.id}`}>{selected.status === "completed" ? "Inspect Combat" : "Open Combat"}</Link> : <span>Only the Campaign-owning G.O.D. operates combat.</span>}</div>
      <p>{selected.description}</p><h4>Encounter roster</h4><ul>{selected.participants.map((entry) => <li key={entry.participantId}>{entry.name} · {entry.kindLabel}</li>)}</ul>
      {!selected.participants.length ? <p>No combatants added yet.</p> : null}
      {selected.editable && data.canOperate ? <form className={styles.actions} onSubmit={async (event) => {
        event.preventDefault(); if (busy || !arrival) return; setBusy(true); setMessage("");
        try { await addCampaignSessionEncounterParticipant(selected.id, Number(arrival)); setMessage("Combatant added to the Encounter."); router.refresh(); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Combatant could not be added."); }
        finally { setBusy(false); }
      }}><label className="st-field">Scene member<select className="st-control" value={arrival} onChange={(event) => setArrival(event.target.value)}><option value="">Choose a Character or NPC</option>{selected.availableSceneMembers.map((entry) => <option key={entry.characterId} value={entry.characterId}>{entry.name}</option>)}</select></label><button className="st-button" disabled={busy || !arrival}>Add to encounter</button></form> : null}
    </article> : null}
    {data.canCreate ? <details><summary>Prepare an encounter</summary><form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
      try { const entry = await createCampaignSessionEncounter({ sceneId: data.sceneId, title, encounterType: kind, sequenceNumber: Math.max(0, ...data.encounters.map((item) => item.sequenceNumber)) + 1, description: "", godNotes: "" }); router.push(sceneLink(entry.id), { scroll: false }); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Encounter could not be prepared."); }
      finally { setBusy(false); }
    }}><div className={styles.fields}><label className="st-field">Encounter title<input className="st-control" required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="st-field">Type<select className="st-control" value={kind} onChange={(event) => setKind(event.target.value as EncounterType)}>{ENCOUNTER_TYPES.map((entry) => <option key={entry}>{entry}</option>)}</select></label></div><button className="st-button is-primary" disabled={busy}>Prepare encounter</button></form></details> : null}
    {message ? <p role="alert">{message}</p> : null}
  </section>;
}

"use client";
import { useState } from "react";
import type { CampaignChoice, WorldCreationDraft } from "./campaign-associations";
import { worldApi } from "./client-api";
import styles from "./worlds.module.css";

export function CreationCampaignPicker({ initialChoices, selected, onChange }: { initialChoices: CampaignChoice[]; selected: WorldCreationDraft["associatedCampaigns"]; onChange: (value: WorldCreationDraft["associatedCampaigns"]) => void }) {
  const [choices, setChoices] = useState(initialChoices);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return <section className={styles.associationPicker} aria-label="Associated Campaigns">
    <h3>Associated Campaigns <small>Optional</small></h3>
    <p>Choose up to 100 existing Campaigns you own. Each will be linked to this World’s Primary History. You can choose a home and authoring context later. Creating a World needs no Campaign.</p>
    <label className="st-field">Find Campaigns<input className="st-control" type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className={styles.associationChoices}>{choices.filter(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item => <label key={item.id}><input type="checkbox" checked={selected.some(value => value.id === item.id)} onChange={event => onChange(event.target.checked ? [...selected, { id: item.id, updatedAt: item.updatedAt }] : selected.filter(value => value.id !== item.id))} />{item.name}</label>)}</div>
    {!choices.length && <p>No active Campaigns owned by you. You can create this World now and link Campaigns later.</p>}
    {selected.filter(item => !choices.some(choice => choice.id === item.id)).map(item => <label key={item.id}><input type="checkbox" checked onChange={() => onChange(selected.filter(value => value.id !== item.id))} />Previously selected Campaign #{item.id} is unavailable; deselect it to continue.</label>)}
    <button type="button" className="st-button is-secondary" disabled={pending} onClick={async () => { setPending(true);setError("");try { const data = await worldApi<{ choices: CampaignChoice[] }>("/api/worlds/campaign-contexts");setChoices(data.choices);onChange(selected.map(item => data.choices.find(choice => choice.id === item.id) ?? item).map(({ id, updatedAt }) => ({ id, updatedAt }))); } catch (failure) { setError(failure instanceof Error ? failure.message : "Choices could not be refreshed. Your draft is retained."); } finally { setPending(false); } }}>Refresh Campaign choices</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}

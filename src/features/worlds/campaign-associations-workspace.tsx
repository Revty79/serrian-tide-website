"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChronologyYearInput } from "./chronology-year-input";
import { Field } from "./world-field";
import { formatTime, type DatingSystem } from "./chronology";
import { contextUnavailableReason, type AssociationBundle, type CampaignContext } from "./campaign-associations";
import { SaveError, worldApi } from "./client-api";
import styles from "./worlds.module.css";

const yearText = (year: number | null, system: DatingSystem | null) => year === null ? "Year not authored" : formatTime({ version: 1, scale: "world-year", kind: "known", year }, system);
export function CampaignAssociationsWorkspace({ worldId, timelineId, worldArchived, review, displaySystem, onDirty, onSelectTimeline, onSaved }: {
  worldId: string; timelineId: string; worldArchived: boolean; review: boolean; displaySystem: DatingSystem | null;
  onDirty: (dirty: boolean) => void; onSelectTimeline: (id: string) => void;
  onSaved:()=>void;
}) {
  const [bundle, setBundle] = useState<AssociationBundle | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [editor, setEditor] = useState<CampaignContext | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [limit, setLimit] = useState(30);
  const [selectionId, setSelectionId] = useState("");
  const [viewingYear, setViewingYear] = useState<number | null>(null);
  const [selectionDirty, setSelectionDirty] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const url = `/api/worlds/${worldId}/campaigns`;
  async function reload() { const data = await worldApi<AssociationBundle>(`${url}${review ? "?review=1" : ""}`);setBundle(data);return data; }
  useEffect(() => { let alive = true;worldApi<AssociationBundle>(`${url}${review ? "?review=1" : ""}`).then(data => { if (alive) { setBundle(data);setSelectionId(data.contexts.some(row => row.id === data.selection.contextId) ? data.selection.contextId! : "");setViewingYear(data.contexts.some(row => row.id === data.selection.contextId) ? data.selection.viewingYear : null); } }).catch(failure => { if (alive) setError(failure.message); });return () => { alive = false; }; }, [url, review]);
  useEffect(() => { onDirty(selectionDirty || editorDirty);return () => onDirty(false); }, [selectionDirty, editorDirty, onDirty]);
  useEffect(() => { if (!selectionDirty) return;const warn = (event: BeforeUnloadEvent) => event.preventDefault();window.addEventListener("beforeunload", warn);return () => window.removeEventListener("beforeunload", warn); }, [selectionDirty]);
  useEffect(()=>{if(!selectionDirty&&!editorDirty)return;const guard=(event:MouseEvent)=>{const link=(event.target as Element).closest("a[href]");if(link&&!window.confirm("Leave this page and discard the unsaved association draft?")){event.preventDefault();event.stopPropagation();}};document.addEventListener("click",guard,true);return()=>document.removeEventListener("click",guard,true);},[selectionDirty,editorDirty]);
  async function save(command: object) { await worldApi(url, "POST", command);onSaved();setNotice("Association metadata saved. Gameplay is unchanged.");try { await reload(); } catch (failure) { setError(`Saved successfully; reload associations to see the result. ${failure instanceof Error ? failure.message : ""}`); } }
  async function act(command: object) { setPending(true);setError("");try { await save(command);return true; } catch (failure) { setError(failure instanceof Error ? failure.message : "The change failed.");return false; } finally { setPending(false); } }
  if (!bundle) return <section className={styles.story}><h2>Campaign Associations</h2>{error ? <p role="alert">{error}</p> : <p>Loading association metadata…</p>}<button className="st-button is-secondary" onClick={() => reload().catch(failure => setError(failure.message))}>Reload associations</button></section>;
  const available = bundle.contexts.filter(item => item.available);
  const selected = bundle.contexts.find(item => item.id === bundle.selection.contextId);
  const visible = bundle.contexts.filter(item => (showRemoved || !item.removed) && `${item.campaignName} ${item.timelineName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const canManage = bundle.canManage && !review;
  return <section className={styles.story} aria-label="Campaign Associations">
    <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Worlds authoring metadata</p><h2>Campaign Associations</h2></div>{canManage && !worldArchived && <button className="st-button" disabled={!bundle.choices.length} onClick={() => setEditor("new")}>Associate Campaign</button>}</div>
    {canManage && !bundle.choices.length && <p>No active Campaigns owned by you are available. This World works independently. <Link href="/heavens/campaigns/new">Create a Campaign in Heavens</Link> when you want to associate one.</p>}
    <p>Link existing Campaigns and timelines without changing Characters, session locations or Campaign time. Home, historical starting year and your authoring viewing year are separate choices.</p>
    {error && <div className={styles.feedback} role="alert"><p>{error}</p><button className="st-button is-secondary" disabled={pending} onClick={async () => { if (selectionDirty && !window.confirm("Discard the authoring selection draft and reload saved associations?")) return;try { const data = await reload();setSelectionId(data.contexts.some(row => row.id === data.selection.contextId) ? data.selection.contextId! : "");setViewingYear(data.selection.viewingYear);setSelectionDirty(false);setError(""); } catch (failure) { setError(failure instanceof Error ? failure.message : "Reload failed."); } }}>Load latest associations</button></div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {!review && <div className={styles.authoringContext}>
      <h3>Your selected authoring context</h3>
      <p>{selected ? `${selected.campaignName} · ${selected.timelineName} · ${yearText(bundle.selection.viewingYear, displaySystem)}${selected.available ? "" : ` · Unavailable: ${contextUnavailableReason(selected)}`}` : bundle.selection.contextId ? "Your retained authoring selection is in another World. Selecting here will deliberately replace it." : "No Campaign selected for Worlds authoring. Choose one explicitly when you need it."}</p>
      <p className={styles.caption}>The World timeline control browses history independently. Saving this selection chooses a Campaign, timeline and optional viewing year for authoring; it does not record travel or advance a live date.</p>
      {canManage && <form onSubmit={async event => { event.preventDefault();if (!selectionId) { setError("Choose a Campaign and timeline explicitly.");return; }setPending(true);setError("");try { const item = bundle.contexts.find(row => row.id === selectionId)!;await save({ action: "select", campaignId: item.campaignId, revision: bundle.selection.revision, contextId: item.id, viewingYear });setSelectionDirty(false);onSelectTimeline(item.timelineId); } catch (failure) { setError(failure instanceof Error ? failure.message : "Selection failed. Your draft is retained."); } finally { setPending(false); } }}><fieldset disabled={pending || worldArchived} className={styles.associationForm}>
        <Field label="Campaign and timeline for authoring" help="Choose an available association explicitly. Several Campaigns may share a timeline; Worlds never chooses a Campaign for you."><select className="st-control" required value={selectionId} onChange={event => { setSelectionId(event.target.value);setSelectionDirty(true); }}><option value="">Choose a Campaign and timeline</option>{available.map(item => <option key={item.id} value={item.id}>{item.campaignName} · {item.timelineName}</option>)}{selected && !selected.available && <option disabled value={selected.id}>{selected.campaignName} · {selected.timelineName} (unavailable)</option>}</select></Field>
        <ChronologyYearInput key={`${bundle.selection.revision}:${displaySystem?.id ?? "canonical"}`} label="Authoring viewing year" value={viewingYear} optional system={displaySystem} onChange={value => { setViewingYear(value);setSelectionDirty(true); }}/>
        <p className={styles.caption}>Blank means no authored viewing year. It does not copy the historical starting year or create a calendar day.</p>
        <button className="st-button" type="submit">Save authoring context</button>
      </fieldset></form>}
      {canManage && selected && <button className="st-button is-secondary" disabled={pending} onClick={async () => { if (window.confirm("Clear your Worlds authoring selection? Its association and home will remain.") && await act({ action: "select", campaignId: selected.campaignId, revision: bundle.selection.revision, contextId: null, viewingYear: null })) { setSelectionDirty(false);setSelectionId("");setViewingYear(null); } }}>Clear authoring selection</button>}
    </div>}
    <div className={styles.associationToolbar}><label className="st-field">Find associated Campaigns<input className="st-control" type="search" value={query} onChange={event => { setQuery(event.target.value);setLimit(30); }}/></label><label><input type="checkbox" checked={showRemoved} onChange={event => setShowRemoved(event.target.checked)}/>Show removed associations</label></div>
    {!bundle.contexts.length && <p>No Campaigns are associated. This World works independently; link an existing Campaign whenever you need an authoring context.</p>}
    <div className={styles.associationList}>{visible.slice(0, limit).map(item => { const home = bundle.homes.find(row => row.campaignId === item.campaignId)!;return <article key={item.id} className={styles.associationCard} data-context-id={item.id}>
      <h3>{item.campaignName}</h3><p>{item.timelineName}{item.home ? " · Home context" : home.contextId ? " · Home designated in another associated context" : " · No home designated"}</p>
      <p>Historical starting year: {yearText(item.startingYear, displaySystem)}</p>
      {!item.available && <p className={styles.caption}>Unavailable · {contextUnavailableReason(item)}. The original relationship is retained; no replacement is selected automatically.</p>}
      {item.ownershipAvailable && !review && <Link href={`/heavens/campaigns?campaign=${item.campaignId}`}>Open Campaign settings</Link>}
      {canManage && item.ownershipAvailable && <div className={styles.actions}>
        {item.available && <><button className="st-button is-secondary" disabled={pending} onClick={() => setEditor(item)}>Edit starting year</button><button className="st-button is-secondary" disabled={pending} onClick={() => { if (window.confirm("Designate this as the Campaign’s home? This is authoring metadata and does not move Characters.")) void act({ action: "home", campaignId: item.campaignId, revision: home.revision, contextId: item.id }); }}>Set as home</button></>}
        {item.home && <button className="st-button is-secondary" disabled={pending} onClick={() => { if (window.confirm("Clear the home designation while retaining every association?")) void act({ action: "home", campaignId: item.campaignId, revision: home.revision, contextId: null }); }}>Clear home</button>}
        <button className="st-button is-secondary" disabled={pending || item.removed && (item.worldArchived || item.campaignArchived || item.timelineArchived)} onClick={() => { if (item.removed) { void act({ action: "restore", campaignId: item.campaignId, id: item.id, revision: item.revision });return; }if (window.confirm(item.home ? "Remove this home association and explicitly clear the Campaign’s home? To keep another home, set that context as home first. Historical metadata is retained." : "Remove this association? Its starting year and identity will be kept for restoration. Your authoring selection will become unavailable if it uses this context.")) void act({ action: "remove", campaignId: item.campaignId, id: item.id, revision: item.revision, homeRevision: home.revision, ...(item.home ? { homeOutcome: "clear" } : {}) }); }}>{item.removed ? "Restore association" : "Remove association"}</button>
      </div>}
    </article>; })}</div>
    {visible.length > limit && <button className="st-button is-secondary" onClick={() => setLimit(value => value + 30)}>Show more associations</button>}
    {editor && <AssociationEditor key={editor === "new" ? "new" : `${editor.id}:${editor.revision}`} bundle={bundle} timelineId={timelineId} record={editor === "new" ? null : editor} displaySystem={displaySystem} onDirty={setEditorDirty} onClose={() => setEditor(null)} onReload={async () => { const fresh = await reload();if (editor !== "new") { const row = fresh.contexts.find(item => item.id === editor.id);if (!row) throw new Error("This association is unavailable. Your draft is retained.");setEditor(row); } }} onSave={async command => { await save(command);setEditor(null); }}/>}
  </section>;
}
function AssociationEditor({ bundle, timelineId, record, displaySystem, onDirty, onClose, onReload, onSave }: { bundle: AssociationBundle; timelineId: string; record: CampaignContext | null; displaySystem: DatingSystem | null; onDirty: (dirty: boolean) => void; onClose: () => void; onReload: () => Promise<void>; onSave: (command: object) => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [campaignId, setCampaignId] = useState<number | null>(record?.campaignId ?? null);
  const [startingYear, setStartingYear] = useState<number | null>(record?.startingYear ?? null);
  const [error, setError] = useState("");const [pending, setPending] = useState(false);const [conflict, setConflict] = useState(false);
  const dirty = campaignId !== (record?.campaignId ?? null) || startingYear !== (record?.startingYear ?? null);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => { onDirty(dirty);return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => { if (!dirty) return;const warn = (event: BeforeUnloadEvent) => event.preventDefault();window.addEventListener("beforeunload", warn);return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  function close() { if (!pending && (!dirty || window.confirm("Discard the unsaved association draft?"))) onClose(); }
  return <dialog ref={ref} className={styles.editor} aria-label={record ? "Edit association" : "Associate Campaign"} onCancel={event => { event.preventDefault();close(); }}><header className={styles.editorHeader}><h2>{record ? "Edit historical starting context" : "Associate Campaign"}</h2><button className="st-button is-secondary" type="button" disabled={pending} onClick={close}>Close association editor</button></header>
    <form onSubmit={async event => { event.preventDefault();setError("");setConflict(false);if (!campaignId || !Number.isFinite(startingYear ?? 0)) { setError("Choose a Campaign and enter a valid optional year.");return; }setPending(true);try { const choice = bundle.choices.find(item => item.id === campaignId);await onSave(record ? { action: "edit", campaignId, id: record.id, revision: record.revision, startingYear } : { action: "link", campaignId, campaignUpdatedAt: choice?.updatedAt, timelineId, startingYear }); } catch (failure) { setError(failure instanceof Error ? failure.message : "Save failed. Your draft is retained.");setConflict(failure instanceof SaveError && failure.status === 409); } finally { setPending(false); } }}>
      <fieldset className={styles.editorFields} disabled={pending}>
        {record ? <p>{record.campaignName} · {record.timelineName}</p> : <><Field label="Existing Campaign" help="Only active Campaigns owned by you are eligible. This links the Campaign to the timeline selected in the World workspace; it creates no Campaign."><select required className="st-control" value={campaignId ?? ""} onChange={event => setCampaignId(event.target.value ? Number(event.target.value) : null)}><option value="">Choose an existing Campaign</option>{bundle.choices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><p>Links to the selected World timeline. Choose another timeline in the workspace to add another association.</p></>}
        <ChronologyYearInput label="Historical starting year" value={startingYear} optional system={displaySystem} onChange={setStartingYear}/>
        <p className={styles.caption}>An authored starting context, not the authoring viewing year or a live Campaign date. Blank stays unknown. Years before divergence are allowed; no precise day is invented.</p>
      </fieldset>
      {error && <div className={styles.feedback} role="alert"><p>{error}</p>{conflict && <button className="st-button is-secondary" type="button" disabled={pending} onClick={async () => { if (!window.confirm("Discard this draft and load the latest saved associations?")) return;try { await onReload();if (!record) { setCampaignId(null);setStartingYear(null);setError("");setConflict(false); } } catch (failure) { setError(failure instanceof Error ? failure.message : "Reload failed."); } }}>Load latest associations</button>}</div>}
      <footer className={styles.editorFooter}><button className="st-button" disabled={pending} type="submit">{pending ? "Saving…" : "Save association"}</button></footer>
    </form>
  </dialog>;
}

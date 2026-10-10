"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { accuracyLabels, dateLabels, narrativeLabels, entryDraftSchema, eraDraftSchema, worldDraftSchema, type EntryDraft, type EntryRecord, type EraDraft, type EraRecord, type TagReference, type WorldDraft, type WorldRecord } from "./history";
import { Field } from "./world-field";
import { ChronologyYearInput } from "./chronology-year-input";
import type { DatingSystem } from "./chronology";
import { entryDraftOf, eraDraftOf, SaveError, worldDraftOf } from "./client-api";
import styles from "./worlds.module.css";
import { ClassificationPicker } from "./classification-picker";
export type EditorTarget = { kind: "world"; record?: WorldRecord; section?: "identity" | "introduction" | "history" } | { kind: "era"; record?: EraRecord } | { kind: "entry"; record?: EntryRecord };
export function WorldEditor({ target, tags, eras = [], datingSystems=[], displaySystem=null, onClose, onSave, onReload }: { target: EditorTarget; tags: TagReference[]; eras?: EraRecord[]; datingSystems?:DatingSystem[];displaySystem?:DatingSystem|null; onClose: () => void; onSave: (draft: WorldDraft | EraDraft | EntryDraft) => Promise<void>; onReload?: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [worldDraft, setWorldDraft] = useState(() => worldDraftOf(target.kind === "world" ? target.record : undefined));
  const initialSystem = target.kind !== "world" && target.record ? datingSystems.find((system)=>system.id === target.record?.datingSystemId) ?? null : displaySystem?.archived ? null : displaySystem;
  const source = {datingSystemId:initialSystem?.id ?? null,datingSystemRevision:initialSystem?.revision};
  const [eraDraft, setEraDraft] = useState(() => ({...eraDraftOf(target.kind === "era" ? target.record : undefined),...source}));
  const [entryDraft, setEntryDraft] = useState(() => ({...entryDraftOf(target.kind === "entry" ? target.record : undefined),...source}));
  const sourceDraft = target.kind === "era" ? eraDraft : entryDraft;
  const system = datingSystems.find((item)=>item.id === sourceDraft.datingSystemId) ?? null;
  const datingSelector = <Field label="Enter years using" help="This only changes the numbering used to enter years. Historical positions stay in canonical world years. Negative numbers mean Before; positive numbers mean After. Archived conventions can be retained on existing dates."><select value={system?.id ?? ""} onChange={(event)=>{const selected=datingSystems.find((item)=>item.id === event.target.value);const change={datingSystemId:selected?.id ?? null,datingSystemRevision:selected?.revision};if(target.kind === "era")setEraDraft({...eraDraft,...change});else setEntryDraft({...entryDraft,...change});}}><option value="">Canonical world years</option>{datingSystems.filter((item)=>!item.archived || (target.kind !== "world" && target.record?.datingSystemId === item.id)).map((item)=><option key={item.id} value={item.id}>{item.name}{item.archived ? " (archived context)" : ""}</option>)}</select></Field>;
  const draft = target.kind === "world" ? worldDraft : target.kind === "era" ? eraDraft : entryDraft;
  const [original] = useState(() => JSON.stringify(draft));
  const dirty = original !== JSON.stringify(draft);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  function close() { if (pending) return; if (dirty) setDiscard(true); else onClose(); }
  const section = target.kind === "world" ? target.section ?? "identity" : "identity";
  const title = target.kind === "world" ? !target.record ? "Create a world" : section === "introduction" ? "Write the introduction" : section === "history" ? "Write the historical overview" : "Edit world identity" : `${target.record ? "Edit" : "Create"} ${target.kind === "era" ? "historical era" : "historical entry"}`;
  return <dialog ref={dialog} className={styles.editor} aria-labelledby="world-editor-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header className={styles.editorHeader}><div><p className={styles.eyebrow}>World workshop · private</p><h2 id="world-editor-title">{title}</h2></div><button className="st-button is-ghost" type="button" aria-label="Close editor" disabled={pending} onClick={close}><X size={20} /></button></header>
    <form onSubmit={async (event) => {
      event.preventDefault(); setError(""); setConflict(false);
      const parsed = (target.kind === "world" ? worldDraftSchema : target.kind === "era" ? eraDraftSchema : entryDraftSchema).safeParse(draft);
      if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
      setPending(true);
      try { await onSave(parsed.data); } catch (failure) { setError(failure instanceof Error ? failure.message : "The save failed. Your draft is retained."); setConflict(failure instanceof SaveError && failure.status === 409); } finally { setPending(false); }
    }}>
    <fieldset disabled={pending} className={styles.editorFields}>
      {target.kind === "world" && section === "identity" && <>
        <Field label="World name" help="A name is all you need to begin. You can change it later."><input required maxLength={160} autoFocus value={worldDraft.name} onChange={(e) => setWorldDraft({...worldDraft,name:e.target.value})} /></Field>
        <Field label="Description" help="A short introduction shown in the world gallery. Optional; up to 4,000 characters."><textarea rows={3} maxLength={4000} value={worldDraft.description} onChange={(e) => setWorldDraft({...worldDraft,description:e.target.value})} /></Field>
        <Field label="Cover style" help="Choose a theme-based visual identity for this world. This does not change its content."><select value={worldDraft.tone} onChange={(e) => setWorldDraft({...worldDraft,tone:e.target.value as WorldDraft["tone"]})}><option value="primary">Verdant orbit</option><option value="secondary">Golden horizon</option><option value="info">Distant stars</option><option value="muted">Quiet ruins</option></select></Field>
        <ClassificationPicker tags={tags} selected={worldDraft.tagIds} onChange={(tagIds) => setWorldDraft({...worldDraft,tagIds})} />
      </>}
      {target.kind === "world" && section !== "identity" && <Field label={section === "introduction" ? "Introductory story" : "Historical overview"} help="Write a readable account in your own words. Paragraph breaks are preserved. Optional; up to 50,000 characters."><textarea autoFocus rows={14} maxLength={50000} value={section === "introduction" ? worldDraft.introduction : worldDraft.historicalOverview} onChange={(e) => setWorldDraft({...worldDraft,[section === "introduction" ? "introduction" : "historicalOverview"]:e.target.value})} /></Field>}
      {target.kind === "era" && <>
        <Field label="Era name" help="The name of a historical age in this world. This is separate from a classification tag."><input autoFocus required maxLength={160} value={eraDraft.name} onChange={(e) => setEraDraft({...eraDraft,name:e.target.value})} /></Field>
        <Field label="Historical account" help="Describe the era's history. Paragraphs are preserved; up to 50,000 characters."><textarea rows={5} maxLength={50000} value={eraDraft.description} onChange={(e) => setEraDraft({...eraDraft,description:e.target.value})} /></Field>
        {datingSelector}<p className={styles.muted}>Leave a boundary blank when it is unknown. Eras may overlap.</p>
        <div className={styles.twoColumns}>{(["startYear","endYear"] as const).map((key) => <ChronologyYearInput key={`${system?.id}:${key}`} label={key === "startYear" ? "Starting year" : "Ending year"} system={system} optional value={eraDraft[key]} onChange={(value)=>setEraDraft({...eraDraft,[key]:value})}/>)}</div>
        <Field label="Era band style" help="A theme color helps distinguish this era's band. Its name remains visible for accessibility."><select value={eraDraft.tone} onChange={(e) => setEraDraft({...eraDraft,tone:e.target.value as EraDraft["tone"]})}><option value="primary">Verdant</option><option value="secondary">Golden</option><option value="info">Starlight</option><option value="muted">Quiet</option></select></Field>
      </>}
      {target.kind === "entry" && <>
        <Field label="Entry title" help="Name the event, legend, development or historical account."><input autoFocus required maxLength={160} value={entryDraft.title} onChange={(e) => setEntryDraft({...entryDraft,title:e.target.value})} /></Field>
        <Field label="Historical account" help="Write what happened, or what is planned. Paragraphs are preserved; up to 50,000 characters."><textarea required rows={5} maxLength={50000} value={entryDraft.account} onChange={(e) => setEntryDraft({...entryDraft,account:e.target.value})} /></Field>
        <Field label="Date representation" help="An uncertain window means a single occurrence somewhere in that range. A duration spans the range. Undated entries have no implied year."><select value={entryDraft.time.kind} onChange={(e) => { const kind = e.target.value as EntryDraft["time"]["kind"]; const old = entryDraft.time; const year = "year" in old ? old.year : "startYear" in old ? old.startYear : 0; setEntryDraft({...entryDraft,time:kind === "undated" ? {version:1,scale:"world-year",kind} : kind === "known" || kind === "approximate" ? {version:1,scale:"world-year",kind,year} : {version:1,scale:"world-year",kind,startYear:year,endYear:"endYear" in old ? old.endYear : year}}); }} >{Object.entries(dateLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
        {entryDraft.time.kind !== "undated" && <>{datingSelector}<div className={styles.twoColumns}>{("year" in entryDraft.time ? ["year"] : ["startYear","endYear"]).map((key) => <ChronologyYearInput key={`${system?.id}:${entryDraft.time.kind}:${key}`} label={key === "year" ? "Year" : key === "startYear" ? "Starting year" : "Ending year"} system={system} value={entryDraft.time[key as keyof typeof entryDraft.time] as number} onChange={(value)=>setEntryDraft({...entryDraft,time:{...entryDraft.time,[key]:value ?? NaN} as EntryDraft["time"]})}/>)}</div></>}
        <div className={styles.twoColumns}>
          <Field label="Historical accuracy" help="Established, disputed, unverified and disproven describe confidence in the account. They do not decide whether it has happened."><select value={entryDraft.accuracy} onChange={(e) => setEntryDraft({...entryDraft,accuracy:e.target.value as EntryDraft["accuracy"]})}>{Object.entries(accuracyLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
          <Field label="Narrative status" help="Planned development remains a plan until you explicitly change it to recorded history. Browsing time never changes this."><select value={entryDraft.narrative} onChange={(e) => setEntryDraft({...entryDraft,narrative:e.target.value as EntryDraft["narrative"]})}>{Object.entries(narrativeLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
        </div>
        <details className={styles.optional}><summary>Historical eras & author notes</summary><p className={styles.muted}>Associate this entry with any number of this world&apos;s eras, or none.</p><div className={styles.tagOptions}>{eras.filter((era) => !era.archived || entryDraft.eraIds.includes(era.id)).map((era) => <label key={era.id}><input type="checkbox" checked={entryDraft.eraIds.includes(era.id)} onChange={(e) => setEntryDraft({...entryDraft,eraIds:e.target.checked ? [...entryDraft.eraIds,era.id] : entryDraft.eraIds.filter((id) => id !== era.id)})} /><span>{era.name}{era.archived && <small>Archived association retained</small>}</span></label>)}</div><Field label="Author notes" help="Optional private writing notes, separate from the historical account. Up to 50,000 characters."><textarea rows={3} maxLength={50000} value={entryDraft.notes} onChange={(e) => setEntryDraft({...entryDraft,notes:e.target.value})} /></Field></details>
      </>}
    </fieldset>
    {error && <div className={styles.feedback} role="alert"><p>{error}</p>{conflict && onReload && <button type="button" className="st-button is-secondary" disabled={pending} onClick={async () => { if (!window.confirm("Discard this draft and load the latest saved version?")) return; setPending(true); try { await onReload(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not reload. Your draft is retained."); } finally { setPending(false); } }}>Load latest version</button>}</div>}
    {discard && <div className={styles.feedback} role="alert"><p>Discard your unsaved draft?</p><div className={styles.actions}><button type="button" className="st-button is-secondary" onClick={() => setDiscard(false)}>Keep writing</button><button type="button" className="st-button is-danger" onClick={onClose}>Discard draft</button></div></div>}
    <footer className={styles.editorFooter}><span className={styles.muted}>{pending ? "Saving…" : dirty ? "Unsaved draft" : "Ready to write"}</span><div className={styles.actions}><button type="button" className="st-button is-secondary" disabled={pending} onClick={close}>Cancel</button><button className="st-button" disabled={pending}>{pending ? "Saving…" : target.record ? "Save changes" : target.kind === "world" ? "Create world" : "Save history"}</button></div></footer>
    </form>
  </dialog>;
}

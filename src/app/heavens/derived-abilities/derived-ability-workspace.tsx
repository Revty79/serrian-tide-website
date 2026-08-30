"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DERIVED_ABILITY_ATTRIBUTE_KEYS } from "@/features/derived-abilities/models";

import {
  deleteDerivedAbility,
  getDerivedAbility,
  listDerivedAbilities,
  saveDerivedAbility,
  type DerivedAbilityDraft,
  type DerivedAbilityLibraryFilters,
  type DerivedAbilityLibraryResult,
  type DerivedAbilitySummary,
} from "./actions";

function newDraft(): DerivedAbilityDraft {
  return {
    core: {
      name: "",
      description: "",
      mechanicalEffect: "",
      sourceSystem: null,
      sourceExternalId: null,
    },
    trigger: {
      triggerType: "attribute",
      attributeKey: "STR",
      minimumScore: 40,
      sortOrder: 0,
    },
  };
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "derived-ability-field is-wide" : "derived-ability-field"}><span>{label}</span>{children}</label>;
}

export function DerivedAbilityWorkspace({
  initialLibrary,
  username,
}: {
  initialLibrary: DerivedAbilityLibraryResult;
  username: string;
}) {
  const [filters, setFilters] = useState<DerivedAbilityLibraryFilters>({ page: 1, pageSize: 40 });
  const [library, setLibrary] = useState(initialLibrary);
  const [draft, setDraft] = useState<DerivedAbilityDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState<{ kind: "open"; ability: DerivedAbilitySummary } | { kind: "new" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadLibrary = useCallback(async (next: DerivedAbilityLibraryFilters) => {
    setLoadingLibrary(true);
    try {
      setLibrary(await listDerivedAbilities(next));
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Derived Ability Library could not be loaded." });
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLibrary(filters), 180);
    return () => window.clearTimeout(timer);
  }, [filters, loadLibrary]);

  async function openAbility(summary: DerivedAbilitySummary) {
    setLoadingEditor(true);
    setFeedback(null);
    try {
      const aggregate = await getDerivedAbility(summary.id);
      if (!aggregate) throw new Error("Derived Ability not found.");
      setDraft(aggregate);
      setDirty(false);
      setConfirmDelete(false);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "That Derived Ability could not be loaded." });
    } finally {
      setLoadingEditor(false);
    }
  }

  function choose(summary: DerivedAbilitySummary) {
    if (dirty) setPending({ kind: "open", ability: summary });
    else void openAbility(summary);
  }

  function createNew() {
    setDraft(newDraft());
    setDirty(false);
    setFeedback(null);
    setConfirmDelete(false);
  }

  function change(next: DerivedAbilityDraft) {
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }

  async function persist() {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveDerivedAbility(draft);
      setDraft(saved);
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.core.name} was saved.` });
      await loadLibrary(filters);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Derived Ability could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    setSaving(true);
    try {
      const name = draft.core.name;
      await deleteDerivedAbility(draft.id);
      setDraft(null);
      setDirty(false);
      setConfirmDelete(false);
      setFeedback({ kind: "success", message: `${name} was deleted.` });
      await loadLibrary(filters);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "The Derived Ability could not be deleted." });
    } finally {
      setSaving(false);
    }
  }

  function discardAndContinue() {
    const next = pending;
    setPending(null);
    if (!next) return;
    if (next.kind === "new") createNew();
    else void openAbility(next.ability);
  }

  const core = draft?.core;
  const campaignAssignmentCount =
    draft &&
    "campaignAssignmentCount" in draft &&
    typeof draft.campaignAssignmentCount === "number"
      ? draft.campaignAssignmentCount
      : null;
  return (
    <main className="skills-page derived-abilities-page">
      <header className="skills-page__header">
        <div className="skills-page__brand"><Link href="/heavens" className="font-evanescent derived-ability-brand">SERRIAN<br />TIDE</Link></div>
        <div className="skills-page__title"><p>THE HEAVENS / DERIVED ABILITIES</p><h1>Derived Abilities</h1><span>G.O.D. archive · {username}</span></div>
        <div className="skills-page__navigation"><Link href="/heavens">Back to The Heavens</Link></div>
      </header>
      <div className="skills-workspace derived-abilities-workspace">
        <aside className="skill-library">
          <div className="skill-library__heading"><div><p>MASTER CONTENT</p><h2>Milestones</h2></div><button className="skills-primary-button" type="button" onClick={() => dirty ? setPending({ kind: "new" }) : createNew()}>New Ability</button></div>
          <div className="skill-library__search"><label htmlFor="derived-ability-search">Search</label><input id="derived-ability-search" type="search" value={filters.search ?? ""} placeholder="Search abilities" onChange={(event) => setFilters({ ...filters, search: event.target.value, page: 1 })} /></div>
          <div className="skill-library__toolbar"><span>{library.total.toLocaleString()} abilities</span></div>
          <div className={`skill-library__results${loadingLibrary ? " is-loading" : ""}`}>
            {library.items.map((entry) => <button key={entry.id} type="button" className={`skill-library__row${draft?.id === entry.id ? " is-selected" : ""}`} onClick={() => choose(entry)}><span className="skill-library__row-name">{entry.name}</span><span className="skill-library__row-meta">{entry.requirementSummary}</span><span className="skill-library__row-parents">{entry.description || (entry.sourceSystem ? "Canonical milestone" : "Custom milestone")}</span></button>)}
            {!library.items.length && !loadingLibrary ? <p className="skill-library__empty">No Derived Abilities match this view.</p> : null}
          </div>
          <nav className="skill-library__pagination"><button type="button" disabled={library.page <= 1 || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page - 1 })}>Previous</button><span>Page {library.page} of {library.pageCount}</span><button type="button" disabled={library.page >= library.pageCount || loadingLibrary} onClick={() => setFilters({ ...filters, page: library.page + 1 })}>Next</button></nav>
        </aside>
        {loadingEditor ? <section className="skill-editor skill-editor--empty"><p>LOADING DERIVED ABILITY</p></section> : draft && core ? (
          <section className="skill-editor derived-ability-editor">
            <header className="skill-editor__header"><div><p>{draft.id ? `DERIVED ABILITY ${draft.id}` : "NEW DERIVED ABILITY"}</p><h2>{core.name || "Untitled Ability"}</h2><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span></div><div className="skill-editor__actions">{draft.id && !confirmDelete ? <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button> : null}<button className="skills-primary-button" type="button" disabled={saving} onClick={() => void persist()}>{saving ? "Saving…" : "Save Ability"}</button></div></header>
            {confirmDelete ? <div className="skill-editor__delete-confirm"><div><strong>Delete {core.name}?</strong><span>Canonical or Campaign-assigned abilities cannot be deleted.</span></div><button className="skills-danger-button" type="button" onClick={() => void remove()}>Confirm Delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div> : null}
            {feedback ? <p className={`skill-editor__feedback is-${feedback.kind}`}>{feedback.message}</p> : null}
            <div className="skill-editor__content derived-ability-editor__content">
              <section className="derived-ability-card"><header><p>IDENTITY</p><h3>Name & Description</h3></header><div className="derived-ability-form-grid"><Field label="Name" wide><input value={core.name} onChange={(event) => change({ ...draft, core: { ...core, name: event.target.value } })} /></Field><Field label="Description" wide><textarea rows={5} value={core.description} onChange={(event) => change({ ...draft, core: { ...core, description: event.target.value } })} /></Field></div></section>
              <section className="derived-ability-card"><header><p>RULES</p><h3>Mechanical Effect</h3></header><Field label="Rules Text" wide><textarea rows={6} value={core.mechanicalEffect} onChange={(event) => change({ ...draft, core: { ...core, mechanicalEffect: event.target.value } })} /></Field></section>
              <section className="derived-ability-card"><header><p>LIVE REQUIREMENT</p><h3>Attribute Trigger</h3></header><div className="derived-ability-form-grid"><Field label="Trigger Type"><select value="attribute" onChange={() => undefined}><option value="attribute">Attribute</option></select></Field><Field label="Attribute"><select value={draft.trigger.attributeKey ?? ""} onChange={(event) => change({ ...draft, trigger: { ...draft.trigger, attributeKey: event.target.value } })}>{DERIVED_ABILITY_ATTRIBUTE_KEYS.map((key) => <option key={key}>{key}</option>)}</select></Field><Field label="Required Score"><input type="number" min={0} step={1} value={draft.trigger.minimumScore ?? ""} onChange={(event) => change({ ...draft, trigger: { ...draft.trigger, minimumScore: event.target.value === "" ? null : Number(event.target.value) } })} /></Field></div></section>
              <section className="derived-ability-card"><header><p>METADATA</p><h3>{core.sourceSystem ? "Canonical Record" : "Custom Record"}</h3></header><dl className="derived-ability-metadata"><div><dt>Source System</dt><dd>{core.sourceSystem ?? "Custom"}</dd></div><div><dt>Source Identity</dt><dd>{core.sourceExternalId ?? "—"}</dd></div>{campaignAssignmentCount !== null ? <div><dt>Campaign Assignments</dt><dd>{campaignAssignmentCount}</dd></div> : null}</dl></section>
            </div>
          </section>
        ) : <section className="skill-editor skill-editor--empty"><p>DERIVED ABILITY EDITOR</p><h2>Select an ability or create a new milestone.</h2><span>V1 abilities activate from Campaign-approved Attribute thresholds.</span></section>}
      </div>
      {pending ? <div className="skills-page__discard-confirm"><div><p>Unsaved changes</p><span>Discard this Derived Ability draft?</span></div><div className="skills-page__discard-actions"><button type="button" onClick={() => setPending(null)}>Keep Editing</button><button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button></div></div> : null}
    </main>
  );
}

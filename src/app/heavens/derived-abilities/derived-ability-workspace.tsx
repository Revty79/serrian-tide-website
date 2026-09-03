"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { createDefaultDerivedAbilityDraft } from "@/features/derived-abilities/derived-ability-authoring";
import {
  DERIVED_ABILITY_ACQUISITION_TYPES,
  DERIVED_ABILITY_ACTIVATION_TYPES,
} from "@/features/derived-abilities/models";

import {
  deleteDerivedAbility,
  getDerivedAbility,
  listDerivedAbilities,
  saveDerivedAbility,
  type DerivedAbilityDraft,
  type DerivedAbilityEditorReferences,
  type DerivedAbilityLibraryFilters,
  type DerivedAbilityLibraryResult,
  type DerivedAbilitySummary,
} from "./actions";
import { DerivedAbilityConstructor } from "./derived-ability-constructor";

export function DerivedAbilityWorkspace({
  initialLibrary,
  references,
  username,
}: {
  initialLibrary: DerivedAbilityLibraryResult;
  references: DerivedAbilityEditorReferences;
  username: string;
}) {
  const [filters, setFilters] = useState<DerivedAbilityLibraryFilters>({
    page: 1,
    pageSize: 40,
  });
  const [library, setLibrary] = useState(initialLibrary);
  const [editorReferences, setEditorReferences] = useState(references);
  const [draft, setDraft] = useState<DerivedAbilityDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [pending, setPending] = useState<
    { kind: "open"; ability: DerivedAbilitySummary } | { kind: "new" } | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadLibrary = useCallback(async (next: DerivedAbilityLibraryFilters) => {
    setLoadingLibrary(true);
    try {
      setLibrary(await listDerivedAbilities(next));
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error
          ? error.message
          : "The Derived Ability Library could not be loaded.",
      });
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
      setFeedback({
        kind: "error",
        message: error instanceof Error
          ? error.message
          : "That Derived Ability could not be loaded.",
      });
    } finally {
      setLoadingEditor(false);
    }
  }

  function choose(summary: DerivedAbilitySummary) {
    if (dirty) setPending({ kind: "open", ability: summary });
    else void openAbility(summary);
  }

  function createNew() {
    setDraft(createDefaultDerivedAbilityDraft());
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
      setEditorReferences((current) => ({
        ...current,
        abilities: [
          ...current.abilities.filter((ability) => ability.id !== saved.id),
          { id: saved.id, name: saved.core.name },
        ].sort((left, right) =>
          left.name.localeCompare(right.name) || left.id - right.id),
      }));
      setDirty(false);
      setFeedback({ kind: "success", message: `${saved.core.name} was saved.` });
      await loadLibrary(filters);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error
          ? error.message
          : "The Derived Ability could not be saved.",
      });
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
      setEditorReferences((current) => ({
        ...current,
        abilities: current.abilities.filter((ability) => ability.id !== draft.id),
      }));
      setDraft(null);
      setDirty(false);
      setConfirmDelete(false);
      setFeedback({ kind: "success", message: `${name} was deleted.` });
      await loadLibrary(filters);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error
          ? error.message
          : "The Derived Ability could not be deleted.",
      });
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

  return (
    <main className="skills-page derived-abilities-page">
      <header className="skills-page__header">
        <div className="skills-page__brand">
          <Link href="/heavens" className="font-evanescent derived-ability-brand">
            SERRIAN<br />TIDE
          </Link>
        </div>
        <div className="skills-page__title">
          <p>THE HEAVENS / DERIVED ABILITIES</p>
          <h1>Derived Abilities</h1>
          <span>G.O.D. archive · {username}</span>
        </div>
        <div className="skills-page__navigation">
          <Link href="/heavens">Back to The Heavens</Link>
        </div>
      </header>
      <div className="skills-workspace derived-abilities-workspace">
        <aside className="skill-library">
          <div className="skill-library__heading">
            <div><p>MASTER CONTENT</p><h2>Derived Ability Library</h2></div>
            <button
              className="skills-primary-button"
              type="button"
              onClick={() => dirty ? setPending({ kind: "new" }) : createNew()}
            >
              New Ability
            </button>
          </div>
          <div className="skill-library__search">
            <label htmlFor="derived-ability-search">Search</label>
            <input
              id="derived-ability-search"
              type="search"
              value={filters.search ?? ""}
              placeholder="Search name, description, or Rules Text"
              onChange={(event) => setFilters({
                ...filters,
                search: event.target.value,
                page: 1,
              })}
            />
          </div>
          <div className="skill-library__filters derived-ability-library-filters">
            <label>
              <span>Acquisition</span>
              <select
                value={filters.acquisitionType ?? ""}
                onChange={(event) => setFilters({
                  ...filters,
                  acquisitionType:
                    event.target.value as DerivedAbilityLibraryFilters["acquisitionType"],
                  page: 1,
                })}
              >
                <option value="">All</option>
                {DERIVED_ABILITY_ACQUISITION_TYPES.map((type) => (
                  <option key={type} value={type}>{type[0]!.toUpperCase() + type.slice(1)}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Activation</span>
              <select
                value={filters.activationType ?? ""}
                onChange={(event) => setFilters({
                  ...filters,
                  activationType:
                    event.target.value as DerivedAbilityLibraryFilters["activationType"],
                  page: 1,
                })}
              >
                <option value="">All</option>
                {DERIVED_ABILITY_ACTIVATION_TYPES.map((type) => (
                  <option key={type} value={type}>{type[0]!.toUpperCase() + type.slice(1)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="skill-library__toolbar">
            <span>{library.total.toLocaleString()} abilities</span>
          </div>
          <div className={`skill-library__results${loadingLibrary ? " is-loading" : ""}`}>
            {library.items.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`skill-library__row${draft?.id === entry.id ? " is-selected" : ""}`}
                onClick={() => choose(entry)}
              >
                <span className="skill-library__row-name">{entry.name}</span>
                <span className="derived-ability-library-badges">
                  <em>{entry.acquisitionType}</em>
                  <em>{entry.activationType}</em>
                  <em>{entry.requirementOrigin}</em>
                </span>
                <span className="skill-library__row-meta">{entry.requirementSummary}</span>
                <span className="skill-library__row-parents">
                  {entry.description || (entry.sourceSystem ? "Canonical ability" : "Custom ability")}
                </span>
              </button>
            ))}
            {!library.items.length && !loadingLibrary ? (
              <p className="skill-library__empty">No Derived Abilities match this view.</p>
            ) : null}
          </div>
          <nav className="skill-library__pagination">
            <button
              type="button"
              disabled={library.page <= 1 || loadingLibrary}
              onClick={() => setFilters({ ...filters, page: library.page - 1 })}
            >Previous</button>
            <span>Page {library.page} of {library.pageCount}</span>
            <button
              type="button"
              disabled={library.page >= library.pageCount || loadingLibrary}
              onClick={() => setFilters({ ...filters, page: library.page + 1 })}
            >Next</button>
          </nav>
        </aside>
        {loadingEditor ? (
          <section className="skill-editor skill-editor--empty">
            <p>LOADING DERIVED ABILITY</p>
          </section>
        ) : draft ? (
          <section className="skill-editor derived-ability-editor">
            <header className="skill-editor__header">
              <div>
                <p>{draft.id ? `DERIVED ABILITY ${draft.id}` : "NEW DERIVED ABILITY"}</p>
                <h2>{draft.core.name || "Untitled Ability"}</h2>
                <span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span>
              </div>
              <div className="skill-editor__actions">
                {draft.id && !confirmDelete ? (
                  <button className="skills-danger-button" type="button" onClick={() => setConfirmDelete(true)}>Delete</button>
                ) : null}
                <button className="skills-primary-button" type="button" disabled={saving} onClick={() => void persist()}>
                  {saving ? "Saving…" : "Save Ability"}
                </button>
              </div>
            </header>
            {confirmDelete ? (
              <div className="skill-editor__delete-confirm">
                <div>
                  <strong>Delete {draft.core.name}?</strong>
                  <span>Canonical abilities, prerequisite targets, and records with legacy campaign references are protected.</span>
                </div>
                <button className="skills-danger-button" type="button" onClick={() => void remove()}>Confirm Delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : null}
            {feedback ? (
              <p className={`skill-editor__feedback is-${feedback.kind}`}>{feedback.message}</p>
            ) : null}
            <DerivedAbilityConstructor
              draft={draft}
              references={editorReferences}
              onChange={change}
            />
          </section>
        ) : (
          <section className="skill-editor skill-editor--empty">
            <p>DERIVED ABILITY CONSTRUCTOR</p>
            <h2>Select an ability or create a new definition.</h2>
            <span>Author Attributes, stored Skill # requirements, prerequisites, manual rules, use conditions, costs, and limits.</span>
          </section>
        )}
      </div>
      {pending ? (
        <div className="skills-page__discard-confirm">
          <div><p>Unsaved changes</p><span>Discard this Derived Ability draft?</span></div>
          <div className="skills-page__discard-actions">
            <button type="button" onClick={() => setPending(null)}>Keep Editing</button>
            <button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { LifecycleControls } from "@/app/heavens/lifecycle-controls";
import { createDefaultDerivedAbilityDraft } from "@/features/derived-abilities/derived-ability-authoring";
import {
  DERIVED_ABILITY_ACQUISITION_TYPES,
  DERIVED_ABILITY_ACTIVATION_TYPES,
} from "@/features/derived-abilities/models";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import {
  getDerivedAbility,
  getDerivedAbilityEditorReferences,
  listDerivedAbilities,
  saveDerivedAbility,
  type DerivedAbilityAggregate,
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
  const [draft, setDraft] = useState<DerivedAbilityDraft | DerivedAbilityAggregate | null>(null);
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
  const preserveScroll = useInPlaceScrollPreservation();
  const archivedAt = draft && "archivedAt" in draft ? draft.archivedAt : null;
  const archiveReason = draft && "archiveReason" in draft ? draft.archiveReason : "";
  const isArchived = Boolean(archivedAt);

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
    const timer = window.setTimeout(() => void preserveScroll(() => loadLibrary(filters)), 180);
    return () => window.clearTimeout(timer);
  }, [filters, loadLibrary, preserveScroll]);

  async function openAbility(summary: DerivedAbilitySummary) {
    await preserveScroll(async () => {
      setLoadingEditor(true);
      setFeedback(null);
      try {
        const [aggregate, nextReferences] = await Promise.all([
          getDerivedAbility(summary.id),
          getDerivedAbilityEditorReferences(summary.id),
        ]);
        if (!aggregate) throw new Error("Derived Ability not found.");
        setDraft(aggregate);
        setEditorReferences(nextReferences);
        setDirty(false);
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
    });
  }

  function choose(summary: DerivedAbilitySummary) {
    if (dirty) void preserveScroll(() => setPending({ kind: "open", ability: summary }));
    else void openAbility(summary);
  }

  async function createNew() {
    try {
      const nextReferences = await getDerivedAbilityEditorReferences();
      setDraft(createDefaultDerivedAbilityDraft());
      setFilters((current) => ({ ...current, archived: false, page: 1 }));
      setEditorReferences(nextReferences);
      setDirty(false);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Derived Ability references could not be loaded.",
      });
    }
  }

  function change(next: DerivedAbilityDraft) {
    setDraft(next);
    setDirty(true);
    setFeedback(null);
  }

  async function persist() {
    if (!draft) return;
    await preserveScroll(async () => {
      setSaving(true);
      setFeedback(null);
      try {
        const saved = await saveDerivedAbility(draft);
        setDraft(saved);
        setEditorReferences(await getDerivedAbilityEditorReferences(saved.id));
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
    });
  }

  function changeArchiveView(archived: boolean) {
    void preserveScroll(async () => {
      setFilters((current) => ({ ...current, archived, page: 1 }));
      setDraft(null);
      setDirty(false);
      setFeedback(null);
      try {
        setEditorReferences(await getDerivedAbilityEditorReferences());
      } catch (error) {
        setFeedback({
          kind: "error",
          message: error instanceof Error ? error.message : "Derived Ability references could not be loaded.",
        });
      }
    });
  }

  async function lifecycleCompleted(event: { action: "archive" | "restore" | "delete" }) {
    const name = draft?.core.name || "Derived Ability";
    setDraft(null);
    setDirty(false);
    setEditorReferences(await getDerivedAbilityEditorReferences());
    setFeedback({
      kind: "success",
      message: event.action === "archive"
        ? `${name} was archived.`
        : event.action === "restore"
          ? `${name} was restored.`
          : `${name} was permanently deleted.`,
    });
    await loadLibrary(filters);
  }

  function discardAndContinue() {
    const next = pending;
    setPending(null);
    if (!next) return;
    if (next.kind === "new") void createNew();
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
              onClick={() => dirty
                ? void preserveScroll(() => setPending({ kind: "new" }))
                : void preserveScroll(createNew)}
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
            <div className="skill-library__view-toggle" aria-label="Derived Ability lifecycle view">
              <button type="button" className={!filters.archived ? "is-active" : ""} aria-pressed={!filters.archived} disabled={dirty} onClick={() => changeArchiveView(false)}>Active</button>
              <button type="button" className={filters.archived ? "is-active" : ""} aria-pressed={Boolean(filters.archived)} disabled={dirty} onClick={() => changeArchiveView(true)}>Archived</button>
            </div>
            <span>{library.total.toLocaleString()} abilities</span>
          </div>
          <div data-preserve-scroll="derived-ability-library-results" className={`skill-library__results${loadingLibrary ? " is-loading" : ""}`}>
            {library.items.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`skill-library__row${draft?.id === entry.id ? " is-selected" : ""}`}
                onClick={() => choose(entry)}
              >
                <span className="skill-library__row-name">{entry.name}</span>
                {entry.archivedAt ? <span className="skill-library__row-status">Archived</span> : null}
                <span className="derived-ability-library-badges">
                  <em>{entry.acquisitionType}</em>
                  <em>{entry.activationType}</em>
                  <em>{entry.requirementOrigin}</em>
                  {entry.effectCount > 0 ? <em>{entry.effectCount} EFFECT{entry.effectCount === 1 ? "" : "S"}</em> : null}
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
                <span>{isArchived ? `Archived${archiveReason ? ` · ${archiveReason}` : ""}` : dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span>
              </div>
              <div className="skill-editor__actions">
                {draft.id ? <LifecycleControls target={{ entityKind: "derived-ability", entityId: draft.id }} archived={isArchived} disabled={saving || dirty} onCompleted={lifecycleCompleted} /> : null}
                <button className="skills-primary-button" type="button" disabled={saving || isArchived} onClick={() => void persist()}>
                  {saving ? "Saving…" : "Save Ability"}
                </button>
              </div>
            </header>
            {feedback ? (
              <p className={`skill-editor__feedback is-${feedback.kind}`}>{feedback.message}</p>
            ) : null}
            <fieldset className="lifecycle-editor-fields" disabled={isArchived}>
              <DerivedAbilityConstructor
                draft={draft}
                references={editorReferences}
                onChange={change}
              />
            </fieldset>
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
            <button type="button" onClick={() => void preserveScroll(() => setPending(null))}>Keep Editing</button>
            <button className="skills-danger-button" type="button" onClick={() => void preserveScroll(discardAndContinue)}>Discard Changes</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

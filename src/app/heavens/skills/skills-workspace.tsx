"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { Tradition } from "@/features/spell-construction/models/spell";

import {
  deleteSkill,
  getSkill,
  getSkillFilterOptions,
  listRelationshipCandidates,
  listSkills,
  listSpellFrameworkSkills,
  saveSkill,
  type SkillDraft,
  type SkillFilterOptions,
  type SkillLibraryFilters,
  type SkillLibraryItem,
  type SkillLibraryResult,
  type SpellFrameworkSkill,
} from "./actions";
import { SkillEditor } from "./skill-editor";
import { SkillLibrary } from "./skill-library";

type PendingEditorChange =
  | { kind: "open"; skill: SkillLibraryItem }
  | { kind: "new" };

function newSkillDraft(): SkillDraft {
  return {
    core: {
      name: "",
      classification: "special ability",
      tier: null,
      primaryAttribute: null,
      secondaryAttribute: null,
      definition: "",
      sourceSystem: null,
      sourceExternalId: null,
    },
    relationships: [],
    extensions: [],
  };
}

export function SkillsWorkspace({
  initialLibrary,
  initialFilterOptions,
  username,
}: {
  initialLibrary: SkillLibraryResult;
  initialFilterOptions: SkillFilterOptions;
  username: string;
}) {
  const [filters, setFilters] = useState<SkillLibraryFilters>({
    page: 1,
    pageSize: 40,
  });
  const [library, setLibrary] = useState(initialLibrary);
  const [filterOptions, setFilterOptions] = useState(initialFilterOptions);
  const [view, setView] = useState<"list" | "tree">("list");
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [pendingEditorChange, setPendingEditorChange] =
    useState<PendingEditorChange | null>(null);

  const loadLibrary = useCallback(async (nextFilters: SkillLibraryFilters) => {
    setLoadingLibrary(true);
    try {
      setLibrary(await listSkills(nextFilters));
    } catch {
      setFeedback({
        kind: "error",
        message: "The Skill Library could not be read from PostgreSQL.",
      });
    } finally {
      setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadLibrary(filters), 180);
    return () => window.clearTimeout(timeout);
  }, [filters, loadLibrary]);

  const findCandidates = useCallback(
    (
      search: string,
      context: {
        tier: number | null;
        primaryAttribute: string | null;
        secondaryAttribute: string | null;
      },
      excludeId?: number,
    ) => listRelationshipCandidates(search, context, excludeId),
    [],
  );

  const findFrameworkSkills = useCallback(
    (tradition: Tradition): Promise<SpellFrameworkSkill[]> =>
      listSpellFrameworkSkills(tradition),
    [],
  );

  async function refreshLibrary() {
    const [nextLibrary, nextFilterOptions] = await Promise.all([
      listSkills(filters),
      getSkillFilterOptions(),
    ]);
    setLibrary(nextLibrary);
    setFilterOptions(nextFilterOptions);
  }

  async function openSkill(summary: SkillLibraryItem) {
    setLoadingEditor(true);
    setFeedback(null);
    try {
      const aggregate = await getSkill(summary.id);
      if (!aggregate) throw new Error("Skill not found");
      setDraft(aggregate);
      setDirty(false);
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "That Skill could not be loaded.",
      });
    } finally {
      setLoadingEditor(false);
    }
  }

  function selectSkill(summary: SkillLibraryItem) {
    if (dirty) {
      setPendingEditorChange({ kind: "open", skill: summary });
      return;
    }
    void openSkill(summary);
  }

  function createNewSkill() {
    setDraft(newSkillDraft());
    setDirty(false);
    setFeedback(null);
  }

  function beginNewSkill() {
    if (dirty) {
      setPendingEditorChange({ kind: "new" });
      return;
    }
    createNewSkill();
  }

  function discardAndContinue() {
    const pending = pendingEditorChange;
    setPendingEditorChange(null);
    if (!pending) return;

    if (pending.kind === "new") {
      createNewSkill();
      return;
    }

    void openSkill(pending.skill);
  }

  async function saveCurrentSkill() {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);

    try {
      const saved = await saveSkill(draft);
      setDraft(saved);
      setDirty(false);
      setFeedback({
        kind: "success",
        message: `${saved.core.name} was saved.`,
      });
      await refreshLibrary();
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The Skill could not be saved. Existing data was left intact.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentSkill() {
    if (!draft?.id) return;
    setSaving(true);
    setFeedback(null);

    try {
      const deletedName = draft.core.name;
      await deleteSkill(draft.id);
      setDraft(null);
      setDirty(false);
      setFeedback({
        kind: "success",
        message: `${deletedName} was deleted.`,
      });
      await refreshLibrary();
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The Skill could not be deleted.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="skills-page">
      <header className="skills-page__header">
        <Link href="/heavens" className="skills-page__brand">
          <span className="font-evanescent">SERRIAN TIDE</span>
        </Link>

        <div className="skills-page__title">
          <p>THE HEAVENS / SKILLS</p>
          <h1>Skills</h1>
          <span>G.O.D. archive · {username}</span>
        </div>

        <div className="skills-page__navigation">
          <Link href="/heavens">Back to The Heavens</Link>
        </div>
      </header>

      <div className="skills-workspace">
        <SkillLibrary
          page={library}
          filters={filters}
          filterOptions={filterOptions}
          selectedSkillId={draft?.id}
          view={view}
          loading={loadingLibrary}
          onViewChange={setView}
          onFiltersChange={setFilters}
          onSelect={selectSkill}
          onNewSkill={beginNewSkill}
        />

        {loadingEditor ? (
          <section className="skill-editor skill-editor--empty">
            <p>LOADING SKILL</p>
          </section>
        ) : (
          <SkillEditor
            key={draft?.id ?? "new-skill"}
            draft={draft}
            filterOptions={filterOptions}
            saving={saving}
            dirty={dirty}
            feedback={feedback}
            onChange={(next) => {
              setDraft(next);
              setDirty(true);
              setFeedback(null);
            }}
            onSave={() => void saveCurrentSkill()}
            onDelete={() => void deleteCurrentSkill()}
            findCandidates={findCandidates}
            findFrameworkSkills={findFrameworkSkills}
          />
        )}
      </div>

      {pendingEditorChange && (
        <div
          className="skills-page__discard-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="discard-changes-title"
        >
          <div>
            <p id="discard-changes-title">Unsaved changes</p>
            <span>Leave this draft and discard the changes you have not saved?</span>
          </div>
          <div className="skills-page__discard-actions">
            <button type="button" onClick={() => setPendingEditorChange(null)}>
              Keep Editing
            </button>
            <button
              className="skills-danger-button"
              type="button"
              onClick={discardAndContinue}
            >
              Discard Changes
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

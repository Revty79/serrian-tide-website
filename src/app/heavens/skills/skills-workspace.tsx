"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { Tradition } from "@/features/spell-construction/models/spell";
import type {
  RecursiveSkillLibrary,
  RecursiveSkillNode,
  RecursiveSkillPath,
} from "@/features/skills/recursive-skill-library";

import {
  deleteSkill,
  getRecursiveSkillLibrary,
  getSkill,
  getSkillFilterOptions,
  listSkills,
  listSpellFrameworkSkills,
  previewSkillMutation,
  saveSkill,
  type SkillDraft,
  type SkillFilterOptions,
  type SkillLibraryFilters,
  type SkillLibraryItem,
  type SkillLibraryResult,
  type SkillMutationPreview,
  type SpellFrameworkSkill,
} from "./actions";
import { SkillEditor } from "./skill-editor";
import { SkillLibrary, type SkillLibraryView } from "./skill-library";

type PendingEditorChange =
  | { kind: "open"; skillId: number; pathKey: string | null }
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

function pathLabel(path: RecursiveSkillPath): string {
  return path.rootToEndpointNames
    .map((name, index) => `${name} (#${path.rootToEndpointIds[index]})`)
    .join(" → ");
}

function preferredSavedPath(
  library: RecursiveSkillLibrary,
  saved: SkillDraft & { id: number },
  previousPathKey: string | null,
  preferredAttributeKey: string | null,
): RecursiveSkillPath | null {
  const paths = library.paths.filter(({ endpointSkillId }) => endpointSkillId === saved.id);
  const previousPath = paths.find(({ key }) => key === previousPathKey);
  if (previousPath) return previousPath;

  const parentIds = saved.relationships
    .filter(({ relationshipType }) => relationshipType.trim().toLocaleLowerCase("en-US") === "parent")
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ relatedSkillId }) => relatedSkillId);
  const preferredPaths = preferredAttributeKey
    ? paths.filter(({ attributeGroupKey }) => attributeGroupKey === preferredAttributeKey)
    : paths;

  for (const parentId of parentIds) {
    const throughParent = preferredPaths.find((path) => (
      path.rootToEndpointIds.at(-2) === parentId
    ));
    if (throughParent) return throughParent;
  }

  return preferredPaths[0] ?? paths[0] ?? null;
}

export function SkillsWorkspace({
  initialHierarchy,
  initialFilterOptions,
  initialLibrary,
  username,
}: {
  initialHierarchy: RecursiveSkillLibrary;
  initialFilterOptions: SkillFilterOptions;
  initialLibrary: SkillLibraryResult;
  username: string;
}) {
  const [hierarchy, setHierarchy] = useState(initialHierarchy);
  const [filterOptions, setFilterOptions] = useState(initialFilterOptions);
  const [filters, setFilters] = useState<SkillLibraryFilters>({ page: 1, pageSize: 40 });
  const [library, setLibrary] = useState(initialLibrary);
  const [view, setView] = useState<SkillLibraryView>("list");
  const [selectedPathKey, setSelectedPathKey] = useState<string | null>(null);
  const [selectedAttributeKey, setSelectedAttributeKey] = useState<string | null>(null);
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
  const [structuralPreview, setStructuralPreview] =
    useState<SkillMutationPreview | null>(null);

  const loadList = useCallback(async (nextFilters: SkillLibraryFilters) => {
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
    if (view !== "list") return;
    const timeout = window.setTimeout(() => void loadList(filters), 180);
    return () => window.clearTimeout(timeout);
  }, [filters, loadList, view]);

  const findFrameworkSkills = useCallback(
    (tradition: Tradition): Promise<SpellFrameworkSkill[]> =>
      listSpellFrameworkSkills(tradition),
    [],
  );

  async function refreshLibraries(): Promise<RecursiveSkillLibrary> {
    setLoadingLibrary(true);
    try {
      const [nextHierarchy, nextFilterOptions, nextList] = await Promise.all([
        getRecursiveSkillLibrary(),
        getSkillFilterOptions(),
        listSkills(filters),
      ]);
      setHierarchy(nextHierarchy);
      setFilterOptions(nextFilterOptions);
      setLibrary(nextList);
      return nextHierarchy;
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function openSkill(skillId: number, pathKey: string | null) {
    setLoadingEditor(true);
    setFeedback(null);
    try {
      const aggregate = await getSkill(skillId);
      if (!aggregate) throw new Error("That exact Skill identity no longer exists.");
      setDraft(aggregate);
      setSelectedPathKey(pathKey);
      if (pathKey) {
        const path = hierarchy.paths.find(({ key }) => key === pathKey);
        if (path) setSelectedAttributeKey(path.attributeGroupKey);
      }
      setDirty(false);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "That Skill could not be loaded.",
      });
    } finally {
      setLoadingEditor(false);
    }
  }

  function requestOpen(skillId: number, pathKey: string | null) {
    if (dirty) {
      setPendingEditorChange({ kind: "open", skillId, pathKey });
      return;
    }
    void openSkill(skillId, pathKey);
  }

  function selectListSkill(skill: SkillLibraryItem) {
    requestOpen(skill.id, null);
  }

  function selectTreeSkill(skill: RecursiveSkillNode, path: RecursiveSkillPath) {
    setSelectedAttributeKey(path.attributeGroupKey);
    requestOpen(skill.id, path.key);
  }

  function createNewSkill() {
    setDraft(newSkillDraft());
    setSelectedPathKey(null);
    setDirty(false);
    setFeedback(null);
    setStructuralPreview(null);
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
    void openSkill(pending.skillId, pending.pathKey);
  }

  function changeView(nextView: SkillLibraryView) {
    if (nextView === view) return;
    setView(nextView);
    if (nextView === "tree") {
      setSelectedPathKey(null);
      setSelectedAttributeKey(null);
    }
  }

  async function persistCurrentSkill(structuralChangeConfirmed: boolean) {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveSkill(draft, { structuralChangeConfirmed });
      const nextHierarchy = await refreshLibraries();
      const selectedPath = preferredSavedPath(
        nextHierarchy,
        saved,
        selectedPathKey,
        selectedAttributeKey,
      );
      setDraft(saved);
      if (view === "tree") {
        setSelectedPathKey(selectedPath?.key ?? null);
        setSelectedAttributeKey(selectedPath?.attributeGroupKey ?? null);
      } else {
        setSelectedPathKey(null);
      }
      setDirty(false);
      setStructuralPreview(null);
      setFeedback({
        kind: "success",
        message: `${saved.core.name} (#${saved.id}) was saved and placed from its canonical relationships.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The Skill could not be saved. Existing data was left intact.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function reviewAndSaveCurrentSkill() {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const preview = await previewSkillMutation(draft);
      if (preview.validationErrors.length) {
        throw new Error(preview.validationErrors.join(" "));
      }
      if (preview.requiresConfirmation) {
        setStructuralPreview(preview);
        return;
      }
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The structural Skill preview could not be prepared.",
      });
      return;
    } finally {
      setSaving(false);
    }
    await persistCurrentSkill(false);
  }

  async function deleteCurrentSkill() {
    if (!draft?.id) return;
    setSaving(true);
    setFeedback(null);
    try {
      const deletedName = draft.core.name;
      await deleteSkill(draft.id);
      setDraft(null);
      setSelectedPathKey(null);
      setDirty(false);
      setFeedback({ kind: "success", message: `${deletedName} was deleted.` });
      await refreshLibraries();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "The Skill could not be deleted.",
      });
    } finally {
      setSaving(false);
    }
  }

  const consumerRows = structuralPreview ? [
    ["Character allocations", structuralPreview.consumers.characterAllocations],
    ["Race Skill references", structuralPreview.consumers.raceReferences],
    ["Weapon-governance endpoints", structuralPreview.consumers.weaponGovernanceEndpoints],
    ["Defense-governance endpoints", structuralPreview.consumers.defenseGovernanceEndpoints],
    ["Called Check references", structuralPreview.consumers.calledCheckReferences],
    ["Derived Ability requirements", structuralPreview.consumers.derivedAbilityRequirements],
    ["Creature Skill references", structuralPreview.consumers.creatureReferences],
  ] as const : [];

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
          library={hierarchy}
          selectedSkillId={draft?.id}
          selectedPathKey={selectedPathKey}
          selectedAttributeKey={selectedAttributeKey}
          view={view}
          loading={loadingLibrary}
          onViewChange={changeView}
          onFiltersChange={setFilters}
          onSelectList={selectListSkill}
          onSelectTree={selectTreeSkill}
          onSelectAttribute={setSelectedAttributeKey}
          onBackToAttributes={() => {
            setSelectedPathKey(null);
            setSelectedAttributeKey(null);
          }}
          onBackToRoots={() => setSelectedPathKey(null)}
          onNewSkill={beginNewSkill}
        />

        {loadingEditor ? (
          <section className="skill-editor skill-editor--empty"><p>LOADING SKILL</p></section>
        ) : (
          <SkillEditor
            key={draft?.id ?? "new-skill"}
            draft={draft}
            hierarchy={hierarchy}
            filterOptions={filterOptions}
            saving={saving}
            dirty={dirty}
            feedback={feedback}
            onChange={(next) => {
              setDraft(next);
              setDirty(true);
              setFeedback(null);
              setStructuralPreview(null);
            }}
            onSave={() => void reviewAndSaveCurrentSkill()}
            onDelete={() => void deleteCurrentSkill()}
            findFrameworkSkills={findFrameworkSkills}
          />
        )}
      </div>

      {pendingEditorChange ? (
        <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-changes-title">
          <div><p id="discard-changes-title">Unsaved changes</p><span>Leave this draft and discard the changes you have not saved?</span></div>
          <div className="skills-page__discard-actions">
            <button type="button" onClick={() => setPendingEditorChange(null)}>Keep Editing</button>
            <button className="skills-danger-button" type="button" onClick={discardAndContinue}>Discard Changes</button>
          </div>
        </div>
      ) : null}

      {structuralPreview ? (
        <div className="skills-page__structure-confirm" role="alertdialog" aria-modal="true" aria-labelledby="structure-confirm-title">
          <section>
            <header>
              <div><p>STRUCTURAL CONFIRMATION</p><h2 id="structure-confirm-title">Confirm exact lineage change</h2></div>
              <button type="button" onClick={() => setStructuralPreview(null)}>Close</button>
            </header>
            <p>This preserves the Skill identity and does not rewrite any consumer. Review every affected path before saving.</p>
            <div className="skills-page__path-comparison">
              <div><strong>Current paths</strong>{structuralPreview.oldPaths.length ? structuralPreview.oldPaths.map((path) => <span key={path.key}>{pathLabel(path)}</span>) : <span>New Skill · no existing path</span>}</div>
              <div><strong>Proposed paths</strong>{structuralPreview.proposedPaths.length ? structuralPreview.proposedPaths.map((path) => <span key={path.key}>{pathLabel(path)}</span>) : <span>Review / Unlinked · no complete root path</span>}</div>
            </div>
            {structuralPreview.ambiguousMultipleParents ? <p className="skills-page__structure-warning" role="status">This Skill will have multiple genuinely different parents. Every route remains exact and the Skill will be marked for explicit review.</p> : null}
            <div className="skills-page__impact-grid">
              <section><strong>Affected Skill identities</strong><span>{structuralPreview.affectedSkills.length}</span><ul>{structuralPreview.affectedSkills.map((skill) => <li key={skill.id}>{skill.name} <code>#{skill.id}</code></li>)}</ul></section>
              <section><strong>Canonical consumers (unchanged)</strong><span>{structuralPreview.consumers.total}</span><ul>{consumerRows.map(([label, value]) => <li key={label}>{label}: {value}</li>)}</ul></section>
            </div>
            <footer>
              <button type="button" onClick={() => setStructuralPreview(null)}>Return to Editing</button>
              <button className="skills-primary-button" disabled={saving} type="button" onClick={() => void persistCurrentSkill(true)}>{saving ? "Saving…" : "Confirm Structural Change"}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

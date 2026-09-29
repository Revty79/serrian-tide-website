"use client";
import { CanonDesignationControl } from "@/features/catalog-visibility/canon-designation-control";
import { CatalogBrowseControl } from "@/features/catalog-visibility/catalog-browse-control";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { LifecycleControls } from "@/app/heavens/lifecycle-controls";
import type { Tradition } from "@/features/spell-construction/models/spell";
import type {
  RecursiveSkillLibrary,
  RecursiveSkillNode,
  RecursiveSkillPath,
} from "@/features/skills/recursive-skill-library";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import {
  getRecursiveSkillLibrary,
  getSkillEditorHierarchy,
  getSkill,
  getSkillFilterOptions,
  listSkills,
  listSpellFrameworkSkills,
  previewSkillMutation,
  saveSkill,
  type SkillAggregate,
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
  canManageCanon = false,
  initialLibrary,
  username,
}: {
  initialHierarchy: RecursiveSkillLibrary;
  initialFilterOptions: SkillFilterOptions;
  canManageCanon?: boolean;
  initialLibrary: SkillLibraryResult;
  username: string;
}) {
  const [hierarchy, setHierarchy] = useState(initialHierarchy);
  const [editorHierarchy, setEditorHierarchy] = useState(initialHierarchy);
  const [filterOptions, setFilterOptions] = useState(initialFilterOptions);
  const [filters, setFilters] = useState<SkillLibraryFilters>({ page: 1, pageSize: 40 });
  const [library, setLibrary] = useState(initialLibrary);
  const libraryRequest = useRef(0);
  const hierarchyRequest = useRef(0);
  const [view, setView] = useState<SkillLibraryView>("list");
  const [selectedPathKey, setSelectedPathKey] = useState<string | null>(null);
  const [selectedAttributeKey, setSelectedAttributeKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<SkillDraft | SkillAggregate | null>(null);
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
  const preserveScroll = useInPlaceScrollPreservation();
  const archivedAt = draft && "archivedAt" in draft ? draft.archivedAt : null;
  const archiveReason = draft && "archiveReason" in draft ? draft.archiveReason : "";
  const isArchived = Boolean(archivedAt);

  const loadList = useCallback(async (nextFilters: SkillLibraryFilters) => {
    const request = ++libraryRequest.current;
    setLoadingLibrary(true);
    try {
      const result = await listSkills(nextFilters);
      if (request === libraryRequest.current) setLibrary(result);
    } catch {
      if (request === libraryRequest.current) setFeedback({
        kind: "error",
        message: "The Skill Library could not be read from PostgreSQL.",
      });
    } finally {
      if (request === libraryRequest.current) setLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "list") return;
    const timeout = window.setTimeout(() => void preserveScroll(() => loadList(filters)), 180);
    return () => window.clearTimeout(timeout);
  }, [filters, loadList, preserveScroll, view]);

  const findFrameworkSkills = useCallback(
    (tradition: Tradition): Promise<SpellFrameworkSkill[]> =>
      listSpellFrameworkSkills(tradition),
    [],
  );

  async function refreshLibraries(nextFilters = filters): Promise<RecursiveSkillLibrary> {
    const request = ++libraryRequest.current;
    const graphRequest = ++hierarchyRequest.current;
    setLoadingLibrary(true);
    try {
      const [nextHierarchy, nextFilterOptions, nextList] = await Promise.all([
        getRecursiveSkillLibrary(nextFilters.adminBrowse),
        getSkillFilterOptions(Boolean(nextFilters.archived), nextFilters.adminBrowse),
        listSkills(nextFilters),
      ]);
      if (graphRequest === hierarchyRequest.current) {
        setHierarchy(nextHierarchy);
        setFilterOptions(nextFilterOptions);
      }
      if (request === libraryRequest.current) setLibrary(nextList);
      return nextHierarchy;
    } finally {
      if (request === libraryRequest.current) setLoadingLibrary(false);
    }
  }

  async function openSkill(skillId: number, pathKey: string | null) {
    await preserveScroll(async () => {
      setLoadingEditor(true);
      setFeedback(null);
      try {
        const [aggregate, editingGraph] = await Promise.all([getSkill(skillId), getSkillEditorHierarchy()]);
        setEditorHierarchy(editingGraph);
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
    });
  }

  function requestOpen(skillId: number, pathKey: string | null) {
    if (dirty) {
      void preserveScroll(() => setPendingEditorChange({ kind: "open", skillId, pathKey }));
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

  async function createNewSkill() {
    try {
      const [nextFilterOptions, editingGraph] = await Promise.all([getSkillFilterOptions(), getSkillEditorHierarchy()]);
      setEditorHierarchy(editingGraph);
      setDraft(newSkillDraft());
      setFilters((current) => ({ ...current, archived: false, page: 1 }));
      setFilterOptions(nextFilterOptions);
      setSelectedPathKey(null);
      setDirty(false);
      setFeedback(null);
      setStructuralPreview(null);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Skill filter options could not be loaded.",
      });
    }
  }

  function beginNewSkill() {
    if (dirty) {
      void preserveScroll(() => setPendingEditorChange({ kind: "new" }));
      return;
    }
    void preserveScroll(createNewSkill);
  }

  function discardAndContinue() {
    const pending = pendingEditorChange;
    setPendingEditorChange(null);
    if (!pending) return;
    if (pending.kind === "new") {
      void createNewSkill();
      return;
    }
    void openSkill(pending.skillId, pending.pathKey);
  }

  function changeView(nextView: SkillLibraryView) {
    if (nextView === view) return;
    void preserveScroll(() => {
      setView(nextView);
      if (nextView === "tree") {
        if (filters.adminBrowse?.sortBy === "user") setFilters((current) => ({ ...current, adminBrowse: { ...current.adminBrowse, sortBy: "name" } }));
        setSelectedPathKey(null);
        setSelectedAttributeKey(null);
      }
    });
  }

  async function persistCurrentSkill(structuralChangeConfirmed: boolean) {
    if (!draft) return;
    await preserveScroll(async () => {
      setSaving(true);
      setFeedback(null);
      try {
        const saved = await saveSkill(draft, { structuralChangeConfirmed });
        const [nextHierarchy, editingGraph] = await Promise.all([refreshLibraries(), getSkillEditorHierarchy()]);
        setEditorHierarchy(editingGraph);
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
    });
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

  function changeArchiveView(archived: boolean) {
    void preserveScroll(async () => {
      setFilters((current) => ({ ...current, archived, page: 1 }));
      setView("list");
      setDraft(null);
      setSelectedPathKey(null);
      setSelectedAttributeKey(null);
      setDirty(false);
      setFeedback(null);
      try {
        setFilterOptions(await getSkillFilterOptions(archived, filters.adminBrowse));
      } catch (error) {
        setFeedback({
          kind: "error",
          message: error instanceof Error ? error.message : "Skill filter options could not be loaded.",
        });
      }
    });
  }

  async function lifecycleCompleted(event: { action: "archive" | "restore" | "delete" }) {
    const name = draft?.core.name || "Skill";
    setDraft(null);
    setSelectedPathKey(null);
    setSelectedAttributeKey(null);
    setDirty(false);
    setFeedback({
      kind: "success",
      message: event.action === "archive"
        ? `${name} was archived.`
        : event.action === "restore"
          ? `${name} was restored.`
          : `${name} was permanently deleted.`,
    });
    await refreshLibraries();
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
    <main className="skills-page skills-catalog-page">
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
          visibilityControl={<CatalogBrowseControl adminBrowse={filters.adminBrowse} onAdminBrowseChange={async (adminBrowse) => {
            const next = { ...filters, adminBrowse, page: 1 };
            setFilters(next);
            if (adminBrowse.sortBy === "user") setView("list");
            await refreshLibraries(next);
          }} canManageActivation={canManageCanon} catalog="skill" visibility={library.visibility} onSaved={async () => {
            await preserveScroll(async () => {
              setSelectedPathKey(null);
              setSelectedAttributeKey(null);
              setFilters((current) => ({ ...current, page: 1 }));
              await refreshLibraries({ ...filters, page: 1 });
            });
          }} />}
          page={library}
          filters={filters}
          filterOptions={filterOptions}
          library={hierarchy}
          selectedSkillId={draft?.id}
          selectedPathKey={selectedPathKey}
          selectedAttributeKey={selectedAttributeKey}
          view={view}
          loading={loadingLibrary}
          archiveViewDisabled={dirty}
          onViewChange={changeView}
          onArchiveViewChange={changeArchiveView}
          onFiltersChange={setFilters}
          onSelectList={selectListSkill}
          onSelectTree={selectTreeSkill}
          onSelectAttribute={(key) => void preserveScroll(() => setSelectedAttributeKey(key))}
          onBackToAttributes={() => {
            void preserveScroll(() => {
              setSelectedPathKey(null);
              setSelectedAttributeKey(null);
            });
          }}
          onBackToRoots={() => void preserveScroll(() => setSelectedPathKey(null))}
          onNewSkill={beginNewSkill}
        />

        {loadingEditor ? (
          <section className="skill-editor skill-editor--empty"><p>LOADING SKILL</p></section>
        ) : (
          <SkillEditor
            key={draft?.id ?? "new-skill"}
            draft={draft}
            hierarchy={editorHierarchy}
            filterOptions={filterOptions}
            saving={saving}
            dirty={dirty}
            archived={isArchived}
            feedback={feedback}
            onChange={(next) => {
              setDraft(next);
              setDirty(true);
              setFeedback(null);
              setStructuralPreview(null);
            }}
            onSave={() => void preserveScroll(reviewAndSaveCurrentSkill)}
            lifecycleControls={<>
              {canManageCanon && draft?.id && "isSystemCanon" in draft ? <CanonDesignationControl key={draft.id} root="skill" id={draft.id} isSystemCanon={draft.isSystemCanon} disabled={saving || dirty} onChanged={async (isSystemCanon, id) => {
                    setDraft((current) => current?.id === id ? { ...current, isSystemCanon } : current);
                    await preserveScroll(async () => { await refreshLibraries(); });
                  }} /> : null}
              {draft?.id ? (
              <LifecycleControls
                target={{ entityKind: "skill", entityId: draft.id }}
                archived={isArchived}
                disabled={saving || dirty}
                onCompleted={lifecycleCompleted}
              />
            ) : null}</>}
            archiveReason={archiveReason}
            findFrameworkSkills={findFrameworkSkills}
          />
        )}
      </div>

      {pendingEditorChange ? (
        <div className="skills-page__discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-changes-title">
          <div><p id="discard-changes-title">Unsaved changes</p><span>Leave this draft and discard the changes you have not saved?</span></div>
          <div className="skills-page__discard-actions">
            <button type="button" onClick={() => void preserveScroll(() => setPendingEditorChange(null))}>Keep Editing</button>
            <button className="skills-danger-button" type="button" onClick={() => void preserveScroll(discardAndContinue)}>Discard Changes</button>
          </div>
        </div>
      ) : null}

      {structuralPreview ? (
        <div className="skills-page__structure-confirm" role="alertdialog" aria-modal="true" aria-labelledby="structure-confirm-title">
          <section>
            <header>
              <div><p>STRUCTURAL CONFIRMATION</p><h2 id="structure-confirm-title">Confirm exact lineage change</h2></div>
              <button type="button" onClick={() => void preserveScroll(() => setStructuralPreview(null))}>Close</button>
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
              <button type="button" onClick={() => void preserveScroll(() => setStructuralPreview(null))}>Return to Editing</button>
              <button className="skills-primary-button" disabled={saving} type="button" onClick={() => void persistCurrentSkill(true)}>{saving ? "Saving…" : "Confirm Structural Change"}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

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
  listSpellFrameworkSkills,
  previewSkillMutation,
  saveSkill,
  type SkillDraft,
  type SkillFilterOptions,
  type SkillMutationPreview,
  type SpellFrameworkSkill,
} from "./actions";
import { SkillEditor } from "./skill-editor";
import { SkillLibrary } from "./skill-library";

type PendingEditorChange =
  | { kind: "open"; skillId: number; pathKey: string }
  | { kind: "new-root" }
  | { kind: "new-child"; parentId: number; parentName: string; pathKey: string };

function newSkillDraft(parent?: { id: number; name: string }): SkillDraft {
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
    relationships: parent ? [{
      relatedSkillId: parent.id,
      relatedSkillName: parent.name,
      relationshipType: "parent",
      sortOrder: 0,
    }] : [],
    extensions: [],
  };
}

function pathLabel(path: RecursiveSkillPath): string {
  return path.rootToEndpointNames
    .map((name, index) => `${name} (#${path.rootToEndpointIds[index]})`)
    .join(" → ");
}

export function SkillsWorkspace({
  initialHierarchy,
  initialFilterOptions,
  username,
}: {
  initialHierarchy: RecursiveSkillLibrary;
  initialFilterOptions: SkillFilterOptions;
  username: string;
}) {
  const [hierarchy, setHierarchy] = useState(initialHierarchy);
  const [filterOptions, setFilterOptions] = useState(initialFilterOptions);
  const [selectedPathKey, setSelectedPathKey] = useState<string | null>(null);
  const [creationParentPathKey, setCreationParentPathKey] = useState<string | null>(null);
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

  const findFrameworkSkills = useCallback(
    (tradition: Tradition): Promise<SpellFrameworkSkill[]> =>
      listSpellFrameworkSkills(tradition),
    [],
  );

  async function refreshHierarchy(): Promise<RecursiveSkillLibrary> {
    setLoadingLibrary(true);
    try {
      const [nextHierarchy, nextFilterOptions] = await Promise.all([
        getRecursiveSkillLibrary(),
        getSkillFilterOptions(),
      ]);
      setHierarchy(nextHierarchy);
      setFilterOptions(nextFilterOptions);
      return nextHierarchy;
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function openSkill(skillId: number, pathKey: string) {
    setLoadingEditor(true);
    setFeedback(null);
    try {
      const aggregate = await getSkill(skillId);
      if (!aggregate) throw new Error("That exact Skill identity no longer exists.");
      setDraft(aggregate);
      setSelectedPathKey(pathKey);
      setCreationParentPathKey(null);
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

  function selectSkill(skill: RecursiveSkillNode, path: RecursiveSkillPath) {
    if (dirty) {
      setPendingEditorChange({ kind: "open", skillId: skill.id, pathKey: path.key });
      return;
    }
    void openSkill(skill.id, path.key);
  }

  function createRoot() {
    setDraft(newSkillDraft());
    setSelectedPathKey(null);
    setCreationParentPathKey(null);
    setDirty(false);
    setFeedback(null);
  }

  function createChild(parentId: number, parentName: string, pathKey: string) {
    setDraft(newSkillDraft({ id: parentId, name: parentName }));
    setSelectedPathKey(pathKey);
    setCreationParentPathKey(pathKey);
    setDirty(false);
    setFeedback(null);
  }

  function beginNewRoot() {
    if (dirty) {
      setPendingEditorChange({ kind: "new-root" });
      return;
    }
    createRoot();
  }

  function beginNewChild(parent: RecursiveSkillNode, path: RecursiveSkillPath) {
    if (dirty) {
      setPendingEditorChange({
        kind: "new-child",
        parentId: parent.id,
        parentName: parent.name,
        pathKey: path.key,
      });
      return;
    }
    createChild(parent.id, parent.name, path.key);
  }

  function discardAndContinue() {
    const pending = pendingEditorChange;
    setPendingEditorChange(null);
    if (!pending) return;
    if (pending.kind === "new-root") {
      createRoot();
      return;
    }
    if (pending.kind === "new-child") {
      createChild(pending.parentId, pending.parentName, pending.pathKey);
      return;
    }
    void openSkill(pending.skillId, pending.pathKey);
  }

  async function persistCurrentSkill(structuralChangeConfirmed: boolean) {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await saveSkill(draft, { structuralChangeConfirmed });
      const nextHierarchy = await refreshHierarchy();
      const preferredIds = creationParentPathKey
        ? [...creationParentPathKey.split(">").map(Number), saved.id]
        : [saved.id];
      const selectedPath = nextHierarchy.paths.find((path) => (
        path.endpointSkillId === saved.id &&
        path.rootToEndpointIds.length === preferredIds.length &&
        path.rootToEndpointIds.every((id, index) => id === preferredIds[index])
      )) ?? nextHierarchy.paths.find(({ endpointSkillId }) => endpointSkillId === saved.id) ?? null;
      setDraft(saved);
      setSelectedPathKey(selectedPath?.key ?? null);
      setCreationParentPathKey(null);
      setDirty(false);
      setStructuralPreview(null);
      setFeedback({ kind: "success", message: `${saved.core.name} (#${saved.id}) was saved and placed from its canonical relationships.` });
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
      setCreationParentPathKey(null);
      setDirty(false);
      setFeedback({ kind: "success", message: `${deletedName} was deleted.` });
      await refreshHierarchy();
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
          library={hierarchy}
          selectedPathKey={selectedPathKey}
          loading={loadingLibrary}
          onSelect={selectSkill}
          onNewRoot={beginNewRoot}
          onNewChild={beginNewChild}
          onBackToOverview={() => setSelectedPathKey(null)}
        />

        {loadingEditor ? (
          <section className="skill-editor skill-editor--empty"><p>LOADING SKILL</p></section>
        ) : (
          <SkillEditor
            key={draft?.id ?? `new-skill:${creationParentPathKey ?? "root"}`}
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
              <div><strong>Proposed paths</strong>{structuralPreview.proposedPaths.length ? structuralPreview.proposedPaths.map((path) => <span key={path.key}>{pathLabel(path)}</span>) : <span>Review Required · no complete root path</span>}</div>
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

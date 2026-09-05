"use client";

import { useState, type ReactNode } from "react";

import type { Tradition } from "@/features/spell-construction/models/spell";
import type { RecursiveSkillLibrary } from "@/features/skills/recursive-skill-library";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import type {
  SkillDraft,
  SkillFilterOptions,
  SpellFrameworkSkill,
} from "./actions";
import { skillAttributeOptions } from "./skill-attributes";
import { SkillConstructionEditor } from "./skill-construction-editor";
import { SkillPathEditor } from "./skill-path-editor";
import { SkillPreview } from "./skill-preview";

type SkillEditorTab = "core" | "pathing" | "construction" | "preview";

type SkillEditorProps = {
  draft: SkillDraft | null;
  hierarchy: RecursiveSkillLibrary;
  filterOptions: SkillFilterOptions;
  saving: boolean;
  dirty: boolean;
  archived: boolean;
  archiveReason: string;
  feedback: { kind: "success" | "error"; message: string } | null;
  onChange: (draft: SkillDraft) => void;
  onSave: () => void;
  lifecycleControls: ReactNode;
  findFrameworkSkills: (tradition: Tradition) => Promise<SpellFrameworkSkill[]>;
};

const TABS: readonly { id: SkillEditorTab; label: string }[] = [
  { id: "core", label: "Core Details" },
  { id: "pathing", label: "Pathing" },
  { id: "construction", label: "Construction" },
  { id: "preview", label: "Preview" },
];

const DEFAULT_CLASSIFICATIONS = [
  "standard",
  "sphere",
  "spell",
  "discipline",
  "psionic skill",
  "resonance",
  "reverberation",
  "magic access",
  "magic regeneration",
  "magic stabalization",
  "special ability",
] as const;

function classificationLabel(classification: string): string {
  return classification.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hasSkillAttribute(core: SkillDraft["core"]) {
  return Boolean(core.primaryAttribute?.trim() || core.secondaryAttribute?.trim());
}

function updateSkillAttribute(
  core: SkillDraft["core"],
  attribute: "primaryAttribute" | "secondaryAttribute",
  value: string | null,
) {
  const previouslyHadAttribute = hasSkillAttribute(core);
  const next = { ...core, [attribute]: value };

  if (!hasSkillAttribute(next)) {
    return {
      ...next,
      classification: "special ability",
      tier: null,
    };
  }

  if (!previouslyHadAttribute && core.classification === "special ability") {
    return { ...next, classification: "standard" };
  }

  return next;
}

export function SkillEditor({
  draft,
  hierarchy,
  filterOptions,
  saving,
  dirty,
  archived,
  archiveReason,
  feedback,
  onChange,
  onSave,
  lifecycleControls,
  findFrameworkSkills,
}: SkillEditorProps) {
  const [activeTab, setActiveTab] = useState<SkillEditorTab>("core");
  const preserveScroll = useInPlaceScrollPreservation();

  if (!draft) {
    return (
      <section className="skill-editor skill-editor--empty">
        <p>SKILL EDITOR</p>
        <h2>Select a Skill or begin a new one.</h2>
        <span>The library loads lightweight rows; full details open only here.</span>
      </section>
    );
  }

  const updateCore = (update: Partial<SkillDraft["core"]>) =>
    onChange({
      ...draft,
      core: { ...draft.core, ...update },
    });

  const updateAttribute = (
    attribute: "primaryAttribute" | "secondaryAttribute",
    value: string | null,
  ) =>
    onChange({
      ...draft,
      core: updateSkillAttribute(draft.core, attribute, value),
    });

  const hasAttribute = hasSkillAttribute(draft.core);
  const primaryAttributeOptions = skillAttributeOptions([
    ...filterOptions.primaryAttributes,
    ...(draft.core.primaryAttribute ? [draft.core.primaryAttribute] : []),
  ]);
  const secondaryAttributeOptions = skillAttributeOptions([
    ...filterOptions.secondaryAttributes,
    ...(draft.core.secondaryAttribute ? [draft.core.secondaryAttribute] : []),
  ]);
  const classificationOptions = [
    ...new Set([
      ...DEFAULT_CLASSIFICATIONS,
      ...filterOptions.classifications,
      draft.core.classification,
    ]),
  ].filter(Boolean);

  return (
    <section className="skill-editor">
      <header className="skill-editor__header">
        <div>
          <p>{draft.id ? `SKILL ${draft.id}` : "NEW SKILL DRAFT"}</p>
          <h2>{draft.core.name || "Untitled Skill"}</h2>
          <span>{archived ? `Archived${archiveReason ? ` · ${archiveReason}` : ""}` : dirty ? "Unsaved changes" : draft.id ? "Saved" : "Not yet persisted"}</span>
        </div>

        <div className="skill-editor__actions">
          {lifecycleControls}

          <button
            className="skills-primary-button"
            type="button"
            disabled={saving || archived}
            onClick={onSave}
          >
            {saving ? "Saving…" : "Save Skill"}
          </button>
        </div>
      </header>

      {feedback && (
        <p className={`skill-editor__feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
          {feedback.message}
        </p>
      )}

      <nav className="skill-editor__tabs" aria-label="Skill editor sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "is-active" : ""}
            aria-pressed={activeTab === tab.id}
            onClick={() => void preserveScroll(() => setActiveTab(tab.id))}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <fieldset className="skill-editor__content lifecycle-editor-fields" disabled={archived}>
        {activeTab === "core" && (
          <div className="skill-core-editor">
            <div className="skill-editor__intro">
              <p>Universal information shared by every Serrian Tide Skill.</p>
            </div>

            <div className="skill-core-editor__grid">
              <label className="skill-core-editor__name">
                <span>Name *</span>
                <input
                  value={draft.core.name}
                  onChange={(event) => updateCore({ name: event.target.value })}
                />
              </label>

              <label>
                <span>Classification</span>
                <select
                  value={draft.core.classification}
                  disabled={!hasAttribute}
                  title={
                    hasAttribute
                      ? undefined
                      : "Skills without an attribute are Special Abilities."
                  }
                  onChange={(event) => updateCore({ classification: event.target.value })}
                >
                  {classificationOptions.map((classification) => (
                    <option key={classification} value={classification}>
                      {classificationLabel(classification)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Tier</span>
                <input
                  type="number"
                  min={1}
                  placeholder="N/A"
                  disabled={!hasAttribute}
                  value={draft.core.tier ?? ""}
                  onChange={(event) =>
                    updateCore({
                      tier: event.target.value ? Number(event.target.value) : null,
                    })
                  }
                />
              </label>

              <label>
                <span>Primary Attribute</span>
                <select
                  value={draft.core.primaryAttribute ?? ""}
                  onChange={(event) =>
                    updateAttribute("primaryAttribute", event.target.value || null)
                  }
                >
                  <option value="">N/A</option>
                  {primaryAttributeOptions.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Secondary Attribute</span>
                <select
                  value={draft.core.secondaryAttribute ?? ""}
                  onChange={(event) =>
                    updateAttribute("secondaryAttribute", event.target.value || null)
                  }
                >
                  <option value="">N/A</option>
                  {secondaryAttributeOptions.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
            </div>

            {!hasAttribute && (
              <p className="skill-core-editor__attribute-rule">
                With no attribute selected, this Skill is a Special Ability and has no tier.
              </p>
            )}

            <label>
              <span>Definition</span>
              <textarea
                rows={10}
                value={draft.core.definition}
                onChange={(event) => updateCore({ definition: event.target.value })}
              />
            </label>
          </div>
        )}

        {activeTab === "pathing" && (
          <SkillPathEditor
            skillId={draft.id}
            skillName={draft.core.name}
            proposedSkill={draft.core}
            hierarchy={hierarchy}
            relationships={draft.relationships}
            onChange={(relationships) => onChange({ ...draft, relationships })}
          />
        )}

        {activeTab === "construction" && (
          <SkillConstructionEditor
            draft={draft}
            onChange={onChange}
            findFrameworkSkills={findFrameworkSkills}
          />
        )}

        {activeTab === "preview" && <SkillPreview draft={draft} />}
      </fieldset>
    </section>
  );
}

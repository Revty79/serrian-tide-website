"use client";

import { useState } from "react";
import { changeSkillExtension } from "@/features/skills/skill-extension-draft";

import type { SpellDocument, Tradition } from "@/features/spell-construction/models/spell";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import type { SkillDraft, SpellFrameworkSkill } from "./actions";
import { SPELL_CONSTRUCTION_EXTENSION } from "./constants";
import { SpellConstructionEditor } from "./spell-construction-editor";

export function SkillConstructionEditor({
  draft,
  onChange,
  findFrameworkSkills,
}: {
  draft: SkillDraft;
  onChange: (draft: SkillDraft) => void;
  findFrameworkSkills: (tradition: Tradition) => Promise<SpellFrameworkSkill[]>;
}) {
  const [confirmDetach, setConfirmDetach] = useState(false);
  const preserveScroll = useInPlaceScrollPreservation();

  const extensionIndex = draft.extensions.findIndex(
    ({ extensionType }) => extensionType === SPELL_CONSTRUCTION_EXTENSION,
  );
  const extension = draft.extensions[extensionIndex];

  function attachSpellConstruction() {
    const spell = { ...createEmptySpell(), name: draft.core.name };

    onChange(changeSkillExtension(draft, { operation: "upsert", extensionType: SPELL_CONSTRUCTION_EXTENSION, schemaVersion: spell.schemaVersion, data: spell }));
  }

  function updateDocument(document: SpellDocument) {
    onChange(changeSkillExtension(draft, { operation: "upsert", extensionType: SPELL_CONSTRUCTION_EXTENSION, schemaVersion: document.schemaVersion, data: document }));
  }

  if (!extension) {
    return (
      <div className="skill-construction-empty">
        <p>NO ADDITIONAL CONSTRUCTION</p>
        <h3>This is an ordinary Skill.</h3>
        <span>
          Spell Construction remains optional and subordinate to the Skill record.
        </span>
        <button
          className="skills-primary-button"
          type="button"
          onClick={() => void preserveScroll(attachSpellConstruction)}
        >
          Attach Spell Construction
        </button>
      </div>
    );
  }

  const document = extension.data as SpellDocument;
  if (extension.readStatus === "unsupported" || extension.readStatus === "invalid") return (
    <section className="skill-construction-empty" role="status">
      <h3>Spell Construction is unavailable in this editor</h3>
      {extension.diagnostics?.map((message, index) => <p key={index}>{message}</p>)}
      <p>You can save Skill details while the attached construction remains preserved. Use a compatible editor to change it.</p>
    </section>
  );

  return (
    <div className="skill-construction">
      <div className="skill-construction__identity">
        <div>
          <p>ATTACHED EXTENSION</p>
          <h3>Spell Construction</h3>
          <span>The Skill remains the master identity for this document.</span>
        </div>

        {confirmDetach ? (
          <div className="skill-construction__detach-confirm">
            <span>Remove the saved construction document?</span>
            <button
              className="skills-danger-button"
              type="button"
              onClick={() => void preserveScroll(() => {
                onChange(changeSkillExtension(draft, { operation: "remove", extensionType: SPELL_CONSTRUCTION_EXTENSION }));
                setConfirmDetach(false);
              })}
            >
              Confirm Remove
            </button>
            <button type="button" onClick={() => void preserveScroll(() => setConfirmDetach(false))}>
              Keep It
            </button>
          </div>
        ) : (
          <button
            className="skills-danger-button"
            type="button"
            onClick={() => void preserveScroll(() => setConfirmDetach(true))}
          >
            Detach Construction
          </button>
        )}
      </div>

      <SpellConstructionEditor
        document={document}
        onChange={updateDocument}
        findFrameworkSkills={findFrameworkSkills}
      />
    </div>
  );
}

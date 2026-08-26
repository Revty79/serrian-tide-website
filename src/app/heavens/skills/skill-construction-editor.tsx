"use client";

import { useState } from "react";

import type { SpellDocument, Tradition } from "@/features/spell-construction/models/spell";
import { createEmptySpell } from "@/features/spell-construction/utilities/spellFactory";

import {
  SPELL_CONSTRUCTION_EXTENSION,
  type SkillDraft,
  type SpellFrameworkSkill,
} from "./actions";
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

  const extensionIndex = draft.extensions.findIndex(
    ({ extensionType }) => extensionType === SPELL_CONSTRUCTION_EXTENSION,
  );
  const extension = draft.extensions[extensionIndex];

  function attachSpellConstruction() {
    const spell = { ...createEmptySpell(), name: draft.core.name };

    onChange({
      ...draft,
      extensions: [
        ...draft.extensions,
        {
          extensionType: SPELL_CONSTRUCTION_EXTENSION,
          schemaVersion: spell.schemaVersion,
          data: spell,
        },
      ],
    });
  }

  function updateDocument(document: SpellDocument) {
    onChange({
      ...draft,
      extensions: draft.extensions.map((candidate, index) =>
        index === extensionIndex
          ? {
              ...candidate,
              schemaVersion: document.schemaVersion,
              data: document,
            }
          : candidate,
      ),
    });
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
          onClick={attachSpellConstruction}
        >
          Attach Spell Construction
        </button>
      </div>
    );
  }

  const document = extension.data as SpellDocument;

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
              onClick={() => {
                onChange({
                  ...draft,
                  extensions: draft.extensions.filter(
                    ({ extensionType }) =>
                      extensionType !== SPELL_CONSTRUCTION_EXTENSION,
                  ),
                });
                setConfirmDetach(false);
              }}
            >
              Confirm Remove
            </button>
            <button type="button" onClick={() => setConfirmDetach(false)}>
              Keep It
            </button>
          </div>
        ) : (
          <button
            className="skills-danger-button"
            type="button"
            onClick={() => setConfirmDetach(true)}
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

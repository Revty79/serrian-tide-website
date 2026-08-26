"use client";

import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { validateSpell } from "@/features/spell-construction/engine/validateSpell";
import type { SpellDocument } from "@/features/spell-construction/models/spell";

import type { SkillDraft } from "./actions";
import { SPELL_CONSTRUCTION_EXTENSION } from "./constants";

const MAGIC_CLASSIFICATIONS = new Set([
  "spell",
  "psionic skill",
  "reverberation",
]);

export function SkillPreview({ draft }: { draft: SkillDraft }) {
  const spellExtension = draft.extensions.find(
    ({ extensionType }) => extensionType === SPELL_CONSTRUCTION_EXTENSION,
  );
  const spell = spellExtension?.data as SpellDocument | undefined;
  const calculation = spell ? calculateSpell(spell) : null;
  const validation = spell && calculation
    ? validateSpell(spell, undefined, calculation)
    : null;
  const isMagicSkill = MAGIC_CLASSIFICATIONS.has(
    draft.core.classification.toLowerCase(),
  );

  return (
    <article className="skill-preview">
      <header>
        <p>{draft.core.classification || "standard"}</p>
        <h3>{draft.core.name || "Untitled Skill"}</h3>
      </header>

      <dl className="skill-preview__facts">
        <div><dt>Tier</dt><dd>{draft.core.tier ?? "N/A"}</dd></div>
        <div><dt>Primary Attribute</dt><dd>{draft.core.primaryAttribute || "N/A"}</dd></div>
        <div><dt>Secondary Attribute</dt><dd>{draft.core.secondaryAttribute || "N/A"}</dd></div>
      </dl>

      <section>
        <h4>Definition</h4>
        <p>{draft.core.definition || "No definition has been written."}</p>
      </section>

      <section>
        <h4>Path Information</h4>
        {draft.relationships.length === 0 ? (
          <p>No parent or prerequisite relationships.</p>
        ) : (
          <ol>
            {draft.relationships.map((relationship) => (
              <li key={`${relationship.relatedSkillId}-${relationship.relationshipType}`}>
                {relationship.relatedSkillName ?? `Skill ${relationship.relatedSkillId}`}
                <span>{relationship.relationshipType}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {spell && calculation && validation ? (
        <section className="skill-preview__spell">
          <div className="skill-preview__spell-heading">
            <div>
              <p>SPELL CONSTRUCTION</p>
              <h4>{spell.tradition}</h4>
            </div>
            <strong className={`is-${validation.status.toLowerCase()}`}>
              {validation.status}
            </strong>
          </div>

          <dl className="skill-preview__facts skill-preview__facts--spell">
            <div><dt>Base Mana</dt><dd>{calculation.baseSpellManaCost}</dd></div>
            <div><dt>Spell Mastery</dt><dd>{calculation.baseSpellMastery}</dd></div>
            <div><dt>Combat Time</dt><dd>{calculation.baseCombatCastingTime} Initiative</dd></div>
            <div><dt>Out of Combat</dt><dd>{calculation.baseOutOfCombatCastingTimeSeconds}s</dd></div>
          </dl>

          <div className="skill-preview__text-grid">
            <div><span>Description</span><p>{spell.description || "Not specified"}</p></div>
            <div><span>Flavor Line</span><p>{spell.flavorLine || "Not specified"}</p></div>
            <div><span>Construction Notes</span><p>{spell.notes || "Not specified"}</p></div>
          </div>

          <div className="skill-preview__breakdown">
            <h5>Mana Breakdown</h5>
            <div className="skill-preview__table-wrap">
              <table>
                <thead>
                  <tr><th>Component</th><th>Category</th><th>Mana</th></tr>
                </thead>
                <tbody>
                  {calculation.breakdown.map((line, index) => (
                    <tr key={`${line.id}-${index}`}>
                      <td style={{ paddingLeft: `${12 + line.depth * 14}px` }}>
                        <strong>{line.label}</strong>
                        {line.detail ? <span>{line.detail}</span> : null}
                        {line.componentDescription ? <small>{line.componentDescription}</small> : null}
                      </td>
                      <td>{line.category}</td>
                      <td>{line.cost >= 0 ? "+" : ""}{line.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="skill-preview__validation">
            <h5>Validation</h5>
            {validation.issues.length === 0 ? (
              <p>No validation issues.</p>
            ) : (
              <ul>
                {validation.issues.map((issue, index) => (
                  <li key={`${issue.id}-${index}`}>
                    <strong>{issue.severity}: {issue.message}</strong>
                    <span>{issue.explanation}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : isMagicSkill ? (
        <section className="skill-preview__spell">
          <h4>Spell Construction</h4>
          <p>No Spell Construction document is attached to this magic Skill yet.</p>
        </section>
      ) : null}
    </article>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import {
  SPELL_IDENTITY_BY_TRADITION,
} from "@/features/spell-construction/data/spellIdentity";
import { serrianTideRules } from "@/features/spell-construction/data/spellRules";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import { hasProgressiveSpellModifier } from "@/features/spell-construction/engine/progressiveSpell";
import { validateSpell } from "@/features/spell-construction/engine/validateSpell";
import {
  TRADITIONS,
  type SpellDocument,
  type Tradition,
} from "@/features/spell-construction/models/spell";
import {
  createContainer,
  createModifierSelection,
} from "@/features/spell-construction/utilities/spellFactory";

import type { SpellFrameworkSkill } from "./actions";
import { ProgressiveSpellEditor } from "./spell/progressive-spell-editor";
import { SpellContainerEditor } from "./spell/spell-container-editor";
import { SpellModifierEditor } from "./spell/spell-modifier-editor";

export function SpellConstructionEditor({
  document,
  onChange,
  findFrameworkSkills,
}: {
  document: SpellDocument;
  onChange: (document: SpellDocument) => void;
  findFrameworkSkills: (tradition: Tradition) => Promise<SpellFrameworkSkill[]>;
}) {
  const [frameworkResult, setFrameworkResult] = useState<{
    tradition: Tradition | null;
    options: SpellFrameworkSkill[];
    state: "ready" | "error";
  }>({ tradition: null, options: [], state: "ready" });
  const baseCalculation = useMemo(() => calculateSpell(document), [document]);
  const progressiveEnabled = hasProgressiveSpellModifier(document);
  const activeValidation = useMemo(
    () =>
      validateSpell(
        { ...document, practitionerLevel: undefined },
        undefined,
        baseCalculation,
      ),
    [baseCalculation, document],
  );

  const frameworkIsCurrent = frameworkResult.tradition === document.tradition;
  const frameworkOptions = frameworkIsCurrent ? frameworkResult.options : [];
  const frameworkState = frameworkIsCurrent ? frameworkResult.state : "loading";
  const identity = SPELL_IDENTITY_BY_TRADITION[document.tradition];
  const frameworkName = document[identity.field];
  const selectedFrameworkAvailable = frameworkOptions.some(
    ({ id }) => id === document.frameworkSkillId,
  );
  useEffect(() => {
    let active = true;

    findFrameworkSkills(document.tradition)
      .then((options) => {
        if (!active) return;
        setFrameworkResult({ tradition: document.tradition, options, state: "ready" });
      })
      .catch(() => {
        if (!active) return;
        setFrameworkResult({ tradition: document.tradition, options: [], state: "error" });
      });

    return () => {
      active = false;
    };
  }, [document.tradition, findFrameworkSkills]);

  function update(next: Partial<SpellDocument>) {
    onChange({ ...document, ...next, modifiedAt: new Date().toISOString() });
  }

  function setProgressive(enabled: boolean) {
    const withoutProgressive = document.modifiers.filter(
      ({ ruleId }) => ruleId !== "progressive-spell",
    );

    update({
      modifiers: enabled
        ? [...withoutProgressive, createModifierSelection("progressive-spell")]
        : withoutProgressive,
      progressive: { ...document.progressive, enabled },
    });
  }

  return (
    <div className="spell-builder">
      <section className="spell-builder__identity">
        <div className="spell-builder__section-heading">
          <div>
            <p>SPELL EXTENSION</p>
            <h4>Construction Identity</h4>
          </div>
          <span>Document schema v{document.schemaVersion} · Rules v{serrianTideRules.version}</span>
        </div>

        <div className="spell-builder__inline-fields">
          <label>
            <span>Tradition</span>
            <select
              value={document.tradition}
              onChange={(event) => {
                const tradition = event.target.value as SpellDocument["tradition"];
                update({
                  tradition,
                  castingSystem:
                    tradition === "Psionics"
                      ? "Psyonics"
                      : tradition === "Bardic Resonance"
                        ? "Bardic Resonance"
                        : undefined,
                  frameworkSkillId: undefined,
                  sphere: "",
                  discipline: "",
                  resonance: "",
                });
              }}
            >
              {TRADITIONS.map((tradition) => (
                <option key={tradition} value={tradition}>{tradition}</option>
              ))}
            </select>
          </label>

          <label>
            <span>{identity.label}</span>
            <select
              value={document.frameworkSkillId ? String(document.frameworkSkillId) : ""}
              disabled={frameworkState === "loading"}
              onChange={(event) => {
                const selectedId = Number(event.target.value);
                const selected = frameworkOptions.find(({ id }) => id === selectedId);
                update({
                  frameworkSkillId: selected?.id,
                  sphere: identity.field === "sphere" ? selected?.name ?? "" : "",
                  discipline:
                    identity.field === "discipline" ? selected?.name ?? "" : "",
                  resonance:
                    identity.field === "resonance" ? selected?.name ?? "" : "",
                });
              }}
            >
              <option value="">
                {frameworkState === "loading"
                  ? `Loading ${identity.label}s...`
                  : `Select ${identity.label}`}
              </option>
              {document.frameworkSkillId && !selectedFrameworkAvailable && (
                <option value={document.frameworkSkillId}>
                  Unavailable: {frameworkName || `Skill ${document.frameworkSkillId}`}
                </option>
              )}
              {frameworkOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>

            {frameworkState === "error" && (
              <small className="spell-builder__field-note is-error">
                The Skill Library could not be read.
              </small>
            )}
            {frameworkState === "ready" && frameworkOptions.length === 0 && (
              <small className="spell-builder__field-note">
                No eligible {identity.label.toLowerCase()} Skills exist in this tree yet.
              </small>
            )}
            {!document.frameworkSkillId && frameworkName && (
              <small className="spell-builder__field-note">
                Saved legacy value: {frameworkName}. Select its Skill Library record to link it.
              </small>
            )}
          </label>
        </div>

        <label>
          <span>Spell Description</span>
          <textarea
            rows={3}
            value={document.description}
            onChange={(event) => update({ description: event.target.value })}
          />
        </label>

        <div className="spell-builder__inline-fields">
          <label>
            <span>Flavor Line</span>
            <input
              value={document.flavorLine}
              onChange={(event) => update({ flavorLine: event.target.value })}
            />
          </label>
          <label>
            <span>Construction Notes</span>
            <input
              value={document.notes}
              onChange={(event) => update({ notes: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="spell-builder__summary">
        <div><span>Base Mana</span><strong>{baseCalculation.baseSpellManaCost}</strong></div>
        <div><span>Spell Mastery</span><strong>{baseCalculation.baseSpellMastery}</strong></div>
        <div><span>Base Combat Time</span><strong>{baseCalculation.baseCombatCastingTime} Initiative</strong></div>
        <div><span>Out of Combat</span><strong>{baseCalculation.baseOutOfCombatCastingTimeSeconds}s</strong></div>
      </section>

      <section className="spell-builder__section">
        <div className="spell-builder__section-heading">
          <div>
            <p>RECURSIVE MODEL</p>
            <h4>Base Construction</h4>
          </div>
          <button
            type="button"
            onClick={() => update({ containers: [...document.containers, createContainer()] })}
          >
            Add Root Container
          </button>
        </div>

        <div className="spell-builder__containers">
          {document.containers.map((container, index) => (
            <SpellContainerEditor
              key={container.id}
              container={container}
              depth={0}
              ordinal={String(index + 1)}
              onChange={(next) =>
                update({
                  containers: document.containers.map((candidate) =>
                    candidate.id === container.id ? next : candidate,
                  ),
                })
              }
              onRemove={() =>
                update({
                  containers: document.containers.filter(({ id }) => id !== container.id),
                })
              }
            />
          ))}
        </div>

        <SpellModifierEditor
          selections={document.modifiers}
          onChange={(modifiers) => update({ modifiers })}
        />
      </section>

      <section className="spell-builder__section">
        <div className="spell-builder__section-heading">
          <div>
            <p>SKILLS WITH EXTRA STEPS</p>
            <h4>Progressive Spell</h4>
          </div>
          <label className="spell-builder__checkbox">
            <input
              type="checkbox"
              checked={progressiveEnabled}
              onChange={(event) => setProgressive(event.target.checked)}
            />
            <span>Attach Progressive Spell behavior</span>
          </label>
        </div>

        {progressiveEnabled ? (
          <ProgressiveSpellEditor
            spell={document}
            onChange={(progressive) => update({ progressive })}
          />
        ) : (
          <p className="spell-builder__empty">
            This spell does not use inherited Progressive tiers.
          </p>
        )}
      </section>

      <section className={`spell-builder__validation is-${activeValidation.status.toLowerCase()}`}>
        <div className="spell-builder__section-heading">
          <div>
            <p>CURRENT RULE PROFILE</p>
            <h4>Validation: {activeValidation.status}</h4>
          </div>
          <span>{activeValidation.issues.length} issues</span>
        </div>

        {activeValidation.issues.length === 0 ? (
          <p>No validation issues.</p>
        ) : (
          <ul>
            {activeValidation.issues.map((issue, index) => (
              <li key={`${issue.id}-${index}`}>
                <strong>{issue.severity}</strong> {issue.message}
                <span>{issue.explanation}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="spell-builder__breakdown">
        <summary>Cost Breakdown ({baseCalculation.breakdown.length} lines)</summary>
        <table>
          <thead>
            <tr><th>Component</th><th>Category</th><th>Mana</th></tr>
          </thead>
          <tbody>
            {baseCalculation.breakdown.map((line, index) => (
              <tr key={`${line.id}-${index}`}>
                <td style={{ paddingLeft: `${12 + line.depth * 12}px` }}>
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
      </details>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import {
  PROGRESSIVE_LEVELS,
  previousProgressiveLevel,
} from "@/features/spell-construction/data/progressiveRules";
import {
  diffProgressiveStructures,
  resolveProgressiveSpellForLevel,
} from "@/features/spell-construction/engine/progressiveSpell";
import type { PractitionerLevel } from "@/features/spell-construction/models/rules";
import type {
  ProgressiveMilestone,
  ProgressiveSpellData,
  ProgressiveSpellStructure,
  SpellDocument,
} from "@/features/spell-construction/models/spell";
import { createContainer } from "@/features/spell-construction/utilities/spellFactory";
import { useInPlaceScrollPreservation } from "@/lib/in-place-scroll";

import { SpellContainerEditor } from "./spell-container-editor";
import { SpellModifierEditor } from "./spell-modifier-editor";

export function ProgressiveSpellEditor({
  spell,
  onChange,
}: {
  spell: SpellDocument;
  onChange: (progressive: ProgressiveSpellData) => void;
}) {
  const [level, setLevel] = useState<PractitionerLevel>(
    spell.practitionerLevel ?? "Apprentice",
  );
  const preserveScroll = useInPlaceScrollPreservation();

  const resolution = useMemo(
    () => resolveProgressiveSpellForLevel(spell, level),
    [level, spell],
  );

  function updateTier(
    targetLevel: PractitionerLevel,
    update: (tier: ProgressiveMilestone) => ProgressiveMilestone,
  ) {
    onChange({
      ...spell.progressive,
      enabled: true,
      costMode: "original-base",
      milestones: spell.progressive.milestones.map((tier) =>
        tier.level === targetLevel ? update(tier) : tier,
      ),
    });
  }

  function updateResolvedStructure(next: ProgressiveSpellStructure) {
    updateTier(level, (tier) => ({
      ...tier,
      changes: diffProgressiveStructures(resolution.inheritedStructure, next),
    }));
  }

  const tier = spell.progressive.milestones.find(
    (candidate) => candidate.level === level,
  );
  if (!tier) return null;

  return (
    <section className="progressive-editor">
      <div className="progressive-editor__policy">
        <strong>ONE SPELL · ONE BASE MANA COST</strong>
        <p>
          The Apprentice construction fixes Base Mana and casting time. Higher tiers
          store inherited changes at +0 additional Mana; they change effectiveness,
          not the original casting cost.
        </p>
      </div>

      <div className="progressive-editor__levels" role="tablist" aria-label="Progressive tier">
        {PROGRESSIVE_LEVELS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={level === candidate}
            className={level === candidate ? "is-active" : ""}
            onClick={() => void preserveScroll(() => setLevel(candidate))}
          >
            {candidate}
          </button>
        ))}
      </div>

      <div className="progressive-editor__tier">
        <div className="spell-builder__inline-fields">
          <label>
            <span>Tier Name</span>
            <input
              value={tier.tierName}
              onChange={(event) =>
                updateTier(level, (current) => ({
                  ...current,
                  tierName: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>Future Progression Condition</span>
            <input
              value={tier.condition}
              onChange={(event) =>
                updateTier(level, (current) => ({
                  ...current,
                  condition: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <label>
          <span>Tier Description</span>
          <textarea
            rows={3}
            value={tier.description}
            onChange={(event) =>
              updateTier(level, (current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </label>

        <div className="spell-builder__inline-fields">
          <label>
            <span>Flavor Change</span>
            <input
              value={tier.flavorLine}
              onChange={(event) =>
                updateTier(level, (current) => ({
                  ...current,
                  flavorLine: event.target.value,
                }))
              }
            />
          </label>

          <label>
            <span>Tier Notes</span>
            <input
              value={tier.notes}
              onChange={(event) =>
                updateTier(level, (current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
            />
          </label>
        </div>

        {level === "Apprentice" ? (
          <p className="spell-builder__notice">
            Apprentice is the original base. Edit its structure in the Base
            Construction section above.
          </p>
        ) : (
          <div className="progressive-editor__structure">
            <div className="spell-builder__subheading">
              <div>
                <p>INHERITS {previousProgressiveLevel(level)?.toUpperCase()}</p>
                <h5>{level} Structural Changes</h5>
              </div>

              <div className="spell-builder__add-row">
                <span>{tier.changes.length} stored changes</span>
                {tier.changes.length > 0 && (
                  <button
                    className="spell-builder__remove"
                    type="button"
                    onClick={() => void preserveScroll(() =>
                      updateTier(level, (current) => ({ ...current, changes: [] })))
                    }
                  >
                    Reset Tier
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void preserveScroll(() =>
                    updateResolvedStructure({
                      ...resolution.resolvedStructure,
                      containers: [
                        ...resolution.resolvedStructure.containers,
                        createContainer(),
                      ],
                    })
                  )}
                >
                  Add Container
                </button>
              </div>
            </div>

            {resolution.resolvedStructure.containers.map((container, index) => (
              <SpellContainerEditor
                key={container.id}
                container={container}
                depth={0}
                ordinal={String(index + 1)}
                onChange={(next) =>
                  updateResolvedStructure({
                    ...resolution.resolvedStructure,
                    containers: resolution.resolvedStructure.containers.map(
                      (candidate) => (candidate.id === container.id ? next : candidate),
                    ),
                  })
                }
                onRemove={() =>
                  updateResolvedStructure({
                    ...resolution.resolvedStructure,
                    containers: resolution.resolvedStructure.containers.filter(
                      ({ id }) => id !== container.id,
                    ),
                  })
                }
              />
            ))}

            <SpellModifierEditor
              selections={resolution.resolvedStructure.modifiers}
              excludedRuleIds={["progressive-spell"]}
              onChange={(modifiers) =>
                updateResolvedStructure({
                  ...resolution.resolvedStructure,
                  modifiers,
                })
              }
            />
          </div>
        )}

        <div className="progressive-editor__summary">
          <span>Original Base Mana <strong>{resolution.originalCalculation.baseSpellManaCost}</strong></span>
          <span>Resolved Construction <strong>{resolution.resolvedConstructionCalculation.baseSpellManaCost}</strong></span>
          <span>Casting Cost <strong>{resolution.castingCalculation.baseSpellManaCost}</strong></span>
          <span>Validation <strong>{resolution.validation.status}</strong></span>
        </div>
      </div>
    </section>
  );
}

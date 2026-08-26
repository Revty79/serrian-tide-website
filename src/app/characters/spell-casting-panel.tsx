"use client";

import { useMemo, useState } from "react";

import {
  RAW_CASTING_CIRCUMSTANCES,
  getRawCastingCircumstanceLabels,
  type RawCastingCircumstanceId,
} from "@/features/spell-construction/data/rawCastingRules";
import { getMagicType } from "@/features/spell-construction/data/spellIdentity";
import {
  calculateCastingCircumstance,
  calculateCastingCircumstanceWithoutPractitioner,
} from "@/features/spell-construction/engine/calculateCastingCircumstance";
import { calculatePractitioner } from "@/features/spell-construction/engine/calculatePractitioner";
import { calculateSpell } from "@/features/spell-construction/engine/calculateSpell";
import {
  hasProgressiveSpellModifier,
  resolveProgressiveSpellForLevel,
} from "@/features/spell-construction/engine/progressiveSpell";
import {
  PRACTITIONER_LEVELS,
  type PractitionerLevel,
} from "@/features/spell-construction/models/rules";
import type { SpellDocument } from "@/features/spell-construction/models/spell";

import "./spell-casting-panel.css";

export function SpellCastingPanel({
  spell,
  practitionerLevel,
  onPractitionerLevelChange,
  castingSystem,
  manaPool,
  automaticKnownSpell = false,
}: {
  spell: SpellDocument;
  practitionerLevel?: PractitionerLevel;
  onPractitionerLevelChange?: (level: PractitionerLevel | undefined) => void;
  castingSystem?: string;
  manaPool?: number;
  automaticKnownSpell?: boolean;
}) {
  const [circumstance, setCircumstance] =
    useState<RawCastingCircumstanceId>();
  const baseCalculation = useMemo(() => calculateSpell(spell), [spell]);
  const progressiveResolution = useMemo(
    () =>
      hasProgressiveSpellModifier(spell)
        ? resolveProgressiveSpellForLevel(
            spell,
            practitionerLevel ?? "Apprentice",
          )
        : null,
    [practitionerLevel, spell],
  );
  const castingCalculation =
    progressiveResolution?.castingCalculation ?? baseCalculation;
  const practitioner = useMemo(
    () =>
      practitionerLevel
        ? calculatePractitioner(castingCalculation, practitionerLevel).calculation
        : null,
    [castingCalculation, practitionerLevel],
  );
  const finalCast = useMemo(() => {
    const effectiveCircumstance = automaticKnownSpell
      ? "have-spell"
      : circumstance;
    if (!effectiveCircumstance || (automaticKnownSpell && !practitioner)) {
      return null;
    }
    return practitioner
      ? calculateCastingCircumstance(practitioner, effectiveCircumstance)
      : calculateCastingCircumstanceWithoutPractitioner(
          castingCalculation.baseSpellManaCost,
          effectiveCircumstance,
          castingCalculation.castingTimeAdjustment,
        );
  }, [automaticKnownSpell, castingCalculation, circumstance, practitioner]);
  const magicType = getMagicType(spell.tradition);

  return (
    <section className="spell-casting-panel">
      <header>
        <div>
          <p>CASTING CONTEXT</p>
          <h3>
            {automaticKnownSpell
              ? "Known Spell Cost"
              : "Practitioner & Raw Casting"}
          </h3>
        </div>
        <span>
          {automaticKnownSpell
            ? "Calculated from this Character."
            : "Construction values remain unchanged."}
        </span>
      </header>
      <div className="spell-casting-panel__base">
        <div><span>Base Mana</span><strong>{castingCalculation.baseSpellManaCost}</strong></div>
        <div><span>Spell Mastery</span><strong>{castingCalculation.baseSpellMastery}</strong></div>
        <div><span>Base Initiative</span><strong>{castingCalculation.baseCombatCastingTime}</strong></div>
        <div><span>Out of Combat</span><strong>{castingCalculation.baseOutOfCombatCastingTimeSeconds}s</strong></div>
      </div>
      {progressiveResolution ? (
        <p className="spell-casting-panel__note">
          Active Progressive tier: <strong>{progressiveResolution.level}</strong>.
          Casting still uses the original base cost.
        </p>
      ) : null}
      {automaticKnownSpell ? (
        <p className={`spell-casting-panel__note${practitionerLevel ? "" : " is-error"}`}>
          {practitionerLevel ? (
            <>
              Using <strong>{castingSystem}</strong> at <strong>{practitionerLevel}</strong> level
              with <strong>{manaPool ?? 0} Mana</strong>. Because this Spell is in the
              Character&apos;s Spellbook, <strong>I Have the Spell</strong> is automatic.
            </>
          ) : (
            <>
              This Character does not currently have a usable caster level for this
              Spell&apos;s magic system, so its casting cost cannot be calculated.
            </>
          )}
        </p>
      ) : (
        <div className="spell-casting-panel__controls">
          <fieldset>
            <legend>Practitioner Level</legend>
            <div className="spell-casting-panel__choices">
              <button
                type="button"
                className={!practitionerLevel ? "is-active" : ""}
                onClick={() => onPractitionerLevelChange?.(undefined)}
              >
                Not Set
              </button>
              {PRACTITIONER_LEVELS.map((level) => (
                <button
                  type="button"
                  key={level}
                  className={practitionerLevel === level ? "is-active" : ""}
                  onClick={() => onPractitionerLevelChange?.(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Raw Casting Circumstance</legend>
            <div className="spell-casting-panel__choices">
              {RAW_CASTING_CIRCUMSTANCES.map((option) => {
                const labels = getRawCastingCircumstanceLabels(option.id, magicType);
                return (
                  <button
                    type="button"
                    key={option.id}
                    className={circumstance === option.id ? "is-active" : ""}
                    title={labels.description}
                    onClick={() => setCircumstance(option.id)}
                  >
                    {labels.shortLabel} +{option.adjustmentPercent}%
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}
      <div className="spell-casting-panel__results">
        <div>
          <span>{automaticKnownSpell ? "Caster Level" : "Practitioner Mana"}</span>
          <strong>
            {automaticKnownSpell
              ? practitionerLevel ?? "N/A"
              : practitioner
                ? practitioner.adjustedManaCost
                : "N/A"}
          </strong>
          <small>
            {automaticKnownSpell
              ? practitionerLevel
                ? `${castingSystem} · ${manaPool ?? 0} Mana available`
                : "No eligible casting profile"
              : practitioner
                ? `${practitioner.combatCastingTime} Initiative · ${practitioner.outOfCombatCastingTimeSeconds}s`
                : "Choose a Practitioner Level"}
          </small>
        </div>
        <div>
          <span>{automaticKnownSpell ? "Known Spell Cost" : "Final Cast Mana"}</span>
          <strong>{finalCast ? finalCast.finalCastingMana : "N/A"}</strong>
          <small>
            {finalCast
              ? `${finalCast.finalCombatCastingTime} Initiative · ${finalCast.finalOutOfCombatCastingTimeSeconds}s`
              : automaticKnownSpell
                ? "Caster level is unavailable"
                : "Choose a Raw Casting circumstance"}
          </small>
        </div>
      </div>
    </section>
  );
}

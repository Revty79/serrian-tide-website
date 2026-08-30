"use client";

import { useMemo, useState } from "react";

import {
  EMPTY_CHARACTER_PRINT_SELECTION,
  buildCharacterPrintData,
  resolveCharacterPrintSelection,
  type CharacterPrintPreset,
  type CharacterPrintSection,
  type CharacterPrintSelection,
} from "@/features/characters/character-print";
import type {
  CharacterAggregate,
  CharacterDraft,
  CharacterRaceAggregate,
} from "@/features/characters/models";

import { PrintableCharacterSheet } from "./printable-character-sheet";
import "./printable-character-sheet.css";

type Props = {
  aggregate: CharacterAggregate;
  draft: CharacterDraft;
  selectedRace: CharacterRaceAggregate | null;
};

const PRESETS: Array<{
  id: CharacterPrintPreset;
  label: string;
  description: string;
}> = [
  {
    id: "quick",
    label: "Tabletop Quick Reference",
    description:
      "Two deliberate pages: an active-play dashboard and the detailed tabletop reverse side.",
  },
  {
    id: "full",
    label: "Full Tabletop Character",
    description:
      "Starts with the Quick Reference, then adds every available mechanical section.",
  },
  {
    id: "complete",
    label: "Complete Character Record",
    description:
      "The full mechanical packet plus profile, Race, story, goals, secrets, and backstory.",
  },
  {
    id: "custom",
    label: "Custom Print",
    description:
      "Choose only the sections you need, such as Skills, Spellbook, Inventory, or Story.",
  },
];

const CUSTOM_OPTIONS: Array<{
  id: CharacterPrintSection;
  label: string;
  availability?:
    | "hasSkills"
    | "hasPowers"
    | "hasSpecialAbilities"
    | "hasDerivedAbilities"
    | "hasInventory"
    | "hasEquipment"
    | "hasStory";
}> = [
  { id: "quick", label: "Quick Reference" },
  { id: "skills", label: "Full Skills", availability: "hasSkills" },
  { id: "powers", label: "Spellbook / Powers", availability: "hasPowers" },
  {
    id: "specialAbilities",
    label: "Special Abilities",
    availability: "hasSpecialAbilities",
  },
  {
    id: "derivedAbilities",
    label: "Derived Abilities",
    availability: "hasDerivedAbilities",
  },
  { id: "inventory", label: "Inventory", availability: "hasInventory" },
  {
    id: "equipment",
    label: "Equipment Detail",
    availability: "hasEquipment",
  },
  {
    id: "story",
    label: "Character Story / Profile",
    availability: "hasStory",
  },
];

export function CharacterPrintCenter({
  aggregate,
  draft,
  selectedRace,
}: Props) {
  const [preset, setPreset] = useState<CharacterPrintPreset>("quick");
  const [custom, setCustom] = useState<CharacterPrintSelection>({
    ...EMPTY_CHARACTER_PRINT_SELECTION,
    quick: true,
  });
  const data = useMemo(
    () => buildCharacterPrintData(aggregate, draft, selectedRace),
    [aggregate, draft, selectedRace],
  );
  const sections = useMemo(
    () =>
      resolveCharacterPrintSelection(preset, custom, data.availability),
    [custom, data.availability, preset],
  );
  const selectedLabels = CUSTOM_OPTIONS.filter(
    ({ id }) => sections[id],
  ).map(({ label }) => label);
  const hasSelection = selectedLabels.length > 0;

  function toggleCustom(section: CharacterPrintSection) {
    setCustom((current) => ({ ...current, [section]: !current[section] }));
  }

  return (
    <>
      <section className="character-print-center" aria-labelledby="print-center-title">
        <header>
          <div>
            <p>PRINT / EXPORT</p>
            <h2 id="print-center-title">Choose a paper Character format</h2>
            <span>
              Your browser print dialog can print physically or save the selected
              packet as PDF.
            </span>
          </div>
          <button
            type="button"
            className="is-primary"
            disabled={!hasSelection}
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </header>

        <div className="character-print-center__presets">
          {PRESETS.map((option) => (
            <button
              type="button"
              className={preset === option.id ? "is-active" : undefined}
              aria-pressed={preset === option.id}
              key={option.id}
              onClick={() => setPreset(option.id)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>

        {preset === "custom" ? (
          <fieldset className="character-print-center__custom">
            <legend>Custom sections</legend>
            {CUSTOM_OPTIONS.filter(
              ({ availability }) =>
                !availability || data.availability[availability],
            ).map((option) => (
              <label key={option.id}>
                <input
                  type="checkbox"
                  checked={custom[option.id]}
                  onChange={() => toggleCustom(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <footer aria-live="polite">
          <span>Selected:</span>
          <strong>{selectedLabels.join(" · ") || "No printable sections"}</strong>
        </footer>
      </section>

      <PrintableCharacterSheet
        aggregate={aggregate}
        draft={draft}
        selectedRace={selectedRace}
        preset={preset}
        sections={sections}
        data={data}
      />
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

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
import { NO_PAPER_REFERENCES, PaperCharacterSheet, type PaperReferences } from "./paper-character-sheet";
import { getPaperCharacterSheet } from "./paper-character-actions";
import type { PaperCharacterData } from "@/features/characters/paper-character";
import "./printable-character-sheet.css";
import "./paper-character-sheet.css";

type Props = {
  aggregate: CharacterAggregate;
  draft: CharacterDraft;
  selectedRace: CharacterRaceAggregate | null;
  dirty?: boolean;
  godMode?: boolean;
};

type PrintChoice = CharacterPrintPreset | "paper";
const PRESETS: Array<{
  id: PrintChoice;
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
  {
    id: "paper",
    label: "Paper Character Sheet",
    description: "A paper-first play sheet from your saved Character and current recorded resources, with readable reference pages when needed.",
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
  dirty = false,
  godMode = false,
}: Props) {
  const [preset, setPreset] = useState<PrintChoice>("quick");
  const [paper, setPaper] = useState<PaperCharacterData | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [paperError, setPaperError] = useState("");
  const [paperReferences, setPaperReferences] = useState<PaperReferences>(NO_PAPER_REFERENCES);
  const printDialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, [aggregate.character.id]);
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
      resolveCharacterPrintSelection(preset === "paper" ? "quick" : preset, custom, data.availability),
    [custom, data.availability, preset],
  );
  const selectedLabels = CUSTOM_OPTIONS.filter(
    ({ id }) => sections[id],
  ).map(({ label }) => label);
  const hasSelection = preset === "paper" ? paper?.characterId === aggregate.character.id : selectedLabels.length > 0;

  async function preparePaper(print = false) {
    const request = ++requestId.current;
    setPaperLoading(true);
    setPaperError("");
    try {
      const snapshot = await getPaperCharacterSheet(aggregate.character.id, godMode);
      if (request !== requestId.current) return;
      flushSync(() => setPaper(snapshot));
      if (print) {
        await document.fonts.ready;
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (request === requestId.current) window.print();
      }
    } catch (error) {
      if (request === requestId.current) { setPaper(null); setPaperError(error instanceof Error ? error.message : "The saved Character could not be loaded for printing."); }
    } finally {
      if (request === requestId.current) setPaperLoading(false);
    }
  }
  function choosePreset(choice: PrintChoice) {
    requestId.current += 1;
    setPreset(choice);
    if (choice === "paper") void preparePaper();
  }
  function printSelection() {
    if (preset !== "paper") { window.print(); return; }
    if (dirty) printDialog.current?.showModal();
    else void preparePaper(true);
  }

  function toggleCustom(section: CharacterPrintSection) {
    setCustom((current) => ({ ...current, [section]: !current[section] }));
  }

  return (
    <>
      <section className="character-print-center" aria-labelledby="print-center-title">
        <header>
          <div>
            <p>PRINT / EXPORT</p>
            <h2 id="print-center-title">Print Character Sheet</h2>
            <span>
              Your browser print dialog can print physically or save the selected
              packet as PDF.
            </span>
          </div>
          <button
            type="button"
            className="is-primary"
            disabled={!hasSelection || paperLoading}
            onClick={printSelection}
          >
            Print / Save as PDF
          </button>
        </header>

        <details className="character-print-center__options"><summary>Print options</summary>
        <div className="character-print-center__presets">
          {PRESETS.map((option) => (
            <button
              type="button"
              className={preset === option.id ? "is-active" : undefined}
              aria-pressed={preset === option.id}
              key={option.id}
              disabled={paperLoading}
              onClick={() => choosePreset(option.id)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>

        {preset === "paper" ? <div className="paper-print-status" aria-live="polite">
          <p><strong>Prints the last saved Character and current recorded resources.</strong> Unsaved editor changes are not included.</p>
          {dirty ? <p>You have unsaved edits. Print the saved record, or return to editing and save your changes first.</p> : null}
          {paperLoading ? <p>Loading saved Character and recorded resources…</p> : paper ? <p>Ready: {paper.name}. Snapshot: {new Date(paper.recordedAt).toLocaleString()}. The Print button refreshes this snapshot.</p> : null}
          {paperError ? <><p role="alert">{paperError}</p><button type="button" className="st-button" onClick={() => void preparePaper()}>Retry loading saved record</button></> : null}
          <p>Core sheet only by default. Add the reference pages you want:</p>
          {([['spells', 'Spell / ability play references'], ['skills', 'Full skill descriptions'], ['items', 'Full item descriptions'], ['story', 'Story / profile']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={paperReferences[key]} onChange={(event) => setPaperReferences((current) => ({...current, [key]: event.target.checked}))} />{label}</label>)}
        </div> : null}

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
          <strong>{preset === "paper" ? `Paper Character Sheet · ${Object.values(paperReferences).some(Boolean) ? "Core + selected references" : "Core only"}` : selectedLabels.join(" · ") || "No printable sections"}</strong>
        </footer>
        </details>
      </section>

      {preset === "paper" ? paper?.characterId === aggregate.character.id ? <PaperCharacterSheet data={paper} references={paperReferences} /> : <div className="paper-character-sheet"><p>Paper Character Sheet is not ready. Return to Print options to load the saved record.</p></div> : <PrintableCharacterSheet
        aggregate={aggregate}
        draft={draft}
        selectedRace={selectedRace}
        preset={preset}
        sections={sections}
        data={data}
      />}
      <dialog ref={printDialog} className="paper-print-dialog" aria-labelledby="paper-print-confirm-title">
        <h2 id="paper-print-confirm-title">Print the last saved record?</h2>
        <p>Your unsaved edits will stay in the editor. This printout uses the saved Character and current recorded HP, mana and equipment. To include edits, return to the sheet and save them first.</p>
        <div><button type="button" className="st-button" onClick={() => printDialog.current?.close()}>Return to editing</button><button type="button" className="st-button is-primary" onClick={() => { printDialog.current?.close(); void preparePaper(true); }}>Print saved record</button></div>
      </dialog>
    </>
  );
}

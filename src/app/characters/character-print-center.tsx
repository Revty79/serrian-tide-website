"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { CharacterAggregate } from "@/features/characters/models";
import type { PaperCharacterData } from "@/features/characters/paper-character";
import { DEFAULT_PRINT_SELECTION, PRINT_BACKS, PRINT_BOOKS, PRINT_REFERENCES, PRINT_SYSTEMS, PRINT_THEMES, printPresetSelection, printSelectionLabels, type UnifiedPrintPreset, type UnifiedPrintSelection, type PrintTheme, type PrintHeadings } from "@/features/characters/character-print-options";
import { GuidedField } from "@/components/field-guidance";
import { PaperCharacterSheet } from "./paper-character-sheet";
import { getPaperCharacterSheet } from "./paper-character-actions";
import "./printable-character-sheet.css";
import "./paper-character-sheet.css";

type Props = { aggregate: CharacterAggregate; dirty?: boolean; godMode?: boolean };
const PRESETS: Array<{id: UnifiedPrintPreset; label: string; description: string}> = [
  {id: "quick", label: "Tabletop Quick Reference", description: "Standard front and General back, with your skills, abilities and owned inventory."},
  {id: "full", label: "Full Tabletop Character", description: "The core sheet, owned supernatural books and full mechanical references."},
  {id: "complete", label: "Complete Character Record", description: "The full mechanical packet plus saved story and profile."},
  {id: "custom", label: "Custom Print", description: "Select the front, any backs, books and references independently."},
  {id: "paper", label: "Paper Character Sheet", description: "Choose a core sheet and add only the backs, books and references you want."},
];

export function CharacterPrintCenter({aggregate, dirty = false, godMode = false}: Props) {
  const [preset, setPreset] = useState<UnifiedPrintPreset>("quick");
  const [paper, setPaper] = useState<PaperCharacterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState<UnifiedPrintSelection>(DEFAULT_PRINT_SELECTION);
  const [theme, setTheme] = useState<PrintTheme>("Universal");
  const [headings, setHeadings] = useState<PrintHeadings>("standard");
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  const selection = printPresetSelection(preset, paper, custom);
  const labels = printSelectionLabels(selection);
  // Cancel a pending snapshot/print if this editor is replaced or unmounted.
  useEffect(() => () => { requestId.current += 1; }, [aggregate.character.id]);

  async function prepare(print = false) {
    const request = ++requestId.current;
    setLoading(true); setError("");
    try {
      const snapshot = await getPaperCharacterSheet(aggregate.character.id, godMode);
      if (request !== requestId.current) return;
      flushSync(() => setPaper(snapshot));
      if (print) {
        await document.fonts.ready;
        await Promise.all(Array.from(document.querySelectorAll<SVGImageElement>(".paper-masthead-art image")).map(element => new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("The selected print artwork could not be loaded. Retry printing or select Plain."));
          image.src = element.href.baseVal;
        })));
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (request === requestId.current) window.print();
      }
    } catch (problem) {
      if (request === requestId.current) { setPaper(null); setError(problem instanceof Error ? problem.message : "The saved Character could not be loaded for printing."); }
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }
  function toggle<K extends "backs" | "books" | "references">(key: K, value: UnifiedPrintSelection[K][number]) {
    setCustom(current => {
      const values: readonly string[] = current[key];
      return {...current, [key]: values.includes(value) ? values.filter(entry => entry !== value) : [...values, value]};
    });
  }
  return <>
    <section className="character-print-center" aria-labelledby="print-center-title">
      <header><div><p>PRINT / EXPORT</p><h2 id="print-center-title">Print Character Sheet</h2><span>Print or save a PDF of the saved Character and current recorded resources.</span></div>
        <button type="button" className="is-primary" disabled={!labels.length || loading} onClick={() => dirty ? dialog.current?.showModal() : void prepare(true)}>Print / Save as PDF</button>
      </header>
      <details className="character-print-center__options" onToggle={event => {if (event.currentTarget.open && !paper && !loading && !error) void prepare();}}>
        <summary>Print options</summary>
        <div className="character-print-center__presets">{PRESETS.map(option => <button type="button" key={option.id} aria-pressed={preset === option.id} className={preset === option.id ? "is-active" : undefined} disabled={loading} onClick={() => setPreset(option.id)}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div>
        <div className="paper-appearance-controls">
          <GuidedField label="Print theme" help="Changes the ornament and paper styling. Character values and rules stay the same. Plain uses minimal ink."><select className="st-control" value={theme} onChange={event => setTheme(event.target.value as PrintTheme)}>{PRINT_THEMES.map(value => <option key={value}>{value}</option>)}</select></GuidedField>
          <GuidedField label="Presentation headings" help="Genre-flavored headings change only the page presentation. Mechanical names and section labels remain unchanged."><select className="st-control" value={headings} onChange={event => setHeadings(event.target.value as PrintHeadings)}><option value="standard">Standard</option><option value="genre">Genre-flavored</option></select></GuidedField>
        </div>
        {(preset === "custom" || preset === "paper") ? <div className="paper-selection-controls">
          <fieldset className="character-print-center__custom"><legend>Character sheet pages</legend><label><input type="checkbox" checked={custom.front} onChange={event => setCustom(current => ({...current, front: event.target.checked}))} />Standard front</label>{PRINT_BACKS.map(back => <label key={back}><input type="checkbox" checked={custom.backs.includes(back)} onChange={() => toggle("backs", back)} />{back} back</label>)}</fieldset>
          <p>Each back includes ordinary skills, Special Abilities, Derived Abilities and owned inventory. Select several backs to carry a complete sheet for each system.</p>
          <fieldset className="character-print-center__custom"><legend>Books</legend>{PRINT_SYSTEMS.map(system => <label key={system}><input type="checkbox" checked={custom.books.includes(system)} onChange={() => toggle("books", system)} />{PRINT_BOOKS[system]} — {system}</label>)}</fieldset>
          <p>Each selected book starts on its own page and includes your owned entries, including recorded skills without a construction document.</p>
          <fieldset className="character-print-center__custom"><legend>Full references</legend>{Object.entries(PRINT_REFERENCES).map(([key, label]) => <label key={key}><input type="checkbox" checked={custom.references.includes(key as keyof typeof PRINT_REFERENCES)} onChange={() => toggle("references", key as keyof typeof PRINT_REFERENCES)} />{label}</label>)}</fieldset>
        </div> : null}
        <div className="paper-print-status" aria-live="polite">
          <p><strong>Prints the last saved Character and current recorded resources.</strong> Unsaved editor changes are not included.</p>
          {dirty ? <p>You have unsaved edits. Print the saved record, or return to editing and save your changes first.</p> : null}
          {loading ? <p>Loading saved Character and recorded resources…</p> : paper ? <p>Ready: {paper.name}. Snapshot: {new Date(paper.recordedAt).toLocaleString()}. The Print button refreshes this snapshot.</p> : null}
          {error ? <><p role="alert">{error}</p><button type="button" className="st-button" onClick={() => void prepare()}>Retry loading saved record</button></> : null}
        </div>
        <footer aria-live="polite"><span>Selected:</span><strong>{labels.join(" · ") || "No printable sections"}</strong></footer>
      </details>
    </section>
    {paper?.characterId === aggregate.character.id ? <PaperCharacterSheet data={paper} selection={selection} theme={theme} headings={headings} /> : <div className="paper-character-sheet"><p>Use Print / Save as PDF to load the saved Character before printing.</p></div>}
    <dialog ref={dialog} className="paper-print-dialog" aria-labelledby="paper-print-confirm-title">
      <h2 id="paper-print-confirm-title">Print the last saved record?</h2><p>Your unsaved edits will stay in the editor. This printout uses the saved Character and current recorded HP, mana and equipment. To include edits, return to the sheet and save them first.</p>
      <div><button type="button" className="st-button" onClick={() => dialog.current?.close()}>Return to editing</button><button type="button" className="st-button is-primary" onClick={() => {dialog.current?.close(); void prepare(true);}}>Print saved record</button></div>
    </dialog>
  </>;
}

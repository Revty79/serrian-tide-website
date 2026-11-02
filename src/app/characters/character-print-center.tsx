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
import { FORM_ACCESS_LABELS } from "@/features/forms/form-access";
import { selectedCharacterFormReferences } from "@/features/characters/character-form-print";
import { DEFAULT_TABLETOP_PDF_SHEETS, TABLETOP_PDF_SHEETS, tabletopPdfFilename, type TabletopPdfSheet } from "@/features/characters/character-tabletop-pdf-options";
import "./character-tabletop-pdf.css";

type Props = { aggregate: CharacterAggregate; dirty?: boolean; godMode?: boolean };
const PRESETS: Array<{id: UnifiedPrintPreset; label: string; description: string}> = [
  {id: "quick", label: "Tabletop Quick Reference", description: "Standard front and General back, with your skills, abilities and owned inventory."},
  {id: "full", label: "Full Tabletop Character", description: "The core sheet, owned supernatural books and full mechanical references."},
  {id: "complete", label: "Complete Character Record", description: "The full mechanical packet plus saved story and profile."},
  {id: "custom", label: "Custom Print", description: "Select the front, any backs, books and references independently."},
  {id: "paper", label: "Paper Character Sheet", description: "Choose a core sheet and add only the backs, books and references you want."},
  {id: "pdf", label: "Tabletop PDF Sheets", description: "Your original sheet layout in a Letter-size PDF. One complete page per sheet."},
];

function reservePdfWindow() {
  const tab = window.open("", "_blank");
  if (tab) { tab.opener = null; tab.document.title = "Preparing Character PDF"; tab.document.body.textContent = "Preparing your Character PDF…"; }
  return tab;
}

export function CharacterPrintCenter({aggregate, dirty = false, godMode = false}: Props) {
  const [preset, setPreset] = useState<UnifiedPrintPreset>("quick");
  const [paper, setPaper] = useState<PaperCharacterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [custom, setCustom] = useState<UnifiedPrintSelection>(DEFAULT_PRINT_SELECTION);
  const [theme, setTheme] = useState<PrintTheme>("Universal");
  const [headings, setHeadings] = useState<PrintHeadings>("standard");
  const [formIds, setFormIds] = useState<number[]>([]);
  const [pdfSheets, setPdfSheets] = useState<TabletopPdfSheet[]>(DEFAULT_TABLETOP_PDF_SHEETS);
  const [pdf, setPdf] = useState<{ url: string; filename: string; characterId: number; raceId: number | null; sheets: string } | null>(null);
  const identity = `${aggregate.character.id}:${aggregate.profile.raceId}`;
  const [recordIdentity, setRecordIdentity] = useState(identity);
  const options = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);
  if (recordIdentity !== identity) {
    setRecordIdentity(identity); setPaper(null); setPdf(null); setFormIds([]); setError(""); setLoading(false);
  }
  const currentPaper = paper?.raceId === aggregate.profile.raceId ? paper : null;
  const forms = currentPaper?.formReferences ?? [];
  const chosenForms = selectedCharacterFormReferences(forms, formIds);
  const selection = {...printPresetSelection(preset, currentPaper, custom), formIds: chosenForms.map(row => row.preview.form.id)};
  const labels = preset === "pdf" ? pdfSheets : [...printSelectionLabels(selection), ...chosenForms.map(row => `Form reference: ${row.preview.form.name}`)];
  const currentPdf = preset === "pdf" && pdf?.characterId === aggregate.character.id && pdf.raceId === aggregate.profile.raceId && pdf.sheets === pdfSheets.join("|") ? pdf : null;
  // Cancel a pending snapshot/print if this editor is replaced or unmounted.
  useEffect(() => () => { requestId.current += 1; }, [aggregate.character.id, aggregate.profile.raceId]);
  useEffect(() => {
    if (!options.current?.open) return;
    let active = true;
    void getPaperCharacterSheet(aggregate.character.id, godMode).then(snapshot => {
      if (active) { setPaper(snapshot); setLoading(false); }
    }).catch(problem => { if (active) { setError(problem instanceof Error ? problem.message : "The current saved Character could not be loaded."); setLoading(false); } });
    return () => { active = false; };
  }, [aggregate.character.id, aggregate.profile.raceId, godMode]);

  async function prepare(print = false, pdfWindow: Window | null = null) {
    const request = ++requestId.current;
    setLoading(true); setError("");
    if (preset === "pdf" && print) setPdf(null);
    try {
      const snapshot = await getPaperCharacterSheet(aggregate.character.id, godMode);
      if (request !== requestId.current) return;
      if (snapshot.raceId !== aggregate.profile.raceId) throw new Error("The saved Race changed. Reload the Character sheet to select its current Form references before printing.");
      flushSync(() => setPaper(snapshot));
      if (preset === "pdf" && print) {
        const [renderer, fonts] = await Promise.all([
          import("@/features/characters/character-tabletop-pdf"),
          Promise.all(["/print/serrian-tide/tabletop/NotoSans-Regular.ttf", "/print/serrian-tide/tabletop/NotoSans-Bold.ttf", "/print/serrian-tide/spreadsheet/Lobster-Regular.ttf"].map(async path => {
            const response = await fetch(path);
            if (!response.ok) throw new Error("The PDF fonts could not be loaded. Retry creating the PDF.");
            return new Uint8Array(await response.arrayBuffer());
          })),
        ]);
        if (request !== requestId.current) return;
        const result = await renderer.createCharacterTabletopPdf(snapshot, pdfSheets, { regular: fonts[0], bold: fonts[1], title: fonts[2] });
        if (request !== requestId.current) return;
        const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: "application/pdf" }));
        setPdf({ url, filename: tabletopPdfFilename(snapshot.name), characterId: snapshot.characterId, raceId: snapshot.raceId, sheets: pdfSheets.join("|") });
        if (pdfWindow && !pdfWindow.closed) pdfWindow.location.replace(url);
        pdfWindow = null;
      } else if (print) {
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
      pdfWindow?.close();
      if (request === requestId.current) setLoading(false);
    }
  }
  function beginPrint(confirmed = false) {
    if (dirty && !confirmed) { dialog.current?.showModal(); return; }
    dialog.current?.close();
    void prepare(true, preset === "pdf" ? reservePdfWindow() : null);
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
        <button type="button" className="is-primary" disabled={!labels.length || loading} onClick={() => beginPrint()}>{preset === "pdf" && loading ? "Preparing PDF…" : "Print / Save as PDF"}</button>
      </header>
      <details ref={options} className="character-print-center__options" onToggle={event => {if (event.currentTarget.open && !currentPaper && !loading && !error) void prepare();}}>
        <summary>Print options</summary>
        <div className="character-print-center__presets">{PRESETS.map(option => <button type="button" key={option.id} aria-pressed={preset === option.id} className={preset === option.id ? "is-active" : undefined} disabled={loading} onClick={() => { setPreset(option.id); setPdf(null); }}><strong>{option.label}</strong><span>{option.description}</span></button>)}</div>
        {preset === "pdf" ? <div className="paper-selection-controls">
          <fieldset className="character-print-center__custom"><legend>PDF pages</legend>{TABLETOP_PDF_SHEETS.map(title => <label key={title}><input type="checkbox" disabled={loading} checked={pdfSheets.includes(title)} onChange={event => { setPdf(null); setPdfSheets(current => event.target.checked ? TABLETOP_PDF_SHEETS.filter(sheet => sheet === title || current.includes(sheet)) : current.filter(sheet => sheet !== title)); }} />{title}</label>)}</fieldset>
          <p>Letter paper (8.5 × 11 inches), with ⅛-inch margins. Print / Save as PDF opens the finished PDF when you’re ready to print.</p>
          <button type="button" className="st-button" disabled={loading} onClick={() => { setPdf(null); setPdfSheets([...TABLETOP_PDF_SHEETS]); }}>Select all eight sheets</button>
        </div> : <div className="paper-appearance-controls">
          <GuidedField label="Print theme" help="Changes the ornament and paper styling. Character values and rules stay the same. Plain uses minimal ink."><select className="st-control" value={theme} onChange={event => setTheme(event.target.value as PrintTheme)}>{PRINT_THEMES.map(value => <option key={value}>{value}</option>)}</select></GuidedField>
          <GuidedField label="Presentation headings" help="Genre-flavored headings change only the page presentation. Mechanical names and section labels remain unchanged."><select className="st-control" value={headings} onChange={event => setHeadings(event.target.value as PrintHeadings)}><option value="standard">Standard</option><option value="genre">Genre-flavored</option></select></GuidedField>
        </div>}
        {(preset === "custom" || preset === "paper") ? <div className="paper-selection-controls">
          <fieldset className="character-print-center__custom"><legend>Character sheet pages</legend><label><input type="checkbox" checked={custom.front} onChange={event => setCustom(current => ({...current, front: event.target.checked}))} />Standard front</label>{PRINT_BACKS.map(back => <label key={back}><input type="checkbox" checked={custom.backs.includes(back)} onChange={() => toggle("backs", back)} />{back} back</label>)}</fieldset>
          <p>Each back includes ordinary skills, Special Abilities, Derived Abilities and owned inventory. Select several backs to carry a complete sheet for each system.</p>
          <fieldset className="character-print-center__custom"><legend>Books</legend>{PRINT_SYSTEMS.map(system => <label key={system}><input type="checkbox" checked={custom.books.includes(system)} onChange={() => toggle("books", system)} />{PRINT_BOOKS[system]} — {system}</label>)}</fieldset>
          <p>Each selected book starts on its own page and includes your owned entries, including recorded skills without a construction document.</p>
          <fieldset className="character-print-center__custom"><legend>Full references</legend>{Object.entries(PRINT_REFERENCES).map(([key, label]) => <label key={key}><input type="checkbox" checked={custom.references.includes(key as keyof typeof PRINT_REFERENCES)} onChange={() => toggle("references", key as keyof typeof PRINT_REFERENCES)} />{label}</label>)}</fieldset>
        </div> : null}
        {forms.length && preset !== "pdf" ? <fieldset className="character-print-center__custom paper-form-selection"><legend>Form references</legend>
          <p>Optional reference pages from the saved current Race. These selections are independent of View Form and apply to any print preset. Printing does not grant access or change your state.</p>
          <label><input type="checkbox" checked={chosenForms.length === forms.length} onChange={event => setFormIds(event.target.checked ? forms.map(row => row.preview.form.id) : [])} />Include all authored Forms (including Locked and Manual Review)</label>
          {forms.map(row => <label key={row.preview.form.id}><input type="checkbox" checked={formIds.includes(row.preview.form.id)} onChange={event => setFormIds(ids => event.target.checked ? [...ids, row.preview.form.id] : ids.filter(id => id !== row.preview.form.id))} /><span>{row.preview.form.name} — {FORM_ACCESS_LABELS[row.access.status]}<small>{row.access.explanation}</small></span></label>)}
        </fieldset> : null}
        <div className="paper-print-status" aria-live="polite">
          <p><strong>Prints the last saved Character and current recorded resources.</strong> Unsaved editor changes are not included.</p>
          {dirty ? <p>You have unsaved edits. Print the saved record, or return to editing and save your changes first.</p> : null}
          {loading ? <p>Preparing saved Character and recorded resources…</p> : paper ? <p>Ready: {paper.name}. Snapshot: {new Date(paper.recordedAt).toLocaleString()}. The Print button refreshes this snapshot.</p> : null}
          {error ? <><p role="alert">{error}</p><button type="button" className="st-button" onClick={() => preset === "pdf" ? beginPrint() : void prepare()}>{preset === "pdf" ? "Retry creating PDF" : "Retry loading saved record"}</button></> : null}
        </div>
        <footer aria-live="polite"><span>Selected:</span><strong>{labels.join(" · ") || "No printable sections"}</strong></footer>
      </details>
    </section>
    {preset === "pdf" ? currentPdf ? <section className="character-pdf-preview" aria-label="Generated Character PDF">
      <div className="character-pdf-actions"><strong>PDF ready · {pdfSheets.length} {pdfSheets.length === 1 ? "page" : "pages"}</strong><a className="st-button is-primary" href={currentPdf.url} target="_blank" rel="noopener">Open PDF to print</a><a className="st-button" href={currentPdf.url} download={currentPdf.filename}>Download PDF</a></div>
    </section> : null : currentPaper?.characterId === aggregate.character.id ? <PaperCharacterSheet data={currentPaper} selection={selection} theme={theme} headings={headings} /> : <div className="paper-character-sheet"><p>Use Print / Save as PDF to load the saved Character before printing.</p></div>}
    <dialog ref={dialog} className="paper-print-dialog" aria-labelledby="paper-print-confirm-title">
      <h2 id="paper-print-confirm-title">Print the last saved record?</h2><p>Your unsaved edits will stay in the editor. This printout uses the saved Character and current recorded HP, mana and equipment. To include edits, return to the sheet and save them first.</p>
      <div><button type="button" className="st-button" onClick={() => dialog.current?.close()}>Return to editing</button><button type="button" className="st-button is-primary" onClick={() => beginPrint(true)}>Print saved record</button></div>
    </dialog>
  </>;
}

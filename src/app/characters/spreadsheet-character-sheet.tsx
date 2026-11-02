"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, type CSSProperties, type Ref } from "react";
import type { PaperCharacterData } from "@/features/characters/paper-character";
import { buildSpreadsheetCharacterPages, spreadsheetCellPosition, spreadsheetCharacterTemplate, type SpreadsheetSheet } from "@/features/characters/spreadsheet-character";
import { CharacterHitLocationSilhouette } from "./character-hit-location-chart";
import "./spreadsheet-character-sheet.css";

export type SpreadsheetPrintHandle = { prepare: () => Promise<void> };
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const PAGE_WIDTH = 561.6; // US Legal with 0.35-inch side margins.
const CONTENT_HEIGHT = 936.4; // Fill its 13.2-inch printable height, reserving 14pt for the identifier.
const informationCell = (title: SpreadsheetSheet) => title === "Sheet front filled" ? "A35" : title === "Skills Back" ? "A40" : title === "Special Abilities Back" ? "A29" : title === "Psyonics Back" || title === "Bardic Resonance Back" ? "A39" : "A38";

/** Use the sheet's own open space for full values and additional records. */
export function fitSpreadsheetCells(root: HTMLElement) {
  delete root.ownerDocument.documentElement.dataset.spreadsheetLayoutError;
  for (const page of root.querySelectorAll<HTMLElement>(".spreadsheet-sheet-page")) {
    const information = page.querySelector<HTMLElement>("[data-sheet-information]")!;
    const entries: string[] = JSON.parse(information.dataset.entries ?? "[]");
    for (const element of page.querySelectorAll<HTMLElement>("[data-spreadsheet-cell]:not([data-sheet-information]):not([data-body-shot-bob])")) {
      const text = element.firstElementChild as HTMLElement;
      const full = element.dataset.fullText ?? "";
      text.textContent = full;
      delete element.dataset.relocated;
      const initial = Number(element.dataset.fontSize);
      const minimum = Math.min(initial, element.dataset.fixedLabel ? 6.5 : 7.5);
      text.style.fontSize = initial + "pt";
      const fits = () => text.scrollWidth <= element.clientWidth - 4 && text.scrollHeight <= element.clientHeight - 1;
      for (let size = initial - .25; !fits() && size >= minimum; size -= .25) text.style.fontSize = size + "pt";
      if (fits() || !full) continue;
      if (element.dataset.fixedLabel) {
        for (let size = minimum; !fits() && size >= 6; size -= .25) text.style.fontSize = size + "pt";
        continue;
      }
      entries.push(element.dataset.fieldLabel === full ? full : element.dataset.fieldLabel + ": " + full);
      element.dataset.relocated = "true";
      text.style.fontSize = minimum + "pt";
      let start = 0, end = full.length;
      while (start < end) {
        const middle = Math.ceil((start + end) / 2);
        text.textContent = full.slice(0, middle).trimEnd() + "…";
        if (fits()) start = middle; else end = middle - 1;
      }
      text.textContent = full.slice(0, start).trimEnd() + "…";
    }
    const block = information.firstElementChild as HTMLElement;
    block.replaceChildren(...entries.filter(Boolean).map(value => { const line = document.createElement("p"); line.textContent = value; return line; }));
    const columns = entries.some(value => value.length > 250) ? 1 : entries.length > 50 ? 4 : entries.length > 30 ? 3 : entries.length > 12 ? 2 : 1;
    block.style.columnCount = String(columns);
    block.style.height = information.clientHeight - 4 + "px";
    block.style.lineHeight = "1.08";
    block.style.letterSpacing = "normal";
    const fits = () => block.scrollWidth <= information.clientWidth - 4 && block.scrollHeight <= information.clientHeight - 4;
    for (let size = 10; size >= 6.5; size -= .25) { block.style.fontSize = size + "pt"; if (fits()) break; }
    if (!fits()) { block.style.lineHeight = "1"; block.style.letterSpacing = "-.1pt"; }
    if (!fits()) {
      root.ownerDocument.documentElement.dataset.spreadsheetLayoutError = JSON.stringify({ sheet: page.dataset.spreadsheetSection, columns, entries: entries.length, height: block.scrollHeight, available: information.clientHeight - 4, width: block.scrollWidth, availableWidth: information.clientWidth - 4, font: getComputedStyle(block.firstElementChild!).fontSize, lineHeight: getComputedStyle(block.firstElementChild!).lineHeight, texts: entries });
      throw new Error("The information on this sheet needs a more compact layout before it can print legibly on one Legal page.");
    }
  }
}

export function SpreadsheetCharacterSheet({ data, sheets, preview = false, ref }: { data: PaperCharacterData; sheets: SpreadsheetSheet[]; preview?: boolean; ref?: Ref<SpreadsheetPrintHandle> }) {
  const pages = useMemo(() => buildSpreadsheetCharacterPages(data, sheets), [data, sheets]);
  const root = useRef<HTMLDivElement>(null);
  const prepare = useCallback(async () => {
    try { await document.fonts.load('36px "Spreadsheet Lobster"'); }
    catch { throw new Error("The spreadsheet title font could not be loaded. Retry printing after the connection recovers."); }
    await document.fonts.ready;
    if (root.current) fitSpreadsheetCells(root.current);
  }, []);
  useImperativeHandle(ref, () => ({ prepare }), [prepare]);
  useEffect(() => { let active = true; void document.fonts.load('36px "Spreadsheet Lobster"').then(() => { if (active && root.current) fitSpreadsheetCells(root.current); }).catch(() => { /* The Print button reports failures and supports retry. */ }); return () => { active = false; }; }, [pages]);
  return <div className={"spreadsheet-preview-window" + (preview ? " is-preview" : "")}>
    <style>{"@page { size: legal portrait; margin: .4in .35in; }"}</style>
    <div ref={root} className="spreadsheet-character-sheet" style={{ ...spreadsheetCharacterTemplate.paper, "--spreadsheet-rule": spreadsheetCharacterTemplate.paper.color } as CSSProperties} aria-label="Spreadsheet Character Sheets" aria-hidden={!preview} data-character-id={data.characterId}>
      {pages.map(page => {
        const layout = spreadsheetCharacterTemplate.sheets.find(sheet => sheet.title === page.title)!;
        const scaleX = PAGE_WIDTH / sum(layout.widths);
        const scaleY = CONTENT_HEIGHT / sum(layout.heights);
        const fontScale = Math.min(1, scaleX * 1.07);
        const freeCell = informationCell(page.title);
        const covered = new Set<string>();
        const merges = new Map(layout.merges.map(merge => {
          const [first, last] = merge.split(":"), [r, c] = spreadsheetCellPosition(first), [er, ec] = spreadsheetCellPosition(last);
          for (const address of Object.keys(layout.cells)) { const [ar, ac] = spreadsheetCellPosition(address); if (ar >= r && ar <= er && ac >= c && ac <= ec && address !== first) covered.add(address); }
          return [first, { er, ec }] as const;
        }));
        const entries = (page.values[freeCell] ?? "").split("\n").filter(Boolean);
        const sections = new Set<string>();
        for (const note of page.notes) { if (!sections.has(note.section)) { entries.push(note.section); sections.add(note.section); } entries.push(note.text); }
        return <section key={page.title} className="spreadsheet-sheet-page" data-spreadsheet-section={page.title} style={{ backgroundColor: spreadsheetCharacterTemplate.paper.backgroundColor }} aria-label={page.title + " — " + data.name}>
          <div className="spreadsheet-canvas" style={{ width: PAGE_WIDTH + "pt", height: CONTENT_HEIGHT + "pt" }}>
            {Object.entries(layout.cells).filter(([address]) => !covered.has(address)).map(([address, cell]) => {
              const [row, col] = spreadsheetCellPosition(address), merge = merges.get(address);
              const { vertical, wrap, fontFamily, fontSize, ...appearance } = spreadsheetCharacterTemplate.styles[String(cell[0]) as keyof typeof spreadsheetCharacterTemplate.styles];
              const value = page.values[address] ?? String(cell[1]);
              const top = sum(layout.heights.slice(0, row)) * scaleY;
              const isInformation = address === freeCell, isBob = page.title === "Sheet front filled" && address === "I35";
              const cellAppearance = Object.fromEntries(Object.entries(appearance).filter(([key]) => !key.startsWith("border")));
              const cellStyle = { ...cellAppearance, fontFamily: fontFamily === "Lobster" ? '"Spreadsheet Lobster", cursive' : "Arial, sans-serif", fontSize: fontSize * fontScale + "pt",
                left: sum(layout.widths.slice(0, col)) * scaleX + "pt", top: top + "pt",
                width: sum(layout.widths.slice(col, (merge?.ec ?? col) + 1)) * scaleX + "pt",
                height: (isInformation && page.title !== "Sheet front filled" ? CONTENT_HEIGHT - top : sum(layout.heights.slice(row, (merge?.er ?? row) + 1)) * scaleY) + "pt",
                alignItems: isInformation || isBob || vertical === "top" ? "flex-start" : vertical === "center" ? "center" : "flex-end", whiteSpace: wrap ? "pre-wrap" : "pre",
                ...(isBob ? { "--spreadsheet-paper": spreadsheetCharacterTemplate.styles["94"].backgroundColor } : {}), } as CSSProperties;
              const label = address === "A10" ? "Defining marks" : page.values["A" + (row + 1)] || page.values["E" + (row + 1)] || "Additional information";
              return <div key={address} className={"spreadsheet-cell" + (isInformation ? " spreadsheet-information" : "") + (isBob ? " spreadsheet-bob" : "")} style={cellStyle} data-spreadsheet-cell={address} data-full-text={value} data-font-size={fontSize * fontScale} data-fixed-label={page.values[address] === undefined && value ? "true" : undefined} data-sheet-information={isInformation ? "true" : undefined} data-body-shot-bob={isBob ? "true" : undefined} data-entries={isInformation ? JSON.stringify(entries) : undefined} data-field-label={label}>
                {isBob ? <><figure><CharacterHitLocationSilhouette title="Body Shot Bob — hit locations" /><figcaption>{data.health.anatomy.kind === "humanoid" ? "Body Shot Bob" : "Body Shot Bob · humanoid reference"}</figcaption></figure><div className="spreadsheet-hit-key">{data.health.anatomy.hitLocations.map(hit => <p key={hit.result}>{hit.result} — {hit.name}</p>)}</div></> : isInformation ? <div className="spreadsheet-information-text" /> : <span>{value}</span>}
              </div>;
            })}
          </div>
          <footer>{data.name} · {page.title} · Saved {data.recordedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC")}</footer>
        </section>;
      })}
    </div>
  </div>;
}

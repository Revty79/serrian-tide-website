import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { PAPER_SHEET_STYLES, paperSheetMastheadPath } from "./character-paper-theme";
import { PRINT_THEMES } from "./character-print-options";
import { createCharacterTabletopPdf } from "./character-tabletop-pdf";
import { tabletopPdfFixture, tabletopWeaponPdfFixture } from "./character-tabletop-pdf.fixture";
import { TABLETOP_PDF_SHEETS } from "./character-tabletop-pdf-options";

const fonts = { regular: readFileSync("public/print/serrian-tide/tabletop/NotoSans-Regular.ttf"), bold: readFileSync("public/print/serrian-tide/tabletop/NotoSans-Bold.ttf"), title: readFileSync("public/print/serrian-tide/spreadsheet/Lobster-Regular.ttf"), serif: readFileSync("public/print/serrian-tide/tabletop/NotoSerif-Bold.ttf") };

test("every selectable Paper style preserves the approved tabletop data and section geometry", async () => {
  const data = tabletopWeaponPdfFixture(), before = structuredClone(data);
  const baseline = await createCharacterTabletopPdf(data, TABLETOP_PDF_SHEETS, fonts);
  for (const theme of PRINT_THEMES) {
    const artwork = paperSheetMastheadPath(theme);
    const result = await createCharacterTabletopPdf(data, TABLETOP_PDF_SHEETS, fonts, { theme, headings: "genre", masthead: artwork ? readFileSync("public" + artwork) : undefined });
    const pdf = await PDFDocument.load(result.bytes);
    assert.equal(pdf.getPageCount(), 8, theme);
    for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
    assert.deepEqual(result.regions, baseline.regions, theme);
    assert.deepEqual(result.placements.filter(entry => entry.block !== "Title"), baseline.placements.filter(entry => entry.block !== "Title"), `Style ${theme} cannot alter mechanical values, tracking fields or their positions`);
    assert.ok(result.bytes.length > 0);
  }
  assert.deepEqual(data, before);
});

test("Plain needs no image; other Paper styles report missing artwork instead of silently changing style", async () => {
  assert.equal(paperSheetMastheadPath("Plain"), null);
  assert.equal(PAPER_SHEET_STYLES.Plain.faint, "#ffffff");
  await assert.rejects(createCharacterTabletopPdf(tabletopPdfFixture(), ["Character Front"], fonts, { theme: "Fantasy" }), /artwork/);
  const plain = await createCharacterTabletopPdf(tabletopPdfFixture(), ["Character Front"], fonts, { theme: "Plain" });
  assert.equal((await PDFDocument.load(plain.bytes)).getPageCount(), 1);
});

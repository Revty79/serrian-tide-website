import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildTabletopPdfPages, createCharacterTabletopPdf } from "./character-tabletop-pdf";
import { TABLETOP_PDF_SHEETS, tabletopPdfFilename } from "./character-tabletop-pdf-options";
import { tabletopPdfFixture } from "./character-tabletop-pdf.fixture";
import { DEFAULT_PRINT_SELECTION, printPresetSelection } from "./character-print-options";

const fonts = {
  regular: readFileSync("public/print/serrian-tide/tabletop/NotoSans-Regular.ttf"),
  bold: readFileSync("public/print/serrian-tide/tabletop/NotoSans-Bold.ttf"),
  title: readFileSync("public/print/serrian-tide/spreadsheet/Lobster-Regular.ttf"),
};

test("the PDF option preserves other printing, selection order, zero balances and the saved input", () => {
  const data = tabletopPdfFixture(), before = structuredClone(data);
  const pages = buildTabletopPdfPages(data, ["Faith Back", "Character Front", "Faith Back"]);
  assert.deepEqual(pages.map(page => page.title), ["Character Front", "Faith Back"]);
  assert.equal(pages[0].fields[4][0].value, "0");
  assert.deepEqual(printPresetSelection("quick", data, DEFAULT_PRINT_SELECTION), DEFAULT_PRINT_SELECTION);
  assert.deepEqual(printPresetSelection("pdf", data, DEFAULT_PRINT_SELECTION), { front: false, backs: [], books: [], references: [] });
  assert.deepEqual(data, before);
});

test("tabletop data stays brief and places Derived Abilities in front status; ammunition diagnostics are omitted", () => {
  const data = tabletopPdfFixture();
  const [front, back] = buildTabletopPdfPages(data, ["Character Front", "Skills Back"]);
  assert.equal(front.quick[1], "Blink Step 68%");
  assert.equal(front.tables[3].rows[0][3], "60");
  assert.match(front.status.join("\n"), /Derived Abilities: Eidetic Memory/);
  assert.doesNotMatch(front.status.join("\n"), /Initiative|Scholarly Human/);
  assert.doesNotMatch(JSON.stringify(back), /Eidetic Memory|not initialized/i);
  assert.match(JSON.stringify(back), /2\/5 charges/);
  assert.match(JSON.stringify(back), /4\/5 charges/);
  assert.equal(back.tables.find(table => table.title === "Special Abilities")!.rows[0][1], "—");
  const supernatural = back.tables.find(table => table.title === "Supernatural Skills")!;
  assert.ok(supernatural.rows.some(row => row[0] === "Spellcraft - Fire"));
  assert.ok(supernatural.rows.some(row => row[0] === "Faith - Fire"));
});

test("actual PDFs have exactly one complete Legal page per selection, embedded fonts and in-bounds text, even with 65 skills", async () => {
  const data = tabletopPdfFixture(true), before = structuredClone(data);
  const result = await createCharacterTabletopPdf(data, TABLETOP_PDF_SHEETS, fonts);
  const document = await PDFDocument.load(result.bytes);
  assert.equal(document.getPageCount(), 8);
  for (const page of document.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 1008 });
  assert.ok(result.placements.every(entry => entry.fontSize >= 7.5 && entry.top + entry.height < 996));
  assert.ok(result.placements.some(entry => entry.text.includes("Blink Step") && entry.page === 1));
  assert.ok(result.placements.some(entry => entry.text.includes("Eidetic Memory") && entry.page === 1));
  for (let i = 1; i <= 65; i++) assert.ok(result.placements.some(entry => entry.page === 2 && entry.text === `Route ${String(i).padStart(2, "0")}`));
  assert.deepEqual(data, before);
  const single = await createCharacterTabletopPdf(data, ["Psyonics Back"], fonts);
  assert.equal((await PDFDocument.load(single.bytes)).getPageCount(), 1);
});

test("custom anatomy retains actual pools and hit locations rather than replacing them with humanoid values", () => {
  const data = tabletopPdfFixture();
  data.health.tracks = [{ name: "Tail", maximumHp: 20, remainingHp: 15 }] as typeof data.health.tracks;
  const front = buildTabletopPdfPages(data, ["Character Front"])[0];
  assert.deepEqual(front.tables[1].rows[1], ["Tail", "20", "15"]);
});

test("a record beyond one-page capacity fails visibly instead of creating cropped or continuation pages", async () => {
  const data = tabletopPdfFixture(true);
  data.skills = Array.from({ length: 400 }, (_, i) => ({ ...data.skills[0], id: i, name: `Route ${i}` }));
  await assert.rejects(createCharacterTabletopPdf(data, ["Skills Back"], fonts), /too many entries/);
  await assert.rejects(createCharacterTabletopPdf(data, [], fonts), /Select at least one/);
  assert.equal(tabletopPdfFilename('A/B: "Vale"'), "AB Vale - Tabletop Sheets.pdf");
});

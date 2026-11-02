import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildTabletopPdfPages, createCharacterTabletopPdf } from "./character-tabletop-pdf";
import { TABLETOP_PDF_SHEETS, tabletopPdfFilename } from "./character-tabletop-pdf-options";
import { tabletopPdfFixture, tabletopWeaponPdfFixture } from "./character-tabletop-pdf.fixture";
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
  assert.equal(front.tables[3].rows[0][6], "+2");
  assert.equal(front.tables[3].rows[0][2], "S/M/L 25/50/100 feet");
  assert.deepEqual(front.resources, [{ label: "Credits", value: "500" }]);
  assert.equal(front.fields.flat().find(field => field.label === "Fate")!.value, "4");
  assert.equal(front.fields.flat().find(field => field.label === "Quintessence")!.value, "0");
  assert.equal(front.tables[1].columns[2], "Damage");
  assert.ok(front.tables[1].rows.every(row => row[2] === ""));
  assert.equal(front.tables[2].columns[2], "Spent");
  assert.ok(front.tables[2].rows.every(row => row[2] === ""));
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

test("actual PDFs fill Letter with nine-point margins and the original five separate summary blocks, even with 65 skills", async () => {
  const data = tabletopPdfFixture(true), before = structuredClone(data);
  const result = await createCharacterTabletopPdf(data, TABLETOP_PDF_SHEETS, fonts);
  const document = await PDFDocument.load(result.bytes);
  assert.equal(document.getPageCount(), 8);
  for (const page of document.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  assert.ok(result.placements.every(entry => entry.fontSize >= 7 && entry.top + entry.height <= 783));
  const summary = result.regions.filter(region => region.page === 1 && ["Attributes", "Hit Points", "Mana", "Initiative", "Resources"].includes(region.title));
  assert.deepEqual(summary.map(region => region.title), ["Attributes", "Hit Points", "Mana", "Initiative", "Resources"]);
  assert.equal(summary[0].x, 9);
  assert.equal(summary[4].x + summary[4].width, 603);
  assert.ok(summary.every(region => region.top === summary[0].top && region.height === summary[0].height));
  assert.ok(result.placements.filter(entry => entry.page === 1 && entry.block === "Resources").every(entry => !/Initiative|Land|Quintessence|Fate/.test(entry.text)));
  assert.ok(result.placements.filter(entry => entry.block === "Weapons").map(entry => entry.text).join(" ").includes("S/M/L 25/50/100 feet"));
  assert.ok(result.placements.some(entry => entry.block === "Initiative" && entry.text === "16"));
  assert.ok(result.placements.some(entry => entry.block === "Weapons" && entry.text === "+2"));
  assert.ok(result.placements.filter(entry => entry.block === "Weapons").every(entry => !/DEX|STR/.test(entry.text)));
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
  assert.deepEqual(front.tables[1].rows[1], ["Tail", "20", ""]);
});

test("hybrid weapon modifiers retain both signed amounts without repeating attribute names", () => {
  const data = tabletopPdfFixture();
  data.tabletop.weapons[0].damageSummary!.modifier = "STR -3 / DEX +2";
  assert.equal(buildTabletopPdfPages(data, ["Character Front"])[0].tables[3].rows[0][6], "-3 / +2");
  assert.equal(data.tabletop.weapons[0].damageSummary!.modifier, "STR -3 / DEX +2");
});

test("real weapons precede improvised tools and Type preserves the complete authored damage types", () => {
  const data = tabletopWeaponPdfFixture(), before = structuredClone(data);
  const front = buildTabletopPdfPages(data, ["Character Front"])[0];
  assert.deepEqual(front.tables[3].rows.map(row => row[0]), [".357 Revolver - Copy #1 (Single)", "Bowie Knife", "Longsword", "Spear", "Hand Axe"]);
  assert.deepEqual(front.tables[3].rows.map(row => row[1]), ["Piercing", "Slashing / Piercing", "Blunt / Slashing / Piercing", "Piercing", "Slashing"]);
  assert.ok(front.status.some(row => row.startsWith("Binoculars: Blunt;")));
  assert.ok(front.status.some(row => row.startsWith("Blank Journal: Blunt;")));
  assert.ok(front.status.some(row => row.startsWith("Canteen: Blunt;")));
  data.tabletop.weapons[2].damageType = "";
  assert.equal(buildTabletopPdfPages(data, ["Character Front"])[0].tables[3].rows[0][1], "—");
  data.tabletop.weapons[2].damageType = before.tabletop.weapons[2].damageType;
  assert.deepEqual(data, before);
});

test("all five weapon rows including multiple damage types remain in the actual one-page front", async () => {
  const data = tabletopWeaponPdfFixture();
  const result = await createCharacterTabletopPdf(data, ["Character Front"], fonts);
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 1);
  const weapons = result.placements.filter(row => row.block === "Weapons");
  for (const name of [".357 Revolver - Copy #1 (Single)", "Bowie Knife", "Longsword", "Spear", "Hand Axe"]) assert.ok(weapons.some(row => row.text === name), name);
  assert.ok(weapons.every(row => !/Improvised|Tool|Revolver$|Knife \/ Blade/.test(row.text)));
  assert.ok(result.placements.some(row => row.block === "Hit Locations" && row.text === "Body Shot Bob"));
  assert.ok(result.placements.some(row => row.block === "Most Common Used Skills & Rolls" && row.text === "Blink Step 68%"));
});

test("an unusually long weapon cell uses status space without displacing any of the five rows", async () => {
  const data = tabletopWeaponPdfFixture();
  const fullType = "Blunt / Slashing / Piercing / Fire / Cold / Lightning / Acid / Sonic";
  data.tabletop.weapons[4].damageType = fullType;
  const result = await createCharacterTabletopPdf(data, ["Character Front"], fonts);
  const status = result.placements.filter(row => row.block === "Status Effects & Special Effects").map(row => row.text).join(" ");
  assert.ok(status.includes(fullType));
  for (const name of ["Bowie Knife", "Longsword", "Spear", "Hand Axe"]) assert.ok(result.placements.some(row => row.block === "Weapons" && row.text === name));
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 1);
});

test("a record beyond one-page capacity fails visibly instead of creating cropped or continuation pages", async () => {
  const data = tabletopPdfFixture(true);
  data.skills = Array.from({ length: 400 }, (_, i) => ({ ...data.skills[0], id: i, name: `Route ${i}` }));
  await assert.rejects(createCharacterTabletopPdf(data, ["Skills Back"], fonts), /too many entries/);
  await assert.rejects(createCharacterTabletopPdf(data, [], fonts), /Select at least one/);
  assert.equal(tabletopPdfFilename('A/B: "Vale"'), "AB Vale - Tabletop Sheets.pdf");
});

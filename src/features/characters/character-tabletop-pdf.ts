import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { paperNumber, type PaperCharacterData } from "./paper-character";
import { BODY_SHOT_BOB_PATHS, BODY_SHOT_BOB_TARGETS } from "./body-shot-bob";
import { TABLETOP_PDF_SHEETS, type TabletopPdfSheet } from "./character-tabletop-pdf-options";
import type { CharacterMagicSystem } from "./character-rules";

const WIDTH = 612, HEIGHT = 1008, MARGIN = 24, INNER = WIDTH - MARGIN * 2, BOTTOM = 968;
const INK = rgb(0, 0, 0), PAPER = rgb(1, .96, .82), BLUE = rgb(.81, .89, .95), WHITE = rgb(1, 1, 1);
const number = (value: number | null | undefined) => value == null ? "—" : paperNumber(value);
const leaf = (name: string) => name.split(" → ").at(-1)!.trim();
const short = (text: string, limit = 160) => text.length <= limit ? text : text.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
type Table = { title: string; columns: string[]; widths: number[]; rows: string[][]; split?: boolean };
type Field = { label: string; value: string };
export type TabletopPdfPage = { title: TabletopPdfSheet; tables: Table[]; fields: Field[][]; status: string[]; quick: string[] };
export type TabletopPdfFonts = { regular: Uint8Array; bold: Uint8Array; title: Uint8Array };
export type PdfTextPlacement = { page: number; text: string; x: number; top: number; width: number; height: number; fontSize: number };

/** A concise saved-record view. No spreadsheet cells, formulas or browser print layout. */
export function buildTabletopPdfPages(data: PaperCharacterData, requested: readonly TabletopPdfSheet[]): TabletopPdfPage[] {
  const skills = (title: string, rows: PaperCharacterData["skills"]): Table => ({
    title, columns: ["Skill", "%"], widths: [.76, .24], split: true,
    rows: rows.map(skill => [leaf(skill.name), skill.hasRoll ? number(skill.target) + "%" : "—"]),
  });
  const ordinary = data.skills.filter(skill => !skill.special && !skill.systems.length);
  const special = data.skills.filter(skill => skill.special);
  const systems: Partial<Record<TabletopPdfSheet, CharacterMagicSystem>> = {
    "Spellcraft Back": "Spellcraft", "Talisman Back": "Talismanism", "Faith Back": "Faith",
    "Psyonics Back": "Psyonics", "Bardic Resonance Back": "Bardic Resonance",
  };
  return TABLETOP_PDF_SHEETS.filter(title => requested.includes(title)).map(title => {
    const page: TabletopPdfPage = { title, tables: [], fields: [], status: [], quick: [] };
    if (title === "Character Front") {
      const p = data.tabletop.profile;
      const total = (name: string) => number(data.totals.find(row => row.name === name)?.value);
      page.fields = [
        [{ label: "Player", value: data.player }, { label: "Character", value: data.name }],
        [{ label: "Campaign", value: data.campaign }, { label: "Race", value: data.race }, { label: "Age", value: number(p.age) }, { label: "Sex", value: p.sex }],
        [{ label: "Height", value: p.heightFeet == null ? "—" : `${p.heightFeet} ft ${p.heightInches ?? 0} in` }, { label: "Weight", value: number(p.weight) }, { label: "Skin", value: p.skinColor }, { label: "Hair", value: p.hairColor }, { label: "Eyes", value: p.eyeColor }],
        [{ label: "Deity", value: p.deity }, { label: "Base Magic", value: number(data.tabletop.baseMagic) }, { label: "Base Movement", value: number(data.movement[0]?.base) }, { label: "Fate", value: total("Fate") }],
        [{ label: "Fame", value: total("Fame") }, { label: "XP", value: total("XP") }, { label: "Total XP", value: total("Total XP") }, { label: "Quintessence", value: total("Quintessence") }, { label: "Total Quint.", value: total("Total Quintessence") }],
        [{ label: "Defining marks & quirks", value: short(p.definingMarks) }],
      ];
      page.tables = [
        { title: "Attributes", columns: ["Attribute", "#", "Mod", "%"], widths: [.43, .19, .19, .19], rows: data.attributes.map(row => [({ STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHR: "Charisma" })[row.key], number(row.score), number(row.modifier), number(row.target)]) },
        { title: "Hit Points", columns: ["Pool", "Max", "Left"], widths: [.54, .23, .23], rows: [["Total HP", number(data.health.total.maximumHp), number(data.health.total.remainingHp)], ...data.health.tracks.map(row => [row.name, number(row.maximumHp), number(row.remainingHp)])] },
        { title: "Mana", columns: ["System", "Max", "Left"], widths: [.55, .225, .225], rows: data.mana.filter(row => row.maximumMana > 0 || row.currentMana > 0).map(row => [row.system === "Talismanism" ? "Talisman" : row.system === "Bardic Resonance" ? "Bardic" : row.system, number(row.maximumMana), number(row.currentMana)]) },
        { title: "Weapons", columns: ["Weapon", "Type", "Range", "Dur.", "%", "Dmg", "Mod", "Total"], widths: [.30, .12, .15, .075, .075, .07, .13, .08], rows: data.tabletop.weapons.slice(0, 6).map(item => [item.name + (item.quantity === 1 ? "" : ` ×${number(item.quantity)}`) + (item.weapon?.mode ? ` (${item.weapon.mode})` : ""), item.type, item.weapon?.range === "Range/reach not recorded" ? "—" : item.weapon?.range || "—", number(item.durability), item.weapon?.target == null ? "—" : number(item.weapon.target) + "%", item.baseDamage, item.damageSummary?.modifier ?? "—", item.damageSummary?.totalDamage ?? "—"]) },
        { title: "Armor", columns: ["Armor", "Area Covered", "Special Properties", "Dur.", "Soak"], widths: [.30, .29, .25, .08, .08], rows: data.tabletop.armor.slice(0, 6).map(item => [item.name + (item.quantity === 1 ? "" : ` ×${number(item.quantity)}`), item.coverage.length > 65 ? "See status" : item.coverage, item.properties, number(item.durability), number(item.soak)]) },
      ];
      page.status = [...(data.tabletop.effects ?? data.effects), ...(data.tabletop.protectionNotes ?? []),
        ...(data.abilities.length ? ["Derived Abilities: " + data.abilities.map(ability => ability.name).join(", ")] : []),
        ...data.tabletop.armor.slice(0, 6).filter(item => item.coverage.length > 65).map(item => `${item.name}: ${item.coverage}`),
        ...data.tabletop.weapons.slice(6).map(item => `${item.name}: ${item.type}; durability ${number(item.durability)}; ${item.weapon?.target == null ? "" : number(item.weapon.target) + "%; "}damage ${item.damageSummary?.totalDamage ?? item.baseDamage}`),
        ...data.tabletop.armor.slice(6).map(item => `${item.name}: ${item.coverage}; ${item.properties}; durability ${number(item.durability)}; soak ${number(item.soak)}`),
      ].filter(Boolean);
      page.quick = data.quickRolls.map(skill => `${leaf(skill.name)} ${number(skill.target)}%`);
      return page;
    }
    page.tables.push(skills("Ordinary Skills", ordinary));
    const system = systems[title];
    if (title !== "Special Abilities Back") {
      const rows = data.skills.filter(skill => !skill.special && (system ? skill.systems.includes(system) : skill.systems.length));
      const table = skills(system ?? "Supernatural Skills", rows);
      if (!system) table.rows.forEach((row, index) => { const label = rows[index].systems.join(" / "); if (row[0] !== label) row[0] = `${label} - ${row[0]}`; });
      if (rows.length || system) page.tables.push(table);
    }
    const specialRows = special.map(skill => [leaf(skill.name), skill.hasRoll ? number(skill.target) + "%" : "—"]);
    const grantIds = new Set(special.map(skill => skill.skillId));
    for (const ability of data.specialAbilityMechanics?.abilities ?? []) if (!grantIds.has(ability.mechanics.source.id)) specialRows.push([ability.mechanics.source.name, "—"]);
    page.tables.push({ ...skills("Special Abilities", []), rows: specialRows });
    const powers = data.spells.filter(spell => (system ? spell.system === system : title === "Skills Back") && !data.skills.some(skill => spell.key === `catalog:${skill.id}`));
    if (powers.length) page.tables.push({ title: "Personal Powers", columns: ["Power", "Mana", "%"], widths: [.70, .15, .15], split: true, rows: powers.map(spell => [spell.name, number(spell.manaCost), spell.target == null ? "—" : number(spell.target) + "%"]) });
    page.tables.push({ title: "Inventory", columns: ["Item", "Qty", "Charges / Ammunition"], widths: [.54, .10, .36], split: true, rows: data.inventory.map(item => [item.name, number(item.quantity), item.status.split(/;\s*/).filter(part => !/^ammunition state not initialized\b/i.test(part.trim())).join("; ")]) });
    return page;
  });
}

type Box = { x: number; top: number; width: number; height: number };
type Fonts = { regular: PDFFont; bold: PDFFont; title: PDFFont };
type Wrapped = { lines: string[]; size: number; lineHeight: number };
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/\t/g, " ");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of clean(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const letter of word) {
        if (line && font.widthOfTextAtSize(line + letter, size) > width) { lines.push(line); line = ""; }
        line += letter;
      }
    }
    lines.push(line);
  }
  return lines;
}

function fitted(text: string, font: PDFFont, box: Box, preferred = 10, minimum = 8): Wrapped {
  for (let size = preferred; size >= minimum; size -= .25) {
    const lines = wrap(text, font, size, box.width - 8), lineHeight = size * 1.2;
    if (lines.length * lineHeight <= box.height - 4) return { lines, size, lineHeight };
  }
  throw new Error(`The PDF needs more room for “${short(text, 70)}”. Choose the detailed Character print option for this record.`);
}

class Painter {
  constructor(readonly page: PDFPage, readonly fonts: Fonts, readonly index: number, readonly placements: PdfTextPlacement[]) {}
  rect(box: Box, fill = WHITE, stroke = true) { this.page.drawRectangle({ x: box.x, y: HEIGHT - box.top - box.height, width: box.width, height: box.height, color: fill, borderColor: INK, borderWidth: stroke ? .65 : 0 }); }
  line(x: number, top: number, toX: number, toTop: number, thickness = .6) { this.page.drawLine({ start: { x, y: HEIGHT - top }, end: { x: toX, y: HEIGHT - toTop }, color: INK, thickness }); }
  text(text: string, box: Box, preferred = 10, bold = false, align: "left" | "center" = "left", minimum = 8, title = false) {
    if (!text.trim()) return;
    const font = title ? this.fonts.title : bold ? this.fonts.bold : this.fonts.regular;
    const fit = fitted(text, font, box, preferred, minimum);
    fit.lines.forEach((line, i) => {
      if (!line) return;
      const width = font.widthOfTextAtSize(line, fit.size), top = box.top + 3 + i * fit.lineHeight;
      const x = align === "center" ? box.x + (box.width - width) / 2 : box.x + 4;
      const glyphHeight = font.heightAtSize(fit.size, { descender: false });
      this.page.drawText(line, { x, y: HEIGHT - top - glyphHeight, size: fit.size, font, color: title ? rgb(.75, .05, .02) : INK });
      this.placements.push({ page: this.index, text: line, x, top, width, height: fit.lineHeight, fontSize: fit.size });
    });
  }
  heading(title: string, box: Box) { this.rect(box, BLUE); this.text(title, box, 10, true); }
  panel(title: string, box: Box, values: string[], preferred = 10) {
    this.rect(box, PAPER); this.heading(title, { ...box, height: 22 });
    const content = { ...box, top: box.top + 24, height: box.height - 24 };
    if (values.length) this.text(values.join("\n"), content, preferred);
    else for (let top = content.top + 22; top < box.top + box.height - 8; top += 22) this.line(box.x + 5, top, box.x + box.width - 5, top, .25);
  }
}

type TableLayout = { heights: number[]; height: number; groups: string[][][]; fontSize: number; columns: number };
function tableLayout(table: Table, width: number, font: PDFFont, fontSize: number, minimumRows = 1): TableLayout {
  const split = !!table.split;
  const columns = split ? table.title === "Ordinary Skills" && table.rows.length > 48 ? 3 : 2 : 1;
  const count = Math.max(minimumRows, Math.ceil(table.rows.length / columns));
  const groups = Array.from({ length: columns }, (_, index) => table.rows.slice(index * count, (index + 1) * count));
  const tableWidth = (width - (columns - 1) * 8) / columns;
  const heights = Array.from({ length: count }, (_, i) => Math.max(split ? fontSize * 1.2 + 5 : 18, ...groups.map(rows => Math.max(1, ...table.columns.map((_, col) => wrap(rows[i]?.[col] ?? "", font, fontSize, tableWidth * table.widths[col] - 8).length)) * fontSize * 1.2 + (split ? 5 : 7))));
  return { heights, height: 42 + heights.reduce((a, b) => a + b, 0), groups, fontSize, columns };
}

function drawTable(p: Painter, table: Table, box: Box, layout: TableLayout) {
  p.heading(table.title, { ...box, height: 22 });
  const width = (box.width - (layout.columns - 1) * 8) / layout.columns;
  layout.groups.forEach((rows, group) => {
    const x = box.x + group * (width + 8);
    let colX = x;
    table.columns.forEach((column, col) => {
      const cell = { x: colX, top: box.top + 22, width: width * table.widths[col], height: 20 };
      p.rect(cell, PAPER); p.text(column, cell, 8, true, col ? "center" : "left"); colX += cell.width;
    });
    let top = box.top + 42;
    layout.heights.forEach((height, row) => {
      let colX = x;
      table.columns.forEach((_, col) => {
        const cell = { x: colX, top, width: width * table.widths[col], height };
        p.rect(cell, PAPER); p.text(rows[row]?.[col] ?? "", cell, layout.fontSize, false, col && table.columns[col] !== "Charges / Ammunition" && table.columns[col] !== "Area Covered" && table.columns[col] !== "Special Properties" && table.columns[col] !== "Type" && table.columns[col] !== "Range" ? "center" : "left"); colX += cell.width;
      });
      top += height;
    });
  });
}

function drawBob(p: Painter, data: PaperCharacterData, box: Box) {
  p.rect(box, PAPER); p.heading("Hit Locations", { ...box, height: 22 });
  const scale = Math.min((box.width * .53) / 420, (box.height - 45) / 610);
  const x = box.x + 4, top = box.top + 28;
  const circle = (cx: number, cy: number, radius: number, fill?: ReturnType<typeof rgb>) => p.page.drawCircle({ x: x + cx * scale, y: HEIGHT - top - cy * scale, size: radius * scale, color: fill, borderColor: INK, borderWidth: .75 });
  circle(210, 62, 46);
  for (const path of BODY_SHOT_BOB_PATHS) p.page.drawSvgPath(path, { x, y: HEIGHT - top, scale, borderColor: INK, borderWidth: 5 });
  for (const [result, target] of Object.entries(BODY_SHOT_BOB_TARGETS)) {
    circle(target.x, target.y, 25, PAPER);
    const size = 36 * scale, textWidth = p.fonts.regular.widthOfTextAtSize(result, size);
    p.page.drawText(result, { x: x + target.x * scale - textWidth / 2, y: HEIGHT - top - (target.y + 12) * scale, size, font: p.fonts.regular, color: INK });
  }
  const keyBox = { x: box.x + box.width * .55, top: top - 2, width: box.width * .45 - 4, height: box.height - 30 };
  p.text(data.health.anatomy.hitLocations.map(hit => `${hit.result} - ${hit.name}`).join("\n"), keyBox, 8.5);
  p.text(data.health.anatomy.kind === "humanoid" ? "Body Shot Bob" : "Body Shot Bob\nHumanoid reference", { x, top: box.top + box.height - (data.health.anatomy.kind === "humanoid" ? 17 : 27), width: box.width * .54, height: 28 }, 8, false, "center");
}

function drawFront(p: Painter, model: TabletopPdfPage, data: PaperCharacterData) {
  let top = 60;
  model.fields.forEach((fields, row) => {
    const height = row === 5 ? 40 : row === 0 ? 27 : 25;
    let x = MARGIN;
    const weights = row === 1 ? [.33, .37, .12, .18] : fields.map(() => 1 / fields.length);
    fields.forEach((field, col) => {
      const box = { x, top, width: INNER * weights[col], height };
      p.rect(box, PAPER); p.text(field.label, { ...box, height: 14 }, 7.5, true, "left", 7.5);
      p.text(field.value, { ...box, top: top + 9, height: height - 9 }, row === 0 ? 10 : 9, false, "left", 8); x += box.width;
    });
    top += height;
  });
  top += 8;
  const statsHeight = 186;
  const statsWidths = [180, 154, 118];
  let x = MARGIN;
  model.tables.slice(0, 3).forEach((table, index) => {
    const width = statsWidths[index] - 6;
    const layout = tableLayout(table, width, p.fonts.regular, 8.5, index === 0 ? 6 : 1);
    if (layout.height > statsHeight) throw new Error("The Character's health or mana pools need the detailed Character sheet to fit legibly.");
    // Keep the summary frame aligned while retaining writable empty rows.
    let spare = statsHeight - layout.height;
    while (spare >= 18) { layout.heights.push(18); spare -= 18; }
    layout.heights[layout.heights.length - 1] += spare;
    drawTable(p, table, { x, top, width, height: statsHeight }, layout); x += statsWidths[index];
  });
  const resources = { x, top, width: MARGIN + INNER - x, height: statsHeight };
  p.rect(resources, PAPER); p.heading("Resources", { ...resources, height: 22 });
  p.text([`Initiative: ${number(data.initiative)}`, ...data.movement.map(row => `${row.name}: ${number(row.value)}`), ...data.currency.map(row => `${number(row.quantity)} ${row.name}`)].join("\n\n"), { ...resources, top: top + 25, height: statsHeight - 25 }, 9);
  top += statsHeight + 8;
  for (const table of model.tables.slice(3)) {
    const layout = tableLayout(table, INNER, p.fonts.regular, 9, 3);
    drawTable(p, table, { x: MARGIN, top, width: INNER, height: layout.height }, layout);
    top += layout.height + 8;
  }
  const quickHeight = 104, statusHeight = BOTTOM - top - quickHeight - 8;
  if (statusHeight < 168) throw new Error("The equipment on this Character needs the detailed Character sheet to fit legibly on one PDF page.");
  const statusWidth = 354;
  p.panel("Status Effects & Special Effects", { x: MARGIN, top, width: statusWidth, height: statusHeight }, model.status, 10);
  drawBob(p, data, { x: MARGIN + statusWidth + 8, top, width: INNER - statusWidth - 8, height: statusHeight });
  top += statusHeight + 8;
  p.panel("Most Common Used Skills & Rolls", { x: MARGIN, top, width: INNER, height: quickHeight }, model.quick, 11);
}

function drawBack(p: Painter, model: TabletopPdfPage, data: PaperCharacterData) {
  p.rect({ x: MARGIN, top: 60, width: INNER, height: 30 }, PAPER);
  p.text(`${data.name}   |   ${data.campaign}   |   ${data.player}`, { x: MARGIN, top: 65, width: INNER, height: 22 }, 10, true);
  const available = BOTTOM - 98 - Math.max(0, model.tables.length - 1) * 7;
  let layouts: TableLayout[] = [];
  for (let size = 10; size >= 8; size -= .25) {
    layouts = model.tables.map(table => tableLayout(table, INNER, p.fonts.regular, size, table.title === "Inventory" ? 3 : 2));
    if (layouts.reduce((total, row) => total + row.height, 0) <= available) break;
  }
  const used = layouts.reduce((total, row) => total + row.height, 0);
  if (used > available) throw new Error(`${model.title} has too many entries for a legible single PDF page. Choose the detailed Character print option for this record.`);
  // Add blank writing rows rather than stretching sparse records into oversized cells.
  let spare = available - used;
  const weights = model.tables.map(table => table.title === "Inventory" ? .25 : table.title === "Special Abilities" ? .12 : .32);
  while (spare >= 20) {
    const index = layouts.reduce((best, layout, index) => layout.height / weights[index] < layouts[best].height / weights[best] ? index : best, 0);
    layouts[index].heights.push(20); layouts[index].height += 20; spare -= 20;
  }
  const last = layouts.at(-1)!; last.heights[last.heights.length - 1] += spare; last.height += spare;
  let top = 98;
  model.tables.forEach((table, index) => {
    const layout = layouts[index];
    drawTable(p, table, { x: MARGIN, top, width: INNER, height: layout.height }, layout);
    top += layout.height + 7;
  });
}

/** Actual PDF pages are allocated here; browser pagination cannot create extra pages. */
export async function createCharacterTabletopPdf(data: PaperCharacterData, requested: readonly TabletopPdfSheet[], bytes: TabletopPdfFonts) {
  const models = buildTabletopPdfPages(data, requested);
  if (!models.length) throw new Error("Select at least one PDF sheet.");
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fonts: Fonts = { regular: await document.embedFont(bytes.regular, { subset: true }), bold: await document.embedFont(bytes.bold, { subset: true }), title: await document.embedFont(bytes.title, { subset: true }) };
  document.setTitle(`${data.name} - Tabletop Character Sheets`);
  document.setAuthor("Serrian Tide"); document.setSubject("Saved Character tabletop reference");
  document.catalog.getOrCreateViewerPreferences().setPickTrayByPDFSize(true);
  const placements: PdfTextPlacement[] = [];
  models.forEach((model, index) => {
    const page = document.addPage([WIDTH, HEIGHT]);
    const p = new Painter(page, fonts, index + 1, placements);
    p.rect({ x: MARGIN, top: MARGIN, width: INNER, height: 944 }, PAPER);
    p.rect({ x: MARGIN, top: MARGIN, width: INNER, height: 36 }, BLUE);
    p.text(model.title === "Character Front" ? "Character Record Sheet" : model.title, { x: MARGIN, top: 25, width: INNER, height: 34 }, 26, false, "center", 20, true);
    if (model.title === "Character Front") drawFront(p, model, data); else drawBack(p, model, data);
    p.text(`${data.name} · ${model.title} · Saved ${data.recordedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC")} · ${index + 1}/${models.length}`, { x: MARGIN, top: 978, width: INNER, height: 16 }, 7.5, false, "left", 7.5);
  });
  for (const entry of placements) if (entry.x < MARGIN || entry.x + entry.width > WIDTH - MARGIN + .1 || entry.top < MARGIN || entry.top + entry.height > HEIGHT - 12) throw new Error("The PDF layout exceeded its page boundary. Please retry or use the detailed Character sheet.");
  return { bytes: await document.save(), pages: models.map(model => model.title), placements };
}

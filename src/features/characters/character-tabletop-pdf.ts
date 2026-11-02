import { PDFDocument, rgb, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, type PDFFont, type PDFPage, type PDFImage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { paperNumber, type PaperCharacterData } from "./paper-character";
import { BODY_SHOT_BOB_PATHS, BODY_SHOT_BOB_TARGETS } from "./body-shot-bob";
import { TABLETOP_PDF_PAPER, TABLETOP_PDF_SHEETS, type TabletopPdfSheet } from "./character-tabletop-pdf-options";
import type { CharacterMagicSystem } from "./character-rules";
import { printPresentationHeading, type PrintTheme, type PrintHeadings } from "./character-print-options";
import { PAPER_SHEET_STYLES } from "./character-paper-theme";

const WIDTH = TABLETOP_PDF_PAPER.width, MARGIN = TABLETOP_PDF_PAPER.margin, INNER = WIDTH - MARGIN * 2;
const INK = rgb(0, 0, 0), PAPER = rgb(1, 229 / 255, .6), BLUE = rgb(207 / 255, 226 / 255, 243 / 255), WHITE = rgb(1, 1, 1);
const number = (value: number | null | undefined) => value == null ? "—" : paperNumber(value);
const leaf = (name: string) => name.split(" → ").at(-1)!.trim();
const short = (text: string, limit = 160) => text.length <= limit ? text : text.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
const WEAPON_ROWS = 5;
type Table = { title: string; columns: string[]; widths: number[]; rows: string[][]; split?: boolean };
type Field = { label: string; value: string };
export type TabletopPdfPage = { title: TabletopPdfSheet; tables: Table[]; fields: Field[][]; status: string[]; quick: string[]; marks: string; initiative?: { base: string; turn: string }; resources: Field[] };
export type TabletopPdfFonts = { regular: Uint8Array; bold: Uint8Array; title: Uint8Array; serif?: Uint8Array };
export type PdfTextPlacement = { page: number; block: string; text: string; x: number; top: number; width: number; height: number; fontSize: number };
export type PdfRegion = { page: number; title: string; x: number; top: number; width: number; height: number };
export type TabletopPdfAppearance = { theme: PrintTheme; headings?: PrintHeadings; masthead?: Uint8Array };
const hexColor = (hex: string) => rgb(...[1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number]);

/** A concise saved-record view. No spreadsheet cells, formulas or browser print layout. */
export function buildTabletopPdfPages(data: PaperCharacterData, requested: readonly TabletopPdfSheet[]): TabletopPdfPage[] {
  // Preserve saved order within each group; a tool's combat profile must not
  // displace a purpose-built weapon simply because its name sorts earlier.
  const improvised = (type: string) => type.split("/").some(part => /^(improvised|tool)$/i.test(part.trim()));
  const weapons = [...data.tabletop.weapons].sort((a, b) => Number(improvised(a.type)) - Number(improvised(b.type)));
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
    const page: TabletopPdfPage = { title, tables: [], fields: [], status: [], quick: [], marks: "", resources: [] };
    if (title === "Character Front") {
      const p = data.tabletop.profile;
      const total = (name: string) => number(data.totals.find(row => row.name === name)?.value);
      page.fields = [
        [{ label: "Player Name", value: data.player }, { label: "Character Name", value: data.name }],
        [{ label: "Campaign", value: data.campaign }, { label: "Race", value: data.race }, { label: "Age", value: number(p.age) }, { label: "Sex", value: p.sex }],
        [{ label: "Height", value: p.heightFeet == null ? "—" : `${p.heightFeet} ft ${p.heightInches ?? 0} in` }, { label: "Weight", value: number(p.weight) }, { label: "Skin", value: p.skinColor }, { label: "Hair", value: p.hairColor }, { label: "Eyes", value: p.eyeColor }],
        [{ label: "Deity", value: p.deity }, { label: "Base Magic", value: number(data.tabletop.baseMagic) }, { label: "Base Movement", value: number(data.movement[0]?.base) }, { label: "Fate", value: total("Fate") }],
        [{ label: "Fame", value: total("Fame") }, { label: "Experience", value: total("XP") }, { label: "Quintessence", value: total("Quintessence") }, { label: "Total Experience", value: total("Total XP") }],
        [{ label: "Total Quintessence", value: total("Total Quintessence") }, { label: "Defining Marks & Character Quirks", value: "" }],
      ];
      page.marks = short(p.definingMarks);
      page.initiative = { base: number(data.initiative), turn: number(data.movement[0]?.value) };
      page.resources = data.currency.map(row => ({ label: row.name, value: number(row.quantity) }));
      page.tables = [
        { title: "Attributes", columns: ["Attribute", "#", "Mod", "%"], widths: [.43, .19, .19, .19], rows: data.attributes.map(row => [({ STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHR: "Charisma" })[row.key], number(row.score), number(row.modifier), number(row.target)]) },
        { title: "Hit Points", columns: ["Pool", "Max", "Damage"], widths: [.48, .23, .29], rows: [["Total HP", number(data.health.total.maximumHp), ""], ...data.health.tracks.map(row => [row.name, number(row.maximumHp), ""])] },
        { title: "Mana", columns: ["System", "Max", "Spent"], widths: [.55, .225, .225], rows: data.mana.filter(row => row.maximumMana > 0 || row.currentMana > 0).map(row => [row.system === "Talismanism" ? "Talisman" : row.system === "Bardic Resonance" ? "Bardic" : row.system, number(row.maximumMana), ""]) },
        { title: "Weapons", columns: ["Weapon", "Type", "Range", "Durability", "%", "Damage", "Mod", "T Damage"], widths: [3 / 11, 1.5 / 11, 1.5 / 11, 1 / 11, 1 / 11, 1 / 11, 1 / 11, 1 / 11], rows: weapons.slice(0, WEAPON_ROWS).map(item => [item.name + (item.quantity === 1 ? "" : ` ×${number(item.quantity)}`) + (item.weapon?.mode ? ` (${item.weapon.mode})` : ""), item.damageType || "—", item.weapon?.compactRange ?? (item.weapon?.range === "Range/reach not recorded" ? "—" : item.weapon?.range || "—"), number(item.durability), item.weapon?.target == null ? "—" : number(item.weapon.target) + "%", item.baseDamage, item.damageSummary?.modifier.replace(/\b(?:STR|DEX|CON|INT|WIS|CHR|CHA)\s+/g, "") ?? "—", item.damageSummary?.totalDamage ?? "—"]) },
        { title: "Armor", columns: ["Armor", "Area Covered", "Special Properties", "Durability", "Soaks"], widths: [3 / 11, 2 / 11, 4 / 11, 1 / 11, 1 / 11], rows: data.tabletop.armor.slice(0, 6).map(item => [item.name + (item.quantity === 1 ? "" : ` ×${number(item.quantity)}`), short(item.coverage, 40), item.properties, number(item.durability), number(item.soak)]) },
      ];
      page.status = [...(data.tabletop.effects ?? data.effects), ...(data.tabletop.protectionNotes ?? []),
        ...(data.abilities.length ? ["Derived Abilities: " + data.abilities.map(ability => ability.name).join(", ")] : []),
        ...data.tabletop.armor.slice(0, 6).filter(item => item.coverage.length > 40).map(item => `${item.name}: ${item.coverage}`),
        ...data.health.tracks.slice(6).map(row => `${row.name}: ${number(row.maximumHp)} HP; Damage: ______`),
        ...data.mana.filter(row => row.maximumMana > 0 || row.currentMana > 0).slice(2).map(row => `${row.system}: ${number(row.maximumMana)} mana; Spent: ______`),
        ...weapons.slice(WEAPON_ROWS).map(item => `${item.name}: ${item.damageType || "—"}; durability ${number(item.durability)}; ${item.weapon?.target == null ? "" : number(item.weapon.target) + "%; "}damage ${item.damageSummary?.totalDamage ?? item.baseDamage}`),
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
type Fonts = { regular: PDFFont; bold: PDFFont; title: PDFFont; serif?: PDFFont };
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
    const lines = wrap(text, font, size, box.width - 4), lineHeight = size * 1.2;
    if (lines.length * lineHeight <= box.height - 2) return { lines, size, lineHeight };
  }
  throw new Error(`The PDF needs more room for “${short(text, 70)}”. Choose the detailed Character print option for this record.`);
}

class Painter {
  currentBlock = "";
  constructor(readonly page: PDFPage, readonly fonts: Fonts, readonly index: number, readonly placements: PdfTextPlacement[], readonly regions: PdfRegion[], readonly appearance?: TabletopPdfAppearance) {}
  get style() { return this.appearance ? PAPER_SHEET_STYLES[this.appearance.theme] : null; }
  get ink() { return this.style ? hexColor(this.style.ink) : INK; }
  get rule() { return this.style ? hexColor(this.style.rule) : INK; }
  get paper() { return this.style ? WHITE : PAPER; }
  get faint() { return this.style ? hexColor(this.style.faint) : PAPER; }
  get height() { return this.page.getHeight(); }
  get bottom() { return this.height - MARGIN - 11; }
  region(title: string, box: Box) { this.currentBlock = title; this.regions.push({ page: this.index, title, ...box }); }
  rect(box: Box, fill = WHITE, stroke = true) { this.page.drawRectangle({ x: box.x, y: this.height - box.top - box.height, width: box.width, height: box.height, color: fill === PAPER ? this.paper : fill === BLUE && this.style ? WHITE : fill, borderColor: this.rule, borderWidth: stroke ? .65 : 0 }); }
  line(x: number, top: number, toX: number, toTop: number, thickness = .6) { this.page.drawLine({ start: { x, y: this.height - top }, end: { x: toX, y: this.height - toTop }, color: this.rule, thickness }); }
  text(text: string, box: Box, preferred = 10, bold = false, align: "left" | "center" = "left", minimum = 8, title = false, overrideFont?: PDFFont, color?: RGB) {
    if (!text.trim()) return;
    const font = overrideFont ?? (title ? this.fonts.title : bold ? this.fonts.bold : this.fonts.regular);
    const fit = fitted(text, font, box, preferred, minimum);
    fit.lines.forEach((line, i) => {
      if (!line) return;
      const width = font.widthOfTextAtSize(line, fit.size), top = box.top + 1 + i * fit.lineHeight;
      const x = align === "center" ? box.x + (box.width - width) / 2 : box.x + 2;
      const glyphHeight = font.heightAtSize(fit.size, { descender: false });
      this.page.drawText(line, { x, y: this.height - top - glyphHeight, size: fit.size, font, color: color ?? (title ? rgb(1, 0, 0) : INK) });
      this.placements.push({ page: this.index, block: this.currentBlock, text: line, x, top, width, height: fit.lineHeight, fontSize: fit.size });
    });
  }
  heading(title: string, box: Box) { const filled = !!this.style && this.appearance?.theme !== "Plain"; this.rect(box, filled ? this.ink : PAPER); this.text(title, box, Math.min(10, box.height / 1.4), true, "center", 7, false, undefined, filled ? WHITE : this.ink); }
  panel(title: string, box: Box, values: string[], preferred = 10, headingHeight = 22) {
    this.region(title, box); this.rect(box, PAPER); this.heading(title, { ...box, height: headingHeight });
    const content = { ...box, top: box.top + headingHeight + 2, height: box.height - headingHeight - 2 };
    if (values.length) this.text(values.join("\n"), content, preferred);
    else for (let top = content.top + 22; top < box.top + box.height - 8; top += 22) this.line(box.x + 5, top, box.x + box.width - 5, top, .25);
  }
}

type TableLayout = { heights: number[]; height: number; groups: string[][][]; fontSize: number; columns: number; headingHeight: number; columnHeight: number };
function tableLayout(table: Table, width: number, font: PDFFont, fontSize: number, minimumRows = 1, headingHeight = 16, columnHeight = 16): TableLayout {
  const split = !!table.split;
  const columns = split ? table.title === "Ordinary Skills" && table.rows.length > 48 ? 3 : 2 : 1;
  const count = Math.max(minimumRows, Math.ceil(table.rows.length / columns));
  const groups = Array.from({ length: columns }, (_, index) => table.rows.slice(index * count, (index + 1) * count));
  const tableWidth = (width - (columns - 1) * 8) / columns;
  const heights = Array.from({ length: count }, (_, i) => Math.max(split ? fontSize * 1.2 + 4 : 18, ...groups.map(rows => Math.max(1, ...table.columns.map((_, col) => wrap(rows[i]?.[col] ?? "", font, fontSize, tableWidth * table.widths[col] - 4).length)) * fontSize * 1.2 + (split ? 4 : 5))));
  return { heights, height: headingHeight + columnHeight + heights.reduce((a, b) => a + b, 0), groups, fontSize, columns, headingHeight, columnHeight };
}

function drawTable(p: Painter, table: Table, box: Box, layout: TableLayout) {
  p.region(table.title, box); p.heading(table.title, { ...box, height: layout.headingHeight });
  const width = (box.width - (layout.columns - 1) * 8) / layout.columns;
  layout.groups.forEach((rows, group) => {
    const x = box.x + group * (width + 8);
    let colX = x;
    table.columns.forEach((column, col) => {
      const cell = { x: colX, top: box.top + layout.headingHeight, width: width * table.widths[col], height: layout.columnHeight };
      p.rect(cell, p.faint); p.text(column, cell, 8, true, col ? "center" : "left", 8, false, undefined, p.ink); colX += cell.width;
    });
    let top = box.top + layout.headingHeight + layout.columnHeight;
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

function drawBob(p: Painter, data: PaperCharacterData, box: Box, headingHeight: number) {
  p.region("Hit Locations", box); p.rect(box, PAPER); p.heading("Hit Locations", { ...box, height: headingHeight });
  const scale = Math.min((box.width * .57) / 420, (box.height - headingHeight - 20) / 610);
  const x = box.x + 2, top = box.top + headingHeight + 4;
  const circle = (cx: number, cy: number, radius: number, fill?: ReturnType<typeof rgb>) => p.page.drawCircle({ x: x + cx * scale, y: p.height - top - cy * scale, size: radius * scale, color: fill, borderColor: p.ink, borderWidth: .75 });
  circle(210, 62, 46);
  for (const path of BODY_SHOT_BOB_PATHS) p.page.drawSvgPath(path, { x, y: p.height - top, scale, borderColor: p.ink, borderWidth: 5 });
  for (const [result, target] of Object.entries(BODY_SHOT_BOB_TARGETS)) {
    circle(target.x, target.y, 25, p.paper);
    const size = 36 * scale, textWidth = p.fonts.regular.widthOfTextAtSize(result, size);
    p.page.drawText(result, { x: x + target.x * scale - textWidth / 2, y: p.height - top - (target.y + 12) * scale, size, font: p.fonts.regular, color: p.ink });
  }
  const keyBox = { x: box.x + box.width * .59, top: top - 2, width: box.width * .41 - 2, height: box.height - headingHeight - 8 };
  p.text(data.health.anatomy.hitLocations.map(hit => `${hit.result} - ${hit.name}`).join("\n"), keyBox, 7.5, false, "left", 7.5);
  p.text(data.health.anatomy.kind === "humanoid" ? "Body Shot Bob" : "Body Shot Bob\nHumanoid reference", { x, top: box.top + box.height - (data.health.anatomy.kind === "humanoid" ? 12 : 23), width: box.width * .59, height: 24 }, 7.5, false, "center", 7.5);
}

/** Preserve the owner's 60-row front proportions as PDF sections, without spreadsheet cells. */
export function tabletopPdfFrontGeometry() {
  const row = (TABLETOP_PDF_PAPER.height - MARGIN * 2 - 11) / 60;
  const box = (first: number, count: number): Box => ({ x: MARGIN, top: MARGIN + first * row, width: INNER, height: count * row });
  const stats = box(11, 8);
  let x = MARGIN;
  const summary = [4, 3, 1, 1, 2].map((columns, index) => { const result = { title: ["Attributes", "Hit Points", "Mana", "Initiative", "Resources"][index], x, top: stats.top, width: INNER * columns / 11, height: stats.height }; x += result.width; return result; });
  return { row, title: box(0, 3), identity: box(3, 8), summary, weapons: box(19, 10), armor: box(29, 6), status: { ...box(35, 15), width: INNER * 8 / 11 }, bob: { ...box(35, 15), x: MARGIN + INNER * 8 / 11, width: INNER * 3 / 11 }, quick: box(50, 10) };
}

function compactCell(p: Painter, value: string, box: Box, centered = false, header = false) {
  p.rect(box, header ? p.faint : PAPER); p.text(value, box, header ? 7.5 : 8.5, header, centered ? "center" : "left", header ? 7.5 : 8, false, undefined, header ? p.ink : undefined);
}

function drawEquipment(p: Painter, table: Table, box: Box, rowHeight: number) {
  p.region(table.title, box); p.rect(box, PAPER);
  let x = box.x;
  table.columns.forEach((name, i) => { const width = box.width * table.widths[i]; compactCell(p, name, { x, top: box.top, width, height: rowHeight }, true, true); x += width; });
  let top = box.top + rowHeight;
  if (table.title === "Weapons") {
    const height = (box.height - rowHeight) / WEAPON_ROWS;
    const extra: string[] = [];
    for (let row = 0; row < WEAPON_ROWS; row++) {
      let x = box.x;
      table.widths.forEach((fraction, col) => {
        const width = box.width * fraction;
        const value = table.rows[row]?.[col] ?? "";
        let display = value, limit = value.length;
        while (wrap(display, p.fonts.regular, 8, width - 4).length * 8 * 1.2 + 2 > height && limit > 1) {
          limit = Math.max(1, Math.floor(limit * .8));
          display = short(value, limit);
        }
        if (display !== value) extra.push(`${table.rows[row][0]} — ${table.columns[col]}: ${value}`);
        compactCell(p, display, { x, top, width, height }, col >= 3);
        x += width;
      });
      top += height;
    }
    return extra;
  }
  const extra: string[] = [];
  for (const values of table.rows) {
    const height = Math.max(rowHeight, ...values.map((value, i) => wrap(value, p.fonts.regular, 8.5, box.width * table.widths[i] - 4).length * 8.5 * 1.2 + 2));
    if (top + height > box.top + box.height + .01) { extra.push(table.columns.map((name, i) => `${name}: ${values[i]}`).join("; ")); continue; }
    let x = box.x;
    values.forEach((value, i) => { const width = box.width * table.widths[i]; compactCell(p, value, { x, top, width, height }, i >= 3); x += width; });
    top += height;
  }
  while (top < box.top + box.height - .01) {
    const remaining = box.top + box.height - top, height = remaining < rowHeight * 2 ? remaining : rowHeight;
    let x = box.x;
    table.widths.forEach(fraction => { const width = box.width * fraction; p.rect({ x, top, width, height }, PAPER); x += width; });
    top += height;
  }
  return extra;
}

function drawFront(p: Painter, model: TabletopPdfPage, data: PaperCharacterData) {
  const layout = tabletopPdfFrontGeometry(), r = layout.row;
  p.region("Identity", layout.identity);
  const weights = [[5 / 11, 6 / 11], [.36, .30, .14, .20], [.22, .18, .20, .20, .20], [.27, .20, .30, .23], [.18, .25, .28, .29], [4 / 11, 7 / 11]];
  model.fields.forEach((fields, row) => {
    let x = MARGIN;
    fields.forEach((field, column) => {
      const box = { x, top: layout.identity.top + row * r, width: INNER * weights[row][column], height: r };
      p.rect(box, PAPER);
      const labelWidth = Math.min(box.width - 12, p.fonts.regular.widthOfTextAtSize(field.label + ":", 7.5) + 5);
      p.text(field.label + (field.value ? ":" : ""), { ...box, width: field.value ? labelWidth : box.width }, 7.5, false, "left", 7.5);
      if (field.value) p.text(field.value, { ...box, x: x + labelWidth, width: box.width - labelWidth }, 8.5, false, "left", 8);
      x += box.width;
    });
  });
  compactCell(p, model.marks, { x: MARGIN, top: layout.identity.top + 6 * r, width: INNER, height: 2 * r });

  layout.summary.forEach((box, index) => {
    p.region(box.title, box); p.rect(box, PAPER);
    if (index === 0) {
      p.heading("Attributes", { ...box, height: r });
      let x = box.x;
      const table = model.tables[0];
      table.widths.forEach((fraction, col) => { const width = box.width * fraction; compactCell(p, col ? table.columns[col] : "", { x, top: box.top + r, width, height: r }, true, true); x += width; });
      table.rows.forEach((values, row) => { let x = box.x; table.widths.forEach((fraction, col) => { const width = box.width * fraction; compactCell(p, values[col], { x, top: box.top + (2 + row) * r, width, height: r }, col > 0); x += width; }); });
    } else if (index === 1) {
      const table = model.tables[1];
      let x = box.x;
      table.widths.forEach((fraction, col) => { const width = box.width * fraction; compactCell(p, col ? table.columns[col] : "Hit Points", { x, top: box.top, width, height: r }, true, true); x += width; });
      for (let row = 0; row < 7; row++) { let x = box.x; table.widths.forEach((fraction, col) => { const width = box.width * fraction; compactCell(p, table.rows[row]?.[col] ?? "", { x, top: box.top + (1 + row) * r, width, height: r }, col > 0); x += width; }); }
    } else if (index === 2) {
      p.heading("Mana", { ...box, height: r });
      compactCell(p, "Max", { x: box.x, top: box.top + r, width: box.width / 2, height: r }, true, true);
      compactCell(p, "Spent", { x: box.x + box.width / 2, top: box.top + r, width: box.width / 2, height: r }, true, true);
      for (let pool = 0; pool < 3; pool++) {
        const values = pool < 2 ? model.tables[2].rows[pool] : undefined;
        compactCell(p, values?.[0] ?? "", { x: box.x, top: box.top + (2 + pool * 2) * r, width: box.width, height: r }, true);
        compactCell(p, values?.[1] ?? "", { x: box.x, top: box.top + (3 + pool * 2) * r, width: box.width / 2, height: r }, true);
        compactCell(p, "", { x: box.x + box.width / 2, top: box.top + (3 + pool * 2) * r, width: box.width / 2, height: r }, true);
      }
    } else if (index === 3) {
      p.heading("Initiative", { ...box, height: r });
      p.text(model.initiative!.base, { ...box, top: box.top + r + 6, height: 3 * r - 6 }, 16, true, "center");
      p.heading("T Initiative", { ...box, top: box.top + 4 * r, height: r });
      p.text(model.initiative!.turn, { ...box, top: box.top + 5 * r + 6, height: 3 * r - 6 }, 16, true, "center");
    } else {
      p.heading("Resources", { ...box, height: r });
      model.resources.forEach((field, row) => {
        if (row >= 7) throw new Error("The Character's currencies need more room than this tabletop Resources block.");
        const top = box.top + (row + 1) * r;
        compactCell(p, field.label, { x: box.x, top, width: box.width * .64, height: r }, false, true);
        compactCell(p, field.value, { x: box.x + box.width * .64, top, width: box.width * .36, height: r }, true);
      });
    }
  });
  const extra = [...drawEquipment(p, model.tables[3], layout.weapons, r), ...drawEquipment(p, model.tables[4], layout.armor, r)];
  p.panel("Status Effects & Special Effects", layout.status, [...model.status, ...extra], 9, r);
  drawBob(p, data, layout.bob, r);
  p.panel("Most Common Used Skills & Rolls", layout.quick, model.quick, 10, r);
}

function drawBack(p: Painter, model: TabletopPdfPage, data: PaperCharacterData) {
  const nameTop = tabletopPdfFrontGeometry().title.top + tabletopPdfFrontGeometry().title.height;
  p.rect({ x: MARGIN, top: nameTop, width: INNER, height: 22 }, PAPER);
  p.text(`${data.name}   |   ${data.campaign}   |   ${data.player}`, { x: MARGIN, top: nameTop + 2, width: INNER, height: 20 }, 10, true);
  const firstTop = nameTop + 27;
  const available = p.bottom - firstTop - Math.max(0, model.tables.length - 1) * 7;
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
  let top = firstTop;
  model.tables.forEach((table, index) => {
    const layout = layouts[index];
    drawTable(p, table, { x: MARGIN, top, width: INNER, height: layout.height }, layout);
    top += layout.height + 7;
  });
}

function drawPaperMasthead(p: Painter, title: string, box: Box, artwork?: PDFImage) {
  p.rect(box, WHITE);
  if (artwork) {
    p.page.pushOperators(pushGraphicsState(), rectangle(box.x, p.height - box.top - box.height, box.width, box.height), clip(), endPath());
    const scaleY = box.height / 370;
    p.page.drawImage(artwork, { x: box.x, y: p.height - box.top - (724 - 170) * scaleY, width: box.width, height: 724 * scaleY });
    p.page.pushOperators(popGraphicsState());
  }
  const center = { ...box, x: box.x + box.width * .25, width: box.width * .5 };
  p.text("Serrian Tide", { ...center, top: box.top + 2, height: 23 }, 18, true, "center", 16, false, p.fonts.serif, p.ink);
  p.text(title.toUpperCase(), { ...center, top: box.top + 25, height: 11 }, 8, true, "center", 7.5, false, p.fonts.serif, p.ink);
  p.line(box.x + 5, box.top + box.height - 2, box.x + box.width * .35, box.top + box.height - 2, .4);
  p.line(box.x + box.width * .65, box.top + box.height - 2, box.x + box.width - 5, box.top + box.height - 2, .4);
}

function drawPaperBorder(p: Painter) {
  if (!p.style || p.appearance?.theme === "Plain") return;
  if (p.style.border === "double" || p.style.border === "dashed") p.page.drawRectangle({ x: MARGIN + 1.3, y: MARGIN + 1.3, width: INNER - 2.6, height: p.height - MARGIN * 2 - 2.6, borderColor: p.rule, borderWidth: .35, ...(p.style.border === "dashed" ? { borderDashArray: [3, 2] } : {}) });
  if (p.style.border === "technical") for (const [x, top, dx, dy] of [[MARGIN + 1, MARGIN + 1, 1, 1], [WIDTH - MARGIN - 1, MARGIN + 1, -1, 1], [MARGIN + 1, p.height - MARGIN - 1, 1, -1], [WIDTH - MARGIN - 1, p.height - MARGIN - 1, -1, -1]]) { p.line(x, top, x + dx * 7, top, 1); p.line(x, top, x, top + dy * 7, 1); }
}

/** Shared page geometry and data; Paper themes change decoration only. */
export async function createCharacterTabletopPdf(data: PaperCharacterData, requested: readonly TabletopPdfSheet[], bytes: TabletopPdfFonts, appearance?: TabletopPdfAppearance) {
  const models = buildTabletopPdfPages(data, requested);
  if (!models.length) throw new Error("Select at least one PDF sheet.");
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fonts: Fonts = { regular: await document.embedFont(bytes.regular, { subset: true }), bold: await document.embedFont(bytes.bold, { subset: true }), title: await document.embedFont(bytes.title, { subset: true }) };
  if (appearance) { if (!bytes.serif) throw new Error("The paper style heading font could not be loaded. Retry printing."); fonts.serif = await document.embedFont(bytes.serif, { subset: true }); }
  if (appearance && appearance.theme !== "Plain" && !appearance.masthead) throw new Error("The selected paper style artwork could not be loaded. Retry printing or select Plain.");
  const masthead = appearance?.theme !== "Plain" && appearance?.masthead ? await document.embedPng(appearance.masthead) : undefined;
  document.setTitle(`${data.name} - Tabletop Character Sheets`);
  document.setAuthor("Serrian Tide"); document.setSubject("Saved Character tabletop reference");
  document.catalog.getOrCreateViewerPreferences().setPickTrayByPDFSize(true);
  const placements: PdfTextPlacement[] = [], regions: PdfRegion[] = [];
  models.forEach((model, index) => {
    const page = document.addPage([WIDTH, TABLETOP_PDF_PAPER.height]);
    const p = new Painter(page, fonts, index + 1, placements, regions, appearance);
    p.rect({ x: MARGIN, top: MARGIN, width: INNER, height: TABLETOP_PDF_PAPER.height - MARGIN * 2 }, PAPER);
    const title = tabletopPdfFrontGeometry().title;
    p.region("Title", title);
    if (appearance) drawPaperMasthead(p, model.title === "Character Front" ? printPresentationHeading(appearance.theme, appearance.headings ?? "standard") : model.title, title, masthead);
    else { p.rect(title, BLUE); p.text(model.title === "Character Front" ? "Character Record Sheet" : model.title, title, 30, false, "center", 20, true); }
    if (model.title === "Character Front") drawFront(p, model, data); else drawBack(p, model, data);
    const footer = { x: MARGIN, top: p.bottom, width: INNER, height: 11 };
    p.region("Footer", footer); p.rect(footer, PAPER);
    p.text(`${data.name} · ${model.title} · Saved ${data.recordedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC")} · ${index + 1}/${models.length}`, footer, 7, false, "left", 7);
    drawPaperBorder(p);
  });
  for (const entry of placements) if (entry.x < MARGIN || entry.x + entry.width > WIDTH - MARGIN + .1 || entry.top < MARGIN || entry.top + entry.height > TABLETOP_PDF_PAPER.height - MARGIN + .1) throw new Error("The PDF layout exceeded its page boundary. Please retry or use the detailed Character sheet.");
  return { bytes: await document.save(), pages: models.map(model => model.title), placements, regions };
}

import assert from "node:assert/strict";
import test from "node:test";
import type { PaperCharacterData } from "./paper-character";
import { buildSpreadsheetCharacterPages, SPREADSHEET_SHEETS, spreadsheetCharacterTemplate } from "./spreadsheet-character";
import { DEFAULT_PRINT_SELECTION, printPresetSelection } from "./character-print-options";

function skill(id: number, name: string, system: "Spellcraft" | "Faith" | null = null, special = false) {
  return { id, skillId: id, name, points: id + 10, racialPoints: 0, rank: id, target: 70 - id, depth: name.split(" → ").length - 1,
    parentId: null, special, hasRoll: !special, systems: system ? [system] : [], system, reference: `SK${id}`, definition: "", spellLevel: null, manaCost: null, spellDocumentJson: null };
}
function fixture() {
  return { characterId: 10, name: "Saved Navigator", player: "Player One", campaign: "Test Coast", race: "Serpent", recordedAt: "2026-11-01T18:00:00.000Z",
    spreadsheet: { profile: { age: 28, sex: "Female", heightFeet: 5, heightInches: 9, weight: 145, skinColor: "Tan", hairColor: "Brown", eyeColor: "Green", deity: "None", definingMarks: "Compass tattoo" }, baseMagic: 3, weapons: [], armor: [] },
    totals: [{ name: "Fate", value: 0 }, { name: "Fame", value: 7 }, { name: "XP", value: 123 }, { name: "Total XP", value: 456 }, { name: "Quintessence", value: 12 }, { name: "Total Quintessence", value: 34 }],
    attributes: [{ key: "STR", score: 30, modifier: 1, target: 70 }], currency: [{ name: "Credits", quantity: 100 }], initiative: 7,
    movement: [{ name: "Slither", base: 3, value: 5, notes: "" }], health: { total: { remainingHp: 35, maximumHp: 40 }, tracks: [{ name: "Tail", remainingHp: 15, maximumHp: 20 }], anatomy: { hitLocations: [{ result: "0–9", name: "Tail" }] } },
    mana: ["Spellcraft", "Faith", "Psyonics"].map((system, i) => ({ system, maximumMana: 30 + i, currentMana: 20 + i })),
    effects: [], protection: [], interactions: [], quickRolls: [], skills: [skill(1, "Sailing"), skill(2, "Spellcraft → Fire", "Spellcraft"), skill(3, "Faith → Fire", "Faith"), skill(4, "Second Sight", null, true)],
    inventory: [{ name: "Compass", quantity: 2, state: "Carried", status: "" }], abilities: [], spells: [], gaps: [],
  } as unknown as PaperCharacterData;
}

test("spreadsheet selection is optional, independent and deterministic; default printing is retained", () => {
  const data = fixture(), before = structuredClone(data);
  assert.deepEqual(buildSpreadsheetCharacterPages(data, []), []);
  assert.deepEqual(buildSpreadsheetCharacterPages(data, ["Faith Back", "Sheet front filled", "Faith Back"]).map(page => page.title), ["Sheet front filled", "Faith Back"]);
  assert.deepEqual(printPresetSelection("quick", data, DEFAULT_PRINT_SELECTION), DEFAULT_PRINT_SELECTION);
  assert.deepEqual(printPresetSelection("spreadsheet", data, DEFAULT_PRINT_SELECTION), { front: false, backs: [], books: [], references: [] });
  assert.deepEqual(data, before);
});
test("front maps identity, zero balances, attributes, live health and all mana without humanoid assumptions", () => {
  const page = buildSpreadsheetCharacterPages(fixture(), ["Sheet front filled"])[0];
  assert.equal(page.values.H4, "Saved Navigator"); assert.equal(page.values.J7, "0"); assert.equal(page.values.C9, "34");
  assert.equal(page.values.B14, "30"); assert.equal(page.values.C14, "1"); assert.equal(page.values.D14, "70");
  assert.equal(page.values.E14, "Tail"); assert.equal(page.values.F14, "20"); assert.equal(page.values.G14, "15");
  assert.equal(page.values.F13, "40"); assert.equal(page.values.G13, "35"); assert.equal(page.values.I35, "0–9 — Tail");
  assert.equal(page.values.H13, "Spellcraft"); assert.equal(page.values.H16, "Faith");
  assert.ok(page.notes.some(row => row.text === "Psyonics: 32 / 22"));
});
test("same-name spheres in distinct systems stay separate and never sum ranks or targets", () => {
  const data = fixture();
  const [general, spellcraft, faith] = buildSpreadsheetCharacterPages(data, ["Skills Back", "Spellcraft Back", "Faith Back"]);
  assert.equal(general.values.B8, "See notes"); assert.equal(general.notes.filter(row => row.section.startsWith("Fire —")).length, 2);
  assert.equal(spellcraft.values.B14, "12"); assert.equal(spellcraft.values.C14, "2"); assert.equal(spellcraft.values.D14, "68");
  assert.equal(faith.values.B14, "13"); assert.equal(faith.values.C14, "3"); assert.equal(faith.values.D14, "67");
});
test("skills beyond fixed slots remain available to the same-page notes area", () => {
  const data = fixture(); data.skills = Array.from({ length: 95 }, (_, i) => skill(i + 1, `Navigation → Region ${i + 1}`));
  const before = structuredClone(data);
  const page = buildSpreadsheetCharacterPages(data, ["Special Abilities Back"])[0];
  const output = JSON.stringify(page);
  for (const row of data.skills) assert.ok(output.includes(row.name.split(" → ").at(-1)!), row.name);
  assert.equal(page.notes.length, 55); assert.deepEqual(data, before);
});
test("a Special Ability without a governing attribute gets no fabricated percentage", () => {
  const page = buildSpreadsheetCharacterPages(fixture(), ["Special Abilities Back"])[0];
  assert.equal(page.values.A23, "Second Sight"); assert.equal(page.values.C23, "14"); assert.equal(page.values.D23, "—");
});
test("tabletop front keeps only the named quick roll, numeric durability and active status information", () => {
  const data = fixture();
  data.quickRolls = [skill(8, "Spellcraft → Time & Space → Blink Step", "Spellcraft")];
  data.spreadsheet.weapons = [{ name: "Revolver", quantity: 1, type: "Revolver", durability: 60, baseDamage: "4", weapon: { mode: "", target: 62, governing: "DEX", damage: "4", initiative: "4", range: "", timing: [] }, damageSummary: { modifier: "DEX +2", totalDamage: "6" } }];
  data.spreadsheet.armor = [{ name: "Jacket", quantity: 1, coverage: "Torso", properties: "Blunt +1", durability: 50, soak: 1 }];
  data.effects = ["Wounded: -1 DEX"];
  const page = buildSpreadsheetCharacterPages(data, ["Sheet front filled"])[0];
  assert.equal(page.values.A50, "Blink Step 62%"); assert.equal(page.values.G21, "60"); assert.equal(page.values.J28, "50");
  assert.equal(page.values.A35, "Wounded: -1 DEX"); assert.ok(!page.values.A35.includes(data.race)); assert.ok(!page.values.A35.includes("Initiative"));
});
test("Derived Abilities print under front status effects and never inside inventory", () => {
  const data = fixture();
  data.abilities = [{ name: "Steady Resolve" }] as PaperCharacterData["abilities"];
  const pages = buildSpreadsheetCharacterPages(data, [...SPREADSHEET_SHEETS]);
  assert.match(pages[0].values.A35, /Derived Abilities\nSteady Resolve/);
  for (const page of pages.slice(1)) assert.ok(!Object.values(page.values).some(value => value.includes("Steady Resolve")), page.title);
});
test("inventory omits uninitialized ammunition diagnostics while retaining quantities and recorded ammunition/charges", () => {
  const data = fixture();
  data.inventory = [{ name: "Revolver", quantity: 1, status: "Ammunition state not initialized" }, { name: "Wand", quantity: 2, status: "2/5 charges; Ammunition state not initialized; 4 loaded rounds" }] as PaperCharacterData["inventory"];
  const before = structuredClone(data);
  const page = buildSpreadsheetCharacterPages(data, ["Skills Back"])[0];
  assert.match(page.values.A40, /Revolver ×1/);
  assert.match(page.values.A40, /Wand ×2; 2\/5 charges; 4 loaded rounds/);
  assert.doesNotMatch(page.values.A40, /not initialized/i);
  assert.deepEqual(data, before);
});
test("the eight captured layouts contain only labels and formatting, never formulas or source caches", () => {
  assert.deepEqual(spreadsheetCharacterTemplate.sheets.map(sheet => sheet.title), [...SPREADSHEET_SHEETS]);
  const text = JSON.stringify(spreadsheetCharacterTemplate);
  for (const forbidden of ["DUMMYFUNCTION", "Black Naga Orang", "Corrosion Reader", "Engineering", "Skill Engine", "Character info"])
    assert.ok(!text.includes(forbidden), forbidden);
  const front = spreadsheetCharacterTemplate.sheets[0];
  assert.ok(front.merges.includes("A1:K3")); assert.ok(front.merges.includes("A35:H48"));
  assert.equal(front.cells.H4![1], ""); assert.equal(front.cells.I35![1], "");
});

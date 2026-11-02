import template from "./spreadsheet-character-template.json";
import { paperNumber, type PaperCharacterData } from "./paper-character";
import type { CharacterMagicSystem } from "./character-rules";

export const SPREADSHEET_SHEETS = ["Sheet front filled", "Skills Back", "Spellcraft Back", "Talisman Back", "Faith Back", "Psyonics Back", "Bardic Resonance Back", "Special Abilities Back"] as const;
export type SpreadsheetSheet = typeof SPREADSHEET_SHEETS[number];
export const DEFAULT_SPREADSHEET_SHEETS: SpreadsheetSheet[] = ["Sheet front filled", "Skills Back"];
export type SpreadsheetNote = { section: string; text: string };
export type SpreadsheetPage = { title: SpreadsheetSheet; values: Record<string, string>; notes: SpreadsheetNote[] };
type Skill = PaperCharacterData["skills"][number];
const leaf = (name: string) => name.split(" → ").at(-1)!.trim();
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const number = (value: number | null | undefined) => value == null ? "—" : paperNumber(value);
const shortText = (value: string) => value.length <= 120 ? value : value.slice(0, 117).replace(/\s+\S*$/, "") + "…";
const skillText = (skill: Skill) => `${leaf(skill.name)} | ${number(skill.points)} / ${number(skill.rank)} / ${skill.hasRoll ? `${number(skill.target)}%` : "—"}`;
const slots = (first: number, last: number, columns = ["A", "E"]) => columns.flatMap(col => Array.from({ length: last - first + 1 }, (_, i) => `${col}${first + i}`));

/** Presentation only: all numbers come from the existing saved-record projection. */
export function buildSpreadsheetCharacterPages(data: PaperCharacterData, requested: readonly SpreadsheetSheet[]): SpreadsheetPage[] {
  return SPREADSHEET_SHEETS.filter(title => requested.includes(title)).map(title => {
    const page: SpreadsheetPage = { title, values: {}, notes: [] };
    const set = (cell: string, value: string | number | null | undefined) => { page.values[cell] = value == null ? "—" : String(value); };
    const extra = (section: string, text: string) => page.notes.push({ section, text });
    const fillSkills = (skills: readonly Skill[], cells: string[], special = false) => {
      skills.forEach((skill, index) => {
        const cell = cells[index];
        if (!cell) { extra(special ? "Special Abilities" : "Additional skills (# / rank / %)", skillText(skill)); return; }
        const row = cell.slice(1), right = cell[0] === "E";
        set(cell, leaf(skill.name));
        set(`${right ? special ? "G" : "F" : special ? "C" : "B"}${row}`, number(skill.points));
        if (!special) set(`${right ? "G" : "C"}${row}`, number(skill.rank));
        set(`${right ? "H" : "D"}${row}`, skill.hasRoll ? number(skill.target) : "—");
      });
    };
    const special = data.skills.filter(skill => skill.special);
    const ordinary = data.skills.filter(skill => !skill.special && !skill.systems.length);
    const used = new Set<number>();
    // Match a fixed label only within its exact system/path. Duplicate names stay separate.
    const fixed = (name: string, cell: string, systems: readonly CharacterMagicSystem[]) => {
      const matches = data.skills.filter(skill => !skill.special && same(leaf(skill.name), name) && skill.systems.some(system => systems.includes(system)));
      if (matches.length === 1) { fillSkills(matches, [cell]); set(cell, name); used.add(matches[0].id); }
      else if (matches.length > 1) {
        const row = cell.slice(1), col = cell[0] === "E" ? "F" : "B";
        set(`${col}${row}`, "See notes");
        matches.forEach(skill => { used.add(skill.id); extra(`${name} — distinct saved paths`, `${skill.system ?? "Skill"}: ${skillText(skill)}`); });
      }
    };
    const inventory = () => ["Inventory", ...data.inventory.map(item => `${item.name} ×${number(item.quantity)}${item.status ? `; ${item.status}` : ""}`),
      ...data.abilities.map(ability => `Derived: ${ability.name}`)].join("\n");
    if (title === "Sheet front filled") {
      const p = data.spreadsheet.profile;
      const total = (name: string) => data.totals.find(row => row.name === name)?.value;
      const values = { C4: data.player, H4: data.name, B5: data.campaign, F5: data.race, I5: p.age, K5: p.sex,
        B6: p.heightFeet == null ? "" : `${p.heightFeet} ft ${p.heightInches ?? 0} in`, D6: p.weight, F6: p.skinColor, H6: p.hairColor, J6: p.eyeColor,
        B7: p.deity, E7: data.spreadsheet.baseMagic, H7: data.movement[0]?.base, J7: total("Fate"), B8: total("Fame"), D8: total("XP"),
        G8: total("Quintessence"), J8: total("Total XP"), C9: total("Total Quintessence"), A10: shortText(p.definingMarks),
        I13: data.initiative, I17: data.movement[0]?.value, K13: data.currency.map(row => `${number(row.quantity)} ${row.name}`).join("; "),
        K14: total("Quintessence"), K15: "Saved", K16: total("Fate"),
        F13: data.health.total.maximumHp, G13: data.health.total.remainingHp,
        A35: [...(data.spreadsheet.effects ?? data.effects), ...(data.spreadsheet.protectionNotes ?? [])].join("\n"),
        I35: data.health.anatomy.hitLocations.map(hit => `${hit.result} — ${hit.name}`).join("\n"),
        A50: data.quickRolls.map(skill => `${leaf(skill.name)} ${number(skill.target)}%`).join("\n"),
      };
      Object.entries(values).forEach(([cell, value]) => set(cell, value));
      data.attributes.forEach((a, i) => { set(`B${14 + i}`, a.score); set(`C${14 + i}`, a.modifier); set(`D${14 + i}`, a.target); });
      // Use actual anatomy pools, including non-humanoid names; never paste humanoid HP onto another anatomy.
      for (let i = 0; i < 6; i++) { const track = data.health.tracks[i]; set(`E${14 + i}`, track?.name ?? ""); set(`F${14 + i}`, track ? track.maximumHp : ""); set(`G${14 + i}`, track ? track.remainingHp : ""); }
      data.health.tracks.slice(6).forEach(track => extra("Additional health pools", `${track.name}: ${number(track.remainingHp)} / ${number(track.maximumHp)} HP`));
      const mana = data.mana.filter(pool => pool.maximumMana > 0 || pool.currentMana > 0);
      [13, 16].forEach((row, i) => { const pool = mana[i]; set(`H${row}`, pool?.system === "Talismanism" ? "Talisman" : pool?.system === "Bardic Resonance" ? "Bardic" : pool?.system ?? ""); set(`H${row + 1}`, pool?.maximumMana ?? ""); set(`H${row + 2}`, pool?.currentMana ?? ""); });
      mana.slice(2).forEach(pool => extra("Mana (max / left)", `${pool.system}: ${number(pool.maximumMana)} / ${number(pool.currentMana)}`));
      data.spreadsheet.weapons.forEach((item, i) => {
        const w = item.weapon, row = 21 + i;
        if (i >= 6) { extra("Weapons (continued)", `${item.name} ×${item.quantity}; ${item.type}; ${w?.range ?? "Range not recorded"}; target ${w?.target == null ? "not recorded" : `${w.target}%+`}; ${w?.damage ?? item.baseDamage}`); return; }
        const fields = { A: `${item.name}${item.quantity === 1 ? "" : ` ×${item.quantity}`}${w?.mode ? ` (${w.mode})` : ""}`, D: item.type, E: w?.range === "Range/reach not recorded" ? "—" : w?.range ?? "", G: number(item.durability), H: number(w?.target), I: item.baseDamage, J: item.damageSummary?.modifier ?? "—", K: item.damageSummary?.totalDamage ?? "—" };
        Object.entries(fields).forEach(([col, value]) => set(`${col}${row}`, value));
      });
      data.spreadsheet.armor.forEach((item, i) => {
        if (i >= 6) { extra("Armor (continued)", `${item.name} ×${item.quantity}; ${item.coverage}; ${item.properties}; soak ${number(item.soak)}`); return; }
        Object.entries({ A: `${item.name}${item.quantity === 1 ? "" : ` ×${item.quantity}`}`, D: item.coverage, F: item.properties, J: number(item.durability), K: number(item.soak) }).forEach(([col, value]) => set(`${col}${28 + i}`, value));
      });
      return page;
    }
    const layout = template.sheets.find(sheet => sheet.title === title)!;
    const system = ({ "Spellcraft Back": "Spellcraft", "Talisman Back": "Talismanism", "Faith Back": "Faith", "Psyonics Back": "Psyonics", "Bardic Resonance Back": "Bardic Resonance" } as Partial<Record<SpreadsheetSheet, CharacterMagicSystem>>)[title];
    if (title === "Special Abilities Back") {
      fillSkills(ordinary, slots(2, 21)); fillSkills(special, slots(23, 28), true); set("A29", inventory());
    } else if (title === "Skills Back") {
      fillSkills(ordinary, slots(2, 6));
      const sphereSystems: CharacterMagicSystem[] = ["Spellcraft", "Talismanism", "Faith"];
      for (let row = 8; row <= 23; row++) fixed(String(layout.cells[`A${row}` as keyof typeof layout.cells]?.[1] ?? ""), `A${row}`, sphereSystems);
      fillSkills(data.skills.filter(skill => !skill.special && skill.systems.some(s => sphereSystems.includes(s)) && !used.has(skill.id)), slots(8, 23, ["E"]));
      fillSkills(data.skills.filter(skill => !skill.special && skill.systems.includes("Psyonics") && skill.depth <= 1), slots(25, 29, ["A"]));
      fillSkills(data.skills.filter(skill => !skill.special && skill.systems.includes("Psyonics") && skill.depth > 1), slots(25, 29, ["E"]));
      for (let row = 31; row <= 36; row++) fixed(String(layout.cells[`A${row}` as keyof typeof layout.cells]?.[1] ?? ""), `A${row}`, ["Bardic Resonance"]);
      fillSkills(data.skills.filter(skill => !skill.special && skill.systems.includes("Bardic Resonance") && !used.has(skill.id)), slots(31, 36, ["E"]));
      fillSkills(special, slots(38, 39), true); set("A40", inventory());
    } else if (system) {
      for (const [address, cell] of Object.entries(layout.cells)) {
        if (!/^[AE]\d+$/.test(address)) continue;
        const row = Number(address.slice(1)), name = String(cell[1]);
        if ((row >= 2 && row <= 4) || (row >= 14 && row <= (system === "Bardic Resonance" ? 16 : system === "Psyonics" ? 15 : 21))) {
          if (name) fixed(name, address, [system]);
        }
      }
      fillSkills(ordinary, [...slots(5, 12, ["A"]), ...slots(2, 12, ["E"])]);
      const relevant = data.skills.filter(skill => !skill.special && skill.systems.includes(system) && !used.has(skill.id));
      // Psyonics has unnamed discipline slots; fill them with the named discipline.
      if (system === "Psyonics") {
        const disciplines = relevant.filter(skill => skill.depth <= 1);
        fillSkills(disciplines, slots(14, 15)); disciplines.forEach(skill => used.add(skill.id));
      }
      fillSkills(relevant.filter(skill => !used.has(skill.id)), slots(system === "Psyonics" ? 17 : system === "Bardic Resonance" ? 18 : 23, system === "Psyonics" || system === "Bardic Resonance" ? 38 : 37));
      set(system === "Psyonics" || system === "Bardic Resonance" ? "A39" : "A38", inventory());
      special.forEach(skill => extra("Special Abilities", skillText(skill)));
    }
    // Constructed powers without a skill allocation must not disappear from the spreadsheet output.
    data.spells.filter(spell => !special.some(skill => spell.key === `catalog:${skill.id}`) && (system ? spell.system === system : title === "Skills Back") && !data.skills.some(skill => spell.key === `catalog:${skill.id}`)).forEach(spell => extra("Personal powers", `${spell.name}${spell.target == null ? "" : ` ${spell.target}%`}; mana ${number(spell.manaCost)}`));
    const grantIds = new Set(special.map(skill => skill.skillId));
    data.specialAbilityMechanics?.abilities.filter(ability => !grantIds.has(ability.mechanics.source.id)).forEach(ability => extra("Granted Special Abilities", ability.mechanics.source.name));
    return page;
  });
}

export function spreadsheetCellPosition(address: string): [number, number] {
  const [, letters, row] = /^([A-Z]+)(\d+)$/.exec(address)!;
  const col = [...letters].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0);
  return [Number(row) - 1, col - 1];
}

export { template as spreadsheetCharacterTemplate };

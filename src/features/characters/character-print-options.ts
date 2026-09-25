import type { PaperCharacterData } from "./paper-character";
import type { CharacterMagicSystem } from "./character-rules";

export const PRINT_SYSTEMS = ["Spellcraft", "Talismanism", "Faith", "Psyonics", "Bardic Resonance"] as const satisfies readonly CharacterMagicSystem[];
export const PRINT_BACKS = ["General", ...PRINT_SYSTEMS] as const;
export type PrintBack = typeof PRINT_BACKS[number];
export const PRINT_BOOKS: Record<CharacterMagicSystem, string> = {
  Spellcraft: "Spell Book", Talismanism: "Talisman Book", Faith: "Prayer Book", Psyonics: "Psyonic Skill Book", "Bardic Resonance": "Song Book",
};
export const PRINT_THEMES = ["Universal", "Fantasy", "Modern", "Apocalyptic", "Western", "Science Fiction", "Horror", "Plain"] as const;
export type PrintTheme = typeof PRINT_THEMES[number];
export type PrintHeadings = "standard" | "genre";
export const PRINT_REFERENCES = { skills: "Full skill reference", specialAbilities: "Special Ability reference", derivedAbilities: "Derived Ability reference", inventory: "Inventory reference", equipment: "Equipment reference", story: "Story / profile" } as const;
export type PrintReference = keyof typeof PRINT_REFERENCES;
export type UnifiedPrintSelection = { front: boolean; backs: PrintBack[]; books: CharacterMagicSystem[]; references: PrintReference[] };
export type UnifiedPrintPreset = "quick" | "full" | "complete" | "custom" | "paper";
export const DEFAULT_PRINT_SELECTION: UnifiedPrintSelection = { front: true, backs: ["General"], books: [], references: [] };

export function ownedPrintSystems(data: PaperCharacterData): CharacterMagicSystem[] {
  return PRINT_SYSTEMS.filter(system => data.skills.some(skill => skill.systems.includes(system)) || data.spells.some(spell => spell.system === system));
}
export function printPresetSelection(preset: UnifiedPrintPreset, data: PaperCharacterData | null, custom: UnifiedPrintSelection): UnifiedPrintSelection {
  if (preset === "custom" || preset === "paper") return custom;
  if (preset === "quick" || !data) return DEFAULT_PRINT_SELECTION;
  const references: PrintReference[] = [];
  if (data.skills.some(skill => !skill.special)) references.push("skills");
  if (data.skills.some(skill => skill.special)) references.push("specialAbilities");
  if (data.abilities.length) references.push("derivedAbilities");
  if (data.inventory.length) references.push("inventory");
  if (data.gear.some(item => item.equipment)) references.push("equipment");
  if (preset === "complete" && data.story.length) references.push("story");
  return { front: true, backs: ["General"], books: ownedPrintSystems(data), references };
}
export function printSelectionLabels(selection: UnifiedPrintSelection): string[] {
  return [...(selection.front ? ["Standard front"] : []), ...selection.backs.map(back => `${back} back`), ...selection.books.map(system => `${PRINT_BOOKS[system]} — ${system}`), ...selection.references.map(ref => PRINT_REFERENCES[ref])];
}

/** Presentation only. Mechanical section titles and the record never change. */
export function printPresentationHeading(theme: PrintTheme, headings: PrintHeadings): string {
  if (headings === "standard") return "Character sheet";
  return { Universal: "Character record", Fantasy: "Adventurer’s record", Modern: "Character dossier", Apocalyptic: "Survivor’s record", Western: "Frontier record", "Science Fiction": "Character manifest", Horror: "Investigator’s record", Plain: "Character sheet" }[theme];
}

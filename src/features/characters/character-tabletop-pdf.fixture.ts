import type { PaperCharacterData } from "./paper-character";

export function tabletopPdfFixture(crowded = false): PaperCharacterData {
  const skill = (id: number, name: string, system: string | null = null, special = false) => ({
    id, skillId: id, name, points: id + 10, racialPoints: 0, rank: id, target: 70 - id % 50, depth: name.split(" → ").length - 1,
    parentId: null, special, hasRoll: !special, systems: system ? [system] : [], system, reference: `SK${id}`, definition: "", spellLevel: null, manaCost: null, spellDocumentJson: null,
  });
  return {
    characterId: 10, raceId: 1, name: "Adrián Vale", player: "revty79", campaign: "The Breaking", race: "Scholarly Human", recordedAt: "2026-11-01T18:00:00.000Z",
    tabletop: { profile: { age: 28, sex: "Male", heightFeet: 6, heightInches: 2, weight: 190, skinColor: "White", hairColor: "Blonde", eyeColor: "Blue", deity: "None", definingMarks: "Scar across his back from right shoulder to left hip." }, baseMagic: 3,
      weapons: [{ name: ".357 Revolver - Copy #1", quantity: 1, type: "Revolver", damageType: "Piercing", durability: 60, baseDamage: "4", weapon: { mode: "Single", target: 53, range: "Short 25; Medium 50; Long 100 feet", compactRange: "S/M/L 25/50/100 feet" }, damageSummary: { modifier: "DEX +2", totalDamage: "6" } }],
      armor: [{ name: "Armored Motorcycle Suit", quantity: 1, coverage: "Torso, both arms, both upper legs and both lower legs, including groin protection", properties: "Blunt +1; Slashing +1; Piercing -1", durability: 50, soak: 1 }], effects: [], protectionNotes: [],
    },
    totals: [{ name: "Fate", value: 4 }, { name: "Fame", value: 0 }, { name: "XP", value: 50 }, { name: "Total XP", value: 0 }, { name: "Quintessence", value: 0 }, { name: "Total Quintessence", value: 0 }],
    attributes: ["STR", "DEX", "CON", "INT", "WIS", "CHR"].map((key, index) => ({ key, score: [10, 35, 35, 55, 25, 15][index], modifier: [-3, 2, 2, 6, 0, -2][index], target: [90, 65, 65, 45, 75, 85][index] })),
    currency: [{ name: "Credits", quantity: 500 }], initiative: 8, movement: [{ name: "Land", base: 2, value: 16, notes: "" }],
    health: { total: { remainingHp: 72, maximumHp: 72 }, tracks: ["Head", "Right Arm", "Left Arm", "Right Leg", "Left Leg", "Torso"].map((name, i) => ({ name, remainingHp: [8, 11, 11, 11, 11, 22][i], maximumHp: [8, 11, 11, 11, 11, 22][i] })), anatomy: { kind: "humanoid", hitLocations: ["Head", "Right Arm", "Left Arm", "Right Lower Leg", "Right Upper Leg", "Left Lower Leg", "Left Upper Leg", "Groin", "Stomach", "Chest"].map((name, result) => ({ result, name })) } },
    mana: [{ system: "Spellcraft", maximumMana: 39, currentMana: 39 }], effects: [], protection: [], interactions: [],
    quickRolls: [skill(1, "Channeling"), skill(2, "Spellcraft → Time & Space → Blink Step", "Spellcraft"), skill(3, "Spellcraft → Divination → Echo of the Hunt", "Spellcraft"), skill(4, "Spellcraft → Life → Soothing Pulse", "Spellcraft")],
    skills: [...Array.from({ length: crowded ? 65 : 5 }, (_, i) => skill(i + 1, `Navigation → Route ${String(i + 1).padStart(2, "0")}`)), ...["Spellcraft", "Talismanism", "Faith", "Psyonics", "Bardic Resonance"].flatMap((system, i) => [skill(i * 3 + 101, system, system), skill(i * 3 + 102, `${system} → Fire`, system), skill(i * 3 + 103, `${system} → Fire → Named technique`, system)]), skill(150, "Beacon Sense", null, true)],
    inventory: [{ name: "Revolver", quantity: 1, status: "Ammunition state not initialized" }, { name: ".357 Cartridge", quantity: 100, status: "" }, { name: "Restorative Wand - Copy #1", quantity: 1, status: "2/5 charges" }, { name: "Restorative Wand - Copy #2", quantity: 1, status: "4/5 charges" }, { name: "Brass Compass", quantity: 1, status: "" }],
    abilities: [{ name: "Eidetic Memory" }], spells: [], gaps: [],
  } as unknown as PaperCharacterData;
}

/** Tools sort first in the saved inventory but must follow all five weapons. */
export function tabletopWeaponPdfFixture(): PaperCharacterData {
  const data = tabletopPdfFixture(true), revolver = data.tabletop.weapons[0];
  const item = (name: string, type: string, damageType: string) => ({ ...revolver, name, type, damageType, weapon: { ...revolver.weapon!, mode: "", range: "Reach 3 feet", compactRange: "Reach 3 feet" } });
  data.tabletop.weapons = [item("Binoculars", "Improvised / Tool", "Blunt"), item("Blank Journal", "Improvised / Tool", "Blunt"), revolver,
    item("Bowie Knife", "Knife / Blade", "Slashing / Piercing"), item("Longsword", "Sword", "Blunt / Slashing / Piercing"),
    item("Spear", "Polearm", "Piercing"), item("Hand Axe", "Axe", "Slashing"), item("Canteen", "Improvised / Tool", "Blunt")];
  return data;
}

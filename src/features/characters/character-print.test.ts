import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  EMPTY_CHARACTER_PRINT_SELECTION,
  getCharacterPrintAvailability,
  resolveCharacterPrintSelection,
  selectCharacterQuickRolls,
  type PrintableCharacterSkillRow,
} from "./character-print";

function skill(
  id: number,
  name: string,
  rank: number,
  target: number,
): PrintableCharacterSkillRow {
  return {
    id,
    skillId: id,
    name,
    depth: 0,
    points: 1,
    racialPoints: 0,
    rank,
    target,
    system: null,
    special: false,
    definition: "",
    spellLevel: null,
    manaCost: null,
    spellDocumentJson: null,
  };
}

const allAvailable = getCharacterPrintAvailability({
  skillCount: 8,
  spellCount: 2,
  supernaturalAbilityCount: 1,
  specialAbilityCount: 1,
  inventoryCount: 5,
  equipmentCount: 2,
  hasStory: true,
});

test("Quick Reference preset prints only the deliberate two-page quick product", () => {
  assert.deepEqual(
    resolveCharacterPrintSelection(
      "quick",
      EMPTY_CHARACTER_PRINT_SELECTION,
      allAvailable,
    ),
    { ...EMPTY_CHARACTER_PRINT_SELECTION, quick: true },
  );
});

test("Full Tabletop and Complete Record presets add only available supplemental sections", () => {
  assert.deepEqual(
    resolveCharacterPrintSelection(
      "full",
      EMPTY_CHARACTER_PRINT_SELECTION,
      allAvailable,
    ),
    {
      quick: true,
      skills: true,
      powers: true,
      specialAbilities: true,
      inventory: true,
      equipment: true,
      story: false,
    },
  );
  assert.deepEqual(
    resolveCharacterPrintSelection(
      "complete",
      EMPTY_CHARACTER_PRINT_SELECTION,
      allAvailable,
    ),
    {
      quick: true,
      skills: true,
      powers: true,
      specialAbilities: true,
      inventory: true,
      equipment: true,
      story: true,
    },
  );
});

test("Custom Print honors local choices and suppresses unavailable sections", () => {
  const mundaneAvailability = getCharacterPrintAvailability({
    skillCount: 4,
    spellCount: 0,
    supernaturalAbilityCount: 0,
    specialAbilityCount: 0,
    inventoryCount: 2,
    equipmentCount: 1,
    hasStory: false,
  });
  assert.equal(mundaneAvailability.hasPowers, false);

  assert.deepEqual(
    resolveCharacterPrintSelection(
      "custom",
      {
        quick: false,
        skills: true,
        powers: true,
        specialAbilities: true,
        inventory: true,
        equipment: false,
        story: true,
      },
      mundaneAvailability,
    ),
    {
      quick: false,
      skills: true,
      powers: false,
      specialAbilities: false,
      inventory: true,
      equipment: false,
      story: false,
    },
  );
});

test("supernatural print sections appear when the Character has actual content", () => {
  const supernatural = getCharacterPrintAvailability({
    skillCount: 1,
    spellCount: 1,
    supernaturalAbilityCount: 0,
    specialAbilityCount: 0,
    inventoryCount: 0,
    equipmentCount: 0,
    hasStory: false,
  });

  assert.equal(
    resolveCharacterPrintSelection(
      "full",
      EMPTY_CHARACTER_PRINT_SELECTION,
      supernatural,
    ).powers,
    true,
  );
});

test("Quick Roll selection is deterministic by Rank, lower target, then name", () => {
  const rows = [
    skill(1, "Zoology", 3, 45),
    skill(2, "Archery", 4, 50),
    skill(3, "Athletics", 4, 40),
    skill(4, "Alchemy", 4, 40),
    skill(5, "Navigation", 2, 20),
  ];

  assert.deepEqual(
    selectCharacterQuickRolls(rows, 4).map(({ name }) => name),
    ["Alchemy", "Athletics", "Archery", "Zoology"],
  );
  assert.deepEqual(selectCharacterQuickRolls(rows, 0), []);
});

test("Character Creation keeps every Attribute result in its card and removes the generic strip", () => {
  const editor = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/character-editor.tsx"),
    "utf8",
  );
  assert.match(editor, /getCharacterAttributeCardDetails/);
  assert.match(editor, /details\.movements\.map/);
  assert.match(editor, /Base \{displayNumber\(movement\.baseMovement\)\}/);
  assert.match(editor, /Initiative \{displayNumber\(movement\.initiative\)\}/);
  assert.doesNotMatch(editor, /character-derived-strip/);
});

test("dedicated print markup replaces browser-print styling of the dark web sheet", () => {
  const sheet = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/character-sheet.tsx"),
    "utf8",
  );
  const printable = readFileSync(
    path.resolve(
      process.cwd(),
      "src/app/characters/printable-character-sheet.tsx",
    ),
    "utf8",
  );
  const printCss = readFileSync(
    path.resolve(
      process.cwd(),
      "src/app/characters/printable-character-sheet.css",
    ),
    "utf8",
  );

  assert.match(sheet, /CharacterPrintCenter/);
  assert.match(printable, /print-page--quick-one/);
  assert.match(printable, /print-page--quick-two/);
  assert.match(printable, /function BodyShotBob/);
  assert.match(printable, /CharacterHitLocationSilhouette/);
  const bodyShotBob = printable.slice(
    printable.indexOf("function BodyShotBob"),
    printable.indexOf("function MovementReference"),
  );
  assert.doesNotMatch(bodyShotBob, /Total HP|getCharacterHp/);
  assert.match(printable, /function SupplementalFlow/);
  assert.doesNotMatch(printable, /print-page--supplemental/);
  assert.match(printCss, /\.printable-character-sheet\s*\{\s*display: none/);
  assert.match(
    printCss,
    /@media print[\s\S]*\.character-sheet,[\s\S]*display: none !important/,
  );
  assert.match(
    printCss,
    /@media print[\s\S]*\.printable-character-sheet\s*\{[\s\S]*display: block !important/,
  );
  assert.match(
    printCss,
    /\.print-page--quick-one\s*\{[\s\S]*break-after: page/,
  );
  assert.match(
    printCss,
    /\.print-supplemental-flow--after-quick\s*\{[\s\S]*break-before: page/,
  );
  assert.doesNotMatch(printCss, /\.print-page--supplemental/);
});

test("print CSS removes authenticated website chrome without reserving print space", () => {
  const navigation = readFileSync(
    path.resolve(process.cwd(), "src/app/authenticated-navigation.tsx"),
    "utf8",
  );
  const printCss = readFileSync(
    path.resolve(
      process.cwd(),
      "src/app/characters/printable-character-sheet.css",
    ),
    "utf8",
  );

  assert.match(navigation, /authenticated-navigation/);
  assert.match(
    printCss,
    /@media print[\s\S]*\.authenticated-navigation,[\s\S]*display: none !important/,
  );
});

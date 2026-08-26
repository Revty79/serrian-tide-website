import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(testDirectory, "../..");

function source(relativePath: string) {
  return readFileSync(resolve(sourceRoot, relativePath), "utf8");
}

test("G.O.D. Spell Construction remains context-neutral", () => {
  const editor = source("app/heavens/skills/spell-construction-editor.tsx");

  assert.match(editor, /Construction Identity/);
  assert.match(editor, /Base Construction/);
  assert.match(editor, /Progressive Spell/);
  assert.doesNotMatch(editor, /Practitioner &amp; Raw Casting/);
  assert.doesNotMatch(editor, /Raw Casting Circumstance/);
  assert.doesNotMatch(editor, /Practitioner Rank/);
});

test("Realms Magic Calculator owns player casting and saved-formula controls", () => {
  const calculator = source(
    "app/realms/characters/[characterId]/magic/magic-workspace.tsx",
  );

  for (const expected of [
    "Magic Calculator",
    "Search Saved Spells",
    "Save &amp; Add to Spellbook",
    "Remove from Spellbook",
    "Duplicate",
    "SpellCastingPanel",
    "Unsaved changes",
    "beforeunload",
  ]) {
    assert.match(calculator, new RegExp(expected));
  }
});

test("Realms Spellbook contains known catalog and in-book personal Spells", () => {
  const spellbook = source(
    "app/realms/characters/[characterId]/spellbook/spellbook-workspace.tsx",
  );

  assert.match(spellbook, /Known Catalog Spell/);
  assert.match(spellbook, /\.filter\(\(\{ inSpellbook \}\) => inSpellbook\)/);
  assert.match(spellbook, /automaticKnownSpell/);
  assert.match(spellbook, /SpellPreview/);
  assert.doesNotMatch(spellbook, /Show personal drafts too/);
  assert.doesNotMatch(spellbook, /Personal Draft/);
});

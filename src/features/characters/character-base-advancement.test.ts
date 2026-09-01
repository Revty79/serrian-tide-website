import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

test("the forward migration adds nonnegative Character-owned Base Movement and Base Magic steps", () => {
  const migration = source("drizzle/0001_runtime_foundation.sql");
  assert.match(migration, /ADD COLUMN "base_movement_steps" integer DEFAULT 0 NOT NULL/);
  assert.match(migration, /ADD COLUMN "base_magic_steps" integer DEFAULT 0 NOT NULL/);
  assert.match(migration, /"base_movement_steps" >= 0/);
  assert.match(migration, /"base_magic_steps" >= 0/);
  assert.equal(migration.includes("ALTER TABLE \"races\""), false);
});

test("the server locks, advances, and saves both permanent step counters in one transaction", () => {
  const actions = source("src/app/characters/actions.ts");
  const start = actions.indexOf("export async function spendCharacterQuintessence(");
  const end = actions.indexOf("function revalidateCharacterAdvancementPaths(", start);
  const action = actions.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(action, /await db\.transaction\(async \(tx\) =>/);
  assert.match(action, /baseMovementSteps: campaignCharacterProfile\.baseMovementSteps/);
  assert.match(action, /baseMagicSteps: campaignCharacterProfile\.baseMagicSteps/);
  assert.match(action, /getBaseMovementStepsAfterPurchase\(profile\.baseMovementSteps, quantity\)/);
  assert.match(action, /getBaseMagicStepsAfterPurchase\(profile\.baseMagicSteps, quantity\)/);
  assert.match(action, /baseMovementSteps,/);
  assert.match(action, /baseMagicSteps,/);
  assert.equal(action.includes(".update(race)"), false);
});

test("editor, sheet, print, mana, and spell access consumers use effective Character values", () => {
  const editor = source("src/app/characters/character-editor.tsx");
  const sheet = source("src/app/characters/character-sheet.tsx");
  const printable = source("src/app/characters/printable-character-sheet.tsx");
  const rules = source("src/features/characters/character-rules.ts");
  const casting = source("src/features/characters/character-spell-casting.ts");

  assert.match(editor, /getCharacterMovementBaseValue\(mode\.baseValue, profile\.baseMovementSteps\)/);
  assert.match(editor, /getCharacterBaseMagic\(race\.baseMagic, profile\.baseMagicSteps\)/);
  assert.match(sheet, /getCharacterMovementBaseValue\([\s\S]*?draft\.profile\.baseMovementSteps/);
  assert.match(sheet, /getCharacterBaseMagic\([\s\S]*?draft\.profile\.baseMagicSteps/);
  assert.match(printable, /draft\.profile\.baseMovementSteps/);
  assert.match(printable, /draft\.profile\.baseMagicSteps/);
  assert.match(rules, /const manaPool = sourceSkillPoints \* baseMagic/);
  assert.match(casting, /aggregate\.profile\.baseMagicSteps/);
});

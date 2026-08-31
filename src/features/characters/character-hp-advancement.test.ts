import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getCharacterHp,
  getCharacterHpBreakdown,
  getCharacterHpMultiplier,
} from "./character-rules";

test("HP keeps the ×2 base and applies quarter-step multiplier advancement", () => {
  assert.equal(getCharacterHpMultiplier(), 2);
  assert.equal(getCharacterHpMultiplier(undefined), 2);
  assert.equal(getCharacterHpMultiplier(null), 2);
  assert.equal(getCharacterHp(40), 83);
  assert.equal(getCharacterHp(40, 0), 83);
  assert.equal(getCharacterHp(40, 1), 93);
  assert.equal(getCharacterHp(40, 2), 103);
  assert.equal(getCharacterHp(40, 4), 123);
});

test("the Constitution modifier is added after multiplication", () => {
  assert.equal(getCharacterHpMultiplier(1), 2.25);
  assert.equal(getCharacterHp(40, 1), 40 * 2.25 + 3);
  assert.notEqual(getCharacterHp(40, 1), (40 + 3) * 2.25);
});

test("Total HP rounds the completed formula up to the next whole number", () => {
  assert.equal(getCharacterHp(25, 1), 57);
  assert.equal(getCharacterHp(31, 1), 71);
});

test("valid HP multiplier step counts have no artificial maximum", () => {
  assert.equal(getCharacterHpMultiplier(1_000_000), 250_002);
  assert.equal(getCharacterHp(40, 1_000_000), 10_000_083);
  assert.throws(() => getCharacterHpMultiplier(-1), /whole number zero or greater/);
  assert.throws(() => getCharacterHpMultiplier(1.5), /whole number zero or greater/);
});

test("location HP pools retain existing percentages and rounding for enhanced HP", () => {
  const breakdown = getCharacterHpBreakdown(getCharacterHp(40, 2));
  assert.equal(breakdown.totalHp, 103);
  assert.deepEqual(
    Object.fromEntries(breakdown.pools.map(({ key, hp }) => [key, hp])),
    {
      head: 11,
      rightArm: 16,
      leftArm: 16,
      rightLeg: 16,
      leftLeg: 16,
      torso: 31,
    },
  );
});

test("the consolidated baseline defaults Character HP multiplier steps to zero", () => {
  const migration = readFileSync(
    path.resolve(process.cwd(), "drizzle/0000_serrian_tide_baseline.sql"),
    "utf8",
  );
  assert.match(
    migration,
    /"hp_multiplier_steps" integer DEFAULT 0 NOT NULL/,
  );
  assert.match(
    migration,
    /CHECK \("campaign_character_profile"\."hp_multiplier_steps" >= 0\)/,
  );
  assert.equal(
    (migration.match(/"hp_multiplier_steps" integer DEFAULT 0 NOT NULL/g) ?? [])
      .length,
    1,
  );
});

test("HP multiplier advancement is updated atomically and survives aggregate reload", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/actions.ts"),
    "utf8",
  );
  const start = source.indexOf("export async function spendCharacterQuintessence(");
  const end = source.indexOf("function revalidateCharacterAdvancementPaths(", start);
  const action = source.slice(start, end);
  const rules = readFileSync(
    path.resolve(process.cwd(), "src/features/characters/character-rules.ts"),
    "utf8",
  );

  assert.ok(start >= 0 && end > start, "Quintessence transaction was not found");
  assert.match(action, /await db\.transaction\(async \(tx\) =>/);
  assert.match(action, /hpMultiplierSteps: campaignCharacterProfile\.hpMultiplierSteps/);
  assert.match(action, /getHpMultiplierStepsAfterPurchase\(profile\.hpMultiplierSteps, quantity\)/);
  assert.match(action, /hpMultiplierSteps,/);
  assert.match(source, /hpMultiplierSteps: profileRow\.hpMultiplierSteps \?\? 0/);
  assert.match(rules, /hpMultiplierSteps: aggregate\.profile\.hpMultiplierSteps \?\? 0/);
});

test("the server keeps permanent Quintessence advancement player-owned and rejects arbitrary save changes", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/actions.ts"),
    "utf8",
  );
  const start = source.indexOf("export async function spendCharacterQuintessence(");
  const end = source.indexOf("function revalidateCharacterAdvancementPaths(", start);
  const action = source.slice(start, end);

  assert.match(action, /characterContext\.playerUserId !== session\.user\.id/);
  assert.match(action, /characterContext\.membershipUserId !== session\.user\.id/);
  assert.match(action, /A Player may only spend Quintessence for their own Character/);
  assert.match(action, /Purchase quantity must be a positive whole number/);
  assert.match(action, /\["attribute", "fatePoints", "experience", "hpMultiplier", "baseMovement", "baseMagic"\]/);
  assert.match(
    source,
    /hpMultiplierSteps: godMode[\s\S]*?: aggregate\.profile\.hpMultiplierSteps/,
  );
});

test("player, printable, advancement, and G.O.D. views use the persisted HP steps", () => {
  const sheet = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/character-sheet.tsx"),
    "utf8",
  );
  const printable = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/printable-character-sheet.tsx"),
    "utf8",
  );
  const advancement = readFileSync(
    path.resolve(
      process.cwd(),
      "src/app/realms/characters/[characterId]/advance/advance-workspace.tsx",
    ),
    "utf8",
  );
  const editor = readFileSync(
    path.resolve(process.cwd(), "src/app/characters/character-editor.tsx"),
    "utf8",
  );

  for (const source of [sheet, printable]) {
    assert.match(source, /getCharacterHp\([\s\S]*?draft\.profile\.hpMultiplierSteps/);
    assert.match(source, /HP Multiplier/);
  }
  assert.match(advancement, /Increase HP Multiplier/);
  assert.match(advancement, /HP_MULTIPLIER_QUINTESSENCE_COST/);
  assert.match(advancement, /maximumHpMultiplierQuantity/);
  assert.match(advancement, /Current HP/);
  assert.match(advancement, /resultingHp/);
  assert.match(editor, /\["hpMultiplierSteps", "HP Multiplier Steps"\]/);
  assert.match(editor, /Effective HP Multiplier/);
});

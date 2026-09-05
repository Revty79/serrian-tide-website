import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("src/db/realm-schema.ts", "utf8");
const service = readFileSync("src/features/active-state/active-mana-service.ts", "utf8");
const characterActions = readFileSync("src/app/characters/actions.ts", "utf8");
const characterEditor = readFileSync("src/app/characters/character-editor.tsx", "utf8");
const characterSheet = readFileSync("src/app/characters/character-sheet.tsx", "utf8");
const playerCharacterPage = readFileSync("src/app/realms/characters/[characterId]/page.tsx", "utf8");
const godCharacterPage = readFileSync("src/app/heavens/characters/[characterId]/page.tsx", "utf8");
const creatureWorkspace = readFileSync("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx", "utf8");
const spellPanel = readFileSync("src/app/characters/spell-casting-panel.tsx", "utf8");
const mechanicalModels = readFileSync("src/features/mechanical-effects/models.ts", "utf8");
const baselineMigration = readFileSync("drizzle/0000_serrian_tide_baseline.sql", "utf8");
const migration = readFileSync("drizzle/0001_runtime_foundation.sql", "utf8");

test("Active Mana schema persists only mutable spent state under Character plus system identity", () => {
  const start = schema.indexOf("export const campaignCharacterActiveMana");
  const end = schema.indexOf("export const campaignCharacterActiveHealthPool", start);
  const table = schema.slice(start, end);
  assert.match(table, /"campaign_character_active_mana"/);
  assert.match(table, /characterId: integer\("character_id"\)/);
  assert.match(table, /references\(\(\) => campaignCharacter\.id, \{ onDelete: "cascade" \}\)/);
  assert.match(table, /system: text\("system"\)\.notNull\(\)/);
  assert.match(table, /manaSpent: doublePrecision\("mana_spent"\)\.default\(0\)\.notNull\(\)/);
  assert.match(table, /primaryKey\(\{ columns: \[table\.characterId, table\.system\] \}\)/);
  assert.match(table, /campaign_character_active_mana_spent_valid/);
  assert.doesNotMatch(table, /currentMana|maximumMana|sourceSkillName|sourceSkillPoints|baseMagic|spellAccessLevel/);
  assert.match(table, /'Psyonics'/);
});

test("the sacred baseline is unchanged while the consolidated Runtime Foundation migration adds Active Mana", () => {
  assert.doesNotMatch(baselineMigration, /campaign_character_active_mana/);
  assert.match(migration, /campaign_character_active_mana/);
});

test("service derives Maximum through canonical Character Mana profiles", () => {
  assert.match(service, /getCharacterManaProfiles\(/);
  assert.doesNotMatch(service, /sourceSkillPoints \* baseMagic/);
  assert.match(service, /resolveActiveManaView\(/);
});

test("missing-row initialization and row locking protect the first mutation", () => {
  assert.match(service, /insert\(campaignCharacterActiveMana\)[\s\S]*?onConflictDoNothing/);
  assert.match(service, /target: \[campaignCharacterActiveMana\.characterId, campaignCharacterActiveMana\.system\]/);
  assert.match(service, /\.for\("update"\)/);
});

test("transaction-aware mutations are exported below the authorized public transaction boundary", () => {
  assert.match(service, /export async function readActiveManaInTransaction/);
  assert.match(service, /export async function spendActiveManaInTransaction/);
  assert.match(service, /export async function restoreActiveManaInTransaction/);
  assert.match(service, /export async function restoreActiveManaPoolInTransaction/);
  assert.match(service, /export async function restoreAllActiveManaInTransaction/);
  assert.match(service, /return db\.transaction\(async \(tx\) =>/);
});

test("the public Active Mana getter uses read authorization while every public mutation uses live authorization", () => {
  assert.match(service, /getActiveMana[\s\S]*withAuthorizedManaReadTransaction/);
  assert.match(service, /spendCharacterMana[\s\S]*withAuthorizedManaMutationTransaction/);
  assert.match(service, /restoreCharacterMana[\s\S]*withAuthorizedManaMutationTransaction/);
  assert.match(service, /restoreCharacterManaPool[\s\S]*withAuthorizedManaMutationTransaction/);
  assert.match(service, /restoreAllCharacterMana[\s\S]*withAuthorizedManaMutationTransaction/);
});

test("normal Character persistence never resets Active Mana", () => {
  assert.doesNotMatch(characterActions, /campaignCharacterActiveMana/);
});

test("Player and GOD Character Sheets expose runtime Mana without adding it to Creature NPCs", () => {
  assert.match(characterSheet, /<ActiveManaPanel/);
  assert.match(characterSheet, /currentMana/);
  assert.match(characterSheet, /maximumMana/);
  assert.match(characterSheet, /manaSpent/);
  assert.match(characterEditor, /getActiveMana/);
  assert.match(characterEditor, /setActiveMana/);
  assert.match(playerCharacterPage, /getActiveMana/);
  assert.match(godCharacterPage, /getActiveMana/);
  assert.doesNotMatch(creatureWorkspace, /ActiveManaPanel|getActiveMana/);
});

test("Step 5 does not spend Mana from Spell casting or expand Mechanical Effects", () => {
  assert.doesNotMatch(spellPanel, /spendManaAction|spendCharacterMana|spendActiveManaInTransaction/);
  assert.doesNotMatch(mechanicalModels, /mana\.restore|mana\.spend|resource\.modify/);
});

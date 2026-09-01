import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("src/db/realm-schema.ts", "utf8");
const service = readFileSync("src/features/active-state/active-health-service.ts", "utf8");
const creatureNpcActions = readFileSync("src/app/heavens/npcs/actions.ts", "utf8");
const characterSheet = readFileSync("src/app/characters/character-sheet.tsx", "utf8");
const creatureWorkspace = readFileSync("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx", "utf8");
const migration = readFileSync("drizzle/0001_runtime_foundation.sql", "utf8");

test("Active Health schema anchors all persistent state to campaignCharacter", () => {
  assert.match(schema, /campaign_character_active_health/);
  assert.match(schema, /campaign_character_active_health_pool/);
  assert.match(schema, /campaign_character_injury/);
  assert.match(schema, /name: "campaign_character_active_health_character_fk"/);
  assert.match(schema, /foreignColumns: \[campaignCharacter\.id\]/);
  assert.match(schema, /totalDamage: doublePrecision\("total_damage"\)/);
  assert.match(schema, /damage: doublePrecision\("damage"\)/);
  assert.match(schema, /campaign_character_injury_resolution_valid/);
});

test("the consolidated forward migration includes prior Base advancement and Active Health", () => {
  assert.match(migration, /ADD COLUMN "base_movement_steps"/);
  assert.match(migration, /ADD COLUMN "base_magic_steps"/);
  assert.match(migration, /CREATE TABLE "campaign_character_active_health"/);
  assert.match(migration, /CREATE TABLE "campaign_character_active_health_pool"/);
  assert.match(migration, /CREATE TABLE "campaign_character_injury"/);
});

test("health mutations lock the entity and use atomic arithmetic", () => {
  assert.match(service, /\.for\("update", \{ of: campaignCharacter \}\)/);
  assert.match(service, /totalDamage: sql`\$\{campaignCharacterActiveHealth\.totalDamage\} \+ \$\{target\.amount\}`/);
  assert.match(service, /damage: sql`\$\{campaignCharacterActiveHealthPool\.damage\} \+ \$\{target\.amount\}`/);
  assert.match(service, /greatest\(0, \$\{campaignCharacterActiveHealth\.totalDamage\} - \$\{amount\}\)/);
  assert.match(service, /context\.tx\.insert\(campaignCharacterInjury\)/);
});

test("Creature anatomy edits cannot silently remove referenced active Pools", () => {
  assert.match(creatureNpcActions, /removedPoolKeys/);
  assert.match(creatureNpcActions, /campaignCharacterActiveHealthPool\.damage/);
  assert.match(creatureNpcActions, /campaignCharacterInjury\.resolved/);
  assert.match(creatureNpcActions, /cannot be removed or assigned a new HP Pool ID/);
});

test("the shared Current State panel is mounted in Character and Creature entity workspaces", () => {
  assert.match(characterSheet, /<ActiveHealthPanel/);
  assert.match(creatureWorkspace, /id: "current", label: "Current State"/);
  assert.match(creatureWorkspace, /<ActiveHealthPanel/);
});

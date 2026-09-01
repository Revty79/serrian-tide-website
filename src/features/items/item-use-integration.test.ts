import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("src/app/characters/item-use-actions.ts", "utf8");
const charges = readFileSync("src/features/items/item-charge-service.ts", "utf8");
const health = readFileSync("src/features/active-state/active-health-service.ts", "utf8");
const characterSheet = readFileSync("src/app/characters/character-sheet.tsx", "utf8");
const creatureWorkspace = readFileSync("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx", "utf8");

test("Item Use owns one transaction and reloads authoritative inputs inside it", () => {
  assert.match(actions, /executeItemUseInTransaction\(\(execute\) => db\.transaction/);
  assert.match(actions, /loadUse\(tx, request, session\.user\.id, true\)/);
  assert.match(actions, /loadDefinition\(tx,/);
  assert.match(actions, /loadResource\(tx,/);
  assert.match(actions, /readActiveHealthInTransaction\(/);
  assert.match(actions, /persistPlannedMechanicalEffectInTransaction\(/);
});

test("stack and instance resources are locked, reread, and zero stacks are deleted", () => {
  assert.ok((actions.match(/\.for\("update"\)/g) ?? []).length >= 1);
  assert.match(actions, /readItemChargeStateInTransaction/);
  assert.match(charges, /\.for\("update"/);
  assert.match(actions, /delete\(campaignCharacterItem\)/);
  assert.match(actions, /spendItemChargesInTransaction/);
  assert.doesNotMatch(actions, /\.set\(\{\s*currentCharges: resource\.after/);
  assert.match(actions, /if \(resource\.useMode === "unlimited"\) return/);
});

test("Active Health exposes typed caller-owned transaction operations", () => {
  assert.match(health, /export type ActiveHealthTransaction = Parameters/);
  assert.match(health, /export async function readActiveHealthInTransaction/);
  assert.match(health, /export async function persistActiveHealthStateInTransaction/);
  assert.doesNotMatch(actions, /campaignCharacterActiveHealth/);
});

test("the same Item Use dialog is mounted for Character and Creature NPC inventory", () => {
  assert.match(characterSheet, /<ItemUseDialog/);
  assert.match(creatureWorkspace, /<ItemUseDialog/);
  assert.match(characterSheet, /getItemUseActivatability/);
  assert.match(creatureWorkspace, /getItemUseActivatability/);
});

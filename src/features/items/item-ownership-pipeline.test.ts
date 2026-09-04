import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function source(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("Drizzle schema defines stable per-copy ownership without duplicating template runtime data", () => {
  const schema = source("src/db/realm-schema.ts");
  const tableStart = schema.indexOf("export const campaignCharacterItemInstance = pgTable(");
  const tableEnd = schema.indexOf("export const campaignCharacterSpellDocument", tableStart);
  assert.ok(tableStart >= 0 && tableEnd > tableStart);
  const table = schema.slice(tableStart, tableEnd);

  for (const field of ["id: serial", "characterId: integer", "itemId: integer", "currentCharges: integer", "unitCostCredits: doublePrecision", "acquiredAt: timestamp", "createdAt: timestamp", "updatedAt: timestamp"]) {
    assert.match(table, new RegExp(field));
  }
  assert.match(table, /campaignCharacter\.id, \{ onDelete: "cascade" \}/);
  assert.match(table, /item\.id, \{ onDelete: "restrict" \}/);
  assert.match(table, /currentCharges\} >= 0/);
  assert.match(table, /unitCostCredits\} >= 0/);
  for (const forbiddenTemplateField of ["maximumCharges:", "chargesPerUse:", "useMode:", "isMagical:", "effectJson:"]) {
    assert.doesNotMatch(table, new RegExp(forbiddenTemplateField));
  }
});

test("Character aggregate and draft keep stacks and instances as separate typed collections", () => {
  const models = source("src/features/characters/models.ts");
  const rules = source("src/features/characters/character-rules.ts");
  assert.match(models, /export type CharacterOwnedItemInstance/);
  assert.match(models, /items: CharacterOwnedItem\[\];\s+itemInstances: CharacterOwnedItemInstance\[\];/);
  assert.match(models, /itemInstances: DraftOwnedItemInstance\[\];/);
  assert.match(rules, /itemInstances: aggregate\.itemInstances\.map/);
  assert.match(rules, /getOwnedItemPurchaseCost/);
});

test("Character save routes charged and firearm copies to exact inserts and removes only selected stable IDs", () => {
  const actions = source("src/app/characters/actions.ts");
  assert.match(actions, /assertItemOwnershipStrategy\(authorized\.runtimeProfile, "stack"/);
  assert.match(actions, /assertItemOwnershipStrategy\(authorized\.runtimeProfile, "instance"/);
  assert.match(actions, /currentCharges: getStartingItemInstanceCharges\(\s*authorized\.runtimeProfile,\s*authorized\.isFirearm === true/);
  assert.match(actions, /requiresExactInstance: authorized\.isFirearm === true/);
  assert.match(actions, /planOwnedItemInstancePersistence\(\{/);
  assert.match(actions, /existingInstanceIds: aggregate\.itemInstances\.map/);
  assert.match(actions, /inArray\(campaignCharacterItemInstance\.id, removedInstanceIds\)/);
  assert.doesNotMatch(actions, /delete\(campaignCharacterItemInstance\)\.where\(eq\(campaignCharacterItemInstance\.characterId/);
});

test("Creature NPCs share campaignCharacter instance ownership and preserve current charge state", () => {
  const actions = source("src/app/heavens/npcs/actions.ts");
  const workspace = source("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx");
  assert.match(actions, /campaignCharacterItemInstance/);
  assert.match(actions, /existing\.currentCharges !== entry\.currentCharges/);
  assert.match(actions, /getStartingItemInstanceCharges\(source\.runtimeProfile, source\.isFirearm\)/);
  assert.match(actions, /requiresExactInstance: source\.isFirearm/);
  assert.match(actions, /existingInstanceIds: current\.itemInstances\.flatMap/);
  assert.match(workspace, /Remove this copy/);
  assert.match(workspace, /getItemChargeDisplay/);
});

test("ownership UI remains read-only for charges and exposes no Item execution action", () => {
  const characterEditor = source("src/app/characters/character-editor.tsx");
  const characterSheet = source("src/app/characters/character-sheet.tsx");
  const creatureWorkspace = source("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx");
  const combined = `${characterEditor}\n${characterSheet}\n${creatureWorkspace}`;
  assert.doesNotMatch(combined, /Use Item/);
  assert.doesNotMatch(combined, /Spend Charge/);
  assert.doesNotMatch(combined, /Restore Charge/);
  assert.match(characterSheet, /Each copy keeps its own identity and charge state/);
});

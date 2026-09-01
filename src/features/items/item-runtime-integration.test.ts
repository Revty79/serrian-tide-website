import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Drizzle schema persists magical classification, runtime profiles, and ordered versioned effects", () => {
  const schema = source("src/db/item-schema.ts");
  assert.match(schema, /isMagical: boolean\("is_magical"\)\.default\(false\)\.notNull\(\)/);
  assert.match(schema, /export const itemRuntimeProfile = pgTable\(/);
  assert.match(schema, /"item_runtime_profiles"/);
  assert.match(schema, /export const itemEffect = pgTable\(/);
  assert.match(schema, /schemaVersion: integer\("schema_version"\)\.notNull\(\)/);
  assert.match(schema, /effectJson: jsonb\("effect_json"\)\.notNull\(\)/);
  assert.match(schema, /uniqueIndex\("item_effects_order_uq"\)/);
});

test("Item read/save and variant-copy pipelines include one atomic runtime definition", () => {
  const actions = source("src/app/heavens/items/actions.ts");
  assert.match(actions, /decodeItemEffects\(effectRows\)/);
  assert.match(actions, /validateItemRuntimeDefinition/);
  assert.match(actions, /await db\.transaction\(async \(tx\) =>/);
  assert.match(actions, /await tx\.insert\(itemRuntimeProfile\)/);
  assert.match(actions, /await tx\.insert\(itemEffect\)/);
  assert.match(actions, /copyItemRuntimeDefinition\(parent\)/);

  for (const existingChild of [
    "itemProperty",
    "weaponProfile",
    "armorProfile",
    "itemArmorDamageModifier",
    "armorLocation",
    "itemTagLink",
  ]) {
    assert.match(actions, new RegExp(`tx\\.(?:insert|delete)\\(${existingChild}\\)`));
  }
});

test("Item editor exposes Effects to both catalogs without adding Item execution", () => {
  const workspace = source("src/app/heavens/items/item-workspace.tsx");
  assert.match(workspace, /\{ id: "effects", label: "Effects" \}/);
  assert.match(workspace, /Magical Item/);
  assert.match(workspace, /Maximum Charges/);
  assert.match(workspace, /Quantity Consumed Per Use/);
  assert.match(workspace, /Manual \/ G\.O\.D\. Resolution/);
  assert.equal(workspace.includes('scope === "inventory" && tab.id === "effects"'), false);
  assert.equal(workspace.includes("Use Item"), false);
});

test("existing stack ownership remains quantity-based while instance state stays separate", () => {
  const realmSchema = source("src/db/realm-schema.ts");
  const start = realmSchema.indexOf("export const campaignCharacterItem = pgTable");
  const ownership = realmSchema.slice(start, realmSchema.indexOf("export const", start + 20));
  assert.match(ownership, /characterId:/);
  assert.match(ownership, /itemId:/);
  assert.match(ownership, /quantity:/);
  assert.doesNotMatch(ownership, /charge|instance|equipped|durability/i);

  const creatureActions = source("src/app/heavens/npcs/actions.ts");
  assert.match(creatureActions, /items: Array<\{ itemId: number; quantity: number; unitCostCredits: number \}>/);
  assert.match(creatureActions, /itemInstances: Array<DraftOwnedItemInstance/);
});

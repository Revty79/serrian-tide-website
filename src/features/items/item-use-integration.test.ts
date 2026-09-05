import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("src/app/characters/item-use-actions.ts", "utf8");
const charges = readFileSync("src/features/items/item-charge-service.ts", "utf8");
const health = readFileSync("src/features/active-state/active-health-service.ts", "utf8");
const itemRoot = readFileSync("src/features/items/active-item-root-service.ts", "utf8");
const equipmentState = readFileSync("src/features/items/equipment-state-service.ts", "utf8");
const runtimeIntegration = readFileSync(
  "src/features/tabletop-operations/runtime-integration-service.ts",
  "utf8",
);
const actionSourceResolver = readFileSync(
  "src/features/tabletop-operations/action-source-resolver-service.ts",
  "utf8",
);
const defenseIntervention = readFileSync(
  "src/features/tabletop-operations/defense-intervention-service.ts",
  "utf8",
);
const characterSheet = readFileSync("src/app/characters/character-sheet.tsx", "utf8");
const creatureWorkspace = readFileSync("src/app/heavens/npcs/[npcId]/creature-npc-workspace.tsx", "utf8");

test("Item Use supports both its route-owned transaction and a reusable caller-owned transaction", () => {
  assert.match(actions, /db\.transaction\(\(tx\) => executeCharacterItemUseInCallerTransaction/);
  assert.match(actions, /executeItemUseInTransaction\(async \(execute\) => execute/);
  assert.match(actions, /loadUse\(tx, request, actingUserId, true\)/);
  assert.match(actions, /loadDefinition\(tx,/);
  assert.match(actions, /loadResource\(tx,/);
  assert.match(actions, /readActiveHealthInTransaction\(/);
  assert.match(actions, /persistPlannedMechanicalEffectInTransaction\(/);
});

test("Item Use target selection and live timing never use administrator authority", () => {
  assert.match(actions, /const canChooseTarget = roles\.includes\("god"\) && source\.campaignOwnerUserId === userId/);
  assert.match(actions, /if \(roles\.some\(\(\{ role \}\) => role === "god"\)\) return null/);
  assert.doesNotMatch(actions, /role === "god" \|\| role === "admin"/);
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

test("Item mutation writers lock the active Item root while read-only preview stays lock-free", () => {
  assert.match(itemRoot, /isNull\(item\.archivedAt\)/);
  assert.match(itemRoot, /\.for\("update", \{ of: item \}\)/);
  assert.match(itemRoot, /That Item is archived or no longer exists/);

  const previewStart = actions.indexOf("export async function prepareCharacterItemUseInTransaction");
  const executeStart = actions.indexOf("export async function executeCharacterItemUseInCallerTransaction");
  const routeStart = actions.indexOf("export async function executeCharacterItemUse(", executeStart);
  assert.ok(previewStart >= 0 && executeStart > previewStart && routeStart > executeStart);
  assert.doesNotMatch(actions.slice(previewStart, executeStart), /lockActiveItemRootInTransaction/);
  const execution = actions.slice(executeStart, routeStart);
  assert.match(execution, /lockActiveItemRootInTransaction\(tx, request\.itemId\)/);
  assert.ok(
    execution.indexOf("lockActiveItemRootInTransaction(tx, request.itemId)")
      < execution.indexOf("loadUse(tx, request, actingUserId, true)"),
    "the Item root must be locked before mutable resources and effects are planned",
  );

  assert.match(
    equipmentState,
    /if \(alreadyActive\) continue;\s+await lockActiveItemRootInTransaction\(tx, entry\.itemId\);\s+const plan = planMechanicalEffect/,
  );
});

test("Tabletop Item identities use the same active-root lock before durable references", () => {
  const startItem = runtimeIntegration.slice(
    runtimeIntegration.indexOf("export async function startItemActionInTransaction"),
    runtimeIntegration.indexOf("export async function prepareEncounterItemActionInTransaction"),
  );
  assert.match(startItem, /lockActiveItemRootInTransaction\(tx, request\.itemId\)/);
  assert.match(startItem, /sourceRef: `item:\$\{request\.itemId\}`/);

  const itemResolver = actionSourceResolver.slice(
    actionSourceResolver.indexOf("async function resolveItem("),
    actionSourceResolver.indexOf("async function resolveSpell("),
  );
  assert.match(itemResolver, /lockActiveItemRootInTransaction\(tx, itemId\)/);
  assert.ok(
    itemResolver.indexOf("lockActiveItemRootInTransaction(tx, itemId)")
      < itemResolver.indexOf(".from(item)"),
    "the Item root must be locked before a frozen action source is resolved",
  );

  assert.match(
    runtimeIntegration,
    /defendingItemId = positiveId[\s\S]*?lockActiveItemRootInTransaction\(tx, defendingItemId\)[\s\S]*?insert\(campaignSessionEncounterReaction\)/,
  );
  assert.match(
    defenseIntervention,
    /if \(prepared\.source\.itemId !== null\) \{\s+await lockActiveItemRootInTransaction\(tx, prepared\.source\.itemId\);\s+\}[\s\S]*?insert\(campaignSessionEncounterReaction\)/,
  );
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

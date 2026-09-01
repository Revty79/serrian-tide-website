import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Combat Aid composes authoritative runtime services behind one G.O.D.-authorized Encounter read", () => {
  const service = read("src/features/tabletop-operations/combat-aid-service.ts");
  const action = read("src/app/heavens/tabletop/combat-aid-actions.ts");
  assert.match(action, /requireGod\(\)/);
  assert.match(action, /db\.transaction/);
  assert.match(action, /isolationLevel: "repeatable read"/);
  assert.match(action, /accessMode: "read only"/);
  assert.match(service, /assertCampaignSessionOwner\(context\.ownerUserId, actingUserId\)/);
  assert.match(service, /campaignSessionEncounterParticipant/);
  for (const boundary of [
    "readActiveHealthInTransaction",
    "readActiveManaInTransaction",
    "readActiveEffectsInTransaction",
    "readCharacterEquipmentStateInTransaction",
    "readCharacterOperationalItemsInTransaction",
  ]) assert.match(service, new RegExp(boundary));
  assert.ok(service.indexOf("assertCampaignSessionOwner") < service.indexOf("const participantRows"));
});

test("Combat Aid read model preserves authoritative identity, Initiative values, and participant-level failure isolation", () => {
  const service = read("src/features/tabletop-operations/combat-aid-service.ts");
  const itemRead = read("src/features/items/item-operational-read-service.ts");
  const chargeModel = read("src/features/items/item-charge.ts");
  const equipmentModel = read("src/features/items/equipment-state.ts");
  assert.match(service, /characterId: number/);
  assert.match(itemRead, /itemId: number/);
  assert.match(itemRead, /chargedInstances: ItemChargeState\[\]/);
  assert.match(chargeModel, /instanceId: number/);
  assert.match(equipmentModel, /instanceId: number \| null/);
  assert.match(service, /currentInitiative: initiative\.currentInitiative/);
  assert.match(service, /normalTotalInitiative: initiative\.normalTotalInitiative/);
  assert.match(service, /participationStatus: initiative\.participationStatus/);
  assert.match(service, /pendingAction: action/);
  assert.match(service, /initiative && initiativeRuntime[\s\S]*: \{ enrolled: false \}/);
  assert.match(service, /async function readSection/);
  assert.match(service, /errors\.push\(\{ section/);
});

test("Combat Aid UI is read-only, exposes the operational summaries, and labels completed live state", () => {
  const ui = read("src/app/heavens/tabletop/combat-aid-workspace.tsx");
  for (const label of [
    "HEALTH",
    "MANA",
    "CONDITIONS &amp; MODIFIERS",
    "UNRESOLVED INJURIES",
    "EQUIPMENT",
    "INVENTORY RESOURCES &amp; CHARGES",
    "INITIATIVE",
    "Open Initiative Tracker",
    "Refresh State",
  ]) assert.match(ui, new RegExp(label));
  assert.match(ui, /participant membership is historical/);
  assert.match(ui, /current living Campaign state/);
  assert.match(ui, /conditions\.map\(\(\{ name \}\) => name\)/);
  assert.doesNotMatch(ui, /from ["'].*(?:active-health-service|active-mana-service|active-effects-service|equipment-state-service|item-use|spell-runtime|creature-ability-runtime)["']/);
  assert.doesNotMatch(ui, /applyDamage|apply.*Condition|spend.*Mana|restore.*Mana|useItem|castSpell|executeCreatureAbility|set.*Equipment/i);
});

test("Combat Aid adds no copied combat Character-state persistence", () => {
  const schema = [
    read("src/db/tabletop-operations-schema.ts"),
    read("src/db/realm-schema.ts"),
  ].join("\n");
  for (const forbidden of [
    "combat_health",
    "encounter_health",
    "combat_mana",
    "encounter_condition",
    "combat_inventory",
    "combat_equipment",
    "character_state_snapshot",
  ]) assert.doesNotMatch(schema, new RegExp(forbidden));
});

test("architecture contract fixes Build 7 as reads and defers mutations to Build 8", () => {
  const architecture = read("docs/architecture/tabletop-operations.md");
  assert.match(architecture, /Build 7 Combat Aid read boundary/);
  assert.match(architecture, /one repeatable-read transaction/);
  assert.match(architecture, /current living Character state/);
  assert.match(architecture, /Build 8 mutation direction/);
  assert.match(architecture, /delegate mutation to the existing owning runtime transaction service/);
});

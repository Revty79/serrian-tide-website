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

test("retained combat controllers authorize and lock the owning Encounter", () => {
  const actions = read("src/app/heavens/tabletop/runtime-integration-actions.ts");
  assert.match(actions, /requireGod\(\)/);
  assert.match(actions, /lockOwnedEncounterRuntimeInTransaction/);
  assert.match(actions, /db\.transaction/);
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

test("architecture contract keeps Build 7 reads and defines the Build 8 runtime boundary", () => {
  const architecture = read("docs/architecture/tabletop-operations.md");
  assert.match(architecture, /Build 7 Combat Aid read boundary/);
  assert.match(architecture, /one repeatable-read transaction/);
  assert.match(architecture, /current living Character state/);
  assert.match(architecture, /Build 8 Runtime Integration boundary/);
  assert.match(architecture, /same `campaign_character` records/);
  assert.match(architecture, /Starting an action spends only Initiative time/);
  assert.match(architecture, /never stores Health, Mana, inventory quantities, charge counts, Attributes, Skills, Creature snapshots/);
});

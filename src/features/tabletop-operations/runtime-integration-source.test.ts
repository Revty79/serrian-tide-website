import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("migration 0010 is additive and stores action and Reaction identity only", () => {
  const migration = read("drizzle/0010_tabletop_operations_runtime_integration.sql");
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_pending_action_source"/);
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_reaction"/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM|ALTER COLUMN)\b/i);
  for (const forbidden of [
    "health", "hit_points", "current_mana", "maximum_mana", "inventory_quantity",
    "charge_count", "attribute_value", "skill_value", "creature_snapshot",
  ]) assert.doesNotMatch(migration, new RegExp(`"[^"]*${forbidden}[^"]*"`, "i"));
});

test("Runtime Integration reuses owning transaction services and never calls high-level actions", () => {
  const service = read("src/features/tabletop-operations/runtime-integration-service.ts");
  for (const boundary of [
    "applyLocalizedDamageInTransaction",
    "spendActiveManaInTransaction",
    "applyConditionInTransaction",
    "setInstanceEquipmentStateInTransaction",
    "executeCharacterItemUseInCallerTransaction",
    "executeCharacterSpellCastInCallerTransaction",
    "executeCreatureAbilityUseInCallerTransaction",
  ]) assert.match(service, new RegExp(boundary));
  assert.doesNotMatch(service, /await\s+(?:applyActive|spendActiveMana|restoreActiveMana|executeCharacterSpellCast|executeCharacterItemUse|executeCreatureAbilityUse)\s*\(/);
  assert.match(service, /Unsaved Raw Formula casting has no durable combat identity/);
});

test("Encounter authorization and idempotency are enforced server-side", () => {
  const service = read("src/features/tabletop-operations/runtime-integration-service.ts");
  assert.match(service, /assertCampaignSessionOwner\(context\.ownerUserId, actingUserId\)/);
  assert.match(service, /Source and target Characters must be current Encounter Participants/);
  assert.match(service, /campaignSessionEncounterPendingActionSource,[\s\S]*campaignSessionEncounterPendingAction,/);
  assert.match(service, /requireReadyAuthoredAction\(binding\.action, binding\.resolutionStatus\)/);
  assert.match(service, /markBindingFinished/);
});

test("Creature Catalog spawning creates real NPCs and all membership inside one caller transaction", () => {
  const spawn = read("src/features/tabletop-operations/creature-spawn-service.ts");
  const constructor = read("src/features/creatures/creature-npc-constructor-service.ts");
  const action = read("src/app/heavens/tabletop/runtime-integration-actions.ts");
  assert.match(spawn, /createCreatureNpcInTransaction/);
  assert.match(spawn, /campaignSessionRoster/);
  assert.match(spawn, /campaignSessionSceneMember/);
  assert.match(spawn, /campaignSessionEncounterParticipant/);
  assert.match(spawn, /enrollSpawnedCreatureInInitiativeInTransaction/);
  assert.match(constructor, /campaignCreatureNpcProfile/);
  assert.match(action, /spawnEncounterCreaturesInTransaction\(tx, context/);
});

test("Build 8 UI keeps G.O.D. choices explicit", () => {
  const operations = read("src/app/heavens/tabletop/combat-aid-operations.tsx");
  const catalog = read("src/app/heavens/tabletop/creature-catalog-spawn.tsx");
  for (const label of [
    "Final numeric damage", "Exact Hit Location", "Manual G.O.D. resolution required",
    "Action confirmation", "Expected completion", "Dodge", "Parry with", "No Reaction",
    "Keep Cost", "Refund Cost", "Interrupt Action", "Saved Raw Formula", "Raw Casting circumstance",
  ]) assert.match(operations, new RegExp(label));
  const combatAid = read("src/features/tabletop-operations/combat-aid-service.ts");
  assert.match(combatAid, /canParticipantReactToAction/);
  assert.match(combatAid, /canHoldingParticipantIntervene/);
  assert.match(operations, /reactionOpportunityActionIds/);
  for (const label of ["Creature Catalog", "Quantity", "Join Initiative now"]) {
    assert.match(catalog, new RegExp(label));
  }
});

test("Runtime Integration invents neither Weapon Skill mappings nor armor resolution", () => {
  const sources = [
    read("src/features/tabletop-operations/runtime-integration.ts"),
    read("src/features/tabletop-operations/runtime-integration-service.ts"),
    read("src/app/heavens/tabletop/combat-aid-operations.tsx"),
  ].join("\n");
  assert.doesNotMatch(sources, /weaponType\s*\.\s*includes|includes\(["'](?:sword|rifle|bow|pistol)["']\)/i);
  assert.doesNotMatch(sources, /automatic.*(?:armor|soak)|(?:armor|soak).*automatic/i);
  assert.doesNotMatch(sources, /Math\.random|rollAttack|rollDefense|rollDodge|rollParry/i);
});

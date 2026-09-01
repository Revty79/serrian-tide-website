import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Initiative schema persists Encounter runtime, Participant state, and pending-action history only", () => {
  const schema = readSource("src/db/tabletop-operations-schema.ts");
  const initiativeSchema = schema.slice(schema.indexOf("export const campaignSessionEncounterInitiative ="));
  for (const field of [
    'status: campaignSessionEncounterInitiativeStatus("status")',
    'roundNumber: integer("round_number")',
    'stepNumber: integer("step_number")',
    'timelineInitiative: doublePrecision("timeline_initiative")',
    'normalTotalInitiative: doublePrecision("normal_total_initiative")',
    'currentInitiative: doublePrecision("current_initiative")',
    'participationStatus: campaignSessionEncounterInitiativeParticipantStatus("participation_status")',
    'deferredInitiativeCost: doublePrecision("deferred_initiative_cost")',
    'remainingInitiativeCost: doublePrecision("remaining_initiative_cost")',
    'expectedCompletionInitiative: doublePrecision("expected_completion_initiative")',
  ]) assert.ok(initiativeSchema.includes(field), `Initiative schema is missing ${field}`);

  assert.match(initiativeSchema, /campaign_session_encounter_initiative_participant_encounter_participant_fk/);
  assert.match(initiativeSchema, /campaign_session_encounter_pending_action_actor_fk/);
  assert.match(initiativeSchema, /campaign_session_encounter_pending_action_one_active_actor_uq/);
  assert.match(initiativeSchema, /campaign_session_encounter_initiative_participant_normal_positive/);
  assert.doesNotMatch(initiativeSchema, /current_(?:initiative_)?nonnegative/);

  for (const copiedState of [
    "encounter_health",
    "initiative_health",
    "combat_mana",
    "combat_inventory",
    "combat_character_snapshot",
    "combat_equipment",
  ]) assert.equal(initiativeSchema.includes(copiedState), false, `${copiedState} must not exist`);
});

test("Initiative capacity is reconstructed from authoritative PC, race-NPC, and Creature-NPC state", () => {
  const service = readSource("src/features/tabletop-operations/initiative-capacity-service.ts");
  assert.match(service, /campaignCharacterAttribute\.attributeKey, "DEX"/);
  assert.match(service, /campaignCharacterProfile\.baseMovementSteps/);
  assert.match(service, /raceMovementMode\.baseValue/);
  assert.match(service, /getCharacterMovementBaseValue/);
  assert.match(service, /campaignCreatureNpcProfile\.currentSnapshotJson/);
  assert.match(service, /resolveEffectiveCreatureStatistics/);
  assert.match(service, /effective\.attributeValues\.Dexterity/);
  assert.match(service, /effective\.movement/);
  assert.match(service, /calculateNormalTotalInitiative/);
  assert.doesNotMatch(service, /Math\.random|randomUUID|rollInitiative|initiativeRoll/);
  assert.doesNotMatch(service, /creatureMovement.*initiative|initiative.*creatureMovement/i);
});

test("Initiative server actions are G.O.D.-authorized, server-authoritative, serialized, and hierarchy-scoped", () => {
  const actions = readSource("src/app/heavens/tabletop/initiative-actions.ts");
  assert.match(actions, /const access = await requireGod\(\)/);
  assert.match(actions, /assertCampaignSessionOwner\(context\.ownerUserId, actingUserId\)/);
  assert.match(actions, /Initiative requires an active Session, Scene, and Encounter/);
  assert.match(actions, /\.for\("update"\)/);
  assert.match(actions, /resolveInitiativeCapacityInTransaction/);
  assert.match(actions, /Initiative enrollment requires an existing Encounter Participant/);

  for (const operation of [
    "initializeEncounterInitiative",
    "enrollLateEncounterInitiativeParticipant",
    "beginGenericInitiativeAction",
    "advanceEncounterInitiativeTimeline",
    "holdEncounterInitiative",
    "passEncounterInitiative",
    "setEncounterInitiativeParticipationStatus",
    "resumeSuspendedEncounterInitiative",
    "overrideCurrentEncounterInitiative",
    "applyEncounterInitiativeDelta",
    "overrideNormalEncounterInitiative",
    "refreshEncounterInitiativeCapacity",
    "addEncounterDeferredInitiativeCost",
    "settleEncounterDeferredInitiativeCost",
    "interruptEncounterPendingAction",
    "abandonEncounterPendingAction",
    "endEncounterPendingAction",
    "resumeEncounterPendingAction",
    "restartEncounterPendingAction",
    "adjustEncounterPendingActionRemainingCost",
    "resumeEncounterPendingActionWithAdjustedCost",
    "completeEncounterPendingActionManually",
    "advanceEncounterInitiativeRound",
    "correctEncounterInitiativeRuntime",
    "closeEncounterInitiative",
  ]) assert.match(actions, new RegExp(`export async function ${operation}\\b`), `missing ${operation}`);

  for (const persistentTable of [
    "activeHealth",
    "activeMana",
    "activeCondition",
    "activeModifier",
    "campaignCharacterInjury",
    "campaignCharacterItem",
    "campaignCharacterItemInstance",
    "campaignCharacterItemEquipmentState",
    "campaignCreatureNpcProfile",
  ]) assert.doesNotMatch(actions, new RegExp(`\\.(?:insert|update|delete)\\(${persistentTable}\\)`));
});

test("Encounter completion and removal actions protect active and historical Initiative", () => {
  const actions = readSource("src/app/heavens/tabletop/encounter-actions.ts");
  const lifecycle = actions.slice(
    actions.indexOf("async function applyEncounterLifecycleTransition"),
    actions.indexOf("export async function startCampaignSessionEncounter"),
  );
  assert.match(lifecycle, /campaignSessionEncounterInitiative\.status, "active"/);
  assert.match(lifecycle, /Close the active Initiative Runtime before completing this Encounter/);
  assert.doesNotMatch(lifecycle, /closeEncounterInitiative|\.delete\(campaignSessionEncounterInitiative\)/);

  const removal = actions.slice(
    actions.indexOf("export async function removeCampaignSessionEncounterParticipant"),
    actions.indexOf("export async function moveCampaignSessionEncounterParticipant"),
  );
  assert.match(removal, /campaignSessionEncounterInitiativeParticipant/);
  assert.match(removal, /Initiative runtime or history attached and cannot be removed/);

  const deletion = actions.slice(
    actions.indexOf("export async function deleteCampaignSessionEncounter"),
    actions.indexOf("export async function addCampaignSessionEncounterParticipant"),
  );
  assert.match(deletion, /This Encounter has Initiative history and cannot be deleted/);
});

test("migration 0009 is additive, relationally strong, and limited to Initiative persistence", () => {
  const migration = readSource("drizzle/0009_tabletop_operations_initiative_runtime.sql");
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_initiative"/);
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_initiative_participant"/);
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_pending_action"/);
  assert.match(migration, /campaign_session_encounter_initiative_participant_encounter_participant_fk/);
  assert.match(migration, /campaign_session_encounter_pending_action_actor_fk/);
  assert.match(migration, /ON DELETE restrict/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.doesNotMatch(migration, /CREATE TABLE "(?:combat_health|combat_mana|combat_inventory|combat_equipment|combat_character_snapshot|reward|shop|map|token|grid)/i);
  assert.match(readSource("scripts/verify-runtime-foundation-schema.mjs"), /0010_snapshot\.json/);
});

test("architecture preserves one authoritative Character state and defers polished combat integration", () => {
  const architecture = readSource("docs/architecture/tabletop-operations.md");
  assert.match(architecture, /Player Interface\s+G\.O\.D\. Table\s+Runtime Services/);
  assert.match(architecture, /same authoritative `campaign_character` runtime state/);
  assert.match(architecture, /Encounter Initiative is valid Encounter-specific runtime state/);
  assert.match(architecture, /not alternative copies of Character state/);
  assert.match(architecture, /Authored attack, reaction, spell, Item, Creature Ability, and Active State integration remain later additions/);
  assert.match(architecture, /docs\/rules\/initiative-runtime-contract\.md/);
});

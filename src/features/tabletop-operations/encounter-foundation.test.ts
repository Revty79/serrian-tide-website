import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ENCOUNTER_TYPES,
  assertEncounterIsEditable,
  assertEncounterMayBeDeleted,
  assertNoOtherActiveEncounter,
  assertParticipantBelongsToScene,
  assertParentsAllowEncounterPreparation,
  assertParentsAllowLiveEncounter,
  getNextEncounterSequence,
  moveParticipant,
  normalizeEncounterMetadata,
  normalizeParticipantOrder,
  normalizeParticipantPrepNotes,
  transitionEncounter,
} from "./encounter-foundation";

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Encounter metadata preserves authored content and accepts only the canonical descriptive types", () => {
  assert.deepEqual(ENCOUNTER_TYPES, ["combat", "social", "exploration", "chase", "hazard", "other"]);
  assert.deepEqual(normalizeEncounterMetadata({
    sequenceNumber: 2,
    title: "  Roadside Ambush  ",
    encounterType: "combat",
    description: "Bandits reveal themselves.\r\nNo outcome is automated.",
    godNotes: "The leader may bargain.\rKeep this private.",
  }), {
    sequenceNumber: 2,
    title: "Roadside Ambush",
    encounterType: "combat",
    description: "Bandits reveal themselves.\nNo outcome is automated.",
    godNotes: "The leader may bargain.\nKeep this private.",
  });
  assert.throws(() => normalizeEncounterMetadata({ sequenceNumber: 1, title: " ", encounterType: "other", description: "", godNotes: "" }), /Title is required/);
  assert.throws(() => normalizeEncounterMetadata({ sequenceNumber: 0, title: "Hazard", encounterType: "hazard", description: "", godNotes: "" }), /positive whole number/);
  assert.throws(() => normalizeEncounterMetadata({ sequenceNumber: 1, title: "Bad", encounterType: "duel" as "other", description: "", godNotes: "" }), /Type is invalid/);
  assert.equal(getNextEncounterSequence([{ sequenceNumber: 1 }, { sequenceNumber: 5 }]), 6);
});

test("Encounter lifecycle permits planned to active to completed and completed to active", () => {
  const startedAt = new Date("2026-09-03T18:00:00.000Z");
  const completedAt = new Date("2026-09-03T19:00:00.000Z");
  const active = transitionEncounter({ status: "planned", startedAt: null, completedAt: null }, "start", startedAt);
  assert.deepEqual(active, { status: "active", startedAt, completedAt: null });
  const completed = transitionEncounter(active, "complete", completedAt);
  assert.deepEqual(completed, { status: "completed", startedAt, completedAt });
  assert.deepEqual(transitionEncounter(completed, "reopen", new Date("2026-09-03T20:00:00.000Z")), {
    status: "active",
    startedAt,
    completedAt: null,
  });
});

test("invalid Encounter transitions, deletion, and concurrent active Encounters are rejected", () => {
  assert.throws(() => transitionEncounter({ status: "planned", startedAt: null, completedAt: null }, "complete"), /planned Encounter cannot be completed/);
  assert.throws(() => transitionEncounter({ status: "active", startedAt: new Date(), completedAt: null }, "reopen"), /active Encounter cannot be reopened/);
  assert.doesNotThrow(() => assertEncounterMayBeDeleted("planned"));
  assert.throws(() => assertEncounterMayBeDeleted("active"), /Only a planned Encounter/);
  assert.throws(() => assertEncounterMayBeDeleted("completed"), /Only a planned Encounter/);
  assert.doesNotThrow(() => assertNoOtherActiveEncounter([], 4));
  assert.doesNotThrow(() => assertNoOtherActiveEncounter([4], 4));
  assert.throws(() => assertNoOtherActiveEncounter([3], 4), /already has an active Encounter/);
});

test("Session and Scene lifecycle jointly govern preparation and live Encounter transitions", () => {
  assert.doesNotThrow(() => assertParentsAllowEncounterPreparation("planned", "planned"));
  assert.doesNotThrow(() => assertParentsAllowEncounterPreparation("active", "active"));
  assert.throws(() => assertParentsAllowEncounterPreparation("completed", "active"), /completed Session.*historical/i);
  assert.throws(() => assertParentsAllowEncounterPreparation("active", "completed"), /completed Scene.*historical/i);
  assert.doesNotThrow(() => assertEncounterIsEditable("planned", "planned", "planned"));
  assert.doesNotThrow(() => assertEncounterIsEditable("active", "active", "active"));
  assert.throws(() => assertEncounterIsEditable("completed", "active", "active"), /read-only/);
  assert.doesNotThrow(() => assertParentsAllowLiveEncounter("active", "active"));
  assert.throws(() => assertParentsAllowLiveEncounter("planned", "active"), /Session and Scene are active/);
  assert.throws(() => assertParentsAllowLiveEncounter("active", "planned"), /Session and Scene are active/);
});

test("Participants must be Scene Members and maintain stable preparation order and notes", () => {
  assert.doesNotThrow(() => assertParticipantBelongsToScene(3, 3));
  assert.throws(() => assertParticipantBelongsToScene(3, 4), /must already belong/);
  const unordered = [
    { characterId: 30, sortOrder: 5 },
    { characterId: 10, sortOrder: 1 },
    { characterId: 20, sortOrder: 1 },
  ];
  assert.deepEqual(normalizeParticipantOrder(unordered), [
    { characterId: 10, sortOrder: 0 },
    { characterId: 20, sortOrder: 1 },
    { characterId: 30, sortOrder: 2 },
  ]);
  assert.deepEqual(moveParticipant(unordered, 20, "down"), [
    { characterId: 10, sortOrder: 0 },
    { characterId: 30, sortOrder: 1 },
    { characterId: 20, sortOrder: 2 },
  ]);
  assert.throws(() => moveParticipant(unordered, 99, "down"), /not an Encounter Participant/);
  assert.equal(normalizeParticipantPrepNotes("First.\r\nSecond."), "First.\nSecond.");
});

test("Encounter schema is an organizational layer with constrained parent and Participant references", () => {
  const schema = readSource("src/db/tabletop-operations-schema.ts");
  const encounterSchema = schema.slice(schema.indexOf("export const campaignSessionEncounter ="));
  for (const field of [
    'sceneId: integer("scene_id")',
    'sessionId: integer("session_id")',
    'campaignId: integer("campaign_id")',
    'sequenceNumber: integer("sequence_number")',
    'title: text("title")',
    'encounterType: campaignSessionEncounterType("encounter_type")',
    'description: text("description")',
    'godNotes: text("god_notes")',
    'startedAt: timestamp("started_at")',
    'completedAt: timestamp("completed_at")',
    'characterId: integer("character_id")',
    'sortOrder: integer("sort_order")',
    'prepNotes: text("prep_notes")',
  ]) assert.ok(encounterSchema.includes(field), `Encounter schema is missing ${field}`);
  assert.match(encounterSchema, /campaign_session_encounter_one_active_per_scene_uq/);
  assert.match(encounterSchema, /campaign_session_encounter_participant_scene_member_fk/);
  assert.match(encounterSchema, /foreignColumns: \[campaignSessionSceneMember\.sceneId, campaignSessionSceneMember\.characterId\]/);
  assert.match(encounterSchema, /onDelete\("restrict"\)/);
  for (const copiedField of ["character_name", "player_name", "health", "mana", "condition", "inventory", "equipment", "snapshot", "initiative", "turn_order", "initiative_cost"]) {
    assert.equal(encounterSchema.includes(`"${copiedField}"`), false, `${copiedField} must not be copied into Encounter persistence`);
  }
});

test("Encounter actions authorize every operation and reload authoritative parents and Scene membership", () => {
  const actions = readSource("src/app/heavens/tabletop/encounter-actions.ts");
  assert.match(actions, /const access = await requireGod\(\)/);
  assert.match(actions, /assertCampaignSessionOwner\(context\.ownerUserId, access\.user\.id\)/);
  assert.match(actions, /lockOwnedScene\(tx, input\.sceneId, access\.user\.id\)/);
  assert.ok((actions.match(/lockOwnedEncounter\(tx, (?:input\.id|encounterId), access\.user\.id\)/g) ?? []).length >= 6);
  assert.match(actions, /eq\(campaignSessionSceneMember\.sceneId, locked\.sceneId\)/);
  assert.match(actions, /eq\(campaignSessionSceneMember\.sessionId, locked\.sessionId\)/);
  assert.match(actions, /eq\(campaignSessionSceneMember\.campaignId, locked\.campaignId\)/);
  assert.match(actions, /eq\(campaignSessionSceneMember\.characterId, characterId\)/);
  assert.doesNotMatch(actions, /input\.campaignId|input\.sessionId/);
});

test("Scene completion and Scene-member removal protect Encounter history", () => {
  const actions = readSource("src/app/heavens/tabletop/scene-actions.ts");
  const lifecycle = actions.slice(actions.indexOf("async function applySceneLifecycleTransition"), actions.indexOf("export async function startCampaignSessionScene"));
  assert.match(lifecycle, /campaignSessionEncounter\.status, "active"/);
  assert.match(lifecycle, /Complete the active Encounter before completing this Scene/);
  assert.doesNotMatch(lifecycle, /\.delete\(campaignSessionEncounter/);
  const removal = actions.slice(actions.indexOf("export async function removeCampaignSessionSceneMember"), actions.indexOf("export async function moveCampaignSessionSceneMember"));
  assert.match(removal, /\.from\(campaignSessionEncounterParticipant\)/);
  assert.match(removal, /completed Encounter history cannot be erased/);
});

test("Encounter mutations cannot write persistent Character, NPC, or Active State tables", () => {
  const actions = readSource("src/app/heavens/tabletop/encounter-actions.ts");
  for (const persistentTable of [
    "campaignCharacter",
    "campaignCharacterProfile",
    "campaignCreatureNpcProfile",
    "activeHealth",
    "activeMana",
    "activeCondition",
    "activeModifier",
    "campaignCharacterInjury",
    "campaignCharacterItem",
    "campaignCharacterItemInstance",
    "campaignCharacterItemEquipmentState",
  ]) {
    assert.doesNotMatch(actions, new RegExp(`\\.(?:insert|update|delete)\\(${persistentTable}\\)`));
  }
  assert.doesNotMatch(actions, /duration\.kind|expire.*effect|resolve.*effect/i);
});

test("Encounter UI exposes preparation and lifecycle without Initiative or combat automation", () => {
  const page = readSource("src/app/heavens/tabletop/page.tsx");
  const sceneWorkspace = readSource("src/app/heavens/tabletop/scene-workspace.tsx");
  const encounterWorkspace = readSource("src/app/heavens/tabletop/encounter-workspace.tsx");
  assert.match(page, /getSceneEncounterWorkspace/);
  assert.match(sceneWorkspace, /<EncounterWorkspace/);
  assert.match(encounterWorkspace, /ENCOUNTER LIBRARY/);
  assert.match(encounterWorkspace, /Encounter Number/);
  assert.match(encounterWorkspace, /Private G\.O\.D\. Notes/);
  assert.match(encounterWorkspace, /Add Participant/);
  assert.match(encounterWorkspace, /Start Encounter/);
  assert.match(encounterWorkspace, /Preparation\/display order — not Initiative order/);
  assert.match(encounterWorkspace, /does not roll Initiative, begin combat, or automate any action/);
  assert.doesNotMatch(encounterWorkspace, /Roll Initiative|initiativeCost|currentInitiative|Attack Target|Apply Damage|End Turn/);
});

test("migration 0008 is additive and contains only Encounter and Participant persistence", () => {
  const migration = readSource("drizzle/0008_tabletop_operations_encounters.sql");
  assert.match(migration, /CREATE TABLE "campaign_session_encounter"/);
  assert.match(migration, /CREATE TABLE "campaign_session_encounter_participant"/);
  assert.match(migration, /campaign_session_encounter_one_active_per_scene_uq/);
  assert.match(migration, /campaign_session_encounter_participant_scene_member_fk/);
  assert.match(migration, /ON DELETE restrict/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.doesNotMatch(migration, /CREATE TABLE "(?:encounter_health|encounter_mana|encounter_inventory|encounter_condition|encounter_equipment|encounter_snapshot|initiative|combat_action|turn_state)/i);
  assert.match(readSource("scripts/verify-runtime-foundation-schema.mjs"), /0017_snapshot\.json/);
});

test("Build 4 Encounter identity remains the foundation used by Build 5 Initiative", () => {
  const architecture = readSource("docs/architecture/tabletop-operations.md");
  assert.match(architecture, /Build 4 establishes Encounters and Encounter Participants/);
  assert.match(architecture, /selects Encounter Participants only from that Scene's Members/);
  assert.match(architecture, /display and preparation order only; it is not Initiative order/);
  assert.match(architecture, /Encounter type is descriptive and never starts combat/);
  assert.match(architecture, /Build 5 attaches Initiative.*to that identity/);
});

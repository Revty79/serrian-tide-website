import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertNoOtherActiveScene,
  assertParentSessionAllowsScenePreparation,
  assertSceneIsEditable,
  assertSceneMayBeDeleted,
  assertSceneMayComplete,
  assertSceneMayReopen,
  assertSceneMayStart,
  assertSceneMemberBelongsToRoster,
  getNextSceneSequence,
  moveSceneMember,
  normalizeSceneMemberOrder,
  normalizeSceneMetadata,
  transitionScene,
} from "./scene-foundation";

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Scene metadata normalizes every authored field without interpreting content", () => {
  assert.deepEqual(normalizeSceneMetadata({
    sequenceNumber: 2,
    title: "  The Bridge  ",
    locationLabel: "  Abandoned Highway Bridge  ",
    description: "Search the wreckage.\r\nThe weather is worsening.",
    godNotes: "Captain is lying.\rWolf enters later.",
  }), {
    sequenceNumber: 2,
    title: "The Bridge",
    locationLabel: "Abandoned Highway Bridge",
    description: "Search the wreckage.\nThe weather is worsening.",
    godNotes: "Captain is lying.\nWolf enters later.",
  });
  assert.throws(() => normalizeSceneMetadata({ sequenceNumber: 1, title: " ", locationLabel: "", description: "", godNotes: "" }), /Title is required/);
  assert.throws(() => normalizeSceneMetadata({ sequenceNumber: 0, title: "Scene", locationLabel: "", description: "", godNotes: "" }), /positive whole number/);
  assert.equal(getNextSceneSequence([{ sequenceNumber: 1 }, { sequenceNumber: 4 }]), 5);
});

test("Scene lifecycle permits planned to active to completed and completed to active", () => {
  const startedAt = new Date("2026-09-02T18:00:00.000Z");
  const completedAt = new Date("2026-09-02T20:00:00.000Z");
  const active = transitionScene({ status: "planned", startedAt: null, completedAt: null }, "start", startedAt);
  assert.deepEqual(active, { status: "active", startedAt, completedAt: null });
  const completed = transitionScene(active, "complete", completedAt);
  assert.deepEqual(completed, { status: "completed", startedAt, completedAt });
  assert.deepEqual(transitionScene(completed, "reopen", new Date("2026-09-02T21:00:00.000Z")), {
    status: "active",
    startedAt,
    completedAt: null,
  });
});

test("invalid Scene transitions, deletion, and concurrent active Scenes are rejected", () => {
  assert.throws(() => transitionScene({ status: "planned", startedAt: null, completedAt: null }, "complete"), /planned Scene cannot be completed/);
  assert.throws(() => transitionScene({ status: "active", startedAt: new Date(), completedAt: null }, "reopen"), /active Scene cannot be reopened/);
  assert.doesNotThrow(() => assertSceneMayBeDeleted("planned"));
  assert.throws(() => assertSceneMayBeDeleted("active"), /Only a planned Scene/);
  assert.throws(() => assertSceneMayBeDeleted("completed"), /Only a planned Scene/);
  assert.doesNotThrow(() => assertNoOtherActiveScene([], 9));
  assert.doesNotThrow(() => assertNoOtherActiveScene([9], 9));
  assert.throws(() => assertNoOtherActiveScene([8], 9), /already has an active Scene/);
});

test("parent Session status governs Scene preparation, start, completion, and reopen", () => {
  assert.doesNotThrow(() => assertParentSessionAllowsScenePreparation("planned"));
  assert.doesNotThrow(() => assertParentSessionAllowsScenePreparation("active"));
  assert.throws(() => assertParentSessionAllowsScenePreparation("completed"), /historical.*Reopen/i);
  assert.doesNotThrow(() => assertSceneIsEditable("planned", "planned"));
  assert.doesNotThrow(() => assertSceneIsEditable("active", "active"));
  assert.throws(() => assertSceneIsEditable("completed", "active"), /read-only.*Reopen/i);
  assert.throws(() => assertSceneIsEditable("planned", "completed"), /historical.*Reopen/i);
  assert.doesNotThrow(() => assertSceneMayStart("active"));
  assert.throws(() => assertSceneMayStart("planned"), /only while its Session is active/);
  assert.doesNotThrow(() => assertSceneMayComplete("active"));
  assert.throws(() => assertSceneMayComplete("completed"), /only while its Session is active/);
  assert.doesNotThrow(() => assertSceneMayReopen("active"));
  assert.throws(() => assertSceneMayReopen("planned"), /only while its Session is active/);
});

test("Scene membership requires the same Session Roster and has stable ordering", () => {
  assert.doesNotThrow(() => assertSceneMemberBelongsToRoster(3, 3));
  assert.throws(() => assertSceneMemberBelongsToRoster(3, 4), /must already belong/);
  const unordered = [
    { characterId: 30, sortOrder: 5 },
    { characterId: 10, sortOrder: 1 },
    { characterId: 20, sortOrder: 1 },
  ];
  assert.deepEqual(normalizeSceneMemberOrder(unordered), [
    { characterId: 10, sortOrder: 0 },
    { characterId: 20, sortOrder: 1 },
    { characterId: 30, sortOrder: 2 },
  ]);
  assert.deepEqual(moveSceneMember(unordered, 20, "down"), [
    { characterId: 10, sortOrder: 0 },
    { characterId: 30, sortOrder: 1 },
    { characterId: 20, sortOrder: 2 },
  ]);
  assert.deepEqual(moveSceneMember(unordered, 10, "up"), normalizeSceneMemberOrder(unordered));
  assert.throws(() => moveSceneMember(unordered, 99, "down"), /not in the Scene/);
});

test("Scene and member schema carry only organizational references and metadata", () => {
  const schema = readSource("src/db/tabletop-operations-schema.ts");
  const sceneSchema = schema.slice(schema.indexOf("export const campaignSessionScene ="));
  for (const field of [
    'sessionId: integer("session_id")',
    'campaignId: integer("campaign_id")',
    'sequenceNumber: integer("sequence_number")',
    'title: text("title")',
    'locationLabel: text("location_label")',
    'description: text("description")',
    'godNotes: text("god_notes")',
    'startedAt: timestamp("started_at")',
    'completedAt: timestamp("completed_at")',
  ]) assert.ok(sceneSchema.includes(field), `Scene schema is missing ${field}`);
  assert.match(sceneSchema, /campaign_session_scene_one_active_per_session_uq/);
  assert.match(sceneSchema, /\.where\(sql`\$\{table\.status\} = 'active'`\)/);
  assert.match(sceneSchema, /campaign_session_scene_member_roster_fk/);
  assert.match(sceneSchema, /foreignColumns: \[campaignSessionRoster\.sessionId, campaignSessionRoster\.characterId\]/);
  assert.match(sceneSchema, /\.onDelete\("restrict"\)/);
  for (const copiedField of ["character_name", "player_name", "health", "mana", "condition", "inventory", "equipment", "snapshot", "initiative"]) {
    assert.equal(sceneSchema.includes(`\"${copiedField}\"`), false, `${copiedField} must not be copied into Scene persistence`);
  }
});

test("Scene actions independently resolve G.O.D. ownership and authoritative parents", () => {
  const actions = readSource("src/app/heavens/tabletop/scene-actions.ts");
  assert.match(actions, /const access = await requireGod\(\)/);
  assert.match(actions, /assertCampaignSessionOwner\(context\.ownerUserId, access\.user\.id\)/);
  assert.equal((actions.match(/lockOwnedScene\(tx, (?:input\.id|sceneId), access\.user\.id\)/g) ?? []).length, 6);
  assert.match(actions, /lockOwnedSession\(tx, input\.sessionId, access\.user\.id\)/);
  assert.match(actions, /eq\(campaignSessionRoster\.sessionId, locked\.sessionId\)/);
  assert.match(actions, /eq\(campaignSessionRoster\.campaignId, locked\.campaignId\)/);
  assert.match(actions, /eq\(campaignSessionRoster\.characterId, characterId\)/);
  assert.doesNotMatch(actions, /input\.campaignId/);
});

test("roster removal and Session completion protect Scene history", () => {
  const sessionActions = readSource("src/app/heavens/tabletop/actions.ts");
  const removeRosterSource = sessionActions.slice(
    sessionActions.indexOf("export async function removeSessionRosterMember"),
    sessionActions.indexOf("export async function updateSessionRosterPrepNotes"),
  );
  assert.match(removeRosterSource, /\.from\(campaignSessionSceneMember\)/);
  assert.match(removeRosterSource, /completed Scene history cannot be erased/);
  const lifecycleSource = sessionActions.slice(
    sessionActions.indexOf("async function applyLifecycleTransition"),
    sessionActions.indexOf("export async function startCampaignSession"),
  );
  assert.match(lifecycleSource, /readSessionCloseoutInTransaction/);
  assert.match(lifecycleSource, /Session closeout is blocked/);
  assert.doesNotMatch(lifecycleSource, /\.delete\(campaignSessionScene/);
});

test("Scene mutations cannot write persistent Character, NPC, or Active State tables", () => {
  const actions = readSource("src/app/heavens/tabletop/scene-actions.ts");
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

test("Scenes UI extends the Session workspace without Encounter or Initiative controls", () => {
  const workspace = readSource("src/app/heavens/tabletop/tabletop-workspace.tsx");
  const sceneWorkspace = readSource("src/app/heavens/tabletop/scene-workspace.tsx");
  assert.match(workspace, />Scenes <span>/);
  assert.match(sceneWorkspace, /SCENE LIBRARY/);
  assert.match(sceneWorkspace, /Location \/ Setting/);
  assert.match(sceneWorkspace, /Private G\.O\.D\. Notes/);
  assert.match(sceneWorkspace, /Add to Scene/);
  assert.match(sceneWorkspace, /Start Scene/);
  assert.doesNotMatch(sceneWorkspace, /Start Combat|Roll Initiative|Begin Encounter/);
});

test("migration 0007 is additive and contains only Scene and Scene-member persistence", () => {
  const migration = readSource("drizzle/0007_tabletop_operations_scenes.sql");
  assert.match(migration, /CREATE TABLE "campaign_session_scene"/);
  assert.match(migration, /CREATE TABLE "campaign_session_scene_member"/);
  assert.match(migration, /campaign_session_scene_one_active_per_session_uq/);
  assert.match(migration, /campaign_session_scene_member_roster_fk/);
  assert.match(migration, /ON DELETE restrict/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.doesNotMatch(migration, /CREATE TABLE "(?:scene_health|scene_mana|scene_inventory|scene_conditions|scene_equipment|scene_snapshot|encounter|initiative|combat)/i);
  assert.match(readSource("scripts/verify-runtime-foundation-schema.mjs"), /0014_snapshot\.json/);
});

test("Build 3 architecture documents Scene scope and deferred duration integration", () => {
  const architecture = readSource("docs/architecture/tabletop-operations.md");
  assert.match(architecture, /Build 3 establishes Scenes and Scene membership/);
  assert.match(architecture, /Scene Members reference existing Session Roster entries/);
  assert.match(architecture, /may exist without an Encounter/);
  assert.match(architecture, /does not automatically expire, resolve, or otherwise mutate those effects/);
  assert.match(architecture, /Build 4 establishes Encounters and Encounter Participants/);
});

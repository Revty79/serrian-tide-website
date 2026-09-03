import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertRosterCampaignIntegrity,
  assertSessionRosterEditable,
  classifySessionRosterEntity,
  getSessionRosterEntityLabel,
  moveRosterEntry,
  normalizeRosterOrder,
  normalizeRosterPrepNotes,
} from "./session-roster";

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("roster identity classifies existing Campaign Character kinds without copying them", () => {
  assert.equal(classifySessionRosterEntity({ isNpc: false, npcKind: "race" }), "pc");
  assert.equal(classifySessionRosterEntity({ isNpc: true, npcKind: "race" }), "race-npc");
  assert.equal(classifySessionRosterEntity({ isNpc: true, npcKind: "creature" }), "creature-npc");
  assert.equal(getSessionRosterEntityLabel("pc"), "Player Character");
  assert.equal(getSessionRosterEntityLabel("race-npc"), "Race NPC");
  assert.equal(getSessionRosterEntityLabel("creature-npc"), "Creature NPC");
});

test("roster campaign integrity is explicit and server-authoritative", () => {
  assert.doesNotThrow(() => assertRosterCampaignIntegrity(7, 7));
  assert.throws(() => assertRosterCampaignIntegrity(7, 8), /own Campaign/);

  const actions = readSource("src/app/heavens/tabletop/actions.ts");
  assert.match(actions, /const access = await requireGod\(\)/);
  assert.match(actions, /assertCampaignSessionOwner\(context\.ownerUserId, access\.user\.id\)/);
  assert.match(actions, /assertRosterCampaignIntegrity\(locked\.campaignId, characterRow\.campaignId\)/);
  assert.match(actions, /lockOwnedEditableSession\(tx, sessionId, access\.user\.id\)/);
});

test("planned and active rosters are editable while completed rosters require reopen", () => {
  assert.doesNotThrow(() => assertSessionRosterEditable("planned"));
  assert.doesNotThrow(() => assertSessionRosterEditable("active"));
  assert.throws(() => assertSessionRosterEditable("completed"), /read-only.*Reopen/i);
});

test("roster order is stable, contiguous, and supports bounded movement", () => {
  const unordered = [
    { characterId: 30, sortOrder: 8 },
    { characterId: 10, sortOrder: 2 },
    { characterId: 20, sortOrder: 2 },
  ];
  assert.deepEqual(normalizeRosterOrder(unordered), [
    { characterId: 10, sortOrder: 0 },
    { characterId: 20, sortOrder: 1 },
    { characterId: 30, sortOrder: 2 },
  ]);
  assert.deepEqual(moveRosterEntry(unordered, 20, "down"), [
    { characterId: 10, sortOrder: 0 },
    { characterId: 30, sortOrder: 1 },
    { characterId: 20, sortOrder: 2 },
  ]);
  assert.deepEqual(moveRosterEntry(unordered, 10, "up"), normalizeRosterOrder(unordered));
  assert.throws(() => moveRosterEntry(unordered, 99, "down"), /not in the Session roster/);
});

test("private prep notes preserve authored content while normalizing line endings", () => {
  assert.equal(normalizeRosterPrepNotes("  keep spacing\r\nsecond\rthird  "), "  keep spacing\nsecond\nthird  ");
});

test("roster persistence contains references, order, and notes but no copied Character state", () => {
  const schema = readSource("src/db/tabletop-operations-schema.ts");
  const rosterSchema = schema.slice(schema.indexOf("export const campaignSessionRoster"));
  for (const field of [
    'sessionId: integer("session_id")',
    'campaignId: integer("campaign_id")',
    'characterId: integer("character_id")',
    'sortOrder: integer("sort_order")',
    'prepNotes: text("prep_notes")',
  ]) assert.ok(rosterSchema.includes(field), `Roster schema is missing ${field}`);
  assert.match(rosterSchema, /campaign_session_roster_session_campaign_fk/);
  assert.match(rosterSchema, /campaign_session_roster_character_campaign_fk/);
  assert.match(rosterSchema, /primaryKey\(\{ columns: \[table\.sessionId, table\.characterId\] \}\)/);
  for (const copiedField of ["character_name", "player_name", "health", "mana", "condition", "inventory", "equipment", "creature_snapshot"]) {
    assert.equal(rosterSchema.includes(`\"${copiedField}\"`), false, `${copiedField} must remain authoritative outside the roster`);
  }
});

test("roster actions delete only membership and lifecycle transitions do not touch roster rows", () => {
  const actions = readSource("src/app/heavens/tabletop/actions.ts");
  const removeSource = actions.slice(
    actions.indexOf("export async function removeSessionRosterMember"),
    actions.indexOf("export async function updateSessionRosterPrepNotes"),
  );
  assert.match(removeSource, /\.delete\(campaignSessionRoster\)/);
  assert.doesNotMatch(removeSource, /\.delete\(campaignCharacter\)/);

  const lifecycleSource = actions.slice(
    actions.indexOf("async function applyLifecycleTransition"),
    actions.indexOf("export async function startCampaignSession"),
  );
  assert.doesNotMatch(lifecycleSource, /campaignSessionRoster/);
});

test("every roster management action independently locks the owned editable Session", () => {
  const actions = readSource("src/app/heavens/tabletop/actions.ts");
  const rosterMutations = actions.slice(
    actions.indexOf("export async function addSessionRosterMember"),
    actions.indexOf("async function applyLifecycleTransition"),
  );
  assert.equal(
    (rosterMutations.match(/lockOwnedEditableSession\(tx, sessionId, access\.user\.id\)/g) ?? []).length,
    4,
  );
  const addSource = rosterMutations.slice(0, rosterMutations.indexOf("export async function removeSessionRosterMember"));
  assert.ok(
    addSource.indexOf("lockOwnedEditableSession") < addSource.indexOf(".from(campaignCharacter)"),
    "ownership and editability must be resolved before accepting a Character ID",
  );

  const readAction = actions.slice(
    actions.indexOf("export async function getSessionPrepWorkspace"),
    actions.indexOf("export async function createCampaignSession"),
  );
  assert.ok(
    readAction.indexOf("assertCampaignSessionOwner") < readAction.indexOf("Promise.all"),
    "private roster data must not load before Campaign ownership is established",
  );
});

test("roster mutations cannot write persistent Character, NPC, or Active State tables", () => {
  const actions = readSource("src/app/heavens/tabletop/actions.ts");
  const rosterMutations = actions.slice(
    actions.indexOf("export async function addSessionRosterMember"),
    actions.indexOf("async function applyLifecycleTransition"),
  );
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
    assert.doesNotMatch(
      rosterMutations,
      new RegExp(`\\.(?:insert|update|delete)\\(${persistentTable}\\)`),
      `${persistentTable} must remain outside roster writes`,
    );
  }
});

test("the Heavens workspace separates Session Record from Roster and Prep", () => {
  const workspace = readSource("src/app/heavens/tabletop/tabletop-workspace.tsx");
  assert.match(workspace, />Session Record</);
  assert.match(workspace, />Roster &amp; Prep/);
  assert.match(workspace, /Private G\.O\.D\. Notes/);
  assert.match(workspace, /Player Characters/);
  assert.match(workspace, /Race NPCs/);
  assert.match(workspace, /Creature NPCs/);
  assert.match(workspace, /historical roster/);
});

test("migration 0006 is additive, enforces same-Campaign references, and creates no future systems", () => {
  const migration = readSource("drizzle/0006_tabletop_operations_session_roster.sql");
  assert.match(migration, /CREATE TABLE "campaign_session_roster"/);
  assert.match(migration, /PRIMARY KEY\("session_id","character_id"\)/);
  assert.match(migration, /campaign_session_roster_session_campaign_fk/);
  assert.match(migration, /campaign_session_roster_character_campaign_fk/);
  assert.match(migration, /ON DELETE cascade/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.doesNotMatch(migration, /CREATE TABLE "(?:scene|encounter|initiative|turn|round|combat|participant)/i);
  assert.match(readSource("scripts/verify-runtime-foundation-schema.mjs"), /0018_snapshot\.json/);
});

test("Build 2 architecture defines the roster reference boundary and future consumers", () => {
  const architecture = readSource("docs/architecture/tabletop-operations.md");
  assert.match(architecture, /Build 2 establishes the Session Roster/);
  assert.match(architecture, /references campaign_character/);
  assert.match(architecture, /never copies persistent Character state/);
  assert.match(architecture, /Scenes and Encounters select from, or otherwise reference, the Session-level roster/);
});

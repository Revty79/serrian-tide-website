import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertCampaignSessionOwner,
  assertNoOtherActiveSession,
  assertSessionMayBeDeleted,
  getNextSessionSequence,
  normalizeSessionMetadata,
  transitionSession,
} from "./session-foundation";

function readSource(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Session lifecycle permits planned to active to completed and completed to active", () => {
  const startedAt = new Date("2026-09-01T18:00:00.000Z");
  const completedAt = new Date("2026-09-01T22:00:00.000Z");
  const reopenedAt = new Date("2026-09-02T18:00:00.000Z");

  const active = transitionSession(
    { status: "planned", startedAt: null, completedAt: null },
    "start",
    startedAt,
  );
  assert.deepEqual(active, { status: "active", startedAt, completedAt: null });

  const completed = transitionSession(active, "complete", completedAt);
  assert.deepEqual(completed, { status: "completed", startedAt, completedAt });

  const reopened = transitionSession(completed, "reopen", reopenedAt);
  assert.deepEqual(reopened, { status: "active", startedAt, completedAt: null });
});

test("invalid lifecycle transitions and destructive deletion are rejected", () => {
  assert.throws(
    () => transitionSession({ status: "planned", startedAt: null, completedAt: null }, "complete"),
    /planned Session cannot be completed/,
  );
  assert.throws(
    () => transitionSession({ status: "active", startedAt: new Date(), completedAt: null }, "reopen"),
    /active Session cannot be reopened/,
  );
  assert.doesNotThrow(() => assertSessionMayBeDeleted("planned"));
  assert.throws(() => assertSessionMayBeDeleted("active"), /Only a planned Session/);
  assert.throws(() => assertSessionMayBeDeleted("completed"), /Only a planned Session/);
});

test("Session metadata normalizes all persisted editor fields", () => {
  assert.deepEqual(normalizeSessionMetadata({
    title: "  Into the Hollow  ",
    sequenceNumber: 3,
    plannedFor: "2026-09-14",
    godNotes: "Keep the gate closed.\nPrivate clue.",
  }), {
    title: "Into the Hollow",
    sequenceNumber: 3,
    plannedFor: "2026-09-14",
    godNotes: "Keep the gate closed.\nPrivate clue.",
  });
  assert.equal(normalizeSessionMetadata({ title: "Session", sequenceNumber: 1, plannedFor: "", godNotes: "" }).plannedFor, null);
  assert.throws(() => normalizeSessionMetadata({ title: " ", sequenceNumber: 1, plannedFor: null, godNotes: "" }), /Title is required/);
  assert.throws(() => normalizeSessionMetadata({ title: "Session", sequenceNumber: 0, plannedFor: null, godNotes: "" }), /positive whole number/);
  assert.throws(() => normalizeSessionMetadata({ title: "Session", sequenceNumber: 1, plannedFor: "2026-02-30", godNotes: "" }), /valid calendar date/);
  assert.equal(getNextSessionSequence([{ sequenceNumber: 4 }, { sequenceNumber: 2 }]), 5);
});

test("Campaign ownership and one-active-Session rules are server-authoritative", () => {
  assert.doesNotThrow(() => assertCampaignSessionOwner("god-1", "god-1"));
  assert.throws(
    () => assertCampaignSessionOwner("god-1", "god-2"),
    /Only the Campaign creator/,
  );
  assert.doesNotThrow(() => assertNoOtherActiveSession([], 12));
  assert.doesNotThrow(() => assertNoOtherActiveSession([12], 12));
  assert.throws(
    () => assertNoOtherActiveSession([11], 12),
    /already has an active Session/,
  );

  const actions = readSource("src/app/heavens/tabletop/actions.ts");
  assert.match(actions, /const access = await requireGod\(\)/);
  assert.match(actions, /assertCampaignSessionOwner\(locked\.ownerUserId, access\.user\.id\)/);
  assert.match(actions, /\.for\("update"\)/);
});

test("Session schema persists metadata, lifecycle timestamps, and structural invariants", () => {
  const schema = readSource("src/db/tabletop-operations-schema.ts");
  for (const field of [
    'campaignId: integer("campaign_id")',
    'title: text("title")',
    'sequenceNumber: integer("sequence_number")',
    'status: campaignSessionStatus("status")',
    'plannedFor: date("planned_for"',
    'godNotes: text("god_notes")',
    'startedAt: timestamp("started_at")',
    'completedAt: timestamp("completed_at")',
    'createdAt: timestamp("created_at")',
    'updatedAt: timestamp("updated_at")',
  ]) {
    assert.ok(schema.includes(field), `Session schema is missing ${field}`);
  }
  assert.match(schema, /campaign_session_campaign_sequence_uq/);
  assert.match(schema, /campaign_session_one_active_per_campaign_uq/);
  assert.match(schema, /\.where\(sql`\$\{table\.status\} = 'active'`\)/);
  assert.match(schema, /campaign_session_lifecycle_timestamps_valid/);
});

test("completing or reopening a Session cannot mutate persistent Character or NPC state", () => {
  const actions = readSource("src/app/heavens/tabletop/actions.ts");
  const lifecycleSource = actions.slice(
    actions.indexOf("async function applyLifecycleTransition"),
    actions.indexOf("export async function startCampaignSession"),
  );
  for (const forbidden of [
    "campaignCharacter",
    "activeHealth",
    "activeMana",
    "activeCondition",
    "activeModifier",
    "campaignCharacterItem",
    "equipmentState",
    "campaignCreatureNpcProfile",
  ]) {
    assert.equal(lifecycleSource.includes(forbidden), false, `${forbidden} must remain outside Session lifecycle actions`);
  }
});

test("Build 1 architecture documents the persistent-state and Initiative boundaries", () => {
  const architecture = readSource("docs/architecture/tabletop-operations.md");
  assert.match(architecture, /Campaign[\s\S]*Session[\s\S]*Session Roster[\s\S]*Scene[\s\S]*Encounter/);
  assert.match(architecture, /must not copy persistent Character state/);
  assert.match(architecture, /docs\/rules\/initiative-runtime-contract\.md/);
  assert.equal(readSource("docs/rules/initiative-runtime-contract.md").includes("continuous combat-time system"), true);
});

test("migration 0005 is additive and creates no future or duplicated runtime tables", () => {
  const migration = readSource("drizzle/0005_tabletop_operations_session_foundation.sql");
  assert.match(migration, /CREATE TYPE "public"\."campaign_session_status"/);
  assert.match(migration, /CREATE TABLE "campaign_session"/);
  assert.match(migration, /campaign_session_one_active_per_campaign_uq/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im);
  assert.doesNotMatch(migration, /ALTER TABLE "(?:campaign|campaign_character|campaign_creature_npc_profile)"/);
  assert.doesNotMatch(migration, /session_(?:character|health|mana|condition|modifier|inventory|equipment|scene|encounter|initiative)/i);
});

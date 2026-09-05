import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("drizzle/0032_safe_entity_lifecycles.sql", "utf8");

test("migration 0032 adds archive metadata to every lifecycle root", () => {
  for (const table of [
    "campaign",
    "campaign_character",
    "races",
    "creatures",
    "skill",
    "items",
    "derived_ability",
  ]) {
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" ADD COLUMN "archived_at" timestamp`));
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" ADD COLUMN "archived_by_user_id" text`));
    assert.match(migration, new RegExp(`ALTER TABLE "${table}" ADD COLUMN "archive_reason" text DEFAULT '' NOT NULL`));
  }

  assert.equal((migration.match(/archive_state_valid" CHECK/g) ?? []).length, 7);
  assert.equal((migration.match(/archived_by_user_id_user_id_fk/g) ?? []).length, 7);
  assert.equal((migration.match(/ON DELETE set null/g) ?? []).length, 7);
});

test("existing NPCs are backfilled before the build-mode constraints are installed", () => {
  const backfillIndex = migration.indexOf(
    `UPDATE "campaign_character"\nSET "npc_build_mode" = 'detailed'`,
  );
  const validityConstraintIndex = migration.indexOf(
    `ADD CONSTRAINT "campaign_character_npc_build_mode_valid"`,
  );
  const presenceConstraintIndex = migration.indexOf(
    `ADD CONSTRAINT "campaign_character_npc_build_mode_presence"`,
  );

  assert.notEqual(backfillIndex, -1);
  assert.ok(backfillIndex < validityConstraintIndex);
  assert.ok(backfillIndex < presenceConstraintIndex);
  assert.match(
    migration,
    /WHERE "is_npc" = true AND "npc_build_mode" IS NULL/,
  );
});

test("the lifecycle audit is durable and dependent Skill references restrict deletion", () => {
  assert.match(migration, /CREATE TABLE "lifecycle_audit_event"/);
  assert.match(migration, /"dependency_summary_json" jsonb DEFAULT '\{\}'::jsonb NOT NULL/);
  assert.match(migration, /lifecycle_audit_event_dependency_summary_object/);
  assert.match(migration, /lifecycle_audit_event_actor_user_id_user_id_fk[^;]+ON DELETE restrict/);

  for (const constraint of [
    "skill_relationship_skill_id_skill_id_fk",
    "skill_relationship_related_skill_id_skill_id_fk",
    "race_skill_links_skill_id_skill_id_fk",
  ]) {
    assert.match(
      migration,
      new RegExp(`ADD CONSTRAINT "${constraint}"[^;]+ON DELETE restrict`),
    );
  }

  assert.doesNotMatch(migration, /\b(?:DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE)\b/i);
  assert.deepEqual(
    [...migration.matchAll(/^UPDATE "([^"]+)"/gm)].map((match) => match[1]),
    ["campaign_character"],
  );
});

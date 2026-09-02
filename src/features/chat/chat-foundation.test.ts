import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

import {
  chatMessageStatus,
  chatRoomScope,
} from "@/db/chat-schema";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(join(root, path))).digest("hex").toUpperCase();
}

const historicalMigrationHashes = {
  "0000_serrian_tide_baseline.sql": "D356FB19B2DEF7D9FC3ACB65D606D3C9F99E377142A762D16432F29CBC668FDB",
  "0001_runtime_foundation.sql": "E058D84AC39B2D0A6F1703A77580C705C2137BF3AD451EACE3E052AB272EAC2B",
  "0002_campaign_overview.sql": "328E60DCAA929757000B127B8BFDEE2CA376D2B2B05C2936D0F9533E807800E6",
  "0003_creature_effective_statistics.sql": "7565744F51FEF428017ABAE9F06147E3BC2DC849BFB2BA0F78E2196933B93382",
  "0004_persisted_creature_hp.sql": "8EEB50E8B2453C61230240BDA411C7092C6E66DB20A0E285D16C38277EA631A1",
  "0005_tabletop_operations_session_foundation.sql": "3B80CD928CE14647446A61197A6231EA61D8AAF79F15E61250EB142E392C8725",
  "0006_tabletop_operations_session_roster.sql": "4D187642FDCA1B3A5160C32F1ACE5107C1FCA8849506C10AF936E0E0BA648D5D",
  "0007_tabletop_operations_scenes.sql": "DBA1449BE035FBAFA5CF978458C39FD87B9E781ABB40804822ECF09C1277D979",
  "0008_tabletop_operations_encounters.sql": "4CBD4FC6BF176B8E3B38B898C1505950B2E61DAA08516229C3093BAA966343E8",
  "0009_tabletop_operations_initiative_runtime.sql": "519B97F849C54586009D483484E86BD2E74C1009DAF2702E6B17F5B59A16F2C4",
  "0010_tabletop_operations_runtime_integration.sql": "35033E59511180436D94EF0B2B4B9D1A8845B166B64196E867184455FEEBD5E7",
  "0011_tabletop_operations_duration_closeout.sql": "44A8BB612450A373D3346030BAD857DBA577358F495C568C22CD508089252628",
  "0012_tabletop_operations_roll_runtime.sql": "C15688DE42C2FF47A5D533B8E4534BEA25EEEE59822BF58E1AFAF976FF45F9F8",
} as const;

const schema = source("src/db/chat-schema.ts");
const config = source("drizzle.config.ts");
const migration = source("drizzle/0013_chat_foundation.sql");

test("current Crossroads room scope extends the historical foundation with direct rooms", () => {
  assert.deepEqual(chatRoomScope.enumValues, ["global", "campaign", "direct"]);
  assert.deepEqual(chatMessageStatus.enumValues, ["active", "deleted"]);
});

test("chat schema is registered and defines the contracted room and message relations", () => {
  assert.match(config, /src\/db\/chat-schema\.ts/);
  for (const name of [
    "chatRoomRelations",
    "chatMessageRelations",
    "campaign: one(campaign",
    "messages: many(chatMessage)",
    "room: one(chatRoom",
    "author: one(user",
    "deletedBy: one(user",
    "chatMessageAuthor",
    "chatMessageDeletedBy",
  ]) {
    assert.ok(schema.includes(name), `Missing schema relation contract: ${name}`);
  }
});

test("0013 contains only additive Crossroads DDL and the one stable global-room seed", () => {
  assert.match(migration, /CREATE TYPE "public"\."chat_room_scope" AS ENUM\('global', 'campaign'\)/);
  assert.match(migration, /CREATE TYPE "public"\."chat_message_status" AS ENUM\('active', 'deleted'\)/);
  assert.match(migration, /CREATE TABLE "chat_room"/);
  assert.match(migration, /CREATE TABLE "chat_message"/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|RENAME)\b|ALTER TABLE "(?!chat_room|chat_message)/i);
  assert.equal((migration.match(/INSERT INTO "chat_room"/g) ?? []).length, 1);
  assert.equal((migration.match(/'crossroads'/g) ?? []).length, 1);
  assert.match(migration, /VALUES \('crossroads', 'The Crossroads', 'global', NULL, false\)/);
  assert.doesNotMatch(migration, /INSERT INTO "chat_message"/);
});

test("0013 preserves the routing, lifecycle, idempotency, indexing, and audit protections", () => {
  for (const name of [
    "chat_room_slug_valid",
    "chat_room_name_valid",
    "chat_room_scope_campaign_valid",
    "chat_message_client_request_id_valid",
    "chat_message_content_valid",
    "chat_message_deletion_reason_length_valid",
    "chat_message_lifecycle_valid",
    "chat_room_slug_uq",
    "chat_room_campaign_id_idx",
    "chat_message_author_request_uq",
    "chat_message_room_history_idx",
    "chat_message_author_history_idx",
  ]) {
    assert.ok(migration.includes(`"${name}"`), `Migration is missing ${name}.`);
  }
  assert.match(migration, /"room_id"\) REFERENCES "public"\."chat_room"\("id"\) ON DELETE cascade/);
  assert.match(migration, /"campaign_id"\) REFERENCES "public"\."campaign"\("id"\) ON DELETE cascade/);
  assert.match(migration, /"author_user_id"\) REFERENCES "public"\."user"\("id"\) ON DELETE restrict/);
  assert.match(migration, /"deleted_by_user_id"\) REFERENCES "public"\."user"\("id"\) ON DELETE restrict/);
});

test("historical migration SQL from 0000 through 0012 remains byte-identical", () => {
  for (const [filename, expected] of Object.entries(historicalMigrationHashes)) {
    assert.equal(sha256(`drizzle/${filename}`), expected, `${filename} changed.`);
  }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { chatRoomScope } from "@/db/chat-schema";

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
  "0013_chat_foundation.sql": "71493577882D33284435EBE18445F8F01FF0854638F643DB8C9BE6E90DBC5DFF",
} as const;

const schema = source("src/db/chat-schema.ts");
const migration = source("drizzle/0014_chat_room_membership.sql");

test("the current room enum and membership schema define the complete room model", () => {
  assert.deepEqual(chatRoomScope.enumValues, ["global", "campaign", "direct"]);
  for (const contract of [
    '"chat_room_member"',
    'primaryKey({ columns: [table.roomId, table.userId] })',
    'index("chat_room_member_user_room_idx").on(table.userId, table.roomId)',
    'onDelete: "cascade"',
    "members: many(chatRoomMember)",
    "chatRoomMemberRelations",
  ]) assert.ok(schema.includes(contract), `Missing room-membership schema contract: ${contract}`);
});

test("0014 is additive except for the necessary room-scope check replacement", () => {
  assert.match(migration, /ALTER TYPE "public"\."chat_room_scope" ADD VALUE 'direct'/);
  assert.match(migration, /CREATE TABLE "chat_room_member"/);
  assert.match(migration, /DROP CONSTRAINT "chat_room_scope_campaign_valid"/);
  assert.match(migration, /ADD CONSTRAINT "chat_room_scope_campaign_valid" CHECK/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE "chat_room"|CREATE TABLE "chat_(?:room|message)"/i);
  assert.equal((migration.match(/DROP CONSTRAINT/g) ?? []).length, 1);
});

test("0014 avoids unsafe use of the new enum literal in its replacement constraint", () => {
  const constraint = migration.slice(migration.indexOf('ADD CONSTRAINT "chat_room_scope_campaign_valid"'))
    .split("--> statement-breakpoint")[0];
  assert.match(constraint, /scope" = 'campaign'/);
  assert.match(constraint, /scope" <> 'campaign'/);
  assert.doesNotMatch(constraint, /'direct'/);
});

test("0014 creates indexed cascading membership and conflict-safe stable Campaign backfill", () => {
  assert.match(migration, /PRIMARY KEY\("room_id","user_id"\)/);
  assert.match(migration, /chat_room_member_user_room_idx.*\("user_id","room_id"\)/);
  assert.match(migration, /chat_room_member[\s\S]*room_id[\s\S]*ON DELETE cascade/i);
  assert.match(migration, /chat_room_member[\s\S]*user_id[\s\S]*ON DELETE cascade/i);
  assert.match(migration, /'campaign-' \|\| "campaign"\."id" \|\| '-general'/);
  assert.match(migration, /left\(trim\("campaign"\."name"\), 95\) \|\| ' Chat'/);
  assert.match(migration, /ON CONFLICT \("slug"\) DO NOTHING/);
  assert.doesNotMatch(migration, /INSERT INTO "chat_message"|direct-[a-f0-9]/);
});

test("migrations 0000 through 0013 remain byte-identical", () => {
  for (const [filename, expected] of Object.entries(historicalMigrationHashes)) {
    assert.equal(sha256(`drizzle/${filename}`), expected, `${filename} changed.`);
  }
});

test("Campaign creation and rename synchronize only the shared general-room identity inside transactions", () => {
  const creation = source("src/app/heavens/campaigns/new/actions.ts");
  const editing = source("src/app/heavens/campaigns/actions.ts");
  for (const action of [creation, editing]) {
    assert.match(action, /db\.transaction\(async \(tx\) =>/);
    assert.match(action, /synchronizeCampaignGeneralChatRoomInTransaction\(tx/);
  }
  assert.doesNotMatch(creation, /campaign-.*-general|Campaign Chat|Private Conversation/);
  assert.doesNotMatch(editing, /campaign-.*-general|Campaign Chat|Private Conversation/);
});

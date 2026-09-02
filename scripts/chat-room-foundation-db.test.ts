import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import pg, { type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Chat room-foundation validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Chat room-foundation tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Chat room-foundation tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const pool = new pg.Pool({ connectionString });
const schemaName = `chat_room_foundation_${process.pid}_${Date.now()}`;
if (!/^chat_room_foundation_[0-9]+_[0-9]+$/.test(schemaName)) {
  throw new Error("Disposable Chat room-foundation schema name is unsafe.");
}
const quotedSchema = `"${schemaName}"`;

function migrationSql(first: number, last: number): string {
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset)
    .map((number) => {
      const prefix = String(number).padStart(4, "0");
      const filename = readFileSync(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8");
      const tag = (JSON.parse(filename) as { entries: Array<{ idx: number; tag: string }> }).entries
        .find(({ idx }) => idx === number)?.tag;
      if (!tag) throw new Error(`Migration ${prefix} is missing from the journal.`);
      return readFileSync(join(process.cwd(), "drizzle", `${tag}.sql`), "utf8");
    })
    .join("\n")
    .replaceAll("\"public\".", "")
    .replaceAll("--> statement-breakpoint", "");
}

const migrationsThrough0012 = migrationSql(0, 12);
const migration0013 = migrationSql(13, 13);
const migration0014 = migrationSql(14, 14);
const campaignBackfill = migration0014.slice(migration0014.indexOf('INSERT INTO "chat_room"'));
let savepointSequence = 0;

async function expectDatabaseRejection(
  client: PoolClient,
  operation: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  const savepoint = `chat_room_rejection_${++savepointSequence}`;
  await client.query(`savepoint ${savepoint}`);
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  assert.ok(caught, "Expected the database operation to be rejected.");
  assert.match(caught instanceof Error ? caught.message : String(caught), expected);
}

after(async () => {
  await pool.query(`drop schema if exists ${quotedSchema} cascade`);
  const residue = await pool.query<{ schema_name: string | null }>(
    "select to_regnamespace($1)::text as schema_name",
    [schemaName],
  );
  assert.equal(residue.rows[0]?.schema_name, null);
  await pool.end();
});

test("0000 through 0014 safely upgrade a populated pre-Chat site and complete the Chat room model", { timeout: 60_000 }, async () => {
  await pool.query(`create schema ${quotedSchema}`);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local search_path to ${quotedSchema}, public`);
    await client.query(migrationsThrough0012);

    const creatorId = "room-foundation-creator";
    const memberId = "room-foundation-member";
    await client.query(`
      insert into "user" (id,name,email,username) values
        ($1,'Migration Creator','migration-creator@private.invalid','migration-creator'),
        ($2,'Migration Member','migration-member@private.invalid','migration-member')
    `, [creatorId, memberId]);
    await client.query("insert into user_role (user_id,role) values ($1,'god'),($2,'player')", [creatorId, memberId]);

    const campaignNames = ["  Existing Campaign  ", "L".repeat(140), "   ", "Preexisting General"];
    const campaignIds: number[] = [];
    for (const name of campaignNames) {
      const result = await client.query<{ id: number }>(`
        insert into campaign (
          name,overview,attribute_points,skill_points,max_starting_skill,
          points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,
          currency_system,fate_point_method,assigned_fate_points,created_by_user_id
        ) values ($1,'',0,0,0,0,100,0,'Credits','Assigned',0,$2)
        returning id
      `, [name, creatorId]);
      campaignIds.push(result.rows[0]!.id);
    }
    await client.query(
      "insert into campaign_player (campaign_id,user_id) values ($1,$2)",
      [campaignIds[0], memberId],
    );

    assert.equal(
      (await client.query<{ table_name: string | null }>(
        "select to_regclass(current_schema() || '.chat_room')::text as table_name",
      )).rows[0]!.table_name,
      null,
      "The pre-Chat schema unexpectedly exposed Chat rooms.",
    );
    await client.query(migration0013);
    assert.deepEqual((await client.query(
      "select slug,name,scope,campaign_id,is_archived from chat_room where slug='crossroads'",
    )).rows, [{
      slug: "crossroads",
      name: "The Crossroads",
      scope: "global",
      campaign_id: null,
      is_archived: false,
    }]);
    assert.equal(
      Number((await client.query<{ count: string }>("select count(*)::text as count from chat_message")).rows[0]!.count),
      0,
      "0013 must not create sample messages.",
    );
    await client.query(
      "insert into chat_room (slug,name,scope,campaign_id) values ($1,'Already Present','campaign',$2)",
      [`campaign-${campaignIds[3]}-general`, campaignIds[3]],
    );
    const crossroadsId = Number((await client.query<{ id: number }>(
      "select id from chat_room where slug='crossroads'",
    )).rows[0]!.id);
    const existingMessageId = Number((await client.query<{ id: number }>(`
      insert into chat_message (room_id,author_user_id,client_request_id,content)
      values ($1,$2,'before-0014','Existing Crossroads message') returning id
    `, [crossroadsId, creatorId])).rows[0]!.id);

    await client.query(migration0014);

    assert.deepEqual((await client.query(
      "select id,name from \"user\" where id=any($1::text[]) order by id",
      [[creatorId, memberId]],
    )).rows, [
      { id: creatorId, name: "Migration Creator" },
      { id: memberId, name: "Migration Member" },
    ]);
    assert.equal(
      Number((await client.query<{ count: string }>(
        "select count(*)::text as count from campaign where id=any($1::int[])",
        [campaignIds],
      )).rows[0]!.count),
      4,
      "The Chat upgrade changed existing Campaign records.",
    );
    assert.deepEqual((await client.query(
      "select campaign_id,user_id from campaign_player where campaign_id=$1 and user_id=$2",
      [campaignIds[0], memberId],
    )).rows, [{ campaign_id: campaignIds[0], user_id: memberId }]);
    assert.equal(
      Number((await client.query<{ count: string }>(
        "select count(*)::text as count from chat_room where slug='crossroads' and scope='global'",
      )).rows[0]!.count),
      1,
      "The complete upgrade must retain exactly one global Crossroads room.",
    );

    const enumValues = await client.query<{ value: string }>(`
      select enumlabel as value from pg_enum
      join pg_type on pg_type.oid=pg_enum.enumtypid
      join pg_namespace on pg_namespace.oid=pg_type.typnamespace
      where pg_type.typname='chat_room_scope' and pg_namespace.nspname=current_schema()
      order by enumsortorder
    `);
    assert.deepEqual(enumValues.rows.map(({ value }) => value), ["global", "campaign", "direct"]);
    const backfilled = await client.query<{ campaign_id: number; slug: string; name: string }>(`
      select campaign_id,slug,name from chat_room
      where campaign_id=any($1::int[]) and slug like 'campaign-%-general'
      order by campaign_id
    `, [campaignIds]);
    assert.equal(backfilled.rows.length, 4, "Expected four existing Campaigns to have one general room each.");
    assert.deepEqual(backfilled.rows.map(({ campaign_id, slug }) => ({ campaign_id, slug })), campaignIds.map((id) => ({
      campaign_id: id,
      slug: `campaign-${id}-general`,
    })));
    assert.equal(backfilled.rows[0].name, "Existing Campaign Chat");
    assert.equal(backfilled.rows[1].name.length, 100);
    assert.equal(backfilled.rows[2].name, "Campaign Chat");
    assert.equal(backfilled.rows[3].name, "Already Present");
    await client.query(campaignBackfill);
    assert.equal(Number((await client.query<{ count: string }>(`
      select count(*)::text as count from chat_room
      where campaign_id=any($1::int[]) and slug like 'campaign-%-general'
    `, [campaignIds])).rows[0]!.count), 4, "Campaign backfill was not duplicate-safe.");

    assert.deepEqual((await client.query(
      "select slug from chat_room where id=$1",
      [crossroadsId],
    )).rows, [{ slug: "crossroads" }]);
    assert.deepEqual((await client.query(
      "select content,status from chat_message where id=$1",
      [existingMessageId],
    )).rows, [{ content: "Existing Crossroads message", status: "active" }]);

    const directRoomId = Number((await client.query<{ id: number }>(
      "insert into chat_room (slug,name,scope,campaign_id) values ('direct-valid','Private Conversation','direct',null) returning id",
    )).rows[0]!.id);
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope,campaign_id) values ('direct-invalid','Direct Invalid','direct',$1)", [campaignIds[0]]),
      /chat_room_scope_campaign_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope,campaign_id) values ('global-invalid','Global Invalid','global',$1)", [campaignIds[0]]),
      /chat_room_scope_campaign_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope) values ('campaign-invalid','Campaign Invalid','campaign')"),
      /chat_room_scope_campaign_valid/,
    );

    await client.query("insert into chat_room_member (room_id,user_id) values ($1,$2),($1,$3)", [directRoomId, creatorId, memberId]);
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room_member (room_id,user_id) values ($1,$2)", [directRoomId, creatorId]),
      /chat_room_member_room_id_user_id_pk|duplicate key/i,
    );
    const memberIndex = await client.query<{ indexdef: string }>(`
      select indexdef from pg_indexes
      where schemaname=current_schema() and indexname='chat_room_member_user_room_idx'
    `);
    assert.match(memberIndex.rows[0]?.indexdef ?? "", /\(user_id, room_id\)$/);

    const userCascadeRoomId = Number((await client.query<{ id: number }>(
      "insert into chat_room (slug,name,scope) values ('direct-user-cascade','Private Conversation','direct') returning id",
    )).rows[0]!.id);
    const cascadeUserId = "room-foundation-cascade-user";
    await client.query(
      "insert into \"user\" (id,name,email,username) values ($1,'Cascade User','cascade-user@private.invalid','cascade-user')",
      [cascadeUserId],
    );
    await client.query("insert into chat_room_member (room_id,user_id) values ($1,$2)", [userCascadeRoomId, cascadeUserId]);
    await client.query("delete from \"user\" where id=$1", [cascadeUserId]);
    assert.equal(Number((await client.query<{ count: string }>(
      "select count(*)::text as count from chat_room_member where room_id=$1",
      [userCascadeRoomId],
    )).rows[0]!.count), 0);

    await client.query("delete from chat_room where id=$1", [directRoomId]);
    assert.equal(Number((await client.query<{ count: string }>(
      "select count(*)::text as count from chat_room_member where room_id=$1",
      [directRoomId],
    )).rows[0]!.count), 0);

    const campaignRoomId = Number((await client.query<{ id: number }>(
      "select id from chat_room where slug=$1",
      [`campaign-${campaignIds[0]}-general`],
    )).rows[0]!.id);
    const campaignMessageId = Number((await client.query<{ id: number }>(`
      insert into chat_message (room_id,author_user_id,client_request_id,content)
      values ($1,$2,'campaign-cascade','Campaign cascade') returning id
    `, [campaignRoomId, creatorId])).rows[0]!.id);
    await client.query("delete from campaign where id=$1", [campaignIds[0]]);
    assert.deepEqual((await client.query(`
      select
        (select count(*)::int from chat_room where id=$1) as rooms,
        (select count(*)::int from chat_message where id=$2) as messages
    `, [campaignRoomId, campaignMessageId])).rows, [{ rooms: 0, messages: 0 }]);

    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
});

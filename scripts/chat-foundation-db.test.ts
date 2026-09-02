import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { join } from "node:path";

import pg, { type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Crossroads schema validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Crossroads schema tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Crossroads schema tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const pool = new pg.Pool({ connectionString });
const migration = readFileSync(join(process.cwd(), "drizzle/0013_chat_foundation.sql"), "utf8")
  .replaceAll("--> statement-breakpoint", "");
let savepointSequence = 0;

function failureText(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` ${error.cause.message}` : "";
    return `${error.message}${cause}`;
  }
  return String(error);
}

async function expectDatabaseRejection(
  client: PoolClient,
  operation: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  const savepoint = `chat_rejection_${++savepointSequence}`;
  await client.query(`savepoint ${savepoint}`);
  let caught: unknown = null;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  assert.ok(caught, "Expected the database to reject the operation.");
  assert.match(failureText(caught), expected);
}

after(async () => {
  await pool.end();
});

test("0013 enforces the complete Crossroads schema contract in an isolated transaction", { timeout: 30_000 }, async () => {
  const client = await pool.connect();
  const marker = `chat-test-${crypto.randomUUID()}`;
  const authorId = `${marker}-author`;
  const deletingUserId = `${marker}-deleter`;
  let roomTableExistedBefore = false;
  try {
    await client.query("begin");
    const existing = await client.query<{ table_name: string | null }>("select to_regclass('public.chat_room')::text as table_name");
    roomTableExistedBefore = existing.rows[0]?.table_name !== null;
    const migrationAppliedInTest = !roomTableExistedBefore;
    if (migrationAppliedInTest) await client.query(migration);

    const roomScopes = await client.query<{ value: string }>(`
      select enumlabel as value
      from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'chat_room_scope'
      order by enumsortorder
    `);
    const expectedRoomScopes = migrationAppliedInTest
      ? ["global", "campaign"]
      : ["global", "campaign", "direct"];
    assert.deepEqual(roomScopes.rows.map(({ value }) => value), expectedRoomScopes);
    const messageStatuses = await client.query<{ value: string }>(`
      select enumlabel as value
      from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'chat_message_status'
      order by enumsortorder
    `);
    assert.deepEqual(messageStatuses.rows.map(({ value }) => value), ["active", "deleted"]);

    const seeded = await client.query<{
      slug: string;
      name: string;
      scope: string;
      campaign_id: number | null;
      is_archived: boolean;
    }>("select slug,name,scope,campaign_id,is_archived from chat_room where slug='crossroads'");
    assert.deepEqual(seeded.rows, [{
      slug: "crossroads",
      name: "The Crossroads",
      scope: "global",
      campaign_id: null,
      is_archived: false,
    }]);
    if (migrationAppliedInTest) {
      assert.equal((await client.query<{ count: string }>("select count(*)::text as count from chat_message")).rows[0]?.count, "0");
    }

    await client.query(
      `insert into "user" (id,name,email,username) values
        ($1,'Crossroads Test Author',$2,$1),
        ($3,'Crossroads Test Deleter',$4,$3)`,
      [authorId, `${authorId}@example.invalid`, deletingUserId, `${deletingUserId}@example.invalid`],
    );
    const campaignResult = await client.query<{ id: number }>(`
      insert into campaign (
        name,overview,attribute_points,skill_points,max_starting_skill,
        points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,
        currency_system,fate_point_method,assigned_fate_points,created_by_user_id
      ) values ($1,'',0,0,0,0,100,0,'Credits','Assigned',0,$2)
      returning id
    `, [`${marker} Campaign`, authorId]);
    const campaignId = campaignResult.rows[0]!.id;
    const crossroadsId = (await client.query<{ id: number }>("select id from chat_room where slug='crossroads'")).rows[0]!.id;

    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope,campaign_id) values ($1,'Invalid Global','global',$2)", [`${marker}-global-campaign`, campaignId]),
      /chat_room_scope_campaign_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope) values ($1,'Invalid Campaign','campaign')", [`${marker}-campaign-null`]),
      /chat_room_scope_campaign_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope) values ('crossroads','Duplicate','global')"),
      /chat_room_slug_uq|duplicate key/i,
    );
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope) values ('Not Safe','Unsafe','global')"),
      /chat_room_slug_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope) values ($1,'Oversized Slug','global')", ["a".repeat(81)]),
      /chat_room_slug_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope) values ($1,'','global')", [`${marker}-empty-name`]),
      /chat_room_name_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => client.query("insert into chat_room (slug,name,scope) values ($1,$2,'global')", [`${marker}-long-name`, "N".repeat(101)]),
      /chat_room_name_valid/,
    );

    const campaignRoomOne = (await client.query<{ id: number }>(
      "insert into chat_room (slug,name,scope,campaign_id) values ($1,'Campaign Room One','campaign',$2) returning id",
      [`${marker}-campaign-one`, campaignId],
    )).rows[0]!.id;
    await client.query(
      "insert into chat_room (slug,name,scope,campaign_id) values ($1,'Campaign Room Two','campaign',$2)",
      [`${marker}-campaign-two`, campaignId],
    );

    const insertMessage = (requestId: string, content: string, extraSql = "", extraValues: unknown[] = []) => client.query(
      `insert into chat_message (room_id,author_user_id,client_request_id,content${extraSql ? `,${extraSql}` : ""})
       values ($1,$2,$3,$4${extraValues.map((_, index) => `,$${index + 5}`).join("")})`,
      [crossroadsId, authorId, requestId, content, ...extraValues],
    );

    await expectDatabaseRejection(client, () => insertMessage(`${marker}-empty`, ""), /chat_message_content_valid/);
    await expectDatabaseRejection(client, () => insertMessage(`${marker}-spaces`, "   \n\t"), /chat_message_content_valid/);
    await expectDatabaseRejection(client, () => insertMessage(`${marker}-long`, "M".repeat(1001)), /chat_message_content_valid/);
    await expectDatabaseRejection(client, () => insertMessage("   ", "Invalid request ID"), /chat_message_client_request_id_valid/);
    await expectDatabaseRejection(client, () => insertMessage("R".repeat(101), "Invalid request ID"), /chat_message_client_request_id_valid/);

    await insertMessage(`${marker}-duplicate`, "First delivery");
    await expectDatabaseRejection(
      client,
      () => insertMessage(`${marker}-duplicate`, "Second delivery"),
      /chat_message_author_request_uq|duplicate key/i,
    );
    await expectDatabaseRejection(
      client,
      () => insertMessage(`${marker}-active-deleted`, "Invalid active lifecycle", "status,deleted_at,deleted_by_user_id", ["active", new Date(), deletingUserId]),
      /chat_message_lifecycle_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => insertMessage(`${marker}-deleted-time`, "Missing deletion time", "status,deleted_by_user_id", ["deleted", deletingUserId]),
      /chat_message_lifecycle_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => insertMessage(`${marker}-deleted-user`, "Missing deleting User", "status,deleted_at", ["deleted", new Date()]),
      /chat_message_lifecycle_valid/,
    );
    await expectDatabaseRejection(
      client,
      () => insertMessage(`${marker}-reason-long`, "Long reason", "status,deleted_at,deleted_by_user_id,deletion_reason", ["deleted", new Date(), deletingUserId, "R".repeat(501)]),
      /chat_message_deletion_reason_length_valid/,
    );

    await insertMessage(
      `${marker}-deleted-valid`,
      "Valid deleted history",
      "status,deleted_at,deleted_by_user_id",
      ["deleted", new Date(), deletingUserId],
    );
    await expectDatabaseRejection(
      client,
      () => client.query("delete from \"user\" where id=$1", [deletingUserId]),
      /chat_message_deleted_by_user_id_user_id_fk|foreign key/i,
    );

    const auditUserId = `${marker}-audit-author`;
    await client.query("insert into \"user\" (id,name,email,username) values ($1,'Audit Author',$2,$1)", [auditUserId, `${auditUserId}@example.invalid`]);
    await client.query(
      "insert into chat_message (room_id,author_user_id,client_request_id,content) values ($1,$2,$3,'Audit history')",
      [crossroadsId, auditUserId, `${marker}-audit`],
    );
    await expectDatabaseRejection(
      client,
      () => client.query("delete from \"user\" where id=$1", [auditUserId]),
      /chat_message_author_user_id_user_id_fk|foreign key/i,
    );

    const disposableRoom = (await client.query<{ id: number }>(
      "insert into chat_room (slug,name,scope) values ($1,'Disposable Room','global') returning id",
      [`${marker}-disposable`],
    )).rows[0]!.id;
    const disposableMessage = (await client.query<{ id: number }>(
      "insert into chat_message (room_id,author_user_id,client_request_id,content) values ($1,$2,$3,'Disposable') returning id",
      [disposableRoom, authorId, `${marker}-disposable-message`],
    )).rows[0]!.id;
    await client.query("delete from chat_room where id=$1", [disposableRoom]);
    assert.equal((await client.query<{ count: string }>("select count(*)::text as count from chat_message where id=$1", [disposableMessage])).rows[0]?.count, "0");

    const campaignMessage = (await client.query<{ id: number }>(
      "insert into chat_message (room_id,author_user_id,client_request_id,content) values ($1,$2,$3,'Campaign history') returning id",
      [campaignRoomOne, authorId, `${marker}-campaign-message`],
    )).rows[0]!.id;
    await client.query("delete from campaign where id=$1", [campaignId]);
    assert.equal((await client.query<{ count: string }>("select count(*)::text as count from chat_room where campaign_id=$1", [campaignId])).rows[0]?.count, "0");
    assert.equal((await client.query<{ count: string }>("select count(*)::text as count from chat_message where id=$1", [campaignMessage])).rows[0]?.count, "0");

    const indexes = await client.query<{ indexname: string; indexdef: string }>(`
      select indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('chat_room','chat_message')
    `);
    const byName = new Map(indexes.rows.map(({ indexname, indexdef }) => [indexname, indexdef]));
    assert.match(byName.get("chat_room_campaign_id_idx") ?? "", /\(campaign_id\)$/);
    assert.match(byName.get("chat_message_room_history_idx") ?? "", /\(room_id, created_at, id\)$/);
    assert.match(byName.get("chat_message_author_history_idx") ?? "", /\(author_user_id, created_at, id\)$/);
    assert.match(byName.get("chat_message_author_request_uq") ?? "", /UNIQUE.*\(author_user_id, client_request_id\)/);

    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    const afterward = await client.query<{ table_name: string | null }>("select to_regclass('public.chat_room')::text as table_name");
    assert.equal(afterward.rows[0]?.table_name !== null, roomTableExistedBefore, "The isolated test changed installed chat-schema state.");
    client.release();
  }
});

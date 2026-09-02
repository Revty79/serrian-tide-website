import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { sql } from "drizzle-orm";
import pg from "pg";

import { db } from "@/db";
import { pool as applicationPool } from "@/db";
import { ChatError } from "@/features/chat/chat";
import {
  deleteChatMessageInTransaction,
  loadChatHistoryInTransaction,
  postChatMessageInTransaction,
  type ChatTransaction,
} from "@/features/chat/chat-service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Crossroads service validation.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing Crossroads service tests against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Crossroads service tests against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const setupPool = new pg.Pool({ connectionString });
const schemaName = `chat_service_${process.pid}_${Date.now()}`;
if (!/^chat_service_[0-9]+_[0-9]+$/.test(schemaName)) {
  throw new Error("Disposable Chat schema name is unsafe.");
}
const quotedSchema = `"${schemaName}"`;
const localSearchPath = `set local search_path to ${quotedSchema}, public`;
const migration = readFileSync(join(process.cwd(), "drizzle/0013_chat_foundation.sql"), "utf8")
  .replaceAll("\"public\".", "")
  .replaceAll("--> statement-breakpoint", "");

const ids = {
  author: "chat-author",
  other: "chat-other",
  admin: "chat-admin",
  god: "chat-god",
  creator: "chat-creator",
  member: "chat-member",
  unrelated: "chat-unrelated",
  noRole: "chat-no-role",
  duplicate: "chat-duplicate",
  fast: "chat-fast",
  volume: "chat-volume",
  pager: "chat-pager",
} as const;

let campaignId = 0;
let crossroadsRoomId = 0;
let campaignRoomId = 0;
let archivedRoomId = 0;
let paginationRoomId = 0;

async function setupQuery(text: string, values: unknown[] = []): Promise<pg.QueryResult> {
  const client = await setupPool.connect();
  try {
    await client.query("begin");
    await client.query(localSearchPath);
    const result = await client.query(text, values);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function withChatTransaction<T>(operation: (tx: ChatTransaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(localSearchPath));
    return operation(tx);
  });
}

async function expectChatError(
  operation: () => Promise<unknown>,
  code: ChatError["code"],
): Promise<ChatError> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof ChatError, `Expected ChatError ${code}, received ${String(caught)}`);
  assert.equal(caught.code, code);
  return caught;
}

function load(userId: string, roomSlug = "crossroads", cursor?: string | null) {
  return withChatTransaction((tx) => loadChatHistoryInTransaction(tx, userId, { roomSlug, cursor }));
}

function post(userId: string, requestId: string, content: string, roomSlug = "crossroads") {
  return withChatTransaction((tx) => postChatMessageInTransaction(tx, userId, {
    roomSlug,
    clientRequestId: requestId,
    content,
  }));
}

function remove(userId: string, messageId: number, reason?: string, roomSlug = "crossroads") {
  return withChatTransaction((tx) => deleteChatMessageInTransaction(tx, userId, {
    roomSlug,
    messageId,
    reason,
  }));
}

before(async () => {
  await setupPool.query(`create schema ${quotedSchema}`);
  try {
    await setupQuery(`
      create table "user" (
        id text primary key,
        name text not null,
        email text not null unique,
        email_verified boolean default false not null,
        image text,
        created_at timestamp default now() not null,
        updated_at timestamp default now() not null,
        username text unique,
        display_username text
      );
      create type serrian_role as enum ('admin','god','player');
      create table user_role (
        user_id text not null references "user"(id) on delete cascade,
        role serrian_role not null,
        created_at timestamp default now() not null,
        primary key (user_id, role)
      );
      create table campaign (
        id serial primary key,
        created_by_user_id text not null references "user"(id)
      );
      create table campaign_player (
        campaign_id integer not null references campaign(id) on delete cascade,
        user_id text not null references "user"(id) on delete cascade,
        is_npc_controller boolean default false not null,
        created_at timestamp default now() not null,
        primary key (campaign_id, user_id)
      );
      ${migration}
    `);

    for (const [key, userId] of Object.entries(ids)) {
      await setupQuery(
        `insert into "user" (id,name,email,username,display_username) values ($1,$2,$3,$4,$5)`,
        [userId, `${key} Account Name`, `${key}@private.invalid`, `${key}-username`, key === "author" ? "Visible Author" : null],
      );
    }
    const roles: Array<[string, "admin" | "god" | "player"]> = [
      [ids.author, "player"],
      [ids.other, "player"],
      [ids.admin, "admin"],
      [ids.god, "god"],
      [ids.creator, "god"],
      [ids.member, "player"],
      [ids.unrelated, "player"],
      [ids.duplicate, "player"],
      [ids.fast, "player"],
      [ids.volume, "player"],
      [ids.pager, "player"],
    ];
    for (const [userId, role] of roles) {
      await setupQuery("insert into user_role (user_id,role) values ($1,$2)", [userId, role]);
    }
    campaignId = Number((await setupQuery(
      "insert into campaign (created_by_user_id) values ($1) returning id",
      [ids.creator],
    )).rows[0].id);
    await setupQuery("insert into campaign_player (campaign_id,user_id) values ($1,$2)", [campaignId, ids.member]);
    crossroadsRoomId = Number((await setupQuery("select id from chat_room where slug='crossroads'")).rows[0].id);
    campaignRoomId = Number((await setupQuery(
      "insert into chat_room (slug,name,scope,campaign_id) values ('campaign-room','Campaign Room','campaign',$1) returning id",
      [campaignId],
    )).rows[0].id);
    archivedRoomId = Number((await setupQuery(
      "insert into chat_room (slug,name,scope,is_archived) values ('archived-room','Archived Room','global',true) returning id",
    )).rows[0].id);
    paginationRoomId = Number((await setupQuery(
      "insert into chat_room (slug,name,scope) values ('pagination-room','Pagination Room','global') returning id",
    )).rows[0].id);
  } catch (error) {
    await setupPool.query(`drop schema if exists ${quotedSchema} cascade`).catch(() => undefined);
    throw error;
  }
});

after(async () => {
  await setupPool.query(`drop schema if exists ${quotedSchema} cascade`);
  const residue = await setupPool.query<{ schema_name: string | null }>(
    "select to_regnamespace($1)::text as schema_name",
    [schemaName],
  );
  assert.equal(residue.rows[0]?.schema_name, null, "The disposable Chat service schema was not removed.");
  await Promise.all([setupPool.end(), applicationPool.end()]);
});

test("Crossroads service enforces access, posting, pagination, and soft deletion", { timeout: 60_000 }, async (t) => {
  await t.test("signed-out identity and signed-in accounts without a current role are rejected", async () => {
    await expectChatError(() => load("missing-session-user"), "AUTH_REQUIRED");
    await expectChatError(() => load(ids.noRole), "ACCESS_DENIED");
    await expectChatError(() => post(ids.noRole, "no-role-post", "Denied"), "ACCESS_DENIED");
  });

  await t.test("all three roles access global history", async () => {
    for (const userId of [ids.admin, ids.god, ids.author]) {
      assert.equal((await load(userId)).room.slug, "crossroads");
    }
  });

  await t.test("Campaign creator and member access succeeds while an unrelated user learns nothing", async () => {
    assert.equal((await load(ids.creator, "campaign-room")).room.scope, "campaign");
    assert.equal((await load(ids.member, "campaign-room")).room.scope, "campaign");
    const inaccessible = await expectChatError(() => load(ids.unrelated, "campaign-room"), "ROOM_UNAVAILABLE");
    const missing = await expectChatError(() => load(ids.unrelated, "missing-room"), "ROOM_UNAVAILABLE");
    assert.equal(inaccessible.message, missing.message);
  });

  await t.test("archived rooms remain readable and reject only new posts", async () => {
    const page = await load(ids.author, "archived-room");
    assert.equal(page.room.archived, true);
    await expectChatError(() => post(ids.author, "archived-new", "No new posts", "archived-room"), "ROOM_ARCHIVED");
  });

  await t.test("author identity is server-derived and markup-like text remains exact plain data", async () => {
    const content = "  <b onclick=alert(1)>not trusted HTML</b>\nsecond  line  ";
    const result = await post(ids.author, "identity-post", content);
    assert.equal(result.created, true);
    assert.equal(result.message.authorName, "Visible Author");
    assert.equal(result.message.content, content);
    assert.equal("email" in result.message, false);
    assert.equal("authorUserId" in result.message, false);
    const persisted = await setupQuery(
      "select author_user_id,content,status from chat_message where id=$1",
      [result.message.id],
    );
    assert.deepEqual(persisted.rows, [{ author_user_id: ids.author, content, status: "active" }]);
  });

  await t.test("message validation fails before persistence", async () => {
    await expectChatError(() => post(ids.other, "empty-content", " \n\t"), "INVALID_INPUT");
    await expectChatError(() => post(ids.other, "long-content", "x".repeat(1001)), "INVALID_INPUT");
    await expectChatError(() => post(ids.other, " bad-request-id", "content"), "INVALID_INPUT");
  });

  await t.test("exact retry returns the original even during rate limiting", async () => {
    const first = await post(ids.other, "exact-retry", "Delivered once");
    const retry = await post(ids.other, "exact-retry", "Delivered once");
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.message.id, first.message.id);
    assert.equal((await setupQuery(
      "select count(*)::int as count from chat_message where author_user_id=$1 and client_request_id='exact-retry'",
      [ids.other],
    )).rows[0].count, 1);
  });

  await t.test("request IDs collide on changed content or room", async () => {
    await expectChatError(() => post(ids.other, "exact-retry", "Changed"), "REQUEST_ID_COLLISION");
    await expectChatError(() => post(ids.other, "exact-retry", "Delivered once", "campaign-room"), "ROOM_UNAVAILABLE");
    await setupQuery("insert into campaign_player (campaign_id,user_id) values ($1,$2)", [campaignId, ids.other]);
    await expectChatError(() => post(ids.other, "exact-retry", "Delivered once", "campaign-room"), "REQUEST_ID_COLLISION");
  });

  await t.test("concurrent duplicate submissions serialize and create exactly one row", async () => {
    const input = [
      post(ids.duplicate, "concurrent-duplicate", "Only one row"),
      post(ids.duplicate, "concurrent-duplicate", "Only one row"),
    ];
    const results = await Promise.all(input);
    assert.deepEqual(results.map(({ created }) => created).sort(), [false, true]);
    assert.equal(results[0].message.id, results[1].message.id);
    assert.equal((await setupQuery(
      "select count(*)::int as count from chat_message where author_user_id=$1 and client_request_id='concurrent-duplicate'",
      [ids.duplicate],
    )).rows[0].count, 1);
  });

  await t.test("the one-second database-backed limit is retryable and idempotent retry bypasses it", async () => {
    const first = await post(ids.fast, "fast-one", "First");
    const limited = await expectChatError(() => post(ids.fast, "fast-two", "Second"), "RATE_LIMITED");
    assert.equal(limited.retryable, true);
    assert.ok((limited.retryAfterMs ?? 0) > 0);
    assert.equal((await post(ids.fast, "fast-one", "First")).message.id, first.message.id);
  });

  await t.test("the rolling 20-message database-backed limit rejects message 21", async () => {
    await setupQuery(`
      insert into chat_message (room_id,author_user_id,client_request_id,content,created_at)
      select $1,$2,'volume-' || value,'Volume ' || value,
             clock_timestamp() - interval '2 seconds' - (value * interval '2 seconds')
      from generate_series(1,20) value
    `, [crossroadsRoomId, ids.volume]);
    const limited = await expectChatError(() => post(ids.volume, "volume-21", "Rejected"), "RATE_LIMITED");
    assert.equal(limited.retryable, true);
    const retry = await post(ids.volume, "volume-1", "Volume 1");
    assert.equal(retry.created, false);
  });

  await t.test("newest-50 cursor history is chronological, tie-safe, complete, and duplicate-free", async () => {
    const inserted = await setupQuery(`
      insert into chat_message (room_id,author_user_id,client_request_id,content,created_at)
      select $1,$2,'page-' || value,'Page ' || value,
             timestamp '2026-09-02 12:00:00' + (floor((value - 1) / 2) * interval '1 second')
      from generate_series(1,55) value
      returning id,created_at
    `, [paginationRoomId, ids.pager]);
    const insertedIds = inserted.rows.map(({ id }) => Number(id));
    const firstPage = await load(ids.pager, "pagination-room");
    assert.equal(firstPage.messages.length, 50);
    assert.equal(firstPage.hasOlder, true);
    assert.ok(firstPage.olderCursor);
    const firstPagePager = firstPage.messages.filter(({ id }) => insertedIds.includes(id));
    assert.equal(firstPagePager.length, 50);
    const older = await load(ids.pager, "pagination-room", firstPage.olderCursor);
    const olderPager = older.messages.filter(({ id }) => insertedIds.includes(id));
    assert.equal(olderPager.length, 5);
    assert.equal(older.hasOlder, false);
    const allPagerIds = [...olderPager, ...firstPagePager].map(({ id }) => id);
    assert.equal(new Set(allPagerIds).size, 55);
    assert.deepEqual(new Set(allPagerIds), new Set(insertedIds));
    for (const page of [olderPager, firstPagePager]) {
      for (let index = 1; index < page.length; index += 1) {
        const previous = page[index - 1];
        const current = page[index];
        assert.ok(previous.createdAt < current.createdAt || (
          previous.createdAt === current.createdAt && previous.id < current.id
        ));
      }
    }
  });

  await t.test("deleted history is redacted for ordinary users and Admins without leaking private identity", async () => {
    const message = await post(ids.creator, "redaction-message", "Stored secret content", "campaign-room");
    await remove(ids.creator, message.message.id, "cleanup", "campaign-room");
    for (const reader of [ids.creator, ids.admin]) {
      if (reader === ids.admin) {
        await setupQuery("insert into campaign_player (campaign_id,user_id) values ($1,$2)", [campaignId, ids.admin]);
      }
      const dto = (await load(reader, "campaign-room")).messages.find(({ id }) => id === message.message.id)!;
      assert.equal(dto.deleted, true);
      assert.equal(dto.content, null);
      assert.equal(dto.canDelete, false);
      const serialized = JSON.stringify(dto);
      assert.doesNotMatch(serialized, /private\.invalid|Stored secret content|deletedBy|deletionReason|authorUserId/);
    }
  });

  await t.test("authors soft-delete their own messages with complete lifecycle data and repeat safely", async () => {
    await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.author]);
    const posted = await post(ids.author, "author-delete", "Retained in storage");
    const deleted = await remove(ids.author, posted.message.id, "  author request  ");
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.content, null);
    const repeated = await remove(ids.author, posted.message.id, "different ignored reason");
    assert.equal(repeated.id, deleted.id);
    const stored = await setupQuery(`
      select status,deleted_at is not null as has_deleted_at,deleted_by_user_id,deletion_reason,content
      from chat_message where id=$1
    `, [posted.message.id]);
    assert.deepEqual(stored.rows, [{
      status: "deleted",
      has_deleted_at: true,
      deleted_by_user_id: ids.author,
      deletion_reason: "author request",
      content: "Retained in storage",
    }]);
  });

  await t.test("another author and a G.O.D. cannot moderate a global message and failure changes nothing", async () => {
    await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.other]);
    const posted = await post(ids.other, "protected-message", "Still active");
    await expectChatError(() => remove(ids.author, posted.message.id), "ACCESS_DENIED");
    await expectChatError(() => remove(ids.god, posted.message.id), "ACCESS_DENIED");
    assert.deepEqual((await setupQuery(
      "select status,deleted_at,deleted_by_user_id,deletion_reason,content from chat_message where id=$1",
      [posted.message.id],
    )).rows, [{
      status: "active",
      deleted_at: null,
      deleted_by_user_id: null,
      deletion_reason: "",
      content: "Still active",
    }]);
  });

  await t.test("an Admin soft-deletes another user's accessible message without hard deletion", async () => {
    const target = (await setupQuery(
      "select id from chat_message where author_user_id=$1 and client_request_id='protected-message'",
      [ids.other],
    )).rows[0];
    const deleted = await remove(ids.admin, Number(target.id), "admin moderation");
    assert.equal(deleted.deleted, true);
    const stored = await setupQuery(
      "select count(*)::int as count,status,deleted_by_user_id,content from chat_message where id=$1 group by status,deleted_by_user_id,content",
      [target.id],
    );
    assert.deepEqual(stored.rows, [{
      count: 1,
      status: "deleted",
      deleted_by_user_id: ids.admin,
      content: "Still active",
    }]);
  });

  assert.ok(campaignRoomId > 0 && archivedRoomId > 0 && paginationRoomId > 0);
});

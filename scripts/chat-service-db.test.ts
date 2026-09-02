import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { sql } from "drizzle-orm";
import pg from "pg";

import { db } from "@/db";
import { pool as applicationPool } from "@/db";
import { setUserRoleInTransaction } from "@/features/authorization/user-role-service";
import { ChatError } from "@/features/chat/chat";
import {
  CHAT_LIVE_CHANNEL,
  parseChatNotificationPayload,
  type ChatInvalidation,
} from "@/features/chat/chat-live-events";
import {
  deleteChatMessageInTransaction,
  getChatWorkspaceBootstrapInTransaction,
  getOrCreateDirectConversationInTransaction,
  listAccessibleChatRoomsInTransaction,
  loadChatHistoryInTransaction,
  loadChatMessageInTransaction,
  postChatMessageInTransaction,
  searchDirectMessageUsersInTransaction,
  synchronizeCampaignGeneralChatRoomInTransaction,
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
const migration = ["0013_chat_foundation.sql", "0014_chat_room_membership.sql"]
  .map((filename) => readFileSync(join(process.cwd(), "drizzle", filename), "utf8"))
  .join("\n")
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

function loadMessage(userId: string, messageId: number, roomSlug = "crossroads") {
  return withChatTransaction((tx) => loadChatMessageInTransaction(tx, userId, {
    roomSlug,
    messageId,
  }));
}

async function waitForInvalidation(
  events: ChatInvalidation[],
  predicate: (event: ChatInvalidation) => boolean,
  timeoutMs = 2_000,
): Promise<ChatInvalidation> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const event = events.find(predicate);
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for a Chat invalidation.");
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

function directory(userId: string) {
  return withChatTransaction((tx) => listAccessibleChatRoomsInTransaction(tx, userId));
}

function direct(actorUserId: string, targetUserId: string) {
  return withChatTransaction((tx) => (
    getOrCreateDirectConversationInTransaction(tx, actorUserId, targetUserId)
  ));
}

function searchUsers(actorUserId: string, search: string) {
  return withChatTransaction((tx) => searchDirectMessageUsersInTransaction(tx, actorUserId, search));
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
        name text not null,
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
      "insert into campaign (name,created_by_user_id) values ('Service Campaign',$1) returning id",
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
    await expectChatError(() => direct(ids.noRole, ids.author), "ACCESS_DENIED");
    await expectChatError(() => searchUsers(ids.noRole, "author"), "ACCESS_DENIED");
  });

  await t.test("all three roles access global history", async () => {
    for (const userId of [ids.admin, ids.god, ids.author]) {
      assert.equal((await load(userId)).room.slug, "crossroads");
    }
  });

  await t.test("the page bootstrap uses the current visible identity and only directory-authorized selection", async () => {
    const selected = await withChatTransaction((tx) => (
      getChatWorkspaceBootstrapInTransaction(tx, ids.author, "campaign-room")
    ));
    assert.equal(selected.displayName, "Visible Author");
    assert.equal(selected.selectedRoomSlug, "crossroads");
    assert.equal(selected.history?.room.slug, "crossroads");
    const campaignSelected = await withChatTransaction((tx) => (
      getChatWorkspaceBootstrapInTransaction(tx, ids.member, "campaign-room")
    ));
    assert.equal(campaignSelected.selectedRoomSlug, "campaign-room");
    assert.equal(campaignSelected.history?.room.scope, "campaign");
  });

  await t.test("Campaign creator and member access succeeds while an unrelated user learns nothing", async () => {
    assert.equal((await load(ids.creator, "campaign-room")).room.scope, "campaign");
    assert.equal((await load(ids.member, "campaign-room")).room.scope, "campaign");
    const inaccessible = await expectChatError(() => load(ids.unrelated, "campaign-room"), "ROOM_UNAVAILABLE");
    const missing = await expectChatError(() => load(ids.unrelated, "missing-room"), "ROOM_UNAVAILABLE");
    assert.equal(inaccessible.message, missing.message);
  });

  await t.test("archived rooms remain readable and reject only new posts", async () => {
    const archivedMessageId = Number((await setupQuery(`
      insert into chat_message (room_id,author_user_id,client_request_id,content,created_at)
      values ($1,$2,'archived-existing','Existing archived content',clock_timestamp()-interval '2 seconds') returning id
    `, [archivedRoomId, ids.author])).rows[0].id);
    const page = await load(ids.author, "archived-room");
    assert.equal(page.room.archived, true);
    assert.equal(page.messages.find(({ id }) => id === archivedMessageId)?.content, "Existing archived content");
    await expectChatError(() => post(ids.author, "archived-new", "No new posts", "archived-room"), "ROOM_ARCHIVED");
    assert.equal((await remove(ids.author, archivedMessageId, undefined, "archived-room")).deleted, true);
    assert.equal((await load(ids.other, "archived-room")).messages.find(({ id }) => id === archivedMessageId)?.content, null);
  });

  await t.test("author identity is server-derived and markup-like text remains exact plain data", async () => {
    const content = "  <b onclick=alert(1)>not trusted HTML</b>\nsecond  line  ";
    const result = await post(ids.author, "identity-post", content);
    assert.equal(result.created, true);
    assert.equal(result.message.authorName, "Visible Author");
    assert.equal(result.message.content, content);
    assert.equal(result.message.isOwn, true);
    assert.equal("email" in result.message, false);
    assert.equal("authorUserId" in result.message, false);
    const otherView = (await load(ids.other)).messages.find(({ id }) => id === result.message.id)!;
    assert.equal(otherView.isOwn, false);
    assert.equal(otherView.canDelete, false);
    const adminView = (await load(ids.admin)).messages.find(({ id }) => id === result.message.id)!;
    assert.equal(adminView.isOwn, false);
    assert.equal(adminView.canDelete, true);
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
    const deleted = await remove(ids.author, posted.message.id);
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
      deletion_reason: "",
      content: "Retained in storage",
    }]);
  });

  await t.test("exact message loading rechecks room access and returns only redacted deletion data", async () => {
    const posted = await post(ids.god, "exact-live-message", "Exact stored content");
    const otherView = await loadMessage(ids.other, posted.message.id);
    assert.equal(otherView.isOwn, false);
    assert.equal(otherView.canDelete, false);
    await remove(ids.god, posted.message.id, "redact exact live message");
    const deleted = await loadMessage(ids.admin, posted.message.id);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.content, null);
    assert.equal(deleted.canDelete, false);
    assert.doesNotMatch(JSON.stringify(deleted), /Exact stored content|deletedBy|deletionReason|authorUserId/);
    await expectChatError(
      () => loadMessage(ids.unrelated, posted.message.id, "campaign-room"),
      "ROOM_UNAVAILABLE",
    );
    await expectChatError(() => loadMessage(ids.other, 2_000_000_000), "MESSAGE_UNAVAILABLE");
  });

  await t.test("concurrent deletion serializes safely and remains idempotent", async () => {
    await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.unrelated]);
    const posted = await post(ids.unrelated, "concurrent-delete", "Delete exactly once");
    const [first, second] = await Promise.all([
      remove(ids.unrelated, posted.message.id),
      remove(ids.unrelated, posted.message.id),
    ]);
    assert.equal(first.id, posted.message.id);
    assert.equal(second.id, posted.message.id);
    assert.equal((await setupQuery(
      "select count(*)::int as count from chat_message where id=$1 and status='deleted'",
      [posted.message.id],
    )).rows[0].count, 1);
  });

  await t.test("committed posts and first deletions notify while rollback and idempotent repeats stay silent", async () => {
    const listener = new pg.Client({ connectionString, application_name: "chat-live-db-test-listener" });
    const events: ChatInvalidation[] = [];
    await listener.connect();
    await listener.query(`LISTEN ${CHAT_LIVE_CHANNEL}`);
    listener.on("notification", (notification) => {
      if (notification.channel !== CHAT_LIVE_CHANNEL) return;
      const event = parseChatNotificationPayload(notification.payload);
      if (event) events.push(event);
    });
    try {
      await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.god]);
      let committedMessageId = 0;
      await withChatTransaction(async (tx) => {
        const posted = await postChatMessageInTransaction(tx, ids.god, {
          roomSlug: "crossroads",
          clientRequestId: "live-committed-post",
          content: "Notification payload must not contain this",
        });
        committedMessageId = posted.message.id;
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(events.some((event) => event.category === "message" && event.messageId === committedMessageId), false);
      });
      const committed = await waitForInvalidation(events, (event) => (
        event.category === "message" && event.messageId === committedMessageId
      ));
      assert.deepEqual(committed, {
        category: "message",
        roomSlug: "crossroads",
        messageId: committedMessageId,
      });
      assert.doesNotMatch(JSON.stringify(committed), /Notification payload|chat-god|private\.invalid/);

      const committedCount = events.filter((event) => (
        event.category === "message" && event.messageId === committedMessageId
      )).length;
      assert.equal((await post(ids.god, "live-committed-post", "Notification payload must not contain this")).created, false);
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(events.filter((event) => (
        event.category === "message" && event.messageId === committedMessageId
      )).length, committedCount);

      let rolledBackMessageId = 0;
      await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.unrelated]);
      await assert.rejects(() => withChatTransaction(async (tx) => {
        const posted = await postChatMessageInTransaction(tx, ids.unrelated, {
          roomSlug: "crossroads",
          clientRequestId: "live-rolled-back-post",
          content: "Must roll back",
        });
        rolledBackMessageId = posted.message.id;
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(events.some((event) => event.category === "message" && event.messageId === rolledBackMessageId), false);
        throw new Error("intentional live rollback");
      }), /intentional live rollback/);
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(events.some((event) => event.category === "message" && event.messageId === rolledBackMessageId), false);
      assert.equal((await setupQuery("select count(*)::int as count from chat_message where id=$1", [rolledBackMessageId])).rows[0].count, 0);

      await remove(ids.god, committedMessageId, "first live deletion");
      await waitForInvalidation(events, (event) => (
        event.category === "message"
        && event.messageId === committedMessageId
        && events.filter((candidate) => candidate.category === "message" && candidate.messageId === committedMessageId).length >= 2
      ));
      const afterFirstDelete = events.filter((event) => event.category === "message" && event.messageId === committedMessageId).length;
      await remove(ids.god, committedMessageId, "repeat live deletion");
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(events.filter((event) => event.category === "message" && event.messageId === committedMessageId).length, afterFirstDelete);

      await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.author]);
      const moderationTarget = await post(ids.author, "live-moderation-target", "Moderation target content");
      await waitForInvalidation(events, (event) => event.category === "message" && event.messageId === moderationTarget.message.id);
      const beforeModeration = events.filter((event) => (
        event.category === "message" && event.messageId === moderationTarget.message.id
      )).length;
      await assert.rejects(() => withChatTransaction(async (tx) => {
        await deleteChatMessageInTransaction(tx, ids.admin, {
          roomSlug: "crossroads",
          messageId: moderationTarget.message.id,
          reason: "must roll back",
        });
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(events.filter((event) => (
          event.category === "message" && event.messageId === moderationTarget.message.id
        )).length, beforeModeration);
        throw new Error("intentional moderation rollback");
      }), /intentional moderation rollback/);
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(events.filter((event) => (
        event.category === "message" && event.messageId === moderationTarget.message.id
      )).length, beforeModeration);
      assert.equal((await setupQuery(
        "select status from chat_message where id=$1",
        [moderationTarget.message.id],
      )).rows[0].status, "active");

      await remove(ids.admin, moderationTarget.message.id, "committed moderation");
      await waitForInvalidation(events, (event) => (
        event.category === "message"
        && event.messageId === moderationTarget.message.id
        && events.filter((candidate) => candidate.category === "message" && candidate.messageId === moderationTarget.message.id).length === beforeModeration + 1
      ));
      assert.equal(events.filter((event) => (
        event.category === "message" && event.messageId === moderationTarget.message.id
      )).length, beforeModeration + 1);
    } finally {
      await listener.query(`UNLISTEN ${CHAT_LIVE_CHANNEL}`).catch(() => undefined);
      await listener.end().catch(() => undefined);
    }
  });

  await t.test("another author and a G.O.D. cannot moderate a global message and failure changes nothing", async () => {
    await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.other]);
    const posted = await post(ids.other, "protected-message", "Still active");
    await expectChatError(() => remove(ids.author, posted.message.id), "MODERATION_DENIED");
    await expectChatError(() => remove(ids.god, posted.message.id), "MODERATION_DENIED");
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
    await expectChatError(() => remove(ids.admin, Number(target.id)), "INVALID_INPUT");
    await expectChatError(() => remove(ids.admin, Number(target.id), "   "), "INVALID_INPUT");
    await expectChatError(() => remove(ids.admin, Number(target.id), "x".repeat(501)), "INVALID_INPUT");
    const deleted = await remove(ids.admin, Number(target.id), "  admin moderation  ");
    assert.equal(deleted.deleted, true);
    const stored = await setupQuery(
      "select count(*)::int as count,status,deleted_by_user_id,deletion_reason,content from chat_message where id=$1 group by status,deleted_by_user_id,deletion_reason,content",
      [target.id],
    );
    assert.deepEqual(stored.rows, [{
      count: 1,
      status: "deleted",
      deleted_by_user_id: ids.admin,
      deletion_reason: "admin moderation",
      content: "Still active",
    }]);
  });

  await t.test("Campaign moderation belongs only to the creator and requires a reason", async () => {
    await setupQuery("insert into campaign_player (campaign_id,user_id) values ($1,$2) on conflict do nothing", [campaignId, ids.god]);
    await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.member]);
    const memberPost = await post(ids.member, "campaign-moderation", "Campaign creator may remove this", "campaign-room");
    assert.equal(memberPost.message.canDelete, true, "Authors retain self-deletion in Campaign rooms.");

    await expectChatError(
      () => remove(ids.admin, memberPost.message.id, "Admin is only a Campaign participant", "campaign-room"),
      "MODERATION_DENIED",
    );
    await expectChatError(
      () => remove(ids.god, memberPost.message.id, "G.O.D. is only a Campaign participant", "campaign-room"),
      "MODERATION_DENIED",
    );
    const creatorView = await loadMessage(ids.creator, memberPost.message.id, "campaign-room");
    assert.equal(creatorView.canDelete, true);
    assert.equal(creatorView.isOwn, false);
    await expectChatError(
      () => remove(ids.creator, memberPost.message.id, "  ", "campaign-room"),
      "INVALID_INPUT",
    );
    const deleted = await remove(
      ids.creator,
      memberPost.message.id,
      `  ${"r".repeat(500)}  `,
      "campaign-room",
    );
    assert.equal(deleted.deleted, true);
    assert.equal((await setupQuery(
      "select length(deletion_reason)::int as length from chat_message where id=$1",
      [memberPost.message.id],
    )).rows[0].length, 500);

    await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.creator]);
    const creatorPost = await post(ids.creator, "campaign-player-denied", "Players cannot moderate this", "campaign-room");
    assert.equal(creatorPost.message.canDelete, true, "Authors retain self-deletion in Campaign rooms.");
    await expectChatError(
      () => remove(ids.member, creatorPost.message.id, "Player moderation denied", "campaign-room"),
      "MODERATION_DENIED",
    );
    assert.equal((await remove(ids.creator, creatorPost.message.id, undefined, "campaign-room")).deleted, true);
  });

  await t.test("role mutations publish only generic committed directory invalidations on genuine changes", async () => {
    const listener = new pg.Client({ connectionString, application_name: "chat-role-invalidation-test" });
    const events: ChatInvalidation[] = [];
    await listener.connect();
    await listener.query(`LISTEN ${CHAT_LIVE_CHANNEL}`);
    listener.on("notification", (notification) => {
      if (notification.channel !== CHAT_LIVE_CHANNEL) return;
      const event = parseChatNotificationPayload(notification.payload);
      if (event) events.push(event);
    });
    try {
      await withChatTransaction(async (tx) => {
        const result = await setUserRoleInTransaction(tx, ids.admin, {
          targetUserId: ids.noRole,
          requestedRole: "player",
          enabled: "true",
        });
        assert.deepEqual(result, { changed: true, role: "player", enabled: true });
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(events.length, 0);
      });
      await waitForInvalidation(events, (event) => event.category === "directory");
      assert.deepEqual(events[0], { category: "directory" });
      const afterAdd = events.length;

      assert.deepEqual(await withChatTransaction((tx) => setUserRoleInTransaction(tx, ids.admin, {
        targetUserId: ids.noRole,
        requestedRole: "player",
        enabled: "true",
      })), { changed: false, role: "player", enabled: true });
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(events.length, afterAdd);

      await assert.rejects(() => withChatTransaction(async (tx) => {
        const result = await setUserRoleInTransaction(tx, ids.admin, {
          targetUserId: ids.noRole,
          requestedRole: "player",
          enabled: "false",
        });
        assert.equal(result.changed, true);
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(events.length, afterAdd);
        throw new Error("intentional role rollback");
      }), /intentional role rollback/);
      assert.equal((await setupQuery(
        "select count(*)::int as count from user_role where user_id=$1 and role='player'",
        [ids.noRole],
      )).rows[0].count, 1);
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(events.length, afterAdd);

      assert.deepEqual(await withChatTransaction((tx) => setUserRoleInTransaction(tx, ids.admin, {
        targetUserId: ids.noRole,
        requestedRole: "player",
        enabled: "false",
      })), { changed: true, role: "player", enabled: false });
      await waitForInvalidation(events, (event) => event.category === "directory" && events.length === afterAdd + 1);
      assert.deepEqual(events.at(-1), { category: "directory" });

      const afterRemove = events.length;
      assert.deepEqual(await withChatTransaction((tx) => setUserRoleInTransaction(tx, ids.admin, {
        targetUserId: ids.noRole,
        requestedRole: "player",
        enabled: "false",
      })), { changed: false, role: "player", enabled: false });
      await new Promise((resolve) => setTimeout(resolve, 120));
      assert.equal(events.length, afterRemove);
      await assert.rejects(
        () => withChatTransaction((tx) => setUserRoleInTransaction(tx, ids.admin, {
          targetUserId: ids.admin,
          requestedRole: "admin",
          enabled: "false",
        })),
        /cannot remove your own administrator access/,
      );
      await assert.rejects(
        () => withChatTransaction((tx) => setUserRoleInTransaction(tx, ids.author, {
          targetUserId: ids.noRole,
          requestedRole: "player",
          enabled: "true",
        })),
        /Administrator access is required/,
      );
    } finally {
      await listener.query(`UNLISTEN ${CHAT_LIVE_CHANNEL}`).catch(() => undefined);
      await listener.end().catch(() => undefined);
    }
  });

  await t.test("Campaign general rooms are created and renamed transactionally without touching custom rooms", async () => {
    const initial = await withChatTransaction((tx) => synchronizeCampaignGeneralChatRoomInTransaction(tx, {
      campaignId,
      campaignName: "  Service Campaign  ",
    }));
    assert.deepEqual(initial, {
      slug: `campaign-${campaignId}-general`,
      name: "Service Campaign Chat",
    });
    await withChatTransaction(async (tx) => {
      await tx.execute(sql`update campaign set name = 'Renamed Campaign' where id = ${campaignId}`);
      await synchronizeCampaignGeneralChatRoomInTransaction(tx, {
        campaignId,
        campaignName: "Renamed Campaign",
      });
    });
    assert.deepEqual((await setupQuery(
      "select slug,name from chat_room where campaign_id=$1 order by slug",
      [campaignId],
    )).rows, [
      { slug: `campaign-${campaignId}-general`, name: "Renamed Campaign Chat" },
      { slug: "campaign-room", name: "Campaign Room" },
    ]);
  });

  await t.test("Campaign and default room creation roll back together", async () => {
    let rolledBackCampaignId = 0;
    await assert.rejects(
      () => withChatTransaction(async (tx) => {
        const inserted = await tx.execute<{ id: number }>(sql`
          insert into campaign (name,created_by_user_id)
          values ('Rollback Campaign',${ids.creator}) returning id
        `);
        rolledBackCampaignId = Number(inserted.rows[0]!.id);
        await synchronizeCampaignGeneralChatRoomInTransaction(tx, {
          campaignId: rolledBackCampaignId,
          campaignName: "Rollback Campaign",
        });
        throw new Error("intentional rollback");
      }),
      /intentional rollback/,
    );
    assert.ok(rolledBackCampaignId > 0);
    assert.deepEqual((await setupQuery(
      "select (select count(*)::int from campaign where id=$1) as campaigns, (select count(*)::int from chat_room where slug=$2) as rooms",
      [rolledBackCampaignId, `campaign-${rolledBackCampaignId}-general`],
    )).rows, [{ campaigns: 0, rooms: 0 }]);
  });

  await t.test("the room directory is authorized, grouped, deterministic, deduplicated, and private", async () => {
    const creatorDirectory = await directory(ids.creator);
    const memberDirectory = await directory(ids.member);
    const unrelatedDirectory = await directory(ids.unrelated);
    for (const result of [creatorDirectory, memberDirectory, unrelatedDirectory]) {
      assert.ok(result.globalRooms.some(({ slug }) => slug === "crossroads"));
      assert.equal(new Set([
        ...result.globalRooms,
        ...result.campaignRooms,
        ...result.directConversations,
      ].map(({ slug }) => slug)).size,
      result.globalRooms.length + result.campaignRooms.length + result.directConversations.length);
      assert.doesNotMatch(JSON.stringify(result), /private\.invalid|email|roles|session/i);
    }
    assert.ok(creatorDirectory.campaignRooms.some(({ slug }) => slug === `campaign-${campaignId}-general`));
    assert.ok(memberDirectory.campaignRooms.some(({ slug }) => slug === `campaign-${campaignId}-general`));
    assert.equal(unrelatedDirectory.campaignRooms.length, 0);
    assert.ok(creatorDirectory.globalRooms.some(({ slug, archived }) => slug === "archived-room" && archived));
    const sorted = [...creatorDirectory.globalRooms].sort((left, right) => (
      left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug)
    ));
    assert.deepEqual(creatorDirectory.globalRooms, sorted);
    await expectChatError(() => directory(ids.noRole), "ACCESS_DENIED");
  });

  await t.test("removing a Campaign Player immediately removes room and directory access", async () => {
    await setupQuery("delete from campaign_player where campaign_id=$1 and user_id=$2", [campaignId, ids.member]);
    await expectChatError(() => load(ids.member, `campaign-${campaignId}-general`), "ROOM_UNAVAILABLE");
    assert.equal((await directory(ids.member)).campaignRooms.length, 0);
    await setupQuery("insert into campaign_player (campaign_id,user_id) values ($1,$2)", [campaignId, ids.member]);
  });

  let directSlug = "";
  let directMessageId = 0;
  await t.test("a direct conversation creates one opaque room with exactly the intended pair", async () => {
    const conversation = await direct(ids.member, ids.unrelated);
    directSlug = conversation.slug;
    assert.equal(conversation.scope, "direct");
    assert.equal(conversation.partnerName, "unrelated-username");
    assert.doesNotMatch(conversation.slug, /chat-member|chat-unrelated/);
    const room = await setupQuery(
      "select id,scope,campaign_id,name from chat_room where slug=$1",
      [directSlug],
    );
    assert.deepEqual(room.rows.map(({ scope, campaign_id, name }) => ({ scope, campaign_id, name })), [{
      scope: "direct",
      campaign_id: null,
      name: "Private Conversation",
    }]);
    assert.deepEqual((await setupQuery(
      "select user_id from chat_room_member where room_id=$1 order by user_id",
      [room.rows[0].id],
    )).rows.map(({ user_id }) => user_id), [ids.member, ids.unrelated].sort());
  });

  await t.test("direct conversation repeat, reversal, and concurrency resolve one room", async () => {
    assert.equal((await direct(ids.member, ids.unrelated)).slug, directSlug);
    assert.equal((await direct(ids.unrelated, ids.member)).slug, directSlug);
    const concurrent = await Promise.all([
      direct(ids.duplicate, ids.fast),
      direct(ids.fast, ids.duplicate),
    ]);
    assert.equal(concurrent[0].slug, concurrent[1].slug);
    assert.equal((await setupQuery(
      "select count(*)::int as count from chat_room where slug=$1",
      [concurrent[0].slug],
    )).rows[0].count, 1);
    assert.equal((await setupQuery(`
      select count(*)::int as count from chat_room_member
      where room_id=(select id from chat_room where slug=$1)
    `, [concurrent[0].slug])).rows[0].count, 2);
  });

  await t.test("self, missing, and roleless direct-conversation targets are rejected safely", async () => {
    await expectChatError(() => direct(ids.member, ids.member), "INVALID_INPUT");
    const missing = await expectChatError(() => direct(ids.member, "missing-chat-user"), "USER_UNAVAILABLE");
    const roleless = await expectChatError(() => direct(ids.member, ids.noRole), "USER_UNAVAILABLE");
    assert.equal(missing.message, roleless.message);
  });

  await t.test("direct rooms appear only to their two members and identify the other participant", async () => {
    const memberDirectory = await directory(ids.member);
    const unrelatedDirectory = await directory(ids.unrelated);
    assert.equal(memberDirectory.directConversations.find(({ slug }) => slug === directSlug)?.partnerName, "unrelated-username");
    assert.equal(unrelatedDirectory.directConversations.find(({ slug }) => slug === directSlug)?.partnerName, "member-username");
    assert.equal((await directory(ids.admin)).directConversations.some(({ slug }) => slug === directSlug), false);
    assert.equal((await directory(ids.god)).directConversations.some(({ slug }) => slug === directSlug), false);
  });

  await t.test("an Admin who is a direct participant cannot moderate the other participant", async () => {
    const adminDirect = await direct(ids.admin, ids.other);
    await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.other]);
    const otherPost = await post(ids.other, "admin-direct-policy", "Private participant message", adminDirect.slug);
    const adminView = await loadMessage(ids.admin, otherPost.message.id, adminDirect.slug);
    assert.equal(adminView.canDelete, false);
    assert.equal(adminView.isOwn, false);
    await expectChatError(
      () => remove(ids.admin, otherPost.message.id, "Admin status is irrelevant", adminDirect.slug),
      "MODERATION_DENIED",
    );
    assert.equal((await remove(ids.other, otherPost.message.id, undefined, adminDirect.slug)).deleted, true);
  });

  await t.test("authorized direct messages preserve history, idempotency, rate limiting, and soft deletion", async () => {
    await setupQuery("update chat_message set created_at=clock_timestamp()-interval '2 seconds' where author_user_id=$1", [ids.member]);
    const first = await post(ids.member, "direct-message", "Private plain text", directSlug);
    directMessageId = first.message.id;
    assert.equal(first.message.room.slug, directSlug);
    assert.equal((await post(ids.member, "direct-message", "Private plain text", directSlug)).created, false);
    await expectChatError(() => post(ids.member, "direct-too-fast", "Rate limited", directSlug), "RATE_LIMITED");
    assert.equal((await load(ids.unrelated, directSlug)).messages.some(({ id }) => id === directMessageId), true);
    await expectChatError(() => load(ids.admin, directSlug), "ROOM_UNAVAILABLE");
    await expectChatError(() => post(ids.admin, "admin-intrusion", "Denied", directSlug), "ROOM_UNAVAILABLE");
    await expectChatError(() => remove(ids.admin, directMessageId, undefined, directSlug), "ROOM_UNAVAILABLE");
    const deleted = await remove(ids.member, directMessageId, undefined, directSlug);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.content, null);
    assert.equal((await load(ids.unrelated, directSlug)).messages.find(({ id }) => id === directMessageId)?.content, null);
  });

  await t.test("removing direct membership immediately removes all room access", async () => {
    const roomId = Number((await setupQuery("select id from chat_room where slug=$1", [directSlug])).rows[0].id);
    await setupQuery("delete from chat_room_member where room_id=$1 and user_id=$2", [roomId, ids.unrelated]);
    await expectChatError(() => load(ids.unrelated, directSlug), "ROOM_UNAVAILABLE");
    assert.equal((await directory(ids.unrelated)).directConversations.some(({ slug }) => slug === directSlug), false);
    await expectChatError(() => direct(ids.member, ids.unrelated), "ROOM_UNAVAILABLE");
    await setupQuery("insert into chat_room_member (room_id,user_id) values ($1,$2)", [roomId, ids.unrelated]);
  });

  await t.test("direct User search is role-filtered, actor-excluding, private, capped, and deterministic", async () => {
    for (let index = 0; index < 25; index += 1) {
      const id = `search-user-${String(index).padStart(2, "0")}`;
      await setupQuery(
        "insert into \"user\" (id,name,email,username,display_username) values ($1,$2,$3,$4,$5)",
        [id, `Search Person ${String(index).padStart(2, "0")}`, `${id}@private.invalid`, id, null],
      );
      await setupQuery("insert into user_role (user_id,role) values ($1,'player')", [id]);
    }
    await setupQuery("update \"user\" set name='Search Person Roleless' where id=$1", [ids.noRole]);
    await setupQuery("update \"user\" set email='search-person-email-only@private.invalid' where id=$1", [ids.god]);
    const matches = await searchUsers(ids.member, "  Search Person  ");
    assert.equal(matches.length, 20);
    assert.equal(matches.some(({ userId }) => userId === ids.member), false);
    assert.equal(matches.some(({ userId }) => userId === ids.noRole), false);
    assert.doesNotMatch(JSON.stringify(matches), /private\.invalid|email|role/i);
    assert.deepEqual(matches, [...matches].sort((left, right) => (
      left.displayName.localeCompare(right.displayName) || left.userId.localeCompare(right.userId)
    )));
    assert.deepEqual(await searchUsers(ids.member, "member-username"), []);
    assert.deepEqual(await searchUsers(ids.member, "email-only"), []);
    await expectChatError(() => searchUsers(ids.member, " "), "INVALID_INPUT");
  });

  await t.test("Campaign deletion cascades its rooms and messages", async () => {
    const disposableCampaignId = Number((await setupQuery(
      "insert into campaign (name,created_by_user_id) values ('Disposable Campaign',$1) returning id",
      [ids.creator],
    )).rows[0].id);
    const synchronized = await withChatTransaction((tx) => synchronizeCampaignGeneralChatRoomInTransaction(tx, {
      campaignId: disposableCampaignId,
      campaignName: "Disposable Campaign",
    }));
    const roomId = Number((await setupQuery("select id from chat_room where slug=$1", [synchronized.slug])).rows[0].id);
    const messageId = Number((await setupQuery(`
      insert into chat_message (room_id,author_user_id,client_request_id,content)
      values ($1,$2,'campaign-cascade','Cascade') returning id
    `, [roomId, ids.creator])).rows[0].id);
    await setupQuery("delete from campaign where id=$1", [disposableCampaignId]);
    assert.deepEqual((await setupQuery(`
      select
        (select count(*)::int from chat_room where id=$1) as rooms,
        (select count(*)::int from chat_message where id=$2) as messages
    `, [roomId, messageId])).rows, [{ rooms: 0, messages: 0 }]);
  });

  assert.ok(campaignRoomId > 0 && archivedRoomId > 0 && paginationRoomId > 0);
});

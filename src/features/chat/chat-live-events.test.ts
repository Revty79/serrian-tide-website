import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  messageInvalidationForRoom,
  parseChatInvalidation,
  parseChatNotificationPayload,
} from "./chat-live-events";

test("Chat invalidations accept only the exact message and directory contracts", () => {
  assert.deepEqual(parseChatInvalidation({
    category: "message",
    roomSlug: "campaign-42-general",
    messageId: 17,
  }), {
    category: "message",
    roomSlug: "campaign-42-general",
    messageId: 17,
  });
  assert.deepEqual(parseChatInvalidation({ category: "directory" }), { category: "directory" });
  assert.equal(parseChatInvalidation({ category: "directory", campaignId: 42 }), null);
  assert.equal(parseChatInvalidation({
    category: "message",
    roomSlug: "crossroads",
    messageId: 17,
    userId: "private",
  }), null);
});

test("malformed notification payloads are ignored safely", () => {
  for (const payload of [
    undefined,
    "",
    "not-json",
    "null",
    "[]",
    JSON.stringify({ category: "unknown" }),
    JSON.stringify({ category: "message", roomSlug: "Crossroads", messageId: 1 }),
    JSON.stringify({ category: "message", roomSlug: "crossroads", messageId: 0 }),
    JSON.stringify({ category: "message", roomSlug: "crossroads", messageId: "1" }),
  ]) assert.equal(parseChatNotificationPayload(payload), null);
});

test("message invalidations match only their subscribed room and expose only the ID", () => {
  const event = parseChatInvalidation({
    category: "message",
    roomSlug: "crossroads",
    messageId: 9,
  })!;
  assert.deepEqual(messageInvalidationForRoom(event, "crossroads"), { messageId: 9 });
  assert.equal(messageInvalidationForRoom(event, "campaign-9-general"), null);
  assert.equal(messageInvalidationForRoom({ category: "directory" }, "crossroads"), null);
});

test("the database notification contract carries no private message or identity fields", () => {
  const source = readFileSync(join(process.cwd(), "src/features/chat/chat-live-events.ts"), "utf8");
  const publicContract = source.slice(
    source.indexOf("export type ChatMessageInvalidation"),
    source.indexOf("type ChatLiveTransaction"),
  );
  for (const forbidden of [
    "content",
    "authorName",
    "userId",
    "campaignName",
    "email",
    "roles",
    "session",
  ]) assert.doesNotMatch(publicContract, new RegExp(forbidden, "i"));
});

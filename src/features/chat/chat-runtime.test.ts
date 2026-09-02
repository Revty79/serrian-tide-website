import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  CHAT_CONTENT_MAX_LENGTH,
  CHAT_USER_SEARCH_MAX_LENGTH,
  ChatError,
  assertChatRoleAccess,
  assertChatRoomAccess,
  decodeChatCursor,
  encodeChatCursor,
  getCampaignGeneralChatName,
  getCampaignGeneralChatSlug,
  getDirectChatSlug,
  mayDeleteChatMessage,
  normalizeChatClientRequestId,
  normalizeChatContent,
  normalizeChatDeletionReason,
  normalizeChatMessageId,
  normalizeChatRoomSlug,
  normalizeDirectMessageUserSearch,
  resolveChatDisplayName,
  type ChatAccessContext,
} from "./chat";

function actor(
  userId: string,
  roles: ChatAccessContext["roles"],
): ChatAccessContext {
  return {
    userId,
    displayName: userId,
    roles,
    isAdmin: roles.includes("admin"),
  };
}

function expectChatError(operation: () => unknown, code: ChatError["code"]): ChatError {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof ChatError);
  assert.equal(caught.code, code);
  return caught;
}

test("a current Serrian role is required and duplicate current roles are normalized", () => {
  expectChatError(() => assertChatRoleAccess([]), "ACCESS_DENIED");
  assert.deepEqual(assertChatRoleAccess(["player", "player", "god"]), ["player", "god"]);
});

test("Admin, G.O.D., and Player roles all have role-neutral global access", () => {
  for (const role of ["admin", "god", "player"] as const) {
    assert.doesNotThrow(() => assertChatRoomAccess(actor(role, [role]), {
      scope: "global",
      campaignId: null,
      campaignCreatorUserId: null,
      campaignMemberUserId: null,
      directMemberUserId: null,
    }));
  }
});

test("Campaign room access is limited to its creator and Campaign Players", () => {
  const room = {
    scope: "campaign" as const,
    campaignId: 7,
    campaignCreatorUserId: "creator",
    campaignMemberUserId: null,
    directMemberUserId: null,
  };
  assert.doesNotThrow(() => assertChatRoomAccess(actor("creator", ["god"]), room));
  assert.doesNotThrow(() => assertChatRoomAccess(actor("member", ["player"]), {
    ...room,
    campaignMemberUserId: "member",
  }));
  expectChatError(() => assertChatRoomAccess(actor("unrelated", ["admin"]), room), "ROOM_UNAVAILABLE");
});

test("direct room access requires current membership regardless of role", () => {
  const room = {
    scope: "direct" as const,
    campaignId: null,
    campaignCreatorUserId: null,
    campaignMemberUserId: null,
    directMemberUserId: "member",
  };
  assert.doesNotThrow(() => assertChatRoomAccess(actor("member", ["player"]), room));
  expectChatError(() => assertChatRoomAccess(actor("admin", ["admin"]), room), "ROOM_UNAVAILABLE");
  expectChatError(() => assertChatRoomAccess(actor("god", ["god"]), room), "ROOM_UNAVAILABLE");
});

test("Campaign general room identity is stable and its bounded display name is safe", () => {
  assert.equal(getCampaignGeneralChatSlug(42), "campaign-42-general");
  expectChatError(() => getCampaignGeneralChatSlug(0), "INVALID_INPUT");
  assert.equal(getCampaignGeneralChatName("  The Long Road  "), "The Long Road Chat");
  assert.equal(getCampaignGeneralChatName("   "), "Campaign Chat");
  assert.equal(getCampaignGeneralChatName(null), "Campaign Chat");
  assert.equal(getCampaignGeneralChatName("x".repeat(200)).length, 100);
});

test("direct room slugs are deterministic, pair-order neutral, bounded, and opaque", () => {
  const forward = getDirectChatSlug("user-alpha", "user-beta");
  const reverse = getDirectChatSlug("user-beta", "user-alpha");
  assert.equal(forward, reverse);
  assert.match(forward, /^direct-[a-f0-9]{64}$/);
  assert.ok(forward.length <= 80);
  assert.doesNotMatch(forward, /user-alpha|user-beta/);
  expectChatError(() => getDirectChatSlug("same-user", "same-user"), "INVALID_INPUT");
});

test("direct User search is trimmed, bounded, and cannot enumerate with a blank query", () => {
  assert.equal(normalizeDirectMessageUserSearch("  ar  "), "ar");
  for (const invalid of ["", " ", "a", "x".repeat(CHAT_USER_SEARCH_MAX_LENGTH + 1)]) {
    expectChatError(() => normalizeDirectMessageUserSearch(invalid), "INVALID_INPUT");
  }
});

test("display names favor display username, then username, then account name, never email", () => {
  assert.equal(resolveChatDisplayName({ displayUsername: "  Visible  ", username: "login", name: "Name" }), "Visible");
  assert.equal(resolveChatDisplayName({ displayUsername: null, username: "login", name: "Name" }), "login");
  assert.equal(resolveChatDisplayName({ displayUsername: "", username: null, name: "Name" }), "Name");
  assert.equal(resolveChatDisplayName({ displayUsername: null, username: null, name: "   " }), "Serrian Tide User");
});

test("valid message content remains exact plain text, including spaces, markup-like text, and line breaks", () => {
  const content = "  <script>alert('data only')</script>\nsecond  line  ";
  assert.equal(normalizeChatContent(content), content);
});

test("empty, whitespace-only, and oversized content is rejected", () => {
  expectChatError(() => normalizeChatContent(""), "INVALID_INPUT");
  expectChatError(() => normalizeChatContent(" \n\t"), "INVALID_INPUT");
  expectChatError(() => normalizeChatContent("x".repeat(CHAT_CONTENT_MAX_LENGTH + 1)), "INVALID_INPUT");
  assert.equal(normalizeChatContent("x".repeat(CHAT_CONTENT_MAX_LENGTH)).length, CHAT_CONTENT_MAX_LENGTH);
});

test("room slugs use the stable lowercase slug contract", () => {
  assert.equal(normalizeChatRoomSlug("crossroads"), "crossroads");
  assert.equal(normalizeChatRoomSlug("campaign-42"), "campaign-42");
  for (const invalid of [" Crossroads", "Crossroads", "two words", "a--b", "", "x".repeat(81)]) {
    expectChatError(() => normalizeChatRoomSlug(invalid), "INVALID_INPUT");
  }
});

test("client request IDs must be stable, bounded, and nonblank", () => {
  assert.equal(normalizeChatClientRequestId("request-123"), "request-123");
  for (const invalid of ["", "   ", " request", "r".repeat(101)]) {
    expectChatError(() => normalizeChatClientRequestId(invalid), "INVALID_INPUT");
  }
});

test("deletion reasons are optional, trimmed, and bounded", () => {
  assert.equal(normalizeChatDeletionReason(undefined), "");
  assert.equal(normalizeChatDeletionReason("  duplicate  "), "duplicate");
  assert.equal(normalizeChatDeletionReason("r".repeat(500)).length, 500);
  expectChatError(() => normalizeChatDeletionReason("r".repeat(501)), "INVALID_INPUT");
});

test("message IDs reject nonpositive, fractional, and unsafe values", () => {
  assert.equal(normalizeChatMessageId(12), 12);
  for (const invalid of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "12"]) {
    expectChatError(() => normalizeChatMessageId(invalid), "INVALID_INPUT");
  }
});

test("history cursors round-trip the exact timestamp and tie-breaking message ID", () => {
  const cursor = { createdAt: "2026-09-02T12:34:56.789Z", id: 417 };
  assert.deepEqual(decodeChatCursor(encodeChatCursor(cursor)), cursor);
  assert.equal(decodeChatCursor(null), null);
});

test("malformed or incomplete history cursors fail closed", () => {
  for (const invalid of [
    "not-base64-json",
    Buffer.from(JSON.stringify({ createdAt: "not-a-date", id: 1 })).toString("base64url"),
    Buffer.from(JSON.stringify({ createdAt: "2026-09-02T00:00:00.000Z" })).toString("base64url"),
    Buffer.from(JSON.stringify({ createdAt: "2026-09-02T00:00:00.000Z", id: 0 })).toString("base64url"),
  ]) expectChatError(() => decodeChatCursor(invalid), "INVALID_INPUT");
});

test("only the author or an Admin may delete a message", () => {
  assert.equal(mayDeleteChatMessage(actor("author", ["player"]), "author"), true);
  assert.equal(mayDeleteChatMessage(actor("admin", ["admin"]), "author"), true);
  assert.equal(mayDeleteChatMessage(actor("god", ["god"]), "author"), false);
  assert.equal(mayDeleteChatMessage(actor("other", ["player"]), "author"), false);
});

test("future server actions authenticate centrally, expose narrow inputs, and avoid forbidden runtime behavior", () => {
  const actions = readFileSync(join(process.cwd(), "src/app/chat/actions.ts"), "utf8");
  assert.match(actions, /const session = await requireSession\(\)/);
  assert.match(actions, /authenticatedChatAction/);
  assert.doesNotMatch(actions, /revalidatePath|EventSource|LISTEN|NOTIFY|poll/i);
  assert.doesNotMatch(actions, /actingUserId|authorName|isAdmin|roles:/);
  for (const entryPoint of [
    "loadChatHistoryAction",
    "loadOlderChatMessagesAction",
    "postChatMessageAction",
    "deleteChatMessageAction",
    "listAccessibleChatRoomsAction",
    "getOrCreateDirectConversationAction",
    "searchDirectMessageUsersAction",
  ]) assert.ok(actions.includes(`function ${entryPoint}`));
});

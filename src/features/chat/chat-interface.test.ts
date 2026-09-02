import assert from "node:assert/strict";
import { test } from "node:test";

import type { ChatMessageDto, ChatRoomDirectory } from "./chat";
import {
  findChatDirectoryRoom,
  flattenChatDirectory,
  getChatRoomMetadata,
  getChatSubmissionIdentity,
  isChatViewportNearNewest,
  isCurrentChatRoomLoad,
  parseChatLiveMessageData,
  prependOlderChatMessages,
  preserveChatRoomSelection,
  reconcileChatRoomArchiveState,
  reconcileDeletedChatMessage,
  reconcileLiveChatMessage,
  reconcilePostedChatMessage,
  retainChatSubmissionIdentityAfterDraftChange,
  selectInitialChatRoomSlug,
  terminalChatDestination,
} from "./chat-interface";

const directory: ChatRoomDirectory = {
  globalRooms: [
    { slug: "crossroads", name: "The Crossroads", scope: "global", archived: false },
    { slug: "announcements", name: "Announcements", scope: "global", archived: true },
  ],
  campaignRooms: [{
    slug: "campaign-7-general",
    name: "The Long Road Chat",
    scope: "campaign",
    archived: false,
    campaignId: 7,
    campaignName: "The Long Road",
  }],
  directConversations: [{
    slug: "direct-example",
    name: "Private Conversation",
    scope: "direct",
    archived: false,
    partnerName: "Mara",
  }],
};

function message(id: number, createdAt: string, overrides: Partial<ChatMessageDto> = {}): ChatMessageDto {
  return {
    id,
    room: { slug: "crossroads", name: "The Crossroads" },
    authorName: "Aster",
    content: `message ${id}`,
    createdAt,
    deleted: false,
    canDelete: false,
    isOwn: false,
    ...overrides,
  };
}

test("directory flattening and lookup preserve authorized grouped order without duplicate slugs", () => {
  const duplicated = {
    ...directory,
    campaignRooms: [
      ...directory.campaignRooms,
      { ...directory.campaignRooms[0]!, name: "Duplicate must not win" },
    ],
  };
  assert.deepEqual(flattenChatDirectory(duplicated).map(({ slug }) => slug), [
    "crossroads",
    "announcements",
    "campaign-7-general",
    "direct-example",
  ]);
  assert.equal(findChatDirectoryRoom(directory, "direct-example")?.scope, "direct");
  assert.equal(findChatDirectoryRoom(directory, "missing"), null);
});

test("authorized requested rooms win, Crossroads is preferred fallback, then first authorized room", () => {
  assert.equal(selectInitialChatRoomSlug(directory, "campaign-7-general"), "campaign-7-general");
  assert.equal(selectInitialChatRoomSlug(directory, "inaccessible"), "crossroads");
  assert.equal(selectInitialChatRoomSlug({ ...directory, globalRooms: [] }, "missing"), "campaign-7-general");
  assert.equal(selectInitialChatRoomSlug({ globalRooms: [], campaignRooms: [], directConversations: [] }, null), null);
});

test("directory refresh preserves an accessible active room and falls back safely when access disappears", () => {
  assert.equal(preserveChatRoomSelection(directory, "direct-example"), "direct-example");
  assert.equal(preserveChatRoomSelection({ ...directory, directConversations: [] }, "direct-example"), "crossroads");
});

test("only terminal session and role failures leave the Chat workspace", () => {
  assert.equal(terminalChatDestination("AUTH_REQUIRED"), "/login");
  assert.equal(terminalChatDestination("ACCESS_DENIED"), "/access");
  assert.equal(terminalChatDestination("MODERATION_DENIED"), null);
  assert.equal(terminalChatDestination("ROOM_UNAVAILABLE"), null);
  assert.equal(terminalChatDestination("REQUEST_FAILED"), null);
});

test("an authoritative room load updates archived state without changing directory identity", () => {
  const updated = reconcileChatRoomArchiveState(directory, "campaign-7-general", true);
  assert.equal(updated.campaignRooms[0]?.archived, true);
  assert.notEqual(updated.globalRooms, directory.globalRooms);
  assert.deepEqual(updated.directConversations, directory.directConversations);
});

test("room metadata uses Campaign and direct context rather than internal room identity", () => {
  assert.deepEqual(getChatRoomMetadata(directory.globalRooms[0]!), {
    title: "The Crossroads",
    scopeLabel: "Global",
    contextLabel: "Open to every current Serrian Tide role",
  });
  assert.equal(getChatRoomMetadata(directory.campaignRooms[0]!).contextLabel, "The Long Road");
  assert.deepEqual(getChatRoomMetadata(directory.directConversations[0]!), {
    title: "Mara",
    scopeLabel: "Direct",
    contextLabel: "Private conversation with Mara",
  });
});

test("older history prepends chronologically, deduplicates IDs, and retains newer local posts", () => {
  const current = [
    message(3, "2026-09-02T12:03:00.000Z"),
    message(4, "2026-09-02T12:04:00.000Z"),
  ];
  const merged = prependOlderChatMessages(current, {
    messages: [
      message(1, "2026-09-02T12:01:00.000Z"),
      message(2, "2026-09-02T12:02:00.000Z"),
      message(3, "2026-09-02T12:03:00.000Z", { content: "stale duplicate" }),
    ],
  });
  assert.deepEqual(merged.map(({ id }) => id), [1, 2, 3, 4]);
  assert.equal(merged[2]?.content, "message 3");
});

test("posting reconciles without duplication and deletion replaces without removing sequence", () => {
  const initial = [message(1, "2026-09-02T12:01:00.000Z")];
  const posted = message(2, "2026-09-02T12:02:00.000Z", { isOwn: true });
  assert.deepEqual(reconcilePostedChatMessage(initial, posted).map(({ id }) => id), [1, 2]);
  assert.equal(reconcilePostedChatMessage([posted], { ...posted, content: "authoritative" }).length, 1);
  const deleted = { ...posted, content: null, deleted: true, canDelete: false };
  const reconciled = reconcileDeletedChatMessage([initial[0]!, posted], deleted);
  assert.deepEqual(reconciled.map(({ id }) => id), [1, 2]);
  assert.equal(reconciled[1]?.deleted, true);
  assert.equal(reconciled[1]?.content, null);
});

test("live message payloads are strict and authoritative messages reconcile out of order", () => {
  assert.deepEqual(parseChatLiveMessageData('{"messageId":4}'), { messageId: 4 });
  for (const invalid of [
    "not-json",
    "{}",
    '{"messageId":0}',
    '{"messageId":"4"}',
    '{"messageId":4,"roomSlug":"crossroads"}',
  ]) assert.equal(parseChatLiveMessageData(invalid), null);

  const initial = [
    message(2, "2026-09-02T12:02:00.000Z"),
    message(4, "2026-09-02T12:04:00.000Z"),
  ];
  const withOlderLiveMessage = reconcileLiveChatMessage(
    initial,
    message(3, "2026-09-02T12:03:00.000Z"),
  );
  assert.deepEqual(withOlderLiveMessage.map(({ id }) => id), [2, 3, 4]);
  assert.equal(reconcileLiveChatMessage(withOlderLiveMessage, withOlderLiveMessage[1]!).length, 3);
  const deletedOlderMessage = message(2, "2026-09-02T12:02:00.000Z", {
    content: null,
    deleted: true,
    canDelete: false,
  });
  const deleted = reconcileLiveChatMessage(withOlderLiveMessage, deletedOlderMessage);
  assert.equal(deleted[0]?.deleted, true);
  assert.equal(deleted[0]?.content, null);
});

test("live following occurs only while the reader remains near the newest messages", () => {
  assert.equal(isChatViewportNearNewest({ scrollTop: 920, clientHeight: 500, scrollHeight: 1500 }), true);
  assert.equal(isChatViewportNearNewest({ scrollTop: 919, clientHeight: 500, scrollHeight: 1500 }), false);
  assert.equal(isChatViewportNearNewest({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 }), true);
});

test("only the latest matching room-load token may change visible history", () => {
  const active = { roomSlug: "campaign-7-general", sequence: 4 };
  assert.equal(isCurrentChatRoomLoad("campaign-7-general", active, active), true);
  assert.equal(isCurrentChatRoomLoad("campaign-7-general", active, { ...active, sequence: 3 }), false);
  assert.equal(isCurrentChatRoomLoad("direct-example", active, active), false);
});

test("failed identical submissions reuse one request ID while changed or successful drafts reset", () => {
  let calls = 0;
  const createRequestId = () => `uuid-${++calls}`;
  const first = getChatSubmissionIdentity(null, " exact\ncontent ", createRequestId);
  const retry = getChatSubmissionIdentity(first, " exact\ncontent ", createRequestId);
  assert.equal(first, retry);
  assert.equal(calls, 1);
  assert.equal(retainChatSubmissionIdentityAfterDraftChange(first, " exact\ncontent "), first);
  assert.equal(retainChatSubmissionIdentityAfterDraftChange(first, "changed"), null);
  const changed = getChatSubmissionIdentity(null, "changed", createRequestId);
  assert.notEqual(changed.clientRequestId, first.clientRequestId);
  const afterSuccess = getChatSubmissionIdentity(null, "new", createRequestId);
  assert.notEqual(afterSuccess.clientRequestId, changed.clientRequestId);
});

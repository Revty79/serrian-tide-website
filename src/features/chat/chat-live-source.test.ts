import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const events = source("src/features/chat/chat-live-events.ts");
const route = source("src/app/api/chat/live/route.ts");
const connection = source("src/features/chat/chat-live-connection.tsx");
const workspace = source("src/app/chat/chat-workspace.tsx");
const actions = source("src/app/chat/actions.ts");
const service = source("src/features/chat/chat-service.ts");
const campaignActions = source("src/app/heavens/campaigns/actions.ts");
const roleActions = source("src/app/admin/users/actions.ts");
const roleService = source("src/features/authorization/user-role-service.ts");

test("Chat SSE is a Node-only authenticated and room-authorized invalidation route", () => {
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export const dynamic = "force-dynamic"/);
  assert.match(route, /auth\.api\.getSession/);
  assert.match(route, /authorizeChatRoomSubscriptionInTransaction/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 403/);
  assert.match(route, /status: 404/);
  assert.match(route, /new Client/);
  assert.match(route, /"serrian-tide-chat-live-sse"/);
  assert.match(route, /LISTEN \$\{CHAT_LIVE_CHANNEL\}/);
  assert.match(route, /messageInvalidationForRoom\(event, roomSlug\)/);
  assert.match(route, /send\("message", message\)/);
  assert.match(route, /send\("directory", \{ refresh: true \}\)/);
});

test("Chat SSE has heartbeat, no-buffering, and complete dedicated-client cleanup", () => {
  assert.match(route, /setInterval\([\s\S]*: heartbeat/);
  assert.match(route, /Content-Type": "text\/event-stream"/);
  assert.match(route, /Cache-Control": "no-cache, no-transform"/);
  assert.match(route, /X-Accel-Buffering": "no"/);
  assert.match(route, /UNLISTEN \$\{CHAT_LIVE_CHANNEL\}/);
  assert.match(route, /client\.end\(\)/);
  assert.match(route, /request\.signal\.addEventListener\("abort"/);
  assert.match(route, /async cancel\(\)/);
  assert.match(route, /client\.on\("error", onError\)/);
  assert.match(route, /request\.signal\.aborted/);
  assert.match(route, /retry: 3000/);
});

test("posting, deletion, room creation, renaming, and membership changes publish transactionally", () => {
  assert.match(events, /select pg_notify/);
  assert.match(service, /publishChatMessageInvalidationInTransaction\(tx, room\.slug, inserted\.id\)/);
  assert.match(service, /publishChatMessageInvalidationInTransaction\(tx, room\.slug, deleted\.id\)/);
  assert.match(service, /if \(created\) \{\s*await publishChatDirectoryInvalidationInTransaction\(tx\)/);
  assert.match(service, /if \(createdRoom \|\| room\.name !== name\)/);
  assert.match(campaignActions, /db\.transaction\(async \(tx\) => \{[\s\S]*publishChatDirectoryInvalidationInTransaction\(tx\)/);
  assert.match(
    campaignActions,
    /if \(removed\.length > 0\) \{[\s\S]*publishChatDirectoryInvalidationInTransaction\(tx\)[\s\S]*publishLiveSessionRevocationInTransaction\(tx, removed\[0\]!\.userId\)/,
  );
  assert.match(roleActions, /db\.transaction\(\(tx\) => setUserRoleInTransaction/);
  assert.match(roleService, /if \(changedRows\.length > 0\)[\s\S]*publishChatDirectoryInvalidationInTransaction\(tx\)/);
});

test("exact live message reload remains session-authenticated and server-authorized", () => {
  assert.match(actions, /export async function loadChatMessageAction/);
  assert.match(actions, /authenticatedChatAction\(\(userId\) => loadChatMessage\(userId, input\)\)/);
  assert.match(service, /loadChatMessageInTransaction/);
  assert.match(service, /resolveAuthorizedRoom\(tx, actor, roomSlug\)/);
  assert.match(service, /toMessageDto\(message, actor, room\)/);
});

test("the browser keeps one selected-room subscription and rejects stale work", () => {
  assert.match(connection, /new EventSource\(`\/api\/chat\/live\?room=/);
  assert.match(connection, /generationRef\.current === generation/);
  assert.match(connection, /pendingMessageIds\.has\(payload\.messageId\)/);
  assert.match(connection, /source\.close\(\)/);
  assert.match(connection, /pendingMessageIds\.clear\(\)/);
  assert.match(connection, /source\.onerror/);
  assert.match(connection, /accessCheckRequested/);
  assert.match(connection, /callbacksRef\.current\.onDirectory\(roomSlug\)/);
  assert.match(connection, /\}, \[roomSlug\]\)/);
  assert.doesNotMatch(connection, /setInterval|WebSocket|\bpoll(?:ing)?\b/i);
});

test("ready, exact-message, directory, and scroll reconciliation preserve local interaction state", () => {
  assert.match(connection, /addEventListener\("ready", handleReady\)/);
  assert.match(connection, /addEventListener\("message", handleMessage\)/);
  assert.match(connection, /addEventListener\("directory", handleDirectory\)/);
  assert.match(workspace, /onReady=\{reconcileNewestHistoryFromLive\}/);
  assert.match(workspace, /loadChatMessageAction\(\{ roomSlug, messageId \}\)/);
  assert.match(workspace, /reconcileLiveChatMessage\(current, result\.data\)/);
  assert.match(workspace, /onScroll=\{updateHistoryFollowState\}/);
  assert.match(workspace, /followNewestRef\.current = isChatViewportNearNewest\(viewport\)/);
  assert.match(workspace, /onDirectory=\{refreshDirectoryAfterRoomChange\}/);
  const newestHandler = workspace.slice(
    workspace.indexOf("async function reconcileNewestHistoryFromLive"),
    workspace.indexOf("async function reconcileExactMessageFromLive"),
  );
  const exactHandler = workspace.slice(
    workspace.indexOf("async function reconcileExactMessageFromLive"),
    workspace.indexOf("async function openAuthorizedRoomFromDirectory"),
  );
  assert.doesNotMatch(newestHandler, /setDraft|setConfirmDeleteId|submissionIdentityRef/);
  assert.doesNotMatch(exactHandler, /setDraft|submissionIdentityRef/);
  assert.match(exactHandler, /result\.data\.id === confirmDeleteId && \(result\.data\.deleted \|\| !result\.data\.canDelete\)/);
});

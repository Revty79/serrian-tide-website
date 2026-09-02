import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const page = source("src/app/chat/page.tsx");
const workspace = source("src/app/chat/chat-workspace.tsx");
const stylesheet = source("src/app/chat/chat.module.css");
const actions = source("src/app/chat/actions.ts");
const service = source("src/features/chat/chat-service.ts");
const domain = source("src/features/chat/chat.ts");
const liveEvents = source("src/features/chat/chat-live-events.ts");
const liveRoute = source("src/app/api/chat/live/route.ts");
const liveConnection = source("src/features/chat/chat-live-connection.tsx");

test("the role-neutral Chat page authenticates on the server and loads only a directory-authorized bootstrap", () => {
  assert.match(page, /const session = await requireSession\(\)/);
  assert.match(page, /getChatWorkspaceBootstrap\(session\.user\.id, requestedRoomSlug\)/);
  assert.match(page, /AUTH_REQUIRED/);
  assert.match(page, /ACCESS_DENIED/);
  assert.match(page, /redirect\("\/login"\)/);
  assert.match(page, /redirect\("\/access"\)/);
  assert.match(service, /selectInitialChatRoomSlug\(directory, requestedRoomSlug\)/);
  assert.match(service, /selectedRoomSlug\s*\?\s*await loadChatHistoryInTransaction/);
  assert.doesNotMatch(page, /from "@\/db|characterId|campaignCharacter/);
});

test("the complete directory is grouped and room selection stays inside an updated Chat URL", () => {
  for (const label of ["Crossroads", "Campaigns", "Direct Messages", "New Message"]) {
    assert.ok(workspace.includes(label), `Missing Chat directory label: ${label}`);
  }
  assert.match(workspace, /router\.replace\(`\/chat\?room=\$\{encodeURIComponent\(roomSlug\)\}`/);
  assert.match(workspace, /setMessages\(\[\]\)[\s\S]*loadChatHistoryAction\(\{ roomSlug \}\)/);
  assert.match(workspace, /isCurrentChatRoomLoad/);
  assert.match(workspace, /campaignName/);
  assert.match(workspace, /partnerName/);
  assert.match(workspace, /Archived · Read only/);
});

test("message rendering is plain text, preserves line breaks, redacts deletion, and uses server own-message state", () => {
  assert.doesNotMatch(workspace, /dangerouslySetInnerHTML/);
  assert.match(workspace, /\{message\.content\}/);
  assert.match(workspace, /Message removed/);
  assert.match(stylesheet, /white-space:\s*pre-wrap/);
  assert.match(stylesheet, /overflow-wrap:\s*anywhere/);
  assert.match(domain, /isOwn: boolean/);
  assert.match(service, /isOwn: actor\.userId === row\.authorUserId/);
  const messageDto = domain.slice(
    domain.indexOf("export type ChatMessageDto"),
    domain.indexOf("export type ChatWorkspaceBootstrap"),
  );
  assert.doesNotMatch(messageDto, /authorUserId/);
});

test("local timestamps retain semantic ISO data and have a hydration-stable first render", () => {
  assert.match(workspace, /<time dateTime=\{isoValue\}>/);
  assert.match(workspace, /useSyncExternalStore\(subscribeToHydration, \(\) => true, \(\) => false\)/);
  assert.match(workspace, /stableTimestampLabel\(isoValue\)/);
  assert.doesNotMatch(workspace, /suppressHydrationWarning/);
});

test("history paging, posting, and deletion use tested reconciliation instead of removing history", () => {
  assert.match(workspace, /prependOlderChatMessages\(current, result\.data\)/);
  assert.match(workspace, /reconcilePostedChatMessage\(current, result\.data\.message\)/);
  assert.match(workspace, /reconcileDeletedChatMessage\(current, result\.data\)/);
  assert.match(workspace, /getBoundingClientRect\(\)\.top/);
  assert.match(workspace, /Load Older Messages/);
  assert.match(workspace, /Remove this message\?/);
  assert.doesNotMatch(workspace, /deletionReason|reason:/);
});

test("the composer preserves exact content and enforces the cryptographic retry identity lifecycle", () => {
  assert.match(workspace, /content = draftRef\.current/);
  assert.match(workspace, /window\.crypto\.randomUUID\(\)/);
  assert.match(workspace, /submissionIdentityRef/);
  assert.match(workspace, /sendingRef\.current/);
  assert.match(workspace, /maxLength=\{CHAT_CONTENT_MAX_LENGTH\}/);
  assert.match(workspace, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(workspace, /Enter sends · Shift\+Enter adds a new line/);
  assert.doesNotMatch(actions, /actingUserId|authorUserId|actorUserId/);
});

test("direct search is explicit, bounded, private, and refreshes the directory before selection", () => {
  assert.match(workspace, /if \(search\.length < 2\)/);
  assert.match(workspace, /searchDirectMessageUsersAction\(\{ search \}\)/);
  assert.match(workspace, /getOrCreateDirectConversationAction\(\{ targetUserId: resultUser\.userId \}\)/);
  assert.match(workspace, /const refreshed = await listAccessibleChatRoomsAction\(\)/);
  assert.match(workspace, /openAuthorizedRoomFromDirectory\(conversation\.data\.slug, refreshed\.data, true\)/);
  assert.doesNotMatch(workspace, /email|roles/);
});

test("the interface retains manual refresh and responsiveness around the approved live runtime", () => {
  assert.match(workspace, /Refresh Messages/);
  assert.match(stylesheet, /@media \(max-width: 900px\)/);
  assert.match(stylesheet, /@media \(max-width: 720px\)/);
  assert.match(stylesheet, /@media \(max-width: 460px\)/);
  assert.match(stylesheet, /overflow-x:\s*hidden/);
  assert.match(stylesheet, /prefers-reduced-motion/);
  assert.match(workspace, /<ChatLiveConnection/);
  assert.match(liveConnection, /new EventSource\(`\/api\/chat\/live\?room=/);
  assert.match(liveConnection, /source\.close\(\)/);
  assert.match(liveEvents, /select pg_notify/);
  assert.match(liveRoute, /LISTEN/);
  assert.doesNotMatch(`${workspace}\n${liveConnection}`, /setInterval|WebSocket|\bpoll(?:ing)?\b/i);
  assert.doesNotMatch(`${page}\n${actions}`, /EventSource|LISTEN|NOTIFY|pg_notify/i);
});

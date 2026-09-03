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
const roleActions = source("src/app/admin/users/actions.ts");
const roleService = source("src/features/authorization/user-role-service.ts");

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
  assert.match(workspace, /Delete your message\?/);
  assert.match(workspace, /Remove this message as moderator\?/);
  assert.match(workspace, /reason: message\.isOwn \? undefined : moderationReason/);
  assert.match(workspace, /maxLength=\{CHAT_DELETION_REASON_MAX_LENGTH\}/);
  assert.doesNotMatch(workspace, /deletionReason|deletedByUserId|campaignCreatorUserId/);
});

test("message history follows the newest message without pulling readers away from older history", () => {
  assert.match(workspace, /useLayoutEffect\(\(\) => \{[\s\S]*followNewestRef\.current[\s\S]*viewport\.scrollTop = viewport\.scrollHeight/);
  assert.match(workspace, /onScroll=\{updateHistoryFollowState\}/);
  assert.match(workspace, /followNewestRef\.current = isChatViewportNearNewest\(viewport\)/);
  assert.match(workspace, /followNewestRef\.current = true;[\s\S]*reconcilePostedChatMessage/);
  assert.match(workspace, /followNewestRef\.current = false;[\s\S]*prependOlderChatMessages/);
});

test("the composer preserves exact content and enforces the cryptographic retry identity lifecycle", () => {
  assert.match(workspace, /content = draftRef\.current/);
  assert.match(workspace, /window\.crypto\.getRandomValues\(new Uint8Array\(16\)\)/);
  assert.doesNotMatch(workspace, /randomUUID/);
  assert.match(workspace, /submissionIdentityRef/);
  assert.match(workspace, /sendingRef\.current/);
  assert.match(workspace, /finally \{[\s\S]*?sendingRef\.current = false;[\s\S]*?setSubmitting\(false\)/);
  assert.match(workspace, /The message could not be sent\. Check your connection and try again\./);
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
  assert.match(stylesheet, /@media \(max-width: 1024px\)/);
  assert.match(stylesheet, /@media \(max-width: 760px\)/);
  assert.match(stylesheet, /@media \(max-width: 460px\)/);
  assert.match(stylesheet, /overflow-x:\s*hidden/);
  assert.match(stylesheet, /\.conversation\s*\{[\s\S]*?display:\s*flex/);
  assert.match(stylesheet, /\.history\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(stylesheet, /\.ownMessage\s*\{[\s\S]*?align-self:\s*flex-end/);
  assert.match(stylesheet, /\.currentBadge/);
  assert.match(stylesheet, /prefers-reduced-motion/);
  assert.match(workspace, /<ChatLiveConnection/);
  assert.match(liveConnection, /new EventSource\(`\/api\/chat\/live\?room=/);
  assert.match(liveConnection, /source\.close\(\)/);
  assert.match(liveEvents, /select pg_notify/);
  assert.match(liveRoute, /LISTEN/);
  assert.doesNotMatch(`${workspace}\n${liveConnection}`, /setInterval|WebSocket|\bpoll(?:ing)?\b/i);
  assert.doesNotMatch(`${page}\n${actions}`, /EventSource|LISTEN|NOTIFY|pg_notify/i);
});

test("terminal authorization failures clear Chat state before navigation and every Chat action uses the shared handler", () => {
  assert.match(workspace, /function clearChatStateForTerminalAuthorization/);
  assert.match(workspace, /setDirectory\(\{ globalRooms: \[\], campaignRooms: \[\], directConversations: \[\] \}\)/);
  assert.match(workspace, /setMessages\(\[\]\)/);
  assert.match(workspace, /setTerminalDestination\(destination\)[\s\S]*router\.replace\(destination\)/);
  assert.match(workspace, /terminalDestination[\s\S]*authorizationLoss/);
  assert.ok(
    (workspace.match(/handleTerminalAuthorizationError\(/g) ?? []).length >= 12,
    "Every Chat operation should route terminal authorization failures through the shared handler.",
  );
  assert.match(workspace, /terminalDestination === "\/login"/);
  assert.match(workspace, /"\/access"/);
});

test("role changes are transactional and publish only generic committed directory invalidations", () => {
  assert.match(roleActions, /db\.transaction\(\(tx\) => setUserRoleInTransaction/);
  assert.doesNotMatch(roleActions, /\.insert\(userRole\)|\.delete\(userRole\)/);
  assert.match(roleService, /onConflictDoNothing\(\)[\s\S]*returning/);
  assert.match(roleService, /if \(changedRows\.length > 0\)[\s\S]*publishChatDirectoryInvalidationInTransaction\(tx\)/);
  assert.match(roleService, /You cannot remove your own administrator access/);
});

test("room authorization is asserted once before room-scoped moderation", () => {
  const start = service.indexOf("async function resolveAuthorizedRoom");
  const end = service.indexOf("async function findRequestMessage", start);
  const resolver = service.slice(start, end);
  assert.equal((resolver.match(/assertChatRoomAccess\(actor, room\)/g) ?? []).length, 1);
  assert.match(service, /for\("update", \{ of: chatMessage \}\)[\s\S]*mayDeleteChatMessage\(actor, room, message\.authorUserId\)/);
});

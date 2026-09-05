import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LIVE_SESSION_REVOCATION_CHANNEL,
  liveSessionRevocationMatchesUser,
  parseLiveSessionRevocation,
  parseLiveSessionRevocationPayload,
} from "./live-session-revocation";

const eventSource = readFileSync(
  "src/features/authorization/live-session-revocation.ts",
  "utf8",
);
const accountDeletionSource = readFileSync(
  "src/features/lifecycle/admin-account-lifecycle-service.ts",
  "utf8",
);
const userRoleServiceSource = readFileSync(
  "src/features/authorization/user-role-service.ts",
  "utf8",
);
const chatRouteSource = readFileSync("src/app/api/chat/live/route.ts", "utf8");
const tabletopRouteSource = readFileSync("src/app/api/tabletop/live/route.ts", "utf8");
const campaignActionsSource = readFileSync(
  "src/app/heavens/campaigns/actions.ts",
  "utf8",
);

test("live-session revocations accept only an exact bounded User ID contract", () => {
  const event = parseLiveSessionRevocation({ userId: "deleted-user" });
  assert.deepEqual(event, { userId: "deleted-user" });
  assert.equal(liveSessionRevocationMatchesUser(event!, "deleted-user"), true);
  assert.equal(liveSessionRevocationMatchesUser(event!, "other-user"), false);
  assert.deepEqual(
    parseLiveSessionRevocationPayload(JSON.stringify({ userId: "deleted-user" })),
    event,
  );

  for (const invalid of [
    null,
    [],
    {},
    { userId: "" },
    { userId: "   " },
    { userId: "x".repeat(256) },
    { userId: "deleted-user", email: "private@example.com" },
  ]) assert.equal(parseLiveSessionRevocation(invalid), null);
  for (const invalidPayload of [undefined, "", "not-json", "[]"]) {
    assert.equal(parseLiveSessionRevocationPayload(invalidPayload), null);
  }
});

test("account deletion publishes one targeted revocation inside its transaction", () => {
  assert.equal(LIVE_SESSION_REVOCATION_CHANNEL, "serrian_tide_live_session_revocation");
  assert.match(eventSource, /select pg_notify/);
  assert.match(eventSource, /PostgreSQL delivers pg_notify only if the caller-owned transaction commits/);

  const deletionStart = accountDeletionSource.indexOf(
    "export async function permanentlyDeleteAdminAccount",
  );
  const deletion = accountDeletionSource.slice(deletionStart);
  const rowDeletionIndex = deletion.indexOf(".delete(user)");
  const directoryIndex = deletion.indexOf("publishChatDirectoryInvalidationInTransaction(tx)");
  const revocationIndex = deletion.indexOf(
    "publishLiveSessionRevocationInTransaction(tx, targetUserId)",
  );
  const rollbackSeamIndex = deletion.indexOf("testSeam.afterDelete");
  assert.ok(rowDeletionIndex >= 0);
  assert.ok(directoryIndex > rowDeletionIndex, "surviving Chat users still receive a directory refresh");
  assert.ok(revocationIndex > directoryIndex, "the deleted User receives a separate targeted signal");
  assert.ok(rollbackSeamIndex > revocationIndex, "a rollback withholds both PostgreSQL notifications");
});

test("an actual User-role change publishes the same committed targeted revocation", () => {
  const changedBranchStart = userRoleServiceSource.indexOf("if (changedRows.length > 0)");
  const changedBranch = userRoleServiceSource.slice(changedBranchStart);
  assert.ok(changedBranchStart >= 0);
  assert.match(changedBranch, /publishChatDirectoryInvalidationInTransaction\(tx\)/);
  assert.match(
    changedBranch,
    /publishLiveSessionRevocationInTransaction\(tx, changedRows\[0\]!\.userId\)/,
  );
  assert.ok(
    changedBranch.indexOf("publishLiveSessionRevocationInTransaction")
      < changedBranch.indexOf("return { changed:"),
  );
});

test("successful Campaign-membership removal revokes that Player's open streams", () => {
  const removalStart = campaignActionsSource.indexOf(
    "export async function removeCampaignPlayer",
  );
  const removalEnd = campaignActionsSource.indexOf("return getCampaignMembers", removalStart);
  const removal = campaignActionsSource.slice(removalStart, removalEnd);
  assert.match(removal, /returning\(\{ userId: campaignPlayer\.userId \}\)/);
  assert.match(removal, /if \(removed\.length > 0\) \{/);
  assert.match(removal, /publishChatDirectoryInvalidationInTransaction\(tx\)/);
  assert.match(
    removal,
    /publishLiveSessionRevocationInTransaction\(tx, removed\[0\]!\.userId\)/,
  );
});

test("Chat and Tabletop close only the matching server stream without forwarding the User ID", () => {
  for (const route of [chatRouteSource, tabletopRouteSource]) {
    assert.match(route, /client\.on\("notification", onRevocationNotification\)/);
    assert.match(route, /LISTEN \$\{LIVE_SESSION_REVOCATION_CHANNEL\}/);
    assert.match(route, /UNLISTEN \$\{LIVE_SESSION_REVOCATION_CHANNEL\}/);
    assert.match(route, /liveSessionRevocationMatchesUser\(event, session\.user\.id\)/);
    assert.match(route, /revocationObserved = true;\s*void closeClient\?\.\(\)/);
    assert.match(route, /request\.signal\.aborted \|\| revocationObserved/);

    const handlerStart = route.indexOf("const onRevocationNotification");
    const handlerEnd = route.indexOf("const closeUnstartedClient", handlerStart);
    const handler = route.slice(handlerStart, handlerEnd);
    assert.doesNotMatch(handler, /send\(|controller\.enqueue|JSON\.stringify/);
    assert.ok(
      route.indexOf('client.on("notification", onRevocationNotification)')
        < route.indexOf("client.query(`LISTEN ${LIVE_SESSION_REVOCATION_CHANNEL}`)"),
      "the revocation listener must be attached before subscribing",
    );
  }
  assert.match(
    chatRouteSource,
    /authorizeChatRoomSubscriptionInTransaction\(tx, session\.user\.id, roomSlug\)/,
  );
  assert.match(chatRouteSource, /eq\(authSession\.id, session\.session\.id\)/);
  assert.match(chatRouteSource, /eq\(authSession\.userId, session\.user\.id\)/);
  assert.ok(
    chatRouteSource.indexOf("client.query(`LISTEN ${LIVE_SESSION_REVOCATION_CHANNEL}`)")
      < chatRouteSource.indexOf(".from(authSession)"),
    "Chat must recheck the exact session row after subscription",
  );

  const resolverStart = tabletopRouteSource.indexOf(
    "async function resolveTabletopSubscriptionAuthorization",
  );
  const resolverEnd = tabletopRouteSource.indexOf(
    "function authorizationFailureResponse",
    resolverStart,
  );
  const resolver = tabletopRouteSource.slice(resolverStart, resolverEnd);
  assert.ok(resolverStart >= 0 && resolverEnd > resolverStart);
  assert.match(resolver, /eq\(authSession\.id, authenticatedSessionId\)/);
  assert.match(resolver, /eq\(authSession\.userId, authenticatedUserId\)/);
  assert.match(resolver, /role === "god"/);
  assert.match(resolver, /eq\(campaign\.id, request\.campaignId\)/);
  assert.match(resolver, /eq\(campaign\.createdByUserId, authenticatedUserId\)/);
  assert.match(resolver, /role === "player"/);
  assert.match(resolver, /eq\(campaignCharacter\.id, request\.characterId\)/);
  assert.match(resolver, /eq\(campaignCharacter\.playerUserId, authenticatedUserId\)/);
  assert.match(resolver, /eq\(campaignPlayer\.userId, authenticatedUserId\)/);
  assert.match(resolver, /eq\(campaignCharacter\.isNpc, false\)/);
  assert.ok((resolver.match(/isNull\(campaign\.archivedAt\)/g) ?? []).length >= 2);
  assert.match(resolver, /isNull\(campaignCharacter\.archivedAt\)/);

  assert.equal(
    (tabletopRouteSource.match(/await resolveTabletopSubscriptionAuthorization\(/g) ?? []).length,
    2,
    "initial and post-LISTEN checks must share the exact resolver",
  );
  assert.ok(
    tabletopRouteSource.lastIndexOf("await resolveTabletopSubscriptionAuthorization(")
      > tabletopRouteSource.indexOf("client.query(`LISTEN ${LIVE_SESSION_REVOCATION_CHANNEL}`)"),
    "the exact resource authorization must run again after LISTEN",
  );
});

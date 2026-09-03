import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildAdminUserAccountSummary } from "./admin-user-account";

const account = {
  id: "user-1",
  name: "Serrian Player",
  username: "serrian-player",
  displayUsername: "SerrianPlayer",
  email: "player@example.com",
  createdAt: new Date("2026-01-10T12:00:00.000Z"),
};

test("an account with no associated records receives calm zero-count groups", () => {
  const summary = buildAdminUserAccountSummary({
    account,
    roles: [],
    campaignsCreated: [],
    campaignsJoined: [],
    characters: [],
  });

  assert.deepEqual(summary.counts, {
    campaignsCreated: 0,
    campaignsJoined: 0,
    playerCharacters: 0,
    raceNpcsControlled: 0,
    creatureNpcsControlled: 0,
  });
  assert.deepEqual(summary.roles, []);
  assert.deepEqual(summary.campaignsCreated, []);
  assert.deepEqual(summary.campaignsJoined, []);
  assert.deepEqual(summary.playerCharacters, []);
  assert.deepEqual(summary.raceNpcsControlled, []);
  assert.deepEqual(summary.creatureNpcsControlled, []);
});

test("created and joined Campaign associations remain independent even when they overlap", () => {
  const sharedCampaign = { id: 7, name: "The Breaking" };
  const summary = buildAdminUserAccountSummary({
    account,
    roles: ["player", "admin", "player", "god"],
    campaignsCreated: [sharedCampaign],
    campaignsJoined: [sharedCampaign, { id: 9, name: "The Crossing" }],
    characters: [],
  });

  assert.deepEqual(summary.roles, ["admin", "god", "player"]);
  assert.deepEqual(summary.campaignsCreated, [sharedCampaign]);
  assert.deepEqual(summary.campaignsJoined, [
    sharedCampaign,
    { id: 9, name: "The Crossing" },
  ]);
  assert.equal(summary.counts.campaignsCreated, 1);
  assert.equal(summary.counts.campaignsJoined, 2);
});

test("player Characters, race NPCs, and Creature NPCs have separate names and counts", () => {
  const summary = buildAdminUserAccountSummary({
    account,
    roles: ["player"],
    campaignsCreated: [],
    campaignsJoined: [],
    characters: [
      {
        id: 11,
        name: "Silas Thistle",
        campaignId: 7,
        campaignName: "The Breaking",
        isNpc: false,
        npcKind: "race",
      },
      {
        id: 12,
        name: "The Ferryman",
        campaignId: 7,
        campaignName: "The Breaking",
        isNpc: true,
        npcKind: "race",
      },
      {
        id: 13,
        name: "Ash Drake",
        campaignId: 7,
        campaignName: "The Breaking",
        isNpc: true,
        npcKind: "creature",
      },
    ],
  });

  assert.deepEqual(summary.playerCharacters, [
    {
      id: 11,
      name: "Silas Thistle",
      campaignId: 7,
      campaignName: "The Breaking",
    },
  ]);
  assert.deepEqual(summary.raceNpcsControlled, [
    {
      id: 12,
      name: "The Ferryman",
      campaignId: 7,
      campaignName: "The Breaking",
    },
  ]);
  assert.deepEqual(summary.creatureNpcsControlled, [
    {
      id: 13,
      name: "Ash Drake",
      campaignId: 7,
      campaignName: "The Breaking",
    },
  ]);
  assert.equal(summary.counts.playerCharacters, 1);
  assert.equal(summary.counts.raceNpcsControlled, 1);
  assert.equal(summary.counts.creatureNpcsControlled, 1);
});

test("the detail service projects only administrative summary relationships and never mutates", () => {
  const service = readFileSync(
    "src/features/authorization/admin-user-account-service.ts",
    "utf8",
  );

  assert.match(service, /campaign\.createdByUserId/);
  assert.match(service, /campaignPlayer\.userId/);
  assert.match(service, /campaignCharacter\.playerUserId/);
  assert.match(service, /campaignCharacter\.isNpc/);
  assert.match(service, /campaignCharacter\.npcKind/);
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
});

test("the admin route guards access, handles missing users, and preserves role controls", () => {
  const detailPage = readFileSync("src/app/admin/users/[userId]/page.tsx", "utf8");
  const usersPage = readFileSync("src/app/admin/users/page.tsx", "utf8");

  assert.match(detailPage, /await requireAdmin\(\)/);
  assert.match(detailPage, /if \(!summary\) notFound\(\)/);
  assert.match(detailPage, /getAdminUserAccountSummary\(userId\)/);
  assert.match(detailPage, /Race NPCs Controlled/);
  assert.match(detailPage, /Creature NPCs Controlled/);
  assert.match(usersPage, /action=\{setUserRole\}/);
  assert.match(usersPage, /View Account/);
});

test("potentially long account record lists are independently collapsible", () => {
  const detailPage = readFileSync("src/app/admin/users/[userId]/page.tsx", "utf8");

  assert.match(detailPage, /<details className="group/);
  assert.match(detailPage, /<summary className=/);
  assert.match(detailPage, /group-open:rotate-180/);
  assert.doesNotMatch(detailPage, /<details[^>]*\sopen(?:=|\s|>)/);
});

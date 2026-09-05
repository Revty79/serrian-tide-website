import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildAdminContentOverview } from "./admin-content-overview";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("the Admin content DTO separates Campaigns, PCs, Race NPCs, and Creature NPCs with ownership context", () => {
  const overview = buildAdminContentOverview({
    accounts: [
      {
        id: "owner-1",
        name: "Aster Vale",
        username: "aster",
        displayUsername: "AsterGOD",
      },
      {
        id: "owner-2",
        name: "Bram Reed",
        username: "bram",
        displayUsername: null,
      },
    ],
    campaigns: [
      {
        id: 1,
        name: "Brightwater",
        createdByUserId: "owner-1",
        archivedAt: null,
        archiveReason: "",
      },
      {
        id: 2,
        name: "Old Crossing",
        createdByUserId: "owner-2",
        archivedAt: new Date("2026-08-01T00:00:00.000Z"),
        archiveReason: "Campaign concluded",
      },
    ],
    characters: [
      {
        id: 10,
        name: "Mira",
        campaignId: 1,
        campaignName: "Brightwater",
        campaignArchivedAt: null,
        campaignOwnerUserId: "owner-1",
        controllerUserId: "owner-2",
        isNpc: false,
        npcKind: "race",
        npcBuildMode: null,
        npcRoleLabel: "",
        archivedAt: null,
        archiveReason: "",
      },
      {
        id: 11,
        name: "The Ferryman",
        campaignId: 1,
        campaignName: "Brightwater",
        campaignArchivedAt: null,
        campaignOwnerUserId: "owner-1",
        controllerUserId: "owner-1",
        isNpc: true,
        npcKind: "race",
        npcBuildMode: "simple",
        npcRoleLabel: "River guide",
        archivedAt: null,
        archiveReason: "",
      },
      {
        id: 12,
        name: "Ash Drake",
        campaignId: 2,
        campaignName: "Old Crossing",
        campaignArchivedAt: new Date("2026-08-01T00:00:00.000Z"),
        campaignOwnerUserId: "owner-2",
        controllerUserId: "owner-1",
        isNpc: true,
        npcKind: "creature",
        npcBuildMode: "detailed",
        npcRoleLabel: "Guardian",
        archivedAt: new Date("2026-08-02T00:00:00.000Z"),
        archiveReason: "Campaign concluded",
      },
    ],
    sharedCatalogs: [
      {
        key: "races",
        label: "Races",
        href: "/heavens/races",
        active: 14,
        archived: 2,
      },
    ],
  });

  assert.deepEqual(overview.counts, {
    campaigns: { active: 1, archived: 1, total: 2 },
    playerCharacters: { active: 1, archived: 0, total: 1 },
    raceNpcs: { active: 1, archived: 0, total: 1 },
    creatureNpcs: { active: 0, archived: 1, total: 1 },
  });
  assert.equal(overview.campaigns[0]?.owner.label, "Aster Vale (AsterGOD)");
  assert.equal(overview.playerCharacters[0]?.controller.label, "Bram Reed (bram)");
  assert.equal(overview.raceNpcs[0]?.buildMode, "simple");
  assert.equal(overview.creatureNpcs[0]?.campaign.status, "archived");
  assert.equal(overview.creatureNpcs[0]?.campaignOwner.label, "Bram Reed (bram)");
  assert.equal(overview.sharedCatalogs[0]?.total, 16);
});

test("the Admin content DTO keeps missing account references explicit", () => {
  const overview = buildAdminContentOverview({
    accounts: [],
    campaigns: [{
      id: 3,
      name: "Orphaned Record",
      createdByUserId: "missing-owner",
      archivedAt: null,
      archiveReason: "",
    }],
    characters: [],
    sharedCatalogs: [],
  });

  assert.equal(overview.campaigns[0]?.owner.label, "Unknown account (missing-owner)");
});

test("the site-wide content service authorizes before reading and remains read-only", () => {
  const service = read("src/features/authorization/admin-content-overview-service.ts");
  const guardIndex = service.indexOf("await requireAdmin()");
  const firstReadIndex = service.indexOf("db.select");

  assert.ok(guardIndex >= 0);
  assert.ok(firstReadIndex > guardIndex);
  assert.match(service, /campaignCharacter\.playerUserId/);
  assert.match(service, /campaign\.createdByUserId/);
  assert.match(service, /isNull\([a-zA-Z]+\.archivedAt\)/);
  assert.match(service, /isNotNull\([a-zA-Z]+\.archivedAt\)/);
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
});

test("the Admin content route is guarded, linked, and keeps long sections closed by default", () => {
  const page = read("src/app/admin/content/page.tsx");
  const dashboard = read("src/app/admin/page.tsx");

  assert.ok(page.indexOf("await requireAdmin()") < page.indexOf("getAdminContentOverview()"));
  assert.equal((page.match(/<ContentSection /g) ?? []).length, 4);
  assert.match(page, /<details className="group/);
  assert.doesNotMatch(page, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(page, /Campaign owner:/);
  assert.match(page, /Controller:/);
  for (const href of [
    "/heavens/races",
    "/heavens/creatures",
    "/heavens/skills",
    "/heavens/inventory",
    "/heavens/derived-abilities",
  ]) {
    assert.match(read("src/features/authorization/admin-content-overview-service.ts"), new RegExp(href));
  }
  assert.match(dashboard, /href: "\/admin\/content"/);
});

test("the NPC archive makes Admin site-wide scope and G.O.D. owner scope explicit", () => {
  const page = read("src/app/heavens/npcs/page.tsx");
  const adminContentPage = read("src/app/admin/content/page.tsx");
  const actions = read("src/app/heavens/npcs/actions.ts");
  const workspace = read("src/app/heavens/npcs/npc-workspace.tsx");
  const campaignList = actions.slice(
    actions.indexOf("export async function listNpcCampaigns"),
    actions.indexOf("export async function createNpc"),
  );

  assert.match(page, /isAdmin=\{access\.roles\.includes\("admin"\)\}/);
  assert.match(campaignList, /if \(!access\.roles\.includes\("admin"\)\)/);
  assert.match(campaignList, /eq\(campaign\.createdByUserId, access\.session\.user\.id\)/);
  assert.match(campaignList, /\.innerJoin\(user, eq\(user\.id, campaign\.createdByUserId\)\)/);
  assert.doesNotMatch(
    campaignList.slice(campaignList.indexOf("const rows = await db.select")),
    /\.where\(isNull\(campaign\.archivedAt\)\)/,
  );
  assert.match(campaignList, /archived: entry\.archivedAt !== null/);
  assert.match(campaignList, /ownerLabel:/);
  assert.match(workspace, /ADMINISTRATOR SITE-WIDE SCOPE/);
  assert.match(workspace, /G\.O\.D\. OWNER SCOPE/);
  assert.match(workspace, /active or archived Campaigns/);
  assert.match(workspace, /initialSimpleNpcId/);
  assert.match(workspace, /requestedSimpleNpc\.status !== initialStatus/);
  assert.match(workspace, /isAdmin && entry\.ownerLabel/);
  assert.match(workspace, /entry\.archived \? " \[Archived\]"/);
  assert.match(adminContentPage, /getSimpleNpcHref/);
});

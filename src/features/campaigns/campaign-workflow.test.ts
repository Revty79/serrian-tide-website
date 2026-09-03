import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CAMPAIGN_SETTINGS_TABS,
  getCampaignControlHref,
  getCampaignSettingsHref,
} from "./campaign-workflow";

function readSource(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Campaign creation and Character returns target the canonical Heavens context", () => {
  assert.equal(getCampaignControlHref({ campaignId: 42 }), "/heavens?campaign=42");
  assert.equal(
    getCampaignControlHref({ campaignId: 42, playerUserId: "player-1" }),
    "/heavens?campaign=42&player=player-1",
  );
});

test("Campaign Settings has only genuine configuration tabs", () => {
  assert.deepEqual(CAMPAIGN_SETTINGS_TABS, [
    { id: "rules", label: "Rules & Systems" },
    { id: "races", label: "Allowed Races" },
    { id: "inventory", label: "Inventory Access" },
  ]);
});

test("Campaign Settings contains no duplicated Player, Character, or NPC workflow", () => {
  const source = readSource("src/app/heavens/campaigns/campaign-workspace.tsx");
  for (const forbidden of [
    "CampaignPlayerPanel",
    "Players & Characters",
    "createCharacter",
    "removeCampaignPlayer",
    "getCampaignMembers",
    "source=campaigns",
    "NPC Workshop",
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} must not exist in Campaign Settings`);
  }
});

test("Heavens owns inline Add Player and links separately to Campaign Settings", () => {
  const controlSource = readSource("src/app/heavens/heavens-campaign-control.tsx");
  const playerPanelSource = readSource("src/app/heavens/campaigns/campaign-player-panel.tsx");
  assert.match(controlSource, /<CampaignPlayerPanel/);
  assert.match(controlSource, />Edit Campaign<\/Link>/);
  assert.match(playerPanelSource, />\s*Add Player\s*<\/button>/);
  assert.equal(getCampaignSettingsHref(42), "/heavens/campaigns?campaign=42");
});

test("Heavens creates and selects a Character in place, leaving Edit as the explicit navigation", () => {
  const source = readSource("src/app/heavens/heavens-campaign-control.tsx");
  assert.match(source, /const aggregate = await createCharacterForPlayer/);
  assert.match(source, /await getCampaignMembers/);
  assert.match(source, /setCharacterId\(String\(aggregate\.character\.id\)\)/);
  assert.match(source, />Edit Character<\/Link>/);
  assert.equal(source.includes("router.push"), false);
});

test("Realms opens the selected assigned Character and cannot create or self-assign one", () => {
  const dashboardSource = readSource("src/app/realms/realms-dashboard.tsx");
  const actionSource = readSource("src/app/characters/actions.ts");

  assert.match(dashboardSource, /router\.push\(`\/realms\/characters\/\$\{selectedCharacter\.id\}`\)/);
  assert.match(dashboardSource, />Open Character Editor<\/button>/);
  assert.equal(dashboardSource.includes("Create New Character"), false);
  assert.equal(dashboardSource.includes("createCharacter"), false);

  assert.match(actionSource, /export async function createCharacterForPlayer\(\s*campaignId: number,\s*playerUserId: string/);
  assert.match(actionSource, /const session = await requireGod\(\)/);
  assert.equal(actionSource.includes("playerUserId ?? session.user.id"), false);
});

test("successful Campaign creation redirects to the selected Heavens Campaign", () => {
  const source = readSource("src/app/heavens/campaigns/new/actions.ts");
  assert.match(
    source,
    /redirect\(getCampaignControlHref\(\{ campaignId: createdCampaignId \}\)\)/,
  );
});

test("Campaign creation and editing synchronize the stable general Chat room inside their transactions", () => {
  const createSource = readSource("src/app/heavens/campaigns/new/actions.ts");
  const editSource = readSource("src/app/heavens/campaigns/actions.ts");
  for (const source of [createSource, editSource]) {
    const transactionStart = source.indexOf("db.transaction(async (tx) =>");
    const synchronization = source.indexOf("synchronizeCampaignGeneralChatRoomInTransaction(tx");
    assert.ok(transactionStart >= 0);
    assert.ok(synchronization > transactionStart);
  }
  assert.doesNotMatch(createSource, /campaign-\$\{|Campaign Chat/);
  assert.doesNotMatch(editSource, /campaign-\$\{|Campaign Chat/);
});

test("Campaign Overview is persisted once and is readable in Heavens and Realms", () => {
  const schemaSource = readSource("src/db/campaign-schema.ts");
  const createActionSource = readSource("src/app/heavens/campaigns/new/actions.ts");
  const createFormSource = readSource("src/app/heavens/campaigns/new/campaign-create-form.tsx");
  const adminActionSource = readSource("src/app/heavens/campaigns/actions.ts");
  const editorSource = readSource("src/app/heavens/campaigns/campaign-workspace.tsx");
  const playerActionSource = readSource("src/app/characters/actions.ts");
  const realmsSource = readSource("src/app/realms/realms-dashboard.tsx");
  const heavensSource = readSource("src/app/heavens/heavens-campaign-control.tsx");

  assert.match(
    schemaSource,
    /overview:\s*text\("overview"\)\s*\.default\(""\)\s*\.notNull\(\)/,
  );
  assert.match(createActionSource, /const overview = readText\(formData, "overview"\)/);
  assert.match(createActionSource, /\.values\(\{[\s\S]*?overview,/);
  assert.match(createFormSource, /name="overview"/);
  assert.match(adminActionSource, /overview:\s*clean\(input\.overview\)/);
  assert.match(editorSource, /value=\{draft\.overview\}/);
  assert.match(
    playerActionSource,
    /PlayerCampaignSummary = \{ id: number; name: string; overview: string \}/,
  );
  assert.match(playerActionSource, /overview: campaign\.overview/);
  assert.match(realmsSource, /selectedCampaign\.overview/);
  assert.match(realmsSource, /whitespace-pre-wrap/);
  assert.match(heavensSource, /selectedCampaign\.overview/);
  assert.match(heavensSource, /whitespace-pre-wrap/);
  assert.equal(realmsSource.includes("dangerouslySetInnerHTML"), false);
  assert.equal(heavensSource.includes("dangerouslySetInnerHTML"), false);
});

test("normal G.O.D. Character links no longer target the removed Settings workflow", () => {
  const controlSource = readSource("src/app/heavens/heavens-campaign-control.tsx");
  const characterPageSource = readSource("src/app/heavens/characters/[characterId]/page.tsx");
  assert.match(controlSource, /source=heavens/);
  assert.equal(controlSource.includes("source=campaigns"), false);
  assert.equal(characterPageSource.includes('sourceValue === "campaigns"'), false);
  assert.equal(characterPageSource.includes("tab=players"), false);
});

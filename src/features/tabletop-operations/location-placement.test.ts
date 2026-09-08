import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const schema = read("src/db/tabletop-location-schema.ts");
const migration = read("drizzle/0038_tabletop_location_placement.sql");
const service = read("src/features/tabletop-operations/location-placement-service.ts");
const projection = read("src/features/tabletop-operations/location-public-projection.ts");
const actions = read("src/app/heavens/tabletop/location-actions.ts");
const workspace = read("src/app/heavens/tabletop/location-workspace.tsx");
const player = read("src/app/realms/tabletop/player-tabletop-workspace.tsx");
const lifecycle = read("src/features/lifecycle/lifecycle-service.ts");
const campaignPlan = read("src/features/lifecycle/campaign-delete-plan.ts");

test("0038 adds only normalized Session preparation and Scene placement references", () => {
  for (const table of [
    "campaign_session_prepared_town",
    "campaign_session_prepared_shop",
    "campaign_session_scene_town",
    "campaign_session_scene_town_shop",
    "campaign_session_scene_town_place",
    "campaign_session_scene_town_npc",
    "campaign_session_scene_shop",
  ]) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.match(schema, /campaign_session_scene_town_scene_fk/);
  assert.match(schema, /campaign_session_scene_town_prepared_fk/);
  assert.match(schema, /campaign_session_scene_town_place_source_fk/);
  assert.match(schema, /campaign_session_scene_town_npc_source_fk/);
  assert.match(schema, /campaign_session_scene_shop_prepared_fk/);
  assert.match(migration, /ON DELETE restrict/);
  assert.ok(
    migration.indexOf('CONSTRAINT "town_place_id_town_campaign_uq"')
      < migration.indexOf('CONSTRAINT "campaign_session_scene_town_place_source_fk"'),
    "the source composite key must exist before its placement foreign key",
  );
  assert.doesNotMatch(migration, /\b(?:DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE)\b/i);
  for (const forbidden of ["balance_credits", "limited_quantity", "prep_notes", "god_notes", "inventory", "money"]) {
    assert.doesNotMatch(migration, new RegExp(forbidden, "i"));
  }
});

test("Town placement is atomic, idempotent, deduplicated, and reuses membership", () => {
  assert.match(service, /db\.transaction|InTransaction/);
  assert.match(service, /new Map<number, \{ id: number; name: string; sortOrder: number \}>/);
  assert.match(service, /if \(!npcs\.has\(row\.id\)\)/);
  assert.match(service, /campaignSessionRoster[\s\S]*?onConflictDoNothing/);
  assert.match(service, /campaignSessionSceneMember[\s\S]*?onConflictDoNothing/);
  assert.match(service, /campaignSessionSceneTown[\s\S]*?onConflictDoNothing/);
  assert.match(service, /if \(!inserted\.length\) return \{ \.\.\.context, created: false \}/);
  assert.doesNotMatch(service, /campaignSessionEncounterParticipant\)|campaignSessionEncounterInitiative\)/);
});

test("all location Server Actions authenticate and mutations recheck hierarchy server-side", () => {
  for (const action of [
    "getLocationPlacementWorkspace",
    "prepareSessionTown",
    "prepareSessionShop",
    "removePreparedSessionTown",
    "removePreparedSessionShop",
    "addTownToScene",
    "addShopToScene",
    "createSceneFromTown",
    "detachTownFromScene",
    "detachShopFromScene",
    "setTownPlacementVisibility",
    "setTownChildState",
    "setShopPlacementVisibility",
    "previewTownPlacementRefresh",
    "refreshTownPlacement",
  ]) assert.match(actions, new RegExp(`export async function ${action}`));
  assert.match(actions, /requireGod\(\)/);
  assert.match(actions, /requireGodOrAdminAccessContext\(\)/);
  assert.match(service, /assertCampaignSessionOwner/);
  assert.match(service, /assertSceneIsEditable/);
  assert.match(service, /eq\(town\.campaignId, campaignId\)/);
  assert.match(service, /eq\(shop\.campaignId, campaignId\)/);
  assert.match(service, /isNull\(town\.archivedAt\)/);
  assert.match(service, /isNull\(shop\.archivedAt\)/);
});

test("refresh preserves retained choices and makes additions hidden", () => {
  assert.match(service, /previewTownRefreshInTransaction/);
  assert.match(service, /applyTownRefreshInTransaction/);
  assert.match(service, /shopAdditions/);
  assert.match(service, /shopRemovals/);
  assert.match(service, /included: true, revealed: false/);
  assert.doesNotMatch(service, /update\(campaignSessionSceneTown(?:Shop|Place|Npc)\)[\s\S]{0,160}included: true/);
  assert.match(workspace, /Preview Refresh/);
  assert.match(workspace, /Existing inclusion and visibility choices are preserved/);
});

test("player projection enforces parent reveal and contains descriptive fields only", () => {
  assert.match(projection, /eq\(campaignSessionSceneTown\.revealed, true\)/);
  for (const child of ["TownShop", "TownPlace", "TownNpc"]) {
    assert.match(projection, new RegExp(`inArray\\(campaignSessionScene${child}\\.townId, revealedTownIds\\)`));
  }
  assert.match(projection, /eq\(campaignSessionSceneTownShop\.included, true\)/);
  assert.match(projection, /eq\(campaignSessionSceneTownShop\.revealed, true\)/);
  assert.match(projection, /revealedNpcIdsByTown\.get\(townRow\.id\)\?\.has\(npcCharacterId\)/);
  assert.doesNotMatch(projection, /const revealedNpcIds = new Set/);
  for (const privateField of ["godNotes", "prepNotes", "balanceCredits", "characterPurchaseMode", "shopNote", "locationNotes"]) {
    assert.doesNotMatch(projection, new RegExp(privateField));
  }
  assert.match(player, /Revealed locations/);
  assert.doesNotMatch(player, /Enter Shop|Buy Now|Purchase|Sell Item/);
});

test("the G.O.D. interface provides preparation, inclusion, placement, visibility, and refresh controls", () => {
  for (const seam of [
    "SESSION LOCATIONS",
    "Prepare a Town",
    "Prepare an independent Shop",
    "Add Town to Scene",
    "Add Shop to Scene",
    "Create Scene from Town",
    "INCLUSION PREVIEW",
    "Reveal Town + Included",
    "Separately placed Shops",
    "Apply {changes(refreshPreview)} changes",
    "useInPlaceScrollPreservation",
  ]) assert.match(workspace, new RegExp(seam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(workspace, /canOperate && data\.sceneEditable/);
  assert.match(workspace, /Admin view is read-only/);
  assert.doesNotMatch(workspace, /Enter Shop|Purchase|Sell Item|Transfer/);
});

test("Town preview eligibility ignores staff supplied only by archived Shops", () => {
  assert.match(service, /for \(const townShop of townShops\) \{\s*if \(townShop\.archived\) continue;/);
  assert.match(service, /const readable = value \?\? historicalValue/);
  assert.match(workspace, /const contents = selected \? activeTownContents\(selected\) : null/);
});

test("location references participate in deletion previews and Campaign child-first deletion", () => {
  assert.match(lifecycle, /Scene Town placement references/);
  for (const table of [
    "campaign_session_scene_town_npc",
    "campaign_session_scene_town_place",
    "campaign_session_scene_town_shop",
    "campaign_session_scene_shop",
    "campaign_session_scene_town",
    "campaign_session_prepared_shop",
    "campaign_session_prepared_town",
  ]) {
    const child = campaignPlan.indexOf(`{ tableName: "${table}"`);
    assert.ok(child >= 0, `${table} must be in the Campaign deletion plan`);
    assert.ok(child < campaignPlan.indexOf('{ tableName: "campaign_session_scene", scope: "campaign" }'));
    assert.ok(child < campaignPlan.indexOf('{ tableName: "campaign_session", scope: "campaign" }'));
    assert.ok(child < campaignPlan.indexOf('{ tableName: "shop", scope: "campaign" }'));
    assert.ok(child < campaignPlan.indexOf('{ tableName: "town", scope: "campaign" }'));
  }
});

test("0038 is the additive migration tail", () => {
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.length, 42);
  assert.equal(journal.entries[37]?.tag, "0037_site_appearance");
  assert.equal(journal.entries[38]?.tag, "0038_tabletop_location_placement");
  assert.equal(journal.entries[39]?.tag, "0039_tabletop_shop_visits");
  assert.equal(journal.entries[40]?.tag, "0040_tabletop_shop_transactions");
});

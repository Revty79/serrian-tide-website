import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const schema = read("src/db/tabletop-shop-visit-schema.ts");
const migration = read("drizzle/0039_tabletop_shop_visits.sql");
const service = read("src/features/tabletop-operations/shop-visit-service.ts");
const godActions = read("src/app/heavens/tabletop/shop-visit-actions.ts");
const playerActions = read("src/app/realms/tabletop/shop-visit-actions.ts");
const godWorkspace = read("src/app/heavens/tabletop/shop-visit-workspace.tsx");
const playerWorkspace = read("src/app/realms/tabletop/player-shop-visit.tsx");
const playerConsole = read("src/app/realms/tabletop/player-tabletop-workspace.tsx");
const liveEvents = read("src/features/tabletop-operations/tabletop-live-events.ts");
const sceneActions = read("src/app/heavens/tabletop/scene-actions.ts");
const sessionActions = read("src/app/heavens/tabletop/actions.ts");
const placementService = read("src/features/tabletop-operations/location-placement-service.ts");
const globals = read("src/app/globals.css");

test("0039 adds normalized Shop visits and membership without changing earlier migrations", () => {
  assert.match(migration, /CREATE TABLE "campaign_session_scene_shop_visit"/);
  assert.match(migration, /CREATE TABLE "campaign_session_scene_shop_visit_member"/);
  assert.match(migration, /campaign_session_scene_shop_visit_one_active_shop_uq/);
  assert.match(migration, /campaign_session_scene_shop_visit_member_one_active_character_uq/);
  assert.match(schema, /startedByUserId/);
  assert.match(schema, /enteredByUserId/);
  assert.match(schema, /exitedByUserId/);
  assert.match(schema, /placementKind/);
  assert.match(schema, /townId/);
  assert.doesNotMatch(migration, /\b(?:DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE)\b/i);
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.length, 40);
  assert.equal(journal.entries[39]?.idx, 39);
  assert.equal(journal.entries[39]?.tag, "0039_tabletop_shop_visits");
});

test("visit entry reauthorizes ownership, hierarchy, placement, participant, and closed-Shop override", () => {
  assert.match(service, /assertOwner\(actor, context\.ownerUserId\)/);
  assert.match(service, /assertActiveContext\(context\)/);
  assert.match(service, /assertEligiblePlacement\(tx, context, input\.placement\)/);
  assert.match(service, /campaignSessionRoster/);
  assert.match(service, /campaignSessionSceneMember/);
  assert.match(service, /eq\(campaignCharacter\.isNpc, false\)/);
  assert.match(service, /isNull\(campaignCharacter\.archivedAt\)/);
  assert.match(service, /eq\(campaignSessionSceneTown\.revealed, true\)/);
  assert.match(service, /eq\(campaignSessionSceneTownShop\.included, true\)/);
  assert.match(service, /eq\(campaignSessionSceneTownShop\.revealed, true\)/);
  assert.match(service, /Closed-Shop override reason/);
  assert.match(service, /Archived Shops cannot start new visits/);
  assert.match(godActions, /requireGodOrAdminAccessContext\(\)/);
  assert.match(playerActions, /requirePlayer\(\)/);
});

test("entry is repeat-safe and concurrent membership is constrained in both schema and service", () => {
  assert.match(service, /new Set\(input\.characterIds/);
  assert.match(service, /onConflictDoNothing\(\)/);
  assert.match(service, /existingIds/);
  assert.match(service, /wrongVisit/);
  assert.match(service, /entered another Shop concurrently/);
  assert.match(schema, /campaign_session_scene_shop_visit_member_one_active_character_uq/);
  assert.match(schema, /campaign_session_scene_shop_visit_member_one_active_visit_character_uq/);
});

test("the Player projection is scoped to owned membership and omits management-only data", () => {
  const publicType = service.slice(service.indexOf("export type ShopVisitView"), service.indexOf("export type GodShopVisitView"));
  assert.doesNotMatch(publicType, /closedShopOverride|closedShopOverrideReason/);
  for (const privateField of ["shopNote", "balanceCredits", "characterPurchaseMode", "godNotes", "prepNotes", "npcProfile"]) {
    assert.doesNotMatch(publicType, new RegExp(privateField));
    assert.doesNotMatch(playerWorkspace, new RegExp(privateField));
  }
  assert.match(service, /membership\.ownerUserId !== playerUserId/);
  assert.match(service, /campaignPlayer/);
  assert.match(service, /readPlayerShopVisitInTransaction/);
  assert.match(service, /campaignSessionSceneTownNpc[\s\S]*?eq\(campaignSessionSceneTownNpc\.townId, placement\.townId\)[\s\S]*?eq\(campaignSessionSceneTownNpc\.included, true\)[\s\S]*?eq\(campaignSessionSceneTownNpc\.revealed, true\)/);
  assert.doesNotMatch(playerWorkspace, /closed-Shop override|closedShopOverrideReason/);
});

test("individual departure, G.O.D. controls, and final-visitor closure are explicit", () => {
  assert.match(service, /Players may leave only their own Character's Shop visit/);
  assert.match(service, /exitKind: "player-left"|"player-left"\)/);
  assert.match(service, /"god-removed"/);
  assert.match(service, /"visit-ended"/);
  assert.match(service, /closeVisitIfEmpty/);
  assert.match(service, /The final visitor left the Shop/);
  assert.match(godWorkspace, /Return to Scene/);
  assert.match(godWorkspace, /Remove Visitor/);
  assert.match(godWorkspace, /End Visit/);
  assert.match(playerWorkspace, /Leave Shop/);
});

test("live invalidation targets visit participants without resetting local navigation state", () => {
  assert.match(liveEvents, /"shop-visit"/);
  assert.match(godActions, /visit\?\.visitors\.map\(\(\{ characterId \}\) => characterId\)/);
  assert.match(godActions, /characterIds: audience\.characterIds/);
  assert.match(playerActions, /characterIds: result\.affectedCharacterIds/);
  assert.match(godWorkspace, /useInPlaceScrollPreservation/);
  assert.match(godWorkspace, /useState<number \| null>\(null\)/);
  assert.match(playerConsole, /TabletopLiveRefresh/);
  assert.match(playerConsole, /In \{shopVisit\.shop\.name\}/);
  assert.match(playerConsole, /PlayerCalledCheckPanel/);
});

test("lifecycle transitions close visits atomically and placement mutations block active sources", () => {
  assert.match(sceneActions, /endActiveShopVisitsForSceneInTransaction\(tx, sceneId, actor\.userId\)/);
  assert.match(sessionActions, /endActiveShopVisitsForSessionInTransaction\(tx, sessionId, actor\.userId\)/);
  assert.match(service, /exitKind: "lifecycle-ended"/);
  assert.match(service, /The Scene was completed/);
  assert.match(service, /The Session was completed/);
  assert.match(placementService, /assertNoActiveShopVisitForPlacementInTransaction/);
  assert.match(placementService, /End the active Shop visit|shopRemovals/);
});

test("visit views browse public offerings but expose no transaction-shaped controls", () => {
  for (const seam of ["Search offerings", "All categories", "Service / narrative", "Unlimited", "available"]) {
    assert.match(godWorkspace + playerWorkspace, new RegExp(seam.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of ["Buy now", "Checkout", "Approve purchase", "Grant money", "Sell item"]) {
    assert.doesNotMatch(godWorkspace + playerWorkspace, new RegExp(forbidden, "i"));
  }
});

test("the shared semantic control pattern covers native dropdown content and action roles", () => {
  assert.match(globals, /\.st-field/);
  assert.match(globals, /\.st-control/);
  assert.match(globals, /select option/);
  assert.match(globals, /background-color: var\(--st-input\)/);
  assert.match(globals, /\.st-button\.is-primary/);
  assert.match(globals, /\.st-button\.is-secondary/);
  assert.match(globals, /\.st-button\.is-danger/);
  assert.match(globals, /:focus-visible/);
  assert.match(godWorkspace, /className="st-control"/);
  assert.match(godWorkspace, /className="st-button is-primary"/);
});

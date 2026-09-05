import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const schema = read("src/db/shop-schema.ts");
const migration = read("drizzle/0035_campaign_shop_foundation.sql");
const actions = read("src/app/heavens/shops/actions.ts");
const workspace = read("src/app/heavens/shops/shop-workspace.tsx");

test("0035 adds the normalized Shop root, staff, and offering tables with restrictive relationships", () => {
  for (const table of ["shop", "shop_staff_assignment", "shop_offering"]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(schema, /shop_id_campaign_uq/);
  assert.match(schema, /shop_staff_assignment_shop_campaign_fk/);
  assert.match(schema, /shop_staff_assignment_npc_campaign_fk/);
  assert.match(schema, /shop_staff_assignment_shop_npc_uq/);
  assert.match(schema, /shop_staff_assignment_one_primary_uq/);
  assert.match(schema, /shop_offering_shop_campaign_fk/);
  assert.match(schema, /shop_offering_shop_item_uq/);
  assert.match(migration, /ON DELETE restrict/);
  assert.doesNotMatch(migration, /\b(?:DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE)\b/i);
});

test("Shop defaults and constraints are approval-safe, closed, nonnegative, and archive-aware", () => {
  for (const seam of [
    `DEFAULT 'closed'`,
    `DEFAULT 'god-approval-required'`,
    `DEFAULT 'add-to-shop-stock'`,
    `DEFAULT 'character-owner-accepts'`,
    "shop_balance_valid",
    "shop_archive_state_valid",
    "shop_offering_stock_valid",
    "shop_offering_selling_price_valid",
    "shop_offering_buying_price_valid",
  ]) assert.match(migration, new RegExp(seam));
});

test("database guards enforce persistent NPC eligibility and active Campaign-authorized Items", () => {
  assert.match(migration, /shop_staff_assignment_npc_eligibility_guard/);
  assert.match(migration, /candidate"\."is_npc" = true/);
  assert.match(migration, /candidate"\."npc_build_mode" IN \('simple', 'detailed'\)/);
  assert.match(migration, /candidate"\."archived_at" IS NULL/);
  assert.match(migration, /shop_offering_item_eligibility_guard/);
  assert.match(migration, /FROM "campaign_inventory_item"/);
  assert.match(migration, /catalog_item"\."archived_at" IS NULL/);
  assert.match(migration, /campaign_inventory_item_shop_dependency_guard/);
  assert.match(migration, /active Shop/);
  assert.match(migration, /shop_restore_offering_eligibility_guard/);
});

test("every Shop action authenticates and scopes mutations to Campaign and Shop identity", () => {
  for (const exportedAction of [
    "listShopCampaigns",
    "listShops",
    "getShop",
    "createShop",
    "saveShopCore",
    "addShopStaff",
    "updateShopStaff",
    "removeShopStaff",
    "addShopOffering",
    "updateShopOffering",
    "removeShopOffering",
    "reorderShopOfferings",
    "archiveShop",
    "restoreShop",
  ]) assert.match(actions, new RegExp(`export async function ${exportedAction}`));
  assert.match(actions, /requireGodOrAdminAccessContext/);
  assert.match(actions, /assertOwnedRootManager/);
  assert.match(actions, /eq\(shop\.campaignId, campaignId\)/);
  assert.match(actions, /assertShopEditable/);
  assert.match(actions, /eq\(campaignCharacter\.campaignId, normalized\.campaignId\)/);
  assert.match(actions, /eq\(campaignInventoryItem\.campaignId, input\.campaignId\)/);
  assert.doesNotMatch(actions, /saveCharacter|campaignCharacterItem\)|creditsRemaining/);
});

test("new staff and offerings reject archived or cross-Campaign sources at service boundaries", () => {
  assert.match(actions, /isEligibleShopNpc/);
  assert.match(actions, /active persistent Race or Creature NPC from this Campaign/);
  assert.match(actions, /requireEligibleOfferingItem/);
  assert.match(actions, /isNull\(item\.archivedAt\)/);
  assert.match(actions, /inArray\(item\.catalogScope, \["equipment", "inventory"\]\)/);
  assert.match(actions, /This NPC is already assigned to the Shop/);
  assert.match(actions, /This Item already has a listing in the Shop/);
});

test("Campaign inventory removal reports the active Shop dependency before deleting authorization", () => {
  const campaignActions = read("src/app/heavens/campaigns/actions.ts");
  const campaignDeletePlan = read("src/features/lifecycle/campaign-delete-plan.ts");
  const dependencyIndex = campaignActions.indexOf("shopDependencies");
  const deleteIndex = campaignActions.indexOf("await tx.delete(campaignInventoryItem)");
  assert.ok(dependencyIndex >= 0 && dependencyIndex < deleteIndex);
  assert.match(campaignActions, /eq\(shopOffering\.enabled, true\)/);
  assert.match(campaignActions, /isNull\(shop\.archivedAt\)/);
  assert.match(campaignActions, /Disable or remove the Shop offering first/);
  assert.match(campaignActions, /onConflictDoUpdate/);
  assert.ok(
    campaignDeletePlan.indexOf('{ tableName: "shop_offering"')
      < campaignDeletePlan.indexOf('{ tableName: "campaign_inventory_item"'),
    "Campaign graph deletion must remove Shop offerings before Campaign Item authorization.",
  );
});

test("archive and restore preserve children, close the storefront, and write lifecycle audit", () => {
  const archive = actions.slice(actions.indexOf("export async function archiveShop"));
  assert.match(archive, /storefrontState: "closed"/);
  assert.match(archive, /entityKind: "shop"/);
  assert.match(archive, /action: "archive"/);
  assert.match(archive, /action: "restore"/);
  assert.match(archive, /enabled offerings are unavailable/);
  assert.doesNotMatch(archive, /delete\(shop|delete\(shopOffering|delete\(shopStaffAssignment/);
});

test("The Heavens exposes a dedicated Shop Builder card, route, and navigation destination", () => {
  const heavens = read("src/app/heavens/page.tsx");
  const navigation = read("src/features/navigation/authenticated-navigation.ts");
  const page = read("src/app/heavens/shops/page.tsx");
  assert.match(heavens, /title: "SHOP BUILDER"[\s\S]*?href: "\/heavens\/shops"/);
  assert.match(navigation, /label: "Shops", href: "\/heavens\/shops"/);
  assert.match(page, /requireGodOrAdminAccessContext/);
  assert.match(page, /<ShopWorkspace/);
});

test("Shop Builder covers search, pricing, stock, staff, ordering, lifecycle, and scroll preservation", () => {
  for (const seam of [
    "matchesShopSearch",
    "filterShopCatalogItems",
    "formatCampaignMoney",
    "Canonical fallback",
    "Effective buying price",
    "service-narrative",
    "unlimitedStock",
    "limitedQuantity",
    "sellingPriceOverrideCredits",
    "buyingPriceOverrideCredits",
    "Primary contact",
    "reorderShopOfferings",
    "archiveShop",
    "restoreShop",
    "useInPlaceScrollPreservation",
    `data-preserve-scroll="shop-catalog"`,
  ]) assert.match(workspace, new RegExp(seam));
  assert.match(workspace, /Archived NPC · retained for history/);
  assert.match(workspace, /This Shop is archived and read-only/);
  assert.doesNotMatch(workspace, /Checkout|Purchase Request|Complete Sale|Buy Now/);
});

test("Prompt 1 does not add Town, placement, Character mutation, ledger, or automated economy systems", () => {
  const combined = `${schema}\n${actions}`;
  for (const forbidden of [
    /townId|shopTown|shop_town/i,
    /shopSession|shop_session|sceneShop|scene_shop/i,
    /shopTransaction|shop_transaction|transactionLedger/i,
    /profit|payroll|tax|automaticRestock|operatingSchedule/i,
  ]) assert.doesNotMatch(combined, forbidden);
});

test("0035 is the single forward migration after the verified 0034 tail", () => {
  const journal = JSON.parse(read("drizzle/meta/_journal.json")) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.length, 36);
  assert.equal(journal.entries[34]?.tag, "0034_verification_user_delete_guard");
  assert.deepEqual(journal.entries[35], {
    idx: 35,
    version: "7",
    when: 1788645605338,
    tag: "0035_campaign_shop_foundation",
    breakpoints: true,
  });
});

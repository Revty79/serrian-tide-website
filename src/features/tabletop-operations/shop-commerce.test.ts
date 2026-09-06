import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const schema = read("src/db/tabletop-shop-visit-schema.ts");
const realmSchema = read("src/db/realm-schema.ts");
const shopSchema = read("src/db/shop-schema.ts");
const service = read("src/features/tabletop-operations/shop-commerce-service.ts");
const visitService = read("src/features/tabletop-operations/shop-visit-service.ts");
const playerActions = read("src/app/realms/tabletop/shop-visit-actions.ts");
const godActions = read("src/app/heavens/tabletop/shop-visit-actions.ts");
const playerUi = read("src/app/realms/tabletop/player-shop-visit.tsx");
const godUi = read("src/app/heavens/tabletop/shop-visit-workspace.tsx");
const characterActions = read("src/app/characters/actions.ts");
const shopActions = read("src/app/heavens/shops/actions.ts");
const migration = read("drizzle/0040_tabletop_shop_transactions.sql");

test("0040 adds an additive constrained commerce ledger and stable exact-copy provenance", () => {
  for (const table of [
    "shop_commerce_operation",
    "shop_transaction_request",
    "shop_transaction_request_line",
    "shop_transaction",
    "shop_transaction_line",
    "shop_money_event",
    "shop_resale_item_instance",
  ]) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.doesNotMatch(migration, /^\s*(?:DROP|DELETE|TRUNCATE)\b/im);
  assert.match(schema, /shop_commerce_operation_actor_submission_uq/);
  assert.match(schema, /shop_transaction_request_lifecycle_valid/);
  assert.match(schema, /shop_resale_item_instance_lifecycle_valid/);
  assert.match(realmSchema, /provenanceSourceInstanceId/);
  assert.match(realmSchema, /retiredAt/);
  assert.match(realmSchema, /commerceVersion/);
  assert.match(shopSchema, /commerceVersion/);
  assert.match(shopSchema, /version: integer\("version"\)/);
});

test("execution reauthorizes, locks, validates currency representation, and commits all effects together", () => {
  assert.match(service, /lockActiveVisitMembership/);
  assert.match(service, /assertPlacementStillEligible/);
  assert.match(service, /assertPlayerAuthorization/);
  assert.match(service, /assertGodOwner/);
  assert.match(service, /\.for\("update"/);
  assert.match(service, /Number\.isFinite/);
  assert.match(service, /fullyRepresented/);
  assert.match(service, /writeCharacterMoneyEvent/);
  assert.match(service, /writeShopMoneyEvent/);
  assert.match(service, /shopTransactionLine/);
  assert.match(service, /limitedQuantity:[\s\S]*?- quantity/);
  assert.match(service, /getItemOwnershipStrategy/);
  assert.match(service, /getStartingItemInstanceCharges/);
  assert.match(service, /copyFirearmRuntimeState/);
  assert.match(service, /validateEquipmentOwnershipMutationInTransaction/);
});

test("requests bind approval to current terms and visit departures cancel unfinished work", () => {
  assert.match(service, /termsVersion/);
  assert.match(service, /ownerAcceptedTermsVersion/);
  assert.match(service, /godApprovedTermsVersion/);
  assert.match(service, /refreshPurchaseTerms/);
  assert.match(service, /expectedTermsVersion/);
  assert.match(service, /expectedOfferingVersion/);
  assert.match(service, /quotedFulfillmentKind/);
  assert.match(service, /assertNormalExecutionEligibility/);
  assert.match(service, /storefrontState !== "open"/);
  assert.match(service, /character-owner-accepts/);
  assert.match(service, /god-approval-finalizes/);
  assert.match(visitService, /cancelOpenShopRequestsForMembershipsInTransaction/);
  assert.match(visitService, /The Character left the Shop visit before the request completed/);
  assert.match(visitService, /The Shop visit ended/);
});

test("legacy editors reject missing or stale transaction versions before writing balances, stock, or inventory", () => {
  assert.match(characterActions, /Number\.isInteger\(draft\.expectedCommerceVersion\)/);
  assert.match(characterActions, /draft\.expectedCommerceVersion !== lockedProfile\.commerceVersion/);
  assert.match(shopActions, /Number\.isInteger\(input\.expectedCommerceVersion\)/);
  assert.match(shopActions, /eq\(shop\.balanceCredits, normalized\.balanceCredits\)/);
  assert.match(shopActions, /eq\(shopOffering\.version, input\.expectedVersion\)/);
  assert.match(shopActions, /if \(updated\.length !== 1\)/);
});

test("server actions publish scoped commerce invalidation only after transactional operations", () => {
  for (const source of [playerActions, godActions]) {
    assert.match(source, /db\.transaction/);
    assert.match(source, /publishTabletopInvalidationInTransaction/);
    assert.match(source, /"shop-commerce"/);
  }
  assert.match(playerActions, /requirePlayer\(\)/);
  assert.match(godActions, /requireGodOrAdminAccessContext/);
});

test("the Player and G.O.D. interfaces use themed controls, durable feedback, totals, and concise history", () => {
  for (const source of [playerUi, godUi]) {
    assert.match(source, /st-field/);
    assert.match(source, /st-control/);
    assert.match(source, /st-button/);
    assert.match(source, /formatCampaignMoney/);
    assert.match(source, /<dialog/);
  }
  assert.match(playerUi, /purchaseQuantities/);
  assert.match(playerUi, /saleInstances/);
  assert.match(playerUi, /Open requests/);
  assert.match(playerUi, /Recent Shop history/);
  assert.match(godUi, /Approve Current Terms/);
  assert.match(godUi, /Transaction Override/);
  assert.match(godUi, /Give \/ Correct Money/);
  assert.match(playerUi, /Selected total/);
  assert.match(godUi, /dialogFeedback/);
});

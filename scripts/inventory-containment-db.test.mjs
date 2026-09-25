import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (!/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_containment_dev$/.test(process.env.DATABASE_URL ?? "")) throw new Error("Run the disposable containment harness.");
const actors = new AsyncLocalStorage();
const session = async () => ({ user: { id: actors.getStore() } });
const context = async () => ({ session: await session(), roles: ["god", "player"] });
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: session, requirePlayer: session, requireGod: session, requireAdmin: session, requireRole: session,
  requireAccessContext: context, requireGodOrAdminAccessContext: context, requireCampaignOwner: session, requireCampaignAccess: session,
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { db, pool } = await import("../src/db/index.ts");
const { insertBuildTenFixture } = await import("./tabletop-build-ten-db-fixture.ts");
const containment = await import("../src/features/items/inventory-containment-service.ts");
const { setContainerProfileInTransaction } = await import("../src/features/items/container-catalog-service.ts");
const { adjustOwnerInventory } = await import("../src/features/items/owner-inventory-service.ts");
const equipment = await import("../src/features/items/equipment-state-service.ts");
const actions = await import("../src/app/characters/actions.ts");
const { characterAggregateToDraft } = await import("../src/features/characters/character-rules.ts");
const { handleMagazineInTransaction } = await import("../src/features/items/magazine-inventory-service.ts");
const { completeGodOverridePurchaseInTransaction } = await import("../src/features/tabletop-operations/shop-commerce-service.ts");
after(() => pool.end());
const rows = async (query, values = []) => (await pool.query(query, values)).rows;
const one = async (query, values = []) => (await rows(query, values))[0];

async function fixture() {
  const f = await db.transaction(tx => insertBuildTenFixture(tx, "containment"));
  await pool.query("insert into user_role(user_id,role) values($1,'god'),($1,'player')", [f.godId]);
  await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1", [f.encounterId]);
  const createItem = async name => (await one("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,credits) values($1,$2,'equipment','general','Item','Fixture','Fixture','unit',7) returning id", [`CONTAINMENT-${crypto.randomUUID()}`.toUpperCase(), name])).id;
  const modelId = await createItem("Backpack");
  const stackItemId = await createItem("Potions");
  const chargedItemId = await createItem("Charged copy");
  const plainItemId = await createItem("Ordinary supplies");
  for (const [sortOrder, itemId] of [modelId, stackItemId, chargedItemId, plainItemId].entries()) await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$3)", [f.campaignId, itemId, sortOrder]);
  await db.transaction(tx => setContainerProfileInTransaction(tx, modelId, true));
  await pool.query("insert into item_runtime_profiles(item_id,use_mode,maximum_charges,charges_per_use) values($1,'charges',5,1)", [chargedItemId]);
  const copy = async (itemId = modelId, characterId = f.heroId) => (await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,$3,11.5) returning id", [characterId, itemId, itemId === chargedItemId ? 5 : 0])).id;
  const a = await copy(), b = await copy(), c = await copy(), exact = await copy(chargedItemId), foreign = await copy(modelId, f.defenderId);
  const retired = await copy();
  await pool.query("update campaign_character_item_instance set retired_at=now(),retirement_reason='fixture' where id=$1", [retired]);
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,10,3.5),($1,$3,2,4)", [f.heroId, stackItemId, plainItemId]);
  return { ...f, modelId, stackItemId, chargedItemId, plainItemId, a, b, c, exact, foreign, retired, copy, createItem };
}
const view = f => db.transaction(tx => containment.readInventoryContainmentInTransaction(tx, f.godId, f.heroId));
const version = async f => (await view(f)).commerceVersion;
const move = async (f, details, userId = f.godId) => db.transaction(tx => containment.moveInventoryContentInTransaction(tx, userId,
  { characterId: f.heroId, expectedCommerceVersion: details.expectedCommerceVersion, ...details }));
const stackMove = async (f, from, to, quantity) => move(f, { kind: "stack", itemId: f.stackItemId, quantity,
  fromContainerInstanceId: from, toContainerInstanceId: to, expectedCommerceVersion: await version(f) });
const exactMove = async (f, instanceId, from, to) => move(f, { kind: "instance", instanceId,
  fromContainerInstanceId: from, toContainerInstanceId: to, expectedCommerceVersion: await version(f) });
const ownership = f => rows("select * from campaign_character_item where character_id=$1 order by item_id", [f.heroId]);
const copies = f => rows("select * from campaign_character_item_instance where character_id=$1 order by id", [f.heroId]);

test("Pass 1 locations preserve authoritative ownership and enforce containment integrity", async t => {
  const f = await fixture();
  await t.test("ordinary ownership loads loose with no location rows", async () => {
    const current = await view(f);
    assert.equal(current.stacks.find(row => row.itemId === f.stackItemId).looseQuantity, 10);
    assert.ok(current.instances.every(row => row.containerInstanceId === null));
    const record = await actors.run(f.godId, () => actions.getCharacter(f.heroId, true));
    assert.equal(record.items.find(row => row.itemId === f.plainItemId).quantity, 2);
    assert.equal(record.authorizedItems.find(row => row.id === f.modelId).isContainer, true);
  });
  const beforeStacks = await ownership(f), beforeCopies = await copies(f);
  await t.test("identical container copies hold separate stack allocations with loose remainder", async () => {
    await stackMove(f, null, f.a, 4);
    await stackMove(f, null, f.b, 3);
    const stack = (await view(f)).stacks.find(row => row.itemId === f.stackItemId);
    assert.deepEqual(stack, { itemId: f.stackItemId, ownedQuantity: 10, looseQuantity: 3,
      allocations: [{ containerInstanceId: f.a, quantity: 4 }, { containerInstanceId: f.b, quantity: 3 }] });
    const contents = id => db.transaction(tx => containment.readContainerContentsInTransaction(tx, f.godId, f.heroId, id));
    assert.deepEqual((await contents(f.a)).stacks, [{ itemId: f.stackItemId, quantity: 4 }]);
    assert.deepEqual((await contents(f.b)).stacks, [{ itemId: f.stackItemId, quantity: 3 }]);
  });
  await t.test("stack moves and return to loose preserve quantity, cost and acquired date", async () => {
    await stackMove(f, f.a, f.b, 2);
    await stackMove(f, f.b, null, 1);
    assert.deepEqual(await ownership(f), beforeStacks);
    assert.equal((await view(f)).stacks.find(row => row.itemId === f.stackItemId).looseQuantity, 4);
  });
  await t.test("exact moves preserve identity, charges, acquisition cost and equipment state", async () => {
    await exactMove(f, f.exact, null, f.a);
    await exactMove(f, f.exact, f.a, f.b);
    assert.deepEqual(await copies(f), beforeCopies);
    const location = await db.transaction(tx => containment.readItemLocationInTransaction(tx, f.godId, f.heroId, { kind: "instance", instanceId: f.exact }));
    assert.equal(location.containerInstanceId, f.b);
    assert.equal((await rows("select * from inventory_instance_location where instance_id=$1", [f.exact])).length, 1);
    await exactMove(f, f.exact, f.b, null);
    assert.equal((await rows("select * from inventory_instance_location where instance_id=$1", [f.exact])).length, 0);
  });
  await t.test("nested containers resolve ancestry and move contents with their parent", async () => {
    await exactMove(f, f.b, null, f.a);
    await exactMove(f, f.c, null, f.b);
    assert.deepEqual(containment.resolveContainmentAncestry(await view(f), f.c), [f.b, f.a]);
    assert.equal((await view(f)).stacks.find(row => row.itemId === f.stackItemId).allocations.find(row => row.containerInstanceId === f.b).quantity, 4);
  });
  await t.test("self containment and two-node or deeper cycles fail transactionally", async () => {
    const before = await view(f);
    await assert.rejects(exactMove(f, f.a, null, f.a), /self-containment/);
    await assert.rejects(exactMove(f, f.a, null, f.b), /Circular/);
    await assert.rejects(exactMove(f, f.a, null, f.c), /Circular/);
    assert.deepEqual(await view(f), before);
    await assert.rejects(pool.query("insert into inventory_instance_location values($1,$2,$3,$4,$3)", [f.a, f.heroId, f.modelId, f.c]), /Circular/);
  });
  await t.test("cross-Character contents and destinations are rejected", async () => {
    await assert.rejects(stackMove(f, null, f.foreign, 1), /owned container/);
    await assert.rejects(exactMove(f, f.foreign, null, f.a), /owned by this Character/);
    await assert.rejects(pool.query("insert into inventory_stack_location values($1,$2,$3,$4,1)", [f.heroId, f.stackItemId, f.foreign, f.modelId]), /owned container/);
  });
  await t.test("overallocation, zero, negative, fractional and nonowned stack quantities fail", async () => {
    for (const amount of [5, 0, -1, 0.5]) await assert.rejects(stackMove(f, null, f.a, amount), /quantity|positive/);
    await assert.rejects(pool.query("insert into inventory_stack_location values($1,$2,$3,$4,5)", [f.heroId, f.stackItemId, f.c, f.modelId]), /exceed/);
    await assert.rejects(pool.query("update inventory_stack_location set quantity=0 where character_id=$1", [f.heroId]), /positive/);
    await assert.rejects(pool.query("insert into inventory_stack_location values($1,$2,$3,$4,1)", [f.defenderId, f.stackItemId, f.foreign, f.modelId]), /does not own/);
  });
  await t.test("noncontainers and retired containers cannot receive contents", async () => {
    await assert.rejects(stackMove(f, null, f.exact, 1), /owned container/);
    await assert.rejects(stackMove(f, null, f.retired, 1), /owned container/);
    for (const [id, model] of [[f.exact, f.chargedItemId], [f.retired, f.modelId]]) {
      await assert.rejects(pool.query("insert into inventory_stack_location values($1,$2,$3,$4,1)", [f.heroId, f.stackItemId, id, model]), /owned container/);
    }
  });
  await t.test("exact location primary key rejects a second simultaneous location", async () => {
    await exactMove(f, f.exact, null, f.a);
    await assert.rejects(pool.query("insert into inventory_instance_location values($1,$2,$3,$4,$5)", [f.exact, f.heroId, f.chargedItemId, f.b, f.modelId]), /duplicate key/);
    await exactMove(f, f.exact, f.a, null);
  });
  await t.test("G.O.D. Remove blocks occupied containers and permits emptied copies", async () => {
    const remove = async id => actors.run(f.godId, async () => adjustOwnerInventory({ characterId: f.heroId, itemId: f.modelId,
      instanceId: id, operation: "remove", state: "inactive", quantity: 1, expectedCommerceVersion: await version(f) }));
    await assert.rejects(remove(f.a), /Empty the container/);
    await assert.rejects(pool.query("update campaign_character_item_instance set retired_at=now(),retirement_reason='sale' where id=$1", [f.a]), /Empty the container/);
    await assert.rejects(pool.query("delete from campaign_character_item_instance where id=$1", [f.a]), /Empty the container/);
    await assert.rejects(remove(f.c), /Move this owned copy to loose/);
    await exactMove(f, f.c, f.b, null);
    await remove(f.c);
    assert.ok((await one("select retired_at from campaign_character_item_instance where id=$1", [f.c])).retired_at);
  });
  await t.test("ownership decreases use the loose remainder and cannot erase allocations", async () => {
    await assert.rejects(pool.query("update campaign_character_item set quantity=5 where character_id=$1 and item_id=$2", [f.heroId, f.stackItemId]), /Move the allocated/);
    await assert.rejects(pool.query("delete from campaign_character_item where character_id=$1 and item_id=$2", [f.heroId, f.stackItemId]), /Move the allocated/);
    await pool.query("update campaign_character_item set quantity=9 where character_id=$1 and item_id=$2", [f.heroId, f.stackItemId]);
    assert.equal((await view(f)).stacks.find(row => row.itemId === f.stackItemId).looseQuantity, 3);
  });
  await t.test("container profiles never convert existing stacks and cannot disappear beneath exact copies", async () => {
    await assert.rejects(db.transaction(tx => setContainerProfileInTransaction(tx, f.stackItemId, true)), /cannot be converted/);
    await assert.rejects(pool.query("insert into container_profiles values($1)", [f.stackItemId]), /cannot be converted/);
    await assert.rejects(pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,1,0)", [f.heroId, f.modelId]), /exact owned copies/);
    await assert.rejects(db.transaction(tx => setContainerProfileInTransaction(tx, f.modelId, false)), /Keep the container profile/);
    await assert.rejects(pool.query("delete from container_profiles where item_id=$1", [f.modelId]), /Keep the container profile/);
  });
  await t.test("G.O.D. Add creates exact empty containers using existing ownership", async () => {
    await actors.run(f.godId, async () => adjustOwnerInventory({ characterId: f.heroId, itemId: f.modelId,
      operation: "grant", quantity: 2, expectedCommerceVersion: await version(f) }));
    assert.equal((await view(f)).instances.filter(row => row.itemId === f.modelId).length, 4);
    assert.equal((await ownership(f)).some(row => row.item_id === f.modelId), false);
  });
  await t.test("equipment and active effects remain independent of location", async () => {
    await pool.query("insert into item_passive_effects(item_id,required_equipment_state,schema_version,effect_json,sort_order) values($1,'equipped',2,$2,0)",
      [f.chargedItemId, JSON.stringify({ kind: "condition.apply", name: "Container fixture ward", description: "Fixture", duration: { kind: "until-removed", value: null } })]);
    await db.transaction(tx => equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.exact, state: "equipped" }));
    const before = await copies(f);
    const effectsBefore = await rows("select * from campaign_character_active_condition where character_id=$1 order by id", [f.heroId]);
    assert.ok(effectsBefore.some(row => row.name === "Container fixture ward"));
    await exactMove(f, f.exact, null, f.a);
    assert.deepEqual(await copies(f), before);
    assert.deepEqual(await rows("select * from campaign_character_active_condition where character_id=$1 order by id", [f.heroId]), effectsBefore);
    await db.transaction(tx => equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.exact, state: "inactive" }));
    assert.equal((await view(f)).instances.find(row => row.instanceId === f.exact).containerInstanceId, f.a);
  });
  await t.test("Character saving preserves stack locations and exact identity and supports buying container copies", async () => {
    const record = await actors.run(f.godId, () => actions.getCharacter(f.heroId, true));
    const draft = characterAggregateToDraft(record);
    draft.items.find(row => row.itemId === f.plainItemId).quantity += 1;
    draft.itemInstances.push({ draftId: -999, instanceId: null, itemId: f.modelId, unitCostCredits: 7 });
    const locationsBefore = await rows("select * from inventory_stack_location where character_id=$1 order by container_instance_id", [f.heroId]);
    const oldStack = (await ownership(f)).find(row => row.item_id === f.stackItemId);
    const saved = await actors.run(f.godId, () => actions.saveCharacter(f.heroId, draft, false, true));
    assert.deepEqual(await rows("select * from inventory_stack_location where character_id=$1 order by container_instance_id", [f.heroId]), locationsBefore);
    assert.deepEqual((await ownership(f)).find(row => row.item_id === f.stackItemId), oldStack);
    assert.equal(saved.itemInstances.filter(row => row.itemId === f.modelId).length, 5);
    assert.ok(saved.itemInstances.some(row => row.id === f.a));
    const stale = characterAggregateToDraft(saved);
    await stackMove(f, f.a, null, 1);
    await assert.rejects(actors.run(f.godId, () => actions.saveCharacter(f.heroId, stale, false, true)), /changed|Reload/);
  });
  await t.test("unauthorized and stale mutations leave all locations unchanged", async () => {
    const before = await view(f);
    await assert.rejects(move(f, { kind: "stack", itemId: f.stackItemId, quantity: 1, fromContainerInstanceId: null,
      toContainerInstanceId: f.a, expectedCommerceVersion: before.commerceVersion }, "foreign-user"), /permission/);
    await assert.rejects(move(f, { kind: "stack", itemId: f.stackItemId, quantity: 1, fromContainerInstanceId: null,
      toContainerInstanceId: f.a, expectedCommerceVersion: before.commerceVersion - 1 }), /Inventory changed/);
    assert.deepEqual(await view(f), before);
  });
  await t.test("active and frozen combat block location mutations", async () => {
    await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1", [f.encounterId]);
    await assert.rejects(stackMove(f, null, f.a, 1), /active combat/);
    await pool.query("update campaign_session_encounter set frozen_at=now() where id=$1", [f.encounterId]);
    await assert.rejects(stackMove(f, null, f.a, 1), /paused/);
  });
});

test("container acquisition uses existing commerce and magazine ammunition stays specialized", async t => {
  const f = await fixture();
  await t.test("Shop purchases create unique container copies at the existing purchase price", async () => {
    const shop = await one("insert into shop(campaign_id,name,category,storefront_state,balance_credits,character_purchase_mode,sold_item_handling,changed_sale_confirmation_mode) values($1,'Container fixture shop','Goods','open',100,'immediate','remove-from-active-play','character-owner-accepts') returning id", [f.campaignId]);
    const offering = await one("insert into shop_offering(shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,sort_order) values($1,$2,$3,'inventory-transfer',true,true,0) returning id", [shop.id, f.campaignId, f.modelId]);
    await pool.query("update campaign_character_profile set credits_remaining=100 where character_id=$1", [f.heroId]);
    const before = await copies(f), beforeVersion = await version(f);
    const input = { campaignId: f.campaignId, shopId: shop.id, characterId: f.heroId, submissionKey: crypto.randomUUID(), overrideReason: "Disposable purchase fixture",
      lines: [{ offeringId: offering.id, quantity: 2, expectedOfferingVersion: 0, quotedUnitPriceCredits: 7, quotedFulfillmentKind: "inventory-transfer" }] };
    const purchase = () => db.transaction(tx => completeGodOverridePurchaseInTransaction(tx, input, { userId: f.godId, roles: ["god"] }));
    const result = await purchase();
    assert.deepEqual(await purchase(), result, "Retry keeps the existing purchase receipt");
    const after = await copies(f), newCopies = after.filter(row => !before.some(old => old.id === row.id));
    assert.equal(newCopies.length, 2);
    assert.ok(newCopies.every(row => row.item_id === f.modelId && row.unit_cost_credits === 7));
    assert.equal((await one("select credits_remaining from campaign_character_profile where character_id=$1", [f.heroId])).credits_remaining, 86);
    assert.ok(await version(f) > beforeVersion);
    assert.equal((await view(f)).instances.filter(row => newCopies.some(copy => copy.id === row.instanceId)).every(row => row.containerInstanceId === null), true);
  });
  await t.test("loaded magazine rounds are separate from general contents and consume only available quantity", async () => {
    const magazineItemId = await f.createItem("Magazine");
    await pool.query("update items set record_type='Ammunition' where id=$1", [f.stackItemId]);
    await pool.query("insert into magazine_profiles(item_id,capacity_rounds) values($1,10)", [magazineItemId]);
    await pool.query("insert into magazine_ammunition(magazine_item_id,ammunition_item_id) values($1,$2)", [magazineItemId, f.stackItemId]);
    const magazine = await f.copy(magazineItemId);
    await stackMove(f, null, f.a, 8);
    const handle = (operation, rounds, expectedRounds) => db.transaction(tx => handleMagazineInTransaction(tx, f.godId, {
      characterId: f.heroId, instanceId: magazine, operation, rounds, expectedRounds,
      expectedAmmunitionItemId: expectedRounds ? f.stackItemId : null, ammunitionItemId: f.stackItemId, requestKey: crypto.randomUUID(),
    }));
    await assert.rejects(handle("add", 3, 0), error => /Move the allocated|Not enough carried, Loose/.test(error.cause?.message ?? error.message));
    await handle("add", 2, 0);
    await exactMove(f, magazine, null, f.b);
    const contents = await db.transaction(tx => containment.readContainerContentsInTransaction(tx, f.godId, f.heroId, f.b));
    assert.equal(contents.instances[0].instanceId, magazine);
    assert.deepEqual(contents.stacks, []);
    assert.equal((await view(f)).stacks.find(row => row.itemId === f.stackItemId).ownedQuantity, 8);
    assert.equal((await one("select loaded_rounds from campaign_character_item_instance where id=$1", [magazine])).loaded_rounds, 2);
    await assert.rejects(handle("empty", null, 2), /Move this magazine to Loose/);
    await exactMove(f, magazine, f.b, null);
    await handle("empty", null, 2);
    const stack = (await view(f)).stacks.find(row => row.itemId === f.stackItemId);
    assert.equal(stack.ownedQuantity, 10);
    assert.equal(stack.looseQuantity, 2);
    assert.equal((await ownership(f)).find(row => row.item_id === f.stackItemId).unit_cost_credits, 3.5);
  });
});

test("database locking prevents concurrent cycles, overallocation and retirement races", async t => {
  const f = await fixture();
  await t.test("concurrent owner grants to different Characters preserve exact tracking", async () => {
    const results = await Promise.allSettled([f.heroId, f.defenderId].map(characterId => actors.run(f.godId, async () => adjustOwnerInventory({
      characterId, itemId: f.modelId, operation: "grant", quantity: 1,
      expectedCommerceVersion: (await one("select commerce_version from campaign_character_profile where character_id=$1", [characterId])).commerce_version,
    }))));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 2, JSON.stringify(results));
  });
  await t.test("catalog activation racing a new stack cannot create stack-owned containers", async () => {
    const itemId = await f.createItem("Catalog race");
    const results = await Promise.allSettled([
      pool.query("insert into container_profiles values($1)", [itemId]),
      pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,1,0)", [f.heroId, itemId]),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.deepEqual(await rows("select i.* from campaign_character_item i join container_profiles p using(item_id) where i.item_id=$1", [itemId]), []);
  });
  await t.test("opposite moves with one expected inventory version cannot both commit", async () => {
    const expectedCommerceVersion = await version(f);
    const results = await Promise.allSettled([move(f, { kind: "instance", instanceId: f.a, fromContainerInstanceId: null, toContainerInstanceId: f.b, expectedCommerceVersion }),
      move(f, { kind: "instance", instanceId: f.b, fromContainerInstanceId: null, toContainerInstanceId: f.a, expectedCommerceVersion })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    for (const id of [f.a, f.b]) containment.resolveContainmentAncestry(await view(f), id);
    await pool.query("delete from inventory_instance_location where character_id=$1", [f.heroId]);
  });
  await t.test("direct SQL opposite moves cannot create a cycle", async () => {
    const results = await Promise.allSettled([[f.a, f.b], [f.b, f.a]].map(([source, target]) => pool.query(
      "insert into inventory_instance_location values($1,$2,$3,$4,$3)", [source, f.heroId, f.modelId, target])));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    await pool.query("delete from inventory_instance_location where character_id=$1", [f.heroId]);
  });
  await t.test("direct SQL allocations cannot overspend the same loose quantity", async () => {
    const results = await Promise.allSettled([f.a, f.b].map(id => pool.query("insert into inventory_stack_location values($1,$2,$3,$4,7)", [f.heroId, f.stackItemId, id, f.modelId])));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await view(f)).stacks.find(row => row.itemId === f.stackItemId).looseQuantity, 3);
    await pool.query("delete from inventory_stack_location where character_id=$1", [f.heroId]);
  });
  await t.test("repeatable-read stale graphs fail closed", async () => {
    const first = await pool.connect(), second = await pool.connect();
    try {
      for (const client of [first, second]) {
        await client.query("begin isolation level repeatable read");
        await client.query("select * from campaign_character where id=$1", [f.heroId]);
      }
      await first.query("insert into inventory_instance_location values($1,$2,$3,$4,$3)", [f.a, f.heroId, f.modelId, f.b]);
      await first.query("commit");
      await assert.rejects(second.query("insert into inventory_instance_location values($1,$2,$3,$4,$3)", [f.b, f.heroId, f.modelId, f.a]), /serialize/);
    } finally { await first.query("rollback"); await second.query("rollback"); first.release(); second.release(); }
    await pool.query("delete from inventory_instance_location where character_id=$1", [f.heroId]);
  });
  await t.test("retirement versus allocation leaves no orphan contents", async () => {
    const results = await Promise.allSettled([
      pool.query("insert into inventory_stack_location values($1,$2,$3,$4,1)", [f.heroId, f.stackItemId, f.c, f.modelId]),
      pool.query("update campaign_character_item_instance set retired_at=now(),retirement_reason='race' where id=$1", [f.c]),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const invalid = await rows("select l.* from inventory_stack_location l join campaign_character_item_instance i on i.id=l.container_instance_id where i.retired_at is not null");
    assert.deepEqual(invalid, []);
  });
  await t.test("failed target writes roll back source changes", async () => {
    await stackMove(f, null, f.a, 2);
    const before = await view(f);
    await assert.rejects(db.transaction(async tx => {
      await containment.moveInventoryContentInTransaction(tx, f.godId, { kind: "stack", itemId: f.stackItemId, characterId: f.heroId,
        expectedCommerceVersion: before.commerceVersion, quantity: 1, fromContainerInstanceId: f.a, toContainerInstanceId: f.b });
      throw new Error("rollback fixture");
    }), /rollback fixture/);
    assert.deepEqual(await view(f), before);
  });
  await t.test("deleting an ordinary Character with no locations still cascades normally", async () => {
    const { id } = await one("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'No runtime history') returning id", [f.campaignId, f.godId]);
    await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,1,0)", [id, f.stackItemId]);
    await f.copy(f.modelId, id);
    await pool.query("delete from campaign_character where id=$1", [id]);
    assert.equal((await rows("select * from campaign_character where id=$1", [id])).length, 0);
  });
});

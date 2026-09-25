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
const catalog = await import("../src/app/heavens/items/actions.ts");
const { emptyContainerPhysicalProfile } = await import("../src/features/items/container-physics.ts");
const equipment = await import("../src/features/items/equipment-state-service.ts");
const { handleMagazineInTransaction } = await import("../src/features/items/magazine-inventory-service.ts");
const { getCharacter, saveCharacter } = await import("../src/app/characters/actions.ts");
const { characterAggregateToDraft } = await import("../src/features/characters/character-rules.ts");
after(() => pool.end());
const rows = async (query, values = []) => (await pool.query(query, values)).rows;
const one = async (query, values = []) => (await rows(query, values))[0];
const rejected = (pattern) => error => pattern.test([error.message, error.cause?.message].join(" "));

async function fixture() {
  const f = await db.transaction(tx => insertBuildTenFixture(tx, "physical"));
  await pool.query("insert into user_role(user_id,role) values($1,'god'),($1,'player')", [f.godId]);
  await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1", [f.encounterId]);
  const createItem = async (name, weight = 1, volume = 0.5, dimension = 10) => (await one("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,credits,weight,weight_unit,volume_l,longest_dimension_cm,created_by_user_id) values($1,$2,'equipment','general','Item','Fixture','Fixture','unit',7,$3,$4,$5,$6,$7) returning id",
    [`PHYSICAL-${crypto.randomUUID()}`.toUpperCase(), name, weight, weight === null ? "" : "lb", volume, dimension, f.godId])).id;
  const backpackId = await createItem("Backpack", 3, 10, 40), pouchId = await createItem("Belt Pouch", 2, 3, 20);
  const suppliesId = await createItem("Supplies"), exactItemId = await createItem("Charged Item", 1, 1, 15);
  await pool.query("insert into container_profiles(item_id,classification,max_weight_lb,volume_capacity_l,max_item_dimension_cm) values($1,'backpack',30,35,60),($2,'pouch',5,3,20)", [backpackId, pouchId]);
  await pool.query("insert into item_runtime_profiles(item_id,use_mode,maximum_charges,charges_per_use) values($1,'charges',5,1)", [exactItemId]);
  for (const [sortOrder, id] of [backpackId, pouchId, suppliesId, exactItemId].entries()) await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$3)", [f.campaignId, id, sortOrder]);
  const copy = async (itemId, characterId = f.heroId) => (await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,$3,11.5) returning id", [characterId, itemId, itemId === exactItemId ? 4 : 0])).id;
  const a = await copy(backpackId), b = await copy(backpackId), pouch = await copy(pouchId), exact = await copy(exactItemId);
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,20,3.5)", [f.heroId, suppliesId]);
  return { ...f, backpackId, pouchId, suppliesId, exactItemId, a, b, pouch, exact, copy, createItem };
}
const view = f => db.transaction(tx => containment.readPhysicalInventoryInTransaction(tx, f.godId, f.heroId));
const move = async (f, details, userId = f.godId) => db.transaction(tx => containment.moveInventoryContentInTransaction(tx, userId,
  { characterId: f.heroId, expectedCommerceVersion: details.expectedCommerceVersion, ...details }));
const stackMove = async (f, from, to, quantity, itemId = f.suppliesId, userId = f.godId) => move(f, { kind: "stack", itemId, quantity,
  fromContainerInstanceId: from, toContainerInstanceId: to, expectedCommerceVersion: (await view(f)).commerceVersion }, userId);
const exactMove = async (f, id, from, to) => move(f, { kind: "instance", instanceId: id,
  fromContainerInstanceId: from, toContainerInstanceId: to, expectedCommerceVersion: (await view(f)).commerceVersion });
const snapshot = async f => {
  const result = {};
  for (const table of ["inventory_instance_location", "inventory_stack_location", "campaign_character_item", "campaign_character_item_instance", "campaign_character_profile", "campaign_character_item_equipment_state", "campaign_character_firearm_state", "firearm_magazine_attachment"]) {
    result[table] = await rows(`select to_jsonb(t) row from ${table} t where character_id=$1 order by to_jsonb(t)::text`, [f.heroId]);
  }
  return result;
};

test("mundane container mutations, physical authoring and permissions", async t => {
  await t.test("accepted partial stacks preserve ownership/cost and identical backpacks have independent loads", async () => {
    const f = await fixture(), before = await snapshot(f);
    await stackMove(f, null, f.a, 4); await stackMove(f, null, f.b, 2);
    const result = await view(f);
    assert.equal(result.containers.find(row => row.instanceId === f.a).contentsWeight.known, 4);
    assert.equal(result.containers.find(row => row.instanceId === f.a).usedVolume.known, 2);
    assert.equal(result.containers.find(row => row.instanceId === f.b).contentsWeight.known, 2);
    assert.equal(result.stacks[0].looseQuantity, 14);
    assert.deepEqual((await snapshot(f)).campaign_character_item, before.campaign_character_item);
  });
  for (const [field, value, pattern] of [["max_weight_lb", 2, /weight capacity/], ["volume_capacity_l", 1, /volume capacity/], ["max_item_dimension_cm", 9, /too long/]]) {
    await t.test(`${field} rejection rolls back location, ownership, version and runtime state`, async () => {
      const f = await fixture(); await pool.query(`update container_profiles set ${field}=$1 where item_id=$2`, [value, f.backpackId]);
      await stackMove(f, null, f.pouch, 3);
      const before = await snapshot(f);
      await assert.rejects(stackMove(f, f.pouch, f.a, 3), pattern);
      assert.deepEqual(await snapshot(f), before);
    });
  }
  await t.test("nested load propagates and parent volume excludes the child's contents", async () => {
    const f = await fixture(); await stackMove(f, null, f.a, 5); await exactMove(f, f.pouch, null, f.a); await stackMove(f, null, f.pouch, 3);
    const result = await view(f), backpack = result.containers.find(row => row.instanceId === f.a);
    assert.equal(backpack.contentsWeight.known, 10); assert.equal(backpack.usedVolume.known, 5.5); assert.equal(backpack.loadedWeight.known, 13);
    assert.equal(result.carriedWeight.known, 29);
  });
  await t.test("a move fitting its immediate pouch fails at an overloaded grandparent", async () => {
    const f = await fixture();
    const trunkId = await f.createItem("Trunk", 5, 50, 100), trunk = await f.copy(trunkId);
    await pool.query("insert into container_profiles(item_id,max_weight_lb,volume_capacity_l,max_item_dimension_cm) values($1,6,100,150)", [trunkId]);
    await exactMove(f, f.a, null, trunk); await exactMove(f, f.pouch, null, f.a);
    const before = await snapshot(f);
    await assert.rejects(stackMove(f, null, f.pouch, 2), /Trunk.*weight capacity/);
    assert.deepEqual(await snapshot(f), before);
  });
  await t.test("exact identity, charges, acquisition cost and Equipped state survive move and return", async () => {
    const f = await fixture(); await db.transaction(tx => equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.exact, state: "equipped" }));
    const before = (await snapshot(f)).campaign_character_item_instance;
    await exactMove(f, f.exact, null, f.a); await exactMove(f, f.exact, f.a, f.b); await exactMove(f, f.exact, f.b, null);
    assert.deepEqual((await snapshot(f)).campaign_character_item_instance, before);
  });
  await t.test("missing physical data blocks only enforced measurements; moving loose resolves legacy loads", async () => {
    const f = await fixture(); await pool.query("update items set weight=null,weight_unit='',volume_l=null,longest_dimension_cm=null where id=$1", [f.suppliesId]);
    await assert.rejects(stackMove(f, null, f.a, 1), /physical weight data not authored/);
    await pool.query("update container_profiles set max_weight_lb=null where item_id=$1", [f.backpackId]);
    await assert.rejects(stackMove(f, null, f.a, 1), /physical volume data not authored/);
    await pool.query("update container_profiles set volume_capacity_l=null where item_id=$1", [f.backpackId]);
    await assert.rejects(stackMove(f, null, f.a, 1), /physical dimension data not authored/);
    await pool.query("update container_profiles set max_item_dimension_cm=null where item_id=$1", [f.backpackId]);
    await stackMove(f, null, f.a, 1);
    await pool.query("update container_profiles set max_weight_lb=1 where item_id=$1", [f.backpackId]);
    await stackMove(f, f.a, null, 1);
    assert.equal((await view(f)).stacks[0].looseQuantity, 20);
  });
  await t.test("Worn/Wielded conflicts fail in both directions, including raw equipment writers", async () => {
    const f = await fixture();
    for (const state of ["worn", "wielded"]) {
      await db.transaction(tx => equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.exact, state }));
      await assert.rejects(exactMove(f, f.exact, null, f.a), rejected(/Worn|Wielded/));
      await db.transaction(tx => equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.exact, state: "inactive" }));
      await exactMove(f, f.exact, null, f.a);
      await assert.rejects(db.transaction(tx => equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.exact, state })), /loose/);
      await assert.rejects(pool.query("update campaign_character_item_instance set equipment_state=$1 where id=$2", [state, f.exact]), /loose/);
      await exactMove(f, f.exact, f.a, null);
    }
    await db.transaction(tx => equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.pouch, state: "worn" }));
    await assert.rejects(exactMove(f, f.pouch, null, f.a), rejected(/Worn/));
    await stackMove(f, null, f.a, 19);
    await db.transaction(tx => equipment.setStackEquipmentStateInTransaction(tx, { characterId: f.heroId, itemId: f.suppliesId, state: "worn", quantity: 1 }));
    await assert.rejects(stackMove(f, null, f.a, 1), rejected(/loose/));
    await assert.rejects(db.transaction(tx => equipment.setStackEquipmentStateInTransaction(tx, { characterId: f.heroId, itemId: f.suppliesId, state: "worn", quantity: 2 })), /loose/);
    await assert.rejects(pool.query("update campaign_character_item set quantity=19 where character_id=$1 and item_id=$2", [f.heroId, f.suppliesId]), /loose/);
  });
  await t.test("Player may organize own inventory; unauthorized actors cannot", async () => {
    const f = await fixture(), playerId = `physical-player-${crypto.randomUUID()}`;
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [playerId, `${playerId}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,'player')", [playerId]);
    await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [f.campaignId, playerId]);
    await pool.query("update campaign_character set player_user_id=$1 where id=$2", [playerId, f.heroId]);
    await stackMove(f, null, f.a, 1, f.suppliesId, playerId);
    const before = await snapshot(f); await assert.rejects(stackMove(f, null, f.a, 1, f.suppliesId, "outsider"), /permission/); assert.deepEqual(await snapshot(f), before);
  });
  await t.test("active combat and Freeze remain blocked and visible in the read model", async () => {
    const f = await fixture(); await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1", [f.encounterId]);
    await assert.rejects(stackMove(f, null, f.a, 1), /active combat/); assert.match((await view(f)).movementBlockedReason, /Initiative rules are not implemented/);
    await pool.query("update campaign_session_encounter set frozen_at=now() where id=$1", [f.encounterId]);
    await assert.rejects(stackMove(f, null, f.a, 1), /paused|frozen/i);
  });
  await t.test("physical catalog fields save/reload; noncontainers remain noncontainers", async () => {
    const f = await fixture();
    await actors.run(f.godId, async () => {
      const draft = await catalog.getItem(f.backpackId);
      const profile = { ...emptyContainerPhysicalProfile(), classification: "case", maxWeightLb: 40, volumeCapacityL: 38, maxItemDimensionCm: 55, allowsNestedContainers: false, allowedCategories: ["Fixture"], allowedRecordTypes: ["Item"] };
      const saved = await catalog.saveItem({ ...draft, core: { ...draft.core, volumeL: 12, physicalForm: "solid", longestDimensionCm: 45 }, containerProfile: profile });
      assert.deepEqual(saved.containerProfile, profile);
      assert.deepEqual((await catalog.getItem(saved.id)).containerProfile, profile);
      assert.equal(saved.core.volumeL, 12); assert.equal(saved.core.longestDimensionCm, 45);
      assert.equal(saved.core.physicalForm, "solid");
      const ordinary = await catalog.saveItem(await catalog.getItem(f.suppliesId)); assert.equal(ordinary.containerProfile, null);
      await assert.rejects(catalog.saveItem({ ...ordinary, core: { ...ordinary.core, volumeL: Infinity } }), /finite/);
      await assert.rejects(catalog.saveItem({ ...saved, containerProfile: { ...profile, containedWeightBehavior: "weightless" } }), /normal/);
      await assert.rejects(catalog.saveItem({ ...saved, containerProfile: { ...profile, maxWeightLb: null, volumeCapacityL: null } }), /finite/);
      await assert.rejects(exactMove(f, f.pouch, null, f.a), /nested containers/);
      await stackMove(f, null, f.a, 2);
    });
  });
  await t.test("new bag and pouch authoring requires finite capacity without converting ordinary Items", async () => {
    const f = await fixture();
    await actors.run(f.godId, async () => {
      for (const classification of ["backpack", "pouch"]) {
        const id = await f.createItem(`Authored ${classification}`), ordinary = await catalog.getItem(id);
        assert.equal(ordinary.containerProfile, null);
        await assert.rejects(catalog.saveItem({ ...ordinary, containerProfile: emptyContainerPhysicalProfile() }), /finite/);
        const profile = { ...emptyContainerPhysicalProfile(), classification, maxWeightLb: 10, allowsNestedContainers: false };
        const saved = await catalog.saveItem({ ...ordinary, containerProfile: profile });
        assert.deepEqual((await catalog.getItem(saved.id)).containerProfile, profile);
        const copy = await f.copy(id); await stackMove(f, null, copy, 1);
        await assert.rejects(exactMove(f, f.pouch, null, copy), /nested containers/);
      }
    });
  });
  await t.test("authored category, type and liquid restrictions govern runtime and preserve failed moves", async () => {
    const f = await fixture();
    await actors.run(f.godId, async () => {
      const initial = await catalog.getItem(f.backpackId);
      const save = changes => catalog.saveItem({ ...initial, containerProfile: { ...initial.containerProfile, ...changes } });
      for (const [settings, pattern] of [[{ allowedCategories: ["Food"] }, /allowed categories/], [{ allowedRecordTypes: ["Ammunition"] }, /allowed record types/], [{ liquidOnly: true }, /Liquid physical form/]]) {
        await save(settings); const before = await snapshot(f);
        await assert.rejects(stackMove(f, null, f.a, 1), pattern); assert.deepEqual(await snapshot(f), before);
      }
      const supplies = await catalog.getItem(f.suppliesId);
      await catalog.saveItem({ ...supplies, core: { ...supplies.core, physicalForm: "liquid" } });
      await stackMove(f, null, f.a, 1); await stackMove(f, f.a, null, 1);
      await save({ allowedCategories: [" fixture "], allowedRecordTypes: ["item"], liquidOnly: true });
      await stackMove(f, null, f.a, 1);
      assert.equal((await view(f)).containers.find(row => row.instanceId === f.a).contentsWeight.known, 1);
    });
  });
  await t.test("saved Character reload preserves physical locations and all owned costs", async () => {
    const f = await fixture(); await exactMove(f, f.pouch, null, f.a); await stackMove(f, null, f.pouch, 2);
    const before = (await view(f)).graph;
    await actors.run(f.godId, async () => { const record = await getCharacter(f.heroId, true); const draft = characterAggregateToDraft(record); await saveCharacter(f.heroId, draft, false, true); });
    assert.deepEqual((await view(f)).graph, before);
  });
  await t.test("stale/concurrent moves cannot overfill or duplicate allocations", async () => {
    const f = await fixture(), version = (await view(f)).commerceVersion;
    const command = { kind: "stack", itemId: f.suppliesId, quantity: 4, fromContainerInstanceId: null, toContainerInstanceId: f.pouch, expectedCommerceVersion: version };
    const outcomes = await Promise.allSettled([move(f, command), move(f, command)]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await view(f)).containers.find(row => row.instanceId === f.pouch).contentsWeight.known, 4);
  });
});

test("specialized firearm and magazine physical weights preserve every runtime field", async t => {
  const f = await fixture(), ammoId = await f.createItem("Cartridges", 0.1, 0.01, 3), magId = await f.createItem("Magazine", 1, 0.3, 12), gunId = await f.createItem("Rifle", 7, 4, 50);
  await pool.query("insert into magazine_profiles(item_id,capacity_rounds) values($1,10)", [magId]);
  await pool.query("insert into magazine_ammunition(magazine_item_id,ammunition_item_id) values($1,$2)", [magId, ammoId]);
  const ammoProfile = (await one("insert into weapon_profiles(item_id,profile_record_type) values($1,'Ammunition') returning id", [ammoId])).id;
  const gunProfile = (await one("insert into weapon_profiles(item_id,profile_record_type,weapon_type,reload_type,ammunition_item_id) values($1,'Weapon','Rifle','Magazine',$2) returning id", [gunId, ammoId])).id;
  await pool.query("insert into weapon_magazines(weapon_profile_id,magazine_item_id) values($1,$2)", [gunProfile, magId]);
  const mode = (await one("insert into weapon_firing_modes(weapon_profile_id,name,normalized_name,sort_order,base_cycling_initiative_cost,base_recoil_reset_initiative_cost,delivery_cadence,rounds_per_cadence) values($1,'Single','single',0,1,1,'per-trigger',1) returning id", [gunProfile])).id;
  const mag = await f.copy(magId), spare = await f.copy(magId), gun = await f.copy(gunId);
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,30,2)", [f.heroId, ammoId]);
  await pool.query("insert into campaign_character_firearm_state(item_instance_id,campaign_id,character_id,item_id,weapon_profile_id,selected_firing_mode_id,initialization_key,initialized_by_user_id,updated_by_user_id,readiness_mode,readiness_mode_source,readied) values($1,$2,$3,$4,$5,$6,'physical-fixture',$7,$7,'draw-is-ready','canonical',true)", [gun, f.campaignId, f.heroId, gunId, gunProfile, mode, f.godId]);
  const fill = (instanceId, rounds) => db.transaction(tx => handleMagazineInTransaction(tx, f.godId, { characterId: f.heroId, instanceId, operation: "add", expectedRounds: 0, expectedAmmunitionItemId: null, ammunitionItemId: ammoId, rounds, requestKey: crypto.randomUUID() }));
  const weight = () => view(f).then(result => result.carriedWeight.known);
  const initialWeight = await weight();
  await t.test("empty magazine uses base weight; partially loaded magazine includes its rounds without loose duplication", async () => {
    await exactMove(f, spare, null, f.a);
    assert.equal((await view(f)).containers.find(row => row.instanceId === f.a).contentsWeight.known, 1);
    await exactMove(f, spare, f.a, null); await fill(spare, 4); await fill(mag, 8);
    const before = await snapshot(f); await exactMove(f, spare, null, f.a);
    assert.equal((await view(f)).containers.find(row => row.instanceId === f.a).contentsWeight.known, 1.4);
    assert.deepEqual((await snapshot(f)).campaign_character_item_instance, before.campaign_character_item_instance);
    await exactMove(f, spare, f.a, null); assert.equal(await weight(), initialWeight);
  });
  await t.test("attached magazine follows firearm assembly once, with readiness/attachments/rounds unchanged", async () => {
    await pool.query("insert into firearm_magazine_attachment(weapon_instance_id,magazine_instance_id,character_id,campaign_id,weapon_item_id,weapon_profile_id,magazine_item_id) values($1,$2,$3,$4,$5,$6,$7)", [gun, mag, f.heroId, f.campaignId, gunId, gunProfile, magId]);
    const before = await snapshot(f);
    await exactMove(f, gun, null, f.a);
    assert.equal((await view(f)).containers.find(row => row.instanceId === f.a).contentsWeight.known, 8.8);
    assert.equal(await weight(), initialWeight);
    await exactMove(f, gun, f.a, f.b); await exactMove(f, gun, f.b, null);
    const after = await snapshot(f);
    for (const table of ["campaign_character_item", "campaign_character_item_instance", "campaign_character_firearm_state", "firearm_magazine_attachment"]) assert.deepEqual(after[table], before[table]);
    assert.equal((await rows("select * from inventory_stack_location where character_id=$1 and item_id=$2", [f.heroId, ammoId])).length, 0);
  });
  await t.test("a fully loaded standalone magazine moves without unloading or changing ammunition costs", async () => {
    await db.transaction(tx => handleMagazineInTransaction(tx, f.godId, { characterId: f.heroId, instanceId: spare, operation: "fill", expectedRounds: 4, expectedAmmunitionItemId: ammoId, ammunitionItemId: ammoId, rounds: null, requestKey: crypto.randomUUID() }));
    const before = await snapshot(f);
    await exactMove(f, spare, null, f.b);
    assert.equal((await view(f)).containers.find(row => row.instanceId === f.b).contentsWeight.known, 2);
    await exactMove(f, spare, f.b, null);
    assert.deepEqual((await snapshot(f)).campaign_character_item_instance, before.campaign_character_item_instance);
    assert.deepEqual((await snapshot(f)).campaign_character_item, before.campaign_character_item);
    assert.equal(await weight(), initialWeight);
  });
  await t.test("missing ammunition and magazine weights remain unknown and block weight-enforced storage", async () => {
    await pool.query("update items set weight=null,weight_unit='' where id=$1", [ammoId]);
    await assert.rejects(exactMove(f, gun, null, f.a), /Cartridges ammunition/);
    await pool.query("update items set weight=0.1,weight_unit='lb' where id=$1", [ammoId]);
    await pool.query("update items set weight=null,weight_unit='' where id=$1", [magId]);
    await assert.rejects(exactMove(f, gun, null, f.a), /Magazine/);
    assert.ok((await view(f)).carriedWeight.unknown.length);
    await pool.query("update items set weight=1,weight_unit='lb' where id=$1", [magId]);
  });
  await t.test("internally loaded firearm weight reads the existing firearm state without changing it", async () => {
    await pool.query("delete from firearm_magazine_attachment where weapon_instance_id=$1", [gun]);
    await pool.query("update campaign_character_firearm_state set loaded_rounds=3,loaded_ammunition_item_id=$2,loaded_ammunition_profile_id=$3,loaded_ammunition_unit_cost_credits=2 where item_instance_id=$1", [gun, ammoId, ammoProfile]);
    await pool.query("update campaign_character_item set quantity=quantity-3 where character_id=$1 and item_id=$2", [f.heroId, ammoId]);
    const before = await snapshot(f); await exactMove(f, gun, null, f.a);
    assert.equal((await view(f)).containers.find(row => row.instanceId === f.a).contentsWeight.known, 7.3);
    assert.equal(await weight(), initialWeight); await exactMove(f, gun, f.a, null);
    assert.deepEqual((await snapshot(f)).campaign_character_firearm_state, before.campaign_character_firearm_state);
  });
});

if (process.env.CONTAINMENT_BROWSER === "1") test("real Character and Item authoring browser workflows", { timeout: 300_000 }, async () => {
  const f = await fixture();
  const { runContainerPhysicalBrowser } = await import("./container-physical-browser.ts");
  await runContainerPhysicalBrowser(f);
});

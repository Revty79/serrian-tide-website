import assert from "node:assert/strict";

/** Runs inside the existing disposable physical inventory fixture. */
export async function containerMagicCases(t, { fixture, specializedFixture, pool, db, actors, catalog, containment, view, exactMove, stackMove, snapshot }) {
  const saveRules = async (f, patch, itemId = f.backpackId) => actors.run(f.godId, async () => {
    const item = await catalog.getItem(itemId);
    return catalog.saveItem({ ...item, containerProfile: { ...item.containerProfile, ...patch } });
  });
  const substance = { id: "water", name: "Water", unit: "L", weightLbPerUnit: 2, volumeLPerUnit: 1, physicalForm: "liquid", isMagical: false };
  const finite = { mode: "finite", substance, maxQuantity: 2, locked: true, allowsItems: false };
  const adjust = async (f, operation, quantity, extra = {}, userId = f.godId) => db.transaction(tx => containment.changeContainerSubstanceInTransaction(tx, userId,
    { characterId: f.heroId, expectedCommerceVersion: extra.expectedCommerceVersion ?? undefined, instanceId: f.a, operation, quantity, ...extra }));
  const change = async (f, operation, quantity, extra = {}, userId = f.godId) => adjust(f, operation, quantity, { expectedCommerceVersion: (await view(f)).commerceVersion, ...extra }, userId);
  await t.test("independent unlimited modes still enforce the other capacity and reload exactly", async () => {
    const f = await fixture();
    await saveRules(f, { maxWeightLb: 0, volumeCapacityL: 1, weightCapacityMode: "unlimited" });
    await stackMove(f, null, f.a, 2); await assert.rejects(stackMove(f, null, f.a, 1), /volume capacity/);
    await stackMove(f, f.a, null, 2);
    await saveRules(f, { maxWeightLb: 1, volumeCapacityL: 0, volumeCapacityMode: "unlimited", weightCapacityMode: "normal" });
    await stackMove(f, null, f.a, 1); await assert.rejects(stackMove(f, null, f.a, 1), /weight capacity/);
    const loaded = (await view(f)).containers.find(row => row.instanceId === f.a);
    assert.equal(loaded.profile.volumeCapacityMode, "unlimited"); assert.equal(loaded.remainingVolumeL, null);
  });
  await t.test("weightless nesting, magical restrictions, invalid catalog reads and moving out", async () => {
    const f = await fixture();
    await saveRules(f, { containedWeightBehavior: "contents-weightless", weightCapacityMode: "unlimited", volumeCapacityMode: "unlimited" }, f.pouchId);
    await stackMove(f, null, f.pouch, 10); await exactMove(f, f.pouch, null, f.a);
    assert.equal((await view(f)).containers.find(row => row.instanceId === f.a).contentsWeight.known, 2);
    await saveRules(f, { magicalContentRestriction: "mundane-only" });
    await pool.query("update items set is_magical=true where id=$1", [f.pouchId]);
    const before = await snapshot(f);
    assert.match((await view(f)).containers.find(row => row.instanceId === f.a).problems.join(" "), /mundane Items only/);
    assert.deepEqual(await snapshot(f), before);
    await assert.rejects(exactMove(f, f.exact, null, f.a), /mundane Items only/);
    await exactMove(f, f.pouch, f.a, null);
    await saveRules(f, { magicalContentRestriction: "magical-only" });
    await assert.rejects(exactMove(f, f.exact, null, f.a), /magical Items only/); await exactMove(f, f.pouch, null, f.a);
    await saveRules(f, { magicalContentRestriction: "any" }); await exactMove(f, f.exact, null, f.a);
  });
  await t.test("unknown content mass is irrelevant only without weight enforcement; volume still blocks", async () => {
    const f = await fixture(); await saveRules(f, { weightCapacityMode: "unlimited", containedWeightBehavior: "contents-weightless" });
    await pool.query("update items set weight=null,weight_unit='' where id=$1", [f.suppliesId]); await stackMove(f, null, f.a, 20);
    assert.deepEqual((await view(f)).containers.find(row => row.instanceId === f.a).loadedWeight, { known: 3, unknown: [] });
    await stackMove(f, f.a, null, 1); await pool.query("update items set volume_l=null where id=$1", [f.suppliesId]);
    await assert.rejects(stackMove(f, null, f.a, 1), /volume data not authored/);
    await stackMove(f, f.a, null, 19);
  });
  await t.test("finite substance increments, decrements, weighs, enforces maximum and blocks occupied removal", async () => {
    const f = await fixture(); await saveRules(f, { source: finite });
    const original = (await view(f)).carriedWeight.known;
    await change(f, "add", 1.3); assert.equal((await view(f)).carriedWeight.known, original + 2.6);
    await change(f, "draw", 0.3); assert.equal((await view(f)).bulkContents[0].quantity, 1);
    await change(f, "add", 1); assert.equal((await view(f)).bulkContents[0].quantity, 2);
    const before = await snapshot(f);
    await assert.rejects(change(f, "add", 0.1), /maximum/); await assert.rejects(change(f, "draw", 3), /Not enough/);
    await assert.rejects(pool.query("delete from campaign_character_item_instance where id=$1", [f.a]), /Empty the container/);
    await assert.rejects(pool.query("update campaign_character_item_instance set retired_at=now() where id=$1", [f.a]), /Empty the container/);
    assert.deepEqual(await snapshot(f), before);
    await change(f, "draw", 2); assert.equal((await view(f)).bulkContents.length, 0);
    await change(f, "add", 0.3); await change(f, "draw", 0.1); await change(f, "draw", 0.2);
    assert.equal((await view(f)).bulkContents.length, 0, "Decimal draws must not leave a phantom occupied container");
  });
  await t.test("finite substance-only capacity is sufficient, but does not grant unauthored general storage", async () => {
    const f = await fixture(); await saveRules(f, { maxWeightLb: null, volumeCapacityL: null, source: finite });
    await change(f, "add", 2); await assert.rejects(change(f, "add", 0.1), /maximum/);
    await assert.rejects(saveRules(f, { source: { ...finite, allowsItems: true } }), /finite.*capacity/);
    await assert.rejects(saveRules(f, { source: null }), /finite.*capacity/);
  });
  await t.test("finite source unknown density, ancestor capacity and explicit substance lock reject atomically", async () => {
    const f = await fixture(); await saveRules(f, { source: { ...finite, substance: { ...substance, weightLbPerUnit: null } } });
    await assert.rejects(change(f, "add", 1), /weight data not authored/);
    await saveRules(f, { source: { ...finite, allowsItems: true } }); await exactMove(f, f.a, null, f.b);
    await saveRules(f, { maxWeightLb: 4 }); await assert.rejects(change(f, "add", 1), /weight capacity/);
    await exactMove(f, f.a, f.b, null);
    await saveRules(f, { source: { ...finite, substance: { ...substance, id: "oil", name: "Oil" } } }, f.pouchId);
    await assert.rejects(change(f, "add", 1, { sourceItemId: f.pouchId }), /locked/);
    await saveRules(f, { source: { ...finite, locked: false } }); await change(f, "add", 1, { sourceItemId: f.pouchId });
    assert.equal((await view(f)).bulkContents[0].substance.id, "oil");
    await assert.rejects(change(f, "add", 1), /mixing/);
  });
  await t.test("source changes preserve stored identity, show invalidity and allow drawing legacy contents out", async () => {
    const f = await fixture(); await saveRules(f, { source: finite }); await change(f, "add", 1.3);
    await saveRules(f, { source: { ...finite, substance: { ...substance, id: "oil", name: "Oil" } } });
    assert.equal((await view(f)).bulkContents[0].substance.id, "water");
    assert.match((await view(f)).containers.find(row => row.instanceId === f.a).problems.join(" "), /locked source/);
    await assert.rejects(change(f, "add", 0.1), /mixing/); await change(f, "draw", 1.3);
    await change(f, "add", 1); assert.equal((await view(f)).bulkContents[0].substance.id, "oil");
    await saveRules(f, { source: null }); assert.match((await view(f)).containers.find(row => row.instanceId === f.a).problems.join(" "), /no longer matches/);
    await change(f, "draw", 1); assert.equal((await view(f)).bulkContents.length, 0);
  });
  await t.test("infinite draws retain identity, have fixed weight, reject Items and stale repeats", async () => {
    const f = await fixture(); await saveRules(f, { source: { ...finite, mode: "infinite" }, containedWeightBehavior: "fixed", fixedLoadedWeightLb: 2 });
    const before = await view(f), version = before.commerceVersion;
    const drawn = await change(f, "draw", 100); assert.equal(drawn.substance.id, "water"); assert.equal(drawn.quantity, 100);
    assert.equal((await view(f)).bulkContents.length, 0); assert.equal((await view(f)).carriedWeight.known, before.carriedWeight.known);
    await assert.rejects(change(f, "draw", 1, { expectedCommerceVersion: version }), /changed/);
    await assert.rejects(change(f, "add", 1), /finite/); await assert.rejects(stackMove(f, null, f.a, 1), /ordinary Items/);
    await assert.rejects(saveRules(f, { containedWeightBehavior: "normal" }), /infinite source requires/);
  });
  await t.test("read-only time hook resolves live ancestry without changing runtime state", async () => {
    const f = await fixture(); await exactMove(f, f.pouch, null, f.a); await exactMove(f, f.exact, null, f.pouch);
    await saveRules(f, { timeBehavior: "slowed", timeMultiplier: 0.1 }); await saveRules(f, { timeBehavior: "accelerated", timeMultiplier: 20 }, f.pouchId);
    const elapsed = () => db.transaction(tx => containment.readContainedElapsedTimeInTransaction(tx, f.godId, f.heroId, { instanceId: f.exact }, 100));
    const before = await snapshot(f); assert.equal((await elapsed()).elapsed, 200);
    await saveRules(f, { timeBehavior: "suspended" }); assert.equal((await elapsed()).elapsed, 0); assert.deepEqual(await snapshot(f), before);
  });
  await t.test("magical storage leaves loaded magazine/firearm assembly, ammunition and readiness untouched", async () => {
    const f = await specializedFixture(); await saveRules(f, { containedWeightBehavior: "contents-weightless", weightCapacityMode: "unlimited" });
    await pool.query("update campaign_character_item_instance set loaded_rounds=4,loaded_ammunition_item_id=$2 where id=$1", [f.mag, f.ammoId]);
    await pool.query("update campaign_character_item_instance set loaded_rounds=2,loaded_ammunition_item_id=$2 where id=$1", [f.spare, f.ammoId]);
    await pool.query("update campaign_character_item set quantity=quantity-6 where character_id=$1 and item_id=$2", [f.heroId, f.ammoId]);
    await pool.query("insert into firearm_magazine_attachment(weapon_instance_id,magazine_instance_id,character_id,campaign_id,weapon_item_id,weapon_profile_id,magazine_item_id) values($1,$2,$3,$4,$5,$6,$7)", [f.gun, f.mag, f.heroId, f.campaignId, f.gunId, f.gunProfile, f.magId]);
    const before = await snapshot(f); await exactMove(f, f.gun, null, f.a); await exactMove(f, f.spare, null, f.a);
    const load = (await view(f)).containers.find(row => row.instanceId === f.a); assert.equal(load.contentsWeight.known, 9.6); assert.equal(load.loadedWeight.known, 3);
    await exactMove(f, f.gun, f.a, null); await exactMove(f, f.spare, f.a, null);
    const after = await snapshot(f); for (const table of ["campaign_character_item", "campaign_character_item_instance", "campaign_character_firearm_state", "firearm_magazine_attachment"]) assert.deepEqual(after[table], before[table]);
  });
  await t.test("substance permissions, Player access, active combat and concurrent versions use the inventory boundary", async () => {
    const f = await fixture(); await saveRules(f, { source: finite });
    await assert.rejects(change(f, "add", 1, {}, "stranger"), /permission/);
    const playerId = `magic-player-${crypto.randomUUID()}`;
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [playerId, `${playerId}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,'player')", [playerId]); await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [f.campaignId, playerId]);
    await pool.query("update campaign_character set player_user_id=$1 where id=$2", [playerId, f.heroId]);
    await change(f, "add", 1, {}, playerId); await change(f, "draw", 1, {}, playerId);
    const version = (await view(f)).commerceVersion;
    const results = await Promise.allSettled([change(f, "add", 1, { expectedCommerceVersion: version }), change(f, "add", 1, { expectedCommerceVersion: version })]);
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    await saveRules(f, { source: { ...finite, mode: "infinite" }, containedWeightBehavior: "fixed", fixedLoadedWeightLb: 2 });
    await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1", [f.encounterId]);
    const before = await snapshot(f); await assert.rejects(change(f, "draw", 1), /combat|Freeze/i); assert.deepEqual(await snapshot(f), before);
    await pool.query("update campaign_session_encounter set frozen_at=now() where id=$1", [f.encounterId]);
    await assert.rejects(change(f, "draw", 1), /paused|frozen/i);
    await assert.rejects(exactMove(f, f.exact, null, f.a), /paused|frozen/i);
    assert.deepEqual(await snapshot(f), before);
  });
}

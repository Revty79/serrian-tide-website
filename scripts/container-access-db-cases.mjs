import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { handleInventoryInTransaction } from "../src/features/items/inventory-custody-service.ts";
import { resolveInventoryAvailability } from "../src/features/items/inventory-access.ts";
import { assertExactInventoryAvailable, assertLooseStackAvailable } from "../src/features/items/inventory-access-service.ts";
import { startCombatInventory, completeCombatInventory, requestInventoryCost } from "../src/features/tabletop-operations/combat-inventory-service.ts";
import { lockOwnedEncounterRuntimeInTransaction, loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from "../src/features/tabletop-operations/runtime-integration-service.ts";
import { advanceInitiativeTimeline } from "../src/features/tabletop-operations/initiative-runtime.ts";
import { ruleOnPlayerCombatRequestInTransaction } from "../src/features/tabletop-operations/player-combat-ruling-service.ts";
import { setCombatFrozenInTransaction } from "../src/features/tabletop-operations/combat-freeze-service.ts";
import { prepareCharacterItemUseInTransaction } from "../src/app/characters/item-use-actions.ts";
import { itemPower, itemPowerEffect } from "../src/db/item-schema.ts";

export async function containerAccessCases(t, { fixture, accessFixture, pool, db, actors, catalog, containment, view, exactMove, stackMove, snapshot, equipment }) {
  const key = () => randomBytes(16).toString("hex");
  const one = async (query, values = []) => (await pool.query(query, values)).rows[0];
  const handle = async (f, operation, extra = {}, userId = f.godId) => db.transaction(tx => handleInventoryInTransaction(tx, userId, {
    characterId: f.heroId, expectedCommerceVersion: extra.expectedCommerceVersion, requestKey: key(), operation, itemId: f.backpackId, instanceId: f.a, quantity: 1, ...extra }));
  const change = async (f, operation, extra = {}, userId) => handle(f, operation, { expectedCommerceVersion: (await view(f)).commerceVersion, ...extra }, userId);
  const access = async (f, target) => resolveInventoryAvailability((await view(f)).accessGraph, target);
  const saveRules = async (f, patch, itemId = f.backpackId) => actors.run(f.godId, async () => { const item = await catalog.getItem(itemId); return catalog.saveItem({ ...item, containerProfile: { ...item.containerProfile, ...patch } }); });
  const player = async f => {
    const id = `access-player-${key()}`;
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,'player')", [id]);
    await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [f.campaignId, id]);
    await pool.query("update campaign_character set player_user_id=$1,is_npc=false,npc_build_mode=null where id=$2", [id, f.heroId]);
    return id;
  };
  const combatCommand = async (f, operation = "retrieve", extra = {}) => ({ characterId: f.heroId, expectedCommerceVersion: (await view(f)).commerceVersion,
    requestKey: key(), operation, itemId: f.exactItemId, instanceId: f.exact, quantity: 1, containerInstanceId: f.a, ...extra });
  const start = (f, command, actor = { authority: "god-owner", userId: f.godId }) => db.transaction(async tx => startCombatInventory(tx,
    await lockOwnedEncounterRuntimeInTransaction(tx, f.encounterId, f.godId), actor, command));
  const activate = async f => {
    await pool.query("update campaign_character set is_npc=true,npc_kind='race',npc_build_mode='detailed' where id=$1", [f.heroId]);
    await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1", [f.encounterId]);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='passed' where encounter_id=$1 and character_id<>$2", [f.encounterId, f.heroId]);
  };
  const advance = async (f, declarationId) => db.transaction(async tx => {
    const context = await lockOwnedEncounterRuntimeInTransaction(tx, f.encounterId, f.godId), before = await loadInitiativeEngineInTransaction(tx, f.encounterId);
    const pendingId = (await one("select pending_action_id from campaign_session_encounter_action_declaration where id=$1", [declarationId])).pending_action_id;
    const action = before.pendingActions.find(row => row.id === pendingId);
    await persistInitiativeEngineInTransaction(tx, context, before, advanceInitiativeTimeline(before, action.expectedCompletionInitiative));
  });
  await t.test("carried roots and nested portions resolve one authoritative ancestor chain", async () => {
    const f = await fixture(); assert.equal((await access(f, { instanceId: f.a })).usable, true);
    await exactMove(f, f.pouch, null, f.a); await exactMove(f, f.exact, null, f.pouch); await stackMove(f, null, f.pouch, 2);
    const resolved = await access(f, { instanceId: f.exact }); assert.deepEqual(resolved.ancestors, [f.pouch, f.a]); assert.equal(resolved.accessible, true); assert.equal(resolved.usable, false);
    assert.deepEqual((await access(f, { itemId: f.suppliesId, containerInstanceId: f.pouch })).ancestors, [f.pouch, f.a]);
  });
  await t.test("closed ancestors block moves; opening and closing persist independently per copy", async () => {
    const f = await fixture(); await exactMove(f, f.pouch, null, f.a); await exactMove(f, f.exact, null, f.pouch);
    await saveRules(f, { closureMode: "open-close", retrieveInitiativeCost: 2, stowInitiativeCost: 3, openInitiativeCost: 0, closeInitiativeCost: null });
    assert.match((await access(f, { instanceId: f.exact })).blocker, /closed/);
    await assert.rejects(exactMove(f, f.exact, f.pouch, null), /Open.*first/);
    await change(f, "open"); await exactMove(f, f.exact, f.pouch, null); await exactMove(f, f.exact, null, f.a); await change(f, "close");
    const profile = await actors.run(f.godId, () => catalog.getItem(f.backpackId));
    assert.equal(profile.containerProfile.retrieveInitiativeCost, 2); assert.equal(profile.containerProfile.openInitiativeCost, 0); assert.equal(profile.containerProfile.closeInitiativeCost, null);
    assert.equal((await one("select count(*)::int n from inventory_container_access where character_id=$1", [f.heroId])).n, 1);
  });
  for (const state of ["locked", "sealed"]) await t.test(`${state} requires an explicit owner G.O.D. access ruling`, async () => {
    const f = await fixture(); const userId = await player(f); await saveRules(f, { closureMode: "open-close" });
    await change(f, "access-ruling", { accessState: state, reason: "Adjudicated closure" });
    await assert.rejects(change(f, "open", {}, userId), /G.O.D. access ruling/);
    await assert.rejects(change(f, "access-ruling", { accessState: "open", reason: "Bypass" }, userId), /Campaign-owning/);
    await change(f, "access-ruling", { accessState: "open", reason: "Seal opened by ruling" }); await change(f, "close", {}, userId);
  });
  for (const status of ["drop", "stolen", "lost"]) await t.test(`${status} propagates through descendants, excludes loaded weight and recovery preserves exact state`, async () => {
    const f = await fixture(); await exactMove(f, f.pouch, null, f.a); await exactMove(f, f.exact, null, f.pouch); await stackMove(f, null, f.pouch, 2);
    const before = await snapshot(f), initial = await view(f), weight = initial.containers.find(row => row.instanceId === f.a).loadedWeight.known;
    await change(f, status, { reason: "Custody ruling", note: "Warehouse" });
    assert.equal((await view(f)).carriedWeight.known, initial.carriedWeight.known - weight);
    assert.equal((await access(f, { instanceId: f.exact })).custody, status === "drop" ? "dropped" : status);
    await assert.rejects(db.transaction(tx => assertExactInventoryAvailable(tx, f.heroId, f.exact)), /Unavailable/);
    await assert.rejects(exactMove(f, f.exact, f.pouch, null), /Unavailable/);
    assert.deepEqual((await snapshot(f)).inventory_instance_location, before.inventory_instance_location);
    await change(f, "recover", { reason: "Found intact" });
    for (const table of ["campaign_character_item", "campaign_character_item_instance", "inventory_instance_location", "inventory_stack_location"]) assert.deepEqual((await snapshot(f))[table], before[table]);
    assert.equal((await view(f)).carriedWeight.known, initial.carriedWeight.known);
  });
  await t.test("20 owned = 8 contained + 5 dropped + 7 loose; partial recovery and allocation guards", async () => {
    const f = await fixture(); await stackMove(f, null, f.a, 8);
    await change(f, "drop", { instanceId: null, itemId: f.suppliesId, quantity: 5 });
    assert.equal((await view(f)).stacks[0].looseQuantity, 7);
    await assert.rejects(stackMove(f, null, f.b, 8), /Not enough owned/);
    await assert.rejects(pool.query("update campaign_character_item set quantity=12 where character_id=$1 and item_id=$2", [f.heroId, f.suppliesId]), /allocated/);
    await assert.rejects(db.transaction(tx => assertLooseStackAvailable(tx, f.heroId, f.suppliesId, 8)), /Not enough carried/);
    const custody = (await view(f)).accessGraph.stackCustody[0];
    await change(f, "recover", { instanceId: null, itemId: f.suppliesId, quantity: 2, custodyId: custody.id });
    assert.equal((await view(f)).stacks[0].looseQuantity, 9); assert.equal((await view(f)).accessGraph.stackCustody[0].quantity, 3);
  });
  await t.test("Players cannot rule theft/loss, and recover dropped copies only in the same active Scene", async () => {
    const f = await fixture(), id = await player(f);
    for (const op of ["stolen", "lost", "destroy"]) await assert.rejects(change(f, op, { reason: "No authority" }, id), /Campaign-owning/);
    await change(f, "drop", {}, id); await change(f, "recover", {}, id);
    await change(f, "drop", {}, id); await pool.query("update campaign_session_scene set status='completed',completed_at=now() where id=$1", [f.sceneId]);
    await assert.rejects(change(f, "recover", {}, id), /active Scene/); await change(f, "recover", { reason: "Recovered from former scene" });
    await assert.rejects(change(f, "drop", {}, id), /active Scene/);
  });
  await t.test("contained and attached exact copies cannot independently acquire root custody", async () => {
    const f = await accessFixture(); await exactMove(f, f.exact, null, f.a);
    await assert.rejects(change(f, "lost", { instanceId: f.exact, itemId: f.exactItemId, reason: "No" }), /Loose root/);
    await f.setup("magazine", { magazineInstanceId: f.mag });
    await assert.rejects(change(f, "lost", { instanceId: f.mag, itemId: f.magId, reason: "No" }), /Loose root/);
  });
  await t.test("voluntary drop refuses Worn/Wielded; theft forces inactive and unavailable copies cannot re-equip", async () => {
    const f = await fixture(); await db.transaction(tx => equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.a, state: "worn" }));
    await assert.rejects(change(f, "drop"), /does not unequip/); await change(f, "stolen", { reason: "Straps cut" });
    assert.equal((await one("select equipment_state from campaign_character_item_instance where id=$1", [f.a])).equipment_state, "inactive");
    assert.equal((await one("select evidence from inventory_custody_event where character_id=$1 order by id desc", [f.heroId])).evidence.forcedInactive, true);
    await assert.rejects(db.transaction(tx => equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.a, state: "worn" })), /Unavailable/);
  });
  await t.test("loaded firearm assembly and standalone magazine survive stolen/recovered custody without specialized changes", async () => {
    const f = await accessFixture(); await f.handle(f.mag, "add", 4); await f.setup("magazine", { magazineInstanceId: f.mag }); await exactMove(f, f.gun, null, f.a);
    const before = await snapshot(f); await change(f, "stolen", { reason: "Taken with pack" });
    assert.equal((await access(f, { instanceId: f.mag })).custody, "stolen");
    await assert.rejects(f.setup("magazine", { magazineInstanceId: null }), /Loose|Unavailable/);
    await change(f, "recover");
    for (const table of ["campaign_character_item", "campaign_character_item_instance", "campaign_character_firearm_state", "firearm_magazine_attachment"]) assert.deepEqual((await snapshot(f))[table], before[table]);
    await change(f, "lost", { instanceId: f.spare, itemId: f.magId, reason: "Lost spare" }); await assert.rejects(f.handle(f.spare, "add", 1), /Unavailable/);
    await change(f, "lost", { instanceId: null, itemId: f.ammoId, quantity: 26, reason: "Loose rounds swept away" });
    await change(f, "recover", { instanceId: f.spare, itemId: f.magId }); await assert.rejects(f.handle(f.spare, "add", 1), /Not enough carried/);
  });
  await t.test("finite and infinite sources survive custody; drawing is blocked while unavailable and contained time persists", async () => {
    const f = await fixture(), substance = { id: "water", name: "Water", unit: "L", weightLbPerUnit: 2, volumeLPerUnit: 1, physicalForm: "liquid", isMagical: false };
    await saveRules(f, { source: { mode: "finite", substance, maxQuantity: 2, locked: true, allowsItems: true }, timeBehavior: "suspended" });
    await db.transaction(tx => containment.changeContainerSubstanceInTransaction(tx, f.godId, { characterId: f.heroId, expectedCommerceVersion: 0, instanceId: f.a, operation: "add", quantity: 1 }));
    await exactMove(f, f.exact, null, f.a); await change(f, "lost", { reason: "At sea" });
    await assert.rejects(db.transaction(async tx => containment.changeContainerSubstanceInTransaction(tx, f.godId, { characterId: f.heroId, expectedCommerceVersion: (await view(f)).commerceVersion, instanceId: f.a, operation: "draw", quantity: 1 })), /Unavailable/);
    assert.equal((await view(f)).bulkContents[0].quantity, 1);
    const time = await db.transaction(tx => containment.readContainedElapsedTimeInTransaction(tx, f.godId, f.heroId, { instanceId: f.exact }, 10));
    assert.equal(time.elapsed, 0);
    await change(f, "recover"); assert.equal((await view(f)).bulkContents[0].quantity, 1);
    await saveRules(f, { source: { mode: "infinite", substance, maxQuantity: null, locked: true, allowsItems: true }, containedWeightBehavior: "contents-weightless" }, f.pouchId);
    await exactMove(f, f.pouch, null, f.a); await change(f, "stolen", { reason: "Taken" });
    assert.equal((await view(f)).containers.find(row => row.instanceId === f.pouch).profile.source.mode, "infinite");
  });
  await t.test("ordinary destruction spills exact/nested contents and partial stacks at their effective custody", async () => {
    const f = await fixture(); await exactMove(f, f.pouch, null, f.a); await exactMove(f, f.exact, null, f.pouch); await stackMove(f, null, f.a, 5);
    await change(f, "drop"); await change(f, "destroy", { reason: "Pack torn; contents on ground" });
    const result = await view(f); assert.equal(result.instances.some(row => row.instanceId === f.a), false);
    assert.equal(result.instances.find(row => row.instanceId === f.pouch).containerInstanceId, null);
    assert.equal(result.instances.find(row => row.instanceId === f.exact).containerInstanceId, f.pouch);
    assert.equal((await access(f, { instanceId: f.exact })).custody, "dropped");
    assert.equal(result.accessGraph.stackCustody.find(row => row.itemId === f.suppliesId).quantity, 5); assert.equal(result.stacks[0].ownedQuantity, 20);
    const audit = await one("select evidence from inventory_custody_event where character_id=$1 and operation='destroy'", [f.heroId]); assert.equal(audit.evidence.spill.children[0].instanceId, f.pouch);
  });
  await t.test("magical destruction requires safe spill ruling; finite substance is audited and children survive", async () => {
    const f = await fixture(); await exactMove(f, f.exact, null, f.a); await saveRules(f, { containedWeightBehavior: "contents-weightless" });
    await assert.rejects(change(f, "destroy", { reason: "Destroyed" }), /safe/);
    await change(f, "destroy", { reason: "G.O.D. rules safe ordinary spill", confirmMagicalSpill: true });
    assert.equal((await view(f)).instances.find(row => row.instanceId === f.exact).containerInstanceId, null);
  });
  await t.test("recovery preserves physically invalid changed catalog contents and exposes warning", async () => {
    const f = await fixture(); await stackMove(f, null, f.a, 5); await change(f, "lost", { reason: "Lost" });
    await saveRules(f, { maxWeightLb: 1 }); await change(f, "recover");
    assert.match((await view(f)).containers.find(row => row.instanceId === f.a).problems.join(" "), /weight capacity/);
    assert.equal((await view(f)).stacks[0].allocations[0].quantity, 5);
  });
  await t.test("concurrent opposing custody commands fail closed and retry creates no duplicate audit", async () => {
    const f = await fixture(), version = (await view(f)).commerceVersion, requestKey = key();
    const result = await Promise.allSettled([handle(f, "stolen", { expectedCommerceVersion: version, requestKey, reason: "Taken" }), handle(f, "lost", { expectedCommerceVersion: version, reason: "Lost" })]);
    assert.equal(result.filter(row => row.status === "fulfilled").length, 1);
    if (result[0].status === "fulfilled") assert.deepEqual(await handle(f, "stolen", { expectedCommerceVersion: version, requestKey, reason: "Taken" }), result[0].value);
    assert.equal((await one("select count(*)::int n from inventory_custody_event where character_id=$1", [f.heroId])).n, 1);
  });
  for (const operation of ["retrieve", "stow"]) await t.test(`combat ${operation} spends authored Initiative once and moves only on completion`, async () => {
    const f = await fixture(); await saveRules(f, { retrieveInitiativeCost: 2, stowInitiativeCost: 2 });
    if (operation === "retrieve") await exactMove(f, f.exact, null, f.a);
    await activate(f); const command = await combatCommand(f, operation), started = await start(f, command);
    assert.ok(started.declarationId); assert.deepEqual(await start(f, command), started);
    assert.equal((await view(f)).instances.find(row => row.instanceId === f.exact).containerInstanceId, operation === "retrieve" ? f.a : null);
    const pendingBefore = await one("select p.* from campaign_session_encounter_pending_action p join campaign_session_encounter_action_declaration d on d.pending_action_id=p.id where d.id=$1", [started.declarationId]);
    await advance(f, started.declarationId);
    assert.equal((await one("select status from campaign_session_encounter_action_declaration where id=$1", [started.declarationId])).status, "resolved");
    assert.equal((await view(f)).instances.find(row => row.instanceId === f.exact).containerInstanceId, operation === "retrieve" ? null : f.a);
    await db.transaction(tx => completeCombatInventory(tx, started.declarationId, f.godId)); assert.deepEqual(await start(f, command), started);
    const pendingAfter = await one("select * from campaign_session_encounter_pending_action where id=$1", [pendingBefore.id]); assert.equal(pendingAfter.original_initiative_cost, 2);
  });
  await t.test("nested retrieval sums only accessed authored costs", async () => {
    const f = await fixture(); await saveRules(f, { retrieveInitiativeCost: 0.2 }); await saveRules(f, { retrieveInitiativeCost: 0.1 }, f.pouchId);
    await exactMove(f, f.pouch, null, f.a); await exactMove(f, f.exact, null, f.pouch); await activate(f);
    const result = await start(f, await combatCommand(f, "retrieve", { containerInstanceId: f.pouch }));
    assert.equal((await one("select locked_snapshot_json from campaign_session_encounter_action_declaration where id=$1", [result.declarationId])).locked_snapshot_json.initiativeCost, 0.3);
    await advance(f, result.declarationId); assert.equal((await view(f)).instances.find(row => row.instanceId === f.exact).containerInstanceId, null);
  });
  await t.test("unresolved cost uses exact approved Player ruling; Player supplied costs fail", async () => {
    const f = await fixture(); await exactMove(f, f.exact, null, f.a); await activate(f); const userId = await player(f), actor = { authority: "player", userId, characterId: f.heroId };
    const command = await combatCommand(f);
    await assert.rejects(start(f, command, actor), /approved G.O.D./);
    await assert.rejects(start(f, { ...command, initiativeRuling: { cost: 0, reason: "No" } }, actor), /Only.*G.O.D./);
    const request = await db.transaction(async tx => requestInventoryCost(tx, await lockOwnedEncounterRuntimeInTransaction(tx, f.encounterId, f.godId), actor, command));
    await db.transaction(async tx => ruleOnPlayerCombatRequestInTransaction(tx, await lockOwnedEncounterRuntimeInTransaction(tx, f.encounterId, f.godId), f.godId, request.requestId, { status: "approved", response: "Easy access; two Initiative total", ruling: { initiativeCost: 2 } }));
    const started = await start(f, { ...command, rulingRequestId: request.requestId }, actor); await advance(f, started.declarationId);
    assert.equal((await view(f)).instances.find(row => row.instanceId === f.exact).containerInstanceId, null);
  });
  await t.test("interrupted retrieval leaves contents; custody changed during pending handling cancels without wedging timeline", async () => {
    for (const mode of ["interrupted", "stolen"]) {
      const f = await fixture(); await exactMove(f, f.exact, null, f.a); await saveRules(f, { retrieveInitiativeCost: 2 }); await activate(f);
      const started = await start(f, await combatCommand(f));
      if (mode === "interrupted") {
        await pool.query("update campaign_session_encounter_pending_action set status='interrupted' where id=(select pending_action_id from campaign_session_encounter_action_declaration where id=$1)", [started.declarationId]);
        await db.transaction(tx => completeCombatInventory(tx, started.declarationId, f.godId));
      } else { await change(f, "stolen", { reason: "Taken during handling" }); await advance(f, started.declarationId); assert.equal((await one("select status from campaign_session_encounter_action_declaration where id=$1", [started.declarationId])).status, "cancelled"); }
      assert.equal((await view(f)).instances.find(row => row.instanceId === f.exact).containerInstanceId, f.a);
    }
  });
  await t.test("combat cannot stow from a container or use direct outside-combat movement", async () => {
    const f = await fixture(); await exactMove(f, f.exact, null, f.a); await saveRules(f, { stowInitiativeCost: 0 }); await activate(f);
    await assert.rejects(start(f, await combatCommand(f, "stow", { containerInstanceId: f.b })), /Retrieve/);
    await assert.rejects(exactMove(f, f.exact, f.a, f.b), /outside combat|active combat/i);
  });
  await t.test("zero-cost opening is separate; closed retrieval blocked, completed firearm retrieval preserves readiness", async () => {
    const f = await accessFixture(); await exactMove(f, f.gun, null, f.a); await saveRules(f, { closureMode: "open-close", openInitiativeCost: 0, retrieveInitiativeCost: 2 }); await activate(f);
    await assert.rejects(start(f, await combatCommand(f, "retrieve", { itemId: f.gunId, instanceId: f.gun })), /Open/);
    await start(f, await combatCommand(f, "open", { itemId: f.backpackId, instanceId: f.a, containerInstanceId: null }));
    const before = (await snapshot(f)).campaign_character_firearm_state;
    const started = await start(f, await combatCommand(f, "retrieve", { itemId: f.gunId, instanceId: f.gun })); await advance(f, started.declarationId);
    assert.deepEqual((await snapshot(f)).campaign_character_firearm_state, before);
  });
  await t.test("combat drop has no assumed cost and completed ruling drops descendants", async () => {
    const f = await fixture(); await stackMove(f, null, f.a, 4); await activate(f);
    const command = await combatCommand(f, "drop", { itemId: f.backpackId, instanceId: f.a, containerInstanceId: null });
    await assert.rejects(start(f, command), /explicit G.O.D./);
    const result = await start(f, { ...command, initiativeRuling: { cost: 2, reason: "G.O.D. drop timing" } }); await advance(f, result.declarationId);
    assert.equal((await access(f, { itemId: f.suppliesId, containerInstanceId: f.a })).custody, "dropped");
  });
  await t.test("Freeze blocks access mutations, cost requests, zero-cost actions and custody rulings", async () => {
    const f = await fixture(); await exactMove(f, f.exact, null, f.a); await saveRules(f, { retrieveInitiativeCost: 0 }); await activate(f);
    await db.transaction(tx => setCombatFrozenInTransaction(tx, f.encounterId, { userId: f.godId, authority: "god-owner" }, { frozen: true, expectedRevision: 0 }));
    await assert.rejects(start(f, await combatCommand(f)), /paused|frozen/i);
    await assert.rejects(change(f, "lost", { reason: "While frozen" }), /paused|frozen/i);
    assert.equal((await access(f, { instanceId: f.a })).custody, "carried");
  });
  await t.test("zero cost still requires an ordinary action opportunity", async () => {
    const f = await fixture(); await exactMove(f, f.exact, null, f.a); await saveRules(f, { retrieveInitiativeCost: 0 }); await activate(f);
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='passed' where encounter_id=$1 and character_id=$2", [f.encounterId, f.heroId]);
    await assert.rejects(start(f, await combatCommand(f)), /opportunity|passed|ordinary|active/i);
    assert.equal((await view(f)).instances.find(row => row.instanceId === f.exact).containerInstanceId, f.a);
  });
  for (const status of ["stolen", "lost"]) await t.test(`${status} potion quantity is rejected by the real Item-use service`, async () => {
    const f = await fixture(); await pool.query("insert into item_runtime_profiles(item_id,use_mode,quantity_per_use) values($1,'consume-item',1)", [f.suppliesId]);
    await stackMove(f, null, f.a, 20); await change(f, status, { reason: "Unavailable potions" });
    await assert.rejects(db.transaction(tx => prepareCharacterItemUseInTransaction(tx, { sourceCharacterId: f.heroId, itemId: f.suppliesId, itemInstanceId: null, targetCharacterId: f.heroId, effectSelections: {} }, f.godId)), /Not enough carried/);
    assert.equal((await view(f)).stacks[0].ownedQuantity, 20);
  });
  await t.test("theft of Worn exact root ends its real passive modifier and recovery does not silently re-equip", async () => {
    const f = await fixture(); await db.transaction(async tx => {
      const [power] = await tx.insert(itemPower).values({ itemId: f.backpackId, name: "Worn protection", trigger: "passive", activationLabel: "", sortOrder: 0, resolutionMode: "automatic", requiredEquipmentState: "worn", resourceCostKind: "none" }).returning();
      await tx.insert(itemPowerEffect).values({ itemPowerId: power.id, sortOrder: 0, schemaVersion: 2, effectJson: { kind: "modifier.apply", label: "Pack protection", channel: "damage", targetKey: "self", amount: 2, duration: { kind: "until-removed" } } });
      await equipment.setInstanceEquipmentStateInTransaction(tx, { characterId: f.heroId, instanceId: f.a, state: "worn" });
    });
    const active = async () => Number((await one("select count(*)::int n from campaign_character_active_modifier where character_id=$1 and ended_at is null", [f.heroId])).n);
    assert.equal(await active(), 1); await change(f, "stolen", { reason: "Equipment stolen" }); assert.equal(await active(), 0);
    await change(f, "recover"); assert.equal(await active(), 0);
  });
  await t.test("Scene and Session references clear without recovering custody or losing historical labels", async () => {
    const f = await fixture();
    await pool.query("update campaign_session_scene set status='completed',completed_at=now() where id=$1", [f.sceneId]);
    await pool.query("update campaign_session set status='completed',completed_at=now() where id=$1", [f.sessionId]);
    const session = await one("insert into campaign_session(campaign_id,title,sequence_number,status,started_at) values($1,'Temporary Session',2,'active',now()) returning id", [f.campaignId]);
    const scene = await one("insert into campaign_session_scene(session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,'Warehouse',1,'active',now()) returning id", [session.id, f.campaignId]);
    await pool.query("insert into campaign_session_roster(session_id,campaign_id,character_id,sort_order) values($1,$2,$3,0)", [session.id, f.campaignId, f.heroId]);
    await pool.query("insert into campaign_session_scene_member(scene_id,session_id,campaign_id,character_id,sort_order) values($1,$2,$3,$4,0)", [scene.id, session.id, f.campaignId, f.heroId]);
    await change(f, "drop", { sceneId: scene.id });
    await pool.query("delete from campaign_session_scene where id=$1", [scene.id]); await pool.query("delete from campaign_session where id=$1", [session.id]);
    const stored = await one("select * from inventory_instance_custody where instance_id=$1", [f.a]);
    assert.equal(stored.status, "dropped"); assert.equal(stored.scene_id, null); assert.equal(stored.session_id, null); assert.match(stored.context_label, /Warehouse/);
    const audit = await one("select * from inventory_custody_event where character_id=$1", [f.heroId]); assert.equal(audit.scene_id, null); assert.match(audit.context_label, /Warehouse/);
  });
  await t.test("ordinary destruction audits lost finite substance without destroying child Items", async () => {
    const f = await fixture(), substance = { id: "water", name: "Water", unit: "L", weightLbPerUnit: 2, volumeLPerUnit: 1, physicalForm: "liquid", isMagical: false };
    await saveRules(f, { source: { mode: "finite", substance, maxQuantity: 2, locked: true, allowsItems: true } });
    await db.transaction(tx => containment.changeContainerSubstanceInTransaction(tx, f.godId, { characterId: f.heroId, expectedCommerceVersion: 0, instanceId: f.a, operation: "add", quantity: 1 }));
    await exactMove(f, f.exact, null, f.a); await change(f, "destroy", { reason: "Contents spill onto floor" });
    const audit = await one("select evidence from inventory_custody_event where character_id=$1 and operation='destroy'", [f.heroId]); assert.equal(audit.evidence.spill.substance[0].quantity, 1);
    assert.equal((await view(f)).bulkContents.length, 0); assert.equal((await access(f, { instanceId: f.exact })).usable, true);
  });
  await t.test("concurrent root theft and instantaneous retrieval cannot both consume the same inventory version", async () => {
    const f = await fixture(); await exactMove(f, f.exact, null, f.a); await saveRules(f, { retrieveInitiativeCost: 0 }); await activate(f);
    const command = await combatCommand(f);
    const results = await Promise.allSettled([start(f, command), handle(f, "stolen", { expectedCommerceVersion: command.expectedCommerceVersion, reason: "Concurrent theft" })]);
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    assert.equal((await view(f)).instances.filter(row => row.instanceId === f.exact).length, 1);
    const final = await access(f, { instanceId: f.exact }); assert.ok(final.usable || final.custody === "stolen");
  });
}

import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_OWNERSHIP_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_ownership_dev$/);
const actors = new AsyncLocalStorage();
const god = "creature-commerce-god", admin = "creature-commerce-admin", player = "creature-commerce-player", foreign = "creature-commerce-foreign", otherPlayer = "creature-commerce-player-two";
const session = async () => ({ user: { id: actors.getStore() ?? god } });
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: session, requireGod: session, requirePlayer: session,
  requireGodOrAdminAccessContext: async () => {
    const current = await session();
    const roles = (await rows("select role from user_role where user_id=$1", [current.user.id])).map(({ role }) => role);
    if (!roles.some((role) => role === "admin" || role === "god")) throw new Error("Authoring access required.");
    return { session: current, roles };
  },
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { db, pool } = await import("../src/db/index.ts");
const rows = async (text, values = []) => (await pool.query(text, values)).rows;
const one = async (text, values = []) => (await rows(text, values))[0];
const npcs = await import("../src/app/heavens/npcs/actions.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const { getCharacter } = await import("../src/app/characters/actions.ts");
const { getCharacterEncumbrance } = await import("../src/features/characters/character-sheet-rules.ts");
const health = await import("../src/features/active-state/active-health-service.ts");
const effects = await import("../src/features/active-state/active-effects-service.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const { creatureDraftFixture, creatureFormFixture } = await import("./creature-form-fixture.ts");
const actor = { userId: god, roles: ["god"] };
let campaignId, otherCampaignId, ownerA, ownerB, raceOwner, foreignOwner, source;
let sequence = 0;
const create = (overrides = {}) => npcs.createNpc({ campaignId, origin: "creature", buildMode: "detailed", sourceId: source.id, name: `Horse ${++sequence}`, roleLabel: "Companion", notes: "Given at the north gate", ownerCharacterId: ownerA, ...overrides });
const transfer = (characterId, ownerCharacterId, override = {}) => npcs.setCreatureNpcOwner({ campaignId, characterId, ownerCharacterId, ...override });
const root = (id) => one("select * from campaign_character where id=$1", [id]);
const hurt = async (characterId, amount) => health.applyLocalizedDamageToCharacter({
  characterId, amount, poolKey: (await health.getActiveHealth(characterId)).anatomy.pools[0].key,
  injuryName: "Bruise", injuryNotes: "Retain with this individual",
});
const state = async (id) => {
  const result = {};
  for (const table of ["campaign_creature_npc_profile", "campaign_character_profile", "campaign_character_attribute", "campaign_character_skill_allocation", "campaign_character_active_health", "campaign_character_active_health_pool", "campaign_character_injury", "campaign_character_active_condition", "campaign_character_active_modifier", "campaign_character_item", "campaign_character_item_instance"]) {
    result[table] = await rows(`select to_jsonb(t) body from ${table} t where character_id=$1 order by to_jsonb(t)::text`, [id]);
  }
  return result;
};
async function makeCampaign(name) {
  return (await one(`insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id)
    values($1,100,100,50,10,100,0,'Credits','Assigned',$2) returning id`, [name, god])).id;
}
async function character(campaign, name, isNpc = false) {
  const controller = isNpc ? god : player;
  await pool.query("insert into campaign_player(campaign_id,user_id,is_npc_controller) values($1,$2,$3) on conflict do nothing", [campaign, controller, isNpc]);
  const id = (await one("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_build_mode) values($1,$2,$3,$4,$5) returning id", [campaign, controller, name, isNpc, isNpc ? "simple" : null])).id;
  await pool.query("insert into campaign_character_profile(character_id) values($1)", [id]);
  for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,25)", [id, key]);
  return id;
}
async function seedBase() {
  for (const [id, role] of [[god, "god"], [admin, "admin"], [player, "player"], [foreign, "god"], [otherPlayer, "player"]]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
  }
  campaignId = await makeCampaign("Ownership Campaign"); otherCampaignId = await makeCampaign("Other Ownership Campaign");
  ownerA = await character(campaignId, "Owner A"); ownerB = await character(campaignId, "Owner B");
  raceOwner = await character(campaignId, "Race NPC Owner", true); foreignOwner = await character(otherCampaignId, "Foreign Owner");
  const draft = creatureDraftFixture();
  draft.core.canonicalName = "Commerce Horse";
  draft.forms = [creatureFormFixture()];
  source = await creatures.saveCreature(draft);
}
after(() => pool.end());


const items = await import("../src/app/heavens/items/actions.ts");
const commerce = await import("../src/features/tabletop-operations/shop-commerce-service.ts");
const visits = await import("../src/features/tabletop-operations/shop-visit-service.ts");
const companions = await import("../src/features/creatures/owned-creature-service.ts");
let shopId, visitId, listingId, offeringId, sessionId, sceneId;
const key = () => `creature-commerce-${++sequence}`;
const purchase = (lines, submissionKey = key(), characterId = ownerA) => db.transaction(tx => commerce.submitPlayerPurchaseInTransaction(tx, { visitId, characterId, lines, submissionKey }, player));
const sale = (creatureCharacterId, characterId = ownerA, submissionKey = key()) => db.transaction(tx => commerce.submitPlayerSaleInTransaction(tx, { visitId, characterId, lines: [{ itemId: listingId, creatureCharacterId, quantity: 1 }], submissionKey }, player));
const approve = (requestId, revisedLines = []) => db.transaction(tx => commerce.reviewShopRequestInTransaction(tx, { requestId, expectedTermsVersion: 1, decision: "approve", reason: "Approved Creature transaction", submissionKey: key(), revisedLines }, actor));
async function quote(quantity = 1, resaleCreatureId = null) {
  const row = await one("select * from shop_offering where id=$1", [offeringId]);
  return { offeringId, quantity, expectedOfferingVersion: row.version, quotedUnitPriceCredits: row.selling_price_override_credits ?? 10, quotedFulfillmentKind: "creature-transfer", quotedGrantedCreatureId: source.id, ...(resaleCreatureId ? { resaleCreatureId } : {}) };
}
const receiptIds = async transactionId => (await rows("select c.creature_character_id id from shop_transaction_creature c join shop_transaction_line l on l.id=c.transaction_line_id where l.transaction_id=$1 order by c.id", [transactionId])).map(row => row.id);
before(async () => {
  await seedBase();
  await pool.query("update campaign_character_profile set credits_remaining=1000 where character_id in ($1,$2)", [ownerA, ownerB]);
  sessionId = (await one("insert into campaign_session(campaign_id,title,sequence_number,status,started_at) values($1,'Creature market',1,'active',now()) returning id", [campaignId])).id;
  sceneId = (await one("insert into campaign_session_scene(session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,'Stable',1,'active',now()) returning id", [sessionId,campaignId])).id;
  for (const id of [ownerA,ownerB]) {
    await pool.query("insert into campaign_session_roster(session_id,campaign_id,character_id) values($1,$2,$3)",[sessionId,campaignId,id]);
    await pool.query("insert into campaign_session_scene_member(scene_id,session_id,campaign_id,character_id) values($1,$2,$3,$4)",[sceneId,sessionId,campaignId,id]);
  }
  shopId = (await one("insert into shop(campaign_id,name,category,storefront_state,balance_credits,sold_item_handling,character_purchase_mode) values($1,'Stable','Animals','open',1000,'add-to-shop-stock','immediate') returning id", [campaignId])).id;
  await pool.query("insert into campaign_session_prepared_shop(session_id,campaign_id,shop_id) values($1,$2,$3)",[sessionId,campaignId,shopId]);
  await pool.query("insert into campaign_session_scene_shop(scene_id,session_id,campaign_id,shop_id,revealed) values($1,$2,$3,$4,true)",[sceneId,sessionId,campaignId,shopId]);
  visitId = (await db.transaction(tx => visits.startOrAddShopVisitInTransaction(tx,{ sceneId,shopId,placement:{kind:"independent"},characterIds:[ownerA,ownerB],mode:"shopping",closedShopOverrideReason:"" },actor))).visitId;
  listingId = (await one("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis,weight,weight_unit,created_by_user_id) values('COMMERCE-HORSE','Horse listing','inventory','misc','Animals','Animals',10,'Each',1000,'lb',$1) returning id", [god])).id;
  await pool.query("insert into campaign_inventory_item(campaign_id,item_id) values($1,$2)",[campaignId,listingId]);
  offeringId = (await one("insert into shop_offering(shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,limited_quantity) values($1,$2,$3,'inventory-transfer',true,false,20) returning id",[shopId,campaignId,listingId])).id;
});

test("explicit Item grant authoring is independent of Related Creature, round-trips, clones, and preserves omitted profiles", async () => {
  const draft = await items.getItem(listingId);
  assert.equal(draft.creatureGrant, null);
  draft.properties = [{ propertyName: "Related Creature", unit:"",quantity:null,notes:"", value: "Horse", relationKind: "creature", relatedCreatureCanonicalId: source.core.canonicalId, relatedCreatureName: source.core.canonicalName, relatedItemId: null, relatedItemName: null, sortOrder: 0 }];
  await items.saveItem(draft);
  assert.equal((await items.getItem(listingId)).creatureGrant, null);
  draft.creatureGrant = { creatureId: source.id, creatureName: source.core.canonicalName };
  await items.saveItem(draft);
  assert.equal((await items.getItem(listingId)).creatureGrant.creatureId, source.id);
  const withoutProfile = { ...draft }; delete withoutProfile.creatureGrant;
  await items.saveItem(withoutProfile);
  assert.equal((await items.getItem(listingId)).creatureGrant.creatureId, source.id);
  const clone = await items.createItemVariant(listingId, "Horse sale variant");
  assert.equal(clone.creatureGrant.creatureId, source.id);
  await assert.rejects(items.saveItem({ ...draft, creatureGrant: { creatureId: 0 } }), /Choose the exact Creature/);
  await assert.rejects(actors.run(player, () => items.saveItem({ ...draft, creatureGrant: null })), /Authoring access/);
});

test("multi-Creature checkout creates independent canonical individuals atomically and retry returns the same receipt", async () => {
  const ownerBefore = await getCharacter(ownerA, true);
  const before = await one("select credits_remaining from campaign_character_profile where character_id=$1",[ownerA]);
  const lines = [await quote(2)], submissionKey = key();
  const first = await purchase(lines, submissionKey), retry = await purchase(lines, submissionKey);
  assert.deepEqual(retry, first); assert.equal(first.status, "completed");
  const ids = await receiptIds(first.transactionId); assert.equal(ids.length, 2); assert.notEqual(ids[0], ids[1]);
  for (const id of ids) { assert.equal((await root(id)).owner_character_id, ownerA); assert.equal((await root(id)).player_user_id, god); }
  const after = await getCharacter(ownerA, true);
  assert.deepEqual(getCharacterEncumbrance(after.items), getCharacterEncumbrance(ownerBefore.items));
  assert.deepEqual(after.skillAllocations, ownerBefore.skillAllocations);
  assert.equal((await rows("select * from campaign_character_item where character_id=$1 and item_id=$2", [ownerA,listingId])).length,0);
  assert.equal((await rows("select * from campaign_character_item_instance where character_id=$1 and item_id=$2", [ownerA,listingId])).length,0);
  assert.equal((await one("select credits_remaining from campaign_character_profile where character_id=$1",[ownerA])).credits_remaining,before.credits_remaining-20);
  await hurt(ids[0], 7); assert.equal((await health.getActiveHealth(ids[1])).total.damage,0);
});

test("Player-safe read and naming cannot edit other state or survive loss of ownership", async () => {
  const { characterId } = await create({ name:"Storm", notes:"PRIVATE GOD NOTES" }); await hurt(characterId,8);
  const before = await state(characterId);
  await companions.renameOwnedCreatureForActor({ownerCharacterId:ownerA,creatureCharacterId:characterId,name:" Storm II ",notes:"forged",ownerCharacterIdOverride:ownerB},player);
  assert.equal((await root(characterId)).name,"Storm II"); assert.deepEqual(await state(characterId),before);
  const view = await companions.readOwnedCreaturesForActor(ownerA,player);
  assert.equal(view.canManage,false); assert.ok(view.individuals.some(row=>row.characterId===characterId && row.health.damage===8));
  assert.equal(JSON.stringify(view).includes("PRIVATE GOD NOTES"),false);
  await assert.rejects(companions.readOwnedCreaturesForActor(ownerA,foreign));
  await assert.rejects(companions.renameOwnedCreatureForActor({ownerCharacterId:ownerA,creatureCharacterId:characterId,name:""},player));
  await transfer(characterId,raceOwner); assert.deepEqual(await state(characterId),before);
  await assert.rejects(companions.renameOwnedCreatureForActor({ownerCharacterId:ownerA,creatureCharacterId:characterId,name:"Stolen"},player),/no longer owned/);
  await assert.rejects(companions.readOwnedCreaturesForActor(raceOwner,player));
});

test("sale and exact repurchase preserve identity, injuries, conditions, snapshots and names; no generic stock is added", async () => {
  const { characterId } = await create({name:"Storm"}); await hurt(characterId,9);
  await effects.addManualCondition({characterId,name:"Tired",description:"Long journey",duration:{kind:"until-removed"}});
  const before = await state(characterId), stock = await one("select limited_quantity from shop_offering where id=$1",[offeringId]);
  const submissionKey = key(), request = await sale(characterId,ownerA,submissionKey);
  assert.deepEqual(await sale(characterId,ownerA,submissionKey),request);
  const sold = await approve(request.requestId); assert.equal(sold.status,"completed");
  assert.equal((await root(characterId)).owner_character_id,null); assert.deepEqual(await state(characterId),before);
  assert.deepEqual(await one("select limited_quantity from shop_offering where id=$1",[offeringId]),stock);
  const custody = await one("select * from shop_resale_creature where creature_character_id=$1 and status='in-stock'",[characterId]);
  await assert.rejects(transfer(characterId,ownerB),/resale stock/);
  await assert.rejects(items.saveItem({...await items.getItem(listingId),creatureGrant:null}),/resale stock/);
  const bought = await purchase([await quote(1,custody.id)],key(),ownerB);
  assert.deepEqual(await receiptIds(bought.transactionId),[characterId]); assert.equal((await root(characterId)).owner_character_id,ownerB);
  assert.equal((await root(characterId)).name,"Storm"); assert.deepEqual(await state(characterId),before);
  assert.deepEqual(await receiptIds(sold.transactionId),[characterId]);
  await assert.rejects(purchase([await quote(1,custody.id)]),/no longer available/);
  const history = await db.transaction(tx=>commerce.readShopCommerceInTransaction(tx,{campaignId,shopId,characterId:ownerB,viewerUserId:player,godView:false}));
  assert.ok(history.history.some(receipt=>receipt.lines.some(line=>line.creatures.some(c=>c.characterId===characterId && c.name==="Storm"))));
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor({entityKind:"creature-npc",entityId:characterId},actor),/commerce identity/);
});

test("remove-from-active-play sale archives the original individual with audit and retained state", async () => {
  await pool.query("update shop set sold_item_handling='remove-from-active-play' where id=$1",[shopId]);
  const {characterId}=await create(); await hurt(characterId,5); const before=await state(characterId);
  const request=await sale(characterId); const sold=await approve(request.requestId);
  assert.equal(sold.status,"completed"); assert.ok((await root(characterId)).archived_at); assert.equal((await root(characterId)).owner_character_id,null);
  assert.deepEqual(await state(characterId),before); assert.deepEqual(await receiptIds(sold.transactionId),[characterId]);
  assert.ok(await one("select id from lifecycle_audit_event where target_id=$1 and entity_kind='creature-npc' and action='archive'",[String(characterId)]));
  await pool.query("update shop set sold_item_handling='add-to-shop-stock' where id=$1",[shopId]);
});

test("approval does not duplicate purchases; revised exact sale quantity is rejected; funds and failures roll back", async () => {
  await pool.query("update shop set character_purchase_mode='god-approval-required' where id=$1",[shopId]);
  const request=await purchase([await quote()]); assert.equal(request.status,"pending");
  const result=await approve(request.requestId); assert.equal(result.status,"completed"); assert.deepEqual(await approve(request.requestId),result);
  const id=(await receiptIds(result.transactionId))[0]; const saleRequest=await sale(id);
  const line=await one("select * from shop_transaction_request_line where request_id=$1",[saleRequest.requestId]);
  await assert.rejects(approve(saleRequest.requestId,[{requestLineId:line.id,quantity:2,unitPriceCredits:1}]),/quantity of one/);
  await pool.query("update shop set character_purchase_mode='immediate' where id=$1",[shopId]);
  const count=async()=>Number((await one("select count(*)::int n from campaign_character where campaign_id=$1",[campaignId])).n);
  const before=await count(); const input={visitId,characterId:ownerA,lines:[await quote(2)],submissionKey:key()};
  await assert.rejects(db.transaction(async tx=>{await commerce.submitPlayerPurchaseInTransaction(tx,input,player);throw new Error("Rollback probe");}),/Rollback probe/);
  assert.equal(await count(),before); assert.equal((await rows("select * from shop_commerce_operation where submission_key=$1",[input.submissionKey])).length,0);
  await pool.query("update campaign_character_profile set credits_remaining=0 where character_id=$1",[ownerB]);
  await assert.rejects(purchase([await quote()],key(),ownerB),/funds|money|balance|afford/i); assert.equal(await count(),before);
  await pool.query("update campaign_character_profile set credits_remaining=1000 where character_id=$1",[ownerB]);
});

test("grant changes require owner review, while service and descriptive-only listings keep normal fulfillment", async () => {
  const original = await items.getItem(listingId);
  await items.saveItem({ ...original, creatureGrant:null });
  const old = await one("select version from shop_offering where id=$1",[offeringId]);
  const quotedItem = {offeringId,quantity:1,expectedOfferingVersion:old.version,quotedUnitPriceCredits:10,quotedFulfillmentKind:"inventory-transfer"};
  await items.saveItem(original);
  const stale = await purchase([quotedItem]); assert.equal(stale.status,"owner-review"); assert.equal(stale.transactionId,null);
  const requestLine = await one("select fulfillment_kind,granted_creature_id from shop_transaction_request_line where request_id=$1",[stale.requestId]);
  assert.deepEqual(requestLine,{fulfillment_kind:"creature-transfer",granted_creature_id:source.id});
  const accepted=await db.transaction(tx=>commerce.acceptShopRequestTermsInTransaction(tx,{requestId:stale.requestId,expectedTermsVersion:1,submissionKey:key()},player));
  assert.equal(accepted.status,"completed");assert.equal((await receiptIds(accepted.transactionId)).length,1);
  await pool.query("update shop_offering set fulfillment_kind='service-narrative',version=version+1 where id=$1",[offeringId]);
  const serviceQuote = await quote(); serviceQuote.quotedFulfillmentKind="service-narrative";delete serviceQuote.quotedGrantedCreatureId;
  const service=await purchase([serviceQuote]);assert.equal(service.status,"completed");assert.deepEqual(await receiptIds(service.transactionId),[]);
  await pool.query("update shop_offering set fulfillment_kind='inventory-transfer',version=version+1 where id=$1",[offeringId]);
  await items.saveItem({...original,creatureGrant:null});
  const itemQuote=await quote();itemQuote.quotedFulfillmentKind="inventory-transfer";delete itemQuote.quotedGrantedCreatureId;
  const normal=await purchase([itemQuote]);assert.deepEqual(await receiptIds(normal.transactionId),[]);
  assert.equal((await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,listingId])).quantity,1);
  await items.saveItem(original);
  await assert.rejects(items.saveItem({...original,creatureGrant:{creatureId:2147483647}}),/available Creature/);
});

test("concurrent last generic stock and exact resale permit one buyer each", async () => {
  await pool.query("update shop_offering set limited_quantity=1,version=version+1 where id=$1",[offeringId]);
  const line=await quote(); const generic=await Promise.allSettled([purchase([line],key(),ownerA),purchase([line],key(),ownerB)]);
  assert.equal(generic.filter(row=>row.status==='fulfilled').length,1);
  const {characterId}=await create({name:"Only Storm"}); const request=await sale(characterId); await approve(request.requestId);
  const resale=await one("select id from shop_resale_creature where creature_character_id=$1 and status='in-stock'",[characterId]);
  const exact=await quote(1,resale.id); const results=await Promise.allSettled([purchase([exact],key(),ownerA),purchase([exact],key(),ownerB)]);
  assert.equal(results.filter(row=>row.status==='fulfilled').length,1); assert.equal((await rows("select * from shop_resale_creature where id=$1 and status='sold'",[resale.id])).length,1);
  assert.equal((await one("select limited_quantity from shop_offering where id=$1",[offeringId])).limited_quantity,0);
});

const equipment = await import("../src/features/creatures/owned-creature-equipment-service.ts");
const equipmentState = await import("../src/features/items/equipment-state-service.ts");
const itemUse = await import("../src/app/characters/item-use-actions.ts");
async function equipmentCommand(creatureCharacterId, itemId, instanceId, operation, state = "inactive", quantity = 1, ownerCharacterId = ownerA) {
  const view = await equipment.readCompanionEquipmentForActor(ownerCharacterId, creatureCharacterId, player);
  const row=(operation==='to-creature'?view.ownerEquipment:view.creatureEquipment).find(row=>row.itemId===itemId&&row.instanceId===instanceId);
  const expectedStates={inactive:row?.inactive??0,equipped:row?.equipped??0,worn:row?.worn??0,wielded:row?.wielded??0};
  return { expectedStates, ownerCharacterId, creatureCharacterId, itemId, instanceId, operation, state, quantity, ownerVersion: view.ownerVersion, creatureVersion: view.creatureVersion, requestKey: key() };
}
async function personalItem(name, options = {}) {
  const id = (await one("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,credits,price_basis,weight,weight_unit,created_by_user_id) values($1,$2,'equipment','general','misc','Companion','Gear',3,'Each',12,'lb',$3) returning id",[key().toUpperCase(),name,god])).id;
  await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) values($1,$2,$2)",[campaignId,id]);
  if(options.effects) {
    await pool.query("insert into item_runtime_profiles(item_id,use_mode,quantity_per_use) values($1,'consume-item',1)",[id]);
    for (const [index,effect] of options.effects.entries()) await pool.query("insert into item_effects(item_id,schema_version,effect_json,sort_order) values($1,2,$2,$3)",[id,effect,index]);
  }
  return id;
}
const requestFor = (id, target) => ({ sourceCharacterId: ownerA, itemId: id, itemInstanceId: null, targetCharacterId: target, effectSelections: {} });
const executePlayerItem = request => actors.run(player, () => itemUse.executeCharacterItemUse(request));
const previewItem = request => actors.run(player, () => itemUse.prepareCharacterItemUse(request));
const weight = async id => { const value = await getCharacter(id,true); return getCharacterEncumbrance([...value.items,...value.itemInstances.map(row=>({...row,quantity:1}))]).totals.find(row=>row.unit==='lb')?.weight ?? 0; };

test("owner equipment moves exact identity and weight, equips on the NPC, retries safely, and survives ownership transfer", async () => {
  const {characterId}=await create({name:"Equipped Storm"});
  const id=await personalItem("Personal harness");
  await pool.query("insert into item_power_resources(item_id,maximum_charges) values($1,10)",[id]);
  const instance=(await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,7,3) returning id",[ownerA,id])).id;
  await pool.query("insert into item_passive_effects(item_id,required_equipment_state,schema_version,effect_json,sort_order) values($1,'worn',2,$2,0)",[id,{kind:"modifier.apply",label:"Harness authored benefit",channel:"initiative",targetKey:"self",amount:2,duration:{kind:"until-removed"}}]);
  const beforeWeight=await weight(ownerA), ownerEffects=await effects.getActiveEffects(ownerA);
  const command=await equipmentCommand(characterId,id,instance,"to-creature","worn");
  await assert.rejects(equipment.changeCompanionEquipmentForActor(command,otherPlayer),/only your Character/);
  await assert.rejects(companions.renameOwnedCreatureForActor({ownerCharacterId:ownerA,creatureCharacterId:characterId,name:"Stolen"},otherPlayer),/only your Character/);
  await assert.rejects(equipment.changeCompanionEquipmentForActor(command,admin),/Only the owning Player/);
  assert.equal((await equipment.readCompanionEquipmentForActor(ownerA,characterId,admin)).canChange,false);
  const first=await equipment.changeCompanionEquipmentForActor(command,player);
  assert.deepEqual(await equipment.changeCompanionEquipmentForActor(command,player),first);
  assert.equal((await one("select character_id from campaign_character_item_instance where id=$1",[instance])).character_id,characterId);
  assert.equal(await weight(ownerA),beforeWeight-12);
  const visible=await equipment.readCompanionEquipmentForActor(ownerA,characterId,player);
  assert.ok(visible.creatureEquipment.some(row=>row.instanceId===instance&&row.worn===1));
  assert.deepEqual(await effects.getActiveEffects(ownerA),ownerEffects);
  assert.ok((await effects.getActiveEffects(characterId)).modifiers.some(row=>row.label==="Harness authored benefit"));
  await assert.rejects(equipment.changeCompanionEquipmentForActor({...command,requestKey:key()},player),/Inventory changed/);
  await equipment.changeCompanionEquipmentForActor(await equipmentCommand(characterId,id,instance,"set-state"),player);
  assert.equal((await one("select equipment_state from campaign_character_item_instance where id=$1",[instance])).equipment_state,"inactive");
  const staleState=await equipmentCommand(characterId,id,instance,"set-state","wielded");
  await actors.run(god,()=>equipmentState.setInstanceEquipmentState({characterId,instanceId:instance,state:"worn"}));
  await assert.rejects(equipment.changeCompanionEquipmentForActor(staleState,player),/Equipment changed/);
  await assert.rejects(actors.run(player,()=>equipmentState.setInstanceEquipmentState({characterId,instanceId:instance,state:"inactive"})),/permission/);
  const equipped=await one("select * from campaign_character_item_instance where id=$1",[instance]);
  await transfer(characterId,ownerB);assert.deepEqual(await one("select * from campaign_character_item_instance where id=$1",[instance]),equipped);
  await assert.rejects(equipment.changeCompanionEquipmentForActor(await equipmentCommand(characterId,id,instance,"to-character","inactive",1,ownerB),otherPlayer));
  await assert.rejects(equipment.readCompanionEquipmentForActor(ownerA,characterId,player),/no longer owned/);
  await transfer(characterId,ownerA);
  const returning=await equipmentCommand(characterId,id,instance,"to-character");
  await equipment.changeCompanionEquipmentForActor(returning,player);await equipment.changeCompanionEquipmentForActor(returning,player);
  const final=await one("select * from campaign_character_item_instance where id=$1",[instance]);
  assert.equal(final.character_id,ownerA);assert.equal(final.current_charges,7);assert.equal(final.equipment_state,"inactive");assert.equal(final.retired_at,null);
  assert.equal(await weight(ownerA),beforeWeight);assert.equal((await rows("select id from campaign_character_item_instance where item_id=$1",[id])).length,1);
  assert.equal((await equipment.readCompanionEquipmentForActor(ownerA,characterId,player)).creatureEquipment.length,0);
});

test("personal stack equipment transfers atomically and preserves counts under concurrent attempts", async()=>{
  const {characterId}=await create();const id=await personalItem("Collar");
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,2,3)",[ownerA,id]);
  const command=await equipmentCommand(characterId,id,null,"to-creature","worn");
  const results=await Promise.allSettled([equipment.changeCompanionEquipmentForActor(command,player),equipment.changeCompanionEquipmentForActor({...command,requestKey:key()},player)]);
  assert.equal(results.filter(row=>row.status==="fulfilled").length,1);
  assert.equal((await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id])).quantity,1);
  assert.ok((await equipment.readCompanionEquipmentForActor(ownerA,characterId,player)).creatureEquipment.some(row=>row.itemId===id&&row.worn===1));
  await equipment.changeCompanionEquipmentForActor(await equipmentCommand(characterId,id,null,"to-character"),player);
  assert.equal((await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id])).quantity,2);
  assert.equal((await rows("select * from campaign_character_item where character_id=$1 and item_id=$2",[characterId,id])).length,0);
  assert.equal((await rows("select * from campaign_character_item_equipment_state where character_id=$1 and item_id=$2",[characterId,id])).length,0);
  const invalid=await equipmentCommand(characterId,id,null,"to-creature","worn",3);
  await assert.rejects(equipment.changeCompanionEquipmentForActor(invalid,player));
  assert.equal((await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id])).quantity,2);
});

test("owned Creature retains full individual G.O.D. editing while Player mechanical, health, and lifecycle controls stay protected",async()=>{
  const {characterId}=await create();const other=await create();const master=await creatures.getCreature(source.id), untouched=await state(other.characterId);
  const draft=await npcs.getCreatureNpc(characterId);
  await assert.rejects(actors.run(player,()=>npcs.getCreatureNpc(characterId)));
  await assert.rejects(actors.run(player,()=>npcs.saveCreatureNpc(draft)));
  await assert.rejects(actors.run(player,()=>health.restoreCharacterHealth(characterId)),/permission/);
  await assert.rejects(actors.run(player,()=>effects.addManualCondition({characterId,name:"Unauthorized",description:"",duration:{kind:"until-removed"}})),/permission/);
  await assert.rejects(lifecycle.archiveLifecycleEntityForActor({entityKind:"creature-npc",entityId:characterId,reason:"Unauthorized"},{userId:player,roles:["player"]}));
  draft.currentSnapshot.core.baseMovementSteps+=1;draft.hpAdjustment+=2;draft.instanceNotes="Storm's individual scar";
  await npcs.saveCreatureNpc(draft);
  const updated=await npcs.getCreatureNpc(characterId);
  assert.equal(updated.currentSnapshot.core.baseMovementSteps,draft.currentSnapshot.core.baseMovementSteps);assert.equal(updated.hpAdjustment,draft.hpAdjustment);
  assert.deepEqual(await creatures.getCreature(source.id),master);assert.deepEqual(await state(other.characterId),untouched);assert.equal((await root(characterId)).owner_character_id,ownerA);
});

test("Player Item use targets exact persistent companion health and consumes only source inventory; Self and G.O.D. retain their paths",async()=>{
  const {characterId}=await create({name:"Healing Storm"}), second=await create(), unowned=await create({ownerCharacterId:null}), other=await create({ownerCharacterId:ownerB});
  await hurt(characterId,12);await hurt(second.characterId,9);await hurt(ownerA,10);
  const id=await personalItem("Healing potion",{effects:[{kind:"health.heal",amount:3,scope:"full-body"}]});
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,5,3)",[ownerA,id]);
  const request=requestFor(id,characterId), preparation=await previewItem(request), options=preparation.targetOptions.map(row=>row.characterId);
  assert.equal(preparation.canChooseTarget,true);assert.ok(options.includes(ownerA));assert.ok(options.includes(characterId));
  for(const forbidden of [ownerB,raceOwner,unowned.characterId,other.characterId,foreignOwner])assert.equal(options.includes(forbidden),false);
  const ownerBefore=await health.getActiveHealth(ownerA), secondBefore=await health.getActiveHealth(second.characterId);
  const result=await executePlayerItem(request);assert.equal(result.success,true);assert.equal(result.target.characterId,characterId);
  assert.equal((await health.getActiveHealth(characterId)).total.damage,9);assert.deepEqual(await health.getActiveHealth(ownerA),ownerBefore);assert.deepEqual(await health.getActiveHealth(second.characterId),secondBefore);
  assert.equal((await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id])).quantity,4);
  assert.equal((await rows("select * from campaign_character_item where character_id=$1 and item_id=$2",[characterId,id])).length,0);
  for(const forbidden of [ownerB,raceOwner,unowned.characterId,other.characterId,foreignOwner])await assert.rejects(executePlayerItem(requestFor(id,forbidden)),/permission/);
  await assert.rejects(actors.run(otherPlayer,()=>itemUse.executeCharacterItemUse(request)),/permission/);
  await executePlayerItem(requestFor(id,null));assert.equal((await health.getActiveHealth(ownerA)).total.damage,7);
  const godPreview=await itemUse.prepareCharacterItemUse(requestFor(id,unowned.characterId));assert.ok(godPreview.targetOptions.some(row=>row.characterId===unowned.characterId));
  await itemUse.executeCharacterItemUse(requestFor(id,unowned.characterId));
  await previewItem(request);await transfer(characterId,ownerB);
  const quantity=await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id]);
  await assert.rejects(executePlayerItem(request),/permission|no longer owned/);assert.deepEqual(await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id]),quantity);
  assert.equal((await health.getActiveHealth(characterId)).total.damage,9);
});

test("companion anatomy, authored conditions/modifiers, and rollback all reuse canonical Item effects",async()=>{
  const {characterId}=await create();await hurt(characterId,10);
  const id=await personalItem("Localized remedy",{effects:[{kind:"health.heal",amount:2,scope:"area"},{kind:"condition.apply",name:"Remedy marker",description:"Authored",duration:{kind:"until-removed"}},{kind:"modifier.apply",label:"Remedy initiative",channel:"initiative",targetKey:"self",amount:2,duration:{kind:"until-removed"}}]});
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,2,3)",[ownerA,id]);
  const request=requestFor(id,characterId), initial=await previewItem(request);
  assert.equal(initial.plan.ready,false);assert.equal(initial.plan.initialHealth.anatomy.kind,"creature");
  const effectId=initial.plan.effects[0].effectId,poolKey=initial.plan.initialHealth.anatomy.pools[0].key;
  await assert.rejects(executePlayerItem({...request,effectSelections:{[effectId]:{poolKey:"not-a-horse-pool"}}}));
  request.effectSelections={[effectId]:{poolKey}};assert.equal((await previewItem(request)).plan.ready,true);
  const before=await state(characterId);
  await assert.rejects(db.transaction(tx=>itemUse.executeCharacterItemUseInCallerTransaction(tx,request,player,()=>{throw new Error("Companion effect rollback");})),/Companion effect rollback/);
  assert.deepEqual(await state(characterId),before);assert.equal((await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id])).quantity,2);
  await executePlayerItem(request);
  assert.equal((await health.getActiveHealth(characterId)).total.damage,10);
  assert.equal((await health.getActiveHealth(characterId)).tracks.find(row=>row.key===poolKey).damage,8);
  const active=await effects.getActiveEffects(characterId);assert.ok(active.conditions.some(row=>row.name==="Remedy marker"));assert.ok(active.modifiers.some(row=>row.label==="Remedy initiative"));
  assert.equal((await effects.getActiveEffects(ownerA)).conditions.some(row=>row.name==="Remedy marker"),false);
  assert.equal((await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id])).quantity,1);
  const results=await Promise.allSettled([executePlayerItem(request),executePlayerItem(request)]);assert.equal(results.filter(row=>row.status==="fulfilled").length,1);
  assert.equal((await rows("select * from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id])).length,0);
  assert.equal((await health.getActiveHealth(characterId)).tracks.find(row=>row.key===poolKey).damage,6);
});

test("companion sheet actions reject active encounters and archived individuals without extending G.O.D. or charge rules",async()=>{
  const {characterId}=await create();const id=await personalItem("Guard remedy",{effects:[{kind:"health.heal",amount:2,scope:"full-body"}]});
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,2,3)",[ownerA,id]);
  const command=await equipmentCommand(characterId,id,null,"to-creature","inactive");
  const encounter=(await one("insert into campaign_session_encounter(scene_id,session_id,campaign_id,sequence_number,title,status,started_at) values($1,$2,$3,1,'Existing encounter guard','active',now()) returning id",[sceneId,sessionId,campaignId])).id;
  await pool.query("insert into campaign_session_encounter_participant(encounter_id,scene_id,session_id,campaign_id,character_id) values($1,$2,$3,$4,$5)",[encounter,sceneId,sessionId,campaignId,characterId]);
  const request=requestFor(id,characterId), before=await state(characterId);
  await assert.rejects(previewItem(request),/outside active encounters/);await assert.rejects(executePlayerItem(request),/outside active encounters/);
  assert.equal((await previewItem(requestFor(id,null))).targetOptions.some(row=>row.characterId===characterId),false);
  await assert.rejects(equipment.changeCompanionEquipmentForActor(command,player),/active combat/);
  assert.equal((await itemUse.prepareCharacterItemUse(request)).plan.ready,true);
  assert.deepEqual(await state(characterId),before);
  await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1",[encounter]);
  await lifecycle.archiveLifecycleEntityForActor({entityKind:"creature-npc",entityId:characterId,reason:"Resting"},actor);
  await assert.rejects(executePlayerItem(request));await assert.rejects(equipment.changeCompanionEquipmentForActor(command,player),/Restore/);
  assert.equal((await previewItem(requestFor(id,null))).targetOptions.some(row=>row.characterId===characterId),false);
  await lifecycle.restoreLifecycleEntityForActor({entityKind:"creature-npc",entityId:characterId},actor);
  const charged=await personalItem("Legacy charged remedy");
  await pool.query("insert into item_runtime_profiles(item_id,use_mode,maximum_charges,charges_per_use) values($1,'charges',5,1)",[charged]);
  await pool.query("insert into item_effects(item_id,schema_version,effect_json,sort_order) values($1,2,$2,0)",[charged,{kind:"health.heal",amount:2,scope:"full-body"}]);
  const copy=(await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,5,3) returning id",[ownerA,charged])).id;
  await assert.rejects(executePlayerItem({...requestFor(charged,characterId),itemInstanceId:copy}),/legacy charged|Needs rebuilding/i);
  assert.equal((await one("select current_charges from campaign_character_item_instance where id=$1",[copy])).current_charges,5);
  assert.equal((await one("select quantity from campaign_character_item where character_id=$1 and item_id=$2",[ownerA,id])).quantity,2);
});

test("G.O.D. inventory grants wait for Campaign ownership operations before locking the Character",async()=>{
  const {adjustOwnerInventory}=await import("../src/features/items/owner-inventory-service.ts");
  const id=await personalItem("Concurrency collar");
  const {commerce_version:version}=await one("select commerce_version from campaign_character_profile where character_id=$1",[ownerA]);
  const holder=await pool.connect();let adjustment;
  try {
    await holder.query('begin');
    const pid=(await holder.query('select pg_backend_pid() pid')).rows[0].pid;
    await holder.query('select id from campaign where id=$1 for update',[campaignId]);
    adjustment=adjustOwnerInventory({characterId:ownerA,itemId:id,quantity:1,expectedCommerceVersion:version,operation:'grant'});
    // Observe the real competing action waiting on our Campaign, then follow ownership's Character lock order.
    const deadline=Date.now()+5000;let waiting=false;
    while(Date.now()<deadline){
      waiting=(await pool.query('select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) waiting',[pid])).rows[0].waiting;
      if(waiting)break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(waiting,true,'The competing inventory action reached its Campaign lock.');
    await holder.query('select id from campaign_character where id=$1 for update nowait',[ownerA]);
    await holder.query('commit');await adjustment;
    assert.equal((await one('select quantity from campaign_character_item where character_id=$1 and item_id=$2',[ownerA,id])).quantity,1);
  }finally{await holder.query('rollback');holder.release();await adjustment?.catch(()=>{});}
});

test("Campaign deletion handles Creature receipt/custody cycles and preserves shared definitions", async()=>{
  const target={entityKind:"campaign",entityId:campaignId}; await lifecycle.archiveLifecycleEntityForActor(target,actor);
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor(target,actor,"Ownership Campaign",{afterCampaignDeleteStep:()=>{throw new Error("Rollback deletion");}}),/Rollback deletion/);
  assert.ok(await root(ownerA));
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(target,actor,"Ownership Campaign");
  assert.equal(await root(ownerA),undefined); assert.ok(await one("select id from creatures where id=$1",[source.id]));
});

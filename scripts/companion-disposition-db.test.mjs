import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_COMPANION_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_ownership_dev$/);
const actors = new AsyncLocalStorage();
const god = "companion-god", admin = "companion-admin", player = "companion-player", foreign = "companion-foreign", otherPlayer = "companion-player-two";
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
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const { creatureDraftFixture, creatureFormFixture } = await import("./creature-form-fixture.ts");
const actor = { userId: god, roles: ["god"] };
let campaignId, otherCampaignId, ownerA, ownerB, raceOwner, foreignOwner, source;
let sequence = 0;
const create = (overrides = {}) => npcs.createNpc({ campaignId, origin: "creature", buildMode: "detailed", sourceId: source.id, name: `Horse ${++sequence}`, roleLabel: "Companion", notes: "Given at the north gate", ownerCharacterId: ownerA, ...overrides });
const transfer = (characterId, ownerCharacterId, override = {}) => npcs.setCreatureNpcOwner({ campaignId, characterId, ownerCharacterId, ...override });
const root = (id) => one("select * from campaign_character where id=$1", [id]);
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
  draft.core.canonicalName = "Companion Horse";
  draft.forms = [creatureFormFixture()];
  source = await creatures.saveCreature(draft);
}
after(async () => {
  if (process.env.SERRIAN_COMPANION_BROWSER === "true") {
    const owner=await character(campaignId,"Browser companion owner");
    const ids={};
    for (const name of ["Legacy companion","Walking companion","Away companion","Bound companion"]) ids[name]=(await create({name,ownerCharacterId:owner})).characterId;
    const itemId=await model("Browser Calling Stone",true), first=await newCopy(itemId,owner), second=await newCopy(itemId,owner);
    for (const [name,disposition] of [["Walking companion","accompanying"],["Away companion","away"],["Bound companion","vessel-bound"]]) {
      await travel.changeCompanionDispositionForActor({ownerCharacterId:owner,creatureCharacterId:ids[name],disposition,awayNote:disposition==="away"?"Stable at Greyhaven":"",vesselInstanceId:disposition==="vessel-bound"?first:null,expectedRevision:0,acknowledgeUnbind:false,requestKey:`browser-${++sequence}`},player);
    }
    const authorItem=await model("Browser Vessel authoring");
    const simpleId=(await create({name:"Simple travel companion",buildMode:"simple",ownerCharacterId:raceOwner})).characterId;
    await mkdir("artifacts/guidance/companion-disposition",{recursive:true});
    await writeFile("artifacts/guidance/companion-disposition/fixture.json",JSON.stringify({campaignId,owner,ids,itemId,first,second,authorItem,simpleId,raceOwner,god,player}));
  }
  await pool.end();
});

const items = await import("../src/app/heavens/items/actions.ts");
const travel = await import("../src/features/creatures/companion-disposition-service.ts");
const companions = await import("../src/features/creatures/owned-creature-service.ts");
const ownerInventory = await import("../src/features/items/owner-inventory-service.ts");
const custody = await import("../src/features/items/inventory-custody-service.ts");
const evolutions = await import("../src/features/evolutions/evolution-execution-service.ts");
let vesselId, ordinaryId, vesselA, vesselB;
const view = (id, who = player, owner = ownerA) => travel.readCompanionDispositionForActor(owner, id, who);
const saved = id => one("select * from owned_creature_disposition where character_id=$1", [id]);
const newCopy = async (itemId = vesselId, holder = ownerA) => (await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,0,10) returning id", [holder,itemId])).id;
async function model(name, vessel = false) {
  const id = (await one("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,credits,price_basis,weight,weight_unit,created_by_user_id) values($1,$2,'equipment','general','misc','Companions','Travel',10,'Each',1,'lb',$3) returning id", [`COMPANION-${++sequence}`,name,god])).id;
  await pool.query("insert into campaign_inventory_item(campaign_id,item_id,sort_order) select $1,$2,coalesce(max(sort_order),-1)+1 from campaign_inventory_item where campaign_id=$1", [campaignId,id]);
  if (vessel) await items.saveItem({ ...await items.getItem(id), creatureVessel: true });
  return id;
}
async function command(id, disposition = "accompanying", changes = {}) {
  return { ownerCharacterId: ownerA, creatureCharacterId: id, disposition, awayNote: "", vesselInstanceId: null,
    expectedRevision: (await view(id)).revision, acknowledgeUnbind: false, requestKey: `companion-${++sequence}`, ...changes };
}
async function set(id, disposition = "accompanying", changes = {}, who = player) {
  return travel.changeCompanionDispositionForActor(await command(id, disposition, changes), who);
}
const bind = (id, instanceId = vesselA, changes = {}) => set(id,"vessel-bound",{vesselInstanceId:instanceId,...changes});
const allRows = async () => Object.fromEntries(await Promise.all((await rows("select tablename from pg_tables where schemaname='public' order by tablename")).map(async ({tablename}) => [tablename, await rows(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)])));
before(async () => { await seedBase(); vesselId = await model("Calling Stone", true); ordinaryId = await model("Ordinary stone"); vesselA = await newCopy(); vesselB = await newCopy(); });

test("legacy reads do not infer disposition; deliberate Accompanying and Away affect management state only", async () => {
  const {characterId:id} = await create();
  assert.equal((await view(id)).disposition, null);
  assert.equal((await companions.readOwnedCreaturesForActor(ownerA,player)).individuals.find(row=>row.characterId===id).travel.disposition,null);
  const before = await state(id), ownerBefore = await state(ownerA);
  await set(id); assert.equal((await saved(id)).disposition,"accompanying");
  await set(id,"away",{awayNote:"  Stable at Greyhaven  "});
  assert.equal((await view(id)).awayNote,"Stable at Greyhaven");
  assert.deepEqual(await state(id),before); assert.deepEqual(await state(ownerA),ownerBefore);
  assert.equal((await rows("select * from companion_disposition_event where character_id=$1",[id])).length,2);
  assert.equal((await rows("select * from campaign_session_encounter_participant where character_id=$1",[id])).length,0);
  assert.equal((await rows("select * from campaign_session_scene_member where character_id=$1",[id])).length,0);
});

test("Vessel authoring round-trips, clones, preserves omitted fields and keeps grant/container independent",async()=>{
  let draft=await items.getItem(vesselId); assert.equal(draft.creatureVessel,true); assert.equal(draft.creatureGrant,null); assert.equal(draft.containerProfile,null);
  const clone=await items.createItemVariant(vesselId,"Calling Stone variant"); assert.equal(clone.creatureVessel,true);
  await items.saveItem({...draft,creatureGrant:{creatureId:source.id}});
  draft=await items.getItem(vesselId); const omitted={...draft};delete omitted.creatureVessel; await items.saveItem(omitted);
  assert.equal((await items.getItem(vesselId)).creatureVessel,true);
  await items.saveItem({...draft,creatureVessel:false}); assert.equal((await items.getItem(vesselId)).creatureVessel,false);
  assert.equal((await items.getItem(vesselId)).creatureGrant.creatureId,source.id);
  assert.equal((await one("select count(*)::int n from campaign_character_item_instance where item_id=$1",[vesselId])).n,2);
  const aggregate=await getCharacter(ownerA,true);assert.equal(aggregate.itemInstances.filter(copy=>copy.itemId===vesselId).length,2);
  await items.saveItem({...draft,creatureVessel:true,creatureGrant:null});
  const ordinary=await items.getItem(ordinaryId);assert.equal(ordinary.creatureVessel,false);
  await assert.rejects(actors.run(player,()=>items.saveItem({...ordinary,creatureVessel:true})),/Authoring access/);
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,2,1)",[ownerA,ordinaryId]);
  await assert.rejects(items.saveItem({...ordinary,creatureVessel:true}));
  assert.equal((await items.getItem(ordinaryId)).creatureVessel,false);
  await assert.rejects(pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,1,1)",[ownerA,vesselId]),/exact owned copies/);
});

test("exact binding is one to one, distinguishes duplicates, requires explicit unbinding and commits atomically",async()=>{
  const first=(await create()).characterId, second=(await create()).characterId;
  const options=await view(first);const a=options.vessels.find(copy=>copy.instanceId===vesselA), b=options.vessels.find(copy=>copy.instanceId===vesselB);
  assert.ok(a&&b);assert.notEqual(a.label,b.label);assert.match(a.label,/Calling Stone/);
  await bind(first);await bind(second,vesselB);
  assert.equal((await saved(first)).vessel_instance_id,vesselA);assert.equal((await saved(second)).vessel_instance_id,vesselB);
  const before=await allRows();await assert.rejects(bind(first,vesselB,{acknowledgeUnbind:true}),/already bound/);assert.deepEqual(await allRows(),before);
  await assert.rejects(set(first,"away",{awayNote:"Home"}),/Confirm.*unbind/);
  await assert.rejects(pool.query("update owned_creature_disposition set vessel_instance_id=$1 where character_id=$2",[vesselB,first]),/unique constraint/);
  await assert.rejects(pool.query("update owned_creature_disposition set vessel_instance_id=null,vessel_item_id=null where character_id=$1",[first]),/constraint/);
  await assert.rejects(items.saveItem({...await items.getItem(vesselId),creatureVessel:false}),/Unbind/);
  await assert.rejects(pool.query("delete from creature_vessel_profile where item_id=$1",[vesselId]),/Unbind/);
  await set(first,"away",{awayNote:"Home",acknowledgeUnbind:true});await set(second,"accompanying",{acknowledgeUnbind:true});
  assert.equal((await saved(first)).vessel_instance_id,null);
});

test("foreign Creatures, owners, campaigns, Race NPCs, PCs, occurrences and library authority reject",async()=>{
  const id=(await create()).characterId, c=await command(id);
  for(const who of [admin,foreign,otherPlayer]) await assert.rejects(travel.changeCompanionDispositionForActor(c,who));
  for(const creatureCharacterId of [ownerA,raceOwner,foreignOwner,-1,0,1.5,2147483647]) await assert.rejects(travel.changeCompanionDispositionForActor({...c,creatureCharacterId},player));
  for(const ownerCharacterId of [ownerB,foreignOwner,id,-1]) await assert.rejects(travel.changeCompanionDispositionForActor({...c,ownerCharacterId},player));
  const other=(await create({ownerCharacterId:ownerB})).characterId;await assert.rejects(travel.changeCompanionDispositionForActor({...c,creatureCharacterId:other},player));
  await travel.changeCompanionDispositionForActor(c,god);
  for(const characterId of [ownerA,raceOwner,-1])await assert.rejects(pool.query("insert into owned_creature_disposition(character_id,campaign_id,disposition,revision,updated_by_user_id) values($1,$2,'away',1,$3)",[characterId,campaignId,god]));
  await assert.rejects(pool.query("update owned_creature_disposition set campaign_id=$1 where character_id=$2",[otherCampaignId,id]),/Campaign/);
  const ordinaryCopy=await newCopy(ordinaryId);await assert.rejects(bind(id,ordinaryCopy),/Creature Vessel/);
  const foreignCopy=await newCopy(vesselId,foreignOwner);await assert.rejects(bind(id,foreignCopy),/owner's inventory/);
  await assert.rejects(pool.query("update owned_creature_disposition set disposition='vessel-bound',vessel_instance_id=$1,vessel_item_id=$2 where character_id=$3",[foreignCopy,vesselId,id]),/same Campaign/);
});

test("same request retries once, stale edits reject, and concurrent competition has one winner",async()=>{
  const id=(await create()).characterId,c=await command(id);
  const result=await travel.changeCompanionDispositionForActor(c,player);
  assert.deepEqual(await travel.changeCompanionDispositionForActor(c,player),result);
  await assert.rejects(travel.changeCompanionDispositionForActor({...c,disposition:"away"},player),/retry identity/);
  await assert.rejects(travel.changeCompanionDispositionForActor({...c,requestKey:"stale"},player),/changed/);
  const second=(await create()).characterId, copy=await newCopy();
  const commands=await Promise.all([command(id,"vessel-bound",{vesselInstanceId:copy}),command(second,"vessel-bound",{vesselInstanceId:copy})]);
  const results=await Promise.allSettled(commands.map(c=>travel.changeCompanionDispositionForActor(c,player)));
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await one("select count(*)::int n from owned_creature_disposition where vessel_instance_id=$1",[copy])).n,1);
});

test("contained, closed, dropped, lost, stolen, unequipped and changed holder preserve binding and ownership",async()=>{
  const id=(await create()).characterId, copy=await newCopy();await bind(id,copy);const before=await saved(id);
  const box=await model("Vessel pouch");
  await pool.query("insert into container_profiles(item_id,max_weight_lb,volume_capacity_l,closure_mode) values($1,100,100,'open-close')",[box]);
  const container=await newCopy(box);
  await pool.query("insert into inventory_instance_location(instance_id,character_id,item_id,container_instance_id,container_item_id) values($1,$2,$3,$4,$5)",[copy,ownerA,vesselId,container,box]);
  assert.deepEqual(await saved(id),before);assert.match((await view(id)).vessel.custody,/inside a container.*inaccessible/);
  await pool.query("delete from inventory_instance_location where instance_id=$1",[copy]);
  for(const status of ["dropped","stolen","lost"]){
    await pool.query("insert into inventory_instance_custody(instance_id,character_id,item_id,status,context_label,note,reason,actor_user_id) values($1,$2,$3,$4,'Elsewhere','Private note','Fixture',$5) on conflict(instance_id) do update set status=excluded.status",[copy,ownerA,vesselId,status,god]);
    assert.deepEqual(await saved(id),before);assert.match((await view(id)).vessel.custody,new RegExp(status));
  }
  await pool.query("delete from inventory_instance_custody where instance_id=$1",[copy]);
  await pool.query("update campaign_character_item_instance set equipment_state='equipped' where id=$1",[copy]);
  await pool.query("update campaign_character_item_instance set equipment_state='inactive',character_id=$1 where id=$2",[ownerB,copy]);
  assert.deepEqual(await saved(id),before);assert.equal((await root(id)).owner_character_id,ownerA);assert.match((await view(id)).vessel.custody,/Held elsewhere/);
  await assert.rejects(pool.query("update campaign_character_item_instance set character_id=$1 where id=$2",[foreignOwner,copy]),/same Campaign|remain in its Campaign/);
  await set(id,"away",{acknowledgeUnbind:true});
});

test("bound transfer and destructive lifecycles reject with no partial changes; explicit unbind restores ordinary transfer",async()=>{
  const id=(await create()).characterId, copy=await newCopy();await bind(id,copy);
  const before=await allRows();await assert.rejects(transfer(id,ownerB),/Unbind/);assert.deepEqual(await allRows(),before);
  await assert.rejects(transfer(id,null),/Unbind/);
  await assert.rejects(pool.query("update campaign_character set owner_character_id=$1 where id=$2",[ownerB,id]),/Unbind/);
  await assert.rejects(pool.query("update campaign_character_item_instance set retired_at=now(),retirement_reason='Sold' where id=$1",[copy]),/Unbind/);
  await assert.rejects(pool.query("delete from campaign_character_item_instance where id=$1",[copy]),/Unbind/);
  await assert.rejects(pool.query("delete from campaign_character where id=$1",[id]),/constraint/);
  await assert.rejects(pool.query("delete from campaign_creature_npc_profile where character_id=$1",[id]),/constraint/);
  await lifecycle.archiveLifecycleEntityForActor({entityKind:"creature-npc",entityId:id},actor);assert.equal((await saved(id)).vessel_instance_id,copy);
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor({entityKind:"creature-npc",entityId:id,confirmation:"DELETE"},actor));
  await lifecycle.restoreLifecycleEntityForActor({entityKind:"creature-npc",entityId:id},actor);
  await lifecycle.archiveLifecycleEntityForActor({entityKind:"item",entityId:vesselId},actor);assert.equal((await saved(id)).vessel_instance_id,copy);
  await lifecycle.restoreLifecycleEntityForActor({entityKind:"item",entityId:vesselId},actor);
  await set(id,"accompanying",{acknowledgeUnbind:true});await transfer(id,ownerB);
  assert.equal((await saved(id)).disposition,"accompanying");assert.equal((await root(id)).owner_character_id,ownerB);
  await transfer(id,null);assert.equal(await saved(id),undefined);
  assert.equal((await one("select command->>'operation' operation from companion_disposition_event where character_id=$1 order by revision desc limit 1",[id])).operation,"ownership-removed");
});

test("owner or Creature active encounter blocks configuration, including paused encounters",async()=>{
  const id=(await create()).characterId;
  const session=(await one("insert into campaign_session(campaign_id,title,sequence_number,status,started_at) values($1,'Disposition guard',90,'active',now()) returning id",[campaignId])).id;
  const scene=(await one("insert into campaign_session_scene(session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,'Guard',1,'active',now()) returning id",[session,campaignId])).id;
  const encounter=(await one("insert into campaign_session_encounter(scene_id,session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,$3,'Guard',1,'active',now()) returning id",[scene,session,campaignId])).id;
  for(const holder of [ownerA,id]){
    await pool.query("insert into campaign_session_encounter_participant(encounter_id,campaign_id,character_id,scene_id,session_id) values($1,$2,$3,$4,$5)",[encounter,campaignId,holder,scene,session]);
    const c={ownerCharacterId:ownerA,creatureCharacterId:id,disposition:"accompanying",awayNote:"",vesselInstanceId:null,expectedRevision:0,acknowledgeUnbind:false,requestKey:`guard-${++sequence}`};
    await assert.rejects(travel.changeCompanionDispositionForActor(c,player),/active encounters/);assert.equal((await view(id)).canChange,false);
    await pool.query("update campaign_session_encounter set frozen_at=now() where id=$1",[encounter]);
    await assert.rejects(travel.changeCompanionDispositionForActor(c,player),/paused/);
    await pool.query("update campaign_session_encounter set frozen_at=null where id=$1",[encounter]);
    await pool.query("delete from campaign_session_encounter_participant where encounter_id=$1",[encounter]);
  }
  await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1",[encounter]);await set(id);
});




test("ordinary grants create exact Vessel copies; removal and container destruction fail before changing state",async()=>{
  const version=async()=> (await one("select commerce_version from campaign_character_profile where character_id=$1",[ownerA])).commerce_version;
  const itemId=await model("Binding casket",true);
  await pool.query("insert into container_profiles(item_id) values($1)",[itemId]);
  await ownerInventory.adjustOwnerInventory({characterId:ownerA,itemId,quantity:2,operation:"grant",expectedCommerceVersion:await version()});
  const copies=await rows("select id from campaign_character_item_instance where character_id=$1 and item_id=$2 order by id",[ownerA,itemId]);assert.equal(copies.length,2);
  assert.equal((await rows("select * from campaign_character_item where item_id=$1",[itemId])).length,0);
  const id=(await create()).characterId;await bind(id,copies[0].id);
  const before=await allRows();
  await assert.rejects(ownerInventory.adjustOwnerInventory({characterId:ownerA,itemId,quantity:1,operation:"remove",instanceId:copies[0].id,state:"inactive",expectedCommerceVersion:await version()}),/Unbind/);
  assert.deepEqual(await allRows(),before);
  const destroy={characterId:ownerA,itemId,instanceId:copies[0].id,quantity:1,expectedCommerceVersion:await version(),requestKey:`destroy-${++sequence}`,operation:"destroy",reason:"Synthetic destruction test"};
  await assert.rejects(db.transaction(tx=>custody.handleInventoryInTransaction(tx,god,destroy)),/Unbind/);assert.deepEqual(await allRows(),before);
  await set(id,"away",{acknowledgeUnbind:true});
  await ownerInventory.adjustOwnerInventory({characterId:ownerA,itemId,quantity:1,operation:"remove",instanceId:copies[0].id,state:"inactive",expectedCommerceVersion:await version()});
  assert.ok((await one("select retired_at from campaign_character_item_instance where id=$1",[copies[0].id])).retired_at);
});

test("Evolution and historical Return preserve exact Creature, disposition, binding and audit history",async()=>{
  const id=(await create()).characterId, copy=await newCopy();await bind(id,copy);
  const targetDraft=creatureDraftFixture();targetDraft.core.canonicalName="Companion Mature Horse";targetDraft.attributes.forEach(row=>row.value=20);
  const target=await creatures.saveCreature(targetDraft);
  const pathId=(await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$2,'Mature') returning id",[source.id,target.id])).id;
  const before=await saved(id),history=await rows("select * from companion_disposition_event where character_id=$1",[id]);
  const preview=await evolutions.previewPersistentEvolution("creature",id,pathId,actor);
  await evolutions.executePersistentEvolution({kind:"creature",characterId:id,pathId,expectedVersion:preview.pathVersion,reviewToken:preview.reviewToken,idempotencyKey:randomUUID(),confirmedRequirementKeys:[],confirmHealthConsequences:true,confirmReplaceOverrides:true},actor);
  assert.equal((await one("select creature_id from campaign_creature_npc_profile where character_id=$1",[id])).creature_id,target.id);
  assert.deepEqual(await saved(id),before);
  const back=await evolutions.previewPersistentEvolutionReturn("creature",id,actor);
  await evolutions.executePersistentEvolutionReturn({kind:"creature",characterId:id,expectedEventId:back.returning.eventId,reviewToken:back.reviewToken,idempotencyKey:randomUUID(),confirmHealthConsequences:true,confirmReplaceOverrides:true},actor);
  assert.equal((await one("select creature_id from campaign_creature_npc_profile where character_id=$1",[id])).creature_id,source.id);
  assert.deepEqual(await saved(id),before);assert.deepEqual(await rows("select * from companion_disposition_event where character_id=$1",[id]),history);
});

test("explicit Campaign deletion cleans disposition, bindings and history as one graph",async()=>{
  const c=await makeCampaign("Companion cleanup"), owner=await character(c,"Cleanup owner");
  const id=(await create({campaignId:c,ownerCharacterId:owner})).characterId, copy=await newCopy(vesselId,owner);
  await travel.changeCompanionDispositionForActor({ownerCharacterId:owner,creatureCharacterId:id,disposition:"vessel-bound",awayNote:"",vesselInstanceId:copy,expectedRevision:0,acknowledgeUnbind:false,requestKey:`cleanup-${++sequence}`},god);
  await lifecycle.archiveLifecycleEntityForActor({entityKind:"campaign",entityId:c},actor);
  await lifecycle.permanentlyDeleteLifecycleEntityForActor({entityKind:"campaign",entityId:c},actor,"Companion cleanup");
  for(const table of ["owned_creature_disposition","companion_disposition_event","campaign_character"])assert.equal((await rows(`select * from ${table} where campaign_id=$1`,[c])).length,0);
});

test("Encounter writers cannot race management, and a failed history insert rolls back the binding",async()=>{
  const id=(await create()).characterId, copy=await newCopy(), c=await command(id,"vessel-bound",{vesselInstanceId:copy});
  const client=await pool.connect();
  try {
    await client.query("begin");await client.query("lock table campaign_session_encounter_participant in row exclusive mode");
    await assert.rejects(travel.changeCompanionDispositionForActor(c,player),/Encounter state is changing/);
    assert.equal(await saved(id),undefined);
  } finally {await client.query("rollback");client.release();}
  await pool.query("create function synthetic_reject_companion_event() returns trigger language plpgsql as $$ begin raise exception 'Synthetic audit failure'; end $$");
  await pool.query("create trigger synthetic_companion_failure before insert on companion_disposition_event for each row execute function synthetic_reject_companion_event()");
  const before=await allRows();
  try {await assert.rejects(travel.changeCompanionDispositionForActor(c,player));assert.deepEqual(await allRows(),before);}
  finally {await pool.query("drop trigger synthetic_companion_failure on companion_disposition_event");await pool.query("drop function synthetic_reject_companion_event()");}
  await travel.changeCompanionDispositionForActor(c,player);
  await assert.rejects(pool.query("update companion_disposition_event set revision=100 where character_id=$1",[id]),/immutable/);
});

test("Shop purchases produce separate Vessel copies; bound Item sale and Creature resale reject atomically",async()=>{
  const commerce=await import("../src/features/tabletop-operations/shop-commerce-service.ts"),visits=await import("../src/features/tabletop-operations/shop-visit-service.ts");
  await pool.query("update campaign_session_scene set status='completed',completed_at=now() where campaign_id=$1 and status='active'",[campaignId]);
  await pool.query("update campaign_session set status='completed',completed_at=now() where campaign_id=$1 and status='active'",[campaignId]);
  await pool.query("update campaign_character_profile set credits_remaining=1000 where character_id=$1",[ownerA]);
  const sessionId=(await one("insert into campaign_session(campaign_id,title,sequence_number,status,started_at) values($1,'Vessel market',91,'active',now()) returning id",[campaignId])).id;
  const sceneId=(await one("insert into campaign_session_scene(session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,'Market',1,'active',now()) returning id",[sessionId,campaignId])).id;
  await pool.query("insert into campaign_session_roster(session_id,campaign_id,character_id) values($1,$2,$3)",[sessionId,campaignId,ownerA]);
  await pool.query("insert into campaign_session_scene_member(scene_id,session_id,campaign_id,character_id) values($1,$2,$3,$4)",[sceneId,sessionId,campaignId,ownerA]);
  const shopId=(await one("insert into shop(campaign_id,name,category,storefront_state,balance_credits,sold_item_handling,character_purchase_mode) values($1,'Vessel shop','Travel','open',1000,'add-to-shop-stock','immediate') returning id",[campaignId])).id;
  await pool.query("insert into campaign_session_prepared_shop(session_id,campaign_id,shop_id) values($1,$2,$3)",[sessionId,campaignId,shopId]);
  await pool.query("insert into campaign_session_scene_shop(scene_id,session_id,campaign_id,shop_id,revealed) values($1,$2,$3,$4,true)",[sceneId,sessionId,campaignId,shopId]);
  const {visitId}=await db.transaction(tx=>visits.startOrAddShopVisitInTransaction(tx,{sceneId,shopId,placement:{kind:"independent"},characterIds:[ownerA],mode:"shopping",closedShopOverrideReason:""},actor));
  const itemId=await model("Shop Creature Vessel",true),listing=await model("Shop Creature listing");
  await items.saveItem({...await items.getItem(listing),creatureGrant:{creatureId:source.id}});
  const offering=(await one("insert into shop_offering(shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,limited_quantity) values($1,$2,$3,'inventory-transfer',true,false,10) returning *",[shopId,campaignId,itemId]));
  await pool.query("insert into shop_offering(shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,limited_quantity,sort_order) values($1,$2,$3,'inventory-transfer',true,false,10,1)",[shopId,campaignId,listing]);
  await db.transaction(tx=>commerce.submitPlayerPurchaseInTransaction(tx,{visitId,characterId:ownerA,submissionKey:`vessel-purchase-${++sequence}`,lines:[{offeringId:offering.id,quantity:2,expectedOfferingVersion:offering.version,quotedUnitPriceCredits:10,quotedFulfillmentKind:"inventory-transfer"}]},player));
  const copies=await rows("select id from campaign_character_item_instance where character_id=$1 and item_id=$2 order by id",[ownerA,itemId]);assert.equal(copies.length,2);assert.notEqual(copies[0].id,copies[1].id);
  const id=(await create()).characterId;await bind(id,copies[0].id);
  const sell=lines=>db.transaction(tx=>commerce.submitPlayerSaleInTransaction(tx,{visitId,characterId:ownerA,submissionKey:`vessel-sale-${++sequence}`,lines},player));
  const approve=requestId=>db.transaction(tx=>commerce.reviewShopRequestInTransaction(tx,{requestId,expectedTermsVersion:1,decision:"approve",reason:"Synthetic sale",submissionKey:`vessel-approve-${++sequence}`,revisedLines:[]},actor));
  const creatureSale=await sell([{itemId:listing,creatureCharacterId:id,quantity:1}]);
  const beforeCreature=await allRows();await assert.rejects(approve(creatureSale.requestId),/Unbind/);assert.deepEqual(await allRows(),beforeCreature);
  const itemSale=await sell([{itemId,itemInstanceId:copies[0].id,quantity:1}]);
  const beforeItem=await allRows();await assert.rejects(approve(itemSale.requestId),/Unbind/);assert.deepEqual(await allRows(),beforeItem);
  await set(id,"away",{acknowledgeUnbind:true});
  assert.equal((await approve(creatureSale.requestId)).status,"completed");
  assert.equal((await approve(itemSale.requestId)).status,"completed");
  assert.equal((await root(id)).owner_character_id,null);
  assert.ok((await one("select retired_at from campaign_character_item_instance where id=$1",[copies[0].id])).retired_at);
});

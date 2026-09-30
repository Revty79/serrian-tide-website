import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_COMPANION_MANAGEMENT_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_ownership_dev$/);
const actors = new AsyncLocalStorage();
const god = "audit-god", admin = "audit-admin", player = "audit-player", foreign = "audit-foreign", otherPlayer = "audit-player-two";
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
const { pool } = await import("../src/db/index.ts");
const rows = async (text, values = []) => (await pool.query(text, values)).rows;
const one = async (text, values = []) => (await rows(text, values))[0];
const npcs = await import("../src/app/heavens/npcs/actions.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const { creatureDraftFixture, creatureFormFixture } = await import("./creature-form-fixture.ts");
const actor = { userId: god, roles: ["god"] };
let campaignId, otherCampaignId, ownerA, ownerB, raceOwner, source;
let sequence = 0;
const create = (overrides = {}) => npcs.createNpc({ campaignId, origin: "creature", buildMode: "detailed", sourceId: source.id, name: `Horse ${++sequence}`, roleLabel: "Companion", notes: "Given at the north gate", ownerCharacterId: ownerA, ...overrides });
const transfer = (characterId, ownerCharacterId, override = {}) => npcs.setCreatureNpcOwner({ campaignId, characterId, ownerCharacterId, ...override });
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
  campaignId = await makeCampaign("Profile Campaign"); otherCampaignId = await makeCampaign("Other Profile Campaign");
  ownerA = await character(campaignId, "Owner A"); ownerB = await character(campaignId, "Owner B");
  raceOwner = await character(campaignId, "Race NPC Owner", true); await character(otherCampaignId, "Foreign Owner");
  const draft = creatureDraftFixture();
  draft.core.canonicalName = "Companion Horse";
  draft.forms = [creatureFormFixture()];
  source = await creatures.saveCreature(draft);
}
const items = await import("../src/app/heavens/items/actions.ts");
const travel = await import("../src/features/creatures/companion-disposition-service.ts");
const companions = await import("../src/features/creatures/owned-creature-service.ts");
const evolutions = await import("../src/features/evolutions/evolution-execution-service.ts");
let vesselId, vesselA;
const view = (id, who = player, owner = ownerA) => travel.readCompanionDispositionForActor(owner, id, who);
const saved = id => one("select * from owned_creature_disposition where character_id=$1", [id]);
const newCopy = async (itemId = vesselId, holder = ownerA) => (await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,unit_cost_credits) values($1,$2,0,10) returning id", [holder,itemId])).id;
async function model(name, vessel = false) {
  const id = (await one("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,credits,price_basis,weight,weight_unit,created_by_user_id) values($1,$2,'equipment','general','misc','Companions','Travel',10,'Each',1,'lb',$3) returning id", [`AUDIT-${++sequence}`,name,god])).id;
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
before(async () => { await seedBase(); vesselId = await model("Calling Stone", true); vesselA = await newCopy(); });

const profiles = await import("../src/features/creatures/companion-profile-service.ts");
const management = await import("../src/features/creatures/companion-management-read-service.ts");
const profileView = (id, who = god, owner = ownerA) => profiles.readCompanionProfileForActor(owner,id,who);
const profileRows = async id => ({ profile: await rows("select * from companion_profile where character_id=$1",[id]), roles: await rows("select * from companion_profile_role where character_id=$1 order by role",[id]), events:await rows("select * from companion_profile_event where character_id=$1 order by revision",[id]) });
const role = (value, patch={}) => ({role:value,otherLabel:value==="other"?"Messenger":"",maximumRiders:value==="mount"?1:null,mountNotes:"",...patch});
async function configureCommand(id, patch={}, owner=ownerA) {
  return {ownerCharacterId:owner,creatureCharacterId:id,operation:"configure",expectedRevision:(await profileView(id,god,owner)).revision,requestKey:`audit-${++sequence}`,
    roles:[role("companion")],controlModel:"owner-commands",combatPreference:"normally-stays-out",relationshipNotes:"",acknowledgeRoleDataClear:false,confirmOwnerReview:false,...patch};
}
const configure = async (id, patch={}, who=god, owner=ownerA) => profiles.changeCompanionProfileForActor(await configureCommand(id,patch,owner),who);
async function notes(id, text, who=player, owner=ownerA) {
  return profiles.changeCompanionProfileForActor({ownerCharacterId:owner,creatureCharacterId:id,operation:"notes",expectedRevision:(await profileView(id,who,owner)).revision,requestKey:`notes-${++sequence}`,relationshipNotes:text},who);
}


const evidence=[];
const managementTables=new Set(["owned_creature_disposition","companion_disposition_event","companion_profile","companion_profile_role","companion_profile_event"]);
async function prove(label, operation, characterEdits = new Map()) {
  const before=await allRows();await operation();const after=await allRows();
  assert.deepEqual(Object.keys(after),Object.keys(before));
  const changed=[];
  for(const table of Object.keys(before)) {
    if(JSON.stringify(before[table])===JSON.stringify(after[table]))continue;
    changed.push(table);
    if(managementTables.has(table))continue;
    if(table==="campaign_character"&&characterEdits.size) {
      assert.equal(after[table].length,before[table].length);
      for(const {body} of after[table]) {
        const prior=before[table].find(row=>row.body.id===body.id).body;
        const allowed=characterEdits.get(body.id)??[];
        assert.deepEqual(Object.fromEntries(Object.entries(body).filter(([key])=>!allowed.includes(key))),Object.fromEntries(Object.entries(prior).filter(([key])=>!allowed.includes(key))),`Character ${body.id} runtime unchanged`);
      }
    } else assert.deepEqual(after[table],before[table],`${label}: forbidden change in ${table}`);
  }
  evidence.push({label,tablesCompared:Object.keys(before).length,changed,characterColumns:[...characterEdits].map(([id,columns])=>({id,columns}))});
}
const travelRows=async id=>({current:await rows('select * from owned_creature_disposition where character_id=$1',[id]),events:await rows('select * from companion_disposition_event where character_id=$1 order by revision',[id])});
const readUnowned=id=>management.readUnownedCompanionForActor(id,god);
let trio=[],copies=[];

test("all-table proof: three same-name individuals from one master retain independent management and never execute runtime",async()=>{
  for(let i=0;i<3;i++){trio.push((await create({name:"Twin"})).characterId);copies.push(await newCopy());}
  const sessionId=(await one("insert into campaign_session(campaign_id,title,sequence_number,status,started_at) values($1,'Untouched runtime sentinel',391,'active',now()) returning id",[campaignId])).id;
  const sceneId=(await one("insert into campaign_session_scene(session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,'Untouched scene',1,'active',now()) returning id",[sessionId,campaignId])).id;
  await pool.query("insert into campaign_session_encounter(scene_id,session_id,campaign_id,title,sequence_number,status,started_at,completed_at) values($1,$2,$3,'Untouched completed encounter',1,'completed',now(),now())",[sceneId,sessionId,campaignId]);
  await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,7) on conflict(character_id) do update set total_damage=7",[trio[0]]);
  await prove("Pass 1/2 configuration, notes, reads, exact copies, retries and denial",async()=>{
    await set(trio[0]);await configure(trio[0],{roles:[role("companion"),role("mount",{maximumRiders:2,mountNotes:"Twin saddle"})]});
    const first=await profileRows(trio[0]),firstTravel=await travelRows(trio[0]);
    await bind(trio[1],copies[1]);await configure(trio[1],{roles:[role("guard-combat")],controlModel:"player-directed",combatPreference:"normally-joins"});
    await set(trio[2],"away",{awayNote:"At the farm"});await configure(trio[2],{roles:[role("familiar"),role("scout-utility")],controlModel:"god-directed",combatPreference:"decide-at-start"});
    await notes(trio[2],"Independent relationship");
    assert.deepEqual(await profileRows(trio[0]),first);assert.deepEqual(await travelRows(trio[0]),firstTravel);
    const retry=await configureCommand(trio[2],{roles:[role("familiar"),role("scout-utility")],controlModel:"god-directed",combatPreference:"decide-at-start"});
    await profiles.changeCompanionProfileForActor(retry,god);await profiles.changeCompanionProfileForActor(retry,god);
    for(const who of [player,admin,foreign,otherPlayer])await assert.rejects(profiles.changeCompanionProfileForActor(await configureCommand(trio[0]),who));
    for(const who of [admin,foreign,otherPlayer])await assert.rejects(set(trio[0],"away",{},who));
    await assert.rejects(transfer(trio[1],ownerB),/Unbind/);
    const roster=await companions.readOwnedCreaturesForActor(ownerA,player);assert.equal(roster.individuals.filter(row=>row.name==="Twin").length,3);
    assert.equal(new Set(roster.individuals.filter(row=>row.name==="Twin").map(row=>row.characterId)).size,3);
    assert.equal((await management.readVesselCompanionForActor(ownerA,copies[1],player)).creatureIdentity,`Individual #${trio[1]}`);
    assert.equal((await management.readVesselCompanionForActor(ownerA,copies[0],player)).creatureName,null);
    await bind(trio[0],copies[0]);const a=await management.readVesselCompanionForActor(ownerA,copies[0],player),b=await management.readVesselCompanionForActor(ownerA,copies[1],player);
    assert.equal(a.creatureName,b.creatureName);assert.notEqual(a.creatureIdentity,b.creatureIdentity);assert.notEqual(a.label,b.label);
    await set(trio[0],"accompanying",{acknowledgeUnbind:true});
    const legacy=(await profileView(trio[0])).history;assert.match(legacy.at(-1).after.join(" "),/Owner Commands.*Normally Stays Out.*Twin saddle/);
  });
});

test("unowned retained inspector authorizes only Campaign G.O.D.; history, notes and role fields survive ownership review",async()=>{
  const id=trio[0];
  await prove("Pass 3 ownership removal and inspection",async()=>{
    await transfer(id,null);const retained=await readUnowned(id);
    assert.equal(retained.profile.requiresOwnerReview,true);assert.equal(retained.profile.roles.find(row=>row.role==="mount").maximumRiders,2);
    assert.match(retained.profileHistory[0].summary,/unassigned/);assert.match(retained.profileHistory[0].actor,/not recorded/);
    assert.match(retained.profileHistory[0].after.join(" "),/Mount: 2.*Twin saddle.*Owner review: Required/);
    assert.match(retained.travelHistory[0].actor,/not recorded/);assert.equal(retained.travelHistory[0].after,"Travel disposition not set");
    assert.deepEqual(Object.keys(retained).sort(),["archived","identity","name","profile","profileHistory","travelHistory"]);
    for(const who of [player,otherPlayer,admin,foreign])await assert.rejects(management.readUnownedCompanionForActor(id,who),/Campaign-owning/);
    await assert.rejects(profileView(id));await assert.rejects(notes(id,"No fake owner"));
    await assert.rejects(management.readUnownedCompanionForActor(ownerA,god));await assert.rejects(management.readUnownedCompanionForActor(trio[1],god));
  },new Map([[id,["owner_character_id","updated_at"]]]));
  await prove("Reassign Race NPC, explicit review, Mount/Familiar and exact Vessel",async()=>{
    await transfer(id,raceOwner);await assert.rejects(readUnowned(id),/owner now/);
    await assert.rejects(configure(id,{},god,raceOwner),/Confirm/);
    await configure(id,{roles:[role("mount",{maximumRiders:2}),role("familiar")],confirmOwnerReview:true},god,raceOwner);
    assert.equal((await profileView(id,god,raceOwner)).requiresOwnerReview,false);
    for(const who of [player,otherPlayer])await assert.rejects(profileView(id,who,raceOwner));
  },new Map([[id,["owner_character_id","updated_at"]]]));
  const copy=await newCopy(vesselId,raceOwner);
  await prove("Race NPC travel/binding and current owner permissions",async()=>{
    const cmd=await vesselCommand(id,copy,god,raceOwner);
    await travel.changeCompanionDispositionForActor(cmd,god);assert.equal((await view(id,god,raceOwner)).vessel.instanceId,copy);
    await assert.rejects(travel.changeCompanionDispositionForActor({...cmd,requestKey:"player-race-attempt"},player));
    await assert.rejects(notes(id,"Player cannot edit Race NPC companion",player,raceOwner));
  });
});

test("custody, containment and archived definition retain binding and private-safe reverse identity",async()=>{
  const id=trio[1],copy=copies[1],binding=await travelRows(id),profile=await profileRows(id);
  const box=await model("Audit box"),container=await newCopy(box);
  await pool.query("insert into container_profiles(item_id,max_weight_lb,volume_capacity_l,closure_mode) values($1,100,100,'open-close')",[box]);
  await pool.query("insert into inventory_instance_location(instance_id,character_id,item_id,container_instance_id,container_item_id) values($1,$2,$3,$4,$5)",[copy,ownerA,vesselId,container,box]);
  assert.match((await view(id)).vessel.custody,/inside a container.*inaccessible/);
  await pool.query("delete from inventory_instance_location where instance_id=$1",[copy]);
  for(const status of ["dropped","lost","stolen"]){
    await pool.query("insert into inventory_instance_custody(instance_id,character_id,item_id,status,context_label,note,reason,actor_user_id) values($1,$2,$3,$4,'Secret place','Secret custody note','Fixture',$5) on conflict(instance_id) do update set status=excluded.status",[copy,ownerA,vesselId,status,god]);
    assert.match((await view(id)).vessel.custody,new RegExp(status));
    const lookup=await management.readVesselCompanionForActor(ownerA,copy,player);assert.deepEqual(Object.keys(lookup).sort(),["canBind","creatureIdentity","creatureName","label"]);assert.equal(JSON.stringify(lookup).includes("Secret"),false);
  }
  await pool.query("delete from inventory_instance_custody where instance_id=$1",[copy]);
  await pool.query("update campaign_character_item_instance set character_id=$1 where id=$2",[ownerB,copy]);
  assert.match((await view(id)).vessel.custody,/Held elsewhere/);await assert.rejects(management.readVesselCompanionForActor(ownerA,copy,player));
  assert.equal((await management.readVesselCompanionForActor(ownerB,copy,player)).creatureIdentity,`Individual #${id}`);
  await lifecycle.archiveLifecycleEntityForActor({entityKind:"item",entityId:vesselId},actor);assert.match((await view(id)).vessel.custody,/definition archived/);
  assert.equal((await management.readVesselCompanionForActor(ownerB,copy,player)).creatureName,"Twin");
  await lifecycle.restoreLifecycleEntityForActor({entityKind:"item",entityId:vesselId},actor);
  assert.deepEqual(await travelRows(id),binding);assert.deepEqual(await profileRows(id),profile);
});

test("unowned archived Creature remains inspectable; ownership lifecycle preserves both streams",async()=>{
  const id=(await create()).characterId;await configure(id,{roles:[role("mount"),role("familiar")]});await set(id,"away",{awayNote:"Retired stable"});await transfer(id,null);
  const before=await readUnowned(id),p=await profileRows(id),t=await travelRows(id);
  for(const target of [{entityKind:"creature-npc",entityId:id},{entityKind:"campaign",entityId:campaignId}]) {
    await lifecycle.archiveLifecycleEntityForActor(target,actor);assert.deepEqual((await readUnowned(id)).profile,before.profile);
    await assert.rejects(transfer(id,ownerA));await lifecycle.restoreLifecycleEntityForActor(target,actor);
  }
  assert.deepEqual(await profileRows(id),p);assert.deepEqual(await travelRows(id),t);
});

test("Evolution and Return preserve ownership, review flag and both full management history streams",async()=>{
  const id=(await create()).characterId;await configure(id,{roles:[role("mount",{maximumRiders:3,mountNotes:"Three seats"}),role("familiar")],relationshipNotes:"Unchanged identity"});
  await transfer(id,ownerB);await transfer(id,ownerA);await bind(id,await newCopy());
  const targetDraft=creatureDraftFixture();targetDraft.core.canonicalName="Audit mature horse";const target=await creatures.saveCreature(targetDraft);
  const pathId=(await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$2,'Audit grow') returning id",[source.id,target.id])).id;
  const p=await profileRows(id),t=await travelRows(id),owner=(await one("select owner_character_id from campaign_character where id=$1",[id])).owner_character_id;
  const preview=await evolutions.previewPersistentEvolution("creature",id,pathId,actor);
  await evolutions.executePersistentEvolution({kind:"creature",characterId:id,pathId,expectedVersion:preview.pathVersion,reviewToken:preview.reviewToken,idempotencyKey:randomUUID(),confirmedRequirementKeys:[],confirmHealthConsequences:true,confirmReplaceOverrides:true},actor);
  assert.deepEqual(await profileRows(id),p);assert.deepEqual(await travelRows(id),t);
  const back=await evolutions.previewPersistentEvolutionReturn("creature",id,actor);
  await evolutions.executePersistentEvolutionReturn({kind:"creature",characterId:id,expectedEventId:back.returning.eventId,reviewToken:back.reviewToken,idempotencyKey:randomUUID(),confirmHealthConsequences:true,confirmReplaceOverrides:true},actor);
  assert.deepEqual(await profileRows(id),p);assert.deepEqual(await travelRows(id),t);assert.equal((await one("select owner_character_id from campaign_character where id=$1",[id])).owner_character_id,owner);
});

test("separate histories deliberately retain latest 30 with full immutable records underneath",async()=>{
  const id=(await create()).characterId;
  await prove("31 notes and travel changes with bounded read histories",async()=>{
    for(let i=0;i<31;i++){await notes(id,`Note ${i}`);await set(id,i%2?"accompanying":"away",{awayNote:i%2?"":`Stop ${i}`});}
    assert.equal((await profileView(id)).history.length,30);assert.equal((await profileView(id)).history[0].revision,31);
    assert.equal((await management.readCompanionTravelHistoryForActor(ownerA,id,player)).length,30);
    assert.equal((await profileRows(id)).events.length,31);assert.equal((await travelRows(id)).events.length,31);
  });
});

after(async()=>{
  await mkdir("artifacts/guidance/companion-management",{recursive:true});
  await writeFile("artifacts/guidance/companion-management/no-runtime-proof.json",JSON.stringify({method:"Compare every row in every public table; only five companion tables and explicitly listed ownership columns may differ. Lifecycle, custody and Evolution are tested separately because those existing operations intentionally change their own state.",tables:(await rows("select tablename from pg_tables where schemaname='public' order by tablename")).map(row=>row.tablename),evidence},null,2));
  await pool.end();
});

async function vesselCommand(id, copy, who=player, owner=ownerA) {
  const option=(await travel.readVesselBindingOptionsForActor(owner,copy,who)).find(row=>row.characterId===id);
  assert.ok(option,`Individual #${id} must be eligible for exact copy #${copy}`);
  assert.match(option.label,new RegExp(`Individual #${id}$`));
  return {ownerCharacterId:owner,creatureCharacterId:id,expectedRevision:option.revision,requestKey:`vessel-side-${++sequence}`,disposition:"vessel-bound",vesselInstanceId:copy,awayNote:"",acknowledgeUnbind:false};
}

test("Vessel-side legacy, Accompanying and Away transitions use identical state, one history, idempotency and no runtime writes",async()=>{
  for(const initial of [null,"accompanying","away"]) {
    const id=(await create({name:"Matching name"})).characterId,copy=await newCopy();
    if(initial)await set(id,initial,{awayNote:initial==="away"?"Away before binding":""});
    const cmd=await vesselCommand(id,copy),before=await travelRows(id);
    await prove(`Vessel-side ${initial??"Not Yet Set"} binding and identical retry`,async()=>{
      assert.equal((await management.readVesselCompanionForActor(ownerA,copy,player)).canBind,true);
      await travel.changeCompanionDispositionForActor(cmd,player);await travel.changeCompanionDispositionForActor(cmd,player);
      const current=await saved(id);assert.equal(current.disposition,"vessel-bound");assert.equal(current.vessel_instance_id,copy);assert.equal(current.vessel_item_id,vesselId);assert.equal(current.away_note,"");
      const history=await travelRows(id);assert.equal(history.events.length,before.events.length+1);assert.equal(history.events.at(-1).actor_user_id,player);
      assert.equal(history.events.at(-1).before?.disposition??null,initial);
      const lookup=await management.readVesselCompanionForActor(ownerA,copy,player);assert.equal(lookup.creatureIdentity,`Individual #${id}`);assert.equal(lookup.canBind,false);
      assert.equal((await travel.readVesselBindingOptionsForActor(ownerA,copy,player)).length,0);
    });
    const other=(await create({name:"Matching name"})).characterId,otherCopy=await newCopy();
    if(initial)await set(other,initial,{awayNote:initial==="away"?"Away before binding":""});
    await bind(other,otherCopy);
    const a=await saved(id),b=await saved(other);
    for(const key of ["disposition","away_note","revision","vessel_item_id","updated_by_user_id"])assert.deepEqual(a[key],b[key],`same authoritative ${key}`);
    const spare=await newCopy();assert.equal((await travel.readVesselBindingOptionsForActor(ownerA,spare,player)).some(row=>row.characterId===id),false);
    await assert.rejects(travel.changeCompanionDispositionForActor({...cmd,requestKey:`illegal-rebind-${++sequence}`,expectedRevision:a.revision,vesselInstanceId:spare},player),/Confirm.*unbind/);
    await assert.rejects(travel.changeCompanionDispositionForActor({...cmd,requestKey:`occupied-${++sequence}`,creatureCharacterId:other,expectedRevision:b.revision,acknowledgeUnbind:true},player),/already bound/);
  }
});

test("Vessel-side authorization, duplicate choices, stale/concurrent commands, and rollback reuse the shared command",async()=>{
  const ids=[(await create({name:"Same name"})).characterId,(await create({name:"Same name"})).characterId],copy=await newCopy();
  const options=await travel.readVesselBindingOptionsForActor(ownerA,copy,player);
  const labels=options.filter(row=>ids.includes(row.characterId)).map(row=>row.label);assert.equal(labels.length,2);assert.notEqual(labels[0],labels[1]);
  const cmds=await Promise.all(ids.map(id=>vesselCommand(id,copy)));
  await prove("Vessel authorization and concurrent exact-copy commands",async()=>{
    for(const who of [admin,foreign,otherPlayer]){
      await assert.rejects(travel.readVesselBindingOptionsForActor(ownerA,copy,who));
      await assert.rejects(travel.changeCompanionDispositionForActor(cmds[0],who));
    }
    const results=await Promise.allSettled(cmds.map(cmd=>travel.changeCompanionDispositionForActor(cmd,player)));
    assert.equal(results.filter(row=>row.status==="fulfilled").length,1);assert.equal(results.filter(row=>row.status==="rejected").length,1);
  });
  const id=(await create()).characterId,copy2=await newCopy(),old=await vesselCommand(id,copy2);
  await prove("Stale Vessel selection cannot replace a newer disposition",async()=>{
    await set(id,"away",{awayNote:"Changed elsewhere"});await assert.rejects(travel.changeCompanionDispositionForActor(old,player),/changed.*Refresh/);
  });
  const godCmd=await vesselCommand(id,copy2,god);
  await prove("Campaign-owning G.O.D. binds the same exact copy",()=>travel.changeCompanionDispositionForActor(godCmd,god));
  const rollback=(await create()).characterId,empty=await newCopy(),rollbackCmd=await vesselCommand(rollback,empty);
  await pool.query("create function reject_binding_audit_event() returns trigger language plpgsql as $$ begin raise exception 'Synthetic binding rollback'; end $$");
  await pool.query("create trigger reject_binding_audit_event before insert on companion_disposition_event for each row execute function reject_binding_audit_event()");
  try{const before=await allRows();await assert.rejects(travel.changeCompanionDispositionForActor(rollbackCmd,player),error=>/Synthetic/.test(String(error.cause)));assert.deepEqual(await allRows(),before);}
  finally{await pool.query("drop trigger reject_binding_audit_event on companion_disposition_event");await pool.query("drop function reject_binding_audit_event()");}
  const racing=(await create()).characterId,first=await newCopy(),second=await newCopy(),raceCmds=await Promise.all([first,second].map(id=>vesselCommand(racing,id)));
  await prove("Concurrent Vessel choices for one exact Creature have one winner",async()=>{
    const result=await Promise.allSettled(raceCmds.map(cmd=>travel.changeCompanionDispositionForActor(cmd,player)));assert.equal(result.filter(row=>row.status==="fulfilled").length,1);
    assert.equal((await travelRows(racing)).events.length,1);
  });
});

test("Vessel-side copy eligibility and active-encounter guards have no Item-side bypass",async()=>{
  const id=(await create()).characterId,copy=await newCopy(),cmd=await vesselCommand(id,copy);
  async function blocked(){assert.equal((await travel.readVesselBindingOptionsForActor(ownerA,copy,player)).some(row=>row.characterId===id),false);await assert.rejects(travel.changeCompanionDispositionForActor({...cmd,requestKey:`blocked-${++sequence}`},player));}
  await pool.query("update campaign_character_item_instance set retired_at=now(),retirement_reason='Audit' where id=$1",[copy]);await blocked();
  await pool.query("update campaign_character_item_instance set retired_at=null,retirement_reason='' where id=$1",[copy]);
  await pool.query("update creature_vessel_profile set enabled=false where item_id=$1 and not exists(select 1 from owned_creature_disposition where vessel_item_id=$1)",[vesselId]);
  // This shared definition has other existing bonds, so capability disable is covered with a separate empty definition.
  const disabledModel=await model("Disabled Vessel",true),disabledCopy=await newCopy(disabledModel);
  await pool.query("update creature_vessel_profile set enabled=false where item_id=$1",[disabledModel]);assert.equal((await travel.readVesselBindingOptionsForActor(ownerA,disabledCopy,player)).length,0);
  await assert.rejects(travel.changeCompanionDispositionForActor({...cmd,vesselInstanceId:disabledCopy},player));
  await lifecycle.archiveLifecycleEntityForActor({entityKind:"item",entityId:vesselId},actor);await blocked();await lifecycle.restoreLifecycleEntityForActor({entityKind:"item",entityId:vesselId},actor);
  const box=await model("Closed audit case"),container=await newCopy(box);await pool.query("insert into container_profiles(item_id,max_weight_lb,volume_capacity_l,closure_mode) values($1,100,100,'open-close')",[box]);
  await pool.query("insert into inventory_instance_location(instance_id,character_id,item_id,container_instance_id,container_item_id) values($1,$2,$3,$4,$5)",[copy,ownerA,vesselId,container,box]);await blocked();await pool.query("delete from inventory_instance_location where instance_id=$1",[copy]);
  for(const status of ["lost","stolen","dropped"]){await pool.query("insert into inventory_instance_custody(instance_id,character_id,item_id,status,reason,actor_user_id) values($1,$2,$3,$4,'Audit',$5) on conflict(instance_id) do update set status=excluded.status",[copy,ownerA,vesselId,status,god]);await blocked();}
  await pool.query("delete from inventory_instance_custody where instance_id=$1",[copy]);
  await pool.query("update campaign_character_item_instance set character_id=$1 where id=$2",[ownerB,copy]);await blocked();await pool.query("update campaign_character_item_instance set character_id=$1 where id=$2",[ownerA,copy]);
  const s=(await one("select id from campaign_session where campaign_id=$1 and status='active'",[campaignId])).id;
  const scene=(await one("select id from campaign_session_scene where session_id=$1 and status='active'",[s])).id;
  const enc=(await one("insert into campaign_session_encounter(scene_id,session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,$3,'Guard',2,'active',now()) returning id",[scene,s,campaignId])).id;
  for(const holder of [ownerA,id]){
    await pool.query("insert into campaign_session_encounter_participant(encounter_id,campaign_id,character_id,scene_id,session_id) values($1,$2,$3,$4,$5)",[enc,campaignId,holder,scene,s]);
    await prove("Active encounter blocks Vessel-side binding without runtime writes",blocked);
    await pool.query("delete from campaign_session_encounter_participant where encounter_id=$1",[enc]);
  }
  await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1",[enc]);
});

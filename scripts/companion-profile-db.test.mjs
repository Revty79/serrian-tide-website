import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_COMPANION_PROFILE_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_ownership_dev$/);
const actors = new AsyncLocalStorage();
const god = "profile-god", admin = "profile-admin", player = "profile-player", foreign = "profile-foreign", otherPlayer = "profile-player-two";
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
let campaignId, otherCampaignId, ownerA, ownerB, raceOwner, foreignOwner, source;
let sequence = 0;
const create = (overrides = {}) => npcs.createNpc({ campaignId, origin: "creature", buildMode: "detailed", sourceId: source.id, name: `Horse ${++sequence}`, roleLabel: "Companion", notes: "Given at the north gate", ownerCharacterId: ownerA, ...overrides });
const transfer = (characterId, ownerCharacterId, override = {}) => npcs.setCreatureNpcOwner({ campaignId, characterId, ownerCharacterId, ...override });
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
  campaignId = await makeCampaign("Profile Campaign"); otherCampaignId = await makeCampaign("Other Profile Campaign");
  ownerA = await character(campaignId, "Owner A"); ownerB = await character(campaignId, "Owner B");
  raceOwner = await character(campaignId, "Race NPC Owner", true); foreignOwner = await character(otherCampaignId, "Foreign Owner");
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
  const id = (await one("insert into items(canonical_id,name,catalog_scope,equipment_group,record_type,family,category,credits,price_basis,weight,weight_unit,created_by_user_id) values($1,$2,'equipment','general','misc','Companions','Travel',10,'Each',1,'lb',$3) returning id", [`PROFILE-${++sequence}`,name,god])).id;
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
const vocabulary = await import("../src/features/creatures/companion-profile.ts");
const profileView = (id, who = god, owner = ownerA) => profiles.readCompanionProfileForActor(owner,id,who);
const profileRows = async id => ({ profile: await rows("select * from companion_profile where character_id=$1",[id]), roles: await rows("select * from companion_profile_role where character_id=$1 order by role",[id]), events:await rows("select * from companion_profile_event where character_id=$1 order by revision",[id]) });
const role = (value, patch={}) => ({role:value,otherLabel:value==="other"?"Messenger":"",maximumRiders:value==="mount"?1:null,mountNotes:"",...patch});
async function configureCommand(id, patch={}, owner=ownerA) {
  return {ownerCharacterId:owner,creatureCharacterId:id,operation:"configure",expectedRevision:(await profileView(id,god,owner)).revision,requestKey:`profile-${++sequence}`,
    roles:[role("companion")],controlModel:"owner-commands",combatPreference:"normally-stays-out",relationshipNotes:"",acknowledgeRoleDataClear:false,confirmOwnerReview:false,...patch};
}
const configure = async (id, patch={}, who=god, owner=ownerA) => profiles.changeCompanionProfileForActor(await configureCommand(id,patch,owner),who);
async function notes(id, text, who=player, owner=ownerA) {
  return profiles.changeCompanionProfileForActor({ownerCharacterId:owner,creatureCharacterId:id,operation:"notes",expectedRevision:(await profileView(id,who,owner)).revision,requestKey:`notes-${++sequence}`,relationshipNotes:text},who);
}

test("legacy and Player notes never infer a behavioral profile or travel disposition",async()=>{
  const id=(await create()).characterId;
  const before=await allRows();const read=await profileView(id,player);
  assert.equal(read.configured,false);assert.equal(read.revision,0);assert.deepEqual(read.roles,[]);assert.equal(read.canConfigure,false);assert.equal(read.canEditNotes,true);
  assert.deepEqual(await allRows(),before);
  await notes(id,"  Responds to whistle commands.  ");
  const after=await profileView(id);assert.equal(after.configured,false);assert.equal(after.controlModel,null);assert.equal(after.combatPreference,null);assert.equal(after.relationshipNotes,"Responds to whistle commands.");
  assert.deepEqual(after.roles,[]);assert.equal((await view(id)).disposition,null);
  assert.equal((await companions.readOwnedCreaturesForActor(ownerA,player)).individuals.find(row=>row.characterId===id).companionProfile.relationshipNotes,after.relationshipNotes);
});

test("every role, multi-role combination, Control Model and Combat Preference round-trip with no mechanics or runtime writes",async()=>{
  const id=(await create()).characterId;const before=await allRows(), individual=await state(id), owner=await state(ownerA);
  for(const controlModel of Object.keys(vocabulary.CONTROL_LABELS)) for(const combatPreference of Object.keys(vocabulary.COMBAT_PREFERENCE_LABELS)) {
    await configure(id,{roles:vocabulary.COMPANION_ROLES.map(value=>role(value,value==="mount"?{maximumRiders:3,mountNotes:"Two saddles and a guide."}:{})),controlModel,combatPreference,relationshipNotes:"Long-time family companion."});
    const loaded=await profileView(id,player);assert.equal(loaded.roles.length,7);assert.equal(loaded.controlModel,controlModel);assert.equal(loaded.combatPreference,combatPreference);assert.equal(loaded.roles.find(row=>row.role==="mount").maximumRiders,3);
  }
  const after=await allRows();for(const table of Object.keys(before)) if(!["companion_profile","companion_profile_role","companion_profile_event"].includes(table)) assert.deepEqual(after[table],before[table],`${table} unchanged by profiles`);
  assert.deepEqual(await state(id),individual);assert.deepEqual(await state(ownerA),owner);
  assert.equal((await profileRows(id)).events.length,9);
  const second=(await create()).characterId;await configure(second,{controlModel:"god-directed"});assert.equal((await profileView(id)).roles.length,7);assert.equal((await profileView(second)).roles.length,1);
});

test("Player notes are narrow; Player, Admin alone, foreign G.O.D. and foreign owner cannot configure",async()=>{
  const id=(await create()).characterId;await configure(id,{roles:[role("mount"),role("familiar")],controlModel:"player-directed"});
  const original=await profileView(id);await notes(id,"Familiar designation grants no magic.");const changed=await profileView(id);assert.deepEqual(changed.roles,original.roles);assert.equal(changed.controlModel,original.controlModel);assert.equal(changed.combatPreference,original.combatPreference);
  const command=await configureCommand(id);
  for(const who of [player,admin,foreign,otherPlayer]) await assert.rejects(profiles.changeCompanionProfileForActor(command,who));
  await pool.query("insert into user_role(user_id,role) values($1,'admin')",[player]);await assert.rejects(profiles.changeCompanionProfileForActor(command,player),/Campaign-owning/);await pool.query("delete from user_role where user_id=$1 and role='admin'",[player]);
  await assert.rejects(profiles.changeCompanionProfileForActor({...command,operation:"notes"},player),/notes command/);
  await assert.rejects(notes(id,"Admin edit",admin));
  await assert.rejects(profileView(id,otherPlayer));await assert.rejects(profileView(id,foreign));await assert.rejects(profileView(id,player,ownerB));await assert.rejects(profileView(id,player,foreignOwner));
  assert.equal((await profileView(id,admin)).canConfigure,false);assert.equal((await profileView(id,admin)).canEditNotes,false);
  const race=(await create({ownerCharacterId:raceOwner})).characterId;await configure(race,{},god,raceOwner);assert.equal((await profileView(race,god,raceOwner)).configured,true);
});

test("invalid roles, Other labels, modes, Mount values and wrong persistent identities reject atomically",async()=>{
  const id=(await create()).characterId;const command=await configureCommand(id),before=await allRows();
  for(const patch of [{roles:[role("pet")]},{roles:[role("mount"),role("mount")]},{roles:[role("other",{otherLabel:" ... "})]},{roles:[role("other",{otherLabel:"x".repeat(121)})]},
    {controlModel:"automatic"},{combatPreference:"forced"},{roles:[role("mount",{maximumRiders:0})]},{roles:[role("mount",{maximumRiders:1.5})]},
    {roles:[role("companion",{maximumRiders:2})]},{roles:[role("companion",{mountNotes:"Saddle"})]},{relationshipNotes:"x".repeat(1001)}]) await assert.rejects(profiles.changeCompanionProfileForActor({...command,...patch},god));
  for(const invalid of [ownerA,raceOwner,-1,foreignOwner]) await assert.rejects(profiles.changeCompanionProfileForActor({...command,creatureCharacterId:invalid},god));
  assert.deepEqual(await allRows(),before);
  await configure(id);await assert.rejects(pool.query("insert into companion_profile_role(character_id,role,maximum_riders) values($1,'mount',0)",[id]),/constraint/);
  await assert.rejects(pool.query("insert into companion_profile_role(character_id,role) values($1,'other')",[id]),/constraint/);
  await assert.rejects(pool.query("insert into companion_profile_role(character_id,role) values($1,'companion')",[id]),/unique/);
  await assert.rejects(pool.query("update companion_profile set control_model='unknown' where character_id=$1",[id]),/constraint/);
  await assert.rejects(pool.query("update companion_profile set control_model=null,combat_preference=null where character_id=$1",[id]),/Configure/);
  await assert.rejects(pool.query("insert into companion_profile(character_id,campaign_id,revision) values($1,$2,1)",[ownerA,campaignId]),/persistent Creature|constraint/);
  await assert.rejects(pool.query("update companion_profile set campaign_id=$1 where character_id=$2",[otherCampaignId,id]),/Campaign|constraint/);
});

test("removing Mount or Other requires explicit confirmation and preserves failed-save data",async()=>{
  const id=(await create()).characterId;await configure(id,{roles:[role("mount",{maximumRiders:2,mountNotes:"Long saddle"}),role("other",{otherLabel:"Hunting Partner"})]});
  const before=await profileRows(id);await assert.rejects(configure(id,{roles:[role("companion")]}),/Confirm clearing/);assert.deepEqual(await profileRows(id),before);
  await configure(id,{roles:[role("companion")],acknowledgeRoleDataClear:true});assert.deepEqual((await profileView(id)).roles,[role("companion")]);
  const event=(await profileRows(id)).events.at(-1);assert.equal(event.before.roles.find(row=>row.role==="mount").mountNotes,"Long saddle");
});

test("travel, Away and exact Vessel bind/unbind preserve Profile roles, notes, revisions and history",async()=>{
  const id=(await create()).characterId;await configure(id,{roles:[role("familiar"),role("scout-utility")],controlModel:"god-directed",combatPreference:"decide-at-start"});
  const before=await profileRows(id);await set(id);await set(id,"away",{awayNote:"At home"});await bind(id);await set(id,"accompanying",{acknowledgeUnbind:true});
  assert.deepEqual(await profileRows(id),before);
  const travelBefore=await saved(id),historyBefore=await rows("select * from companion_disposition_event where character_id=$1 order by revision",[id]);await notes(id,"Acts independently.");
  assert.deepEqual(await saved(id),travelBefore);assert.deepEqual(await rows("select * from companion_disposition_event where character_id=$1 order by revision",[id]),historyBefore);
});

test("ownership reassignment/removal retains data, increments revision and requires deliberate G.O.D. review",async()=>{
  const id=(await create()).characterId;await configure(id,{roles:[role("mount",{maximumRiders:2}),role("familiar")],relationshipNotes:"Old family bond"});
  const before=await profileView(id),stale=await configureCommand(id);await transfer(id,ownerB);
  const moved=await profileView(id,god,ownerB);assert.equal(moved.requiresOwnerReview,true);assert.deepEqual(moved.roles,before.roles);assert.equal(moved.relationshipNotes,before.relationshipNotes);assert.equal(moved.revision,before.revision+1);
  await assert.rejects(profiles.changeCompanionProfileForActor(stale,god));await assert.rejects(configure(id,{},god,ownerB),/reviewed/);
  await notes(id,"New owner notes",player,ownerB);assert.equal((await profileView(id,god,ownerB)).requiresOwnerReview,true);
  await configure(id,{roles:moved.roles,confirmOwnerReview:true,relationshipNotes:"Reviewed bond"},god,ownerB);assert.equal((await profileView(id,god,ownerB)).requiresOwnerReview,false);
  await transfer(id,null);assert.equal((await profileRows(id)).profile[0].requires_owner_review,true);assert.equal((await profileRows(id)).roles.length,2);
  await assert.rejects(pool.query("update companion_profile set relationship_notes='unauthorized' where character_id=$1",[id]),/Assign a current owner/);
  await transfer(id,ownerA);assert.equal((await profileView(id)).requiresOwnerReview,true);assert.equal((await profileView(id)).relationshipNotes,"Reviewed bond");
  assert.equal((await profileRows(id)).events.filter(row=>row.command.operation==="ownership-review").length,3);
});

test("bound transfer stays blocked without changing Profile or Pass 1 history",async()=>{
  const id=(await create()).characterId;await configure(id);const copy=await newCopy();await bind(id,copy);
  const before=await allRows();await assert.rejects(transfer(id,ownerB),/Unbind/);assert.deepEqual(await allRows(),before);
});

test("retries, stale notes and competing authoritative updates cannot overwrite each other",async()=>{
  const id=(await create()).characterId,command=await configureCommand(id);
  const results=await Promise.all([profiles.changeCompanionProfileForActor(command,god),profiles.changeCompanionProfileForActor(command,god)]);assert.deepEqual(results[0],results[1]);assert.equal((await profileRows(id)).events.length,1);
  await assert.rejects(profiles.changeCompanionProfileForActor({...command,relationshipNotes:"different"},god),/retry identity/);
  const stale=await configureCommand(id);await notes(id,"Player's new notes");await assert.rejects(profiles.changeCompanionProfileForActor(stale,god),/changed/);assert.equal((await profileView(id)).relationshipNotes,"Player's new notes");
  const current=await configureCommand(id);const race=await Promise.allSettled([profiles.changeCompanionProfileForActor(current,god),profiles.changeCompanionProfileForActor({...current,requestKey:`race-${++sequence}`,controlModel:"god-directed"},god)]);
  assert.equal(race.filter(row=>row.status==="fulfilled").length,1);assert.equal(race.filter(row=>row.status==="rejected").length,1);
});

test("archive/restore preserves profiles and rejects mutations of archived Creature, owner or Campaign",async()=>{
  const id=(await create()).characterId;await configure(id);const before=await profileRows(id);
  for(const target of [{entityKind:"creature-npc",entityId:id},{entityKind:"player-character",entityId:ownerA},{entityKind:"campaign",entityId:campaignId}]) {
    await lifecycle.archiveLifecycleEntityForActor(target,actor);await assert.rejects(configure(id));await assert.rejects(notes(id,"blocked"));assert.deepEqual(await profileRows(id),before);await lifecycle.restoreLifecycleEntityForActor(target,actor);
  }
});

test("active/paused encounters block authoritative settings while harmless notes remain independent",async()=>{
  const id=(await create()).characterId;await configure(id);
  const session=(await one("insert into campaign_session(campaign_id,title,sequence_number,status,started_at) values($1,'Profile guard',190,'active',now()) returning id",[campaignId])).id;
  const scene=(await one("insert into campaign_session_scene(session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,'Guard',1,'active',now()) returning id",[session,campaignId])).id;
  const encounter=(await one("insert into campaign_session_encounter(scene_id,session_id,campaign_id,title,sequence_number,status,started_at) values($1,$2,$3,'Guard',1,'active',now()) returning id",[scene,session,campaignId])).id;
  for(const holder of [ownerA,id]) {
    await pool.query("insert into campaign_session_encounter_participant(encounter_id,campaign_id,character_id,scene_id,session_id) values($1,$2,$3,$4,$5)",[encounter,campaignId,holder,scene,session]);
    await assert.rejects(configure(id),/active encounters/);await pool.query("update campaign_session_encounter set frozen_at=now() where id=$1",[encounter]);await assert.rejects(configure(id),/paused/);
    await notes(id,"Narrative note during encounter");await pool.query("update campaign_session_encounter set frozen_at=null where id=$1",[encounter]);await pool.query("delete from campaign_session_encounter_participant where encounter_id=$1",[encounter]);
  }
  await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1",[encounter]);
});

test("actual Evolution and historical Return preserve Profile and exact Vessel identity",async()=>{
  const id=(await create()).characterId,copy=await newCopy();await bind(id,copy);await configure(id,{roles:[role("mount",{maximumRiders:2,mountNotes:"Family saddle"}),role("familiar")],relationshipNotes:"Keeps the same relationship"});
  const targetDraft=creatureDraftFixture();targetDraft.core.canonicalName="Profile Mature Horse";targetDraft.attributes.forEach(row=>row.value=20);const target=await creatures.saveCreature(targetDraft);
  const pathId=(await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$2,'Mature') returning id",[source.id,target.id])).id;
  const before=await profileRows(id),travelBefore=await saved(id);
  const preview=await evolutions.previewPersistentEvolution("creature",id,pathId,actor);
  await evolutions.executePersistentEvolution({kind:"creature",characterId:id,pathId,expectedVersion:preview.pathVersion,reviewToken:preview.reviewToken,idempotencyKey:randomUUID(),confirmedRequirementKeys:[],confirmHealthConsequences:true,confirmReplaceOverrides:true},actor);
  assert.deepEqual(await profileRows(id),before);assert.deepEqual(await saved(id),travelBefore);
  const back=await evolutions.previewPersistentEvolutionReturn("creature",id,actor);
  await evolutions.executePersistentEvolutionReturn({kind:"creature",characterId:id,expectedEventId:back.returning.eventId,reviewToken:back.reviewToken,idempotencyKey:randomUUID(),confirmHealthConsequences:true,confirmReplaceOverrides:true},actor);
  assert.deepEqual(await profileRows(id),before);assert.deepEqual(await saved(id),travelBefore);
});

test("authorized exact Vessel reverse lookup and readable travel history do not expose private NPC data",async()=>{
  const id=(await create({name:"Storm"})).characterId,copy=await newCopy();await bind(id,copy);
  const found=await management.readVesselCompanionForActor(ownerA,copy,player);assert.equal(found.creatureName,"Storm");assert.match(found.label,/Calling Stone/);assert.deepEqual(Object.keys(found).sort(),["canBind","creatureIdentity","creatureName","label"]);
  await assert.rejects(management.readVesselCompanionForActor(ownerB,copy,player));await assert.rejects(management.readVesselCompanionForActor(ownerA,copy,otherPlayer));await assert.rejects(management.readCompanionTravelHistoryForActor(ownerA,id,otherPlayer));
  await set(id,"away",{awayNote:"At home",acknowledgeUnbind:true});const history=await management.readCompanionTravelHistoryForActor(ownerA,id,player);assert.match(history[0].before,/Vessel-bound.*Calling Stone/);assert.equal(history[0].after,"Away · At home");assert.equal(history[0].actor,god.replace("god","player"));
  assert.equal((await management.readVesselCompanionForActor(ownerA,copy,player)).creatureName,null);
});

test("failed history insertion rolls back roles/settings/notes and history rejects in-place edits",async()=>{
  const id=(await create()).characterId;await configure(id);const before=await profileRows(id);
  await pool.query("create function reject_profile_test_event() returns trigger language plpgsql as $$ begin raise exception 'Synthetic profile history failure'; end $$");
  await pool.query("create trigger reject_profile_test_event before insert on companion_profile_event for each row execute function reject_profile_test_event()");
  try { await assert.rejects(configure(id,{roles:[role("mount")]}),error=>/Synthetic/.test(String(error.cause)));assert.deepEqual(await profileRows(id),before); }
  finally { await pool.query("drop trigger reject_profile_test_event on companion_profile_event");await pool.query("drop function reject_profile_test_event()"); }
  await assert.rejects(pool.query("update companion_profile_event set request_key='rewrite' where character_id=$1",[id]),/immutable/);
});

test("individual and Campaign permanent deletion clean profiles, roles and history atomically",async()=>{
  const id=(await create()).characterId;await configure(id);await lifecycle.archiveLifecycleEntityForActor({entityKind:"creature-npc",entityId:id},actor);
  await lifecycle.permanentlyDeleteLifecycleEntityForActor({entityKind:"creature-npc",entityId:id,confirmation:"DELETE"},actor);assert.deepEqual(await profileRows(id),{profile:[],roles:[],events:[]});
  const c=await makeCampaign("Profile cleanup"),owner=await character(c,"Cleanup owner"),npc=(await create({campaignId:c,ownerCharacterId:owner})).characterId;
  await configure(npc,{roles:[role("mount"),role("familiar")]},god,owner);await lifecycle.archiveLifecycleEntityForActor({entityKind:"campaign",entityId:c},actor);
  await lifecycle.permanentlyDeleteLifecycleEntityForActor({entityKind:"campaign",entityId:c},actor,"Profile cleanup");assert.deepEqual(await profileRows(npc),{profile:[],roles:[],events:[]});
});

after(async()=>{
  if(process.env.SERRIAN_COMPANION_BROWSER==="true") {
    const owner=await character(campaignId,"Profile browser owner"),legacy=(await create({name:"Unconfigured companion",ownerCharacterId:owner})).characterId;
    const storm=(await create({name:"Storm",ownerCharacterId:owner})).characterId,copy=await newCopy(vesselId,owner);
    await configure(storm,{roles:[role("companion"),role("mount"),role("pack-working")],relationshipNotes:"Long-time family horse."},god,owner);
    await travel.changeCompanionDispositionForActor({ownerCharacterId:owner,creatureCharacterId:storm,disposition:"vessel-bound",awayNote:"",vesselInstanceId:copy,expectedRevision:0,acknowledgeUnbind:false,requestKey:"profile-browser-binding"},player);
    const simple=(await create({name:"Simple profile companion",buildMode:"simple",ownerCharacterId:raceOwner})).characterId;
    await mkdir("artifacts/guidance/companion-profile",{recursive:true});await writeFile("artifacts/guidance/companion-profile/fixture.json",JSON.stringify({campaignId,owner,legacy,storm,copy,simple,raceOwner,god,player}));
  }
  await pool.end();
});

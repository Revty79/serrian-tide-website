import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
assert.equal(process.env.SERRIAN_EVOLUTION_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_evolution_dev$/);
const actors = new AsyncLocalStorage(), god = "returns-god", foreign = "returns-foreign", player = "returns-player", admin = "returns-admin";
const session = async () => ({ user: { id: actors.getStore() ?? god } });
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: session, requireGod: session, requirePlayer: session,
  requireGodOrAdminAccessContext: async () => ({ session: await session(), roles: ["god"] }),
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool } = await import("../src/db/index.ts");
const rows = async (text, values = []) => (await pool.query(text, values)).rows;
const one = async (text, values = []) => (await rows(text, values))[0];
const api = await import("../src/features/evolutions/evolution-execution-service.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const npcs = await import("../src/app/heavens/npcs/actions.ts");
const races = await import("../src/features/races/race-evolution-service.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const { creatureDraftFixture, creatureFormFixture } = await import("./creature-form-fixture.ts");
const { emptyRaceEvolutionTransition } = await import("../src/features/races/race-evolution-transition.ts");
const actor = { userId: god, roles: ["god"] };
let campaignId, owner, sourceRace, targetRace, sourceCreature, targetCreature, racePath, creaturePath, equipmentId;
const allRows = async () => {
  const tables = await rows("select tablename from pg_tables where schemaname='public' order by tablename");
  return Object.fromEntries(await Promise.all(tables.map(async ({ tablename }) => [tablename, await rows(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)])));
};
const command = preview => ({ kind: preview.kind, characterId: preview.characterId, pathId: preview.pathId, expectedVersion: preview.pathVersion,
  reviewToken: preview.reviewToken, idempotencyKey: randomUUID(), confirmedRequirementKeys: [], confirmHealthConsequences: true, confirmReplaceOverrides: true });
const prepare = (kind, id, pathId = kind === "race" ? racePath : creaturePath) => api.previewPersistentEvolution(kind, id, pathId, actor);
async function enableRace(raceId, campaign = campaignId) {
  for(const table of ["campaign_race","campaign_allowed_race"]) await pool.query(`insert into ${table}(campaign_id,race_id,sort_order) select $1,$2,coalesce(max(sort_order),-1)+1 from ${table} where campaign_id=$1`,[campaign,raceId]);
}
async function character(kind = "race", npc = false) {
  let id;
  if (kind === "creature") id = (await npcs.createNpc({ campaignId, origin: "creature", buildMode: "detailed", sourceId: sourceCreature.id, name: "Persistent Ember", roleLabel: "Companion", notes: "Unchanged story", ownerCharacterId: owner })).characterId;
  else {
    id = (await one("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode) values($1,$2,'Persistent Arin',$3,'race',case when $3 then 'detailed' else null end) returning id", [campaignId, player, npc])).id;
    await pool.query("insert into campaign_character_profile(character_id,race_id,age,experience,total_experience,hp_multiplier_steps,base_movement_steps,base_magic_steps,personality) values($1,$2,20,7,44,2,1,3,'Unchanged personality')", [id, sourceRace]);
    for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) await pool.query("insert into campaign_character_attribute(character_id,attribute_key,value) values($1,$2,30)", [id, key]);
  }
  await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,111) on conflict(character_id) do update set total_damage=111", [id]);
  await pool.query("insert into campaign_character_active_health_pool(character_id,pool_key,pool_name_snapshot,damage) values($1,'old-wing','Old wing',13)", [id]);
  await pool.query("insert into campaign_character_injury(character_id,pool_key,pool_name_snapshot,name,notes,damage_amount) values($1,'old-wing','Old wing','Broken wing','Preserved injury',13)", [id]);
  await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,0,'worn',2)", [id, equipmentId]);
  return id;
}
before(async () => {
  for (const [id, role] of [[god,"god"],[foreign,"god"],[player,"player"],[admin,"admin"]]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)', [id, `${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)", [id, role]);
  }
  campaignId = (await one("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Evolution execution',100,100,50,10,100,0,'Credits','Assigned',$1) returning id", [god])).id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)", [campaignId, player]);
  owner = (await one("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Companion owner') returning id", [campaignId, player])).id;
  sourceRace = (await one("insert into races(name,size,created_by_user_id) values('Returns Human','Medium',$1) returning id", [god])).id;
  targetRace = (await one("insert into races(name,size,base_magic,created_by_user_id) values('Returns Ascended','Large',12,$1) returning id", [god])).id;
  await enableRace(sourceRace); await enableRace(targetRace);
  const transition = { ...emptyRaceEvolutionTransition(), attributes: [{ key: "STR", operation: "add", value: 10 }, { key: "CON", operation: "add", value: -15 }], hpMultiplierSteps: { operation: "set", value: 0 }, baseMagicSteps: { operation: "add", value: 2 } };
  racePath = (await races.saveRaceEvolution({ sourceRaceId: sourceRace, destinationRaceId: targetRace, name: "Permanent ascension", description: "", notes: "", transition }, actor))[0].id;
  const source = creatureDraftFixture(); source.core.canonicalName = "Returns Young Drake"; source.forms = [creatureFormFixture()];
  sourceCreature = await creatures.saveCreature(source);
  const destination = creatureDraftFixture(); destination.core.canonicalName = "Returns Adult Drake";
  destination.core.size = "Small"; destination.core.hpMultiplierSteps = 1; destination.core.baseMagicSteps = 4;
  destination.attributes.forEach(row => row.value = 10); destination.forms = [{ ...creatureFormFixture(), key: "adult-form", name: "Adult Form" }];
  destination.attacks = creatureFormFixture().mechanics.attacks.rows; destination.abilities = creatureFormFixture().mechanics.abilities.rows;
  destination.defenses = creatureFormFixture().mechanics.defenses.rows;
  targetCreature = await creatures.saveCreature(destination);
  creaturePath = (await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$2,'Mature permanently') returning id", [sourceCreature.id, targetCreature.id])).id;
  equipmentId = (await one("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis) values('RETURNS-CHARGED-HARNESS','Charged Harness','equipment','misc','Gear','Gear',2,'Each') returning id")).id;
  await pool.query("insert into item_runtime_profiles(item_id,use_mode,maximum_charges,charges_per_use) values($1,'charges',2,1)",[equipmentId]);
});
after(() => pool.end());


const backCommand = preview => ({kind:preview.kind, characterId:preview.characterId, expectedEventId:preview.returning.eventId, reviewToken:preview.reviewToken, idempotencyKey:randomUUID(), confirmHealthConsequences:true, confirmReplaceOverrides:true});
const evolve = async (kind,id,path) => api.executePersistentEvolution(command(await prepare(kind,id,path)),actor);
const back = (kind,id) => api.previewPersistentEvolutionReturn(kind,id,actor);
const returnNow = async (kind,id) => api.executePersistentEvolutionReturn(backCommand(await back(kind,id)),actor);

test("PC and Race NPC Return remove actual deltas, preserve later advancement and every unrelated public table",async()=>{
  for(const npc of [false,true]) {
    const id=await character("race",npc), forward=await evolve("race",id);
    await pool.query("update campaign_character_attribute set value=value+5 where character_id=$1",[id]);
    await pool.query("update campaign_character_profile set hp_multiplier_steps=3,base_movement_steps=4,base_magic_steps=7 where character_id=$1",[id]);
    const prior=await allRows(), preview=await back("race",id);
    assert.deepEqual(await allRows(),prior,"Return preview writes nothing");
    assert.equal(preview.returning.eventId,forward.event.id);
    assert.equal(preview.returning.raceAdjustments.after.attributes.find(r=>r.attributeKey==='STR').value,35);
    assert.equal(preview.returning.raceAdjustments.after.attributes.find(r=>r.attributeKey==='CON').value,35);
    assert.equal(preview.returning.raceAdjustments.after.hpMultiplierSteps,5,"inverse of original Set 0 is +2; keep later 3");
    assert.equal(preview.afterHealth.totalDamage,111);
    assert.ok(preview.afterHealth.tracks.some(r=>r.orphaned&&r.key==='old-wing'));
    const result=await api.executePersistentEvolutionReturn(backCommand(preview),actor),after=await allRows();
    for(const table of Object.keys(prior)) if(!['campaign_character_profile','campaign_character_attribute','race_evolution_events'].includes(table)) assert.deepEqual(after[table],prior[table],table);
    const profile=await one('select * from campaign_character_profile where character_id=$1',[id]);
    assert.equal(profile.race_id,sourceRace); assert.equal(profile.hp_multiplier_steps,5); assert.equal(profile.base_magic_steps,5); assert.equal(profile.base_movement_steps,4);
    assert.equal(result.event.operation,'return'); assert.equal(result.event.reversesEventId,forward.event.id);
    assert.deepEqual((await api.readEvolutionHistory(id,actor)).find(r=>r.id===forward.event.id),forward.event);
    assert.equal((await api.readIndividualEvolutionState(id,actor)).returnCandidate,null);
  }
});
test("Race chains unwind C to B to A, no arbitrary target or reused event, re-evolve creates new provenance",async()=>{
  const c=(await one("insert into races(name) values('Returns final') returning id")).id; await enableRace(c);
  const path=(await races.saveRaceEvolution({sourceRaceId:targetRace,destinationRaceId:c,name:'Final',description:'',notes:'',transition:emptyRaceEvolutionTransition()},actor))[0].id;
  const id=await character(),a=await evolve('race',id),b=await evolve('race',id,path);
  assert.equal((await back('race',id)).returning.eventId,b.event.id);
  const invalid={...backCommand(await back('race',id)),expectedEventId:a.event.id};
  await assert.rejects(api.executePersistentEvolutionReturn(invalid,actor),/next Return step/);
  await returnNow('race',id); assert.equal((await back('race',id)).returning.eventId,a.event.id);
  await returnNow('race',id); await assert.rejects(back('race',id),/No prior/);
  const again=await evolve('race',id); assert.notEqual(again.event.id,a.event.id);
  assert.equal((await back('race',id)).returning.eventId,again.event.id); await returnNow('race',id);
  assert.equal((await api.readEvolutionHistory(id,actor)).length,6);
});
test("Return uses historical Race evidence after path edits, including exact legacy after-minus-before",async()=>{
  const id=await character(),f=await evolve('race',id);
  const evidence=structuredClone(f.event.evidence); delete evidence.raceTransition.appliedAdjustments;
  const legacy=await character();
  await pool.query('update campaign_character_profile set race_id=$2,hp_multiplier_steps=0,base_magic_steps=5 where character_id=$1',[legacy,targetRace]);
  await pool.query("update campaign_character_attribute set value=case attribute_key when 'STR' then 40 when 'CON' then 15 else value end where character_id=$1",[legacy]);
  await pool.query("insert into race_evolution_events(campaign_id,character_id,source_race_id,destination_race_id,path_id,path_version,executed_by_user_id,idempotency_key,request_hash,evidence) select campaign_id,$2,source_race_id,destination_race_id,path_id,path_version,executed_by_user_id,$3,request_hash,$4 from race_evolution_events where id=$1",[f.event.id,legacy,randomUUID(),evidence]);
  const old=await one('select transition_json from race_evolution_paths where id=$1',[racePath]);
  await pool.query("update race_evolution_paths set transition_json=$2,version=version+1 where id=$1",[racePath,{...emptyRaceEvolutionTransition(),attributes:[{key:'STR',operation:'add',value:500}]}]);
  try {for(const target of [id,legacy]) {const p=await back('race',target); assert.equal(p.returning.raceAdjustments.removed.attributeAdjustments.STR,10); await returnNow('race',target); assert.equal((await one("select value from campaign_character_attribute where character_id=$1 and attribute_key='STR'",[target])).value,30);}}
  finally {await pool.query('update race_evolution_paths set transition_json=$2 where id=$1',[racePath,old.transition_json]);}
});
test("invalid negative Race Return fails without clamping or partial writes; changed health requires fresh review",async()=>{
  const id=await character(); await evolve('race',id);
  await pool.query("update campaign_character_attribute set value=2 where character_id=$1 and attribute_key='STR'",[id]);
  const initial=await allRows(); await assert.rejects(back('race',id),/nonnegative/); assert.deepEqual(await allRows(),initial);
  await pool.query("update campaign_character_attribute set value=40 where character_id=$1 and attribute_key='STR'",[id]);
  const input=backCommand(await back('race',id));
  await pool.query('update campaign_character_active_health set total_damage=112 where character_id=$1',[id]);
  const before=await allRows(); await assert.rejects(api.executePersistentEvolutionReturn(input,actor),/consequences changed/); assert.deepEqual(await allRows(),before);
});
test("historical Race may be archived and removed from creation lists, remains readable without new selection access",async()=>{
  const id=await character(); await evolve('race',id);
  await pool.query('update races set archived_at=now() where id=$1',[sourceRace]);
  for(const table of ['campaign_race','campaign_allowed_race']) await pool.query(`delete from ${table} where campaign_id=$1 and race_id=$2`,[campaignId,sourceRace]);
  try {
    const p=await back('race',id); assert.ok(p.warnings.some(w=>w.includes('archived'))); assert.ok(p.warnings.some(w=>w.includes('not currently offered')));
    await returnNow('race',id);
    const actions=await import('../src/app/characters/actions.ts');
    const aggregate=await actions.getCharacter(id,true); assert.equal(aggregate.selectedRace.race.id,sourceRace);
    const helper=await import('../src/features/evolutions/retained-historical-race.ts');
    assert.equal(await helper.isRetainedHistoricalRace(id,sourceRace),true); assert.equal(await helper.isRetainedHistoricalRace(id,targetRace),false);
    assert.equal((await rows('select * from campaign_allowed_race where campaign_id=$1 and race_id=$2',[campaignId,sourceRace])).length,0);
  } finally {await pool.query('update races set archived_at=null where id=$1',[sourceRace]); await enableRace(sourceRace);}
});
test("Creature Return restores exact historical baseline and prior edits with current HP Adjustment, not changed master",async()=>{
  const id=await character('creature'),p=await one('select * from campaign_creature_npc_profile where character_id=$1',[id]);
  const old=JSON.parse(p.current_snapshot_json); old.attributes[0].value+=7;
  await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1',[id,JSON.stringify(old)]);
  const f=await evolve('creature',id);
  await pool.query('update campaign_creature_npc_profile set hp_adjustment=19 where character_id=$1',[id]);
  assert.equal((await back('creature',id)).hasIndividualOverrides,false,'HP Adjustment alone does not count');
  const current=JSON.parse(f.event.snapshots.destinationCurrent); current.attributes[0].value+=3;
  await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1',[id,JSON.stringify(current)]);
  const preview=await back('creature',id); assert.equal(preview.hasIndividualOverrides,true);
  const before=await allRows(); await assert.rejects(api.executePersistentEvolutionReturn({...backCommand(preview),confirmReplaceOverrides:false},actor),/confirm replacing/); assert.deepEqual(await allRows(),before);
  await pool.query("update creatures set canonical_name='Master edited after original Evolution',archived_at=now() where id=$1",[sourceCreature.id]);
  try {
    const finalPreview=await back('creature',id), initial=await allRows(), result=await api.executePersistentEvolutionReturn(backCommand(finalPreview),actor),after=await allRows();
    for(const table of Object.keys(initial)) if(!['campaign_creature_npc_profile','creature_evolution_events'].includes(table)) assert.deepEqual(after[table],initial[table],table);
    const restored=await one('select * from campaign_creature_npc_profile where character_id=$1',[id]);
    assert.equal(restored.creature_id,sourceCreature.id); assert.equal(restored.hp_adjustment,19); assert.equal(restored.baseline_snapshot_json,p.baseline_snapshot_json);
    assert.equal(JSON.parse(restored.current_snapshot_json).attributes[0].value,old.attributes[0].value);
    assert.equal(JSON.parse(restored.current_snapshot_json).core.canonicalName,old.core.canonicalName);
    assert.equal(result.event.reversesEventId,f.event.id); assert.equal(result.event.evidence.afterHealth.totalDamage,111);
    const {normalizeCreatureNpcSnapshot}=await import('../src/features/creatures/creature-npc-constructor-service.ts');
    assert.deepEqual(JSON.parse(restored.current_snapshot_json),normalizeCreatureNpcSnapshot(old,19));
  } finally {await pool.query('update creatures set canonical_name=$2,archived_at=null where id=$1',[sourceCreature.id,sourceCreature.core.canonicalName]);}
});
test("Return authority, missing history, wrong kind, consent, mismatch and durable concurrent replay",async()=>{
  for(const kind of ['race','creature']) {
    const id=await character(kind); await assert.rejects(back(kind,id),/No prior/); await evolve(kind,id);
    const input=backCommand(await back(kind,id)), before=await allRows();
    for(const userId of [player,foreign,admin]) for(const operation of [()=>api.readIndividualEvolutionState(id,{userId,roles:['god']}),()=>api.previewPersistentEvolutionReturn(kind,id,{userId,roles:['god']}),()=>api.executePersistentEvolutionReturn(input,{userId,roles:['god']})]) await assert.rejects(operation,/Campaign-owning/);
    await assert.rejects(api.previewPersistentEvolutionReturn(kind==='race'?'creature':'race',id,actor),/type/);
    await assert.rejects(api.executePersistentEvolutionReturn({...input,confirmHealthConsequences:false},actor),/Confirm/); assert.deepEqual(await allRows(),before);
    const results=await Promise.all([api.executePersistentEvolutionReturn(input,actor),api.executePersistentEvolutionReturn(input,actor)]);
    assert.equal(results[0].event.id,results[1].event.id); assert.equal(results.filter(r=>r.replayed).length,1);
    assert.equal((await api.executePersistentEvolutionReturn(input,actor)).replayed,true);
    await assert.rejects(api.executePersistentEvolutionReturn({...input,confirmReplaceOverrides:false},actor),/different input/);
    await assert.rejects(api.executePersistentEvolutionReturn({...input,idempotencyKey:randomUUID()},actor),/No prior/);
    assert.equal(await api.hasPersistentEvolutionReceipt(id,input.idempotencyKey,actor),true);
  }
});
test("Return database provenance is typed, unique and immutable; same statement campaign-history deletion works",async()=>{
  const id=await character(); const f=await evolve('race',id), r=await returnNow('race',id);
  const copy=(changes)=>pool.query("insert into race_evolution_events select (jsonb_populate_record(null::race_evolution_events,to_jsonb(t)||$2::jsonb)).* from race_evolution_events t where id=$1",[r.event.id,{id:100000+Math.floor(Math.random()*100000),idempotency_key:randomUUID(),...changes}]);
  await assert.rejects(copy({}),/unique/);
  await assert.rejects(copy({character_id:owner}),/same individual/);
  await assert.rejects(copy({reverses_event_id:r.event.id}),/exact forward/);
  await assert.rejects(pool.query('update race_evolution_events set path_version=path_version+1 where id=$1',[f.event.id]),/immutable/);
  await assert.rejects(pool.query('delete from race_evolution_events where id=$1',[f.event.id]),/foreign key/);
  await pool.query('delete from race_evolution_events where character_id=$1',[id]);
  assert.equal((await api.readEvolutionHistory(id,actor)).length,0);
});

async function encounterFor(id, status = "planned", type = "social") {
  const session = (await one("insert into campaign_session(campaign_id,title,sequence_number) select $1,'Evolution Session',coalesce(max(sequence_number),0)+1 from campaign_session where campaign_id=$1 returning id",[campaignId])).id;
  const scene = (await one("insert into campaign_session_scene(campaign_id,session_id,title,sequence_number) values($1,$2,'Evolution Scene',1) returning id",[campaignId,session])).id;
  const encounter = (await one("insert into campaign_session_encounter(campaign_id,session_id,scene_id,title,sequence_number,status,encounter_type,started_at,completed_at) values($1,$2,$3,'Evolution Encounter',1,$4::campaign_session_encounter_status,$5,case when $4::text <> 'planned' then now() end,case when $4::text='completed' then now() end) returning id",[campaignId,session,scene,status,type])).id;
  await pool.query("insert into campaign_session_encounter_participant(campaign_id,session_id,scene_id,encounter_id,character_id) values($1,$2,$3,$4,$5)",[campaignId,session,scene,encounter,id]);
  return encounter;
}

test("Return allows clean active Encounters, blocks frozen/prepared state; planned and completed records remain unchanged",async()=>{
  for(const kind of ['race','creature']) for(const type of ['combat','social','chase','exploration','other']) {
    const id=await character(kind); await evolve(kind,id); const encounter=await encounterFor(id,'active',type);
    const p=await back(kind,id); assert.deepEqual(p.blockers,[]);
    await pool.query('update campaign_session_encounter set frozen_at=now() where id=$1',[encounter]);
    const before=await allRows(); await assert.rejects(returnNow(kind,id),/frozen for inspection/); assert.deepEqual(await allRows(),before);
    await pool.query('update campaign_session_encounter set frozen_at=null where id=$1',[encounter]);
    const result=await returnNow(kind,id); assert.equal(result.event.evidence.encounterContexts[0].cleanBoundary,true);
  }
  const id=await character(); await evolve('race',id); const encounter=await encounterFor(id); await encounterFor(id,'completed');
  const before=await allRows(); await returnNow('race',id); const after=await allRows();
  for(const key of Object.keys(before).filter(k=>k.startsWith('campaign_session'))) assert.deepEqual(after[key],before[key]);
  await evolve('race',id); await pool.query("update campaign_session_encounter_participant set local_state_json='{}' where encounter_id=$1",[encounter]);
  await assert.rejects(returnNow('race',id),/prepared runtime/);
});
test("Return serializes with Encounter start, enrollment, advancement, ownership, condition and history writers",async()=>{
  const id=await character(); await evolve('race',id); const input=backCommand(await back('race',id)), client=await pool.connect();
  try {for(const table of ['campaign_session_encounter','campaign_session_encounter_participant','campaign_character','campaign_character_profile','campaign_character_attribute','campaign_character_active_condition','campaign_character_active_health','campaign_character_item_instance','races','race_evolution_events','creature_evolution_events']) {
    await client.query('begin'); await client.query(`lock table ${table} in row exclusive mode`);
    await assert.rejects(api.executePersistentEvolutionReturn(input,actor),/another operation/); await client.query('rollback');
  }} finally {await client.query('rollback');client.release();}
  assert.equal((await api.readEvolutionHistory(id,actor)).length,1);
  await returnNow('race',id);
});
test("Return event-insert failure rolls back all mechanics and keeps the forward event available",async()=>{
  for(const kind of ['race','creature']) {
    const id=await character(kind); await evolve(kind,id); const input=backCommand(await back(kind,id)), before=await allRows();
    await pool.query("create function return_test_failure() returns trigger language plpgsql as $$ begin raise exception 'test Return event failure'; end $$");
    await pool.query(`create trigger return_test_failure before insert on ${kind}_evolution_events for each row execute function return_test_failure()`);
    try {await assert.rejects(api.executePersistentEvolutionReturn(input,actor),/Failed query|test Return/);} finally {await pool.query(`drop trigger return_test_failure on ${kind}_evolution_events`);await pool.query('drop function return_test_failure()');}
    assert.deepEqual(await allRows(),before); assert.equal((await back(kind,id)).returning.eventId,input.expectedEventId); await api.executePersistentEvolutionReturn(input,actor);
  }
});

test("saved PC and Race NPC print refresh follows exact Evolution and Return; preview/printing never mutate",async()=>{
  const {getRace,saveRace}=await import('../src/app/heavens/races/actions.ts');
  const {emptyRaceForm}=await import('../src/features/races/race-forms.ts');
  const {wolfFormMechanics}=await import('./race-form-mechanics-fixture.ts');
  const {transformationFixture}=await import('./race-form-transformation-fixture.ts');
  const {emptyFormAccessRequirement}=await import('../src/features/forms/form-access.ts');
  const {getPaperCharacterSheet}=await import('../src/app/characters/paper-character-actions.ts');
  const skill=(await one("insert into skill(name,classification,tier,primary_attribute,definition) values('Return Form Instinct','standard',1,'DEX','Follow the scent') returning id")).id;
  const ability=(await one("insert into skill(name,classification,tier,definition) values('Return Form Sense','Special Ability',null,'See through mist') returning id")).id;
  for(const [raceId,prefix] of [[sourceRace,'Young'],[targetRace,'Ascended']]) {
    const base=await getRace(raceId);
    await saveRace({...base,forms:['Available','Locked','Manual'].map((status,i)=>({...emptyRaceForm(`print-${status.toLowerCase()}`),name:`${prefix} ${status} Form`,description:`${prefix} ${status} reference`,notes:'Form reference only',sortOrder:i,mechanics:wolfFormMechanics(skill,ability),transformation:transformationFixture(),access:status==='Available'?{mode:'unrestricted',requirements:[]}:{mode:'requirements',requirements:[status==='Locked'?{...emptyFormAccessRequirement('required-strength',0,'attribute'),attributeKey:'STR',requiredValue:999}:{...emptyFormAccessRequirement('pact',0),notes:'Confirm the spirit pact'}]}}))});
  }
  for(const npc of [false,true]) {
    const id=await character('race',npc);
    const initial=await allRows(),paper=await getPaperCharacterSheet(id,true); assert.deepEqual(await allRows(),initial);
    assert.deepEqual(paper.formReferences.map(r=>r.access.status),['available','locked','manual-review']);
    assert.equal(paper.attributes.find(r=>r.key==='STR').score,30); assert.equal(paper.formReferences[0].preview.attributes.find(r=>r.key==='STR').value,35);
    await evolve('race',id); const evolved=await getPaperCharacterSheet(id,true); assert.ok(evolved.formReferences.every(r=>r.raceId===targetRace&&r.preview.form.name.startsWith('Ascended')));
    await returnNow('race',id); const restored=await getPaperCharacterSheet(id,true); assert.deepEqual(restored.formReferences,paper.formReferences);
    assert.deepEqual(restored.health,paper.health); assert.deepEqual(restored.inventory,paper.inventory);
  }
  for(const [kind,npc,name] of [['race',false,'Pass Five Player Character'],['race',true,'Pass Five Race NPC'],['creature',true,'Pass Five Creature NPC']]) {
    const id=await character(kind,npc); await pool.query('update campaign_character set name=$2 where id=$1',[id,name]);
    if(kind==='race') await pool.query('update campaign_character_profile set creation_completed_at=now() where character_id=$1',[id]);
  }
});

test("explicit Campaign graph deletion removes only its Evolution history and preserves shared definitions and other events", async () => {
  const name="Return history deletion rehearsal";
  const isolated=(await one("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values($1,100,100,50,10,100,0,'Credits','Assigned',$2) returning id",[name,god])).id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2),($1,$3)",[isolated,player,god]);
  await enableRace(sourceRace,isolated); await enableRace(targetRace,isolated);
  for(const kind of ["race","creature"]) {
    const id=await character(kind);
    await pool.query("update campaign_character set owner_character_id=null,campaign_id=$2 where id=$1",[id,isolated]);
    await api.executePersistentEvolution(command(await prepare(kind,id)),actor);
    await returnNow(kind,id);
  }
  const before=await allRows();
  const target={entityKind:"campaign",entityId:isolated};
  await lifecycle.archiveLifecycleEntityForActor(target,actor);
  const preview=await lifecycle.previewLifecycleEntityForActor(target,actor);
  assert.ok(JSON.stringify(preview).includes("Persistent Evolution history"));
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(target,actor,name);
  const after=await allRows();
  for(const table of ["races","creatures","race_evolution_paths","creature_evolution_paths"]) assert.deepEqual(after[table],before[table]);
  for(const table of ["race_evolution_events","creature_evolution_events"]) assert.deepEqual(after[table],before[table].filter(row=>row.body.campaign_id!==isolated));
});

test("Creature chain Returns restore each exact stage and companion views use current identity without private evidence",async()=>{
  const destination=creatureDraftFixture(); destination.core.canonicalName='Returns Elder Drake'; destination.forms=[{...creatureFormFixture(),key:'elder',name:'Elder Form'}];
  const elder=await creatures.saveCreature(destination);
  const path=(await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$2,'Grow elder') returning id",[targetCreature.id,elder.id])).id;
  const {readOwnedCreaturesForActor}=await import('../src/features/creatures/owned-creature-service.ts');
  const id=await character('creature');
  const view=async()=> (await readOwnedCreaturesForActor(owner,player)).individuals.find(row=>row.characterId===id);
  const original=await view(); await evolve('creature',id); const a=await view();assert.equal(a.creatureId,targetCreature.id);assert.equal(a.name,original.name);assert.equal(a.health.damage,original.health.damage);
  await evolve('creature',id,path); assert.equal((await view()).creatureId,elder.id);
  await returnNow('creature',id); assert.equal((await view()).creatureId,targetCreature.id);
  await returnNow('creature',id); assert.deepEqual(await view(),original);
  const forward=await evolve('creature',id); assert.equal((await back('creature',id)).returning.eventId,forward.event.id);
  await returnNow('creature',id); assert.deepEqual(await view(),original);
  assert.equal((await api.readEvolutionHistory(id,actor)).length,6);
  for(const key of ['history','evidence','snapshots','requirements','instanceNotes']) assert.equal(key in original,false);
});

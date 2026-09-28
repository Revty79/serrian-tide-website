import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
assert.equal(process.env.SERRIAN_EVOLUTION_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_evolution_dev$/);
const actors = new AsyncLocalStorage(), god = "execution-god", foreign = "execution-foreign", player = "execution-player", admin = "execution-admin";
const session = async () => ({ user: { id: actors.getStore() ?? god } });
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: session, requireGod: session, requirePlayer: session,
  requireGodOrAdminAccessContext: async () => ({ session: await session(), roles: ["god"] }),
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool, db } = await import("../src/db/index.ts");
const rows = async (text, values = []) => (await pool.query(text, values)).rows;
const one = async (text, values = []) => (await rows(text, values))[0];
const api = await import("../src/features/evolutions/evolution-execution-service.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const npcs = await import("../src/app/heavens/npcs/actions.ts");
const races = await import("../src/features/races/race-evolution-service.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const { creatureDraftFixture, creatureFormFixture } = await import("./creature-form-fixture.ts");
const { emptyRaceEvolutionTransition } = await import("../src/features/races/race-evolution-transition.ts");
const { emptyEvolutionRequirement } = await import("../src/features/evolutions/evolution-requirements.ts");
const actor = { userId: god, roles: ["god"] };
let campaignId, owner, sourceRace, targetRace, sourceCreature, targetCreature, racePath, creaturePath, itemId;
const allRows = async () => {
  const tables = await rows("select tablename from pg_tables where schemaname='public' order by tablename");
  return Object.fromEntries(await Promise.all(tables.map(async ({ tablename }) => [tablename, await rows(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)])));
};
const command = preview => ({ kind: preview.kind, characterId: preview.characterId, pathId: preview.pathId, expectedVersion: preview.pathVersion,
  reviewToken: preview.reviewToken, idempotencyKey: randomUUID(), confirmedRequirementKeys: [], confirmHealthConsequences: true, confirmReplaceOverrides: true });
const prepare = (kind, id, pathId = kind === "race" ? racePath : creaturePath) => api.previewPersistentEvolution(kind, id, pathId, actor);
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
  await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,0,'worn',2)", [id, itemId]);
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
  sourceRace = (await one("insert into races(name,size,created_by_user_id) values('Execution Human','Medium',$1) returning id", [god])).id;
  targetRace = (await one("insert into races(name,size,base_magic,created_by_user_id) values('Execution Ascended','Large',12,$1) returning id", [god])).id;
  const transition = { ...emptyRaceEvolutionTransition(), attributes: [{ key: "STR", operation: "add", value: 10 }, { key: "CON", operation: "add", value: -15 }], hpMultiplierSteps: { operation: "set", value: 0 }, baseMagicSteps: { operation: "add", value: 2 } };
  racePath = (await races.saveRaceEvolution({ sourceRaceId: sourceRace, destinationRaceId: targetRace, name: "Permanent ascension", description: "", notes: "", transition }, actor))[0].id;
  const source = creatureDraftFixture(); source.core.canonicalName = "Execution Young Drake"; source.forms = [creatureFormFixture()];
  sourceCreature = await creatures.saveCreature(source);
  const destination = creatureDraftFixture(); destination.core.canonicalName = "Execution Adult Drake";
  destination.core.size = "Small"; destination.core.hpMultiplierSteps = 1; destination.core.baseMagicSteps = 4;
  destination.attributes.forEach(row => row.value = 10); destination.forms = [{ ...creatureFormFixture(), key: "adult-form", name: "Adult Form" }];
  destination.attacks = creatureFormFixture().mechanics.attacks.rows; destination.abilities = creatureFormFixture().mechanics.abilities.rows;
  destination.defenses = creatureFormFixture().mechanics.defenses.rows;
  targetCreature = await creatures.saveCreature(destination);
  creaturePath = (await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$2,'Mature permanently') returning id", [sourceCreature.id, targetCreature.id])).id;
  itemId = (await one("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis) values('EXECUTION-HARNESS','Harness','equipment','misc','Gear','Gear',2,'Each') returning id")).id;
});
after(() => pool.end());

test("Race PC and Race NPC execute authored permanent mechanics; only declared rows change; health/gear/history survive", async () => {
  for (const npc of [false, true]) {
    const id = await character("race", npc), initial = await allRows(), preview = await prepare("race", id);
    assert.deepEqual(await allRows(), initial, "preview writes no public rows");
    assert.equal(preview.raceTransition.after.attributes.find(row => row.attributeKey === "STR").value, 40);
    assert.equal(preview.raceTransition.after.attributes.find(row => row.attributeKey === "CON").value, 15);
    assert.equal(preview.afterHealth.totalDamage, 111); assert.equal(preview.afterHealth.total.remainingHp, 0);
    assert.ok(preview.afterHealth.tracks.some(row => row.orphaned && row.key === "old-wing"));
    const result = await api.executePersistentEvolution(command(preview), actor), after = await allRows();
    for (const table of Object.keys(initial)) if (!["campaign_character_profile","campaign_character_attribute","race_evolution_events"].includes(table)) assert.deepEqual(after[table], initial[table], `${table} preserved`);
    const profile = await one("select * from campaign_character_profile where character_id=$1", [id]);
    assert.equal(profile.race_id, targetRace); assert.equal(profile.hp_multiplier_steps, 0); assert.equal(profile.base_magic_steps, 5);
    assert.equal(profile.experience, 7); assert.equal(profile.total_experience, 44); assert.equal(profile.personality, "Unchanged personality");
    assert.equal(result.event.characterId, id); assert.equal(result.event.evidence.afterHealth.totalDamage, 111);
    assert.equal((await api.readEvolutionHistory(id, actor))[0].id, result.event.id);
  }
});

test("Creature replaces complete mechanics using the constructor, preserves exact identity/state/HP Adjustment, and requires override consent", async () => {
  const id = await character("creature"), original = await one("select * from campaign_creature_npc_profile where character_id=$1", [id]);
  await pool.query("update campaign_creature_npc_profile set hp_adjustment=7 where character_id=$1", [id]);
  const unchanged = await prepare("creature", id); assert.equal(unchanged.hasIndividualOverrides, false, "HP Adjustment alone is not an override");
  const edited = JSON.parse(original.current_snapshot_json); edited.attributes[0].value += 7;
  await pool.query("update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1", [id, JSON.stringify(edited)]);
  const preview = await prepare("creature", id), input = command(preview), before = await allRows();
  assert.equal(preview.hasIndividualOverrides, true);
  await assert.rejects(api.executePersistentEvolution({ ...input, confirmReplaceOverrides: false }, actor), /confirm replacing/);
  assert.deepEqual(await allRows(), before);
  const result = await api.executePersistentEvolution(input, actor), after = await allRows();
  for (const table of Object.keys(before)) if (!["campaign_creature_npc_profile","creature_evolution_events"].includes(table)) assert.deepEqual(after[table], before[table], `${table} preserved`);
  const profile = await one("select * from campaign_creature_npc_profile where character_id=$1", [id]);
  const current = JSON.parse(profile.current_snapshot_json), baseline = JSON.parse(profile.baseline_snapshot_json);
  assert.equal(profile.creature_id, targetCreature.id); assert.equal(current.id, targetCreature.id); assert.equal(profile.hp_adjustment, 7);
  assert.equal(current.core.size, "Small"); assert.ok(current.attributes.every(row => row.value === 10));
  assert.equal(current.attacks.length, 1); assert.equal(current.abilities.length, 1); assert.equal(current.defenses.length, 1);
  assert.deepEqual(current.forms.map(row => row.key), ["adult-form"]); assert.equal(baseline.core.hpMultiplierSteps, 1);
  assert.equal(result.event.snapshots.sourceCurrent, JSON.stringify(edited)); assert.equal(result.event.snapshots.sourceBaseline, original.baseline_snapshot_json);
  assert.equal(result.event.snapshots.destinationCurrent, profile.current_snapshot_json);
  const retained = { ...after.campaign_creature_npc_profile.find(row => row.body.character_id === id).body };
  const beforeProfile = before.campaign_creature_npc_profile.find(row => row.body.character_id === id).body;
  const oldRetained = { ...beforeProfile };
  for (const key of ["creature_id", "baseline_snapshot_json", "current_snapshot_json"]) { delete retained[key]; delete oldRetained[key]; }
  assert.deepEqual(retained, oldRetained, "all other individual profile fields survive exactly");
});

test("server rejects Players, Admin-only, foreign GOD, stale cached roles, wrong type/source and all archive boundaries", async () => {
  const id = await character(), preview = await prepare("race", id), input = command(preview), before = await allRows();
  for (const userId of [player, admin, foreign]) {
    await assert.rejects(api.executePersistentEvolution(input, { userId, roles: ["god","admin"] }), /Campaign-owning/);
    await assert.rejects(api.readEvolutionHistory(id, { userId, roles: ["god"] }), /Campaign-owning/);
  }
  await assert.rejects(api.previewPersistentEvolution("creature", id, creaturePath, actor), /existing Race or Creature type/);
  await assert.rejects(api.executePersistentEvolution({ ...input, characterId: -id }, actor), /saved record/);
  assert.deepEqual(await allRows(), before);
  await pool.query("delete from user_role where user_id=$1", [god]);
  await assert.rejects(api.executePersistentEvolution(input, actor), /Campaign-owning/);
  await pool.query("insert into user_role(user_id,role) values($1,'god')", [god]);
  for (const [table, recordId] of [["campaign_character", id], ["campaign", campaignId], ["races", sourceRace], ["races", targetRace]]) {
    await pool.query(`update ${table} set archived_at=now() where id=$1`, [recordId]);
    await assert.rejects(api.executePersistentEvolution(input, actor), /Restore|active/);
    await pool.query(`update ${table} set archived_at=null where id=$1`, [recordId]);
  }
});

test("durable duplicate and concurrent retries produce one event; contradictory input and fresh-key stale source fail", async () => {
  const id = await character(), input = command(await prepare("race", id));
  const results = await Promise.all([api.executePersistentEvolution(input, actor), api.executePersistentEvolution(input, actor)]);
  assert.equal(results[0].event.id, results[1].event.id); assert.equal(results.filter(row => row.replayed).length, 1);
  const state = await allRows(); assert.equal((await api.executePersistentEvolution(input, actor)).replayed, true); assert.deepEqual(await allRows(), state);
  await assert.rejects(api.executePersistentEvolution({ ...input, confirmReplaceOverrides: !input.confirmReplaceOverrides }, actor), /different input/);
  await assert.rejects(api.executePersistentEvolution({ ...input, idempotencyKey: randomUUID() }, actor), /current Race/);
  assert.equal((await one("select count(*)::int n from race_evolution_events where character_id=$1", [id])).n, 1);
});

test("manual alternatives use exact keys without bypassing automatic failures; unknown automatic facts cannot be approved", async () => {
  const path = (await one("insert into race_evolution_paths(source_race_id,destination_race_id,name,requirement_mode) values($1,$2,'Manual route','requirements') returning id", [sourceRace,targetRace])).id;
  const save = requirements => races.saveEvolutionRequirements({ sourceRaceId: sourceRace, pathId: path, expectedVersion: 1, requirements: { mode: "requirements", requirements } }, actor);
  await save([{ ...emptyEvolutionRequirement("age", 0, "age"), requiredValue: 100 }, { ...emptyEvolutionRequirement("trial", 1), notes: "Survived the Ash Trial" }]);
  const id = await character(), preview = await prepare("race", id, path), input = command(preview);
  await assert.rejects(api.executePersistentEvolution(input, actor), /No complete group/);
  await assert.rejects(api.executePersistentEvolution({ ...input, confirmedRequirementKeys: ["age"] }, actor), /exact manual/);
  const result = await api.executePersistentEvolution({ ...input, confirmedRequirementKeys: ["trial"] }, actor);
  assert.deepEqual(result.event.evidence.confirmedRequirementKeys, ["trial"]);
  const missing = await character(); await pool.query("update campaign_character_profile set age=null where character_id=$1", [missing]);
  const missingPreview = await prepare("race", missing, path);
  assert.equal(missingPreview.evaluation.groups[0].requirements[0].confirmable, undefined);
  await assert.rejects(api.executePersistentEvolution({ ...command(missingPreview), confirmedRequirementKeys: ["age"] }, actor), /exact manual/);
});

test("execution revalidates revision, destination mechanics, individual health and owner Item custody after preview", async () => {
  const id = await character(), input = command(await prepare("race", id));
  await pool.query("update race_evolution_paths set version=version+1 where id=$1", [racePath]);
  await assert.rejects(api.executePersistentEvolution(input, actor), /path changed/);
  let fresh = command(await prepare("race", id));
  await pool.query("update campaign_character_active_health set total_damage=112 where character_id=$1", [id]);
  await assert.rejects(api.executePersistentEvolution(fresh, actor), /facts or destination mechanics changed/);
  fresh = command(await prepare("race", id));
  await pool.query("update races set name='Changed destination' where id=$1", [targetRace]);
  await assert.rejects(api.executePersistentEvolution(fresh, actor), /facts or destination mechanics changed/);
  const npc = await character("creature");
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,1,2)", [owner,itemId]);
  const p = (await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name,requirement_mode) values($1,$2,'Owner token','requirements') returning id", [sourceCreature.id,targetCreature.id])).id;
  await pool.query("insert into creature_evolution_requirements(path_id,requirement_key,group_number,sort_order,requirement_type,operator,item_id,item_holder) values($1,'token',0,0,'item','possessed',$2,'owner')", [p,itemId]);
  const ownerInput = command(await prepare("creature", npc,p));
  await pool.query("delete from campaign_character_item where character_id=$1 and item_id=$2",[owner,itemId]);
  await assert.rejects(api.executePersistentEvolution(ownerInput, actor), /No complete group/);
});

async function encounterFor(id, status = "planned", type = "social") {
  const session = (await one("insert into campaign_session(campaign_id,title,sequence_number) select $1,'Evolution Session',coalesce(max(sequence_number),0)+1 from campaign_session where campaign_id=$1 returning id",[campaignId])).id;
  const scene = (await one("insert into campaign_session_scene(campaign_id,session_id,title,sequence_number) values($1,$2,'Evolution Scene',1) returning id",[campaignId,session])).id;
  const encounter = (await one("insert into campaign_session_encounter(campaign_id,session_id,scene_id,title,sequence_number,status,encounter_type,started_at,completed_at) values($1,$2,$3,'Evolution Encounter',1,$4::campaign_session_encounter_status,$5,case when $4::text <> 'planned' then now() end,case when $4::text='completed' then now() end) returning id",[campaignId,session,scene,status,type])).id;
  await pool.query("insert into campaign_session_encounter_participant(campaign_id,session_id,scene_id,encounter_id,character_id) values($1,$2,$3,$4,$5)",[campaignId,session,scene,encounter,id]);
  return encounter;
}
test("every active Encounter blocks all persistent types; planned identity and completed history remain unchanged", async () => {
  for (const kind of ["race", "creature"]) for (const type of ["combat","social","chase","exploration","other"]) {
    const id = await character(kind), encounter = await encounterFor(id,"active",type), input = command(await prepare(kind,id));
    assert.ok((await prepare(kind,id)).blockers.length);
    await assert.rejects(api.executePersistentEvolution(input,actor), /active Encounter/);
    await pool.query("update campaign_session_encounter set frozen_at=now() where id=$1",[encounter]);
    await assert.rejects(api.executePersistentEvolution(input,actor), /active Encounter/);
  }
  const id = await character(); await encounterFor(id); await encounterFor(id,"completed");
  const before = await allRows(); await api.executePersistentEvolution(command(await prepare("race",id)),actor); const after = await allRows();
  for(const table of Object.keys(before).filter(name=>name.startsWith("campaign_session"))) assert.deepEqual(after[table],before[table],table);
  const prepared = await character(), encounter = await encounterFor(prepared);
  await pool.query("update campaign_session_encounter_participant set local_state_json='{}' where encounter_id=$1",[encounter]);
  await assert.rejects(api.executePersistentEvolution(command(await prepare("race",prepared)),actor),/prepared runtime state/);
});

test("concurrent Encounter start/enrollment and fact writers cannot race through the execution fence", async () => {
  const id = await character(), encounter = await encounterFor(id), input = command(await prepare("race",id));
  const client = await pool.connect();
  try {
    await client.query("begin"); await client.query("update campaign_session_encounter set status='active',started_at=now() where id=$1",[encounter]);
    await assert.rejects(api.executePersistentEvolution(input,actor),/another operation/);
    await client.query("commit"); await assert.rejects(api.executePersistentEvolution(input,actor),/active Encounter/);
    const fresh = await character(), prepared = command(await prepare("race",fresh));
    for (const table of ["campaign_session_encounter_participant", "campaign_character_item", "campaign_character_active_condition", "campaign_character_profile", "race_evolution_paths", "creatures", "user_role"]) {
      await client.query("begin"); await client.query(`lock table ${table} in row exclusive mode`);
      await assert.rejects(api.executePersistentEvolution(prepared,actor),/another operation/); await client.query("rollback");
    }
    // Reverse direction: the exact lock used by execution prevents new enrollment/start.
    const { lockEvolutionFacts } = await import("../src/features/evolutions/evolution-execution-locks.ts");
    await db.transaction(async tx => {
      await lockEvolutionFacts(tx); await client.query("begin"); await client.query("set local lock_timeout='100ms'");
      await assert.rejects(client.query("update campaign_session_encounter set description='Concurrent start context' where id=$1",[encounter]),error=>error.code==="55P03"); await client.query("rollback");
    });
    assert.equal((await one("select count(*)::int n from race_evolution_events where character_id=$1",[fresh])).n,0);
  } finally { await client.query("rollback"); client.release(); }
});

test("event insert failure rolls back all mechanics; immutable restrictive history survives path edits and archives", async () => {
  const id = await character(), input = command(await prepare("race",id)), before = await allRows();
  await pool.query("create function evolution_test_failure() returns trigger language plpgsql as $$ begin raise exception 'test event failure'; end $$");
  await pool.query("create trigger evolution_test_failure before insert on race_evolution_events for each row execute function evolution_test_failure()");
  try { await assert.rejects(api.executePersistentEvolution(input,actor), /Failed query|test event failure/); } finally { await pool.query("drop trigger evolution_test_failure on race_evolution_events"); await pool.query("drop function evolution_test_failure()"); }
  assert.deepEqual(await allRows(),before,"transaction rolls back assignments, Attributes and step changes");
  const result = await api.executePersistentEvolution(input,actor), event = result.event;
  await assert.rejects(pool.query("update race_evolution_events set path_version=999 where id=$1",[event.id]), /immutable/);
  for(const [table,key] of [["race_evolution_paths",racePath],["races",sourceRace],["races",targetRace],["campaign_character",id]]) await assert.rejects(pool.query(`delete from ${table} where id=$1`,[key]), error=>["23503","23001"].includes(error.code));
  await pool.query("update race_evolution_paths set name='Changed later',version=version+1 where id=$1",[racePath]);
  await pool.query("update campaign_character set archived_at=now() where id=$1",[id]);
  assert.deepEqual((await api.readEvolutionHistory(id,actor))[0],event);
  const dependencies = await lifecycle.previewLifecycleEntityForActor({ entityKind:"player-character",entityId:id },actor);
  assert.ok(JSON.stringify(dependencies).includes("Persistent Evolution history"));
});

test("multi-stage execution and explicit reverse paths keep the same individual; transition authoring clones independently", async () => {
  for (const kind of ["race", "creature"]) {
    const id = await character(kind);
    const first = await api.executePersistentEvolution(command(await prepare(kind,id)),actor);
    const reverse = kind === "race"
      ? (await one("insert into race_evolution_paths(source_race_id,destination_race_id,name) values($1,$2,'Return with no saved-value changes') returning id",[targetRace,sourceRace])).id
      : (await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$2,'Return to young definition') returning id",[targetCreature.id,sourceCreature.id])).id;
    assert.ok((await api.readNextEvolutionPaths(kind,id,actor)).some(path=>path.id===reverse));
    const secondPreview = await prepare(kind,id,reverse), second = await api.executePersistentEvolution(command(secondPreview),actor);
    assert.equal(second.event.characterId,first.event.characterId);
    assert.equal((await api.readEvolutionHistory(id,actor)).length,2);
    assert.equal(second.event.evidence.afterHealth.totalDamage,111);
    if(kind === "race") assert.deepEqual(second.event.evidence.raceTransition.before,second.event.evidence.raceTransition.after);
  }
  const raceActions=await import("../src/app/heavens/races/actions.ts");
  const clone=await raceActions.createRaceVariant(sourceRace,"Execution transition clone");
  const original=(await races.readRaceEvolutionAuthoring(sourceRace,actor)).paths.find(path=>path.id===racePath);
  const copied=(await races.readRaceEvolutionAuthoring(clone.id,actor)).paths.find(path=>path.destinationRaceId===targetRace);
  assert.deepEqual(copied.transition,original.transition);assert.notEqual(copied.id,original.id);
  await races.saveRaceEvolution({...copied,expectedVersion:copied.version,transition:emptyRaceEvolutionTransition()},actor);
  assert.deepEqual((await races.readRaceEvolutionAuthoring(sourceRace,actor)).paths.find(path=>path.id===racePath).transition,original.transition);
});

test("fresh automatic facts defeat old eligible previews, including XP, Skills, conditions and invalid authored results", async () => {
  const skill=(await one("insert into skill(name,classification,tier) values('Execution prerequisite','Physical',1) returning id")).id;
  for(const type of ["current-experience","total-experience","skill","condition"]) {
    const id=await character(), path=(await one("insert into race_evolution_paths(source_race_id,destination_race_id,name) values($1,$2,$3) returning id",[sourceRace,targetRace,`Revalidate ${type}`])).id;
    const requirement={...emptyEvolutionRequirement(type,0,type),...(type === "skill" ? {skillId:skill} : type === "condition" ? {conditionName:"Ready"} : {requiredValue:1})};
    await races.saveEvolutionRequirements({sourceRaceId:sourceRace,pathId:path,expectedVersion:1,requirements:{mode:"requirements",requirements:[requirement]}},actor);
    if(type === "skill") await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,5)",[id,skill]);
    if(type === "condition") {
      const effects=await import("../src/features/active-state/active-effects-service.ts");
      await effects.addManualCondition({characterId:id,name:"Ready",description:"Prerequisite",duration:{kind:"until-removed"}});
    }
    const preview=await prepare("race",id,path);assert.equal(preview.evaluation.status,"eligible");
    if(type === "skill") await pool.query("delete from campaign_character_skill_allocation where character_id=$1",[id]);
    else if(type === "condition") await pool.query("delete from campaign_character_active_condition where character_id=$1",[id]);
    else await pool.query(`update campaign_character_profile set ${type === "current-experience" ? "experience" : "total_experience"}=0 where character_id=$1`,[id]);
    await assert.rejects(api.executePersistentEvolution(command(preview),actor),/No complete group/);
  }
  const id=await character(), bad=(await races.saveRaceEvolution({sourceRaceId:sourceRace,destinationRaceId:targetRace,name:"Invalid result",description:"",notes:"",transition:{...emptyRaceEvolutionTransition(),attributes:[{key:"STR",operation:"add",value:-100}]}},actor)).find(path=>path.name==="Invalid result");
  const before=await allRows();await assert.rejects(prepare("race",id,bad.id),/invalid STR/);assert.deepEqual(await allRows(),before);
});

test("explicit Campaign graph deletion removes only its Evolution history and preserves shared definitions and other events", async () => {
  const name="Evolution history deletion rehearsal";
  const isolated=(await one("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values($1,100,100,50,10,100,0,'Credits','Assigned',$2) returning id",[name,god])).id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2),($1,$3)",[isolated,player,god]);
  for(const kind of ["race","creature"]) {
    const id=await character(kind);
    await pool.query("update campaign_character set owner_character_id=null,campaign_id=$2 where id=$1",[id,isolated]);
    await api.executePersistentEvolution(command(await prepare(kind,id)),actor);
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

import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.equal(process.env.SERRIAN_EVOLUTION_DISPOSABLE, "true");
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_evolution_dev$/);
const actors = new AsyncLocalStorage();
const god = "requirements-god", admin = "requirements-admin", player = "requirements-player", foreign = "requirements-foreign";
const session = async () => ({ user: { id: actors.getStore() ?? god } });
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href, { namedExports: {
  requireSession: session, requireGod: session, requirePlayer: session,
  requireGodOrAdminAccessContext: async () => {
    const current = await session();
    const roles = (await rows("select role from user_role where user_id=$1", [current.user.id])).map(row => row.role);
    if (!roles.some(role => role === "admin" || role === "god")) throw new Error("Authoring access required.");
    return { session: current, roles };
  },
} });
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
const { pool } = await import("../src/db/index.ts");
const rows = async (text, values = []) => (await pool.query(text, values)).rows;
const one = async (text, values = []) => (await rows(text, values))[0];
const actions = await import("../src/app/heavens/creatures/evolution-actions.ts");
const creatures = await import("../src/app/heavens/creatures/actions.ts");
const npcs = await import("../src/app/heavens/npcs/actions.ts");
const lifecycle = await import("../src/features/lifecycle/lifecycle-service.ts");
const effects = await import("../src/features/active-state/active-effects-service.ts");
const { creatureDraftFixture, creatureFormFixture } = await import("./creature-form-fixture.ts");
const actor = { userId: god, roles: ["god"] };
const target = id => ({ entityKind: "creature", entityId: id });
const definition = async name => {
  const draft = creatureDraftFixture(); draft.core.canonicalName = name; draft.forms = [creatureFormFixture()];
  return creatures.saveCreature(draft);
};
const list = async id => (await actions.getCreatureEvolutions(id)).paths;
const add = async (source, destination, name = "Mature") => actions.saveEvolutionPath({ sourceCreatureId: source.id, destinationCreatureId: destination.id, name, description: "Description", notes: "Notes" });
const edit = (path, patch = {}) => actions.saveEvolutionPath({ ...path, expectedVersion: path.version, ...patch });
const snapshot = async () => {
  const tables = await rows("select tablename from pg_tables where schemaname='public'  order by tablename");
  return Object.fromEntries(await Promise.all(tables.map(async ({ tablename }) => [tablename, await rows(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)])));
};
const races = await import("../src/app/heavens/races/actions.ts");
const raceActions = await import("../src/app/heavens/races/evolution-actions.ts");
const { emptyRaceForm } = await import("../src/features/races/race-forms.ts");
const { emptyEvolutionRequirement } = await import("../src/features/evolutions/evolution-requirements.ts");
const req = (type, patch={}) => ({...emptyEvolutionRequirement(type,0,type),...patch});
const requirements = rows => ({mode:rows.length ? "requirements" : "unrestricted", requirements:rows});
const saveReq = async (api, sourceField, sourceId, input) => {
  const path = (await (sourceField==="sourceCreatureId" ? api.getCreatureEvolutions(sourceId) : api.getRaceEvolutions(sourceId))).paths[0];
  return api.saveEvolutionPathRequirements({[sourceField]:sourceId,pathId:path.id,expectedVersion:path.version,requirements:requirements(input)});
};
let young,adult,individual,ownerId,secondOwner,campaignId,skillId,itemId,abilityId,raceSource,raceTarget,raceOther,pc,raceNpc;
const raceDefinition = async name => {
  const {id}=await one("insert into races(name,size,created_by_user_id) values($1,'Medium',$2) returning id",[name,god]);
  return races.saveRace({...await races.getRace(id),forms:[{...emptyRaceForm("ascended"),name:"Ascended Form"}]});
};
const raceAdd = (source,destination,name="Ascend") => raceActions.saveEvolutionPath({sourceRaceId:source.id,destinationRaceId:destination.id,name,description:"",notes:""});
const raceList = async id => (await raceActions.getRaceEvolutions(id)).paths;
before(async()=>{
  for(const [id,role] of [[god,"god"],[admin,"admin"],[player,"player"],[foreign,"god"]]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)',[id,`${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)",[id,role]);
  }
  skillId=(await one("insert into skill(name,classification,tier,created_by_user_id) values('Evolution Tracking','Physical',1,$1) returning id",[god])).id;
  itemId=(await one("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis,created_by_user_id) values('REQUIREMENT-TOKEN','Evolution Token','equipment','misc','Gear','Gear',1,'Each',$1) returning id",[god])).id;
  abilityId=(await one("insert into derived_ability(name,description,mechanical_effect,acquisition_type,activation_type,created_by_user_id) values('Evolution Gift','','','awarded','passive',$1) returning id",[god])).id;
  const draft=creatureDraftFixture();draft.core.canonicalName="Requirements Young Drake";draft.forms=[creatureFormFixture()];
  draft.abilities=draft.forms[0].mechanics.abilities.rows;
  draft.skillLinks=[{skillId,skillName:"Evolution Tracking",rank:"99",skillClassification:"Physical",notes:"",sortOrder:0}];
  young=await creatures.saveCreature(draft);adult=await definition("Requirements Adult Drake");
  raceSource=await raceDefinition("Evolution Human");raceTarget=await raceDefinition("Evolution Ascended Human");raceOther=await raceDefinition("Evolution Elf");
  await add(young,adult);await raceAdd(raceSource,raceTarget);
  campaignId=(await one("insert into campaign(name,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,created_by_user_id) values('Requirements Campaign',100,100,50,10,100,0,'Credits','Assigned',$1) returning id",[god])).id;
  await pool.query("insert into campaign_player(campaign_id,user_id) values($1,$2)",[campaignId,player]);
  ownerId=(await one("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Requirements owner') returning id",[campaignId,player])).id;
  secondOwner=(await one("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Other owner') returning id",[campaignId,player])).id;
  individual=(await npcs.createNpc({campaignId,origin:"creature",buildMode:"detailed",sourceId:young.id,name:"Requirements Ember",roleLabel:"Companion",notes:"History",ownerCharacterId:ownerId})).characterId;
  pc=(await one("insert into campaign_character(campaign_id,player_user_id,name) values($1,$2,'Evolution PC') returning id",[campaignId,player])).id;
  raceNpc=(await one("insert into campaign_character(campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode) values($1,$2,'Evolution Race NPC',true,'race','detailed') returning id",[campaignId,god])).id;
  for(const id of [individual,pc,raceNpc]) await pool.query("insert into campaign_character_profile(character_id,race_id,age,experience,total_experience) values($1,$2,19,7,42) on conflict(character_id) do update set age=19,experience=7,total_experience=42",[id,id===individual?null:raceSource.id]);
  await pool.query("insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,5)",[pc,skillId]);
  await pool.query("insert into campaign_character_item(character_id,item_id,quantity,unit_cost_credits) values($1,$2,1,1),($3,$2,1,1)",[pc,itemId,ownerId]);
  await effects.addManualCondition({characterId:individual,name:"Moon Blessed",description:"Unresolved",duration:{kind:"until-removed"}});
  await effects.addManualCondition({characterId:pc,name:"Moon Blessed",description:"Unresolved",duration:{kind:"until-removed"}});
});
after(()=>pool.end());

test("Creature requirements persist with stable IDs and path version; preview reads current individual facts without any database writes",async()=>{
  const automatic=[req("age",{requiredValue:18}),req("total-experience",{sortOrder:1,requiredValue:40}),req("skill",{sortOrder:2,skillId}),req("creature-ability",{sortOrder:3,creatureAbilityCanonicalId:young.abilities[0].canonicalId}),req("condition",{sortOrder:4,conditionName:" moon   blessed "}),req("item",{sortOrder:5,itemId,itemHolder:"owner"}),req("form-access",{sortOrder:6,creatureFormKey:young.forms[0].key})];
  const [initial]=await list(young.id), stateBefore=await creatures.getCreature(young.id);
  const [path]=await saveReq(actions,"sourceCreatureId",young.id,automatic);
  assert.equal(path.id,initial.id);assert.equal(path.version,initial.version+1);
  assert.deepEqual(await creatures.getCreature(young.id),stateBefore);
  const saved=await actions.getEvolutionRequirements(young.id,path.id);
  assert.equal(saved.requirements.length,automatic.length);assert.ok(saved.requirements.every(row=>row.id>0));
  const before=await snapshot();
  const result=await actions.previewEvolutionEligibility(individual,path.id);
  assert.equal(result.status,"eligible",JSON.stringify(result));assert.equal(result.owner,"creature");
  assert.deepEqual(await snapshot(),before,"every public row including encounter state remains unchanged");
  const [changed]=await saveReq(actions,"sourceCreatureId",young.id,automatic.map(row=>({...row,notes:"Retained identity"})));
  assert.deepEqual((await actions.getEvolutionRequirements(young.id,path.id)).requirements.map(row=>row.id),saved.requirements.map(row=>row.id));
  await assert.rejects(actions.saveEvolutionPathRequirements({sourceCreatureId:young.id,pathId:path.id,expectedVersion:path.version,requirements:requirements([])}),/changed or was removed/);
  await assert.rejects(edit(path),/changed or was removed/);
  const outcomes=await Promise.allSettled([actions.saveEvolutionPathRequirements({sourceCreatureId:young.id,pathId:path.id,expectedVersion:changed.version,requirements:requirements(automatic)}),actions.saveEvolutionPathRequirements({sourceCreatureId:young.id,pathId:path.id,expectedVersion:changed.version,requirements:requirements([])})]);
  assert.equal(outcomes.filter(row=>row.status==="fulfilled").length,1);
});

test("Creature preview respects individual Ability edits, saved XP, unknown age, conditions, owner transfer and archive/source restrictions",async()=>{
  let [path]=await saveReq(actions,"sourceCreatureId",young.id,[req("creature-ability",{creatureAbilityCanonicalId:young.abilities[0].canonicalId})]);
  const profile=await one("select current_snapshot_json from campaign_creature_npc_profile where character_id=$1",[individual]);
  const current=JSON.parse(profile.current_snapshot_json);current.abilities=[];
  await pool.query("update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1",[individual,JSON.stringify(current)]);
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"not-eligible");
  await pool.query("update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1",[individual,profile.current_snapshot_json]);
  [path]=await saveReq(actions,"sourceCreatureId",young.id,[req("current-experience",{requiredValue:20})]);
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"not-eligible");
  await saveReq(actions,"sourceCreatureId",young.id,[req("age",{requiredValue:1})]);
  await pool.query("update campaign_character_profile set age=null where character_id=$1",[individual]);
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"god-review");
  await saveReq(actions,"sourceCreatureId",young.id,[req("condition",{conditionName:"Moon Blessed",operator:"not-possessed"})]);
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"not-eligible");
  await saveReq(actions,"sourceCreatureId",young.id,[req("item",{itemId,itemHolder:"owner"})]);
  const before=await actions.getEvolutionRequirements(young.id,path.id);
  const {db}=await import("../src/db/index.ts");const {setCreatureOwnerInTransaction}=await import("../src/features/creatures/creature-ownership-service.ts");
  await db.transaction(tx=>setCreatureOwnerInTransaction(tx,{campaignId,characterId:individual,ownerCharacterId:secondOwner,expectedOwnerCharacterId:ownerId}));
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"not-eligible");
  assert.deepEqual(await actions.getEvolutionRequirements(young.id,path.id),before);
  await assert.rejects(actions.previewEvolutionEligibility(pc,path.id),/Campaign G.O.D./);
  const [foreignPath]=await add(adult,young,"Reverse");
  await assert.rejects(actions.previewEvolutionEligibility(individual,foreignPath.id),/current Creature/);
  await saveReq(actions,"sourceCreatureId",young.id,[]);
  await lifecycle.archiveLifecycleEntityForActor(target(adult.id),actor);
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"not-eligible");
  await lifecycle.restoreLifecycleEntityForActor(target(adult.id),actor);
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"eligible");
});

test("Race paths support branching/chains, stale versions, exact variants and independent requirements clones",async()=>{
  const early=await races.createRaceVariant(raceSource.id,"Evolution Early Human");
  const source=await raceDefinition("Evolution Branch Human"), a=await raceDefinition("Evolution Branch A"), b=await raceDefinition("Evolution Branch B");
  const blank=await races.createRaceVariant(source.id,"Evolution No Paths Yet");
  assert.deepEqual(await raceList(source.id),[]);assert.deepEqual(await raceList(blank.id),[],"Forms and ancestry imply no Evolution");
  const [first]=await raceAdd(source,a,"Branch A");let paths=await raceAdd(source,b,"Branch B");await raceAdd(a,b,"Chain");
  assert.equal(paths.length,2);assert.equal((await raceList(a.id))[0].destinationRaceId,b.id);
  assert.deepEqual(await raceList(blank.id),[],"no dynamic inheritance");
  paths=await raceActions.reorderEvolutionPaths({sourceRaceId:source.id,paths:paths.toReversed().map(({id,version})=>({id,version}))});
  assert.deepEqual(paths.map(row=>row.name),["Branch B","Branch A"]);
  await assert.rejects(raceAdd(source,source),/itself/);
  await assert.rejects(raceActions.saveEvolutionPath({...first,expectedVersion:first.version}),/changed or was removed/);
  await saveReq(raceActions,"sourceRaceId",source.id,[req("form-access",{raceFormKey:"ascended"}),req("skill",{sortOrder:1,skillId}),req("derived-ability",{sortOrder:2,derivedAbilityId:abilityId})]);
  const original=(await raceList(source.id))[0], originalReq=await raceActions.getEvolutionRequirements(source.id,original.id);
  const clone=await races.createRaceVariant(source.id,"Evolution Independent Human");
  const copied=(await raceList(clone.id))[0], copiedReq=await raceActions.getEvolutionRequirements(clone.id,copied.id);
  assert.notEqual(copied.id,original.id);assert.equal(copied.destinationRaceId,original.destinationRaceId);
  assert.ok(copiedReq.requirements.every(row=>!originalReq.requirements.some(old=>old.id===row.id)));
  assert.equal(copiedReq.requirements[0].raceFormKey,"ascended");assert.equal(copiedReq.requirements[1].skillId,skillId);assert.equal(copiedReq.requirements[2].derivedAbilityId,abilityId);
  await saveReq(raceActions,"sourceRaceId",clone.id,[req("manual",{notes:"Independent review"})]);
  assert.deepEqual(await raceActions.getEvolutionRequirements(source.id,original.id),originalReq);
  await assert.rejects(races.saveRace({...await races.getRace(source.id),forms:[]}),/Evolution requirement/);
  await raceActions.removeEvolutionPath({sourceRaceId:clone.id,id:copied.id,expectedVersion:(await raceList(clone.id))[0].version});
  assert.equal((await raceList(clone.id)).length,1);
  assert.equal((await raceList(early.id)).length,1);
});

test("Race PC and Race NPC previews use exact current Race, Character points, grants, Derived Abilities and Form Access; no state changes",async()=>{
  const automatic=[req("age",{requiredValue:18}),req("total-experience",{sortOrder:1,requiredValue:40}),req("skill",{sortOrder:2,skillId,operator:"gte",requiredValue:5}),req("item",{sortOrder:3,itemId,itemHolder:"character"}),req("condition",{sortOrder:4,conditionName:"moon blessed"}),req("form-access",{sortOrder:5,raceFormKey:"ascended"})];
  const [path]=await saveReq(raceActions,"sourceRaceId",raceSource.id,automatic);
  const before=await snapshot(), result=await raceActions.previewEvolutionEligibility(pc,path.id);
  assert.equal(result.status,"eligible",JSON.stringify(result));assert.equal(result.owner,"race");assert.deepEqual(await snapshot(),before);
  const candidates=await raceActions.findEvolutionPreviewIndividuals(raceSource.id,"");assert.ok(candidates.some(row=>row.id===pc));assert.ok(candidates.some(row=>row.id===raceNpc));assert.ok(!candidates.some(row=>row.id===individual));
  await saveReq(raceActions,"sourceRaceId",raceSource.id,[]);
  assert.equal((await raceActions.previewEvolutionEligibility(raceNpc,path.id)).status,"eligible");
  await pool.query("update campaign_character_profile set race_id=$2 where character_id=$1",[pc,raceOther.id]);
  await assert.rejects(raceActions.previewEvolutionEligibility(pc,path.id),/current Race/);
  await pool.query("update campaign_character_profile set race_id=$2 where character_id=$1",[pc,raceSource.id]);
  await assert.rejects(raceActions.previewEvolutionEligibility(individual,path.id),/Campaign G.O.D./);
  await saveReq(raceActions,"sourceRaceId",raceSource.id,[req("derived-ability",{derivedAbilityId:abilityId})]);
  assert.equal((await raceActions.previewEvolutionEligibility(pc,path.id)).status,"not-eligible");
  const derived=await import("../src/features/derived-abilities/character-derived-ability-service.ts");
  await derived.grantCharacterDerivedAbility({characterId:pc,derivedAbilityId:abilityId,notes:"Evolution test"});
  assert.equal((await raceActions.previewEvolutionEligibility(pc,path.id)).status,"eligible");
  await pool.query("insert into race_skill_links(race_id,skill_id,link_type,value,sort_order) values($1,$2,'Bonus',0,0)",[raceSource.id,skillId]);
  await saveReq(raceActions,"sourceRaceId",raceSource.id,[req("skill",{skillId})]);
  assert.equal((await raceActions.previewEvolutionEligibility(raceNpc,path.id)).status,"eligible","Race grants count as possession");
  await saveReq(raceActions,"sourceRaceId",raceSource.id,[req("skill",{skillId,operator:"gte",requiredValue:1})]);
  assert.equal((await raceActions.previewEvolutionEligibility(raceNpc,path.id)).status,"not-eligible","grants are not purchased points");
  await saveReq(raceActions,"sourceRaceId",raceSource.id,[]);
});

test("both owner types reject unauthorized authoring and private preview, forged references and malformed requirements",async()=>{
  for(const [api,field,sourceId,entityId] of [[actions,"sourceCreatureId",young.id,individual],[raceActions,"sourceRaceId",raceSource.id,pc]]){
    const [path]=field==="sourceCreatureId"?await list(sourceId):await raceList(sourceId);
    for(const user of [player,foreign]) {
      await assert.rejects(actors.run(user,()=>api.saveEvolutionPathRequirements({[field]:sourceId,pathId:path.id,expectedVersion:path.version,requirements:requirements([req("manual",{notes:"Forbidden"})])})),/access required|creator or an administrator/);
      await assert.rejects(actors.run(user,()=>api.previewEvolutionEligibility(entityId,path.id)),/access required|Campaign G.O.D./);
    }
    for(const rows of [[req("skill",{skillId:2147483647})],[req("item",{itemId:2147483647,itemHolder:field==="sourceRaceId"?"character":"creature"})],[req("manual")]]) await assert.rejects(saveReq(api,field,sourceId,rows));
    await assert.rejects(api.saveEvolutionPathRequirements({[field]:sourceId,pathId:path.id,expectedVersion:path.version,requirements:{mode:"requirements",requirements:[]}}),/at least one/);
  }
  await assert.rejects(saveReq(raceActions,"sourceRaceId",raceSource.id,[req("creature-ability",{creatureAbilityCanonicalId:young.abilities[0].canonicalId})]));
  await assert.rejects(saveReq(actions,"sourceCreatureId",young.id,[req("form-access",{raceFormKey:"ascended"})]));
});

test("Form qualification uses Character access and frozen Creature access, with manual runtime facts remaining review",async()=>{
  const {emptyFormAccessRequirement}=await import("../src/features/forms/form-access.ts");
  const raceDraft=await races.getRace(raceSource.id);
  const access={mode:"requirements",requirements:[{...emptyFormAccessRequirement("points",0,"skill"),skillId,operator:"gte",requiredValue:6}]};
  await races.saveRace({...raceDraft,forms:raceDraft.forms.map(form=>({...form,access}))});
  const [path]=await saveReq(raceActions,"sourceRaceId",raceSource.id,[req("form-access",{raceFormKey:"ascended"})]);
  assert.equal((await raceActions.previewEvolutionEligibility(pc,path.id)).status,"not-eligible");
  await pool.query("update campaign_character_skill_allocation set points=6 where character_id=$1 and skill_id=$2",[pc,skillId]);
  assert.equal((await raceActions.previewEvolutionEligibility(pc,path.id)).status,"eligible");
  const [creaturePath]=await saveReq(actions,"sourceCreatureId",young.id,[req("form-access",{creatureFormKey:young.forms[0].key})]);
  const stored=await one("select current_snapshot_json from campaign_creature_npc_profile where character_id=$1",[individual]);
  const current=JSON.parse(stored.current_snapshot_json);
  current.forms[0].access={mode:"requirements",requirements:[{...emptyFormAccessRequirement("story",0,"manual"),notes:"Confirm moonrise"}]};
  await pool.query("update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1",[individual,JSON.stringify(current)]);
  assert.equal((await actions.previewEvolutionEligibility(individual,creaturePath.id)).status,"god-review","frozen access overrides unrestricted master");
  await pool.query("update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1",[individual,stored.current_snapshot_json]);
  await saveReq(raceActions,"sourceRaceId",raceSource.id,[req("manual",{manualCategory:"current-form",notes:"Must currently be Ascended"})]);
  assert.equal((await raceActions.previewEvolutionEligibility(pc,path.id)).status,"god-review");
});

test("inventory prerequisites respect actual holder, exact instances, custody and retirement without consumption",async()=>{
  const [path]=await saveReq(actions,"sourceCreatureId",young.id,[req("item",{itemId,itemHolder:"creature"})]);
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"not-eligible");
  const {id}=await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,0,'worn',1) returning id",[individual,itemId]);
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"eligible","equipment holder is the individual NPC");
  const before=await snapshot();await actions.previewEvolutionEligibility(individual,path.id);assert.deepEqual(await snapshot(),before);
  await pool.query("update campaign_character_item_instance set equipment_state='inactive' where id=$1",[id]);
  for (const status of ["dropped","lost","stolen"]) {
    await pool.query("insert into inventory_instance_custody(instance_id,character_id,item_id,status,actor_user_id) values($1,$2,$3,$4,$5) on conflict(instance_id) do update set status=excluded.status",[id,individual,itemId,status,god]);
    assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"not-eligible");
  }
  await pool.query("delete from inventory_instance_custody where instance_id=$1",[id]);
  await pool.query("update campaign_character_item_instance set retired_at=now(),retirement_reason='Consumed previously' where id=$1",[id]);
  assert.equal((await actions.previewEvolutionEligibility(individual,path.id)).status,"not-eligible");
});

test("Creature clones remap normal Ability and owner-local Form references with independent requirement identities",async()=>{
  const [path]=await saveReq(actions,"sourceCreatureId",young.id,[req("creature-ability",{creatureAbilityCanonicalId:young.abilities[0].canonicalId}),req("form-access",{sortOrder:1,creatureFormKey:young.forms[0].key}),req("item",{sortOrder:2,itemId,itemHolder:"creature"})]);
  const original=await actions.getEvolutionRequirements(young.id,path.id), clone=await creatures.createDerivedCreature(young.id,"Requirements Clone");
  const [copied]=await list(clone.id), copiedReq=await actions.getEvolutionRequirements(clone.id,copied.id);
  assert.notEqual(copied.id,path.id);assert.ok(copiedReq.requirements.every(row=>!original.requirements.some(old=>old.id===row.id)));
  assert.equal(copiedReq.requirements[0].creatureAbilityCanonicalId,clone.abilities[0].canonicalId);
  assert.notEqual(clone.abilities[0].canonicalId,young.abilities[0].canonicalId);
  assert.equal(copiedReq.requirements[1].creatureFormKey,clone.forms[0].key);assert.equal(copiedReq.requirements[2].itemId,itemId);
  await saveReq(actions,"sourceCreatureId",clone.id,[]);
  assert.deepEqual(await actions.getEvolutionRequirements(young.id,path.id),original);
  await assert.rejects(creatures.saveCreature({...await creatures.getCreature(young.id),abilities:[]}),/Evolution requirement/);
  await assert.rejects(creatures.saveCreature({...await creatures.getCreature(young.id),forms:[]}),/Evolution requirement/);
});

test("Race archives, incoming lifecycle protection and owned-child deletion; shared Skill/Item/Ability references block deletion",async()=>{
  const source=await raceDefinition("Evolution Deletable Race"), destination=await raceDefinition("Evolution Protected Race");
  await raceAdd(source,destination);
  await saveReq(raceActions,"sourceRaceId",source.id,[req("skill",{skillId}),req("item",{sortOrder:1,itemId,itemHolder:"character"}),req("derived-ability",{sortOrder:2,derivedAbilityId:abilityId})]);
  const [path]=await raceList(source.id);
  const raceTarget=id=>({entityKind:"race",entityId:id});
  const preview=await lifecycle.previewLifecycleEntityForActor(raceTarget(destination.id),actor);
  assert.ok(preview.dependencies.some(row=>row.label==="Incoming Evolution paths"&&row.blocking&&row.count===1));
  await assert.rejects(lifecycle.permanentlyDeleteLifecycleEntityForActor(raceTarget(destination.id),actor),/Incoming Evolution/);
  await assert.rejects(pool.query("delete from races where id=$1",[destination.id]),/foreign key/);
  await lifecycle.archiveLifecycleEntityForActor(raceTarget(destination.id),actor);
  assert.ok((await raceList(source.id))[0].destination.archived);
  assert.deepEqual(await raceActions.searchEvolutionDestinations(source.id,"Evolution Protected Race"),[]);
  await assert.rejects(raceAdd(raceOther,destination),/Archived Races/);
  await raceActions.saveEvolutionPath({...path,expectedVersion:path.version,notes:"Retained archive"});
  for(const [entityKind,entityId] of [["skill",skillId],["item",itemId],["derived-ability",abilityId]]) {
    const preview=await lifecycle.previewLifecycleEntityForActor({entityKind,entityId},actor);
    assert.ok(preview.dependencies.some(row=>row.label.includes("Evolution")&&row.blocking&&row.count>0));
  }
  await pool.query("update skill set archived_at=now() where id=$1",[skillId]);
  const data=await raceActions.getEvolutionRequirements(source.id,path.id);assert.ok(data.requirements[0].referenceArchived);
  await saveReq(raceActions,"sourceRaceId",source.id,data.requirements);
  await raceAdd(raceOther,raceSource,"New prerequisite attempt");
  await assert.rejects(saveReq(raceActions,"sourceRaceId",raceOther.id,[req("skill",{skillId})]),/active Skill/);
  await pool.query("update skill set archived_at=null where id=$1",[skillId]);
  const outgoing=await lifecycle.previewLifecycleEntityForActor(raceTarget(source.id),actor);
  assert.ok(outgoing.dependencies.some(row=>row.label==="Authored outgoing Evolution paths"&&!row.blocking));
  await lifecycle.permanentlyDeleteLifecycleEntityForActor(raceTarget(source.id),actor);
  assert.deepEqual(await rows("select id from race_evolution_requirements where path_id=$1",[path.id]),[]);
});

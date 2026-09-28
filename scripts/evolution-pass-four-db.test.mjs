import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";
import path from "node:path";
import { pathToFileURL } from "node:url";
assert.equal(process.env.SERRIAN_EVOLUTION_DISPOSABLE,"true");
assert.match(process.env.DATABASE_URL ?? "",/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_evolution_dev$/);
const god="destination-god", admin="destination-admin", foreign="destination-foreign", player="destination-player", actors=new AsyncLocalStorage();
mock.module(pathToFileURL(path.resolve("src/lib/server-access.ts")).href,{namedExports:{
  requireGodOrAdminAccessContext:async()=>{const id=actors.getStore()??god;return {session:{user:{id}},roles:(await rows("select role from user_role where user_id=$1",[id])).map(row=>row.role)};},
}});
mock.module("next/cache",{namedExports:{revalidatePath(){}}});
const {pool,db}=await import("../src/db/index.ts");
const rows=async(text,args=[]) => (await pool.query(text,args)).rows;
const one=async(text,args=[]) => (await rows(text,args))[0];
const api=await import("../src/features/evolutions/evolution-destination-service.ts");
const {readEvolutionPathReferencesInTransaction}=await import("../src/features/evolutions/evolution-path-references.ts");
const creatures=await import("../src/app/heavens/creatures/actions.ts");
const races=await import("../src/app/heavens/races/actions.ts");
const creaturePaths=await import("../src/features/creatures/creature-evolution-service.ts");
const racePaths=await import("../src/features/races/race-evolution-service.ts");
const {creatureDraftFixture,creatureFormFixture}=await import("./creature-form-fixture.ts");
const {emptyFormAccessRequirement}=await import("../src/features/forms/form-access.ts");
const {emptyRaceForm}=await import("../src/features/races/race-forms.ts");
const {emptyRaceFormMechanics}=await import("../src/features/races/race-form-mechanics.ts");
const {createHumanoidRaceAnatomy}=await import("../src/features/races/race-anatomy.ts");
const {emptyRaceNaturalAttack}=await import("../src/features/races/race-natural-attacks.ts");
const {transformationFixture}=await import("./race-form-transformation-fixture.ts");
const {emptyEvolutionRequirement}=await import("../src/features/evolutions/evolution-requirements.ts");
const actor={userId:god,roles:["god"]};
let sourceCreature,sourceRace,skillId;
const rootId=kind=>kind==="race"?sourceRace.id:sourceCreature.id;
const tables=kind=>kind==="race"?{root:"races",paths:"race_evolution_paths",source:"source_race_id",destination:"destination_race_id"}:{root:"creatures",paths:"creature_evolution_paths",source:"source_creature_id",destination:"destination_creature_id"};
const get=(kind,id)=>kind==="race"?races.getRace(id):creatures.getCreature(id);
const list=(kind,id)=>kind==="race"?racePaths.readRaceEvolutionAuthoring(id,actor):creaturePaths.readCreatureEvolutionAuthoring(id,actor);
const command=async(kind,name="New destination",userId=god)=>({...await api.prepareEvolutionDestination(kind,rootId(kind),randomUUID(),userId),destinationName:name,pathName:`Evolve into ${name}`,description:"Path description",notes:"Path notes"});
const allRows=async()=>Object.fromEntries(await Promise.all((await rows("select tablename from pg_tables where schemaname='public' order by tablename")).map(async({tablename})=>[tablename,await rows(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)])));
const independentForm=form=>{const result=structuredClone(form);delete result.id;delete result.raceId;delete result.creatureId;return result;};
before(async()=>{
  for(const [id,role] of [[god,"god"],[admin,"admin"],[foreign,"god"],[player,"player"]]) {
    await pool.query('insert into "user"(id,name,email) values($1,$1,$2)',[id,`${id}@example.invalid`]);
    await pool.query("insert into user_role(user_id,role) values($1,$2)",[id,role]);
  }
  skillId=(await one("insert into skill(name,classification,tier) values('Destination Skill','Physical',1) returning id")).id;
  const draft=creatureDraftFixture(),form=creatureFormFixture(skillId);
  Object.assign(draft.core,{canonicalName:"Destination Source Creature",hpMultiplierSteps:2,baseMovementSteps:3,baseMagicSteps:4,interactionRules:form.mechanics.interactionRules,habitatEcology:"Ecology",typicalBehavior:"Behavior"});
  draft.attacks=form.mechanics.attacks.rows.map(row=>({...row,canonicalId:"DRAFT-ATK-COPY"}));
  draft.abilities=form.mechanics.abilities.rows.map(row=>({...row,canonicalId:"DRAFT-ABL-COPY"}));
  draft.abilities[0].effects=[{effectKey:"normal-rider",schemaVersion:2,sortOrder:0,effect:{kind:"manual",title:"Sight rider",description:"Independent copied effect"}}];
  draft.defenses=form.mechanics.defenses.rows;
  draft.skillLinks=[{skillId,skillName:"Destination Skill",skillClassification:"Physical",rank:"3",notes:"Normal learned",sortOrder:0}];
  draft.uses=[{seedIdentity:null,useName:"Story use",notes:"Harvest",sortOrder:0}];
  draft.hitLocations=[{hitLocationNumber:1,locationName:"Body",bodyPartsIncluded:"Torso",hpPoolCanonicalId:draft.hpPools[0].canonicalId,naturalArmor:2,soak:1,locationEffect:"Body effect",notes:"Body notes",sortOrder:0}];
  form.access={mode:"requirements",requirements:[{...emptyFormAccessRequirement("native",0,"creature-ability"),requiredCreatureAbilityCanonicalId:draft.abilities[0].canonicalId}]};
  draft.forms=[form];sourceCreature=await creatures.saveCreature(draft);
  const raceId=(await one("insert into races(name,size,created_by_user_id) values('Destination Source Race','Medium',$1) returning id",[god])).id;
  const raceDraft=await races.getRace(raceId),mechanics=emptyRaceFormMechanics();
  mechanics.movementMode="override";mechanics.movement=[{key:"flight",movementMode:"Flight",baseValue:8,notes:"Form wings",sortOrder:0}];
  sourceRace=await races.saveRace({...raceDraft,core:{...raceDraft.core,baseMagic:9,anatomy:createHumanoidRaceAnatomy(),interactionRules:{...form.mechanics.interactionRules,rules:form.mechanics.interactionRules.rules.map(row=>{const rule={...row};delete rule.crImpact;return rule;})},physicalDescription:"Authored Race description"},
    attributeCaps:[{attributeKey:"STR",maxValue:75,sortOrder:0}],movementModes:[{movementMode:"Land",baseValue:5,notes:"Normal movement",sortOrder:0}],
    skillLinks:[{skillId,skillName:"Destination Skill",skillClassification:"Physical",linkType:"skill",value:5,sortOrder:0}],
    naturalAttacks:[{...emptyRaceNaturalAttack("bite"),attackName:"Bite",damage:"4"}],
    naturalProtections:[{key:"hide",name:"Hide",naturalSoak:2,coverage:{kind:"all"},sortOrder:0}],
    forms:[{...emptyRaceForm("winged"),name:"Winged",mechanics,transformation:transformationFixture(),access:{mode:"requirements",requirements:[{...emptyFormAccessRequirement("trial",0),notes:"Story trial"}]}}]});
  for(const kind of ["race","creature"]) {
    const input=await command(kind,`Existing branch ${kind}`),result=await api.createEvolutionDestination(input,god);
    const req={...emptyEvolutionRequirement("story",0,"manual"),notes:"Existing branch requirement"};
    if(kind==="race") await racePaths.saveEvolutionRequirements({sourceRaceId:rootId(kind),pathId:result.pathId,expectedVersion:1,requirements:{mode:"requirements",requirements:[req]}},actor);
    else await creaturePaths.saveEvolutionRequirements({sourceCreatureId:rootId(kind),pathId:result.pathId,expectedVersion:1,requirements:{mode:"requirements",requirements:[req]}},actor);
    await pool.query(`update ${tables(kind).root} set is_system_canon=true,canon_marked_by_user_id=$2,canon_marked_at=now() where id=$1`,[rootId(kind),admin]);
  }
});
after(()=>pool.end());

test("Creature creation copies complete normal authoring independently, regenerates canonical children, links one path and clears Variant/canon metadata",async()=>{
  const source=await get("creature",sourceCreature.id),before=await allRows(),input=await command("creature","Torrent Fixture");
  assert.deepEqual(await allRows(),before,"preparation writes no rows");
  const result=await api.createEvolutionDestination(input,god),destination=await get("creature",result.destinationId);
  assert.notEqual(result.destinationId,source.id);assert.equal(destination.core.canonicalId,input.canonicalId);assert.notEqual(destination.core.canonicalId,source.core.canonicalId);
  const root=await one("select * from creatures where id=$1",[destination.id]);
  assert.equal(root.parent_creature_id,null);assert.equal(root.created_by_user_id,god);assert.equal(root.source_system,null);assert.equal(root.is_system_canon,false);assert.equal(root.canon_marked_by_user_id,null);assert.equal(root.canon_marked_at,null);
  for(const key of ["attributes","movement","skillLinks","defenses","uses"])assert.deepEqual(destination[key],source[key],key);
  for(const key of ["hpMultiplierSteps","totalHp","baseMovementSteps","baseMagicSteps","size","interactionRules","family","creatureType","description","typicalBehavior","habitatEcology","notes","challengeRating","killXp"])assert.deepEqual(destination.core[key],source.core[key],key);
  for(const key of ["hpPools","attacks","abilities"]) {
    assert.equal(destination[key].length,source[key].length);
    for(const [index,row] of destination[key].entries()) { assert.notEqual(row.canonicalId,source[key][index].canonicalId);assert.deepEqual({...row,canonicalId:""},{...source[key][index],canonicalId:""},key); }
  }
  assert.equal(destination.hitLocations[0].hpPoolCanonicalId,destination.hpPools[0].canonicalId);
  assert.deepEqual({...destination.hitLocations[0],hpPoolCanonicalId:""},{...source.hitLocations[0],hpPoolCanonicalId:""});
  const copiedForm=independentForm(destination.forms[0]),originalForm=independentForm(source.forms[0]);
  assert.equal(copiedForm.access.requirements[0].requiredCreatureAbilityCanonicalId,destination.abilities[0].canonicalId);
  copiedForm.access.requirements[0].requiredCreatureAbilityCanonicalId=originalForm.access.requirements[0].requiredCreatureAbilityCanonicalId;
  assert.deepEqual(copiedForm,originalForm);assert.notEqual(destination.forms[0].id,source.forms[0].id);
  assert.deepEqual((await list("creature",destination.id)).paths,[]);
  const path=(await list("creature",source.id)).paths.find(row=>row.id===result.pathId);
  assert.equal(path.destinationCreatureId,destination.id);assert.equal(path.version,1);assert.equal(path.requirementMode,"unrestricted");
  assert.deepEqual(await get("creature",source.id),source);
  const after=await allRows();
  for(const table of Object.keys(before).filter(name=>!name.startsWith("creature")&&name!=="evolution_destination_creation"))assert.deepEqual(after[table],before[table],table);
  assert.deepEqual(after.creature_evolution_requirements,before.creature_evolution_requirements);assert.deepEqual(after.creature_evolution_events,before.creature_evolution_events);
  const changed=await creatures.saveCreature({...destination,attributes:destination.attributes.map((row,index)=>index===0?{...row,value:70}:row),forms:destination.forms.map(row=>({...row,description:"Destination Form"}))});
  assert.deepEqual(await get("creature",source.id),source);
  await creatures.saveCreature({...source,core:{...source.core,notes:"Later source edit"}});
  assert.deepEqual(await get("creature",destination.id),changed);
  await creaturePaths.saveCreatureEvolution({...path,name:"Normal path edit",expectedVersion:path.version},actor);
  assert.equal((await list("creature",source.id)).paths.find(row=>row.id===path.id).version,2);
});

test("Race creation copies all definition mechanics/Forms with independent identities; adjustments stay on the ordinary path",async()=>{
  const source=await get("race",sourceRace.id),before=await allRows(),result=await api.createEvolutionDestination(await command("race","Ascended Fixture"),god),destination=await get("race",result.destinationId);
  assert.notEqual(destination.id,source.id);assert.equal(destination.core.parentRaceId,null);
  const root=await one("select * from races where id=$1",[destination.id]);
  assert.equal(root.is_system_canon,false);assert.equal(root.canon_marked_by_user_id,null);assert.equal(root.created_by_user_id,god);assert.equal(root.source_system,null);assert.equal(root.source_external_id,null);
  assert.deepEqual({...destination.core,name:""},{...source.core,name:""});
  for(const key of ["attributeCaps","movementModes","skillLinks","naturalAttacks","naturalProtections"])assert.deepEqual(destination[key],source[key],key);
  assert.deepEqual(destination.forms.map(independentForm),source.forms.map(independentForm));assert.notEqual(destination.forms[0].id,source.forms[0].id);
  assert.deepEqual((await list("race",destination.id)).paths,[]);assert.deepEqual(await get("race",source.id),source);
  const path=(await list("race",source.id)).paths.find(row=>row.id===result.pathId);assert.equal(path.destinationRaceId,destination.id);assert.equal(path.transition,null);
  const after=await allRows();
  for(const table of Object.keys(before).filter(name=>!name.startsWith("race")&&name!=="evolution_destination_creation"))assert.deepEqual(after[table],before[table],table);
  assert.deepEqual(after.race_evolution_requirements,before.race_evolution_requirements);assert.deepEqual(after.race_evolution_events,before.race_evolution_events);
  const transition={schemaVersion:1,attributes:[{key:"STR",operation:"add",value:10}],hpMultiplierSteps:null,baseMovementSteps:null,baseMagicSteps:null};
  await racePaths.saveRaceEvolution({...path,expectedVersion:path.version,transition},actor);
  assert.deepEqual(await get("race",destination.id),destination);
  const changed=await races.saveRace({...destination,core:{...destination.core,baseMagic:14},forms:destination.forms.map(row=>({...row,notes:"Independent Form"}))});
  assert.deepEqual(await get("race",source.id),source);
  await races.saveRace({...source,core:{...source.core,physicalDescription:"Later source edit"}});
  assert.deepEqual(await get("race",destination.id),changed);
});

test("duplicate submissions/network retries return the original exact records; different request content cannot reuse a receipt",async()=>{
  for(const kind of ["race","creature"]) {
    const input=await command(kind,`Retry ${kind}`),before=await allRows();
    const [first,second]=await Promise.all([api.createEvolutionDestination(input,god),api.createEvolutionDestination(input,god)]);
    assert.deepEqual(first,second);
    const after=await allRows(),{root,paths}=tables(kind);assert.equal(after[root].length,before[root].length+1);assert.equal(after[paths].length,before[paths].length+1);
    await pool.query(`update ${root} set ${kind==="race"?"physical_description":"notes"}='post-create edit' where id=$1`,[rootId(kind)]);
    const current=await allRows();assert.deepEqual(await api.createEvolutionDestination(input,god),first);assert.deepEqual(await allRows(),current);
    await assert.rejects(api.createEvolutionDestination({...input,pathName:"Different"},god),/different details/);
  }
});

test("path insert failure and receipt failure roll back the whole destination; a safe retry then succeeds",async()=>{
  for(const kind of ["race","creature"]) for(const target of [tables(kind).paths,"evolution_destination_creation"]) {
    const input=await command(kind,`Rollback ${kind}`),before=await allRows();
    await pool.query("create function destination_test_failure() returns trigger language plpgsql as $$ begin raise exception 'destination test failure'; end $$");
    await pool.query(`create trigger destination_test_failure before insert on ${target} for each row execute function destination_test_failure()`);
    try {await assert.rejects(api.createEvolutionDestination(input,god),/Failed query|destination test failure/);} finally {await pool.query(`drop trigger destination_test_failure on ${target}`);await pool.query("drop function destination_test_failure()");}
    assert.deepEqual(await allRows(),before,"failed copy/path/receipt leaves no orphan rows");
    const result=await api.createEvolutionDestination(input,god);assert.ok(result.destinationId>0&&result.pathId>0);
  }
});

test("fresh permissions, archived sources and stale normal/Form state fail before any destination is saved",async()=>{
  for(const kind of ["race","creature"]) {
    const input=await command(kind),before=await allRows(),{root}=tables(kind);
    for(const id of [player,foreign])await assert.rejects(api.createEvolutionDestination(input,id),/access|creator|administrator/i);
    assert.deepEqual(await allRows(),before);
    await pool.query("delete from user_role where user_id=$1",[god]);
    await assert.rejects(api.createEvolutionDestination(input,god),/access/i);
    await pool.query("insert into user_role(user_id,role) values($1,'god')",[god]);
    await pool.query(`update ${root} set archived_at=now() where id=$1`,[rootId(kind)]);
    await assert.rejects(api.createEvolutionDestination(input,god),/Restore/);
    await pool.query(`update ${root} set archived_at=null where id=$1`,[rootId(kind)]);
    const stale=await command(kind);
    await pool.query(`update ${kind==="race"?"race_forms":"creature_forms"} set notes=notes||' changed' where ${kind}_id=$1`,[rootId(kind)]);
    const current=await allRows();await assert.rejects(api.createEvolutionDestination(stale,god),/source changed/);assert.deepEqual(await allRows(),current);
    const adminResult=await api.createEvolutionDestination(await command(kind,`Admin copy ${kind}`,admin),admin);
    assert.equal((await one(`select created_by_user_id from ${root} where id=$1`,[adminResult.destinationId])).created_by_user_id,admin);
  }
});

test("concurrent source edits/archives and permission loss are rechecked after locks; concurrent independent creations retain separate exact IDs",async()=>{
  const client=await pool.connect();
  try {
    for(const kind of ["race","creature"]) {
      for(const operation of ["edit","archive","role"]) {
        const input=await command(kind),{root}=tables(kind);
        await client.query("begin");
        if(operation==="role")await client.query("delete from user_role where user_id=$1",[god]);
        else await client.query(`update ${root} set ${operation==="archive"?"archived_at=now()":kind==="race"?"physical_description=physical_description||' concurrent'":"notes=notes||' concurrent'"} where id=$1`,[rootId(kind)]);
        const pending=api.createEvolutionDestination(input,god);const rejected=assert.rejects(pending,/changed|Restore|access/i);
        await new Promise(resolve=>setTimeout(resolve,100));await client.query("commit");await rejected;
        if(operation==="role")await pool.query("insert into user_role(user_id,role) values($1,'god')",[god]);
        if(operation==="archive")await pool.query(`update ${root} set archived_at=null where id=$1`,[rootId(kind)]);
        assert.equal((await one("select count(*)::int n from evolution_destination_creation where request_key=$1",[input.requestKey])).n,0);
      }
      const inputs=await Promise.all([command(kind,`Concurrent ${kind}`),command(kind,`Concurrent ${kind}`)]),results=await Promise.all(inputs.map(input=>api.createEvolutionDestination(input,god)));
      assert.notEqual(results[0].destinationId,results[1].destinationId);assert.notEqual(results[0].pathId,results[1].pathId);
      // Display names are intentionally non-unique in normal Race/Creature authoring.
      assert.equal(results[0].destinationName,results[1].destinationName);
    }
  } finally {await client.query("rollback");client.release();}
});

test("canonical identity conflict or tampering fails cleanly; successful receipts survive later path deletion without recreating anything",async()=>{
  const input=await command("creature","Canonical conflict");
  await pool.query("insert into creatures(canonical_id,canonical_name,size) values($1,'Existing ID','Medium')",[input.canonicalId]);
  const before=await allRows();await assert.rejects(api.createEvolutionDestination(input,god),/canonical ID already exists/);
  await assert.rejects(api.createEvolutionDestination({...input,canonicalId:"CUSTOM-ID"},god),/cannot be changed/);assert.deepEqual(await allRows(),before);
  for(const kind of ["race","creature"]) {
    const input=await command(kind,`Deleted path ${kind}`),result=await api.createEvolutionDestination(input,god);
    await pool.query(`delete from ${tables(kind).paths} where id=$1`,[result.pathId]);
    const state=await allRows();await assert.rejects(api.createEvolutionDestination(input,god),/later removed/);assert.deepEqual(await allRows(),state);
  }
});

test("exact shared path references are read-only, include versions/availability and never inherit parent paths",async()=>{
  for(const kind of ["race","creature"]) {
    const result=await api.createEvolutionDestination(await command(kind,`Read model ${kind}`),god),before=await allRows();
    const read=id=>db.transaction(tx=>readEvolutionPathReferencesInTransaction(tx,kind,id),{accessMode:"read only"});
    const reference=(await read(rootId(kind))).find(row=>row.pathId===result.pathId);
    assert.deepEqual(reference,{kind,pathId:result.pathId,pathVersion:1,pathName:`Evolve into Read model ${kind}`,sourceId:rootId(kind),destinationId:result.destinationId,destinationName:`Read model ${kind}`,requirementMode:"unrestricted",sourceArchived:false,destinationArchived:false,available:true});
    assert.deepEqual(await read(result.destinationId),[]);assert.deepEqual(await allRows(),before);
    await pool.query(`update ${tables(kind).root} set archived_at=now() where id=$1`,[result.destinationId]);
    assert.equal((await read(rootId(kind))).find(row=>row.pathId===result.pathId).available,false);
    const direct=kind==="race"?racePaths:creaturePaths;
    assert.ok(!(await direct.findEvolutionDestinations(rootId(kind),"",actor)).some(row=>row.id===rootId(kind)),"source excluded from search");
    const self=kind==="race"?{sourceRaceId:rootId(kind),destinationRaceId:rootId(kind)}:{sourceCreatureId:rootId(kind),destinationCreatureId:rootId(kind)};
    await assert.rejects((kind==="race"?racePaths.saveRaceEvolution:creaturePaths.saveCreatureEvolution)({...self,name:"Self",description:"",notes:""},actor),/itself|different/i);
  }
});

test("Variant cloning retains its existing parent/path behavior while creating an Evolution from that Variant makes an independent root",async()=>{
  for(const kind of ["race","creature"]) {
    const variant=kind==="race"?await races.createRaceVariant(rootId(kind),"Destination Race Variant"):await creatures.createDerivedCreature(rootId(kind),"Destination Creature Variant");
    const parentKey=kind==="race"?"parentRaceId":"parentCreatureId";
    assert.equal(variant.core[parentKey],rootId(kind));assert.ok((await list(kind,variant.id)).paths.length>0);
    const prepared=await api.prepareEvolutionDestination(kind,variant.id,randomUUID(),god);
    const result=await api.createEvolutionDestination({...prepared,destinationName:`Evolved Variant ${kind}`,pathName:"Evolve Variant",description:"",notes:""},god);
    assert.equal((await get(kind,result.destinationId)).core[parentKey],null);
    assert.deepEqual((await list(kind,result.destinationId)).paths,[]);
  }
});

test("canon-only browsing never promotes new copies; protected imports keep normal authoring permissions and fresh creator metadata",async()=>{
  await pool.query("insert into user_catalog_preferences(user_id,race_visibility,creature_visibility) values($1,'canon','canon') on conflict(user_id) do update set race_visibility='canon',creature_visibility='canon'",[god]);
  for(const kind of ["race","creature"]) {
    const inserted=await rows("insert into catalog_visibility_scope_activation(catalog_key,activated_by_user_id,activation_method) values($1,$2,'manual') on conflict do nothing returning catalog_key",[kind,admin]);
    const {root}=tables(kind);
    try {
      await pool.query(`update ${root} set source_system='protected-import' where id=$1`,[rootId(kind)]);
      await assert.rejects(command(kind,"Admin imported copy",admin),/Only a G.O.D./);
      const result=await api.createEvolutionDestination(await command(kind,`Non-canon ${kind}`),god);
      const row=await one(`select * from ${root} where id=$1`,[result.destinationId]);assert.equal(row.source_system,null);assert.equal(row.is_system_canon,false);assert.equal(row.created_by_user_id,god);
      const search=kind==="race"?racePaths.findEvolutionDestinations:creaturePaths.findEvolutionDestinations;
      assert.ok(!(await search(rootId(kind),`Non-canon ${kind}`,actor)).some(row=>row.id===result.destinationId));
      assert.equal((await get(kind,result.destinationId)).id,result.destinationId,"new copy still opens directly for its creator");
    } finally {
      await pool.query(`update ${root} set source_system=null where id=$1`,[rootId(kind)]);
      if(inserted.length)await pool.query("delete from catalog_visibility_scope_activation where catalog_key=$1",[kind]);
    }
  }
  await pool.query("update user_catalog_preferences set race_visibility='canon-and-mine',creature_visibility='canon-and-mine' where user_id=$1",[god]);
});

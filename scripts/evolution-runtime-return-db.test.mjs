import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { actors, db, pool, runtime, realm, race, raceNaturalAttack, racePaths, api, command, fixture, creatureSubject, preview, boundary, allRows, rows, one, insertDeclaration, completionDraft, lockOwnedEncounterRuntimeInTransaction, declarationApi, readIncomingEffectEncounterTargetInTransaction, readCombatCommandSources, emptyRaceEvolutionTransition, raceNaturalAttackFixture } from './fixtures/evolution-runtime-fixture.mjs';

after(() => pool.end());
const back = (f,id=f.heroId,kind='race') => api.previewPersistentEvolutionReturn(kind,id,f.actor);
const backCommand = p => ({kind:p.kind,characterId:p.characterId,expectedEventId:p.returning.eventId,reviewToken:p.reviewToken,idempotencyKey:randomUUID(),confirmHealthConsequences:true,confirmReplaceOverrides:true});
const evolve = async (f,id=f.heroId,kind='race',pathId=f.racePath) => api.executePersistentEvolution(command(await preview(f,id,kind,pathId)),f.actor);
const returnNow = async (f,id=f.heroId,kind='race') => api.executePersistentEvolutionReturn(backCommand(await back(f,id,kind)),f.actor);

async function preserveState(f,id,oldPool,newPool) {
  await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,2,'worn',0)",[id,f.weaponId]);
  await pool.query('insert into campaign_character_active_health(character_id,total_damage) values($1,111) on conflict(character_id) do update set total_damage=111',[id]);
  await pool.query('insert into campaign_character_active_health_pool(character_id,pool_key,pool_name_snapshot,damage) values($1,$2,\'Same display name\',7),($1,$3,\'Same display name\',3)',[id,oldPool,newPool]);
  await pool.query("insert into campaign_character_injury(character_id,pool_key,pool_name_snapshot,name,damage_amount) values($1,$2,'Same display name','Unresolved break',7),($1,$3,'Same display name','Resolved scar',1)",[id,oldPool,newPool]);
  await pool.query("update campaign_character_injury set resolved=true,resolved_at=now() where character_id=$1 and name='Resolved scar'",[id]);
  const condition=await one("insert into campaign_character_active_condition(character_id,name,source_kind,source_id,source_name,duration_kind,duration_value,duration_label) values($1,'Persistent condition','god','fixture','Fixture','combat-rounds',3,'3 rounds') returning id",[id]);
  await db.transaction(async tx=>{
    const hierarchy={campaignId:f.campaignId,sessionId:f.sessionId,sceneId:f.sceneId,encounterId:f.encounterId,characterId:id};
    await tx.insert(runtime.campaignSessionEffectDurationBinding).values({...hierarchy,conditionId:condition.id,durationKind:'combat-rounds',remainingValue:3});
    await tx.insert(runtime.campaignSessionPeriodicHealthEffect).values({...hierarchy,applicationKey:randomUUID(),sourceKind:'spell',sourceId:'fixture',effectKind:'health.damage',amount:1,application:'area',poolKey:newPool,frequency:'combat-rounds',remainingApplications:3,nextStep:2,nextRound:2});
  });
  await pool.query("insert into campaign_character_active_modifier(character_id,label,modifier_channel,target_key,amount,source_kind,source_id,source_name,duration_kind,duration_label) values($1,'Persistent modifier','attribute','STR',2,'god','fixture','Fixture','until-removed','Until removed')",[id]);
  await pool.query('update campaign_session_encounter_participant set local_state_json=$2 where encounter_id=$3 and character_id=$1',[id,{limbConditions:[{poolKey:newPool,name:'Disabled',sourceEffectId:1,incapacitatedAt:'2026-10-03T12:00:00Z'}]},f.encounterId]);
}

for (const subject of ['PC','Race NPC','Creature NPC']) test(`live Return ${subject}: exact preservation, later advancement, restored anatomy/protection/choices and durable retry`,async()=>{
  const f=await fixture(), creature=subject==='Creature NPC'?await creatureSubject(f):null;
  const id=creature?.id ?? (subject==='PC'?f.heroId:f.defenderId),kind=creature?'creature':'race';
  if(!creature) {
    await creatureSubject(f);
    const {createHumanoidRaceAnatomy}=await import('../src/features/races/race-anatomy.ts');
    const anatomy=createHumanoidRaceAnatomy();
    anatomy.hpPools.push({canonicalId:'old-wing',poolName:'Old wing',hpPercentage:25,notes:'',sortOrder:anatomy.hpPools.length});
    anatomy.hitLocations[9]={...anatomy.hitLocations[9],locationName:'Old wing',bodyPartsIncluded:'Old wing',hpPoolCanonicalId:'old-wing'};
    const {saveRaceNaturalProtectionInTransaction}=await import('../src/features/races/race-natural-protection-service.ts');
    await db.transaction(async tx=>{
      await tx.update(race).set({anatomy,baseMagic:13}).where(eq(race.id,f.source.ancestry.id));
      await saveRaceNaturalProtectionInTransaction(tx,f.source.ancestry.id,[{key:'young-hide',name:'Young hide',coverage:{kind:'all'},naturalSoak:3,sortOrder:0}]);
    });
  }
  const restoredRules=structuredClone(f.interactionRules); restoredRules.rules[0].percentage=25;
  if(creature) {
    const profile=await one('select * from campaign_creature_npc_profile where character_id=$1',[id]);
    const snapshot=JSON.parse(profile.current_snapshot_json); snapshot.core.interactionRules=restoredRules;
    await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2,baseline_snapshot_json=$2 where character_id=$1',[id,JSON.stringify(snapshot)]);
  } else await db.transaction(tx=>tx.update(race).set({interactionRules:restoredRules}).where(eq(race.id,f.source.ancestry.id)));
  const initialProfile=await one(`select * from ${creature?'campaign_creature_npc_profile':'campaign_character_profile'} where character_id=$1`,[id]);
  const beforeHealth=await preview(f,id,kind,creature?.pathId??f.racePath);
  const oldPool=creature?creature.from.hpPools[0].canonicalId:'old-wing';
  assert.ok(beforeHealth.beforeHealth.tracks.some(t=>t.key===oldPool&&!t.orphaned));
  const newPool=creature?creature.to.hpPools[0].canonicalId:'new-wing';
  const forward=await evolve(f,id,kind,creature?.pathId??f.racePath);
  await preserveState(f,id,oldPool,newPool);
  if(!creature) {
    await pool.query('update campaign_character_attribute set value=value+5 where character_id=$1',[id]);
    await pool.query('update campaign_character_profile set hp_multiplier_steps=hp_multiplier_steps+2,base_movement_steps=base_movement_steps+3,base_magic_steps=base_magic_steps+4 where character_id=$1',[id]);
    await pool.query('insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,17)',[id,f.skillId]);
    await pool.query('update campaign_character_profile set experience=experience+7,total_experience=total_experience+7,quintessence=11,total_quintessence=19 where character_id=$1',[id]);
  } else {
    await pool.query('update campaign_creature_npc_profile set hp_adjustment=19 where character_id=$1',[id]);
    assert.equal((await back(f,id,kind)).hasIndividualOverrides,false);
    const snapshot=JSON.parse(forward.event.snapshots.destinationCurrent); snapshot.attributes[0].value+=3;
    await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1',[id,JSON.stringify(snapshot)]);
    const p=await back(f,id,kind),before=await allRows(); assert.equal(p.hasIndividualOverrides,true);
    await assert.rejects(api.executePersistentEvolutionReturn({...backCommand(p),confirmReplaceOverrides:false},f.actor),/confirm replacing/);
    assert.deepEqual(await allRows(),before);
    await pool.query("update creatures set canonical_name='Edited historical master',archived_at=now(),size='Colossal' where id=$1",[creature.from.id]);
  }
  const currentProfile=await one(`select * from ${creature?'campaign_creature_npc_profile':'campaign_character_profile'} where character_id=$1`,[id]);
  const before=await allRows(),p=await back(f,id,kind),input=backCommand(p);
  assert.deepEqual(await allRows(),before,'preview is read only'); assert.deepEqual(p.blockers,[]);
  assert.equal(p.afterHealth.totalDamage,111);
  assert.ok(p.beforeHealth.tracks.some(t=>t.key===oldPool&&t.orphaned&&t.damage===7));
  assert.ok(p.afterHealth.tracks.some(t=>t.key===oldPool&&!t.orphaned&&t.damage===7));
  assert.ok(p.afterHealth.tracks.some(t=>t.key===newPool&&t.orphaned&&t.damage===3));
  const results=await Promise.all([api.executePersistentEvolutionReturn(input,f.actor),api.executePersistentEvolutionReturn(input,f.actor)]);
  assert.equal(results.filter(r=>r.replayed).length,1); assert.deepEqual(results[0].event,results[1].event);
  const after=await allRows(),changed=creature?['campaign_creature_npc_profile','creature_evolution_events']:['campaign_character_profile','campaign_character_attribute','race_evolution_events'];
  for(const table of Object.keys(before)) if(!changed.includes(table)) assert.deepEqual(after[table],before[table],`${table}: Return preserves every unrelated row`);
  const event=results[0].event; assert.equal(event.characterId,id); assert.equal(event.reversesEventId,forward.event.id);
  assert.deepEqual(event.evidence.encounterContexts,p.encounterContexts); assert.equal(event.evidence.encounterContexts[0].cleanBoundary,true);
  assert.deepEqual((await api.readEvolutionHistory(id,f.actor)).find(e=>e.operation==='evolution'),forward.event);
  assert.equal((await api.executePersistentEvolutionReturn(input,f.actor)).replayed,true); assert.deepEqual(await allRows(),after);
  await assert.rejects(api.executePersistentEvolutionReturn({...input,confirmHealthConsequences:false},f.actor),/different|already used/);
  const incoming=await db.transaction(tx=>readIncomingEffectEncounterTargetInTransaction(tx,f.context,id));
  assert.deepEqual(incoming.interactionRules,restoredRules); assert.ok(!incoming.applicationLocations.some(l=>l.poolKey===newPool));
  const profileAfter=await one(`select * from ${creature?'campaign_creature_npc_profile':'campaign_character_profile'} where character_id=$1`,[id]);
  const changedFields=creature?['creature_id','current_snapshot_json','baseline_snapshot_json']:['race_id','hp_multiplier_steps','base_movement_steps','base_magic_steps'];
  for(const key of Object.keys(currentProfile)) if(!changedFields.includes(key)) assert.deepEqual(profileAfter[key],currentProfile[key],`${key}: later XP, Quintessence and unrelated individual fields survive`);
  const choices=await actors.run(f.godId,()=>readCombatCommandSources({role:'god',encounterId:f.encounterId},id));
  assert.ok(choices.sources.some(s=>s.name===(creature?'Young bite':'Young claw'))); assert.ok(!choices.sources.some(s=>s.name===(creature?'Evolved bite':'Evolved claw')));
  if(creature) {
    assert.ok(incoming.protection.natural.some(l=>l.armor===1&&l.soak===1));
    const restored=await one('select * from campaign_creature_npc_profile where character_id=$1',[id]);
    const {normalizeCreatureNpcSnapshot}=await import('../src/features/creatures/creature-npc-constructor-service.ts');
    assert.equal(restored.creature_id,creature.from.id); assert.equal(restored.hp_adjustment,19);
    assert.equal(restored.baseline_snapshot_json,initialProfile.baseline_snapshot_json);
    assert.deepEqual(JSON.parse(restored.current_snapshot_json),normalizeCreatureNpcSnapshot(JSON.parse(initialProfile.current_snapshot_json),19));
    assert.deepEqual((await api.readEvolutionHistory(id,f.actor))[0],event);
  } else {
    assert.ok(!incoming.protection.natural.some(l=>l.name==='Evolved hide'));
    assert.ok(incoming.protection.natural.some(l=>l.name==='Young hide'&&l.soak===3));
    assert.equal(p.definitionChanges.after.baseMagic,13);
    assert.equal((await one('select points from campaign_character_skill_allocation where character_id=$1 and skill_id=$2',[id,f.skillId])).points,17);
    assert.equal((await one("select value from campaign_character_attribute where character_id=$1 and attribute_key='DEX'",[id])).value,55);
    const restored=await one('select * from campaign_character_profile where character_id=$1',[id]);
    assert.equal(restored.race_id,f.source.ancestry.id);
    for(const [key,delta] of [['hp_multiplier_steps',2],['base_movement_steps',3],['base_magic_steps',4]]) assert.equal(restored[key],initialProfile[key]+delta);
  }
});

for(const status of ['draft','locked','committed','rolling-ready','rolling','awaiting-god-ruling','interrupted']) test(`live Return blocks ${status} actor and target; rechecks after clean preview`,async()=>{
  const f=await fixture(); await evolve(f); await evolve(f,f.defenderId);
  const input=backCommand(await back(f)); await insertDeclaration(f,f.heroId,f.defenderId,status);
  for(const id of [f.heroId,f.defenderId]) {
    const p=await back(f,id); assert.deepEqual(p.encounterContexts,(await boundary(f,id)).contexts);
    assert.ok(p.encounterContexts[0].operations.some(b=>b.kind==='declaration'&&b.status===status));
  }
  const before=await allRows(); await assert.rejects(api.executePersistentEvolutionReturn(input,f.actor),/unfinished declaration/); assert.deepEqual(await allRows(),before);
});

test('shared Return boundary includes checkpoint, interrupted action, source resolution, defense/protected target, responder, effect plan and Called Check',async()=>{
  const f=await fixture(); await evolve(f); await evolve(f,f.defenderId);
  const includes=async(kind,id=f.heroId)=>{const p=await back(f,id); assert.deepEqual(p.encounterContexts,(await boundary(f,id)).contexts); assert.ok(p.encounterContexts[0].operations.some(b=>b.kind===kind),kind);};
  await db.transaction(tx=>tx.insert(runtime.campaignSessionEncounterDeclarationCheckpoint).values({encounterId:f.encounterId,roundNumber:1,timelineInitiative:22,participantIdsJson:[f.heroId],beforeStateJson:{}}));
  await includes('checkpoint'); await pool.query('update campaign_session_encounter_declaration_checkpoint set revealed_at=now() where encounter_id=$1',[f.encounterId]);
  await pool.query("update campaign_session_encounter_pending_action set status='interrupted' where id=$1",[f.pendingActionId]); await includes('initiative-action');
  await pool.query("update campaign_session_encounter_pending_action set status='completed' where id=$1",[f.pendingActionId]);
  await pool.query("update campaign_session_encounter_pending_action_source set resolution_status='pending',resolved_at=null,payload_json=$2 where pending_action_id=$1",[f.pendingActionId,JSON.stringify({selections:{targetGroups:{body:[f.defenderId]}}})]);
  await includes('source-resolution',f.defenderId);
  await pool.query("update campaign_session_encounter_pending_action_source set resolution_status='resolved',resolved_at=now() where pending_action_id=$1",[f.pendingActionId]);
  await pool.query("update campaign_session_encounter_reaction set status='declared',resolved_at=null,protected_target_character_id=$2 where id=$1",[f.reactionId,f.heroId]);
  await includes('reaction'); await includes('reaction',f.defenderId);
  await pool.query("update campaign_session_encounter_reaction set status='resolved',resolved_at=now() where id=$1",[f.reactionId]);
  const decl=await insertDeclaration(f,f.occurrences[0],f.occurrences[1],'committed');
  const hierarchy={campaignId:f.campaignId,sessionId:f.sessionId,sceneId:f.sceneId,encounterId:f.encounterId};
  await db.transaction(tx=>tx.insert(runtime.campaignSessionEncounterResponderOpportunity).values({...hierarchy,declarationId:decl.id,pendingActionId:f.pendingActionId,responderCharacterId:f.heroId,source:'initiative',reachedAtInitiative:22,reason:'Return boundary'}));
  await includes('response-opportunity');
  await pool.query("update campaign_session_encounter_action_declaration set status='resolved',ended_at=now(),ended_by_user_id=$2 where id=$1",[decl.id,f.godId]);
  const plan=await db.transaction(async tx=>{
    const [p]=await tx.insert(runtime.campaignSessionEncounterEffectPlan).values({...hierarchy,declarationId:decl.id,pendingActionId:f.pendingActionId,actorParticipantId:f.occurrences[0],sourceKind:'weapon',sourceIdentity:'Historical attack',status:'requires-god-ruling',targetSnapshotJson:[{targetParticipantId:f.heroId}],sourceSnapshotJson:{},initiativeCommitmentJson:{},resourceCostsJson:[],createdByUserId:f.godId}).returning();
    await tx.insert(runtime.campaignSessionEncounterEffect).values({...hierarchy,planId:p.id,targetParticipantId:f.heroId,effectKey:'damage',effectType:'damage',sourceKind:'weapon',sourceIdentity:'Historical attack',authoredValueJson:{},status:'requires-god-ruling'}); return p;
  });
  await includes('effect-plan'); await pool.query("update campaign_session_encounter_effect_plan set status='applied' where id=$1",[plan.id]); await includes('effect-plan');
  await pool.query("update campaign_session_encounter_effect set status='applied',applied_at=now(),applied_result_json='{}' where plan_id=$1",[plan.id]);
  const checks=await import('../src/features/tabletop-operations/called-check-service.ts');
  for(const encounterId of [f.encounterId,null]) {
    const batch=await db.transaction(tx=>checks.issueCalledCheckInTransaction(tx,f.godId,{sessionId:f.sessionId,sceneId:f.sceneId,encounterId,source:{kind:'attribute',attributeKey:'DEX'},recipientScope:'one',recipientCharacterIds:[f.heroId],purpose:'Evolved mechanics',instructions:'',visibility:'god-only',rollMethod:'entered',modifiers:[],idempotencyKey:randomUUID()}));
    await includes('called-check'); const check=await one('select id from campaign_session_called_check_request where batch_id=$1',[batch]);
    await db.transaction(tx=>checks.cancelCalledCheckInTransaction(tx,f.godId,check.id,'Complete boundary check'));
  }
  await insertDeclaration(f,f.occurrences[0],f.occurrences[1],'draft');
  assert.deepEqual((await back(f)).blockers,[],'unrelated operations and completed history do not block'); await returnNow(f);
});

test('live Return publishes Character and all-participant Encounter invalidations only after commit; rollback and retry publish none',async()=>{
  const f=await fixture(); await evolve(f); const listener=await pool.connect(),events=[];
  listener.on('notification',message=>events.push(JSON.parse(message.payload))); await listener.query('listen serrian_tide_tabletop');
  const drain=()=>new Promise(resolve=>setTimeout(resolve,100));
  try {
    const input=backCommand(await back(f)),before=await allRows();
    await pool.query("create function return_runtime_failure() returns trigger language plpgsql as $$ begin raise exception 'Return rollback test'; end $$");
    await pool.query('create trigger return_runtime_failure before insert on race_evolution_events for each row execute function return_runtime_failure()');
    try {await assert.rejects(api.executePersistentEvolutionReturn(input,f.actor),/Failed query|rollback/);} finally {
      await pool.query('drop trigger return_runtime_failure on race_evolution_events'); await pool.query('drop function return_runtime_failure()');
    }
    await drain(); assert.deepEqual(events,[]); assert.deepEqual(await allRows(),before);
    const result=await api.executePersistentEvolutionReturn(input,f.actor); await drain();
    assert.equal(events.length,2); assert.ok(events.some(e=>e.characterIds.includes(f.heroId)&&e.encounterId===null));
    assert.ok(events.some(e=>e.encounterId===f.encounterId&&e.characterIds.length===0&&e.category==='character-state'));
    assert.equal((await api.executePersistentEvolutionReturn(input,f.actor)).event.id,result.event.id); await drain(); assert.equal(events.length,2);
  } finally {await listener.query('unlisten *'); listener.release();}
});

for(const kind of ['race','creature']) test(`live ${kind} cycles and nested Returns use latest unreversed event and fresh path version`,async()=>{
  const f=await fixture(),c=kind==='creature'?await creatureSubject(f):null,id=c?.id??f.heroId,pathId=c?.pathId??f.racePath;
  const original=await evolve(f,id,kind,pathId); await returnNow(f,id,kind);
  const stale=command(await preview(f,id,kind,pathId));
  await pool.query(`update ${kind}_evolution_paths set version=version+1 where id=$1`,[pathId]);
  await assert.rejects(api.executePersistentEvolution(stale,f.actor),/changed|revision|version/i);
  const second=await evolve(f,id,kind,pathId); assert.notEqual(second.event.id,original.event.id);
  let nextPath;
  if(c) {const third=await creatureSubject(f); nextPath=(await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$2,'Live third stage') returning id",[c.to.id,third.from.id])).id;}
  else {
    const destination=await db.transaction(async tx=>{
      await tx.update(realm.campaignAllowedRace).set({sortOrder:10}).where(eq(realm.campaignAllowedRace.raceId,f.destination.ancestry.id));
      const third=await raceNaturalAttackFixture(tx,f.heroId,f.skillId);
      await tx.update(realm.campaignCharacterProfile).set({raceId:f.destination.ancestry.id}).where(eq(realm.campaignCharacterProfile.characterId,id));
      await tx.insert(realm.campaignRace).values({campaignId:f.campaignId,raceId:third.ancestry.id,sortOrder:third.ancestry.id}); return third;
    });
    nextPath=(await racePaths.saveRaceEvolution({sourceRaceId:f.destination.ancestry.id,destinationRaceId:destination.ancestry.id,name:'Live third stage',description:'',notes:'',transition:emptyRaceEvolutionTransition()},f.actor))[0].id;
  }
  const third=await evolve(f,id,kind,nextPath),p=await back(f,id,kind); assert.equal(p.returning.eventId,third.event.id);
  await assert.rejects(api.executePersistentEvolutionReturn({...backCommand(p),expectedEventId:second.event.id},f.actor),/next Return step/);
  await returnNow(f,id,kind); assert.equal((await back(f,id,kind)).returning.eventId,second.event.id); await returnNow(f,id,kind);
  assert.equal((await api.readIndividualEvolutionState(id,f.actor)).returnCandidate,null);
  const history=await api.readEvolutionHistory(id,f.actor); assert.equal(history.length,6); assert.equal(new Set(history.filter(e=>e.operation==='return').map(e=>e.reversesEventId)).size,3);
});

test('pre-Evolution, evolved attached-Magic and post-Return attacks retain separate frozen sources and results',async()=>{
  const f=await fixture(),integration=await import('../src/features/tabletop-operations/runtime-integration-service.ts');
  const {advanceInitiativeTimeline}=await import('../src/features/tabletop-operations/initiative-runtime.ts');
  const {resolveDeclaredDefensesInTransaction}=await import('../src/features/tabletop-operations/defense-intervention-service.ts');
  const effects=await import('../src/features/tabletop-operations/action-effect-plan-service.ts');
  const {magicCompletionDocument}=await import('./fixtures/magic-completion-fixture.ts');
  const magic=magicCompletionDocument(false); magic.name='Evolved attached Magic';
  await db.transaction(tx=>tx.update(raceNaturalAttack).set({authoring:{...f.destination.attack.authoring,magic:{document:magic}}}).where(eq(raceNaturalAttack.id,f.destination.attack.id)));
  async function attack(ref,timeline) {
    await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2",[f.encounterId,f.heroId]);
    return db.transaction(async tx=>{
      const context=await lockOwnedEncounterRuntimeInTransaction(tx,f.encounterId,f.godId);
      const id=await declarationApi.createActionDeclarationDraftInTransaction(tx,context,f.player,{...completionDraft(f.heroId,f.occurrences[0]),sourceKind:'race-natural-attack',sourceRef:ref,sourcePayload:{rangeAttackMode:'melee',rangeDistance:5,rangeUnit:'feet'}});
      await declarationApi.lockActionDeclarationInTransaction(tx,context,f.player,id); await declarationApi.commitActionDeclarationInTransaction(tx,context,f.player,id,{method:'entered',enteredTotal:70});
      await resolveDeclaredDefensesInTransaction(tx,context,f.god,id);
      const before=await integration.loadInitiativeEngineInTransaction(tx,f.encounterId); await integration.persistInitiativeEngineInTransaction(tx,context,before,advanceInitiativeTimeline(before,timeline));
      const plan=await effects.generateActionEffectPlanInTransaction(tx,context,f.god,id); await effects.applyRoutineCombatConsequencesInTransaction(tx,context,f.god,id); return {id,plan};
    });
  }
  const young=await attack(f.source.ref,18); await evolve(f); const evolved=await attack(f.destination.ref,14);
  const magicEffects=await rows('select * from campaign_session_encounter_effect where plan_id=$1 order by id',[evolved.plan]);
  assert.equal(magicEffects.length,2); assert.ok(magicEffects.every(e=>e.status==='applied')); assert.match(JSON.stringify(magicEffects),/magic|construction/i);
  const history=await allRows(); await returnNow(f); const after=await allRows();
  for(const table of Object.keys(history).filter(t=>t.startsWith('campaign_session'))) assert.deepEqual(after[table],history[table],`${table}: Return freezes source/result/resource/Magic history`);
  const restored=await attack(f.source.ref,10);
  for(const [action,name,attached] of [[young,'Young claw',false],[evolved,'Evolved claw',true],[restored,'Young claw',false]]) {
    const row=await one('select * from campaign_session_encounter_action_declaration where id=$1',[action.id]);
    assert.equal(row.status,'resolved'); assert.match(JSON.stringify(row.locked_snapshot_json),new RegExp(name));
    assert.equal(JSON.stringify(row.locked_snapshot_json).includes('Evolved attached Magic'),attached);
  }
  assert.deepEqual(await rows('select * from campaign_session_encounter_effect where plan_id=$1 order by id',[evolved.plan]),magicEffects);
});

test('runtime writer waiting behind Return cannot lock the obsolete evolved source',async()=>{
  const f=await fixture(); await evolve(f);
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2",[f.encounterId,f.heroId]);
  const input=backCommand(await back(f)),client=await pool.connect(),gate=214730002;
  await pool.query(`create function return_runtime_gate() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(${gate}); return new; end $$`);
  await pool.query('create trigger return_runtime_gate before insert on race_evolution_events for each row execute function return_runtime_gate()');
  let execution,writer;
  try {
    await client.query('select pg_advisory_lock($1)',[gate]); execution=api.executePersistentEvolutionReturn(input,f.actor);
    const deadline=Date.now()+5000;
    while(!(await one("select exists(select 1 from pg_locks where locktype='advisory' and objid=$1 and not granted) waiting",[gate])).waiting) {
      if(Date.now()>deadline) throw new Error('Return did not reach fenced event insert'); await new Promise(resolve=>setTimeout(resolve,20));
    }
    let ended=false;
    writer=db.transaction(async tx=>{
      const context=await lockOwnedEncounterRuntimeInTransaction(tx,f.encounterId,f.godId);
      const id=await declarationApi.createActionDeclarationDraftInTransaction(tx,context,f.player,{...completionDraft(f.heroId,f.occurrences[0]),sourceKind:'race-natural-attack',sourceRef:f.destination.ref,sourcePayload:{rangeAttackMode:'melee',rangeDistance:5,rangeUnit:'feet'}});
      await declarationApi.lockActionDeclarationInTransaction(tx,context,f.player,id);
    }).then(()=>({error:null}),error=>({error})).finally(()=>{ended=true;});
    await new Promise(resolve=>setTimeout(resolve,100)); assert.equal(ended,false);
    await client.query('select pg_advisory_unlock($1)',[gate]); await execution;
    assert.match((await writer).error?.message??'',/current (?:Normal Race|effective body)|no longer|source/i);
    assert.equal((await rows('select id from campaign_session_encounter_action_declaration where encounter_id=$1',[f.encounterId])).length,0);
  } finally {
    await client.query('select pg_advisory_unlock($1)',[gate]); await Promise.allSettled([execution,writer]);client.release();
    await pool.query('drop trigger return_runtime_gate on race_evolution_events'); await pool.query('drop function return_runtime_gate()');
  }
});

for(const force of [false,true]) test(`live Return survives Freeze/Resume and ${force?'force-end':'normal closeout'}`,async()=>{
  const f=await fixture(); await evolve(f); const input=backCommand(await back(f));
  await assert.rejects(api.previewPersistentEvolutionReturn('creature',f.occurrences[0],f.actor),/positive|Persistent/);
  const {setCombatFrozenInTransaction}=await import('../src/features/tabletop-operations/combat-freeze-service.ts');
  await db.transaction(tx=>setCombatFrozenInTransaction(tx,f.encounterId,f.god,{frozen:true,expectedRevision:0}));
  await assert.rejects(api.executePersistentEvolutionReturn(input,f.actor),/frozen for inspection/);
  await db.transaction(tx=>setCombatFrozenInTransaction(tx,f.encounterId,f.god,{frozen:false,expectedRevision:1}));
  const result=await returnNow(f);
  if(force) {
    const {forceEndCombatInTransaction}=await import('../src/features/tabletop-operations/combat-force-end-service.ts');
    await db.transaction(tx=>forceEndCombatInTransaction(tx,f.encounterId,f.god,'Permanent Return closeout'));
  } else {
    const closeout=await import('../src/features/tabletop-operations/encounter-closeout-service.ts');
    const integration=await import('../src/features/tabletop-operations/runtime-integration-service.ts');
    const {closeInitiativeRuntime}=await import('../src/features/tabletop-operations/initiative-runtime.ts');
    await db.transaction(async tx=>{const before=await integration.loadInitiativeEngineInTransaction(tx,f.encounterId);await integration.persistInitiativeEngineInTransaction(tx,f.context,before,closeInitiativeRuntime(before));});
    await db.transaction(async tx=>closeout.finalizeEncounterCloseoutInTransaction(tx,await closeout.lockEncounterCloseoutContextInTransaction(tx,f.encounterId,f.godId),{awards:[]}));
  }
  assert.equal((await one('select race_id from campaign_character_profile where character_id=$1',[f.heroId])).race_id,f.source.ancestry.id);
  assert.deepEqual((await api.readEvolutionHistory(f.heroId,f.actor))[0],result.event);
});

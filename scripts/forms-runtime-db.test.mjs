import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { actors, db, pool, runtime, completionDraft, declarationApi, fixture, creatureSubject, allRows, one, rows, insertDeclaration, api as evolution, preview as evolutionPreview, command as evolutionCommand, readCombatCommandSources, readIncomingEffectEncounterTargetInTransaction } from './fixtures/evolution-runtime-fixture.mjs';
const forms = await import('../src/features/forms/form-runtime-service.ts');
const { wolfFormMechanics } = await import('./race-form-mechanics-fixture.ts');
const { emptyRaceForm } = await import('../src/features/races/race-forms.ts');
const { emptyFormTransformation } = await import('../src/features/forms/form-transformation.ts');
const { saveRaceFormsInTransaction, readRaceFormsInTransaction } = await import('../src/features/races/race-form-service.ts');
const { creatureFormFixture } = await import('./creature-form-fixture.ts');
const { accessFixture, accessRequirement } = await import('./form-access-fixture.ts');
const engine = await import('../src/features/tabletop-operations/initiative-runtime.ts');
const integration = await import('../src/features/tabletop-operations/runtime-integration-service.ts');
after(()=>pool.end());
const instant={mode:'instant',initiativeCost:null,time:'',notes:''};
const transformation=()=>({...emptyFormTransformation(),entryMethod:'voluntary',entryTiming:instant,exitTiming:instant,entryCosts:{mode:'none',costs:[]},exitCosts:{mode:'none',costs:[]},exitMethods:['voluntary'],duration:{mode:'voluntary-end',description:''},limitMode:'unlimited'});
async function save(f,changes={}) {
  const mechanics=wolfFormMechanics(f.skillId,f.skillId);mechanics.skillLinks=[];mechanics.attributeAdjustments.STR=50;
  const form={...emptyRaceForm('wolf'),name:'Runtime Wolf',mechanics,transformation:transformation(),...changes};
  await db.transaction(tx=>saveRaceFormsInTransaction(tx,f.source.ancestry.id,[form],{anatomy:null,naturalAttacks:[],naturalProtections:[]}));
  return (await db.transaction(tx=>readRaceFormsInTransaction(tx,f.source.ancestry.id)))[0];
}
async function setup(label='forms-runtime',changes={}) {
  const f=await fixture(label); f.form=await save(f,changes);
  f.playerId=randomUUID(); await pool.query('insert into "user"(id,name,email) values($1,$1,$2)',[f.playerId,`${f.playerId}@example.invalid`]);
  await pool.query("insert into user_role(user_id,role) values($1,'player')",[f.playerId]);
  await pool.query('insert into campaign_player(campaign_id,user_id) values($1,$2)',[f.campaignId,f.playerId]);
  await pool.query('update campaign_character set player_user_id=$2 where id=$1',[f.heroId,f.playerId]);
  f.playerActor={userId:f.playerId}; return f;
}
const selection=(f,id=f.heroId,operation='enter',form=f.form)=>({characterId:id,operation,...(operation==='enter'?{formId:form.id,formKey:form.key,sourceId:form.raceId??form.creatureId}:{})});
const input=p=>({characterId:p.characterId,operation:p.operation,formId:p.definition.formId,formKey:p.definition.key,sourceId:p.definition.sourceId,reviewToken:p.reviewToken,idempotencyKey:randomUUID(),rulings:{},confirmTime:false});
const preview=(f,id=f.heroId,operation='enter',actor=f.actor,form=f.form)=>forms.previewFormTransition(selection(f,id,operation,form),actor);
const enter=async(f,id=f.heroId,actor=f.actor,form=f.form)=>forms.executeFormTransition(input(await preview(f,id,'enter',actor,form)),actor);
const leave=async(f,id=f.heroId,actor=f.actor)=>forms.executeFormTransition(input(await preview(f,id,'return',actor)),actor);
async function ready(f,id=f.heroId) {await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active',last_satisfied_step=0 where encounter_id=$1 and character_id=$2",[f.encounterId,id]);}
async function tick(f) {return db.transaction(async tx=>{const context=await integration.lockOwnedEncounterRuntimeInTransaction(tx,f.encounterId,f.godId); const before=await integration.loadInitiativeEngineInTransaction(tx,f.encounterId); await integration.persistInitiativeEngineInTransaction(tx,context,before,engine.advanceInitiativeToNextEvent(before));});}
async function frozenCreature(f) {
  const c=await creatureSubject(f),profile=await one('select * from campaign_creature_npc_profile where character_id=$1',[c.id]);
  const snapshot=JSON.parse(profile.current_snapshot_json); const form={...creatureFormFixture(),id:900001,creatureId:c.from.id,transformation:transformation()}; snapshot.forms=[form];
  await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2,baseline_snapshot_json=$2 where character_id=$1',[c.id,JSON.stringify(snapshot)]);
  return {...c,form};
}
async function preserve(f,id) {
  await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,2,'worn',0)",[id,f.weaponId]);
  await pool.query('insert into campaign_character_active_health(character_id,total_damage) values($1,111) on conflict(character_id) do update set total_damage=111',[id]);
  await pool.query("insert into campaign_character_active_health_pool(character_id,pool_key,pool_name_snapshot,damage) values($1,'orphan','Old limb',7)",[id]);
  await pool.query("insert into campaign_character_injury(character_id,pool_key,pool_name_snapshot,name,damage_amount) values($1,'orphan','Old limb','Break',7)",[id]);
  await pool.query("insert into campaign_character_active_condition(character_id,name,source_kind,source_id,source_name,duration_kind,duration_value,duration_label) values($1,'Persistent condition','god','fixture','Fixture','combat-rounds',3,'3 rounds')",[id]);
  const condition=await one("select id from campaign_character_active_condition where character_id=$1 order by id desc limit 1",[id]);
  await db.transaction(async tx=>{const hierarchy={campaignId:f.campaignId,sessionId:f.sessionId,sceneId:f.sceneId,encounterId:f.encounterId,characterId:id};await tx.insert(runtime.campaignSessionEffectDurationBinding).values({...hierarchy,conditionId:condition.id,durationKind:'combat-rounds',remainingValue:3});await tx.insert(runtime.campaignSessionPeriodicHealthEffect).values({...hierarchy,applicationKey:randomUUID(),sourceKind:'spell',sourceId:'fixture',effectKind:'health.damage',amount:1,application:'area',poolKey:'orphan',frequency:'combat-rounds',remainingApplications:3,nextStep:2,nextRound:2});});
  await pool.query("insert into campaign_character_injury(character_id,pool_key,pool_name_snapshot,name,damage_amount,resolved,resolved_at) values($1,'orphan','Old limb','Scar',1,true,now())",[id]);
  await pool.query('update campaign_session_encounter_participant set local_state_json=$2 where encounter_id=$3 and character_id=$1',[id,{limbConditions:[{poolKey:'orphan',name:'Disabled',sourceEffectId:1,incapacitatedAt:'2026-10-03T12:00:00Z'}]},f.encounterId]);
  await pool.query("insert into campaign_character_active_modifier(character_id,label,modifier_channel,target_key,amount,source_kind,source_id,source_name,duration_kind,duration_label) values($1,'Persistent modifier','attribute','STR',2,'god','fixture','Fixture','until-removed','Until removed')",[id]);
}
for(const kind of ['PC','Race NPC','Creature NPC']) test(`${kind}: Normal default, preview read-only, transactional cycles preserve every unrelated table and Normal combat mechanics`,async()=>{
  const f=await setup(),c=kind==='Creature NPC'?await frozenCreature(f):null,id=c?.id??(kind==='PC'?f.heroId:f.defenderId),form=c?.form??f.form;
  await preserve(f,id); if(!c) await creatureSubject(f);
  const actor=kind==='PC'?f.playerActor:f.actor;
  const before=await allRows(),normal=await forms.readIndividualFormRuntime(id,actor); assert.equal(normal.current,null);
  const choices=await actors.run(f.godId,()=>readCombatCommandSources({role:'god',encounterId:f.encounterId},id));
  const incoming=await db.transaction(tx=>readIncomingEffectEncounterTargetInTransaction(tx,f.context,id));
  const p=await preview(f,id,'enter',actor,form); assert.deepEqual(p.blockers,[]); assert.deepEqual(await allRows(),before,'preview/read do not mutate');
  const command=input(p),first=await forms.executeFormTransition(command,actor); assert.equal(first.status,'completed');
  const active=await forms.readIndividualFormRuntime(id,actor); assert.equal(active.current.id,first.event.id); assert.equal(active.current.evidence.review.definition.formId,form.id);
  const after=await allRows(); for(const table of Object.keys(before)) if(!['campaign_character_active_form','form_transition_request','form_transition_event'].includes(table)) assert.deepEqual(after[table],before[table],table);
  assert.deepEqual(await actors.run(f.godId,()=>readCombatCommandSources({role:'god',encounterId:f.encounterId},id)),choices,'Form attacks do not enter Normal choices');
  assert.deepEqual(await db.transaction(tx=>readIncomingEffectEncounterTargetInTransaction(tx,f.context,id)),incoming,'Normal protection, anatomy and interaction rules unchanged');
  assert.equal((await forms.executeFormTransition(command,actor)).event.id,first.event.id); assert.deepEqual(await allRows(),after,'retry no writes');
  await assert.rejects(forms.executeFormTransition({...command,confirmTime:true},actor),/different input/);
  await assert.rejects(enter(f,id,actor,form),/Return to Normal/);
  const returned=await leave(f,id,actor); assert.equal(returned.event.enteredEventId,first.event.id); assert.equal((await forms.readIndividualFormRuntime(id,actor)).current,null);
  await assert.rejects(leave(f,id,actor),/Already Normal/);
  await enter(f,id,actor,form); await leave(f,id,actor); assert.equal((await forms.readIndividualFormRuntime(id,actor)).history.length,4);
  await assert.rejects(pool.query('update form_transition_event set form_key=$2 where id=$1',[first.event.id,'forged']),/immutable/);
});

test('exact owner identity: foreign Race Form, wrong ID, negative occurrence rejected',async()=>{
 const f=await setup(); for(const change of [{sourceId:f.destination.ancestry.id},{formId:f.form.id+1},{formKey:'invented'},{characterId:-1}]) await assert.rejects(forms.previewFormTransition({...selection(f),...change},f.actor),/exact Form|positive/);
});
for(const kind of ['Race NPC','Creature NPC','other PC','Admin','foreign GOD']) test(`authority refuses ${kind}`,async()=>{
 const f=await setup();let id=f.defenderId,actor=f.playerActor;
 if(kind==='Creature NPC')id=(await frozenCreature(f)).id;
 if(kind==='other PC'){id=f.heroId;await pool.query('update campaign_character set player_user_id=$2 where id=$1',[id,f.godId]);}
 if(['Admin','foreign GOD'].includes(kind)){id=f.heroId; await pool.query('delete from user_role where user_id=$1',[f.playerId]);await pool.query('insert into user_role(user_id,role) values($1,$2)',[f.playerId,kind==='Admin'?'admin':'god']);}
 await assert.rejects(forms.previewFormTransition(selection(f,id),actor),/owning|G.O.D./);
});
test('automatic Access cannot self-qualify with Form bonuses and GOD cannot bypass Locked',async()=>{
 const f=await setup('',{access:accessFixture(accessRequirement('attribute',{attributeKey:'STR',operator:'gte',requiredValue:100}))});
 const p=await preview(f);assert.equal(p.access.status,'locked');await assert.rejects(forms.executeFormTransition({...input(p),rulings:{access:'Bypass failed facts'}},f.actor));
});
test('manual Access requires explicit GOD evidence, Player cannot forge it',async()=>{
 const f=await setup('',{access:accessFixture(accessRequirement('manual',{notes:'Approved ritual'}))});
 const p=await preview(f);assert.equal(p.access.status,'manual-review');await assert.rejects(forms.executeFormTransition(input(p),f.actor),/ruling required/);
 const player=await preview(f,f.heroId,'enter',f.playerActor);await assert.rejects(forms.executeFormTransition({...input(player),rulings:{access:'Forged ruling'}},f.playerActor));
 const event=(await forms.executeFormTransition({...input(p),rulings:{access:'Ritual observed by GOD'}},f.actor)).event;assert.equal(event.evidence.command.rulings.access,'Ritual observed by GOD');
});
for(const mode of ['involuntary','custom',null]) test(`entry method ${mode}: GOD evidence required and Player blocked`,async()=>{
 const f=await setup('',{transformation:{...transformation(),entryMethod:mode}});const p=await preview(f);
 assert.ok(p.manualSteps.some(s=>s.key==='entry-method'));await assert.rejects(forms.executeFormTransition(input(p),f.actor));
 const pp=await preview(f,f.heroId,'enter',f.playerActor);assert.ok(pp.blockers.length);
 await forms.executeFormTransition({...input(p),rulings:{'entry-method':'Authored control confirmed'}},f.actor);
});
for(const mode of ['time','custom',null]) test(`active ${mode} timing remains explicitly ruled`,async()=>{
 const f=await setup('',{transformation:{...transformation(),entryTiming:{mode,initiativeCost:null,time:mode==='time'?'one minute':'',notes:'Authored'}}});
 const p=await preview(f);assert.equal(p.timing.mode,'manual');await assert.rejects(forms.executeFormTransition(input(p),f.actor));
 await forms.executeFormTransition({...input(p),rulings:{timing:'GOD resolves the authored timing now'},manualTiming:{mode:'instant',initiativeCost:null}},f.actor);
});
test('outside Encounter Time requires confirmation and records authored prose without scheduling',async()=>{
 const f=await setup('',{transformation:{...transformation(),entryTiming:{mode:'time',initiativeCost:null,time:'Three breaths',notes:''}}});
 await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1",[f.encounterId]);
 const p=await preview(f,f.heroId,'enter',f.playerActor);assert.equal(p.timing.mode,'time-confirm');await assert.rejects(forms.executeFormTransition(input(p),f.playerActor),/Confirm/);
 await forms.executeFormTransition({...input(p),confirmTime:true},f.playerActor);
});
for(const type of ['health','ammunition','resource','custom','mana','unspecified']) test(`${type} without exact spender is manual, never free`,async()=>{
 const costs=type==='unspecified'?{mode:'unspecified',costs:[]}:{mode:'costs',costs:[{costType:type,amount:2,resourceKey:type==='resource'?'Quintessence':null,notes:'Cost evidence',sortOrder:0}]};
 const f=await setup('',{transformation:{...transformation(),entryCosts:costs}}),p=await preview(f);assert.ok(p.manualSteps.length);
 assert.ok((await preview(f,f.heroId,'enter',f.playerActor)).blockers.length);
 await assert.rejects(forms.executeFormTransition(input(p),f.actor));
 const before=await allRows();await forms.executeFormTransition({...input(p),rulings:Object.fromEntries(p.manualSteps.map(s=>[s.key,'GOD exact manual cost resolution']))},f.actor);
 const after=await allRows();for(const t of Object.keys(before))if(!['campaign_character_active_form','form_transition_request','form_transition_event'].includes(t))assert.deepEqual(after[t],before[t],t);
});
for(const limit of ['limited','custom','unspecified','cooldown']) test(`${limit} requires recorded review without hidden counters`,async()=>{
 const t=transformation(); if(limit==='cooldown')t.cooldown='Rest one hour';else {t.limitMode=limit;if(limit==='limited')t.useLimits=[{maximumUses:1,refreshScope:'scene',refreshKey:null,notes:'',sortOrder:0}];}
 const f=await setup('',{transformation:t}),p=await preview(f);assert.ok(p.manualSteps.length);assert.ok((await preview(f,f.heroId,'enter',f.playerActor)).blockers.length);
 await forms.executeFormTransition({...input(p),rulings:Object.fromEntries(p.manualSteps.map(s=>[s.key,'Reviewed prior uses and recovery']))},f.actor);
});
for(const mode of ['known true','known false','unknown']) test(`transformation condition ${mode}`,async()=>{
 const condition={conditionType:'state',conditionKey:mode==='unknown'?'state.moonlight':'state.hp-percent',operator:'gte',numericValue:mode==='known false'?101:0,textValue:null,notes:'',sortOrder:0};
 const f=await setup('',{transformation:{...transformation(),requirements:[condition]}}),p=await preview(f);
 if(mode==='known true')await forms.executeFormTransition(input(p),f.actor);
 else if(mode==='known false'){assert.ok(p.blockers.length);await assert.rejects(forms.executeFormTransition(input(p),f.actor));}
 else {assert.ok(p.manualSteps.some(s=>s.key==='condition-0'));await assert.rejects(forms.executeFormTransition(input(p),f.actor));}
});
for(const status of ['draft','locked','committed','rolling','awaiting-god-ruling','resolved','cancelled']) test(`${status} declaration involvement uses shared clean boundary`,async()=>{
 const f=await setup();await insertDeclaration(f,f.defenderId,f.heroId,status);const p=await preview(f);
 if(['resolved','cancelled'].includes(status))await forms.executeFormTransition(input(p),f.actor);else {assert.ok(p.blockers.length);await assert.rejects(forms.executeFormTransition(input(p),f.actor));}
});
test('frozen preview/execution reject; resume clean succeeds; stale preview blocks new combat',async()=>{
 const f=await setup(),p=await preview(f);await pool.query('update campaign_session_encounter set frozen_at=now() where id=$1',[f.encounterId]);assert.ok((await preview(f)).blockers.some(b=>/frozen/i.test(b)));await assert.rejects(forms.executeFormTransition(input(p),f.actor));
 await pool.query('update campaign_session_encounter set frozen_at=null where id=$1',[f.encounterId]);const fresh=await preview(f);await insertDeclaration(f);await assert.rejects(forms.executeFormTransition(input(fresh),f.actor));
});
test('frozen library evidence survives Form edit/delete; return uses frozen exit and preserves later advancement',async()=>{
 const f=await setup();const first=await enter(f);await pool.query("update race_forms set name='Edited',transformation_json=null where id=$1",[f.form.id]);
 await pool.query('update campaign_character_attribute set value=value+7 where character_id=$1',[f.heroId]);const before=await rows('select * from campaign_character_attribute where character_id=$1',[f.heroId]);
 await pool.query('delete from race_forms where id=$1',[f.form.id]);assert.equal((await forms.readIndividualFormRuntime(f.heroId,f.actor)).current.evidence.review.definition.name,'Runtime Wolf');
 const returned=await leave(f);assert.equal(returned.event.enteredEventId,first.event.id);assert.deepEqual(await rows('select * from campaign_character_attribute where character_id=$1',[f.heroId]),before);
});
test('Creature master edits never replace frozen individual Form identity',async()=>{
 const f=await setup(),c=await frozenCreature(f);await enter(f,c.id,f.actor,c.form);await pool.query("update creatures set canonical_name='Changed master' where id=$1",[c.from.id]);
 const current=await forms.readIndividualFormRuntime(c.id,f.actor);assert.equal(current.current.evidence.review.definition.name,c.form.name);assert.equal(current.forms[0].definition.formId,c.form.id);await leave(f,c.id);
});
test('active Form blocks forward Evolution and historical Return; Normal Evolution refreshes exact available Forms',async()=>{
 const f=await setup();await enter(f);const blocked=await evolutionPreview(f);assert.ok(blocked.blockers.some(b=>/Return to Normal/.test(b)));await assert.rejects(evolution.executePersistentEvolution(evolutionCommand(blocked),f.actor));await leave(f);
 await evolution.executePersistentEvolution(evolutionCommand(await evolutionPreview(f)),f.actor);assert.equal((await forms.readIndividualFormRuntime(f.heroId,f.actor)).current,null);assert.equal((await forms.readIndividualFormRuntime(f.heroId,f.actor)).forms.length,0);
 await db.transaction(tx=>saveRaceFormsInTransaction(tx,f.destination.ancestry.id,[{...emptyRaceForm('wolf'),name:'Destination Wolf',transformation:transformation()}],{anatomy:null,naturalAttacks:[],naturalProtections:[]}));
 const destination=(await forms.readIndividualFormRuntime(f.heroId,f.actor)).forms[0].definition;await forms.executeFormTransition(input(await forms.previewFormTransition({characterId:f.heroId,operation:'enter',sourceId:destination.sourceId,formId:destination.formId,formKey:destination.key},f.actor)),f.actor);
 const back=await evolution.previewPersistentEvolutionReturn('race',f.heroId,f.actor);assert.ok(back.blockers.some(b=>/Return to Normal/.test(b)));
});
for(const operation of ['enter','return']) test(`Initiative ${operation}: completion hook, exact expenditure and replay`,async()=>{
 const t=transformation();t[operation==='enter'?'entryTiming':'exitTiming']={mode:'initiative',initiativeCost:4,time:'',notes:''};
 const f=await setup('',{transformation:t});if(operation==='return')await enter(f);await ready(f);
 const p=await preview(f,f.heroId,operation,f.playerActor),command=input(p),result=await forms.executeFormTransition(command,f.playerActor);assert.equal(result.status,'pending');
 assert.equal(!!(await forms.readIndividualFormRuntime(f.heroId,f.actor)).current,operation==='return');await assert.rejects(forms.completePendingFormTransition(f.heroId,result.requestId,f.actor),/unfinished/);
 await tick(f);const active=await forms.readIndividualFormRuntime(f.heroId,f.actor);assert.equal(!!active.current,operation==='enter');assert.equal(active.pending,null);
 const timing=await one('select * from campaign_session_encounter_pending_action where id=$1',[result.pendingActionId]);assert.equal(Number(timing.initiative_spent),4);assert.equal(timing.status,'completed');
 const before=await allRows();assert.equal((await forms.executeFormTransition(command,f.playerActor)).status,'completed');assert.deepEqual(await allRows(),before);
});
test('unaffordable Initiative rolls back entirely',async()=>{
 const f=await setup('',{transformation:{...transformation(),entryTiming:{mode:'initiative',initiativeCost:100,time:'',notes:''}}});await ready(f);const before=await allRows();await assert.rejects(enter(f),/Insufficient/);assert.deepEqual(await allRows(),before);
});
test('pending transition revalidates Normal Access at completion; cancellation and freeze are safe',async()=>{
 const f=await setup('',{access:accessFixture(accessRequirement('attribute',{attributeKey:'STR',operator:'gte',requiredValue:50})),transformation:{...transformation(),entryTiming:{mode:'initiative',initiativeCost:4,time:'',notes:''}}});await ready(f);const result=await enter(f);await pool.query("update campaign_character_attribute set value=20 where character_id=$1 and attribute_key='STR'",[f.heroId]);await tick(f);
 const pending=await forms.readIndividualFormRuntime(f.heroId,f.actor);assert.equal(pending.current,null);assert.ok(pending.pending.blockers.length);await assert.rejects(forms.completePendingFormTransition(f.heroId,result.requestId,f.actor));
 await pool.query('update campaign_session_encounter set frozen_at=now() where id=$1',[f.encounterId]);await assert.rejects(forms.cancelPendingFormTransition(f.heroId,result.requestId,f.actor),/paused/);await pool.query('update campaign_session_encounter set frozen_at=null where id=$1',[f.encounterId]);
 assert.equal((await forms.cancelPendingFormTransition(f.heroId,result.requestId,f.actor)).status,'cancelled');assert.equal((await forms.readIndividualFormRuntime(f.heroId,f.actor)).history.length,0);
});
test('abandonment cancels pending entry without creating history or refunding elapsed Initiative',async()=>{
 const f=await setup('',{transformation:{...transformation(),entryTiming:{mode:'initiative',initiativeCost:4,time:'',notes:''}}});await ready(f);const result=await enter(f);await forms.cancelPendingFormTransition(f.heroId,result.requestId,f.actor);assert.equal((await forms.readIndividualFormRuntime(f.heroId,f.actor)).current,null);assert.equal((await forms.readFormTransitionReceipt(f.heroId,(await one('select idempotency_key from form_transition_request where id=$1',[result.requestId])).idempotency_key,f.actor)).status,'cancelled');
});
test('Encounter closeout retains entered Form; unfinished transformation is cancelled, never completed',async()=>{
 const f=await setup();await enter(f);await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1",[f.encounterId]);await db.transaction(tx=>forms.reconcileFormTransitionsInTransaction(tx,f.encounterId));assert.ok((await forms.readIndividualFormRuntime(f.heroId,f.actor)).current);await leave(f);
 const g=await setup('',{transformation:{...transformation(),entryTiming:{mode:'initiative',initiativeCost:4,time:'',notes:''}}});await ready(g);await enter(g);await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1",[g.encounterId]);await db.transaction(tx=>forms.reconcileFormTransitionsInTransaction(tx,g.encounterId));assert.equal((await forms.readIndividualFormRuntime(g.heroId,g.actor)).pending,null);assert.equal((await forms.readIndividualFormRuntime(g.heroId,g.actor)).current,null);
});
test('canonical Mana is spent once for entry and separately authored exit; insufficient and stale resources roll back',async()=>{
 const t=transformation();const cost=amount=>({mode:'costs',costs:[{costType:'mana',amount,resourceKey:'Spellcraft',notes:'',sortOrder:0}]});t.entryCosts=cost(3);t.exitCosts=cost(2);
 const f=await setup('',{transformation:t});await pool.query('update races set base_magic=2 where id=$1',[f.source.ancestry.id]);
 for(const name of ['Spellcraft','Channeling']) {const skill=await one("insert into skill(name,classification,tier,primary_attribute) values($1,'standard',1,'INT') returning id",[name]);await pool.query('insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,10)',[f.heroId,skill.id]);}
 const p=await preview(f,f.heroId,'enter',f.playerActor);assert.equal(p.costs[0].status,'automatic');const command=input(p),first=await forms.executeFormTransition(command,f.playerActor);assert.equal(first.event.evidence.costsPaid[0].amount,3);
 await forms.executeFormTransition(command,f.playerActor);assert.equal(Number((await one('select mana_spent from campaign_character_active_mana where character_id=$1',[f.heroId])).mana_spent),3);
 await leave(f,f.heroId,f.playerActor);assert.equal(Number((await one('select mana_spent from campaign_character_active_mana where character_id=$1',[f.heroId])).mana_spent),5);
 const stale=await preview(f);await pool.query('update campaign_character_active_mana set mana_spent=19 where character_id=$1',[f.heroId]);const before=await allRows();await assert.rejects(forms.executeFormTransition(input(stale),f.actor),/Insufficient/);assert.deepEqual(await allRows(),before);
});
test('reaction, protected target, responder and Effect Plan subject block both Enter and Return',async()=>{
 const f=await setup();await pool.query("update campaign_session_encounter_reaction set status='declared',resolved_at=null,protected_target_character_id=$2 where id=$1",[f.reactionId,f.heroId]);assert.ok((await preview(f)).blockers.length);
 await pool.query("update campaign_session_encounter_reaction set status='resolved',resolved_at=now() where id=$1",[f.reactionId]);await enter(f);
 const declaration=await insertDeclaration(f,f.occurrences[0],f.heroId,'resolved');
 const plan=await db.transaction(async tx=>{const hierarchy={campaignId:f.campaignId,sessionId:f.sessionId,sceneId:f.sceneId,encounterId:f.encounterId};const [p]=await tx.insert(runtime.campaignSessionEncounterEffectPlan).values({...hierarchy,declarationId:declaration.id,pendingActionId:f.pendingActionId,actorParticipantId:f.occurrences[0],sourceKind:'weapon',sourceIdentity:'Frozen attack',status:'requires-god-ruling',targetSnapshotJson:[{targetParticipantId:f.heroId}],sourceSnapshotJson:{},initiativeCommitmentJson:{},resourceCostsJson:[],createdByUserId:f.godId}).returning();return p;});
 assert.ok((await preview(f,f.heroId,'return')).blockers.length);await assert.rejects(leave(f));await pool.query("update campaign_session_encounter_effect_plan set status='applied',applied_at=now(),applied_by_user_id=$2 where id=$1",[plan.id,f.godId]);await leave(f);
});
test('combat source writer waits behind Form commit, then freezes current Form identity while using Normal attack',async()=>{
 const f=await setup();await ready(f);const command=input(await preview(f)),client=await pool.connect(),gate=214730005;
 await pool.query(`create function form_runtime_gate() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(${gate}); return new; end $$`);
 await pool.query('create trigger form_runtime_gate before insert on form_transition_event for each row execute function form_runtime_gate()');let execution,writer;
 try {
  await client.query('select pg_advisory_lock($1)',[gate]);execution=forms.executeFormTransition(command,f.actor);
  const deadline=Date.now()+5000;while(!(await one("select exists(select 1 from pg_locks where locktype='advisory' and objid=$1 and not granted) waiting",[gate])).waiting){if(Date.now()>deadline)throw new Error('Form did not reach protected event insert');await new Promise(r=>setTimeout(r,20));}
  let ended=false;writer=db.transaction(async tx=>{const context=await integration.lockOwnedEncounterRuntimeInTransaction(tx,f.encounterId,f.godId);const actor={...f.player,userId:f.playerId};const id=await declarationApi.createActionDeclarationDraftInTransaction(tx,context,actor,{...completionDraft(f.heroId,f.occurrences[0]),sourceKind:'race-natural-attack',sourceRef:f.source.ref,sourcePayload:{rangeAttackMode:'melee',rangeDistance:5,rangeUnit:'feet'}});await declarationApi.lockActionDeclarationInTransaction(tx,context,actor,id);return id;}).finally(()=>{ended=true;});
  await new Promise(r=>setTimeout(r,100));assert.equal(ended,false);await client.query('select pg_advisory_unlock($1)',[gate]);const entry=await execution,id=await writer;
  const snapshot=(await one('select locked_snapshot_json from campaign_session_encounter_action_declaration where id=$1',[id])).locked_snapshot_json;assert.equal(snapshot.currentForm.entryEventId,entry.event.id);assert.match(JSON.stringify(snapshot.authoredSource),/Young claw/);
 }finally{await client.query('select pg_advisory_unlock($1)',[gate]);await Promise.allSettled([execution,writer]);client.release();await pool.query('drop trigger form_runtime_gate on form_transition_event');await pool.query('drop function form_runtime_gate()');}
});
test('simultaneous duplicate retry yields one transition and one immutable event',async()=>{const f=await setup(),command=input(await preview(f));const result=await Promise.all([forms.executeFormTransition(command,f.actor),forms.executeFormTransition(command,f.actor)]);assert.equal(result[0].event.id,result[1].event.id);assert.equal((await forms.readIndividualFormRuntime(f.heroId,f.actor)).history.length,1);});
for(const force of [false,true]) test(`actual ${force?'force-end':'normal closeout'} retains entered Form and history`,async()=>{
 const f=await setup();const first=await enter(f);
 if(force){const {forceEndCombatInTransaction}=await import('../src/features/tabletop-operations/combat-force-end-service.ts');await db.transaction(tx=>forceEndCombatInTransaction(tx,f.encounterId,f.god,'Forms closeout fixture'));}
 else{const closeout=await import('../src/features/tabletop-operations/encounter-closeout-service.ts');await db.transaction(async tx=>{const before=await integration.loadInitiativeEngineInTransaction(tx,f.encounterId);await integration.persistInitiativeEngineInTransaction(tx,f.context,before,engine.closeInitiativeRuntime(before));});await db.transaction(async tx=>closeout.finalizeEncounterCloseoutInTransaction(tx,await closeout.lockEncounterCloseoutContextInTransaction(tx,f.encounterId,f.godId),{awards:[]}));}
 const state=await forms.readIndividualFormRuntime(f.heroId,f.actor);assert.equal(state.current.id,first.event.id);assert.deepEqual(state.history,[first.event]);await leave(f);
});
test('rollback and durable retry publish no duplicate invalidations',async()=>{
 const f=await setup(),listener=await pool.connect(),events=[];listener.on('notification',m=>events.push(JSON.parse(m.payload)));await listener.query('listen serrian_tide_tabletop');const drain=()=>new Promise(r=>setTimeout(r,100));
 try{const command=input(await preview(f)),before=await allRows();await pool.query("create function form_runtime_failure() returns trigger language plpgsql as $$ begin raise exception 'Form rollback fixture'; end $$");await pool.query('create trigger form_runtime_failure before insert on form_transition_event for each row execute function form_runtime_failure()');
 try{await assert.rejects(forms.executeFormTransition(command,f.actor));}finally{await pool.query('drop trigger form_runtime_failure on form_transition_event');await pool.query('drop function form_runtime_failure()');}
 await drain();assert.deepEqual(events,[]);assert.deepEqual(await allRows(),before);await forms.executeFormTransition(command,f.actor);await drain();assert.equal(events.length,2);assert.ok(events.some(e=>e.encounterId===f.encounterId&&e.characterIds.length===0));await forms.executeFormTransition(command,f.actor);await drain();assert.equal(events.length,2);
 }finally{await listener.query('unlisten *');listener.release();}
});
for(const kind of ['PC','Race NPC','Creature NPC']) test(`outside Encounter ${kind} enters and returns without runtime enrollment`,async()=>{
 const f=await setup(),c=kind==='Creature NPC'?await frozenCreature(f):null,id=c?.id??(kind==='PC'?f.heroId:f.defenderId);await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1",[f.encounterId]);const result=await enter(f,id,f.actor,c?.form??f.form);assert.deepEqual(result.event.evidence.completionContexts,[]);await leave(f,id);
});
test('planned identity-only membership remains safe; prepared participant state blocks',async()=>{
 const f=await setup();await pool.query("update campaign_session_encounter set status='completed',completed_at=now() where id=$1",[f.encounterId]);
 const e=await one("insert into campaign_session_encounter(campaign_id,session_id,scene_id,sequence_number,title) values($1,$2,$3,2,'Planned Form fixture') returning id",[f.campaignId,f.sessionId,f.sceneId]);await pool.query('insert into campaign_session_encounter_participant(campaign_id,session_id,scene_id,encounter_id,character_id) values($1,$2,$3,$4,$5)',[f.campaignId,f.sessionId,f.sceneId,e.id,f.heroId]);
 assert.deepEqual((await preview(f)).blockers,[]);await enter(f);await leave(f);await pool.query("update campaign_session_encounter_participant set local_state_json='{}' where encounter_id=$1",[e.id]);assert.ok((await preview(f)).blockers.some(b=>/prepared runtime/.test(b)));await assert.rejects(enter(f));
});
test('successful-key replay reads its immutable receipt even while unrelated runtime facts are being written',async()=>{
 const f=await setup(),command=input(await preview(f)),first=await forms.executeFormTransition(command,f.actor),writer=await pool.connect();
 try{await writer.query('begin');await writer.query('update campaign_character_profile set experience=experience where character_id=$1',[f.heroId]);const replay=await forms.executeFormTransition(command,f.actor);assert.equal(replay.event.id,first.event.id);assert.equal(replay.replayed,true);await assert.rejects(forms.executeFormTransition({...command,confirmTime:true},f.actor),/different input/);}finally{await writer.query('rollback');writer.release();}
});
for(const force of [false,true]) test(`actual ${force?'force-end':'normal closeout'} cancels a pending transformation without entering it`,async()=>{
 const f=await setup('',{access:accessFixture(accessRequirement('attribute',{attributeKey:'STR',requiredValue:50})),transformation:{...transformation(),entryTiming:{mode:'initiative',initiativeCost:4,time:'',notes:''}}});await ready(f);const pending=await enter(f);
 if(force){const {forceEndCombatInTransaction}=await import('../src/features/tabletop-operations/combat-force-end-service.ts');await db.transaction(tx=>forceEndCombatInTransaction(tx,f.encounterId,f.god,'Cancel unfinished Form timing'));}
 else{await pool.query("update campaign_character_attribute set value=20 where character_id=$1 and attribute_key='STR'",[f.heroId]);await tick(f);assert.ok((await forms.readIndividualFormRuntime(f.heroId,f.actor)).pending);const closeout=await import('../src/features/tabletop-operations/encounter-closeout-service.ts');await db.transaction(async tx=>{const before=await integration.loadInitiativeEngineInTransaction(tx,f.encounterId);await integration.persistInitiativeEngineInTransaction(tx,f.context,before,engine.closeInitiativeRuntime(before));});await db.transaction(async tx=>closeout.finalizeEncounterCloseoutInTransaction(tx,await closeout.lockEncounterCloseoutContextInTransaction(tx,f.encounterId,f.godId),{awards:[]}));}
 const state=await forms.readIndividualFormRuntime(f.heroId,f.actor);assert.equal(state.current,null);assert.equal(state.pending,null);assert.deepEqual(state.history,[]);assert.equal((await one('select status from form_transition_request where id=$1',[pending.requestId])).status,'cancelled');
});
test('ordinary Race reassignment cannot strand an active Form; Return to Normal permits the normal editor change',async()=>{
 const f=await setup();await enter(f);const {getCharacter,saveCharacter}=await import('../src/app/characters/actions.ts');const {characterAggregateToDraft}=await import('../src/features/characters/character-rules.ts');
 await actors.run(f.godId,async()=>{const draft=characterAggregateToDraft(await getCharacter(f.heroId,true));draft.profile.raceId=f.destination.ancestry.id;await assert.rejects(saveCharacter(f.heroId,draft,false,true),/Return to Normal.*normal Race/);assert.equal((await one('select race_id from campaign_character_profile where character_id=$1',[f.heroId])).race_id,f.source.ancestry.id);await leave(f);await saveCharacter(f.heroId,draft,false,true);assert.equal((await one('select race_id from campaign_character_profile where character_id=$1',[f.heroId])).race_id,f.destination.ancestry.id);});
});
test('seed isolated browser cases for PC, Race NPC and frozen Creature NPC',async()=>{
 const f=await setup('forms-runtime-browser'),c=await frozenCreature(f);
 await pool.query('update races set base_magic=2 where id=$1',[f.source.ancestry.id]);
 for(const name of ['Spellcraft','Channeling']){const skill=await one('select id from skill where name=$1 order by id limit 1',[name]);await pool.query('insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,10)',[f.heroId,skill.id]);}
 const cost=amount=>({mode:'costs',costs:[{costType:'mana',amount,resourceKey:'Spellcraft',notes:'',sortOrder:0}]});
 const timed={...f.form,key:'timed',name:'Timed Wolf',transformation:{...transformation(),entryTiming:{mode:'initiative',initiativeCost:4,time:'',notes:''},exitTiming:{mode:'initiative',initiativeCost:2,time:'',notes:''},entryCosts:cost(3),exitCosts:cost(2)}};
 await db.transaction(tx=>saveRaceFormsInTransaction(tx,f.source.ancestry.id,[f.form,timed,{...f.form,key:'locked',name:'Locked Wolf',access:accessFixture(accessRequirement('attribute',{attributeKey:'STR',requiredValue:100}))},{...f.form,key:'manual',name:'Manual Wolf',access:accessFixture(accessRequirement('manual',{notes:'Observed ritual'}))}],{anatomy:null,naturalAttacks:[],naturalProtections:[]}));
 for(const [id,label] of [[f.heroId,'PC'],[f.defenderId,'Race NPC'],[c.id,'Creature NPC']])await pool.query('update campaign_character set name=$2 where id=$1',[id,`Forms Runtime Browser ${label}`]);
});

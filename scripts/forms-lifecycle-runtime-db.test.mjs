import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { actors, db, pool, runtime, fixture, creatureSubject, rows, one, allRows, insertDeclaration, declarationApi, completionDraft, readCombatCommandSources } from './fixtures/evolution-runtime-fixture.mjs';
const forms=await import('../src/features/forms/form-runtime-service.ts');
const lifecycle=await import('../src/features/forms/form-lifecycle-service.ts');
const {emptyRaceForm}=await import('../src/features/races/race-forms.ts');
const {emptyRaceFormMechanics}=await import('../src/features/races/race-form-mechanics.ts');
const {emptyFormTransformation}=await import('../src/features/forms/form-transformation.ts');
const {saveRaceFormsInTransaction,readRaceFormsInTransaction}=await import('../src/features/races/race-form-service.ts');
const {creatureFormFixture}=await import('./creature-form-fixture.ts');
const {accessFixture,accessRequirement}=await import('./form-access-fixture.ts');
const integration=await import('../src/features/tabletop-operations/runtime-integration-service.ts');
const engine=await import('../src/features/tabletop-operations/initiative-runtime.ts');
const {forceEndCombatInTransaction}=await import('../src/features/tabletop-operations/combat-force-end-service.ts');
const {setCombatFrozenInTransaction}=await import('../src/features/tabletop-operations/combat-freeze-service.ts');
const {api:evolution,preview:evolutionPreview,command:evolutionCommand}=await import('./fixtures/evolution-runtime-fixture.mjs');
const closeout=await import('../src/features/tabletop-operations/encounter-closeout-service.ts');
after(()=>pool.end());
const instant={mode:'instant',initiativeCost:null,time:'',notes:''};
const transformation=()=>({...emptyFormTransformation(),entryMethod:'voluntary',entryTiming:instant,exitTiming:instant,entryCosts:{mode:'none',costs:[]},exitCosts:{mode:'none',costs:[]},exitMethods:['voluntary','duration-end'],duration:{mode:'persistent',description:''},limitMode:'unlimited'});
const condition=(key='state.hp-percent',operator='gte',value=0)=>({conditionType:'state',conditionKey:key,operator,numericValue:value,textValue:null,notes:'',sortOrder:0});
const automatic=(changes={})=>({...transformation(),entryMethod:'involuntary',involuntaryTriggers:[condition()],...changes});
const limit=(scope,maximumUses=1)=>({maximumUses,refreshScope:scope,refreshKey:scope==='event'?'authored-rest':null,notes:'',sortOrder:0});
async function setup(t=transformation(),mechanics=emptyRaceFormMechanics(),access) {
 const f=await fixture('forms-lifecycle');
 const form={...emptyRaceForm('lifecycle'),name:'Lifecycle Form',mechanics,transformation:t,...(access?{access}:{})};
 await db.transaction(tx=>saveRaceFormsInTransaction(tx,f.source.ancestry.id,[form],{anatomy:null,naturalAttacks:[],naturalProtections:[]}));
 f.form=(await db.transaction(tx=>readRaceFormsInTransaction(tx,f.source.ancestry.id)))[0];
 f.playerId=randomUUID();await pool.query('insert into "user"(id,name,email) values($1,$1,$2)',[f.playerId,`${f.playerId}@example.invalid`]);
 await pool.query("insert into user_role(user_id,role) values($1,'player')",[f.playerId]);await pool.query('insert into campaign_player(campaign_id,user_id) values($1,$2)',[f.campaignId,f.playerId]);
 await pool.query('update campaign_character set player_user_id=$2 where id=$1',[f.heroId,f.playerId]);f.playerActor={userId:f.playerId};
 return f;
}
const selection=(f,operation='enter')=>({characterId:f.heroId,operation,...(operation==='enter'?{formKey:f.form.key,formId:f.form.id,sourceId:f.form.raceId??f.form.creatureId}:{})});
const review=(f,operation='enter',actor=f.actor)=>forms.previewFormTransition(selection(f,operation),actor);
const command=(p,rulings={})=>({characterId:p.characterId,operation:p.operation,formKey:p.definition.key,formId:p.definition.formId,sourceId:p.definition.sourceId,idempotencyKey:randomUUID(),reviewToken:p.reviewToken,rulings,confirmTime:false});
async function change(f,operation='enter',manual=false){const p=await review(f,operation);return forms.executeFormTransition(command(p,manual?Object.fromEntries(p.manualSteps.map(s=>[s.key,'G.O.D. observed the exact authored requirement.'])):{}),f.actor);}
const reconcile=f=>db.transaction(tx=>forms.reconcileFormLifecycleInTransaction(tx,{characterIds:[f.heroId],cause:'Fixture authoritative fact boundary'}));
const view=f=>forms.readIndividualFormRuntime(f.heroId,f.actor);
async function end(f,force=true){
 if(force)return db.transaction(tx=>forceEndCombatInTransaction(tx,f.encounterId,f.god,'Lifecycle test closeout'));
 await db.transaction(async tx=>{const before=await integration.loadInitiativeEngineInTransaction(tx,f.encounterId);await integration.persistInitiativeEngineInTransaction(tx,f.context,before,engine.closeInitiativeRuntime(before));});
 return db.transaction(async tx=>closeout.finalizeEncounterCloseoutInTransaction(tx,await closeout.lockEncounterCloseoutContextInTransaction(tx,f.encounterId,f.godId),{awards:[]}));
}
async function creature(f,t){const c=await creatureSubject(f),p=await one('select current_snapshot_json from campaign_creature_npc_profile where character_id=$1',[c.id]);const snapshot=JSON.parse(p.current_snapshot_json);const form={...creatureFormFixture(),id:900030,creatureId:c.from.id,mechanics:{...creatureFormFixture().mechanics,equipment:{state:'retained',notes:''}},transformation:t};snapshot.forms=[form];await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1',[c.id,JSON.stringify(snapshot)]);return {...f,heroId:c.id,form,c};}

for(const mode of ['persistent','voluntary-end'])for(const force of [false,true])test(`${mode} survives ${force?'force-end':'normal closeout'} and time passage`,async()=>{
 const f=await setup({...transformation(),duration:{mode,description:'A thousand seconds does not add a timer'}});const entered=await change(f);await end(f,force);assert.equal((await view(f)).current.id,entered.event.id);assert.equal((await view(f)).lifecycle.due,null);
});
for(const kind of ['PC','Race NPC','Creature NPC'])for(const force of [false,true])test(`${kind} exact Encounter duration automatically Returns at ${force?'force-end':'normal closeout'}`,async()=>{
 const t={...transformation(),duration:{mode:'encounter',description:''}};let f=await setup(t);if(kind==='Race NPC')f={...f,heroId:f.defenderId};if(kind==='Creature NPC')f=await creature(f,t);
 const entered=await change(f),before=await one('select to_jsonb(t) row from campaign_character t where id=$1',[f.heroId]);await end(f,force);
 const state=await view(f);assert.equal(state.current,null);const event=state.history[0];assert.equal(event.enteredEventId,entered.event.id);assert.equal(event.evidence.authority,'system/lifecycle');assert.equal(event.evidence.initiatedByUserId,null);assert.equal(event.evidence.lifecycle.reason,'encounter-end');assert.equal(event.evidence.returnDue.ownerId,f.encounterId);assert.deepEqual(await one('select to_jsonb(t) row from campaign_character t where id=$1',[f.heroId]),before);
 await reconcile(f);assert.equal((await view(f)).history.length,2);
});
test('Scene closeout uses its actual lifecycle owner and exact frozen Scene',async()=>{
 const f=await setup({...transformation(),duration:{mode:'scene',description:''}});await change(f);await end(f);assert.ok((await view(f)).current);
 const scenes=await import('../src/app/heavens/tabletop/scene-actions.ts');await actors.run(f.godId,()=>scenes.completeCampaignSessionScene(f.sceneId));assert.equal((await view(f)).current,null);assert.equal((await view(f)).history[0].evidence.lifecycle.reason,'scene-end');
});
test('Encounter duration entered without an owner stays unbound after a later Encounter begins',async()=>{
 const f=await setup({...transformation(),duration:{mode:'encounter',description:''}});await end(f);await change(f,'enter',true);assert.equal((await view(f)).current.evidence.lifecycleContext.encounterId,null);
 await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1",[f.encounterId]);await reconcile(f);await end(f);assert.ok((await view(f)).current);assert.equal((await view(f)).lifecycle.due,null);
});
for(const mode of ['fixed','condition-end','custom'])test(`${mode} duration prose never becomes an inferred expiry`,async()=>{
 const f=await setup({...transformation(),duration:{mode,description:'Return in 1 second at zero HP'}}),p=await review(f);assert.ok(p.manualSteps.some(s=>s.key==='duration'));assert.ok((await review(f,'enter',f.playerActor)).blockers.length);await change(f,'enter',true);await end(f);assert.ok((await view(f)).current);assert.ok((await view(f)).lifecycle.manual.length);
});
for(const override of ['initiative','time','cost','method'])test(`unsupported ${override} exit retains Return due and blocks ordinary actions`,async()=>{
 const t={...transformation(),duration:{mode:'encounter',description:''}};
 if(override==='initiative')t.exitTiming={...instant,mode:'initiative',initiativeCost:2};if(override==='time')t.exitTiming={...instant,mode:'time',time:'one minute'};if(override==='cost')t.exitCosts={mode:'costs',costs:[{costType:'resource',resourceKey:'Unknown pool',amount:1,notes:'',sortOrder:0}]};if(override==='method')t.exitMethods=['custom'];
 const f=await setup(t);await change(f);await end(f);const state=await view(f);assert.ok(state.current);assert.ok(state.lifecycle.due);assert.equal(state.history.length,1);
 await assert.rejects(db.transaction(tx=>lifecycle.assertFormOrdinaryActionAllowedInTransaction(tx,f.heroId)),/Return.*due/);
 const choices=await actors.run(f.godId,()=>readCombatCommandSources({role:'god',encounterId:f.encounterId},f.heroId));assert.ok(choices.sources.every(s=>s.unavailable));
 await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1",[f.encounterId]);assert.ok((await view(f)).lifecycle.due,'reopen cannot erase the retained endpoint');
});
for(const method of ['involuntary','either'])test(`${method}: one satisfied structured trigger enters through the transition owner once`,async()=>{
 const f=await setup(automatic({entryMethod:method}));await reconcile(f);const state=await view(f);assert.ok(state.current);assert.equal(state.history.length,1);assert.equal(state.current.evidence.lifecycle.reason,'structured-trigger');assert.ok(state.current.evidence.lifecycle.facts.some(f=>f.key==='state.hp-percent'));await reconcile(f);assert.equal((await view(f)).history.length,1);
});
for(const kind of ['Race NPC','Creature NPC'])test(`${kind} structured automatic entry preserves ownership`,async()=>{
 let f=await setup(automatic());f=kind==='Race NPC'?{...f,heroId:f.defenderId}:await creature(f,automatic());const before=await one('select to_jsonb(t) row from campaign_character t where id=$1',[f.heroId]);await reconcile(f);assert.ok((await view(f)).current);assert.deepEqual(await one('select to_jsonb(t) row from campaign_character t where id=$1',[f.heroId]),before);
});
for(const rule of ['Locked','Manual'])test(`${rule} Access prevents automatic trigger bypass`,async()=>{
 const access=accessFixture(rule==='Locked'?accessRequirement('attribute',{attributeKey:'STR',operator:'gte',requiredValue:999}):accessRequirement('manual',{notes:'Ritual observed'}));const f=await setup(automatic(),emptyRaceFormMechanics(),access);await reconcile(f);assert.equal((await view(f)).current,null);
});
for(const name of ['false','unknown','manual','event','empty'])test(`${name} trigger cannot synthesize authoritative facts`,async()=>{
 const c=name==='false'?condition('state.hp-percent','gt',100):name==='manual'?{...condition(),conditionType:'manual',conditionKey:null,notes:'Moonlight'}:name==='event'?{...condition(),conditionType:'event',conditionKey:'combat.attack-targeted',operator:null,numericValue:null}:condition('state.moonlight');
 const f=await setup(automatic({involuntaryTriggers:name==='empty'?[]:[c]}));await reconcile(f);assert.equal((await view(f)).current,null);assert.notEqual((await view(f)).lifecycle.triggerCandidates[0].status,'satisfied');
});
test('two satisfied Forms require G.O.D. choice; no priority or direct Form switch',async()=>{
 const f=await setup(automatic());await db.transaction(tx=>saveRaceFormsInTransaction(tx,f.source.ancestry.id,[f.form,{...emptyRaceForm('second'),name:'Second Form',mechanics:emptyRaceFormMechanics(),transformation:automatic()}],{anatomy:null,naturalAttacks:[],naturalProtections:[]}));await reconcile(f);assert.equal((await view(f)).current,null);assert.ok((await view(f)).lifecycle.manual.some(s=>s.includes('Multiple')));
 await change(f,'enter',true);const current=(await view(f)).current.id;await reconcile(f);assert.equal((await view(f)).current.id,current);assert.ok((await view(f)).lifecycle.manual.some(s=>s.includes('Another Form')));
});
for(const status of ['draft','locked','committed','rolling','awaiting-god-ruling'])for(const role of ['actor','target'])test(`${status} ${role} defers automatic body changes`,async()=>{
 const f=await setup(automatic());const declaration=role==='actor'?await insertDeclaration(f,f.heroId,f.defenderId,status):await insertDeclaration(f,f.defenderId,f.heroId,status);await reconcile(f);assert.equal((await view(f)).current,null);
 await pool.query("update campaign_session_encounter_action_declaration set status='cancelled',ended_at=now(),ended_by_user_id=$2 where id=$1",[declaration.id,f.godId]);await reconcile(f);assert.ok((await view(f)).current);
});
test('freeze blocks automatic mutation; actual Resume retries at the clean boundary',async()=>{
 const f=await setup(automatic());await db.transaction(tx=>setCombatFrozenInTransaction(tx,f.encounterId,f.god,{frozen:true,expectedRevision:0}));await reconcile(f);assert.equal((await view(f)).current,null);
 await db.transaction(tx=>setCombatFrozenInTransaction(tx,f.encounterId,f.god,{frozen:false,expectedRevision:1}));assert.ok((await view(f)).current);
});
test('Health mutation owner re-evaluates a changed HP fact without healing or rewriting pools',async()=>{
 const f=await setup(automatic({involuntaryTriggers:[condition('state.hp-percent','lt',100)]}));await pool.query('update campaign_character_active_health set total_damage=0 where character_id=$1',[f.heroId]);await pool.query('update campaign_character_active_health_pool set damage=0 where character_id=$1',[f.heroId]);await reconcile(f);assert.equal((await view(f)).current,null);
 const {readActiveHealthInTransaction}=await import('../src/features/active-state/active-health-service.ts');
 await db.transaction(async tx=>{const health=await readActiveHealthInTransaction(tx,f.heroId);await integration.applyEncounterDamageInTransaction(tx,f.context,{targetCharacterId:f.heroId,amount:1,poolKey:health.anatomy.pools[0].key});});assert.ok((await view(f)).current);assert.equal((await one('select total_damage from campaign_character_active_health where character_id=$1',[f.heroId])).total_damage,1);
});
test('Condition owner uses exact typed facts and preserves the Condition',async()=>{
 const f=await setup(automatic({involuntaryTriggers:[{...condition('state.condition:Burning'),operator:'possessed',numericValue:null}]}));await actors.run(f.godId,async()=>{const effects=await import('../src/features/active-state/active-effects-service.ts');await effects.addManualCondition({characterId:f.heroId,name:'Burning',description:'typed fixture',duration:{kind:'until-removed',label:'Until removed'}});});assert.ok((await view(f)).current);assert.equal((await one("select count(*)::int n from campaign_character_active_condition where character_id=$1 and name='Burning' and resolved_at is null",[f.heroId])).n,1);
});
for(const scope of ['round','encounter','scene','never'])test(`${scope} limit counts completed Enter, all authorities respect exhaustion`,async()=>{
 const f=await setup({...transformation(),limitMode:'limited',useLimits:[limit(scope)]});assert.equal((await review(f)).limits[0].remaining,1);const entered=await change(f);await change(f,'return');const p=await review(f);assert.equal(p.limits[0].uses,1);assert.equal(p.limits[0].remaining,0);await assert.rejects(forms.executeFormTransition(command(p,{'use-limit-0':'Attempted bypass'}),f.actor),/exhausted/);assert.ok((await review(f,'enter',f.playerActor)).blockers.length);assert.ok(entered.event.evidence.lifecycleContext.sceneId);
});
test('round scope refreshes only with exact Encounter and round; lifetime limit remains',async()=>{
 const f=await setup({...transformation(),limitMode:'limited',useLimits:[limit('round'),{...limit('never',2),sortOrder:1}]});await change(f);await change(f,'return');await pool.query('update campaign_session_encounter_initiative set round_number=round_number+1 where encounter_id=$1',[f.encounterId]);assert.equal((await review(f)).limits[0].remaining,1);await change(f);await change(f,'return');await pool.query('update campaign_session_encounter_initiative set round_number=round_number+1 where encounter_id=$1',[f.encounterId]);assert.ok((await review(f)).blockers.some(s=>s.includes('never')));
});
for(const scope of ['manual','event'])test(`${scope} refresh requires immutable G.O.D. receipt, is durable and cannot reset lifetime limits`,async()=>{
 const f=await setup({...transformation(),limitMode:'limited',useLimits:[limit(scope),{...limit('never',2),sortOrder:1}]});await change(f,'enter',true);await change(f,'return');assert.ok((await review(f)).blockers.length);
 const input={characterId:f.heroId,sourceId:f.form.raceId,formId:f.form.id,formKey:f.form.key,refreshScope:scope,refreshKey:scope==='event'?'authored-rest':null,reason:'Observed the exact authored rest.',idempotencyKey:randomUUID()};await assert.rejects(forms.resetFormUses(input,f.playerActor),/G.O.D./);const receipt=await forms.resetFormUses(input,f.actor);assert.equal((await forms.resetFormUses(input,f.actor)).eventId,receipt.eventId);await assert.rejects(forms.resetFormUses({...input,reason:'Changed after success'},f.actor),/different input/);await assert.rejects(pool.query('update form_use_reset_event set refresh_key=null where id=$1',[receipt.eventId]),/immutable/);assert.equal((await review(f)).limits[0].remaining,1);await change(f,'enter',true);await change(f,'return');await forms.resetFormUses({...input,idempotencyKey:randomUUID()},f.actor);assert.ok((await review(f)).blockers.some(s=>s.includes('never')));
});
for(const text of ['Rest one hour','No additional cooldown beyond entry/exit costs'])test(`nonblank cooldown remains manual: ${text}`,async()=>{
 const f=await setup(automatic({cooldown:text}));await reconcile(f);assert.equal((await view(f)).current,null);assert.ok((await review(f)).manualSteps.some(s=>s.key==='cooldown'));assert.ok((await review(f,'enter',f.playerActor)).blockers.length);
});
test('resource-depletion notes never invent a pool or threshold',async()=>{
 const f=await setup({...transformation(),exitMethods:['resource-depletion'],exitNotes:'Return when Mana reaches zero'});await change(f);await reconcile(f);assert.ok((await view(f)).current);assert.ok((await view(f)).lifecycle.manual.some(s=>s.includes('pool/threshold')));assert.ok((await review(f,'return')).manualSteps.some(s=>s.key==='exit-method'));
});
for(const state of ['retained','unusable','merged'])test(`${state} equipment preserves all recorded gear, inventory and ownership`,async()=>{
 const m=emptyRaceFormMechanics();m.equipment={state,notes:''};const f=await setup(transformation(),m);const before=await allRows();await change(f);await change(f,'return');const after=await allRows();for(const table of Object.keys(before))if(!['campaign_character_active_form','form_transition_event','form_transition_request'].includes(table))assert.deepEqual(after[table],before[table],table);
});
test('dropped policy removes only active stack quantities/copies at entry and never retrieves on Return',async()=>{
 const m=emptyRaceFormMechanics();m.equipment={state:'dropped',notes:''};const f=await setup(transformation(),m);
 await pool.query('update campaign_character_item set quantity=5 where character_id=$1 and item_id=$2',[f.heroId,f.weaponId]);
 const active=await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,4,'worn',0) returning id",[f.heroId,f.weaponId]);const inactive=await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,3,'inactive',0) returning id",[f.heroId,f.weaponId]);
 const initiative=await rows('select * from campaign_session_encounter_initiative_participant where character_id=$1',[f.heroId]);const p=await review(f),input=command(p);assert.ok(p.equipmentDrops.items.length>=2);const entered=await forms.executeFormTransition(input,f.actor);assert.equal(entered.event.evidence.equipmentDrops.find(d=>d.instanceId===active.id).quantity,1);assert.ok(!entered.event.evidence.equipmentDrops.some(d=>d.instanceId===inactive.id));assert.equal((await one('select equipment_state from campaign_character_item_instance where id=$1',[active.id])).equipment_state,'inactive');const custody=await rows('select * from inventory_stack_custody where character_id=$1',[f.heroId]);assert.equal(custody[0].quantity,p.equipmentDrops.items.find(i=>i.instanceId===null&&i.itemId===f.weaponId).quantity);assert.equal((await one('select quantity from campaign_character_item where character_id=$1 and item_id=$2',[f.heroId,f.weaponId])).quantity,5);await forms.executeFormTransition(input,f.actor);await change(f,'return');assert.deepEqual(await rows('select * from inventory_stack_custody where character_id=$1',[f.heroId]),custody);assert.deepEqual(await rows('select * from campaign_session_encounter_initiative_participant where character_id=$1',[f.heroId]),initiative);
});
test('dropped policy with no exact Scene blocks instead of inventing custody',async()=>{
 const m=emptyRaceFormMechanics();m.equipment={state:'dropped',notes:''};const f=await setup(transformation(),m);await end(f);await pool.query("update campaign_session_scene set status='completed',completed_at=now() where id=$1",[f.sceneId]);const p=await review(f);assert.ok(p.blockers.some(s=>s.includes('location')));await assert.rejects(forms.executeFormTransition(command(p),f.actor),/location/);
});
test('custom equipment requires G.O.D. evidence and never parses its notes',async()=>{
 const m=emptyRaceFormMechanics();m.equipment={state:'custom',notes:'Drop everything'};const f=await setup(transformation(),m);assert.ok((await review(f)).manualSteps.some(s=>s.key==='equipment'));assert.ok((await review(f,'enter',f.playerActor)).blockers.length);const before=await rows('select * from campaign_character_item_equipment_state where character_id=$1',[f.heroId]);await change(f,'enter',true);assert.deepEqual(await rows('select * from campaign_character_item_equipment_state where character_id=$1',[f.heroId]),before);
});
test('simultaneous reconciliation serializes exactly one automatic event and durable receipt',async()=>{
 const f=await setup(automatic());await Promise.all([reconcile(f),reconcile(f),reconcile(f)]);await reconcile(f);assert.equal((await view(f)).history.length,1);assert.equal((await one('select count(*)::int n from form_transition_request where character_id=$1',[f.heroId])).n,1);
});
test('rolled-back owner transaction leaves no transition, costs, uses or notification evidence',async()=>{
 const f=await setup(automatic()),before=await allRows();await assert.rejects(db.transaction(async tx=>{await forms.reconcileFormLifecycleInTransaction(tx,{characterIds:[f.heroId],cause:'Will roll back'});assert.ok((await tx.select().from((await import('../src/db/form-runtime-schema.ts')).characterActiveForm)).some(r=>r.characterId===f.heroId));throw new Error('abort owner');}),/abort owner/);assert.deepEqual(await allRows(),before);
});
test('automatic Initiative entry pays once, counts only completion, and preserves frozen trigger rules',async()=>{
 const t=automatic({entryTiming:{...instant,mode:'initiative',initiativeCost:4},limitMode:'limited',useLimits:[limit('never')]});const f=await setup(t);
 await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active',last_satisfied_step=0 where encounter_id=$1 and character_id=$2",[f.encounterId,f.heroId]);
 await reconcile(f);let state=await view(f);assert.equal(state.current,null);assert.ok(state.pending);assert.equal(state.forms[0].limits[0].uses,0);const requestId=state.pending.requestId;
 await db.transaction(tx=>saveRaceFormsInTransaction(tx,f.source.ancestry.id,[{...f.form,transformation:{...t,involuntaryTriggers:[condition('state.hp-percent','gt',100)]}}],{anatomy:null,naturalAttacks:[],naturalProtections:[]}));
 await db.transaction(async tx=>{const before=await integration.loadInitiativeEngineInTransaction(tx,f.encounterId);await integration.persistInitiativeEngineInTransaction(tx,f.context,before,engine.advanceInitiativeToNextEvent(before));});
 state=await view(f);assert.ok(state.current);assert.equal(state.pending,null);assert.equal(state.lifecycle.limits[0].uses,1);assert.equal(state.current.evidence.authority,'system/lifecycle');assert.equal(Number((await one('select initiative_spent from campaign_session_encounter_pending_action where id=(select pending_action_id from form_transition_request where id=$1)',[requestId])).initiative_spent),4);
 await reconcile(f);assert.equal((await view(f)).history.length,1);
});
test('cancelled automatic pending entry consumes no Form use',async()=>{
 const f=await setup(automatic({entryTiming:{...instant,mode:'initiative',initiativeCost:4},limitMode:'limited',useLimits:[limit('never')]}));await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active',last_satisfied_step=0 where encounter_id=$1 and character_id=$2",[f.encounterId,f.heroId]);await reconcile(f);const pending=(await view(f)).pending;assert.ok(pending);await forms.cancelPendingFormTransition(f.heroId,pending.requestId,f.actor);assert.equal((await view(f)).forms[0].limits[0].uses,0);assert.equal((await view(f)).history.length,0);
});
test('automatic canonical Mana entry and duration Return spend exactly their authored costs',async()=>{
 const costs=amount=>({mode:'costs',costs:[{costType:'mana',resourceKey:'Spellcraft',amount,notes:'',sortOrder:0}]});const f=await setup(automatic({entryCosts:costs(3),exitCosts:costs(2),duration:{mode:'encounter',description:''}}));await pool.query('update races set base_magic=2 where id=$1',[f.source.ancestry.id]);
 for(const name of ['Spellcraft','Channeling']){const skill=await one('select id from skill where name=$1 order by id limit 1',[name])??await one("insert into skill(name,classification,tier,primary_attribute) values($1,'standard',1,'INT') returning id",[name]);await pool.query('insert into campaign_character_skill_allocation(character_id,skill_id,points) values($1,$2,10)',[f.heroId,skill.id]);}
 const p=await review(f);assert.equal(p.costs[0].status,'automatic',JSON.stringify(p.costs));assert.deepEqual(p.blockers,[]);
 await reconcile(f);const state=await view(f);assert.ok(state.current,JSON.stringify({manual:p.manualSteps,candidates:state.lifecycle.triggerCandidates}));assert.equal(state.current.evidence.costsPaid[0].amount,3);await reconcile(f);assert.equal(Number((await one('select mana_spent from campaign_character_active_mana where character_id=$1',[f.heroId])).mana_spent),3);await end(f);assert.equal((await view(f)).current,null);assert.equal(Number((await one('select mana_spent from campaign_character_active_mana where character_id=$1',[f.heroId])).mana_spent),5);await reconcile(f);assert.equal((await view(f)).history.length,2,'closed Encounter cannot repeatedly re-enter a duration without an owner');
});
test('retained Return due defers through frozen/unfinished state and permits only Return',async()=>{
 const f=await setup({...transformation(),duration:{mode:'encounter',description:''},exitTiming:{...instant,mode:'initiative',initiativeCost:2}});await change(f);await end(f);assert.ok((await view(f)).lifecycle.due);
 await pool.query("update campaign_session_encounter set status='active',completed_at=null where id=$1",[f.encounterId]);await pool.query("update campaign_session_encounter_initiative set status='active',closed_at=null where encounter_id=$1",[f.encounterId]);await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active',last_satisfied_step=0 where encounter_id=$1 and character_id=$2",[f.encounterId,f.heroId]);
 await assert.rejects(db.transaction(tx=>declarationApi.createActionDeclarationDraftInTransaction(tx,f.context,f.god,completionDraft(f.heroId,f.defenderId))),/Return.*due/);
 const d=await insertDeclaration(f);await reconcile(f);assert.equal((await view(f)).pending,null);await pool.query("update campaign_session_encounter_action_declaration set status='cancelled',ended_at=now(),ended_by_user_id=$2 where id=$1",[d.id,f.godId]);
 const pause=await one('select freeze_revision from campaign_session_encounter where id=$1',[f.encounterId]);await db.transaction(tx=>setCombatFrozenInTransaction(tx,f.encounterId,f.god,{frozen:true,expectedRevision:pause.freeze_revision}));await reconcile(f);assert.equal((await view(f)).pending,null);await db.transaction(tx=>setCombatFrozenInTransaction(tx,f.encounterId,f.god,{frozen:false,expectedRevision:pause.freeze_revision+1}));assert.equal((await view(f)).pending?.operation,'return');
});
test('pending responder/defense and unapplied Effect Plan block automatic entry',async()=>{
 const f=await setup(automatic());await pool.query("update campaign_session_encounter_reaction set status='declared',resolved_at=null,protected_target_character_id=$2 where id=$1",[f.reactionId,f.heroId]);await reconcile(f);assert.equal((await view(f)).current,null);await pool.query("update campaign_session_encounter_reaction set status='resolved',resolved_at=now() where id=$1",[f.reactionId]);
 const d=await insertDeclaration(f,f.occurrences[0],f.heroId,'resolved');const plan=await db.transaction(async tx=>{const [p]=await tx.insert(runtime.campaignSessionEncounterEffectPlan).values({campaignId:f.campaignId,sessionId:f.sessionId,sceneId:f.sceneId,encounterId:f.encounterId,declarationId:d.id,pendingActionId:f.pendingActionId,actorParticipantId:f.occurrences[0],sourceKind:'weapon',sourceIdentity:'Frozen attack',status:'requires-god-ruling',targetSnapshotJson:[{targetParticipantId:f.heroId}],sourceSnapshotJson:{},initiativeCommitmentJson:{},resourceCostsJson:[],createdByUserId:f.godId}).returning();return p;});await reconcile(f);assert.equal((await view(f)).current,null);await pool.query("update campaign_session_encounter_effect_plan set status='applied',applied_at=now(),applied_by_user_id=$2 where id=$1",[plan.id,f.godId]);await reconcile(f);assert.ok((await view(f)).current);
});
test('system transition notifications arrive after commit and are absent on retry/rollback',async()=>{
 const f=await setup(automatic()),client=await pool.connect(),events=[];const listener=message=>{if(message.payload&&JSON.parse(message.payload).campaignId===f.campaignId)events.push(message.payload);};client.on('notification',listener);await client.query('LISTEN serrian_tide_tabletop');
 try{
   await assert.rejects(db.transaction(async tx=>{await forms.reconcileFormLifecycleInTransaction(tx,{characterIds:[f.heroId],cause:'Notification rollback'});assert.equal(events.length,0);throw new Error('rollback');}),/rollback/);await new Promise(resolve=>setTimeout(resolve,30));assert.equal(events.length,0);
   await db.transaction(async tx=>{await forms.reconcileFormLifecycleInTransaction(tx,{characterIds:[f.heroId],cause:'Notification commit'});assert.equal(events.length,0);});await new Promise(resolve=>setTimeout(resolve,30));assert.ok(events.length);const count=events.length;await reconcile(f);await new Promise(resolve=>setTimeout(resolve,30));assert.equal(events.length,count);
 }finally{await client.query('UNLISTEN serrian_tide_tabletop');client.removeListener('notification',listener);client.release();}
});

test('frozen duration and exit costs survive library edits; automatic entry and Return preserve exact Health/effects/history',async()=>{
 const f=await setup(automatic({duration:{mode:'encounter',description:''}}));
 const tables=['campaign_character_active_health','campaign_character_active_health_pool','campaign_character_injury','campaign_character_active_condition','campaign_character_active_modifier'];
 const read=()=>Promise.all(tables.map(t=>rows(`select to_jsonb(t) row from ${t} t where character_id=$1 order by to_jsonb(t)::text`,[f.heroId])));
 const before=await read();await reconcile(f);assert.deepEqual(await read(),before);const entered=(await view(f)).current;
 await pool.query('update race_forms set transformation_json=$2 where id=$1',[f.form.id,{...transformation(),exitCosts:{mode:'unspecified',costs:[]}}]);
 await end(f);assert.equal((await view(f)).current,null);assert.deepEqual(await read(),before);
 assert.deepEqual((await view(f)).history.find(e=>e.id===entered.id),entered);
});

test('Return due still blocks permanent Evolution until the actual authored Form Return',async()=>{
 const f=await setup({...transformation(),duration:{mode:'encounter',description:''},exitCosts:{mode:'unspecified',costs:[]}});await change(f);await end(f);
 const p=await evolutionPreview(f);assert.ok(p.blockers.some(b=>b.includes('Return to Normal')));await assert.rejects(evolution.executePersistentEvolution(evolutionCommand(p),f.actor),/Return to Normal/);
 await change(f,'return',true);await evolution.executePersistentEvolution(evolutionCommand(await evolutionPreview(f)),f.actor);assert.equal((await view(f)).forms.length,0);
});

test('failed automatic drop transaction restores equipment, custody, Health, uses and body together',async()=>{
 const mechanics=emptyRaceFormMechanics();mechanics.equipment.state='dropped';const f=await setup(automatic(),mechanics),before=await allRows();
 await assert.rejects(db.transaction(async tx=>{await forms.reconcileFormLifecycleInTransaction(tx,{characterIds:[f.heroId],cause:'Rolled-back drop'});throw new Error('Rollback after exact drop');}),/Rollback after exact drop/);assert.deepEqual(await allRows(),before);
});

test('lifecycle preview explains a satisfied trigger blocked by a prose cooldown',async()=>{
 const f=await setup(automatic({cooldown:'The next sunrise'})),state=await view(f);assert.equal(state.lifecycle.triggerCandidates[0].status,'satisfied');assert.ok(state.lifecycle.triggerCandidates[0].reasons.some(s=>s.includes('no executable cooldown clock')));assert.equal(state.current,null);
});

test('legacy Creature combat snapshot without Forms stays outside lifecycle constructor validation',async()=>{
 const base=await setup(),f=await creature(base,transformation());const row=await one('select current_snapshot_json from campaign_creature_npc_profile where character_id=$1',[f.heroId]);const snapshot=JSON.parse(row.current_snapshot_json);delete snapshot.forms;delete snapshot.abilities;
 await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1',[f.heroId,JSON.stringify(snapshot)]);await reconcile(f);assert.equal((await view(f)).current,null);assert.equal((await view(f)).forms.length,0);
});

test('equipment mutation response reflects automatic Form drop at the same commit',async()=>{
 const mechanics=emptyRaceFormMechanics();mechanics.equipment.state='dropped';const f=await setup(automatic(),mechanics);
 const copy=await one("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,0,'inactive',0) returning id",[f.heroId,f.weaponId]);
 const equipment=await import('../src/features/items/equipment-state-service.ts');const result=await actors.run(f.godId,()=>equipment.setInstanceEquipmentState({characterId:f.heroId,instanceId:copy.id,state:'worn'}));
 assert.ok((await view(f)).current);assert.equal(result.equipmentState.instances.find(i=>i.instanceId===copy.id).state,'inactive');assert.equal((await one('select status from inventory_instance_custody where instance_id=$1',[copy.id])).status,'dropped');
});

import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { after, mock, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';

assert.equal(process.env.SERRIAN_EVOLUTION_DISPOSABLE, 'true');
assert.match(process.env.DATABASE_URL ?? '', /^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/serrian_creature_evolution_dev$/);
const actors = new AsyncLocalStorage();
const session = async () => ({ user: { id: actors.getStore() } });
mock.module(pathToFileURL(path.resolve('src/lib/server-access.ts')).href, { namedExports: {
  requireSession: session, requireGod: session, requirePlayer: session,
  requireGodOrAdminAccessContext: async () => ({ session: await session(), roles: ['god'] }),
} });
mock.module('next/cache', { namedExports: { revalidatePath() {} } });
const { db, pool } = await import('../src/db/index.ts');
const runtime = await import('../src/db/tabletop-operations-schema.ts');
const realm = await import('../src/db/realm-schema.ts');
const { race, raceNaturalAttack } = await import('../src/db/race-schema.ts');
const { userRole } = await import('../src/db/authorization-schema.ts');
const { completionServiceFixture, completionDraft } = await import('./fixtures/combat-completion-service-fixture.ts');
const { raceNaturalAttackFixture } = await import('./fixtures/race-natural-attack-fixture.ts');
const { creatureDraftFixture, creatureFormFixture } = await import('./creature-form-fixture.ts');
const { createHumanoidRaceAnatomy } = await import('../src/features/races/race-anatomy.ts');
const { emptyRaceEvolutionTransition } = await import('../src/features/races/race-evolution-transition.ts');
const { saveRaceNaturalProtectionInTransaction } = await import('../src/features/races/race-natural-protection-service.ts');
const racePaths = await import('../src/features/races/race-evolution-service.ts');
const creatures = await import('../src/app/heavens/creatures/actions.ts');
const npcs = await import('../src/app/heavens/npcs/actions.ts');
const api = await import('../src/features/evolutions/evolution-execution-service.ts');
const { readEvolutionEncounterBoundary } = await import('../src/features/evolutions/evolution-encounter-boundary.ts');
const { lockOwnedEncounterRuntimeInTransaction } = await import('../src/features/tabletop-operations/runtime-integration-service.ts');
const { readRaceAttackSourcesInTransaction } = await import('../src/features/tabletop-operations/race-natural-attack-service.ts');
const declarationApi = await import('../src/features/tabletop-operations/action-declaration-service.ts');
const { readIncomingEffectEncounterTargetInTransaction } = await import('../src/features/incoming-effects/incoming-effect-target-service.ts');
const { readCombatCommandSources } = await import('../src/features/combat-screen/command-actions.ts');
const rows = async (sql, values = []) => (await pool.query(sql, values)).rows;
const one = async (sql, values = []) => (await rows(sql, values))[0];
const command = p => ({ kind:p.kind, characterId:p.characterId, pathId:p.pathId, expectedVersion:p.pathVersion, reviewToken:p.reviewToken,
  idempotencyKey:randomUUID(), confirmedRequirementKeys:[], confirmHealthConsequences:true, confirmReplaceOverrides:true });
after(() => pool.end());

async function fixture(label = 'evolution-runtime') {
  const f = await db.transaction(async tx => {
    const f = await completionServiceFixture(tx,label);
    await tx.insert(userRole).values([{userId:f.godId,role:'god'},{userId:f.godId,role:'player'}]);
    await tx.update(runtime.campaignSessionEncounterPendingActionSource).set({resolutionStatus:'resolved',resolvedAt:new Date()}).where(eq(runtime.campaignSessionEncounterPendingActionSource.pendingActionId,f.pendingActionId));
    await tx.update(runtime.campaignSessionEncounterReaction).set({status:'resolved',resolvedAt:new Date()}).where(eq(runtime.campaignSessionEncounterReaction.id,f.reactionId));
    const source = await raceNaturalAttackFixture(tx,f.heroId,f.skillId);
    await tx.update(realm.campaignAllowedRace).set({sortOrder:0}).where(eq(realm.campaignAllowedRace.campaignId,f.campaignId));
    const destination = await raceNaturalAttackFixture(tx,f.heroId,f.skillId);
    const anatomy = createHumanoidRaceAnatomy();
    anatomy.hpPools.push({canonicalId:'new-wing',poolName:'New wing',hpPercentage:25,notes:'',sortOrder:anatomy.hpPools.length});
    anatomy.hitLocations[9] = {...anatomy.hitLocations[9],locationName:'New wing',bodyPartsIncluded:'New wing',hpPoolCanonicalId:'new-wing'};
    const interactionRules = {schemaVersion:1,rules:[{key:'fire',name:'Fire resistance',ruleType:'resistance',percentage:50,crImpact:'Minor',scope:'damage',match:'ALL',sortOrder:0,notes:'',conditions:[{key:'fire',kind:'damage-type',damageType:'Fire'}]}]};
    await tx.update(race).set({name:'Runtime young Race'}).where(eq(race.id,source.ancestry.id));
    await tx.update(race).set({name:'Runtime evolved Race',size:'Large',anatomy,interactionRules}).where(eq(race.id,destination.ancestry.id));
    await tx.update(raceNaturalAttack).set({attackName:'Young claw'}).where(eq(raceNaturalAttack.id,source.attack.id));
    await tx.update(raceNaturalAttack).set({attackName:'Evolved claw',damage:'24'}).where(eq(raceNaturalAttack.id,destination.attack.id));
    await saveRaceNaturalProtectionInTransaction(tx,destination.ancestry.id,[{key:'hide',name:'Evolved hide',coverage:{kind:'all'},naturalSoak:7,sortOrder:0}]);
    for (const id of [f.heroId,f.defenderId]) {
      await tx.update(realm.campaignCharacterProfile).set({raceId:source.ancestry.id}).where(eq(realm.campaignCharacterProfile.characterId,id));
      for (const key of ['STR','CON','INT','WIS','CHR']) await tx.insert(realm.campaignCharacterAttribute).values({characterId:id,attributeKey:key,value:60}).onConflictDoNothing();
    }
    for (const r of [source,destination]) await tx.insert(realm.campaignRace).values({campaignId:f.campaignId,raceId:r.ancestry.id,sortOrder:r.ancestry.id});
    return {...f,source,destination,anatomy,interactionRules,actor:{userId:f.godId,roles:['god']}};
  });
  f.racePath = (await racePaths.saveRaceEvolution({sourceRaceId:f.source.ancestry.id,destinationRaceId:f.destination.ancestry.id,name:'Live permanent Race Evolution',description:'',notes:'',
    transition:{...emptyRaceEvolutionTransition(),attributes:[{key:'DEX',operation:'add',value:10}],hpMultiplierSteps:{operation:'add',value:1},baseMovementSteps:{operation:'add',value:1},baseMagicSteps:{operation:'add',value:2}}},f.actor))[0].id;
  return f;
}
async function creatureSubject(f) {
  return actors.run(f.godId,async () => {
    const source = creatureDraftFixture(); source.core.canonicalName = 'Runtime young Creature';
    source.hitLocations=[{hitLocationNumber:0,locationName:'Body',bodyPartsIncluded:'Body',hpPoolCanonicalId:source.hpPools[0].canonicalId,naturalArmor:1,soak:1,locationEffect:'',notes:'',sortOrder:0}];
    source.attacks = creatureFormFixture().mechanics.attacks.rows; source.attacks[0].attackName='Young bite';
    const destination = structuredClone(source); destination.core.canonicalName='Runtime evolved Creature'; destination.core.size='Large';
    destination.attributes.forEach(row=>row.value+=10); destination.attacks[0].attackName='Evolved bite'; destination.attacks[0].damage='23';
    destination.core.interactionRules=f.interactionRules;
    destination.hitLocations.forEach(row=>{row.naturalArmor=6;row.soak=5;});
    destination.hpPools[0].canonicalId='evolved-core';
    destination.hitLocations.forEach(row=>row.hpPoolCanonicalId='evolved-core');
    const from = await creatures.saveCreature(source), to = await creatures.saveCreature(destination);
    const id = (await npcs.createNpc({campaignId:f.campaignId,origin:'creature',buildMode:'detailed',sourceId:from.id,name:'Runtime persistent Creature',ownerCharacterId:f.heroId,roleLabel:'Companion',notes:'Keep custody'})).characterId;
    const pathId = (await one("insert into creature_evolution_paths(source_creature_id,destination_creature_id,name) values($1,$2,'Live permanent Creature Evolution') returning id",[from.id,to.id])).id;
    await db.transaction(async tx => {
      const hierarchy = {campaignId:f.campaignId,sessionId:f.sessionId,sceneId:f.sceneId,encounterId:f.encounterId,characterId:id};
      await tx.insert(runtime.campaignSessionRoster).values({campaignId:f.campaignId,sessionId:f.sessionId,characterId:id,sortOrder:10});
      await tx.insert(runtime.campaignSessionSceneMember).values({...hierarchy,sortOrder:10});
      await tx.insert(runtime.campaignSessionEncounterParticipant).values(hierarchy);
      await tx.insert(runtime.campaignSessionEncounterInitiativeParticipant).values({...hierarchy,normalTotalInitiative:22,currentInitiative:17,participationStatus:'holding',movementMode:'Walk'});
    });
    return {id,pathId,from,to};
  });
}
const preview = (f,id=f.heroId,kind='race',pathId=f.racePath) => api.previewPersistentEvolution(kind,id,pathId,f.actor);
const boundary = (f,id=f.heroId) => db.transaction(tx=>readEvolutionEncounterBoundary(tx,id,f.campaignId));
const allRows = async () => Object.fromEntries(await Promise.all((await rows("select tablename from pg_tables where schemaname='public' order by tablename")).map(async ({tablename})=>[tablename,await rows(`select to_jsonb(t) body from "${tablename}" t order by to_jsonb(t)::text`)])));

for (const subject of ['PC','Race NPC','Creature NPC']) test(`live ${subject}: same participant, Initiative, Health, effects, inventory, ownership and durable replay`,async () => {
  const f=await fixture(), creature=subject==='Creature NPC'?await creatureSubject(f):null;
  const id=creature?.id ?? (subject==='PC'?f.heroId:f.defenderId), kind=creature?'creature':'race', pathId=creature?.pathId ?? f.racePath;
  if (!creature) await creatureSubject(f); // Owned Creature link must survive its owner's Evolution.
  await pool.query("insert into campaign_character_active_health(character_id,total_damage) values($1,11) on conflict(character_id) do update set total_damage=11",[id]);
  await pool.query("insert into campaign_character_active_health_pool(character_id,pool_key,pool_name_snapshot,damage) values($1,'old-wing','Old wing',7)",[id]);
  await pool.query("insert into campaign_character_injury(character_id,pool_key,pool_name_snapshot,name,damage_amount) values($1,'old-wing','Old wing','Unresolved break',7),($1,'old-wing','Old wing','Resolved scar',1)",[id]);
  await pool.query("update campaign_character_injury set resolved=true,resolved_at=now() where character_id=$1 and name='Resolved scar'",[id]);
  const condition=await one("insert into campaign_character_active_condition(character_id,name,source_kind,source_id,source_name,duration_kind,duration_value,duration_label) values($1,'Persistent condition','god','fixture','Fixture','combat-rounds',3,'3 rounds') returning id",[id]);
  await db.transaction(async tx=>{
    const hierarchy={campaignId:f.campaignId,sessionId:f.sessionId,sceneId:f.sceneId,encounterId:f.encounterId,characterId:id};
    await tx.insert(runtime.campaignSessionEffectDurationBinding).values({...hierarchy,conditionId:condition.id,durationKind:'combat-rounds',remainingValue:3});
    await tx.insert(runtime.campaignSessionPeriodicHealthEffect).values({...hierarchy,applicationKey:randomUUID(),sourceKind:'spell',sourceId:'fixture',effectKind:'health.damage',amount:1,application:'area',poolKey:'old-wing',frequency:'combat-rounds',remainingApplications:3,nextStep:2,nextRound:2});
  });
  await pool.query("insert into campaign_character_active_modifier(character_id,label,modifier_channel,target_key,amount,source_kind,source_id,source_name,duration_kind,duration_label) values($1,'Persistent modifier','attribute','STR',2,'god','fixture','Fixture','until-removed','Until removed')",[id]);
  await pool.query("update campaign_session_encounter_participant set local_state_json=$2 where encounter_id=$3 and character_id=$1",[id,{limbConditions:[{poolKey:'old-wing',name:'Disabled',sourceEffectId:1,incapacitatedAt:'2026-10-03T12:00:00Z'}]},f.encounterId]);
  const before=await allRows(), p=await preview(f,id,kind,pathId), input=command(p);
  assert.deepEqual(p.blockers,[]); assert.equal(p.encounterContexts[0].cleanBoundary,true);
  assert.equal(p.afterHealth.totalDamage,11); assert.ok(p.afterHealth.tracks.some(t=>t.key==='old-wing'&&t.orphaned&&t.damage===7));
  const concurrent=await Promise.all([api.executePersistentEvolution(input,f.actor),api.executePersistentEvolution(input,f.actor)]);
  const result=concurrent[0], after=await allRows();
  assert.equal(concurrent.filter(result=>result.replayed).length,1); assert.deepEqual(concurrent[0].event,concurrent[1].event);
  const changed=creature?['campaign_creature_npc_profile','creature_evolution_events']:['campaign_character_profile','campaign_character_attribute','race_evolution_events'];
  for (const table of Object.keys(before)) if (!changed.includes(table)) assert.deepEqual(after[table],before[table],`${table}: no Evolution writes`);
  assert.equal(result.event.characterId,id); assert.equal(result.event.evidence.encounterContexts[0].participantId,p.encounterContexts[0].participantId);
  assert.deepEqual(result.event.evidence.encounterContexts,p.encounterContexts);
  assert.equal((await api.executePersistentEvolution(input,f.actor)).replayed,true); assert.deepEqual(await allRows(),after);
  await assert.rejects(api.executePersistentEvolution({...input,confirmHealthConsequences:false},f.actor),/already used|different/i);
  assert.ok((await api.previewPersistentEvolutionReturn(kind,id,f.actor)).blockers.some(reason=>/Return.*Encounter|active Encounter/.test(reason)));
  const state=await api.readIndividualEvolutionState(id,f.actor); assert.equal(state.returnCandidate.available,false); assert.ok(state.returnBlockers.length);
  const incoming=await db.transaction(tx=>readIncomingEffectEncounterTargetInTransaction(tx,f.context,id));
  assert.deepEqual(incoming.interactionRules,f.interactionRules);
  const choices=await actors.run(f.godId,()=>readCombatCommandSources({role:'god',encounterId:f.encounterId},id));
  assert.ok(choices.sources.some(s=>s.name===(creature?'Evolved bite':'Evolved claw')));
  assert.ok(!choices.sources.some(s=>s.name===(creature?'Young bite':'Young claw')));
  if (!creature) {
    assert.ok(incoming.protection.natural.some(layer=>layer.soak===7&&layer.name==='Evolved hide'));
    assert.ok(incoming.applicationLocations.some(location=>location.poolKey==='new-wing'));
    const sources=await db.transaction(tx=>readRaceAttackSourcesInTransaction(tx,f.context,id));
    assert.deepEqual(sources.map(s=>s.definition.attackName),['Evolved claw']); assert.ok(!sources.some(s=>s.ref===f.source.ref));
    assert.equal((await one("select value from campaign_character_attribute where character_id=$1 and attribute_key='DEX'",[id])).value,60);
  } else {
    assert.ok(incoming.protection.natural.some(layer=>layer.armor===6&&layer.soak===5));
    assert.ok(incoming.applicationLocations.some(location=>location.poolKey===creature.to.hpPools[0].canonicalId),JSON.stringify(incoming.applicationLocations));
    const profile=await one('select * from campaign_creature_npc_profile where character_id=$1',[id]);
    assert.equal(profile.creature_id,creature.to.id); assert.equal(profile.current_snapshot_json,profile.baseline_snapshot_json);
    assert.match(profile.current_snapshot_json,/Evolved bite/); assert.doesNotMatch(profile.current_snapshot_json,/Young bite/);
    const evidence=result.event; await pool.query("update creatures set canonical_name='Edited after Evolution' where id=$1",[creature.to.id]);
    assert.deepEqual((await api.readEvolutionHistory(id,f.actor))[0],evidence);
  }
});

async function insertDeclaration(f,subject=f.heroId,target=f.defenderId,status='draft') {
  const hierarchy={encounterId:f.encounterId,sceneId:f.sceneId,sessionId:f.sessionId,campaignId:f.campaignId};
  return db.transaction(async tx=> {
    const committed=!['draft','locked','cancelled'].includes(status), locked=status!=='draft'&&status!=='cancelled';
    const [row]=await tx.insert(runtime.campaignSessionEncounterActionDeclaration).values({...hierarchy,actorCharacterId:subject,status,
      draftJson:{...completionDraft(subject,target)},lockedSnapshotJson:locked?{actorCharacterId:subject,targetCharacterIds:[target],historicalRaceId:f.source.ancestry.id}:null,
      pendingActionId:committed?f.pendingActionId:null,createdByUserId:f.godId,
      lockedAt:locked?new Date():null,lockedByUserId:locked?f.godId:null,committedAt:committed?new Date():null,committedByUserId:committed?f.godId:null,
      endedAt:['resolved','cancelled','abandoned'].includes(status)?new Date():null,endedByUserId:['resolved','cancelled','abandoned'].includes(status)?f.godId:null}).returning();
    return row;
  });
}
for (const status of ['draft','locked','committed','rolling-ready','rolling','awaiting-god-ruling','interrupted']) test(`unfinished declaration ${status} blocks actor and target`,async()=>{
  const f=await fixture(); await insertDeclaration(f,f.heroId,f.defenderId,status);
  for (const id of [f.heroId,f.defenderId]) assert.ok((await boundary(f,id)).contexts[0].operations.some(b=>b.kind==='declaration'&&b.status===status));
  await assert.rejects(api.executePersistentEvolution(command(await preview(f)),f.actor),/unfinished declaration/);
});
test('open checkpoint, resumable Initiative and grouped legacy source targets block; unrelated actions and completed history do not',async()=>{
  const f=await fixture();
  await db.transaction(tx=>tx.insert(runtime.campaignSessionEncounterDeclarationCheckpoint).values({encounterId:f.encounterId,roundNumber:1,timelineInitiative:22,participantIdsJson:[f.heroId],beforeStateJson:{}}));
  assert.ok((await boundary(f)).contexts[0].operations.some(b=>b.kind==='checkpoint'));
  assert.deepEqual((await boundary(f,f.defenderId)).blockers,[]);
  await pool.query('update campaign_session_encounter_declaration_checkpoint set revealed_at=now() where encounter_id=$1',[f.encounterId]);
  await pool.query("update campaign_session_encounter_pending_action set status='interrupted' where id=$1",[f.pendingActionId]);
  assert.ok((await boundary(f)).contexts[0].operations.some(b=>b.kind==='initiative-action'));
  await pool.query("update campaign_session_encounter_pending_action set status='completed' where id=$1",[f.pendingActionId]);
  await pool.query("update campaign_session_encounter_pending_action_source set resolution_status='pending',resolved_at=null,payload_json=$2 where pending_action_id=$1",[f.pendingActionId,JSON.stringify({casterCharacterId:f.heroId,selections:{targetGroups:{body:[f.defenderId]}}})]);
  assert.ok((await boundary(f,f.defenderId)).contexts[0].operations.some(b=>b.kind==='source-resolution'));
  await pool.query("update campaign_session_encounter_pending_action_source set resolution_status='resolved',resolved_at=now() where pending_action_id=$1",[f.pendingActionId]);
  await insertDeclaration(f,f.heroId,f.defenderId,'resolved');
  await insertDeclaration(f,f.occurrences[0],f.occurrences[1]);
  assert.deepEqual((await boundary(f)).blockers,[]);
  const before=await rows('select * from campaign_session_encounter_action_declaration where encounter_id=$1 order by id',[f.encounterId]);
  await api.executePersistentEvolution(command(await preview(f)),f.actor);
  assert.deepEqual(await rows('select * from campaign_session_encounter_action_declaration where encounter_id=$1 order by id',[f.encounterId]),before);
});
test('unresolved defense blocks actor, responder and protected target; completed defense does not',async()=>{
  const f=await fixture();
  await pool.query("update campaign_session_encounter_reaction set status='declared',resolved_at=null,protected_target_character_id=$2 where id=$1",[f.reactionId,f.occurrences[0]]);
  for (const id of [f.heroId,f.defenderId,f.occurrences[0]]) assert.ok((await boundary(f,id)).contexts[0].operations.some(b=>b.kind==='reaction'));
  await pool.query("update campaign_session_encounter_reaction set status='resolved',resolved_at=now() where id=$1",[f.reactionId]);
  assert.deepEqual((await boundary(f)).blockers,[]);
});
test('pending responder and review/apply plans block their subjects; terminal history and lingering completed opportunities do not',async()=>{
  const f=await fixture(), decl=await insertDeclaration(f,f.heroId,f.defenderId,'committed');
  const hierarchy={encounterId:f.encounterId,sceneId:f.sceneId,sessionId:f.sessionId,campaignId:f.campaignId};
  await db.transaction(tx=>tx.insert(runtime.campaignSessionEncounterResponderOpportunity).values({...hierarchy,declarationId:decl.id,pendingActionId:f.pendingActionId,responderCharacterId:f.occurrences[0],source:'initiative',reachedAtInitiative:22,reason:'Test response'}));
  assert.ok((await boundary(f,f.occurrences[0])).contexts[0].operations.some(b=>b.kind==='response-opportunity'));
  await pool.query("update campaign_session_encounter_action_declaration set status='resolved',ended_at=now(),ended_by_user_id=$2 where id=$1",[decl.id,f.godId]);
  const plan=await db.transaction(async tx=>{
    const [p]=await tx.insert(runtime.campaignSessionEncounterEffectPlan).values({...hierarchy,declarationId:decl.id,pendingActionId:f.pendingActionId,actorParticipantId:f.heroId,sourceKind:'weapon',sourceIdentity:'Historical attack',status:'requires-god-ruling',targetSnapshotJson:[{targetParticipantId:f.defenderId}],sourceSnapshotJson:{},initiativeCommitmentJson:{},resourceCostsJson:[],createdByUserId:f.godId}).returning();
    await tx.insert(runtime.campaignSessionEncounterEffect).values({...hierarchy,planId:p.id,targetParticipantId:f.defenderId,effectKey:'damage',effectType:'damage',sourceKind:'weapon',sourceIdentity:'Historical attack',authoredValueJson:{},status:'requires-god-ruling'});
    return p;
  });
  for (const id of [f.heroId,f.defenderId]) assert.ok((await boundary(f,id)).contexts[0].operations.some(b=>b.kind==='effect-plan'));
  await pool.query("update campaign_session_encounter_effect_plan set status='applied' where id=$1",[plan.id]);
  assert.ok((await boundary(f,f.defenderId)).blockers.length,'unfinished effect still blocks an applied-labelled plan');
  await pool.query("update campaign_session_encounter_effect set status='applied',applied_at=now(),applied_result_json='{}' where plan_id=$1",[plan.id]);
  assert.deepEqual((await boundary(f)).blockers,[]); assert.deepEqual((await boundary(f,f.occurrences[0])).blockers,[]);
});

test('new operation after preview blocks commit, and the runtime fence serializes both writer directions',async()=>{
  const f=await fixture(), input=command(await preview(f));
  const client=await pool.connect();
  try {
    await client.query('begin'); await client.query('select id from campaign_session_encounter where id=$1 for update',[f.encounterId]);
    await assert.rejects(api.executePersistentEvolution(input,f.actor),/another operation/); await client.query('rollback');
    const {lockEvolutionFacts}=await import('../src/features/evolutions/evolution-execution-locks.ts');
    await db.transaction(async tx=>{
      await lockEvolutionFacts(tx);
      await client.query('begin'); await client.query("set local lock_timeout='100ms'");
      await assert.rejects(client.query("update campaign_session_encounter_pending_action set label='Concurrent write' where id=$1",[f.pendingActionId]),e=>e.code==='55P03'); await client.query('rollback');
    });
    await insertDeclaration(f);
    await assert.rejects(api.executePersistentEvolution(input,f.actor),/unfinished declaration/);
    assert.equal((await rows('select id from race_evolution_events where character_id=$1',[f.heroId])).length,0);
  } finally { await client.query('rollback'); client.release(); }
});

test('in-flight source/range rulings and Encounter/Session Called Checks block only unresolved mechanical involvement',async()=>{
  const f=await fixture(), decl=await insertDeclaration(f);
  await pool.query("update weapon_profiles set range_mode='ranged',distance_unit='feet',short_range_distance=30,medium_range_distance=60,long_range_distance=120 where item_id=$1",[f.weaponId]);
  const {createPlayerCombatRulingRequestInTransaction}=await import('../src/features/tabletop-operations/player-combat-ruling-service.ts');
  const request=await db.transaction(tx=>createPlayerCombatRulingRequestInTransaction(tx,f.context,{userId:f.godId,characterId:f.heroId},{requestType:'weapon-distance',sourceKind:'weapon',sourceRef:`stack:${f.weaponId}`,sourceInstanceId:null,targetParticipantId:f.defenderId,intent:'Exact distance',requestedTiming:'Before attack',blockedReason:'Review distance',frozenRequest:{attackMode:'ranged',distance:20,unit:'feet'},idempotencyKey:randomUUID().replaceAll('-','')}));
  await pool.query('update campaign_session_player_ruling_request set linked_declaration_id=$2 where id=$1',[request.requestId,decl.id]);
  for (const id of [f.heroId,f.defenderId]) assert.ok((await boundary(f,id)).contexts[0].operations.some(row=>row.kind==='combat-ruling'));
  await pool.query("update campaign_session_encounter_action_declaration set status='cancelled',ended_at=now(),ended_by_user_id=$2 where id=$1",[decl.id,f.godId]);
  assert.deepEqual((await boundary(f)).blockers,[],'unbound request does not freeze the individual');
  const checks=await import('../src/features/tabletop-operations/called-check-service.ts');
  for (const encounterId of [f.encounterId,null]) {
    const batch=await db.transaction(tx=>checks.issueCalledCheckInTransaction(tx,f.godId,{sessionId:f.sessionId,sceneId:f.sceneId,encounterId,source:{kind:'attribute',attributeKey:'DEX'},recipientScope:'one',recipientCharacterIds:[f.heroId],purpose:'Current mechanics check',instructions:'',visibility:'god-only',rollMethod:'entered',modifiers:[],idempotencyKey:randomUUID()}));
    assert.ok((await boundary(f)).contexts[0].operations.some(row=>row.kind==='called-check'));
    const check=await one('select id from campaign_session_called_check_request where batch_id=$1',[batch]);
    await db.transaction(tx=>checks.cancelCalledCheckInTransaction(tx,f.godId,check.id,'Boundary test complete'));
    assert.deepEqual((await boundary(f)).blockers,[]);
  }
});

test('completed real Natural Attack keeps frozen source/results; next locked action uses destination mechanics',async()=>{
  const f=await fixture();
  const integration=await import('../src/features/tabletop-operations/runtime-integration-service.ts');
  const {advanceInitiativeTimeline}=await import('../src/features/tabletop-operations/initiative-runtime.ts');
  const {resolveDeclaredDefensesInTransaction}=await import('../src/features/tabletop-operations/defense-intervention-service.ts');
  const effects=await import('../src/features/tabletop-operations/action-effect-plan-service.ts');
  const draft=ref=>({...completionDraft(f.heroId,f.occurrences[0]),sourceKind:'race-natural-attack',sourceRef:ref,sourcePayload:{rangeAttackMode:'melee',rangeDistance:5,rangeUnit:'feet'}});
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2",[f.encounterId,f.heroId]);
  const old=await db.transaction(async tx=>{
    const context=await lockOwnedEncounterRuntimeInTransaction(tx,f.encounterId,f.godId);
    const id=await declarationApi.createActionDeclarationDraftInTransaction(tx,context,f.player,draft(f.source.ref));
    await declarationApi.lockActionDeclarationInTransaction(tx,context,f.player,id);
    await declarationApi.commitActionDeclarationInTransaction(tx,context,f.player,id,{method:'entered',enteredTotal:70});
    await resolveDeclaredDefensesInTransaction(tx,context,f.god,id);
    const before=await integration.loadInitiativeEngineInTransaction(tx,f.encounterId);
    await integration.persistInitiativeEngineInTransaction(tx,context,before,advanceInitiativeTimeline(before,18));
    await effects.generateActionEffectPlanInTransaction(tx,context,f.god,id);
    await effects.applyRoutineCombatConsequencesInTransaction(tx,context,f.god,id);
    return id;
  });
  const history=await allRows();
  assert.deepEqual((await boundary(f)).blockers,[]);
  await api.executePersistentEvolution(command(await preview(f)),f.actor);
  const after=await allRows();
  for (const table of Object.keys(history).filter(t=>t.startsWith('campaign_session'))) assert.deepEqual(after[table],history[table],`${table}: completed combat evidence preserved`);
  const frozen=await one('select locked_snapshot_json from campaign_session_encounter_action_declaration where id=$1',[old]);
  assert.match(JSON.stringify(frozen),/Young claw/); assert.doesNotMatch(JSON.stringify(frozen),/Evolved claw/);
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2",[f.encounterId,f.heroId]);
  const next=await db.transaction(async tx=>{
    const context=await lockOwnedEncounterRuntimeInTransaction(tx,f.encounterId,f.godId);
    const id=await declarationApi.createActionDeclarationDraftInTransaction(tx,context,f.player,draft(f.destination.ref));
    await declarationApi.lockActionDeclarationInTransaction(tx,context,f.player,id); return id;
  });
  assert.match(JSON.stringify(await one('select locked_snapshot_json from campaign_session_encounter_action_declaration where id=$1',[next])),/Evolved claw/);
});

test('a real runtime writer waiting on Evolution cannot freeze the obsolete source after commit',async()=>{
  const f=await fixture();
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2",[f.encounterId,f.heroId]);
  const input=command(await preview(f)), client=await pool.connect(), gate=214730001;
  await pool.query(`create function evolution_runtime_gate() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(${gate}); return new; end $$`);
  await pool.query('create trigger evolution_runtime_gate before insert on race_evolution_events for each row execute function evolution_runtime_gate()');
  let execution,writer;
  try {
    await client.query('select pg_advisory_lock($1)',[gate]);
    execution=api.executePersistentEvolution(input,f.actor);
    const deadline=Date.now()+5000;
    while (!(await one("select exists(select 1 from pg_locks where locktype='advisory' and objid=$1 and not granted) waiting",[gate])).waiting) {
      if(Date.now()>deadline) throw new Error('Evolution did not reach its fenced event insert');
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    let ended=false;
    writer=db.transaction(async tx=>{
      const context=await lockOwnedEncounterRuntimeInTransaction(tx,f.encounterId,f.godId);
      const id=await declarationApi.createActionDeclarationDraftInTransaction(tx,context,f.player,{...completionDraft(f.heroId,f.occurrences[0]),sourceKind:'race-natural-attack',sourceRef:f.source.ref,sourcePayload:{rangeAttackMode:'melee',rangeDistance:5,rangeUnit:'feet'}});
      await declarationApi.lockActionDeclarationInTransaction(tx,context,f.player,id);
    }).then(()=>({error:null}),error=>({error})).finally(()=>{ended=true;});
    await new Promise(resolve=>setTimeout(resolve,100)); assert.equal(ended,false,'runtime waits at the Encounter lock');
    await client.query('select pg_advisory_unlock($1)',[gate]); await execution;
    assert.match((await writer).error?.message ?? '',/current Normal Race|no longer|source/i);
    assert.equal((await rows('select id from campaign_session_encounter_action_declaration where encounter_id=$1',[f.encounterId])).length,0,'stale action transaction rolled back');
  } finally {
    await client.query('select pg_advisory_unlock($1)',[gate]); await Promise.allSettled([execution,writer]); client.release();
    await pool.query('drop trigger evolution_runtime_gate on race_evolution_events'); await pool.query('drop function evolution_runtime_gate()');
  }
});

test('negative occurrence is rejected; Freeze/Resume and normal/forced closeout preserve permanent Evolution',async()=>{
  for (const force of [false,true]) {
    const f=await fixture();
    await assert.rejects(api.previewPersistentEvolution('creature',f.occurrences[0],1,f.actor),/positive|Persistent/);
    const {setCombatFrozenInTransaction}=await import('../src/features/tabletop-operations/combat-freeze-service.ts');
    await db.transaction(tx=>setCombatFrozenInTransaction(tx,f.encounterId,f.god,{frozen:true,expectedRevision:0}));
    await assert.rejects(api.executePersistentEvolution(command(await preview(f)),f.actor),/frozen for inspection/);
    await db.transaction(tx=>setCombatFrozenInTransaction(tx,f.encounterId,f.god,{frozen:false,expectedRevision:1}));
    const result=await api.executePersistentEvolution(command(await preview(f)),f.actor);
    if(force) {
      const {forceEndCombatInTransaction}=await import('../src/features/tabletop-operations/combat-force-end-service.ts');
      await db.transaction(tx=>forceEndCombatInTransaction(tx,f.encounterId,f.god,'Test permanent Evolution closeout'));
    } else {
      const closeout=await import('../src/features/tabletop-operations/encounter-closeout-service.ts');
      const {loadInitiativeEngineInTransaction,persistInitiativeEngineInTransaction}=await import('../src/features/tabletop-operations/runtime-integration-service.ts');
      const {closeInitiativeRuntime}=await import('../src/features/tabletop-operations/initiative-runtime.ts');
      await db.transaction(async tx=>{ const before=await loadInitiativeEngineInTransaction(tx,f.encounterId); await persistInitiativeEngineInTransaction(tx,f.context,before,closeInitiativeRuntime(before)); });
      await db.transaction(async tx=>closeout.finalizeEncounterCloseoutInTransaction(tx,await closeout.lockEncounterCloseoutContextInTransaction(tx,f.encounterId,f.godId),{awards:[]}));
    }
    assert.equal((await one('select race_id from campaign_character_profile where character_id=$1',[f.heroId])).race_id,f.destination.ancestry.id);
    assert.deepEqual((await api.readEvolutionHistory(f.heroId,f.actor))[0],result.event);
  }
});

test('seed real Character/Race NPC/Creature NPC live Evolution browser cases',async()=>{
  const f=await fixture('evolution-runtime-browser'), creature=await creatureSubject(f);
  for (const [id,name] of [[f.heroId,'Evolution Runtime Browser PC'],[f.defenderId,'Evolution Runtime Browser Race NPC'],[creature.id,'Evolution Runtime Browser Creature NPC']]) await pool.query('update campaign_character set name=$2 where id=$1',[id,name]);
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active' where encounter_id=$1 and character_id=$2",[f.encounterId,f.heroId]);
  assert.deepEqual((await boundary(f)).blockers,[]);
});

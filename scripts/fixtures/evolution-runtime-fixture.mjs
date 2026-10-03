import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mock } from 'node:test';
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
const { db, pool } = await import('../../src/db/index.ts');
const runtime = await import('../../src/db/tabletop-operations-schema.ts');
const realm = await import('../../src/db/realm-schema.ts');
const { race, raceNaturalAttack } = await import('../../src/db/race-schema.ts');
const { userRole } = await import('../../src/db/authorization-schema.ts');
const { completionServiceFixture, completionDraft } = await import('./combat-completion-service-fixture.ts');
const { raceNaturalAttackFixture } = await import('./race-natural-attack-fixture.ts');
const { creatureDraftFixture, creatureFormFixture } = await import('../creature-form-fixture.ts');
const { createHumanoidRaceAnatomy } = await import('../../src/features/races/race-anatomy.ts');
const { emptyRaceEvolutionTransition } = await import('../../src/features/races/race-evolution-transition.ts');
const { saveRaceNaturalProtectionInTransaction } = await import('../../src/features/races/race-natural-protection-service.ts');
const racePaths = await import('../../src/features/races/race-evolution-service.ts');
const creatures = await import('../../src/app/heavens/creatures/actions.ts');
const npcs = await import('../../src/app/heavens/npcs/actions.ts');
const api = await import('../../src/features/evolutions/evolution-execution-service.ts');
const { readEvolutionEncounterBoundary } = await import('../../src/features/evolutions/evolution-encounter-boundary.ts');
const { lockOwnedEncounterRuntimeInTransaction } = await import('../../src/features/tabletop-operations/runtime-integration-service.ts');
const { readRaceAttackSourcesInTransaction } = await import('../../src/features/tabletop-operations/race-natural-attack-service.ts');
const declarationApi = await import('../../src/features/tabletop-operations/action-declaration-service.ts');
const { readIncomingEffectEncounterTargetInTransaction } = await import('../../src/features/incoming-effects/incoming-effect-target-service.ts');
const { readCombatCommandSources } = await import('../../src/features/combat-screen/command-actions.ts');
const rows = async (sql, values = []) => (await pool.query(sql, values)).rows;
const one = async (sql, values = []) => (await rows(sql, values))[0];
const command = p => ({ kind:p.kind, characterId:p.characterId, pathId:p.pathId, expectedVersion:p.pathVersion, reviewToken:p.reviewToken,
  idempotencyKey:randomUUID(), confirmedRequirementKeys:[], confirmHealthConsequences:true, confirmReplaceOverrides:true });

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

export { actors, db, pool, runtime, realm, race, raceNaturalAttack, racePaths, api, command, fixture, creatureSubject, preview, boundary, allRows, rows, one, insertDeclaration, completionDraft, lockOwnedEncounterRuntimeInTransaction, readRaceAttackSourcesInTransaction, declarationApi, readIncomingEffectEncounterTargetInTransaction, readCombatCommandSources, emptyRaceEvolutionTransition, raceNaturalAttackFixture };

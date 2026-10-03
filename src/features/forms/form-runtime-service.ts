import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { userRole } from '@/db/authorization-schema';
import { campaign, campaignPlayer } from '@/db/campaign-schema';
import { campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile, campaignCharacterAttribute, campaignCharacterSkillAllocation } from '@/db/realm-schema';
import { race, raceSkillLink } from '@/db/race-schema';
import { characterActiveForm, formTransitionEvent, formTransitionRequest } from '@/db/form-runtime-schema';
import { campaignSessionEncounter as encounter, campaignSessionEncounterPendingAction as pending } from '@/db/tabletop-operations-schema';
import { readRaceFormsInTransaction } from '@/features/races/race-form-service';
import { parseCreatureNpcSnapshot } from '@/features/creatures/creature-npc-constructor-service';
import { availableCreatureForms } from '@/features/creatures/creature-form-preview';
import { loadCharacterDerivedAbilitiesInTransaction } from '@/features/derived-abilities/character-derived-ability-service';
import { planDerivedAbilityCost } from '@/features/derived-abilities/derived-ability-use';
import { getCharacterSkillPointsById } from '@/features/characters/character-rules';
import { readAbilityFactsInTransaction } from '@/features/ability-use-conditions/fact-service';
import { evaluateAbilityUseCondition } from '@/features/ability-use-conditions/facts';
import { readActiveManaInTransaction, spendActiveManaInTransaction } from '@/features/active-state/active-mana-service';
import { isCharacterMagicSystem } from '@/features/active-state/active-mana';
import { assertCharacterCombatWritableInTransaction } from '@/features/tabletop-operations/combat-freeze-service';
import { readParticipantTransitionBoundary } from '@/features/tabletop-operations/participant-transition-boundary';
import { lockEvolutionFacts } from '@/features/evolutions/evolution-execution-locks';
import { stableEvolutionJson } from '@/features/evolutions/evolution-execution';
import { lockOwnedEncounterRuntimeInTransaction, loadInitiativeEngineInTransaction, persistInitiativeEngineInTransaction } from '@/features/tabletop-operations/runtime-integration-service';
import { startInitiativeAction, abandonPendingInitiativeAction } from '@/features/tabletop-operations/initiative-runtime';
import { publishCharacterStateInvalidationInTransaction, publishTabletopInvalidationInTransaction } from '@/features/tabletop-operations/tabletop-live-events';
import { characterFormAccessContextFromFacts, creatureFormAccessContext } from './form-access-context';
import { evaluateFormAccess } from './form-access';
import { emptyFormTransformation, normalizeFormTransformation } from './form-transformation';
import type { FrozenFormDefinition, FormRuntimeSelection, FormRuntimeReview, FormRuntimeCommand, FormTransitionEvidence, FormRuntimeEvent, FormRuntimeReceipt, IndividualFormRuntime } from './form-runtime';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = { userId: string };
const hash = (value: unknown) => createHash('sha256').update(stableEvolutionJson(value)).digest('hex');
function positive(id: number) { if(!Number.isSafeInteger(id)||id<=0) throw new Error('Forms require a positive persistent individual identity.'); }
function eventView(row: typeof formTransitionEvent.$inferSelect): FormRuntimeEvent {
  return {id:row.id,characterId:row.characterId,operation:row.operation,enteredEventId:row.enteredEventId,executedAt:row.executedAt.toISOString(),evidence:row.evidence};
}
async function authorize(tx: Tx, id: number, actor: Actor, write = false) {
  positive(id);
  const [row]=await tx.select({character:campaignCharacter,campaign}).from(campaignCharacter).innerJoin(campaign,eq(campaign.id,campaignCharacter.campaignId)).where(eq(campaignCharacter.id,id));
  if(!row) throw new Error('Persistent individual not found.');
  const roles=await tx.select().from(userRole).where(eq(userRole.userId,actor.userId));
  const god=row.campaign.createdByUserId===actor.userId&&roles.some(r=>r.role==='god');
  const [member]=await tx.select().from(campaignPlayer).where(and(eq(campaignPlayer.campaignId,row.campaign.id),eq(campaignPlayer.userId,actor.userId)));
  const player=!!member&&roles.some(r=>r.role==='player')&&!row.character.isNpc&&row.character.playerUserId===actor.userId;
  let viewer=roles.some(r=>r.role==='admin');
  if(!god&&!player&&member&&row.character.ownerCharacterId) {
    const [owner]=await tx.select().from(campaignCharacter).where(eq(campaignCharacter.id,row.character.ownerCharacterId));
    viewer=viewer||owner?.playerUserId===actor.userId;
  }
  if(!god&&!player&&(!viewer||write)) throw new Error('Only the owning Player Character or current Campaign-owning G.O.D. may change Form. NPCs require the Campaign-owning G.O.D.');
  if(write&&(row.character.archivedAt||row.campaign.archivedAt)) throw new Error('Restore the individual and Campaign before changing Form.');
  return {...row,authority:god?'god' as const:player?'player' as const:'viewer' as const};
}
async function currentEntry(tx: Tx,id:number) {
  const [row]=await tx.select({event:formTransitionEvent}).from(characterActiveForm).innerJoin(formTransitionEvent,eq(formTransitionEvent.id,characterActiveForm.entryEventId)).where(eq(characterActiveForm.characterId,id));
  return row?.event??null;
}

/** Presentation/evidence only. Authorized callers already own their Character/Encounter read. */
export async function readCurrentFormIdentityInTransaction(tx:Tx,id:number) {
  if(id<=0) return null;
  const entry=await currentEntry(tx,id);
  return entry?{entryEventId:entry.id,name:entry.evidence.review.definition.name,kind:entry.ownerKind}:null;
}
export async function permanentTransitionFormBlockers(tx:Tx,id:number) {
  const active=await currentEntry(tx,id);
  const [request]=await tx.select({id:formTransitionRequest.id}).from(formTransitionRequest).where(and(eq(formTransitionRequest.characterId,id),eq(formTransitionRequest.status,'pending')));
  return [...(active?[`Current Form is ${active.evidence.review.definition.name}. Return to Normal before Evolution or historical Return.`]:[]),...(request?['Finish or cancel the pending Form transformation before Evolution or historical Return.']:[])];
}

async function normalForms(tx:Tx,access:Awaited<ReturnType<typeof authorize>>,actor:Actor,frozen?:FrozenFormDefinition) {
  const id=access.character.id;
  if(access.character.isNpc&&access.character.npcKind==='creature') {
    const [profile]=await tx.select().from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId,id));
    if(!profile) throw new Error('Saved normal Creature snapshot is missing.');
    const snapshot=parseCreatureNpcSnapshot(profile.currentSnapshotJson,'Normal Creature',profile.hpAdjustment);
    const context=creatureFormAccessContext(snapshot),sourceHash=hash(snapshot);
    return (frozen?[frozen.form as import('@/features/creatures/creature-forms').SavedCreatureForm]:availableCreatureForms(snapshot)).map(form=>({definition:frozen??{kind:'creature',sourceId:profile.creatureId,sourceName:snapshot.core.canonicalName,formId:form.id!,key:form.key,name:form.name,sourceHash,form} as FrozenFormDefinition,access:evaluateFormAccess(form.access,context)}));
  }
  const [profile]=await tx.select().from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId,id));
  if(!profile?.raceId) return [];
  const [normal]=await tx.select().from(race).where(eq(race.id,profile.raceId));
  const forms=frozen?[frozen.form as import('@/features/races/race-forms').SavedRaceForm]:await readRaceFormsInTransaction(tx,profile.raceId);
  if(!forms.length) return [];
  const attributes=await tx.select().from(campaignCharacterAttribute).where(eq(campaignCharacterAttribute.characterId,id));
  const allocations=await tx.select().from(campaignCharacterSkillAllocation).where(eq(campaignCharacterSkillAllocation.characterId,id));
  const skills=await tx.select().from(raceSkillLink).where(eq(raceSkillLink.raceId,profile.raceId));
  const abilities=await loadCharacterDerivedAbilitiesInTransaction(tx,id,actor.userId,false);
  const context=characterFormAccessContextFromFacts({attributes,skillPoints:getCharacterSkillPointsById({skillAllocations:allocations.map(row=>({draftId:row.id,skillId:row.skillId,points:row.points,parentDraftId:row.parentAllocationId}))}),racialSkillIds:skills.map(s=>s.skillId),possessedDerivedAbilityIds:new Set(abilities.resolution.statuses.filter(s=>s.possessed).map(s=>s.abilityId))});
  return forms.map(form=>({definition:frozen??{kind:'race',sourceId:profile.raceId!,sourceName:normal.name,formId:form.id,key:form.key,name:form.name,sourceHash:hash({normal,form}),form} as FrozenFormDefinition,access:evaluateFormAccess(form.access,context)}));
}

export async function readIndividualFormRuntime(id:number,actor:Actor):Promise<IndividualFormRuntime> {
  return db.transaction(async tx=>{
    const access=await authorize(tx,id,actor),entry=await currentEntry(tx,id);
    const [request]=await tx.select({request:formTransitionRequest,timing:pending.status}).from(formTransitionRequest).leftJoin(pending,eq(pending.id,formTransitionRequest.pendingActionId)).where(and(eq(formTransitionRequest.characterId,id),eq(formTransitionRequest.status,'pending')));
    const history=await tx.select().from(formTransitionEvent).where(eq(formTransitionEvent.characterId,id)).orderBy(desc(formTransitionEvent.id));
    return {characterId:id,campaignId:access.campaign.id,authority:access.authority,current:entry?eventView(entry):null,forms:await normalForms(tx,access,actor),pending:request?{requestId:request.request.id,operation:request.request.operation,name:request.request.evidence.review.definition.name,pendingActionId:request.request.pendingActionId,timingStatus:request.timing,blockers:await completionBlockers(tx,request.request)}:null,history:history.map(eventView)};
  },{isolationLevel:'repeatable read',accessMode:'read only'});
}

async function prepare(tx:Tx,selection:FormRuntimeSelection,actor:Actor):Promise<FormRuntimeReview> {
  if(!['enter','return'].includes(selection.operation)) throw new Error('Choose Enter Form or Return to Normal.');
  const access=await authorize(tx,selection.characterId,actor,true),entry=await currentEntry(tx,selection.characterId);
  if(access.authority==='viewer') throw new Error('This viewer cannot change Form.');
  const boundary=await readParticipantTransitionBoundary(tx,selection.characterId,access.campaign.id);
  const activeContexts=boundary.contexts.filter(c=>c.encounterStatus==='active');
  const selected=selection.encounterId?activeContexts.find(c=>c.encounterId===selection.encounterId):activeContexts.length===1?activeContexts[0]:null;
  if(selection.encounterId&&!selected) throw new Error('Select an active Encounter containing this individual.');
  let definition:FrozenFormDefinition,eligibility:FormRuntimeReview['access'];
  if(selection.operation==='enter') {
    if(entry) throw new Error('Return to Normal before entering another Form.');
    const chosen=(await normalForms(tx,access,actor)).find(f=>f.definition.key===selection.formKey&&f.definition.formId===selection.formId&&f.definition.sourceId===selection.sourceId);
    if(!chosen) throw new Error('This exact Form no longer belongs to the saved current Race or frozen Creature snapshot. Refresh the Forms list.');
    definition=chosen.definition; eligibility=chosen.access;
  } else {
    if(!entry) throw new Error('Already Normal. No active Form exists to return from.');
    definition=entry.evidence.review.definition; eligibility=entry.evidence.review.access;
  }
  const transformation=normalizeFormTransformation(definition.form.transformation)??emptyFormTransformation();
  const blockers=[...boundary.blockers],manualSteps:FormRuntimeReview['manualSteps']=[];
  const manual=(key:string,label:string)=>manualSteps.push({key,label});
  const [request]=await tx.select().from(formTransitionRequest).where(and(eq(formTransitionRequest.characterId,selection.characterId),eq(formTransitionRequest.status,'pending')));
  if(request) blockers.push('A Form transition is pending. Complete or cancel it before starting another.');
  if(selection.operation==='enter') {
    if(eligibility.status==='locked') blockers.push(eligibility.explanation);
    if(eligibility.status==='manual-review') {
      const group=eligibility.groups.find(g=>g.status==='manual-review');
      manual('access',`${eligibility.explanation} ${group?.requirements.filter(r=>r.status==='manual-review').map(r=>r.explanation).join(' ')??''}`);
    }
    if(!['voluntary','either'].includes(transformation.entryMethod??'')) manual('entry-method',`Entry control: ${transformation.entryMethod??'unspecified'}. ${transformation.entryNotes} Record the authored trigger or control ruling.`);
    if(transformation.entryMethod==='involuntary') for(const [i,trigger] of transformation.involuntaryTriggers.entries()) manual(`trigger-${i}`,`Involuntary trigger: ${trigger.notes||trigger.conditionKey||trigger.textValue||'G.O.D. evidence required'}`);
    if(transformation.limitMode!=='unlimited') manual('use-limit',`Use limit: ${transformation.limitMode}. ${transformation.useLimits.map(l=>`${l.maximumUses} per ${l.refreshScope}: ${l.notes}`).join('; ')} Automatic use tracking is pending Forms Pass 3.`);
    if(transformation.cooldown.trim()) manual('cooldown',`Confirm recovery: ${transformation.cooldown}. Automatic cooldown is pending Forms Pass 3.`);
  } else if(!transformation.exitMethods.includes('voluntary')) manual('exit-method',`Return requires G.O.D. confirmation of the authored exit: ${transformation.exitMethods.join(', ')||'unspecified'}. ${transformation.exitNotes} ${transformation.duration.description}`);
  const facts=await readAbilityFactsInTransaction(tx,{participantId:selection.characterId,campaignId:access.campaign.id,encounterId:selected?.encounterId,requestedKeys:transformation.requirements.flatMap(r=>r.conditionKey?[r.conditionKey]:[])});
  const conditions=transformation.requirements.map((condition,i)=>{
    const result=evaluateAbilityUseCondition(condition,facts),label=`${condition.conditionType}: ${condition.conditionKey??condition.textValue??condition.notes}`;
    if(result==='unsatisfied') blockers.push(`Transformation condition is not satisfied: ${label}.`);
    if(result==='manual') manual(`condition-${i}`,`Resolve transformation condition: ${label}. ${condition.notes}`);
    return {label,result};
  });
  const authoredTiming=selection.operation==='enter'?transformation.entryTiming:transformation.exitTiming;
  let timing:FormRuntimeReview['timing']={mode:'manual',initiativeCost:null,description:authoredTiming.notes||authoredTiming.time||'Timing is not specified.'};
  if(authoredTiming.mode==='instant') timing={mode:'instant',initiativeCost:null,description:'Instant at a clean participant boundary.'};
  else if(authoredTiming.mode==='initiative'&&selected) {
    timing={mode:'initiative',initiativeCost:authoredTiming.initiativeCost,description:`${authoredTiming.initiativeCost} Initiative through a pending transformation action.`};
    if(selected.currentInitiative===null||selected.currentInitiative<(authoredTiming.initiativeCost??Infinity)) blockers.push('Insufficient current Initiative for this transformation.');
  } else if(authoredTiming.mode==='time'&&!activeContexts.length) timing={mode:'time-confirm',initiativeCost:null,description:`Confirm the authored time has been observed: ${authoredTiming.time}`};
  else manual('timing',`Resolve ${authoredTiming.mode??'unspecified'} timing: ${authoredTiming.time||authoredTiming.notes||`${authoredTiming.initiativeCost??'No'} Initiative outside an active Initiative context`}. Choose the explicit execution timing in this review.`);
  if(activeContexts.length>1&&!selected) blockers.push('Select which active Encounter owns this transformation timing.');
  const authoredCosts=selection.operation==='enter'?transformation.entryCosts:transformation.exitCosts;
  if(authoredCosts.mode==='unspecified') manual('costs-unspecified','Resource costs are unspecified. Record an explicit cost resolution; unspecified does not mean free.');
  const mana=definition.kind==='race'?await readActiveManaInTransaction(tx,selection.characterId):null;
  const amounts=new Map<string,number>();
  for(const cost of authoredCosts.costs) if(cost.costType==='mana'&&cost.resourceKey) amounts.set(cost.resourceKey,(amounts.get(cost.resourceKey)??0)+cost.amount);
  const costs=authoredCosts.costs.map(cost=>planDerivedAbilityCost(cost,{manaPools:new Map(mana?.pools.map(p=>[p.system,{current:p.currentMana}])??[])}));
  for(const [index,cost] of costs.entries()) {
    if(cost.status==='manual') manual(`cost-${index}`,`${cost.cost.amount} ${cost.cost.costType}${cost.cost.resourceKey?` (${cost.cost.resourceKey})`:''}: ${cost.summary} ${cost.cost.notes}`);
    if(cost.status==='insufficient') blockers.push(cost.summary);
  }
  for(const [system,amount] of amounts) {const pool=mana?.pools.find(p=>p.system===system);if(pool&&pool.currentMana<amount) blockers.push(`Insufficient ${system} Mana for combined costs (${pool.currentMana}/${amount}).`);}
  if(access.authority==='player'&&manualSteps.length) blockers.push('This transition needs Campaign-owning G.O.D. review. Players cannot resolve manual requirements, timing or costs.');
  const review:FormRuntimeReview={characterId:selection.characterId,individualName:access.character.name,campaignId:access.campaign.id,authority:access.authority,operation:selection.operation,activeEntryId:entry?.id??null,definition,transformation,access:eligibility,facts:[...facts.values()],conditions,timing,costs,manualSteps,blockers,warnings:[
    'Normal mechanics remain in use until Forms Pass 2. Health, injuries and equipment are unchanged.',
    `Duration: ${transformation.duration.mode??'unspecified'}${transformation.duration.description?`: ${transformation.duration.description}`:''}. Automatic expiry and trigger handling are pending Forms Pass 3.`,
    `Authored equipment capability (not applied in Pass 1): ${definition.form.mechanics?.equipment.state??'normal'}. ${selection.operation==='enter'?transformation.equipmentEntryNotes:transformation.equipmentExitNotes}`,
  ],encounterContexts:boundary.contexts,encounterId:selected?.encounterId??null,reviewToken:''};
  review.reviewToken=hash({review,owner:access.character.ownerCharacterId,player:access.character.playerUserId});
  return review;
}
export async function previewFormTransition(selection:FormRuntimeSelection,actor:Actor) {
  return db.transaction(tx=>prepare(tx,selection,actor),{isolationLevel:'repeatable read',accessMode:'read only'});
}

function validateCommand(input:FormRuntimeCommand) {
  positive(input.characterId);
  if(typeof input.idempotencyKey!=='string'||!/^[\w-]{16,120}$/.test(input.idempotencyKey)||typeof input.reviewToken!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewToken)||typeof input.confirmTime!=='boolean'||!input.rulings||typeof input.rulings!=='object'||Array.isArray(input.rulings)) throw new Error('Review the transition with a valid durable request identity first.');
  for(const reason of Object.values(input.rulings)) if(typeof reason!=='string'||reason.trim().length<3||reason.length>2000) throw new Error('Each G.O.D. ruling needs a clear reason of 3–2000 characters.');
}
async function protectedTransition<T>(id:number,key:string,actor:Actor,run:(tx:Tx)=>Promise<T>,replay?:(tx:Tx)=>Promise<T|null>):Promise<T> {
  try {return await db.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL lock_timeout='3s'`);await tx.execute(sql`SET LOCAL statement_timeout='20s'`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`form-transition:${key}`},0))`);
    const access=await authorize(tx,id,actor);
    const prior=replay?await replay(tx):null;
    if(prior!==null)return prior;
    await authorize(tx,id,actor,true);
    await lockEvolutionFacts(tx);
    await tx.select({id:campaign.id}).from(campaign).where(eq(campaign.id,access.campaign.id)).for('update',{noWait:true});
    await tx.select({id:encounter.id}).from(encounter).where(eq(encounter.campaignId,access.campaign.id)).orderBy(asc(encounter.id)).for('update',{noWait:true});
    await tx.select().from(campaignCharacter).where(eq(campaignCharacter.id,id)).for('update',{noWait:true});
    await authorize(tx,id,actor,true);
    return run(tx);
  });} catch(error) {
    let cause:unknown=error;
    while(cause&&typeof cause==='object') {if('code'in cause&&['55P03','40P01','40001','57014'].includes(String(cause.code))) throw new Error('Related state is changing. Refresh the Form review and retry; no partial transition was committed.');cause='cause'in cause?cause.cause:null;}
    throw error;
  }
}
async function receipt(tx:Tx,row:typeof formTransitionRequest.$inferSelect,replayed:boolean):Promise<FormRuntimeReceipt> {
  const [event]=await tx.select().from(formTransitionEvent).where(eq(formTransitionEvent.requestId,row.id));
  return {requestId:row.id,status:row.status,pendingActionId:row.pendingActionId,event:event?eventView(event):null,replayed};
}
async function publish(tx:Tx,evidence:FormTransitionEvidence) {
  await publishCharacterStateInvalidationInTransaction(tx,evidence.review.characterId);
  for(const context of evidence.completionContexts.length?evidence.completionContexts:evidence.review.encounterContexts) if(context.encounterStatus==='active') await publishTabletopInvalidationInTransaction(tx,{campaignId:evidence.review.campaignId,sessionId:context.sessionId,sceneId:context.sceneId,encounterId:context.encounterId,characterIds:[],category:'character-state'});
}
async function applyTransition(tx:Tx,request:typeof formTransitionRequest.$inferSelect,contexts:FormRuntimeReview['encounterContexts']) {
  const {review}=request.evidence,definition=review.definition,active=await currentEntry(tx,request.characterId);
  if((active?.id??null)!==review.activeEntryId) throw new Error('Current Form changed. Cancel this pending transition and review again.');
  const [source]=definition.kind==='race'?await tx.select({id:campaignCharacterProfile.raceId}).from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId,request.characterId)):await tx.select({id:campaignCreatureNpcProfile.creatureId}).from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId,request.characterId));
  if(source?.id!==definition.sourceId) throw new Error('The underlying normal Race/Creature changed. Cancel and review the exact current Form source.');
  const evidence={...request.evidence,completionContexts:contexts};
  const [event]=await tx.insert(formTransitionEvent).values({requestId:request.id,characterId:request.characterId,campaignId:request.campaignId,operation:request.operation,enteredEventId:review.activeEntryId,ownerKind:definition.kind,sourceRaceId:definition.kind==='race'?definition.sourceId:null,raceFormId:definition.kind==='race'?definition.formId:null,sourceCreatureId:definition.kind==='creature'?definition.sourceId:null,creatureFormId:definition.kind==='creature'?definition.formId:null,formKey:definition.key,sourceHash:definition.sourceHash,evidence}).returning();
  if(request.operation==='enter') await tx.insert(characterActiveForm).values({characterId:request.characterId,entryEventId:event.id});
  else await tx.delete(characterActiveForm).where(and(eq(characterActiveForm.characterId,request.characterId),eq(characterActiveForm.entryEventId,review.activeEntryId!)));
  const [updated]=await tx.update(formTransitionRequest).set({status:'completed',completedAt:new Date()}).where(eq(formTransitionRequest.id,request.id)).returning();
  await publish(tx,evidence);return receipt(tx,updated,false);
}

export async function executeFormTransition(input:FormRuntimeCommand,actor:Actor):Promise<FormRuntimeReceipt> {
  validateCommand(input);const requestHash=hash({input,actorId:actor.userId});
  return protectedTransition(input.characterId,input.idempotencyKey,actor,async tx=>{
    const review=await prepare(tx,input,actor);
    if(review.blockers.length) throw new Error(review.blockers.join(' '));
    if(review.reviewToken!==input.reviewToken) throw new Error('The saved Form, Access, resources or Encounter changed. Refresh the review.');
    if(review.authority!=='god'&&(Object.keys(input.rulings).length||input.manualTiming)) throw new Error('Only the Campaign-owning G.O.D. may supply rulings.');
    for(const step of review.manualSteps) if(!input.rulings[step.key]?.trim()) throw new Error(`G.O.D. ruling required: ${step.label}`);
    if(review.timing.mode==='time-confirm'&&!input.confirmTime) throw new Error('Confirm that the authored transformation time has been observed.');
    let initiativeCost=review.timing.initiativeCost;
    if(review.timing.mode==='manual') {
      if(!input.manualTiming||!['instant','initiative'].includes(input.manualTiming.mode)) throw new Error('The G.O.D. must explicitly resolve execution timing.');
      initiativeCost=input.manualTiming.mode==='initiative'?input.manualTiming.initiativeCost:null;
      if(input.manualTiming.mode==='initiative'&&(!review.encounterId||typeof initiativeCost!=='number'||!Number.isFinite(initiativeCost)||initiativeCost<=0)) throw new Error('Manual Initiative timing requires a positive cost and active Encounter.');
    } else if(input.manualTiming) throw new Error('Authored executable timing cannot be replaced with a manual override.');
    const costsPaid:FormTransitionEvidence['costsPaid']=[];
    for(const cost of review.costs) if(cost.status==='automatic'&&cost.cost.amount>0) {
      if(cost.cost.costType!=='mana'||!isCharacterMagicSystem(cost.cost.resourceKey)) throw new Error('This resource has no exact supported spender.');
      const result=await spendActiveManaInTransaction(tx,{characterId:input.characterId,system:cost.cost.resourceKey,amount:cost.cost.amount});
      costsPaid.push({system:result.system,amount:cost.cost.amount,manaSpent:result.manaSpent,currentMana:result.currentMana});
    }
    const {reviewToken:_token,...reviewEvidence}=review;void _token;
    const evidence:FormTransitionEvidence={review:reviewEvidence,command:input,initiatedByUserId:actor.userId,authorizedByUserId:actor.userId,authority:review.authority,costsPaid,completionContexts:[]};
    let [request]=await tx.insert(formTransitionRequest).values({characterId:input.characterId,campaignId:review.campaignId,actorUserId:actor.userId,idempotencyKey:input.idempotencyKey,requestHash,operation:input.operation,status:'pending',encounterId:review.encounterId,evidence}).returning();
    if(initiativeCost!==null) {
      if(!review.encounterId) throw new Error('Initiative transformation requires an active Encounter.');
      const access=await authorize(tx,input.characterId,actor,true);
      const context=await lockOwnedEncounterRuntimeInTransaction(tx,review.encounterId,access.campaign.createdByUserId);
      const before=await loadInitiativeEngineInTransaction(tx,context.encounterId);
      const sequence=await tx.execute(sql<{id:number}>`select nextval(pg_get_serial_sequence('campaign_session_encounter_pending_action','id'))::integer as id`);
      const id=Number(sequence.rows[0].id);
      const after=startInitiativeAction(before,{id,actorCharacterId:input.characterId,label:input.operation==='enter'?`Enter Form: ${review.definition.name}`:'Return to Normal',actionKind:'form-transition',initiativeCost,allowsMultiRound:false});
      await persistInitiativeEngineInTransaction(tx,context,before,after);
      [request]=await tx.update(formTransitionRequest).set({pendingActionId:id}).where(eq(formTransitionRequest.id,request.id)).returning();
      await publish(tx,evidence);return receipt(tx,request,false);
    }
    return applyTransition(tx,request,review.encounterContexts);
  },async tx=>{
    // A confirmed receipt is immutable evidence, not a new runtime mutation. Read it
    // under the durable-key lock before fencing unrelated current combat writers.
    const [previous]=await tx.select().from(formTransitionRequest).where(eq(formTransitionRequest.idempotencyKey,input.idempotencyKey));
    if(!previous)return null;
    if(previous.requestHash!==requestHash)throw new Error('This request key was already used for different input.');
    return receipt(tx,previous,true);
  });
}

/** Revalidate saved Normal facts against frozen rules, without charging paid costs again. */
async function completionBlockers(tx:Tx,request:typeof formTransitionRequest.$inferSelect) {
  const {review,command}=request.evidence;
  const blockers:string[]=[];
  let access:Awaited<ReturnType<typeof authorize>>;
  try { access=await authorize(tx,request.characterId,{userId:request.actorUserId},true); }
  catch(error) { return [error instanceof Error?error.message:'Transformation authority changed.']; }
  if(access.authority!==review.authority) blockers.push('Transformation authority changed. Cancel and review again.');
  if((await currentEntry(tx,request.characterId))?.id!== (review.activeEntryId??undefined)) blockers.push('Current Form changed. Cancel and review again.');
  const [source]=review.definition.kind==='race'?await tx.select({id:campaignCharacterProfile.raceId}).from(campaignCharacterProfile).where(eq(campaignCharacterProfile.characterId,request.characterId)):await tx.select({id:campaignCreatureNpcProfile.creatureId}).from(campaignCreatureNpcProfile).where(eq(campaignCreatureNpcProfile.characterId,request.characterId));
  if(source?.id!==review.definition.sourceId) return [...blockers,'Normal Race/Creature changed. Cancel and review the current source.'];
  if(request.operation==='enter') {
    const [current]=await normalForms(tx,access,{userId:request.actorUserId},review.definition);
    if(!current||current.access.status==='locked') blockers.push(current?.access.explanation??'Saved Normal Access facts are unavailable.');
    else if(current.access.status==='manual-review'&&!command.rulings.access) blockers.push('Access now requires a G.O.D. ruling. Cancel and review again.');
  }
  const facts=await readAbilityFactsInTransaction(tx,{participantId:request.characterId,campaignId:request.campaignId,encounterId:request.encounterId??undefined,requestedKeys:review.transformation.requirements.flatMap(r=>r.conditionKey?[r.conditionKey]:[])});
  for(const [i,condition] of review.transformation.requirements.entries()) {
    const result=evaluateAbilityUseCondition(condition,facts);
    if(result==='unsatisfied'||result==='manual'&&!command.rulings[`condition-${i}`]) blockers.push(`Transformation condition ${i+1} is no longer satisfied. Cancel and review again.`);
  }
  return blockers;
}

/** Timing completion never charges again. Other unfinished involvement can defer completion. */
export async function reconcileFormTransitionsInTransaction(tx:Tx,encounterId:number) {
  const requests=await tx.select({request:formTransitionRequest,timing:pending}).from(formTransitionRequest).innerJoin(pending,eq(pending.id,formTransitionRequest.pendingActionId)).where(and(eq(formTransitionRequest.encounterId,encounterId),eq(formTransitionRequest.status,'pending'))).orderBy(asc(formTransitionRequest.id));
  const [liveEncounter]=requests.length?await tx.select({status:encounter.status}).from(encounter).where(eq(encounter.id,encounterId)):[];
  for(const {request,timing} of requests) {
    if(liveEncounter?.status!=='active'||['abandoned','ended'].includes(timing.status)) {
      await tx.update(formTransitionRequest).set({status:'cancelled',completedAt:new Date()}).where(eq(formTransitionRequest.id,request.id));await publish(tx,request.evidence);continue;
    }
    if(timing.status!=='completed') continue;
    await lockEvolutionFacts(tx);
    const boundary=await readParticipantTransitionBoundary(tx,request.characterId,request.campaignId,{pendingActionId:timing.id,formRequestId:request.id});
    if(boundary.blockers.length||(await completionBlockers(tx,request)).length) continue;
    await applyTransition(tx,request,boundary.contexts);
  }
}
export async function completePendingFormTransition(characterId:number,requestId:number,actor:Actor) {
  positive(requestId);
  return protectedTransition(characterId,`completion-${requestId}`,actor,async tx=>{
    const [request]=await tx.select().from(formTransitionRequest).where(and(eq(formTransitionRequest.id,requestId),eq(formTransitionRequest.characterId,characterId)));
    if(!request) throw new Error('Pending Form transition not found.');
    if(request.status!=='pending') return receipt(tx,request,true);
    if(request.encounterId) await reconcileFormTransitionsInTransaction(tx,request.encounterId);
    const [updated]=await tx.select().from(formTransitionRequest).where(eq(formTransitionRequest.id,requestId));
    if(updated.status==='pending'&&(await completionBlockers(tx,updated)).length) throw new Error((await completionBlockers(tx,updated)).join(' '));
    if(updated.status==='pending') throw new Error('Transformation timing or another participant operation is still unfinished. Resume/complete Initiative and reach a clean boundary first.');
    return receipt(tx,updated,false);
  });
}

export async function readFormTransitionReceipt(characterId:number,key:string,actor:Actor) {
  return db.transaction(async tx=>{
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`form-transition:${key}`},0))`);
    await authorize(tx,characterId,actor);
    const [request]=await tx.select().from(formTransitionRequest).where(and(eq(formTransitionRequest.characterId,characterId),eq(formTransitionRequest.idempotencyKey,key),eq(formTransitionRequest.actorUserId,actor.userId)));
    return request?receipt(tx,request,true):null;
  });
}

export async function cancelPendingFormTransition(characterId:number,requestId:number,actor:Actor) {
  positive(requestId);
  return protectedTransition(characterId,`completion-${requestId}`,actor,async tx=>{
    const access=await authorize(tx,characterId,actor,true);
    const [request]=await tx.select().from(formTransitionRequest).where(and(eq(formTransitionRequest.id,requestId),eq(formTransitionRequest.characterId,characterId)));
    if(!request) throw new Error('Form transition not found.');
    if(access.authority!=='god'&&request.actorUserId!==actor.userId) throw new Error('Only the initiating Player or Campaign-owning G.O.D. may cancel this transition.');
    if(request.status!=='pending') return receipt(tx,request,true);
    await assertCharacterCombatWritableInTransaction(tx,characterId);
    if(request.pendingActionId&&request.encounterId) {
      const context=await lockOwnedEncounterRuntimeInTransaction(tx,request.encounterId,access.campaign.createdByUserId);
      const before=await loadInitiativeEngineInTransaction(tx,context.encounterId);
      const timing=before.pendingActions.find(p=>p.id===request.pendingActionId);
      if(timing&&['active','interrupted'].includes(timing.status)) await persistInitiativeEngineInTransaction(tx,context,before,abandonPendingInitiativeAction(before,timing.id));
    }
    const [latest]=await tx.select().from(formTransitionRequest).where(eq(formTransitionRequest.id,request.id));
    if(latest.status!=='pending') return receipt(tx,latest,false);
    const [updated]=await tx.update(formTransitionRequest).set({status:'cancelled',completedAt:new Date()}).where(eq(formTransitionRequest.id,request.id)).returning();
    await publish(tx,request.evidence);
    return receipt(tx,updated,false);
  });
}

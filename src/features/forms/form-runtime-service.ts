import { readEffectiveFormViewInTransaction } from './effective-form-view-service';
import { readActiveFormDefinitionInTransaction } from './effective-form-service';
import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { userRole } from '@/db/authorization-schema';
import { campaign, campaignPlayer } from '@/db/campaign-schema';
import { campaignCharacter, campaignCharacterProfile, campaignCreatureNpcProfile, campaignCharacterAttribute, campaignCharacterSkillAllocation } from '@/db/realm-schema';
import { race, raceSkillLink } from '@/db/race-schema';
import { characterActiveForm, formTransitionEvent, formTransitionRequest, formUseResetEvent } from '@/db/form-runtime-schema';
import { campaignSessionEncounter as encounter, campaignSessionEncounterPendingAction as pending, campaignSessionEncounterParticipant, campaignSessionSceneMember } from '@/db/tabletop-operations-schema';
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
import type { FormLifecycleExecution, FormLifecycleView } from './form-lifecycle';
import { formChoiceLabel } from './form-language';
import { entryLifecycleContext, readFormLifecycleContext, readFormLimits, readFormReturnDue, retainFormReturnDue } from './form-lifecycle-service';
import { applyFormEquipmentDrops, previewFormEquipmentDrops } from './form-equipment-transition-service';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = { userId: string };
const lifecycleBusy=new WeakSet<Tx>();
async function withoutRecursiveLifecycle<T>(tx:Tx,run:()=>Promise<T>):Promise<T> {
  const already=lifecycleBusy.has(tx);lifecycleBusy.add(tx);
  try{return await run();}finally{if(!already)lifecycleBusy.delete(tx);}
}
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
  return (await readActiveFormDefinitionInTransaction(tx,id))?.identity ?? null;
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
    const saved=JSON.parse(profile.currentSnapshotJson) as {forms?:unknown};
    // Older combat snapshots without Forms do not need a full constructor read
    // merely because an unrelated action reached a lifecycle boundary.
    if(!frozen&&(saved.forms==null||Array.isArray(saved.forms)&&saved.forms.length===0))return [];
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

async function readTriggerCandidates(tx:Tx,access:Awaited<ReturnType<typeof authorize>>,actor:Actor,contexts:FormRuntimeReview['encounterContexts']) {
  const active=contexts.filter(c=>c.encounterStatus==='active'),selected=active.length===1?active[0]:null;
  const candidates=[];
  for(const form of await normalForms(tx,access,actor)) {
    const transformation=normalizeFormTransformation(form.definition.form.transformation)??emptyFormTransformation();
    if(!['involuntary','either'].includes(transformation.entryMethod??''))continue;
    const conditions=[...transformation.involuntaryTriggers,...transformation.requirements];
    const facts=await readAbilityFactsInTransaction(tx,{participantId:access.character.id,campaignId:access.campaign.id,encounterId:selected?.encounterId,requestedKeys:conditions.flatMap(c=>c.conditionKey?[c.conditionKey]:[])});
    const results=conditions.map(c=>evaluateAbilityUseCondition(c,facts));
    const status=form.access.status==='locked'||results.includes('unsatisfied')?'unsatisfied' as const:
      form.access.status!=='available'||!transformation.involuntaryTriggers.length||results.includes('manual')?'manual' as const:'satisfied' as const;
    const reasons=[...(form.access.status!=='available'?[form.access.explanation]:[]),...(!transformation.involuntaryTriggers.length?['No structured involuntary trigger is authored.']:[]),
      ...conditions.flatMap((c,i)=>results[i]==='satisfied'?[]:[`${c.conditionKey??c.notes??'Trigger'}: ${results[i]==='manual'?'no authoritative current fact; G.O.D. evidence required':'not satisfied'}.`])];
    candidates.push({...form,status,reasons,facts:[...facts.values()]});
  }
  return candidates;
}

async function readLifecycleView(tx:Tx,access:Awaited<ReturnType<typeof authorize>>,actor:Actor,entry:Awaited<ReturnType<typeof currentEntry>>):Promise<FormLifecycleView> {
  const id=access.character.id,boundary=await readParticipantTransitionBoundary(tx,id,access.campaign.id);
  const due=entry?await readFormReturnDue(tx,id,entry):null;
  const candidates=await readTriggerCandidates(tx,access,actor,boundary.contexts);
  const satisfied=candidates.filter(c=>c.status==='satisfied');
  const blockers=[...boundary.blockers],manual:string[]=[];
  if(satisfied.length>1)manual.push(`Multiple involuntary Forms are satisfied: ${satisfied.map(c=>c.definition.name).join(', ')}. The Campaign-owning G.O.D. must choose; no automatic priority exists.`);
  if(entry&&satisfied.some(c=>c.definition.key!==entry.formKey||c.definition.formId!==entry.evidence.review.definition.formId))manual.push('Another Form trigger is satisfied. Return to Normal before the G.O.D. resolves entry; direct Form-to-Form changes are unavailable.');
  const context=entry?entryLifecycleContext(entry.evidence):null;
  if(!entry&&access.authority!=='viewer')for(const candidate of satisfied) {
    const definition=candidate.definition;
    const live=boundary.contexts.filter(c=>c.encounterStatus==='active');
    const execution:FormLifecycleExecution={initiator:'system/lifecycle',reason:'structured-trigger',explanation:'Structured entry review',facts:candidate.facts,entryEventId:null,context:await readFormLifecycleContext(tx,id,live.length===1?live[0]:null),observedBy:'Lifecycle preview',originalEntryContext:null};
    const review=await prepare(tx,{characterId:id,operation:'enter',sourceId:definition.sourceId,formId:definition.formId,formKey:definition.key},actor,execution);
    candidate.reasons.push(...review.blockers,...review.manualSteps.map(s=>s.label));
  }
  const t=entry?.evidence.review.transformation;
  if(t?.cooldown.trim())manual.push(`Cooldown needs G.O.D. evidence: ${t.cooldown}`);
  if(t&&(['fixed','condition-end','custom'].includes(t.duration.mode??'')||!t.duration.mode))manual.push('Duration has no executable clock or end predicate. The G.O.D. tracks the authored description and resolves Return.');
  if(t?.duration.mode==='encounter'&&!context?.encounterId||t?.duration.mode==='scene'&&!context?.sceneId)manual.push('This entry has no bound duration owner. It will not attach to a later Encounter or Scene; G.O.D. duration resolution is required.');
  if(t?.exitMethods.includes('resource-depletion'))manual.push('Resource-depletion exit has no exact authored pool/threshold. G.O.D. evidence is required.');
  if(due&&access.authority!=='viewer') {
    const review=await prepare(tx,{characterId:id,operation:'return'},actor);
    blockers.push(...review.blockers);
    manual.push(...review.manualSteps.map(s=>s.label));
    if(!t?.exitMethods.includes('duration-end'))manual.push('Automatic Return has no authored duration-end exit; use the existing G.O.D. Return review.');
  }
  const active=boundary.contexts.filter(c=>c.encounterStatus==='active');
  const liveContext=await readFormLifecycleContext(tx,id,active.length===1?active[0]:null);
  const limits=entry?await readFormLimits(tx,id,entry.evidence.review.definition,liveContext):[];
  return {scope:liveContext,context,due,duration:t?`${formChoiceLabel(t.duration.mode)}${t.duration.description?`: ${t.duration.description}`:''}`:'Normal; no active Form duration.',blockers:[...new Set(blockers)],manual:[...new Set(manual)],limits,
    triggerCandidates:candidates.map(c=>({name:c.definition.name,formKey:c.definition.key,status:c.status,reasons:c.reasons}))};
}

export async function readIndividualFormRuntime(id:number,actor:Actor):Promise<IndividualFormRuntime> {
  return db.transaction(async tx=>{
    const access=await authorize(tx,id,actor),entry=await currentEntry(tx,id);
    const [request]=await tx.select({request:formTransitionRequest,timing:pending.status}).from(formTransitionRequest).leftJoin(pending,eq(pending.id,formTransitionRequest.pendingActionId)).where(and(eq(formTransitionRequest.characterId,id),eq(formTransitionRequest.status,'pending')));
    const history=await tx.select().from(formTransitionEvent).where(eq(formTransitionEvent.characterId,id)).orderBy(desc(formTransitionEvent.id));
    const lifecycle=await readLifecycleView(tx,access,actor,entry),forms=[];
    for(const form of await normalForms(tx,access,actor))forms.push({...form,limits:await readFormLimits(tx,id,form.definition,lifecycle.scope)});
    const resets=await tx.select().from(formUseResetEvent).where(eq(formUseResetEvent.characterId,id)).orderBy(desc(formUseResetEvent.id));
    return {effective:await readEffectiveFormViewInTransaction(tx,id),characterId:id,campaignId:access.campaign.id,authority:access.authority,current:entry?eventView(entry):null,forms,pending:request?{requestId:request.request.id,operation:request.request.operation,name:request.request.evidence.review.definition.name,pendingActionId:request.request.pendingActionId,timingStatus:request.timing,blockers:await completionBlockers(tx,request.request)}:null,history:history.map(eventView),lifecycle,
      useRefreshHistory:resets.map(r=>({id:r.id,formName:r.evidence.definition.name,scope:r.refreshScope,refreshKey:r.refreshKey,reason:r.evidence.reason,actorUserId:r.actorUserId,executedAt:r.executedAt.toISOString()}))};
  },{isolationLevel:'repeatable read',accessMode:'read only'});
}

async function prepare(tx:Tx,selection:FormRuntimeSelection,actor:Actor,lifecycle?:FormLifecycleExecution):Promise<FormRuntimeReview> {
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
  const lifecycleContext=await readFormLifecycleContext(tx,selection.characterId,selected);
  const limits=selection.operation==='enter'?await readFormLimits(tx,selection.characterId,definition,lifecycleContext):[];
  const due=entry?await readFormReturnDue(tx,selection.characterId,entry):null;
  const [request]=await tx.select().from(formTransitionRequest).where(and(eq(formTransitionRequest.characterId,selection.characterId),eq(formTransitionRequest.status,'pending')));
  if(request) blockers.push('A Form transition is pending. Complete or cancel it before starting another.');
  if(selection.operation==='enter') {
    if(eligibility.status==='locked') blockers.push(eligibility.explanation);
    if(eligibility.status==='manual-review') {
      const group=eligibility.groups.find(g=>g.status==='manual-review');
      manual('access',`${eligibility.explanation} ${group?.requirements.filter(r=>r.status==='manual-review').map(r=>r.explanation).join(' ')??''}`);
    }
    if(lifecycle) {
      if(!['involuntary','either'].includes(transformation.entryMethod??'')||!transformation.involuntaryTriggers.length) blockers.push('No authored structured involuntary entry is available.');
      if(eligibility.status!=='available') blockers.push('Automatic entry requires automatically Available Access.');
      const triggerFacts=await readAbilityFactsInTransaction(tx,{participantId:selection.characterId,campaignId:access.campaign.id,encounterId:selected?.encounterId,requestedKeys:transformation.involuntaryTriggers.flatMap(t=>t.conditionKey?[t.conditionKey]:[])});
      for(const trigger of transformation.involuntaryTriggers)if(evaluateAbilityUseCondition(trigger,triggerFacts)!=='satisfied')blockers.push('An involuntary trigger no longer has a satisfied authoritative fact.');
    } else {
      if(!['voluntary','either'].includes(transformation.entryMethod??'')) manual('entry-method',`Entry control: ${transformation.entryMethod??'unspecified'}. ${transformation.entryNotes} Record the authored trigger or control ruling.`);
      if(transformation.entryMethod==='involuntary') for(const [i,trigger] of transformation.involuntaryTriggers.entries()) manual(`trigger-${i}`,`Involuntary trigger: ${trigger.notes||trigger.conditionKey||trigger.textValue||'G.O.D. evidence required'}`);
    }
    if(transformation.limitMode!=='unlimited'&&(transformation.limitMode!=='limited'||!limits.length))manual('use-limit',`Use limit: ${transformation.limitMode}. No complete structured limit is authored; G.O.D. resolution is required.`);
    for(const [i,limit] of limits.entries()) {
      if(limit.status==='exhausted')blockers.push(`Form use limit exhausted. ${limit.explanation}`);
      if(limit.status==='manual')manual(`use-limit-${i}`,limit.explanation);
    }
    if(transformation.cooldown.trim()) manual('cooldown',`Confirm recovery: ${transformation.cooldown}. This is prose, with no executable cooldown clock.`);
    if(['fixed','condition-end','custom'].includes(transformation.duration.mode??'')||!transformation.duration.mode)manual('duration',`Duration requires G.O.D. tracking: ${transformation.duration.mode??'unspecified'}. ${transformation.duration.description} No structured expiry predicate or clock is authored.`);
    if(transformation.duration.mode==='encounter'&&!lifecycleContext.encounterId||transformation.duration.mode==='scene'&&!lifecycleContext.sceneId)manual('duration-owner','No exact active duration owner is available. This entry stays unbound and needs G.O.D. duration tracking; it will not attach to a future Encounter or Scene.');
  } else if(!(due&&transformation.exitMethods.includes('duration-end'))&&!transformation.exitMethods.includes('voluntary')) manual('exit-method',`Return requires G.O.D. confirmation of the authored exit: ${transformation.exitMethods.join(', ')||'unspecified'}. ${transformation.exitNotes} ${transformation.duration.description}`);
  if(lifecycle&&selection.operation==='return'&&(!due||!transformation.exitMethods.includes('duration-end')))blockers.push('Automatic Return requires an exact ended duration owner and an authored duration-end exit.');
  const equipmentPolicy=definition.form.mechanics?.equipment.state;
  if(equipmentPolicy==='custom')manual('equipment',`Resolve the custom equipment policy explicitly. ${selection.operation==='enter'?transformation.equipmentEntryNotes:transformation.equipmentExitNotes} No physical equipment change is inferred from notes.`);
  const equipmentDrops=selection.operation==='enter'&&equipmentPolicy==='dropped'?await previewFormEquipmentDrops(tx,selection.characterId,lifecycleContext.sceneId):null;
  if(equipmentDrops)blockers.push(...equipmentDrops.blockers);
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
    else {
      try{const engine=await loadInitiativeEngineInTransaction(tx,selected.encounterId,false,false);startInitiativeAction(engine,{id:Math.max(0,...engine.pendingActions.map(a=>a.id))+1,actorCharacterId:selection.characterId,label:'Form timing review',actionKind:'form-transition',initiativeCost:authoredTiming.initiativeCost!,allowsMultiRound:false});}
      catch(error){blockers.push(error instanceof Error?error.message:'The current Initiative engine cannot start this transformation.');}
    }
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
    'Current Form governs live mechanics after completion. Stored damage, injuries and unrelated effects remain recorded. Equipment changes only through its authored structured policy.',
    `Duration: ${transformation.duration.mode??'unspecified'}${transformation.duration.description?`: ${transformation.duration.description}`:''}. ${due?.reason??'The frozen duration owner is retained until Return completes.'}`,
    `Equipment: ${equipmentPolicy??'inherited'}. ${equipmentDrops?.items.length?`${equipmentDrops.items.map(i=>`${i.quantity} × ${i.name}${i.instanceId?` #${i.instanceId}`:''}`).join(', ')} will be dropped at ${equipmentDrops.location??'an unresolved location'}. Return does not retrieve or re-equip them.`:selection.operation==='enter'?transformation.equipmentEntryNotes:transformation.equipmentExitNotes}`,
  ],encounterContexts:boundary.contexts,encounterId:selected?.encounterId??null,lifecycleContext,limits,equipmentDrops,reviewToken:''};
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
    return withoutRecursiveLifecycle(tx,()=>run(tx));
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
  const lifecycleContext=await readFormLifecycleContext(tx,request.characterId,contexts.find(c=>c.encounterId===review.encounterId));
  const equipmentDrops=request.operation==='enter'&&review.equipmentDrops?await applyFormEquipmentDrops(tx,request.characterId,request.actorUserId,request.id,review.equipmentDrops):[];
  const evidence:FormTransitionEvidence={...request.evidence,completionContexts:contexts,lifecycleContext, equipmentDrops,
    ...(request.operation==='return'?{returnDue:await readFormReturnDue(tx,request.characterId,active)}:{})};
  const [event]=await tx.insert(formTransitionEvent).values({requestId:request.id,characterId:request.characterId,campaignId:request.campaignId,operation:request.operation,enteredEventId:review.activeEntryId,ownerKind:definition.kind,sourceRaceId:definition.kind==='race'?definition.sourceId:null,raceFormId:definition.kind==='race'?definition.formId:null,sourceCreatureId:definition.kind==='creature'?definition.sourceId:null,creatureFormId:definition.kind==='creature'?definition.formId:null,formKey:definition.key,sourceHash:definition.sourceHash,evidence}).returning();
  if(request.operation==='enter') await tx.insert(characterActiveForm).values({characterId:request.characterId,entryEventId:event.id});
  else await tx.delete(characterActiveForm).where(and(eq(characterActiveForm.characterId,request.characterId),eq(characterActiveForm.entryEventId,review.activeEntryId!)));
  const [updated]=await tx.update(formTransitionRequest).set({status:'completed',completedAt:new Date()}).where(eq(formTransitionRequest.id,request.id)).returning();
  await publish(tx,evidence);return receipt(tx,updated,false);
}

async function executeTransitionInTransaction(tx:Tx,input:FormRuntimeCommand,actor:Actor,requestHash:string,lifecycle?:FormLifecycleExecution):Promise<FormRuntimeReceipt> {
    const review=await prepare(tx,input,actor,lifecycle);
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
    const initiationReason:FormTransitionEvidence['initiationReason']=lifecycle?'system/lifecycle':input.operation==='return'?review.authority==='god'?'god-return':'player-return':review.authority==='player'?'player-voluntary':review.transformation.entryMethod==='involuntary'?'god-involuntary':['voluntary','either'].includes(review.transformation.entryMethod??'')?'god-voluntary':'god-manual';
    const evidence:FormTransitionEvidence={review:reviewEvidence,command:input,initiatedByUserId:lifecycle?null:actor.userId,authorizedByUserId:actor.userId,authority:lifecycle?'system/lifecycle':review.authority,costsPaid,completionContexts:[],initiator:lifecycle?'system/lifecycle':'user',initiationReason,...(lifecycle?{lifecycle}:{})};
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
}

export async function executeFormTransition(input:FormRuntimeCommand,actor:Actor):Promise<FormRuntimeReceipt> {
  validateCommand(input);const requestHash=hash({input,actorId:actor.userId});
  return protectedTransition(input.characterId,input.idempotencyKey,actor,async tx=>{
    return executeTransitionInTransaction(tx,input,actor,requestHash);
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
    const boundary=await readParticipantTransitionBoundary(tx,request.characterId,request.campaignId,{pendingActionId:request.pendingActionId??undefined,formRequestId:request.id});
    const context=await readFormLifecycleContext(tx,request.characterId,boundary.contexts.find(c=>c.encounterId===request.encounterId));
    for(const [i,limit] of (await readFormLimits(tx,request.characterId,review.definition,context)).entries()) {
      if(limit.status==='exhausted'||limit.status==='manual'&&!command.rulings[`use-limit-${i}`])blockers.push(limit.explanation);
    }
    if(review.equipmentDrops&&hash(await previewFormEquipmentDrops(tx,request.characterId,context.sceneId))!==hash(review.equipmentDrops))blockers.push('Equipment or its drop location changed during transformation. Cancel and review the exact equipment again.');
    if(request.evidence.lifecycle) {
      const candidates=await readTriggerCandidates(tx,access,{userId:request.actorUserId},boundary.contexts);
      const competing=candidates.filter(c=>c.status==='satisfied'&&(c.definition.key!==review.definition.key||c.definition.formId!==review.definition.formId||c.definition.sourceId!==review.definition.sourceId));
      const frozenFacts=await readAbilityFactsInTransaction(tx,{participantId:request.characterId,campaignId:request.campaignId,encounterId:request.encounterId??undefined,requestedKeys:review.transformation.involuntaryTriggers.flatMap(t=>t.conditionKey?[t.conditionKey]:[])});
      if(competing.length||review.transformation.involuntaryTriggers.some(t=>evaluateAbilityUseCondition(t,frozenFacts)!=='satisfied'))blockers.push('The frozen automatic trigger is no longer uniquely satisfied. The G.O.D. must resolve the pending transformation.');
    }
  }
  const facts=await readAbilityFactsInTransaction(tx,{participantId:request.characterId,campaignId:request.campaignId,encounterId:request.encounterId??undefined,requestedKeys:review.transformation.requirements.flatMap(r=>r.conditionKey?[r.conditionKey]:[])});
  for(const [i,condition] of review.transformation.requirements.entries()) {
    const result=evaluateAbilityUseCondition(condition,facts);
    if(result==='unsatisfied'||result==='manual'&&!command.rulings[`condition-${i}`]) blockers.push(`Transformation condition ${i+1} is no longer satisfied. Cancel and review again.`);
  }
  return blockers;
}

/** Timing completion never charges again. Other unfinished involvement can defer completion. */
async function reconcilePendingTransitions(tx:Tx,encounterId:number) {
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

export async function reconcileFormTransitionsInTransaction(tx:Tx,encounterId:number) {
  if(lifecycleBusy.has(tx))return;
  await withoutRecursiveLifecycle(tx,()=>reconcilePendingTransitions(tx,encounterId));
  await reconcileFormLifecycleInTransaction(tx,{encounterId,cause:'Initiative or Encounter lifecycle completion'});
}

export type FormLifecycleSignal = {characterIds?:number[];encounterId?:number;sceneId?:number;cause:string};
/** One owner-invoked reconciliation point. No polling, prose predicates or body changes mid-action. */
export async function reconcileFormLifecycleInTransaction(tx:Tx,signal:FormLifecycleSignal) {
  if(lifecycleBusy.has(tx))return;
  return withoutRecursiveLifecycle(tx,async()=>{
    const ids=new Set((signal.characterIds??[]).filter(id=>Number.isSafeInteger(id)&&id>0));
    if(signal.encounterId)for(const row of await tx.select({id:campaignSessionEncounterParticipant.characterId}).from(campaignSessionEncounterParticipant).where(eq(campaignSessionEncounterParticipant.encounterId,signal.encounterId)))if(row.id>0)ids.add(row.id);
    if(signal.sceneId)for(const row of await tx.select({id:campaignSessionSceneMember.characterId}).from(campaignSessionSceneMember).where(eq(campaignSessionSceneMember.sceneId,signal.sceneId)))ids.add(row.id);
    if(signal.encounterId||signal.sceneId) {
      const entries=await tx.select({event:formTransitionEvent}).from(characterActiveForm).innerJoin(formTransitionEvent,eq(formTransitionEvent.id,characterActiveForm.entryEventId));
      for(const {event} of entries){const c=entryLifecycleContext(event.evidence);if(signal.encounterId&&c.encounterId===signal.encounterId||signal.sceneId&&c.sceneId===signal.sceneId)ids.add(event.characterId);}
    }
    for(const id of [...ids].sort((a,b)=>a-b)) {
      const [owner]=await tx.select({userId:campaign.createdByUserId}).from(campaignCharacter).innerJoin(campaign,eq(campaign.id,campaignCharacter.campaignId))
        .innerJoin(userRole,and(eq(userRole.userId,campaign.createdByUserId),eq(userRole.role,'god')))
        .where(and(eq(campaignCharacter.id,id),isNull(campaignCharacter.archivedAt),isNull(campaign.archivedAt)));
      if(!owner)continue;
      const observedEntry=await currentEntry(tx,id);
      const observedDue=observedEntry?await readFormReturnDue(tx,id,observedEntry):null;
      if(observedDue) {
        const boundary=await readParticipantTransitionBoundary(tx,id,observedEntry!.campaignId);
        if(!boundary.contexts.some(c=>c.frozen))await retainFormReturnDue(tx,id,observedDue);
      }
      // Savepoint contains every Form-specific write/cost/drop. An unavailable
      // fence defers lifecycle work without rolling back the original HP/effect owner.
      await tx.transaction(async lifecycleTx=>withoutRecursiveLifecycle(lifecycleTx,async()=>{
        const access=await authorize(lifecycleTx,id,owner,true);
        const entry=await currentEntry(lifecycleTx,id);
        const boundary=await readParticipantTransitionBoundary(lifecycleTx,id,access.campaign.id);
        if(boundary.contexts.some(c=>c.frozen))return;
        const due=entry?await readFormReturnDue(lifecycleTx,id,entry):null;
        if(entry&&!due)return;
        const candidates=entry?[]:await readTriggerCandidates(lifecycleTx,access,owner,boundary.contexts);
        const satisfied=candidates.filter(c=>c.status==='satisfied');
        if(!entry&&satisfied.length!==1)return;
        await lockEvolutionFacts(lifecycleTx);
        await lifecycleTx.select().from(campaignCharacter).where(eq(campaignCharacter.id,id)).for('update',{noWait:true});
        if((await currentEntry(lifecycleTx,id))?.id!==entry?.id)return;
        // The fence protects re-reading every fact and owner used by the decision.
        const freshBoundary=await readParticipantTransitionBoundary(lifecycleTx,id,access.campaign.id);
        if(freshBoundary.contexts.some(c=>c.frozen))return;
        if(due)await retainFormReturnDue(lifecycleTx,id,due);
        if(freshBoundary.blockers.length)return;
        const freshCandidates=entry?[]:(await readTriggerCandidates(lifecycleTx,access,owner,freshBoundary.contexts)).filter(c=>c.status==='satisfied');
        if(!entry&&freshCandidates.length!==1)return;
        const chosen=freshCandidates[0];
        const active=freshBoundary.contexts.filter(c=>c.encounterStatus==='active');
        const context=await readFormLifecycleContext(lifecycleTx,id,active.length===1?active[0]:null);
        const lifecycle:FormLifecycleExecution={initiator:'system/lifecycle',reason:due?.kind??'structured-trigger',explanation:due?.reason??`All authored triggers and requirements for ${chosen.definition.name} are satisfied.`,facts:chosen?.facts??[],entryEventId:entry?.id??null,context,observedBy:signal.cause,originalEntryContext:entry?entryLifecycleContext(entry.evidence):null};
        const selection:FormRuntimeSelection=entry?{characterId:id,operation:'return'}:{characterId:id,operation:'enter',formKey:chosen.definition.key,sourceId:chosen.definition.sourceId,formId:chosen.definition.formId};
        const review=await prepare(lifecycleTx,selection,owner,lifecycle);
        if(review.blockers.length||review.manualSteps.length||!['instant','initiative'].includes(review.timing.mode))return;
        const [last]=await lifecycleTx.select({id:formTransitionEvent.id}).from(formTransitionEvent).where(eq(formTransitionEvent.characterId,id)).orderBy(desc(formTransitionEvent.id)).limit(1);
        const idempotencyKey=`form-lifecycle-${hash({id,last:last?.id??0,operation:selection.operation,definition:review.definition,reason:lifecycle.reason,context,facts:lifecycle.facts})}`;
        const [prior]=await lifecycleTx.select().from(formTransitionRequest).where(eq(formTransitionRequest.idempotencyKey,idempotencyKey));
        if(prior)return;
        const input:FormRuntimeCommand={...selection,idempotencyKey,reviewToken:review.reviewToken,rulings:{},confirmTime:false};
        await executeTransitionInTransaction(lifecycleTx,input,owner,hash({input,lifecycle}),lifecycle);
      })).catch(error=>{
        // Only normal domain deferrals and lock contention are recoverable here.
        // SQL/schema/programming failures must remain visible to the caller.
        let cause:unknown=error;let code:string|undefined;
        while(cause&&typeof cause==='object'){if('code'in cause)code=String(cause.code);cause='cause'in cause?cause.cause:null;}
        if(!code||!['55P03','40P01','40001','57014'].includes(code))throw error;
      });
    }
  });
}

export type FormUseResetCommand = {characterId:number;sourceId:number;formId:number;formKey:string;refreshScope:'manual'|'event';refreshKey:string|null;reason:string;idempotencyKey:string};
export async function resetFormUses(input:FormUseResetCommand,actor:Actor) {
  if(!/^[\w-]{16,120}$/.test(input.idempotencyKey)||typeof input.reason!=='string'||input.reason.trim().length<3||input.reason.length>2000)throw new Error('A durable reset identity and clear G.O.D. reason are required.');
  const requestHash=hash({input,actorId:actor.userId});
  return protectedTransition(input.characterId,`reset-${input.idempotencyKey}`,actor,async tx=>{
    const access=await authorize(tx,input.characterId,actor,true);
    if(access.authority!=='god')throw new Error('Only the Campaign-owning G.O.D. may confirm an authored Form use refresh.');
    await assertCharacterCombatWritableInTransaction(tx,input.characterId);
    const chosen=(await normalForms(tx,access,actor)).find(c=>c.definition.sourceId===input.sourceId&&c.definition.formId===input.formId&&c.definition.key===input.formKey);
    if(!chosen)throw new Error('Choose an exact Form from the current saved Normal source.');
    const t=normalizeFormTransformation(chosen.definition.form.transformation)??emptyFormTransformation();
    if(!['manual','event'].includes(input.refreshScope)||t.limitMode!=='limited'||!t.useLimits.some(l=>l.refreshScope===input.refreshScope&&(l.refreshKey??null)===input.refreshKey))throw new Error('Only an exact authored manual/event limit can be refreshed. Structured round, Encounter, Scene and lifetime limits cannot be waived.');
    const [last]=await tx.select({id:formTransitionEvent.id}).from(formTransitionEvent).where(and(eq(formTransitionEvent.characterId,input.characterId),eq(formTransitionEvent.operation,'enter'))).orderBy(desc(formTransitionEvent.id)).limit(1);
    const [event]=await tx.insert(formUseResetEvent).values({characterId:input.characterId,campaignId:access.campaign.id,actorUserId:actor.userId,requestKey:input.idempotencyKey,requestHash,ownerKind:chosen.definition.kind,sourceId:input.sourceId,formId:input.formId,formKey:input.formKey,refreshScope:input.refreshScope,refreshKey:input.refreshKey,afterEntryEventId:last?.id??null,evidence:{reason:input.reason.trim(),definition:chosen.definition}}).returning({id:formUseResetEvent.id});
    await publishCharacterStateInvalidationInTransaction(tx,input.characterId);
    return {eventId:event.id,replayed:false};
  },async tx=>{
    const [prior]=await tx.select().from(formUseResetEvent).where(eq(formUseResetEvent.requestKey,input.idempotencyKey));
    if(!prior)return null;
    if(prior.requestHash!==requestHash)throw new Error('This refresh key was already used for different input.');
    return {eventId:prior.id,replayed:true};
  });
}
export async function completePendingFormTransition(characterId:number,requestId:number,actor:Actor) {
  positive(requestId);
  return protectedTransition(characterId,`completion-${requestId}`,actor,async tx=>{
    const [request]=await tx.select().from(formTransitionRequest).where(and(eq(formTransitionRequest.id,requestId),eq(formTransitionRequest.characterId,characterId)));
    if(!request) throw new Error('Pending Form transition not found.');
    if(request.status!=='pending') return receipt(tx,request,true);
    if(request.encounterId) await reconcilePendingTransitions(tx,request.encounterId);
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

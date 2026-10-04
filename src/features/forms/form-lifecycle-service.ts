import 'server-only';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { db } from '@/db';
import { characterActiveForm, formTransitionEvent, formUseResetEvent } from '@/db/form-runtime-schema';
import { campaignSession, campaignSessionEncounter, campaignSessionScene, campaignSessionSceneMember } from '@/db/tabletop-operations-schema';
import type { EvolutionEncounterContext } from '@/features/evolutions/evolution-execution';
import type { FrozenFormDefinition, FormTransitionEvidence } from './form-runtime';
import type { FormLifecycleContext, FormLimitView, FormReturnDue } from './form-lifecycle';
import { emptyFormTransformation, normalizeFormTransformation } from './form-transformation';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Entry = typeof formTransitionEvent.$inferSelect;
export const emptyFormLifecycleContext = (): FormLifecycleContext => ({sessionId:null,sessionName:null,sceneId:null,sceneName:null,encounterId:null,encounterName:null,round:null,step:null,initiative:null});
function fromEncounter(c: EvolutionEncounterContext): FormLifecycleContext {
  return {sessionId:c.sessionId,sessionName:c.sessionName,sceneId:c.sceneId,sceneName:c.sceneName,encounterId:c.encounterId,encounterName:c.encounterName,round:c.round,step:c.step,initiative:c.currentInitiative};
}
export function entryLifecycleContext(evidence: FormTransitionEvidence): FormLifecycleContext {
  if(evidence.lifecycleContext) return evidence.lifecycleContext;
  // Legacy evidence can prove only the Encounter explicitly selected at entry.
  const context=[...evidence.completionContexts,...evidence.review.encounterContexts].find(c=>c.encounterId===evidence.review.encounterId);
  return context?fromEncounter(context):emptyFormLifecycleContext();
}
export async function readFormLifecycleContext(tx: Tx, characterId: number, selected?: EvolutionEncounterContext | null): Promise<FormLifecycleContext> {
  if(selected) return fromEncounter(selected);
  const scenes=await tx.select({sceneId:campaignSessionScene.id,sceneName:campaignSessionScene.title,sessionId:campaignSession.id,sessionName:campaignSession.title})
    .from(campaignSessionSceneMember).innerJoin(campaignSessionScene,eq(campaignSessionScene.id,campaignSessionSceneMember.sceneId))
    .innerJoin(campaignSession,eq(campaignSession.id,campaignSessionScene.sessionId))
    .where(and(eq(campaignSessionSceneMember.characterId,characterId),eq(campaignSessionScene.status,'active'),eq(campaignSession.status,'active')));
  return {...emptyFormLifecycleContext(),...(scenes.length===1?scenes[0]:{})};
}
export async function readFormReturnDue(tx: Tx, characterId: number, suppliedEntry?: Entry | null): Promise<FormReturnDue | null> {
  const [active]=await tx.select().from(characterActiveForm).where(eq(characterActiveForm.characterId,characterId));
  if(!active)return null;
  if(active.returnDueJson)return active.returnDueJson;
  const entry=suppliedEntry??(await tx.select().from(formTransitionEvent).where(eq(formTransitionEvent.id,active.entryEventId)))[0];
  if(!entry)return null;
  const context=entryLifecycleContext(entry.evidence),mode=entry.evidence.review.transformation.duration.mode;
  const [owner]=mode==='encounter'&&context.encounterId?await tx.select({id:campaignSessionEncounter.id,name:campaignSessionEncounter.title,status:campaignSessionEncounter.status,completedAt:campaignSessionEncounter.completedAt}).from(campaignSessionEncounter).where(eq(campaignSessionEncounter.id,context.encounterId))
    :mode==='scene'&&context.sceneId?await tx.select({id:campaignSessionScene.id,name:campaignSessionScene.title,status:campaignSessionScene.status,completedAt:campaignSessionScene.completedAt}).from(campaignSessionScene).where(eq(campaignSessionScene.id,context.sceneId)):[];
  if(!owner||owner.status!=='completed'||!owner.completedAt)return null;
  const ownerName=(mode==='encounter'?context.encounterName:context.sceneName)??owner.name;
  return {entryEventId:entry.id,kind:mode==='encounter'?'encounter-end':'scene-end',ownerId:owner.id,ownerName,completedAt:owner.completedAt.toISOString(),reason:`The bound ${mode==='encounter'?'Encounter':'Scene'} “${ownerName}” has ended. Return to Normal is due.`};
}
export async function retainFormReturnDue(tx: Tx, characterId: number, due: FormReturnDue) {
  // A reopening cannot erase an expiry already observed at authoritative closeout.
  await tx.update(characterActiveForm).set({returnDueJson:due}).where(and(eq(characterActiveForm.characterId,characterId),eq(characterActiveForm.entryEventId,due.entryEventId),isNull(characterActiveForm.returnDueJson)));
}
export async function readFormLimits(tx:Tx,characterId:number,definition:FrozenFormDefinition,context:FormLifecycleContext):Promise<FormLimitView[]> {
  const transformation=normalizeFormTransformation(definition.form.transformation)??emptyFormTransformation();
  if(transformation.limitMode!=='limited')return [];
  const entries=await tx.select().from(formTransitionEvent).where(and(eq(formTransitionEvent.characterId,characterId),eq(formTransitionEvent.operation,'enter'),eq(formTransitionEvent.ownerKind,definition.kind),eq(formTransitionEvent.formKey,definition.key),
    definition.kind==='race'?and(eq(formTransitionEvent.sourceRaceId,definition.sourceId),eq(formTransitionEvent.raceFormId,definition.formId)):and(eq(formTransitionEvent.sourceCreatureId,definition.sourceId),eq(formTransitionEvent.creatureFormId,definition.formId))));
  const resets=await tx.select().from(formUseResetEvent).where(and(eq(formUseResetEvent.characterId,characterId),eq(formUseResetEvent.ownerKind,definition.kind),eq(formUseResetEvent.sourceId,definition.sourceId),eq(formUseResetEvent.formId,definition.formId),eq(formUseResetEvent.formKey,definition.key))).orderBy(desc(formUseResetEvent.id));
  return transformation.useLimits.map(limit=>{
    const scope=limit.refreshScope,manual=scope==='manual'||scope==='event';
    const reset=manual?resets.find(r=>r.refreshScope===scope&&(scope!=='event'||r.refreshKey===limit.refreshKey)):null;
    const missing=scope==='round'?context.encounterId===null||context.round===null:scope==='encounter'?context.encounterId===null:scope==='scene'?context.sceneId===null:false;
    const applicable=entries.filter(entry=>{
      const c=entryLifecycleContext(entry.evidence);
      return scope==='round'?c.encounterId===context.encounterId&&c.round===context.round:scope==='encounter'?c.encounterId===context.encounterId:scope==='scene'?c.sceneId===context.sceneId:manual?entry.id>(reset?.afterEntryEventId??0):true;
    });
    const uses=applicable.length,remaining=missing?null:Math.max(0,limit.maximumUses-uses);
    const scopeLabel=scope==='never'?'for this individual (never refreshes)':manual?`before the next confirmed ${scope==='event'?`event refresh (${limit.refreshKey})`:'G.O.D. refresh'}`:`in this ${scope}`;
    return {limit,uses,remaining,status:missing?'manual':remaining===0?'exhausted':'available',explanation:missing?`${limit.maximumUses} per ${scope} needs an exact current ${scope} context. G.O.D. review is required.`:
      `${uses} used; ${remaining}/${limit.maximumUses} uses remain ${scopeLabel}.${manual?` ${scope==='event'?'Event':'Manual'} refresh requires explicit Campaign-owning G.O.D. evidence; events and notes never reset uses automatically.${remaining===0?' An authored refresh is required before more uses become available.':!reset?' The initial allowance does not require a refresh receipt.':''}`:''}`};
  });
}

/** Guard new ordinary actions only. Completion, defence and Return retain their existing paths. */
export async function assertFormOrdinaryActionAllowedInTransaction(tx:Tx,characterId:number) {
  if(characterId<=0)return;
  const due=await readFormReturnDue(tx,characterId);
  if(due)throw new Error(`${due.reason} Finish or resolve the authored Return before starting another ordinary action in this Form.`);
}

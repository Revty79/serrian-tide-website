'use client';
import { CharacterFormMechanicsView } from '@/app/characters/character-form-preview';
import { CreatureFormMechanicsView } from '@/app/heavens/npcs/[npcId]/creature-form-preview';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GuidedField } from '@/components/field-guidance';
import { TabletopLiveRefresh } from '@/features/tabletop-operations/tabletop-live-refresh';
import { getCurrentForm, reviewFormTransition, commitFormTransition, finishFormTransition, cancelFormTransition, confirmFormUseRefresh } from '@/app/characters/form-runtime-actions';
import type { FormUseResetCommand } from '@/features/forms/form-runtime-service';
import { FORM_EQUIPMENT_NOTICE } from '@/features/forms/form-equipment-notice';
import { FORM_RUNTIME_NOTICE, type IndividualFormRuntime, type FormRuntimeReview, type FormRuntimeCommand, type FormRuntimeSelection } from '@/features/forms/form-runtime';
import { FormExitSummary, TransformationSummary } from './form-preview';
import { FormAccessSummary } from './form-access-summary';
import { EvolutionEncounterSummary } from '@/app/heavens/evolution-execution-dialog';
import styles from './current-form-panel.module.css';

function FormUseRefreshControls({state,disabled,onChanged}:{state:IndividualFormRuntime;disabled:boolean;onChanged:()=>Promise<void>}) {
  const [selected,setSelected]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const storage=`form-use-refresh:${state.characterId}`;
  // This child mounts only after the client has fetched Current Form.
  const [pending,setPending]=useState<FormUseResetCommand|null>(()=>{try{const saved=typeof window==='undefined'?null:localStorage.getItem(storage);return saved?JSON.parse(saved):null;}catch{return null;}});
  const choices=state.forms.flatMap(({definition})=>(definition.form.transformation?.limitMode==='limited'?definition.form.transformation.useLimits:[]).flatMap((limit,i)=>limit.refreshScope==='manual'||limit.refreshScope==='event'?[{key:`${definition.kind}:${definition.formId}:${i}`,definition,limit}]:[]));
  if(!choices.length&&!pending)return null;
  const choice=choices.find(c=>c.key===selected);
  const submit=async()=>{
    if(!pending&&!choice)return;
    const command=pending??{characterId:state.characterId,sourceId:choice!.definition.sourceId,formId:choice!.definition.formId,formKey:choice!.definition.key,refreshScope:choice!.limit.refreshScope as 'manual'|'event',refreshKey:choice!.limit.refreshKey??null,reason,idempotencyKey:`form-reset-${Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('')}`};
    localStorage.setItem(storage,JSON.stringify(command));setPending(command);setBusy(true);setError('');
    try{await confirmFormUseRefresh(command);localStorage.removeItem(storage);setPending(null);setReason('');await onChanged();}
    catch(e){setError(e instanceof Error?e.message:'The refresh response was lost. Retry this same receipt.');}finally{setBusy(false);}
  };
  return <details><summary>G.O.D. use-limit refresh</summary>
    <p>Record an observed authored manual or event refresh. This cannot waive a round, Encounter, Scene or lifetime limit, or clear a cooldown.</p>
    <GuidedField className="st-field" label="Form refresh" help="Choose the exact Form and its authored refresh scope. The receipt preserves this identity."><select className="st-control" disabled={disabled||busy||!!pending} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose authored refresh</option>{choices.map(c=><option key={c.key} value={c.key}>{c.definition.name}: {c.limit.refreshScope}{c.limit.refreshKey?` (${c.limit.refreshKey})`:''}</option>)}</select></GuidedField>
    <GuidedField className="st-field" label="Refresh evidence" help="Explain which authored refresh occurred and how it was confirmed. This is retained in immutable history."><textarea className="st-control" disabled={disabled||busy||!!pending} rows={3} value={pending?.reason??reason} onChange={e=>setReason(e.target.value)}/></GuidedField>
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    <button type="button" className="st-button" disabled={disabled||busy||!pending&&(!choice||reason.trim().length<3)} onClick={()=>void submit()}>{pending?'Retry confirmed use refresh':'Confirm authored use refresh'}</button>
    {pending?<button type="button" className="st-button" disabled={busy} onClick={()=>{localStorage.removeItem(storage);setPending(null);}}>Dismiss saved refresh request</button>:null}
  </details>;
}

export function CurrentFormPanel({characterId,disabled=false,onChanged}:{characterId:number;disabled?:boolean;onChanged?:()=>Promise<void>|void}) {
  const [state,setState]=useState<IndividualFormRuntime|null>(null),[review,setReview]=useState<FormRuntimeReview|null>(null);
  const [selection,setSelection]=useState<FormRuntimeSelection|null>(null),[pending,setPending]=useState<FormRuntimeCommand|null>(null);
  const [rulings,setRulings]=useState<Record<string,string>>({}),[manualMode,setManualMode]=useState<'instant'|'initiative'>('instant'),[manualCost,setManualCost]=useState('');
  const [confirmedTime,setConfirmedTime]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dialog=useRef<HTMLDialogElement>(null),storage=`form-runtime:${characterId}`;
  const refresh=useCallback(async()=>{try{setState(await getCurrentForm(characterId));}catch(e){setError(e instanceof Error?e.message:'Could not read Current Form.');}},[characterId]);
  useEffect(()=>{
    let active=true;
    getCurrentForm(characterId).then(next=>{
      if(!active)return;
      setState(next);
      try {const saved=localStorage.getItem(storage);setPending(saved?JSON.parse(saved):null);}
      catch {/* A malformed local draft is not authoritative. */}
    }).catch(error=>{if(active)setError(error instanceof Error?error.message:'Could not read Current Form.');});
    return ()=>{active=false;};
  },[characterId,storage]);
  useEffect(()=>{const element=dialog.current;if(!element)return;if(review||pending){if(!element.open){element.showModal();element.querySelector('h3')?.focus({preventScroll:true});element.scrollTop=0;}}else element.close();},[review,pending]);
  const forget=()=>{setPending(null);localStorage.removeItem(storage);};
  const changed=async()=>{await refresh();await onChanged?.();};
  const open=async(next:FormRuntimeSelection)=>{
    setError('');setBusy(true);setSelection(next);setRulings({});setConfirmedTime(false);setManualMode('instant');setManualCost('');
    try{setReview(await reviewFormTransition(next));}catch(e){setError(e instanceof Error?e.message:'Could not review this Form.');}finally{setBusy(false);}
  };
  const submit=async()=>{
    if(!pending&&(!review||!selection))return;
    const command=pending??{...selection!,idempotencyKey:`form-${Array.from(crypto.getRandomValues(new Uint32Array(4)), value=>value.toString(16).padStart(8,'0')).join('')}`,reviewToken:review!.reviewToken,rulings,confirmTime:confirmedTime,...(review!.timing.mode==='manual'?{manualTiming:{mode:manualMode,initiativeCost:manualMode==='initiative'?Number(manualCost):null}}:{})};
    localStorage.setItem(storage,JSON.stringify(command));setPending(command);setBusy(true);setError('');
    try{
      const result=await commitFormTransition(command);
      if(!result.ok){if(!result.retrySameRequest)forget();throw new Error(result.error);}
      forget();setReview(null);setSelection(null);await changed();
    }catch(e){setError(e instanceof Error?e.message:'Response lost. Retry this exact transition to confirm its result.');}finally{setBusy(false);}
  };
  const finish=async(cancel=false)=>{if(!state?.pending)return;setBusy(true);setError('');try{await(cancel?cancelFormTransition:finishFormTransition)(characterId,state.pending.requestId);await changed();}catch(e){setError(e instanceof Error?e.message:'Could not finish the pending transition.');}finally{setBusy(false);}};
  const allowed=!!review&&!review.blockers.length&&(review.authority==='god'||!review.manualSteps.length)&&review.manualSteps.every(s=>(rulings[s.key]?.trim().length??0)>=3)&&(review.timing.mode!=='time-confirm'||confirmedTime);
  return <section className={styles.panel} aria-label="Current Form">
    <h3>Current Form: {state?.current?.evidence.review.definition.name??(state?'Normal':'Loading…')}</h3>
    <p>{FORM_RUNTIME_NOTICE}</p><p>View Form is a detached preview. Preview and print selections never change Current Form.</p>
    {state?.authority==='god'?<TabletopLiveRefresh mode="god" campaignId={state.campaignId} onRefresh={refresh}/>:state?.authority==='player'?<TabletopLiveRefresh mode="player" characterId={characterId} onRefresh={refresh}/>:null}
    <button type="button" className="st-button" disabled={busy} onClick={()=>void refresh()}>Refresh Current Form</button>
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    {state?<div className={styles.card} aria-label="Form lifecycle">
      <h4>{state.lifecycle.due?'Return due':state.current?'Active Form':'Entry lifecycle'}</h4>
      <p>{state.lifecycle.duration}</p>
      {state.current?<FormExitSummary value={state.current.evidence.review.transformation}/>:null}
      {state.lifecycle.context?.sceneId?<p>Bound Scene: {state.lifecycle.context.sceneName} · Session: {state.lifecycle.context.sessionName}.</p>:null}
      {state.lifecycle.context?.encounterId?<p>Bound Encounter: {state.lifecycle.context.encounterName}. Entry round {state.lifecycle.context.round??'not established'}.</p>:null}
      {state.lifecycle.due?<p role="status">{state.lifecycle.due.reason} The current body remains effective until the authored Return completes. New ordinary actions are blocked.</p>:null}
      {state.lifecycle.blockers.map(reason=><p key={reason} role="status">{reason}</p>)}
      {state.lifecycle.manual.map(reason=><p key={reason}>{reason}</p>)}
      {state.lifecycle.limits.map((limit,i)=><p key={i}>{limit.explanation}</p>)}
      {state.lifecycle.triggerCandidates.map(candidate=><p key={candidate.formKey}>{candidate.name}: involuntary trigger {candidate.status}. {candidate.reasons.join(' ')}</p>)}
      {state.authority==='god'?<FormUseRefreshControls key={state.characterId} state={state} disabled={disabled||busy} onChanged={changed}/>:null}
    </div>:null}
    {state?.pending?<div className={styles.card}><p>Pending {state.pending.operation==='enter'?`entry into ${state.pending.name}`:'Return to Normal'}: {state.pending.timingStatus??'preparing'}. Current Form changes only after timing completes at a clean boundary.</p>
      <p>Spent resources and Initiative are retained if cancelled.</p>{state.pending.blockers.map(reason=><p key={reason} role="status">{reason}</p>)}
      {state.authority!=='viewer'?<div className={styles.actions}><button className="st-button" disabled={busy||disabled} onClick={()=>void finish()}>Complete pending transformation</button><button className="st-button" disabled={busy||disabled} onClick={()=>void finish(true)}>Cancel pending transformation</button></div>:null}</div>:null}
    {state?.current&&!state.pending&&state.authority!=='viewer'&&(state.authority==='god'||state.current.evidence.review.transformation.exitMethods.includes('voluntary')||state.lifecycle.due&&state.current.evidence.review.transformation.exitMethods.includes('duration-end'))?<button className="st-button" disabled={busy||disabled||!!pending} onClick={()=>void open({characterId,operation:'return'})}>Review Return to Normal</button>:null}
    {state?.effective ? <details open className={styles.card}><summary>Current effective mechanics</summary>
      <p>Size: {state.effective.kind === 'race' ? state.effective.projection.size : state.effective.projection.definition.core.size}. Existing Initiative position stays unchanged.</p>
      <p>Current Health: {state.effective.health.total.remainingHp ?? "Unknown"} / {state.effective.health.total.maximumHp ?? "Unknown"}. Stored damage: {state.effective.health.total.damage}.</p>
      <p>{FORM_EQUIPMENT_NOTICE}</p>
      <p>Named restrictions and limited speech need G.O.D. review when relevant. Spell names and notes do not establish verbal requirements.</p>
      {state.effective.kind === 'race' ? <CharacterFormMechanicsView current preview={state.effective.projection}/> : <CreatureFormMechanicsView current preview={state.effective.projection}/>}
    </details> : null}
    {state?.current?<details><summary>Frozen transformation rules</summary><TransformationSummary value={state.current.evidence.review.transformation}/></details>:null}
    {!state?.current?state?.forms.map(({definition,access,limits})=><article className={styles.card} key={`${definition.kind}:${definition.sourceId}:${definition.key}`}>
      <h4>{definition.name}</h4><FormAccessSummary evaluation={access} entity={definition.kind==='race'?'Character':'Creature NPC'}/>
      <details><summary>Transformation rules</summary><TransformationSummary value={definition.form.transformation??null}/></details>
      {limits.map((limit,i)=><p key={i}>{limit.explanation}</p>)}
      {definition.form.transformation?.cooldown.trim()?<p>Cooldown requires G.O.D. confirmation: {definition.form.transformation.cooldown}</p>:null}
      <p>Encounter and Scene durations bind at entry. Written duration, cooldown and equipment notes require explicit review.</p>
      {state.authority==='god'||state.authority==='player'&&access.status==='available'&&['voluntary','either'].includes(definition.form.transformation?.entryMethod??'')?<button type="button" className="st-button" disabled={busy||disabled||!!pending||!!state.pending||access.status==='locked'} onClick={()=>void open({characterId,operation:'enter',sourceId:definition.sourceId,formId:definition.formId,formKey:definition.key})}>Review Enter Form: {definition.name}</button>:<p>Entry requires Campaign-owning G.O.D. review or an eligible voluntary Form.</p>}
    </article>):null}
    {state?.history.length?<details><summary>Form transition history ({state.history.length})</summary>{state.history.map(event=><article className={styles.card} key={event.id}>
      <h4>{event.operation==='enter'?`Entered ${event.evidence.review.definition.name}`:`Returned to Normal from ${event.evidence.review.definition.name}`}</h4>
      <p>{new Date(event.executedAt).toLocaleString()} · {event.evidence.authority==='system/lifecycle'?'Automatic lifecycle':event.evidence.authority==='god'?'Campaign-owning G.O.D.':'Owning Player'}{event.evidence.initiatedByUserId?` · ${event.evidence.initiatedByUserId}`:''}</p>
      {event.evidence.lifecycle?<p>{event.evidence.lifecycle.explanation}</p>:null}
      {event.evidence.initiationReason==='god-involuntary'?<p>Involuntary entry authorized by the Campaign-owning G.O.D.</p>:null}
      {event.evidence.equipmentDrops?.map((drop,i)=><p key={i}>Dropped Item #{drop.itemId}{drop.instanceId?`, copy #${drop.instanceId}`:''}: {drop.quantity}. Scene #{drop.sceneId}; custody receipt #{drop.custodyEventId}. Return does not retrieve this equipment.</p>)}
      <p>{event.evidence.review.definition.sourceName}; Form key {event.evidence.review.definition.key}. {event.enteredEventId?`Ends entry #${event.enteredEventId}.`:`Entry #${event.id}.`}</p>
      <p>{event.evidence.review.timing.description}</p>{event.evidence.costsPaid.map((cost,i)=><p key={i}>Spent {cost.amount} {cost.system} Mana.</p>)}
      {Object.entries(event.evidence.command.rulings).map(([key,value])=><p key={key}>G.O.D. ruling: {value}</p>)}
      <EvolutionEncounterSummary contexts={event.evidence.completionContexts} historical operation={event.operation==='return'?'form-return':'form-enter'}/>
    </article>)}</details>:null}
    {state?.useRefreshHistory.length?<details><summary>Form use-refresh history ({state.useRefreshHistory.length})</summary>{state.useRefreshHistory.map(event=><article className={styles.card} key={event.id}><h4>{event.formName}: {event.scope}{event.refreshKey?` (${event.refreshKey})`:''}</h4><p>{event.reason}</p><p>{new Date(event.executedAt).toLocaleString()} · Campaign-owning G.O.D. · {event.actorUserId}</p></article>)}</details>:null}
    <dialog ref={dialog} className={styles.dialog} aria-label="Review Form transition" onCancel={event=>{if(busy||pending)event.preventDefault();else setReview(null);}}>
      <h3 tabIndex={-1}>{review?.operation==='return'?'Return to Normal':`Enter Form${review?`: ${review.definition.name}`:''}`}</h3><p>{FORM_RUNTIME_NOTICE}</p>
      {pending?<p>A confirmed request is awaiting its response. Retrying confirms that exact request without spending twice.</p>:null}
      {review?<><FormAccessSummary evaluation={review.access} entity={review.definition.kind==='race'?'Character':'Creature NPC'}/><EvolutionEncounterSummary contexts={review.encounterContexts} operation={review.operation==='enter'?'form-enter':'form-return'}/>
        {review.encounterContexts.filter(c=>c.encounterStatus==='active').length>1?<GuidedField className="st-field" label="Timing Encounter" help="Choose which active Encounter owns the timing. Every Encounter must still have a clean participant boundary."><select className="st-control" value={selection?.encounterId??''} disabled={busy||!!pending} onChange={e=>void open({...selection!,encounterId:Number(e.target.value)})}><option value="" disabled>Choose Encounter</option>{review.encounterContexts.filter(c=>c.encounterStatus==='active').map(c=><option key={c.encounterId} value={c.encounterId}>{c.encounterName}</option>)}</select></GuidedField>:null}<p>{review.timing.description}</p>{review.costs.map((cost,i)=><p key={i}>{cost.cost.amount} {cost.cost.costType}: {cost.summary}</p>)}
        {review.blockers.map((reason,i)=><p key={i} role="status">{reason}</p>)}{review.warnings.map(w=><p key={w}>{w}</p>)}
        {review.timing.mode==='time-confirm'?<label><input type="checkbox" checked={confirmedTime} disabled={busy||!!pending} onChange={e=>setConfirmedTime(e.target.checked)}/> The authored transformation time has been observed.</label>:null}
        {review.authority==='god'?review.manualSteps.map(step=><GuidedField key={step.key} className="st-field" label={`Ruling: ${step.key}`} help={step.label}><textarea className="st-control" rows={3} disabled={busy||!!pending} value={rulings[step.key]??''} onChange={e=>setRulings({...rulings,[step.key]:e.target.value})}/><span>{step.label}</span></GuidedField>):null}
        {review.authority==='god'&&review.timing.mode==='manual'?<><GuidedField className="st-field" label="Resolved timing" help="Record the timing ruling above, then choose how this reviewed transition will execute. No timing is inferred from descriptive text."><select className="st-control" disabled={busy||!!pending} value={manualMode} onChange={e=>setManualMode(e.target.value as 'instant'|'initiative')}><option value="instant">Complete now at the clean boundary</option>{review.encounterId?<option value="initiative">Use an Initiative action</option>:null}</select></GuidedField>{manualMode==='initiative'?<GuidedField className="st-field" label="Ruled Initiative cost" help="The exact positive Initiative cost authorized for this transition."><input className="st-control" type="number" min="0.01" step="any" disabled={busy||!!pending} value={manualCost} onChange={e=>setManualCost(e.target.value)}/></GuidedField>:null}</>:null}
      </>:null}
      {error?<p role="alert" className={styles.error}>{error}</p>:null}
      <div className={styles.actions}><button className="st-button is-primary" disabled={busy||disabled||(!pending&&!allowed)} onClick={()=>void submit()}>{pending?'Retry confirmed Form transition':review?.operation==='return'?'Confirm Return to Normal':'Confirm Enter Form'}</button>{!pending?<button className="st-button" disabled={busy} onClick={()=>setReview(null)}>Close review</button>:null}</div>
    </dialog>
  </section>;
}

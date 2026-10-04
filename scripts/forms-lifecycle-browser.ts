import assert from 'node:assert/strict';
import path from 'node:path';
import type { Locator, Page } from 'playwright-core';
import type pg from 'pg';
import { db } from '../src/db';
import { emptyFormTransformation, type FormTransformation } from '../src/features/forms/form-transformation';
import { emptyRaceFormMechanics } from '../src/features/races/race-form-mechanics';
import { applyConditionInTransaction } from '../src/features/active-state/active-effects-service';
import { reconcileFormLifecycleInTransaction } from '../src/features/forms/form-runtime-service';
import { forceEndCombatInTransaction } from '../src/features/tabletop-operations/combat-force-end-service';

type Subject={id:number;is_npc:boolean;npc_kind:string;encounter_id:number;god:string};
const instant={mode:'instant' as const,initiativeCost:null,time:'',notes:''};
const transformation=():FormTransformation=>({...emptyFormTransformation(),entryMethod:'voluntary',entryTiming:instant,exitTiming:instant,entryCosts:{mode:'none',costs:[]},exitCosts:{mode:'none',costs:[]},exitMethods:['voluntary','duration-end'],duration:{mode:'persistent',description:''},limitMode:'unlimited'});

/** Retry only the documented transient NOWAIT failure; retain lost-response identity. */
export async function waitForFormCompletion(dialog:Locator) {
  for(let attempt=0;attempt<3;attempt++) {
    try{await dialog.waitFor({state:'hidden',timeout:10_000});return;}
    catch(error){
      if(attempt===2||!await dialog.getByText(/Related state is changing/).count())throw error;
      await dialog.getByRole('button',{name:/^(Retry confirmed Form transition|Confirm Enter Form|Confirm Return to Normal)$/}).click();
    }
  }
}

/** Runs after the accepted Pass 1/2 browser flow, using its isolated fixtures. */
export async function formsLifecycleBrowser({page,combat,pool,base,artifacts}:{page:Page;combat:Page;pool:pg.Pool;base:string;artifacts:string}) {
  assert.equal((await pool.query('select current_database() name')).rows[0].name,'serrian_creature_evolution_dev');
  const subjects=(await pool.query("select c.id,c.is_npc,c.npc_kind,p.encounter_id,ca.created_by_user_id god from campaign_character c join campaign_session_encounter_participant p on p.character_id=c.id join campaign ca on ca.id=c.campaign_id where c.name like 'Forms Runtime Browser %' order by c.id")).rows as Subject[];
  const pc=subjects.find(s=>!s.is_npc)!;
  const panel=page.getByRole('region',{name:'Current Form',exact:true}),dialog=page.getByRole('dialog',{name:'Review Form transition'});
  const go=async(s:Subject)=>{await page.goto(`${base}/heavens/${s.npc_kind==='creature'?'npcs':'characters'}/${s.id}`);await panel.getByRole('heading',{name:/^Current Form:/}).waitFor();};
  const normal=async()=>{await panel.getByRole('button',{name:'Review Return to Normal',exact:true}).click();await dialog.getByRole('button',{name:'Confirm Return to Normal',exact:true}).click();await waitForFormCompletion(dialog);await panel.getByRole('heading',{name:'Current Form: Normal',exact:true}).waitFor();};
  const snapshot=async(name:string)=>{for(const width of [1365,390]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await panel.screenshot({path:path.join(artifacts,`${name}-${width}.png`)});}};
  const addRaceForm=async(s:Subject,name:string,t:FormTransformation,equipment:'race'|'dropped'='race')=>{
    const source=(await pool.query('select race_id from campaign_character_profile where character_id=$1',[s.id])).rows[0].race_id;
    const mechanics=emptyRaceFormMechanics();mechanics.equipment.state=equipment;
    return (await pool.query('insert into race_forms(race_id,key,name,sort_order,mechanics_json,transformation_json) values($1,$2,$3,20,$4,$5) returning id',[source,`lifecycle-${s.id}-${name.toLowerCase().replaceAll(' ','-')}`,name,mechanics,t])).rows[0].id as number;
  };
  await go(pc);await normal();
  for(const subject of subjects){
    const name=`Lifecycle Trigger ${subject.id}`,condition=`Lifecycle signal ${subject.id}`;
    const t={...transformation(),entryMethod:'involuntary' as const,involuntaryTriggers:[{conditionType:'state' as const,conditionKey:`state.condition:${condition}`,operator:'possessed' as const,numericValue:null,textValue:null,notes:'',sortOrder:0}],duration:{mode:'encounter' as const,description:''},limitMode:'limited' as const,useLimits:[{maximumUses:1,refreshScope:'never' as const,refreshKey:null,notes:'',sortOrder:0}],...(!subject.is_npc?{exitCosts:{mode:'unspecified' as const,costs:[]}}:{})};
    if(subject.npc_kind==='creature'){
      const row=(await pool.query('select current_snapshot_json from campaign_creature_npc_profile where character_id=$1',[subject.id])).rows[0];
      const body=typeof row.current_snapshot_json==='string'?JSON.parse(row.current_snapshot_json):row.current_snapshot_json;
      const source=body.forms[0];body.forms.push({...source,id:900031,key:`lifecycle-${subject.id}`,name,transformation:t});
      await pool.query('update campaign_creature_npc_profile set current_snapshot_json=$2 where character_id=$1',[subject.id,JSON.stringify(body)]);
    }else await addRaceForm(subject,name,t);
    await go(subject);const marker=crypto.randomUUID();await page.evaluate(v=>{document.documentElement.dataset.lifecycleMarker=v;},marker);
    await db.transaction(async tx=>{
      await applyConditionInTransaction(tx,{characterId:subject.id,effect:{kind:'condition.apply',name:condition,description:'Exact browser fixture signal',duration:{kind:'until-removed',label:'Until removed'}},source:{kind:'god',id:subject.god,name:'G.O.D. fixture'}});
      await reconcileFormLifecycleInTransaction(tx,{characterIds:[subject.id],cause:'Browser authoritative Condition boundary'});
    });
    await panel.getByRole('heading',{name:`Current Form: ${name}`,exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.lifecycleMarker),marker);
    await panel.getByText('Active Form',{exact:true}).waitFor();await panel.getByText(/^Bound Encounter:/).waitFor();
    await panel.getByText(/^Form transition history \(/).click();await panel.getByText(/Automatic lifecycle/).first().waitFor();await snapshot(`forms-lifecycle-auto-${subject.id}`);
  }
  await go(pc);const marker=crypto.randomUUID();await page.evaluate(v=>{document.documentElement.dataset.lifecycleMarker=v;},marker);
  await db.transaction(tx=>forceEndCombatInTransaction(tx,pc.encounter_id,{userId:pc.god,authority:'god-owner'},'Browser lifecycle closeout'));
  await panel.getByRole('heading',{name:'Return due',exact:true}).waitFor();await panel.getByText(/Resource costs are unspecified/).first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.lifecycleMarker),marker);
  await snapshot('forms-lifecycle-return-due');
  await panel.getByRole('button',{name:'Review Return to Normal',exact:true}).click();assert.equal(await dialog.getByRole('button',{name:'Confirm Return to Normal',exact:true}).isDisabled(),true);
  await dialog.getByLabel('Ruling: costs-unspecified',{exact:true}).fill('The G.O.D. confirms this exit has no additional resource spend.');await dialog.getByRole('button',{name:'Confirm Return to Normal',exact:true}).click();await waitForFormCompletion(dialog);await panel.getByRole('heading',{name:'Current Form: Normal',exact:true}).waitFor();
  for(const subject of subjects.filter(s=>s.is_npc)){
    await go(subject);await panel.getByRole('heading',{name:'Current Form: Normal',exact:true}).waitFor();await panel.getByText(/^Form transition history \(/).click();await panel.getByText(/The bound Encounter.*has ended/).first().waitFor();await snapshot(`forms-lifecycle-auto-return-${subject.id}`);
    const evidence=(await pool.query("select evidence from form_transition_event where character_id=$1 and operation='return' order by id desc limit 1",[subject.id])).rows[0].evidence;assert.equal(evidence.initiator,'system/lifecycle');
  }
  // Refresh is a real owner-authorized server action; exhausted uses cannot be waived in entry review.
  const manual=transformation();manual.limitMode='limited';manual.useLimits=[{maximumUses:1,refreshScope:'manual',refreshKey:null,notes:'Observed rest',sortOrder:0}];
  const refreshId=await addRaceForm(pc,'Lifecycle Manual Refresh',manual);await go(pc);
  await panel.getByRole('button',{name:'Review Enter Form: Lifecycle Manual Refresh',exact:true}).click();await dialog.getByLabel('Ruling: use-limit-0',{exact:true}).fill('The initial authored use is confirmed.');await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).click();await waitForFormCompletion(dialog);await normal();
  await panel.getByRole('button',{name:'Review Enter Form: Lifecycle Manual Refresh',exact:true}).click();await dialog.getByText(/Form use limit exhausted/).waitFor();assert.equal(await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:'Close review',exact:true}).click();
  await panel.getByText('G.O.D. use-limit refresh',{exact:true}).click();await panel.getByLabel('Form refresh',{exact:true}).selectOption(`race:${refreshId}:0`);await panel.getByLabel('Refresh evidence',{exact:true}).fill('The authored rest was observed by the Campaign owner.');await panel.getByRole('button',{name:'Confirm authored use refresh',exact:true}).click();
  await panel.getByText('Form use-refresh history (1)',{exact:true}).click();await panel.getByText('The authored rest was observed by the Campaign owner.',{exact:true}).waitFor();await snapshot('forms-lifecycle-manual-refresh');
  // An active exact copy drops into the surviving Scene and never returns with the body.
  const item=(await pool.query("insert into items(canonical_id,name,catalog_scope,record_type,family,category,credits,price_basis) values('FORMS-LIFECYCLE-BROWSER','Lifecycle worn token','equipment','misc','Gear','Gear',1,'Each') returning id")).rows[0].id;
  await pool.query("insert into item_runtime_profiles(item_id,use_mode,maximum_charges,charges_per_use) values($1,'charges',3,1)",[item]);
  const copy=(await pool.query("insert into campaign_character_item_instance(character_id,item_id,current_charges,equipment_state,unit_cost_credits) values($1,$2,0,'worn',1) returning id",[pc.id,item])).rows[0].id;
  await addRaceForm(pc,'Lifecycle Dropped Gear',transformation(),'dropped');await go(pc);await panel.getByRole('button',{name:'Review Enter Form: Lifecycle Dropped Gear',exact:true}).click();await dialog.getByText(/Lifecycle worn token.*will be dropped at/).waitFor();await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).click();await waitForFormCompletion(dialog);await normal();
  await panel.getByText(/^Form transition history \(/).click();await panel.getByText(new RegExp(`Dropped Item #${item}, copy #${copy}: 1`)).first().waitFor();await snapshot('forms-lifecycle-dropped-history');
  const stored=(await pool.query('select character_id,equipment_state from campaign_character_item_instance where id=$1',[copy])).rows[0];assert.equal(stored.character_id,pc.id);assert.equal(stored.equipment_state,'inactive');
  const custody=(await pool.query('select status,scene_id from inventory_instance_custody where instance_id=$1',[copy])).rows[0];assert.equal(custody.status,'dropped');assert.ok(custody.scene_id);
  assert.equal(await combat.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  console.log('PASS: lifecycle desktop/390px PC, Race NPC and Creature NPC automatic entry; SSE without reload; exact owner display; force-end automatic Return and explicit Return due; G.O.D. exit-cost review; exhausted-use block and immutable refresh receipt; exact worn-copy drop preview/history and no retrieval on Return.');
}

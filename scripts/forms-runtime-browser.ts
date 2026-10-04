import assert from 'node:assert/strict';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import type { BrowserContext, Page } from 'playwright-core';
import type pg from 'pg';
import { APPEARANCE_PRESETS, getAppearanceCssVariables } from '../src/features/appearance/appearance';

export async function formsRuntimeBrowser({page,context,pool,base,password,artifacts}:{page:Page;context:BrowserContext;pool:pg.Pool;base:string;password:string;artifacts:string}) {
 assert.equal((await pool.query('select current_database() name')).rows[0].name,'serrian_creature_evolution_dev');
 const query=async(sql:string,values:unknown[]=[]) => (await pool.query(sql,values)).rows;
 const subjects=await query("select c.*,p.encounter_id,ca.created_by_user_id god from campaign_character c join campaign_session_encounter_participant p on p.character_id=c.id join campaign ca on ca.id=c.campaign_id where c.name like 'Forms Runtime Browser %' order by c.id");assert.equal(subjects.length,3);
 const god=subjects[0].god,player=subjects.find(s=>!s.is_npc)!.player_user_id;
 for(const id of [god,player]) {await pool.query('update "user" set email_verified=true where id=$1',[id]);await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())",[`${id}-credential`,id,await hashPassword(password)]);}
 const login=async(id:string)=>{await context.request.post(`${base}/api/auth/sign-out`,{headers:{Origin:base},data:{}});assert.equal((await context.request.post(`${base}/api/auth/sign-in/email`,{headers:{Origin:base},data:{email:`${id}@example.invalid`,password}})).status(),200);};
 const combat=await context.newPage();combat.setDefaultTimeout(40_000);combat.setDefaultNavigationTimeout(180_000);const errors:string[]=[];combat.on('pageerror',e=>errors.push(e.message));
 const panel=page.getByRole('region',{name:'Current Form',exact:true}),dialog=page.getByRole('dialog',{name:'Review Form transition'});
 try {
  for(const subject of subjects) {
   const creature=subject.npc_kind==='creature',form=creature?'Winged Form':'Runtime Wolf';await login(subject.is_npc?god:player);
   await combat.goto(`${base}/${subject.is_npc?'heavens':'realms'}/tabletop?combat=${subject.encounter_id}${subject.is_npc?'':`&character=${subject.id}`}`);
   const screen=combat.locator('[data-combat-screen]');await screen.getByText('Live',{exact:true}).waitFor();
   if(subject.is_npc){await screen.getByRole('checkbox',{name:'Automatic flow',exact:true}).uncheck();await screen.getByRole('region',{name:'Combatants',exact:true}).getByRole('button',{name:new RegExp(`^${subject.name}`)}).click();}
   await screen.getByRole('navigation',{name:'Combat commands'}).getByRole('button',{name:'Attack',exact:true}).click();const picker=screen.getByRole('combobox',{name:/^Attack source/});await picker.locator('option').filter({hasText:creature?'Young bite':'Young claw'}).waitFor({state:'attached'});
   const marker=crypto.randomUUID();await combat.evaluate(v=>{document.documentElement.dataset.formTestMarker=v;},marker);
   const url=`${base}/${subject.is_npc?'heavens':'realms'}/${creature?'npcs':'characters'}/${subject.id}`;
   for(const width of [1365,390]) {
    await page.setViewportSize({width,height:900});await page.goto(url);await panel.getByRole('heading',{name:'Current Form: Normal',exact:true}).waitFor();
    const preview=page.getByRole('combobox',{name:'View Form',exact:true});if(await preview.count()){const options=await preview.locator('option').all();if(options.length>1)await preview.selectOption({index:1});assert.equal((await query('select * from campaign_character_active_form where character_id=$1',[subject.id])).length,0);}
    if(!subject.is_npc){assert.equal(await panel.getByRole('button',{name:'Review Enter Form: Locked Wolf',exact:true}).count(),0);assert.equal(await panel.getByRole('button',{name:'Review Enter Form: Manual Wolf',exact:true}).count(),0);}
    await panel.getByRole('button',{name:`Review Enter Form: ${form}`,exact:true}).click();await dialog.waitFor();await dialog.getByText(/Current Form governs live mechanics/).first().waitFor();
    const bounds=await dialog.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0&&bounds.y+bounds.height<=901);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const original=await dialog.evaluate(e=>getComputedStyle(e).backgroundColor);await dialog.evaluate((e,variables)=>{for(const [key,value] of Object.entries(variables))(e as HTMLElement).style.setProperty(key,value);},getAppearanceCssVariables(APPEARANCE_PRESETS.classic));assert.notEqual(await dialog.evaluate(e=>getComputedStyle(e).backgroundColor),original);
    await page.screenshot({path:path.join(artifacts,`forms-runtime-${subject.id}-${width}-review.png`)});
    await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).click();await dialog.waitFor({state:'hidden'});await panel.getByRole('heading',{name:`Current Form: ${form}`,exact:true}).waitFor();
    await screen.getByText(new RegExp(`Current Form: ${form}`)).waitFor();assert.equal(await combat.evaluate(()=>document.documentElement.dataset.formTestMarker),marker);await picker.locator('option').filter({hasText:creature?'Form Talons':'Bite'}).waitFor({state:'attached'});assert.equal(await picker.locator('option').filter({hasText:creature?'Young bite':'Young claw'}).count(),0);
    await panel.getByText('Current effective mechanics',{exact:true}).waitFor();await panel.getByRole('region',{name:'Current Attributes',exact:true}).waitFor();await page.screenshot({path:path.join(artifacts,`forms-effective-${subject.id}-${width}.png`)});
    await page.reload();await panel.getByRole('heading',{name:`Current Form: ${form}`,exact:true}).waitFor();
    await panel.getByRole('button',{name:'Review Return to Normal',exact:true}).click();await dialog.getByRole('button',{name:'Confirm Return to Normal',exact:true}).click();await dialog.waitFor({state:'hidden'});await panel.getByRole('heading',{name:'Current Form: Normal',exact:true}).waitFor();
    await screen.getByText(/Current Form: Normal/).waitFor();await picker.locator('option').filter({hasText:creature?'Young bite':'Young claw'}).waitFor({state:'attached'});
    const history=panel.getByText(/^Form transition history \(/);await history.click();await panel.getByRole('heading',{name:`Entered ${form}`,exact:true}).first().waitFor();await panel.getByRole('heading',{name:`Returned to Normal from ${form}`,exact:true}).first().waitFor();await panel.getByText('Clean participant boundary recorded at Return to Normal.',{exact:true}).first().waitFor();await page.screenshot({path:path.join(artifacts,`forms-runtime-${subject.id}-${width}-history.png`)});await history.click();
   }
   assert.equal((await query('select * from form_transition_event where character_id=$1',[subject.id])).length,4);
  }
  const pc=subjects.find(s=>!s.is_npc)!;await login(player);await page.goto(`${base}/realms/characters/${pc.id}`);await panel.getByRole('heading',{name:'Current Form: Normal',exact:true}).waitFor();
  await pool.query("update campaign_session_encounter_initiative_participant set participation_status='active',last_satisfied_step=0 where encounter_id=$1 and character_id=$2",[pc.encounter_id,pc.id]);
  const {db}=await import('../src/db');const integration=await import('../src/features/tabletop-operations/runtime-integration-service');const engine=await import('../src/features/tabletop-operations/initiative-runtime');
  const advance=()=>db.transaction(async tx=>{const current=await integration.lockOwnedEncounterRuntimeInTransaction(tx,pc.encounter_id,god);const before=await integration.loadInitiativeEngineInTransaction(tx,pc.encounter_id);await integration.persistInitiativeEngineInTransaction(tx,current,before,engine.advanceInitiativeToNextEvent(before));});
  await panel.getByRole('button',{name:'Review Enter Form: Timed Wolf',exact:true}).click();await dialog.getByText(/4 Initiative through/).waitFor();await dialog.getByText(/3 mana:/).waitFor();await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).click();await dialog.waitFor({state:'hidden'});await panel.getByText(/Pending entry into Timed Wolf/).waitFor();await page.reload();await panel.getByText(/Pending entry into Timed Wolf/).waitFor();await panel.getByRole('heading',{name:'Current Form: Normal',exact:true}).waitFor();
  await advance();await panel.getByRole('heading',{name:'Current Form: Timed Wolf',exact:true}).waitFor();await panel.getByRole('button',{name:'Review Return to Normal',exact:true}).click();await dialog.getByText(/2 Initiative through/).waitFor();await dialog.getByRole('button',{name:'Confirm Return to Normal',exact:true}).click();await dialog.waitFor({state:'hidden'});await panel.getByText(/Pending Return to Normal/).waitFor();await advance();await panel.getByRole('heading',{name:'Current Form: Normal',exact:true}).waitFor();assert.equal(Number((await query('select mana_spent from campaign_character_active_mana where character_id=$1',[pc.id]))[0].mana_spent),5);
  await login(god);await page.goto(`${base}/heavens/characters/${pc.id}`);await panel.getByRole('heading',{name:'Current Form: Normal',exact:true}).waitFor();
  assert.equal(await panel.getByRole('button',{name:'Review Enter Form: Locked Wolf',exact:true}).isDisabled(),true);
  await panel.getByRole('button',{name:'Review Enter Form: Manual Wolf',exact:true}).click();assert.equal(await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).isDisabled(),true);await dialog.getByLabel('Ruling: access',{exact:true}).fill('The authored ritual was observed.');await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).click();await dialog.waitFor({state:'hidden'});await panel.getByRole('heading',{name:'Current Form: Manual Wolf',exact:true}).waitFor();
  await panel.getByRole('button',{name:'Review Return to Normal',exact:true}).click();await dialog.getByRole('button',{name:'Confirm Return to Normal',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await pool.query('update campaign_session_encounter set frozen_at=now() where id=$1',[pc.encounter_id]);await panel.getByRole('button',{name:'Review Enter Form: Runtime Wolf',exact:true}).click();await dialog.getByText(/frozen for inspection/).first().waitFor();assert.equal(await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});await pool.query('update campaign_session_encounter set frozen_at=null where id=$1',[pc.encounter_id]);
  const historyBeforeRetry=(await query('select id from form_transition_event where character_id=$1',[pc.id])).length;
  // Lose the successful mutation response, retain its exact local command, then retry after a real reload.
  await panel.getByRole('button',{name:'Review Enter Form: Runtime Wolf',exact:true}).click();let lost=false;let delivered!:()=>void;const responseLost=new Promise<void>(resolve=>{delivered=resolve;});
  await page.route('**/*',async route=>{if(!lost&&route.request().method()==='POST'&&route.request().postData()?.includes('idempotencyKey')){lost=true;await route.fetch();await route.abort('failed');delivered();}else await route.continue();});
  await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).click();await responseLost;await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Retry confirmed Form transition'&&!b.disabled));await page.unroute('**/*');await page.reload();await dialog.getByRole('button',{name:'Retry confirmed Form transition',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.ok(lost);assert.equal((await query('select * from form_transition_event where character_id=$1',[pc.id])).length,historyBeforeRetry+1);
  // A G.O.D. can rule on the owning Player's limited grip without choosing a Player action.
  await panel.getByRole('button',{name:'Review Return to Normal',exact:true}).click();await dialog.getByRole('button',{name:'Confirm Return to Normal',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await pool.query("update race_forms set mechanics_json=jsonb_set(jsonb_set(mechanics_json,'{manipulation,state}','\"limited\"'),'{equipment,state}','\"retained\"') where race_id=(select race_id from campaign_character_profile where character_id=$1) and name='Runtime Wolf'",[pc.id]);
  await pool.query('delete from campaign_character_item_equipment_state where character_id=$1',[pc.id]);
  await panel.getByRole('button',{name:'Review Enter Form: Runtime Wolf',exact:true}).click();await dialog.getByRole('button',{name:'Confirm Enter Form',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await combat.setViewportSize({width:390,height:900});await combat.goto(`${base}/heavens/tabletop?combat=${pc.encounter_id}`);
  const godScreen=combat.locator('[data-combat-screen]');await godScreen.getByText('Live',{exact:true}).waitFor();await godScreen.getByRole('checkbox',{name:'Automatic flow',exact:true}).uncheck();
  await godScreen.getByRole('region',{name:'Combatants',exact:true}).getByRole('button',{name:new RegExp(`^${pc.name}`)}).click();await godScreen.getByText('Player source rulings',{exact:true}).click();await godScreen.getByRole('navigation',{name:'Player source rulings'}).getByRole('button',{name:'Weapons',exact:true}).click();
  const weapons=godScreen.getByRole('region',{name:'Combat weapons',exact:true});await weapons.getByRole('combobox',{name:'Melee weapon',exact:true}).selectOption({index:1});
  await weapons.getByLabel(/^Form equipment use ruling/).fill('This exact claw grip can draw and use this weapon.');
  assert.equal(await weapons.getByRole('button',{name:'Draw weapon',exact:true}).isDisabled(),true);
  await weapons.getByRole('button',{name:'Record Form equipment ruling',exact:true}).click();await weapons.getByText(/Form equipment ruling recorded/).waitFor();
  const local=(await query('select local_state_json from campaign_session_encounter_participant where encounter_id=$1 and character_id=$2',[pc.encounter_id,pc.id]))[0].local_state_json;
  assert.equal(local.combatSourceResolutionHistory.at(-1).sourceKind,'weapon');assert.equal(local.combatSourceResolutionHistory.at(-1).recordedByUserId,god);
  assert.ok(local.combatSourceResolutionHistory.at(-1).currentForm.entryEventId);assert.equal(await combat.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await combat.screenshot({path:path.join(artifacts,'forms-equipment-ruling-390.png')});
  assert.deepEqual(errors,[]);console.log('PASS: Forms runtime owning Player PC, GOD Race NPC/Creature NPC; desktop and 390px entry/return/reload; preview read-only; effective Form attack choices and Attribute view; Normal choices restored; live combat identity refresh; shared theme; Locked/manual authority; frozen review; Initiative entry/exit completion across reload; canonical Mana costs; lost-response reload retry; 390px GOD equipment ruling without Player action takeover.');
 }finally{await combat.close();}
}

import assert from 'node:assert/strict';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import type { BrowserContext, Page } from 'playwright-core';
import type pg from 'pg';

/** Runs only inside the existing disposable Evolution browser harness. */
export async function evolutionRuntimeBrowser({page,context,pool,base,password,artifacts}: {page:Page;context:BrowserContext;pool:pg.Pool;base:string;password:string;artifacts:string}) {
  assert.equal((await pool.query('select current_database() name')).rows[0].name,'serrian_creature_evolution_dev');
  const query=async(sql:string,values:unknown[]=[]) => (await pool.query(sql,values)).rows;
  const subjects=await query("select c.*,p.encounter_id from campaign_character c join campaign_session_encounter_participant p on p.character_id=c.id where c.name like 'Evolution Runtime Browser %' order by c.id");
  assert.equal(subjects.length,3);
  const god=subjects[0].player_user_id;
  await pool.query('update "user" set email_verified=true where id=$1',[god]);
  await pool.query("insert into account(id,issuer,account_id,provider_id,user_id,password,updated_at) values($1,'local:credential',$2,'credential',$2,$3,now())",[`${god}-credential`,god,await hashPassword(password)]);
  await context.request.post(`${base}/api/auth/sign-out`,{headers:{Origin:base},data:{}});
  const login=await context.request.post(`${base}/api/auth/sign-in/email`,{headers:{Origin:base},data:{email:`${god}@example.invalid`,password}});
  assert.equal(login.status(),200);
  const combat=await context.newPage(); combat.setDefaultTimeout(40_000); combat.setDefaultNavigationTimeout(180_000);
  const errors:string[]=[]; combat.on('pageerror',error=>errors.push(error.message));
  const panel=page.getByRole('region',{name:'Individual Evolution',exact:true}), dialog=page.getByRole('dialog');
  try {
    for (const subject of subjects) {
      const creature=subject.npc_kind==='creature';
      await combat.goto(`${base}/${subject.is_npc?'heavens':'realms'}/tabletop?combat=${subject.encounter_id}${subject.is_npc?'':`&character=${subject.id}`}`);
      const screen=combat.locator('[data-combat-screen]'); await screen.getByText('Live',{exact:true}).waitFor();
      if(subject.is_npc) {
        await screen.getByRole('checkbox',{name:'Automatic flow',exact:true}).uncheck();
        await screen.getByRole('region',{name:'Combatants',exact:true}).getByRole('button',{name:new RegExp(`^${subject.name}`)}).click();
      }
      await screen.getByRole('navigation',{name:'Combat commands'}).getByRole('button',{name:'Attack',exact:true}).click();
      const picker=screen.getByRole('combobox',{name:/^Attack source/});
      await picker.locator('option').filter({hasText:creature?'Young bite':'Young claw'}).waitFor({state:'attached'});
      const marker=crypto.randomUUID(); await combat.evaluate(value=>{document.documentElement.dataset.evolutionTestMarker=value;},marker);
      await page.setViewportSize({width:subject.is_npc?390:1365,height:1000});
      await page.goto(`${base}/heavens/${creature?'npcs':'characters'}/${subject.id}`);
      await (creature?page.getByRole('button',{name:'Evolution',exact:true}):page.locator('#character-tab-god')).click();
      await panel.getByText('Available now at this Encounter boundary.',{exact:true}).waitFor();
      assert.match(await panel.innerText(),/Build 10 Session/); assert.match(await panel.innerText(),/Current Initiative:/);
      if (!subject.is_npc) {
        await pool.query('update campaign_session_encounter set frozen_at=now() where id=$1',[subject.encounter_id]);
        await panel.getByRole('button',{name:'Refresh Evolution state',exact:true}).click();
        await panel.getByText(/frozen for inspection/).waitFor();
        await panel.getByRole('button',{name:/^Review Evolution/}).first().click();
        await dialog.getByText(/frozen for inspection/).waitFor();
        assert.equal(await dialog.getByRole('button',{name:/^Evolve Evolution/}).isDisabled(),true);
        await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
        await pool.query('update campaign_session_encounter set frozen_at=null where id=$1',[subject.encounter_id]);
        await panel.getByRole('button',{name:'Refresh Evolution state',exact:true}).click();
        await panel.getByText('Available now at this Encounter boundary.',{exact:true}).waitFor();
      }
      const participants=await query('select * from campaign_session_encounter_participant where encounter_id=$1 order by character_id',[subject.encounter_id]);
      const initiative=await query('select * from campaign_session_encounter_initiative_participant where encounter_id=$1 order by character_id',[subject.encounter_id]);
      await panel.getByRole('button',{name:/^Review Evolution/}).first().click();
      await dialog.getByRole('heading',{name:'After Evolution',exact:true}).waitFor();
      await dialog.getByText('Available now at this Encounter boundary.',{exact:true}).waitFor();
      await dialog.getByLabel(/I have reviewed the permanent mechanical/).check();
      if(await dialog.getByLabel(/I confirm replacing/).count()) await dialog.getByLabel(/I confirm replacing/).check();
      await page.screenshot({path:path.join(artifacts,`runtime-${subject.id}-preview.png`)});
      await dialog.getByRole('button',{name:/^Evolve Evolution/}).click(); await dialog.waitFor({state:'hidden'});
      await panel.getByText(new RegExp(`Current ${creature?'Creature':'Race'}: Runtime evolved`)).waitFor();
      await picker.locator('option').filter({hasText:creature?'Evolved bite':'Evolved claw'}).waitFor({state:'attached'});
      assert.equal(await picker.locator('option').filter({hasText:creature?'Young bite':'Young claw'}).count(),0);
      assert.equal(await combat.evaluate(()=>document.documentElement.dataset.evolutionTestMarker),marker,'combat refreshed through live events without navigation or reload');
      assert.deepEqual(await query('select * from campaign_session_encounter_participant where encounter_id=$1 order by character_id',[subject.encounter_id]),participants);
      assert.deepEqual(await query('select * from campaign_session_encounter_initiative_participant where encounter_id=$1 order by character_id',[subject.encounter_id]),initiative);
      await panel.locator('summary').filter({hasText:'Evolution history ('}).click();
      await panel.locator('summary').filter({hasText:'EVOLVED:'}).click();
      await panel.getByText('Clean participant boundary recorded at Evolution.',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await combat.screenshot({path:path.join(artifacts,`runtime-${subject.id}-combat-refreshed.png`)});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: live Evolution from PC, Race NPC and Creature NPC sheets; frozen blocker; destination names and history; desktop/390px; existing combat attack choices refresh through SSE without reload; exact participant and Initiative rows preserved.');
  } finally { await combat.close(); }
}

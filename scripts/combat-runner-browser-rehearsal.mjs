import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import pg from 'pg';
const BASE = process.env.RUNNER_BASE_URL ?? 'http://localhost:3137';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).hostname !== '127.0.0.1' || new URL(databaseUrl).pathname !== '/serrian_runner_dev'
  || !['localhost','127.0.0.1'].includes(new URL(BASE).hostname)) throw new Error('Only an isolated loopback runner rehearsal is allowed.');
const fixture = JSON.parse(await fs.readFile(process.env.RUNNER_FIXTURE_FILE ?? join(tmpdir(),'serrian-runner-fixture.json'), 'utf8'));
const output = process.env.RUNNER_TEST_OUTPUT ?? join(tmpdir(),'serrian-runner-proof');
await fs.mkdir(output,{recursive:true});
const pool = new pg.Pool({ connectionString: databaseUrl });
const browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME || chromium.executablePath(), headless: true, args: ['--no-sandbox'] });
const errors = []; const contexts = []; let god, player;
async function login(email) {
  const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 1000 } }); contexts.push(context);
  const response = await context.request.post('/api/auth/sign-in/email', { data: { email, password: fixture.password }, headers: { Origin: BASE }, timeout: 90000 });
  assert.equal(response.status(),200,await response.text());
  const page = await context.newPage(); page.on('pageerror',(e)=>errors.push(e.message)); page.setDefaultTimeout(45000); return page;
}
const task = (page,kind)=>page.locator(`[data-combat-runner="connected"] [data-task-kind="${kind}"]`);
async function checkDb(query,predicate,label) {
  for(let i=0;i<90;i++){const r=await pool.query(query,[fixture.encounterId]);if(predicate(r.rows))return r.rows;await new Promise(r=>setTimeout(r,500));}
  throw new Error(label);
}
async function click(page,kind,name) {
  const card=task(page,kind); await card.waitFor(); const before=await card.getAttribute('data-task-key');
  await card.getByRole('button',{name,exact:true}).click();
  await page.waitForFunction(({kind,before})=>{const e=document.querySelector('[data-combat-runner="connected"] [data-task-kind="'+kind+'"]');return !e || e.getAttribute('data-task-key')!==before;},{kind,before});
}
try {
  god=await login(fixture.godEmail);player=await login(fixture.playerEmail);
  console.log('AUTHENTICATED: separate GOD and Player browsers');
  await Promise.all([
    god.goto(`${BASE}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}&encounter=${fixture.encounterId}&mode=battle&actor=${fixture.defenderId}`,{timeout:180000}),
    player.goto(`${BASE}/realms/tabletop?character=${fixture.heroId}&mode=battle`,{timeout:180000}),
  ]);
  await task(player,'choose-action').waitFor();await task(god,'choose-action').waitFor();
  await god.screenshot({path:join(output,'god-start.png'),fullPage:true});await player.screenshot({path:join(output,'player-start.png'),fullPage:true});
  console.log('VISIBLE: Initiative and current action controls on both combat screens');
  const damage = async () => (await pool.query('select character_id,total_damage from campaign_character_active_health where character_id=any($1::int[]) order by character_id',[[fixture.heroId,fixture.defenderId]])).rows;
  const beforeDamage=await damage();
  await click(player,'choose-action','Commit attack');
  await god.getByRole('navigation',{name:'Current combat decisions'}).waitFor({state:'detached'});
  await click(god,'choose-action','Commit attack');
  await checkDb('select id from campaign_session_encounter_action_declaration where encounter_id=$1',r=>r.length===2,'Both attacks not committed');
  console.log('DECLARED: simultaneous attacks at 11');
  await click(god,'eligibility','Allow response');await click(god,'eligibility','Allow response');
  await click(god,'choose-response','No Defense');await click(player,'choose-response','No Defense');
  await task(player,'roll-attack').waitFor();await task(god,'roll-attack').waitFor();
  await god.screenshot({path:join(output,'god-roll.png'),fullPage:true});await player.screenshot({path:join(output,'player-roll.png'),fullPage:true});
  console.log('AUTOMATIC: timing reached 7; both exact attack roll cards visible');
  await task(player,'roll-attack').getByLabel('Physical roll',{exact:true}).fill('89');await click(player,'roll-attack','Enter roll');
  await task(god,'roll-attack').getByLabel('Physical roll',{exact:true}).fill('89');await click(god,'roll-attack','Enter roll');
  await checkDb('select status from campaign_session_encounter_effect_plan where encounter_id=$1',r=>r.length===2&&r.every(p=>p.status==='applied'),'Simultaneous results not applied');
  await task(player,'choose-action').waitFor();await task(god,'choose-action').waitFor();
  const rolls=(await pool.query('select roller_character_id,pending_action_id,reaction_id,method,result_total from campaign_session_roll where encounter_id=$1',[fixture.encounterId])).rows;
  assert.equal(rolls.length,2);assert.ok(rolls.every(r=>r.pending_action_id&&r.reaction_id===null&&r.result_total===89));
  const appliedDamage=await damage();
  assert.equal(appliedDamage.length,2);assert.ok(appliedDamage.every((row,i)=>row.total_damage>beforeDamage[i].total_damage));
  console.log('RESOLVED: linked rolls, actual damage applied to both combatants, another action available');
  await player.reload();await god.reload();await task(player,'choose-action').waitFor();await task(god,'choose-action').waitFor();
  assert.equal((await pool.query('select id from campaign_session_encounter_effect_plan where encounter_id=$1',[fixture.encounterId])).rows.length,2);
  assert.deepEqual(await damage(),appliedDamage,'Reload must not apply damage again');
  await click(player,'choose-action','Commit attack');
  await god.getByRole('navigation',{name:'Current combat decisions'}).waitFor({state:'detached'});
  await click(god,'choose-action','Pass this round');
  await task(god,'eligibility').locator('summary').filter({hasText:'Cannot respond'}).click();
  await task(god,'eligibility').getByLabel('Reason',{exact:true}).fill('Passed for this round.');await click(god,'eligibility','Rule ineligible');
  await task(player,'roll-attack').getByLabel('Physical roll',{exact:true}).fill('25');await click(player,'roll-attack','Enter roll');
  await click(player,'choose-action','Pass this round');await click(god,'next-round','Start next round');
  await checkDb('select round_number from campaign_session_encounter_initiative where encounter_id=$1',r=>r[0]?.round_number===2,'Round did not advance');
  const positions=(await pool.query('select current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 order by character_id',[fixture.encounterId])).rows;
  assert.deepEqual(positions.map(p=>p.current_initiative),[14,18]);
  console.log('SECOND ROUND: miss resolved and unused Initiative carried (14,18)');
  await click(god,'choose-action','Commit attack');
  await click(god,'eligibility','Allow response');
  await click(player,'choose-response','No Defense');
  await click(god,'roll-attack','Roll d100');
  const randomRolls=(await pool.query("select pending_action_id,roller_character_id,method,result_total from campaign_session_roll where encounter_id=$1 and method='random'",[fixture.encounterId])).rows;
  assert.equal(randomRolls.length,1);assert.equal(randomRolls[0].roller_character_id,fixture.defenderId);assert.ok(randomRolls[0].pending_action_id);assert.ok(randomRolls[0].result_total>=1&&randomRolls[0].result_total<=100);
  console.log('WEBSITE ROLL: d100 saved to the exact GOD attack, not a general roll');
  await god.getByRole('button',{name:'End encounter',exact:true}).click();await god.getByRole('button',{name:'End encounter anyway',exact:true}).click();
  await checkDb('select status from campaign_session_encounter where id=$1',r=>r[0]?.status==='completed','Encounter did not close');
  console.log('ENDED: independent GOD encounter exit');assert.deepEqual(errors,[]);
  console.log('PASS: complete browser fight; no runtime resets or database writes during play; no browser page errors');
} catch(error) {
  for(const [name,page] of [['god',god],['player',player]])if(page){await page.screenshot({path:join(output,name+'-failure.png'),fullPage:true}).catch(()=>{});console.log(name.toUpperCase()+' SCREEN:',await page.locator('body').innerText().catch(()=>''));}
  console.error(error);process.exitCode=1;
} finally { for(const c of contexts)await c.close();await browser.close();await pool.end(); }

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import pg from 'pg';

const base = process.env.RUNNER_BASE_URL ?? 'http://localhost:3137';
const databaseUrl = new URL(process.env.DATABASE_URL ?? 'http://invalid');
if (databaseUrl.hostname !== '127.0.0.1' || databaseUrl.pathname !== '/serrian_runner_dev'
  || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use an isolated loopback runner fixture only.');
const fixture = JSON.parse(await fs.readFile(process.env.RUNNER_FIXTURE_FILE ?? join(tmpdir(), 'serrian-runner-fixture.json'), 'utf8'));
const output = process.env.RUNNER_TEST_OUTPUT ?? join(tmpdir(), 'serrian-held-proof');
await fs.mkdir(output, { recursive: true });
const pool = new pg.Pool({ connectionString: databaseUrl.toString() });
const browser = await chromium.launch({ executablePath: process.env.SERRIAN_TEST_CHROME || chromium.executablePath(), headless: true, args: ['--no-sandbox'] });
const contexts = [], errors = [];
let god, player;
const task = (page, kind) => page.locator(`[data-combat-runner="connected"] [data-task-kind="${kind}"]`);
async function login(email) {
  const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
  contexts.push(context);
  const response = await context.request.post('/api/auth/sign-in/email', {
    data: { email, password: fixture.password }, headers: { Origin: base }, timeout: 90000,
  });
  assert.equal(response.status(), 200, await response.text());
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
}
async function state() {
  return (await pool.query('select character_id,current_initiative,participation_status from campaign_session_encounter_initiative_participant where encounter_id=$1 order by character_id', [fixture.encounterId])).rows;
}
async function waitForState(predicate, label) {
  for (let n = 0; n < 80; n++) { const value = await state(); if (predicate(value)) return value; await new Promise((resolve) => setTimeout(resolve, 250)); }
  throw new Error(label);
}
try {
  god = await login(fixture.godEmail); player = await login(fixture.playerEmail);
  await Promise.all([
    god.goto(`${base}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}&encounter=${fixture.encounterId}&mode=battle&actor=${fixture.defenderId}`, { timeout: 120000 }),
    player.goto(`${base}/realms/tabletop?character=${fixture.heroId}&mode=battle`, { timeout: 120000 }),
  ]);
  await task(player, 'choose-action').getByRole('button', { name: 'Hold', exact: true }).click();
  await task(player, 'held-action').waitFor();
  assert.equal((await state()).find((row) => row.character_id === fixture.heroId).current_initiative, 11);
  console.log('HOLD: Player still has 11 Initiative and usable action controls');
  await task(god, 'choose-action').getByRole('button', { name: 'Move', exact: true }).click();
  await task(god, 'choose-action').getByLabel('Distance (feet)', { exact: true }).fill('3');
  await task(god, 'choose-action').getByLabel('Move to', { exact: true }).fill('Behind the pillar');
  await task(god, 'choose-action').getByRole('button', { name: 'Begin movement', exact: true }).click();
  await task(god, 'eligibility').getByRole('button', { name: 'Allow response', exact: true }).click();
  await task(player, 'choose-response').getByRole('button', { name: 'Do not intervene', exact: true }).click();
  await task(player, 'held-action').waitFor();
  await task(player, 'held-action').getByRole('button', { name: 'Keep holding', exact: true }).click();
  await player.getByText(/^Still holding\./).waitFor();
  assert.equal((await state()).find((row) => row.character_id === fixture.heroId).current_initiative, 11);
  await god.getByRole('button', { name: 'Continue combat', exact: true }).click();
  await waitForState((rows) => rows.find((row) => row.character_id === fixture.defenderId).current_initiative === 10, 'Movement cost not paid');
  await task(god, 'choose-action').waitFor();
  await task(player, 'held-action').waitFor();
  const rolls = await pool.query('select id from campaign_session_roll where encounter_id=$1', [fixture.encounterId]);
  assert.equal(rolls.rowCount, 0, 'Movement must not request or invent dice');
  assert.equal((await state()).find((row) => row.character_id === fixture.heroId).current_initiative, 11);
  await player.screenshot({ path: join(output, 'holding-after-movement.png'), fullPage: true });
  console.log('RECONSIDER: after GOD movement, Player retains Hold and can change their mind');
  await task(player, 'held-action').getByRole('button', { name: 'Move', exact: true }).click();
  await task(player, 'held-action').getByLabel('Distance (feet)', { exact: true }).fill('3');
  await task(player, 'held-action').getByLabel('Move to', { exact: true }).fill('Step toward the doorway');
  await task(player, 'held-action').getByRole('button', { name: 'Begin movement', exact: true }).click();
  await waitForState((rows) => rows.find((row) => row.character_id === fixture.heroId).participation_status === 'active', 'Player did not act from Hold');
  const held = await pool.query('select locked_snapshot_json from campaign_session_encounter_action_declaration where encounter_id=$1 and actor_character_id=$2', [fixture.encounterId, fixture.heroId]);
  assert.equal(held.rows.length, 1); assert.equal(held.rows[0].locked_snapshot_json.heldIntervention, true);
  const timeline = await pool.query('select timeline_initiative from campaign_session_encounter_initiative where encounter_id=$1', [fixture.encounterId]);
  assert.equal(timeline.rows[0].timeline_initiative, 10, 'Acting from Hold cannot rewind time');
  console.log('PLAYER MOVE: movement commits from retained Initiative without rewinding');
  await god.getByRole('button', { name: 'End encounter', exact: true }).click();
  await god.getByRole('button', { name: 'End encounter anyway', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('PASS: Hold reconsideration and visible movement on separate GOD/Player browsers');
} catch (error) {
  for (const [label, page] of [['god', god], ['player', player]]) if (page) {
    await fs.writeFile(join(output, `${label}-failure.txt`), await page.locator('body').innerText());
    await page.screenshot({ path: join(output, `${label}-failure.png`), fullPage: true });
  }
  console.error(error); process.exitCode = 1;
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close(); await pool.end();
}

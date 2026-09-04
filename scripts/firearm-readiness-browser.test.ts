import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium } from "playwright-core";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the Pass 9 browser test.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing Pass 9 browser fixtures outside a loopback _dev database.");
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.FIREARM_READINESS_BROWSER_PORT ?? 3120);
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DIST_DIRECTORY = ".next-firearm-readiness-browser";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (dirname(TEST_DIST_PATH) !== resolve(process.cwd()) || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY) {
  throw new Error("The isolated Pass 9 browser build directory is unsafe.");
}
const PASSWORD = "Firearm-Readiness-Browser-Only!";
const MARKER = `firearm-readiness-browser-${Date.now()}`;
const GOD_ID = `${MARKER}-god`;

type Fixture = {
  campaignId: number;
  sessionId: number;
  sceneId: number;
  encounterId: number;
  characterId: number;
  firearmItemId: number;
  ammunitionItemId: number;
  itemInstanceId: number;
  godEmail: string;
};

async function one<T extends pg.QueryResultRow>(client: pg.PoolClient, text: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(text, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0];
}

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    const email = `${GOD_ID}@example.invalid`;
    await client.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,'Pass 9 Browser G.O.D.',$2,true,$1,$1)`, [GOD_ID, email]);
    await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${GOD_ID}-credential`, GOD_ID, password]);
    await client.query("insert into user_role (user_id,role) values ($1,'god')", [GOD_ID]);
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,
      starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Isolated Pass 9 browser fixture.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [MARKER, GOD_ID]);
    await client.query("insert into campaign_player (campaign_id,user_id) values ($1,$2)", [campaign.id, GOD_ID]);
    const character = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Browser Firearm Operator') returning id", [campaign.id, GOD_ID]);
    await client.query("insert into campaign_character_profile (character_id) values ($1)", [character.id]);
    const session = await one<{ id: number }>(client, "insert into campaign_session (campaign_id,sequence_number,title,status,started_at) values ($1,1,'Pass 9 Browser Session','active',now()) returning id", [campaign.id]);
    await client.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0)", [session.id, campaign.id, character.id]);
    const scene = await one<{ id: number }>(client, "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,started_at) values ($1,$2,1,'Pass 9 Browser Scene','active',now()) returning id", [session.id, campaign.id]);
    await client.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,0)", [scene.id, session.id, campaign.id, character.id]);
    const encounter = await one<{ id: number }>(client, "insert into campaign_session_encounter (scene_id,session_id,campaign_id,sequence_number,title,encounter_type,status,started_at) values ($1,$2,$3,1,'Pass 9 Browser Encounter','combat','active',now()) returning id", [scene.id, session.id, campaign.id]);
    await client.query("insert into campaign_session_encounter_participant (encounter_id,scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,$5,0)", [encounter.id, scene.id, session.id, campaign.id, character.id]);
    await client.query("insert into campaign_session_encounter_initiative (encounter_id,scene_id,session_id,campaign_id,round_number,step_number,timeline_initiative) values ($1,$2,$3,$4,1,1,20)", [encounter.id, scene.id, session.id, campaign.id]);
    await client.query("insert into campaign_session_encounter_initiative_participant (encounter_id,scene_id,session_id,campaign_id,character_id,normal_total_initiative,current_initiative) values ($1,$2,$3,$4,$5,20,20)", [encounter.id, scene.id, session.id, campaign.id, character.id]);
    const ammunition = await one<{ id: number }>(client, `insert into items (canonical_id,name,catalog_scope,record_type,family,category,price_basis,created_by_user_id,source_system,source_external_id) values ($1,'Browser Exact Cartridge','inventory','Ammunition','Browser','Ammunition','per round',$2,$3,$1) returning id`, [`${MARKER}-AMMO`.toUpperCase(), GOD_ID, MARKER]);
    await client.query("insert into weapon_profiles (item_id,profile_record_type,ammunition_cycling_initiative_modifier,ammunition_recoil_reset_initiative_modifier) values ($1,'Ammunition',0,0)", [ammunition.id]);
    const firearm = await one<{ id: number }>(client, `insert into items (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id,source_system,source_external_id) values ($1,'Browser Service Pistol','equipment','weapon','Weapon','Browser','Firearm','per item',$2,$3,$1) returning id`, [`${MARKER}-FIREARM`.toUpperCase(), GOD_ID, MARKER]);
    const profile = await one<{ id: number }>(client, "insert into weapon_profiles (item_id,profile_record_type,weapon_type,ammunition_item_id,capacity_rounds,readiness_mode,draw_initiative_cost,ready_initiative_cost,reload_initiative_cost,unload_initiative_cost,firing_mode_change_initiative_cost) values ($1,'Weapon','Handgun',$2,6,'draw-is-ready',0,0,0,0,0) returning id", [firearm.id, ammunition.id]);
    await client.query("insert into weapon_firing_modes (weapon_profile_id,name,normalized_name,sort_order,base_cycling_initiative_cost,base_recoil_reset_initiative_cost,delivery_cadence,rounds_per_cadence) values ($1,'Single','single',0,0,0,'per-trigger',1)", [profile.id]);
    const instance = await one<{ id: number }>(client, "insert into campaign_character_item_instance (character_id,item_id,current_charges,equipment_state,unit_cost_credits) values ($1,$2,0,'inactive',100) returning id", [character.id, firearm.id]);
    await client.query("insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits) values ($1,$2,12,2)", [character.id, ammunition.id]);
    await client.query("commit");
    return { campaignId: campaign.id, sessionId: session.id, sceneId: scene.id, encounterId: encounter.id, characterId: character.id, firearmItemId: firearm.id, ammunitionItemId: ammunition.id, itemInstanceId: instance.id, godEmail: email };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(pool: pg.Pool, fixture: Fixture | null): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (fixture) {
      await client.query("delete from campaign_character_firearm_event where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_character_firearm_preparation where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_character_firearm_state where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_encounter_responder_opportunity where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_encounter_action_declaration_event where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_encounter_action_declaration where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_encounter_pending_action_source where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_encounter_pending_action where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_encounter_initiative_participant where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_encounter_initiative where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_encounter_participant where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_encounter where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_scene_member where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_scene where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session_roster where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign_session where campaign_id=$1", [fixture.campaignId]);
      await client.query("delete from campaign where id=$1", [fixture.campaignId]);
      await client.query("delete from items where id=$1", [fixture.firearmItemId]);
      await client.query("delete from items where id=$1", [fixture.ammunitionItemId]);
    }
    await client.query("delete from \"user\" where id=$1", [GOD_ID]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The isolated development server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the Pass 9 browser-test server.");
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  let fixture: Fixture | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    fixture = await seedFixture(pool);
    await rm(TEST_DIST_PATH, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)], {
      cwd: process.cwd(),
      env: { ...process.env, BETTER_AUTH_URL: BASE_URL, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: TEST_DIST_DIRECTORY },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input[name="username"]').fill(fixture.godEmail);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /^Enter$/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    const tabletopUrl = `${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}&encounter=${fixture.encounterId}&firearmCharacter=${fixture.characterId}&firearmInstance=${fixture.itemInstanceId}`;
    await page.goto(tabletopUrl);
    await page.getByRole("button", { name: /^Scenes/ }).click();
    await page.getByRole("button", { name: /^Declarations/ }).click();
    const workspace = page.getByRole("region", { name: "Firearm readiness and ammunition state" });
    await workspace.waitFor();
    assert.match(await workspace.innerText(), /UNINITIALIZED EXACT COPY/);
    assert.match(await workspace.innerText(), /does not roll attacks, consume fired rounds, allocate bullets, or apply damage/i);
    await workspace.getByLabel("Initialization / ruling reason").fill("Browser explicit empty baseline");
    await workspace.getByRole("button", { name: "Initialize exact copy" }).click();
    await workspace.getByText(/Exact firearm runtime was initialized empty and not readied/).waitFor();
    await workspace.getByText("Frozen runtime").waitFor({ timeout: 10_000 });
    assert.match(await workspace.innerText(), /Frozen runtime/i);
    assert.match(await workspace.innerText(), /0 \/ 6/);
    await workspace.getByLabel("Rounds for load / reload").fill("4");
    await workspace.getByRole("button", { name: "Load", exact: true }).click();
    await workspace.getByText(/load was recorded through the existing Initiative action workflow/i).waitFor();
    await workspace.getByText(/4 \/ 6/).waitFor({ timeout: 10_000 });
    assert.match(await workspace.innerText(), /4 \/ 6/);
    assert.match(await workspace.innerText(), /Current inventory[\s\S]*8/i);
    await page.reload();
    await page.getByRole("button", { name: /^Scenes/ }).click();
    await page.getByRole("button", { name: /^Declarations/ }).click();
    const reloaded = page.getByRole("region", { name: "Firearm readiness and ammunition state" });
    await reloaded.waitFor();
    assert.match(await reloaded.innerText(), /4 \/ 6/);
    await reloaded.getByText(/Relevant history/).click();
    assert.match(await reloaded.innerText(), /load-completed/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    const state = await pool.query<{ loaded_rounds: number; quantity: number; events: number }>(`
      select s.loaded_rounds,i.quantity,(select count(*)::int from campaign_character_firearm_event e where e.item_instance_id=s.item_instance_id) events
      from campaign_character_firearm_state s join campaign_character_item i on i.character_id=s.character_id and i.item_id=s.loaded_ammunition_item_id
      where s.item_instance_id=$1
    `, [fixture.itemInstanceId]);
    assert.deepEqual(state.rows[0], { loaded_rounds: 4, quantity: 8, events: 3 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolveStop) => {
        const timeout = setTimeout(resolveStop, 2_000);
        server!.once("exit", () => { clearTimeout(timeout); resolveStop(); });
      });
    }
    await cleanupFixture(pool, fixture).catch((error) => console.error(error));
    await pool.end();
    await rm(TEST_DIST_PATH, { recursive: true, force: true });
  }
}

void main();

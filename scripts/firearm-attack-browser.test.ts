import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium } from "playwright-core";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the Pass 10 browser test.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing Pass 10 browser fixtures outside a loopback _dev database.");
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.FIREARM_ATTACK_BROWSER_PORT ?? 3130);
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DIST_DIRECTORY = ".next-firearm-attack-browser";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (dirname(TEST_DIST_PATH) !== resolve(process.cwd()) || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY) {
  throw new Error("The isolated Pass 10 browser build directory is unsafe.");
}
const PASSWORD = "Firearm-Attack-Browser-Only!";
const MARKER = `firearm-attack-browser-${Date.now()}`;
const GOD_ID = `${MARKER}-god`;

type Fixture = {
  campaignId: number;
  sessionId: number;
  sceneId: number;
  encounterId: number;
  actorId: number;
  targetId: number;
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
    await client.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,'Pass 10 Browser G.O.D.',$2,true,$1,$1)`, [GOD_ID, email]);
    await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${GOD_ID}-credential`, GOD_ID, password]);
    await client.query("insert into user_role (user_id,role) values ($1,'god')", [GOD_ID]);
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,
      starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Isolated Pass 10 browser fixture.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [MARKER, GOD_ID]);
    await client.query("insert into campaign_player (campaign_id,user_id) values ($1,$2)", [campaign.id, GOD_ID]);
    const actor = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Browser Firearm Operator') returning id", [campaign.id, GOD_ID]);
    const target = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode) values ($1,$2,'Browser Persistent Target',true,'race','detailed') returning id", [campaign.id, GOD_ID]);
    await client.query("insert into campaign_character_profile (character_id) values ($1),($2)", [actor.id, target.id]);
    await client.query("insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,'DEX',30),($2,'CON',30)", [actor.id, target.id]);
    await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0)", [target.id]);
    const session = await one<{ id: number }>(client, "insert into campaign_session (campaign_id,sequence_number,title,status,started_at) values ($1,1,'Pass 10 Browser Session','active',now()) returning id", [campaign.id]);
    await client.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0),($1,$2,$4,1)", [session.id, campaign.id, actor.id, target.id]);
    const scene = await one<{ id: number }>(client, "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,started_at) values ($1,$2,1,'Pass 10 Browser Scene','active',now()) returning id", [session.id, campaign.id]);
    await client.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,0),($1,$2,$3,$5,1)", [scene.id, session.id, campaign.id, actor.id, target.id]);
    const encounter = await one<{ id: number }>(client, "insert into campaign_session_encounter (scene_id,session_id,campaign_id,sequence_number,title,encounter_type,status,started_at) values ($1,$2,$3,1,'Pass 10 Browser Encounter','combat','active',now()) returning id", [scene.id, session.id, campaign.id]);
    await client.query("insert into campaign_session_encounter_participant (encounter_id,scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,$5,0),($1,$2,$3,$4,$6,1)", [encounter.id, scene.id, session.id, campaign.id, actor.id, target.id]);
    await client.query("insert into campaign_session_encounter_initiative (encounter_id,scene_id,session_id,campaign_id,round_number,step_number,timeline_initiative) values ($1,$2,$3,$4,1,1,20)", [encounter.id, scene.id, session.id, campaign.id]);
    await client.query("insert into campaign_session_encounter_initiative_participant (encounter_id,scene_id,session_id,campaign_id,character_id,normal_total_initiative,current_initiative) values ($1,$2,$3,$4,$5,20,20),($1,$2,$3,$4,$6,18,18)", [encounter.id, scene.id, session.id, campaign.id, actor.id, target.id]);
    const ammunition = await one<{ id: number }>(client, `insert into items (canonical_id,name,catalog_scope,record_type,family,category,price_basis,created_by_user_id,source_system,source_external_id) values ($1,'Browser Exact Cartridge','inventory','Ammunition','Browser','Ammunition','per round',$2,$3,$1) returning id`, [`${MARKER}-AMMO`.toUpperCase(), GOD_ID, MARKER]);
    const ammunitionProfile = await one<{ id: number }>(client, "insert into weapon_profiles (item_id,profile_record_type,damage,damage_type,ammunition_cycling_initiative_modifier,ammunition_recoil_reset_initiative_modifier) values ($1,'Ammunition','8','Ballistic',0,0) returning id", [ammunition.id]);
    const firearm = await one<{ id: number }>(client, `insert into items (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id,source_system,source_external_id) values ($1,'Browser Service Pistol','equipment','weapon','Weapon','Browser','Firearm','per item',$2,$3,$1) returning id`, [`${MARKER}-FIREARM`.toUpperCase(), GOD_ID, MARKER]);
    const profile = await one<{ id: number }>(client, "insert into weapon_profiles (item_id,profile_record_type,weapon_type,damage_source,ammunition_item_id,range_text,capacity_rounds,readiness_mode,draw_initiative_cost,ready_initiative_cost,reload_initiative_cost,unload_initiative_cost,firing_mode_change_initiative_cost) values ($1,'Weapon','Handgun','Ammunition',$2,'Ranged',6,'draw-is-ready',0,0,0,0,0) returning id", [firearm.id, ammunition.id]);
    const mode = await one<{ id: number }>(client, "insert into weapon_firing_modes (weapon_profile_id,name,normalized_name,sort_order,base_cycling_initiative_cost,base_recoil_reset_initiative_cost,delivery_cadence,rounds_per_cadence) values ($1,'Single','single',0,0,0,'per-trigger',1) returning id", [profile.id]);
    const instance = await one<{ id: number }>(client, "insert into campaign_character_item_instance (character_id,item_id,current_charges,equipment_state,unit_cost_credits) values ($1,$2,0,'wielded',100) returning id", [actor.id, firearm.id]);
    await client.query(`insert into campaign_character_firearm_state (
      item_instance_id,campaign_id,character_id,item_id,weapon_profile_id,selected_firing_mode_id,
      loaded_ammunition_item_id,loaded_ammunition_profile_id,loaded_ammunition_unit_cost_credits,loaded_rounds,
      capacity_rounds,capacity_source,readiness_mode,readiness_mode_source,readied,requires_cycling,requires_recoil_recovery,
      version,initialization_key,initialized_by_user_id,updated_by_user_id
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,2,3,6,'canonical','draw-is-ready','canonical',true,false,false,1,$9,$10,$10)`, [instance.id, campaign.id, actor.id, firearm.id, profile.id, mode.id, ammunition.id, ammunitionProfile.id, `${MARKER}-init`, GOD_ID]);
    await client.query("commit");
    return { campaignId: campaign.id, sessionId: session.id, sceneId: scene.id, encounterId: encounter.id, actorId: actor.id, targetId: target.id, firearmItemId: firearm.id, ammunitionItemId: ammunition.id, itemInstanceId: instance.id, godEmail: email };
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
      for (const statement of [
        "delete from campaign_session_encounter_effect_plan_event where campaign_id=$1",
        "delete from campaign_session_encounter_effect where campaign_id=$1",
        "delete from campaign_session_encounter_firearm_bullet where campaign_id=$1",
        "delete from campaign_session_encounter_firearm_attack_event where campaign_id=$1",
        "delete from campaign_session_encounter_firearm_attack where campaign_id=$1",
        "delete from campaign_session_encounter_effect_plan where campaign_id=$1",
        "delete from campaign_session_roll_amendment where campaign_id=$1",
        "delete from campaign_session_roll where campaign_id=$1",
        "delete from campaign_session_encounter_reaction_event where campaign_id=$1",
        "delete from campaign_session_encounter_reaction where campaign_id=$1",
        "delete from campaign_session_encounter_responder_opportunity where campaign_id=$1",
        "delete from campaign_session_encounter_action_declaration_event where campaign_id=$1",
        "delete from campaign_session_encounter_action_declaration where campaign_id=$1",
        "delete from campaign_session_encounter_pending_action_source where campaign_id=$1",
        "delete from campaign_session_encounter_pending_action where campaign_id=$1",
        "delete from campaign_character_firearm_event where campaign_id=$1",
        "delete from campaign_character_firearm_preparation where campaign_id=$1",
        "delete from campaign_character_firearm_state where campaign_id=$1",
        "delete from campaign_session_encounter_initiative_participant where campaign_id=$1",
        "delete from campaign_session_encounter_initiative where campaign_id=$1",
        "delete from campaign_session_encounter_participant where campaign_id=$1",
        "delete from campaign_session_encounter where campaign_id=$1",
        "delete from campaign_session_scene_member where campaign_id=$1",
        "delete from campaign_session_scene where campaign_id=$1",
        "delete from campaign_session_roster where campaign_id=$1",
        "delete from campaign_session where campaign_id=$1",
        "delete from campaign_character_active_health where character_id in (select id from campaign_character where campaign_id=$1)",
        "delete from campaign_character_attribute where character_id in (select id from campaign_character where campaign_id=$1)",
        "delete from campaign_character_item_instance where character_id in (select id from campaign_character where campaign_id=$1)",
        "delete from campaign_character_profile where character_id in (select id from campaign_character where campaign_id=$1)",
        "delete from campaign_character where campaign_id=$1",
        "delete from campaign_player where campaign_id=$1",
      ]) await client.query(statement, [fixture.campaignId]);
      await client.query("delete from campaign where id=$1", [fixture.campaignId]);
      await client.query("delete from weapon_firing_modes where weapon_profile_id in (select id from weapon_profiles where item_id=any($1::int[]))", [[fixture.firearmItemId, fixture.ammunitionItemId]]);
      await client.query("delete from weapon_profiles where item_id=any($1::int[])", [[fixture.firearmItemId, fixture.ammunitionItemId]]);
      await client.query("delete from items where id=any($1::int[])", [[fixture.firearmItemId, fixture.ammunitionItemId]]);
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
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The isolated development server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the Pass 10 browser-test server.");
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
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
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    const page = await browserContext.newPage();
    await page.goto(`${BASE_URL}/login`);
    await page.locator('input[name="username"]').fill(fixture.godEmail);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /^Enter$/ }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
    const tabletopUrl = `${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}&encounter=${fixture.encounterId}&firearmCharacter=${fixture.actorId}&firearmInstance=${fixture.itemInstanceId}`;
    await page.goto(tabletopUrl);
    await page.getByRole("button", { name: /^Scenes/ }).click();
    await page.getByRole("button", { name: /^Declarations/ }).click();
    const workspace = page.getByRole("region", { name: "Firearm attacks, Aim, Called Shots, and damage" });
    await workspace.waitFor();
    assert.match(await workspace.innerText(), /Browser Firearm Operator: Browser Service Pistol - Single/);
    await workspace.getByLabel("Exact Encounter target").selectOption(String(fixture.targetId));
    await workspace.getByText("One-action G.O.D. governing-source ruling").click();
    await workspace.getByLabel("Use an explicit manual target for this action only").check();
    await workspace.getByLabel("Target label").fill("Browser exact firearm target");
    await workspace.getByLabel("Original target").fill("50");
    await workspace.getByLabel("Required ruling reason").fill("Browser fixture exercises the existing one-action ruling path.");
    await workspace.getByRole("button", { name: "Preview locked mechanics" }).click();
    await workspace.getByText("FROZEN DECLARATION PREVIEW").waitFor();
    assert.match(await workspace.innerText(), /Roll over 50/);
    await workspace.getByRole("button", { name: "Declare from preview" }).click();
    await workspace.getByText(/firearm attack was declared through Initiative/i).waitFor();

    await page.getByRole("button", { name: /^Initiative Tracker/ }).click();
    const initiative = page.getByRole("region", { name: "Initiative Tracker" });
    await initiative.getByRole("button", { name: "Advance to Next Event" }).click();
    await initiative.getByText(/Advanced to the next authoritative Initiative event at 19/).waitFor();
    await page.getByRole("button", { name: /^Declarations/ }).click();
    const refreshedWorkspace = page.getByRole("region", { name: "Firearm attacks, Aim, Called Shots, and damage" });
    const attackCard = refreshedWorkspace.locator(".firearm-attack-card").first();
    await attackCard.getByRole("button", { name: "Fire and record attack Roll" }).click();
    await attackCard.getByText(/trigger was pulled; Roll, ammunition, bullet allocation/i).waitFor();
    await page.reload();
    await page.getByRole("button", { name: /^Scenes/ }).click();
    await page.getByRole("button", { name: /^Declarations/ }).click();
    const persisted = page.getByRole("region", { name: "Firearm attacks, Aim, Called Shots, and damage" }).locator(".firearm-attack-card").first();
    await persisted.getByText(/Roll #/).waitFor();
    assert.match(await persisted.innerText(), /1 consumed \/ 1 declared; before 3, after 2/);
    assert.match(await persisted.innerText(), /\d+ vs 50: (?:success|failure)/);
    assert.match(await persisted.innerText(), /Plan #\d+/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

    const proof = await pool.query<{ attacks: number; rolls: number; rounds: number; plans: number }>(`
      select
        (select count(*)::int from campaign_session_encounter_firearm_attack where campaign_id=$1) attacks,
        (select count(*)::int from campaign_session_roll where campaign_id=$1 and purpose_kind='attack') rolls,
        (select loaded_rounds from campaign_character_firearm_state where item_instance_id=$2) rounds,
        (select count(*)::int from campaign_session_encounter_effect_plan where campaign_id=$1) plans
    `, [fixture.campaignId, fixture.itemInstanceId]);
    assert.deepEqual(proof.rows[0], { attacks: 1, rolls: 1, rounds: 2, plans: 1 });
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
    await writeFile(tsconfigPath, tsconfigBefore);
  }
}

void main();

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the weapon governance browser test.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing weapon governance browser fixtures against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing weapon governance browser fixtures against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.WEAPON_GOVERNANCE_BROWSER_PORT ?? 3116);
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DIST_DIRECTORY = ".next-weapon-governance-browser";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (dirname(TEST_DIST_PATH) !== resolve(process.cwd()) || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY) {
  throw new Error("The isolated weapon governance browser build directory is unsafe.");
}
const PASSWORD = "Weapon-Governance-Browser-Only!";
const MARKER = `weapon-governance-browser-${Date.now()}`;
const GOD_ID = `${MARKER}-god`;
const PLAYER_ID = `${MARKER}-player`;

type Fixture = {
  campaignId: number;
  sessionId: number;
  sceneId: number;
  encounterId: number;
  characterId: number;
  creatureId: number;
  weaponItemId: number;
  rootAllocationId: number;
  godEmail: string;
  playerEmail: string;
  rootName: string;
  endpointName: string;
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
    const users = [
      { id: GOD_ID, name: "Weapon Browser G.O.D.", email: `${GOD_ID}@example.invalid`, username: `${MARKER}-god` },
      { id: PLAYER_ID, name: "Weapon Browser Player", email: `${PLAYER_ID}@example.invalid`, username: `${MARKER}-player` },
    ];
    for (const entry of users) {
      await client.query(
        `insert into "user" (id,name,email,email_verified,username,display_username)
         values ($1,$2,$3,true,$4,$4)`,
        [entry.id, entry.name, entry.email, entry.username],
      );
      await client.query(
        `insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at)
         values ($1,'local:credential',$2,'credential',$2,$3,now())`,
        [`${entry.id}-credential`, entry.id, password],
      );
    }
    await client.query("insert into user_role (user_id,role) values ($1,'god'),($2,'player')", [GOD_ID, PLAYER_ID]);
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,
      max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Isolated Pass 5 browser fixture.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [MARKER, GOD_ID]);
    await client.query(
      "insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false)",
      [campaign.id, GOD_ID, PLAYER_ID],
    );
    const character = await one<{ id: number }>(client,
      "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Browser Sidearm Specialist') returning id",
      [campaign.id, PLAYER_ID],
    );
    await client.query("insert into campaign_character_profile (character_id) values ($1)", [character.id]);
    for (const [key, value] of [["STR", 35], ["DEX", 42], ["CON", 30], ["INT", 30], ["WIS", 30], ["CHR", 30]] as const) {
      await client.query(
        "insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,$3)",
        [character.id, key, value],
      );
    }
    await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0)", [character.id]);

    const weapon = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id,source_system,source_external_id
    ) values ($1,'Browser Service Pistol','equipment','weapon','Weapon','Browser','Handgun','per item',$2,$3,$1) returning id`, [MARKER.toUpperCase(), GOD_ID, MARKER]);
    await client.query("insert into item_runtime_profiles (item_id,use_mode,activation_label) values ($1,'none','Use')", [weapon.id]);
    const profile = await one<{ id: number }>(client,
      "insert into weapon_profiles (item_id,profile_record_type,weapon_type) values ($1,'Weapon','Handgun') returning id",
      [weapon.id],
    );
    await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0)", [campaign.id, weapon.id]);
    const rootName = `Browser Precision Ranged ${MARKER}`;
    const endpointName = `Browser Handgun Mastery ${MARKER}`;
    const root = await one<{ id: number }>(client,
      "insert into skill (name,classification,tier,primary_attribute,created_by_user_id,source_system,source_external_id) values ($1,'standard',1,'DEX',$2,$3,$4) returning id",
      [rootName, GOD_ID, MARKER, `${MARKER}-root`],
    );
    const endpoint = await one<{ id: number }>(client,
      "insert into skill (name,classification,tier,primary_attribute,created_by_user_id,source_system,source_external_id) values ($1,'standard',2,'DEX',$2,$3,$4) returning id",
      [endpointName, GOD_ID, MARKER, `${MARKER}-endpoint`],
    );
    await client.query(
      "insert into skill_relationship (skill_id,related_skill_id,relationship_type,sort_order) values ($1,$2,'parent',0)",
      [endpoint.id, root.id],
    );
    await client.query(`insert into weapon_skill_path_mappings
      (weapon_profile_id,endpoint_skill_id,review_state,notes,sort_order,updated_by_user_id)
      values ($1,$2,'approved','Browser exact canonical route.',0,$3)`, [profile.id, endpoint.id, GOD_ID]);
    const rootAllocation = await one<{ id: number }>(client,
      "insert into campaign_character_skill_allocation (character_id,skill_id,points) values ($1,$2,18) returning id",
      [character.id, root.id],
    );
    await client.query(
      "insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits) values ($1,$2,2,0)",
      [character.id, weapon.id],
    );
    await client.query(
      "insert into campaign_character_item_equipment_state (character_id,item_id,state,quantity) values ($1,$2,'wielded',1)",
      [character.id, weapon.id],
    );
    const session = await one<{ id: number }>(client,
      "insert into campaign_session (campaign_id,sequence_number,title,status,started_at) values ($1,1,'Weapon Governance Browser Session','active',now()) returning id",
      [campaign.id],
    );
    await client.query(
      "insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0)",
      [session.id, campaign.id, character.id],
    );
    const scene = await one<{ id: number }>(client,
      "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,started_at) values ($1,$2,1,'Weapon Governance Browser Scene','active',now()) returning id",
      [session.id, campaign.id],
    );
    await client.query(
      "insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,0)",
      [scene.id, session.id, campaign.id, character.id],
    );
    const creature = await one<{ id: number }>(client, `insert into creatures (
      canonical_id,canonical_name,family,creature_type,size,description,created_by_user_id,source_system
    ) values ($1,'Weapon Governance Target','Browser fixtures','Creature','Medium','An isolated direct Encounter target.',$2,$3) returning id`, [`WGB-${Date.now()}`, GOD_ID, MARKER]);
    const encounter = await one<{ id: number }>(client,
      "insert into campaign_session_encounter (scene_id,session_id,campaign_id,sequence_number,title,status,encounter_type,started_at) values ($1,$2,$3,1,'Weapon Governance Browser Encounter','active','combat',now()) returning id",
      [scene.id, session.id, campaign.id],
    );
    await client.query(`insert into campaign_session_encounter_participant
      (encounter_id,scene_id,session_id,campaign_id,character_id,participant_kind,creature_id,display_label,creature_snapshot_json,local_state_json,sort_order)
      values ($1,$2,$3,$4,$5,'campaign-character',null,'',null,null,0),
             ($1,$2,$3,$4,-1,'creature',$6,'Weapon Governance Target',$7::jsonb,'{}'::jsonb,1)`, [
      encounter.id, scene.id, session.id, campaign.id, character.id, creature.id,
      JSON.stringify({ canonicalId: `WGB-${creature.id}`, canonicalName: "Weapon Governance Target", attacks: [], abilities: [] }),
    ]);
    await client.query(
      "insert into campaign_session_encounter_initiative (encounter_id,scene_id,session_id,campaign_id,timeline_initiative) values ($1,$2,$3,$4,20)",
      [encounter.id, scene.id, session.id, campaign.id],
    );
    await client.query(`insert into campaign_session_encounter_initiative_participant
      (encounter_id,scene_id,session_id,campaign_id,character_id,normal_total_initiative,current_initiative,movement_mode)
      values ($1,$2,$3,$4,$5,20,20,'Walk'),($1,$2,$3,$4,-1,16,16,'Walk')`, [encounter.id, scene.id, session.id, campaign.id, character.id]);
    await client.query("commit");
    return {
      campaignId: campaign.id,
      sessionId: session.id,
      sceneId: scene.id,
      encounterId: encounter.id,
      characterId: character.id,
      creatureId: creature.id,
      weaponItemId: weapon.id,
      rootAllocationId: rootAllocation.id,
      godEmail: users[0]!.email,
      playerEmail: users[1]!.email,
      rootName,
      endpointName,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupMarker(pool: pg.Pool, marker: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const campaignRows = await client.query<{ id: number }>("select id from campaign where name=$1", [marker]);
    const campaignIds = campaignRows.rows.map(({ id }) => id);
    if (campaignIds.length) {
      for (const table of [
        "campaign_session_player_ruling_request_event",
        "campaign_session_player_ruling_request",
        "campaign_session_encounter_effect_plan_event",
        "campaign_session_encounter_effect",
        "campaign_session_encounter_firearm_bullet",
        "campaign_session_encounter_firearm_attack_event",
        "campaign_session_encounter_firearm_attack",
        "campaign_session_encounter_effect_plan",
        "campaign_session_roll_amendment",
        "campaign_session_roll",
        "campaign_session_encounter_responder_opportunity",
        "campaign_session_encounter_reaction_event",
        "campaign_session_encounter_reaction",
        "campaign_session_encounter_action_declaration_event",
        "campaign_session_encounter_action_declaration",
        "campaign_session_encounter_pending_action_source",
        "campaign_session_encounter_pending_action",
        "campaign_character_firearm_event",
        "campaign_character_firearm_preparation",
        "campaign_character_firearm_state",
        "campaign_session_encounter_initiative_participant",
        "campaign_session_encounter_initiative",
        "campaign_session_encounter_participant",
        "campaign_session_encounter",
        "campaign_session_called_check_event",
        "campaign_session_high_low_event",
        "campaign_session_called_check_request",
        "campaign_session_called_check_batch",
        "campaign_session_high_low_request",
        "campaign_session_scene_member",
        "campaign_session_scene",
        "campaign_session_roster",
        "campaign_session",
      ]) await client.query(`delete from ${table} where campaign_id=any($1::int[])`, [campaignIds]);
      await client.query("delete from campaign_character_weapon_override where campaign_id=any($1::int[])", [campaignIds]);
      await client.query("delete from campaign where id=any($1::int[])", [campaignIds]);
    }
    const godId = `${marker}-god`;
    const playerId = `${marker}-player`;
    await client.query("delete from weapon_skill_path_mappings where updated_by_user_id=$1", [godId]);
    await client.query("delete from items where source_system=$1", [marker]);
    await client.query("delete from skill where source_system=$1", [marker]);
    await client.query("delete from creatures where source_system=$1", [marker]);
    await client.query("delete from \"user\" where id=any($1::text[])", [[godId, playerId]]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(pool: pg.Pool): Promise<void> {
  await cleanupMarker(pool, MARKER);
}

async function cleanupStaleFixtures(pool: pg.Pool): Promise<void> {
  const rows = await pool.query<{ name: string }>("select name from campaign where name like 'weapon-governance-browser-%'");
  for (const { name } of rows.rows) await cleanupMarker(pool, name);
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the weapon governance browser-test server.");
}

async function login(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  return page;
}

async function eventually(check: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error(message);
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await cleanupStaleFixtures(pool);
    const fixture = await seedFixture(pool);
    await rm(TEST_DIST_PATH, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BETTER_AUTH_URL: BASE_URL,
        NEXT_TELEMETRY_DISABLED: "1",
        SERRIAN_TEST_NEXT_DIST_DIR: TEST_DIST_DIRECTORY,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const godContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const godPage = await login(godContext, fixture.godEmail);
    const playerPage = await login(playerContext, fixture.playerEmail);

    await godPage.goto(`${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}`);
    await godPage.locator(".tabletop-campaign-context").getByRole("button", { name: "Weapon Governance" }).click();
    await godPage.waitForURL((url) => url.searchParams.get("workspace") === "weapons");
    const governance = godPage.getByRole("region", { name: "G.O.D. Character weapon governance" });
    await governance.waitFor();
    await godPage.getByRole("heading", { name: "Character Weapon Assignments" }).waitFor();
    const initialText = await governance.innerText();
    assert.match(initialText, /Browser Service Pistol/);
    assert.match(initialText, new RegExp(fixture.rootName));
    assert.match(initialText, new RegExp(fixture.endpointName));
    assert.match(initialText, new RegExp(`allocation #${fixture.rootAllocationId}`));
    assert.match(initialText, /deepest owned exact allocation/i);
    assert.match(initialText, /2 owned/);
    assert.equal(await governance.getByRole("link", { name: /Review canonical mapping for everyone in Equipment/ }).getAttribute("href"), "/heavens/equipment");
    assert.equal(await governance.locator("text=This weapon has no approved governing Skill path").count(), 0);

    const persistentSource = governance.getByLabel("Exact source").first();
    const strengthOption = persistentSource.locator("option").filter({ hasText: "STR straight Attribute" });
    const strengthValue = await strengthOption.getAttribute("value");
    assert.ok(strengthValue);
    await persistentSource.selectOption(strengthValue);
    await governance.getByLabel("Required reason").fill("Browser persistent Character exception.");
    await governance.getByRole("button", { name: "Save Persistent Override" }).click();
    await governance.getByText(/Persistent weapon override saved/).waitFor();
    await eventually(async () => /Current target: roll over 65%/.test(await governance.innerText()), "Persistent override did not refresh in G.O.D. Tabletop.");
    assert.equal((await pool.query(
      `select id from campaign_character_weapon_override
       where character_id=$1 and weapon_profile_id=(select id from weapon_profiles where item_id=$2)`,
      [fixture.characterId, fixture.weaponItemId],
    )).rowCount, 1);

    await playerPage.goto(`${BASE_URL}/realms/tabletop?character=${fixture.characterId}`);
    const playerPanel = playerPage.getByRole("region", { name: "Melee and authored weapons" });
    await playerPanel.waitFor();
    assert.match(await playerPanel.innerText(), /Character fallback: STR straight Attribute.*65%/);
    assert.match(await playerPanel.innerText(), /Roll over 65%/);
    const playerGovernanceText = await playerPanel.innerText();
    const pathStart = playerGovernanceText.indexOf("Global canonical path:");
    const rootPosition = playerGovernanceText.indexOf(fixture.rootName, pathStart);
    const endpointPosition = playerGovernanceText.indexOf(fixture.endpointName, rootPosition);
    assert.ok(pathStart >= 0 && rootPosition > pathStart && endpointPosition > rootPosition);
    assert.equal(await playerPanel.getByLabel("Exact source").count(), 0);
    assert.equal(await playerPanel.getByLabel("Source type").count(), 0);
    assert.equal(await playerPanel.getByRole("button", { name: /Override|ruling/i }).count(), 0);
    assert.equal(await playerPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

    const playerForbidden = await playerContext.newPage();
    await playerForbidden.goto(`${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&workspace=weapons`);
    await playerForbidden.waitForURL((url) => url.pathname === "/access");
    assert.equal(await playerForbidden.getByRole("region", { name: "G.O.D. Character weapon governance" }).count(), 0);
    await playerForbidden.close();

    await governance.getByLabel("Source type").selectOption("manual");
    await governance.getByLabel("Manual label").fill("Browser one-action ruling");
    await governance.getByLabel("Manual roll-over target").fill("37");
    await governance.getByLabel("Required one-action reason").fill("Browser one-action only.");
    await governance.getByRole("button", { name: "Preview One-Action Ruling" }).click();
    await governance.getByText(/One-action ruling previewed/).waitFor();
    assert.match(await governance.innerText(), /Roll over 37%/);
    assert.equal((await pool.query("select id from campaign_session_roll where campaign_id=$1", [fixture.campaignId])).rowCount, 0);
    await governance.getByRole("button", { name: "Prepare This Roll" }).click();
    const tray = governance.getByRole("region", { name: "Shared Serrian Tide Roll Tray" });
    await tray.waitFor();
    assert.match(await tray.innerText(), /Browser one-action ruling/);
    assert.match(await tray.innerText(), /Original roll-over target: 37%/);
    await tray.getByRole("button", { name: "Enter Physical" }).click();
    await tray.getByLabel("Result").fill("61");
    await tray.getByLabel("Bonuses").fill("Explicit browser bonus: 5");
    await tray.getByLabel("Penalties").fill("Explicit browser penalty: 2");
    assert.match(await tray.innerText(), /37 - 5 \+ 2 = 34/);
    await tray.getByRole("button", { name: "RECORD PHYSICAL ROLL" }).click();
    await governance.getByText(/immutable weapon-governance snapshot/).waitFor();
    assert.equal(await governance.getByRole("region", { name: "Shared Serrian Tide Roll Tray" }).count(), 0);
    const recorded = await pool.query<{ result_total: number; mechanical_snapshot: {
      governingSource: { kind: string; label: string; originalTarget: number };
      modifiers: Array<{ kind: string; label: string; magnitude: number }>;
      resolution: { finalTarget: number };
    } }>("select result_total,mechanical_snapshot from campaign_session_roll where campaign_id=$1", [fixture.campaignId]);
    assert.equal(recorded.rows.length, 1);
    assert.equal(recorded.rows[0]?.result_total, 61);
    assert.deepEqual(recorded.rows[0]?.mechanical_snapshot.governingSource, {
      kind: "manual",
      label: "Browser one-action ruling",
      originalTarget: 37,
    });
    assert.equal(recorded.rows[0]?.mechanical_snapshot.resolution.finalTarget, 34);

    await governance.getByRole("button", { name: "Remove Override" }).click();
    await governance.getByText(/Persistent weapon override removed/).waitFor();
    await eventually(async () => /Normal governance/.test(await governance.innerText()), "Normal resolution did not return after override removal.");
    assert.equal((await pool.query(
      `select id from campaign_character_weapon_override
       where character_id=$1 and weapon_profile_id=(select id from weapon_profiles where item_id=$2)`,
      [fixture.characterId, fixture.weaponItemId],
    )).rowCount, 0);
    await playerPage.reload();
    await playerPanel.waitFor();
    assert.match(await playerPanel.innerText(), new RegExp(`Character fallback: ${fixture.rootName}`));
    assert.doesNotMatch(await playerPanel.innerText(), /Roll over 65%/);
    await godPage.setViewportSize({ width: 390, height: 844 });
    assert.equal(await godPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

    await Promise.all([godContext.close(), playerContext.close()]);
    console.log(JSON.stringify({
      passed: true,
      verified: [
        "G.O.D. Tabletop placement",
        "read-only canonical route",
        "deepest exact allocation explanation",
        "persistent override create and remove",
        "Player read-only assignment and authorization",
        "one-action preview and explicit Roll",
        "physical Roll immutable snapshot and modifiers",
        "responsive G.O.D. and Player surfaces",
      ],
    }, null, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolveStop) => {
        const timeout = setTimeout(resolveStop, 2_000);
        server!.once("exit", () => {
          clearTimeout(timeout);
          resolveStop();
        });
      });
    }
    await cleanupFixture(pool).catch((error) => console.error("Weapon governance browser fixture cleanup failed.", error));
    await pool.end();
    await rm(TEST_DIST_PATH, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main();

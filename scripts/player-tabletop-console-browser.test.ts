import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium, type Page } from "playwright-core";

import { runCalledCheckBrowserWorkflow } from "./called-check-browser-harness";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the Pass 12 browser workflow.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing Pass 12 browser fixtures outside a loopback _dev database.");
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = "Pass12-Browser-Only!";
const PORT = 3133;
const BASE_URL = `http://localhost:${PORT}`;
const DIST_DIRECTORY = ".next-player-tabletop-browser";

type Fixture = {
  marker: string;
  godId: string;
  playerId: string;
  otherId: string;
  campaignIds: number[];
  activeCampaignId: number;
  activeSessionId: number;
  activeSceneId: number;
  activeCharacterId: number;
  unrosteredCharacterId: number;
  waitingCharacterId: number;
  otherCharacterId: number;
  itemId: number;
  email: string;
};

async function one<T extends pg.QueryResultRow>(client: pg.PoolClient, text: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(text, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

async function addCharacter(client: pg.PoolClient, campaignId: number, playerId: string, name: string): Promise<number> {
  const character = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,$3) returning id", [campaignId, playerId, name]);
  await client.query("insert into campaign_character_profile (character_id,hp_multiplier_steps,base_magic_steps) values ($1,0,0)", [character.id]);
  await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,2)", [character.id]);
  for (const [key, value] of [["CON", 30], ["DEX", 35]] as const) {
    await client.query("insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,$3)", [character.id, key, value]);
  }
  return character.id;
}

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  const marker = `pass12-browser-${Date.now()}`;
  const godId = `${marker}-god`;
  const playerId = `${marker}-player`;
  const otherId = `${marker}-other`;
  const email = `${playerId}@example.invalid`;
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    for (const entry of [
      { id: godId, name: "Pass 12 Browser G.O.D.", role: "god" },
      { id: playerId, name: "Pass 12 Browser Player", role: "player" },
      { id: otherId, name: "Pass 12 Other Player", role: "player" },
    ]) {
      const userEmail = `${entry.id}@example.invalid`;
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$1,$1)`, [entry.id, entry.name, userEmail]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${entry.id}-credential`, entry.id, password]);
      await client.query("insert into user_role (user_id,role) values ($1,$2)", [entry.id, entry.role]);
    }
    const activeCampaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,
      starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'The browser-visible active Campaign overview.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [`${marker} Active Campaign`, godId]);
    const waitingCampaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,
      starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'The browser-visible waiting Campaign overview.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [`${marker} Waiting Campaign`, godId]);
    for (const campaignId of [activeCampaign.id, waitingCampaign.id]) {
      await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false)", [campaignId, godId, playerId]);
    }
    await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,false)", [activeCampaign.id, otherId]);

    const activeCharacterId = await addCharacter(client, activeCampaign.id, playerId, "Active Browser Hero");
    const unrosteredCharacterId = await addCharacter(client, activeCampaign.id, playerId, "Unrostered Browser Hero");
    const waitingCharacterId = await addCharacter(client, waitingCampaign.id, playerId, "Waiting Browser Hero");
    const otherCharacterId = await addCharacter(client, activeCampaign.id, otherId, "Other Player Secret Hero");

    const session = await one<{ id: number }>(client, "insert into campaign_session (campaign_id,sequence_number,title,status,started_at) values ($1,1,'Browser Active Session','active',now()) returning id", [activeCampaign.id]);
    await client.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0)", [session.id, activeCampaign.id, activeCharacterId]);
    const scene = await one<{ id: number }>(client, "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,description,status,started_at,god_notes) values ($1,$2,1,'Lantern Quay','A public quay under violet rain.','active',now(),'PRIVATE PLAN') returning id", [session.id, activeCampaign.id]);
    await client.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,0)", [scene.id, session.id, activeCampaign.id, activeCharacterId]);
    await client.query(`insert into campaign_character_active_condition (
      character_id,name,description,source_kind,source_id,source_name,duration_kind,duration_label
    ) values ($1,'Salt-Blind','Eyes sting in the sea wind.','god','pass12-browser','Table ruling','scene','Current Scene')`, [activeCharacterId]);

    const item = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,price_basis,is_magical,created_by_user_id
    ) values ($1,'Pass 12 Tonic','inventory',null,'Consumable','Aid','Tonic','A measured restorative.','Each',false,$2) returning id`, [`PASS12-${Date.now()}`, godId]);
    await client.query("insert into item_runtime_profiles (item_id,use_mode,quantity_per_use,activation_label) values ($1,'consume-item',1,'Drink')", [item.id]);
    await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0)", [activeCampaign.id, item.id]);
    await client.query("insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits) values ($1,$2,2,1)", [activeCharacterId, item.id]);
    await client.query("commit");
    return {
      marker,
      godId,
      playerId,
      otherId,
      campaignIds: [activeCampaign.id, waitingCampaign.id],
      activeCampaignId: activeCampaign.id,
      activeSessionId: session.id,
      activeSceneId: scene.id,
      activeCharacterId,
      unrosteredCharacterId,
      waitingCharacterId,
      otherCharacterId,
      itemId: item.id,
      email,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(pool: pg.Pool, fixture: Fixture | null): Promise<void> {
  if (!fixture) return;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from campaign_session_called_check_event where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session_high_low_event where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session_called_check_request where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session_called_check_batch where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session_high_low_request where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session_roll_amendment where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session_roll where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session_scene_member where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session_scene where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session_roster where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign_session where campaign_id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from campaign where id=any($1::int[])", [fixture.campaignIds]);
    await client.query("delete from items where id=$1", [fixture.itemId]);
    await client.query(`delete from "user" where id=any($1::text[])`, [[fixture.godId, fixture.playerId, fixture.otherId]]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupStaleFixtures(pool: pg.Pool): Promise<void> {
  const campaigns = await pool.query<{ id: number }>("select id from campaign where name like 'pass12-browser-%'");
  const campaignIds = campaigns.rows.map(({ id }) => id);
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (campaignIds.length) {
      for (const table of [
        "campaign_session_called_check_event",
        "campaign_session_high_low_event",
        "campaign_session_called_check_request",
        "campaign_session_called_check_batch",
        "campaign_session_high_low_request",
        "campaign_session_roll_amendment",
        "campaign_session_roll",
        "campaign_session_scene_member",
        "campaign_session_scene",
        "campaign_session_roster",
        "campaign_session",
      ]) await client.query(`delete from ${table} where campaign_id=any($1::int[])`, [campaignIds]);
      await client.query("delete from campaign where id=any($1::int[])", [campaignIds]);
    }
    await client.query("delete from items where canonical_id like 'PASS12-%'");
    await client.query(`delete from "user" where id like 'pass12-browser-%'`);
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
    } catch { /* server still starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the Pass 12 browser-test server.");
}

async function eventually(check: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await check()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 125));
  }
  throw new Error(message);
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

async function runConsoleWorkflows(page: Page, fixture: Fixture, pool: pg.Pool): Promise<void> {
  // 1. Multiple Characters require explicit selection and Campaign identity is visible.
  await page.goto(`${BASE_URL}/realms/tabletop`);
  await page.getByRole("heading", { name: "Choose your Character" }).waitFor();
  assert.equal(await page.getByText("Active Browser Hero", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Waiting Browser Hero", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Other Player Secret Hero", { exact: true }).count(), 0);

  // 2. No-active-Session state retains persistent Character and Campaign information.
  await page.goto(`${BASE_URL}/realms/tabletop?character=${fixture.waitingCharacterId}`);
  await page.getByRole("heading", { name: "Waiting Browser Hero", level: 1 }).waitFor();
  assert.match(await page.locator("main").innerText(), /Waiting for an active Session/);
  assert.match(await page.locator("main").innerText(), /No active Session/);

  // 3. Active but unrostered state cannot use live Session mechanics.
  await page.goto(`${BASE_URL}/realms/tabletop?character=${fixture.unrosteredCharacterId}`);
  assert.match(await page.locator("main").innerText(), /Session active · not rostered/);
  assert.equal(await page.getByRole("button", { name: "Roll percentile" }).isDisabled(), true);

  // 4. Rostered state includes the exact active Scene and Active State.
  await page.goto(`${BASE_URL}/realms/tabletop?character=${fixture.activeCharacterId}`);
  await page.getByRole("heading", { name: "Active Browser Hero", level: 1 }).waitFor();
  assert.match(await page.locator("main").innerText(), /Browser Active Session/);
  assert.match(await page.locator("main").innerText(), /Lantern Quay/);
  assert.match(await page.locator("main").innerText(), /Salt-Blind/);
  assert.equal((await page.locator("main").innerText()).includes("PRIVATE PLAN"), false);

  // 5. Item, Spell, and Derived Ability areas present exact owned or explicit empty state.
  assert.match(await page.getByRole("region", { name: "Items & equipment" }).innerText(), /Pass 12 Tonic/);
  assert.match(await page.getByRole("region", { name: "Spells" }).innerText(), /No known or personal Spells/);
  assert.match(await page.getByRole("region", { name: "Possessed abilities" }).innerText(), /No Derived Abilities/);

  // 6. General Rolls use the Roll ledger and remain visibly separate from requests.
  await page.getByRole("button", { name: "Roll percentile" }).click();
  await page.getByText(/Roll recorded: \d+\./).waitFor();
  await eventually(async () => await page.getByRole("region", { name: "History" }).getByText(/General percentile Roll/).count() === 1, "General Roll did not enter bounded history.");

  // 7. Live Active State invalidation reloads authoritative Health and Conditions.
  await pool.query("update campaign_character_active_health set total_damage=4,updated_at=now() where character_id=$1", [fixture.activeCharacterId]);
  await pool.query(`insert into campaign_character_active_condition (
    character_id,name,description,source_kind,source_id,source_name,duration_kind,duration_label
  ) values ($1,'Rain-Chilled','Cold settles in.','god','pass12-live','Live table','until-removed','Until Removed')`, [fixture.activeCharacterId]);
  await pool.query("select pg_notify('serrian_tide_tabletop',$1)", [JSON.stringify({
    campaignId: fixture.activeCampaignId,
    sessionId: fixture.activeSessionId,
    sceneId: fixture.activeSceneId,
    encounterId: null,
    characterIds: [fixture.activeCharacterId],
    category: "character-state",
  })]);
  await eventually(async () => (await page.locator("main").innerText()).includes("4 damage") && (await page.getByText("Rain-Chilled", { exact: true }).count()) === 1, "Live Character state did not refresh.");

  // 8. Reconnect/navigation recovery comes from a fresh authoritative server read.
  await page.reload();
  assert.equal(await page.getByText("Rain-Chilled", { exact: true }).count(), 1);
  assert.match(await page.locator("main").innerText(), /4 damage/);

  // 9. An unauthorized Character URL resolves to a generic safe selection state.
  await page.goto(`${BASE_URL}/realms/tabletop?character=${fixture.otherCharacterId}`);
  await page.getByRole("heading", { name: "Choose your Character" }).waitFor();
  assert.match(await page.locator("main").innerText(), /That Character is unavailable/);
  assert.equal(await page.getByText("Other Player Secret Hero", { exact: true }).count(), 0);

  // 10. Desktop layout has no document-level horizontal overflow.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE_URL}/realms/tabletop?character=${fixture.activeCharacterId}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  const brand = page.getByRole("link", { name: "Return to the Realms", exact: true });
  await brand.waitFor();
  assert.match(await brand.innerText(), /SERRIAN\s+TIDE/);
  const heroSurface = await page.locator("header").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { backdrop: style.backdropFilter, radius: style.borderRadius };
  });
  assert.notEqual(heroSurface.backdrop, "none");
  assert.notEqual(heroSurface.radius, "0px");

  // 11. Narrow phone layout has touch controls and no document-level overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  const rollButtonBox = await page.getByRole("button", { name: "Roll percentile" }).boundingBox();
  assert.ok(rollButtonBox && rollButtonBox.height >= 44);
  const brandBox = await brand.boundingBox();
  assert.ok(brandBox && brandBox.width <= 390);

  // 12. Keyboard and screen-reader landmarks remain operable at the phone breakpoint.
  assert.equal(await page.getByRole("main").count(), 1);
  assert.equal(await page.getByRole("region", { name: "General Rolls" }).count(), 1);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement !== document.body), true);
}

async function main(): Promise<void> {
  const distPath = resolve(process.cwd(), DIST_DIRECTORY);
  if (dirname(distPath) !== resolve(process.cwd()) || basename(distPath) !== DIST_DIRECTORY) {
    throw new Error("The isolated Pass 12 browser build directory is unsafe.");
  }
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  const pool = new pg.Pool({ connectionString });
  let fixture: Fixture | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await cleanupStaleFixtures(pool);
    fixture = await seedFixture(pool);
    await rm(distPath, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)], {
      cwd: process.cwd(),
      env: { ...process.env, BETTER_AUTH_URL: BASE_URL, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: DIST_DIRECTORY },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await login(page, fixture.email);
    await runConsoleWorkflows(page, fixture, pool);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise<void>((resolveStop) => {
        const timeout = setTimeout(resolveStop, 2_000);
        server!.once("exit", () => { clearTimeout(timeout); resolveStop(); });
      });
    }
    try {
      await cleanupFixture(pool, fixture);
    } finally {
      await pool.end();
      await rm(distPath, { recursive: true, force: true });
      await writeFile(tsconfigPath, tsconfigBefore);
    }
  }

  // Re-run the accepted Pass 11 live request surface through the consolidated route.
  await runCalledCheckBrowserWorkflow("player");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

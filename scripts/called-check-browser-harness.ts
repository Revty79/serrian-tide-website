import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the Pass 11 browser workflow.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing Pass 11 browser fixtures outside a loopback _dev database.");
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PASSWORD = "Pass11-Browser-Only!";

type WorkflowMode = "god" | "player";
type Fixture = {
  marker: string;
  godId: string;
  playerId: string;
  campaignId: number;
  sessionId: number;
  characterId: number;
  npcId: number;
  godEmail: string;
  playerEmail: string;
};

async function one<T extends pg.QueryResultRow>(client: pg.PoolClient, text: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(text, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

async function seedFixture(pool: pg.Pool, mode: WorkflowMode): Promise<Fixture> {
  const client = await pool.connect();
  const marker = `pass11-${mode}-browser-${Date.now()}`;
  const godId = `${marker}-god`;
  const playerId = `${marker}-player`;
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    const godEmail = `${godId}@example.invalid`;
    const playerEmail = `${playerId}@example.invalid`;
    for (const entry of [{ id: godId, name: "Pass 11 Browser G.O.D.", email: godEmail }, { id: playerId, name: "Pass 11 Browser Player", email: playerEmail }]) {
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$1,$1)`, [entry.id, entry.name, entry.email]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${entry.id}-credential`, entry.id, password]);
    }
    await client.query("insert into user_role (user_id,role) values ($1,'god'),($2,'player')", [godId, playerId]);
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,
      starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Pass 11 isolated browser fixture.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [marker, godId]);
    await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false)", [campaign.id, godId, playerId]);
    const character = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Persistent Browser Hero') returning id", [campaign.id, playerId]);
    const npc = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name,is_npc,npc_kind) values ($1,$2,'Persistent Browser NPC',true,'race') returning id", [campaign.id, godId]);
    for (const id of [character.id, npc.id]) {
      await client.query("insert into campaign_character_profile (character_id,hp_multiplier_steps,base_magic_steps) values ($1,0,0)", [id]);
      await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0)", [id]);
      for (const [key, value] of [["STR", 30], ["DEX", 40], ["CON", 35], ["INT", 25], ["WIS", 45], ["CHR", 20]] as const) {
        await client.query("insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,$3)", [id, key, value]);
      }
    }
    const session = await one<{ id: number }>(client, "insert into campaign_session (campaign_id,sequence_number,title,status,started_at) values ($1,1,'Pass 11 Browser Session','active',now()) returning id", [campaign.id]);
    await client.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0),($1,$2,$4,1)", [session.id, campaign.id, character.id, npc.id]);
    await client.query("commit");
    return { marker, godId, playerId, campaignId: campaign.id, sessionId: session.id, characterId: character.id, npcId: npc.id, godEmail, playerEmail };
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
    for (const table of [
      "campaign_session_called_check_event",
      "campaign_session_high_low_event",
      "campaign_session_called_check_request",
      "campaign_session_called_check_batch",
      "campaign_session_high_low_request",
      "campaign_session_roll_amendment",
      "campaign_session_roll",
      "campaign_session_roster",
      "campaign_session",
    ]) await client.query(`delete from ${table} where campaign_id=$1`, [fixture.campaignId]);
    await client.query("delete from campaign_character_active_health where character_id=any($1::int[])", [[fixture.characterId, fixture.npcId]]);
    await client.query("delete from campaign_character_attribute where character_id=any($1::int[])", [[fixture.characterId, fixture.npcId]]);
    await client.query("delete from campaign_character_profile where character_id=any($1::int[])", [[fixture.characterId, fixture.npcId]]);
    await client.query("delete from campaign_character where campaign_id=$1", [fixture.campaignId]);
    await client.query("delete from campaign_player where campaign_id=$1", [fixture.campaignId]);
    await client.query("delete from campaign where id=$1", [fixture.campaignId]);
    await client.query("delete from \"user\" where id=any($1::text[])", [[fixture.godId, fixture.playerId]]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function waitForServer(server: ChildProcess, baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* server still starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the Pass 11 browser-test server.");
}

async function login(context: BrowserContext, baseUrl: string, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  return page;
}

async function eventually(check: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await check()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 125));
  }
  throw new Error(message);
}

function handlePrompt(page: Page, value: string): void {
  page.once("dialog", async (dialog) => dialog.accept(value));
}

async function selectRecipient(compose: ReturnType<Page["locator"]>, name: string): Promise<void> {
  const label = compose.locator(".called-check-recipients label").filter({ hasText: name });
  await label.locator("input").check();
}

async function godWorkflow(page: Page, fixture: Fixture, baseUrl: string, pool: pg.Pool): Promise<void> {
  await page.goto(`${baseUrl}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&workspace=checks`);
  await page.getByRole("heading", { name: "Called Checks & High/Low" }).waitFor();
  const calledCompose = page.locator(".called-check-compose").first();
  await selectRecipient(calledCompose, "Persistent Browser NPC");
  await calledCompose.getByLabel("Purpose").fill("G.O.D. browser NPC check");
  await calledCompose.getByLabel("Roll method").selectOption("entered");
  await calledCompose.getByRole("button", { name: "Issue Called Check" }).click();
  const batch = page.locator(".called-check-batch").filter({ hasText: "G.O.D. browser NPC check" });
  await batch.waitFor();
  assert.match(await batch.innerText(), /Persistent Browser NPC/);
  assert.match(await batch.innerText(), /WIS straight Attribute \(45\)/);
  assert.match(await batch.innerText(), /55 → 55/);
  handlePrompt(page, "75");
  await batch.getByRole("button", { name: "Record Physical Result" }).click();
  await eventually(async () => /#\d+: 75/.test(await batch.innerText()), "G.O.D. physical Called Check did not resolve.");
  assert.match(await batch.innerText(), /Successful/);

  const highLowCompose = page.locator(".called-check-compose").nth(1);
  await highLowCompose.getByLabel("Roll method").selectOption("entered");
  await highLowCompose.getByLabel("Purpose").fill("G.O.D. neutral browser High Low");
  await highLowCompose.getByRole("button", { name: "Issue High / Low" }).click();
  const highLow = page.locator(".called-check-attempt").filter({ hasText: "G.O.D. neutral browser High Low" });
  await highLow.waitFor();
  handlePrompt(page, "25");
  await highLow.getByRole("button", { name: "G.O.D. Enter Result" }).click();
  await eventually(async () => /Raw Roll\s*25/i.test(await highLow.innerText()), "Neutral High/Low did not persist its raw result.");
  assert.match(await highLow.innerText(), /LOW/);

  await page.reload();
  await page.getByRole("heading", { name: "Called Checks & High/Low" }).waitFor();
  assert.match(await page.locator(".called-check-batch").filter({ hasText: "G.O.D. browser NPC check" }).innerText(), /#\d+: 75/);
  assert.match(await page.locator(".called-check-attempt").filter({ hasText: "G.O.D. neutral browser High Low" }).innerText(), /Raw Roll\s*25/i);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  const proof = await pool.query<{ batches: number; requests: number; high_low: number; rolls: number; events: number }>(`
    select
      (select count(*)::int from campaign_session_called_check_batch where campaign_id=$1) batches,
      (select count(*)::int from campaign_session_called_check_request where campaign_id=$1) requests,
      (select count(*)::int from campaign_session_high_low_request where campaign_id=$1) high_low,
      (select count(*)::int from campaign_session_roll where campaign_id=$1) rolls,
      ((select count(*)::int from campaign_session_called_check_event where campaign_id=$1) + (select count(*)::int from campaign_session_high_low_event where campaign_id=$1)) events
  `, [fixture.campaignId]);
  assert.deepEqual(proof.rows[0], { batches: 1, requests: 1, high_low: 1, rolls: 2, events: 4 });
}

async function playerWorkflow(godPage: Page, playerPage: Page, fixture: Fixture, baseUrl: string, pool: pg.Pool): Promise<void> {
  await godPage.goto(`${baseUrl}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&workspace=checks`);
  await godPage.getByRole("heading", { name: "Called Checks & High/Low" }).waitFor();
  await playerPage.goto(`${baseUrl}/realms/tabletop?character=${fixture.characterId}`);
  assert.equal(await playerPage.getByText("Private browser Called Check").count(), 0);

  let compose = godPage.locator(".called-check-compose").first();
  await selectRecipient(compose, "Persistent Browser Hero");
  await compose.getByLabel("Visibility").selectOption("private");
  await compose.getByLabel("Roll method").selectOption("entered");
  await compose.getByLabel("Purpose").fill("Private browser Called Check");
  await compose.getByLabel("Instructions").fill("Answer from the Character surface.");
  await compose.getByRole("button", { name: "Issue Called Check" }).click();
  await eventually(async () => await playerPage.getByText("Private browser Called Check").count() === 1, "Live Called Check delivery did not reach the Player surface.");
  const playerCheck = playerPage.locator("article").filter({ hasText: "Private browser Called Check" });
  assert.match(await playerCheck.innerText(), /WIS straight Attribute \(45\)/);
  assert.match(await playerCheck.innerText(), /Final target\s*55/);
  handlePrompt(playerPage, "80");
  await playerCheck.getByRole("button", { name: "Enter Physical Result" }).click();
  await eventually(async () => /Raw Roll\s*80/i.test(await playerCheck.innerText()), "Player physical Called Check did not persist.");

  const highLowCompose = godPage.locator(".called-check-compose").nth(1);
  await highLowCompose.getByLabel("Mode").selectOption("player-calls-rolls");
  await highLowCompose.getByLabel("Visibility").selectOption("private");
  await highLowCompose.getByLabel("Roll method").selectOption("entered");
  await highLowCompose.getByLabel("Purpose").fill("Player browser High Low");
  await highLowCompose.getByRole("button", { name: "Issue High / Low" }).click();
  await eventually(async () => await playerPage.getByText("Player browser High Low").count() === 1, "Live High/Low delivery did not reach the Player surface.");
  const playerHighLow = playerPage.locator("article").filter({ hasText: "Player browser High Low" });
  await playerHighLow.getByRole("button", { name: "Call High" }).click();
  await eventually(async () => /Locked call\s*HIGH/i.test(await playerHighLow.innerText()), "Player High call did not lock.");
  handlePrompt(playerPage, "75");
  await playerHighLow.getByRole("button", { name: "Enter Physical Result" }).click();
  await eventually(async () => /Raw Roll\s*75/i.test(await playerHighLow.innerText()), "Player High/Low result did not persist.");
  assert.match(await playerHighLow.innerText(), /Match\s*Match/i);

  compose = godPage.locator(".called-check-compose").first();
  await selectRecipient(compose, "Persistent Browser Hero");
  await compose.getByLabel("Visibility").selectOption("god-only");
  await compose.getByLabel("Purpose").fill("INVISIBLE SECRET BROWSER CHECK");
  await compose.getByRole("button", { name: "Issue Called Check" }).click();
  const secret = godPage.locator(".called-check-batch").filter({ hasText: "INVISIBLE SECRET BROWSER CHECK" });
  await secret.waitFor();
  await secret.getByRole("button", { name: "Record Secret / NPC Roll" }).click();
  await eventually(async () => /Roll\s*#\d+/i.test(await secret.innerText()), "Secret G.O.D. Roll did not persist.");
  await playerPage.waitForTimeout(400);
  assert.equal(await playerPage.getByText("INVISIBLE SECRET BROWSER CHECK").count(), 0);
  await playerPage.reload();
  assert.equal(await playerPage.getByText("INVISIBLE SECRET BROWSER CHECK").count(), 0);
  assert.equal(await playerPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

  const proof = await pool.query<{ player_rolls: number; secret_rolls: number; calls: number }>(`
    select
      (select count(*)::int from campaign_session_roll where campaign_id=$1 and recorded_by_user_id=$2) player_rolls,
      (select count(*)::int from campaign_session_roll where campaign_id=$1 and visibility='god-only') secret_rolls,
      (select count(*)::int from campaign_session_high_low_request where campaign_id=$1 and called_side='high') calls
  `, [fixture.campaignId, fixture.playerId]);
  assert.deepEqual(proof.rows[0], { player_rolls: 2, secret_rolls: 1, calls: 1 });
}

export async function runCalledCheckBrowserWorkflow(mode: WorkflowMode): Promise<void> {
  const port = mode === "god" ? 3131 : 3132;
  const baseUrl = `http://localhost:${port}`;
  const distDirectory = mode === "god" ? ".next-called-check-god-browser" : ".next-called-check-player-browser";
  const distPath = resolve(process.cwd(), distDirectory);
  if (dirname(distPath) !== resolve(process.cwd()) || basename(distPath) !== distDirectory) throw new Error("The isolated Pass 11 browser build directory is unsafe.");
  const pool = new pg.Pool({ connectionString });
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  let fixture: Fixture | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    fixture = await seedFixture(pool, mode);
    await rm(distPath, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(port)], {
      cwd: process.cwd(),
      env: { ...process.env, BETTER_AUTH_URL: baseUrl, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: distDirectory },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server, baseUrl);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const godContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const godPage = await login(godContext, baseUrl, fixture.godEmail);
    if (mode === "god") await godWorkflow(godPage, fixture, baseUrl, pool);
    else {
      const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const playerPage = await login(playerContext, baseUrl, fixture.playerEmail);
      await playerWorkflow(godPage, playerPage, fixture, baseUrl, pool);
    }
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
    await rm(distPath, { recursive: true, force: true });
    await writeFile(tsconfigPath, tsconfigBefore);
  }
}

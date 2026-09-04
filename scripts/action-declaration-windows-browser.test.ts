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
if (!connectionString) throw new Error("DATABASE_URL is required for the action declaration browser test.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error(`Refusing action declaration browser fixtures against non-local host ${databaseUrl.hostname}.`);
}
if (!databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing action declaration browser fixtures against non-development database ${databaseUrl.pathname.slice(1)}.`);
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.ACTION_DECLARATION_BROWSER_PORT ?? 3117);
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DIST_DIRECTORY = ".next-action-declaration-browser";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (dirname(TEST_DIST_PATH) !== resolve(process.cwd()) || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY) {
  throw new Error("The isolated action declaration browser build directory is unsafe.");
}
const PASSWORD = "Action-Declaration-Browser-Only!";
const MARKER = `action-declaration-browser-${Date.now()}`;
const GOD_ID = `${MARKER}-god`;
const PLAYER_ID = `${MARKER}-player`;
const ADMIN_ID = `${MARKER}-admin`;

type Fixture = {
  campaignId: number;
  sessionId: number;
  sceneId: number;
  encounterId: number;
  godEmail: string;
  playerEmail: string;
  adminEmail: string;
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
      { id: GOD_ID, name: "Declaration Browser G.O.D.", email: `${GOD_ID}@example.invalid`, username: `${MARKER}-god` },
      { id: PLAYER_ID, name: "Declaration Browser Player", email: `${PLAYER_ID}@example.invalid`, username: `${MARKER}-player` },
      { id: ADMIN_ID, name: "Declaration Browser Administrator", email: `${ADMIN_ID}@example.invalid`, username: `${MARKER}-admin` },
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
    await client.query("insert into user_role (user_id,role) values ($1,'god'),($2,'player'),($3,'admin')", [GOD_ID, PLAYER_ID, ADMIN_ID]);
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,
      max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Isolated Pass 6 browser fixture.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [MARKER, GOD_ID]);
    await client.query(
      "insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false)",
      [campaign.id, GOD_ID, PLAYER_ID],
    );
    const hero = await one<{ id: number }>(client,
      "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Browser Fast Actor') returning id",
      [campaign.id, PLAYER_ID],
    );
    const defender = await one<{ id: number }>(client,
      "insert into campaign_character (campaign_id,player_user_id,name,is_npc,npc_kind) values ($1,$2,'Browser Window Responder',true,'race') returning id",
      [campaign.id, GOD_ID],
    );
    await client.query("insert into campaign_character_profile (character_id) values ($1),($2)", [hero.id, defender.id]);
    await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0),($2,0)", [hero.id, defender.id]);
    const session = await one<{ id: number }>(client,
      "insert into campaign_session (campaign_id,sequence_number,title,status,started_at) values ($1,1,'Declaration Browser Session','active',now()) returning id",
      [campaign.id],
    );
    await client.query(
      "insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0),($1,$2,$4,1)",
      [session.id, campaign.id, hero.id, defender.id],
    );
    const scene = await one<{ id: number }>(client,
      "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,started_at) values ($1,$2,1,'Declaration Browser Scene','active',now()) returning id",
      [session.id, campaign.id],
    );
    await client.query(
      "insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,0),($1,$2,$3,$5,1)",
      [scene.id, session.id, campaign.id, hero.id, defender.id],
    );
    const encounter = await one<{ id: number }>(client,
      "insert into campaign_session_encounter (scene_id,session_id,campaign_id,sequence_number,title,encounter_type,status,started_at) values ($1,$2,$3,1,'Declaration Browser Encounter','combat','active',now()) returning id",
      [scene.id, session.id, campaign.id],
    );
    await client.query(
      "insert into campaign_session_encounter_participant (encounter_id,scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,$5,0),($1,$2,$3,$4,$6,1)",
      [encounter.id, scene.id, session.id, campaign.id, hero.id, defender.id],
    );
    await client.query(
      "insert into campaign_session_encounter_initiative (encounter_id,scene_id,session_id,campaign_id,round_number,step_number,timeline_initiative) values ($1,$2,$3,$4,1,1,35)",
      [encounter.id, scene.id, session.id, campaign.id],
    );
    await client.query(
      "insert into campaign_session_encounter_initiative_participant (encounter_id,scene_id,session_id,campaign_id,character_id,normal_total_initiative,current_initiative) values ($1,$2,$3,$4,$5,35,35),($1,$2,$3,$4,$6,30,30)",
      [encounter.id, scene.id, session.id, campaign.id, hero.id, defender.id],
    );
    await client.query("commit");
    return {
      campaignId: campaign.id,
      sessionId: session.id,
      sceneId: scene.id,
      encounterId: encounter.id,
      godEmail: users[0]!.email,
      playerEmail: users[1]!.email,
      adminEmail: users[2]!.email,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixture(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const campaigns = await client.query<{ id: number }>("select id from campaign where name=$1", [MARKER]);
    for (const { id } of campaigns.rows) {
      for (const table of [
        "campaign_session_encounter_reaction_event",
        "campaign_session_encounter_responder_opportunity",
        "campaign_session_encounter_action_declaration_event",
        "campaign_session_encounter_action_declaration",
        "campaign_session_roll",
        "campaign_session_effect_duration_binding",
        "campaign_session_encounter_reward",
        "campaign_session_encounter_reaction",
        "campaign_session_encounter_pending_action_source",
        "campaign_session_encounter_pending_action",
        "campaign_session_encounter_initiative",
        "campaign_session_encounter_participant",
        "campaign_session_encounter",
        "campaign_session_scene_member",
        "campaign_session_scene",
        "campaign_session_roster",
        "campaign_session",
      ]) {
        await client.query(`delete from ${table} where campaign_id=$1`, [id]);
      }
      await client.query("delete from campaign where id=$1", [id]);
    }
    await client.query("delete from \"user\" where id=any($1::text[])", [[GOD_ID, PLAYER_ID, ADMIN_ID]]);
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
  throw new Error("Timed out waiting for the action declaration browser-test server.");
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

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
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
    const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const godPage = await login(godContext, fixture.godEmail);
    await login(playerContext, fixture.playerEmail);
    await login(adminContext, fixture.adminEmail);

    await godPage.goto(`${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}&encounter=${fixture.encounterId}`);
    await godPage.getByRole("button", { name: /^Scenes/ }).click();
    await godPage.getByRole("button", { name: /^Declarations/ }).click();
    const workspace = godPage.getByRole("region", { name: "Lock intent before the Roll" });
    await workspace.waitFor();
    assert.match(await workspace.innerText(), /Drafts spend nothing/);
    assert.match(await workspace.innerText(), /THE RUN/);
    assert.match(await workspace.innerText(), /Browser Fast Actor/);

    await workspace.getByLabel("Action Label").fill("Browser measured strike");
    await workspace.getByLabel("Action Kind").fill("generic-attack");
    await workspace.getByLabel("Window Kind").selectOption("melee-overlap");
    await workspace.getByLabel("Initiative Cost").fill("8");
    await workspace.getByLabel("Target").selectOption({ label: "Browser Window Responder" });
    await workspace.getByRole("button", { name: "Create Draft" }).click();
    await workspace.getByText(/Draft declaration created/).waitFor();
    await workspace.getByText(/No Initiative committed/).waitFor();
    assert.match(await workspace.innerText(), /No Initiative committed/);

    await workspace.getByRole("button", { name: "Lock", exact: true }).click();
    await workspace.getByText(/Declaration locked/).waitFor();
    await workspace.getByRole("button", { name: "Commit Initiative" }).waitFor();
    assert.match(await workspace.innerText(), /Campaign \d+ .* Session \d+ .* Round 1 .* Step 1/);
    await workspace.getByRole("button", { name: "Commit Initiative" }).click();
    await workspace.getByText(/Declaration committed/).waitFor();
    const defenseWorkspace = godPage.getByRole("region", { name: "Declare first, then Roll" });
    await defenseWorkspace.waitFor();
    await defenseWorkspace.getByRole("button", { name: "Lock Response Declaration" }).waitFor();
    assert.match(await workspace.innerText(), /35.*27/);
    assert.match(await workspace.innerText(), /Browser Window Responder[\s\S]*pending/);
    assert.match(await workspace.innerText(), /REACHED AT 30/);

    const beforeResponse = await pool.query<{ status: string }>(
      "select status from campaign_session_encounter_action_declaration where campaign_id=$1 order by id desc limit 1",
      [fixture.campaignId],
    );
    assert.equal(beforeResponse.rows[0]?.status, "committed");
    await defenseWorkspace.getByRole("button", { name: "Lock Response Declaration" }).click();
    await defenseWorkspace.getByText(/no-reaction declaration was locked/).waitFor();
    await workspace.getByText("ROLLING-READY", { exact: true }).waitFor();
    const afterResponse = await pool.query<{ status: string; pending: string; response: string; cost: number; roll_required: boolean }>(
      `select d.status, p.status as pending
             , r.outcome as response, r.committed_initiative_cost as cost, r.roll_required
       from campaign_session_encounter_action_declaration d
       join campaign_session_encounter_pending_action p on p.id=d.pending_action_id
       join campaign_session_encounter_reaction r on r.pending_action_id=p.id
       where d.campaign_id=$1 order by d.id desc limit 1`,
      [fixture.campaignId],
    );
    assert.deepEqual(afterResponse.rows[0], { status: "rolling-ready", pending: "active", response: "no-defense", cost: 0, roll_required: false });
    assert.equal((await pool.query("select count(*)::int as count from campaign_session_roll where campaign_id=$1", [fixture.campaignId])).rows[0]?.count, 0);
    const promptAnswers = ["Browser explicit attack target", "50"];
    const answerDialogs = async (dialog: { accept: (value?: string) => Promise<void> }) => dialog.accept(promptAnswers.shift() ?? "");
    godPage.on("dialog", answerDialogs);
    await defenseWorkspace.getByRole("button", { name: "Roll Attack" }).click();
    await defenseWorkspace.getByText(/Website attack Roll recorded immutably/).waitFor();
    godPage.off("dialog", answerDialogs);
    assert.equal((await pool.query("select count(*)::int as count from campaign_session_roll where campaign_id=$1 and pending_action_id is not null", [fixture.campaignId])).rows[0]?.count, 1);
    await defenseWorkspace.getByRole("button", { name: "Resolve Opposition" }).click();
    await defenseWorkspace.getByText(/No damage was applied/).waitFor();
    assert.equal((await pool.query("select count(*)::int as count from campaign_session_encounter_action_declaration where campaign_id=$1 and defense_resolution_json is not null", [fixture.campaignId])).rows[0]?.count, 1);
    assert.equal((await pool.query("select total_damage from campaign_character_active_health where character_id in (select character_id from campaign_session_roster where campaign_id=$1) order by character_id", [fixture.campaignId])).rows.every(({ total_damage }) => total_damage === 0), true);
    assert.equal(await godPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

    const forbidden = await playerContext.newPage();
    await forbidden.goto(`${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}`);
    await forbidden.waitForURL((url) => url.pathname === "/access");
    assert.equal(await forbidden.getByText("Browser measured strike").count(), 0);
    await forbidden.close();

    const adminForbidden = await adminContext.newPage();
    await adminForbidden.goto(`${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}`);
    await adminForbidden.waitForURL((url) => url.pathname === "/access");
    assert.equal(await adminForbidden.getByText("Browser measured strike").count(), 0);
    await adminForbidden.close();

    await Promise.all([godContext.close(), playerContext.close(), adminContext.close()]);
    console.log(JSON.stringify({
      passed: true,
      verified: [
        "G.O.D. Tabletop placement",
        "draft lock and separate Initiative commitment",
        "inclusive 35 to 27 responder window",
        "durable opportunity reconciliation",
        "No Defense history at zero cost without a response Roll",
        "server-authoritative attack Roll and objective resolution without damage",
        "Player and administrator-only denial plus responsive layout",
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
    await cleanupFixture(pool);
    await pool.end();
    await rm(TEST_DIST_PATH, { recursive: true, force: true }).catch(() => undefined);
  }
}

void main();

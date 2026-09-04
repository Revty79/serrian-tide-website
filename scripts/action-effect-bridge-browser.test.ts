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
if (!connectionString) throw new Error("DATABASE_URL is required for the Pass 8 browser test.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing Pass 8 browser fixtures outside a loopback _dev database.");
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.ACTION_EFFECT_BROWSER_PORT ?? 3119);
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DIST_DIRECTORY = ".next-action-effect-browser";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (dirname(TEST_DIST_PATH) !== resolve(process.cwd()) || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY) {
  throw new Error("The isolated Pass 8 browser build directory is unsafe.");
}
const PASSWORD = "Action-Effect-Browser-Only!";
const MARKER = `action-effect-browser-${Date.now()}`;
const GOD_ID = `${MARKER}-god`;

type Fixture = {
  campaignId: number;
  sessionId: number;
  sceneId: number;
  encounterId: number;
  characterId: number;
  declarationId: number;
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
    await client.query(
      `insert into "user" (id,name,email,email_verified,username,display_username)
       values ($1,'Pass 8 Browser G.O.D.',$2,true,$1,$1)`,
      [GOD_ID, email],
    );
    await client.query(
      `insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at)
       values ($1,'local:credential',$2,'credential',$2,$3,now())`,
      [`${GOD_ID}-credential`, GOD_ID, password],
    );
    await client.query("insert into user_role (user_id,role) values ($1,'god')", [GOD_ID]);
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,
      max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Isolated Pass 8 browser fixture.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [MARKER, GOD_ID]);
    await client.query("insert into campaign_player (campaign_id,user_id) values ($1,$2)", [campaign.id, GOD_ID]);
    const character = await one<{ id: number }>(client,
      "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Pass 8 Browser Actor') returning id",
      [campaign.id, GOD_ID],
    );
    await client.query("insert into campaign_character_profile (character_id) values ($1)", [character.id]);
    await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0)", [character.id]);
    const session = await one<{ id: number }>(client,
      "insert into campaign_session (campaign_id,sequence_number,title,status,started_at) values ($1,1,'Pass 8 Browser Session','active',now()) returning id",
      [campaign.id],
    );
    await client.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0)", [session.id, campaign.id, character.id]);
    const scene = await one<{ id: number }>(client,
      "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,started_at) values ($1,$2,1,'Pass 8 Browser Scene','active',now()) returning id",
      [session.id, campaign.id],
    );
    await client.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,0)", [scene.id, session.id, campaign.id, character.id]);
    const encounter = await one<{ id: number }>(client,
      "insert into campaign_session_encounter (scene_id,session_id,campaign_id,sequence_number,title,encounter_type,status,started_at) values ($1,$2,$3,1,'Pass 8 Browser Encounter','combat','active',now()) returning id",
      [scene.id, session.id, campaign.id],
    );
    await client.query("insert into campaign_session_encounter_participant (encounter_id,scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,$5,0)", [encounter.id, scene.id, session.id, campaign.id, character.id]);
    await client.query("insert into campaign_session_encounter_initiative (encounter_id,scene_id,session_id,campaign_id,round_number,step_number,timeline_initiative) values ($1,$2,$3,$4,1,1,20)", [encounter.id, scene.id, session.id, campaign.id]);
    await client.query("insert into campaign_session_encounter_initiative_participant (encounter_id,scene_id,session_id,campaign_id,character_id,normal_total_initiative,current_initiative) values ($1,$2,$3,$4,$5,20,19)", [encounter.id, scene.id, session.id, campaign.id, character.id]);
    const pending = await one<{ id: number }>(client, `insert into campaign_session_encounter_pending_action (
      encounter_id,scene_id,session_id,campaign_id,actor_character_id,label,action_kind,original_initiative_cost,
      initiative_spent,remaining_initiative_cost,start_initiative,start_timeline_initiative,expected_completion_initiative,status,started_round,completed_round
    ) values ($1,$2,$3,$4,$5,'Browser explicit no-roll','no-roll',1,1,0,20,20,19,'completed',1,1) returning id`,
    [encounter.id, scene.id, session.id, campaign.id, character.id]);
    const now = new Date().toISOString();
    const draft = {
      actorCharacterId: character.id,
      targetCharacterIds: [],
      label: "Browser explicit no-roll",
      actionKind: "no-roll",
      sourceKind: "no-roll",
      sourceRef: null,
      sourceInstanceId: null,
      sourcePayload: {},
      weaponItemId: null,
      firingModeId: null,
      attackMode: "",
      initiativeCost: 1,
      allowsMultiRound: false,
      heldIntervention: false,
      windowKind: "ordinary",
      aimDeclared: false,
      calledShot: { declared: false, label: "", assignedPenalty: null },
      explicitModifiers: [],
      preparesForDeclarationId: null,
      godNotes: "",
    };
    const authoredSource = {
      schemaVersion: 1,
      kind: "no-roll",
      identity: "no-roll:browser-fixture",
      sourceId: null,
      sourceInstanceId: null,
      ownerParticipantId: character.id,
      displayName: "Browser explicit no-roll",
      authoringHref: null,
      liveRevision: null,
      resolutionMode: "automatic-no-roll",
      governingSource: null,
      governingSnapshot: null,
      authoredData: { label: draft.label, actionKind: draft.actionKind },
      resourceCosts: [],
      effects: [],
      warnings: [],
    };
    const locked = {
      schemaVersion: 1,
      context: { campaignId: campaign.id, sessionId: session.id, sceneId: scene.id, encounterId: encounter.id, roundNumber: 1, stepNumber: 1 },
      actorCharacterId: character.id,
      targetCharacterIds: [],
      label: draft.label,
      actionKind: draft.actionKind,
      source: { kind: "no-roll", ref: null, instanceId: null, payload: {} },
      weapon: null,
      governing: null,
      authoredSource,
      initiativeCost: 1,
      allowsMultiRound: false,
      heldIntervention: false,
      windowKind: "ordinary",
      aimDeclared: false,
      calledShot: draft.calledShot,
      explicitModifiers: [],
      preparesForDeclarationId: null,
      godNotes: "",
      authorUserId: GOD_ID,
      lockedByUserId: GOD_ID,
      authoredAt: now,
      lockedAt: now,
    };
    const declaration = await one<{ id: number }>(client, `insert into campaign_session_encounter_action_declaration (
      encounter_id,scene_id,session_id,campaign_id,actor_character_id,pending_action_id,status,draft_json,locked_snapshot_json,
      created_by_user_id,locked_by_user_id,committed_by_user_id,locked_at,committed_at
    ) values ($1,$2,$3,$4,$5,$6,'rolling-ready',$7,$8,$9,$9,$9,now(),now()) returning id`,
    [encounter.id, scene.id, session.id, campaign.id, character.id, pending.id, draft, locked, GOD_ID]);
    await client.query("commit");
    return { campaignId: campaign.id, sessionId: session.id, sceneId: scene.id, encounterId: encounter.id, characterId: character.id, declarationId: declaration.id, godEmail: email };
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
        "campaign_session_encounter_effect_plan_event",
        "campaign_session_encounter_effect",
        "campaign_session_encounter_effect_plan",
        "campaign_session_encounter_action_declaration_event",
        "campaign_session_encounter_action_declaration",
        "campaign_session_encounter_pending_action",
        "campaign_session_encounter_initiative",
        "campaign_session_encounter_participant",
        "campaign_session_encounter",
        "campaign_session_scene_member",
        "campaign_session_scene",
        "campaign_session_roster",
        "campaign_session",
      ]) await client.query(`delete from ${table} where campaign_id=$1`, [id]);
      await client.query("delete from campaign where id=$1", [id]);
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
  throw new Error("Timed out waiting for the Pass 8 browser-test server.");
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
    await page.goto(`${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}&encounter=${fixture.encounterId}`);
    await page.getByRole("button", { name: /^Scenes/ }).click();
    await page.getByRole("button", { name: /^Declarations/ }).click();
    const workspace = page.getByRole("region", { name: "Action Effect Plans" });
    await workspace.waitFor();
    assert.match(await workspace.innerText(), /Frozen source[\s\S]*Roll and defense result[\s\S]*reviewable effects/);
    await workspace.getByRole("button", { name: "Generate Plan" }).click();
    await workspace.getByText(/Consequence plan generated/).waitFor();
    await workspace.getByText(/PLAN #\d+ · DECLARATION/).waitFor();
    assert.match(await workspace.innerText(), /Browser explicit no-roll/);
    assert.match(await workspace.innerText(), /Actor: Pass 8 Browser Actor/);

    const manualAnswers = [String(fixture.characterId), "Door opens after the explicit table ruling.", "G.O.D. observed the declared no-roll action."];
    const answerManual = async (dialog: { accept: (value?: string) => Promise<void> }) => dialog.accept(manualAnswers.shift() ?? "");
    page.on("dialog", answerManual);
    await workspace.getByRole("button", { name: "Add Manual Effect" }).click();
    await workspace.getByText(/Manual consequence added/).waitFor();
    page.off("dialog", answerManual);

    const outcomeAnswers = ["The door is open.", "Explicit one-action G.O.D. ruling."];
    const answerOutcome = async (dialog: { accept: (value?: string) => Promise<void> }) => dialog.accept(outcomeAnswers.shift() ?? "");
    page.on("dialog", answerOutcome);
    await workspace.getByRole("button", { name: "Record Manual Outcome" }).click();
    await workspace.getByText(/Manual consequence resolved/).waitFor();
    page.off("dialog", answerOutcome);

    page.once("dialog", async (dialog) => dialog.accept("Browser approval audit."));
    await workspace.getByRole("button", { name: "Approve Plan" }).click();
    await workspace.getByText(/Effect plan approved/).waitFor();
    await workspace.getByRole("button", { name: "Apply Approved Effects" }).click();
    await workspace.getByText(/Approved supported effects applied/).waitFor();
    await workspace.getByText(/^applied$/i).first().waitFor();
    assert.match(await workspace.innerText(), /Final applied result/i);
    assert.match(await workspace.innerText(), /Audit history/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

    const result = await pool.query<{ plan_status: string; effect_status: string; declaration_status: string; health: number }>(`
      select p.status plan_status, e.status effect_status, d.status declaration_status, h.total_damage health
      from campaign_session_encounter_effect_plan p
      join campaign_session_encounter_effect e on e.plan_id=p.id
      join campaign_session_encounter_action_declaration d on d.id=p.declaration_id
      join campaign_character_active_health h on h.character_id=p.actor_participant_id
      where p.declaration_id=$1
    `, [fixture.declarationId]);
    assert.deepEqual(result.rows[0], { plan_status: "applied", effect_status: "manual-resolved", declaration_status: "resolved", health: 0 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
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
    await cleanupFixture(pool).catch((error) => console.error(error));
    await pool.end();
    await rm(TEST_DIST_PATH, { recursive: true, force: true });
  }
}

void main();

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

import { createContainer, createEmptySpell, withCalculationSnapshot } from "../src/features/spell-construction/utilities/spellFactory";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the Build 11 browser test.");
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error(`Refusing Build 11 browser fixture against ${databaseUrl.hostname}/${databaseUrl.pathname.slice(1)}.`);
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
const PASSWORD = "Build11-Browser-Only!";
const MARKER = `build11-browser-${Date.now()}`;
const GOD_ID = `${MARKER}-god`;
const PLAYER_A_ID = `${MARKER}-a`;
const PLAYER_B_ID = `${MARKER}-b`;
const SCREENSHOT_DIR = process.env.BUILD11_SCREENSHOTS_DIR?.trim() || null;

type Fixture = {
  campaignId: number;
  sessionId: number;
  sceneId: number;
  encounterId: number;
  characterAId: number;
  characterBId: number;
  playerAEmail: string;
  playerBEmail: string;
  godEmail: string;
};

async function one<T extends pg.QueryResultRow>(client: pg.PoolClient, text: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(text, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0];
}

function manualSpell(frameworkSkillId: number) {
  const spell = createEmptySpell();
  const control = createContainer("control");
  control.id = `${MARKER}-control`;
  control.effects = [{ id: `${MARKER}-knockdown`, ruleId: "knockdown", quantity: 1, description: "" }];
  return withCalculationSnapshot({
    ...spell,
    id: `${MARKER}-spell`,
    name: "Browser Omen",
    castingSystem: "Spellcraft",
    frameworkSkillId,
    sphere: "Fire",
    containers: [control],
    description: "Manual-only browser timing fixture.",
  });
}

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    const users = [
      { id: GOD_ID, name: "Build 11 Browser G.O.D.", email: `${GOD_ID}@example.invalid`, username: `${MARKER}god` },
      { id: PLAYER_A_ID, name: "Build 11 Browser Player A", email: `${PLAYER_A_ID}@example.invalid`, username: `${MARKER}a` },
      { id: PLAYER_B_ID, name: "Build 11 Browser Player B", email: `${PLAYER_B_ID}@example.invalid`, username: `${MARKER}b` },
    ];
    for (const entry of users) {
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$4,$4)`, [entry.id, entry.name, entry.email, entry.username]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${entry.id}-credential`, entry.id, password]);
    }
    await client.query("insert into user_role (user_id,role) values ($1,'god'),($2,'player'),($3,'player')", [GOD_ID, PLAYER_A_ID, PLAYER_B_ID]);
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,
      max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ($1,'Isolated Build 11 browser fixture.',0,0,0,0,100,0,'Credits','Assigned',0,$2) returning id`, [MARKER, GOD_ID]);
    await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false),($1,$4,false)", [campaign.id, GOD_ID, PLAYER_A_ID, PLAYER_B_ID]);
    const characterA = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Browser Hero A') returning id", [campaign.id, PLAYER_A_ID]);
    const characterB = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,'Browser Hero B') returning id", [campaign.id, PLAYER_B_ID]);
    const npc = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode) values ($1,$2,'Browser Hidden NPC',true,'race','detailed') returning id", [campaign.id, GOD_ID]);
    for (const characterId of [characterA.id, characterB.id, npc.id]) {
      await client.query("insert into campaign_character_profile (character_id,hp_multiplier_steps,base_magic_steps) values ($1,0,4)", [characterId]);
      for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
        await client.query("insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,30)", [characterId, key]);
      }
    }
    const skills = await client.query<{ id: number; name: string }>("select id,name from skill where name = any($1::text[])", [["Spellcraft", "Channeling", "Fire"]]);
    const byName = new Map(skills.rows.map((skill) => [skill.name, skill.id]));
    for (const required of ["Spellcraft", "Channeling", "Fire"]) if (!byName.has(required)) throw new Error(`Missing canonical ${required} Skill.`);
    for (const characterId of [characterA.id, characterB.id]) {
      const root = await one<{ id: number }>(client, "insert into campaign_character_skill_allocation (character_id,skill_id,points) values ($1,$2,1) returning id", [characterId, byName.get("Spellcraft")]);
      await client.query("insert into campaign_character_skill_allocation (character_id,skill_id,parent_allocation_id,points) values ($1,$2,$3,10),($1,$4,$3,1)", [characterId, byName.get("Channeling"), root.id, byName.get("Fire")]);
      const spell = manualSpell(byName.get("Fire")!);
      await client.query("insert into campaign_character_spell_document (character_id,document_id,name,tradition,document_json,in_spellbook) values ($1,$2,$3,$4,$5,true)", [characterId, `${spell.id}-${characterId}`, spell.name, spell.tradition, JSON.stringify({ ...spell, id: `${spell.id}-${characterId}` })]);
    }
    const weapon = await one<{ id: number }>(client, `insert into items (
      canonical_id,name,catalog_scope,equipment_group,record_type,family,category,price_basis,created_by_user_id,source_system,source_external_id
    ) values ($1,'Browser Saber','equipment','weapon','browser-test','Build 11','Weapon','item',$2,$3,$1) returning id`, [MARKER.toUpperCase(), GOD_ID, MARKER]);
    await client.query("insert into weapon_profiles (item_id,weapon_type,handedness,damage_source,damage,initiative_cost,damage_type,reach_text) values ($1,'Melee','One-handed','STR','2',3,'Slashing','Close')", [weapon.id]);
    await client.query("insert into campaign_character_item (character_id,item_id,quantity,unit_cost_credits) values ($1,$2,1,0)", [characterA.id, weapon.id]);
    await client.query("insert into campaign_character_item_equipment_state (character_id,item_id,state,quantity) values ($1,$2,'wielded',1)", [characterA.id, weapon.id]);
    const session = await one<{ id: number }>(client, "insert into campaign_session (campaign_id,sequence_number,title,status,started_at) values ($1,1,'Browser Session','active',now()) returning id", [campaign.id]);
    for (const [index, characterId] of [characterA.id, characterB.id, npc.id].entries()) {
      await client.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order,prep_notes) values ($1,$2,$3,$4,$5)", [session.id, campaign.id, characterId, index, characterId === npc.id ? "PRIVATE NPC ROSTER NOTE" : ""]);
    }
    const scene = await one<{ id: number }>(client, "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,started_at,god_notes) values ($1,$2,1,'Browser Scene','active',now(),'PRIVATE SCENE NOTE') returning id", [session.id, campaign.id]);
    for (const [index, characterId] of [characterA.id, characterB.id, npc.id].entries()) {
      await client.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,$5)", [scene.id, session.id, campaign.id, characterId, index]);
    }
    const encounter = await one<{ id: number }>(client, "insert into campaign_session_encounter (scene_id,session_id,campaign_id,sequence_number,title,status,encounter_type,started_at,god_notes) values ($1,$2,$3,1,'Browser Encounter','active','combat',now(),'PRIVATE ENCOUNTER NOTE') returning id", [scene.id, session.id, campaign.id]);
    for (const [index, characterId] of [characterA.id, characterB.id, npc.id].entries()) {
      await client.query("insert into campaign_session_encounter_participant (encounter_id,scene_id,session_id,campaign_id,character_id,sort_order,prep_notes) values ($1,$2,$3,$4,$5,$6,$7)", [encounter.id, scene.id, session.id, campaign.id, characterId, index, characterId === npc.id ? "PRIVATE NPC TACTIC" : ""]);
    }
    await client.query("insert into campaign_session_encounter_initiative (encounter_id,scene_id,session_id,campaign_id,timeline_initiative) values ($1,$2,$3,$4,20)", [encounter.id, scene.id, session.id, campaign.id]);
    await client.query(`insert into campaign_session_encounter_initiative_participant
      (encounter_id,scene_id,session_id,campaign_id,character_id,normal_total_initiative,current_initiative,movement_mode)
      values ($1,$2,$3,$4,$5,20,20,'Walk'),($1,$2,$3,$4,$6,18,18,'Walk'),($1,$2,$3,$4,$7,12,12,'Walk')`, [encounter.id, scene.id, session.id, campaign.id, characterA.id, characterB.id, npc.id]);
    await client.query(`insert into campaign_session_roll
      (campaign_id,session_id,scene_id,encounter_id,roller_character_id,recorded_by_user_id,method,visibility,purpose_kind,label,result_total,notes)
      values ($1,$2,$3,$4,$5,$6,'entered','god-only','other','Private G.O.D. Roll',44,'PRIVATE ROLL NOTE')`, [campaign.id, session.id, scene.id, encounter.id, npc.id, GOD_ID]);
    await client.query("commit");
    return {
      campaignId: campaign.id, sessionId: session.id, sceneId: scene.id, encounterId: encounter.id,
      characterAId: characterA.id, characterBId: characterB.id,
      playerAEmail: users[1]!.email, playerBEmail: users[2]!.email, godEmail: users[0]!.email,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* wait for server */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the browser-test server.");
}

async function login(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.waitForTimeout(1_000);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  return page;
}

async function eventually(check: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error(message);
}

async function verifyResponsiveLayout(page: Page, prefix: string, centeredSelector?: string): Promise<void> {
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];
  if (SCREENSHOT_DIR) await mkdir(SCREENSHOT_DIR, { recursive: true });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
    const layout = await page.evaluate((selector) => {
      const root = document.documentElement;
      const centered = selector ? document.querySelector<HTMLElement>(selector)?.getBoundingClientRect() : null;
      return {
        overflows: root.scrollWidth > root.clientWidth || document.body.scrollWidth > root.clientWidth,
        leftGap: centered?.left ?? null,
        rightGap: centered ? window.innerWidth - centered.right : null,
      };
    }, centeredSelector);
    assert.equal(layout.overflows, false, `${prefix} overflowed horizontally at ${viewport.width}x${viewport.height}.`);
    if (layout.leftGap !== null && layout.rightGap !== null && viewport.width >= 1024) {
      assert.ok(Math.abs(layout.leftGap - layout.rightGap) <= 2, `${prefix} was not centered at ${viewport.width}x${viewport.height}.`);
    }
    if (SCREENSHOT_DIR) {
      await page.screenshot({ path: join(SCREENSHOT_DIR, `${prefix}-${viewport.width}x${viewport.height}.png`) });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function cleanupFixture(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const campaignRows = await client.query<{ id: number }>(
      "select id from campaign where name=$1 for update",
      [MARKER],
    );
    for (const { id: campaignId } of campaignRows.rows) {
      for (const table of [
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
        await client.query(`delete from ${table} where campaign_id=$1`, [campaignId]);
      }
      await client.query("delete from campaign where id=$1", [campaignId]);
    }
    await client.query("delete from \"user\" where id = any($1::text[])", [[GOD_ID, PLAYER_A_ID, PLAYER_B_ID]]);
    await client.query("delete from items where source_system=$1", [MARKER]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  let server: ChildProcess | null = null;
  let ownsServer = false;
  try {
  const fixture = await seedFixture(pool);
  const existingServer = await fetch(BASE_URL, { redirect: "manual" }).then(() => true).catch(() => false);
  if (!existingServer) {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)], {
      cwd: process.cwd(), env: process.env, stdio: "inherit", windowsHide: true,
    });
    ownsServer = true;
    await waitForServer(server);
  }
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const godContext = await browser.newContext();
  const playerAContext = await browser.newContext();
  const playerBContext = await browser.newContext();
  const godPage = await login(godContext, fixture.godEmail);
  const playerA = await login(playerAContext, fixture.playerAEmail);
  const playerB = await login(playerBContext, fixture.playerBEmail);

  await playerA.goto(`${BASE_URL}/realms/characters/${fixture.characterAId}`);
  await playerA.getByText("ACTIVE ENCOUNTER", { exact: true }).waitFor();
  await playerA.getByRole("link", { name: "Open Active Encounter" }).waitFor();
  await playerA.getByText("Live", { exact: true }).waitFor({ timeout: 15_000 });
  await verifyResponsiveLayout(playerA, "character-active-encounter");
  await playerA.getByRole("link", { name: "Open Active Encounter" }).click();
  await playerA.getByRole("heading", { name: "Browser Encounter" }).waitFor();
  await playerB.goto(`${BASE_URL}/realms/characters/${fixture.characterBId}/encounter`);
  await playerB.getByRole("heading", { name: "Browser Encounter" }).waitFor();
  await playerA.getByText("Live", { exact: true }).waitFor({ timeout: 15_000 });
  await playerB.getByText("Live", { exact: true }).waitFor({ timeout: 15_000 });
  await playerA.getByRole("heading", { name: "Your Initiative" }).waitFor();
  assert.match(await playerA.locator(".player-encounter-console__opportunity").innerText(), /YOUR ACTION/);
  await verifyResponsiveLayout(playerA, "player-encounter", ".player-encounter-console__workspace");
  const playerBody = await playerA.locator("body").innerText();
  for (const secret of ["PRIVATE NPC ROSTER NOTE", "PRIVATE SCENE NOTE", "PRIVATE ENCOUNTER NOTE", "PRIVATE NPC TACTIC", "Private G.O.D. Roll", "PRIVATE ROLL NOTE"]) {
    assert.equal(playerBody.includes(secret), false, `Player DTO leaked ${secret}.`);
  }

  await godPage.goto(`${BASE_URL}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}&encounter=${fixture.encounterId}`);
  await godPage.getByRole("button", { name: /^Scenes/ }).click();
  await godPage.getByRole("button", { name: /^Combat Aid/ }).click();
  await godPage.getByText("Live", { exact: true }).waitFor({ timeout: 15_000 });
  const operations = godPage.locator(".combat-aid-operations");
  await operations.getByLabel("Amount").fill("3");
  await operations.getByRole("button", { name: "Apply Direct Damage" }).click();
  await eventually(async () => (await playerA.locator("body").innerText()).includes("3 Total Damage"), "Player A did not receive live G.O.D. Damage.");
  await playerA.getByRole("alert").filter({ hasText: "YOU TOOK 3 DAMAGE" }).waitFor();

  await playerA.getByRole("button", { name: "Pass", exact: true }).click();
  await playerA.getByText("Initiative passed for this Round.", { exact: true }).waitFor();
  await eventually(async () => /passed/i.test(await godPage.locator(".combat-aid-detail").innerText()), "G.O.D. did not receive Player A Pass.");
  const passReset = await pool.connect();
  try {
    await passReset.query("begin");
    await passReset.query("update campaign_session_encounter_initiative_participant set participation_status='active',current_initiative=20,last_satisfied_step=0,updated_at=now() where encounter_id=$1 and character_id=$2", [fixture.encounterId, fixture.characterAId]);
    await passReset.query("select pg_notify('serrian_tide_tabletop',$1)", [JSON.stringify({ campaignId: fixture.campaignId, sessionId: fixture.sessionId, sceneId: fixture.sceneId, encounterId: fixture.encounterId, characterIds: [], category: "initiative" })]);
    await passReset.query("commit");
  } catch (error) {
    await passReset.query("rollback");
    throw error;
  } finally {
    passReset.release();
  }
  await eventually(async () => !(await playerA.getByRole("button", { name: "Hold", exact: true }).isDisabled()), "Player A did not refresh after the isolated Pass reset.");

  await playerA.getByRole("button", { name: "Hold", exact: true }).click();
  await playerA.getByText("Initiative held.", { exact: true }).waitFor();
  await eventually(async () => {
    const body = await playerB.locator("body").innerText();
    return body.includes("Browser Hero A") && /holding/i.test(body);
  }, "Player B did not receive Player A Hold.");
  await playerA.getByRole("button", { name: /Browser Saber/ }).click();
  await eventually(async () => (await playerB.locator("body").innerText()).includes("Browser Saber Attack"), "Player B did not receive Player A authored action.");
  await playerB.getByRole("alert").filter({ hasText: "REACTION AVAILABLE" }).waitFor();

  await playerB.getByRole("button", { name: "Dodge - 1 Initiative" }).click();
  await playerB.getByText("Dodge declared and Initiative committed.", { exact: true }).waitFor();
  await eventually(async () => {
    const state = await pool.query<{ current_initiative: number }>(
      "select current_initiative from campaign_session_encounter_initiative_participant where encounter_id=$1 and character_id=$2",
      [fixture.encounterId, fixture.characterBId],
    );
    return state.rows[0]?.current_initiative === 17;
  }, "Player Reaction did not persist its Initiative cost.");
  const godPlayerBCard = godPage.locator(".combat-aid-overview > div > button").filter({ hasText: "Browser Hero B" });
  await eventually(async () => (await godPlayerBCard.innerText()).includes("17"), "G.O.D. did not receive the Player Reaction Initiative change.");
  await godPlayerBCard.click();
  await godPage.getByText(/dodge · declared/i).waitFor();

  await playerB.getByLabel("Method").selectOption("entered");
  await playerB.getByLabel("Purpose").selectOption("defense");
  await playerB.getByLabel(/Physical result/).fill("62");
  await playerB.getByLabel("Label").fill("Browser Dodge Roll");
  const reactionLink = await playerB.getByLabel(/Link/).locator("option").filter({ hasText: /^Reaction -/ }).first().getAttribute("value");
  assert.ok(reactionLink);
  await playerB.getByLabel(/Link/).selectOption(reactionLink);
  await playerB.getByRole("button", { name: "Roll Percentile" }).click();
  await playerB.getByText("Percentile Roll recorded for the table.", { exact: true }).waitFor();
  const linkedReactionRoll = await pool.query<{ reaction_id: number | null; visibility: string }>("select reaction_id,visibility from campaign_session_roll where campaign_id=$1 and label='Browser Dodge Roll'", [fixture.campaignId]);
  assert.equal(linkedReactionRoll.rows.length, 1);
  assert.ok(linkedReactionRoll.rows[0]?.reaction_id);
  assert.equal(linkedReactionRoll.rows[0]?.visibility, "table");

  await godPage.getByRole("button", { name: "Success", exact: true }).click();
  await eventually(async () => /dodge - resolved/i.test(await playerB.locator("body").innerText()), "Player did not receive the G.O.D. Reaction resolution.");

  await playerA.getByLabel("Purpose").selectOption("attack");
  await playerA.getByLabel(/Link/).selectOption({ index: 1 });
  const labelInput = playerA.getByLabel("Label");
  await labelInput.fill("Browser Random Attack Roll");
  await playerA.getByRole("button", { name: "Roll Percentile" }).click();
  await eventually(async () => (await playerB.locator("body").innerText()).includes("Browser Random Attack Roll"), "Player B did not receive the shared random table Roll.");
  await playerA.getByLabel("Method").selectOption("entered");
  await playerA.getByLabel(/Physical result/).fill("73");
  await labelInput.fill("Browser Physical Attack Roll");
  await playerA.getByRole("button", { name: "Roll Percentile" }).click();
  await eventually(async () => (await playerB.locator("body").innerText()).includes("Browser Physical Attack Roll"), "Player B did not receive the shared physical table Roll.");
  assert.match(await playerB.locator("body").innerText(), /Derived Hit Location 3/);
  const physicalAttackRoll = await pool.query<{ result_total: number; pending_action_id: number | null; visibility: string }>("select result_total,pending_action_id,visibility from campaign_session_roll where campaign_id=$1 and label='Browser Physical Attack Roll'", [fixture.campaignId]);
  assert.equal(physicalAttackRoll.rows.length, 1);
  assert.equal(physicalAttackRoll.rows[0]?.result_total, 73);
  assert.equal(physicalAttackRoll.rows[0]?.visibility, "table");
  assert.ok(physicalAttackRoll.rows[0]?.pending_action_id);

  await godPage.getByRole("button", { name: /^Rolls/ }).click();
  for (const label of ["Browser Dodge Roll", "Browser Random Attack Roll", "Browser Physical Attack Roll"]) {
    await eventually(async () => (await godPage.locator("body").innerText()).includes(label), `G.O.D. Roll Ledger did not receive ${label}.`);
  }

  const timingReset = await pool.connect();
  try {
    await timingReset.query("begin");
    const activeAction = await one<{ id: number }>(timingReset, "select id from campaign_session_encounter_pending_action where encounter_id=$1 and actor_character_id=$2 and status='active'", [fixture.encounterId, fixture.characterAId]);
    await timingReset.query("update campaign_session_encounter_pending_action set status='ended',updated_at=now() where id=$1", [activeAction.id]);
    await timingReset.query("update campaign_session_encounter_pending_action_source set resolution_status='cancelled',resolved_at=now(),resolution_summary='Browser test moved to Spell timing.',updated_at=now() where pending_action_id=$1", [activeAction.id]);
    await timingReset.query("update campaign_session_encounter_reaction set status='cancelled',outcome='Browser test moved to Spell timing.',resolved_at=now(),updated_at=now() where pending_action_id=$1 and status='declared'", [activeAction.id]);
    await timingReset.query("update campaign_session_encounter_initiative_participant set current_initiative=0,participation_status='passed',updated_at=now() where encounter_id=$1 and character_id=$2", [fixture.encounterId, fixture.characterAId]);
    await timingReset.query("update campaign_session_encounter_initiative set timeline_initiative=17,step_number=2,updated_at=now() where encounter_id=$1", [fixture.encounterId]);
    await timingReset.query("select pg_notify('serrian_tide_tabletop',$1)", [JSON.stringify({ campaignId: fixture.campaignId, sessionId: fixture.sessionId, sceneId: fixture.sceneId, encounterId: fixture.encounterId, characterIds: [], category: "initiative" })]);
    await timingReset.query("commit");
  } catch (error) {
    await timingReset.query("rollback");
    throw error;
  } finally {
    timingReset.release();
  }

  const manaBeforeSpell = await pool.query<{ mana_spent: string }>("select coalesce(sum(mana_spent),0)::text as mana_spent from campaign_character_active_mana where character_id=$1", [fixture.characterBId]);
  await playerB.getByRole("button", { name: /^Browser Omen$/ }).click();
  const confirmSpell = playerB.getByRole("button", { name: /Confirm - Enter timed Spell action/ });
  await confirmSpell.waitFor();
  if (await confirmSpell.isDisabled()) {
    throw new Error(`Timed Spell preview was not ready:\n${await playerB.getByRole("dialog").innerText()}`);
  }
  await confirmSpell.click();
  await eventually(async () => (await playerA.locator("body").innerText()).includes("Cast Browser Omen"), "Player A did not receive Player B's timed Spell action.");
  const manaAtActionStart = await pool.query<{ mana_spent: string }>("select coalesce(sum(mana_spent),0)::text as mana_spent from campaign_character_active_mana where character_id=$1", [fixture.characterBId]);
  assert.equal(manaAtActionStart.rows[0]?.mana_spent, manaBeforeSpell.rows[0]?.mana_spent, "Starting a timed Spell must not spend Mana.");

  await godPage.getByRole("button", { name: /^Scenes/ }).click();
  await godPage.getByRole("button", { name: /^Initiative Tracker/ }).click();
  await godPage.getByRole("button", { name: "Advance to Next Event", exact: true }).click();
  await godPage.getByText(/Advanced to the next authoritative Initiative event at 14/).waitFor();
  await godPage.getByRole("button", { name: /^Combat Aid/ }).click();
  const spellCasterCard = godPage.locator(".combat-aid-overview > div > button").filter({ hasText: "Browser Hero B" });
  await spellCasterCard.click();
  await godPage.getByRole("button", { name: "Confirm Runtime Resolution", exact: true }).click();
  await eventually(async () => (await playerB.locator("body").innerText()).includes("4 / 10"), "Player did not receive the resolved Spell Mana change.");
  const resolvedSpell = await pool.query<{ resolution_status: string; mana_spent: string }>(`select s.resolution_status,coalesce(m.mana_spent,0)::text as mana_spent
    from campaign_session_encounter_pending_action_source s
    left join campaign_character_active_mana m on m.character_id=s.source_character_id and m.system='Spellcraft'
    where s.encounter_id=$1 and s.source_character_id=$2 and s.source_kind='spell'`, [fixture.encounterId, fixture.characterBId]);
  assert.deepEqual(resolvedSpell.rows, [{ resolution_status: "resolved", mana_spent: "6" }]);

  assert.equal((await playerA.getByRole("button", { name: /Apply Direct Damage/ }).count()), 0);
  assert.equal((await playerA.getByRole("button", { name: /Resolve Reaction/ }).count()), 0);
  await godPage.getByRole("button", { name: "Open Initiative Tracker", exact: true }).click();
  await godPage.getByText("Advanced / G.O.D. Corrections", { exact: true }).click();
  godPage.once("dialog", (dialog) => void dialog.accept());
  await godPage.getByRole("button", { name: "Close Initiative", exact: true }).click();
  await godPage.getByText("Initiative closed. Historical state remains available.", { exact: true }).waitFor();
  await godPage.locator(".tabletop-encounter-tabs").getByRole("button", { name: /^Closeout/ }).click();
  godPage.once("dialog", (dialog) => void dialog.accept());
  await godPage.getByRole("button", { name: "Finalize Encounter", exact: true }).click();
  await eventually(async () => playerA.url().endsWith(`/realms/characters/${fixture.characterAId}`), "Player active Encounter did not close after Encounter finalization.");
  assert.equal(await playerA.getByRole("link", { name: "Open Active Encounter" }).count(), 0);
  await playerA.getByRole("alert").filter({ hasText: "ENCOUNTER ENDED" }).waitFor();
  await godPage.getByRole("button", { name: "Complete Scene", exact: true }).click();
  await eventually(async () => /completed/i.test(await godPage.locator(".tabletop-scene-editor > header").innerText()), "Scene did not complete after the Encounter closed.");
  await godPage.locator(".tabletop-editor-tabs").getByRole("button", { name: /^Closeout/ }).click();
  godPage.once("dialog", (dialog) => void dialog.accept());
  await godPage.getByRole("button", { name: "Finalize Session", exact: true }).click();
  await eventually(async () => {
    const statuses = await pool.query<{ session_status: string; scene_status: string; encounter_status: string }>(`select s.status as session_status,sc.status as scene_status,e.status as encounter_status
      from campaign_session s join campaign_session_scene sc on sc.session_id=s.id join campaign_session_encounter e on e.scene_id=sc.id
      where s.id=$1 and sc.id=$2 and e.id=$3`, [fixture.sessionId, fixture.sceneId, fixture.encounterId]);
    return statuses.rows[0]?.session_status === "completed" && statuses.rows[0]?.scene_status === "completed" && statuses.rows[0]?.encounter_status === "completed";
  }, "The G.O.D. table lifecycle did not complete Session, Scene, and Encounter.");
  console.log(JSON.stringify({
    passed: true,
    flows: ["two independent Player sessions", "privacy", "prominent active Encounter", "responsive centered Player console", "critical live notices", "G.O.D. live Damage", "Pass", "Hold", "authored Weapon", "Reaction declaration/roll/resolution", "random and physical shared Rolls", "derived Hit Location", "timed Spell start/resolution", "Initiative/Encounter/Scene/Session closeout"],
  }, null, 2));
  await Promise.all([godContext.close(), playerAContext.close(), playerBContext.close()]);
  await browser.close();
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    if (ownsServer && server && server.exitCode === null) server.kill();
    await cleanupFixture(pool);
    await pool.end();
  }
}

void main();

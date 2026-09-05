import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import dotenv from "dotenv";
import pg from "pg";
import {
  chromium,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright-core";

dotenv.config({ path: ".env.local", quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required for the NPC lifecycle browser workflow.");
}
const databaseUrl = new URL(connectionString);
if (
  !["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname)
  || !databaseUrl.pathname.slice(1).endsWith("_dev")
) {
  throw new Error("Refusing NPC lifecycle browser fixtures outside a loopback _dev database.");
}

const CHROME = process.env.CHROME_PATH
  ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (!existsSync(CHROME)) {
  throw new Error("Chrome was not found. Set CHROME_PATH to a Chromium executable.");
}
const PORT = Number(process.env.NPC_LIFECYCLE_BROWSER_PORT ?? 3122);
const BASE_URL = "http://localhost:" + PORT;
const TEST_DIST_DIRECTORY = ".next-npc-lifecycle-browser";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (
  dirname(TEST_DIST_PATH) !== resolve(process.cwd())
  || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY
) {
  throw new Error("The isolated NPC lifecycle browser directory is unsafe.");
}

const PASSWORD = "NPC-Lifecycle-Browser-Only!";
const MARKER = "npc-lifecycle-browser-" + Date.now();
const OWNER_ID = MARKER + "-owner";
const OTHER_GOD_ID = MARKER + "-other-god";
const PLAYER_ID = MARKER + "-player";
const ADMIN_ID = MARKER + "-admin";

type Fixture = {
  campaignId: number;
  campaignName: string;
  raceId: number;
  raceName: string;
  raceMasterSnapshot: unknown;
  creatureId: number;
  creatureName: string;
  creatureMasterSnapshot: unknown;
  sessionId: number;
  sceneId: number;
  ownerEmail: string;
  otherGodEmail: string;
  playerEmail: string;
  adminEmail: string;
};

type NpcDatabaseSnapshot = {
  id: number;
  campaign_id: number;
  name: string;
  npc_kind: string;
  npc_build_mode: string;
  npc_role_label: string;
  archived_at: Date | null;
  archive_reason: string;
  race_id: number | null;
  personality: string;
  backstory: string;
  creature_id: number | null;
  creature_personality: string | null;
  instance_notes: string | null;
  baseline_snapshot_json: string | null;
  current_snapshot_json: string | null;
  attribute_count: number;
};

async function one<T extends pg.QueryResultRow>(
  client: pg.Pool | pg.PoolClient,
  query: string,
  values: unknown[] = [],
): Promise<T> {
  const result = await client.query<T>(query, values);
  if (result.rows.length !== 1) {
    throw new Error("Expected one row, found " + result.rows.length + ".");
  }
  return result.rows[0]!;
}

async function cleanupMatchingFixtures(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const users = await client.query<{ id: string }>(
      "select id from \"user\" where id like 'npc-lifecycle-browser-%'",
    );
    const userIds = users.rows.map(({ id }) => id);
    const campaigns = await client.query<{ id: number }>(
      "select id from campaign where name like 'npc-lifecycle-browser-%'",
    );
    const campaignIds = campaigns.rows.map(({ id }) => id);
    if (userIds.length || campaignIds.length) {
      await client.query(
        "delete from lifecycle_audit_event "
          + "where actor_user_id=any($1::text[]) "
          + "or campaign_id_snapshot=any($2::int[]) "
          + "or target_name like '%npc-lifecycle-browser-%'",
        [userIds, campaignIds],
      );
    }
    if (campaignIds.length) {
      await client.query(
        "delete from campaign_session_scene_member where campaign_id=any($1::int[])",
        [campaignIds],
      );
      await client.query(
        "delete from campaign_session_roster where campaign_id=any($1::int[])",
        [campaignIds],
      );
      await client.query(
        "delete from campaign where id=any($1::int[])",
        [campaignIds],
      );
    }
    if (userIds.length) {
      await client.query(
        "delete from races where created_by_user_id=any($1::text[])",
        [userIds],
      );
      await client.query(
        "delete from creatures where created_by_user_id=any($1::text[])",
        [userIds],
      );
      await client.query(
        "delete from account where user_id=any($1::text[])",
        [userIds],
      );
      await client.query(
        "delete from user_role where user_id=any($1::text[])",
        [userIds],
      );
      await client.query(
        "delete from \"user\" where id=any($1::text[])",
        [userIds],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertNoFixtures(pool: pg.Pool): Promise<void> {
  const remaining = await one<{
    campaigns: number;
    characters: number;
    races: number;
    creatures: number;
    users: number;
    audits: number;
  }>(
    pool,
    "select "
      + "(select count(*)::int from campaign where name like 'npc-lifecycle-browser-%') campaigns,"
      + "(select count(*)::int from campaign_character where name like '%npc-lifecycle-browser-%') characters,"
      + "(select count(*)::int from races where name like '%npc-lifecycle-browser-%') races,"
      + "(select count(*)::int from creatures where canonical_name like '%npc-lifecycle-browser-%') creatures,"
      + "(select count(*)::int from \"user\" where id like 'npc-lifecycle-browser-%') users,"
      + "(select count(*)::int from lifecycle_audit_event "
      + "where actor_user_id like 'npc-lifecycle-browser-%' "
      + "or target_name like '%npc-lifecycle-browser-%') audits",
  );
  assert.deepEqual(remaining, {
    campaigns: 0,
    characters: 0,
    races: 0,
    creatures: 0,
    users: 0,
    audits: 0,
  }, "NPC lifecycle browser fixtures were not completely removed.");
}

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    const users = [
      {
        id: OWNER_ID,
        name: "NPC Lifecycle Owner G.O.D.",
        email: OWNER_ID + "@example.invalid",
        role: "god",
      },
      {
        id: OTHER_GOD_ID,
        name: "NPC Lifecycle Other G.O.D.",
        email: OTHER_GOD_ID + "@example.invalid",
        role: "god",
      },
      {
        id: PLAYER_ID,
        name: "NPC Lifecycle Player",
        email: PLAYER_ID + "@example.invalid",
        role: "player",
      },
      {
        id: ADMIN_ID,
        name: "NPC Lifecycle Administrator",
        email: ADMIN_ID + "@example.invalid",
        role: "admin",
      },
    ];
    for (const user of users) {
      await client.query(
        "insert into \"user\" "
          + "(id,name,email,email_verified,username,display_username) "
          + "values ($1,$2,$3,true,$1,$1)",
        [user.id, user.name, user.email],
      );
      await client.query(
        "insert into account "
          + "(id,issuer,account_id,provider_id,user_id,password,updated_at) "
          + "values ($1,'local:credential',$2,'credential',$2,$3,now())",
        [user.id + "-credential", user.id, password],
      );
      await client.query(
        "insert into user_role (user_id,role) values ($1,$2)",
        [user.id, user.role],
      );
    }

    const campaignName = MARKER;
    const campaignRow = await one<{ id: number }>(
      client,
      "insert into campaign ("
        + "name,overview,attribute_points,skill_points,max_starting_skill,"
        + "points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,"
        + "currency_system,fate_point_method,assigned_fate_points,created_by_user_id"
        + ") values ($1,'Guarded NPC lifecycle browser fixture.',100,100,50,10,100,250,"
        + "'Credits','Assigned',3,$2) returning id",
      [campaignName, OWNER_ID],
    );
    await client.query(
      "insert into campaign_player (campaign_id,user_id,is_npc_controller) "
        + "values ($1,$2,true)",
      [campaignRow.id, OWNER_ID],
    );

    const raceName = "Source Race " + MARKER;
    const raceRow = await one<{ id: number }>(
      client,
      "insert into races "
        + "(name,size,physical_description,cultural_mindset,created_by_user_id) "
        + "values ($1,'Medium','Stable browser Race source.',"
        + "'Purpose-built lifecycle fixture.',$2) returning id",
      [raceName, OWNER_ID],
    );
    await client.query(
      "insert into campaign_allowed_race (campaign_id,race_id,sort_order) "
        + "values ($1,$2,0)",
      [campaignRow.id, raceRow.id],
    );

    const creatureName = "Source Creature " + MARKER;
    const creatureCanonicalId = ("NPC-LIFECYCLE-" + Date.now()).toUpperCase();
    const creatureRow = await one<{ id: number }>(
      client,
      "insert into creatures ("
        + "canonical_id,canonical_name,family,creature_type,size,total_hp,"
        + "description,typical_behavior,created_by_user_id"
        + ") values ($1,$2,'Browser Beasts','Sentinel','Medium',24,"
        + "'Stable browser Creature source.','Watches the archive.',$3) returning id",
      [creatureCanonicalId, creatureName, OWNER_ID],
    );
    for (const [attributeKey, value, sortOrder] of [
      ["Strength", 32, 0],
      ["Dexterity", 28, 1],
      ["Constitution", 36, 2],
      ["Intelligence", 18, 3],
      ["Wisdom", 24, 4],
      ["Charisma", 20, 5],
    ] as const) {
      await client.query(
        "insert into creature_attributes "
          + "(creature_id,attribute_key,value,sort_order) values ($1,$2,$3,$4)",
        [creatureRow.id, attributeKey, value, sortOrder],
      );
    }
    await client.query(
      "insert into creature_hp_pools "
        + "(creature_id,canonical_id,pool_name,hp_percentage,sort_order) "
        + "values ($1,$2,'Body',100,0)",
      [creatureRow.id, creatureCanonicalId + "-BODY"],
    );

    const sessionRow = await one<{ id: number }>(
      client,
      "insert into campaign_session "
        + "(campaign_id,sequence_number,title,status) "
        + "values ($1,1,$2,'planned') returning id",
      [campaignRow.id, "Dependency Session " + MARKER],
    );
    const sceneRow = await one<{ id: number }>(
      client,
      "insert into campaign_session_scene "
        + "(session_id,campaign_id,sequence_number,title,status) "
        + "values ($1,$2,1,$3,'planned') returning id",
      [sessionRow.id, campaignRow.id, "Dependency Scene " + MARKER],
    );

    const raceMasterSnapshot = (await one<{ snapshot: unknown }>(
      client,
      "select to_jsonb(r) snapshot from races r where id=$1",
      [raceRow.id],
    )).snapshot;
    const creatureMasterSnapshot = (await one<{ snapshot: unknown }>(
      client,
      "select to_jsonb(c) snapshot from creatures c where id=$1",
      [creatureRow.id],
    )).snapshot;

    await client.query("commit");
    return {
      campaignId: campaignRow.id,
      campaignName,
      raceId: raceRow.id,
      raceName,
      raceMasterSnapshot,
      creatureId: creatureRow.id,
      creatureName,
      creatureMasterSnapshot,
      sessionId: sessionRow.id,
      sceneId: sceneRow.id,
      ownerEmail: users[0]!.email,
      otherGodEmail: users[1]!.email,
      playerEmail: users[2]!.email,
      adminEmail: users[3]!.email,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readNpc(
  pool: pg.Pool,
  campaignId: number,
  name: string,
): Promise<NpcDatabaseSnapshot> {
  return one<NpcDatabaseSnapshot>(
    pool,
    "select c.id,c.campaign_id,c.name,c.npc_kind,c.npc_build_mode,"
      + "c.npc_role_label,c.archived_at,c.archive_reason,"
      + "p.race_id,p.personality,p.backstory,"
      + "cp.creature_id,cp.personality creature_personality,"
      + "cp.instance_notes,cp.baseline_snapshot_json,cp.current_snapshot_json,"
      + "(select count(*)::int from campaign_character_attribute a "
      + "where a.character_id=c.id) attribute_count "
      + "from campaign_character c "
      + "left join campaign_character_profile p on p.character_id=c.id "
      + "left join campaign_creature_npc_profile cp on cp.character_id=c.id "
      + "where c.campaign_id=$1 and c.name=$2",
    [campaignId, name],
  );
}

async function eventually(
  check: () => Promise<boolean>,
  message: string,
  attempts = 120,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await check()) return;
    } catch {
      // The UI or transaction has not settled yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 125));
  }
  throw new Error(message);
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error("Next dev server exited with " + server.exitCode + ".");
    }
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The isolated local server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the NPC lifecycle browser server.");
}

async function login(context: BrowserContext, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(BASE_URL + "/login");
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
  return page;
}

function npcCard(page: Page, name: string): Locator {
  return page.locator(".npcs-card").filter({ hasText: name });
}

async function waitForNpcCard(page: Page, name: string): Promise<Locator> {
  const card = npcCard(page, name);
  await card.waitFor();
  return card;
}

async function switchArchiveStatus(
  page: Page,
  status: "Active" | "Archived",
): Promise<void> {
  const controls = page.locator(".npcs-segmented");
  const button = controls.getByRole("button", { name: status, exact: true });
  if (await button.getAttribute("aria-pressed") !== "true") {
    await button.click();
  }
  await eventually(
    async () => await button.getAttribute("aria-pressed") === "true"
      && await page.locator(".npcs-empty").filter({ hasText: "Reading NPCs" }).count() === 0,
    status + " NPC list did not settle.",
  );
}

async function createSimpleNpc(
  page: Page,
  pool: pg.Pool,
  input: {
    campaignId: number;
    origin: "Race" | "Creature";
    sourceName: string;
    name: string;
    roleLabel: string;
    personality: string;
    notes: string;
  },
): Promise<NpcDatabaseSnapshot> {
  await page.getByRole("button", { name: "Create NPC", exact: true }).click();
  const dialog = page.locator("dialog.npcs-dialog[open]");
  await dialog.waitFor();
  await dialog.getByLabel(input.origin, { exact: true }).check();
  await dialog.getByLabel("Simple", { exact: true }).check();
  await dialog.getByLabel("Find Source Master").fill(input.sourceName);
  const sourceSelect = dialog.locator("select");
  const sourceOption = sourceSelect.locator("option").filter({
    hasText: input.sourceName,
  });
  await eventually(
    async () => await sourceOption.count() === 1,
    input.origin + " source did not appear in the unified NPC dialog.",
  );
  const sourceValue = await sourceOption.getAttribute("value");
  assert.ok(sourceValue, "NPC source option must have a saved identity.");
  await sourceSelect.selectOption(sourceValue);
  await dialog.getByLabel("NPC Name").fill(input.name);
  await dialog.getByLabel("Role / Label").fill(input.roleLabel);
  await dialog.getByLabel("Short Personality / Description").fill(input.personality);
  await dialog.getByLabel("Notes").fill(input.notes);
  await dialog.getByRole("button", { name: "Create Simple NPC", exact: true }).click();
  await page.getByRole("status").filter({
    hasText: input.name + " was created as a Simple NPC.",
  }).waitFor();
  await page.locator(".npcs-simple-editor").filter({ hasText: input.name }).waitFor();
  const snapshot = await readNpc(pool, input.campaignId, input.name);
  assert.equal(snapshot.npc_kind, input.origin.toLowerCase());
  assert.equal(snapshot.npc_build_mode, "simple");
  assert.equal(snapshot.npc_role_label, input.roleLabel);
  assert.equal(snapshot.attribute_count, 6);
  return snapshot;
}

async function createDetailedNpc(
  page: Page,
  pool: pg.Pool,
  input: {
    campaignId: number;
    origin: "Race" | "Creature";
    sourceName: string;
    name: string;
    roleLabel: string;
  },
): Promise<NpcDatabaseSnapshot> {
  await page.getByRole("button", { name: "Create NPC", exact: true }).click();
  const dialog = page.locator("dialog.npcs-dialog[open]");
  await dialog.waitFor();
  await dialog.getByLabel(input.origin, { exact: true }).check();
  await dialog.getByLabel("Detailed", { exact: true }).check();
  await dialog.getByLabel("Find Source Master").fill(input.sourceName);
  const sourceSelect = dialog.locator("select");
  const sourceOption = sourceSelect.locator("option").filter({
    hasText: input.sourceName,
  });
  await eventually(
    async () => await sourceOption.count() === 1,
    input.origin + " source did not appear for direct Detailed creation.",
  );
  const sourceValue = await sourceOption.getAttribute("value");
  assert.ok(sourceValue, "Detailed NPC source option must have a saved identity.");
  await sourceSelect.selectOption(sourceValue);
  await dialog.getByLabel("NPC Name").fill(input.name);
  await dialog.getByLabel("Role / Label").fill(input.roleLabel);
  await dialog.getByRole("button", {
    name: "Create Detailed NPC",
    exact: true,
  }).click();
  await page.waitForURL((url) => (
    input.origin === "Race"
      ? /^\/heavens\/characters\/\d+$/.test(url.pathname)
      : /^\/heavens\/npcs\/\d+$/.test(url.pathname)
  ));
  const characterId = Number(new URL(page.url()).pathname.split("/").at(-1));
  assert.ok(Number.isSafeInteger(characterId) && characterId > 0);
  if (input.origin === "Race") {
    await page.getByRole("heading", { name: "Edit NPC", exact: true }).waitFor();
    await page.getByText(new RegExp("Character: " + input.name)).waitFor();
  } else {
    await page.getByRole("heading", { name: input.name, exact: true }).first().waitFor();
  }
  const snapshot = await readNpc(pool, input.campaignId, input.name);
  assert.equal(snapshot.id, characterId);
  assert.equal(snapshot.npc_kind, input.origin.toLowerCase());
  assert.equal(snapshot.npc_build_mode, "detailed");
  assert.equal(snapshot.npc_role_label, input.roleLabel);
  assert.equal(snapshot.attribute_count, 6);
  assert.equal(snapshot.archived_at, null);
  if (input.origin === "Creature") {
    assert.ok(snapshot.baseline_snapshot_json);
    assert.equal(snapshot.current_snapshot_json, snapshot.baseline_snapshot_json);
  }
  assert.equal(
    Number((await one<{ count: number }>(
      pool,
      "select count(*)::int count from campaign_character "
        + "where campaign_id=$1 and name=$2",
      [input.campaignId, input.name],
    )).count),
    1,
  );
  return snapshot;
}

async function openLifecycleDialog(
  card: Locator,
  page: Page,
  buttonName: "Archive" | "Restore" | "Review permanent deletion",
  npcName: string,
): Promise<Locator> {
  await card.getByRole("button", { name: buttonName, exact: true }).click();
  const dialog = page.locator("dialog[open]").filter({ hasText: npcName });
  await dialog.waitFor();
  await dialog.getByRole("heading", { name: npcName, exact: true }).waitFor();
  return dialog;
}

async function waitForEnabled(button: Locator, message: string): Promise<void> {
  await eventually(async () => await button.isEnabled(), message);
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await cleanupMatchingFixtures(pool);
    const fixture = await seedFixture(pool);
    await rm(TEST_DIST_PATH, { recursive: true, force: true });
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          BETTER_AUTH_URL: BASE_URL,
          NEXT_TELEMETRY_DISABLED: "1",
          SERRIAN_TEST_NEXT_DIST_DIR: TEST_DIST_DIRECTORY,
          SERRIAN_TIDE_ENABLE_PERMANENT_DELETION: "true",
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    await waitForServer(server);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });

    const ownerContext = await browser.newContext({
      viewport: { width: 1280, height: 760 },
    });
    const otherGodContext = await browser.newContext({
      viewport: { width: 1024, height: 720 },
    });
    const playerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const adminContext = await browser.newContext({
      viewport: { width: 1100, height: 760 },
    });
    const ownerPage = await login(ownerContext, fixture.ownerEmail);
    const otherGodPage = await login(otherGodContext, fixture.otherGodEmail);
    const playerPage = await login(playerContext, fixture.playerEmail);
    const adminPage = await login(adminContext, fixture.adminEmail);

    await ownerPage.goto(
      BASE_URL + "/heavens/npcs?campaign=" + fixture.campaignId,
    );
    await ownerPage.getByRole("heading", { name: "NPC Master Sheet" }).waitFor();
    await ownerPage.getByRole("heading", {
      name: fixture.campaignName,
      exact: true,
    }).waitFor();

    const raceNpcName = "Race Scout " + MARKER;
    const raceRole = "Gate Guide " + MARKER;
    const savedRaceRole = "Archive Guide " + MARKER;
    const racePersonality = "Quiet, exact, and observant.";
    const raceNotes = "Race state must survive upgrade " + MARKER + ".";
    const raceNpcInitial = await createSimpleNpc(ownerPage, pool, {
      campaignId: fixture.campaignId,
      origin: "Race",
      sourceName: fixture.raceName,
      name: raceNpcName,
      roleLabel: raceRole,
      personality: racePersonality,
      notes: raceNotes,
    });

    await ownerPage.setViewportSize({ width: 760, height: 460 });
    const raceEditor = ownerPage.locator(".npcs-simple-editor").filter({
      hasText: raceNpcName,
    });
    await raceEditor.getByLabel("Role / Label").fill(savedRaceRole);
    await raceEditor.getByLabel("Short Personality / Description").fill(
      racePersonality + " Saved in place.",
    );
    await raceEditor.getByLabel("Notes").fill(raceNotes + " Saved in place.");
    const saveRace = raceEditor.getByRole("button", {
      name: "Save Simple NPC",
      exact: true,
    });
    await saveRace.scrollIntoViewIfNeeded();
    const scrollBeforeSave = await ownerPage.evaluate(() => window.scrollY);
    assert.ok(scrollBeforeSave > 0, "The scroll-preservation proof requires a scrolled page.");
    await saveRace.click();
    await ownerPage.getByRole("status").filter({
      hasText: raceNpcName + " was saved.",
    }).waitFor();
    await eventually(
      async () => Math.abs(
        await ownerPage.evaluate(() => window.scrollY) - scrollBeforeSave,
      ) <= 12,
      "Saving the compact NPC editor did not preserve scroll position.",
    );
    const raceNpcSaved = await readNpc(pool, fixture.campaignId, raceNpcName);
    assert.equal(raceNpcSaved.id, raceNpcInitial.id);
    assert.equal(raceNpcSaved.npc_role_label, savedRaceRole);
    assert.equal(
      raceNpcSaved.personality,
      racePersonality + " Saved in place.",
    );
    assert.equal(raceNpcSaved.backstory, raceNotes + " Saved in place.");
    await raceEditor.getByRole("button", { name: "Close", exact: true }).click();

    await ownerPage.setViewportSize({ width: 1280, height: 760 });
    const creatureNpcName = "Creature Warden " + MARKER;
    const creatureRole = "Vault Sentinel " + MARKER;
    const creaturePersonality = "Patient until the archive is threatened.";
    const creatureNotes = "Creature snapshot must survive " + MARKER + ".";
    const creatureNpcInitial = await createSimpleNpc(ownerPage, pool, {
      campaignId: fixture.campaignId,
      origin: "Creature",
      sourceName: fixture.creatureName,
      name: creatureNpcName,
      roleLabel: creatureRole,
      personality: creaturePersonality,
      notes: creatureNotes,
    });
    assert.equal(creatureNpcInitial.creature_id, fixture.creatureId);
    assert.ok(creatureNpcInitial.baseline_snapshot_json);
    assert.equal(
      creatureNpcInitial.current_snapshot_json,
      creatureNpcInitial.baseline_snapshot_json,
    );
    await ownerPage.locator(".npcs-simple-editor").filter({
      hasText: creatureNpcName,
    }).getByRole("button", { name: "Close", exact: true }).click();

    const search = ownerPage.getByLabel("Search NPCs");
    await search.fill(savedRaceRole);
    await eventually(
      async () => await ownerPage.locator(".npcs-card").count() === 1,
      "Role search did not narrow the NPC archive.",
    );
    assert.equal(await npcCard(ownerPage, raceNpcName).count(), 1);
    await search.fill(fixture.creatureName);
    await eventually(
      async () => await ownerPage.locator(".npcs-card").count() === 1,
      "Source search did not narrow the NPC archive.",
    );
    assert.equal(await npcCard(ownerPage, creatureNpcName).count(), 1);
    await search.fill("");
    await eventually(
      async () => await ownerPage.locator(".npcs-card").count() === 2,
      "Clearing NPC search did not restore both records.",
    );

    const directRaceName = "Detailed Race Envoy " + MARKER;
    const directRaceRole = "Direct Race Diplomat " + MARKER;
    const directRaceNpc = await createDetailedNpc(ownerPage, pool, {
      campaignId: fixture.campaignId,
      origin: "Race",
      sourceName: fixture.raceName,
      name: directRaceName,
      roleLabel: directRaceRole,
    });
    assert.equal(directRaceNpc.race_id, fixture.raceId);
    await ownerPage.goto(
      BASE_URL + "/heavens/npcs?campaign=" + fixture.campaignId,
    );
    await waitForNpcCard(ownerPage, raceNpcName);

    const directCreatureName = "Detailed Creature Envoy " + MARKER;
    const directCreatureRole = "Direct Creature Diplomat " + MARKER;
    const directCreatureNpc = await createDetailedNpc(ownerPage, pool, {
      campaignId: fixture.campaignId,
      origin: "Creature",
      sourceName: fixture.creatureName,
      name: directCreatureName,
      roleLabel: directCreatureRole,
    });
    assert.equal(directCreatureNpc.creature_id, fixture.creatureId);
    await ownerPage.goto(
      BASE_URL + "/heavens/npcs?campaign=" + fixture.campaignId,
    );
    await waitForNpcCard(ownerPage, raceNpcName);

    const archiveDialog = await openLifecycleDialog(
      await waitForNpcCard(ownerPage, raceNpcName),
      ownerPage,
      "Archive",
      raceNpcName,
    );
    const archiveReason = "Browser archive reason " + MARKER;
    await archiveDialog.getByLabel("Archive reason (optional)").fill(
      archiveReason,
    );
    const archiveButton = archiveDialog.getByRole("button", {
      name: "Archive",
      exact: true,
    });
    await waitForEnabled(archiveButton, "Race NPC archive preview did not authorize the owner.");
    await archiveButton.click();
    await ownerPage.getByRole("status").filter({
      hasText: raceNpcName + " was archived.",
    }).waitFor();
    assert.equal(await npcCard(ownerPage, raceNpcName).count(), 0);
    await switchArchiveStatus(ownerPage, "Archived");
    const archivedRaceCard = await waitForNpcCard(ownerPage, raceNpcName);
    assert.match(await archivedRaceCard.innerText(), /Race NPC/);
    assert.match(await archivedRaceCard.innerText(), /Simple/);
    assert.match(await archivedRaceCard.innerText(), new RegExp(archiveReason));

    await adminPage.goto(
      BASE_URL + "/heavens/npcs?campaign=" + fixture.campaignId,
    );
    await adminPage.getByRole("heading", { name: "NPC Master Sheet" }).waitFor();
    await switchArchiveStatus(adminPage, "Archived");
    const adminArchivedCard = await waitForNpcCard(adminPage, raceNpcName);
    const restoreDialog = await openLifecycleDialog(
      adminArchivedCard,
      adminPage,
      "Restore",
      raceNpcName,
    );
    const restoreButton = restoreDialog.getByRole("button", {
      name: "Restore",
      exact: true,
    });
    await waitForEnabled(restoreButton, "Administrator restore preview did not authorize.");
    await restoreButton.click();
    await adminPage.getByRole("status").filter({
      hasText: raceNpcName + " was restored.",
    }).waitFor();
    const lifecycleAudit = await pool.query<{
      action: string;
      actor_user_id: string;
      reason: string;
    }>(
      "select action,actor_user_id,reason from lifecycle_audit_event "
        + "where entity_kind='race-npc' and target_id=$1 order by id",
      [String(raceNpcInitial.id)],
    );
    assert.deepEqual(lifecycleAudit.rows, [
      { action: "archive", actor_user_id: OWNER_ID, reason: archiveReason },
      { action: "restore", actor_user_id: ADMIN_ID, reason: "" },
    ]);

    await otherGodPage.goto(
      BASE_URL + "/heavens/npcs?campaign=" + fixture.campaignId,
    );
    await otherGodPage.getByRole("alert").filter({
      hasText: /Only the Campaign creator or an administrator can manage it/,
    }).waitFor();
    assert.equal(await npcCard(otherGodPage, raceNpcName).count(), 0);
    assert.equal(await npcCard(otherGodPage, creatureNpcName).count(), 0);

    await playerPage.goto(
      BASE_URL + "/heavens/npcs?campaign=" + fixture.campaignId,
    );
    await playerPage.waitForURL((url) => url.pathname === "/access");
    assert.equal(
      await playerPage.getByRole("button", { name: "Create NPC", exact: true }).count(),
      0,
    );

    await ownerPage.goto(
      BASE_URL + "/heavens/npcs?campaign=" + fixture.campaignId,
    );
    await waitForNpcCard(ownerPage, raceNpcName);
    const raceBeforeUpgrade = await readNpc(
      pool,
      fixture.campaignId,
      raceNpcName,
    );
    await npcCard(ownerPage, raceNpcName).getByRole("button", {
      name: "Open Simple Editor",
      exact: true,
    }).click();
    await ownerPage.locator(".npcs-simple-editor").filter({
      hasText: raceNpcName,
    }).getByRole("button", {
      name: "Upgrade to Detailed",
      exact: true,
    }).click();
    await ownerPage.waitForURL((url) => (
      url.pathname === "/heavens/characters/" + raceNpcInitial.id
    ));
    await ownerPage.getByRole("heading", { name: "Edit NPC", exact: true }).waitFor();
    await ownerPage.getByText(new RegExp("Character: " + raceNpcName)).waitFor();
    const raceAfterUpgrade = await readNpc(
      pool,
      fixture.campaignId,
      raceNpcName,
    );
    assert.equal(raceAfterUpgrade.id, raceBeforeUpgrade.id);
    assert.equal(raceAfterUpgrade.npc_build_mode, "detailed");
    assert.equal(raceAfterUpgrade.npc_role_label, raceBeforeUpgrade.npc_role_label);
    assert.equal(raceAfterUpgrade.personality, raceBeforeUpgrade.personality);
    assert.equal(raceAfterUpgrade.backstory, raceBeforeUpgrade.backstory);
    assert.equal(raceAfterUpgrade.race_id, raceBeforeUpgrade.race_id);
    assert.equal(raceAfterUpgrade.attribute_count, raceBeforeUpgrade.attribute_count);
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from campaign_character "
          + "where campaign_id=$1 and name=$2",
        [fixture.campaignId, raceNpcName],
      )).count),
      1,
    );

    await ownerPage.goto(
      BASE_URL + "/heavens/npcs?campaign=" + fixture.campaignId,
    );
    await waitForNpcCard(ownerPage, creatureNpcName);
    const creatureBeforeUpgrade = await readNpc(
      pool,
      fixture.campaignId,
      creatureNpcName,
    );
    await npcCard(ownerPage, creatureNpcName).getByRole("button", {
      name: "Open Simple Editor",
      exact: true,
    }).click();
    await ownerPage.locator(".npcs-simple-editor").filter({
      hasText: creatureNpcName,
    }).getByRole("button", {
      name: "Upgrade to Detailed",
      exact: true,
    }).click();
    await ownerPage.waitForURL((url) => (
      url.pathname === "/heavens/npcs/" + creatureNpcInitial.id
    ));
    await ownerPage.getByRole("heading", {
      name: creatureNpcName,
      exact: true,
    }).first().waitFor();
    const creatureAfterUpgrade = await readNpc(
      pool,
      fixture.campaignId,
      creatureNpcName,
    );
    assert.equal(creatureAfterUpgrade.id, creatureBeforeUpgrade.id);
    assert.equal(creatureAfterUpgrade.npc_build_mode, "detailed");
    assert.equal(
      creatureAfterUpgrade.npc_role_label,
      creatureBeforeUpgrade.npc_role_label,
    );
    assert.equal(
      creatureAfterUpgrade.creature_personality,
      creatureBeforeUpgrade.creature_personality,
    );
    assert.equal(
      creatureAfterUpgrade.instance_notes,
      creatureBeforeUpgrade.instance_notes,
    );
    assert.equal(
      creatureAfterUpgrade.baseline_snapshot_json,
      creatureBeforeUpgrade.baseline_snapshot_json,
    );
    assert.equal(
      creatureAfterUpgrade.current_snapshot_json,
      creatureBeforeUpgrade.current_snapshot_json,
    );
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from campaign_character "
          + "where campaign_id=$1 and name=$2",
        [fixture.campaignId, creatureNpcName],
      )).count),
      1,
    );
    assert.deepEqual(
      (await one<{ snapshot: unknown }>(
        pool,
        "select to_jsonb(r) snapshot from races r where id=$1",
        [fixture.raceId],
      )).snapshot,
      fixture.raceMasterSnapshot,
      "Race NPC work mutated its source master.",
    );
    assert.deepEqual(
      (await one<{ snapshot: unknown }>(
        pool,
        "select to_jsonb(c) snapshot from creatures c where id=$1",
        [fixture.creatureId],
      )).snapshot,
      fixture.creatureMasterSnapshot,
      "Creature NPC work mutated its source master.",
    );

    await ownerPage.goto(
      BASE_URL + "/heavens/npcs?campaign=" + fixture.campaignId,
    );
    const creatureCard = await waitForNpcCard(ownerPage, creatureNpcName);
    let deleteDialog = await openLifecycleDialog(
      creatureCard,
      ownerPage,
      "Review permanent deletion",
      creatureNpcName,
    );
    await deleteDialog.getByLabel(/^Type the exact name/).waitFor();
    const deleteButton = deleteDialog.getByRole("button", {
      name: "Permanently Delete",
      exact: true,
    });
    assert.equal(await deleteButton.isDisabled(), true);
    await deleteDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await eventually(
      async () => await ownerPage.locator("dialog[open]").count() === 0,
      "Deletion cancellation did not close the dialog.",
    );
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from campaign_character where id=$1",
        [creatureNpcInitial.id],
      )).count),
      1,
    );

    deleteDialog = await openLifecycleDialog(
      await waitForNpcCard(ownerPage, creatureNpcName),
      ownerPage,
      "Review permanent deletion",
      creatureNpcName,
    );
    const confirmation = deleteDialog.getByLabel(/^Type the exact name/);
    const confirmDelete = deleteDialog.getByRole("button", {
      name: "Permanently Delete",
      exact: true,
    });
    await confirmation.fill("wrong " + creatureNpcName);
    assert.equal(await confirmDelete.isDisabled(), true);
    await confirmation.fill(creatureNpcName);
    await waitForEnabled(confirmDelete, "Exact NPC name did not enable permanent deletion.");
    await confirmDelete.click();
    await ownerPage.getByRole("status").filter({
      hasText: creatureNpcName + " was permanently deleted.",
    }).waitFor();
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from campaign_character where id=$1",
        [creatureNpcInitial.id],
      )).count),
      0,
    );
    const creatureDeleteAudit = await one<{
      action: string;
      actor_user_id: string;
      target_name: string;
    }>(
      pool,
      "select action,actor_user_id,target_name from lifecycle_audit_event "
        + "where entity_kind='creature-npc' and target_id=$1",
      [String(creatureNpcInitial.id)],
    );
    assert.deepEqual(creatureDeleteAudit, {
      action: "delete",
      actor_user_id: OWNER_ID,
      target_name: creatureNpcName,
    });

    const directRaceDeleteDialog = await openLifecycleDialog(
      await waitForNpcCard(ownerPage, directRaceName),
      ownerPage,
      "Review permanent deletion",
      directRaceName,
    );
    const directRaceDeleteButton = directRaceDeleteDialog.getByRole("button", {
      name: "Permanently Delete",
      exact: true,
    });
    await directRaceDeleteDialog.getByLabel(/^Type the exact name/).fill(
      directRaceName,
    );
    await waitForEnabled(
      directRaceDeleteButton,
      "Direct Detailed Race NPC deletion did not authorize the owner.",
    );
    await directRaceDeleteButton.click();
    await ownerPage.getByRole("status").filter({
      hasText: directRaceName + " was permanently deleted.",
    }).waitFor();
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from campaign_character where id=$1",
        [directRaceNpc.id],
      )).count),
      0,
    );
    const raceDeleteAudit = await one<{
      action: string;
      actor_user_id: string;
      target_name: string;
    }>(
      pool,
      "select action,actor_user_id,target_name from lifecycle_audit_event "
        + "where entity_kind='race-npc' and target_id=$1 and action='delete'",
      [String(directRaceNpc.id)],
    );
    assert.deepEqual(raceDeleteAudit, {
      action: "delete",
      actor_user_id: OWNER_ID,
      target_name: directRaceName,
    });
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from campaign_character where id=$1",
        [raceNpcInitial.id],
      )).count),
      1,
      "Deleting one Race NPC removed another Campaign NPC.",
    );
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from campaign_character where id=$1",
        [directCreatureNpc.id],
      )).count),
      1,
      "Deleting a Race NPC removed the direct Detailed Creature NPC.",
    );
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from campaign where id=$1",
        [fixture.campaignId],
      )).count),
      1,
      "Deleting a Race NPC removed its Campaign.",
    );

    await pool.query(
      "insert into campaign_session_roster "
        + "(session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,0)",
      [fixture.sessionId, fixture.campaignId, raceNpcInitial.id],
    );
    await pool.query(
      "insert into campaign_session_scene_member "
        + "(scene_id,session_id,campaign_id,character_id,sort_order) "
        + "values ($1,$2,$3,$4,0)",
      [
        fixture.sceneId,
        fixture.sessionId,
        fixture.campaignId,
        raceNpcInitial.id,
      ],
    );
    const blockedDialog = await openLifecycleDialog(
      await waitForNpcCard(ownerPage, raceNpcName),
      ownerPage,
      "Review permanent deletion",
      raceNpcName,
    );
    await blockedDialog.getByRole("listitem").filter({
      hasText: /Scene member references/,
    }).waitFor();
    const blockedText = await blockedDialog.innerText();
    assert.match(blockedText, /Session roster references[\s\S]*blocks deletion/);
    assert.match(blockedText, /Scene member references[\s\S]*blocks deletion/);
    await blockedDialog.getByLabel(/^Type the exact name/).fill(raceNpcName);
    assert.equal(
      await blockedDialog.getByRole("button", {
        name: "Permanently Delete",
        exact: true,
      }).isDisabled(),
      true,
    );
    await blockedDialog.getByRole("button", {
      name: "Cancel",
      exact: true,
    }).click();
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from campaign_character where id=$1",
        [raceNpcInitial.id],
      )).count),
      1,
    );

    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from races where id=$1",
        [fixture.raceId],
      )).count),
      1,
    );
    assert.equal(
      Number((await one<{ count: number }>(
        pool,
        "select count(*)::int count from creatures where id=$1",
        [fixture.creatureId],
      )).count),
      1,
    );

    await Promise.all([
      ownerContext.close(),
      otherGodContext.close(),
      playerContext.close(),
      adminContext.close(),
    ]);
    console.log(JSON.stringify({
      passed: true,
      marker: MARKER,
      verified: [
        "unified native creation dialog",
        "Simple Race NPC creation",
        "Simple Creature NPC creation with independent snapshot",
        "direct Detailed Race NPC creation and existing editor route",
        "direct Detailed Creature NPC creation and existing editor route",
        "name, role, and source archive search",
        "compact save with scroll preservation",
        "owner archive and Archived view",
        "administrator restore",
        "other G.O.D. Campaign denial",
        "Player Heavens denial",
        "Race and Creature in-place upgrade without duplicate roots",
        "simple state and Creature snapshots preserved through upgrade",
        "source masters unchanged",
        "deletion preview and cancellation",
        "typed-name permanent deletion and audit",
        "successful isolated deletion for both Race and Creature NPC kinds",
        "fresh roster and Scene dependency block",
      ],
    }, null, 2));
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      await browser?.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (server && server.exitCode === null) {
        server.kill();
        await new Promise<void>((resolveStop) => {
          const timeout = setTimeout(resolveStop, 3_000);
          server!.once("exit", () => {
            clearTimeout(timeout);
            resolveStop();
          });
        });
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await cleanupMatchingFixtures(pool);
      await assertNoFixtures(pool);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await pool.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await rm(TEST_DIST_PATH, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await writeFile(tsconfigPath, tsconfigBefore);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length) {
      throw new AggregateError(
        cleanupErrors,
        "NPC lifecycle browser cleanup failed.",
      );
    }
  }
}

async function cleanupOnly(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  try {
    await cleanupMatchingFixtures(pool);
    await assertNoFixtures(pool);
    console.log(JSON.stringify({ cleaned: true, fixturePrefix: "npc-lifecycle-browser-" }));
  } finally {
    await pool.end();
  }
}

const execution = process.argv.includes("--cleanup-only") ? cleanupOnly() : main();
execution.catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

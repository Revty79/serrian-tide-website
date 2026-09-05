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
if (!connectionString) throw new Error("DATABASE_URL is required for the in-place scroll browser workflow.");
const databaseUrl = new URL(connectionString);
if (!(["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname)) || !databaseUrl.pathname.slice(1).endsWith("_dev")) {
  throw new Error("Refusing in-place scroll browser fixtures outside a loopback _dev database.");
}

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = Number(process.env.IN_PLACE_SCROLL_BROWSER_PORT ?? 3122);
const BASE_URL = `http://localhost:${PORT}`;
const TEST_DIST_DIRECTORY = ".next-in-place-scroll-browser";
const TEST_DIST_PATH = resolve(process.cwd(), TEST_DIST_DIRECTORY);
if (dirname(TEST_DIST_PATH) !== resolve(process.cwd()) || basename(TEST_DIST_PATH) !== TEST_DIST_DIRECTORY) {
  throw new Error("The isolated in-place scroll browser directory is unsafe.");
}

const PASSWORD = "In-Place-Scroll-Browser-Only!";
const MARKER = `scroll-browser-${Date.now()}`;
const GOD_ID = `${MARKER}-god`;
const PLAYER_ID = `${MARKER}-player`;
const SOURCE_SYSTEM = "scroll-browser-fixture";

type Fixture = {
  campaignId: number;
  firearmName: string;
  godEmail: string;
  playerEmail: string;
  characterId: number;
  raceName: string;
  skillChildName: string;
  skillRootName: string;
  tagName: string;
};

async function one<T extends pg.QueryResultRow>(
  client: pg.PoolClient,
  query: string,
  values: unknown[] = [],
): Promise<T> {
  const result = await client.query<T>(query, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const password = await hashPassword(PASSWORD);
    const godEmail = `${GOD_ID}@example.invalid`;
    const playerEmail = `${PLAYER_ID}@example.invalid`;
    for (const user of [
      { id: GOD_ID, name: "Scroll Browser G.O.D.", email: godEmail, role: "god" },
      { id: PLAYER_ID, name: "Scroll Browser Player", email: playerEmail, role: "player" },
    ]) {
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username)
        values ($1,$2,$3,true,$1,$1)`, [user.id, user.name, user.email]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at)
        values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${user.id}-credential`, user.id, password]);
      await client.query("insert into user_role (user_id,role) values ($1,$2)", [user.id, user.role]);
    }

    const campaign = await one<{ id: number }>(client, `insert into campaign
      (name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id)
      values ($1,$2,150,0,10,10,100,100,'Credits','Assigned',1,$3) returning id`, [
      `Scroll Campaign ${MARKER}`,
      "Guarded browser fixture for same-route interaction stability.",
      GOD_ID,
    ]);
    await client.query("insert into campaign_player (campaign_id,user_id) values ($1,$2)", [campaign.id, PLAYER_ID]);

    const raceName = `Scroll Race ${MARKER}`;
    const race = await one<{ id: number }>(client, `insert into races
      (name,size,created_by_user_id,source_system,source_external_id)
      values ($1,'Medium',$2,$3,$4) returning id`, [raceName, GOD_ID, SOURCE_SYSTEM, `${MARKER}-race`]);
    await client.query("insert into campaign_allowed_race (campaign_id,race_id,sort_order) values ($1,$2,0)", [campaign.id, race.id]);

    const tagName = `Scroll Genre ${MARKER}`;
    const tag = await one<{ id: number }>(client, `insert into item_tags_catalog
      (canonical_id,name,tag_group,description) values ($1,$2,'Browser Fixtures','Temporary guarded scroll fixture.') returning id`, [
      `SCROLL-TAG-${Date.now()}`,
      tagName,
    ]);
    await client.query("insert into campaign_inventory_tag (campaign_id,tag_id,sort_order) values ($1,$2,0)", [campaign.id, tag.id]);

    const itemIds: number[] = [];
    let firearmId = 0;
    const firearmName = `Scroll Firearm ${MARKER}`;
    for (let index = 0; index < 56; index += 1) {
      const firearm = index === 0;
      const item = await one<{ id: number }>(client, `insert into items
        (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,credits,price_basis,created_by_user_id,source_system,source_external_id)
        values ($1,$2,'equipment',$3,'Equipment','Browser Fixture','General',$4,$5,'per item',$6,$7,$8) returning id`, [
        `SCROLL-ITEM-${Date.now()}-${index}`,
        firearm ? firearmName : `Scroll Equipment ${String(index).padStart(2, "0")} ${MARKER}`,
        firearm ? "weapon" : "general",
        "Temporary guarded browser fixture.",
        firearm ? 10 : 1,
        GOD_ID,
        SOURCE_SYSTEM,
        `${MARKER}-item-${index}`,
      ]);
      itemIds.push(item.id);
      await client.query("insert into item_tag_links (item_id,tag_id) values ($1,$2)", [item.id, tag.id]);
      if (firearm) firearmId = item.id;
    }
    const weapon = await one<{ id: number }>(client, `insert into weapon_profiles
      (item_id,profile_record_type,weapon_type,damage_source,damage,damage_type,capacity_rounds,readiness_mode,draw_initiative_cost,ready_initiative_cost,reload_initiative_cost,unload_initiative_cost,firing_mode_change_initiative_cost)
      values ($1,'weapon','Browser firearm','authored','1','piercing',1,'draw-is-ready',1,0,1,1,0) returning id`, [firearmId]);
    await client.query(`insert into weapon_firing_modes
      (weapon_profile_id,name,normalized_name,sort_order,base_cycling_initiative_cost,base_recoil_reset_initiative_cost,delivery_cadence,rounds_per_cadence,mechanics_review_required)
      values ($1,'Single','single',0,1,0,'per-trigger',1,false)`, [weapon.id]);
    await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0)", [campaign.id, firearmId]);

    const skillRootName = `Scroll Root ${MARKER}`;
    const skillChildName = `Scroll Child ${MARKER}`;
    const root = await one<{ id: number }>(client, `insert into skill
      (name,classification,tier,primary_attribute,definition,created_by_user_id,source_system,source_external_id)
      values ($1,'standard',1,'STR','Temporary guarded browser fixture.',$2,$3,$4) returning id`, [
      skillRootName, GOD_ID, SOURCE_SYSTEM, `${MARKER}-skill-root`,
    ]);
    const child = await one<{ id: number }>(client, `insert into skill
      (name,classification,tier,primary_attribute,definition,created_by_user_id,source_system,source_external_id)
      values ($1,'standard',2,'STR','Temporary guarded browser fixture.',$2,$3,$4) returning id`, [
      skillChildName, GOD_ID, SOURCE_SYSTEM, `${MARKER}-skill-child`,
    ]);
    await client.query("insert into skill_relationship (skill_id,related_skill_id,relationship_type,sort_order) values ($1,$2,'parent',0)", [child.id, root.id]);

    const character = await one<{ id: number }>(client, `insert into campaign_character
      (campaign_id,player_user_id,name) values ($1,$2,$3) returning id`, [campaign.id, PLAYER_ID, `Ready Character ${MARKER}`]);
    await client.query(`insert into campaign_character_profile
      (character_id,race_id,age,sex,height_feet,height_inches,weight,skin_color,eye_color,hair_color,deity,defining_marks,personality,goals,secrets,backstory,motivations,credits_remaining,fate_points)
      values ($1,$2,30,'Unspecified',6,0,180,'Marked','Grey','Black','None','None','Prepared','Test','Test','Test','Test',100,1)`, [character.id, race.id]);
    for (const attributeKey of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) {
      await client.query("insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,25)", [character.id, attributeKey]);
    }
    await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0)", [character.id]);

    await client.query("commit");
    return {
      campaignId: campaign.id,
      firearmName,
      godEmail,
      playerEmail,
      characterId: character.id,
      raceName,
      skillChildName,
      skillRootName,
      tagName,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function cleanupFixtures(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const users = await client.query<{ id: string }>(`select id from "user" where id like 'scroll-browser-%'`);
    const userIds = users.rows.map(({ id }) => id);
    if (userIds.length) {
      await client.query("delete from campaign where created_by_user_id=any($1::text[])", [userIds]);
      await client.query("delete from skill_relationship where skill_id in (select id from skill where created_by_user_id=any($1::text[])) or related_skill_id in (select id from skill where created_by_user_id=any($1::text[]))", [userIds]);
      await client.query("delete from skill where created_by_user_id=any($1::text[])", [userIds]);
      await client.query("delete from races where created_by_user_id=any($1::text[])", [userIds]);
      await client.query("delete from items where created_by_user_id=any($1::text[])", [userIds]);
      await client.query("delete from account where user_id=any($1::text[])", [userIds]);
      await client.query("delete from user_role where user_id=any($1::text[])", [userIds]);
      await client.query(`delete from "user" where id=any($1::text[])`, [userIds]);
    }
    await client.query("delete from item_tags_catalog where canonical_id like 'SCROLL-TAG-%'");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  const remaining = await pool.query<{
    items: number;
    races: number;
    skills: number;
    tags: number;
    users: number;
  }>(`select
    (select count(*) from "user" where id like 'scroll-browser-%')::int users,
    (select count(*) from item_tags_catalog where canonical_id like 'SCROLL-TAG-%')::int tags,
    (select count(*) from items where source_system = $1)::int items,
    (select count(*) from skill where source_system = $1)::int skills,
    (select count(*) from races where source_system = $1)::int races`, [SOURCE_SYSTEM]);
  assert.deepEqual(remaining.rows[0], { users: 0, tags: 0, items: 0, skills: 0, races: 0 }, "In-place scroll browser fixtures were not completely removed.");
}

async function waitForServer(server: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(BASE_URL, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The isolated local server is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the in-place scroll browser server.");
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

async function scrollWindow(page: Page, requested = 520): Promise<number> {
  const position = await page.evaluate((top) => {
    const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.min(top, maximum), behavior: "instant" });
    return window.scrollY;
  }, requested);
  assert.ok(position > 40, `The fixture page was not long enough to test window scroll (position ${position}).`);
  return position;
}

async function windowScroll(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

function assertPosition(actual: number, expected: number, label: string, tolerance = 12): void {
  assert.ok(actual > 25, `${label} returned to the top (${actual}px).`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} moved from ${expected}px to ${actual}px.`);
}

async function clickWithoutAutoScroll(page: Page, selector: string): Promise<void> {
  await page.locator(selector).evaluate((element) => (element as HTMLElement).click());
}

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString });
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    await cleanupFixtures(pool);
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
    const godContext = await browser.newContext({ viewport: { width: 1440, height: 640 } });
    const playerContext = await browser.newContext({ viewport: { width: 390, height: 700 } });
    const godPage = await login(godContext, fixture.godEmail);
    const playerPage = await login(playerContext, fixture.playerEmail);

    await godPage.goto(`${BASE_URL}/heavens/campaigns?campaign=${fixture.campaignId}`);
    await godPage.getByRole("heading", { name: `Scroll Campaign ${MARKER}` }).waitFor();
    await godPage.getByLabel("Campaign Overview").fill(`Updated ${MARKER}`);
    let before = await scrollWindow(godPage);
    await clickWithoutAutoScroll(godPage, ".campaign-editor-header button");
    await godPage.getByText(new RegExp(`Scroll Campaign ${MARKER}.*was saved`)).waitFor();
    assertPosition(await windowScroll(godPage), before, "Campaign update");

    await godPage.getByLabel("Campaign Name").fill("");
    before = await scrollWindow(godPage);
    await clickWithoutAutoScroll(godPage, ".campaign-editor-header button");
    await godPage.locator(".campaign-feedback.is-error").waitFor();
    assertPosition(await windowScroll(godPage), before, "Campaign validation error");
    await godPage.getByLabel("Campaign Name").fill(`Scroll Campaign ${MARKER}`);

    await godPage.getByRole("button", { name: "Inventory Access" }).click();
    await godPage.getByRole("heading", { name: "Available Items" }).waitFor();
    const availablePanel = godPage.locator('[data-preserve-scroll="campaign-inventory-available"]');
    await godPage.waitForFunction(() => document.querySelectorAll('[data-preserve-scroll="campaign-inventory-available"] button').length > 40);
    await availablePanel.evaluate((element) => { element.scrollTop = 420; });
    const panelBefore = await availablePanel.evaluate((element) => element.scrollTop);
    before = await scrollWindow(godPage, 420);
    await availablePanel.locator("button").nth(12).evaluate((element) => {
      element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await godPage.getByText("2 selected", { exact: true }).waitFor();
    assertPosition(await windowScroll(godPage), before, "Campaign inventory add");
    const panelAfterAdd = await availablePanel.evaluate((element) => element.scrollTop);
    assert.ok(Math.abs(panelAfterAdd - panelBefore) <= 12, `Nested inventory panel moved from ${panelBefore}px to ${panelAfterAdd}px.`);
    await clickWithoutAutoScroll(godPage, ".campaign-editor-header button");
    await godPage.locator(".campaign-feedback.is-success").waitFor();
    assertPosition(await windowScroll(godPage), before, "Campaign inventory save");

    await godPage.goto(`${BASE_URL}/heavens/races`);
    await godPage.getByRole("heading", { name: "Races", exact: true }).waitFor();
    await godPage.getByRole("button", { name: "New Race" }).click();
    await godPage.getByRole("button", { name: "Attributes & Movement" }).click();
    const addMovement = godPage.getByRole("button", { name: "Add Movement" });
    for (let index = 0; index < 8; index += 1) await addMovement.click();
    before = await scrollWindow(godPage, 680);
    const beforeAdd = before;
    await addMovement.click();
    assertPosition(await windowScroll(godPage), beforeAdd, "Race repeatable-row add");
    before = await scrollWindow(godPage, 680);
    await clickWithoutAutoScroll(godPage, ".skill-editor__actions .skills-primary-button");
    await godPage.locator(".skill-editor__feedback.is-error").waitFor();
    assertPosition(await windowScroll(godPage), before, "Race validation error");

    const movementModes = godPage.locator('.race-repeat-row--movement input[placeholder="Mode"]');
    for (let index = 0; index < await movementModes.count(); index += 1) {
      await movementModes.nth(index).fill(`Mode ${index}`);
    }
    await godPage.getByRole("button", { name: "Overview" }).click();
    await godPage.getByLabel("Name").fill(`Browser Saved Race ${MARKER}`);
    await godPage.getByRole("button", { name: "Attributes & Movement" }).click();
    before = await scrollWindow(godPage, 680);
    await clickWithoutAutoScroll(godPage, ".skill-editor__actions .skills-primary-button");
    await godPage.locator(".skill-editor__feedback.is-success").waitFor();
    assertPosition(await windowScroll(godPage), before, "Race long-editor save");

    before = await scrollWindow(godPage, 680);
    await clickWithoutAutoScroll(godPage, ".skill-editor__actions .skills-danger-button");
    await godPage.locator(".skill-editor__delete-confirm").waitFor();
    assertPosition(await windowScroll(godPage), before, "Delete confirmation open");
    await clickWithoutAutoScroll(godPage, ".skill-editor__delete-confirm button:last-child");
    await godPage.locator(".skill-editor__delete-confirm").waitFor({ state: "detached" });
    assertPosition(await windowScroll(godPage), before, "Delete confirmation cancel");

    await godPage.goto(`${BASE_URL}/heavens/skills`);
    await godPage.getByRole("heading", { name: "Skill Library" }).waitFor();
    await godPage.getByLabel("Search", { exact: true }).fill(fixture.skillChildName);
    await godPage.locator(".skill-library__row").filter({ hasText: fixture.skillChildName }).click();
    await godPage.getByRole("button", { name: "Tree View" }).click();
    await godPage.getByRole("group", { name: "Skill Attribute selector" }).getByRole("button", { name: /STR.*Strength/ }).click();
    await godPage.getByRole("region", { name: /STR.*Strength roots/ }).getByRole("button", { name: new RegExp(fixture.skillRootName) }).click();
    await godPage.getByRole("button", { name: new RegExp(fixture.skillChildName) }).waitFor();
    await godPage.getByRole("link", { name: "Back to The Heavens" }).click();
    await godPage.waitForURL((url) => url.pathname === "/heavens");
    assert.ok((await windowScroll(godPage)) <= 12, "Intentional cross-route navigation should retain normal destination positioning.");

    await playerPage.goto(`${BASE_URL}/realms/characters/${fixture.characterId}`);
    await playerPage.getByRole("heading", { name: "Character Creation" }).waitFor();
    await playerPage.getByRole("button", { name: "Equipment", exact: true }).click();
    await playerPage.locator(".character-equipment-list article").filter({ hasText: fixture.firearmName }).getByRole("button", { name: "Buy One" }).click();
    await playerPage.getByText("Exact firearm copy").waitFor();
    await playerPage.getByRole("button", { name: "Complete Character" }).waitFor();
    before = await scrollWindow(playerPage, 360);
    await clickWithoutAutoScroll(playerPage, ".character-status-strip__actions .is-primary");
    await playerPage.getByRole("heading", { name: "Complete this Character?" }).waitFor();
    assertPosition(await windowScroll(playerPage), before, "Character completion dialog open");
    await playerPage.getByRole("button", { name: "Keep Editing" }).click();
    assertPosition(await windowScroll(playerPage), before, "Character completion dialog cancel");
    await clickWithoutAutoScroll(playerPage, ".character-status-strip__actions .is-primary");
    await playerPage.getByRole("button", { name: "Complete Character", exact: true }).last().click();
    await playerPage.getByText(/Character creation is complete/).first().waitFor();
    assert.ok((await windowScroll(playerPage)) > 25, "Character completion unexpectedly returned to the top.");

    await godPage.setViewportSize({ width: 390, height: 700 });
    await godPage.goto(`${BASE_URL}/heavens/campaigns?campaign=${fixture.campaignId}`);
    await godPage.getByRole("heading", { name: `Scroll Campaign ${MARKER}` }).waitFor();
    before = await scrollWindow(godPage, 360);
    await godPage.getByRole("button", { name: "Allowed Races" }).click();
    assertPosition(await windowScroll(godPage), before, "Narrow Campaign tab switch");

    await Promise.all([godContext.close(), playerContext.close()]);
    console.log(JSON.stringify({
      passed: true,
      verified: [
        "Campaign success and validation-error preservation",
        "Campaign inventory window and nested-panel preservation",
        "Race repeatable-row add and long-editor save",
        "Race validation feedback preservation",
        "Delete confirmation open and cancel preservation",
        "Skill List and Attribute-first Tree selection",
        "Intentional cross-route navigation",
        "Starting Equipment exact-firearm Character completion",
        "desktop and narrow viewport behavior",
      ],
    }, null, 2));
  } finally {
    const cleanupErrors: unknown[] = [];
    try { if (browser) await browser.close(); } catch (error) { cleanupErrors.push(error); }
    try {
      if (server && server.exitCode === null) {
        server.kill();
        await new Promise<void>((resolveStop) => {
          const timeout = setTimeout(resolveStop, 3_000);
          server!.once("exit", () => { clearTimeout(timeout); resolveStop(); });
        });
      }
    } catch (error) { cleanupErrors.push(error); }
    try { await cleanupFixtures(pool); } catch (error) { cleanupErrors.push(error); }
    try { await pool.end(); } catch (error) { cleanupErrors.push(error); }
    try { await rm(TEST_DIST_PATH, { recursive: true, force: true }); } catch (error) { cleanupErrors.push(error); }
    try { await writeFile(tsconfigPath, tsconfigBefore); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "In-place scroll browser cleanup failed.");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

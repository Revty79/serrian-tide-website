import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg, { type PoolClient } from "pg";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const defaultWindowsPostgresBin = "C:\\Program Files\\PostgreSQL\\18\\bin";
const postgresBin = process.env.SERRIAN_TEST_POSTGRES_BIN ?? (existsSync(defaultWindowsPostgresBin) ? defaultWindowsPostgresBin : "");
const initdbExecutable = postgresBin ? join(postgresBin, "initdb.exe") : "initdb";
const pgCtlExecutable = postgresBin ? join(postgresBin, "pg_ctl.exe") : "pg_ctl";
const chromeExecutable = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const password = "Shop-Visit-Browser-Only!";
const screenshotDirectory = resolve(process.cwd(), "coverage", "tabletop-shop-visit-validation");
const distDirectory = `.next-shop-visits-${process.pid}`;
const distPath = resolve(process.cwd(), distDirectory);
if (dirname(distPath) !== resolve(process.cwd()) || basename(distPath) !== distDirectory) throw new Error("The isolated Shop-visit browser directory is unsafe.");

async function loopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  if (!port) throw new Error("A disposable Shop-visit browser port could not be reserved.");
  return port;
}

async function one<T extends pg.QueryResultRow>(client: PoolClient, query: string, values: unknown[] = []): Promise<T> {
  const result = await client.query<T>(query, values);
  if (result.rows.length !== 1) throw new Error(`Expected one row, found ${result.rows.length}.`);
  return result.rows[0]!;
}

type Fixture = {
  campaignId: number;
  sessionId: number;
  sceneId: number;
  townShopId: number;
  independentShopId: number;
  godEmail: string;
  playerEmails: string[];
  characterIds: number[];
};

async function seedFixture(pool: pg.Pool): Promise<Fixture> {
  const marker = `shop-visit-browser-${Date.now()}-${process.pid}`;
  const godId = `${marker}-god`;
  const playerIds = ["a", "b", "c"].map((suffix) => `${marker}-player-${suffix}`);
  const godEmail = `${godId}@example.invalid`;
  const playerEmails = playerIds.map((id) => `${id}@example.invalid`);
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const accounts = [
      { id: godId, name: "Visit Browser G.O.D.", email: godEmail, role: "god" },
      ...playerIds.map((id, index) => ({ id, name: `Visit Browser Player ${String.fromCharCode(65 + index)}`, email: playerEmails[index]!, role: "player" })),
    ];
    for (const account of accounts) {
      await client.query(`insert into "user" (id,name,email,email_verified,username,display_username) values ($1,$2,$3,true,$1,$1)`, [account.id, account.name, account.email]);
      await client.query(`insert into account (id,issuer,account_id,provider_id,user_id,password,updated_at) values ($1,'local:credential',$2,'credential',$2,$3,now())`, [`${account.id}-credential`, account.id, passwordHash]);
      await client.query("insert into user_role (user_id,role) values ($1,$2)", [account.id, account.role]);
    }
    await client.query(`insert into site_appearance_setting
      (key,preset_id,page_background,surface_background,primary_accent,secondary_accent,main_text,muted_text,updated_by_user_id)
      values ('site','classic','#06080F','#0A0F1E','#8B5CF6','#F5CA73','#E2E8F0','#9DA9B7',$1)`, [godId]);
    const campaign = await one<{ id: number }>(client, `insert into campaign (
      name,overview,attribute_points,skill_points,max_starting_skill,points_to_unlock_next_tier,max_points_in_skill,
      starting_credit_amount,currency_system,fate_point_method,assigned_fate_points,created_by_user_id
    ) values ('Shop Visit Browser Campaign','Live participant Shop visits.',0,0,0,0,100,100,'Credits','Assigned',0,$1) returning id`, [godId]);
    await client.query("insert into campaign_player (campaign_id,user_id,is_npc_controller) values ($1,$2,true),($1,$3,false),($1,$4,false),($1,$5,false)", [campaign.id, godId, ...playerIds]);
    const characterIds: number[] = [];
    for (let index = 0; index < playerIds.length; index += 1) {
      const character = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name) values ($1,$2,$3) returning id", [campaign.id, playerIds[index], `Visitor ${String.fromCharCode(65 + index)}`]);
      characterIds.push(character.id);
      await client.query("insert into campaign_character_profile (character_id,hp_multiplier_steps,base_magic_steps) values ($1,0,0)", [character.id]);
      for (const key of ["STR", "DEX", "CON", "INT", "WIS", "CHR"]) await client.query("insert into campaign_character_attribute (character_id,attribute_key,value) values ($1,$2,25)", [character.id, key]);
      await client.query("insert into campaign_character_active_health (character_id,total_damage) values ($1,0)", [character.id]);
    }
    const session = await one<{ id: number }>(client, "insert into campaign_session (campaign_id,title,sequence_number,status,started_at) values ($1,'Visit Browser Session',1,'active',now()) returning id", [campaign.id]);
    const scene = await one<{ id: number }>(client, "insert into campaign_session_scene (session_id,campaign_id,sequence_number,title,status,location_label,description,started_at) values ($1,$2,1,'Open Market','active','Market Ward','A busy public market.',now()) returning id", [session.id, campaign.id]);
    for (let index = 0; index < characterIds.length; index += 1) {
      await client.query("insert into campaign_session_roster (session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4)", [session.id, campaign.id, characterIds[index], index]);
      await client.query("insert into campaign_session_scene_member (scene_id,session_id,campaign_id,character_id,sort_order) values ($1,$2,$3,$4,$5)", [scene.id, session.id, campaign.id, characterIds[index], index]);
    }
    const town = await one<{ id: number }>(client, "insert into town (campaign_id,name,category,overview) values ($1,'Lantern Harbor','Port','Lanterns line the market quay.') returning id", [campaign.id]);
    const townShop = await one<{ id: number }>(client, "insert into shop (campaign_id,name,category,description,storefront_state) values ($1,'Brass Compass','Navigation','Charts and voyage provisions.','open') returning id", [campaign.id]);
    const independentShop = await one<{ id: number }>(client, "insert into shop (campaign_id,name,category,description,storefront_state) values ($1,'Moon Cart','Services','A traveling service cart.','open') returning id", [campaign.id]);
    const npc = await one<{ id: number }>(client, "insert into campaign_character (campaign_id,player_user_id,name,is_npc,npc_kind,npc_build_mode,npc_role_label) values ($1,$2,'Mira Voss',true,'race','detailed','Harbormaster') returning id", [campaign.id, godId]);
    await client.query("insert into town_shop_membership (town_id,shop_id,campaign_id,sort_order) values ($1,$2,$3,0)", [town.id, townShop.id, campaign.id]);
    await client.query("insert into shop_staff_assignment (shop_id,campaign_id,npc_character_id,responsibility_label,is_primary_contact,sort_order) values ($1,$2,$3,'Navigator',true,0)", [townShop.id, campaign.id, npc.id]);
    const catalogItem = await one<{ id: number }>(client, `insert into items
      (canonical_id,name,catalog_scope,equipment_group,record_type,family,category,description,credits,price_basis)
      values ('VISIT-BROWSER-0001','Harbor Chart','equipment','general','gear','Navigation','Charts','A detailed public harbor chart.',9,'Each') returning id`);
    await client.query("insert into campaign_inventory_item (campaign_id,item_id,sort_order) values ($1,$2,0)", [campaign.id, catalogItem.id]);
    await client.query("insert into shop_offering (shop_id,campaign_id,item_id,fulfillment_kind,enabled,unlimited_stock,selling_price_override_credits) values ($1,$2,$3,'inventory-transfer',true,true,7)", [townShop.id, campaign.id, catalogItem.id]);
    await client.query("insert into campaign_session_prepared_town (session_id,campaign_id,town_id,sort_order) values ($1,$2,$3,0)", [session.id, campaign.id, town.id]);
    await client.query("insert into campaign_session_prepared_shop (session_id,campaign_id,shop_id,sort_order) values ($1,$2,$3,0)", [session.id, campaign.id, independentShop.id]);
    await client.query("insert into campaign_session_scene_town (scene_id,session_id,campaign_id,town_id,sort_order,revealed) values ($1,$2,$3,$4,0,true)", [scene.id, session.id, campaign.id, town.id]);
    await client.query("insert into campaign_session_scene_town_shop (scene_id,session_id,campaign_id,town_id,shop_id,included,revealed,sort_order) values ($1,$2,$3,$4,$5,true,true,0)", [scene.id, session.id, campaign.id, town.id, townShop.id]);
    await client.query("insert into campaign_session_scene_town_npc (scene_id,session_id,campaign_id,town_id,npc_character_id,included,revealed,sort_order) values ($1,$2,$3,$4,$5,true,true,0)", [scene.id, session.id, campaign.id, town.id, npc.id]);
    await client.query("insert into campaign_session_scene_shop (scene_id,session_id,campaign_id,shop_id,sort_order,revealed) values ($1,$2,$3,$4,0,true)", [scene.id, session.id, campaign.id, independentShop.id]);
    await client.query("commit");
    return { campaignId: campaign.id, sessionId: session.id, sceneId: scene.id, townShopId: townShop.id, independentShopId: independentShop.id, godEmail, playerEmails, characterIds };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function waitForServer(server: ChildProcess, baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev server exited with ${server.exitCode}.`);
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) return;
    } catch { /* still starting */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Timed out waiting for the Shop-visit browser server.");
}

async function login(context: BrowserContext, baseUrl: string, email: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`);
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Enter$/ }).click();
  await page.waitForURL((url) => url.pathname === "/access", { timeout: 20_000 });
  return page;
}

async function main(): Promise<void> {
  const temporaryCluster = await mkdtemp(join(tmpdir(), "serrian-shop-visit-browser-postgres-"));
  const dataDirectory = join(temporaryCluster, "data");
  const logPath = join(temporaryCluster, "postgres.log");
  const postgresPort = await loopbackPort();
  const appPort = await loopbackPort();
  const baseUrl = `http://localhost:${appPort}`;
  const connectionString = `postgresql://postgres@127.0.0.1:${postgresPort}/postgres`;
  const tsconfigPath = resolve(process.cwd(), "tsconfig.json");
  const tsconfigBefore = await readFile(tsconfigPath);
  let clusterStarted = false;
  let pool: pg.Pool | null = null;
  let server: ChildProcess | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    execFileSync(initdbExecutable, ["--auth=trust", "--encoding=UTF8", "--no-locale", "--username=postgres", "-D", dataDirectory], { stdio: "pipe", windowsHide: true });
    execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-l", logPath, "-o", `-p ${postgresPort} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore", windowsHide: true });
    clusterStarted = true;
    pool = new pg.Pool({ connectionString });
    await migrate(drizzle(pool), { migrationsFolder: resolve(process.cwd(), "drizzle") });
    const fixture = await seedFixture(pool);
    await rm(distPath, { recursive: true, force: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", String(appPort)], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: connectionString, BETTER_AUTH_URL: baseUrl, NEXT_TELEMETRY_DISABLED: "1", SERRIAN_TEST_NEXT_DIST_DIR: distDirectory },
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForServer(server, baseUrl);
    browser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
    const godContext = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    const playerContexts = await Promise.all(fixture.playerEmails.map(() => browser!.newContext({ viewport: { width: 390, height: 844 } })));
    const godPage = await login(godContext, baseUrl, fixture.godEmail);
    const playerPages = await Promise.all(playerContexts.map((context, index) => login(context, baseUrl, fixture.playerEmails[index]!)));
    await mkdir(screenshotDirectory, { recursive: true });
    await godPage.goto(`${baseUrl}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}`);
    await godPage.getByRole("heading", { name: "Campaign Sessions" }).waitFor();
    const intro = godPage.getByRole("dialog");
    if (await intro.count()) await intro.getByRole("button", { name: "Return to Tabletop Operations" }).click();
    await godPage.getByRole("button", { name: /Scenes/ }).click();
    await godPage.getByRole("heading", { name: "Enter Shop" }).waitFor();
    for (let index = 0; index < playerPages.length; index += 1) {
      await playerPages[index]!.goto(`${baseUrl}/realms/tabletop?character=${fixture.characterIds[index]}`);
      await playerPages[index]!.getByRole("heading", { name: "At the table" }).waitFor();
    }
    const unauthorizedPage = await playerContexts[0]!.newPage();
    await unauthorizedPage.goto(`${baseUrl}/heavens/tabletop?campaign=${fixture.campaignId}&session=${fixture.sessionId}&scene=${fixture.sceneId}`);
    assert.equal(await unauthorizedPage.getByRole("heading", { name: "Enter Shop" }).count(), 0, "A Player opened the G.O.D. visit workspace directly.");
    assert.notEqual(new URL(unauthorizedPage.url()).pathname, "/heavens/tabletop");
    await unauthorizedPage.close();

    const townEntry = godPage.locator(".tabletop-shop-entry-list article").filter({ hasText: "Brass Compass" });
    await townEntry.getByRole("button", { name: "Enter Shop" }).click();
    const entryDialog = godPage.getByRole("dialog", { name: "Enter Brass Compass" });
    await entryDialog.getByText("Visitor A", { exact: true }).click();
    await entryDialog.getByText("Visitor B", { exact: true }).click();
    const savedSelectStyles = await entryDialog.locator("select").evaluate((element) => {
      const style = getComputedStyle(element);
      const optionStyle = getComputedStyle((element as HTMLSelectElement).options[0]!);
      return { background: style.backgroundColor, color: style.color, border: style.borderTopColor, optionBackground: optionStyle.backgroundColor, optionColor: optionStyle.color };
    });
    assert.notEqual(savedSelectStyles.background, "rgba(0, 0, 0, 0)");
    assert.notEqual(savedSelectStyles.color, savedSelectStyles.background);
    assert.notEqual(savedSelectStyles.optionColor, savedSelectStyles.optionBackground);
    await entryDialog.getByRole("button", { name: "Confirm Entry" }).click();
    await godPage.getByRole("heading", { name: "Brass Compass" }).waitFor();
    await playerPages[0]!.getByRole("heading", { name: "Brass Compass" }).waitFor({ timeout: 20_000 });
    await playerPages[1]!.getByRole("heading", { name: "Brass Compass" }).waitFor({ timeout: 20_000 });
    assert.equal(await playerPages[2]!.getByRole("heading", { name: "Brass Compass" }).count(), 0);
    await playerPages[2]!.getByRole("heading", { name: "At the table" }).waitFor();
    assert.match(await playerPages[0]!.locator("section").filter({ hasText: "CURRENT SHOP VISIT" }).first().innerText(), /Harbor Chart[\s\S]*7 Credits/);
    const godOfferingSearch = godPage.getByLabel("Search offerings");
    const playerOfferingSearch = playerPages[0]!.getByLabel("Search");
    await godOfferingSearch.fill("Harbor");
    await playerOfferingSearch.fill("Harbor");
    await godPage.getByLabel("Visit mode").selectOption("roleplay");
    await playerPages[0]!.getByText("CURRENT SHOP VISIT · ROLEPLAY", { exact: true }).waitFor({ timeout: 20_000 });
    assert.equal(await godOfferingSearch.inputValue(), "Harbor", "G.O.D. search was reset by an ordinary visit refresh.");
    assert.equal(await playerOfferingSearch.inputValue(), "Harbor", "Player search was reset by an ordinary visit refresh.");
    assert.equal(await playerOfferingSearch.evaluate((element) => document.activeElement === element), true, "Player search focus was reset by an ordinary visit refresh.");
    await godPage.getByLabel("Visit mode").selectOption("shopping");
    await playerPages[0]!.getByText("CURRENT SHOP VISIT · SHOPPING", { exact: true }).waitFor({ timeout: 20_000 });
    await godOfferingSearch.fill("");
    await playerOfferingSearch.fill("");
    await godPage.locator(".tabletop-shop-visit-detail").screenshot({ path: join(screenshotDirectory, "god-shop-visit-classic-desktop.png") });
    await playerPages[0]!.screenshot({ path: join(screenshotDirectory, "player-shop-visit-classic-narrow.png"), fullPage: true });

    await godPage.evaluate(() => {
      const root = document.documentElement;
      root.dataset.appearancePreset = "serrian-tide";
      root.style.setProperty("--st-page", "#04030C");
      root.style.setProperty("--st-surface", "#0B1018");
      root.style.setProperty("--st-primary", "#4DA97D");
      root.style.setProperty("--st-secondary", "#F9D34E");
      root.style.setProperty("--st-text", "#E7EAD9");
      root.style.setProperty("--st-muted", "#9EADA4");
    });
    const alternateModeStyles = await godPage.getByLabel("Visit mode").evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, border: style.borderTopColor };
    });
    assert.notDeepEqual(alternateModeStyles, { background: savedSelectStyles.background, color: savedSelectStyles.color, border: savedSelectStyles.border });
    await godPage.locator(".tabletop-shop-visit-detail").screenshot({ path: join(screenshotDirectory, "god-shop-visit-serrian-tide-desktop.png") });

    await godPage.getByRole("button", { name: "Return to Scene" }).click();
    await playerPages[0]!.getByRole("button", { name: "Leave Shop" }).click();
    await playerPages[0]!.getByRole("heading", { name: "At the table" }).waitFor({ timeout: 20_000 });
    await playerPages[1]!.getByRole("heading", { name: "Brass Compass" }).waitFor();
    await godPage.getByRole("heading", { name: "Enter Shop" }).waitFor();
    const firstVisitCard = godPage.locator(".tabletop-shop-visit-list article").filter({ hasText: "Brass Compass" });
    assert.match(await firstVisitCard.innerText(), /Visitor B/);

    const independentEntry = godPage.locator(".tabletop-shop-entry-list article").filter({ hasText: "Moon Cart" });
    await independentEntry.getByRole("button", { name: "Enter Shop" }).click();
    const independentDialog = godPage.getByRole("dialog", { name: "Enter Moon Cart" });
    await independentDialog.getByLabel("Visit mode").selectOption("roleplay");
    await independentDialog.getByText("Visitor C", { exact: true }).click();
    await independentDialog.getByRole("button", { name: "Confirm Entry" }).click();
    await playerPages[2]!.getByRole("heading", { name: "Moon Cart" }).waitFor({ timeout: 20_000 });
    await godPage.getByRole("button", { name: "Return to Scene" }).click();
    assert.equal(await godPage.locator(".tabletop-shop-visit-list article").count(), 2);
    await playerPages[1]!.reload();
    await playerPages[1]!.getByRole("heading", { name: "Brass Compass" }).waitFor();
    await playerPages[1]!.close();
    playerPages[1] = await playerContexts[1]!.newPage();
    await playerPages[1]!.goto(`${baseUrl}/realms/tabletop?character=${fixture.characterIds[1]}`);
    await playerPages[1]!.getByRole("heading", { name: "Brass Compass" }).waitFor();
    assert.equal(await playerPages[1]!.getByRole("button", { name: /Enter Shop|End Visit|Remove Visitor/ }).count(), 0, "Player UI exposed G.O.D. visit controls");

    await godPage.getByRole("button", { name: "Complete Scene" }).click();
    const completeDialog = godPage.getByRole("dialog", { name: /Complete Scene 1/ });
    await completeDialog.getByRole("button", { name: "Complete Scene" }).click();
    await godPage.getByText("Scene 1 is now completed.").waitFor();
    await playerPages[1]!.getByRole("heading", { name: "At the table" }).waitFor({ timeout: 20_000 });
    await playerPages[2]!.getByRole("heading", { name: "At the table" }).waitFor({ timeout: 20_000 });
    const history = await pool.query("select status,count(*)::int count from campaign_session_scene_shop_visit where scene_id=$1 group by status", [fixture.sceneId]);
    assert.deepEqual(history.rows, [{ status: "ended", count: 2 }]);
    assert.equal(Number((await pool.query("select count(*)::int count from campaign_session_scene_shop_visit_member where scene_id=$1", [fixture.sceneId])).rows[0].count), 3);
    assert.equal(await godPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    assert.equal(await playerPages[2]!.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);

    console.log(JSON.stringify({ passed: true, screenshots: [
      "god-shop-visit-classic-desktop.png",
      "player-shop-visit-classic-narrow.png",
      "god-shop-visit-serrian-tide-desktop.png",
    ], computedStyles: { savedClassic: savedSelectStyles, alternateSerrianTide: alternateModeStyles }, verified: [
      "two selected Players entered one Shop while a third stayed in Tabletop",
      "individual Player leave retained the remaining visitor",
      "separate simultaneous groups visited separate Shops",
      "reload and a fresh tab retained the authorized active visit",
      "a Player direct request could not open the G.O.D. workspace",
      "Player UI exposed no G.O.D. visit controls",
      "ordinary visit invalidations preserved G.O.D. and Player search plus Player focus",
      "Scene completion atomically ended visits while retaining history",
      "saved Classic and alternate Serrian Tide semantic control styles",
      "desktop and narrow layouts had no horizontal overflow",
    ] }, null, 2));
    await Promise.all([godContext.close(), ...playerContexts.map((context) => context.close())]);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolveWait) => server!.once("exit", resolveWait));
    }
    if (pool) await pool.end().catch(() => undefined);
    if (clusterStarted) execFileSync(pgCtlExecutable, ["-D", dataDirectory, "-m", "fast", "-w", "stop"], { stdio: "ignore", windowsHide: true });
    await rm(distPath, { recursive: true, force: true });
    await rm(temporaryCluster, { recursive: true, force: true });
    if (Buffer.compare(await readFile(tsconfigPath), tsconfigBefore) !== 0) await writeFile(tsconfigPath, tsconfigBefore);
    if (Buffer.compare(await readFile(tsconfigPath), tsconfigBefore) !== 0) throw new Error("The Shop-visit browser rehearsal could not restore tsconfig.json.");
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
